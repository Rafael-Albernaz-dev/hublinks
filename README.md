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

- 🎨 **Dynamic White-Label Branding:**
  - Fully customizable organization name, subtitle, and brand logo upload.
  - Brand color picker with a live identity preview and explicit saving to the local configuration API.
  - Responsive Workspace layouts for desktop, tablet, and mobile, with light and dark themes.

- 📂 **Customizable Service Catalog:**
  - Organize access cards across flexible categories (_CRM, ERP, Financial, Communication, Tools, Other_).
  - Custom per-service titles, descriptions, icons/logos (PNG, JPG, WebP up to 500 KB), and validated HTTPS target URLs.
  - Comprehensive card management directly within the authenticated admin interface.

- 🔑 **Dual-Access Architecture:**
  - **Direct Link (No Vault):** Instant one-click access (`noopener, noreferrer`) for internal documentation, Google Sheets, dashboards, and portals requiring no credentials.
  - **Shared Vault:** Encrypted corporate credentials managed centrally by administrators for team-wide tools.
  - **Individual Vault:** Personal credentials stored and managed on-demand by individual team members directly on card interaction.

- 🛡️ **Zero-Knowledge Frontend:**
  - Stored supplier passwords are never fetched for display by the web client. Authorized forms accept new credential values only for saving; they do not reveal existing vault passwords.
  - The catalog API sends only visual metadata and a boolean `hasCredential` status for the authenticated user.

- 🧩 **Chrome MV3 Companion Extension:**
  - Instant DOM detection via content-script marker (`data-hublink-extension="active"`).
  - Deterministic extension key producing a permanent ID (`nhodfnpljikjfeoihaimabljdenmfbio`) for zero-configuration local development.
  - Strict dual-origin binding (`http://localhost:5177` and `http://127.0.0.1:5177`).
  - Universal assisted autofill: Dispatches native reactive input events for modern SPAs, detects human verification challenges (reCAPTCHA, Cloudflare Turnstile, hCaptcha, 2FA/OTP), and **strictly never auto-submits**.

---

## Workspace Navigation and Appearance

The authenticated portal follows the approved Workspace design, with five visible destinations:

| Screen     | Purpose                                                                                                       | Access                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Início     | Four task shortcuts, instant service search, and private catalog cards                                        | All authenticated users                                                            |
| Catálogo   | Dedicated searchable management list with destination, category, vault status, and administrator forms        | All users can browse; only administrators manage cards                             |
| Acessos    | Credential status and responsible person, with authorized save/update forms                                   | Administrators manage shared access; attendants manage their own individual access |
| Equipe     | Administrator/attendant listing, attendant creation, and attendant password reset                             | Administrators only                                                                |
| Identidade | Live brand preview, company name, subtitle, logo dropzone, synchronized hex/RGB color, and JSON import/export | Administrators only                                                                |

Search ignores accents and case and matches service names and categories. The result count is announced through a polite live region. Cards offer **Abrir**, **Cadastrar**, or **Configurar** according to the destination, credential status, and user role. Direct links open with `noopener noreferrer`; vault opening retains the confirmed extension bridge, single-use ticket, and manual-login fallback. Passwords are never listed or revealed in Acessos. Team management continues to use the existing `/api/admin/users` routes; this interface adds no administrator-provisioning endpoint.

The light and dark themes use the approved CSS tokens and Lucide 1.17.0 SVG geometry at 16 px with a 1.6 stroke. Icon buttons beside the account in the header switch the theme and sign out. The theme choice remains browser-local under `hublink-theme`; system preference supplies the initial theme when no choice is saved. A chosen brand color updates the Workspace accent, selected surfaces, focus outlines, actions, and identity preview immediately. The purple Workspace accent remains the default. The legacy blue `DEFAULT_CONFIG.color` is treated as an uncustomized default in this frontend; an explicit color choice can be saved through the existing configuration API.

Home displays four shortcuts and three service columns on desktop. At 780 px and below, both Home grids use two columns. Catálogo has a separate searchable management list and administrator actions; it does not render the Home card grid. At 560 px and below, the five navigation destinations stay in one row with icons above labels, the search field is at least 46 px tall, and main touch targets are at least 44 px. Cards enter once per initial catalog load (220 ms, 35 ms stagger capped at five steps); filtering and navigation do not replay the animation. Reduced-motion preference disables entry animation, transitions, and transforms.

The Home introduction displays the current identity subtitle, with the approved sentence as its empty-text fallback. Identity provides a logo preview/dropzone with PNG, JPG, or WebP upload (up to 1 MB) and removal, plus synchronized `#RRGGBB`, `r, g, b` / `rgb(r, g, b)`, and native color inputs. Invalid color text stays in its field until corrected or blurred and does not change the accent. **Restaurar roxo padrão** selects `#7137D1`. Identity edits and imported JSON remain drafts until **Salvar alterações**. `/api/config` retains its existing local public-demo boundary; JSON links do not publish private catalog cards. An unavailable configuration API blocks identity editing. Private cards still come from authenticated `/api/catalog`, and server authorization remains authoritative for every sensitive operation.

Browser validation uses isolated synthetic API responses, including both themes at 320, 390, 560, 561, 780, 781, 1024, and 1440 px. This establishes local layout behavior; it does not establish installed-extension, supplier-login, production, or human visual acceptance.

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
6. Return to Hublink (`http://localhost:5177`). The extension status badge in the header will immediately turn active.

---

## ⚙️ Environment Configuration

Environment variables can be set directly or placed in a `.env` file (see `.env.example`):

| Variable                 | Default Value                                           | Description                                                  |
| ------------------------ | ------------------------------------------------------- | ------------------------------------------------------------ |
| `HUB_API_PORT`           | `3177`                                                  | Port for the Fastify API server.                             |
| `DATABASE_URL`           | `postgresql://postgres:postgres@127.0.0.1:5439/hublink` | PostgreSQL connection string.                                |
| `VAULT_MASTER_KEY`       | _(Dev fallback)_                                        | 32-byte hex key (64 chars) for AES-256-GCM encryption.       |
| `INITIAL_ADMIN_EMAIL`    | _(Configurable)_                                        | Initial administrator email provisioned on first startup.    |
| `INITIAL_ADMIN_PASSWORD` | _(Configurable)_                                        | Initial administrator password provisioned on first startup. |
| `HUB_EXTENSION_ID`       | `nhodfnpljikjfeoihaimabljdenmfbio`                      | Chrome extension ID for message origin validation.           |

---

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
│   │   ├── migrations/   # Incremental SQL migrations (001_initial, 002_categories, 003_metadata)
│   │   └── src/          # API routes, auth, vault encryption, server lifecycle
│   ├── web/          # React 19 + Vite Workspace, five task screens, responsive modals
│   │   └── src/          # App component, private catalog, dedicated task screens, theme.css
│   └── extension/    # Chrome MV3 companion extension
│       ├── static/       # Manifest V3 (deterministic RSA key) & popup UI
│       └── src/          # content.ts presence marker, background.ts bridge, autofill.ts
├── docs/             # Technical architecture, decisions, and roadmap
└── tests/e2e/        # Isolated Playwright end-to-end test scenarios
```

---

## 🔒 Privacy & Guidelines

- **Zero Operational Secrets:** This repository contains no production credentials, client data, or vendor-specific links.
- **Human-in-the-Loop:** Autofill never performs automated form submission. CAPTCHAs, Turnstile, and 2FA are explicitly delegated to human operators.
- **Session Boundary:** Revoking a Hublink session immediately invalidates ticket issuance, without attempting to invalidate independent external vendor sessions.
