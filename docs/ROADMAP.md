# Hublink roadmap

Updated October 16, 2026. This roadmap describes local implementation; it does not authorize production deployment or supplier access. The detailed SVA research document stays outside this repository.

## Delivery sequence

| Slice | Local state         | Scope and limit                                                                                                                             |
| ----- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| R0    | Delivered           | npm workspaces for web, API, and Chrome MV3 scaffold.                                                                                       |
| R1    | Delivered           | Configurable public demo, local JSON persistence, logos, import/export, and browser checks.                                                 |
| R2    | Delivered           | PostgreSQL schema and private contracts for sessions, vault, tickets, and audit.                                                            |
| R3    | Delivered locally   | Hub login, rolling sessions, attendant administration, and password-reset revocation.                                                       |
| R4    | Delivered locally   | AES-256-GCM vault, credential ownership checks, audit, and custom service registration.                                                     |
| R5    | Implemented locally | Private catalog read/write API, card metadata migration, integrated card and shared-vault admin form, and attendant individual-vault entry. |
| R6    | Implemented locally | Loopback origin and configured extension ID; one-time opening tickets, direct exchange, detection, and manual-login fallback.               |
| R7    | Implemented locally | Generic assisted autofill after ticket exchange, without automatic submit; installed-extension and supplier validation remain open.         |
| R7b   | Implemented locally | Dual local Hub origins, content-script presence hint, confirmed bridge before tickets, and individual access dialog refresh.                |
| R8    | Planned             | On-premise operation, TLS, key custody, backup/restore, monitoring, and rollback.                                                           |
| R9    | Planned             | Review pilot evidence, support burden, and expansion decisions.                                                                             |

## Completed local slices

R1 provided validated local JSON configuration, explicit brand saving, logo previews, keyboard focus handling, and a separate public-example boundary. Its browser proof was local Chromium with synthetic data. R2 defined six PostgreSQL tables and the private security contract. R3 added loopback identity, rolling sessions, server-side role checks, attendant management, and transactional session revocation on password reset. R4 added encrypted credentials with service/owner/version binding, strict master-key validation, audited saves and reveals, and ownership checks. R4b enabled custom vault services and added the systems and other categories. These slices do not establish remote or supplier acceptance.

## R5 contract and evidence boundary

Authenticated users receive cards from GET /api/catalog, backed by services. Admins create, edit, and delete cards through /api/catalog/services; an optional shared credential is encrypted and saved in the same database transaction. The catalog response contains only metadata and a credential-present boolean for the current user. An attendant cannot mutate the catalog or manage a shared credential. Migration 003_services_visual_metadata.sql adds optional description and card logo columns under the existing startup advisory lock. Existing seed cards have no destination until an admin validates and configures one.

The legacy /api/config file remains a local public demo boundary. Its brand settings may still be edited and exported, but its links are not the authenticated card source. The old /api/vault/services registration route remains for compatibility; catalog editing uses the R5 routes. Opening a configured HTTPS destination does not prove supplier sign-in or extension behavior.

## R6 — Extension exchange

The local bridge accepts Hub pages on http://127.0.0.1:5177 and http://localhost:5177 and the API to http://127.0.0.1:3177. The installed extension ID is supplied through HUB_EXTENSION_ID and VITE_HUB_EXTENSION_ID. The API issues a random 32-byte token bound to user, session, and service; stores only its SHA-256 hash; expires it after 30 seconds; and consumes it under a ticket row lock with active-session and credential-owner checks. The worker exchanges directly with the API and opens the validated HTTPS destination. The frontend detects the extension and offers installation guidance and manual opening when unavailable. R7 now uses the plaintext only for an immediate, guarded filling attempt. Local API and component tests cover ticket replay, expiry, revocation, and fallback, but an installed Chrome extension and supplier form have not been validated. The stable extension ID and TLS/origin policy remain gates for deployment.

## R7 — Generic assisted autofill delivered locally; pilot pending

The user approved broad HTTPS host permission for dynamic destinations, conditioned on a valid ticket, final tab URL check, and a second location check inside the injected script. The generic engine fills one unambiguous login form with native setters and bubbling events, focuses the password field, and never submits. It reports detected human challenges and retains manual login when it cannot recognize a form or reach the authorized destination. Reference release is best effort because JavaScript strings and the DOM cannot be securely zeroed. Synthetic tests can verify the engine and build; they cannot prove a supplier login.

The authorized pilot must still validate each configured destination and login form in an installed Chrome extension. A successful attempt needs the correct destination, recognized form, a deliberate human submit, and an observed supplier dashboard or valid existing session. Unexpected forms stop autofill. Keep CAPTCHA, Turnstile, and 2FA with the attendant. Distinguish bad credentials, challenge, timeout, unavailable extension, and changed form without claiming success. Record results by service, date, extension version, and observed condition without secrets or customer data.

## R7b — Local detection and access dialog

R7b refreshes the individual access dialog and gives the Hub an immediate extension presence hint on both local origins. The worker accepts external messages only from those origins; the web app confirms the configured extension with PING before issuing a ticket. Installed Chrome behavior and visual acceptance still require browser QA.

## R8–R9 — Operation and review

Before on-premise deployment, confirm capacity, DNS, TLS, proxy, master-key custody, encrypted backups, restore practice, monitoring, updates, and rollback. Test origin binding, revocation, and outage behavior in the actual pilot environment. Distribute the extension with a stable ID and reviewed permissions. Hub revocation does not terminate supplier sessions or alter spreadsheet permissions. After the pilot, evaluate success measures, human intervention, failures by supplier, adapter maintenance cost, and any expansion to more suppliers or browsers. Local synthetic checks cannot substitute for this evidence.

## Next-session handoff

1. Read AGENTS.md, README.md, docs/CONTEXT.md, docs/DECISIONS.md, and docs/OPEN_QUESTIONS.md; inspect git status --short --branch and preserve unrelated work.
2. Review R5 with local integration, component, and isolated browser checks. Keep real credentials and destinations out of tracked examples and logs.
3. For the next gate, validate the installed extension on authorized supplier forms, review the broad HTTPS permission, and settle the stable extension ID and TLS/origin policy. Keep the human submit and manual-login path.
4. Preserve loopback ports and the developer's running services. A green build or synthetic test is not deployment or supplier acceptance.
