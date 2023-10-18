import { Insertable, Selectable } from "kysely";

export interface Database {
  passwords: PasswordTable;
}

export interface PasswordTable {
  auth0_id: string;
  password_hash: string;
}

export type Password = Selectable<PasswordTable>;
export type NewPassword = Insertable<PasswordTable>;
