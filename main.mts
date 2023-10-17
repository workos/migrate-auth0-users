
import assert from "assert";
import { createReadStream } from 'fs';
import readline from 'readline';

import dotenv from 'dotenv';
import { WorkOS } from "@workos-inc/node";

dotenv.config();

const workos = new WorkOS(process.env.WORKOS_SECRET_KEY, { https: false, apiHostname: 'localhost', port: 7000 });

let recordCount = 0;
let completedCount = 0;

type UserRecord = {
  email: string;
  emailVerified?: boolean;
  firstName?: string;
  lastName?: string;
  passwordHash: string;
};

class Semaphore {
  private tasks: (() => void)[] = [];
  count: number;

  constructor(count: number) {
    this.count = count;
  }

  async acquire() {
    if (this.count > 0) {
      this.count--;
    } else {
      await new Promise<void>((res) => this.tasks.push(res));
    }
  }

  release() {
    if (this.tasks.length > 0) {
      const next = this.tasks.shift();
      if (next) {
        next();
      }
    } else {
      this.count++;
    }
  }
}

async function findOrCreateUser(record: UserRecord) {
  try {
    const user = await workos.users.createUser({
      email: record.email,
      emailVerified: record.emailVerified,
      firstName: record.firstName,
      lastName: record.lastName,
    });
    return user;
  } catch(e) {
    const matchingUsers = await workos.users.listUsers({ email: record.email });
    if (matchingUsers.data.length === 1) {
      return matchingUsers.data[0];
    }
  }
}

async function processLine(line: string) {
  const record: UserRecord = JSON.parse(line);
  recordCount++;

  const workOSUser = await findOrCreateUser(record);
  if (!workOSUser) {
    console.error(`Could not find or create user ${record.email}`);
    return;
  }

  try {
    await workos.post(`/users/${workOSUser.id}/password/migrate`, {
      password_hash: record.passwordHash,
      password_type: 'bcrypt',
    });
  }
  catch(e: any) {
    if (e?.rawData?.code === 'password_already_set') {
      console.log(`${record.email} (WorkOS ${workOSUser.id}) already has a password set`);
      return;
    }
    throw(e);
  }

  completedCount++;

  console.log(`Imported user ${record.email} as WorkOS User ${workOSUser.id}`);
}

async function main() {
  const filename = process.argv[2];
  if (!filename) {
    console.error("Usage: migrate-auth0-users <filename>");
    process.exit(1);
  }

  console.log(`Importing users from ${filename}`);

  const fileStream = createReadStream(filename);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const semaphore = new Semaphore(10); // Max 10 concurrent user imports

  const pendingUpdates: Promise<void>[] = [];

  for await (const line of rl) {
    await semaphore.acquire();

    const updating = processLine(line).finally(() => {
      semaphore.release();
    });

    pendingUpdates.push(updating);
  }

  await Promise.all(pendingUpdates);
  console.log(`Done importing. ${completedCount} of ${recordCount} user records imported.`);
}

export default function start() {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
