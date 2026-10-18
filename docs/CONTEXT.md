# Project state

Hublink provides a configurable local demonstration, an authenticated React Workspace, a loopback Fastify API backed by PostgreSQL, and a Chrome MV3 companion. The detailed supplier research and operational destinations remain outside this repository. Local synthetic validation does not establish production readiness or supplier authentication.

## Phase 2 — Slice C / TICKET-017

The Extension Center in the Workspace header replaces the passive installation dialog. It downloads an authenticated ZIP, provides copy actions for `chrome://extensions` and the repository-relative `apps/extension/dist` path, explains extraction and Load unpacked, checks the actual extension bridge, and exposes startup, New Tab, and fill-notification options. The relative source path is a development convenience; downloaded ZIP users select their extracted folder. Manual destination opening remains available when launched from a service. Browser-wide theme, extension options, and sign-out controls have distinct surfaces, visible focus, and state indicators; attention animation respects reduced motion.

Build first with `npm run build`. `GET /api/extension/package` requires an active session and returns `hublink-chrome-extension.zip` with `Cache-Control: no-store`. The deterministic in-memory ZIP Store writer uses native Node CRC32 and includes only manifest.json, background.js, autofill.js, content.js, popup.html, and popup.js from the compiled extension. Missing artifacts return 503 with build guidance; static-only files cannot form an installable package. Runtime API requests never compile source or include project configuration/secrets.

Startup and New Tab options are off by default and explicitly enabled per Chrome profile. Startup opens or focuses the fixed local Workspace. New Tab redirects only Chrome's New Tab URLs, rechecking the tab before update and preserving typed destinations and `about:blank` application popups. It uses tab events, without an unconditional manifest new-tab override or modification of Chrome's startup policies. Profile startup/restore timing, competing New Tab extensions, and managed browser policies require installed-Chrome validation.

The only added permission is `storage`; host permissions and official Hub origins are unchanged. `chrome.storage.local` stores exactly three boolean flags: `openOnStartup`, `openOnNewTab`, and `showToastNotifications`. Unknown fields, non-booleans, credentials, tokens, tickets, cached shortcuts, and configurable Workspace URLs are rejected. This follows the ticket's stricter security gate over its broader storage examples. Settings messages accept PING, GET_SETTINGS, UPDATE_SETTINGS, and UPDATE_EXTENSION_SETTINGS; updates carry a `settings` object. External messages require an authorized Hub origin/tab; internal settings messages require the extension's own popup URL and identity. A page DOM marker alone never establishes a connection.

The 340px popup shows API and active-tab status, opens/focuses the Workspace, copies its fixed URL, and edits the same three options. It fetches `/api/catalog` with the current authenticated session and `no-store` while open. Only safe HTTPS metadata is rendered, never cached in extension storage. Direct links open their configured destination; services with a vault return to the Workspace for a user-initiated ticket. Missing session/API leaves guidance to open the Workspace. Shortcut loading from the extension origin still needs installed-Chrome cookie/origin verification.

Disabling notifications suppresses only the injected visual toast. Ticket validation, double destination checks, bounded SPA waiting, challenge detection, manual CAPTCHA/2FA, and human form submission remain unchanged. No supplier login or installation success is inferred from synthetic tests.

## Workspace behavior

The five screens are Início, Catálogo, Acessos, Equipe, and Personalização. Home provides task shortcuts, accent/case-insensitive search, private service cards, and a centered company/year footer. Catálogo, Acessos, and Equipe use structured `.hb-table` views and filters. Service creation/editing/deletion, credential writes, and user management use accessible dialogs with Escape dismissal and focus restoration. Account header controls switch the browser-local theme and sign out.

Personalization retains the live brand preview, company name, optional bicolor navbar text, editable header/home copy, one company-logo dropzone with Light/Dark previews, accent RGB/Hex/native inputs, optional text/background colors, explicit save, and JSON import/export. Logo resolution guidance is advisory; existing upload validation checks MIME and size. This slice does not add a second logo, new presets, pixel-dimension rejection, or new contrast enforcement.

The company `GET /api/config` stores branding and legacy example links; `PUT /api/config` now requires admin authentication and uses atomic file replacement. It remains separate from the authenticated private catalog in PostgreSQL. Imported changes remain drafts until saved; failures retain unsaved edits. Exported JSON may contain user-entered data.

## TICKET-016 personal layer and Home modes

The company preset supplies colors, logo, texts, and optional default Home layout and shortcut visibility. Admins edit that preset; attendants edit only personal `themeOverrides`. The web merges inherited settings with changed personal fields. Restoring the company default deletes the entire preference record. Defaults are Grid, visible shortcuts, no custom order, and no theme override unless the company config supplies Home defaults. After a preference row is saved its layout and shortcut values are explicit account values; reset inherits current company defaults again.

`services.owner_user_id` separates global team services from owner-only personal services. Attendants create only personal cards; admins choose global or personal. Global writes require admin, personal writes require the owner, and personal shared-vault services are rejected in the API and database. Catalog, vault list, credential write/reveal, ticket issuance, and exchange exclude other owners' personal services even for admins. Team routes remain admin-only. Migration 005 adds the owner column, constraint/index, and `user_preferences` idempotently under the startup lock.

`services/preferences.ts` and `routes/preferences.ts` implement authenticated GET/partial PUT/DELETE for the current user's preferences. `usePreferences` serializes writes, validates a per-user localStorage cache, retries network-only fallback on online/reload, and keeps other accounts' preferences isolated. `useIdentity` loads the company preset and applies personal branding for attendants. Offline storage is a visual fallback and never grants catalog or credential access.

`HomeServiceViews.tsx` provides Grid, compact List, and paged Carousel while reusing `ServiceCard` actions. Home exposes layout controls, shortcut visibility, category/vault/personal filter pills combined with search, and a polite result count. Grid supports drag/drop and Alt + arrow-key reordering; Carousel supplies previous/next controls and accessible page dots. Browser-wide light/dark theme remains independent.

The extension source and AES-256-GCM primitive are unchanged. Synthetic tests do not establish installed-extension, supplier login, production, or human visual acceptance. Slice C / TICKET-017 is described above; installed-browser validation and deployment remain separate gates.

## TICKET-015 modular boundaries (previous slice)

This behavior-preserving slice extracts existing code without changing HTTP methods/paths, payloads, statuses, Portuguese errors, DOM hierarchy, labels, ARIA, or CSS selectors/declarations.

- `views/IdentityView.tsx` orchestrates `components/identity/{IdentityPreviewBanner,BrandTextSettingsCard,LogoUploadCard,ColorPaletteCard}.tsx`. `IdentityBackupCard` is exported from the palette module and remains in the original first column. State ownership and save controls retain their existing lifetime.
- `components/ModalDialog.tsx` owns initial focus, keyboard trapping, Escape/backdrop dismissal, ARIA, and focus restoration. `modals/ServiceModal.tsx` retains `CatalogEditor` and reexports `ModalDialog` for existing callers. `hooks/useServiceFavicon.ts` owns the extracted logo/favicon state and debounce/manual capture callbacks.
- `theme.css` imports seven responsibility modules under `styles/`: tokens, layout, cards, tables, modals, identity, and responsive. `main.tsx` keeps its existing theme import.
- `routes/catalog.ts` and `routes/vault.ts` retain session/admin checks, payload parsing, rate limits, extension-origin handling, headers, and HTTP response mapping. `services/catalog.ts` owns catalog queries/transactions; `services/vault.ts` owns credential authorization, SQL, crypto integration, auditing, and ticket operations. `services/result.ts` defines expected failures without a Fastify dependency.
- `services/favicon.ts` retains existing public-HTTPS target filtering, reserved test-domain shortcuts, MIME/magic-byte handling, timeouts/size limits, and sequential Google S2/apple-touch/favicon fallbacks. This is an extraction, not additional SSRF hardening or a new security guarantee.

Database initialization, migrations, crypto primitives, seeds, extension files, and existing E2E tests are outside this refactor. Existing SQL text/parameter order, transactions, locks, audit sequencing, and encryption/decryption AAD remain unchanged.

## Security and companion boundaries

The server rechecks role and credential ownership on sensitive operations. Admins manage shared credentials and team accounts; attendants manage their own individual credentials. The UI lists metadata/presence and accepts new credential values for saves; it does not request stored passwords. The existing server reveal API retains its support permissions and audit behavior.

Opening tickets contain 32 random bytes, are stored by SHA-256, expire after 30 seconds, bind user/session/service, and are consumed atomically under a row lock. Exchange rechecks the issuing session and credential owner. Session revocation does not end supplier sessions or alter spreadsheet permissions.

The companion retains confirmed PING/pairing, direct API ticket exchange, API-confirmed HTTPS destination verification in both worker and injected code, bounded SPA form discovery, and assisted filling without submission. CAPTCHA, Turnstile, hCaptcha, and 2FA/OTP remain human steps. DOM presence is only a hint. Synthetic DOM tests and successful builds do not establish installed-extension or supplier behavior.

The API retains defensive response headers and in-memory per-instance sliding limits: 20 login attempts and 30 ticket requests per IP/minute by default, with HTTP 429 and Retry-After. These do not settle production TLS, origin/CSRF policy, distributed rate limiting, key custody/rotation, encrypted backup/restore, or deployment infrastructure.

## Verification and resumption

Use a dedicated synthetic database through DATABASE_URL for API tests and npm run check; the suites write records. Playwright uses tests/e2e/hublink.spec.ts, its own API on 3178, an isolated configuration file, and E2E_DATABASE_URL. The default web port is 5177 and existing servers are refused. Root npm run typecheck includes the actual E2E source; e2e/tsconfig.json does not exist in this checkout. Preserve developer services and use a temporary configuration on a free web port when required.

The required suites contain API 34 tests, extension 17 tests, web 43 tests, and seven Chromium E2E scenarios. Record actual command results and distinguish temporary harness adjustments from repository changes. Compare extracted SQL and synthetic UI DOM/computed styles/screenshots against the base revision for this refactor.

Remaining product gates are human visual acceptance, installed Chrome and authorized supplier pilots, stable production origins/extension distribution, TLS, key custody, encrypted backup/restore, monitoring, and rollout/rollback practice. Consult docs/DECISIONS.md, docs/OPEN_QUESTIONS.md, and docs/PRIVATE_SPEC.md before advancing those gates. A green local check is not a hosted CI run, deployment, or supplier login.

## TICKET-016 local validation

`npm run check` passed with 37 API tests, 17 unchanged extension tests, 50 web tests, zero-warning lint, formatting, typechecks, and workspace builds. The seven existing Playwright E2E scenarios pass with preference reset added to their authenticated setup. Validation used dedicated `hublink_ticket016_test` and `hublink_ticket016_e2e` databases, API 3178, and web 5187 to preserve development ports. A temporary synthetic Chromium scenario checked all three layouts at 390 and 1440 px in both themes, found no document overflow, and verified at least 4.5:1 text contrast on the new layout selectors. Source checksums confirm the extension and AES-256-GCM primitive are unchanged. Browser cache/build artifacts are generated by the required suites. Human visual acceptance, supplier authentication, and deployment are not established.

## TICKET-017 local verification

The full check passes with 38 API tests, 24 extension tests, and 53 web tests, plus typechecking, zero-warning lint, formatting, and builds. Seven existing Chromium E2E scenarios pass separately. Validation uses dedicated `hublink_ticket017_test` and `hublink_ticket017_e2e` databases and temporary API 3178/Web 5187 servers, preserving developer ports. Two additional temporary Chromium scenarios verify the Extension Center/navbar in both themes at 390 and 1440 px, focus restoration, a real authenticated ZIP download, and the compiled 340px popup with synthetic Chrome APIs. Active/missing status buttons and the popup's primary action meet 4.5:1 text contrast in those checks. Python's ZIP reader also validates all six packaged files and CRCs. These proofs do not establish installed-Chrome startup/New Tab behavior, extension-origin cookie availability, or supplier login.
