import { Insertable, Selectable } from "kysely";

export interface Database {
  passwords: PasswordTable;
  otp_secrets: OTPSecretTable;
}

export interface PasswordTable {
  auth0_id: string;
  password_hash: string;
}

export interface OTPSecretTable {
  auth0_id: string;
  otp_secret: string;
}


export type Password = Selectable<PasswordTable>;
export type NewPassword = Insertable<PasswordTable>;

export type Secret = Selectable<OTPSecretTable>;
export type NewSecret = Insertable<OTPSecretTable>;
