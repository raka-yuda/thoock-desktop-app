//! Provider transport is restricted to fixed API hosts. Credentials never leave this module.
use crate::{domain::*, security};
use serde_json::{json, Value};

pub fn capabilities() -> Vec<Capability> {
    let strings = |values: &[&str]| values.iter().map(|s| s.to_string()).collect();
    let mut catalog = ["nano-banana-pro", "nano-banana-2", "nano-banana-2-lite"]
        .map(|model| Capability {
            provider: "snapgen".into(),
            model: model.into(),
            label: model.into(),
            aspect_ratios: strings(&["1:1", "16:9", "9:16", "4:3", "3:4"]),
            resolutions: strings(&["1K", "2K", "4K"]),
            qualities: strings(&["Stock Photo", "Photorealistic", "None"]),
            negative_prompt: false,
            repair: true,
        })
        .to_vec();
    catalog.push(Capability {
        provider: "snapgen".into(),
        model: "grok-image".into(),
        label: "Grok Image".into(),
        aspect_ratios: strings(&["16:9", "9:16", "1:1"]),
        resolutions: strings(&["provider default"]),
        qualities: strings(&["SPEED", "QUALITY"]),
        negative_prompt: false,
        repair: false,
    });
    catalog.push(Capability {
        provider: "local".into(),
        model: "mock-image".into(),
        label: "Local test pattern".into(),
        aspect_ratios: strings(&["1:1", "16:9", "9:16"]),
        resolutions: strings(&["2K"]),
        qualities: strings(&["test pattern"]),
        negative_prompt: false,
        repair: false,
    });
    catalog
}
pub fn client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .retry(reqwest::retry::never())
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|_| {
            AppError::new(
                "provider_network",
                "Could not initialize provider transport.",
            )
        })
}
pub fn credential(provider: &str) -> Result<String> {
    security::read_key(provider)
}
pub fn provider_error(code: &str, message: &str) -> AppError {
    AppError::new(code, message)
}
fn response_error(status: u16, value: &Value, secret: &str) -> AppError {
    let fallback = match status {
        401 | 403 => "The provider rejected the key or its permissions.",
        402 => "The provider account cannot authorize this request.",
        429 => "The provider rate limit was reached.",
        _ => "The provider returned an unsuccessful response.",
    };
    let supplied = value["error"]["message"]
        .as_str()
        .or_else(|| value["detail"]["error_message"].as_str())
        .or_else(|| value["detail"].as_str())
        .unwrap_or(fallback);
    let concise = supplied.chars().take(500).collect::<String>();
    let message = crate::observability::redact(&concise, &[secret.to_string()]);
    provider_error(
        "provider_response",
        &format!("Provider HTTP {status}: {message} No automatic retry was sent."),
    )
}
async fn response_json_redacted(
    response: std::result::Result<reqwest::Response, reqwest::Error>,
    secret: &str,
) -> Result<Value> {
    let mut response = response.map_err(|_| provider_error("provider_network", "The provider could not be reached. The request may have been accepted; check its result before retrying."))?;
    let status = response.status();
    let mut bytes = vec![];
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| provider_error("provider_network", "The provider response was interrupted."))?
    {
        if bytes.len() + chunk.len() > 4 * 1024 * 1024 {
            return Err(provider_error(
                "provider_response",
                "The provider returned an oversized response.",
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    let parsed = serde_json::from_slice::<Value>(&bytes);
    if !status.is_success() {
        return Err(response_error(
            status.as_u16(),
            &parsed.unwrap_or(Value::Null),
            secret,
        ));
    }
    let mut value = parsed.map_err(|_| {
        provider_error(
            "provider_response",
            "The provider returned an invalid JSON response.",
        )
    })?;
    crate::observability::redact_value(&mut value, &[secret.to_string()]);
    Ok(value)
}
pub async fn snapgen_generate(input: &GenerationInput) -> Result<Value> {
    let key = credential("snapgen")?;
    let mut form = reqwest::multipart::Form::new().text("prompt", input.prompt.clone());
    let endpoint = if input.model == "grok-image" {
        let orientation = match input.aspect_ratio.as_str() {
            "9:16" => "portrait",
            "1:1" => "square",
            _ => "landscape",
        };
        form = form
            .text("orientation", orientation)
            .text("num_result", "1")
            .text("mode", input.quality.clone());
        "https://api.snapgen.ai/uapi/v1/imagen/grok"
    } else {
        form = form
            .text("model", input.model.clone())
            .text("aspect_ratio", input.aspect_ratio.clone())
            .text("resolution", input.resolution.clone())
            .text("style", input.quality.clone());
        "https://api.snapgen.ai/uapi/v1/generate_image"
    };
    response_json_redacted(
        client()?
            .post(endpoint)
            .header("x-api-key", &key)
            .multipart(form)
            .send()
            .await,
        &key,
    )
    .await
}
pub async fn snapgen_lookup(request_id: &str) -> Result<Value> {
    validate_request_id(request_id)?;
    let key = credential("snapgen")?;
    response_json_redacted(
        client()?
            .get(format!(
                "https://api.snapgen.ai/uapi/v1/history/{request_id}"
            ))
            .header("x-api-key", &key)
            .send()
            .await,
        &key,
    )
    .await
}
pub fn validate_request_id(value: &str) -> Result<()> {
    if value.is_empty()
        || value.len() > 200
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err(AppError::validation("Invalid provider request identifier."));
    }
    Ok(())
}
pub fn image_urls(value: &Value) -> Vec<String> {
    let mut urls = vec![];
    if let Some(images) = value["generated_image"].as_array() {
        for image in images {
            if image["status"].as_u64().is_some_and(|s| s != 2) {
                continue;
            }
            if let Some(url) = ["file_download_url", "image_url", "image_uri"]
                .into_iter()
                .find_map(|key| image[key].as_str().filter(|s| s.starts_with("https://")))
            {
                urls.push(url.to_string());
            }
        }
    }
    if urls.is_empty() {
        if let Some(url) = value["generate_result"]
            .as_str()
            .filter(|s| s.starts_with("https://"))
        {
            urls.push(url.to_string());
        }
    }
    urls
}
pub fn allowed_image_url(value: &str) -> Result<reqwest::Url> {
    let url = reqwest::Url::parse(value)
        .map_err(|_| AppError::validation("Invalid provider image URL."))?;
    let host = url.host_str().unwrap_or("");
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some_and(|p| p != 443)
    {
        return Err(AppError::validation("Provider image URLs must use HTTPS without embedded credentials or a non-standard port."));
    }
    if !(host == "cdn.snapgen.ai"
        || host.ends_with(".snapgen.ai")
        || host.ends_with(".geminigen.ai")
        || host == "storage.googleapis.com"
        // SnapGen returns a Worker download URL as well as its backing R2 URL.
        // Approve these exact hosts rather than all Workers or R2 accounts.
        || host == "7a4964de26acd06ff740870066a92ff8.r2.cloudflarestorage.com"
        || host == "geminigen-cloudflare-file-download-worker-prd.blue-bar-0e5f.workers.dev")
    {
        return Err(provider_error("provider_image_host", &format!("The provider image host '{host}' is not approved. The result is saved for read-only recovery; no new generation was sent.")));
    }
    Ok(url)
}
pub async fn download_image(value: &str) -> Result<Vec<u8>> {
    // Separate request has no authorization header. Redirects are always rejected.
    let mut response = client()?.get(allowed_image_url(value)?).send().await.map_err(|_| provider_error("provider_download", "Could not download the completed provider image. Use read-only lookup to try again."))?;
    if !response.status().is_success() {
        return Err(provider_error(
            "provider_download",
            &format!(
                "The image download returned HTTP {}. Use read-only lookup to recover it.",
                response.status().as_u16()
            ),
        ));
    }
    if response
        .content_length()
        .is_some_and(|n| n > 100 * 1024 * 1024)
    {
        return Err(provider_error(
            "provider_download",
            "The provider image exceeds the 100 MB limit.",
        ));
    }
    let mut bytes = vec![];
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| provider_error("provider_download", "The image download was interrupted."))?
    {
        if bytes.len() + chunk.len() > 100 * 1024 * 1024 {
            return Err(provider_error(
                "provider_download",
                "The provider image exceeds the 100 MB limit.",
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}
pub async fn snapgen_repair(request_id: &str, mode: &str) -> Result<Value> {
    validate_request_id(request_id)?;
    let key = credential("snapgen")?;
    response_json_redacted(
        client()?
            .post("https://api.snapgen.ai/uapi/v1/remove-logo")
            .header("x-api-key", &key)
            .json(&json!({"history_uuid":request_id,"mode":mode}))
            .send()
            .await,
        &key,
    )
    .await
}
pub async fn snapgen_repair_lookup(request_id: &str) -> Result<Value> {
    validate_request_id(request_id)?;
    let key = credential("snapgen")?;
    response_json_redacted(
        client()?
            .get(format!(
                "https://api.snapgen.ai/uapi/v1/remove-logo/{request_id}"
            ))
            .header("x-api-key", &key)
            .send()
            .await,
        &key,
    )
    .await
}

pub struct TextResponse {
    pub value: Result<Value>,
    pub request_id: Option<String>,
}
fn structured_value(provider: &str, response: &Value) -> Result<Value> {
    let text = if provider == "openai" {
        let parts = response["output"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|item| item["content"].as_array())
            .flatten();
        let mut text = String::new();
        for part in parts {
            if part["type"] == "refusal" {
                return Err(provider_error(
                    "provider_refusal",
                    &format!(
                        "The model refused the request: {}",
                        part["refusal"]
                            .as_str()
                            .unwrap_or("no explanation")
                            .chars()
                            .take(300)
                            .collect::<String>()
                    ),
                ));
            }
            if part["type"] == "output_text" {
                if let Some(value) = part["text"].as_str() {
                    text.push_str(value);
                }
            }
        }
        if response["status"] == "incomplete" {
            return Err(provider_error("provider_incomplete", "The model response was incomplete. Reduce the concept count or review the model limits before confirming another request."));
        }
        text
    } else {
        let reason = response["candidates"][0]["finishReason"]
            .as_str()
            .unwrap_or("STOP");
        if reason != "STOP" {
            return Err(provider_error(
                "provider_incomplete",
                &format!("The model stopped with reason {reason}. No automatic retry was sent."),
            ));
        }
        response["candidates"][0]["content"]["parts"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|part| part["text"].as_str())
            .collect::<String>()
    };
    serde_json::from_str(&text).map_err(|_| provider_error("provider_schema", "The provider returned no usable structured result. Check the model's structured-output support."))
}
pub async fn text_json(
    provider: &str,
    model: &str,
    prompt: &str,
    schema: Value,
    image: Option<String>,
) -> Result<TextResponse> {
    if model.is_empty()
        || model.len() > 100
        || !model
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
    {
        return Err(AppError::validation(
            "Enter a model identifier containing letters, numbers, dots, hyphens, or underscores.",
        ));
    }
    let key = credential(provider)?;
    let response = match provider {
        "openai" => {
            let mut content = vec![json!({"type":"input_text","text":prompt})];
            if let Some(image) = image {
                content.push(json!({"type":"input_image","image_url":format!("data:image/jpeg;base64,{image}"),"detail":"low"}));
            }
            response_json_redacted(client()?.post("https://api.openai.com/v1/responses").bearer_auth(&key).json(&json!({"model":model,"store":false,"input":[{"role":"user","content":content}],"text":{"format":{"type":"json_schema","name":"thoock_result","strict":true,"schema":schema}}})).send().await, &key).await?
        }
        "gemini" => {
            let mut parts = vec![json!({"text":prompt})];
            if let Some(image) = image {
                parts.push(json!({"inlineData":{"mimeType":"image/jpeg","data":image}}));
            }
            response_json_redacted(client()?.post(format!("https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent")).header("x-goog-api-key", &key).json(&json!({"contents":[{"parts":parts}],"generationConfig":{"responseMimeType":"application/json","responseJsonSchema":schema}})).send().await, &key).await?
        }
        _ => {
            return Err(AppError::validation(
                "Select OpenAI or Gemini for provider text requests.",
            ))
        }
    };
    let request_id = response["id"]
        .as_str()
        .or_else(|| response["responseId"].as_str())
        .filter(|id| !id.contains(&key))
        .map(String::from);
    let mut value = structured_value(provider, &response);
    if let Ok(value) = &mut value {
        crate::observability::redact_value(value, &[key]);
    }
    Ok(TextResponse { value, request_id })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn structured_provider_fixtures_parse_and_refusals_are_actionable() {
        let openai = json!({"id":"resp_fixture","status":"completed","output":[{"content":[{"type":"output_text","text":"{\"opportunities\":[]}"}]}]});
        let gemini = json!({"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"{\"briefs\":[]}"}]}}]});
        assert!(structured_value("openai", &openai).unwrap()["opportunities"].is_array());
        assert!(structured_value("gemini", &gemini).unwrap()["briefs"].is_array());
        let refusal =
            json!({"output":[{"content":[{"type":"refusal","refusal":"Unsupported request"}]}]});
        assert_eq!(
            structured_value("openai", &refusal).unwrap_err().code,
            "provider_refusal"
        );
        assert!(structured_value(
            "gemini",
            &json!({"candidates":[{"finishReason":"MAX_TOKENS"}]})
        )
        .is_err());
    }
    #[test]
    fn provider_error_keeps_actionable_detail_and_removes_the_credential() {
        let secret = "private-provider-key-value";
        let response =
            json!({"error":{"message":format!("Model unavailable for credential {secret}")}});
        let error = response_error(400, &response, secret);
        assert!(error.message.contains("Model unavailable"));
        assert!(error.message.contains("[redacted]"));
        assert!(!error.message.contains(secret));
        assert!(error.message.contains("No automatic retry"));
    }
    #[test]
    fn provider_urls_reject_credentials_private_hosts_and_redirect_targets() {
        assert!(allowed_image_url("https://cdn.snapgen.ai/image.jpg?signature=abc").is_ok());
        for url in [
            "http://cdn.snapgen.ai/a",
            "https://localhost/a",
            "https://127.0.0.1/a",
            "https://cdn.snapgen.ai.evil.test/a",
            "https://secret@cdn.snapgen.ai/a",
            "https://cdn.snapgen.ai:8080/a",
        ] {
            assert!(allowed_image_url(url).is_err(), "{url}");
        }
        assert!(validate_request_id("../histories").is_err());
    }
    #[test]
    fn rejected_image_host_reports_only_the_hostname_without_signed_url_secrets() {
        let error = allowed_image_url(
            "https://unknown-cdn.example.test/private-object.jpg?signature=do-not-expose",
        )
        .unwrap_err();
        assert!(error.message.contains("unknown-cdn.example.test"));
        assert!(!error.message.contains("private-object"));
        assert!(!error.message.contains("signature"));
        assert!(!error.message.contains("do-not-expose"));
    }
    #[test]
    fn snapgen_r2_results_accept_signed_urls_but_not_other_accounts_or_host_lookalikes() {
        let response = json!({"status":2,"generated_image":[{"status":2,"file_download_url":"https://7a4964de26acd06ff740870066a92ff8.r2.cloudflarestorage.com/generated/image.png?X-Amz-Signature=fixture&X-Amz-Credential=encoded%2Fcredential"}]});
        let urls = image_urls(&response);
        assert_eq!(urls.len(), 1);
        let url = allowed_image_url(&urls[0]).unwrap();
        assert_eq!(
            url.query(),
            Some("X-Amz-Signature=fixture&X-Amz-Credential=encoded%2Fcredential")
        );
        for rejected in [
            "https://other-account.r2.cloudflarestorage.com/image.png",
            "https://7a4964de26acd06ff740870066a92ff8.r2.cloudflarestorage.com.evil.test/image.png",
            "http://7a4964de26acd06ff740870066a92ff8.r2.cloudflarestorage.com/image.png",
            "https://secret@7a4964de26acd06ff740870066a92ff8.r2.cloudflarestorage.com/image.png",
        ] {
            assert!(allowed_image_url(rejected).is_err());
        }
    }
    #[test]
    fn snapgen_worker_download_url_is_selected_and_approved() {
        let response = json!({"status":2,"generated_image":[{"status":2,
            "file_download_url":"https://geminigen-cloudflare-file-download-worker-prd.blue-bar-0e5f.workers.dev/download?signature=fixture",
            "image_url":"https://7a4964de26acd06ff740870066a92ff8.r2.cloudflarestorage.com/generated/image.png"
        }]});
        let urls = image_urls(&response);
        assert_eq!(urls.len(), 1);
        assert!(allowed_image_url(&urls[0]).is_ok());
        assert_eq!(
            allowed_image_url(&urls[0]).unwrap().query(),
            Some("signature=fixture")
        );
        for rejected in [
            "https://other-worker.blue-bar-0e5f.workers.dev/image.png",
            "https://geminigen-cloudflare-file-download-worker-prd.other-account.workers.dev/image.png",
            "https://geminigen-cloudflare-file-download-worker-prd.blue-bar-0e5f.workers.dev.evil.test/image.png",
            "http://geminigen-cloudflare-file-download-worker-prd.blue-bar-0e5f.workers.dev/image.png",
            "https://secret@geminigen-cloudflare-file-download-worker-prd.blue-bar-0e5f.workers.dev/image.png",
        ] {
            assert!(allowed_image_url(rejected).is_err());
        }
    }
    #[test]
    fn snapgen_fixture_normalizes_nested_images_without_persisting_credit_fields() {
        let response = json!({"status":2,"used_credit":90,"generated_image":[{"status":2,"file_download_url":"https://cdn.snapgen.ai/one.jpg"},{"status":1,"image_url":"https://cdn.snapgen.ai/two.jpg"}]});
        assert_eq!(
            image_urls(&response),
            vec!["https://cdn.snapgen.ai/one.jpg"]
        );
    }
}
