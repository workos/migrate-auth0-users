import { z } from "zod";
import { ndjsonStream } from "../ndjson-stream";
import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import { Database, Password } from "./database";

const ExportedPassword = z.object({
  _id: z.object({
    $oid: z.string(),
  }),
  passwordHash: z.string(),
});

export class PasswordStore {
  private readonly db: Kysely<Database>;

  constructor(public readonly dbPath: string = "migrate-auth0-users.temp.db") {
    this.db = new Kysely<Database>({
      dialect: new SqliteDialect({
        database: new SQLite(dbPath),
      }),
    });
  }

  async fromPasswordExport(
    passwordExportFilePath: string,
  ): Promise<PasswordStore> {
    await this.prepareSchema();

    for await (const line of ndjsonStream(passwordExportFilePath)) {
      const exportedPassword = ExportedPassword.parse(line);

      await this.db
        .insertInto("passwords")
        .values({
          auth0_id: `auth0|${exportedPassword._id.$oid}`,
          password_hash: exportedPassword.passwordHash,
        })
        .onConflict((oc) => oc.doNothing())
        .execute();
    }

    return this;
  }

  find(auth0Id: string): Promise<Password | undefined> {
    return this.db
      .selectFrom("passwords")
      .selectAll()
      .where("auth0_id", "=", auth0Id)
      .executeTakeFirst();
  }

  destroy() {
    this.db.destroy();
  }

  private async prepareSchema() {
    await this.db.schema
      .createTable("passwords")
      .addColumn("auth0_id", "text", (col) => col.primaryKey())
      .addColumn("password_hash", "text", (col) => col.notNull())
      .ifNotExists()
      .execute();
  }
}

export type { Password } from "./database";
