# Hublink

Hublink is a configurable hub for a team's links, styled with each client's brand. This version also serves as a portfolio demo: the company name, description, logo, RGB color, and link cards can be changed in the interface.

## Current state

The demo configuration is stored **only in the current browser** (`localStorage`). You can export and import a JSON file to reuse the branding and links in another browser. The two initial cards point to example domains. Use only public links in this version: login, a private catalog, user synchronization, a credential vault, and assisted sign-in are not implemented. The API exposes only `/health`, and the Chrome extension requests no website permissions.

## Run locally

Requires Node 24 and npm:

```sh
npm ci
npm run check
npm run dev:web
```

Open `http://127.0.0.1:5177` and use the customization panel to edit the branding and links. The demo interface is currently in Portuguese. To start the local API, run `npm run dev:api` in another terminal; its health endpoint is `http://127.0.0.1:3177/health`.

## Configure the demo

1. Enter the company name and introductory text.
2. Upload a PNG, JPG, or WebP logo up to 1 MB. The image is stored as a data URL in the browser and in the exported JSON file.
3. Set the R, G, and B values from 0 to 255, or use the color picker. Text displayed over the brand color automatically switches between light and dark.
4. Add, edit, or remove up to 30 public HTTPS links. They open in a new tab with `noopener noreferrer`.
5. Use the JSON export control to save the configuration and the import control to apply it in another browser. The file may contain the logo and links, so review it before sharing.

The version 1 format contains `companyName`, `subtitle`, `color`, `logoDataUrl`, and `links`. Validation is implemented in [`apps/web/src/config.ts`](apps/web/src/config.ts). A minimal example:

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
      "url": "https://example.com/"
    }
  ]
}
```

## Project structure

- `apps/web`: React/TypeScript interface, configuration, and validation and interaction tests.
- `apps/api`: Fastify server with a loopback health endpoint.
- `apps/extension`: Chrome Manifest V3 scaffold without host permissions.
- `docs/`: architecture, decisions, open questions, and adapter documentation.

Authentication, the central credential vault, and assisted sign-in are planned for a later stage. The remaining design questions are listed in [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md). A successful local build does not validate supplier compatibility or production readiness.
