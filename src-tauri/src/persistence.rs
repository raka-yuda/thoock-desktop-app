use crate::domain::*;
use rusqlite::{params, Connection};
use serde::{de::DeserializeOwned, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex, MutexGuard,
    },
};

pub struct Workspace {
    pub root: PathBuf,
    pub db: Mutex<Connection>,
    files: Mutex<()>,
    pub staged: AtomicBool,
    _lock_file: fs::File,
}
impl Workspace {
    pub fn open(root: PathBuf) -> Result<Self> {
        fs::create_dir_all(&root)?;
        let lock_file = fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(root.join("workspace.lock"))?;
        lock_file.try_lock().map_err(|_| AppError::new("workspace_in_use", "This workspace is already open in another Thoock instance. Close that instance before opening it here."))?;
        for folder in [
            "assets/originals",
            "assets/current",
            "assets/thumbnails",
            "assets/previews",
            "exports",
            "logs",
            "backups",
        ] {
            fs::create_dir_all(root.join(folder))?;
        }
        let mut db = Connection::open(root.join("thoock.sqlite3"))?;
        db.pragma_update(None, "journal_mode", "WAL")?;
        db.pragma_update(None, "foreign_keys", "ON")?;
        db.busy_timeout(std::time::Duration::from_secs(5))?;
        let version: u32 = db.pragma_query_value(None, "user_version", |r| r.get(0))?;
        if version > 4 {
            return Err(AppError::new(
                "schema_version",
                "This workspace needs a newer version of Thoock.",
            ));
        }
        if version == 0 {
            let tx = db.transaction()?;
            tx.execute_batch(include_str!("../migrations/001_workspace.sql"))?;
            tx.execute(
                "INSERT INTO workspace_info VALUES (?1, 1, ?2)",
                params![id(), now()],
            )?;
            tx.execute(
                "INSERT INTO settings VALUES ('preferences', ?1)",
                [serde_json::to_string(&Preferences::default())?],
            )?;
            tx.commit()?;
        }
        if version < 2 {
            let tx = db.transaction()?;
            tx.execute_batch(include_str!("../migrations/002_jobs.sql"))?;
            tx.commit()?;
        }
        if version < 3 {
            let tx = db.transaction()?;
            tx.execute_batch(include_str!("../migrations/003_migration.sql"))?;
            tx.commit()?;
        }
        if version < 4 {
            let tx = db.transaction()?;
            tx.execute_batch(include_str!("../migrations/004_review_history.sql"))?;
            tx.commit()?;
        }
        // Jobs are never reissued on restart. Read-only provider lookup reconciles saved IDs.
        let pending = list::<Job>(&db, "SELECT data FROM jobs WHERE status='running'")?;
        for mut job in pending {
            job.status = "interrupted".into();
            job.message = "The app closed before completion. Inspect the workspace before starting a new action.".into();
            db.execute(
                "UPDATE jobs SET data=?1, status=?2 WHERE id=?3",
                params![serde_json::to_string(&job)?, job.status, job.id],
            )?;
        }
        clean_temporary_files(&root)?;
        Ok(Self {
            root,
            db: Mutex::new(db),
            files: Mutex::new(()),
            staged: AtomicBool::new(false),
            _lock_file: lock_file,
        })
    }
    pub fn conn(&self) -> Result<MutexGuard<'_, Connection>> {
        self.db.lock().map_err(|_| {
            AppError::new(
                "workspace_busy",
                "The workspace lock is unavailable. Restart Thoock.",
            )
        })
    }
    pub fn files_lock(&self) -> Result<MutexGuard<'_, ()>> {
        self.files.lock().map_err(|_| {
            AppError::new(
                "workspace_busy",
                "The workspace file lock is unavailable. Restart Thoock.",
            )
        })
    }
    pub fn ensure_writable(&self) -> Result<()> {
        if self.staged.load(Ordering::Acquire) {
            return Err(AppError::new("restart_required", "A workspace replacement is staged. Quit and reopen Thoock before making more changes."));
        }
        Ok(())
    }
    pub fn write_conn(&self) -> Result<MutexGuard<'_, Connection>> {
        let db = self.conn()?;
        self.ensure_writable()?;
        Ok(db)
    }
    pub fn begin_replacement(&self) -> Result<()> {
        let db = self.write_conn()?;
        let active: usize = db.query_row(
            "SELECT COUNT(*) FROM jobs WHERE status IN ('queued','running')",
            [],
            |r| r.get(0),
        )?;
        if active > 0 {
            return Err(AppError::validation(
                "Finish or stop active jobs before replacing the workspace.",
            ));
        }
        self.staged.store(true, Ordering::Release);
        Ok(())
    }
    pub fn cancel_replacement(&self) {
        self.staged.store(false, Ordering::Release);
    }
    pub fn preferences(&self) -> Result<Preferences> {
        let json: String = self.conn()?.query_row(
            "SELECT value FROM settings WHERE key='preferences'",
            [],
            |r| r.get(0),
        )?;
        Ok(serde_json::from_str(&json)?)
    }
    pub fn snapshot(&self) -> Result<Snapshot> {
        let db = self.conn()?;
        let workspace_id = db.query_row("SELECT id FROM workspace_info", [], |r| r.get(0))?;
        let preference_json: String = db.query_row(
            "SELECT value FROM settings WHERE key='preferences'",
            [],
            |r| r.get(0),
        )?;
        let mut providers = vec![];
        for provider in ["openai", "gemini", "snapgen"] {
            let configured = db.query_row(
                "SELECT last_tested, status FROM credential_refs WHERE provider_id=?1",
                [provider],
                |r| Ok((r.get::<_, Option<String>>(0)?, r.get::<_, String>(1)?)),
            );
            let (configured, last_tested, status) = match configured {
                Ok((time, status)) => (true, time, status),
                Err(rusqlite::Error::QueryReturnedNoRows) => (false, None, "not configured".into()),
                Err(e) => return Err(e.into()),
            };
            providers.push(ProviderStatus {
                id: provider.into(),
                configured,
                last_tested,
                status,
            });
        }
        let mut assets: Vec<Asset> = list(
            &db,
            "SELECT data FROM assets ORDER BY created_at DESC, id DESC",
        )?;
        for asset in &mut assets {
            asset.thumbnail = self.root.join(&asset.thumbnail).to_string_lossy().into();
            asset.preview = self.root.join(&asset.preview).to_string_lossy().into();
        }
        Ok(Snapshot {
            schema_version: 4,
            workspace_id,
            workspace_path: self.root.to_string_lossy().into(),
            storage_bytes: directory_bytes(&self.root)?,
            restart_required: self.staged.load(Ordering::Acquire),
            preferences: serde_json::from_str(&preference_json)?,
            opportunities: list(
                &db,
                "SELECT data FROM opportunities ORDER BY created_at DESC, id DESC",
            )?,
            briefs: list(
                &db,
                "SELECT data FROM briefs ORDER BY created_at DESC, id DESC",
            )?,
            assets,
            jobs: list(
                &db,
                "SELECT data FROM jobs ORDER BY created_at DESC, id DESC LIMIT 5000",
            )?,
            logs: list(
                &db,
                "SELECT data FROM provider_logs ORDER BY created_at DESC, id DESC LIMIT 5000",
            )?,
            exports: list(
                &db,
                "SELECT data FROM export_batches ORDER BY created_at DESC, id DESC",
            )?,
            providers,
        })
    }
    pub fn save_opportunity(&self, input: OpportunityInput) -> Result<Opportunity> {
        let created_at = input
            .id
            .as_ref()
            .map(|id| {
                record::<Opportunity>(
                    &*self.conn()?,
                    "SELECT data FROM opportunities WHERE id=?1",
                    id,
                )
                .map(|o| o.created_at)
            })
            .transpose()?
            .unwrap_or_else(now);
        let opportunity = Opportunity {
            details: validate_opportunity_details(input.details)?,
            id: input.id.unwrap_or_else(id),
            topic: text(&input.topic, "Topic", 200)?,
            buyer: text(&input.buyer, "Buyer", 200)?,
            market: text(&input.market, "Market", 200)?,
            score: score(input.demand, input.competition, input.commercial_fit)?,
            demand: input.demand,
            competition: input.competition,
            commercial_fit: input.commercial_fit,
            notes: bounded(&input.notes, 10000)?,
            created_at,
        };
        let db = self.write_conn()?;
        db.execute("INSERT INTO opportunities VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET topic=excluded.topic, data=excluded.data",
            params![opportunity.id, opportunity.topic, serde_json::to_string(&opportunity)?, opportunity.created_at])?;
        Ok(opportunity)
    }
    pub fn save_brief(&self, input: BriefInput) -> Result<Brief> {
        let created_at = input
            .id
            .as_ref()
            .map(|id| {
                record::<Brief>(&*self.conn()?, "SELECT data FROM briefs WHERE id=?1", id)
                    .map(|b| b.created_at)
            })
            .transpose()?
            .unwrap_or_else(now);
        let brief = Brief {
            details: validate_brief_details(input.details)?,
            id: input.id.unwrap_or_else(id),
            opportunity_id: input.opportunity_id,
            title: text(&input.title, "Title", 200)?,
            buyer: text(&input.buyer, "Buyer", 200)?,
            usage: text(&input.usage, "Usage", 500)?,
            market: text(&input.market, "Market", 200)?,
            scene: text(&input.scene, "Scene", 5000)?,
            visual_direction: bounded(&input.visual_direction, 5000)?,
            prompt: text(&input.prompt, "Prompt", 12000)?,
            negative_prompt: bounded(&input.negative_prompt, 5000)?,
            metadata_plan: bounded(&input.metadata_plan, 5000)?,
            created_at,
        };
        let db = self.write_conn()?;
        db.execute("INSERT INTO briefs VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(id) DO UPDATE SET opportunity_id=excluded.opportunity_id, title=excluded.title, data=excluded.data",
            params![brief.id, brief.opportunity_id, brief.title, serde_json::to_string(&brief)?, brief.created_at])?;
        Ok(brief)
    }
    pub fn asset(&self, asset_id: &str) -> Result<Asset> {
        record(
            &*self.conn()?,
            "SELECT data FROM assets WHERE id=?1",
            asset_id,
        )
    }
    pub fn save_review(&self, input: ReviewInput) -> Result<Asset> {
        let mut asset = self.asset(&input.id)?;
        if !["pending", "approved", "rejected"].contains(&input.decision.as_str()) {
            return Err(AppError::validation("Choose a valid review decision."));
        }
        asset.title = bounded(&input.title, 200)?;
        asset.keywords = input
            .keywords
            .into_iter()
            .map(|s| s.trim().to_string())
            .collect();
        if asset.keywords.len() > 49 {
            return Err(AppError::validation("Use at most 49 keywords."));
        }
        asset.category = input.category;
        asset.checklist = input.checklist;
        asset.notes = bounded(&input.notes, 10000)?;
        if input.decision == "approved" {
            validate_export(&asset, &self.preferences()?)?;
        }
        asset.decision = input.decision;
        self.store_asset_review(&asset, "human")?;
        Ok(asset)
    }
    pub fn store_asset_review(&self, asset: &Asset, actor: &str) -> Result<()> {
        let mut db = self.write_conn()?;
        let tx = db.transaction()?;
        let previous: Asset = record(&tx, "SELECT data FROM assets WHERE id=?1", &asset.id)?;
        tx.execute(
            "UPDATE assets SET data=?1 WHERE id=?2",
            params![serialize(asset)?, asset.id],
        )?;
        record_review_event(&tx, &previous, asset, actor)?;
        tx.commit()?;
        Ok(())
    }
    pub fn review_history(&self, asset_id: &str) -> Result<Vec<ReviewEvent>> {
        self.asset(asset_id)?;
        let db = self.conn()?;
        let mut statement = db.prepare(
            "SELECT data FROM review_events WHERE asset_id=?1 ORDER BY created_at DESC LIMIT 100",
        )?;
        let rows = statement.query_map([asset_id], |r| r.get::<_, String>(0))?;
        rows.map(|row| Ok(serde_json::from_str(&row?)?)).collect()
    }
    pub fn bulk_review(&self, ids: &[String], decision: &str) -> Result<usize> {
        if ids.is_empty() || ids.len() > 500 {
            return Err(AppError::validation("Select between 1 and 500 images."));
        }
        if !["approved", "rejected"].contains(&decision) {
            return Err(AppError::validation("Choose approve or reject."));
        }
        let preferences = self.preferences()?;
        let mut db = self.write_conn()?;
        let tx = db.transaction()?;
        for asset_id in ids {
            let mut asset: Asset = record(&tx, "SELECT data FROM assets WHERE id=?1", asset_id)?;
            let previous = asset.clone();
            if decision == "approved" {
                validate_export(&asset, &preferences)?;
            }
            asset.decision = decision.into();
            tx.execute(
                "UPDATE assets SET data=?1 WHERE id=?2",
                params![serde_json::to_string(&asset)?, asset.id],
            )?;
            record_review_event(&tx, &previous, &asset, "human bulk review")?;
        }
        tx.commit()?;
        Ok(ids.len())
    }
    pub fn start_job(&self, operation: &str) -> Result<Job> {
        let job = Job::local(operation);
        self.write_conn()?.execute(
            "INSERT INTO jobs VALUES (?1, ?2, ?3, ?4)",
            params![
                job.id,
                serde_json::to_string(&job)?,
                job.status,
                job.created_at
            ],
        )?;
        Ok(job)
    }
    pub fn finish_job(&self, mut job: Job, error: Option<&AppError>) -> Result<()> {
        job.status = if error.is_some() {
            "failed"
        } else {
            "succeeded"
        }
        .into();
        job.message = error
            .map(|e| e.message.clone())
            .unwrap_or_else(|| "Completed locally".into());
        job.completed_at = Some(now());
        self.conn()?.execute(
            "UPDATE jobs SET data=?1, status=?2 WHERE id=?3",
            params![serde_json::to_string(&job)?, job.status, job.id],
        )?;
        self.log(Log {
            id: job.id,
            provider: "local".into(),
            operation: job.operation,
            status: job.status,
            message: job.message,
            duration_ms: chrono::DateTime::parse_from_rfc3339(&job.created_at)
                .map(|time| {
                    (chrono::Utc::now() - time.with_timezone(&chrono::Utc))
                        .num_milliseconds()
                        .max(0) as u64
                })
                .unwrap_or(0),
            created_at: now(),
            model: job.model,
            request_id: job.request_id,
            ..Default::default()
        })
    }
    pub fn log(&self, mut log: Log) -> Result<()> {
        log.message = crate::observability::redact(&log.message, &[]);
        let json = serde_json::to_string(&log)?;
        self.conn()?.execute(
            "INSERT INTO provider_logs VALUES (?1, ?2, ?3)",
            params![log.id, json, log.created_at],
        )?;
        // Only normalized diagnostic DTOs are logged; no request body or credentials enter this path.
        let log_path = self
            .root
            .join("logs")
            .join(format!("{}.jsonl", chrono::Utc::now().format("%Y-%m-%d")));
        if log_path
            .metadata()
            .is_ok_and(|m| m.len() > 10 * 1024 * 1024)
        {
            fs::rename(
                &log_path,
                self.root.join("logs").join(format!(
                    "{}-{}.jsonl",
                    chrono::Utc::now().format("%Y-%m-%d"),
                    id()
                )),
            )?;
        }
        crate::observability::rotate_logs(&self.root.join("logs"))?;
        use std::io::Write;
        writeln!(
            fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(log_path)?,
            "{json}"
        )?;
        Ok(())
    }
}
pub fn record_review_event(
    db: &Connection,
    previous: &Asset,
    current: &Asset,
    actor: &str,
) -> Result<()> {
    let event = ReviewEvent {
        id: id(),
        asset_id: current.id.clone(),
        actor: actor.into(),
        previous: previous.into(),
        current: current.into(),
        created_at: now(),
    };
    db.execute(
        "INSERT INTO review_events VALUES (?1, ?2, ?3, ?4)",
        params![
            event.id,
            event.asset_id,
            serialize(&event)?,
            event.created_at
        ],
    )?;
    Ok(())
}
pub fn bounded(value: &str, max: usize) -> Result<String> {
    if value.chars().count() > max {
        return Err(AppError::validation(format!(
            "This field must be at most {max} characters."
        )));
    }
    Ok(value.trim().to_string())
}
pub fn validate_export(asset: &Asset, preferences: &Preferences) -> Result<()> {
    if uuid::Uuid::parse_str(&asset.id).is_err() {
        return Err(AppError::validation(
            "This asset has an invalid internal identifier.",
        ));
    }
    let mut errors = metadata_errors(
        &asset.title,
        &asset.keywords,
        asset.category,
        &preferences.prohibited_terms,
    );
    if !(4_000_000..=100_000_000).contains(&(u64::from(asset.width) * u64::from(asset.height))) {
        errors.push("Image resolution must be between 4 and 100 megapixels.".into());
    }
    if !asset.checklist.complete() {
        errors.push("Complete all four human review checks before approval.".into());
    }
    if asset.is_mock {
        errors.push("Mock test patterns cannot be approved for commercial export.".into());
    }
    if !errors.is_empty() {
        return Err(AppError::validation(format!(
            "{}: {}",
            asset.name,
            errors.join(" ")
        )));
    }
    Ok(())
}
pub fn list<T: DeserializeOwned>(db: &Connection, query: &str) -> Result<Vec<T>> {
    let mut statement = db.prepare(query)?;
    let rows = statement.query_map([], |r| r.get::<_, String>(0))?;
    rows.map(|r| Ok(serde_json::from_str(&r?)?)).collect()
}
pub fn record<T: DeserializeOwned>(db: &Connection, query: &str, key: &str) -> Result<T> {
    let json: String = db
        .query_row(query, [key], |r| r.get(0))
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::new("not_found", "This record no longer exists.")
            }
            _ => e.into(),
        })?;
    Ok(serde_json::from_str(&json)?)
}
pub fn serialize(value: &impl Serialize) -> Result<String> {
    Ok(serde_json::to_string(value)?)
}
pub fn directory_bytes(root: &Path) -> Result<u64> {
    let mut size = 0;
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let metadata = entry.metadata()?;
        if entry.file_type()?.is_symlink() {
            continue;
        }
        size += if metadata.is_dir() {
            directory_bytes(&entry.path())?
        } else {
            metadata.len()
        };
    }
    Ok(size)
}
fn clean_temporary_files(root: &Path) -> Result<()> {
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        if entry.file_type()?.is_symlink() {
            continue;
        }
        if entry.file_type()?.is_dir() {
            clean_temporary_files(&entry.path())?;
        } else if entry.file_name().to_string_lossy().ends_with(".tmp") {
            fs::remove_file(entry.path())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn second_workspace_owner_is_rejected_until_the_first_closes() {
        let dir = tempfile::tempdir().unwrap();
        let first = Workspace::open(dir.path().to_owned()).unwrap();
        assert!(Workspace::open(dir.path().to_owned()).is_err());
        drop(first);
        assert!(Workspace::open(dir.path().to_owned()).is_ok());
    }
    #[test]
    fn workspace_replacement_rejects_active_jobs_and_freezes_edits() {
        let dir = tempfile::tempdir().unwrap();
        let workspace = Workspace::open(dir.path().to_owned()).unwrap();
        let job = workspace.start_job("image import").unwrap();
        assert!(workspace.begin_replacement().is_err());
        workspace.finish_job(job, None).unwrap();
        workspace.begin_replacement().unwrap();
        assert!(workspace.snapshot().unwrap().restart_required);
        assert!(workspace.start_job("image import").is_err());
        workspace.cancel_replacement();
        assert!(!workspace.snapshot().unwrap().restart_required);
        assert!(workspace.start_job("image import").is_ok());
    }
    #[test]
    fn restart_recovers_running_jobs_without_reissuing_them() {
        let dir = tempfile::tempdir().unwrap();
        let workspace = Workspace::open(dir.path().to_owned()).unwrap();
        workspace.start_job("import").unwrap();
        let workspace_id = workspace.snapshot().unwrap().workspace_id;
        drop(workspace);
        let recovered = Workspace::open(dir.path().to_owned())
            .unwrap()
            .snapshot()
            .unwrap();
        assert_eq!(recovered.workspace_id, workspace_id);
        assert_eq!(recovered.jobs[0].status, "interrupted");
    }

    #[test]
    fn reference_form_fields_survive_workspace_reopen() {
        let directory = tempfile::tempdir().unwrap();
        let workspace = Workspace::open(directory.path().to_owned()).unwrap();
        let opportunity = workspace.save_opportunity(serde_json::from_value(serde_json::json!({
          "id": null, "topic": "Winter travel", "buyer": "Travel publishers", "market": "Global", "demand": 65, "competition": 40, "commercialFit": 70, "notes": "Verified manually",
          "details": { "behavior": "seasonal", "resultCount": 25000, "trendGrowth": 65, "commercialIntent": 70, "seasonalFit": 60, "portfolioFit": 50 }
        })).unwrap()).unwrap();
        workspace.save_brief(serde_json::from_value(serde_json::json!({
          "id": null, "opportunityId": opportunity.id, "title": "Quiet winter village", "buyer": "Travel publishers", "usage": "Website hero", "market": "Global", "scene": "Snow covered village", "visualDirection": "Editorial photography", "prompt": "A snow covered village at morning", "negativePrompt": "No logos", "metadataPlan": "Describe the visible subject",
          "details": { "supportingSubjects": "Mountains, trees", "environment": "Alpine valley", "visualStyle": "Editorial photography", "orientation": "Horizontal", "copySpace": "Upper center", "composition": "Wide scene", "lighting": "Morning", "adobeTitle": "Quiet village in winter", "keywords": ["village", "winter", "snow", "travel", "mountains"], "category": 21 }
        })).unwrap()).unwrap();
        drop(workspace);
        let workspace = Workspace::open(directory.path().to_owned()).unwrap();
        let snapshot = workspace.snapshot().unwrap();
        assert_eq!(
            snapshot.opportunities[0]
                .details
                .as_ref()
                .unwrap()
                .result_count,
            25000
        );
        let details = snapshot.briefs[0].details.as_ref().unwrap();
        assert_eq!(details.supporting_subjects, "Mountains, trees");
        assert_eq!(details.orientation, "Horizontal");
        assert_eq!(details.keywords.len(), 5);
    }
}
