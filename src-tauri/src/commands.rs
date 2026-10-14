use crate::{
    domain::*,
    persistence::{serialize, Workspace},
};
use rusqlite::params;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
type Shared = Arc<Workspace>;
#[tauri::command]
pub fn set_appearance(window: tauri::Window, theme: String) -> Result<()> {
    let theme = match theme.as_str() {
        "dark" => tauri::Theme::Dark,
        "light" => tauri::Theme::Light,
        _ => return Err(AppError::validation("Choose a light or dark appearance.")),
    };
    window
        .set_theme(Some(theme))
        .map_err(|_| AppError::new("appearance", "The window appearance could not be updated."))
}
#[tauri::command]
pub async fn review_history(
    workspace: State<'_, Shared>,
    asset_id: String,
) -> Result<Vec<ReviewEvent>> {
    let workspace = workspace.inner().clone();
    blocking(move || workspace.review_history(&asset_id)).await
}
#[tauri::command]
pub fn startup_status(startup: State<'_, crate::storage::Startup>) -> Result<()> {
    startup.error.clone().map_or(Ok(()), Err)
}
#[tauri::command]
pub async fn relocate_workspace(app: AppHandle, workspace: State<'_, Shared>) -> Result<bool> {
    let workspace = workspace.inner().clone();
    let picker_app = app.clone();
    let result = blocking(move || {
        let Some(path) = picker_app
            .dialog()
            .file()
            .set_title("Choose a parent folder for Thoock")
            .blocking_pick_folder()
        else {
            return Ok(false);
        };
        let parent = path
            .into_path()
            .map_err(|_| AppError::validation("Choose a local folder."))?;
        workspace.begin_replacement()?;
        let result = (|| {
            let base = crate::storage::relocate(&workspace, &parent)?;
            crate::storage::set_location(&picker_app, &base)?;
            Ok(true)
        })();
        if result.is_err() {
            workspace.cancel_replacement();
        }
        result
    })
    .await;
    changed(&app);
    result
}
#[tauri::command]
pub async fn choose_workspace(app: AppHandle) -> Result<bool> {
    blocking(move || {
        let Some(path) = app
            .dialog()
            .file()
            .set_title("Choose the folder containing your Thoock workspace")
            .blocking_pick_folder()
        else {
            return Ok(false);
        };
        let base = path
            .into_path()
            .map_err(|_| AppError::validation("Choose a local folder."))?;
        if !base.join("workspace/thoock.sqlite3").is_file() {
            return Err(AppError::validation(
                "The chosen folder must contain workspace/thoock.sqlite3.",
            ));
        }
        let candidate = Workspace::open(base.join("workspace"))?;
        let integrity: String = candidate
            .conn()?
            .query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
        if integrity != "ok" {
            return Err(AppError::validation(
                "The chosen workspace failed validation.",
            ));
        }
        drop(candidate);
        crate::storage::set_location(&app, &base)?;
        Ok(true)
    })
    .await
}
#[tauri::command]
pub fn restart_app(app: AppHandle) -> Result<()> {
    if let Some(workspace) = app.try_state::<Shared>() {
        let active: usize = workspace.conn()?.query_row(
            "SELECT COUNT(*) FROM jobs WHERE status IN ('queued','running')",
            [],
            |r| r.get(0),
        )?;
        if active > 0 {
            return Err(AppError::validation(
                "Finish or stop active jobs before restarting.",
            ));
        }
    }
    app.restart()
}
#[tauri::command]
pub async fn support_bundle(app: AppHandle, workspace: State<'_, Shared>) -> Result<bool> {
    let workspace = workspace.inner().clone();
    blocking(move || {
        let Some(path) = app
            .dialog()
            .file()
            .set_file_name("thoock-support.zip")
            .add_filter("ZIP", &["zip"])
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let path = path
            .into_path()
            .map_err(|_| AppError::validation("Choose a local destination."))?;
        crate::observability::support_bundle(&workspace, &path)?;
        Ok(true)
    })
    .await
}
#[tauri::command]
pub async fn rebuild_previews(app: AppHandle, workspace: State<'_, Shared>) -> Result<usize> {
    let workspace = workspace.inner().clone();
    let count = blocking(move || {
        let _files = workspace.files_lock()?;
        workspace.ensure_writable()?;
        let assets =
            crate::persistence::list::<Asset>(&*workspace.conn()?, "SELECT data FROM assets")?;
        let count = assets.len();
        for mut asset in assets {
            let relative: String = workspace.conn()?.query_row(
                "SELECT current FROM assets WHERE id=?1",
                [&asset.id],
                |r| r.get(0),
            )?;
            let decoded = crate::assets::decode(&std::fs::read(crate::assets::scoped_path(
                &workspace.root,
                &relative,
            )?)?)?;
            let (thumbnail, preview) =
                crate::assets::write_derivatives(&workspace, &asset.id, &decoded)?;
            let old = [asset.thumbnail, asset.preview];
            asset.thumbnail = thumbnail;
            asset.preview = preview;
            workspace.write_conn()?.execute(
                "UPDATE assets SET data=?1 WHERE id=?2",
                params![serialize(&asset)?, asset.id],
            )?;
            for relative in old {
                let _ = std::fs::remove_file(workspace.root.join(relative));
            }
        }
        Ok(count)
    })
    .await?;
    changed(&app);
    Ok(count)
}
#[tauri::command]
pub async fn preview_migration(
    app: AppHandle,
    workspace: State<'_, Shared>,
) -> Result<Option<crate::migration::MigrationPreview>> {
    let workspace = workspace.inner().clone();
    blocking(move || {
        let Some(path) = app
            .dialog()
            .file()
            .add_filter("Thoock migration bundle", &["zip"])
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let path = path
            .into_path()
            .map_err(|_| AppError::validation("Choose a local migration bundle."))?;
        crate::migration::preview(&workspace, path).map(Some)
    })
    .await
}
#[tauri::command]
pub async fn import_migration(workspace: State<'_, Shared>, import_id: String) -> Result<()> {
    let workspace = workspace.inner().clone();
    blocking(move || {
        workspace.begin_replacement()?;
        let result = crate::migration::import(&workspace, &import_id);
        if result.is_err() {
            workspace.cancel_replacement();
        }
        result
    })
    .await
}
fn pick_csv(app: &AppHandle) -> Result<Option<String>> {
    let Some(path) = app
        .dialog()
        .file()
        .add_filter("CSV", &["csv"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = path
        .into_path()
        .map_err(|_| AppError::validation("Choose a local CSV file."))?;
    if std::fs::metadata(&path)?.len() > 2 * 1024 * 1024 {
        return Err(AppError::validation("CSV files must be at most 2 MB."));
    }
    Ok(Some(std::fs::read_to_string(path)?))
}
#[tauri::command]
pub async fn pick_opportunity_csv(app: AppHandle) -> Result<Option<String>> {
    blocking(move || pick_csv(&app)).await
}
#[tauri::command]
pub async fn pick_brief_csv(app: AppHandle) -> Result<Option<String>> {
    blocking(move || pick_csv(&app)).await
}
#[tauri::command]
pub async fn preview_brief_csv(
    workspace: State<'_, Shared>,
    content: String,
) -> Result<Vec<BriefInput>> {
    let workspace = workspace.inner().clone();
    blocking(move || crate::csv_io::preview_briefs(&workspace, &content)).await
}
#[tauri::command]
pub async fn import_briefs(
    app: AppHandle,
    workspace: State<'_, Shared>,
    inputs: Vec<BriefInput>,
) -> Result<usize> {
    let workspace = workspace.inner().clone();
    let count = blocking(move || crate::csv_io::import_briefs(&workspace, inputs)).await?;
    changed(&app);
    Ok(count)
}
fn save_csv(app: &AppHandle, bytes: Vec<u8>, filename: &str) -> Result<bool> {
    let Some(path) = app
        .dialog()
        .file()
        .set_file_name(filename)
        .add_filter("CSV", &["csv"])
        .blocking_save_file()
    else {
        return Ok(false);
    };
    let path = path
        .into_path()
        .map_err(|_| AppError::validation("Choose a local destination."))?;
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)
        .map_err(|_| {
            AppError::validation("Choose a new filename. Existing files are not overwritten.")
        })?;
    file.write_all(&bytes)?;
    file.sync_all()?;
    Ok(true)
}
#[tauri::command]
pub async fn export_opportunity_csv(app: AppHandle, workspace: State<'_, Shared>) -> Result<bool> {
    let workspace = workspace.inner().clone();
    blocking(move || {
        save_csv(
            &app,
            crate::csv_io::opportunities_csv(&workspace)?,
            "thoock-opportunities.csv",
        )
    })
    .await
}
#[tauri::command]
pub async fn export_brief_csv(app: AppHandle, workspace: State<'_, Shared>) -> Result<bool> {
    let workspace = workspace.inner().clone();
    blocking(move || {
        save_csv(
            &app,
            crate::csv_io::briefs_csv(&workspace)?,
            "thoock-briefs.csv",
        )
    })
    .await
}
fn changed(app: &AppHandle) {
    let _ = app.emit("workspace-changed", ());
}
#[tauri::command]
pub async fn download_asset(
    app: AppHandle,
    workspace: State<'_, Shared>,
    asset_id: String,
    original: bool,
) -> Result<bool> {
    let workspace = workspace.inner().clone();
    blocking(move || {
        let column = if original { "original" } else { "current" };
        let relative: String = workspace.conn()?.query_row(
            &format!("SELECT {column} FROM assets WHERE id=?1"),
            [&asset_id],
            |r| r.get(0),
        )?;
        let source = crate::assets::scoped_path(&workspace.root, &relative)?;
        let extension = source.extension().and_then(|e| e.to_str()).unwrap_or("jpg");
        let selected = app
            .dialog()
            .file()
            .set_file_name(format!("thoock-{asset_id}.{extension}"))
            .blocking_save_file();
        let Some(path) = selected else {
            return Ok(false);
        };
        let path = path
            .into_path()
            .map_err(|_| AppError::validation("Choose a local destination."))?;
        let mut file = std::fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(path)
            .map_err(|_| {
                AppError::validation(
                    "Choose a new destination filename; existing files are not overwritten.",
                )
            })?;
        std::io::copy(&mut std::fs::File::open(source)?, &mut file)?;
        file.sync_all()?;
        Ok(true)
    })
    .await
}
#[tauri::command]
pub async fn original_preview(workspace: State<'_, Shared>, asset_id: String) -> Result<String> {
    let workspace = workspace.inner().clone();
    blocking(move || crate::assets::original_preview(&workspace, &asset_id)).await
}
#[tauri::command]
pub async fn save_export_copy(
    app: AppHandle,
    workspace: State<'_, Shared>,
    batch_id: String,
) -> Result<bool> {
    let workspace = workspace.inner().clone();
    blocking(move || {
        if uuid::Uuid::parse_str(&batch_id).is_err() {
            return Err(AppError::validation("Invalid package identifier."));
        }
        crate::persistence::record::<ExportBatch>(
            &*workspace.conn()?,
            "SELECT data FROM export_batches WHERE id=?1",
            &batch_id,
        )?;
        let source =
            crate::assets::scoped_path(&workspace.root, &format!("exports/{batch_id}.zip"))?;
        let Some(path) = app
            .dialog()
            .file()
            .set_file_name(format!("thoock-{batch_id}.zip"))
            .add_filter("ZIP", &["zip"])
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let path = path
            .into_path()
            .map_err(|_| AppError::validation("Choose a local destination."))?;
        let mut file = std::fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(path)
            .map_err(|_| {
                AppError::validation(
                    "Choose a new filename. Existing packages are not overwritten.",
                )
            })?;
        std::io::copy(&mut std::fs::File::open(source)?, &mut file)?;
        file.sync_all()?;
        Ok(true)
    })
    .await
}
#[tauri::command]
pub fn model_capabilities() -> Vec<Capability> {
    crate::providers::capabilities()
}
#[tauri::command]
pub async fn generation_settings(
    workspace: State<'_, Shared>,
    job_id: String,
) -> Result<GenerationInput> {
    let task: Task = crate::persistence::record(
        &*workspace.conn()?,
        "SELECT input FROM job_inputs WHERE job_id=?1",
        &job_id,
    )?;
    let Task::Generate(mut input) = task else {
        return Err(AppError::validation(
            "This job has no image generation settings.",
        ));
    };
    input.parent_job_id = Some(job_id);
    Ok(input)
}
#[tauri::command]
pub async fn queue_bulk_generation(
    app: AppHandle,
    workspace: State<'_, Shared>,
    input: GenerationInput,
    brief_ids: Vec<String>,
) -> Result<Vec<Job>> {
    let workspace = workspace.inner().clone();
    let jobs = blocking(move || {
        let mut tasks = vec![];
        for brief_id in brief_ids {
            let brief: Brief = crate::persistence::record(
                &*workspace.conn()?,
                "SELECT data FROM briefs WHERE id=?1",
                &brief_id,
            )?;
            let mut settings = input.clone();
            settings.prompt = brief.prompt;
            if !brief.negative_prompt.is_empty() {
                settings
                    .prompt
                    .push_str(&format!("\nAvoid: {}", brief.negative_prompt));
            }
            settings.negative_prompt = String::new();
            settings.brief_id = Some(brief_id);
            settings.parent_job_id = None;
            tasks.push(Task::Generate(settings));
        }
        crate::jobs::enqueue_many(&workspace, tasks)
    })
    .await?;
    changed(&app);
    Ok(jobs)
}
#[tauri::command]
pub async fn queue_generation(
    app: AppHandle,
    workspace: State<'_, Shared>,
    input: GenerationInput,
) -> Result<Job> {
    let workspace = workspace.inner().clone();
    let job = blocking(move || crate::jobs::enqueue(&workspace, Task::Generate(input))).await?;
    changed(&app);
    Ok(job)
}
#[tauri::command]
pub async fn queue_research(
    app: AppHandle,
    workspace: State<'_, Shared>,
    input: TextInput,
) -> Result<Job> {
    let workspace = workspace.inner().clone();
    let job = blocking(move || crate::jobs::enqueue(&workspace, Task::Research(input))).await?;
    changed(&app);
    Ok(job)
}
#[tauri::command]
pub async fn queue_brief_batch(
    app: AppHandle,
    workspace: State<'_, Shared>,
    input: TextInput,
) -> Result<Job> {
    let workspace = workspace.inner().clone();
    let job = blocking(move || crate::jobs::enqueue(&workspace, Task::BriefBatch(input))).await?;
    changed(&app);
    Ok(job)
}
#[tauri::command]
pub async fn queue_metadata(
    app: AppHandle,
    workspace: State<'_, Shared>,
    ids: Vec<String>,
    provider: String,
    model: String,
) -> Result<Vec<Job>> {
    if ids.is_empty() || ids.len() > 50 {
        return Err(AppError::validation(
            "Select between 1 and 50 images for metadata.",
        ));
    }
    let workspace = workspace.inner().clone();
    let jobs = blocking(move || {
        let tasks: Vec<_> = ids
            .into_iter()
            .map(|asset_id| Task::Metadata {
                provider: provider.clone(),
                model: model.clone(),
                asset_id,
            })
            .collect();
        crate::jobs::enqueue_many(&workspace, tasks)
    })
    .await?;
    changed(&app);
    Ok(jobs)
}
#[tauri::command]
pub async fn queue_repair(
    app: AppHandle,
    workspace: State<'_, Shared>,
    asset_id: String,
    mode: String,
) -> Result<Job> {
    let workspace = workspace.inner().clone();
    let job =
        blocking(move || crate::jobs::enqueue(&workspace, Task::Repair { asset_id, mode })).await?;
    changed(&app);
    Ok(job)
}
#[tauri::command]
pub async fn check_provider_result(
    app: AppHandle,
    workspace: State<'_, Shared>,
    job_id: String,
    history_uuid: Option<String>,
) -> Result<Job> {
    let result = crate::jobs::recover(workspace.inner(), &job_id, history_uuid.as_deref()).await;
    changed(&app);
    result
}
#[tauri::command]
pub async fn cancel_job(
    app: AppHandle,
    workspace: State<'_, Shared>,
    job_id: String,
) -> Result<()> {
    let workspace = workspace.inner().clone();
    blocking(move || crate::jobs::cancel(&workspace, &job_id)).await?;
    changed(&app);
    Ok(())
}
#[tauri::command]
pub async fn retry_generation(
    app: AppHandle,
    workspace: State<'_, Shared>,
    job_id: String,
) -> Result<Job> {
    let workspace = workspace.inner().clone();
    let job = blocking(move || {
        let parent: Job = crate::persistence::record(
            &*workspace.conn()?,
            "SELECT data FROM jobs WHERE id=?1",
            &job_id,
        )?;
        if !["failed", "interrupted"].contains(&parent.status.as_str()) {
            return Err(AppError::validation(
                "Only failed or interrupted generation attempts can be retried.",
            ));
        }
        let task: Task = crate::persistence::record(
            &*workspace.conn()?,
            "SELECT input FROM job_inputs WHERE job_id=?1",
            &job_id,
        )?;
        let Task::Generate(mut input) = task else {
            return Err(AppError::validation(
                "This job is not an image generation attempt.",
            ));
        };
        input.parent_job_id = Some(job_id);
        crate::jobs::enqueue(&workspace, Task::Generate(input))
    })
    .await?;
    changed(&app);
    Ok(job)
}
async fn blocking<T: Send + 'static>(
    task: impl FnOnce() -> Result<T> + Send + 'static,
) -> Result<T> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|_| AppError::new("worker", "The local task stopped unexpectedly."))?
}

#[tauri::command]
pub async fn workspace_snapshot(workspace: State<'_, Shared>) -> Result<Snapshot> {
    let workspace = workspace.inner().clone();
    blocking(move || workspace.snapshot()).await
}
#[tauri::command]
pub async fn save_opportunity(
    app: AppHandle,
    workspace: State<'_, Shared>,
    input: OpportunityInput,
) -> Result<Opportunity> {
    let workspace = workspace.inner().clone();
    let value = blocking(move || workspace.save_opportunity(input)).await?;
    changed(&app);
    Ok(value)
}
#[tauri::command]
pub async fn save_brief(
    app: AppHandle,
    workspace: State<'_, Shared>,
    input: BriefInput,
) -> Result<Brief> {
    let workspace = workspace.inner().clone();
    let value = blocking(move || workspace.save_brief(input)).await?;
    changed(&app);
    Ok(value)
}
#[tauri::command]
pub async fn save_review(
    app: AppHandle,
    workspace: State<'_, Shared>,
    input: ReviewInput,
) -> Result<Asset> {
    let workspace = workspace.inner().clone();
    let value = blocking(move || workspace.save_review(input)).await?;
    changed(&app);
    Ok(value)
}
#[tauri::command]
pub async fn bulk_review(
    app: AppHandle,
    workspace: State<'_, Shared>,
    ids: Vec<String>,
    decision: String,
) -> Result<usize> {
    let workspace = workspace.inner().clone();
    let count = blocking(move || workspace.bulk_review(&ids, &decision)).await?;
    changed(&app);
    Ok(count)
}
#[tauri::command]
pub async fn import_images(
    app: AppHandle,
    workspace: State<'_, Shared>,
    brief_id: Option<String>,
) -> Result<usize> {
    let workspace = workspace.inner().clone();
    let picker_app = app.clone();
    let paths = blocking(move || {
        let selected = picker_app
            .dialog()
            .file()
            .add_filter("Images", &["jpg", "jpeg", "png", "webp"])
            .blocking_pick_files();
        selected
            .map(|paths| {
                paths
                    .into_iter()
                    .map(|p| {
                        p.into_path()
                            .map_err(|_| AppError::validation("Choose a local image file."))
                    })
                    .collect::<Result<Vec<_>>>()
            })
            .transpose()
    })
    .await?;
    let Some(paths) = paths else {
        return Ok(0);
    };
    let event_app = app.clone();
    let result = blocking(move || {
        let job = workspace.start_job("image import")?;
        changed(&event_app);
        let result = crate::assets::import_images(&workspace, paths, brief_id);
        workspace.finish_job(job, result.as_ref().err())?;
        result
    })
    .await;
    changed(&app);
    result
}
#[tauri::command]
pub async fn export_package(
    app: AppHandle,
    workspace: State<'_, Shared>,
    ids: Vec<String>,
    name: String,
) -> Result<Option<ExportBatch>> {
    let workspace = workspace.inner().clone();
    let picker_app = app.clone();
    let destination = blocking(move || {
        picker_app
            .dialog()
            .file()
            .blocking_pick_folder()
            .map(|p| {
                p.into_path()
                    .map_err(|_| AppError::validation("Choose a local folder."))
            })
            .transpose()
    })
    .await?;
    let Some(destination) = destination else {
        return Ok(None);
    };
    let event_app = app.clone();
    let result = blocking(move || {
        let job = workspace.start_job("Adobe package")?;
        changed(&event_app);
        let result = crate::assets::export_package(&workspace, ids, name, &destination);
        workspace.finish_job(job, result.as_ref().err())?;
        result.map(Some)
    })
    .await;
    changed(&app);
    result
}
#[tauri::command]
pub async fn save_preferences(
    app: AppHandle,
    workspace: State<'_, Shared>,
    input: Preferences,
) -> Result<()> {
    text(&input.workspace_name, "Workspace name", 100)?;
    text(&input.region, "Region", 100)?;
    if !["local", "openai", "gemini"].contains(&input.default_text_provider.as_str()) {
        return Err(AppError::validation(
            "Choose a supported default text provider.",
        ));
    }
    text(&input.default_text_model, "Default text model", 100)?;
    if !crate::providers::capabilities()
        .iter()
        .any(|c| c.provider == input.default_image_provider && c.model == input.default_image_model)
    {
        return Err(AppError::validation(
            "Choose a supported default image model.",
        ));
    }
    if input.prohibited_terms.len() > 500 || input.prohibited_terms.iter().any(|s| s.len() > 200) {
        return Err(AppError::validation(
            "Use at most 500 prohibited terms, each at most 200 characters.",
        ));
    }
    let workspace = workspace.inner().clone();
    blocking(move || {
        workspace.write_conn()?.execute(
            "UPDATE settings SET value=?1 WHERE key='preferences'",
            [serialize(&input)?],
        )?;
        Ok(())
    })
    .await?;
    changed(&app);
    Ok(())
}
#[tauri::command]
pub async fn save_provider_key(
    app: AppHandle,
    workspace: State<'_, Shared>,
    provider: String,
    key: String,
) -> Result<()> {
    let workspace = workspace.inner().clone();
    blocking(move || crate::security::save_key(&workspace, &provider, &key)).await?;
    changed(&app);
    Ok(())
}
#[tauri::command]
pub async fn remove_provider_key(
    app: AppHandle,
    workspace: State<'_, Shared>,
    provider: String,
) -> Result<()> {
    let workspace = workspace.inner().clone();
    blocking(move || crate::security::remove_key(&workspace, &provider)).await?;
    changed(&app);
    Ok(())
}
#[tauri::command]
pub async fn test_provider(
    app: AppHandle,
    workspace: State<'_, Shared>,
    provider: String,
) -> Result<()> {
    let result = crate::security::test_connection(workspace.inner(), &provider).await;
    changed(&app);
    result
}
#[tauri::command]
pub async fn backup_workspace(app: AppHandle, workspace: State<'_, Shared>) -> Result<bool> {
    let workspace = workspace.inner().clone();
    let picker_app = app.clone();
    let path = blocking(move || {
        picker_app
            .dialog()
            .file()
            .set_file_name(format!(
                "thoock-{}.zip",
                chrono::Utc::now().format("%Y%m%d-%H%M%S")
            ))
            .add_filter("Thoock backup", &["zip"])
            .blocking_save_file()
            .map(|p| {
                p.into_path()
                    .map_err(|_| AppError::validation("Choose a local backup destination."))
            })
            .transpose()
    })
    .await?;
    let Some(path) = path else {
        return Ok(false);
    };
    blocking(move || crate::backup::backup(&workspace, &path)).await?;
    changed(&app);
    Ok(true)
}
#[tauri::command]
pub async fn restore_workspace(app: AppHandle, workspace: State<'_, Shared>) -> Result<bool> {
    let workspace = workspace.inner().clone();
    let picker_app = app.clone();
    let path = blocking(move || {
        picker_app
            .dialog()
            .file()
            .add_filter("Thoock backup", &["zip"])
            .blocking_pick_file()
            .map(|p| {
                p.into_path()
                    .map_err(|_| AppError::validation("Choose a local backup."))
            })
            .transpose()
    })
    .await?;
    let Some(path) = path else {
        return Ok(false);
    };
    blocking(move || {
        workspace.begin_replacement()?;
        let result = crate::backup::stage_restore(&workspace, &path);
        if result.is_err() {
            workspace.cancel_replacement();
        }
        result
    })
    .await?;
    changed(&app);
    Ok(true)
}

#[tauri::command]
pub async fn preview_opportunity_csv(content: String) -> Result<Vec<OpportunityInput>> {
    if content.len() > 2 * 1024 * 1024 {
        return Err(AppError::validation("CSV files must be at most 2 MB."));
    }
    let mut reader = csv::ReaderBuilder::new()
        .trim(csv::Trim::All)
        .from_reader(content.as_bytes());
    let mut inputs = vec![];
    for (index, row) in reader.deserialize::<OpportunityInput>().enumerate() {
        let mut input = row.map_err(|_| {
            AppError::validation(format!(
                "Row {} has missing or invalid fields. Use the supplied CSV header.",
                index + 2
            ))
        })?;
        input.id = None;
        text(&input.topic, "Topic", 200)?;
        text(&input.buyer, "Buyer", 200)?;
        text(&input.market, "Market", 200)?;
        score(input.demand, input.competition, input.commercial_fit)?;
        crate::persistence::bounded(&input.notes, 10000)?;
        inputs.push(input);
        if inputs.len() > 1000 {
            return Err(AppError::validation(
                "Import at most 1,000 opportunities at a time.",
            ));
        }
    }
    if inputs.is_empty() {
        return Err(AppError::validation("CSV contains no opportunities."));
    }
    Ok(inputs)
}
#[tauri::command]
pub async fn import_opportunities(
    app: AppHandle,
    workspace: State<'_, Shared>,
    inputs: Vec<OpportunityInput>,
) -> Result<usize> {
    if inputs.is_empty() || inputs.len() > 1000 {
        return Err(AppError::validation(
            "Import between 1 and 1,000 opportunities.",
        ));
    }
    let workspace = workspace.inner().clone();
    let count = blocking(move || {
        let mut db = workspace.write_conn()?;
        let tx = db.transaction()?;
        let count = inputs.len();
        for input in inputs {
            let value = Opportunity {
                details: validate_opportunity_details(input.details)?,
                id: id(),
                topic: text(&input.topic, "Topic", 200)?,
                buyer: text(&input.buyer, "Buyer", 200)?,
                market: text(&input.market, "Market", 200)?,
                score: score(input.demand, input.competition, input.commercial_fit)?,
                demand: input.demand,
                competition: input.competition,
                commercial_fit: input.commercial_fit,
                notes: crate::persistence::bounded(&input.notes, 10000)?,
                created_at: now(),
            };
            tx.execute(
                "INSERT INTO opportunities VALUES (?1, ?2, ?3, ?4)",
                params![value.id, value.topic, serialize(&value)?, value.created_at],
            )?;
        }
        tx.commit()?;
        Ok(count)
    })
    .await?;
    changed(&app);
    Ok(count)
}
