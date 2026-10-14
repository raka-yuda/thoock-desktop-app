use crate::{
    domain::*,
    persistence::{serialize, validate_export, Workspace},
};
use image::{
    codecs::jpeg::JpegEncoder, GenericImageView, ImageDecoder, ImageEncoder, ImageFormat,
    ImageReader,
};
use rusqlite::params;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Cursor, Write},
    path::{Path, PathBuf},
};
use zip::{write::SimpleFileOptions, ZipWriter};

const MAX_IMAGE_BYTES: u64 = 100 * 1024 * 1024;
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::validation("Invalid output path."))?;
    let temporary = parent.join(format!("{}.tmp", id()));
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        fs::rename(&temporary, path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}
pub fn scoped_path(root: &Path, relative: &str) -> Result<PathBuf> {
    let path = Path::new(relative);
    if path
        .components()
        .any(|c| !matches!(c, std::path::Component::Normal(_)))
    {
        return Err(AppError::validation("Unsafe workspace path."));
    }
    let full = root.join(path);
    // All referenced asset files must already exist and must stay inside the workspace.
    if !full.canonicalize()?.starts_with(root.canonicalize()?) {
        return Err(AppError::validation("This file is outside the workspace."));
    }
    Ok(full)
}
pub fn import_images(
    workspace: &Workspace,
    paths: Vec<PathBuf>,
    brief_id: Option<String>,
) -> Result<usize> {
    if paths.is_empty() || paths.len() > 50 {
        return Err(AppError::validation(
            "Import between 1 and 50 images at a time.",
        ));
    }
    if let Some(ref brief_id) = brief_id {
        crate::persistence::record::<Brief>(
            &*workspace.conn()?,
            "SELECT data FROM briefs WHERE id=?1",
            brief_id,
        )?;
    }
    let mut imported = 0;
    for path in paths {
        if fs::metadata(&path)?.len() > MAX_IMAGE_BYTES {
            return Err(AppError::validation("Images must be at most 100 MB each."));
        }
        let extension = path
            .extension()
            .and_then(|x| x.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !["jpg", "jpeg", "png", "webp"].contains(&extension.as_str()) {
            return Err(AppError::validation("Import JPEG, PNG, or WebP images."));
        }
        let bytes = fs::read(&path)?;
        let name = path
            .file_name()
            .and_then(|x| x.to_str())
            .unwrap_or("Imported image")
            .to_string();
        if ingest(workspace, &bytes, name, brief_id.clone(), None, false)?.1 {
            imported += 1;
        }
    }
    Ok(imported)
}

pub fn decode(bytes: &[u8]) -> Result<image::DynamicImage> {
    if bytes.len() as u64 > MAX_IMAGE_BYTES {
        return Err(AppError::validation("Images must be at most 100 MB."));
    }
    let format = image::guess_format(bytes)?;
    if !matches!(
        format,
        ImageFormat::Jpeg | ImageFormat::Png | ImageFormat::WebP
    ) {
        return Err(AppError::validation("Unsupported image format."));
    }
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(16000);
    limits.max_image_height = Some(16000);
    limits.max_alloc = Some(512 * 1024 * 1024);
    reader.limits(limits);
    let mut decoder = reader.into_decoder()?;
    let (width, height) = decoder.dimensions();
    if u64::from(width) * u64::from(height) > 100_000_000 {
        return Err(AppError::validation(
            "Images must be at most 100 megapixels.",
        ));
    }
    let profile = decoder.icc_profile()?;
    let orientation = decoder.orientation()?;
    let mut decoded = image::DynamicImage::from_decoder(decoder)?;
    decoded.apply_orientation(orientation);
    if let Some(profile) = profile {
        if profile.len() > 4 * 1024 * 1024 {
            return Err(AppError::validation(
                "The image color profile is too large.",
            ));
        }
        let source = moxcms::ColorProfile::new_from_slice(&profile).map_err(|_| AppError::validation("The embedded color profile is invalid. Convert the source to sRGB before importing it."))?;
        if source.color_space != moxcms::DataColorSpace::Rgb {
            return Err(AppError::validation(
                "Convert images with non-RGB color profiles to sRGB before importing them.",
            ));
        }
        let pixels = decoded.to_rgba8();
        let mut output = vec![0u8; pixels.as_raw().len()];
        let transform = source
            .create_transform_8bit(
                moxcms::Layout::Rgba,
                &moxcms::ColorProfile::new_srgb(),
                moxcms::Layout::Rgba,
                Default::default(),
            )
            .map_err(|_| {
                AppError::validation("The source color profile could not be converted to sRGB.")
            })?;
        transform
            .transform(pixels.as_raw(), &mut output)
            .map_err(|_| {
                AppError::validation("The source pixels could not be converted to sRGB.")
            })?;
        decoded = image::DynamicImage::ImageRgba8(
            image::RgbaImage::from_raw(decoded.width(), decoded.height(), output)
                .ok_or_else(|| AppError::validation("Invalid converted pixel dimensions."))?,
        );
    }
    Ok(decoded)
}
fn rgb_white(decoded: &image::DynamicImage) -> image::RgbImage {
    if !decoded.color().has_alpha() {
        return decoded.to_rgb8();
    }
    let rgba = decoded
        .as_rgba8()
        .map(std::borrow::Cow::Borrowed)
        .unwrap_or_else(|| std::borrow::Cow::Owned(decoded.to_rgba8()));
    image::RgbImage::from_fn(rgba.width(), rgba.height(), |x, y| {
        let pixel = rgba.get_pixel(x, y).0;
        let alpha = pixel[3] as u32;
        image::Rgb([0, 1, 2].map(|i| ((pixel[i] as u32 * alpha + 255 * (255 - alpha)) / 255) as u8))
    })
}
pub fn write_derivatives(
    workspace: &Workspace,
    asset_id: &str,
    decoded: &image::DynamicImage,
) -> Result<(String, String)> {
    if asset_id.len() > 150
        || !asset_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err(AppError::validation("Invalid asset identifier."));
    }
    let thumbnail = format!("assets/thumbnails/{asset_id}-{}-640.jpg", id());
    let preview = format!("assets/previews/{asset_id}-{}-1600.jpg", id());
    for (relative, size) in [(&thumbnail, 640), (&preview, 1600)] {
        let resized = rgb_white(&decoded.thumbnail(size, size));
        let mut output = vec![];
        JpegEncoder::new_with_quality(&mut output, 85).encode_image(&resized)?;
        atomic_write(&workspace.root.join(relative), &output)?;
    }
    Ok((thumbnail, preview))
}
pub fn original_preview(workspace: &Workspace, asset_id: &str) -> Result<String> {
    let _files = workspace.files_lock()?;
    if uuid::Uuid::parse_str(asset_id).is_err() {
        return Err(AppError::validation("Invalid asset identifier."));
    }
    let relative: String = workspace.conn()?.query_row(
        "SELECT original FROM assets WHERE id=?1",
        [asset_id],
        |r| r.get(0),
    )?;
    let preview = workspace
        .root
        .join("assets/previews")
        .join(format!("{asset_id}-original-1600.jpg"));
    if !preview.exists() {
        let decoded = decode(&fs::read(scoped_path(&workspace.root, &relative)?)?)?;
        let mut output = vec![];
        JpegEncoder::new_with_quality(&mut output, 85)
            .encode_image(&rgb_white(&decoded.thumbnail(1600, 1600)))?;
        atomic_write(&preview, &output)?;
    }
    Ok(preview.to_string_lossy().into())
}
pub fn ingest(
    workspace: &Workspace,
    bytes: &[u8],
    name: String,
    brief_id: Option<String>,
    source_job_id: Option<String>,
    is_mock: bool,
) -> Result<(String, bool)> {
    let _files = workspace.files_lock()?;
    workspace.ensure_writable()?;
    let hash = format!("{:x}", Sha256::digest(bytes));
    let existing =
        workspace
            .conn()?
            .query_row("SELECT id FROM assets WHERE hash=?1", [&hash], |r| {
                r.get::<_, String>(0)
            });
    if let Ok(asset_id) = existing {
        return Ok((asset_id, false));
    }
    let decoded = decode(bytes)?;
    let (width, height) = decoded.dimensions();
    let asset_id = id();
    let format = image::guess_format(bytes)?;
    let original = format!("assets/originals/{asset_id}.{}", format.extensions_str()[0]);
    atomic_write(&workspace.root.join(&original), bytes)?;
    let (thumbnail, preview) = write_derivatives(workspace, &asset_id, &decoded)?;
    let asset = Asset {
        id: asset_id.clone(),
        brief_id,
        name,
        width,
        height,
        bytes: bytes.len() as u64,
        hash: hash.clone(),
        thumbnail,
        preview,
        title: String::new(),
        keywords: vec![],
        category: 0,
        decision: "pending".into(),
        checklist: Checklist::default(),
        notes: String::new(),
        created_at: now(),
        source_job_id,
        is_mock,
    };
    let result = workspace.conn()?.execute(
        "INSERT INTO assets VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?6)",
        params![
            asset.id,
            asset.brief_id,
            hash,
            original,
            serialize(&asset)?,
            asset.created_at
        ],
    );
    if let Err(error) = result {
        for relative in [&original, &asset.thumbnail, &asset.preview] {
            let _ = fs::remove_file(workspace.root.join(relative));
        }
        return Err(error.into());
    }
    Ok((asset_id, true))
}
pub fn replace_current(workspace: &Workspace, asset_id: &str, bytes: &[u8]) -> Result<()> {
    let _files = workspace.files_lock()?;
    workspace.ensure_writable()?;
    let decoded = decode(bytes)?;
    let mut asset = workspace.asset(asset_id)?;
    let previous = asset.clone();
    let original: String = workspace.conn()?.query_row(
        "SELECT original FROM assets WHERE id=?1",
        [asset_id],
        |r| r.get(0),
    )?;
    let old: String =
        workspace
            .conn()?
            .query_row("SELECT current FROM assets WHERE id=?1", [asset_id], |r| {
                r.get(0)
            })?;
    let relative = format!(
        "assets/current/{asset_id}-{}.{}",
        id(),
        image::guess_format(bytes)?.extensions_str()[0]
    );
    atomic_write(&workspace.root.join(&relative), bytes)?;
    let (thumbnail, preview) = write_derivatives(workspace, asset_id, &decoded)?;
    let old_thumbnail = asset.thumbnail.clone();
    let old_preview = asset.preview.clone();
    asset.thumbnail = thumbnail;
    asset.preview = preview;
    asset.width = decoded.width();
    asset.height = decoded.height();
    asset.bytes = bytes.len() as u64;
    // A repaired image needs a fresh human decision. Metadata is preserved for editing.
    asset.decision = "pending".into();
    asset.checklist = Checklist::default();
    let mut db = workspace.write_conn()?;
    let tx = db.transaction()?;
    tx.execute(
        "UPDATE assets SET current=?1, data=?2 WHERE id=?3",
        params![relative, serialize(&asset)?, asset_id],
    )?;
    crate::persistence::record_review_event(&tx, &previous, &asset, "provider repair")?;
    tx.commit()?;
    drop(db);
    for obsolete in [old_thumbnail, old_preview] {
        let _ = fs::remove_file(workspace.root.join(obsolete));
    }
    if old != original {
        let _ = fs::remove_file(crate::assets::scoped_path(&workspace.root, &old)?);
    }
    Ok(())
}

fn xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
pub fn jpeg_with_metadata(image: &image::DynamicImage, asset: &Asset) -> Result<Vec<u8>> {
    let mut jpeg = vec![];
    let mut encoder = JpegEncoder::new_with_quality(&mut jpeg, 95);
    encoder
        .set_icc_profile(
            moxcms::ColorProfile::new_srgb()
                .encode()
                .map_err(|_| AppError::validation("The sRGB profile could not be prepared."))?,
        )
        .map_err(|_| AppError::validation("The sRGB profile could not be embedded."))?;
    encoder.encode_image(&rgb_white(image))?;
    let keywords = asset
        .keywords
        .iter()
        .map(|s| format!("<rdf:li>{}</rdf:li>", xml(s)))
        .collect::<String>();
    let xmp = format!(
        r#"<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmp:CreatorTool="Thoock"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">{}</rdf:li></rdf:Alt></dc:title><dc:subject><rdf:Bag>{keywords}</rdf:Bag></dc:subject></rdf:Description></rdf:RDF></x:xmpmeta>"#,
        xml(&asset.title)
    );
    let mut segment = b"http://ns.adobe.com/xap/1.0/\0".to_vec();
    segment.extend_from_slice(xmp.as_bytes());
    let length = u16::try_from(segment.len() + 2)
        .map_err(|_| AppError::validation("Metadata is too large for a JPEG."))?;
    let mut output = vec![0xff, 0xd8, 0xff, 0xe1];
    output.extend_from_slice(&length.to_be_bytes());
    output.extend_from_slice(&segment);
    output.extend_from_slice(&jpeg[2..]);
    Ok(output)
}
pub fn export_package(
    workspace: &Workspace,
    ids: Vec<String>,
    name: String,
    destination: &Path,
) -> Result<ExportBatch> {
    let _files = workspace.files_lock()?;
    workspace.ensure_writable()?;
    let name = text(&name, "Package name", 100)?;
    if ids.is_empty() || ids.len() > 500 {
        return Err(AppError::validation("Select between 1 and 500 assets."));
    }
    let unique: std::collections::HashSet<_> = ids.iter().collect();
    if unique.len() != ids.len() {
        return Err(AppError::validation(
            "An image may appear only once in a package.",
        ));
    }
    let preferences = workspace.preferences()?;
    let assets = ids
        .iter()
        .map(|id| workspace.asset(id))
        .collect::<Result<Vec<_>>>()?;
    for asset in &assets {
        if asset.decision != "approved" {
            return Err(AppError::validation(
                "Only approved images can be exported.",
            ));
        }
        validate_export(asset, &preferences)?;
    }
    let batch_id = id();
    let mut temporary = tempfile::NamedTempFile::new_in(workspace.root.join("exports"))?;
    let mut writer = ZipWriter::new(temporary.as_file_mut());
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let mut csv = csv::Writer::from_writer(vec![]);
    csv.write_record(["Filename", "Title", "Keywords", "Category", "Releases"])?;
    let mut manifest_assets = vec![];
    for (index, asset) in assets.iter().enumerate() {
        let current: String = workspace.conn()?.query_row(
            "SELECT current FROM assets WHERE id=?1",
            [&asset.id],
            |r| r.get(0),
        )?;
        let image = decode(&fs::read(scoped_path(&workspace.root, &current)?)?)?;
        let jpeg = jpeg_with_metadata(&image, asset)?;
        if jpeg.len() > 45_000_000 {
            return Err(AppError::validation(format!(
                "{} exceeds Adobe's 45 MB JPEG limit. Prepare a smaller image before exporting.",
                asset.name
            )));
        }
        let simple = uuid::Uuid::parse_str(&asset.id)
            .map_err(|_| AppError::validation("Invalid asset identifier."))?
            .simple()
            .to_string();
        let filename = format!("t_{:04}_{}.jpg", index + 1, &simple[..16]);
        writer.start_file(&filename, options)?;
        writer.write_all(&jpeg)?;
        csv.write_record([
            filename.clone(),
            asset.title.clone(),
            asset.keywords.join(", "),
            asset.category.to_string(),
            String::new(),
        ])?;
        manifest_assets.push(serde_json::json!({"id":asset.id,"file":filename,"sha256":format!("{:x}",Sha256::digest(&jpeg)),"originalSha256":asset.hash}));
    }
    csv.flush()?;
    let csv_bytes = csv
        .into_inner()
        .map_err(|_| AppError::new("export", "CSV preparation failed."))?;
    if csv_bytes.len() > 1_000_000 {
        return Err(AppError::validation("This package's metadata CSV exceeds Adobe's 1 MB limit. Export fewer images in each package."));
    }
    writer.start_file("adobe.csv", options)?;
    writer.write_all(&csv_bytes)?;
    writer.start_file("manifest.json", options)?;
    writer.write_all(&serde_json::to_vec_pretty(&serde_json::json!({"version":1,"id":batch_id,"name":name,"createdAt":now(),"assets":manifest_assets}))?)?;
    writer.start_file("compliance.txt", options)?;
    writer.write_all(b"Human review checks and local metadata validation passed. Before submission, verify AI disclosure and release requirements in Adobe's submission interface. Thoock does not submit this package.\n")?;
    writer.finish()?;
    temporary.as_file().sync_all()?;
    let internal = workspace
        .root
        .join("exports")
        .join(format!("{batch_id}.zip"));
    temporary
        .persist(&internal)
        .map_err(|e| AppError::from(e.error))?;
    let output = destination.join(format!("thoock-{batch_id}.zip"));
    // No user-controlled filename or existing file is overwritten.
    let mut target = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&output)?;
    std::io::copy(&mut fs::File::open(&internal)?, &mut target)?;
    target.sync_all()?;
    let batch = ExportBatch {
        id: batch_id,
        name,
        count: assets.len(),
        path: output.to_string_lossy().into(),
        created_at: now(),
    };
    let mut db = workspace.conn()?;
    let tx = db.transaction()?;
    tx.execute(
        "INSERT INTO export_batches VALUES (?1, ?2, ?3)",
        params![batch.id, serialize(&batch)?, batch.created_at],
    )?;
    for asset in assets {
        tx.execute(
            "INSERT INTO export_items VALUES (?1, ?2)",
            params![batch.id, asset.id],
        )?;
    }
    tx.commit()?;
    Ok(batch)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exif_orientation_is_applied_to_dimensions_and_previews() {
        let image = image::RgbImage::from_pixel(3, 2, image::Rgb([80, 120, 100]));
        let mut jpeg = vec![];
        JpegEncoder::new_with_quality(&mut jpeg, 95)
            .encode_image(&image)
            .unwrap();
        let mut exif = b"Exif\0\0II".to_vec();
        exif.extend_from_slice(&42u16.to_le_bytes());
        exif.extend_from_slice(&8u32.to_le_bytes());
        exif.extend_from_slice(&1u16.to_le_bytes());
        exif.extend_from_slice(&0x0112u16.to_le_bytes());
        exif.extend_from_slice(&3u16.to_le_bytes());
        exif.extend_from_slice(&1u32.to_le_bytes());
        exif.extend_from_slice(&6u16.to_le_bytes());
        exif.extend_from_slice(&[0, 0]);
        exif.extend_from_slice(&0u32.to_le_bytes());
        let mut oriented = vec![0xff, 0xd8, 0xff, 0xe1];
        oriented.extend_from_slice(&((exif.len() + 2) as u16).to_be_bytes());
        oriented.extend_from_slice(&exif);
        oriented.extend_from_slice(&jpeg[2..]);
        assert_eq!(decode(&oriented).unwrap().dimensions(), (2, 3));
    }
    #[test]
    fn display_p3_source_is_converted_to_srgb() {
        let image = image::RgbImage::from_pixel(12, 12, image::Rgb([190, 140, 70]));
        let mut jpeg = vec![];
        let mut encoder = JpegEncoder::new_with_quality(&mut jpeg, 100);
        encoder
            .set_icc_profile(moxcms::ColorProfile::new_display_p3().encode().unwrap())
            .unwrap();
        encoder.encode_image(&image).unwrap();
        let before = image::load_from_memory(&jpeg).unwrap().to_rgb8();
        let after = decode(&jpeg).unwrap().to_rgb8();
        assert_eq!(after.dimensions(), before.dimensions());
        assert_ne!(after.get_pixel(4, 4), before.get_pixel(4, 4));
    }
    #[test]
    fn repairing_replaces_one_current_image_preserves_original_and_resets_review() {
        let dir = tempfile::tempdir().unwrap();
        let workspace = Workspace::open(dir.path().join("workspace")).unwrap();
        fn png(color: [u8; 3]) -> Vec<u8> {
            let image = image::DynamicImage::ImageRgb8(image::RgbImage::from_pixel(
                128,
                96,
                image::Rgb(color),
            ));
            let mut bytes = Cursor::new(vec![]);
            image.write_to(&mut bytes, ImageFormat::Png).unwrap();
            bytes.into_inner()
        }
        let original = png([20, 80, 50]);
        let (id, _) = ingest(&workspace, &original, "Fixture".into(), None, None, false).unwrap();
        replace_current(&workspace, &id, &png([30, 90, 60])).unwrap();
        replace_current(&workspace, &id, &png([40, 100, 70])).unwrap();
        let path: String = workspace
            .conn()
            .unwrap()
            .query_row("SELECT original FROM assets WHERE id=?1", [&id], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(fs::read(workspace.root.join(path)).unwrap(), original);
        assert_eq!(
            fs::read_dir(workspace.root.join("assets/current"))
                .unwrap()
                .count(),
            1
        );
        assert_eq!(workspace.asset(&id).unwrap().decision, "pending");
        assert!(!workspace.asset(&id).unwrap().checklist.complete());
        let preview = original_preview(&workspace, &id).unwrap();
        assert_eq!(original_preview(&workspace, &id).unwrap(), preview);
    }
    #[test]
    fn scoped_assets_reject_traversal() {
        let dir = tempfile::tempdir().unwrap();
        assert!(scoped_path(dir.path(), "../secret").is_err());
        assert!(scoped_path(dir.path(), "/etc/passwd").is_err());
    }
    #[test]
    fn imported_image_is_deduplicated_and_package_contains_readable_jpeg() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("source.png");
        image::RgbImage::from_pixel(2000, 2000, image::Rgb([80, 120, 100]))
            .save(&source)
            .unwrap();
        let workspace = Workspace::open(dir.path().join("workspace")).unwrap();
        assert_eq!(
            import_images(&workspace, vec![source.clone()], None).unwrap(),
            1
        );
        assert_eq!(import_images(&workspace, vec![source], None).unwrap(), 0);
        let asset = workspace.snapshot().unwrap().assets.remove(0);
        let approved = workspace
            .save_review(ReviewInput {
                id: asset.id,
                title: "Forest green texture".into(),
                keywords: ["forest", "green", "texture", "background", "nature"]
                    .map(String::from)
                    .to_vec(),
                category: 8,
                decision: "approved".into(),
                checklist: Checklist {
                    reference_checks: None,
                    technical: true,
                    artifacts: true,
                    rights: true,
                    ai_disclosure: true,
                },
                notes: String::new(),
            })
            .unwrap();
        let batch =
            export_package(&workspace, vec![approved.id], "Test".into(), dir.path()).unwrap();
        let mut archive = zip::ZipArchive::new(fs::File::open(batch.path).unwrap()).unwrap();
        use std::io::Read;
        let mut bytes = vec![];
        archive
            .by_index(0)
            .unwrap()
            .read_to_end(&mut bytes)
            .unwrap();
        assert_eq!(
            image::load_from_memory(&bytes).unwrap().dimensions(),
            (2000, 2000)
        );
        assert!(String::from_utf8_lossy(&bytes).contains("dc:subject"));
        assert!(archive.by_name("adobe.csv").is_ok());
        assert!(archive.by_name("manifest.json").is_ok());
        let profile = ImageReader::new(Cursor::new(&bytes))
            .with_guessed_format()
            .unwrap()
            .into_decoder()
            .unwrap()
            .icc_profile()
            .unwrap()
            .unwrap();
        assert_eq!(
            moxcms::ColorProfile::new_from_slice(&profile)
                .unwrap()
                .color_space,
            moxcms::DataColorSpace::Rgb
        );
        let mut csv_bytes = vec![];
        archive
            .by_name("adobe.csv")
            .unwrap()
            .read_to_end(&mut csv_bytes)
            .unwrap();
        let mut csv = csv::Reader::from_reader(csv_bytes.as_slice());
        let row = csv.records().next().unwrap().unwrap();
        assert!(row[0].len() <= 30);
        assert!(row[1].chars().count() <= 70);
        assert!(archive.by_name(&row[0]).is_ok());
    }
}
