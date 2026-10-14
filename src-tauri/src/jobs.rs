use crate::{
    assets,
    domain::*,
    persistence::{record, serialize, Workspace},
    providers,
};
use base64::Engine;
use rusqlite::{params, OptionalExtension};
use serde_json::{json, Value};
use std::{sync::Arc, time::Duration};
use tauri::{AppHandle, Emitter};

pub fn validate(task: &Task, workspace: &Workspace) -> Result<()> {
    let (provider, model) = task.provider_model();
    if provider != "local" {
        let secret = providers::credential(provider)?;
        if serialize(task)?.contains(&secret) {
            return Err(AppError::validation(
                "The request must not contain a provider credential in its prompt or settings.",
            ));
        }
    }
    match task {
        Task::Generate(input) => {
            text(&input.prompt, "Prompt", 12000)?;
            let capability = providers::capabilities()
                .into_iter()
                .find(|c| c.provider == input.provider && c.model == input.model)
                .ok_or_else(|| AppError::validation("Select a supported provider and model."))?;
            if !capability.aspect_ratios.contains(&input.aspect_ratio)
                || !capability.resolutions.contains(&input.resolution)
                || !capability.qualities.contains(&input.quality)
                || (!capability.negative_prompt && !input.negative_prompt.trim().is_empty())
            {
                return Err(AppError::validation(
                    "These controls are not supported by the selected model.",
                ));
            }
            if let Some(ref brief_id) = input.brief_id {
                record::<Brief>(
                    &*workspace.conn()?,
                    "SELECT data FROM briefs WHERE id=?1",
                    brief_id,
                )?;
            }
            if let Some(ref parent_id) = input.parent_job_id {
                record::<Job>(
                    &*workspace.conn()?,
                    "SELECT data FROM jobs WHERE id=?1",
                    parent_id,
                )?;
            }
        }
        Task::Research(input) | Task::BriefBatch(input) => {
            text(&input.topic, "Topic", 200)?;
            if let Some(ref context) = input.context {
                text(&context.target_region, "Target region", 200)?;
                if !["evergreen", "seasonal", "trending"].contains(&context.behavior.as_str()) {
                    return Err(AppError::validation("Invalid topic behavior."));
                }
                crate::persistence::bounded(&context.portfolio_context, 5000)?;
                crate::persistence::bounded(&context.creative_preset, 100)?;
            }
            if !(1..=20).contains(&input.count) {
                return Err(AppError::validation("Choose between 1 and 20 concepts."));
            }
            if !["local", "openai", "gemini"].contains(&provider) {
                return Err(AppError::validation("Select a text provider."));
            }
            if let Some(ref opportunity_id) = input.opportunity_id {
                record::<Opportunity>(
                    &*workspace.conn()?,
                    "SELECT data FROM opportunities WHERE id=?1",
                    opportunity_id,
                )?;
            }
        }
        Task::Metadata { asset_id, .. } => {
            workspace.asset(asset_id)?;
            if !["local", "openai", "gemini"].contains(&provider) {
                return Err(AppError::validation("Select a text provider."));
            }
        }
        Task::Repair { asset_id, mode } => {
            if !["fast", "pro"].contains(&mode.as_str()) {
                return Err(AppError::validation("Choose a supported removal tier."));
            }
            let source = source_job(workspace, asset_id)?;
            if source.provider != "snapgen"
                || !source.model.starts_with("nano-banana")
                || source.result_ids.len() != 1
                || source.output_count != 1
                || source.request_id.is_none()
            {
                return Err(AppError::validation("Logo removal requires one completed Nano Banana image from a recorded SnapGen attempt."));
            }
        }
    }
    if provider != "local"
        && !matches!(task, Task::Repair { .. })
        && (model.is_empty()
            || model.len() > 100
            || !model
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b)))
    {
        return Err(AppError::validation("Enter a valid model identifier."));
    }
    Ok(())
}
pub fn enqueue(workspace: &Workspace, task: Task) -> Result<Job> {
    Ok(enqueue_many(workspace, vec![task])?.remove(0))
}
pub fn enqueue_many(workspace: &Workspace, tasks: Vec<Task>) -> Result<Vec<Job>> {
    if tasks.is_empty() || tasks.len() > 50 {
        return Err(AppError::validation(
            "Queue between 1 and 50 requests at a time.",
        ));
    }
    for task in &tasks {
        validate(task, workspace)?;
    }
    let mut db = workspace.write_conn()?;
    let tx = db.transaction()?;
    let mut jobs = vec![];
    for task in tasks {
        let (provider, model) = task.provider_model();
        let mut job = Job::local(task.operation());
        job.provider = provider.into();
        job.model = model.into();
        job.status = "queued".into();
        job.message = "Waiting for the local worker".into();
        if let Task::Generate(ref input) = task {
            job.parent_id = input.parent_job_id.clone();
        }
        tx.execute(
            "INSERT INTO jobs VALUES (?1, ?2, ?3, ?4)",
            params![job.id, serialize(&job)?, job.status, job.created_at],
        )?;
        tx.execute(
            "INSERT INTO job_inputs VALUES (?1, ?2)",
            params![job.id, serialize(&task)?],
        )?;
        jobs.push(job);
    }
    tx.commit()?;
    Ok(jobs)
}
fn claim(workspace: &Workspace, worker_id: &str) -> Result<Option<(Job, Task)>> {
    let mut db = workspace.write_conn()?;
    let tx = db.transaction()?;
    let input = tx.query_row("SELECT jobs.data, job_inputs.input FROM jobs JOIN job_inputs ON job_id=jobs.id WHERE jobs.status='queued' ORDER BY jobs.created_at LIMIT 1", [], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))).optional()?;
    let Some((job, task)) = input else {
        return Ok(None);
    };
    let mut job: Job = serde_json::from_str(&job)?;
    let task = serde_json::from_str(&task)?;
    job.status = "running".into();
    job.message = "Starting confirmed request".into();
    tx.execute(
        "UPDATE jobs SET status='running', data=?1 WHERE id=?2 AND status='queued'",
        params![serialize(&job)?, job.id],
    )?;
    tx.execute(
        "INSERT OR REPLACE INTO job_leases VALUES (?1, ?2, ?3)",
        params![job.id, worker_id, now()],
    )?;
    tx.commit()?;
    Ok(Some((job, task)))
}
pub fn update(workspace: &Workspace, job: &Job) -> Result<()> {
    workspace.conn()?.execute(
        "UPDATE jobs SET data=?1, status=?2 WHERE id=?3",
        params![serialize(job)?, job.status, job.id],
    )?;
    Ok(())
}
fn heartbeat(workspace: &Workspace, job: &Job) -> Result<()> {
    workspace.conn()?.execute(
        "UPDATE job_leases SET heartbeat=?1 WHERE job_id=?2",
        params![now(), job.id],
    )?;
    Ok(())
}
fn cancelled(workspace: &Workspace, job: &Job) -> Result<bool> {
    let status: String =
        workspace
            .conn()?
            .query_row("SELECT status FROM jobs WHERE id=?1", [&job.id], |r| {
                r.get(0)
            })?;
    Ok(status == "interrupted" || status == "cancelled")
}

fn task_summary(task: &Task) -> Value {
    let (provider, model) = task.provider_model();
    match task {
        Task::Generate(i) => {
            json!({"provider":provider,"model":model,"aspectRatio":i.aspect_ratio,"resolution":i.resolution,"quality":i.quality,"briefId":i.brief_id,"parentJobId":i.parent_job_id})
        }
        Task::Research(i) | Task::BriefBatch(i) => {
            json!({"provider":provider,"model":model,"count":i.count,"opportunityId":i.opportunity_id})
        }
        Task::Metadata { asset_id, .. } => {
            json!({"provider":provider,"model":model,"assetId":asset_id})
        }
        Task::Repair { asset_id, mode } => {
            json!({"provider":provider,"assetId":asset_id,"mode":mode})
        }
    }
}

pub fn start(app: AppHandle, workspace: Arc<Workspace>) {
    tauri::async_runtime::spawn(async move {
        let worker_id = id();
        loop {
            match claim(&workspace, &worker_id) {
                Ok(Some((mut job, task))) => {
                    let started = std::time::Instant::now();
                    let request_summary = task_summary(&task);
                    let _ = app.emit("workspace-changed", ());
                    let result = execute(&app, &workspace, &mut job, task).await;
                    let was_cancelled = cancelled(&workspace, &job).unwrap_or(false);
                    if !was_cancelled {
                        job.status = match &result {
                            Ok(_) => "succeeded",
                            Err(error)
                                if [
                                    "provider_network",
                                    "provider_poll_timeout",
                                    "provider_download",
                                    "provider_image_host",
                                ]
                                .contains(&error.code.as_str()) =>
                            {
                                "interrupted"
                            }
                            Err(_) => "failed",
                        }
                        .into();
                        job.message = result
                            .as_ref()
                            .map(|_| "Completed successfully".to_string())
                            .unwrap_or_else(|e| e.message.clone());
                        job.progress = if result.is_ok() { 100 } else { job.progress };
                        job.completed_at = Some(now());
                        let _ = update(&workspace, &job);
                    }
                    let saved: Job = workspace
                        .conn()
                        .and_then(|db| record(&db, "SELECT data FROM jobs WHERE id=?1", &job.id))
                        .unwrap_or(job);
                    let _ = workspace.log(Log { id: saved.id.clone(), provider: saved.provider, operation: saved.operation, status: saved.status, message: saved.message, duration_ms: started.elapsed().as_millis() as u64, created_at: now(), model: saved.model, request_id: saved.request_id, request_summary, response_summary: json!({"resultCount":saved.result_ids.len(),"progress":saved.progress}), ..Default::default() });
                    if let Ok(db) = workspace.conn() {
                        let _ = db.execute("DELETE FROM job_leases WHERE job_id=?1", [&saved.id]);
                    }
                    let _ = app.emit("workspace-changed", ());
                }
                Ok(None) | Err(_) => tokio::time::sleep(Duration::from_millis(500)).await,
            }
        }
    });
}
async fn persist_progress(app: &AppHandle, workspace: &Workspace, job: &Job) -> Result<()> {
    update(workspace, job)?;
    heartbeat(workspace, job)?;
    let _ = app.emit("workspace-changed", ());
    Ok(())
}
fn source_job(workspace: &Workspace, asset_id: &str) -> Result<Job> {
    let asset = workspace.asset(asset_id)?;
    let source_id = asset.source_job_id.ok_or_else(|| {
        AppError::validation("This imported image has no recorded provider attempt.")
    })?;
    record(
        &*workspace.conn()?,
        "SELECT data FROM jobs WHERE id=?1",
        &source_id,
    )
}

async fn execute(
    app: &AppHandle,
    workspace: &Arc<Workspace>,
    job: &mut Job,
    task: Task,
) -> Result<()> {
    if cancelled(workspace, job)? {
        return Ok(());
    }
    match task {
        Task::Generate(input) if input.provider == "local" => {
            let width = if input.aspect_ratio == "9:16" {
                2048
            } else {
                2560
            };
            let height = if input.aspect_ratio == "16:9" {
                1440
            } else if input.aspect_ratio == "9:16" {
                3640
            } else {
                2560
            };
            let mut image = image::RgbImage::new(width, height);
            for (x, y, pixel) in image.enumerate_pixels_mut() {
                *pixel = image::Rgb([
                    ((x / 80 % 2) * 100 + 30) as u8,
                    ((y / 80 % 2) * 90 + 70) as u8,
                    100,
                ]);
            }
            let mut bytes = vec![];
            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut bytes, 90)
                .encode_image(&image)?;
            let (asset_id, _) = assets::ingest(
                workspace,
                &bytes,
                format!("Local test pattern {}", &job.id[..8]),
                input.brief_id,
                Some(job.id.clone()),
                true,
            )?;
            job.result_ids = vec![asset_id];
            Ok(())
        }
        Task::Generate(input) => {
            let response = providers::snapgen_generate(&input).await?;
            let request_id = response["uuid"].as_str().ok_or_else(|| providers::provider_error("provider_response", "The provider accepted the request without a recoverable identifier. Inspect provider history before retrying."))?.to_string();
            providers::validate_request_id(&request_id)?;
            job.request_id = Some(request_id.clone());
            // Persist the provider ID even when a cancellation arrived while POST was in flight.
            let cancel = cancelled(workspace, job)?;
            if cancel {
                let mut saved: Job = record(
                    &*workspace.conn()?,
                    "SELECT data FROM jobs WHERE id=?1",
                    &job.id,
                )?;
                saved.request_id = Some(request_id);
                update(workspace, &saved)?;
                return Ok(());
            }
            job.message = "Provider request accepted; checking its result".into();
            job.progress = 5;
            persist_progress(app, workspace, job).await?;
            let response = poll_generation(app, workspace, job, response).await?;
            ingest_result(workspace, job, &input, &response).await
        }
        Task::Research(input) => research(workspace, job, input).await,
        Task::BriefBatch(input) => brief_batch(workspace, job, input).await,
        Task::Metadata {
            provider,
            model,
            asset_id,
        } => metadata(workspace, job, provider, model, asset_id).await,
        Task::Repair { asset_id, mode } => {
            let source = source_job(workspace, &asset_id)?;
            let history = source.request_id.unwrap();
            let response = providers::snapgen_repair(&history, &mode).await?;
            let records = response["result"]
                .as_array()
                .ok_or_else(|| AppError::validation("The provider returned no removal jobs."))?;
            if records.len() != 1 || records[0]["media_type"] != "image" {
                return Err(AppError::validation("The provider removal response does not identify exactly one image. Inspect provider history."));
            }
            let removal_id = records[0]["uuid"]
                .as_str()
                .ok_or_else(|| {
                    AppError::validation("The removal job has no recoverable identifier.")
                })?
                .to_string();
            job.request_id = Some(removal_id);
            if cancelled(workspace, job)? {
                let mut saved: Job = record(
                    &*workspace.conn()?,
                    "SELECT data FROM jobs WHERE id=?1",
                    &job.id,
                )?;
                saved.request_id = job.request_id.clone();
                update(workspace, &saved)?;
                return Ok(());
            }
            persist_progress(app, workspace, job).await?;
            for _ in 0..100 {
                if cancelled(workspace, job)? {
                    return Ok(());
                }
                let result = providers::snapgen_repair_lookup(&history).await?;
                let removal = result["result"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .find(|row| row["uuid"].as_str() == job.request_id.as_deref());
                if let Some(removal) = removal {
                    if removal["status"] == 3 {
                        return Err(providers::provider_error(
                            "provider_failed",
                            "The provider logo-removal job failed. No retry was sent.",
                        ));
                    }
                    if removal["status"] == 2 {
                        let url = removal["result_url"].as_str().ok_or_else(|| {
                            AppError::validation("The completed removal has no download URL.")
                        })?;
                        let bytes = providers::download_image(url).await?;
                        assets::replace_current(workspace, &asset_id, &bytes)?;
                        job.result_ids = vec![asset_id];
                        return Ok(());
                    }
                }
                heartbeat(workspace, job)?;
                tokio::time::sleep(Duration::from_secs(6)).await;
            }
            Err(providers::provider_error(
                "provider_poll_timeout",
                "Removal is still processing. Use read-only result lookup later.",
            ))
        }
    }
}
async fn poll_generation(
    app: &AppHandle,
    workspace: &Workspace,
    job: &mut Job,
    mut response: Value,
) -> Result<Value> {
    for _ in 0..100 {
        if cancelled(workspace, job)? {
            return Err(providers::provider_error(
                "cancelled",
                "Local polling stopped. The provider request may still finish.",
            ));
        }
        match response["status"].as_u64() {
            Some(2) => return Ok(response),
            Some(3) => {
                return Err(providers::provider_error(
                    "provider_failed",
                    "The provider reported a failed generation. No automatic retry was sent.",
                ))
            }
            _ => {}
        }
        job.progress = response["status_percentage"].as_u64().unwrap_or(10).min(95) as u8;
        persist_progress(app, workspace, job).await?;
        tokio::time::sleep(Duration::from_secs(6)).await;
        response = providers::snapgen_lookup(job.request_id.as_deref().unwrap()).await?;
    }
    Err(providers::provider_error(
        "provider_poll_timeout",
        "The request is still processing. Use read-only result lookup later.",
    ))
}
async fn ingest_result(
    workspace: &Workspace,
    job: &mut Job,
    input: &GenerationInput,
    response: &Value,
) -> Result<()> {
    let history = providers::snapgen_lookup(job.request_id.as_deref().unwrap()).await?;
    let mut urls = providers::image_urls(&history);
    job.output_count = history["generated_image"]
        .as_array()
        .map_or(0, |items| items.len());
    if urls.is_empty() {
        urls = providers::image_urls(response);
    }
    if urls.is_empty() {
        return Err(providers::provider_error(
            "provider_download",
            "The completed request has no downloadable image yet. Use read-only lookup.",
        ));
    }
    if urls.len() > 8 {
        return Err(providers::provider_error("provider_response", "The provider returned more than eight images. The request ID is preserved for reconciliation."));
    }
    for (i, url) in urls.into_iter().take(8).enumerate() {
        let bytes = providers::download_image(&url).await?;
        let (asset_id, _) = assets::ingest(
            workspace,
            &bytes,
            format!("{} {}-{}", input.model, &job.id[..8], i + 1),
            input.brief_id.clone(),
            Some(job.id.clone()),
            false,
        )?;
        if !job.result_ids.contains(&asset_id) {
            job.result_ids.push(asset_id);
        }
        update(workspace, job)?;
    }
    Ok(())
}
pub async fn recover(
    workspace: &Workspace,
    job_id: &str,
    history_uuid: Option<&str>,
) -> Result<Job> {
    workspace.ensure_writable()?;
    let mut job: Job = record(
        &*workspace.conn()?,
        "SELECT data FROM jobs WHERE id=?1",
        job_id,
    )?;
    if let Some(uuid) = history_uuid.filter(|value| !value.trim().is_empty()) {
        let parsed = uuid::Uuid::parse_str(uuid)
            .map_err(|_| AppError::validation("Enter a valid SnapGen history UUID."))?
            .to_string();
        if job.provider != "snapgen"
            || job.operation != "image generation"
            || !["interrupted", "failed", "succeeded"].contains(&job.status.as_str())
        {
            return Err(AppError::validation(
                "A history UUID can only recover an inactive SnapGen generation.",
            ));
        }
        if job
            .request_id
            .as_ref()
            .is_some_and(|saved| saved != &parsed)
        {
            return Err(AppError::validation(
                "The supplied UUID does not match the saved provider request.",
            ));
        }
        job.request_id = Some(parsed);
        update(workspace, &job)?;
    }
    if !["interrupted", "failed", "succeeded"].contains(&job.status.as_str())
        || job.request_id.is_none()
    {
        return Err(AppError::validation(
            "Only a saved provider request outside the active queue can be checked.",
        ));
    }
    if job.status == "succeeded" && !job.result_ids.is_empty() {
        return Ok(job);
    }
    let task: Task = record(
        &*workspace.conn()?,
        "SELECT input FROM job_inputs WHERE job_id=?1",
        job_id,
    )?;
    match task {
        Task::Generate(input) if input.provider == "snapgen" => {
            let response = providers::snapgen_lookup(job.request_id.as_deref().unwrap()).await?;
            if response["status"] == 2 {
                ingest_result(workspace, &mut job, &input, &response).await?;
                job.status = "succeeded".into();
                job.progress = 100;
                job.message = "Completed images recovered without a new generation request".into();
            } else {
                job.message = if response["status"] == 3 {
                    "Provider reports failure. Confirm a linked retry to send a new request."
                } else {
                    "Provider is still processing. Check again later."
                }
                .into();
            }
        }
        Task::Repair { asset_id, .. } => {
            let source = source_job(workspace, &asset_id)?;
            let response =
                providers::snapgen_repair_lookup(source.request_id.as_deref().unwrap()).await?;
            let row = response["result"]
                .as_array()
                .into_iter()
                .flatten()
                .find(|row| row["uuid"].as_str() == job.request_id.as_deref())
                .ok_or_else(|| {
                    AppError::validation("The saved removal job was not returned by the provider.")
                })?;
            if row["status"] == 2 {
                let bytes = providers::download_image(
                    row["result_url"]
                        .as_str()
                        .ok_or_else(|| AppError::validation("The removal result has no URL."))?,
                )
                .await?;
                assets::replace_current(workspace, &asset_id, &bytes)?;
                job.result_ids = vec![asset_id];
                job.status = "succeeded".into();
                job.progress = 100;
                job.message = "Current image recovered from the existing removal request".into();
            } else {
                job.message = "Removal has not completed. No new request was sent.".into();
            }
        }
        _ => {
            return Err(AppError::validation(
                "Read-only recovery is available for SnapGen image and removal requests.",
            ))
        }
    }
    update(workspace, &job)?;
    Ok(job)
}
pub fn cancel(workspace: &Workspace, job_id: &str) -> Result<()> {
    let mut job: Job = record(
        &*workspace.conn()?,
        "SELECT data FROM jobs WHERE id=?1",
        job_id,
    )?;
    if !["queued", "running"].contains(&job.status.as_str()) {
        return Err(AppError::validation("This job is no longer active."));
    }
    job.status = if job.status == "queued" {
        "cancelled"
    } else {
        "interrupted"
    }
    .into();
    job.message =
        "Local work stopped. An accepted provider request may still finish; use read-only lookup."
            .into();
    update(workspace, &job)
}

fn object(properties: Value) -> Value {
    let required = properties
        .as_object()
        .unwrap()
        .keys()
        .cloned()
        .collect::<Vec<_>>();
    json!({"type":"object","properties":properties,"required":required,"additionalProperties":false})
}
fn strings_schema(names: &[&str]) -> serde_json::Map<String, Value> {
    names
        .iter()
        .map(|s| (s.to_string(), json!({"type":"string"})))
        .collect()
}
fn array_schema(name: &str, item: Value) -> Value {
    object(json!({name:{"type":"array","items":item}}))
}
async fn structured(
    workspace: &Workspace,
    provider: &str,
    model: &str,
    prompt: &str,
    schema: Value,
    image: Option<String>,
    job: &mut Job,
) -> Result<Value> {
    let response = providers::text_json(provider, model, prompt, schema, image).await?;
    job.request_id = response.request_id;
    update(workspace, job)?;
    response.value
}
async fn research(workspace: &Workspace, job: &mut Job, input: TextInput) -> Result<()> {
    let rows: Vec<OpportunityInput> = if input.provider == "local" {
        let region = input
            .context
            .as_ref()
            .map(|c| c.target_region.clone())
            .unwrap_or(workspace.preferences()?.region);
        (0..input.count).map(|i| {
            let scenario = ["everyday use", "seasonal campaign", "inclusive lifestyle", "product context", "sustainable choices"][i as usize % 5];
            let buyer = ["Editorial designers", "Travel publishers", "Product marketers", "Social campaign teams"][i as usize / 5];
            OpportunityInput { details: None,  id: None, topic: format!("{}: {scenario} for {buyer}", input.topic.chars().take(110).collect::<String>()), buyer: buyer.into(), market: region.clone(), demand: 50, competition: 50, commercial_fit: 50, notes: format!("Local planning example {}. Scores are neutral estimates; verify demand and supply with your own sources.", i + 1) }
        }).collect()
    } else {
        let mut properties = strings_schema(&["topic", "buyer", "market", "notes"]);
        for key in ["demand", "competition", "commercialFit"] {
            properties.insert(
                key.into(),
                json!({"type":"integer","minimum":0,"maximum":100}),
            );
        }
        let value = structured(workspace, &input.provider, &input.model, &format!("Suggest {} distinct commercially useful image opportunities about {} for {}. Scores are estimates, not sales predictions. Do not invent sources or factual demand measurements. Notes must label all unverified hypotheses and explain scores. Return JSON matching the schema.", input.count, format!("{}; Context: {}", input.topic, serde_json::to_string(&input.context)?), workspace.preferences()?.region), array_schema("opportunities", object(Value::Object(properties))), None, job).await?;
        let mut rows = value["opportunities"]
            .as_array()
            .cloned()
            .ok_or_else(|| AppError::validation("The provider returned no topics."))?;
        if rows.len() != input.count as usize {
            return Err(AppError::validation(
                "The provider returned an unexpected topic count.",
            ));
        }
        for row in &mut rows {
            row["id"] = Value::Null;
        }
        serde_json::from_value(Value::Array(rows))?
    };
    if cancelled(workspace, job)? {
        return Err(providers::provider_error(
            "cancelled",
            "The local action was stopped.",
        ));
    }
    let mut db = workspace.write_conn()?;
    let tx = db.transaction()?;
    for row in rows {
        let value = Opportunity {
            details: validate_opportunity_details(row.details)?,
            id: id(),
            topic: text(&row.topic, "Topic", 200)?,
            buyer: text(&row.buyer, "Buyer", 200)?,
            market: text(&row.market, "Market", 200)?,
            score: score(row.demand, row.competition, row.commercial_fit)?,
            demand: row.demand,
            competition: row.competition,
            commercial_fit: row.commercial_fit,
            notes: crate::persistence::bounded(&row.notes, 10000)?,
            created_at: now(),
        };
        tx.execute(
            "INSERT INTO opportunities VALUES (?1, ?2, ?3, ?4)",
            params![value.id, value.topic, serialize(&value)?, value.created_at],
        )?;
        job.result_ids.push(value.id);
    }
    tx.commit()?;
    Ok(())
}
async fn brief_batch(workspace: &Workspace, job: &mut Job, input: TextInput) -> Result<()> {
    let opportunity: Option<Opportunity> = input
        .opportunity_id
        .as_ref()
        .map(|id| {
            record(
                &*workspace.conn()?,
                "SELECT data FROM opportunities WHERE id=?1",
                id,
            )
        })
        .transpose()?;
    let rows: Vec<BriefInput> = if input.provider == "local" {
        (0..input.count).map(|i| {
            let direction = ["wide editorial scene", "minimal copy-space composition", "close-up detail", "human-centered lifestyle", "overhead product scene"][i as usize % 5];
            let placement = ["website hero", "social campaign", "editorial feature", "product brochure"][i as usize / 5];
            let preset = input.context.as_ref().map(|c| c.creative_preset.as_str()).unwrap_or("Mixed commercial concepts");
            BriefInput { details: None,  id: None, opportunity_id: input.opportunity_id.clone(), title: format!("{}: concept {}", input.topic.chars().take(150).collect::<String>(), i + 1), buyer: opportunity.as_ref().map(|o| o.buyer.clone()).unwrap_or_else(|| "Commercial designers".into()), usage: format!("{direction} for a {placement}"), market: opportunity.as_ref().map(|o| o.market.clone()).unwrap_or_else(|| "Global".into()), scene: format!("{} shown as a {direction} for a {placement}", input.topic), visual_direction: "Natural lighting, a restrained palette, accurate detail, no logos or text".into(), prompt: format!("Create a commercially useful image of {} as a {direction}. For a {placement}. Natural light, clear subject, useful copy space. Concept {}. Creative preset: {}. No logos or visible text.", input.topic, i + 1, preset), negative_prompt: "".into(), metadata_plan: "Describe the visible subject accurately. Put the most relevant keywords first.".into() }
        }).collect()
    } else {
        let schema = array_schema(
            "briefs",
            object(Value::Object(strings_schema(&[
                "title",
                "buyer",
                "usage",
                "market",
                "scene",
                "visualDirection",
                "prompt",
                "negativePrompt",
                "metadataPlan",
            ]))),
        );
        let context = opportunity
            .as_ref()
            .map(serialize)
            .transpose()?
            .unwrap_or_default();
        let value = structured(workspace, &input.provider, &input.model, &format!("Create {} distinct commercial image briefs about {}. Opportunity context: {}. Each brief must have a distinct buyer/use/scene combination, a detailed generation prompt, and an Adobe metadata plan. No brand logos or misleading source claims.", input.count, format!("{}; Creative context: {}", input.topic, serde_json::to_string(&input.context)?), context), schema, None, job).await?;
        let mut rows = value["briefs"]
            .as_array()
            .cloned()
            .ok_or_else(|| AppError::validation("The provider returned no briefs."))?;
        if rows.len() != input.count as usize {
            return Err(AppError::validation(
                "The provider returned an unexpected brief count.",
            ));
        }
        for row in &mut rows {
            row["id"] = Value::Null;
            row["opportunityId"] = json!(input.opportunity_id);
        }
        serde_json::from_value(Value::Array(rows))?
    };
    if cancelled(workspace, job)? {
        return Err(providers::provider_error(
            "cancelled",
            "The local action was stopped.",
        ));
    }
    let mut db = workspace.write_conn()?;
    let tx = db.transaction()?;
    for row in rows {
        let value = Brief {
            details: validate_brief_details(row.details)?,
            id: id(),
            opportunity_id: row.opportunity_id,
            title: text(&row.title, "Title", 200)?,
            buyer: text(&row.buyer, "Buyer", 200)?,
            usage: text(&row.usage, "Usage", 500)?,
            market: text(&row.market, "Market", 200)?,
            scene: text(&row.scene, "Scene", 5000)?,
            visual_direction: crate::persistence::bounded(&row.visual_direction, 5000)?,
            prompt: text(&row.prompt, "Prompt", 12000)?,
            negative_prompt: crate::persistence::bounded(&row.negative_prompt, 5000)?,
            metadata_plan: crate::persistence::bounded(&row.metadata_plan, 5000)?,
            created_at: now(),
        };
        tx.execute(
            "INSERT INTO briefs VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                value.id,
                value.opportunity_id,
                value.title,
                serialize(&value)?,
                value.created_at
            ],
        )?;
        job.result_ids.push(value.id);
    }
    tx.commit()?;
    Ok(())
}
async fn metadata(
    workspace: &Workspace,
    job: &mut Job,
    provider: String,
    model: String,
    asset_id: String,
) -> Result<()> {
    let mut asset = workspace.asset(&asset_id)?;
    let value = if provider == "local" {
        json!({"title":asset.name.chars().map(|c| if c.is_alphanumeric() || c.is_whitespace() { c } else { ' ' }).take(70).collect::<String>(),"keywords":["image","composition","visual","creative","background"],"category":8})
    } else {
        let preview = assets::scoped_path(&workspace.root, &asset.preview)?;
        let image = base64::engine::general_purpose::STANDARD.encode(std::fs::read(preview)?);
        let schema = object(
            json!({"title":{"type":"string"},"keywords":{"type":"array","items":{"type":"string"},"minItems":5,"maxItems":49},"category":{"type":"integer","minimum":1,"maximum":21}}),
        );
        structured(workspace, &provider, &model, "Describe only what is visible in this image. Prepare an accurate Adobe Stock title (at most 70 characters with plain letters numbers and spaces), 5 to 49 distinct keywords ordered by relevance, and category 1 to 21. Do not infer names, brands, or release status. The result is a draft for human review.", schema, Some(image), job).await?
    };
    if cancelled(workspace, job)? {
        return Err(providers::provider_error(
            "cancelled",
            "The local action was stopped.",
        ));
    }
    asset.title = value["title"]
        .as_str()
        .ok_or_else(|| AppError::validation("Metadata title is missing."))?
        .into();
    asset.keywords = serde_json::from_value(value["keywords"].clone())?;
    asset.category = value["category"]
        .as_u64()
        .filter(|n| *n <= 21)
        .ok_or_else(|| AppError::validation("Metadata category is invalid."))?
        as u8;
    let errors = metadata_errors(
        &asset.title,
        &asset.keywords,
        asset.category,
        &workspace.preferences()?.prohibited_terms,
    );
    if !errors.is_empty() {
        return Err(AppError::validation(errors.join(" ")));
    }
    asset.decision = "pending".into();
    workspace.store_asset_review(&asset, "AI metadata draft")?;
    job.result_ids = vec![asset_id];
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recovery_cannot_replace_an_existing_provider_request_id() {
        let directory = tempfile::tempdir().unwrap();
        let workspace = Workspace::open(directory.path().to_owned()).unwrap();
        let mut job = Job::local("image generation");
        job.provider = "snapgen".into();
        job.model = "nano-banana-pro".into();
        job.status = "failed".into();
        job.request_id = Some(uuid::Uuid::new_v4().to_string());
        workspace
            .conn()
            .unwrap()
            .execute(
                "INSERT INTO jobs VALUES (?1, ?2, ?3, ?4)",
                params![job.id, serialize(&job).unwrap(), job.status, job.created_at],
            )
            .unwrap();
        let supplied = uuid::Uuid::new_v4().to_string();
        assert_eq!(
            tauri::async_runtime::block_on(recover(&workspace, &job.id, Some(&supplied)))
                .unwrap_err()
                .code,
            "validation"
        );
        assert_eq!(
            workspace.snapshot().unwrap().jobs[0].request_id,
            job.request_id
        );
    }
    #[test]
    fn batch_schemas_use_the_requested_key_and_reject_extra_properties() {
        let schema = array_schema(
            "opportunities",
            object(Value::Object(strings_schema(&["topic", "buyer"]))),
        );
        assert!(schema["properties"]["opportunities"].is_object());
        assert_eq!(schema["additionalProperties"], false);
        assert_eq!(
            schema["properties"]["opportunities"]["items"]["additionalProperties"],
            false
        );
    }
    #[test]
    fn local_research_and_brief_batch_run_without_network_or_credentials() {
        let dir = tempfile::tempdir().unwrap();
        let workspace = Workspace::open(dir.path().to_owned()).unwrap();
        let input = TextInput {
            context: None,
            provider: "local".into(),
            model: "local-rules".into(),
            topic: "Urban travel".into(),
            count: 3,
            opportunity_id: None,
        };
        let mut job = workspace.start_job("topic research").unwrap();
        tauri::async_runtime::block_on(research(&workspace, &mut job, input.clone())).unwrap();
        let snapshot = workspace.snapshot().unwrap();
        assert_eq!(snapshot.opportunities.len(), 3);
        assert_eq!(job.result_ids.len(), 3);
        let mut input = input;
        input.opportunity_id = Some(snapshot.opportunities[0].id.clone());
        let mut job = workspace.start_job("brief batch").unwrap();
        tauri::async_runtime::block_on(brief_batch(&workspace, &mut job, input)).unwrap();
        let snapshot = workspace.snapshot().unwrap();
        assert_eq!(snapshot.briefs.len(), 3);
        let titles: std::collections::HashSet<_> =
            snapshot.briefs.iter().map(|b| &b.title).collect();
        assert_eq!(titles.len(), 3);
        assert!(snapshot.providers.iter().all(|p| !p.configured));
    }
    #[test]
    fn claiming_is_single_owner_and_restart_preserves_unissued_queue() {
        let dir = tempfile::tempdir().unwrap();
        let workspace = Workspace::open(dir.path().to_owned()).unwrap();
        let job = enqueue(
            &workspace,
            Task::Research(TextInput {
                context: None,
                provider: "local".into(),
                model: "local-rules".into(),
                topic: "Urban travel".into(),
                count: 2,
                opportunity_id: None,
            }),
        )
        .unwrap();
        assert_eq!(job.status, "queued");
        assert!(claim(&workspace, "worker-1").unwrap().is_some());
        assert!(claim(&workspace, "worker-2").unwrap().is_none());
        drop(workspace);
        let recovered = Workspace::open(dir.path().to_owned()).unwrap();
        assert_eq!(recovered.snapshot().unwrap().jobs[0].status, "interrupted");
        assert!(claim(&recovered, "worker-3").unwrap().is_none());
    }
    #[test]
    fn cancelled_queued_job_is_never_claimed() {
        let dir = tempfile::tempdir().unwrap();
        let workspace = Workspace::open(dir.path().to_owned()).unwrap();
        let job = enqueue(
            &workspace,
            Task::Research(TextInput {
                context: None,
                provider: "local".into(),
                model: "local-rules".into(),
                topic: "Travel".into(),
                count: 2,
                opportunity_id: None,
            }),
        )
        .unwrap();
        cancel(&workspace, &job.id).unwrap();
        assert!(claim(&workspace, "worker").unwrap().is_none());
    }
}
