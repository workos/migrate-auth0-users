import { z } from "zod";

/**
 * These fields match the defaults from Auth0's "User Import / Export" extension:
 *
 *   https://auth0.com/docs/customize/extensions/user-import-export-extension
 */
export const Auth0ExportedUser = z.object({
  Id: z.string(),
  Email: z.string(),
  "Email Verified": z.optional(z.boolean()),
  "Given Name": z.optional(z.string()),
  "Family Name": z.optional(z.string()),
});

export type Auth0ExportedUser = z.infer<typeof Auth0ExportedUser>;
