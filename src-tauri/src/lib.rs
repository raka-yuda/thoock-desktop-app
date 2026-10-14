mod assets;
mod backup;
mod commands;
mod csv_io;
mod domain;
mod jobs;
mod migration;
mod observability;
mod persistence;
mod providers;
mod security;
mod storage;
use std::sync::Arc;
use tauri::Manager;
pub fn pack_migration(
    source: &std::path::Path,
    destination: &std::path::Path,
) -> std::result::Result<(), String> {
    migration::pack(source, destination).map_err(|e| e.message)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let result = (|| -> domain::Result<_> {
                let parent = storage::base_path(app.handle())?;
                backup::activate_restore(&parent)?;
                let workspace = Arc::new(persistence::Workspace::open(parent.join("workspace"))?);
                for folder in ["assets/thumbnails", "assets/previews"] {
                    app.asset_protocol_scope()
                        .allow_directory(workspace.root.join(folder), true)
                        .map_err(|_| {
                            domain::AppError::new(
                                "asset_scope",
                                "The workspace preview scope could not be initialized.",
                            )
                        })?;
                }
                Ok(workspace)
            })();
            match result {
                Ok(workspace) => {
                    app.manage(storage::Startup { error: None });
                    app.manage(workspace.clone());
                    jobs::start(app.handle().clone(), workspace);
                }
                Err(error) => {
                    app.manage(storage::Startup { error: Some(error) });
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::workspace_snapshot,
            commands::save_opportunity,
            commands::save_brief,
            commands::save_review,
            commands::bulk_review,
            commands::import_images,
            commands::export_package,
            commands::save_preferences,
            commands::save_provider_key,
            commands::remove_provider_key,
            commands::test_provider,
            commands::backup_workspace,
            commands::restore_workspace,
            commands::preview_opportunity_csv,
            commands::import_opportunities,
            commands::model_capabilities,
            commands::queue_generation,
            commands::queue_research,
            commands::queue_brief_batch,
            commands::queue_metadata,
            commands::queue_repair,
            commands::check_provider_result,
            commands::retry_generation,
            commands::cancel_job,
            commands::generation_settings,
            commands::queue_bulk_generation,
            commands::download_asset,
            commands::original_preview,
            commands::pick_opportunity_csv,
            commands::pick_brief_csv,
            commands::preview_brief_csv,
            commands::import_briefs,
            commands::export_opportunity_csv,
            commands::export_brief_csv,
            commands::preview_migration,
            commands::import_migration,
            commands::support_bundle,
            commands::rebuild_previews,
            commands::startup_status,
            commands::relocate_workspace,
            commands::choose_workspace,
            commands::restart_app,
            commands::save_export_copy,
            commands::review_history,
            commands::set_appearance
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
