# Private SVA variant: R2 contract

**Status:** R2 design and database scaffold, 15/10/2026. No private endpoint, vault operation, extension exchange, supplier login, or deployment is implemented by this ticket. The public demo remains separate. The detailed DRS stays outside this repository; this document contains no operational supplier addresses or user data.

## Boundary and deployment

The pilot is one isolated Hublink installation, with PostgreSQL 16 bound to `127.0.0.1` on host port `HUB_DB_PORT` (default `5439`). The Compose password is for an isolated local development database only. It must be replaced outside this scaffold before any shared environment. The private catalog, credential access, and URLs must come from authenticated, authorized API responses, never the public demo JSON. The API must check identity, role, service, and credential owner on every sensitive operation. Hiding a card is not authorization.

The initial Hub pilot has no Hub 2FA. Administration is restricted to a local or loopback network deployment; no public exposure is approved. The official production origin, TLS/proxy topology, recovery, and a future admin 2FA mechanism remain separate decisions before any remote or production use. Supplier challenges are independent: Playhub reCAPTCHA and supplier 2FA, and IPTV Turnstile when presented, remain human actions.

## Identity and continuous sessions (R3)

1. An admin provisions users. The Hub authenticates email and password against an Argon2id or scrypt password hash; plaintext passwords are never stored. Use a 32-byte random opaque session token. Only its lowercase SHA-256 hash goes into `sessions.token_hash`.
2. Set a host-only, `HttpOnly`, `SameSite=Strict` cookie with `Path=/` and `Max-Age=31536000` (365 days). Use `Secure` with HTTPS; the loopback HTTP pilot needs an explicitly limited local cookie configuration. Do not expose the token to JavaScript, logs, URLs, or the extension. Mutating routes additionally verify the expected web origin and use CSRF protection.
3. On every authenticated request, the API hashes the cookie, loads the session and user, rejects `revoked_at IS NOT NULL`, and rejects `last_seen_at` older than 365 days. It updates `last_seen_at` and renews the cookie for another 365 days. Updates should be bounded/serialized so an older concurrent request cannot move `last_seen_at` backwards. Failed authorization never prolongs an invalid session.
4. Logout and admin revocation set `revoked_at` in the database. Password reset revokes every session for that user. All protected operations recheck the row; a revoked cookie fails immediately on the next request. A ticket exchange must also recheck its recorded issuing `session_id` inside its transaction. Revoking the Hub cannot close an existing supplier session or change a Google Sheet permission.

The session table intentionally has no fixed `expires_at`: idle expiry is derived from `last_seen_at`, and a rolling response cookie mirrors it. R3 must define rate limits, error handling, concurrent session controls, and session cleanup before exposure beyond loopback.

## Central vault (R4)

`VAULT_MASTER_KEY` is a runtime-injected, secret 32-byte key, with an encoding contract to be fixed before implementation. It must not be committed, logged, or included in a database backup. Encrypt each credential record with AES-256-GCM using a fresh cryptographically random 12-byte IV and a 16-byte authentication tag. `key_version` identifies the key needed for decryption. Authentication failure is fatal; never return partial plaintext.

The DDL has one `iv` and one `auth_tag` for two ciphertext columns. Therefore **one AES-GCM operation covers both fields as a single framed plaintext**. Encode unambiguous lengths and the UTF-8 username/password in one versioned binary frame, encrypt the whole frame once, and split the resulting ciphertext at the corresponding frame boundary between `encrypted_username` and `encrypted_password`. On decrypt, concatenate those byte columns in the same order, authenticate once with the stored IV/tag and associated data (credential ID, service ID, owner ID, key version), then parse the frame. R4 must finalize and test the exact frame format before writing any record. Never run two independent GCM encryptions with the same IV/key or treat a single tag as authenticating two independent ciphertexts.

`owner_user_id IS NULL` denotes a shared credential. Only an admin manages and may reveal it in the Hub; attendants receive it only through a single authorized extension exchange. A non-NULL owner denotes an individual credential; that user manages and may reveal their own, while an admin may reveal it for support. The API checks `services.credential_type` against the owner form and rejects `none`. The partial unique index permits only one shared credential per service; the table uniqueness constraint permits only one per service and individual owner. A service may not mix shared and individual credentials. Deleting a user or service cascades its credential; R4 must audit those destructive operations.

Key rotation, secure key storage, encrypted backup, tested restore, and loss-of-key procedure are **open operational gates** before real credentials or production. A test database or successful decrypt does not satisfy them.

## Single-use opening ticket (R6)

The ticket row `id` is an internal UUID v4. The **bearer ticket** is a separate 32-byte cryptographically random value, encoded as base64url without padding. The API stores only `SHA-256(ticket bytes)` in `ticket_hash`. The web field named `ticketId` carries this opaque bearer value for the Chrome message; it is not the row UUID. This distinction preserves the requested 32-byte entropy and the UUID primary key without putting a raw ticket in the database.

1. A user clicks an actionable card in the React UI. `POST /api/vault/tickets` requires an active Hub session, an allowed service with validated `target_url`, the relevant credential, and a user-initiated attempt. The API inserts a ticket bound to `user_id`, the issuing `session_id`, and `service_id`, with `expires_at = created_at + INTERVAL '30 seconds'`, and returns `{ ticketId, serviceId }` only to that same authenticated web response. It sends `Cache-Control: no-store`.
2. The web calls `chrome.runtime.sendMessage(EXTENSION_ID, { ticketId, serviceId })`. The extension's `externally_connectable` allowlist must contain only the fixed official Hub origin. The service worker checks sender origin and tab, message shape, known service, and that this message follows a user click. No broad host permission or remote script is allowed.
3. The extension calls `POST /api/vault/exchange` directly with the bearer ticket and service ID. The API validates the configured extension origin/ID where observable, the ticket hash and service match, deadline, unused state, issuing user and recorded active session, service URL, and ownership/role rules. The browser's Origin header is a browser boundary, not proof against a malicious local HTTP client; this local pilot is not a production extension-attestation scheme.
4. In one database transaction, lock the ticket row (`SELECT ... FOR UPDATE`), recheck all conditions, and set `used_at = NOW()` before returning exactly one credential. Competing, expired, mismatched, or revoked attempts receive no plaintext. Do not spend a ticket before finding an authorized credential, and fail closed if decryption fails. Record a secret-free audit event in the same transaction where practical. A spent ticket is never reused after a network failure; the user initiates a new attempt.
5. The extension holds plaintext only in memory long enough to fill a recognized supplier form. It does not send it to React, the Hub DOM, `localStorage`, a URL, a log, or a screenshot. Supplier CAPTCHA, Turnstile, and 2FA remain manual. Opening a tab or submitting a form is not proof of supplier login; only the observed destination establishes that.

The extension/API association and fixed official origin must be finalized before R6 or remote deployment. R3/R4 can implement server-side issuance and authorization contracts with synthetic tests without assuming a supplier integration works.

## Pilot catalog

The catalog is private API data, not a seed of operational links in this public repository. Do not make a card actionable until an admin has validated its URL and domain. `services.has_action` is false while `target_url` is null. IDs below are stable synthetic identifiers; names are display labels.

| ID                                       | Card                      | Credential               | Initial behavior                                                                                         |
| ---------------------------------------- | ------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------- |
| `partiu`                                 | PARTIU!                   | Shared                   | Direct login path, subject to supplier validation.                                                       |
| `fullcam`                                | Fullcam                   | Individual per attendant | Only the owner's credential can be exchanged.                                                            |
| `playhub`                                | Playhub                   | Shared                   | Attendant handles reCAPTCHA and supplier 2FA.                                                            |
| `iptv`                                   | IPTV                      | Shared                   | Attendant handles Turnstile when it demands action.                                                      |
| `crm`                                    | CRM                       | `none` until validated   | Visible with `has_action = false` until URL validation (D-41).                                           |
| `fullarm`                                | Fullarm                   | `none` until validated   | Visible with `has_action = false` until URL validation (D-41).                                           |
| `planilha-1`, `planilha-2`, `planilha-3` | Three consultation sheets | None                     | Open approved Google Sheets links in a new tab; no vault exchange (D-21). Google controls actual access. |

The three sheets are read-only **by intended workflow**, not by Hub enforcement. CRM/Fullarm credential type and every supplier URL, login path, and dashboard signal need provider-specific validation. The same authorized cards are visible to attendants in the pilot; visibility does not grant credential reveal or supplier access.

## Database and audit contract

`apps/api/migrations/001_initial_schema.sql` creates the six tables with keys, checks, and indexes. It is a one-time native PostgreSQL migration, not an automatic boot script. Apply it only to a dedicated database after reviewing its target. The local demo API still writes `data/config.json`; this ticket does not wire it to PostgreSQL.

Audit actions include `login`, `logout`, `ticket_issued`, `vault_exchanged`, `session_revoked`, credential changes/reveals, and denied attempts. `details` must be an allowlisted JSON shape with identifiers/status only: no passwords, ciphertext, bearer ticket, cookie, 2FA code, or supplier/customer data. Retention and backup remain operational decisions.

## Acceptance and remaining gates

R2 is delivered as a local design and DDL scaffold. R3 starts with identity, server authorization, and session revocation tests. R4 implements and tests the framed AES-GCM format, owner isolation, rotation and recovery. R6 fixes the official origin and extension ID before exchange; R7 validates each supplier with authorized browser evidence. Production needs TLS/domain, Hub admin 2FA, key custody, backup/restore, provider URLs, and a pilot success metric. These unresolved items are tracked in `OPEN_QUESTIONS.md` and are not silently inferred from this scaffold.
