# migrate-auth0-users

Demonstration of importing Auth0 users into WorkOS, including setting password hashes.

#### Usage

```bash
WORKOS_SECRET_KEY=sk_abc123 npx github:workos/migrate-auth0-users auth0-users-file.json
```

Example output

```
% WORKOS_SECRET_KEY=sk_abc123 npx github:workos/migrate-auth0-users example-input.json
Need to install the following packages:
  github:workos/migrate-auth0-users
Ok to proceed? (y) y
Importing users from example-input.json
jason+test8@foo-corp.com (WorkOS user_01HCYXV9R05ZE1J46YPME5Z4BY) already has a password set
jason+test9@foo-corp.com (WorkOS user_01HCYXV9R15Q6PPYMA6F09M75A) already has a password set
Imported user jason+test13@foo-corp.com as WorkOS User user_01HCYZ09NQHZ4X1ZRVZ3V09WWW
Imported user jason+test10@foo-corp.com as WorkOS User user_01HCYZ09NSE9ABBQXTF1F43WKX
Imported user jason+test12@foo-corp.com as WorkOS User user_01HCYZ09PXM1F4WHQS70X1TS6H
Imported user jason+test11@foo-corp.com as WorkOS User user_01HCYZ09PRH8THC7ZEDYBEJ008
Done importing. 4 of 6 user records imported.
```

#### Input file format

Expects a file in newline-delimited JSON, with each line containing an object with `email` and `passwordHash` properties, and optionally `emailVerified`, `firstName`, and `lastName`.
