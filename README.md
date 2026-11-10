# Hublink

[![Node Version](https://img.shields.io/badge/node-24.x-green.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![CI](https://github.com/Rafael-Albernaz-dev/hublinks/actions/workflows/ci.yml/badge.svg)](https://github.com/Rafael-Albernaz-dev/hublinks/actions)

**A customizable team portal with personal links, an encrypted credential vault and a Chrome extension for assisted sign-in.** Teams open their tools from one searchable Workspace. Administrators curate a shared catalog. Each user keeps private cards, a personal agenda and individual credentials. The extension fills supplier sign-in forms after a user click, and you always submit them yourself.

---

## Contents

- [Why Hublink](#why-hublink)
- [Features](#features)
- [Local setup](#local-setup)
- [Workspace and access](#workspace-and-access)
- [Chrome extension](#chrome-extension)
- [Configuration](#configuration)
- [Deployment and recovery](#deployment-and-recovery)
- [Safety model](#safety-model)
- [Architecture](#architecture)
- [Development](#development)
- [Roadmap](#roadmap)
- [License](#license)

---

## Why Hublink

Support and operations teams juggle dozens of supplier portals, each with its own address and credentials. Hublink puts them behind one authenticated Workspace. Shared passwords stay out of spreadsheets and chat, and opening a tool is one click.

Principles:

- **The server decides.** Catalog, URLs and vault access come from an authenticated API that rechecks authorization on every operation. Hiding a card in React is never treated as access control.
- **Humans stay in the loop.** The extension fills forms but never clicks **Next** or submits. CAPTCHA and 2FA remain human steps.
- **Least exposure.** The web client never lists passwords. Credentials travel only through a 30-second, single-use ticket to the bound extension, and only to the verified destination.

---

## Features

- **Workspace:** searchable cards, category filters, five display modes, and keyboard or drag-and-drop ordering.
- **Personal agenda:** private three-column Kanban board (To Do, In Progress, Done) with auto-save on blur, per-column quick entry, and strict account isolation.
- **Personal links:** save an HTTPS page from the extension or create a card in the portal. Personal cards are visible only to their owner.
- **Team catalog:** administrators manage shared cards; users manage their own cards and individual credentials.
- **Standalone and shared vault:** store credentials for arbitrary external services without catalog clutter, with quick-copy actions for usernames and passwords directly inside management modals.
- **Branding:** company colors, logo, and Home text, with personal overrides and light/dark themes.
- **Accounts:** profile editing, avatars, password changes, user administration, and administrator-only audit history.
- **Chrome extension:** quick links, optional startup/New Tab integration, and assisted autofill without automatic submission.
- **Operations:** Docker packaging, encrypted backups, restore tooling, and isolated installations per client.

---

## Local setup

Requirements: **Node.js 24**, npm, Docker Compose, and Chrome for the extension. Default ports are `5177` (web), `3177` (API), and `5439` (PostgreSQL).

```bash
npm ci
cp .env.example .env
docker compose up -d postgres
```

Start each server in a separate terminal:

```bash
npm run dev:api
```

```bash
npm run dev:web
```

Open [the Workspace](http://127.0.0.1:5177). The API binds to loopback by default.

On first boot, the API creates an administrator. Local defaults are `admin@hublink.local` / `admin123456`; set `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` before first boot to override them. Changing these variables later does not reset an existing account.

---

## Workspace and access

The Workspace interface text is in Portuguese.

| Area           | Available actions                                                                             |
| :------------- | :-------------------------------------------------------------------------------------------- |
| Início         | Search, filter, open, and reorder cards; choose Grid, List, Carousel, Compact, or Sections.   |
| Agenda         | Manage private Kanban cards (To Do, In Progress, Done) with automatic save on blur.           |
| Catálogo       | Manage personal cards; administrators also manage team cards.                                 |
| Acessos        | Save individual or standalone credentials with quick copy; administrators manage shared ones. |
| Equipe         | Administrators create, edit, deactivate, and reset user accounts.                             |
| Auditoria      | Administrators browse and filter recorded events.                                             |
| Personalização | Edit company branding as an administrator or personal overrides as a user.                    |
| Meu Perfil     | Update your name, email, avatar, or password from the account menu.                           |

- **Cards and vault.** Personal cards remain private, even from other administrators. Direct links open without the vault. Vault cards use the extension, and the web client never lists passwords. CAPTCHA, 2FA and form submission remain manual.
- **Sign-in screen.** It uses the Hublink icon and the Workspace's typography, colors and panel styling. It follows the browser's saved light/dark theme and adapts to narrow screens. Browser icons use the same mark in SVG, multi-size ICO, 32 px PNG and a 180 px Apple touch icon, with versioned URLs that refresh previously cached failures.
- **Profile and sessions.** Changing your email or password requires your current password. The API revokes all previous sessions and their opening tickets, then issues a new session for the current browser. Other browsers must sign in again. Ordinary profile edits retain the current session.
- **Branding.** Changes require an explicit save. **Restaurar padrão Hublink** resets name, texts, logo and colors to the Hublink defaults and saves them immediately, after an in-app confirmation; saved links and the Home layout are kept. **Restaurar roxo padrão** resets the accent, text, background and two-part wordmark colors in the editor until you save. Resetting personal preferences restores the company defaults.
- **Preferences.** Account layout and order preferences synchronize through the API; the light/dark theme stays local to the browser. An offline preference cache grants no catalog or credential access. JSON exports can contain user-entered data.

---

## Chrome extension

```bash
npm run build
```

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select `apps/extension/dist`.
3. Open the Workspace's Extension Center and select **Verificar conexão agora**.

The Extension Center also offers an authenticated ZIP download after the build. Extract it before loading. Reload the extension after rebuilding.

**Origin binding.** The extension ID is `nhodfnpljikjfeoihaimabljdenmfbio`. Default builds use Workspace origins `http://127.0.0.1:5177` and `http://localhost:5177`, with API `http://127.0.0.1:3177`. For a deployed installation, set `HUB_EXTENSION_ORIGIN` at build time to one exact HTTPS origin without a trailing slash. The compiled worker, popup, page saving, content script and external-message allowlist then use only that origin, and the extension ID stays the same. Changing the runtime API configuration alone does not rebuild the extension; reload the unpacked extension after replacing its files.

**Opening a service.** Startup and New Tab options are off by default and apply per Chrome profile. Both Workspace cards and popup shortcuts fill the catalog credential automatically after a user click. The popup rechecks the authenticated catalog, requests a fresh session-bound ticket, and uses the same destination verification and credential exchange as the Workspace. Links without credentials open directly. A missing or expired Hub session requires signing in again, and an individual credential must be saved in the Workspace before it can be used.

### Automatic filling

- **Supported layouts:** native forms, nested div fields, ARIA forms, email or phone/CPF identifiers, controls associated with a form from outside it, revealed current-password fields, and open Shadow DOM. Separate registration forms and hidden controls do not prevent recognition of one unambiguous login.
- **Delayed and two-step forms:** delayed forms are observed for up to ten seconds. A two-step SPA can receive the username first and the password after you advance within that window; changing the username stops the attempt.
- **Manual login required:** full-page navigation between steps, cross-origin frames, closed shadow roots, ambiguous forms and unexpected redirects. A site that already has an authenticated session may not show a login form; opening a card does not log out or switch the external account.
- **You submit:** the extension never clicks Next or submits a form. Review the filled fields and click **Entrar** yourself. The Workspace reports the actual filling result. Access failures appear inline; the Extension Center opens only when you select it from the header or account menu.

### Save a page

1. Open an HTTPS page and click the extension.
2. Select **Salvar no Hublink**.
3. Review the name, full address, and category, then select **Salvar link**.

- The result is a personal card without a vault, including for administrators. Category defaults to **Outros**. Favicon capture is optional and does not block saving when unavailable. Review addresses for sensitive parameters before confirming.
- An identical URL in your personal cards triggers a duplicate warning. Different paths, query strings and fragments remain distinct. **Ver no Hublink** opens a fresh Workspace tab; existing tabs show the card after reload.
- Saving requires an active Hub session and a reachable API. Errors keep the draft while the popup stays open; closing it discards the draft. After an uncertain network response, check the Workspace before retrying. Browser bookmarks and history are not synchronized, and page metadata is not saved in extension storage.

**Optional Web Store link.** Set `VITE_CHROME_WEBSTORE_URL` before starting or building the web app to show a published listing in the Extension Center. Missing or invalid values keep the ZIP installation flow. This setting does not publish the extension or change its origin binding.

---

## Configuration

See [.env.example](.env.example) for the full list. Export variables before starting the development servers; production Compose uses the explicit environment file described in [Deployment and recovery](#deployment-and-recovery).

| Variable                                         | Purpose                                                                             |
| :----------------------------------------------- | :---------------------------------------------------------------------------------- |
| `DATABASE_URL`                                   | PostgreSQL connection. Required, no fallback; `dev:api` reads it from `.env`.       |
| `HUB_API_PORT` / `HUB_DB_PORT`                   | Local API and development database ports.                                           |
| `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` | Administrator identity on first boot.                                               |
| `VAULT_MASTER_KEY`                               | Vault key: 32 bytes, normally encoded as 64 hex characters. Required in production. |
| `HUB_EXTENSION_ID`                               | Exact extension ID used for browser-origin validation.                              |
| `HUB_CLIENT_ORIGINS`                             | Exact comma-separated web origins allowed by the API.                               |
| `HUB_API_HOST` / `HUB_TRUST_PROXY`               | API binding and proxy trust; enable trust only behind the configured trusted proxy. |

The vault has a development-only key fallback. Protect and retain a unique runtime key before using real credentials; losing it makes vault backups unreadable.

---

## Deployment and recovery

Production uses `docker-compose.prod.yml`. Only the web entry is published, on `127.0.0.1:8080` by default; API and PostgreSQL stay on the private container network. A host-managed TLS gateway must overwrite forwarded client and protocol headers. Production sessions require HTTPS.

1. Prepare a private `.env.production` from `.env.example` with unique database and vault secrets, explicit administrator credentials and exact HTTPS client origins. Protect it with mode `0600`. Make the configured data directory writable by the API container's UID/GID `1000`.
2. Set `HUB_EXTENSION_ORIGIN` to the same official HTTPS origin as `HUB_CLIENT_ORIGINS` before building the production API image. Compose passes this non-secret build argument to the packaged extension. A local production-origin build can also use `HUB_EXTENSION_ORIGIN=https://hub.example.com npm run build -w @hublink/extension`. The value must be an exact HTTPS origin; paths, credentials, wildcards, query strings and fragments are rejected. Preserve the unpacked extension's key and ID; no Web Store distribution is implied.
3. Build and start:

```bash
export HUB_RUNTIME_ENV_FILE=.env.production
docker compose --env-file "$HUB_RUNTIME_ENV_FILE" -f docker-compose.prod.yml build
docker compose --env-file "$HUB_RUNTIME_ENV_FILE" -f docker-compose.prod.yml up -d --no-build --wait
```

- **Releases.** Use immutable image tags and keep the previous images and vault key. Deployments are started by the operator; CI runs checks and never deploys automatically. Validate browser HTTPS sessions and installed-extension behavior after each deployment.
- **Backup and restore.** `scripts/backup.sh` and `scripts/restore.sh` require private runtime secrets, a separate backup passphrase and a maintenance window. Restore replaces the selected project's data, and the PostgreSQL and config-file replacements are not one atomic transaction. Follow the operator's private recovery and rollback playbook.
- **Per-client installations.** `scripts/provision-tenant.sh` generates a separate client's protected configuration and secrets without starting containers. Review its domain, ports, storage permissions and capacity before starting that installation. TLS, off-host retention, monitoring and recovery rehearsals remain operator responsibilities.

---

## Safety model

- **Authentication everywhere.** Every configuration read requires authentication, including `GET /api/config`, and configuration writes require an administrator. This closed the legacy anonymous JSON endpoint, which could include saved links. All API responses use `Cache-Control: no-store`.
- **Sessions and passwords.** Sessions use opaque HttpOnly cookies with a 365-day rolling inactivity expiry. Hub passwords use scrypt. Login, profile and session responses expose only public account fields, never Hub passwords or hashes.
- **Vault.** Records use AES-256-GCM with a runtime key, and vault listings expose metadata only. A separate reveal API lets an administrator reveal shared credentials and a user reveal their own individual credentials. React does not call it.
- **Opening tickets.** Tickets expire after 30 seconds and can be used once. The server rechecks authorization. The extension verifies the loaded tab against the API-confirmed destination, and the content script checks its own location again before receiving credentials.
- **Extension origin.** Only the bound extension origin gets credentialed access to the catalog GET, `POST /api/extension/bookmarks` and `POST /api/vault/tickets` (and their preflights). Page saving accepts only name, category and an HTTPS URL; the server forces personal ownership and no vault.
- **Favicon discovery.** The server contacts only the destination origin, plus HTTPS hosts it redirects to or declares in its HTML; hostnames are never sent to a third-party favicon service.
  - It reads up to 256 KB of the home page for `<link rel="icon">` and `apple-touch-icon` declarations, then tries `/apple-touch-icon.png`, `/favicon.ico` and `/favicon.png`.
  - Every request validates and pins the DNS answers used by its own HTTPS socket and rejects private or reserved IPv4 and IPv6 destinations. Up to three HTTPS redirects are followed, and each hop repeats those checks.
  - Downloads stop above 1 MB. Image types are detected from the bytes, ICO files are converted to PNG at up to 128 px, and SVG is ignored. Sites that block automated requests need a manually uploaded logo.
  - Discovery and extension page saving share a 30-per-minute IP budget.
- **Logs and errors.** Logs omit query strings and redact bodies, authorization and session headers. Unexpected errors return a generic message and log only an error code. The frontend ignores late catalog, credential, team and profile responses from a previous account. Production client origins must use HTTPS.
- **Known limits.**
  - The login request contains the credentials you enter. They are visible in your own browser's DevTools before HTTPS encrypts the transport.
  - Assisted autofill delivers supplier credentials to the extension and the destination form. Someone who controls that browser can inspect them. Hublink does not keep a supplier password secret from the browser's authorized user.
  - Revoking a Hub session does not end supplier sessions or change spreadsheet permissions.
  - The repository contains no operational destinations or customer data. Do not treat a local pilot, the broad HTTPS autofill permission or a successful build as production readiness.

---

## Architecture

```
   Web Workspace (React)        Chrome extension (MV3)
            │                    popup · worker · autofill
            │  session cookie          │  ticket exchange
            └──────────┬───────────────┘
                       ▼
               API (Fastify, Node 24)
         routes · services · validators · vault
                       │
                       ▼
                  PostgreSQL 16
```

```text
apps/web/        React Workspace, views, hooks, and shared styles
apps/api/        Fastify routes, services, PostgreSQL migrations, and vault
apps/extension/  Chrome MV3 worker, popup, and assisted autofill
scripts/         Image checks, backup, restore, tenant provisioning, extension browser suite
tests/e2e/       Isolated browser regression scenarios
```

- The authenticated catalog lives in PostgreSQL. Legacy demo JSON links remain separate.
- The web client never receives supplier passwords. The extension exchanges a short-lived ticket directly with the API and fills only the verified destination.

---

## Development

API and E2E tests write records, so use separate databases:

```bash
docker compose exec postgres createdb -U hublink hublink_test
docker compose exec postgres createdb -U hublink hublink_e2e

DATABASE_URL=postgres://hublink:hublink_dev_password@127.0.0.1:5439/hublink_test npm run check

npx playwright install chromium
E2E_DATABASE_URL=postgres://hublink:hublink_dev_password@127.0.0.1:5439/hublink_e2e npm run test:e2e
```

Create each database once. `npm run check` runs typechecks, zero-warning lint, formatting, all workspace tests and builds. E2E starts its own API on `3178` and web on `5177`; both ports must be free. Individual checks: `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run test -w @hublink/extension` (or `@hublink/api` / `@hublink/web`).

**Real-extension browser suite.** It requires the Playwright Chromium already installed, OpenSSL and a dedicated disposable PostgreSQL database. It refuses non-loopback database hosts and names outside `hublink_extension_*test`:

```bash
npm run build
EXTENSION_TEST_DATABASE_URL=postgres://hublink:hublink_dev_password@127.0.0.1:5439/hublink_extension_browser_test npm run test:extension:browser
```

- The suite loads the actual extension into a temporary Chromium profile. It runs real API sessions, tickets, catalog cards and popup controls against synthetic HTTPS pages, following the [Playwright extension-testing workflow](https://playwright.dev/docs/chrome-extensions).
- It trusts only its own disposable TLS certificate and changes no system trust settings. The temporary profile and key are removed afterward.
- Sanitized results and synthetic screenshots stay under the printed `/tmp/hublink-extension-browser-*` directory. Set `EXTENSION_TEST_HEADED=true` to watch the browser.
- It never uses production, supplier accounts or your browser profile. Real supplier and human acceptance tests are separate.

**CI** runs `npm run check` and `npm audit --audit-level=moderate` on every push and pull request.

- **Browser E2E.** It runs against a separate database through Vite's actual API proxy to port `3178`, with no endpoint interception.
- **Regression coverage.** Session and ticket revocation, cross-owner access, audit-write rollback, secret-free errors and logs, no-store responses, lock-wait expiry, private DNS answers, redirects, streamed image size, account switches and origin-only favicon requests.
- **Production images.** CI builds the API and Web images and runs `python3 scripts/check-images.py --api-image hublink-api:ci --web-image hublink-web:ci --origin https://hub.example.test`. Build the API image with the same `HUB_EXTENSION_ORIGIN`.
  - The check requires Python 3 and Docker, and creates and removes its own network, PostgreSQL and synthetic accounts.
  - It verifies the actual Nginx and API response headers, authentication, session rotation after a password change, the packaged extension's origin and ZIP, and public icon bytes.
  - Private API locations disable Nginx's inherited `expires` rule, so the upstream `no-store` survives the production proxy.

---

## Roadmap

Delivered:

- **Foundation:** PostgreSQL persistence, scrypt authentication, rolling sessions, and user administration.
- **Vault and catalog:** encrypted individual, shared and standalone credentials; team and personal cards; single-use opening tickets.
- **Chrome extension:** assisted autofill from Workspace cards and popup shortcuts, page saving, startup/New Tab options, and verification of destinations bound to the configured origin.
- **Workspace:** five display modes, private Kanban agenda, branding with personal overrides, profile and avatar, and audit history.
- **Hardening:** authenticated configuration, no-store responses, private-network favicon protection, secret-free logs, required `DATABASE_URL`, and an isolated production-image check in CI.

Open:

- Hub two-factor authentication.
- Defined session duration, key and vault custody, and off-host backup retention.
- Supplier-specific automation beyond assisted filling (form submission remains manual by design).

---

## License

MIT © [Rafael Albernaz](https://github.com/Rafael-Albernaz-dev)
