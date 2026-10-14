use crate::{domain::*, persistence::Workspace};
use rusqlite::params;

fn vault_error(error: keyring::Error) -> AppError {
    // Do not format arbitrary vault errors: BadEncoding can contain the secret bytes.
    match error {
        keyring::Error::NoEntry => AppError::new(
            "credential_missing",
            "The provider key is missing from the operating-system vault. Paste it again in Settings → Providers and save it.",
        ),
        keyring::Error::NoStorageAccess(cause) | keyring::Error::PlatformFailure(cause) => {
            #[cfg(target_os = "macos")]
            if let Some(native) = cause.downcast_ref::<security_framework::base::Error>() {
                return macos_vault_error(native.code());
            }
            let message = if cfg!(target_os = "macos") {
                "macOS Keychain could not complete the operation. Unlock your login keychain in Keychain Access and allow Thoock access if prompted, then try again."
            } else {
                "The operating-system credential vault could not complete the operation. Unlock the vault and allow Thoock access, then try again."
            };
            AppError::new("credential_vault_access", message)
        }
        _ => AppError::new(
            "credential_vault",
            "The provider key could not be stored or read securely. Paste a replacement key in Settings → Providers and save it.",
        ),
    }
}

#[cfg(target_os = "macos")]
fn macos_vault_error(status: i32) -> AppError {
    let guidance = match status {
        -25293 => "macOS refused Keychain authorization. Approve the access prompt if shown. If no prompt appears in tauri dev, retry from the signed development Thoock.app.",
        -25308 | -25315 => "macOS cannot show the Keychain authorization prompt in this session. Unlock the login keychain and launch Thoock from your logged-in desktop session.",
        -25291 | -25294 | -25295 => "The login keychain is unavailable. Open Keychain Access and check that the login keychain exists and is unlocked.",
        -67050 | -67062 => "macOS rejected the app's code signature. Quit Thoock and reopen a freshly signed development bundle.",
        -34018 => "The app's signing identity does not have the required Keychain entitlement. Use a correctly signed build.",
        _ => "macOS Keychain failed. Retry from the signed development Thoock.app and check Keychain Access.",
    };
    AppError::new(
        "credential_vault_access",
        format!("{guidance} (OSStatus {status})"),
    )
}

pub fn read_key(provider: &str) -> Result<String> {
    entry(provider)?.get_password().map_err(vault_error)
}
pub fn entry(provider: &str) -> Result<keyring::Entry> {
    if !["openai", "gemini", "snapgen"].contains(&provider) {
        return Err(AppError::validation("Unknown provider."));
    }
    keyring::Entry::new("com.ryuda.thoock-desktop-app", provider).map_err(|_| {
        AppError::new(
            "credential_vault",
            "The operating-system credential vault is unavailable.",
        )
    })
}
pub fn save_key(workspace: &Workspace, provider: &str, key: &str) -> Result<()> {
    save_key_using(workspace, provider, key, entry)
}
fn save_key_using(
    workspace: &Workspace,
    provider: &str,
    key: &str,
    create_entry: impl Fn(&str) -> Result<keyring::Entry>,
) -> Result<()> {
    workspace.ensure_writable()?;
    if key.trim().is_empty() || key.len() > 4096 {
        return Err(AppError::validation("Enter a valid provider key."));
    }
    create_entry(provider)?
        .set_password(key.trim())
        .map_err(vault_error)?;
    // Use a fresh entry, just as connection tests and generation do. A successful
    // write alone does not prove that a later operation can retrieve this key.
    let readable = create_entry(provider)?
        .get_password()
        .map_err(vault_error)?;
    if readable != key.trim() {
        return Err(AppError::new(
            "credential_vault",
            "The credential vault did not return the newly saved key. Unlock the vault and save the key again.",
        ));
    }
    workspace.conn()?.execute("INSERT INTO credential_refs (provider_id, vault_entry, status) VALUES (?1, ?1, 'untested') ON CONFLICT(provider_id) DO UPDATE SET status='untested', last_tested=NULL", [provider])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_does_not_claim_success_when_a_fresh_lookup_cannot_read_the_key() {
        let dir = tempfile::tempdir().unwrap();
        let workspace = Workspace::open(dir.path().to_owned()).unwrap();
        // This store accepts writes but loses the key between independently created entries.
        let result = save_key_using(&workspace, "openai", "disposable-test-key", |_| {
            Ok(keyring::Entry::new_with_credential(Box::new(
                keyring::mock::MockCredential::default(),
            )))
        });
        assert!(
            result.is_err(),
            "an unreadable key must never be reported as saved"
        );
        assert!(
            !workspace
                .snapshot()
                .unwrap()
                .providers
                .iter()
                .find(|p| p.id == "openai")
                .unwrap()
                .configured
        );
    }

    #[test]
    fn save_requires_the_fresh_lookup_to_match_the_replacement_key() {
        use keyring::credential::CredentialApi;
        let dir = tempfile::tempdir().unwrap();
        let workspace = Workspace::open(dir.path().to_owned()).unwrap();
        let result = save_key_using(&workspace, "openai", "replacement-key", |_| {
            let mock = keyring::mock::MockCredential::default();
            mock.set_password("previous-key").unwrap();
            Ok(keyring::Entry::new_with_credential(Box::new(mock)))
        });
        assert!(result.is_err());
        assert!(!workspace
            .snapshot()
            .unwrap()
            .providers
            .iter()
            .any(|p| p.configured));
    }

    #[test]
    fn verified_save_records_the_key_without_exposing_it() {
        use keyring::credential::CredentialApi;
        let dir = tempfile::tempdir().unwrap();
        let workspace = Workspace::open(dir.path().to_owned()).unwrap();
        let count = std::cell::Cell::new(0);
        save_key_using(&workspace, "openai", "  disposable-test-key  ", |_| {
            count.set(count.get() + 1);
            let mock = keyring::mock::MockCredential::default();
            if count.get() == 2 {
                mock.set_password("disposable-test-key").unwrap();
            }
            Ok(keyring::Entry::new_with_credential(Box::new(mock)))
        })
        .unwrap();
        assert_eq!(count.get(), 2);
        let snapshot = workspace.snapshot().unwrap();
        let provider = snapshot
            .providers
            .iter()
            .find(|p| p.id == "openai")
            .unwrap();
        assert!(provider.configured);
        assert_eq!(provider.status, "untested");
        assert!(!serde_json::to_string(&snapshot)
            .unwrap()
            .contains("disposable-test-key"));
    }

    #[test]
    fn vault_failures_have_safe_diagnostics_and_distinct_recovery_messages() {
        let missing = vault_error(keyring::Error::NoEntry);
        let inaccessible = vault_error(keyring::Error::NoStorageAccess(Box::new(
            std::io::Error::other("private details"),
        )));
        assert_ne!(missing.code, inaccessible.code);
        assert!(!inaccessible.message.contains("private details"));
        let dir = tempfile::tempdir().unwrap();
        let workspace = Workspace::open(dir.path().to_owned()).unwrap();
        workspace.conn().unwrap().execute("INSERT INTO credential_refs (provider_id, vault_entry, status) VALUES ('openai', 'openai', 'untested')", []).unwrap();
        let error = record_vault_failure(
            &workspace,
            "openai",
            vault_error(keyring::Error::BadEncoding(
                b"do-not-expose-secret".to_vec(),
            )),
        )
        .unwrap();
        let snapshot = workspace.snapshot().unwrap();
        assert_eq!(
            snapshot
                .providers
                .iter()
                .find(|p| p.id == "openai")
                .unwrap()
                .status,
            "key unavailable"
        );
        let log = snapshot
            .logs
            .iter()
            .find(|l| l.id == error.correlation_id)
            .unwrap();
        assert_eq!(log.request_summary["providerRequestSent"], false);
        assert!(!serde_json::to_string(&snapshot)
            .unwrap()
            .contains("do-not-expose-secret"));
    }

    #[test]
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    fn native_build_uses_a_persistent_vault_backend() {
        assert!(matches!(
            keyring::default::default_credential_builder().persistence(),
            keyring::credential::CredentialPersistence::UntilDelete
        ));
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn macos_errors_preserve_numeric_status_without_guessing_the_keychain_is_locked() {
        for (status, guidance) in [
            (-25293, "refused Keychain authorization"),
            (-25308, "cannot show"),
            (-67050, "code signature"),
            (-34018, "entitlement"),
        ] {
            let native = security_framework::base::Error::from(status);
            let error = vault_error(keyring::Error::PlatformFailure(Box::new(native)));
            assert!(error.message.contains(guidance));
            assert!(error.message.contains(&format!("OSStatus {status}")));
        }
    }
}
pub fn remove_key(workspace: &Workspace, provider: &str) -> Result<()> {
    workspace.ensure_writable()?;
    match entry(provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => {}
        Err(_) => {
            return Err(AppError::new(
                "credential_vault",
                "The key could not be removed from the operating-system credential vault.",
            ))
        }
    }
    workspace.conn()?.execute(
        "DELETE FROM credential_refs WHERE provider_id=?1",
        [provider],
    )?;
    Ok(())
}
pub async fn test_connection(workspace: &Workspace, provider: &str) -> Result<()> {
    let credential = match read_key(provider) {
        Ok(key) => key,
        Err(error) => return Err(record_vault_failure(workspace, provider, error)?),
    };
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .retry(reqwest::retry::never())
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|_| {
            AppError::new(
                "provider_network",
                "The provider connection could not be initialized.",
            )
        })?;
    let request = match provider {
        "openai" => client
            .get("https://api.openai.com/v1/models")
            .bearer_auth(&credential),
        "gemini" => client
            .get("https://generativelanguage.googleapis.com/v1beta/models")
            .header("x-goog-api-key", &credential),
        "snapgen" => client
            .get("https://api.snapgen.ai/uapi/v1/histories")
            .query(&[("items_per_page", "1"), ("page", "1")])
            .header("x-api-key", &credential),
        _ => return Err(AppError::new(
            "not_supported",
            "SnapGen connection testing will be enabled after its adapter contract is verified.",
        )),
    };
    let started = std::time::Instant::now();
    let response = request.send().await;
    let (status, message) = match response {
        Ok(response) if response.status().is_success() => (
            "connected",
            "Connection verified with a read-only model lookup.",
        ),
        Ok(response) if response.status().as_u16() == 401 || response.status().as_u16() == 403 => (
            "failed",
            "The provider rejected the credential or its permissions.",
        ),
        Ok(_) => (
            "failed",
            "The provider returned an unsuccessful response. Try again later.",
        ),
        Err(_) => (
            "failed",
            "The provider could not be reached. Check your network connection.",
        ),
    };
    // The reqwest error and raw response never enter logs: either may contain secrets.
    workspace.conn()?.execute(
        "UPDATE credential_refs SET status=?1, last_tested=?2 WHERE provider_id=?3",
        params![status, now(), provider],
    )?;
    let log = Log {
        id: id(),
        provider: provider.into(),
        operation: "connection test".into(),
        status: status.into(),
        message: message.into(),
        duration_ms: started.elapsed().as_millis() as u64,
        created_at: now(),
        request_summary: serde_json::json!({"method":"GET","operation":"connection test"}),
        response_summary: serde_json::json!({"status":status}),
        ..Default::default()
    };
    workspace.log(log.clone())?;
    if status != "connected" {
        return Err(AppError {
            code: "provider_connection".into(),
            message: message.into(),
            correlation_id: log.id,
        });
    }
    Ok(())
}

fn record_vault_failure(
    workspace: &Workspace,
    provider: &str,
    mut error: AppError,
) -> Result<AppError> {
    // Only static, normalized facts reach diagnostics. No key or OS error payload.
    workspace.conn()?.execute(
        "UPDATE credential_refs SET status='key unavailable', last_tested=?1 WHERE provider_id=?2",
        params![now(), provider],
    )?;
    let log = Log {
        id: error.correlation_id.clone(),
        provider: provider.into(),
        operation: "connection test".into(),
        status: "failed".into(),
        message: error.message.clone(),
        created_at: now(),
        request_summary: serde_json::json!({"stage":"credential vault","providerRequestSent":false}),
        response_summary: serde_json::json!({"code":error.code}),
        ..Default::default()
    };
    workspace.log(log.clone())?;
    error.correlation_id = log.id;
    Ok(error)
}
