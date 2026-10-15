# Implementation status

Updated 2026-10-14. This is a functional v0.1 developer build. Release acceptance still requires the checks listed below.

## Implemented workflow

- Dashboard with workspace counts, navigation, hash-based modal routes, and keyboard command palette.
- Opportunities and commercial briefs: manual editing, local or provider-assisted creation, scoring, search, filters, pagination, selection across pages, and validated atomic CSV imports.
- Generation: capability-based SnapGen Nano Banana and Grok requests, local test images, confirmed single and batch submissions, progress, history scoped to image generation jobs, persisted request IDs, linked attempts, interruption handling, explicit retries, and read-only result reconciliation.
- Review: bounded thumbnails and previews, original preview and download, metadata drafts using OpenAI or Gemini, nine human checks plus explicit AI disclosure review, approval and rejection, review history, regeneration, and confirmed logo removal for verified single-output Nano Banana requests.
- Delivery: approved-asset selection, JPEG conversion to sRGB, embedded metadata, Adobe CSV, checksum manifest, compliance report, package history, and saved ZIP copies.
- Settings: persistent Light/Dark/System appearance with native window synchronization, native credential vault, provider connection tests, defaults, static OpenAI/Gemini model selectors shared with all text workflows, prohibited terms, backup/restore, relocation, preview rebuilding, migration preview/staging, and redacted support bundles.
- Logs: bounded safe request and response summaries, status filters, correlation IDs, rotated JSONL files, and no raw provider payloads or credentials.

## Persistence and request behavior

Rust owns SQLite, files, credentials, networking, and export validation behind typed Tauri commands. Numbered migrations currently reach schema 4. Assets retain immutable originals; canonical repairs replace the current version and reset approval and human checks. Review edits preserve prior and current metadata and decisions.

A workspace permits one process owner. Confirmed queued jobs are durable. Running jobs become interrupted after restart; they are never automatically resubmitted. Provider HTTP retries are disabled. A stored provider request ID enables read-only reconciliation. Explicit retries create linked new attempts. Staged workspace replacement freezes edits and requires restart; the previous workspace is retained.

The browser preview uses an empty read-only snapshot. Browser integration tests inject synthetic IPC responses to test large collections; they do not verify the native bridge or live providers.

## Verified locally

- TypeScript checking and production Vite build.
- Seven UI unit tests: selection across pages, filtering, nested dialog focus, writable IPC field validation, and numeric column sorting before pagination.
- Thirty-eight Rust tests on macOS: scoring, job claims and restart behavior, credential redaction, verified credential saves, safe vault diagnostics and native OSStatus classification, provider fixtures and signed R2/Worker download-host validation, CSV atomicity, image orientation and color conversion, canonical replacement, readable export packages, workspace locking, backups, relocation, and migration checksums and round trips.
- Twenty browser tests: navigation and modals, layouts at 1440/1120/900/720 px, fixed dialog actions at short heights, staged filters, keyboard tabs, reduced motion, select sizing across pages and dialogs, reference form fields, removable filter chips, five-column review, demo data navigation and mutation isolation, bounded rendering with 500 assets and 5,000 jobs, dark appearance across pages, dialogs, reloads, and system changes, provider credential save failure/retry/status behavior, generation history isolation from research, briefs, metadata, and export jobs, model selection/provider defaults/exact queued model IDs across text workflows, and custom calendars with keyboard focus, range limits, leap days, clearing, short dark viewports, sortable table headings, and square review controls with fixed selection actions at desktop and narrow widths, including proportional bulk-action sizing as workspace width decreases.
- Shared skeuomorphic materials, reference dialog families, and container-based layout behavior are documented in [the desktop design system](DESIGN_SYSTEM.md).
- macOS ARM64 debug application packaging with an ad hoc bundle signature and strict signature verification. Runtime vault prompts and live provider requests have not been exercised successfully.

## Provider and delivery contracts

SnapGen adapters use the documented multipart Nano Banana and Grok generation endpoints, history polling, and history-based logo removal. See [Nano Banana](https://docs.snapgen.ai/resources/0.image-generation), [Grok](https://docs.snapgen.ai/resources/1.grok_image), [history](https://docs.snapgen.ai/resources/history-apis), and [logo removal](https://docs.snapgen.ai/resources/logo-removal).

The image-download allowlist also includes `7a4964de26acd06ff740870066a92ff8.r2.cloudflarestorage.com`, observed in a user-provided SnapGen completed-image URL on 2026-10-14. This is an exact Cloudflare R2 account endpoint, following [R2's S3 endpoint format](https://developers.cloudflare.com/r2/api/s3/api/). Signed query parameters remain intact for the download and are excluded from errors; rejected-host errors report only the hostname. Downloads use HTTPS without provider authorization headers or automatic redirects. Existing interrupted jobs can recover these images through Check result using the saved request ID. Fixture validation covers the account host and lookalikes; a live recovery still requires the native app's configured credential.

SnapGen's `file_download_url` can instead use `geminigen-cloudflare-file-download-worker-prd.blue-bar-0e5f.workers.dev`, observed in the native download error on 2026-10-14. This exact Worker is approved too; other Workers remain excluded. A regression fixture contains both the Worker download URL and the R2 image URL and verifies the app's download-field priority. The Worker hostname responds over HTTPS; an object download has not been verified here. Failed downloads now include the HTTP status without exposing the URL or response body.

Text adapters use [OpenAI Responses structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) and [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output). Fixture checks cover valid JSON, incomplete responses, and refusals. Availability depends on the configured account and model.

Exports enforce 4–100 megapixels, JPEG sRGB, and a 45 MB file ceiling, matching [Adobe photo requirements](https://helpx.adobe.com/nz/stock/contributor/submit-your-content/submit-photos/technical-legal-requirements-photo-submission.html). CSV filenames stay below 30 characters, titles use plain text up to 70 characters, and files stay below 1 MB, following [Adobe CSV requirements](https://helpx.adobe.com/stock/contributor/manage-your-portfolio/csv-requirements-content.html). The app uses a conservative 5–49 distinct keyword range. These stricter delivery constraints supersede older title guidance in the original brief.

Human review remains necessary for rights, recognizable people or property, generated-content declarations, releases, and submission suitability. The ZIP is a preparation artifact; it does not submit content to Adobe.

## Remaining release gates

1. Exercise native startup, dialogs, vault save/test/remove, missing-drive recovery, and restart activation on installed macOS and Windows builds.
2. Verify live BYOK generation, text batches, metadata, delayed completion, interrupted recovery, and paid logo removal with configured provider accounts. No paid requests were sent during implementation.
3. Run representative web-to-desktop migration against actual source records. The packer accepts the documented normalized format; a source-specific database extractor has not been implemented.
4. Run Windows CI and verify installation, file locking, vault access, exports, and recovery. The workflow is configured but has not run in this workspace.
5. Produce signed macOS and Windows releases, notarize macOS distribution, and verify upgrade/rollback and installer behavior. No signing credentials were used.
6. Benchmark production-sized workspaces, image conversion, backup/restore, and native memory usage on target hardware. Browser scale checks measure rendering only.

The restored reference forms persist additive details in existing JSON records. Older records still decode. Recovery accepts a manually supplied SnapGen UUID for an attempt without a saved ID and rejects replacement of an existing ID; automatic matching against recent history when the ID is missing remains unimplemented.

Credential saves now verify the key through an independently created vault entry before recording success. Connection-test vault failures distinguish missing entries from access failures and write only normalized diagnostic facts. An existing database reference cannot recover a key that is missing from the OS vault; that key must be saved again. The isolated native probe was blocked by macOS authorization in the execution environment, so successful native save/read and user-facing authorization prompts still require runtime verification.
