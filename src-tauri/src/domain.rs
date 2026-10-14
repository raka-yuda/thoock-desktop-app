use serde::{Deserialize, Serialize};

pub type Result<T> = std::result::Result<T, AppError>;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    pub message: String,
    pub correlation_id: String,
}

impl AppError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            correlation_id: uuid::Uuid::new_v4().to_string(),
        }
    }
    pub fn validation(message: impl Into<String>) -> Self {
        Self::new("validation", message)
    }
}

macro_rules! internal_error {
    ($kind:ty, $message:expr) => {
        impl From<$kind> for AppError {
            fn from(_: $kind) -> Self {
                Self::new("internal", $message)
            }
        }
    };
}
internal_error!(
    std::io::Error,
    "The file operation failed. Check available space and permissions."
);
internal_error!(rusqlite::Error, "The workspace database operation failed.");
internal_error!(
    serde_json::Error,
    "The workspace data could not be decoded."
);
internal_error!(
    image::ImageError,
    "The image could not be decoded or prepared."
);
internal_error!(
    csv::Error,
    "The CSV could not be parsed. Check its headers and rows."
);
internal_error!(
    zip::result::ZipError,
    "The archive could not be read or written."
);

pub fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}
pub fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}
pub fn text(value: &str, name: &str, max: usize) -> Result<String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > max {
        return Err(AppError::validation(format!(
            "{name} is required and must be at most {max} characters."
        )));
    }
    Ok(value.to_string())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OpportunityInput {
    #[serde(default)]
    pub details: Option<OpportunityDetails>,
    pub id: Option<String>,
    pub topic: String,
    pub buyer: String,
    pub market: String,
    pub demand: u8,
    pub competition: u8,
    pub commercial_fit: u8,
    pub notes: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Opportunity {
    #[serde(default)]
    pub details: Option<OpportunityDetails>,
    pub id: String,
    pub topic: String,
    pub buyer: String,
    pub market: String,
    pub demand: u8,
    pub competition: u8,
    pub commercial_fit: u8,
    pub notes: String,
    pub score: u8,
    pub created_at: String,
}
pub fn score(demand: u8, competition: u8, fit: u8) -> Result<u8> {
    if [demand, competition, fit].iter().any(|x| *x > 100) {
        return Err(AppError::validation("Scores must be between 0 and 100."));
    }
    Ok(((demand as u32 * 35 + (100 - competition as u32) * 25 + fit as u32 * 40) / 100) as u8)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BriefInput {
    #[serde(default)]
    pub details: Option<BriefDetails>,
    pub id: Option<String>,
    pub opportunity_id: Option<String>,
    pub title: String,
    pub buyer: String,
    pub usage: String,
    pub market: String,
    pub scene: String,
    pub visual_direction: String,
    pub prompt: String,
    pub negative_prompt: String,
    pub metadata_plan: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Brief {
    #[serde(default)]
    pub details: Option<BriefDetails>,
    pub id: String,
    pub opportunity_id: Option<String>,
    pub title: String,
    pub buyer: String,
    pub usage: String,
    pub market: String,
    pub scene: String,
    pub visual_direction: String,
    pub prompt: String,
    pub negative_prompt: String,
    pub metadata_plan: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Checklist {
    #[serde(default)]
    pub reference_checks: Option<ReferenceChecks>,
    pub technical: bool,
    pub artifacts: bool,
    pub rights: bool,
    pub ai_disclosure: bool,
}
impl Checklist {
    pub fn complete(&self) -> bool {
        self.technical
            && self.artifacts
            && self.rights
            && self.ai_disclosure
            && self
                .reference_checks
                .as_ref()
                .map_or(true, |c| c.complete())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewInput {
    pub id: String,
    pub title: String,
    pub keywords: Vec<String>,
    pub category: u8,
    pub decision: String,
    pub checklist: Checklist,
    pub notes: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewState {
    pub decision: String,
    pub checklist: Checklist,
    pub notes: String,
    pub title: String,
    pub keywords: Vec<String>,
    pub category: u8,
}
impl From<&Asset> for ReviewState {
    fn from(asset: &Asset) -> Self {
        Self {
            decision: asset.decision.clone(),
            checklist: asset.checklist.clone(),
            notes: asset.notes.clone(),
            title: asset.title.clone(),
            keywords: asset.keywords.clone(),
            category: asset.category,
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewEvent {
    pub id: String,
    pub asset_id: String,
    pub actor: String,
    pub previous: ReviewState,
    pub current: ReviewState,
    pub created_at: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub id: String,
    pub brief_id: Option<String>,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub bytes: u64,
    pub hash: String,
    pub thumbnail: String,
    pub preview: String,
    pub title: String,
    pub keywords: Vec<String>,
    pub category: u8,
    pub decision: String,
    pub checklist: Checklist,
    pub notes: String,
    pub created_at: String,
    #[serde(default)]
    pub source_job_id: Option<String>,
    #[serde(default)]
    pub is_mock: bool,
}
pub fn metadata_errors(
    title: &str,
    keywords: &[String],
    category: u8,
    prohibited: &[String],
) -> Vec<String> {
    let mut errors = vec![];
    if title.trim().is_empty() || title.chars().count() > 70 {
        errors.push("Adobe CSV titles must contain 1 to 70 characters.".into());
    }
    if title
        .chars()
        .any(|c| !c.is_alphanumeric() && !c.is_whitespace())
    {
        errors.push("Use plain letters, numbers, and spaces in Adobe CSV titles.".into());
    }
    if !(5..=49).contains(&keywords.len()) {
        errors.push("Use 5 to 49 distinct keywords, ordered by relevance.".into());
    }
    let normalized: Vec<_> = keywords.iter().map(|s| s.trim().to_lowercase()).collect();
    let unique: std::collections::HashSet<_> = normalized.iter().collect();
    if unique.len() != keywords.len()
        || normalized
            .iter()
            .any(|s| s.is_empty() || s.chars().count() > 100 || s.contains(','))
    {
        errors.push("Keywords must be nonempty, unique, and at most 100 characters each.".into());
    }
    if !(1..=21).contains(&category) {
        errors.push("Select an Adobe category from 1 to 21.".into());
    }
    let contents = format!("{} {}", title.to_lowercase(), normalized.join(" "));
    for term in prohibited.iter().filter(|t| !t.trim().is_empty()) {
        if contents.contains(&term.to_lowercase()) {
            errors.push(format!("Metadata contains prohibited term: {term}"));
        }
    }
    errors
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preferences {
    pub workspace_name: String,
    pub region: String,
    pub prohibited_terms: Vec<String>,
    #[serde(default = "local_provider")]
    pub default_text_provider: String,
    #[serde(default = "local_text_model")]
    pub default_text_model: String,
    #[serde(default = "local_provider")]
    pub default_image_provider: String,
    #[serde(default = "local_image_model")]
    pub default_image_model: String,
}
fn local_provider() -> String {
    "local".into()
}
fn local_text_model() -> String {
    "local-rules".into()
}
fn local_image_model() -> String {
    "mock-image".into()
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            workspace_name: "Thoock".into(),
            region: "Indonesia".into(),
            prohibited_terms: vec![],
            default_text_provider: local_provider(),
            default_text_model: local_text_model(),
            default_image_provider: local_provider(),
            default_image_model: local_image_model(),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    pub operation: String,
    pub status: String,
    pub message: String,
    pub created_at: String,
    pub completed_at: Option<String>,
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub request_id: Option<String>,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub progress: u8,
    #[serde(default)]
    pub result_ids: Vec<String>,
    #[serde(default)]
    pub output_count: usize,
}
impl Job {
    pub fn local(operation: &str) -> Self {
        Self {
            id: id(),
            operation: operation.into(),
            status: "running".into(),
            message: "Processing locally".into(),
            created_at: now(),
            completed_at: None,
            provider: "local".into(),
            model: "".into(),
            request_id: None,
            parent_id: None,
            progress: 0,
            result_ids: vec![],
            output_count: 0,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenerationInput {
    pub provider: String,
    pub model: String,
    pub prompt: String,
    pub negative_prompt: String,
    pub aspect_ratio: String,
    pub resolution: String,
    pub quality: String,
    pub brief_id: Option<String>,
    pub parent_job_id: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TextInput {
    #[serde(default)]
    pub context: Option<TextContext>,
    pub provider: String,
    pub model: String,
    pub topic: String,
    pub count: u8,
    pub opportunity_id: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "operation", content = "input", rename_all = "camelCase")]
pub enum Task {
    Generate(GenerationInput),
    Research(TextInput),
    BriefBatch(TextInput),
    Metadata {
        provider: String,
        model: String,
        asset_id: String,
    },
    Repair {
        asset_id: String,
        mode: String,
    },
}
impl Task {
    pub fn provider_model(&self) -> (&str, &str) {
        match self {
            Self::Generate(i) => (&i.provider, &i.model),
            Self::Research(i) | Self::BriefBatch(i) => (&i.provider, &i.model),
            Self::Metadata {
                provider, model, ..
            } => (provider, model),
            Self::Repair { .. } => ("snapgen", "logo removal"),
        }
    }
    pub fn operation(&self) -> &str {
        match self {
            Self::Generate(_) => "image generation",
            Self::Research(_) => "topic research",
            Self::BriefBatch(_) => "brief batch",
            Self::Metadata { .. } => "image metadata",
            Self::Repair { .. } => "provider logo removal",
        }
    }
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capability {
    pub provider: String,
    pub model: String,
    pub label: String,
    pub aspect_ratios: Vec<String>,
    pub resolutions: Vec<String>,
    pub qualities: Vec<String>,
    pub negative_prompt: bool,
    pub repair: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Log {
    pub id: String,
    pub provider: String,
    pub operation: String,
    pub status: String,
    pub message: String,
    pub duration_ms: u64,
    pub created_at: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub request_id: Option<String>,
    #[serde(default)]
    pub request_summary: serde_json::Value,
    #[serde(default)]
    pub response_summary: serde_json::Value,
}
impl Default for Log {
    fn default() -> Self {
        Self {
            id: String::new(),
            provider: String::new(),
            operation: String::new(),
            status: String::new(),
            message: String::new(),
            duration_ms: 0,
            created_at: String::new(),
            model: String::new(),
            request_id: None,
            request_summary: serde_json::Value::Null,
            response_summary: serde_json::Value::Null,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportBatch {
    pub id: String,
    pub name: String,
    pub count: usize,
    pub path: String,
    pub created_at: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    pub id: String,
    pub configured: bool,
    pub last_tested: Option<String>,
    pub status: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub schema_version: u32,
    pub workspace_id: String,
    pub workspace_path: String,
    pub storage_bytes: u64,
    pub preferences: Preferences,
    pub opportunities: Vec<Opportunity>,
    pub restart_required: bool,
    pub briefs: Vec<Brief>,
    pub assets: Vec<Asset>,
    pub jobs: Vec<Job>,
    pub logs: Vec<Log>,
    pub exports: Vec<ExportBatch>,
    pub providers: Vec<ProviderStatus>,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn csv_titles_follow_the_current_adobe_limit() {
        let keywords = ["forest", "green", "trees", "landscape", "nature"]
            .map(String::from)
            .to_vec();
        assert!(metadata_errors(&"x".repeat(71), &keywords, 5, &[])
            .iter()
            .any(|e| e.contains("70")));
        assert!(metadata_errors("Forest, landscape", &keywords, 5, &[])
            .iter()
            .any(|e| e.contains("plain")));
        assert!(metadata_errors("Forest landscape", &keywords, 5, &[]).is_empty());
    }
    #[test]
    fn scoring_is_bounded_and_explainable() {
        assert_eq!(score(100, 0, 100).unwrap(), 100);
        assert_eq!(score(0, 100, 0).unwrap(), 0);
        assert_eq!(score(80, 40, 90).unwrap(), 79);
        assert!(score(101, 20, 40).is_err());
    }
    #[test]
    fn export_metadata_rejects_duplicate_keywords_and_prohibited_terms() {
        let words = vec!["forest", "Forest", "nature", "trees", "landscape"]
            .into_iter()
            .map(String::from)
            .collect::<Vec<_>>();
        assert!(!metadata_errors("A forest", &words, 5, &[]).is_empty());
        let words = vec!["forest", "light", "nature", "trees", "landscape"]
            .into_iter()
            .map(String::from)
            .collect::<Vec<_>>();
        assert!(metadata_errors("A forest", &words, 5, &[]).is_empty());
        assert!(!metadata_errors("A forest", &words, 5, &["forest".into()]).is_empty());
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OpportunityDetails {
    pub behavior: String,
    pub result_count: u64,
    pub trend_growth: u8,
    pub commercial_intent: u8,
    pub seasonal_fit: u8,
    pub portfolio_fit: u8,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BriefDetails {
    pub supporting_subjects: String,
    pub environment: String,
    pub visual_style: String,
    pub orientation: String,
    pub copy_space: String,
    pub composition: String,
    pub lighting: String,
    pub adobe_title: String,
    pub keywords: Vec<String>,
    pub category: u8,
}
pub fn validate_opportunity_details(
    details: Option<OpportunityDetails>,
) -> Result<Option<OpportunityDetails>> {
    if let Some(ref d) = details {
        if !["evergreen", "seasonal", "trending"].contains(&d.behavior.as_str())
            || d.result_count > 1_000_000_000_000
            || [
                d.trend_growth,
                d.commercial_intent,
                d.seasonal_fit,
                d.portfolio_fit,
            ]
            .iter()
            .any(|v| *v > 100)
        {
            return Err(AppError::validation("Invalid research signals."));
        }
    }
    Ok(details)
}
pub fn validate_brief_details(details: Option<BriefDetails>) -> Result<Option<BriefDetails>> {
    if let Some(ref d) = details {
        if [
            &d.supporting_subjects,
            &d.environment,
            &d.visual_style,
            &d.copy_space,
            &d.composition,
            &d.lighting,
            &d.adobe_title,
        ]
        .iter()
        .any(|v| v.chars().count() > 5000)
            || !["Horizontal", "Vertical", "Square"].contains(&d.orientation.as_str())
            || d.keywords.len() > 49
            || d.keywords.iter().any(|v| v.chars().count() > 100)
            || d.category > 21
        {
            return Err(AppError::validation(
                "Invalid commercial direction details.",
            ));
        }
    }
    Ok(details)
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TextContext {
    pub target_region: String,
    pub behavior: String,
    pub portfolio_context: String,
    pub creative_preset: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReferenceChecks {
    pub logo: bool,
    pub text: bool,
    pub anatomy: bool,
    pub truthfulness: bool,
    pub famous: bool,
    pub copyright: bool,
    pub composition: bool,
    pub consistency: bool,
    pub distinctiveness: bool,
}
impl ReferenceChecks {
    pub fn complete(&self) -> bool {
        self.logo
            && self.text
            && self.anatomy
            && self.truthfulness
            && self.famous
            && self.copyright
            && self.composition
            && self.consistency
            && self.distinctiveness
    }
}

#[cfg(test)]
mod reference_check_tests {
    use super::*;
    #[test]
    fn reference_checks_are_required_when_present_and_legacy_reviews_still_decode() {
        let mut checklist: Checklist = serde_json::from_value(serde_json::json!({ "technical": true, "artifacts": true, "rights": true, "aiDisclosure": true })).unwrap();
        assert!(checklist.complete());
        checklist.reference_checks = Some(ReferenceChecks::default());
        assert!(!checklist.complete());
        checklist.reference_checks = Some(serde_json::from_value(serde_json::json!({ "logo": true, "text": true, "anatomy": true, "truthfulness": true, "famous": true, "copyright": true, "composition": true, "consistency": true, "distinctiveness": true })).unwrap());
        assert!(checklist.complete());
        checklist.ai_disclosure = false;
        assert!(!checklist.complete());
    }
}
