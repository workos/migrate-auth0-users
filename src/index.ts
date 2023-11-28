import { WorkOS } from "@workos-inc/node";
import dotenv from "dotenv";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import fs from "fs/promises";
import Queue from "p-queue";

import { ndjsonStream } from "./ndjson-stream";
import { PasswordStore } from "./password-store";
import { Auth0ExportedUser } from "./auth0-exported-user";

dotenv.config();

const USE_LOCAL_API = (process.env.NODE_ENV || "").startsWith("dev");

const workos = new WorkOS(
  process.env.WORKOS_SECRET_KEY,
  USE_LOCAL_API
    ? {
        https: false,
        apiHostname: "localhost",
        port: 7000,
      }
    : {},
);

async function findOrCreateUser(exportedUser: Auth0ExportedUser) {
  try {
    return await workos.userManagement.createUser({
      email: exportedUser.Email,
      emailVerified: exportedUser["Email Verified"],
      firstName: exportedUser["Given Name"],
      lastName: exportedUser["Family Name"],
    });
  } catch {
    const matchingUsers = await workos.userManagement.listUsers({
      email: exportedUser.Email.toLowerCase(),
    });
    if (matchingUsers.data.length === 1) {
      return matchingUsers.data[0];
    }
  }
}

async function processLine(
  line: unknown,
  recordNumber: number,
  passwordStore: PasswordStore,
): Promise<boolean> {
  const exportedUser = Auth0ExportedUser.parse(line);

  const workOsUser = await findOrCreateUser(exportedUser);
  if (!workOsUser) {
    console.error(
      `(${recordNumber}) Could not find or create user ${exportedUser.Id}`,
    );
    return false;
  }

  const password = await passwordStore.find(exportedUser.Id);

  if (password) {
    try {
      await workos.userManagement.updateUser({
        userId: workOsUser.id,
        passwordHash: password.password_hash,
        passwordHashType: "bcrypt",
      });
    } catch (e: any) {
      if (e?.rawData?.code === "password_already_set") {
        console.log(
          `(${recordNumber}) ${exportedUser.Id} (WorkOS ${workOsUser.id}) already has a password set`,
        );
        return false;
      }

      throw e;
    }
  } else {
    console.log(
      `(${recordNumber}) No password found in export for ${exportedUser.Id}`,
    );
  }

  console.log(
    `(${recordNumber}) Imported Auth0 user ${exportedUser.Id} as WorkOS user ${workOsUser.id}`,
  );

  return true;
}

const MAX_CONCURRENT_USER_IMPORTS = 10;

async function main() {
  const {
    passwordExport: passwordFilePath,
    userExport: userFilePath,
    cleanupTempDb,
  } = await yargs(hideBin(process.argv))
    .option("user-export", {
      type: "string",
      required: true,
      description:
        "Path to the user export created by the Auth0 export extension.",
    })
    .option("password-export", {
      type: "string",
      required: true,
      description: "Path to the password export received from Auth0 support.",
    })
    .option("cleanup-temp-db", {
      type: "boolean",
      default: true,
      description:
        "Whether to delete the temporary sqlite database after finishing the migration.",
    })
    .version(false)
    .parse();

  console.log(`Importing password hashes from ${passwordFilePath}`);

  const passwordStore = await new PasswordStore().fromPasswordExport(
    passwordFilePath,
  );

  console.log(`Importing users from ${userFilePath}`);

  const queue = new Queue({ concurrency: MAX_CONCURRENT_USER_IMPORTS });

  let recordCount = 0;
  let completedCount = 0;

  try {
    for await (const line of ndjsonStream(userFilePath)) {
      await queue.onSizeLessThan(MAX_CONCURRENT_USER_IMPORTS);

      queue.add(async () => {
        const successful = await processLine(line, recordCount, passwordStore);
        if (successful) {
          completedCount++;
        }
      });
      recordCount++;
    }

    await queue.onIdle();

    console.log(
      `Done importing. ${completedCount} of ${recordCount} user records imported.`,
    );
  } finally {
    passwordStore.destroy();

    if (cleanupTempDb) {
      await fs.rm(passwordStore.dbPath);
    }
  }
}

export default function start() {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
