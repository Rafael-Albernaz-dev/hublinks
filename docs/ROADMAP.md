# Hublink roadmap

Updated October 18, 2026. This roadmap describes local implementation; it does not authorize production deployment or supplier access. The detailed SVA research document stays outside this repository.

> [!NOTE]
> The visual presentation from UX-011 and UX-012 is a working scaffold and has **not** been approved for production deployment; human visual acceptance and future styling adjustments remain pending before deploy.

## Phase 2 — Slice C / TICKET-017

The Extension Center in the Workspace header replaces the passive installation dialog. It downloads an authenticated ZIP, provides copy actions for `chrome://extensions` and the repository-relative `apps/extension/dist` path, explains extraction and Load unpacked, checks the actual extension bridge, and exposes startup, New Tab, and fill-notification options. The relative source path is a development convenience; downloaded ZIP users select their extracted folder. Manual destination opening remains available when launched from a service. Browser-wide theme, extension options, and sign-out controls have distinct surfaces, visible focus, and state indicators; attention animation respects reduced motion.

Build first with `npm run build`. `GET /api/extension/package` requires an active session and returns `hublink-chrome-extension.zip` with `Cache-Control: no-store`. The deterministic in-memory ZIP Store writer uses native Node CRC32 and includes only manifest.json, background.js, autofill.js, content.js, popup.html, and popup.js from the compiled extension. Missing artifacts return 503 with build guidance; static-only files cannot form an installable package. Runtime API requests never compile source or include project configuration/secrets.

Startup and New Tab options are off by default and explicitly enabled per Chrome profile. Startup opens or focuses the fixed local Workspace. New Tab redirects only Chrome's New Tab URLs, rechecking the tab before update and preserving typed destinations and `about:blank` application popups. It uses tab events, without an unconditional manifest new-tab override or modification of Chrome's startup policies. Profile startup/restore timing, competing New Tab extensions, and managed browser policies require installed-Chrome validation.

The only added permission is `storage`; host permissions and official Hub origins are unchanged. `chrome.storage.local` stores exactly three boolean flags: `openOnStartup`, `openOnNewTab`, and `showToastNotifications`. Unknown fields, non-booleans, credentials, tokens, tickets, cached shortcuts, and configurable Workspace URLs are rejected. This follows the ticket's stricter security gate over its broader storage examples. Settings messages accept PING, GET_SETTINGS, UPDATE_SETTINGS, and UPDATE_EXTENSION_SETTINGS; updates carry a `settings` object. External messages require an authorized Hub origin/tab; internal settings messages require the extension's own popup URL and identity. A page DOM marker alone never establishes a connection.

The 340px popup shows API and active-tab status, opens/focuses the Workspace, copies its fixed URL, and edits the same three options. It fetches `/api/catalog` with the current authenticated session and `no-store` while open. Only safe HTTPS metadata is rendered, never cached in extension storage. Direct links open their configured destination; services with a vault return to the Workspace for a user-initiated ticket. Missing session/API leaves guidance to open the Workspace. Shortcut loading from the extension origin still needs installed-Chrome cookie/origin verification.

Disabling notifications suppresses only the injected visual toast. Ticket validation, double destination checks, bounded SPA waiting, challenge detection, manual CAPTCHA/2FA, and human form submission remain unchanged. No supplier login or installation success is inferred from synthetic tests.

## Phase 2 — Slice B / TICKET-016

Implemented locally: two-layer company preset and personal account preferences, owner-only personal services, company Home defaults, Grid/List/Carousel with accessible page dots, drag/drop and keyboard order changes, optional task shortcuts, and combined Home search/category/vault/personal filters. The server protects global writes and private personal services across catalog, vault, and ticket paths. `PUT /api/config` now requires admin authentication. Preferences use authenticated account-scoped endpoints plus a validated per-user network fallback cache.

Migration 005 runs idempotently during initialization. Admins configure global branding/defaults; users can restore the company preset by deleting all personal preferences. Saved layout/shortcut values become explicit account preferences until reset. Team management remains admin-only; crypto primitives and companion source are unchanged.

Slice C / TICKET-017 is now implemented locally as described above. Next: Slice UX-018 (Workspace Visual Polish, UI Fine-Tuning & Feature Adjustments) to conduct hands-on design review and visual acceptance before advancing to operational readiness (R8). Human visual acceptance, installed Chrome companion checks, supplier authentication, remote infrastructure, and deployment remain open gates.

## Delivery sequence

| Slice    | Local state         | Scope and limit                                                                                                                                                                |
| -------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R0       | Delivered           | npm workspaces for web, API, and Chrome MV3 scaffold.                                                                                                                          |
| R1       | Delivered           | Configurable public demo, local JSON persistence, logos, import/export, and browser checks.                                                                                    |
| R2       | Delivered           | PostgreSQL schema and private contracts for sessions, vault, tickets, and audit.                                                                                               |
| R3       | Delivered locally   | Hub login, rolling sessions, attendant administration, and password-reset revocation.                                                                                          |
| R4       | Delivered locally   | AES-256-GCM vault, credential ownership checks, audit, and custom service registration.                                                                                        |
| R5       | Implemented locally | Private catalog read/write API, card metadata migration, integrated card and shared-vault admin form, and attendant individual-vault entry.                                    |
| R6       | Implemented locally | Loopback origin and configured extension ID; one-time opening tickets, direct exchange, detection, and manual-login fallback.                                                  |
| R7       | Implemented locally | Generic assisted autofill after ticket exchange, without automatic submit; installed-extension and supplier validation remain open.                                            |
| R7b      | Implemented locally | Dual local Hub origins, content-script presence hint, confirmed bridge before tickets, and individual access dialog refresh.                                                   |
| UX-011   | Scaffold pending QA | Approved Workspace shell, five task screens, light/dark tokens, responsive grids, accessible search, and reduced-motion-aware entry. Visual design acceptance remains pending. |
| UX-012   | Scaffold pending QA | Dynamic brand accent and Home subtitle, icon controls in the header, dedicated catalog management, and enhanced identity color/logo editors. Visual acceptance pending.        |
| ARCH-013 | Implemented locally | Frontend extraction preserved; API stage 2 splits types, validators, services, and five route modules with compatible server creation.                                         |
| SEC-014  | Implemented locally | Native API headers and per-IP sliding rate limits, updated Workspace E2E, and PostgreSQL 16 CI running npm run check.                                                          |
| EXT-015  | Implemented locally | Four-second SPA wait with URL revalidation, accessible challenge toast, and local API/tab status popup with Workspace shortcut.                                                |
| Phase 2  | Implemented locally | TICKET-015 (Clean Arch & hygiene), TICKET-016 (personal layer & Home layouts), TICKET-017 (Extension Center & startup/New Tab).                                                |
| UX-018   | Planned (Next)      | Workspace visual polish, interactive UI fine-tuning, hands-on design review in Light/Dark themes, and any pending feature adjustments.                                         |
| R8       | Planned             | On-premise operation, dynamic client origins, Docker packaging, encrypted backup/restore, audit log viewer, and rollback.                                                      |
| R9       | Planned             | Review pilot evidence, supplier authentication, support burden, and expansion decisions.                                                                                       |

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

## UX-011 — Approved Workspace presentation

TICKET-011 implements the approved Workspace composition in the web client: five visible task destinations, four home shortcuts, a three-column desktop/two-column mobile service grid, contained logos, contextual card actions, accent/case-insensitive search with a polite result count, and exact Lucide 1.17.0 SVG paths. Light/dark theme selection is browser-local with a system-preference fallback. Initial cards enter once with the approved 220 ms motion and capped 35 ms stagger; reduced motion disables it. Identity keeps the existing configuration draft/save and transfer behavior, with a live brand preview.

Access lists metadata and responsible people and retains authorized credential writes; stored-password reveal has been removed from the web interface. Team listing and attendant management reuse `/api/admin/users`; no API contract is added. Administrative destinations remain disabled for attendants. Missing destinations stay non-actionable for attendants, and individual setup, confirmed extension exchange, direct links, and manual fallback retain their existing contracts.

The local component suite covers navigation, search, role boundaries, metadata privacy, keyboard focus, theme persistence, movement, and existing authentication/catalog/extension flows. Isolated Chromium checks cover both themes and all task screens at 320, 390, 560, 561, 780, 781, 1024, and 1440 px. These are synthetic local proofs. Human comparison against the approved reference and installed-extension/supplier acceptance remain pending; the UX milestone does not advance R8 or R9.

## UX-012 — Workspace refinement

TICKET-012 makes the editable identity subtitle visible on Home and applies chosen brand color to Workspace accents, focus rings, selected surfaces, and actions without changing the configuration API. The approved purple remains the visual default for the legacy default-blue configuration. Hexadecimal, RGB text, and native color picker inputs synchronize valid values; incomplete or invalid text does not change the chosen color. Logo upload/removal remains an explicit draft and now has a dedicated preview/dropzone. The theme and sign-out controls are labeled Lucide icon buttons in the account header.

Catalog now renders an authenticated management list rather than duplicating Home cards. Admins can search, add, edit, and delete through the existing catalog routes; attendants see metadata and an Access shortcut without mutation controls. Home cards, ticket exchange, extension fallback, and role checks retain their existing behavior. Local component and browser evidence cover layout and interaction only. Human visual acceptance and installed-extension/supplier validation remain pending.

## ARCH-013 — API modularization delivered locally

TICKET-013 extracted the frontend into views, components, dialogs/editors, icons, and domain hooks. TICKET-014 completes backend stage 2: `server.ts` is a 71-line lifecycle orchestrator; `types/`, `validators/`, `services/{session,audit,security}.ts`, and `routes/{auth,admin,catalog,vault,config}.ts` own the extracted contracts and handlers. `createServer(configPath?, pool?, options?)` retains both existing arguments and adds optional rate-limit overrides. Transactions, ticket/session row locks, AAD, configured extension origin, and configuration writes retain their existing contracts. A new repository abstraction and CSS modularization are not part of this ticket.

## SEC-014 — Local hardening and continuous quality gates

TICKET-014 adds strict JSON API CSP and defensive HTTP headers without dependencies. Sliding in-memory limits default to 20 login attempts and 30 ticket requests per IP per minute, with 429 and `Retry-After`. Limits are scoped to each server instance, reset on restart, and are not distributed abuse protection. Tests cover headers on success/errors/preflight, limits, IP/instance isolation, expiry, and blocked ticket issuance.

GitHub Actions runs `npm ci` and `npm run check` on Node 24 with PostgreSQL 16 and synthetic keys. The vault reads `VAULT_MASTER_KEY`; `HUB_MASTER_KEY` is also present for the dispatch contract. Seven updated Playwright scenarios are executed separately from `check`, using the existing isolated database/API setup. They use actual Workspace selectors, including the inline service editor's Cancel action. A service modal Escape/focus requirement cannot be established without a separately scoped web change. CI configuration is not evidence of a hosted Actions run or deployment.

## EXT-015 — Companion resilience and status delivered locally

The synchronous engine remains available. A MutationObserver retries recognition for at most four seconds and disconnects on fill, timeout, or failed destination authorization. Every attempt rechecks the API-confirmed destination. An accessible dismissible toast guides review, human CAPTCHA/Turnstile/2FA completion, and manual submission without exposing credentials.

The bundled toolbar popup reports local API health and active-tab context, and focuses an existing local Workspace tab/window or opens it. It does not request account information or credentials. Existing worker URL checks, manifest permissions, and no-storage/no-auto-submit contracts remain intact. Synthetic tests cover SPA rendering, timeout/observer cleanup, navigation rejection, toast, and popup online/offline/open/focus behavior. Installed-extension and supplier proof remain pending. Search launchers, context menus, retries, and clipboard fallback are outside this delivery.

## R8–R9 — Operation and review

Before on-premise deployment, confirm capacity, DNS, TLS, proxy, master-key custody, encrypted backups, restore practice, monitoring, updates, and rollback. Test origin binding, revocation, and outage behavior in the actual pilot environment. Distribute the extension with a stable ID and reviewed permissions. Hub revocation does not terminate supplier sessions or alter spreadsheet permissions. After the pilot, evaluate success measures, human intervention, failures by supplier, adapter maintenance cost, and any expansion to more suppliers or browsers. Local synthetic checks cannot substitute for this evidence.

## TICKET-014 local validation

`npm run check` passes typecheck (including E2E), zero-warning lint, formatting, API 32/32 tests, extension 17/17, unchanged web 41/41, and all workspace builds. Seven updated Chromium E2E scenarios pass separately with synthetic data. The temporary validation harness uses API 3178, web 5187, and dedicated databases to preserve developer services on 3177/5177. The GitHub Actions workflow has been configured but has not been observed running remotely. The service editor cancellation scenario reflects the existing inline UI, rather than proving a nonexistent service dialog Escape/focus contract.

## Next-session handoff

1. Read AGENTS.md, README.md, docs/CONTEXT.md, docs/DECISIONS.md, and docs/OPEN_QUESTIONS.md; inspect git status --short --branch and preserve unrelated work.
2. Review UX-011 against the approved Workspace reference in both themes, including identity drafts, team management, and card states. Local synthetic browser proof does not replace human visual acceptance. Keep real credentials and destinations out of tracked examples and logs.
3. For the next gate, validate the installed extension on authorized supplier forms, review the broad HTTPS permission, and settle the stable extension ID and TLS/origin policy. Keep the human submit and manual-login path.
4. Preserve loopback ports and the developer's running services. A green build or synthetic test is not deployment or supplier acceptance.

## TICKET-016 local validation

`npm run check` passed with 37 API tests, 17 unchanged extension tests, 50 web tests, zero-warning lint, formatting, typechecks, and workspace builds. The seven existing Playwright E2E scenarios pass with preference reset added to their authenticated setup. Validation used dedicated `hublink_ticket016_test` and `hublink_ticket016_e2e` databases, API 3178, and web 5187 to preserve development ports. A temporary synthetic Chromium scenario checked all three layouts at 390 and 1440 px in both themes, found no document overflow, and verified at least 4.5:1 text contrast on the new layout selectors. Source checksums confirm the extension and AES-256-GCM primitive are unchanged. Browser cache/build artifacts are generated by the required suites. Human visual acceptance, supplier authentication, and deployment are not established.

## TICKET-017 local verification

The full check passes with 38 API tests, 24 extension tests, and 53 web tests, plus typechecking, zero-warning lint, formatting, and builds. Seven existing Chromium E2E scenarios pass separately. Validation uses dedicated `hublink_ticket017_test` and `hublink_ticket017_e2e` databases and temporary API 3178/Web 5187 servers, preserving developer ports. Two additional temporary Chromium scenarios verify the Extension Center/navbar in both themes at 390 and 1440 px, focus restoration, a real authenticated ZIP download, and the compiled 340px popup with synthetic Chrome APIs. Active/missing status buttons and the popup's primary action meet 4.5:1 text contrast in those checks. Python's ZIP reader also validates all six packaged files and CRCs. These proofs do not establish installed-Chrome startup/New Tab behavior, extension-origin cookie availability, or supplier login.
