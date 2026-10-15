# Hublink

Hublink is a configurable hub for a team's links, styled with each client's brand. This version also serves as a portfolio demo: the company name, description, logo, RGB color, and link cards can be changed in the interface.

## Current state

The demo configuration is stored by the local Fastify API in `data/config.json` (ignored by Git). All browsers using the same local API see the saved configuration. Edits are drafts until you select **Salvar alterações** (Save changes). You can export and import a JSON file to move a configuration between installations; importing creates a draft that must be saved. The initial configuration has no cards; use public example domains when adding links. Use only public links in this version: login, a private catalog, user synchronization, a credential vault, and assisted sign-in are not implemented. The API exposes `/health` and `/api/config`, and the Chrome extension requests no website permissions.

## Run locally

Requires Node 24 and npm:

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
npm run dev:api
# In another terminal:
npm run dev:web
```

Open `http://127.0.0.1:5177` and use the customization panel to edit the branding and links. The demo interface is currently in Portuguese. The API health endpoint is `http://127.0.0.1:3177/health`. Vite proxies `/api` to that loopback address. If the API is unavailable, the page shows an error banner and disables editing.

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

This local demo API has no authentication or per-client isolation. Run it only on the local loopback interface, use public links and approved logos, and review exported files before sharing. Its on-disk file is not a backup or a multi-user publishing workflow. Supplier behavior and production operation require separate verification.

## Private variant database scaffold

R2 adds a **development-only** PostgreSQL 16 Compose service and the native schema in [`apps/api/migrations/001_initial_schema.sql`](apps/api/migrations/001_initial_schema.sql). The private API, authentication, vault, and extension exchange are not implemented. The running demo continues to use `data/config.json`; starting PostgreSQL does not migrate or change it.

```sh
docker compose up -d postgres
docker compose ps postgres
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U hublink -d hublink < apps/api/migrations/001_initial_schema.sql
```

Compose binds only `127.0.0.1:${HUB_DB_PORT:-5439}` on the host and keeps data in its own `hublink_pgdata` volume. Set `HUB_DB_PORT` in the environment or a local `.env` file if port 5439 is occupied. Apply the schema only once to a fresh database; rerunning the `CREATE TABLE` script will fail. The Compose database, user, and password are fixed **local development defaults**; they are not suitable for a shared or production deployment. `.env.example` lists reserved future API database settings; the current API does not read them. Do not put real credentials or a vault master key in a tracked file. Stop this isolated service with `docker compose down`; that command retains the volume.

The private session, vault, one-time ticket, catalog, and remaining operational gates are specified in [`docs/PRIVATE_SPEC.md`](docs/PRIVATE_SPEC.md). A valid local schema is not proof of browser extension behavior, supplier sign-in, or production readiness.

## Browser tests

Run `npm run test:e2e` (or `npx playwright test`) after `npm ci` and `npx playwright install chromium`. Playwright starts the API and web server on `127.0.0.1:3177` and `127.0.0.1:5177`, runs five sequential headless Chromium scenarios, and stops its servers. Free both ports before running; the suite refuses to reuse an existing server so it cannot write into a developer's configuration. The API uses `/tmp/hublink-e2e-config.json`; tests reset it to synthetic data before each scenario and remove it after the suite. The development file `data/config.json` is untouched. These browser checks cover the default state, save and reload with a card logo, keyboard focus, desktop and mobile layout, and JSON export. They do not prove supplier or production behavior.

## Project structure

- `apps/web`: React/TypeScript interface, configuration, and validation and interaction tests.
- `apps/api`: Fastify server with loopback health and local configuration endpoints.
- `apps/extension`: Chrome Manifest V3 scaffold without host permissions.
- `tests/e2e`: Playwright Chromium browser scenarios for the local demo.
- `docs/`: architecture, decisions, open questions, and adapter documentation.

The detailed delivery sequence and next-session handoff are in [`docs/ROADMAP.md`](docs/ROADMAP.md).

Authentication, the central credential vault, and assisted sign-in are planned for a later stage. The remaining design questions are listed in [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md). A successful local build does not validate supplier compatibility or production readiness.
