import { WorkOS, RateLimitExceededException } from "@workos-inc/node";
import dotenv from "dotenv";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import fs from "fs/promises";
import Queue from "p-queue";

import { ndjsonStream } from "./ndjson-stream";
import { PasswordStore } from "./password-store";
import { Auth0ExportedUser } from "./auth0-exported-user";
import { sleep } from "./sleep";

dotenv.config();

const USE_LOCAL_API = (process.env.NODE_ENV ?? "").startsWith("dev");

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

async function findOrCreateUser(
  exportedUser: Auth0ExportedUser,
  passwordHash: string | undefined,
) {
  if (!exportedUser.Email) {
    return null;
  }

  try {
    const passwordOptions = passwordHash
      ? {
          passwordHash,
          passwordHashType: "bcrypt" as const,
        }
      : {};

    return await workos.userManagement.createUser({
      email: exportedUser.Email,
      emailVerified: exportedUser["Email Verified"],
      firstName: exportedUser["Given Name"],
      lastName: exportedUser["Family Name"],
      ...passwordOptions,
    });
  } catch (error) {
    if (error instanceof RateLimitExceededException) {
      throw error;
    }

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

  const password = await passwordStore.find(exportedUser.Id);
  if (!password) {
    console.log(
      `(${recordNumber}) No password found in export for ${exportedUser.Id}`,
    );
  }

  const workOsUser = await findOrCreateUser(
    exportedUser,
    password?.password_hash,
  );
  if (!workOsUser) {
    console.error(
      `(${recordNumber}) Could not find or create user ${exportedUser.Id}`,
    );
    return false;
  }

  console.log(
    `(${recordNumber}) Imported Auth0 user ${exportedUser.Id} as WorkOS user ${workOsUser.id}`,
  );

  return true;
}

const DEFAULT_RETRY_AFTER = 10;
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

      const recordNumber = recordCount;
      const enqueueTask = () =>
        queue
          .add(async () => {
            const successful = await processLine(
              line,
              recordNumber,
              passwordStore,
            );
            if (successful) {
              completedCount++;
            }
          })
          .catch(async (error: unknown) => {
            if (!(error instanceof RateLimitExceededException)) {
              throw error;
            }

            const retryAfter = (error.retryAfter ?? DEFAULT_RETRY_AFTER) + 1;
            console.warn(
              `Rate limit exceeded. Pausing queue for ${retryAfter} seconds.`,
            );

            queue.pause();
            enqueueTask();

            await sleep(retryAfter * 1000);

            queue.start();
          });
      enqueueTask();

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
