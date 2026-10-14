use crate::{domain::*, persistence::Workspace};
use std::{fs, io::Write};
use zip::{write::SimpleFileOptions, ZipWriter};

pub fn redact(value: &str, known_secrets: &[String]) -> String {
    let mut value = value.to_string();
    for secret in known_secrets.iter().filter(|s| !s.is_empty()) {
        value = value.replace(secret, "[redacted]");
    }
    // A normalized log does not carry headers. This also protects hand-written diagnostics.
    value
        .split_whitespace()
        .map(|word| {
            let token = word.trim_matches(|c: char| !c.is_ascii_alphanumeric() && c != '-');
            if (token.starts_with("sk-") || token.starts_with("AIza")) && token.len() > 12 {
                "[redacted]".to_string()
            } else {
                word.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}
pub fn redact_value(value: &mut serde_json::Value, known_secrets: &[String]) {
    match value {
        serde_json::Value::String(s) => {
            for secret in known_secrets.iter().filter(|s| !s.is_empty()) {
                *s = s.replace(secret, "[redacted]");
            }
        }
        serde_json::Value::Array(items) => {
            for item in items {
                redact_value(item, known_secrets);
            }
        }
        serde_json::Value::Object(map) => {
            for (key, value) in map.iter_mut() {
                if [
                    "authorization",
                    "x-api-key",
                    "apikey",
                    "api_key",
                    "key",
                    "token",
                    "password",
                    "cookie",
                    "set-cookie",
                ]
                .contains(&key.to_ascii_lowercase().as_str())
                {
                    *value = serde_json::Value::String("[redacted]".into());
                } else {
                    redact_value(value, known_secrets);
                }
            }
        }
        _ => {}
    }
}
pub fn support_bundle(workspace: &Workspace, destination: &std::path::Path) -> Result<()> {
    let snapshot = workspace.snapshot()?;
    // Support bundles intentionally exclude SQLite, prompts, keys, paths, and images.
    let summary = serde_json::json!({"appVersion":env!("CARGO_PKG_VERSION"),"schemaVersion":snapshot.schema_version,"platform":std::env::consts::OS,"counts":{"opportunities":snapshot.opportunities.len(),"briefs":snapshot.briefs.len(),"assets":snapshot.assets.len(),"jobs":snapshot.jobs.len()},"storageBytes":snapshot.storage_bytes});
    let file = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(destination)
        .map_err(|_| AppError::validation("Choose a new filename for the support bundle."))?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    zip.start_file("environment.json", options)?;
    zip.write_all(&serde_json::to_vec_pretty(&summary)?)?;
    zip.start_file("diagnostics.jsonl", options)?;
    for log in snapshot.logs {
        let safe = serde_json::json!({"id":log.id,"provider":log.provider,"operation":log.operation,"status":log.status,"durationMs":log.duration_ms,"createdAt":log.created_at});
        writeln!(zip, "{safe}")?;
    }
    zip.finish()?.sync_all()?;
    Ok(())
}
pub fn rotate_logs(root: &std::path::Path) -> Result<()> {
    let cutoff = chrono::Utc::now() - chrono::Duration::days(30);
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        if entry.file_type()?.is_file()
            && entry
                .metadata()?
                .modified()
                .is_ok_and(|time| chrono::DateTime::<chrono::Utc>::from(time) < cutoff)
        {
            fs::remove_file(entry.path())?;
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn redaction_removes_known_values_and_credential_fields() {
        let secret = "example-secret-value".to_string();
        let mut value = serde_json::json!({"headers":{"Authorization":"Bearer hidden","x-api-key":"hidden"},"body":{"text":format!("Echo {secret}")},"nested":[{"password":"hidden"}]});
        redact_value(&mut value, &[secret.clone()]);
        let text = value.to_string();
        assert!(!text.contains("hidden"));
        assert!(!text.contains(&secret));
        assert_eq!(
            redact("Failed sk-example-provider-secret-value", &[]),
            "Failed [redacted]"
        );
    }
}
