use crate::{domain::*, persistence::Workspace};
use std::{
    fs,
    io::{Read, Write},
    path::Path,
};
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

pub fn backup(workspace: &Workspace, destination: &Path) -> Result<()> {
    let _files = workspace.files_lock()?;
    let staging = tempfile::tempdir_in(workspace.root.join("backups"))?;
    let database = staging.path().join("thoock.sqlite3");
    // Hold the workspace lock until files are captured so DB references and assets agree.
    let db = workspace.conn()?;
    db.backup(rusqlite::DatabaseName::Main, &database, None)?;
    let parent = destination
        .parent()
        .ok_or_else(|| AppError::validation("Choose a valid destination."))?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    let mut zip = ZipWriter::new(temporary.as_file_mut());
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    zip.start_file("thoock.sqlite3", options)?;
    std::io::copy(&mut fs::File::open(&database)?, &mut zip)?;
    zip.start_file("backup-manifest.json", options)?;
    zip.write_all(&serde_json::to_vec(
        &serde_json::json!({"format":"thoock-backup","version":1,"createdAt":now()}),
    )?)?;
    add_directory(&mut zip, &workspace.root, &workspace.root.join("assets"))?;
    add_directory(&mut zip, &workspace.root, &workspace.root.join("exports"))?;
    zip.finish()?;
    temporary.as_file().sync_all()?;
    // persist_noclobber also handles a destination created after the picker closed.
    temporary.persist_noclobber(destination).map_err(|_| {
        AppError::new(
            "backup_destination",
            "The backup destination already exists or is not writable. Choose a new filename.",
        )
    })?;
    drop(db);
    Ok(())
}
fn add_directory<W: Write + std::io::Seek>(
    zip: &mut ZipWriter<W>,
    root: &Path,
    directory: &Path,
) -> Result<()> {
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        if entry.file_type()?.is_symlink() {
            return Err(AppError::validation(
                "Backups cannot include symbolic links.",
            ));
        }
        if entry.file_type()?.is_dir() {
            add_directory(zip, root, &entry.path())?;
        } else {
            let path = entry.path();
            let name = path
                .strip_prefix(root)
                .map_err(|_| AppError::validation("Unsafe backup path."))?
                .to_string_lossy()
                .replace('\\', "/");
            zip.start_file(name, options)?;
            std::io::copy(&mut fs::File::open(path)?, zip)?;
        }
    }
    Ok(())
}
pub fn stage_restore(workspace: &Workspace, archive: &Path) -> Result<()> {
    let parent = workspace
        .root
        .parent()
        .ok_or_else(|| AppError::validation("Invalid workspace location."))?;
    let staging = tempfile::tempdir_in(parent)?;
    let mut zip = ZipArchive::new(fs::File::open(archive)?)?;
    if zip.len() > 100_000 {
        return Err(AppError::validation("The backup contains too many files."));
    }
    let manifest: serde_json::Value =
        serde_json::from_reader(zip.by_name("backup-manifest.json")?.take(4096))?;
    if manifest["format"] != "thoock-backup" || manifest["version"] != 1 {
        return Err(AppError::validation(
            "This is not a supported Thoock backup.",
        ));
    }
    let mut total_bytes = 0u64;
    let mut seen = std::collections::HashSet::new();
    for index in 0..zip.len() {
        let mut file = zip.by_index(index)?;
        let name = file.name().to_string();
        if !seen.insert(name.to_lowercase())
            || name.contains('\\')
            || name.contains(':')
            || file.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000)
        {
            return Err(AppError::validation(
                "The backup contains unsafe or duplicate paths.",
            ));
        }
        let relative = file
            .enclosed_name()
            .ok_or_else(|| AppError::validation("The backup contains an unsafe path."))?;
        if !(name == "thoock.sqlite3"
            || name == "backup-manifest.json"
            || name.starts_with("assets/")
            || name.starts_with("exports/"))
        {
            return Err(AppError::validation(
                "The backup contains unexpected files.",
            ));
        }
        total_bytes = total_bytes
            .checked_add(file.size())
            .ok_or_else(|| AppError::validation("Backup size overflow."))?;
        if total_bytes > 20 * 1024 * 1024 * 1024 {
            return Err(AppError::validation(
                "Backups larger than 20 GB are not supported by this restore flow.",
            ));
        }
        let path = staging.path().join(relative);
        if file.is_dir() {
            fs::create_dir_all(path)?;
            continue;
        }
        fs::create_dir_all(
            path.parent()
                .ok_or_else(|| AppError::validation("Invalid archive path."))?,
        )?;
        let mut output = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(path)?;
        std::io::copy(&mut file, &mut output)?;
        output.sync_all()?;
    }
    if !staging.path().join("thoock.sqlite3").is_file() {
        return Err(AppError::validation("The backup database is missing."));
    }
    let check = rusqlite::Connection::open_with_flags(
        staging.path().join("thoock.sqlite3"),
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )?;
    let version: u32 = check.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if !(1..=4).contains(&version) {
        return Err(AppError::validation(
            "The backup database schema is unsupported.",
        ));
    }
    drop(check);
    let staged = Workspace::open(staging.path().to_owned())?;
    let integrity: String = staged
        .conn()?
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
    if integrity != "ok" {
        return Err(AppError::validation(
            "The backup database failed its integrity check.",
        ));
    }
    let fk_errors: bool = staged
        .conn()?
        .prepare("PRAGMA foreign_key_check")?
        .exists([])?;
    if fk_errors {
        return Err(AppError::validation(
            "The backup contains broken record references.",
        ));
    }
    let snapshot = staged.snapshot()?;
    for asset in snapshot.assets {
        if uuid::Uuid::parse_str(&asset.id).is_err() {
            return Err(AppError::validation(
                "The backup has an unsafe asset identifier.",
            ));
        }
        let original: String = staged.conn()?.query_row(
            "SELECT original FROM assets WHERE id=?1",
            [&asset.id],
            |r| r.get(0),
        )?;
        let path = crate::assets::scoped_path(&staged.root, &original)?;
        use sha2::{Digest, Sha256};
        if format!("{:x}", Sha256::digest(fs::read(path)?)) != asset.hash {
            return Err(AppError::validation(
                "An image checksum does not match the backup database.",
            ));
        }
    }
    // Keys stay in the OS vault. Imported references cannot claim a key is configured on this machine.
    staged.conn()?.execute("DELETE FROM credential_refs", [])?;
    staged
        .conn()?
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")?;
    drop(staged);
    fs::write(staging.path().join(".restore-ready"), b"1")?;
    let pending = parent.join("workspace.pending");
    if pending.exists() {
        return Err(AppError::validation(
            "A restore is already staged. Restart Thoock to activate it.",
        ));
    }
    fs::rename(staging.path(), pending)?;
    Ok(())
}
pub fn activate_restore(parent: &Path) -> Result<()> {
    let current = parent.join("workspace");
    let pending = parent.join("workspace.pending");
    let previous = parent.join("workspace.previous");
    if pending.join(".restore-ready").exists() {
        if current.exists() {
            if previous.exists() {
                fs::rename(
                    &previous,
                    parent.join(format!("workspace.rollback-{}", id())),
                )?;
            }
            fs::rename(&current, &previous)?;
        }
        if let Err(error) = fs::rename(&pending, &current) {
            if !current.exists() && previous.exists() {
                let _ = fs::rename(&previous, &current);
            }
            return Err(error.into());
        }
        fs::remove_file(current.join(".restore-ready"))?;
    } else if !current.exists() && previous.exists() {
        fs::rename(&previous, &current)?;
    }
    // Keep the old workspace beside the active folder as a rollback artifact.
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn backup_restore_preserves_workspace_and_validates_before_activation() {
        let dir = tempfile::tempdir().unwrap();
        let workspace = Workspace::open(dir.path().join("workspace")).unwrap();
        let original_id = workspace.snapshot().unwrap().workspace_id;
        let archive = dir.path().join("backup.zip");
        backup(&workspace, &archive).unwrap();
        stage_restore(&workspace, &archive).unwrap();
        assert!(workspace.root.exists());
        drop(workspace);
        activate_restore(dir.path()).unwrap();
        assert!(dir.path().join("workspace.previous").exists());
        assert_eq!(
            Workspace::open(dir.path().join("workspace"))
                .unwrap()
                .snapshot()
                .unwrap()
                .workspace_id,
            original_id
        );
    }
}
