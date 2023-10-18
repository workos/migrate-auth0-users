# migrate-auth0-users

Demonstration of importing Auth0 users into WorkOS, including setting password hashes.

#### Usage

```bash
WORKOS_SECRET_KEY=sk_abc123 npx github:workos/migrate-auth0-users --help
```

Example output

```
% WORKOS_SECRET_KEY=sk_abc123 npx github:workos/migrate-auth0-users \
  --user-export dev-123abc.json \
  --password-export password-export.json
Need to install the following packages:
  github:workos/migrate-auth0-users
Ok to proceed? (y) y
Importing users from example-input.json
(1) jason+test8@foo-corp.com (WorkOS user_01HCYXV9R05ZE1J46YPME5Z4BY) already has a password set
(2) jason+test9@foo-corp.com (WorkOS user_01HCYXV9R15Q6PPYMA6F09M75A) already has a password set
(3) Imported user jason+test13@foo-corp.com as WorkOS User user_01HCYZ09NQHZ4X1ZRVZ3V09WWW
(4) Imported user jason+test10@foo-corp.com as WorkOS User user_01HCYZ09NSE9ABBQXTF1F43WKX
(5) Imported user jason+test12@foo-corp.com as WorkOS User user_01HCYZ09PXM1F4WHQS70X1TS6H
(6) Imported user jason+test11@foo-corp.com as WorkOS User user_01HCYZ09PRH8THC7ZEDYBEJ008
Done importing. 4 of 6 user records imported.
```

#### Input file format

Two export files from Auth0 must be given.

The first is passed via the `--user-export` flag and is obtained using the
official [Auth0 Import/Export extension](https://auth0.com/docs/customize/extensions/user-import-export-extension). This
tool expects that the export is created using the default fields
which are added via the "Add default fields" button in the extension UI.

The second export file is passed via the `--password-export` flag and is
[obtained from Auth0 support by filing a ticket](requesting a password)
and requesting password hashes to be exported. Note that the script will exit
with an error if any custom password hashes are present.
