import { z } from "zod";
import { ndjsonStream } from "../ndjson-stream";
import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import { Database, Password, Secret } from "./database";

const ExportedPassword = z.object({
  _id: z.string(),
  passwordHash: z.string(),
});

const ExportedOTPSecret = z.object({
  user_id: z.string(),
  type: z.string(),
  otp_secret: z.optional(z.string()),
});

export class CredentialsStore {
  private readonly db: Kysely<Database>;

  constructor(public readonly dbPath: string = "migrate-auth0-users.temp.db") {
    this.db = new Kysely<Database>({
      dialect: new SqliteDialect({
        database: new SQLite(dbPath),
      }),
    });
  }

  async fromPasswordExport(passwordExportFilePath: string): Promise<void> {
    for await (const line of ndjsonStream(passwordExportFilePath)) {
      const exportedPassword = ExportedPassword.parse(line);

      await this.db
        .insertInto("passwords")
        .values({
          auth0_id: `auth0|${exportedPassword._id}`,
          password_hash: exportedPassword.passwordHash,
        })
        .onConflict((oc) => oc.doNothing())
        .execute();
    }
  }

  async fromSecretExport(secretExportFilePath: string): Promise<void> {
    for await (const line of ndjsonStream(secretExportFilePath)) {
      const exportedSecret = ExportedOTPSecret.parse(line);
      if (exportedSecret.type !== "otp" || !exportedSecret.otp_secret) continue;
      await this.db
        .insertInto("otp_secrets")
        .values({
          auth0_id: exportedSecret.user_id,
          otp_secret: exportedSecret.otp_secret,
        })
        .onConflict((oc) => oc.doNothing())
        .execute();
    }
  }

  findPassword(auth0Id: string): Promise<Password | undefined> {
    return this.db
      .selectFrom("passwords")
      .selectAll()
      .where("auth0_id", "=", auth0Id)
      .executeTakeFirst();
  }

  findOTPSecret(auth0Id: string): Promise<Secret | undefined> {
    return this.db
      .selectFrom("otp_secrets")
      .selectAll()
      .where("auth0_id", "=", auth0Id)
      .executeTakeFirst();
  }

  destroy() {
    this.db.destroy();
  }

  async prepareSchema() {
    await this.db.schema
      .createTable("passwords")
      .addColumn("auth0_id", "text", (col) => col.primaryKey())
      .addColumn("password_hash", "text", (col) => col.notNull())
      .ifNotExists()
      .execute();
    await this.db.schema
      .createTable("otp_secrets")
      .addColumn("auth0_id", "text", (col) => col.primaryKey())
      .addColumn("otp_secret", "text", (col) => col.notNull())
      .ifNotExists()
      .execute();
  }
}

export type { Password, Secret } from "./database";
