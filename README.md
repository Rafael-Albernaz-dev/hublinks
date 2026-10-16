# Hublink

Hublink is a customizable team access portal and encrypted credential vault. It provides organizations with a centralized, brandable dashboard for internal services, web tools, spreadsheets, and supplier portals, paired with a companion Chrome extension that provides secure, universal assisted autofill without automatic submission.

---

## Key Features

- **White-Label & Brand Customization:**
  - Dynamic company name, subtitle, and custom brand logo upload.
  - Interactive primary theme color picker with real-time CSS variable updates.
  - Persistent settings stored locally or backed by an authenticated database.

- **Flexible Service Catalog:**
  - Organize access cards across customizable categories (_CRM, ERP, Financial, Communication, Tools, Other_).
  - Custom per-service titles, descriptions, logos (PNG, JPG, WebP), and target HTTPS URLs.
  - Granular access types:
    - **Direct Link (No Vault):** For internal documentation, forms, and spreadsheets (`noopener, noreferrer`).
    - **Shared Vault:** Team-wide credentials encrypted and managed centrally by administrators.
    - **Individual Vault:** Personal credentials managed directly by each authorized user.

- **Enterprise-Grade Security Architecture:**
  - **Zero Frontend Secret Exposure:** Passwords and secrets are never sent to or stored in the browser frontend.
  - **AES-256-GCM Server Vault:** Credentials encrypted at rest using AES-256-GCM with associated authenticated data (AAD) bound to service ID, credential owner, and key version.
  - **Ephemeral Bearer Tickets:** 30-second time-to-live (TTL) single-use tokens, atomically consumed and burned under PostgreSQL row-level locks (`SELECT ... FOR UPDATE`).
  - **Chrome MV3 Companion Extension:**
    - Instant DOM detection via content-script marker (`data-hublink-extension="active"`).
    - Strict origin binding accepting both `http://localhost:5177` and `http://127.0.0.1:5177`.
    - Deterministic extension key producing a permanent ID (`nhodfnpljikjfeoihaimabljdenmfbio`) for zero-configuration local development.
    - Double destination check: validates target tab URL before injection and re-verifies location inside the content script.
    - Universal assisted autofill: Dispatches reactive native input events for modern SPAs, detects human verification challenges (reCAPTCHA, Turnstile, hCaptcha, 2FA/OTP), and **never auto-submits** credentials.

---

## Quick Start (Local Development)

### Prerequisites

- **Node.js** 24+ and **npm**
- **Docker** and **Docker Compose** (for PostgreSQL 16)
- Free loopback ports: `3177` (API), `5177` (Web Vite), `5439` (PostgreSQL)

### Setup & Run

```sh
# Install dependencies
npm ci

# Start local PostgreSQL database
docker compose up -d postgres

# Run automated quality checks
npm run check

# Start API server (terminal 1)
npm run dev:api

# Start Web application (terminal 2)
npm run dev:web
```

Open `http://localhost:5177` or `http://127.0.0.1:5177` in Google Chrome.

### Environment Configuration

Copy `.env.example` to `.env` if you want to customize ports or credentials.

- `VAULT_MASTER_KEY`: 32-byte secret (64 hex characters) used to encrypt vault entries.
- `INITIAL_ADMIN_EMAIL`: Initial administrator login email.
- `INITIAL_ADMIN_PASSWORD`: Initial administrator login password.
- `HUB_EXTENSION_ID`: Chrome extension ID (defaults to `nhodfnpljikjfeoihaimabljdenmfbio`).

---

## Chrome MV3 Extension Setup

1. Build the extension package:
   ```sh
   npm run build
   ```
2. In Google Chrome, navigate to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the directory:
   ```
   apps/extension/dist
   ```
5. The extension will load with ID `nhodfnpljikjfeoihaimabljdenmfbio`.
6. Reload the Hublink web app. The extension presence indicator will turn active automatically.

---

## Testing & Quality Gates

Run the comprehensive test suite and code quality checks:

```sh
# Full quality check (TypeScript, ESLint, Prettier, Tests, Builds)
npm run check

# Individual workspace checks
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run build

# End-to-end browser tests (requires Chromium)
npx playwright install chromium
npm run test:e2e
```

---

## Project Structure

```
hublink/
├── apps/
│   ├── api/          # Fastify backend, PostgreSQL pool, scrypt auth, AES-256-GCM vault
│   ├── web/          # React + Vite dashboard, brand customizer, responsive modals
│   └── extension/    # Chrome MV3 companion extension, ticket bridge, universal autofill
├── docs/             # Technical architecture, decisions, and roadmap
└── tests/e2e/        # End-to-end Playwright tests
```

---

## Security & Privacy Guidelines

- **Synthetic Data Only:** The repository contains no operational credentials, private customer data, or vendor-specific links.
- **Human-in-the-Loop:** Autofill populates recognized credentials and pauses for human verification and manual form submission.
- **Separation of Concerns:** Revoking a Hub session immediately invalidates Hub access and ticket issuance, but does not close remote vendor sessions.
