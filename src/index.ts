import { WorkOS, RateLimitExceededException } from "@workos-inc/node";
import dotenv from "dotenv";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import fs from "fs/promises";
import Queue from "p-queue";

import { ndjsonStream } from "./ndjson-stream";
import { CredentialsStore } from "./credentials-store";
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
    : {}
);

async function findOrCreateUser(
  exportedUser: Auth0ExportedUser,
  passwordHash: string | undefined,
  otpSecret: string | undefined
) {
  try {
    const passwordOptions = passwordHash
      ? {
          passwordHash,
          passwordHashType: "bcrypt" as const,
        }
      : {};

    const workosUser = await workos.userManagement.createUser({
      email: exportedUser.Email,
      emailVerified: exportedUser["Email Verified"],
      firstName: exportedUser["Given Name"],
      lastName: exportedUser["Family Name"],
      ...passwordOptions,
    });

    if (otpSecret) {
      await workos.userManagement.enrollAuthFactor({
        type: "totp",
        userId: workosUser.id,
        totpSecret: otpSecret,
      });
    }
    return workosUser;
  } catch (error) {
    if (error instanceof RateLimitExceededException) {
      throw error;
    }

    const matchingUsers = await workos.userManagement.listUsers({
      email: exportedUser.Email.toLowerCase(),
    });
    if (matchingUsers.data.length === 1) {
      const workosUser = matchingUsers.data[0];
      if (otpSecret) {
        await workos.userManagement.enrollAuthFactor({
          type: "totp",
          userId: workosUser.id,
          totpSecret: otpSecret,
        });
      }
      return workosUser;
    }
  }
}

async function processLine(
  line: unknown,
  recordNumber: number,
  credentialsStore: CredentialsStore
): Promise<boolean> {
  const exportedUser = Auth0ExportedUser.parse(line);

  const password = await credentialsStore.findPassword(exportedUser.Id);
  if (!password) {
    console.log(
      `(${recordNumber}) No password found in export for ${exportedUser.Id}`
    );
  }

  const optSecret = await credentialsStore.findOTPSecret(exportedUser.Id);
  if (!optSecret) {
    console.log(
      `(${recordNumber}) No MFA Secret found in export for ${exportedUser.Id}`
    );
  }

  const workOsUser = await findOrCreateUser(
    exportedUser,
    password?.password_hash,
    optSecret?.otp_secret
  );
  if (!workOsUser) {
    console.error(
      `(${recordNumber}) Could not find or create user ${exportedUser.Id}`
    );
    return false;
  }

  console.log(
    `(${recordNumber}) Imported Auth0 user ${exportedUser.Id} as WorkOS user ${workOsUser.id}`
  );

  return true;
}

const DEFAULT_RETRY_AFTER = 10;
const MAX_CONCURRENT_USER_IMPORTS = 10;

async function main() {
  const {
    passwordExport: passwordFilePath,
    mfaExport: mfaFilePath,
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
      required: false,
      description: "Path to the password export received from Auth0 support.",
    })
    .option("mfa-export", {
      type: "string",
      required: false,
      description: "Path to the mfa export received from Auth0 support.",
    })
    .option("cleanup-temp-db", {
      type: "boolean",
      default: true,
      description:
        "Whether to delete the temporary sqlite database after finishing the migration.",
    })
    .version(false)
    .parse();

  const credentialsStore = await new CredentialsStore();
  await credentialsStore.prepareSchema();

  if (passwordFilePath) {
    console.log(`Importing password hashes from ${passwordFilePath}`);

    await credentialsStore.fromPasswordExport(passwordFilePath);
  }

  if (mfaFilePath) {
    console.log(`Importing mfa secrets from ${mfaFilePath}`);

    await credentialsStore.fromSecretExport(mfaFilePath);
  }

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
              credentialsStore
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
              `Rate limit exceeded. Pausing queue for ${retryAfter} seconds.`
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
      `Done importing. ${completedCount} of ${recordCount} user records imported.`
    );
  } finally {
    credentialsStore.destroy();

    if (cleanupTempDb) {
      await fs.rm(credentialsStore.dbPath);
    }
  }
}

export default function start() {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
