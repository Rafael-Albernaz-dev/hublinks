# Decisions and provenance

The SVA variant comes from research document DRS v0.37 (October 14, 2026), kept outside this portfolio repository. Check its decision IDs and status legend before implementing the private variant. This summary omits its operational links.

## Confirmed in the DRS

- D-02, D-12, D-13: React/TypeScript web and a dedicated Chrome pilot extension, installed manually.
- D-23, D-25, D-27, D-33: Individual Hub login, central backend vault, shared accounts maintained by admins, individual accounts maintained by attendants, and the same pilot cards visible to both roles.
- D-19: The attendant handles Playhub reCAPTCHA and 2FA.
- D-21: Consultation spreadsheets remain accessible through read-only links; Hub login does not restrict Google access.
- D-28, D-30, D-35: Immediate Hub session revocation, admin 2FA in a new browser, and revocation after password reset.
- D-41: Fullarm and CRM remain without an action until their URLs are validated.

## Reversible setup choices

- npm workspaces and one lockfile for web, API, and extension.
- Vite + React for web, Fastify for API, Manifest V3 and esbuild for the extension.
- Node 24, strict TypeScript, ESLint, and Prettier. The initial scaffold had no CI, database, authentication, or host permissions.
- Loopback `/health` for local checks, without business data.
- A configurable public demo in the `hublink/` repository; the raw DRS stays in the research directory.
- Local configuration with logo, RGB color, public HTTPS links, and JSON import/export. This does not replace the authenticated private catalog.
- Commit messages in English when authorized; update the README for each feature.

These choices do not settle the DRS product, security, or infrastructure questions. Record each later choice and its evidence before implementing sensitive routes.

## R1 — Reusable public demonstration (October 15, 2026)

- **Central persistence through the local API:** Web loads `GET /api/config` and saves the full configuration through `PUT /api/config`. The default file is `data/config.json`; `HUB_CONFIG_PATH` selects another path for tests. The API validates JSON v1 and writes through a temporary file and rename, creating the file with mode `0600`. This shares configuration among browsers connected to the same local API without authentication, backup, or multi-company isolation.
- **Strict network dependency:** Web depends on the loopback API. When it is unavailable, the interface shows an error and blocks editing. There is no silent `localStorage` fallback.
- **Explicit save:** Brand, color, and link edits stay in a draft until **Salvar alterações**. JSON import also creates a draft. Exported JSON may contain user-entered data and must be reviewed before sharing.
- **Card logos:** Each link accepts an optional PNG, JPG, or WebP base64 data URL of up to 500 KB. Without a logo, the card shows its number. The logo is part of persisted and exported JSON.
- **Reuse:** The demonstration is a separate local/on-premise installation per client (single tenant). Its API file is neither a private catalog nor a multiuser admin panel. The private variant still needs R2 identity, authorization, vault, and operation contracts.

R1 settled the initial installation alternative in question 9 and browser-shared configuration in question 10 of `docs/OPEN_QUESTIONS.md`. Editing and publishing rights, versioning, and rollback for the private variant remained open in R2; that file retains the original questions.

## R2 — Private variant contracts and specification (October 15, 2026)

- The private variant starts with an isolated installation and local PostgreSQL 16, using host port `127.0.0.1:5439` by default. The six core tables are in `apps/api/migrations/001_initial_schema.sql`. R2 itself did not connect the API to the database.
- Sessions use a rolling 365-day opaque `HttpOnly` cookie. Only the token's SHA-256 hash is stored, and the server revokes sessions through `revoked_at`. Each sensitive operation rechecks session and authorization.
- The planned vault uses AES-256-GCM, a 32-byte runtime master key, random 12-byte IV, and 16-byte tag. Its two encrypted columns make one authenticated message; an IV is never reused across operations. Admins manage shared credentials; attendants own individual credentials, with admin reveal for support.
- An opening ticket has an internal UUID v4 and a random 32-byte bearer token stored only by hash. It expires in 30 seconds, binds to user/session/service, and is consumed exactly once in a transaction by the extension calling the API directly. SVA passwords do not pass through React.
- The local Hub pilot has no Hub 2FA and restricts admin access to the local network/loopback. Supplier challenges remain human. Domain/TLS, future admin 2FA, key custody/backup, and extension binding remain operational gates before remote exposure.
- Pilot catalog: PARTIU!, Fullcam, Playhub, IPTV, CRM, and Fullarm. The last two have no action until URL validation (D-41). Three consultation spreadsheets open in a new tab without the vault (D-21). No operational URL belongs in this public repository.

The full contract and R3–R8 limits are in `docs/PRIVATE_SPEC.md`. R2 delivered specification and DDL, not private endpoints, automation, deployment, or supplier proof.

## R3 — Local identity and sessions (October 15, 2026)

- The API opens a `pg` pool of up to ten connections, with a five-second connection timeout and 30-second idle timeout. At local boot it applies R2 DDL only when the `users` table does not exist, under an advisory lock, then provisions an admin if none exists. It closes the pool on `onClose`.
- Hub passwords use `node:crypto.scrypt` with a random 16-byte salt and 64-byte key; comparisons use `timingSafeEqual`. `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` override development defaults before first boot. Changing them later does not change the existing admin.
- Login creates a random 32-byte opaque token, stores only SHA-256 in `sessions`, and sends a rolling 365-day `HttpOnly`, `SameSite=Lax` cookie. `GET /api/auth/me` and admin routes recheck revocation and inactivity. Logout and password reset revoke sessions on the server; reset and revocation are transactional.
- Admins can list/create attendants and reset attendant passwords. The server checks role per operation. React requires a session before displaying links and offers basic management. `GET/PUT /api/config` remain unauthenticated local public-demo endpoints, not a private catalog. R5 must serve private destinations only through an authorized API.
- The pilot remains bound to loopback. R3 has no Hub 2FA, login rate limit, CSRF origin protection, TLS, vault, extension integration, or supplier proof. These are gates for remote exposure and later stages.

## R4 — Central vault and audit (October 16, 2026)

- **Master-key contract:** `VAULT_MASTER_KEY` is strictly validated at boot in `apps/api/src/vault.ts`. It must contain exactly 32 bytes (256 bits), represented as 64 hex characters or 32 raw UTF-8 bytes. In production, missing or malformed keys fail closed. Local development and tests use a deterministic 32-byte fallback.
- **Single-operation AES-256-GCM frame:** The existing DDL provides one 12-byte `iv` and one 16-byte `auth_tag` for `encrypted_username` and `encrypted_password`. The vault packs both values into one versioned binary frame: `[version: 0x01 (1B)][len_u: 2B BE][u_bytes][len_p: 2B BE][p_bytes]`. One GCM operation encrypts the frame, then divides ciphertext at the frame boundary. Decryption concatenates both buffers and authenticates them together.
- **Additional Authenticated Data:** Every encryption and decryption operation binds `${service_id}:${owner_user_id ?? 'shared'}:${key_version}` as AAD, preventing substitution across services, owners, or key versions.
- **Role isolation:** Only admins manage and reveal shared credentials (`owner_user_id IS NULL`); attendants will use extension tickets in R6. Attendants manage only their own individual credentials; admins may reveal an attendant's individual credential for support.
- **Audit without secrets:** `credential_saved` and `credential_revealed` record actor, IP, service, and credential type in `audit_logs`, without plaintext, keys, or reversible hashes.

## R4b — Custom vault services (October 16, 2026)

- Admins alone register vault services through `POST /api/vault/services`. The API revalidates the session and role before parsing the request. Names are trimmed to 2–60 characters; credential type is exactly `shared` or `individual`. Category defaults to `sva`; credential-bearing services support `sva`, `crm`, `sistemas` (forms and ERP), and `outros`. `sheet` requires `credential_type = 'none'` and is rejected for this route. The idempotent `002_vault_service_categories.sql` migration extends the category check at startup for both new and existing local databases; the original R2 DDL remains intact.
- A service gets a UUID primary key, an optional validated HTTPS target without embedded credentials, and `has_action = false`. Registration does not grant supplier access or publish a catalog destination. The transaction also records `service_created` with actor, IP, service ID, name, credential type, and category; it omits the target URL and credentials.
- The admin panel offers shared or individual service registration and refreshes the vault list after success. Admins can enter shared credentials. Attendants can enter their own first individual credential even when no owner row exists yet; admins can support existing individual credentials only after an owner is established.

## R5 — Authenticated catalog and integrated vault form (October 16, 2026)

- Authenticated cards are read from PostgreSQL `services` through `GET /api/catalog`; legacy demo JSON links no longer drive the signed-in dashboard. The demo brand settings and public configuration API remain separate.
- Admin-only catalog mutations use `/api/catalog/services`. The service record and optional shared credential are saved in one SQL transaction. Shared credentials use the existing AES-256-GCM vault implementation and service/owner/version AAD. The listing exposes metadata and a user-specific credential-present flag, never credential values or encrypted payloads.
- A sheet card must have no vault credential. A card with no validated HTTPS target has no opening action. Configured cards open a new tab for now; this does not implement the R6 extension exchange or supplier authentication.
- Migration `003_services_visual_metadata.sql` adds optional description and logo data URL fields under the startup advisory lock. Card logos are limited to PNG/JPEG/WebP and 500 KB on both client and server. Existing seeded services remain without a destination until an admin configures them.
- Deleting a service cascades to credentials and opening tickets. Audit events record service changes and credential saves without secret values. Key custody, backup, supplier behavior, and remote security remain separate gates.

## R6 — Local extension ticket bridge (October 16, 2026)

- The local pilot accepts `http://127.0.0.1:5177` and `http://localhost:5177` in `externally_connectable` and the worker, and grants the extension only `http://127.0.0.1:3177/*` plus tab creation. `HUB_EXTENSION_ID` binds API exchange to a configured Chrome extension origin; `VITE_HUB_EXTENSION_ID` tells the web app where to send messages. An unset API ID denies exchange. This is a reversible local association, not a stable distribution ID or remote attestation.
- A session-bound, 32-byte random bearer ticket carries no credential. The API stores its SHA-256 hash, uses the existing 30-second schema deadline, and exchanges it under `SELECT ... FOR UPDATE`. The exchange rechecks the issuing session, action status, HTTPS destination, and the issuing user's shared or individual credential before committing `used_at`. `ticket_issued` and `ticket_exchanged` audits contain no credential values. Issuance also deletes rows older than 24 hours.
- The React card flow sends only the bearer ticket to the extension. If detection or opening fails, the user can install the unpacked local extension or open the destination for manual login. The extension exchanges directly with the API and opens the API-confirmed destination; it discards plaintext because supplier adapters and host permissions are outside R6. No supplier login success is claimed.
- Origin headers and `externally_connectable` constrain browser behavior but cannot authenticate a malicious local HTTP client that possesses a bearer ticket. Stable ID, TLS, production origin, supplier-specific permissions, and adapter verification remain pilot gates.

## R7 — Universal assisted autofill (October 16, 2026)

- The user approved one generic autofill engine for dynamically configured HTTPS destinations. No supplier-specific TypeScript modules are required. The extension receives credentials only after a user-initiated, one-time ticket exchange, then opens the API-confirmed destination.
- The user approved MV3 `tabs` and `scripting` permissions plus `https://*/*` host access for immediate filling without a second permission prompt. The existing `http://127.0.0.1:3177/*` permission remains for the local API. The worker verifies the completed tab URL against the exchanged target, including its HTTPS origin, before injection; the content script checks its own location again before using credentials. The wildcard still grants broad HTTPS reach and requires review for deployment.
- The engine recognizes a single usable password field and a nearby identifier field, uses the native input setter and bubbling events, and focuses the password field. Ambiguous forms fail closed to manual login. It never submits a form; CAPTCHA, Turnstile, hCaptcha, and OTP remain human steps. A fill result is not evidence of supplier authentication.
- Worker and content script release local credential references promptly and never persist them in extension storage, browser localStorage, cookies, or logs. JavaScript strings and values left in the destination DOM cannot be guaranteed to be erased from memory. Synthetic DOM tests do not establish behavior on any real supplier page.

## R7b — Local extension presence and access dialog (October 16, 2026)

- The local Chrome manifest and worker accept Hub pages on `http://localhost:5177` and `http://127.0.0.1:5177`. The API endpoint remains `http://127.0.0.1:3177`.
- A content script marks the Hub document and emits a presence event for immediate UI feedback. Page DOM is mutable, so a successful PING to the configured extension still gates ticket issuance. This does not remove the extension ID or prove installed-extension behavior in Chrome.
- The individual credential dialog has dedicated responsive form styles. Its AES-256-GCM label refers to the server vault contract.

## R8 — On-premise deployment, CI, and operational lifecycle (October 23, 2026)

- **CI/CD Strategy:** Continuous Integration (CI) is strictly enforced via GitHub Actions running `npm run check` (typecheck, lint, formatting, test suites, builds) on every push and pull request. Automated Continuous Deployment (CD) from cloud runners into the private on-premise network is intentionally omitted to avoid firewall punch-through, self-hosted runner maintenance, or cloud-to-VPN exposure.
- **Controlled Operator Updates:** Production deployments and updates are operator-initiated using `docker-compose.prod.yml` over VPN/local terminal. There is no `scripts/update.sh`; the operator runs the encrypted backup procedure before updates and Compose health verification afterward, following `docs/ROLLBACK.md`.
- **Standby Multi-Instance Topology:** The single-tenant design scales across corporate clients on a single host via container isolation and dedicated per-client databases (`hublink_<tenant>`) with distinct `VAULT_MASTER_KEY` values and subdomains, avoiding multi-tenant co-mingling in the cryptographic vault while maintaining near-zero marginal cost.
