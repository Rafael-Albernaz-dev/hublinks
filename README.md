# Hublink 🔗🛡️

[![Node.js](https://img.shields.io/badge/node-%3E%3D24-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/react-19-61dafb.svg)](https://react.dev/)
[![Fastify](https://img.shields.io/badge/fastify-5.x-black.svg)](https://fastify.dev/)
[![PostgreSQL](https://img.shields.io/badge/postgresql-16-336791.svg)](https://www.postgresql.org/)
[![Chrome Extension](https://img.shields.io/badge/manifest-v3-orange.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> **Enterprise-grade customizable team access portal and encrypted credential vault.**  
> Centralizes internal dashboards, business spreadsheets, and supplier applications in a brandable workspace with zero-knowledge frontend credential handling, single-use ticket exchange, and a companion Chrome MV3 extension for universal assisted autofill.

---

## 🌟 Highlights & White-Label Customization

- 🎨 **Dynamic White-Label Branding & Two-Layer Personalization:**
  - **Admin Company Preset + User Personal Layer:** Administrators configure the global company preset (`PUT /api/config`), while standard users (`attendant`) inherit that preset and can customize their own personal colors, logo, Home copy, layout mode, shortcut visibility, and card order (`PUT /api/me/preferences`), or reset back to the company preset at any time (`DELETE /api/me/preferences`).
  - Fully customizable organization name, optional bicolor navbar brand text (`brandPrimaryText` / `brandSecondaryText` with independent colors), header tagline, home eyebrow, home title, and subtitle.
  - Brand logo upload with explicit recommended pixel resolution (`256×256 px` or `320×96 px` for company logo; `128×128 px` for service logo) and side-by-side **Light Mode / Dark Mode** live previews.
  - Synchronized `#RRGGBB`, `r, g, b`, and native color pickers for primary accent color, plus optional custom text (`--hb-text`) and background (`--hb-bg`) colors.
  - Responsive Workspace layouts for desktop, tablet, and mobile, with light and dark themes and a clean centered footer (`<Company Name> · <Year>`).

- 🏠 **Flexible Home Organization & Multi-Criteria Filtering:**
  - Switch seamlessly between **Grid** (with native Drag & Drop and `Alt + Arrow` keyboard reordering), **List** (compact horizontal rows), and **Carousel** (paginated slides with accessible dot navigation).
  - Toggle top navigation shortcut cards on or off (`Mostrar atalhos` / `Ocultar atalhos`) and combine instant accent-insensitive search with quick filter pills (`Todos`, `SVA`, `CRM`, `Planilhas`, `Sistemas`, `Outros`, `Compartilhado`, `Individual`, `Pessoais`).

- 📂 **Customizable Service Catalog, Personal Cards & Automatic Favicon Capture:**
  - Organize access cards across categories (`sva`, `crm`, `sheet`, `sistemas`, `outros`) in structured tables with multi-criteria filters (search, category, vault type, credential status).
  - Administrators manage global team services, while every authenticated user can create, edit, and delete their own private personal cards (`scope: 'personal'`, isolated per owner in catalog, vault, and ticket routes).
  - Automatic favicon capture (`GET /api/catalog/favicon?url=...` with SSRF protection) when entering an `https://` service URL, while preserving manual logo upload override (PNG, JPG, WebP up to 500 KB).
  - Comprehensive card creation, editing, and deletion inside accessible modal dialogs (`role="dialog"`, `aria-modal="true"`).

- 🔑 **Dual-Access Architecture:**
  - **Direct Link (No Vault):** Instant one-click access (`noopener, noreferrer`) for internal documentation, Google Sheets, dashboards, and portals requiring no credentials.
  - **Shared Vault:** Encrypted corporate credentials managed centrally by administrators for team-wide tools via dedicated modal workflows.
  - **Individual Vault:** Personal credentials stored and managed on-demand by individual team members directly on card interaction or via the Acessos table.

- 👥 **Team & Permissions Management:**
  - Simplified two-role model in the UI: **Admin** (`admin`) and **Usuário** (`attendant`).
  - Structured user directory with role and account status filters (`Ativo` / `Desativado`), modal-based user creation, role/status editing (`PUT /api/admin/users/:id`), quick activate/deactivate toggle with immediate session revocation, and password reset.

- 🛡️ **Zero-Knowledge Frontend:**
  - Stored supplier passwords are never fetched for display by the web client. Authorized forms accept new credential values only for saving; they do not reveal existing vault passwords.
  - The catalog API sends only visual metadata and a boolean `hasCredential` status for the authenticated user.

- 🧩 **Chrome MV3 Companion Extension, Startup/New Tab Integration & Extension Center:**
  - Interactive **Extension Center** modal in the Workspace header with one-click authenticated `.zip` package download (`GET /api/extension/package`), quick copy actions (`chrome://extensions` and `apps/extension/dist`), live bridge verification, and Chrome startup/New Tab toggles.
  - Optional per-profile **Open Hublink on Chrome Startup** (`chrome.runtime.onStartup`) and **Open Hublink on New Tab** (`chrome.tabs.onCreated` / `onUpdated`) configurable from both the Workspace and the 340px extension toolbar popup.
  - Deterministic extension key producing a permanent ID (`nhodfnpljikjfeoihaimabljdenmfbio`) for zero-configuration local development and strict dual-origin binding (`http://localhost:5177` and `http://127.0.0.1:5177`).
  - Universal assisted autofill: Dispatches native reactive input events for modern SPAs, waits up to 4 seconds for dynamic forms, detects human verification challenges (reCAPTCHA, Cloudflare Turnstile, hCaptcha, 2FA/OTP), and **strictly never auto-submits**.

---

## Company preset and personal user layer (TICKET-016)

Administrators save the global company colors, logo, Home copy, and default Home layout/shortcut visibility through `PUT /api/config`. Reads remain available for the local demo; writes now require an active admin session. Existing configurations without Home defaults use Grid and visible shortcuts. Legacy demo links never populate the authenticated catalog.

Every authenticated user inherits the company preset. A user (`attendant`) can save personal colors, logo, and copy without changing company configuration. Personalization offers **Restaurar padrão da empresa**, which deletes all personal preferences, including layout, shortcut visibility, and card order. Unchanged branding fields continue inheriting the company preset. Admin Personalization edits the company preset; Home controls change that admin's own account preferences.

`GET`, `PUT` (partial updates), and `DELETE /api/me/preferences` operate only on the authenticated account. Layout is `grid`, `list`, or `carousel`; card order accepts at most 100 unique service IDs. Preferences are stored in PostgreSQL and cached under `hublink:preferences:<user-id>` for network failures. Offline changes are retried when the browser reports online or the account reloads; rejected writes are not accepted as offline saves. This cache contains visual preferences only and provides no authorization. The browser-wide light/dark setting remains separate.

Global services have no owner and only admins can mutate them. Personal services belong to their creator and accept individual credentials or direct links, never a shared vault. Attendants always create personal services; admins can select **Pessoal (só para mim)**. Catalog and vault queries exclude other users' personal services, including for administrators. Direct credential and ticket operations enforce the same boundary. Team management remains admin-only. Migration `005_user_personal_layer.sql` runs idempotently at API initialization.

Home filters combine text search with SVA, CRM, spreadsheets, systems, other services, shared/individual vault, or personal scope. Grid retains the initial entry animation; List reuses card actions and safe links; Carousel offers up to three cards per page, previous/next controls, and accessible page dots. Dragging or Alt + arrow keys updates the account's card order. Hidden shortcuts and layout choices persist across browsers through the API.

## Workspace Navigation and Appearance

The authenticated portal follows the approved Workspace design, with five visible destinations:

| Screen         | Purpose                                                                                                                                                              | Access                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Início         | Optional task shortcuts, Grid/List/Carousel, full-label highlighted instant service search, customizable hero texts, private catalog cards, and centered year footer | All authenticated users                                                            |
| Catálogo       | Structured table with category/vault/status filters, automatic favicon capture, Light/Dark logo preview, and global admin CRUD and owner-only personal CRUD          | All users browse team cards and manage their own personal cards                    |
| Acessos        | Structured table with credential type and vault status filters, responsible person, and modal-based credential save/update                                           | Administrators manage shared access; attendants manage their own individual access |
| Equipe         | Structured table with role/status filters (`Admin` / `Usuário`, `Ativo` / `Desativado`) and modal workflows for creation, edit, and reset                            | Administrators only                                                                |
| Personalização | Live brand preview, company name, bicolor navbar text, customizable Home texts, Light/Dark logo dropzone, color pickers, and JSON I/O                                | All users; company preset for admins, personal overrides for users                 |

Search ignores accents and case and matches service names and categories. The result count is announced through a polite live region. Cards offer **Abrir**, **Cadastrar**, or **Configurar** according to the destination, credential status, and user role. Direct links open with `noopener noreferrer`; vault opening retains the confirmed extension bridge, single-use ticket, and manual-login fallback. Passwords are never listed or revealed in Acessos. Team management uses `/api/admin/users` (`GET`, `POST`, `PUT /:id`, and `POST /:id/reset-password`), revoking active sessions immediately when an account is deactivated or has its password reset.

The light and dark themes use the approved CSS tokens and Lucide 1.17.0 SVG geometry at 16 px with a 1.6 stroke. Icon buttons beside the account in the header switch the theme and sign out. The theme choice remains browser-local under `hublink-theme`; system preference supplies the initial theme when no choice is saved. A chosen brand color updates the Workspace accent, selected surfaces, focus outlines, actions, and identity preview immediately. Optional text and background colors override `--hb-text` and `--hb-bg` when configured.

Home offers optional task shortcuts, Grid, List, and paged Carousel views. Grid cards support drag and drop and Alt + arrow-key reordering; filters combine search with category, vault type, or personal scope. Grid uses three service columns on desktop. At 780 px and below, both Home grids use two columns. Catálogo, Acessos, and Equipe render structured `<table class="hb-table">` views with dedicated columns and filter toolbars, while administrative actions open accessible modal dialogs (`role="dialog"`, `aria-modal="true"`) with Escape key dismissal and focus restoration.

---

## 🏛️ System Architecture

```mermaid
flowchart TD
    User([👤 Attendant / Team Member])
    WebUI["💻 Hublink Web Portal (React 19 + Vite)"]
    API["⚡ Hublink API (Fastify :3177)"]
    DB[("🐘 PostgreSQL (AES-256 Vault)")]
    Ext["🧩 Chrome MV3 Extension (Background Worker)"]
    TargetApp["🌐 Supplier Portal / Web App"]

    User -->|1. Opens portal & clicks card| WebUI
    WebUI -->|2. Request single-use ticket (TTL 30s)| API
    API -->|3. Issues hashed bearer token| WebUI
    WebUI -->|4. Dispatches token via external messaging| Ext
    Ext -->|5. POST /api/vault/exchange| API
    API -->|6. Atomically burns ticket under row lock| DB
    API -->|7. Returns transient credential to memory| Ext
    Ext -->|8. Verifies tab destination & injects autofill| TargetApp
    TargetApp -.->|9. Human solves challenge & submits form| User
```

---

## Web Client Architecture

`apps/web/src/App.tsx` composes the session gate, shell, views, and dialogs. The frontend uses React 19 hooks without an additional state-management dependency:

- `views/`: Home, Catalog, Access, Team, Personalization (`IdentityView`), and Login presentation.
- `components/`: header, navigation, service cards, shared search, and the accessible `ModalDialog` primitive. `components/identity/` contains the live preview, brand text settings, reusable logo upload card, and palette/JSON backup cards; `IdentityView` retains their original layout and save controls.
- `modals/`: accessible modal dialogs for the service editor (`CatalogEditor` with automatic favicon capture and Light/Dark logo preview), service deletion confirmation, shared/individual credential management, extension installation guidance, user creation/editing (`AttendantForm`), and password reset (`ResetPasswordForm`).
- `hooks/`: authentication, catalog CRUD, vault writes and ticket issuance, extension messaging, team administration, personalization drafts/import/export, browser-local theme, and `useServiceFavicon` for the existing debounced/manual favicon capture state. Dedicated hooks preserve dialog focus, session cleanup, and one-time catalog animation.
- `icons/`: typed Lucide 1.17.0 SVG components with the original geometry and license notices.
- `types/`: shared metadata types and the callbacks coordinating catalog refreshes, vault refreshes, and extension opening.
- `styles/`: `tokens.css`, `layout.css`, `cards.css`, `tables.css`, `modals.css`, `identity.css`, and `responsive.css`. The seven-import `theme.css` manifest remains the entry point from `main.tsx`; selectors, declarations, and effective cascade are preserved.

`useWorkspaceState` owns transient state and refs for the mounted workspace. Domain hooks receive typed subsets of that state; `useWorkspace` composes their operations and coordinates refresh callbacks. State survives screen navigation, and the existing session-loss cleanup clears sensitive form values. `useTheme` owns its independent browser preference. `useIdentity` merges the company preset with personal overrides for users, while `usePreferences` synchronizes account preferences and a per-user offline cache. Authenticated `/api/catalog` operations remain in `useCatalog`.

Run `npm run test -w @hublink/web` for the frontend tests and `npm run check` for all workspace checks and builds. API tests write synthetic records: select a dedicated local test database with `DATABASE_URL` before running the full check. Component tests and builds establish local behavior; human visual acceptance, installed-extension validation, and supplier authentication remain separate gates.

---

## 🛡️ Enterprise Security Model

| Layer                 | Security Control                              | Technical Implementation                                                                                         |
| --------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Vault at Rest**     | AES-256-GCM authenticated encryption          | 32-byte master key with random 96-bit IV and AAD bound to `service_id`, `owner_id`, and `key_version`.           |
| **Session Security**  | Rolling HttpOnly sessions with scrypt hashing | SameSite=Lax cookies, 365-day rolling expiration, password-reset session revocation.                             |
| **Ticket Exchange**   | Single-use ephemeral bearer tokens            | 32-byte cryptographically random tokens (TTL 30s) burned atomically via `SELECT ... FOR UPDATE`.                 |
| **Extension Sandbox** | Origin and destination validation             | Origin-restricted messaging, tab URL verification before injection, and second location check in content script. |
| **Autofill Guard**    | Human-in-the-loop verification                | Fills fields via native DOM property setters and bubbling events; halts on CAPTCHA/2FA and never clicks submit.  |

---

## 🚀 Quick Start

### 1. Prerequisites

- **Node.js** 24+ and **npm**
- **Docker** and **Docker Compose**
- Ports: `3177` (API), `5177` (Web Vite), `5439` (PostgreSQL)

### 2. Install & Start Database

```bash
# Clone the repository
git clone https://github.com/Rafael-Albernaz-dev/hublinks.git
cd hublinks

# Install workspace dependencies
npm ci

# Start local PostgreSQL database container
docker compose up -d postgres
```

### 3. Run Quality Check & Start Development Servers

```bash
# Verify all quality gates (Typecheck, Lint, Tests, Builds)
npm run check

# Terminal 1: Start Fastify API server (:3177)
npm run dev:api

# Terminal 2: Start React Web portal (:5177)
npm run dev:web
```

Open `http://localhost:5177` or `http://127.0.0.1:5177` in Google Chrome.

---

## Phase 2 — Slice C / TICKET-017

The Extension Center in the Workspace header replaces the passive installation dialog. It downloads an authenticated ZIP, provides copy actions for `chrome://extensions` and the repository-relative `apps/extension/dist` path, explains extraction and Load unpacked, checks the actual extension bridge, and exposes startup, New Tab, and fill-notification options. The relative source path is a development convenience; downloaded ZIP users select their extracted folder. Manual destination opening remains available when launched from a service. Browser-wide theme, extension options, and sign-out controls have distinct surfaces, visible focus, and state indicators; attention animation respects reduced motion.

Build first with `npm run build`. `GET /api/extension/package` requires an active session and returns `hublink-chrome-extension.zip` with `Cache-Control: no-store`. The deterministic in-memory ZIP Store writer uses native Node CRC32 and includes only manifest.json, background.js, autofill.js, content.js, popup.html, and popup.js from the compiled extension. Missing artifacts return 503 with build guidance; static-only files cannot form an installable package. Runtime API requests never compile source or include project configuration/secrets.

Startup and New Tab options are off by default and explicitly enabled per Chrome profile. Startup opens or focuses the fixed local Workspace. New Tab redirects only Chrome's New Tab URLs, rechecking the tab before update and preserving typed destinations and `about:blank` application popups. It uses tab events, without an unconditional manifest new-tab override or modification of Chrome's startup policies. Profile startup/restore timing, competing New Tab extensions, and managed browser policies require installed-Chrome validation.

The only added permission is `storage`; host permissions and official Hub origins are unchanged. `chrome.storage.local` stores exactly three boolean flags: `openOnStartup`, `openOnNewTab`, and `showToastNotifications`. Unknown fields, non-booleans, credentials, tokens, tickets, cached shortcuts, and configurable Workspace URLs are rejected. This follows the ticket's stricter security gate over its broader storage examples. Settings messages accept PING, GET_SETTINGS, UPDATE_SETTINGS, and UPDATE_EXTENSION_SETTINGS; updates carry a `settings` object. External messages require an authorized Hub origin/tab; internal settings messages require the extension's own popup URL and identity. A page DOM marker alone never establishes a connection.

The 340px popup shows API and active-tab status, opens/focuses the Workspace, copies its fixed URL, and edits the same three options. It fetches `/api/catalog` with the current authenticated session and `no-store` while open. Only safe HTTPS metadata is rendered, never cached in extension storage. Direct links open their configured destination; services with a vault return to the Workspace for a user-initiated ticket. Missing session/API leaves guidance to open the Workspace. Shortcut loading from the extension origin still needs installed-Chrome cookie/origin verification.

Disabling notifications suppresses only the injected visual toast. Ticket validation, double destination checks, bounded SPA waiting, challenge detection, manual CAPTCHA/2FA, and human form submission remain unchanged. No supplier login or installation success is inferred from synthetic tests.

## 🧩 Chrome MV3 Extension Setup

1. **Build the extension package:**
   ```bash
   npm run build
   ```
2. In Google Chrome, navigate to `chrome://extensions`.
3. Enable **Developer mode** using the toggle in the upper-right corner.
4. Click **Load unpacked** and select the directory:
   ```
   apps/extension/dist
   ```
5. The extension will automatically load with the deterministic ID:
   ```
   nhodfnpljikjfeoihaimabljdenmfbio
   ```
6. Return to Hublink (`http://localhost:5177`) and use **Verificar conexão agora** in the Extension Center. A successful PING turns the status badge active. Alternatively, after the build, download the ZIP from that Center, extract it, and load the extracted folder. Reload the extension after updating its files.

---

## ⚙️ Environment Configuration

Environment variables can be set directly or placed in a `.env` file (see `.env.example`):

| Variable                 | Default Value                                                      | Description                                                  |
| ------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| `HUB_API_PORT`           | `3177`                                                             | Port for the Fastify API server.                             |
| `DATABASE_URL`           | `postgresql://hublink:hublink_dev_password@127.0.0.1:5439/hublink` | PostgreSQL connection string.                                |
| `VAULT_MASTER_KEY`       | _(Dev fallback)_                                                   | 32-byte hex key (64 chars) for AES-256-GCM encryption.       |
| `INITIAL_ADMIN_EMAIL`    | _(Configurable)_                                                   | Initial administrator email provisioned on first startup.    |
| `INITIAL_ADMIN_PASSWORD` | _(Configurable)_                                                   | Initial administrator password provisioned on first startup. |
| `HUB_EXTENSION_ID`       | `nhodfnpljikjfeoihaimabljdenmfbio`                                 | Chrome extension ID for message origin validation.           |

---

## API Modules, Security, and Companion Status

ARCH-013 stage 2 keeps `createServer(configPath?, pool?, options?)` compatible and makes `server.ts` the lifecycle orchestrator. `types/` holds contracts, `validators/` retains input/configuration validation, `services/` owns session, audit, and security helpers, and `routes/{auth,admin,catalog,vault,config}.ts` registers endpoints. TICKET-015 moves catalog reads and transactions into `services/catalog.ts`, vault ownership checks/SQL/crypto/ticket operations into `services/vault.ts`, and favicon discovery into `services/favicon.ts`. Thin catalog/vault controllers retain session and input validation, HTTP status mapping, rate limits, headers, and extension CORS. Expected service failures use a typed `ServiceResult`; services do not depend on Fastify request/reply objects. Database initialization, explicit transactions and locks, encryption AAD, session revocation, and atomic configuration writes retain their existing contracts.

Every API response receives `nosniff`, frame denial, no-referrer, same-origin opener/resource policies, disabled camera/microphone/geolocation, and CSP `default-src 'none'; frame-ancestors 'none'; base-uri 'none'`. These headers apply to the JSON API; the Vite frontend is served separately. Login permits 20 attempts per IP per sliding 60-second window; ticket issuance permits 30. Excess attempts receive HTTP 429, `Retry-After` in seconds, and a generic error. Limits are in memory per server instance, reset on restart, and do not coordinate across processes. Expired entries are pruned on subsequent attempts. Tests can override either budget with the optional `loginRateLimit` and `ticketRateLimit` server options (`max`, `windowMs`). This local hardening does not settle remote exposure, CSRF policy, or production infrastructure.

EXT-015 waits up to four seconds for a unique usable SPA login form, rechecking the authorized destination before every filling attempt. A dismissible accessible toast asks the operator to review the fields, complete any human challenge, and submit manually. It never includes credential values. The toolbar popup checks the local API `/health`, describes the active tab, and opens or focuses the local Workspace. It does not fetch account details or vault data. Reload the unpacked extension after `npm run build` to load the new `popup.js` bundle; permissions and the deterministic manifest key are unchanged. Synthetic DOM tests do not prove installed Chrome or supplier behavior.

The GitHub Actions `verify` job uses Node 24 and PostgreSQL 16 with synthetic test-only settings to run `npm ci` and `npm run check`. `VAULT_MASTER_KEY` is the actual vault runtime setting; CI also supplies the ticket's `HUB_MASTER_KEY` alias, which the vault does not read. Playwright remains a separate `npm run test:e2e` command: it starts its own API on 3178 and web on 5177, refuses existing servers, and uses `E2E_DATABASE_URL` (default database `hublink_e2e`). Use a dedicated test database for `DATABASE_URL` when running API tests. The seven Workspace scenarios cover navigation, identity and logo persistence, service dialog Escape/focus restoration, desktop/mobile layout, export, logout, and password-reset revocation. The existing E2E source is `tests/e2e/hublink.spec.ts` and is included by `npm run typecheck`; this checkout has no `e2e/tsconfig.json`. If development servers occupy the configured ports, use a temporary Playwright configuration with a free web port and dedicated database instead of stopping those servers.

## 🧪 Testing & Quality Gates

Hublink enforces comprehensive automated quality gates across all workspaces:

```bash
# Run full automated quality check
npm run check

# Individual workspace test suites
npm run test -w @hublink/api          # Fastify routes, auth, vault encryption
npm run test -w @hublink/extension    # Assisted autofill and DOM tests
npm run test -w @hublink/web          # Workspace, accessibility, and modal workflows

# TypeScript typechecking & linting
npm run typecheck
npm run lint
npm run format:check

# End-to-end browser scenarios (Playwright)
npx playwright install chromium
npm run test:e2e
```

---

## 📁 Project Structure

```
hublink/
├── apps/
│   ├── api/          # Fastify backend, PostgreSQL pool, scrypt auth, AES-256-GCM vault
│   │   ├── migrations/   # Incremental SQL migrations (001–005)
│   │   └── src/          # types/, validators/, services/, routes/, auth, vault, lifecycle
│   ├── web/          # React 19 + Vite Workspace, five task screens, responsive modals
│   │   └── src/          # views/, components/identity/, modals/, hooks/, styles/, theme.css
│   └── extension/    # Chrome MV3 companion extension
│       ├── static/       # Manifest V3 (deterministic RSA key) & popup UI
│       └── src/          # content.ts, background.ts, autofill.ts, popup.ts, settings.ts, workspace.ts
├── docs/             # Technical architecture, decisions, context, and roadmap
└── tests/e2e/        # Isolated Playwright end-to-end test scenarios
```

---

## 🔒 Privacy & Guidelines

- **Zero Operational Secrets:** This repository contains no production credentials, client data, or vendor-specific links.
- **Human-in-the-Loop:** Autofill never performs automated form submission. CAPTCHAs, Turnstile, and 2FA are explicitly delegated to human operators.
- **Session Boundary:** Revoking a Hublink session immediately invalidates ticket issuance, without attempting to invalidate independent external vendor sessions.

## TICKET-017 local verification

The full check passes with 38 API tests, 24 extension tests, and 53 web tests, plus typechecking, zero-warning lint, formatting, and builds. Seven existing Chromium E2E scenarios pass separately. Validation uses dedicated `hublink_ticket017_test` and `hublink_ticket017_e2e` databases and temporary API 3178/Web 5187 servers, preserving developer ports. Two additional temporary Chromium scenarios verify the Extension Center/navbar in both themes at 390 and 1440 px, focus restoration, a real authenticated ZIP download, and the compiled 340px popup with synthetic Chrome APIs. Active/missing status buttons and the popup's primary action meet 4.5:1 text contrast in those checks. Python's ZIP reader also validates all six packaged files and CRCs. These proofs do not establish installed-Chrome startup/New Tab behavior, extension-origin cookie availability, or supplier login.
