import { z } from "zod";
import { ndjsonStream } from "../ndjson-stream";
import { Password } from "./database";

const ExportedPassword = z.object({
  _id: z.object({
    $oid: z.string(),
  }),
  passwordHash: z.string(),
});

export class PasswordStore {
  private readonly passwords = new Map<string, string>();

  async fromPasswordExport(
    passwordExportFilePath: string,
  ): Promise<PasswordStore> {
    for await (const line of ndjsonStream(passwordExportFilePath)) {
      const exportedPassword = ExportedPassword.parse(line);

      this.passwords.set(
        exportedPassword._id.$oid,
        exportedPassword.passwordHash,
      );
    }

    return this;
  }

  async find(auth0Id: string): Promise<Password | undefined> {
    const passwordHash = this.passwords.get(auth0Id);
    if (passwordHash === undefined) {
      return undefined;
    }

    return { auth0_id: auth0Id, password_hash: passwordHash };
  }

  destroy() {
    this.passwords.clear();
  }
}

export type { Password } from "./database";
