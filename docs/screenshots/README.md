# Thoock Desktop visual reference

This directory records the current Thoock information architecture and interaction states before the Tauri implementation begins.

Screenshot images are local references and are excluded from Git because page captures may contain private workspace data. The index is versioned; image links resolve only in a local checkout that has the reference collection.

- Page screenshots come from the existing Thoock product and show representative populated states.
- Modal screenshots use the real React components with local, sanitized fixture records. They do not contain provider keys, environment values, browser credentials, or private request content.
- Native file/folder pickers are not reproduced. The Tauri app should use the operating-system picker on macOS and Windows.
- Transient select menus, tooltips, date popovers, toasts, and the command palette should reuse the shared desktop primitives described in the product brief.

## Main pages

| Area | Reference |
|---|---|
| Dashboard | [dashboard.png](pages/dashboard.png) |
| Opportunities | [opportunities.png](pages/opportunities.png) |
| Commercial briefs | [commercial-briefs.png](pages/commercial-briefs.png) |
| Generation — create | [image-generation-create.png](pages/image-generation-create.png) |
| Generation — history | [image-generation-history.png](pages/image-generation-history.png) |
| Review queue | [review-queue.png](pages/review-queue.png) |
| Adobe exports — prepare | [adobe-exports-prepare.png](pages/adobe-exports-prepare.png) |
| Adobe exports — batches | [adobe-exports-batches.png](pages/adobe-exports-batches.png) |
| Provider logs | [provider-logs.png](pages/provider-logs.png) |
| Settings | [settings.png](pages/settings.png) |

## Opportunity flow

| State | Reference | Expected transition |
|---|---|---|
| Structured filters | [opportunities-filter.png](modals/opportunities-filter.png) | Apply writes filter state and refreshes page 1. |
| Add method | [opportunities-add-choice.png](modals/opportunities-add-choice.png) | User chooses manual or AI. |
| Manual opportunity | [opportunities-add-manual.png](modals/opportunities-add-manual.png) | Validate, save, toast, refresh. |
| AI research | [opportunities-research-ai.png](modals/opportunities-research-ai.png) | Confirm provider-backed research, save normalized topics, toast. |
| CSV import | [opportunities-import-csv.png](modals/opportunities-import-csv.png) | File/paste, validate preview, all-or-nothing import. |

## Commercial brief flow

| State | Reference | Expected transition |
|---|---|---|
| Structured filters | [briefs-filter.png](modals/briefs-filter.png) | Apply writes filter state and refreshes page 1. |
| Add method | [briefs-add-choice.png](modals/briefs-add-choice.png) | User chooses manual or AI. |
| Manual brief | [briefs-add-manual.png](modals/briefs-add-manual.png) | Save structured direction, prompt, and metadata plan. |
| AI brief batch | [briefs-create-ai.png](modals/briefs-create-ai.png) | Generate distinct concepts under one opportunity. |
| CSV import | [briefs-import-csv.png](modals/briefs-import-csv.png) | Validate opportunity references and import atomically. |
| Detail/editor | [briefs-edit-detail.png](modals/briefs-edit-detail.png) | Edit and save without losing list context. |
| Bulk generation confirmation | [briefs-bulk-generation-confirm.png](modals/briefs-bulk-generation-confirm.png) | One confirmed image request per eligible selected brief. |

## Generation flow

| State | Reference | Expected transition |
|---|---|---|
| Generation confirmation | [generation-confirm.png](modals/generation-confirm.png) | Create a durable job only after explicit confirmation. |
| History filters | [generation-history-filter.png](modals/generation-history-filter.png) | Filter attempts by status, provider, result, date, and recovery state. |
| Read-only provider recovery | [generation-check-provider-result.png](modals/generation-check-provider-result.png) | Look up a saved/requested provider result without generating again. |
| Retry confirmation | [generation-retry-confirm.png](modals/generation-retry-confirm.png) | Create a linked attempt; never overwrite the failed attempt. |

## Review flow

| State | Reference | Expected transition |
|---|---|---|
| Review filters | [review-filter.png](modals/review-filter.png) | Filter by decision, brief, technical status, provider, metadata, and date. |
| Review detail | [review-detail.png](modals/review-detail.png) | Inspect current asset, complete checks, edit metadata, and decide. |
| Regeneration confirmation | [review-regenerate-confirm.png](modals/review-regenerate-confirm.png) | Create a linked generation attempt using copied settings. |
| Sticky bulk action bar | [review-bulk-actions.png](modals/review-bulk-actions.png) | Appears only while one or more image IDs are selected. |
| Bulk approval | [review-bulk-approve-confirm.png](modals/review-bulk-approve-confirm.png) | Confirm checks/metadata requirements before approving. |
| Bulk AI metadata | [review-bulk-ai-metadata-confirm.png](modals/review-bulk-ai-metadata-confirm.png) | Confirm one BYOK provider request per selected image. |
| Bulk rejection | [review-bulk-reject-confirm.png](modals/review-bulk-reject-confirm.png) | Confirm destructive review decision and preserve history. |

## Export flow

| State | Reference | Expected transition |
|---|---|---|
| Prepare filters | [exports-prepare-filter.png](modals/exports-prepare-filter.png) | Filter approved assets by package history and date. |
| Batch-history filters | [exports-batches-filter.png](modals/exports-batches-filter.png) | Filter packages by status and created date. |

## Observability flow

| State | Reference | Expected transition |
|---|---|---|
| Provider-log filters | [provider-logs-filter.png](modals/provider-logs-filter.png) | Filter by provider, model, operation, status, duration, type, and date. |
| Provider request details | [provider-log-request-details.png](modals/provider-log-request-details.png) | Show redacted request/response, IDs, timing, error, and correlation context. |

## Modal implementation checklist

Every Tauri implementation of these states must preserve:

- a unique accessible title and description;
- focus trap and focus restoration;
- Escape closes only the topmost layer;
- fixed header/footer with an independently scrolling long body;
- disabled/loading states during submission;
- typed success/error/warning/info toast after completion;
- explicit confirmation for provider-backed, destructive, retry, regeneration, and bulk operations;
- no provider secret or authorization value rendered to the webview;
- responsive sizing at the minimum supported window size.
