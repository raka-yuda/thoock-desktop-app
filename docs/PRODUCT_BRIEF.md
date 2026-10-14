# Thoock Desktop — Tauri Product Brief

Status: implementation brief  
Target: macOS and Windows from one codebase  
Shell: Tauri 2  
Frontend: React 19 + TypeScript + Vite  
Product model: private, local-first, single-user, bring-your-own-key (BYOK)

## 1. Product summary

Thoock Desktop is a local creative-production workspace for researching commercially useful image topics, turning research into structured briefs, generating image candidates through user-configured AI providers, reviewing and correcting those candidates, preparing Adobe-compatible metadata, and exporting finished JPEG + CSV packages.

The desktop app preserves the proven web workflow while removing the operational weight of a hosted application. It must run on macOS and Windows from the same source tree, keep user data and provider credentials on the local machine, and remain useful without an account or cloud subscription.

The core workflow is:

```text
Research opportunities
  -> create/import commercial briefs
  -> generate image candidates
  -> inspect and review
  -> repair/regenerate when needed
  -> prepare metadata
  -> export Adobe-compatible files
```

The application assists production; it does not automatically submit work to Adobe Stock and does not claim that research scores predict sales.

## 2. Product decisions

### In scope

- One Tauri 2 application for macOS and Windows.
- Local-first SQLite database and app-managed asset library.
- BYOK setup for supported research, text, image, metadata, and repair providers.
- Existing Thoock information architecture, tables, filters, dialogs, bulk actions, and review workflow.
- Durable local jobs with retry/recovery lineage.
- Provider request logs and application logs with automatic secret redaction.
- Import/export of opportunities and briefs through CSV.
- Prepared JPEG, Adobe CSV, manifest, and ZIP packages.
- A migration/import path from the current web version.

### Deliberately out of scope for the first desktop release

- Authentication, registration, teams, subscriptions, or multi-user permissions.
- Hosted PostgreSQL, Redis, VPS deployment, or a browser-accessible server.
- Thoock-managed provider billing, cost accounting, budgets, expense dashboards, or profit projections.
- Automatic Adobe submission, acceptance tracking, royalties, or download analytics.
- Cross-device sync and collaboration.
- Silent paid retries or provider fallback.

Provider APIs can still charge the user's own account. Before a potentially paid action, Thoock should show the provider, model, number of requests, and whether the action can be resumed or repeated. It should not calculate or promise exact spend.

## 3. Success criteria

The first production-ready desktop release is successful when a user can:

1. Install and launch Thoock on a supported macOS or Windows machine.
2. Configure at least one text/research provider and one image provider without placing keys in source files or plaintext settings.
3. Complete the full workflow from opportunity to export without a hosted backend.
4. Quit during a long-running job, relaunch, and see an accurate recoverable state.
5. Review original and current image variants without loading every full-resolution image into memory.
6. Export valid JPEG + CSV packages from approved, metadata-complete assets.
7. Back up, restore, and move a workspace without manually editing the database.

## 4. Users and operating model

The initial user is a single creator operating one local workspace. There is no sign-in screen. The operating-system account is the security boundary.

The app should support multiple workspace files later, but v1 may use one default workspace in the platform app-data directory. Every workspace owns:

- one SQLite database;
- original and current image files;
- thumbnails and previews;
- prepared export artifacts;
- non-secret preferences;
- an append-only diagnostic log directory.

Provider keys belong to the operating-system credential vault and are referenced by logical provider ID. Keys must never be stored in SQLite, JSON preferences, logs, crash reports, exported packages, or frontend state persisted to disk.

## 5. Existing product capabilities to preserve

### Dashboard

- Production-pipeline overview.
- Recent generations and review results.
- Direct navigation into research, briefing, generation, review, and delivery.
- Desktop version removes monthly-budget and expense reporting.

### Opportunities

- Search, date filtering, structured filters, sorting, and 10-row pagination.
- Explainable opportunity score and estimated-supply labeling.
- Manual entry.
- AI-assisted topic research.
- CSV import with preview and field-level validation.
- Action to create briefs from an opportunity.

### Commercial briefs

- Search, date filtering, structured filters, sorting, and 10-row pagination.
- Create one brief manually.
- Create a distinct batch with AI from an opportunity.
- CSV import with preview.
- Full editable brief detail: buyer, usage, market, scene, visual direction, prompt, negative prompt, and Adobe metadata plan.
- Selection that persists across pages and supports bulk generation.

### Image generation

- Create and history views.
- Provider/model capability selection.
- Orientation, aspect ratio, resolution, quality, prompt, and negative-prompt controls.
- Explicit confirmation before generation.
- Durable attempts, provider request IDs, retry lineage, regeneration lineage, stale-job recovery, and read-only provider result lookup.
- No automatic paid retry or paid fallback.

### Review queue

- Efficient thumbnail grid with incremental loading.
- Search and structured filters.
- Selection bar for bulk approve, reject, and AI metadata generation.
- Large review detail with technical facts, original/current lineage, compliance checklist, notes, metadata editing, download, reject, regenerate, and approve.
- Provider logo removal can replace the current canonical image while preserving the original.

### Adobe exports

- Prepare-package and export-history views.
- Search, filters, pagination, persistent cross-page selection, and package naming.
- JPEG preparation, metadata validation, CSV generation, manifest, compliance report, and ZIP archive.
- Export history means local package history only—not submission or acceptance.

### Provider logs and application logs

- Provider, model, operation, status, duration, date, and request-type filters.
- Redacted request/response detail.
- Correlation IDs linking user actions, jobs, provider requests, and errors.
- Rotating local JSON-lines application logs suitable for support bundles.

### Settings

- Provider configuration and connection testing.
- Default provider/model choices.
- Storage location and workspace size.
- Compliance preferences and prohibited terms.
- Diagnostics, backup, restore, and data migration.
- Desktop version omits cost and budget settings.

## 6. UX and interaction requirements

### Window and navigation

- Default window: 1440 × 960, resizable, minimum 1120 × 720.
- Preserve the grouped sidebar: Dashboard, Research, Production, Delivery, System.
- Respect macOS traffic-light safe areas and Windows title-bar controls.
- Use native file/folder dialogs for imports, exports, backup, restore, and storage relocation.
- Keep keyboard access and visible focus states for every control.
- Use `Cmd+K` on macOS and `Ctrl+K` on Windows for the command palette.

### Tables and pagination

- Default page size is 10 wherever numbered pagination is used.
- Search, date range, structured filters, sorting, results, and pagination belong to one visual table card.
- Selection is entity-ID based, not row-index based, and persists when the user changes pages.
- A page checkbox affects only the visible page; the selected-total count remains global.
- Destructive or provider-backed bulk actions always require confirmation.

### Dialogs

- Dialog state must have a stable route/deep-link representation where the current web app already exposes one.
- Opening a nested confirmation must stack above the detail dialog and restore focus when closed.
- Escape closes only the topmost transient layer.
- Long forms scroll inside the dialog while their header and action footer remain visible.
- Do not hide provider errors behind generic failures; show a concise message with a route to the relevant log.

### Feedback

- Every mutation shows a typed toast: success, error, warning, or info.
- Toasts and the review bulk-action bar use restrained enter/exit motion and honor reduced-motion preferences.
- Long actions expose queued/running/succeeded/failed states and remain visible after navigation.

## 7. Recommended architecture

```text
React renderer (Vite)
  -> typed frontend services
      -> Tauri invoke/events
          -> Rust application services
              -> domain rules
              -> provider adapters (reqwest)
              -> durable job runner (Tokio)
              -> image/metadata/export pipeline
              -> SQLite repositories (SQLx)
              -> scoped filesystem storage
              -> OS credential vault
```

### Frontend responsibilities

- Presentation, routing, form state, optimistic interaction, and accessibility.
- Zod validation for immediate form feedback and import previews.
- Query/cache layer for read models; TanStack Query is recommended.
- No direct provider calls, credential handling, unrestricted filesystem access, or SQL.

### Rust responsibilities

- All durable mutations and provider calls.
- SQLite transactions and migrations.
- Job claiming, recovery, idempotency, cancellation, and progress events.
- Filesystem paths, atomic writes, checksums, image inspection, thumbnails, previews, metadata embedding, and archives.
- Credential-vault reads/writes.
- Log redaction and support-bundle construction.

### Module boundaries

```text
src/
  app/                 router, shell, providers
  features/            opportunities, briefs, generation, review, exports, logs, settings
  components/          shared product UI and primitives
  lib/                 schemas, formatting, desktop client, query keys

src-tauri/src/
  commands/            thin Tauri command boundary
  domain/              scoring, review gates, metadata and workflow rules
  application/         use cases and orchestration
  persistence/         SQLite repositories and migrations
  providers/           OpenAI, Gemini, SnapGenAI, imports, and test doubles
  jobs/                durable queue, recovery, cancellation, progress
  assets/              canonical variants, thumbnails, metadata, export preparation
  security/            credential vault, redaction, capability helpers
  observability/       structured logs, correlation IDs, support bundles
```

Commands should accept and return versioned DTOs. Do not expose one generic SQL, HTTP, shell, or filesystem command to the renderer.

## 8. Tauri security baseline

- Use Tauri 2 capabilities with the smallest permission set per window.
- Remove `opener:default`; permit only explicitly required URLs and file locations.
- Configure a restrictive CSP. Do not leave `app.security.csp` as `null` for release.
- Disable remote content in the main webview. Provider images must be downloaded by Rust and served through an app-owned asset protocol or converted to local previews.
- Store keys with an audited keyring/credential plugin backed by macOS Keychain and Windows Credential Manager.
- Never pass a raw API key to the renderer.
- Reject redirects from provider endpoints to unapproved schemes/hosts.
- Validate every imported file by size, extension, actual MIME/format, and parse result.
- Generate filenames inside the application and prevent traversal outside scoped workspace/export directories.
- Avoid shell execution. If a future image tool requires a sidecar, use a fixed signed binary and fixed argument schema.
- Redact authorization headers, cookies, API keys, tokens, passwords, and known secret values before logging.

## 9. Local data model

Use SQLite in WAL mode with foreign keys enabled and numbered embedded migrations.

Preserve the current domain concepts:

- opportunities and opportunity signals;
- commercial briefs;
- model capabilities;
- generation jobs and attempt lineage;
- provider request logs;
- generated assets and derived assets;
- reviews and quality checks;
- asset metadata;
- export batches and batch items;
- prohibited terms and application settings.

Desktop-specific additions:

- `workspace_info`: schema version, workspace UUID, created/app version;
- `job_leases`: worker ownership and heartbeat for crash recovery;
- `asset_variants`: original, current canonical, thumbnail, preview, export JPEG;
- `credential_refs`: provider ID plus vault-entry name only;
- `migration_imports`: source manifest, checkpoint, status, and errors.

Do not persist costs or expenses in the desktop UI. Existing imported cost columns may be ignored or retained only as opaque historical data during migration.

## 10. Storage and image strategy

Recommended workspace layout:

```text
Thoock/
  thoock.sqlite3
  assets/
    originals/<asset-id>.<ext>
    current/<asset-id>.<ext>
    thumbnails/<asset-id>-320.jpg
    previews/<asset-id>-1600.jpg
  exports/<batch-id>/
  logs/
  backups/
```

Rules:

- Keep one immutable original and one current canonical result per asset.
- A successful repair/logo-removal atomically replaces the current canonical pointer; it does not create another permanent full-resolution history copy by default.
- Store thumbnails and previews separately and regenerate them when the current canonical asset changes.
- The review grid loads 320/640-pixel thumbnails; the review modal loads a bounded preview; full-resolution bytes load only for zoom, download, processing, or export.
- Use content hashes to deduplicate identical bytes.
- Write to a temporary sibling file, fsync where practical, then rename atomically.
- Clean abandoned temporary files during startup recovery.
- Provide workspace size by category and a safe cache-rebuild action.

Preferred Rust libraries should be validated in a spike. Likely choices are `image`/`fast_image_resize` for decoding and variants, `kamadak-exif` or equivalent for inspection, `sha2` for checksums, `csv` for metadata, and `zip` for packages. If a required JPEG metadata operation is not reliable cross-platform, isolate it behind an `ImageProcessor` trait and use a signed sidecar only for that operation.

## 11. Durable jobs

Provider operations must not depend on a React component staying mounted.

1. A Tauri command validates input and creates a queued job in SQLite.
2. A single Rust worker claims the job transactionally.
3. The worker records the provider request ID as soon as it exists.
4. Progress is committed and emitted through a typed Tauri event.
5. Completion writes assets and final state in one coordinated transaction/atomic-file sequence.
6. On launch, expired running leases become interrupted and are reconciled.

Paid or ambiguous interrupted requests are never reissued automatically. The user may run a read-only provider lookup, mark the attempt interrupted, or confirm a new linked retry.

## 12. BYOK provider design

Provider categories:

- Research: deterministic local mock, OpenAI, Gemini.
- Brief/prompt/metadata: deterministic local rules, OpenAI, Gemini.
- Image generation: import, SnapGenAI, and any adapters retained after capability verification.
- Repair/logo removal: provider-specific adapter where supported.

Each adapter implements a narrow trait and returns a normalized domain response. The UI reads a capability catalog rather than branching on provider names.

Settings flow:

1. User enables a provider.
2. User enters a key into a password field.
3. Rust stores it in the OS credential vault.
4. A test command makes a minimal, non-destructive request.
5. The UI stores only status, last-tested time, and selected defaults.

Provide clear “Remove key” and “Test connection” actions. Never reveal an existing full key; at most show a short non-reversible hint.

## 13. Cross-platform requirements

| Area | macOS | Windows |
|---|---|---|
| Credential vault | Keychain | Credential Manager |
| Bundle | signed `.app`/`.dmg` | signed MSI or NSIS installer |
| Release trust | Developer ID + notarization | code-signing certificate + SmartScreen reputation |
| Shortcuts | Command | Control |
| App data | `Application Support/Thoock` | `%APPDATA%\\Thoock` |
| File names | normalize Unicode, reject `/` and `:` | also reject reserved names and `<>:"/\\|?*` |
| Path length | test deep workspace paths | support long paths and keep internal paths short |
| Webview | WKWebView | WebView2 runtime |

CI must build and test on both `macos-latest` and `windows-latest`. Do not assume case-sensitive paths, Unix separators, shell utilities, symlinks, or executable file modes.

## 14. Migration from the current web app

Do not connect the desktop app directly to the existing PostgreSQL database.

Create a versioned migration bundle from the web app:

```text
thoock-migration-v1.zip
  manifest.json
  opportunities.jsonl
  briefs.jsonl
  jobs.jsonl
  assets.jsonl
  reviews.jsonl
  metadata.jsonl
  provider-logs.jsonl
  files/<content-hash>.<ext>
```

Desktop import must:

- validate the manifest and checksums before mutation;
- show record/file counts and required disk space;
- import into a temporary database and staging asset directory;
- map IDs without losing attempt or asset lineage;
- omit users, sessions, passwords, environment variables, and provider keys;
- allow retry from a checkpoint;
- atomically activate the imported workspace only after validation succeeds.

## 15. Testing strategy

- Rust unit tests for scoring, metadata validation, path safety, redaction, job transitions, and export rules.
- Repository integration tests against a temporary SQLite database.
- Provider contract tests using recorded redacted fixtures and deterministic mock adapters.
- Image golden tests for dimensions, orientation, thumbnails, current-variant replacement, metadata, and ZIP output.
- React component tests for forms, selection across pagination, dialogs, toasts, and error recovery.
- Tauri command integration tests for typed DTOs and capability boundaries.
- End-to-end smoke flows on macOS and Windows: setup, research, brief, generation mock/import, review, export, restart recovery, backup/restore.
- Performance gates for a 500-asset review queue and a 5,000-row job/log history.

## 16. Delivery plan

### Phase 0 — foundation spike

- Finalize app identifier, product name, 1440 × 960 window, CSP, and minimal capabilities.
- Prove SQLite migrations, credential vault, scoped file access, thumbnail generation, and one signed provider request on both platforms.
- Decide the image-metadata implementation before migrating UI.

### Phase 1 — local workspace and shell

- App shell, theme, command palette, typed command client, toasts, logs, settings, workspace initialization, backup/restore.

### Phase 2 — research and briefs

- Opportunities, scoring, AI/manual/CSV flows, brief batch/manual/import/edit, filters, pagination, and cross-page selection.

### Phase 3 — generation and jobs

- Capability catalog, BYOK providers, durable runner, confirmation, history, provider lookup, retry, regeneration, and provider logs.

### Phase 4 — review and storage

- Thumbnail grid, review detail, human checklist, current-asset replacement, metadata, bulk actions, performance profiling.

### Phase 5 — exports and migration

- Adobe package preparation, history, migration bundle import, validation reports, and recovery testing.

### Phase 6 — release hardening

- macOS signing/notarization, Windows signing/installers, upgrade testing, support bundle, crash recovery, accessibility, and performance gates.

Automatic updates should be added only after signing and rollback strategy are proven. Release v1 can use explicit signed downloads.

## 17. Definition of done

- No credential or secret appears in git, frontend bundles, SQLite, logs, screenshots, migration bundles, or export packages.
- Tauri capabilities and CSP are explicit and audited.
- All durable mutations are Rust commands with typed inputs and errors.
- Selection remains correct across pagination.
- Every provider-backed action has confirmation, progress, final toast, and a correlated log.
- One original and one current canonical full-resolution asset are retained; derivatives are rebuildable.
- Interrupted jobs recover without accidental duplicate requests.
- Review and export flows handle at least 500 assets smoothly.
- macOS and Windows CI builds pass from a clean checkout.
- Signed installers launch on clean supported machines.
- Backup/restore and migration are verified with real representative workspaces.

## 18. Visual reference

The complete page and modal reference set is indexed in [`docs/screenshots/README.md`](screenshots/README.md). Treat these images as behavioral references, not pixel-perfect constraints: preserve information hierarchy, terminology, actions, validation, and state transitions while adapting title-bar spacing, shortcuts, and native dialogs to each operating system.
