# Hublink

Hublink is a configurable hub for a team's links, styled with each client's brand. This version also serves as a portfolio demo: the company name, description, logo, RGB color, and link cards can be changed in the interface.

## Current state

The demo configuration is stored by the local Fastify API in `data/config.json` (ignored by Git). All browsers using the same local API see the saved configuration. Edits are drafts until you select **Salvar alterações** (Save changes). You can export and import a JSON file to move a configuration between installations; importing creates a draft that must be saved. The initial configuration has no cards; use public example domains when adding links. R3 adds local Hub login, persistent sessions, and basic attendant administration using PostgreSQL. The private catalog, credential vault, and assisted sign-in are still unimplemented. The Chrome extension requests no website permissions.

## Run locally

Requires Node 24 and npm:

```sh
npm ci
docker compose up -d postgres
npm run check
npx playwright install chromium
npm run test:e2e
npm run dev:api
# In another terminal:
npm run dev:web
```

Set `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` in your local environment before the first API start. If omitted, the API uses development-only fallback credentials defined in `apps/api/src/db.ts`; change them for any non-disposable local database. The first boot creates the admin only when no admin exists. Changing the variables later does not reset an existing admin. Open `http://127.0.0.1:5177`, sign in, and use the customization panel to edit the branding and links. The interface is currently in Portuguese. The API health endpoint is `http://127.0.0.1:3177/health`. Vite proxies `/api` to that loopback address. PostgreSQL must be available before the API starts.

## Configure the demo

1. Enter the company name and introductory text.
2. Upload a PNG, JPG, or WebP logo up to 1 MB. The image is stored as a data URL in the API configuration and in exported JSON files.
3. Set the R, G, and B values from 0 to 255, or use the color picker. Text displayed over the brand color automatically switches between light and dark.
4. Add, edit, or remove up to 30 public HTTPS links. Each card can have an optional PNG, JPG, or WebP logo up to 500 KB; otherwise it shows a sequence number. Links open in a new tab with `noopener noreferrer`.
5. Select **Salvar alterações** to persist edits through `PUT /api/config`. Use JSON export and import to transfer a configuration. The file may contain logos and links, so review it before sharing.

The version 1 format contains `companyName`, `subtitle`, `color`, `logoDataUrl`, and `links`; each link may also have `logoDataUrl`. Validation is implemented in [`apps/web/src/config.ts`](apps/web/src/config.ts). A minimal example:

```json
{
  "version": 1,
  "companyName": "Example Company",
  "subtitle": "Useful links for the team",
  "color": { "r": 31, "g": 86, "b": 139 },
  "logoDataUrl": null,
  "links": [
    {
      "id": "site",
      "title": "Website",
      "description": "Public page",
      "url": "https://example.com/",
      "logoDataUrl": null
    }
  ]
}
```

## Local API

`GET /api/config` creates `data/config.json` with the default configuration when absent, then returns it. `PUT /api/config` validates a complete version 1 JSON configuration and returns `{ "status": "ok", "config": ... }`; invalid payloads return HTTP 400 with an `error` string. The API writes through a temporary file and rename. Its request body limit is 10 MB. Set `HUB_API_PORT` to change the API port, and update the Vite proxy target accordingly. Set `HUB_CONFIG_PATH` to an alternative file path when a separate local configuration is needed.

The React interface requires Hub login before showing links, but `GET/PUT /api/config` remain public demo endpoints on the local API. This file is not an authorized private catalog. Run the API only on the local loopback interface, use public links and approved logos, and review exported files before sharing. Its on-disk file is not a backup or a multi-user publishing workflow. Supplier behavior and production operation require separate verification.

## Local identity and session API

R2 added a **development-only** PostgreSQL 16 Compose service and the native schema in [`apps/api/migrations/001_initial_schema.sql`](apps/api/migrations/001_initial_schema.sql). R3 connects the API with `pg`, applies that schema on first boot if absent, and provisions the first admin. The demo configuration still uses `data/config.json`; PostgreSQL does not migrate or protect it.

```sh
docker compose up -d postgres
docker compose ps postgres
npm run dev:api
```

Compose binds only `127.0.0.1:${HUB_DB_PORT:-5439}` on the host and keeps data in its own `hublink_pgdata` volume. Set `HUB_DB_PORT` if port 5439 is occupied, or set `DATABASE_URL` for another isolated local database. The API pool has a maximum of ten connections, a five-second connection timeout, a 30-second idle timeout, and closes on server shutdown. The first boot applies the existing DDL only if the `users` table is absent. The Compose database credentials are fixed local development defaults and are unsuitable for a shared or production deployment. Stop this isolated service with `docker compose down`; that command retains the volume.

`POST /api/auth/login` accepts `{ "email": "...", "password": "..." }`, returns the user, and sets a 365-day rolling `HttpOnly`, `SameSite=Lax` cookie. `GET /api/auth/me` checks revocation and inactivity in PostgreSQL, updates last-seen time, and renews the cookie. `POST /api/auth/logout` revokes the session and clears the cookie. The server stores a SHA-256 hash of the random session token and a salted scrypt hash of the Hub password. The cookie is marked `Secure` when `NODE_ENV=production`; local HTTP loopback testing does not set that flag.

Admins can use `GET /api/admin/users`, `POST /api/admin/users` with `displayName`, `email`, and `password`, and `POST /api/admin/users/:id/reset-password` with a new `password`. Only attendants can be reset through this route; resetting a password atomically revokes that attendant's earlier Hub sessions. The React customization panel offers these actions to an admin. The API checks the role on every admin request. There is no Hub 2FA, login rate limit, remote access, private service catalog, or supplier authorization in R3. Do not expose this pilot remotely.

The vault, one-time ticket, catalog, and remaining operational gates are specified in [`docs/PRIVATE_SPEC.md`](docs/PRIVATE_SPEC.md). A working local session is not proof of browser extension behavior, supplier sign-in, or production readiness.

## Browser tests

Run `npm run test:e2e` (or `npx playwright test`) after `npm ci`, `docker compose up -d postgres`, and `npx playwright install chromium`. Once per local Compose volume, create the dedicated synthetic database with `docker compose exec -T postgres createdb -U hublink hublink_e2e`. Playwright starts its API on `127.0.0.1:3178` and web server on `127.0.0.1:5177`, routes browser API requests to that isolated API, and runs sequential headless Chromium scenarios. Free those two ports before running. Set `E2E_DATABASE_URL` if using another disposable PostgreSQL database. The API uses `/tmp/hublink-e2e-config.json`; tests reset it to synthetic data and remove it after the suite. The development file `data/config.json` and a separately running API on port 3177 are untouched. Browser tests cover demo customization plus login, session persistence, logout, and password-reset revocation. These tests do not prove supplier or production behavior.

## Project structure

- `apps/web`: React/TypeScript interface, configuration, and validation and interaction tests.
- `apps/api`: Fastify server with loopback health, local configuration, authentication, and admin endpoints.
- `apps/extension`: Chrome Manifest V3 scaffold without host permissions.
- `tests/e2e`: Playwright Chromium browser scenarios for the local demo.
- `docs/`: architecture, decisions, open questions, and adapter documentation.

The detailed delivery sequence and next-session handoff are in [`docs/ROADMAP.md`](docs/ROADMAP.md).

The central credential vault and assisted sign-in are planned for later stages. The remaining design questions are listed in [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md). A successful local build does not validate supplier compatibility or production readiness.
