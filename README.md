# migrate-auth0-users

Demonstration of importing Auth0 users into WorkOS, including setting password hashes.

#### Usage

```bash
WORKOS_SECRET_KEY=sk_abc123 npx github:workos/migrate-auth0-users auth0-users-file.json
```

#### Input file format

Expects a file in newline-delimited JSON, with each line containing an object with `email` and `passwordHash` properties, and optionally `firstName` and `lastName`
