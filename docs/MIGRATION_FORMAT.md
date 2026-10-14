# Web-to-desktop migration format

Migration accepts a version 1 ZIP of normalized records and images. The CLI packages an already normalized directory; it does not connect to a web database or infer an undocumented legacy schema.

## Source directory

```text
normalized-source/
  opportunities.jsonl
  briefs.jsonl
  jobs.jsonl
  assets.jsonl
  reviews.jsonl
  metadata.jsonl
  provider-logs.jsonl
  files/
    original-image.png
    current-image.png
```

Each JSONL line contains one object. Empty lines are ignored. Missing record files have a count of zero. Record fields use camelCase. Domain definitions in [domain.rs](../src-tauri/src/domain.rs) and source asset/review/metadata definitions in [migration.rs](../src-tauri/src/migration.rs) are the authoritative schemas.

| File          | Record shape                                                                                                                                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| opportunities | `Opportunity`: source ID, topic, buyer, market, demand, competition, commercialFit, notes, score, createdAt.                                                                                                                |
| briefs        | `Brief`: source ID, optional opportunityId, commercial brief fields, createdAt.                                                                                                                                             |
| jobs          | `Job`: attempt ID, operation/status/message/timestamps, provider/model, optional requestId and parentId, progress, resultIds, outputCount. Optional `input` uses the tagged `Task` schema for recovery or explicit retries. |
| assets        | `{id, briefId, sourceJobId, name, originalFile, currentFile}`. Optional references and currentFile can be null. Files use relative `files/…` paths.                                                                         |
| reviews       | `{assetId, decision, checklist, notes}` using the `Checklist` fields in domain.rs.                                                                                                                                          |
| metadata      | `{assetId, title, keywords, category}`. Keywords are a JSON array.                                                                                                                                                          |
| provider-logs | `Log`: normalized historical event fields; raw request and response payloads are omitted.                                                                                                                                   |

Keep foreign references as source IDs. Import maps them consistently to local UUIDs. Unsupported record shapes fail validation rather than silently importing incomplete data.

## Package

```bash
npm run migration:pack -- ./normalized-source ./new-migration.zip
```

The packer writes a new file and refuses to overwrite an existing ZIP. It normalizes supported DTO fields, drops legacy cost fields and unknown payloads where permitted, redacts credential fields, and replaces provider log payloads with safe historical summaries. Strict source asset, review, metadata, and task schemas reject unknown fields. Remove secrets from the source before packaging; do not include settings files, environment files, or credential exports.

The generated `manifest.json` contains:

```json
{
  "format": "thoock-migration",
  "version": 1,
  "counts": {
    "opportunities": 1,
    "briefs": 0,
    "jobs": 0,
    "assets": 0,
    "reviews": 0,
    "metadata": 0,
    "provider-logs": 0
  },
  "files": [
    {
      "path": "opportunities.jsonl",
      "sha256": "<64 hexadecimal characters>",
      "bytes": 123
    }
  ]
}
```

The packer computes actual lengths and SHA-256 hashes. The example placeholders describe the format; do not use it as a literal manifest.

## Preview and activation

Settings → Storage → Preview migration validates the format, entry names, checksums, sizes, and record counts. Archives reject traversal, symbolic links, undeclared entries, duplicate names, more than 100,000 entries, files over 100 MB, or content over 20 GB.

Confirming import builds a separate staged workspace with import checkpoints. Assets pass through the desktop image pipeline. Queued and running historical attempts become interrupted so import cannot issue paid requests. Approved historical assets must satisfy desktop metadata and human-check rules or return to pending review.

Restart activates the staged workspace and retains the previous one. Provider keys are not imported. Configure credentials again in Settings. Validate record counts, lineage, representative image previews, metadata, and export packages before using the imported workspace for production.

Opportunities and briefs optionally include the typed `details` object defined in domain.rs. Review checklists optionally include `referenceChecks` for the nine detailed checks; when present all nine are required for approval, alongside the existing four summary checks. Historical records without these additive objects remain readable.
