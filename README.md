# Hublink

A customizable team portal with personal links, an encrypted credential vault, and a Chrome extension for assisted sign-in.

## Features

- **Workspace:** searchable cards, category filters, five display modes, and keyboard or drag-and-drop ordering.
- **Personal links:** save an HTTPS page from the extension or create a card in the portal. Personal cards are visible only to their owner.
- **Team catalog:** administrators manage shared cards; users manage their own cards and individual credentials.
- **Branding:** company colors, logo, and Home text, with personal overrides and light/dark themes.
- **Accounts:** profile editing, avatars, password changes, user administration, and administrator-only audit history.
- **Chrome extension:** quick links, optional startup/New Tab integration, and assisted autofill without automatic submission.
- **Operations:** Docker packaging, encrypted backups, restore tooling, and isolated installations per client.

## Local setup

Requires Node.js 24, npm, Docker Compose, and Chrome for the extension. Default ports are `5177` (web), `3177` (API), and `5439` (PostgreSQL).

```bash
npm ci
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

## Chrome extension

```bash
npm run build
```

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select `apps/extension/dist`.
3. Open the Workspace's Extension Center and select **Verificar conexão agora**.

The Extension Center also offers an authenticated ZIP download after the build. Extract it before loading. Reload the extension after rebuilding.

The extension ID is `nhodfnpljikjfeoihaimabljdenmfbio`. Default builds use Workspace origins `http://127.0.0.1:5177` and `http://localhost:5177`, with API `http://127.0.0.1:3177`. For a deployed installation, set `HUB_EXTENSION_ORIGIN` to one exact HTTPS origin (without a trailing slash) when building. The compiled worker, popup, page saving, content script and external-message allowlist then use only that origin; the extension ID stays the same. Changing runtime API configuration alone does not rebuild the extension. Reload the unpacked extension after replacing its files.

Startup and New Tab options are off by default and apply per Chrome profile. Popup shortcuts open destinations directly; assisted autofill starts from a card in the Workspace.

### Save a page

1. Open an HTTPS page and click the extension.
2. Select **Salvar no Hublink**.
3. Review the name, full address, and category, then select **Salvar link**.

The result is a personal card without a vault, including for administrators. Category defaults to **Outros**; favicon capture is optional and does not block saving when unavailable. Review addresses for sensitive parameters before confirming.

An identical URL in your personal cards triggers a duplicate warning. Different paths, query strings, and fragments remain distinct. **Ver no Hublink** opens a fresh Workspace tab; existing tabs show the card after reload.

Saving requires an active Hub session and a reachable API. Errors retain the draft while the popup stays open; closing it discards the draft. After an uncertain network response, check the Workspace before retrying. Browser bookmarks and history are not synchronized, and page metadata is not saved in extension storage.

### Optional Web Store link

Set `VITE_CHROME_WEBSTORE_URL` before starting or building the web app to show a published listing in the Extension Center. Missing or invalid values retain the ZIP installation flow. This setting does not publish the extension or change its origin binding.

## Workspace and access

The sign-in screen uses the Hublink icon and Workspace typography, colors and panel styling. It follows the browser's saved light/dark theme and adapts to narrow screens. Sign-in fields, autocomplete and the existing account/session flow are unchanged.

Browser icons use the same Hublink mark in SVG, a multi-size ICO, a 32 px PNG and a 180 px Apple touch icon. Versioned icon URLs refresh previously cached failures. The Web image explicitly makes its public static files readable by Nginx, including assets copied from restrictive source permissions.

| Area           | Available actions                                                                           |
| -------------- | ------------------------------------------------------------------------------------------- |
| Início         | Search, filter, open, and reorder cards; choose Grid, List, Carousel, Compact, or Sections. |
| Catálogo       | Manage personal cards; administrators also manage team cards.                               |
| Acessos        | Save individual credentials; administrators manage shared credentials.                      |
| Equipe         | Administrators create, edit, deactivate, and reset user accounts.                           |
| Auditoria      | Administrators browse and filter recorded events.                                           |
| Personalização | Edit company branding as an administrator or personal overrides as a user.                  |
| Meu Perfil     | Update your name, email, avatar, or password from the account menu.                         |

Personal cards remain private even from other administrators. Direct links open without the vault. Vault cards use the extension; passwords are never listed by the web client. CAPTCHA, 2FA, and form submission remain manual.

Changing your email or password requires your current password. The API revokes all previous sessions and their opening tickets, then issues a new session for the current browser. Other browsers must sign in again. Ordinary profile edits retain the current session.

All configuration reads now require authentication, including `GET /api/config`; configuration writes require an administrator. This closes the legacy anonymous JSON endpoint, which could include saved links. All API responses use `Cache-Control: no-store`. The frontend ignores late catalog, credential, team and profile responses from a previous account.

The login request contains the credentials you enter, visible in your own browser's DevTools before HTTPS encrypts transport. Login/profile/session responses expose only public account fields, never Hub passwords or hashes. Vault listings expose metadata only. The separate reveal API still allows an administrator to reveal shared credentials and a user to reveal their own individual credentials, as defined by the existing access contract; React does not call it. Assisted autofill delivers supplier credentials to the extension and destination form. Someone controlling that browser can inspect them; this is not a mechanism for keeping a supplier password secret from its authorized browser user.

Branding changes require an explicit save. Resetting personal preferences restores company defaults. Account layout/order preferences synchronize through the API; the light/dark theme remains browser-local. An offline preference cache grants no catalog or credential access. JSON exports can contain user-entered data.

## Configuration

See [.env.example](.env.example) for the full list. Export variables before starting the development servers; production Compose uses the explicit environment file described below.

| Variable                                         | Purpose                                                                             |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `DATABASE_URL`                                   | PostgreSQL connection; defaults to the local development database on port `5439`.   |
| `HUB_API_PORT` / `HUB_DB_PORT`                   | Local API and development database ports.                                           |
| `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` | Administrator identity on first boot.                                               |
| `VAULT_MASTER_KEY`                               | Vault key: 32 bytes, normally encoded as 64 hex characters. Required in production. |
| `HUB_EXTENSION_ID`                               | Exact extension ID used for browser-origin validation.                              |
| `HUB_CLIENT_ORIGINS`                             | Exact comma-separated web origins allowed by the API.                               |
| `HUB_API_HOST` / `HUB_TRUST_PROXY`               | API binding and proxy trust; enable trust only behind the configured trusted proxy. |

The vault has a development-only key fallback. Protect and retain a unique runtime key before using real credentials; losing it makes vault backups unreadable.

## Tests

API and E2E tests write records. Use separate databases:

```bash
docker compose exec postgres createdb -U hublink hublink_test
docker compose exec postgres createdb -U hublink hublink_e2e

DATABASE_URL=postgres://hublink:hublink_dev_password@127.0.0.1:5439/hublink_test npm run check

npx playwright install chromium
E2E_DATABASE_URL=postgres://hublink:hublink_dev_password@127.0.0.1:5439/hublink_e2e npm run test:e2e
```

Create each database once. `npm run check` runs typechecks, zero-warning lint, formatting, all workspace tests, and builds. E2E starts its own API on `3178` and web on `5177`; both ports must be free.

Individual checks: `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run test -w @hublink/extension` (or `@hublink/api` / `@hublink/web`).

CI additionally runs `npm audit --audit-level=moderate` and browser E2E against a separate database. E2E uses Vite's actual API proxy to port `3178`, with no endpoint interception. Regressions cover session/ticket revocation, cross-owner access, audit-write rollback, secret-free errors/logs, no-store responses, lock-wait expiry, private DNS answers, redirects, streamed image size, account switches and origin-only favicon requests. See the [security review](docs/SECURITY_REVIEW_2026-10-28.md) for findings and evidence limits.

The page-saving feature passed 43 API tests, 35 extension tests, 63 web tests, and eight existing E2E scenarios. A separate run with the unpacked extension in an isolated Chromium profile verified the popup/session/API/database/Workspace journey using synthetic data. See [validation evidence and remaining gates](docs/CONTEXT.md#extension-page-saving). Local checks do not establish production or supplier acceptance.

## Deployment and recovery

Production uses `docker-compose.prod.yml`: only the web entry is published, on `127.0.0.1:8080` by default. API and PostgreSQL stay on the private container network. A host-managed TLS gateway must overwrite forwarded client/protocol headers. Production sessions require HTTPS.

Prepare a private `.env.production` from `.env.example` with unique database and vault secrets, explicit administrator credentials, and exact HTTPS client origins. Protect it with mode `0600`. Make the configured data directory writable by the API container's UID/GID `1000`.

Set `HUB_EXTENSION_ORIGIN` to the same official HTTPS origin as `HUB_CLIENT_ORIGINS` before building the production API image. Compose passes this non-secret build argument to the packaged extension. A local production-origin build can also use `HUB_EXTENSION_ORIGIN=https://hub.example.com npm run build -w @hublink/extension`. The URL must be an exact HTTPS origin; paths, credentials, wildcards, query strings and fragments are rejected. Preserve the unpacked extension's key/ID; no Web Store distribution is implied.

```bash
export HUB_RUNTIME_ENV_FILE=.env.production
docker compose --env-file "$HUB_RUNTIME_ENV_FILE" -f docker-compose.prod.yml build
docker compose --env-file "$HUB_RUNTIME_ENV_FILE" -f docker-compose.prod.yml up -d --no-build --wait
```

Use immutable image tags and retain the previous images and vault key. Deployments and updates are operator-initiated; CI runs checks, not automatic on-premise deployment. Installed-browser HTTPS session and extension behavior require validation after deployment.

Backup and restore use `scripts/backup.sh` and `scripts/restore.sh`. They require private runtime secrets, a separate backup passphrase, and a maintenance window. Restore replaces the selected project's data; PostgreSQL and config-file replacement are not one atomic transaction. Follow the [recovery and rollback playbook](docs/ROLLBACK.md) for the complete procedure.

`scripts/provision-tenant.sh` generates a separate client's protected configuration and secrets without starting containers. Review its domain, ports, storage permissions, and capacity before starting that installation. TLS, off-host retention, monitoring, and recovery rehearsals remain operator responsibilities.

## Architecture and security

```text
apps/web/        React Workspace, views, hooks, and shared styles
apps/api/        Fastify routes, services, PostgreSQL migrations, and vault
apps/extension/  Chrome MV3 worker, popup, and assisted autofill
docs/            Context, decisions, roadmap, and recovery procedures
tests/e2e/       Isolated browser regression scenarios
```

The authenticated catalog lives in PostgreSQL; legacy demo JSON links remain separate. Sessions use opaque HttpOnly cookies with 365-day rolling inactivity expiry. Hub passwords use scrypt; vault records use AES-256-GCM with a runtime key. Opening tickets expire after 30 seconds and are consumed once. The server rechecks authorization, and the extension verifies the destination before filling.

Page saving uses `POST /api/extension/bookmarks`, accepting only name, category, and HTTPS URL. The server forces personal ownership and no vault. Only the bound extension origin receives credentialed access to that POST and catalog GET/preflights; other route restrictions remain. Favicon lookup receives only the destination origin.

Favicon discovery contacts only the destination origin, without sending hostnames to a third-party favicon service. It validates and pins the DNS answers used by each HTTPS socket, rejects private/reserved IPv4 and IPv6 destinations, refuses redirects, and stops streaming above 200 KB. Sites that require redirects may need a manually uploaded logo. Discovery and extension page-saving requests share a 30-per-minute IP budget. API logs omit query strings and redact bodies, authorization and session headers; unexpected errors return a generic message and log only an error code. Production client origins must use HTTPS.

Revoking a Hub session does not end supplier sessions or change spreadsheet permissions. The repository contains no operational destinations or customer data. Do not treat the local pilot, broad HTTPS autofill permission, or a successful build as production readiness.

Further reference: [current state](docs/CONTEXT.md), [decisions](docs/DECISIONS.md), [roadmap](docs/ROADMAP.md), and [open operational questions](docs/OPEN_QUESTIONS.md).
