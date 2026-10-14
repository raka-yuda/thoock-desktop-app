//! Versioned web-to-desktop import. Source IDs are mapped to safe local UUIDs.
use crate::{
    assets,
    domain::*,
    persistence::{record, serialize, Workspace},
};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    io::Read,
    path::{Path, PathBuf},
};
use zip::ZipArchive;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManifestFile {
    pub path: String,
    pub sha256: String,
    pub bytes: u64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
    pub format: String,
    pub version: u32,
    pub counts: BTreeMap<String, usize>,
    pub files: Vec<ManifestFile>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationPreview {
    pub id: String,
    pub counts: BTreeMap<String, usize>,
    pub bytes: u64,
    pub required_bytes: u64,
    pub status: String,
}
#[derive(Serialize, Deserialize)]
struct ImportState {
    path: PathBuf,
    manifest: Manifest,
    preview: MigrationPreview,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SourceAsset {
    id: String,
    brief_id: Option<String>,
    source_job_id: Option<String>,
    name: String,
    original_file: String,
    current_file: Option<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SourceMetadata {
    asset_id: String,
    title: String,
    keywords: Vec<String>,
    category: u8,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SourceReview {
    asset_id: String,
    decision: String,
    checklist: Checklist,
    notes: String,
}
const PARTS: [&str; 7] = [
    "opportunities",
    "briefs",
    "jobs",
    "assets",
    "reviews",
    "metadata",
    "provider-logs",
];
fn safe_name(name: &str) -> bool {
    !name.contains('\\')
        && !name.contains(':')
        && Path::new(name)
            .components()
            .all(|c| matches!(c, std::path::Component::Normal(_)))
        && (name.starts_with("files/") || PARTS.iter().any(|p| name == format!("{p}.jsonl")))
}
fn hash_file(path: &Path) -> Result<String> {
    let mut file = fs::File::open(path)?;
    let mut digest = Sha256::new();
    let mut buffer = [0; 65536];
    loop {
        let size = file.read(&mut buffer)?;
        if size == 0 {
            break;
        }
        digest.update(&buffer[..size]);
    }
    Ok(format!("{:x}", digest.finalize()))
}
pub fn preview(workspace: &Workspace, path: PathBuf) -> Result<MigrationPreview> {
    workspace.ensure_writable()?;
    let mut zip = ZipArchive::new(fs::File::open(&path)?)?;
    if zip.len() > 100_000 {
        return Err(AppError::validation(
            "The migration bundle contains too many files.",
        ));
    }
    let manifest: Manifest =
        serde_json::from_reader(zip.by_name("manifest.json")?.take(4 * 1024 * 1024))?;
    if manifest.format != "thoock-migration" || manifest.version != 1 {
        return Err(AppError::validation("Unsupported migration manifest."));
    }
    if manifest.counts.keys().any(|k| !PARTS.contains(&k.as_str()))
        || manifest.counts.values().any(|n| *n > 100_000)
    {
        return Err(AppError::validation("Invalid migration record counts."));
    }
    let mut declared = HashSet::new();
    let mut total = 0u64;
    for file in &manifest.files {
        if !safe_name(&file.path)
            || !declared.insert(file.path.to_lowercase())
            || file.sha256.len() != 64
            || !file.sha256.bytes().all(|b| b.is_ascii_hexdigit())
        {
            return Err(AppError::validation("Unsafe or duplicate manifest entry."));
        }
        if file.bytes > 100 * 1024 * 1024 {
            return Err(AppError::validation(
                "Migration files must be at most 100 MB each.",
            ));
        }
        let mut entry = zip.by_name(&file.path)?;
        if entry.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000) || entry.size() != file.bytes
        {
            return Err(AppError::validation(
                "A migration file has an invalid size or type.",
            ));
        }
        let mut digest = Sha256::new();
        let mut buffer = [0; 65536];
        loop {
            let size = entry.read(&mut buffer)?;
            if size == 0 {
                break;
            }
            digest.update(&buffer[..size]);
        }
        if format!("{:x}", digest.finalize()) != file.sha256.to_ascii_lowercase() {
            return Err(AppError::validation(
                "A migration file checksum does not match its manifest.",
            ));
        }
        total = total
            .checked_add(file.bytes)
            .ok_or_else(|| AppError::validation("Migration size overflow."))?;
        if total > 20 * 1024 * 1024 * 1024 {
            return Err(AppError::validation(
                "Migration bundles larger than 20 GB are not supported.",
            ));
        }
    }
    if zip.len() != declared.len() + 1 {
        return Err(AppError::validation(
            "Every migration file must be declared in the manifest.",
        ));
    }
    for index in 0..zip.len() {
        let file = zip.by_index(index)?;
        if file.name() != "manifest.json" && !declared.contains(&file.name().to_lowercase()) {
            return Err(AppError::validation("Unexpected migration archive entry."));
        }
    }
    let preview = MigrationPreview {
        id: hash_file(&path)?,
        counts: manifest.counts.clone(),
        bytes: total,
        required_bytes: total.saturating_mul(2),
        status: "validated".into(),
    };
    let state = ImportState {
        path,
        manifest,
        preview: preview.clone(),
    };
    workspace.conn()?.execute("INSERT INTO migration_imports VALUES (?1, ?2, 'validated') ON CONFLICT(id) DO UPDATE SET data=excluded.data", params![preview.id, serialize(&state)?])?;
    Ok(preview)
}
pub fn pack(source: &Path, destination: &Path) -> Result<()> {
    use std::io::Write;
    if destination.exists() {
        return Err(AppError::validation(
            "Choose a new filename for the migration bundle.",
        ));
    }
    let mut manifest = Manifest {
        format: "thoock-migration".into(),
        version: 1,
        counts: BTreeMap::new(),
        files: vec![],
    };
    let parent = destination
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    let mut zip = zip::ZipWriter::new(temporary.as_file_mut());
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    for part in PARTS {
        let path = source.join(format!("{part}.jsonl"));
        if !path.exists() {
            manifest.counts.insert(part.into(), 0);
            continue;
        }
        if path.symlink_metadata()?.file_type().is_symlink()
            || fs::metadata(&path)?.len() > 100 * 1024 * 1024
        {
            return Err(AppError::validation("Unsafe or oversized source records."));
        }
        let content = fs::read_to_string(path)?;
        let mut output = vec![];
        let mut count = 0;
        for line in content.lines().filter(|line| !line.trim().is_empty()) {
            let mut row: serde_json::Value = serde_json::from_str(line)?;
            crate::observability::redact_value(&mut row, &[]);
            if part == "provider-logs" {
                row["message"] = serde_json::json!("Historical request; raw payload omitted.");
                row["requestSummary"] = serde_json::Value::Null;
                row["responseSummary"] = serde_json::Value::Null;
            }
            // Serialize only the documented DTO fields, dropping legacy costs and raw payloads.
            row = match part {
                "opportunities" => {
                    serde_json::to_value(serde_json::from_value::<Opportunity>(row)?)?
                }
                "briefs" => serde_json::to_value(serde_json::from_value::<Brief>(row)?)?,
                "jobs" => {
                    let input = row
                        .get("input")
                        .filter(|v| !v.is_null())
                        .cloned()
                        .map(serde_json::from_value::<Task>)
                        .transpose()?;
                    let mut job: Job = serde_json::from_value(row)?;
                    job.message =
                        "Imported historical attempt; raw provider content omitted.".into();
                    let mut value = serde_json::to_value(job)?;
                    if let Some(input) = input {
                        value["input"] = serde_json::to_value(input)?;
                    }
                    value
                }
                "assets" => serde_json::to_value(serde_json::from_value::<SourceAsset>(row)?)?,
                "reviews" => serde_json::to_value(serde_json::from_value::<SourceReview>(row)?)?,
                "metadata" => serde_json::to_value(serde_json::from_value::<SourceMetadata>(row)?)?,
                _ => serde_json::to_value(serde_json::from_value::<Log>(row)?)?,
            };
            let bytes = serde_json::to_vec(&row)?;
            fn secret_pattern(value: &serde_json::Value) -> bool {
                match value {
                    serde_json::Value::String(s) => s.split_whitespace().any(|word| {
                        let token =
                            word.trim_matches(|c: char| !c.is_ascii_alphanumeric() && c != '-');
                        (token.starts_with("sk-") || token.starts_with("AIza")) && token.len() > 12
                    }),
                    serde_json::Value::Array(items) => items.iter().any(secret_pattern),
                    serde_json::Value::Object(map) => map.values().any(secret_pattern),
                    _ => false,
                }
            }
            if secret_pattern(&row) {
                return Err(AppError::validation(
                    "Remove provider credentials from source records before packaging.",
                ));
            }
            output.extend_from_slice(&bytes);
            output.push(b'\n');
            count += 1;
        }
        let name = format!("{part}.jsonl");
        manifest.counts.insert(part.into(), count);
        manifest.files.push(ManifestFile {
            path: name.clone(),
            sha256: format!("{:x}", Sha256::digest(&output)),
            bytes: output.len() as u64,
        });
        zip.start_file(name, options)?;
        zip.write_all(&output)?;
    }
    fn files(directory: &Path, paths: &mut Vec<PathBuf>) -> Result<()> {
        if !directory.exists() {
            return Ok(());
        }
        for entry in fs::read_dir(directory)? {
            let entry = entry?;
            if entry.file_type()?.is_symlink() {
                return Err(AppError::validation(
                    "Migration sources cannot include symbolic links.",
                ));
            }
            if entry.file_type()?.is_dir() {
                files(&entry.path(), paths)?;
            } else {
                paths.push(entry.path());
            }
        }
        Ok(())
    }
    let mut paths = vec![];
    files(&source.join("files"), &mut paths)?;
    for path in paths {
        let name = path
            .strip_prefix(source)
            .map_err(|_| AppError::validation("Unsafe source path."))?
            .to_string_lossy()
            .replace('\\', "/");
        let bytes = fs::metadata(&path)?.len();
        if !safe_name(&name) || bytes > 100 * 1024 * 1024 {
            return Err(AppError::validation("Unsafe or oversized source image."));
        }
        manifest.files.push(ManifestFile {
            path: name.clone(),
            sha256: hash_file(&path)?,
            bytes,
        });
        zip.start_file(name, options)?;
        std::io::copy(&mut fs::File::open(path)?, &mut zip)?;
    }
    zip.start_file("manifest.json", options)?;
    zip.write_all(&serde_json::to_vec_pretty(&manifest)?)?;
    zip.finish()?;
    temporary.as_file().sync_all()?;
    temporary.persist_noclobber(destination).map_err(|_| {
        AppError::validation("The migration destination exists or cannot be written.")
    })?;
    Ok(())
}
fn read_entry(zip: &mut ZipArchive<fs::File>, manifest: &Manifest, name: &str) -> Result<Vec<u8>> {
    if !manifest.files.iter().any(|f| f.path == name) {
        return Err(AppError::validation(
            "A referenced file is absent from the manifest.",
        ));
    }
    let mut bytes = vec![];
    zip.by_name(name)?
        .take(100 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > 100 * 1024 * 1024 {
        return Err(AppError::validation("Oversized migration file."));
    }
    Ok(bytes)
}
fn rows(
    zip: &mut ZipArchive<fs::File>,
    manifest: &Manifest,
    part: &str,
) -> Result<Vec<serde_json::Value>> {
    let count = manifest.counts.get(part).copied().unwrap_or(0);
    if count == 0 {
        return Ok(vec![]);
    }
    let bytes = read_entry(zip, manifest, &format!("{part}.jsonl"))?;
    let source =
        std::str::from_utf8(&bytes).map_err(|_| AppError::validation("JSONL must use UTF-8."))?;
    let rows = source
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(serde_json::from_str::<serde_json::Value>)
        .collect::<std::result::Result<Vec<_>, _>>()?;
    if rows.len() != count {
        return Err(AppError::validation(format!(
            "Record count mismatch for {part}."
        )));
    }
    let key = if ["reviews", "metadata"].contains(&part) {
        "assetId"
    } else {
        "id"
    };
    let mut ids = HashSet::new();
    for row in &rows {
        let source_id = row[key]
            .as_str()
            .ok_or_else(|| AppError::validation(format!("A {part} record has no string {key}.")))?;
        if source_id.is_empty() || source_id.len() > 200 || !ids.insert(source_id) {
            return Err(AppError::validation(format!(
                "Duplicate or invalid ID in {part}."
            )));
        }
    }
    Ok(rows)
}
fn mapped(workspace: &Workspace, kind: &str, source: &str) -> Result<String> {
    if source.is_empty() || source.len() > 200 {
        return Err(AppError::validation("Invalid source record ID."));
    }
    let db = workspace.conn()?;
    db.execute(
        "INSERT OR IGNORE INTO migration_id_map VALUES (?1, ?2, ?3)",
        params![kind, source, id()],
    )?;
    Ok(db.query_row(
        "SELECT target_id FROM migration_id_map WHERE kind=?1 AND source_id=?2",
        params![kind, source],
        |r| r.get(0),
    )?)
}
fn mapped_existing(workspace: &Workspace, kind: &str, source: &str) -> Result<String> {
    workspace
        .conn()?
        .query_row(
            "SELECT target_id FROM migration_id_map WHERE kind=?1 AND source_id=?2",
            params![kind, source],
            |r| r.get(0),
        )
        .map_err(|_| AppError::validation(format!("An imported {kind} reference does not exist.")))
}
fn checkpoint(workspace: &Workspace, part: &str) -> Result<usize> {
    Ok(workspace
        .conn()?
        .query_row(
            "SELECT completed FROM migration_checkpoints WHERE part=?1",
            [part],
            |r| r.get(0),
        )
        .optional()?
        .unwrap_or(0))
}
fn completed(workspace: &Workspace, part: &str, count: usize) -> Result<()> {
    workspace.conn()?.execute("INSERT INTO migration_checkpoints VALUES (?1, ?2) ON CONFLICT(part) DO UPDATE SET completed=excluded.completed", params![part, count])?;
    Ok(())
}
pub fn import(workspace: &Workspace, import_id: &str) -> Result<()> {
    let mut state: ImportState = record(
        &*workspace.conn()?,
        "SELECT data FROM migration_imports WHERE id=?1",
        import_id,
    )?;
    if hash_file(&state.path)? != import_id {
        return Err(AppError::validation(
            "The source archive changed. Preview it again before import.",
        ));
    }
    let parent = workspace
        .root
        .parent()
        .ok_or_else(|| AppError::validation("Invalid workspace location."))?;
    let pending = parent.join("workspace.pending");
    if pending.exists() {
        return Err(AppError::validation(
            "A restore or migration is already staged. Restart Thoock to activate it.",
        ));
    }
    let staging = parent.join(format!("migration-{import_id}"));
    let target = Workspace::open(staging.clone())?;
    let mut zip = ZipArchive::new(fs::File::open(&state.path)?)?;
    workspace.conn()?.execute(
        "UPDATE migration_imports SET status='importing' WHERE id=?1",
        [import_id],
    )?;
    let result = (|| {
        for part in ["opportunities", "briefs", "jobs"] {
            let rows = rows(&mut zip, &state.manifest, part)?;
            for row in &rows {
                let source = row["id"]
                    .as_str()
                    .ok_or_else(|| AppError::validation("Imported records need a string ID."))?;
                mapped(&target, part, source)?;
            }
            for (index, mut row) in rows
                .into_iter()
                .enumerate()
                .skip(checkpoint(&target, part)?)
            {
                let source = row["id"].as_str().unwrap().to_string();
                let target_id = mapped_existing(&target, part, &source)?;
                row["id"] = serde_json::json!(target_id);
                match part {
                    "opportunities" => {
                        let mut value: Opportunity = serde_json::from_value(row)?;
                        value.topic = text(&value.topic, "Topic", 200)?;
                        value.buyer = text(&value.buyer, "Buyer", 200)?;
                        value.market = text(&value.market, "Market", 200)?;
                        value.score = score(value.demand, value.competition, value.commercial_fit)?;
                        value.notes = crate::persistence::bounded(&value.notes, 10000)?;
                        chrono::DateTime::parse_from_rfc3339(&value.created_at)
                            .map_err(|_| AppError::validation("Invalid imported creation date."))?;
                        target.conn()?.execute(
                            "INSERT OR REPLACE INTO opportunities VALUES (?1, ?2, ?3, ?4)",
                            params![value.id, value.topic, serialize(&value)?, value.created_at],
                        )?;
                    }
                    "briefs" => {
                        let mut value: Brief = serde_json::from_value(row)?;
                        if let Some(ref source) = value.opportunity_id {
                            value.opportunity_id =
                                Some(mapped_existing(&target, "opportunities", source)?);
                        }
                        let input = BriefInput {
                            details: value.details.clone(),
                            id: None,
                            opportunity_id: value.opportunity_id.clone(),
                            title: value.title.clone(),
                            buyer: value.buyer.clone(),
                            usage: value.usage.clone(),
                            market: value.market.clone(),
                            scene: value.scene.clone(),
                            visual_direction: value.visual_direction.clone(),
                            prompt: value.prompt.clone(),
                            negative_prompt: value.negative_prompt.clone(),
                            metadata_plan: value.metadata_plan.clone(),
                        };
                        crate::csv_io::brief(input)?;
                        chrono::DateTime::parse_from_rfc3339(&value.created_at)
                            .map_err(|_| AppError::validation("Invalid imported creation date."))?;
                        target.conn()?.execute(
                            "INSERT OR REPLACE INTO briefs VALUES (?1, ?2, ?3, ?4, ?5)",
                            params![
                                value.id,
                                value.opportunity_id,
                                value.title,
                                serialize(&value)?,
                                value.created_at
                            ],
                        )?;
                    }
                    _ => {
                        let mut value: Job = serde_json::from_value(row)?;
                        if let Some(ref parent) = value.parent_id {
                            value.parent_id = Some(mapped_existing(&target, "jobs", parent)?);
                        }
                        if value.status == "running" || value.status == "queued" {
                            value.status = "interrupted".into();
                        }
                        value.message =
                            "Imported historical attempt. Raw provider content was omitted.".into();
                        value.result_ids.clear();
                        chrono::DateTime::parse_from_rfc3339(&value.created_at)
                            .map_err(|_| AppError::validation("Invalid imported creation date."))?;
                        target.conn()?.execute(
                            "INSERT OR REPLACE INTO jobs VALUES (?1, ?2, ?3, ?4)",
                            params![value.id, serialize(&value)?, value.status, value.created_at],
                        )?;
                    }
                }
                completed(&target, part, index + 1)?;
            }
        }
        for (index, row) in rows(&mut zip, &state.manifest, "assets")?
            .into_iter()
            .enumerate()
            .skip(checkpoint(&target, "assets")?)
        {
            let source: SourceAsset = serde_json::from_value(row)?;
            let brief_id = source
                .brief_id
                .as_ref()
                .map(|id| mapped_existing(&target, "briefs", id))
                .transpose()?;
            let source_job = source
                .source_job_id
                .as_ref()
                .map(|id| mapped_existing(&target, "jobs", id))
                .transpose()?;
            let original = read_entry(&mut zip, &state.manifest, &source.original_file)?;
            let (asset_id, _) = assets::ingest(
                &target,
                &original,
                text(&source.name, "Image name", 200)?,
                brief_id,
                source_job.clone(),
                false,
            )?;
            target.conn()?.execute("INSERT INTO migration_id_map VALUES ('assets', ?1, ?2) ON CONFLICT(kind, source_id) DO UPDATE SET target_id=excluded.target_id", params![source.id, asset_id])?;
            if let Some(current) = source.current_file {
                if current != source.original_file {
                    assets::replace_current(
                        &target,
                        &asset_id,
                        &read_entry(&mut zip, &state.manifest, &current)?,
                    )?;
                }
            }
            if let Some(source_job) = source_job {
                let mut job: Job = record(
                    &*target.conn()?,
                    "SELECT data FROM jobs WHERE id=?1",
                    &source_job,
                )?;
                if !job.result_ids.contains(&asset_id) {
                    job.result_ids.push(asset_id.clone());
                }
                crate::jobs::update(&target, &job)?;
            }
            completed(&target, "assets", index + 1)?;
        }
        for row in rows(&mut zip, &state.manifest, "jobs")? {
            if let Some(input) = row.get("input").filter(|v| !v.is_null()) {
                let mut task: Task = serde_json::from_value(input.clone())?;
                match &mut task {
                    Task::Generate(input) => {
                        input.brief_id = input
                            .brief_id
                            .as_ref()
                            .map(|id| mapped_existing(&target, "briefs", id))
                            .transpose()?;
                        input.parent_job_id = input
                            .parent_job_id
                            .as_ref()
                            .map(|id| mapped_existing(&target, "jobs", id))
                            .transpose()?;
                    }
                    Task::Research(input) | Task::BriefBatch(input) => {
                        input.opportunity_id = input
                            .opportunity_id
                            .as_ref()
                            .map(|id| mapped_existing(&target, "opportunities", id))
                            .transpose()?;
                    }
                    Task::Metadata { asset_id, .. } | Task::Repair { asset_id, .. } => {
                        *asset_id = mapped_existing(&target, "assets", asset_id)?;
                    }
                }
                let job_id = mapped_existing(&target, "jobs", row["id"].as_str().unwrap())?;
                target.conn()?.execute(
                    "INSERT OR REPLACE INTO job_inputs VALUES (?1, ?2)",
                    params![job_id, serialize(&task)?],
                )?;
            }
        }
        for (index, row) in rows(&mut zip, &state.manifest, "metadata")?
            .into_iter()
            .enumerate()
            .skip(checkpoint(&target, "metadata")?)
        {
            let source: SourceMetadata = serde_json::from_value(row)?;
            let asset_id = mapped_existing(&target, "assets", &source.asset_id)?;
            let mut asset = target.asset(&asset_id)?;
            asset.title = crate::persistence::bounded(&source.title, 200)?;
            asset.keywords = source.keywords;
            asset.category = source.category;
            if asset.keywords.len() > 49 || asset.keywords.iter().any(|k| k.chars().count() > 100) {
                return Err(AppError::validation("Invalid imported keyword fields."));
            }
            target.conn()?.execute(
                "UPDATE assets SET data=?1 WHERE id=?2",
                params![serialize(&asset)?, asset.id],
            )?;
            completed(&target, "metadata", index + 1)?;
        }
        for (index, row) in rows(&mut zip, &state.manifest, "reviews")?
            .into_iter()
            .enumerate()
            .skip(checkpoint(&target, "reviews")?)
        {
            let source: SourceReview = serde_json::from_value(row)?;
            let asset_id = mapped_existing(&target, "assets", &source.asset_id)?;
            let asset = target.asset(&asset_id)?;
            let mut input = ReviewInput {
                id: asset_id,
                title: asset.title,
                keywords: asset.keywords,
                category: asset.category,
                decision: source.decision,
                checklist: source.checklist,
                notes: source.notes,
            };
            // Legacy approvals do not bypass desktop gates. Incomplete approvals become pending.
            if input.decision == "approved" && target.save_review(input.clone()).is_err() {
                input.decision = "pending".into();
            }
            target.save_review(input)?;
            completed(&target, "reviews", index + 1)?;
        }
        for (index, row) in rows(&mut zip, &state.manifest, "provider-logs")?
            .into_iter()
            .enumerate()
            .skip(checkpoint(&target, "provider-logs")?)
        {
            let source: Log = serde_json::from_value(row)?;
            let value = Log {
                id: mapped(&target, "logs", &source.id)?,
                provider: if ["local", "openai", "gemini", "snapgen"]
                    .contains(&source.provider.as_str())
                {
                    source.provider
                } else {
                    "historical".into()
                },
                operation: "imported provider request".into(),
                status: "historical".into(),
                message:
                    "Historical request imported; raw request, response, and error content omitted."
                        .into(),
                duration_ms: source.duration_ms,
                created_at: now(),
                ..Default::default()
            };
            target.conn()?.execute(
                "INSERT OR REPLACE INTO provider_logs VALUES (?1, ?2, ?3)",
                params![value.id, serialize(&value)?, value.created_at],
            )?;
            completed(&target, "provider-logs", index + 1)?;
        }
        let bad_refs = target
            .conn()?
            .prepare("PRAGMA foreign_key_check")?
            .exists([])?;
        if bad_refs {
            return Err(AppError::validation(
                "The imported workspace has broken references.",
            ));
        }
        target
            .conn()?
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")?;
        Ok(())
    })();
    drop(target);
    match result {
        Ok(()) => {
            state.preview.status = "staged".into();
            workspace.conn()?.execute(
                "UPDATE migration_imports SET status='staged', data=?1 WHERE id=?2",
                params![serialize(&state)?, import_id],
            )?;
            fs::write(staging.join(".restore-ready"), b"1")?;
            fs::rename(staging, pending)?;
            Ok(())
        }
        Err(error) => {
            workspace.conn()?.execute(
                "UPDATE migration_imports SET status='failed' WHERE id=?1",
                [import_id],
            )?;
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pack_roundtrip_drops_unknown_credentials_and_legacy_cost_columns() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("source");
        fs::create_dir(&source).unwrap();
        let row = serde_json::json!({"id":"web-1","topic":"Desk-side creativity","buyer":"Designers","market":"Global","demand":50,"competition":50,"commercialFit":50,"notes":"Planning example","score":50,"createdAt":now(),"apiKey":"sk-example-private-credential","cost":99});
        fs::write(source.join("opportunities.jsonl"), format!("{row}\n")).unwrap();
        let archive = dir.path().join("migration.zip");
        pack(&source, &archive).unwrap();
        let mut zip = ZipArchive::new(fs::File::open(&archive).unwrap()).unwrap();
        let mut content = String::new();
        zip.by_name("opportunities.jsonl")
            .unwrap()
            .read_to_string(&mut content)
            .unwrap();
        assert!(!content.contains("apiKey"));
        assert!(!content.contains("private-credential"));
        assert!(!content.contains("cost"));
        let workspace = Workspace::open(dir.path().join("workspace")).unwrap();
        let preview = preview(&workspace, archive).unwrap();
        import(&workspace, &preview.id).unwrap();
        assert_eq!(
            Workspace::open(dir.path().join("workspace.pending"))
                .unwrap()
                .snapshot()
                .unwrap()
                .opportunities
                .len(),
            1
        );
    }
    #[test]
    fn manifest_rejects_unscoped_files() {
        assert!(safe_name("files/abcd.jpg"));
        assert!(safe_name("briefs.jsonl"));
        for name in [
            "../key",
            "/etc/passwd",
            "files/../key",
            "files\\key",
            "users.jsonl",
            "settings.json",
        ] {
            assert!(!safe_name(name));
        }
    }
    #[test]
    fn migration_validates_checksums_and_stages_without_mutating_active_data() {
        use std::io::Write;
        let dir = tempfile::tempdir().unwrap();
        let workspace = Workspace::open(dir.path().join("workspace")).unwrap();
        let row = Opportunity {
            details: None,
            id: "web-1".into(),
            topic: "Urban travel".into(),
            buyer: "Editorial designers".into(),
            market: "Global".into(),
            demand: 60,
            competition: 50,
            commercial_fit: 70,
            notes: String::new(),
            score: 60,
            created_at: now(),
        };
        let bytes = format!("{}\n", serialize(&row).unwrap()).into_bytes();
        let manifest = Manifest {
            format: "thoock-migration".into(),
            version: 1,
            counts: BTreeMap::from([("opportunities".into(), 1)]),
            files: vec![ManifestFile {
                path: "opportunities.jsonl".into(),
                sha256: format!("{:x}", Sha256::digest(&bytes)),
                bytes: bytes.len() as u64,
            }],
        };
        let archive = dir.path().join("migration.zip");
        let mut zip = zip::ZipWriter::new(fs::File::create(&archive).unwrap());
        zip.start_file("manifest.json", zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(serialize(&manifest).unwrap().as_bytes())
            .unwrap();
        zip.start_file(
            "opportunities.jsonl",
            zip::write::SimpleFileOptions::default(),
        )
        .unwrap();
        zip.write_all(&bytes).unwrap();
        zip.finish().unwrap();
        let preview = preview(&workspace, archive).unwrap();
        import(&workspace, &preview.id).unwrap();
        assert!(workspace.snapshot().unwrap().opportunities.is_empty());
        let staged = Workspace::open(dir.path().join("workspace.pending"))
            .unwrap()
            .snapshot()
            .unwrap();
        assert_eq!(staged.opportunities[0].topic, "Urban travel");
        assert_ne!(staged.opportunities[0].id, "web-1");
    }
}
