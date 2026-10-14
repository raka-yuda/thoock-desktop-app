use crate::{
    domain::*,
    persistence::{record, serialize, Workspace},
};
use rusqlite::params;
use serde::de::DeserializeOwned;

pub fn preview<T: DeserializeOwned>(content: &str) -> Result<Vec<T>> {
    if content.len() > 2 * 1024 * 1024 {
        return Err(AppError::validation("CSV files must be at most 2 MB."));
    }
    let mut reader = csv::ReaderBuilder::new()
        .trim(csv::Trim::All)
        .from_reader(content.as_bytes());
    let mut rows = vec![];
    for (index, row) in reader.deserialize().enumerate() {
        rows.push(row.map_err(|_| {
            AppError::validation(format!(
                "Row {} has missing or invalid fields. Use the documented CSV header.",
                index + 2
            ))
        })?);
        if rows.len() > 1000 {
            return Err(AppError::validation("Import at most 1,000 rows at a time."));
        }
    }
    if rows.is_empty() {
        return Err(AppError::validation("CSV contains no records."));
    }
    Ok(rows)
}
pub fn brief(input: BriefInput) -> Result<Brief> {
    Ok(Brief {
        details: validate_brief_details(input.details)?,
        id: id(),
        opportunity_id: input.opportunity_id,
        title: text(&input.title, "Title", 200)?,
        buyer: text(&input.buyer, "Buyer", 200)?,
        usage: text(&input.usage, "Usage", 500)?,
        market: text(&input.market, "Market", 200)?,
        scene: text(&input.scene, "Scene", 5000)?,
        visual_direction: crate::persistence::bounded(&input.visual_direction, 5000)?,
        prompt: text(&input.prompt, "Prompt", 12000)?,
        negative_prompt: crate::persistence::bounded(&input.negative_prompt, 5000)?,
        metadata_plan: crate::persistence::bounded(&input.metadata_plan, 5000)?,
        created_at: now(),
    })
}
pub fn preview_briefs(workspace: &Workspace, content: &str) -> Result<Vec<BriefInput>> {
    let mut rows = preview::<BriefInput>(content)?;
    for row in &mut rows {
        row.id = None;
        brief(row.clone())?;
        if let Some(ref id) = row.opportunity_id {
            record::<Opportunity>(
                &*workspace.conn()?,
                "SELECT data FROM opportunities WHERE id=?1",
                id,
            )?;
        }
    }
    Ok(rows)
}
pub fn import_briefs(workspace: &Workspace, inputs: Vec<BriefInput>) -> Result<usize> {
    if inputs.is_empty() || inputs.len() > 1000 {
        return Err(AppError::validation("Import between 1 and 1,000 briefs."));
    }
    let count = inputs.len();
    let rows = inputs.into_iter().map(brief).collect::<Result<Vec<_>>>()?;
    let mut db = workspace.write_conn()?;
    let tx = db.transaction()?;
    for row in rows {
        tx.execute(
            "INSERT INTO briefs VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                row.id,
                row.opportunity_id,
                row.title,
                serialize(&row)?,
                row.created_at
            ],
        )?;
    }
    tx.commit()?;
    Ok(count)
}
pub fn opportunities_csv(workspace: &Workspace) -> Result<Vec<u8>> {
    let snapshot = workspace.snapshot()?;
    let mut csv = csv::Writer::from_writer(vec![]);
    csv.write_record([
        "id",
        "topic",
        "buyer",
        "market",
        "demand",
        "competition",
        "commercialFit",
        "notes",
    ])?;
    for row in snapshot.opportunities {
        csv.write_record([
            row.id,
            row.topic,
            row.buyer,
            row.market,
            row.demand.to_string(),
            row.competition.to_string(),
            row.commercial_fit.to_string(),
            row.notes,
        ])?;
    }
    csv.flush()?;
    csv.into_inner()
        .map_err(|_| AppError::validation("CSV export failed."))
}
pub fn briefs_csv(workspace: &Workspace) -> Result<Vec<u8>> {
    let snapshot = workspace.snapshot()?;
    let mut csv = csv::Writer::from_writer(vec![]);
    csv.write_record([
        "id",
        "opportunityId",
        "title",
        "buyer",
        "usage",
        "market",
        "scene",
        "visualDirection",
        "prompt",
        "negativePrompt",
        "metadataPlan",
    ])?;
    for row in snapshot.briefs {
        csv.write_record([
            row.id,
            row.opportunity_id.unwrap_or_default(),
            row.title,
            row.buyer,
            row.usage,
            row.market,
            row.scene,
            row.visual_direction,
            row.prompt,
            row.negative_prompt,
            row.metadata_plan,
        ])?;
    }
    csv.flush()?;
    csv.into_inner()
        .map_err(|_| AppError::validation("CSV export failed."))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn brief_import_is_atomic_when_a_reference_is_invalid() {
        let dir = tempfile::tempdir().unwrap();
        let workspace = Workspace::open(dir.path().to_owned()).unwrap();
        let valid = BriefInput {
            details: None,
            id: None,
            opportunity_id: None,
            title: "Travel".into(),
            buyer: "Designers".into(),
            usage: "Editorial".into(),
            market: "Global".into(),
            scene: "Urban travel".into(),
            visual_direction: "Natural".into(),
            prompt: "A clear urban travel scene".into(),
            negative_prompt: String::new(),
            metadata_plan: String::new(),
        };
        let mut invalid = valid.clone();
        invalid.opportunity_id = Some("missing".into());
        assert!(import_briefs(&workspace, vec![valid, invalid]).is_err());
        assert!(workspace.snapshot().unwrap().briefs.is_empty());
    }
}
