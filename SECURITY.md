# Security baseline and operating guide

This is a targeted baseline informed by OWASP Cryptographic Storage and Shopify protected-customer-data guidance. It is not a security certification or a complete production security review.

## Encryption scope

The shared database client encrypts Customer.email and Session.firstName, lastName, email, accessToken, and refreshToken with AES-256-GCM, random 96-bit nonces, 128-bit authentication tags, a key identifier, and model/field authenticated context. Reads decrypt only on the server before authorized use. Missing keys, plaintext reads, wrong keys and modified ciphertext fail closed. Names of event attendees are currently not stored; the name fields that do exist are Shopify staff session names. If adding personal fields later, extend protectedFields and migrate before use.

This is field encryption, not full database encryption. Shopify customer/order IDs, staff user IDs, shop identifiers, event/attendance relationships, event descriptions, order amounts and metadata remain readable in SQLite. Use encrypted volumes/databases and encrypted backups in production to cover those sensitive records too. Do not enter personal information into event names/descriptions. Encryption does not protect against an attacker who controls the running app or possesses both the database and key. Field context prevents cross-field substitution, but does not bind ciphertext to a specific row.

Database writes through app/db.server.ts automatically encrypt. Nested relationship reads decrypt correctly. Nested writes and filters/sorts on protected fields are rejected to avoid plaintext bypasses or incorrect queries. Use separate writes within transactions. Raw Prisma clients/SQL are reserved for audited maintenance scripts and tests; do not use them in routes. The existing shop-scoped queries and Shopify session verification still enforce authorization. Authorized browser users still receive the data they need; encryption at rest is not browser masking.

## Local migration

Stop every app process first. From the project directory run:

```sh
node --env-file-if-exists=.env --experimental-strip-types scripts/encrypt-data.mjs --maintenance-confirmed
```

The script creates APP_DATA_KEY in .env only for an unencrypted database without a configured key. It sets file permissions to owner-only, makes an AES-GCM encrypted database snapshot in .security-backups/, encrypts existing protected fields in a transaction, and vacuums SQLite to remove old plaintext pages from the live database. It is idempotent with the same key. A missing key with already encrypted records is rejected. The snapshot is intended only for stopped processes using the current SQLite database path; it is not a general online backup tool.

Then restart npm run dev. Preserve the .env key in a password manager or secret manager separately from backups. Losing the key loses access to encrypted data. Never paste keys into chat, logs, source code, issue reports, screenshots, or build artifacts. OS snapshots, prior exports, old plaintext backups and SSD remnants are outside this migration; manage those separately. Existing data is not encrypted until this command completes.

## Production key and deployment requirements

- Supply APP_DATA_KEY through a managed secret store at runtime, separately from database volumes. Restrict which identities can retrieve it. Local .env storage is for development; it is not a substitute for production secret management.
- Back up both the key and encrypted database separately and test restoration before deployment. Docker excludes local databases, keys and recovery files; mount/configure the database and runtime secrets explicitly.
- Do not replace APP_DATA_KEY casually. Rotation is not automated: stop writers, retain the old key, decrypt with it, re-encrypt with a new key, verify a staged restore, then deploy the new key atomically. This release supports one active key, not concurrent key rotation.
- Enforce HTTPS/TLS at the hosting proxy, enable encrypted disk/database storage and encrypted backups, apply network/access restrictions, and configure request body and rate limits at the gateway. These hosting controls have not been provisioned by this patch.

## Response and import protections

Document and data responses are marked private/no-store; JSON endpoints also set explicit no-store headers. Content sniffing is disabled and camera/microphone/location permissions are denied. Existing Shopify framing CSP is retained so the embedded app keeps working. Request/render errors omit sensitive exception details in application logs. Review infrastructure, SDK and development logs too; this is not a guarantee that every third-party logger redacts data. CSV imports require POST and quote email search values. Raw Shopify GraphQL errors are no longer echoed to the browser. Existing CSV row and file limits remain; ingress limits are still needed to reject oversized bodies before buffering.

## Still required before public launch

Complete privacy-webhook handling (customer data requests/redaction and shop redaction), a retention policy, access/audit logging without PII, dependency vulnerability scanning, rate limiting, staff authorization review, and an independent security review. Confirm Shopify's protected-data requirements for the intended distribution. Session/CSV/storage protections alone do not establish GDPR/PCI/SOC2 compliance.

## Verification

`node --experimental-strip-types --test tests/security.test.mjs` tests randomized authenticated encryption, invalid keys/tampering, strict plaintext rejection, nested result decryption, transaction writes, session credential protection, and header policy. Existing tests also cover shop isolation for destructive operations. These use temporary databases, not store data.

References:
- https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- https://shopify.dev/docs/apps/launch/protected-customer-data
