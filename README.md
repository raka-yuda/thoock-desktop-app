# Thoock Desktop

A local desktop workspace for researching stock-image opportunities, writing commercial briefs, generating images, reviewing results, and preparing Adobe Stock packages. Built with Tauri 2, React 19, TypeScript, Vite, and Rust.

The application implements the workflow in the [product brief](docs/PRODUCT_BRIEF.md) and follows the [reference screens](docs/screenshots/README.md) using the [desktop design system](docs/DESIGN_SYSTEM.md). See [implementation status and release gates](docs/IMPLEMENTATION_STATUS.md) for verification and current limitations.

## Run locally

Use Node.js 22.12+ and the Rust version pinned in `rust-toolchain.toml`. Install the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/), then:

```bash
npm ci
npm run tauri dev
```

`npm run dev` opens a read-only browser preview. Workspace mutations, native file pickers, provider requests, and credential storage require the desktop application.

Use the sun/moon button in the top bar to switch appearance, or choose System, Light, or Dark in Settings. The preference is saved on this device; System follows the operating system appearance.

Settings and AI text dialogs offer static model dropdowns for OpenAI and Gemini. The [catalogue and official sources](docs/TEXT_MODELS.md) record supported models, preview labels, and account-access limits. Existing saved model IDs remain available.

## First use

Click **Demo data** in the top bar to explore a populated workspace: 36 opportunities, 28 briefs, 48 illustrated assets, 54 jobs and logs, and 14 export batches. Filters, pagination, selection, and editors work with sample records. The demo is read-only and makes no provider requests. Click **Local data** to return to your workspace.

Open Settings to name the workspace and configure provider credentials. Keys are stored in the operating-system credential vault; SQLite stores only logical provider references. Select available model IDs and defaults in Settings. Each paid generation, retry, or repair requires an explicit confirmation.

Local research and brief generation work without credentials. The local image provider creates a clearly marked test pattern for exercising generation and review; these images cannot be approved or exported.

Use Settings → Storage for backups, restoration, workspace relocation, preview rebuilding, support bundles, and migration. Restoration, relocation, and migration validate and stage a replacement for the next restart, retaining the prior workspace. Credential keys are excluded from backups and must be configured again after restoration or migration.

## Checks and packaging

```bash
npm run build
npm test
npm run test:rust
npm exec -- playwright test
npm run tauri build
```

Browser tests use installed Google Chrome locally. To use Playwright Chromium, install it with `npm exec -- playwright install chromium` and set `THOOCK_CI_BROWSER=chromium`. CI defines macOS and Windows build and test jobs.

Use `npm run build:mac:dev` for a macOS development bundle with an ad hoc signature and strict signature verification. The bundle is `src-tauri/target/debug/bundle/macos/Thoock.app`. `tauri dev` runs a standalone executable with a different signing identity; if Keychain authorization fails there, use the development bundle to check the credential flow. Keychain errors include the numeric macOS OSStatus. Developer ID signing, notarization, and Windows installation remain release gates.

To prepare a migration ZIP from normalized source records:

```bash
npm run migration:pack -- /path/to/normalized-source /path/to/new-migration.zip
```

See the [migration format](docs/MIGRATION_FORMAT.md) before preparing source records.

Geist fonts and Phosphor icons ship with their license notices in `public/licenses`.
