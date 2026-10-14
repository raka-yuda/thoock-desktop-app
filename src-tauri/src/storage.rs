use crate::{domain::*, persistence::Workspace};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::Manager;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Location {
    base_path: PathBuf,
}
#[derive(Clone)]
pub struct Startup {
    pub error: Option<AppError>,
}
pub fn base_path(app: &tauri::AppHandle) -> Result<PathBuf> {
    let default = app.path().app_data_dir().map_err(|_| {
        AppError::new(
            "workspace_path",
            "The platform app-data location is unavailable.",
        )
    })?;
    fs::create_dir_all(&default)?;
    let path = default.join("workspace-location.json");
    if !path.exists() {
        return Ok(default);
    }
    let location: Location = serde_json::from_slice(&fs::read(path)?)?;
    if !location.base_path.is_absolute() || !location.base_path.is_dir() {
        return Err(AppError::new("workspace_unavailable", "The configured workspace folder is unavailable. Connect its drive or choose another existing workspace."));
    }
    Ok(location.base_path)
}
pub fn set_location(app: &tauri::AppHandle, base: &Path) -> Result<()> {
    let bootstrap = app
        .path()
        .app_data_dir()
        .map_err(|_| AppError::new("workspace_path", "The app-data location is unavailable."))?;
    crate::assets::atomic_write(
        &bootstrap.join("workspace-location.json"),
        &serde_json::to_vec(&Location {
            base_path: base.canonicalize()?,
        })?,
    )
}
fn copy_directory(source: &Path, destination: &Path) -> Result<()> {
    fs::create_dir_all(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        if entry.file_type()?.is_symlink() {
            return Err(AppError::validation(
                "Workspace relocation cannot follow symbolic links.",
            ));
        }
        let target = destination.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_directory(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}
pub fn relocate(workspace: &Workspace, parent: &Path) -> Result<PathBuf> {
    let destination = parent.join("Thoock");
    if destination.exists() {
        return Err(AppError::validation(
            "The selected folder already contains Thoock. Choose a different parent folder.",
        ));
    }
    let _files = workspace.files_lock()?;
    let staging = tempfile::tempdir_in(parent)?;
    let root = staging.path().join("workspace");
    fs::create_dir_all(&root)?;
    let db = workspace.conn()?;
    db.backup(
        rusqlite::DatabaseName::Main,
        root.join("thoock.sqlite3"),
        None,
    )?;
    for folder in ["assets", "exports", "logs"] {
        copy_directory(&workspace.root.join(folder), &root.join(folder))?;
    }
    drop(db);
    let staged = Workspace::open(root)?;
    let integrity: String = staged
        .conn()?
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
    if integrity != "ok" {
        return Err(AppError::validation(
            "The relocated database failed validation.",
        ));
    }
    staged
        .conn()?
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")?;
    drop(staged);
    fs::rename(staging.path(), &destination)?;
    Ok(destination)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn relocation_preserves_identity_and_original_workspace() {
        let source = tempfile::tempdir().unwrap();
        let destination = tempfile::tempdir().unwrap();
        let workspace = Workspace::open(source.path().join("workspace")).unwrap();
        let original_id = workspace.snapshot().unwrap().workspace_id;
        let base = relocate(&workspace, destination.path()).unwrap();
        assert!(workspace.root.join("thoock.sqlite3").exists());
        let moved = Workspace::open(base.join("workspace")).unwrap();
        assert_eq!(moved.snapshot().unwrap().workspace_id, original_id);
        assert!(relocate(&workspace, destination.path()).is_err());
    }
}
