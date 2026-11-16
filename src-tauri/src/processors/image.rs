use std::fs::File;
use std::io::BufReader;
use std::path::{Path, PathBuf};

use exif::{In, Reader as ExifReader, Tag};
use image::codecs::avif::AvifEncoder;
use image::codecs::gif::GifEncoder;
use image::codecs::png::PngEncoder;
use image::codecs::tiff::TiffEncoder;
use image::codecs::webp::WebPEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, Frame, ImageEncoder, ImageReader};
use img_parts::ImageEXIF;

use crate::error::AppError;
use crate::models::{ImageOptions, MediaPreviewResponse, MediaProbeInfo};
use crate::utils::fs::{cleanup_part_file, part_path_for, resolve_output_path, to_data_url};

#[derive(Debug, Clone)]
pub struct ImageProcessResult {
    pub output_path: PathBuf,
    pub output_size: u64,
    pub original_size: u64,
    pub size_larger_warning: bool,
}

fn read_exif_orientation(path: &Path) -> u32 {
    let Ok(file) = File::open(path) else {
        return 1;
    };
    let mut reader = BufReader::new(file);
    let Ok(exif_data) = ExifReader::new().read_from_container(&mut reader) else {
        return 1;
    };
    exif_data
        .get_field(Tag::Orientation, In::PRIMARY)
        .and_then(|f| f.value.get_uint(0))
        .unwrap_or(1)
}

fn apply_exif_orientation(img: DynamicImage, orientation: u32) -> DynamicImage {
    match orientation {
        2 => img.fliph(),
        3 => img.rotate180(),
        4 => img.flipv(),
        5 => img.rotate90().fliph(),
        6 => img.rotate90(),
        7 => img.rotate270().fliph(),
        8 => img.rotate270(),
        _ => img,
    }
}

fn compute_target_dimensions(
    orig_w: u32,
    orig_h: u32,
    options: &ImageOptions,
) -> Option<(u32, u32, bool)> {
    match options.resize_mode.as_str() {
        "percentage" => {
            let pct = options.resize_percentage.unwrap_or(100).clamp(1, 500) as f64 / 100.0;
            let w = ((orig_w as f64) * pct).round().max(1.0) as u32;
            let h = ((orig_h as f64) * pct).round().max(1.0) as u32;
            Some((w, h, false))
        }
        "dimensions" => {
            let w_opt = options.target_width.filter(|&w| w > 0);
            let h_opt = options.target_height.filter(|&h| h > 0);
            match (w_opt, h_opt) {
                (Some(w), Some(h)) => Some((w, h, !options.keep_aspect_ratio)),
                (Some(w), None) => {
                    let ratio = orig_h as f64 / orig_w.max(1) as f64;
                    let h = ((w as f64) * ratio).round().max(1.0) as u32;
                    Some((w, h, false))
                }
                (None, Some(h)) => {
                    let ratio = orig_w as f64 / orig_h.max(1) as f64;
                    let w = ((h as f64) * ratio).round().max(1.0) as u32;
                    Some((w, h, false))
                }
                (None, None) => None,
            }
        }
        _ => None,
    }
}

fn map_target_extension(input: &Path, options: &ImageOptions) -> String {
    if options.output_format != "original" {
        return options.output_format.to_ascii_lowercase();
    }
    match input
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_ascii_lowercase()
        .as_str()
    {
        "jpeg" | "jpg" => "jpg".to_string(),
        "tif" | "tiff" => "tiff".to_string(),
        "bmp" => "png".to_string(), // BMP output maps to compressed PNG by default if kept original
        other => other.to_string(),
    }
}

fn encode_image_bytes(
    img: &DynamicImage,
    target_ext: &str,
    options: &ImageOptions,
    orig_exif: Option<img_parts::Bytes>,
) -> Result<Vec<u8>, AppError> {
    let mut out_bytes = Vec::new();
    let (w, h) = (img.width(), img.height());

    match target_ext {
        "jpg" | "jpeg" => {
            let width_u16 = u16::try_from(w)
                .map_err(|_| AppError::EncodeFailed("Image width exceeds JPEG 65535px limit".into()))?;
            let height_u16 = u16::try_from(h)
                .map_err(|_| AppError::EncodeFailed("Image height exceeds JPEG 65535px limit".into()))?;
            let quality = options.quality.clamp(1, 100);
            let mut encoder = jpeg_encoder::Encoder::new(&mut out_bytes, quality);
            encoder.set_progressive(options.progressive_jpeg);
            encoder.set_optimized_huffman_tables(true);
            if options.grayscale {
                let luma = img.to_luma8();
                encoder
                    .encode(luma.as_raw(), width_u16, height_u16, jpeg_encoder::ColorType::Luma)
                    .map_err(|e| AppError::EncodeFailed(format!("JPEG encode failed: {e}")))?;
            } else {
                let rgb = img.to_rgb8();
                encoder
                    .encode(rgb.as_raw(), width_u16, height_u16, jpeg_encoder::ColorType::Rgb)
                    .map_err(|e| AppError::EncodeFailed(format!("JPEG encode failed: {e}")))?;
            }
        }
        "png" => {
            let mut raw_png = Vec::new();
            let rgba = img.to_rgba8();
            PngEncoder::new(&mut raw_png)
                .write_image(rgba.as_raw(), w, h, image::ExtendedColorType::Rgba8)
                .map_err(|e| AppError::EncodeFailed(format!("PNG encode failed: {e}")))?;

            let mut oxipng_opts = oxipng::Options::from_preset(options.png_optimization_level.min(6));
            oxipng_opts.strip = if options.metadata_mode == "keep-all" {
                oxipng::StripChunks::None
            } else {
                oxipng::StripChunks::Safe
            };
            if options.png_zopfli {
                if let Some(iters) = std::num::NonZeroU8::new(15) {
                    oxipng_opts.deflate = oxipng::Deflaters::Zopfli { iterations: iters };
                }
            }
            out_bytes = oxipng::optimize_from_memory(&raw_png, &oxipng_opts)
                .map_err(|e| AppError::EncodeFailed(format!("OxiPNG optimization failed: {e}")))?;
        }
        "webp" => {
            let rgba = img.to_rgba8();
            WebPEncoder::new_lossless(&mut out_bytes)
                .write_image(rgba.as_raw(), w, h, image::ExtendedColorType::Rgba8)
                .map_err(|e| AppError::EncodeFailed(format!("WebP encode failed: {e}")))?;
        }
        "avif" => {
            let rgba = img.to_rgba8();
            let speed = (11u8.saturating_sub(options.effort.clamp(1, 10))).clamp(1, 10);
            let quality = if options.lossless {
                100
            } else {
                options.quality.clamp(1, 100)
            };
            AvifEncoder::new_with_speed_quality(&mut out_bytes, speed, quality)
                .write_image(rgba.as_raw(), w, h, image::ExtendedColorType::Rgba8)
                .map_err(|e| AppError::EncodeFailed(format!("AVIF encode failed: {e}")))?;
        }
        "gif" => {
            let mut encoder = GifEncoder::new(&mut out_bytes);
            let frame = Frame::new(img.to_rgba8());
            encoder
                .encode_frame(frame)
                .map_err(|e| AppError::EncodeFailed(format!("GIF encode failed: {e}")))?;
        }
        "tiff" | "tif" => {
            let rgba = img.to_rgba8();
            let mut cursor = std::io::Cursor::new(&mut out_bytes);
            TiffEncoder::new(&mut cursor)
                .write_image(rgba.as_raw(), w, h, image::ExtendedColorType::Rgba8)
                .map_err(|e| AppError::EncodeFailed(format!("TIFF encode failed: {e}")))?;
        }
        other => {
            return Err(AppError::UnsupportedFormat(format!(
                "Unsupported target image format: {other}"
            )));
        }
    }

    // Re-attach original EXIF bytes when requested and image was not geometrically transformed
    let has_crop = options.crop_width.is_some() || options.crop_height.is_some();
    if options.metadata_mode == "keep-all"
        && options.rotate == 0
        && !options.flip_horizontal
        && !options.flip_vertical
        && !has_crop
    {
        if let Some(exif_bytes) = orig_exif {
            if let Ok(Some(mut dyn_out)) = img_parts::DynImage::from_bytes(out_bytes.clone().into())
            {
                dyn_out.set_exif(Some(exif_bytes));
                out_bytes = dyn_out.encoder().bytes().to_vec();
            }
        }
    }

    Ok(out_bytes)
}

/// Applies orientation, crop, resize, rotation, flip, and grayscale transforms in order.
/// Crop is applied in upright original coordinates before resize/rotate/flip so UI crop boxes match output.
pub fn apply_image_transforms(
    mut img: DynamicImage,
    orientation: u32,
    options: &ImageOptions,
) -> DynamicImage {
    let has_crop = options.crop_width.is_some() || options.crop_height.is_some();

    // Apply EXIF orientation if requested (or when cropping in upright UI coordinates)
    if (options.metadata_mode != "keep-all" || has_crop) && orientation > 1 {
        img = apply_exif_orientation(img, orientation);
    }

    // Apply crop in upright original pixel coordinates
    if let (Some(cw), Some(ch)) = (options.crop_width, options.crop_height) {
        let img_w = img.width();
        let img_h = img.height();
        if cw > 0 && ch > 0 && img_w > 0 && img_h > 0 {
            let x = options.crop_x.unwrap_or(0).min(img_w.saturating_sub(1));
            let y = options.crop_y.unwrap_or(0).min(img_h.saturating_sub(1));
            let w = cw.min(img_w - x).max(1);
            let h = ch.min(img_h - y).max(1);
            img = img.crop_imm(x, y, w, h);
        }
    }

    // Apply resize
    if let Some((w, h, exact)) = compute_target_dimensions(img.width(), img.height(), options) {
        if exact {
            img = img.resize_exact(w, h, FilterType::Lanczos3);
        } else {
            img = img.resize(w, h, FilterType::Lanczos3);
        }
    }

    // Apply rotation
    img = match options.rotate {
        90 => img.rotate90(),
        180 => img.rotate180(),
        270 => img.rotate270(),
        _ => img,
    };

    if options.flip_horizontal {
        img = img.fliph();
    }
    if options.flip_vertical {
        img = img.flipv();
    }
    if options.grayscale {
        img = img.grayscale();
    }

    img
}

fn preview_mime_for_ext(ext: &str) -> &'static str {
    match ext {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "gif" => "image/gif",
        _ => "image/png",
    }
}

fn encode_preview_display(img: &DynamicImage) -> Result<String, AppError> {
    const MAX_DIM: u32 = 1400;
    let resized;
    let src = if img.width() > MAX_DIM || img.height() > MAX_DIM {
        resized = img.resize(MAX_DIM, MAX_DIM, FilterType::Triangle);
        &resized
    } else {
        img
    };

    let mut buf = Vec::new();
    if src.color().has_alpha() {
        let rgba = src.to_rgba8();
        PngEncoder::new(&mut buf)
            .write_image(rgba.as_raw(), src.width(), src.height(), image::ExtendedColorType::Rgba8)
            .map_err(|e| AppError::EncodeFailed(format!("Preview PNG encode failed: {e}")))?;
        Ok(to_data_url("image/png", &buf))
    } else {
        let w = u16::try_from(src.width()).unwrap_or(MAX_DIM as u16);
        let h = u16::try_from(src.height()).unwrap_or(MAX_DIM as u16);
        let rgb = src.to_rgb8();
        let mut enc = jpeg_encoder::Encoder::new(&mut buf, 92);
        enc.set_optimized_huffman_tables(true);
        enc.encode(rgb.as_raw(), w, h, jpeg_encoder::ColorType::Rgb)
            .map_err(|e| AppError::EncodeFailed(format!("Preview JPEG encode failed: {e}")))?;
        Ok(to_data_url("image/jpeg", &buf))
    }
}

pub fn generate_image_preview(
    input_path: &Path,
    options: &ImageOptions,
) -> Result<MediaPreviewResponse, AppError> {
    if !input_path.is_file() {
        return Err(AppError::IoError(format!(
            "Input image not found: {}",
            input_path.display()
        )));
    }

    let original_size = std::fs::metadata(input_path)?.len();
    let orientation = read_exif_orientation(input_path);
    let decoded = ImageReader::open(input_path)?
        .with_guessed_format()
        .map_err(|e| AppError::IoError(e.to_string()))?
        .decode()
        .map_err(|e| AppError::EncodeFailed(format!("Failed to decode image preview: {e}")))?;

    let original_upright = if orientation > 1 {
        apply_exif_orientation(decoded.clone(), orientation)
    } else {
        decoded.clone()
    };
    let original_width = original_upright.width();
    let original_height = original_upright.height();
    let original_data_url = encode_preview_display(&original_upright)?;

    let transformed = apply_image_transforms(decoded, orientation, options);
    let processed_width = transformed.width();
    let processed_height = transformed.height();

    let target_ext = map_target_extension(input_path, options);
    let encoded_bytes = encode_image_bytes(&transformed, &target_ext, options, None)?;
    let processed_size = encoded_bytes.len() as u64;

    let processed_data_url = if matches!(target_ext.as_str(), "jpg" | "png" | "webp" | "avif" | "gif")
        && encoded_bytes.len() <= 4_000_000
    {
        to_data_url(preview_mime_for_ext(&target_ext), &encoded_bytes)
    } else {
        encode_preview_display(&transformed)?
    };

    Ok(MediaPreviewResponse {
        original_data_url,
        processed_data_url,
        original_width,
        original_height,
        processed_width,
        processed_height,
        original_size,
        processed_size,
        estimated_output_size: Some(processed_size),
        duration_ms: None,
        preview_time_sec: 0.0,
        processed_format: target_ext,
    })
}

pub fn compare_image_files(
    input_path: &Path,
    output_path: &Path,
) -> Result<MediaPreviewResponse, AppError> {
    if !input_path.is_file() {
        return Err(AppError::IoError(format!(
            "Input image not found: {}",
            input_path.display()
        )));
    }
    if !output_path.is_file() {
        return Err(AppError::IoError(format!(
            "Output image not found: {}",
            output_path.display()
        )));
    }

    let original_size = std::fs::metadata(input_path)?.len();
    let orig_orientation = read_exif_orientation(input_path);
    let orig_decoded = ImageReader::open(input_path)?
        .with_guessed_format()
        .map_err(|e| AppError::IoError(e.to_string()))?
        .decode()
        .map_err(|e| AppError::EncodeFailed(format!("Failed to decode original image: {e}")))?;
    let original_upright = if orig_orientation > 1 {
        apply_exif_orientation(orig_decoded, orig_orientation)
    } else {
        orig_decoded
    };
    let original_width = original_upright.width();
    let original_height = original_upright.height();
    let original_data_url = encode_preview_display(&original_upright)?;

    let processed_size = std::fs::metadata(output_path)?.len();
    let out_orientation = read_exif_orientation(output_path);
    let out_decoded = ImageReader::open(output_path)?
        .with_guessed_format()
        .map_err(|e| AppError::IoError(e.to_string()))?
        .decode()
        .map_err(|e| AppError::EncodeFailed(format!("Failed to decode output image: {e}")))?;
    let output_upright = if out_orientation > 1 {
        apply_exif_orientation(out_decoded, out_orientation)
    } else {
        out_decoded
    };
    let processed_width = output_upright.width();
    let processed_height = output_upright.height();

    let out_ext = output_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_ascii_lowercase();

    let processed_data_url = if matches!(out_ext.as_str(), "jpg" | "jpeg" | "png" | "webp" | "avif" | "gif")
        && processed_size <= 4_000_000
    {
        let raw_bytes = std::fs::read(output_path)?;
        to_data_url(preview_mime_for_ext(&out_ext), &raw_bytes)
    } else {
        encode_preview_display(&output_upright)?
    };

    Ok(MediaPreviewResponse {
        original_data_url,
        processed_data_url,
        original_width,
        original_height,
        processed_width,
        processed_height,
        original_size,
        processed_size,
        estimated_output_size: Some(processed_size),
        duration_ms: None,
        preview_time_sec: 0.0,
        processed_format: out_ext,
    })
}

pub fn process_image_job<F>(
    input_path: &Path,
    options: &ImageOptions,
    global_output_dir: Option<&str>,
    _probe: Option<&MediaProbeInfo>,
    mut on_progress: F,
) -> Result<ImageProcessResult, AppError>
where
    F: FnMut(f64),
{
    if !input_path.is_file() {
        return Err(AppError::IoError(format!(
            "Input image not found: {}",
            input_path.display()
        )));
    }

    let original_size = std::fs::metadata(input_path)?.len();
    on_progress(10.0);

    let orig_exif = if options.metadata_mode == "keep-all" {
        std::fs::read(input_path)
            .ok()
            .and_then(|bytes| img_parts::DynImage::from_bytes(bytes.into()).ok().flatten())
            .and_then(|d| d.exif())
    } else {
        None
    };

    let orientation = read_exif_orientation(input_path);

    let img = ImageReader::open(input_path)?
        .with_guessed_format()
        .map_err(|e| AppError::IoError(e.to_string()))?
        .decode()
        .map_err(|e| AppError::EncodeFailed(format!("Failed to decode image: {e}")))?;

    on_progress(40.0);

    let img = apply_image_transforms(img, orientation, options);

    on_progress(70.0);

    let target_ext = map_target_extension(input_path, options);
    let effective_output_dir = options.output_dir.as_deref().or(global_output_dir);
    let output_path = resolve_output_path(
        input_path,
        effective_output_dir,
        &options.naming_pattern,
        &target_ext,
        Some(img.width()),
        Some(img.height()),
        options.overwrite_existing,
    );

    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let part_path = part_path_for(&output_path);
    let encoded_bytes = match encode_image_bytes(&img, &target_ext, options, orig_exif) {
        Ok(bytes) => bytes,
        Err(e) => {
            cleanup_part_file(&part_path);
            return Err(e);
        }
    };

    if let Err(e) = std::fs::write(&part_path, &encoded_bytes) {
        cleanup_part_file(&part_path);
        return Err(e.into());
    }

    if let Err(e) = std::fs::rename(&part_path, &output_path) {
        cleanup_part_file(&part_path);
        return Err(e.into());
    }

    on_progress(100.0);

    let output_size = std::fs::metadata(&output_path)?.len();
    let size_larger_warning = output_size >= original_size;

    Ok(ImageProcessResult {
        output_path,
        output_size,
        original_size,
        size_larger_warning,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgba};

    #[test]
    fn roundtrip_png_jpeg_and_webp_with_transforms() {
        let dir = std::env::temp_dir().join(format!("mf_img_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        let src_png = dir.join("sample.png");
        let buf: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::from_fn(64, 48, |x, y| {
            Rgba([(x * 3) as u8, (y * 4) as u8, 128, 255])
        });
        buf.save(&src_png).unwrap();

        // Test PNG -> JPG with resize & grayscale
        let jpg_opts = ImageOptions {
            output_format: "jpg".to_string(),
            quality: 80,
            resize_mode: "percentage".to_string(),
            resize_percentage: Some(50),
            grayscale: true,
            rotate: 90,
            output_dir: Some(dir.to_string_lossy().to_string()),
            ..ImageOptions::default()
        };

        let mut stages = Vec::new();
        let res_jpg = process_image_job(&src_png, &jpg_opts, None, None, |p| stages.push(p)).unwrap();
        assert!(res_jpg.output_path.exists());
        assert_eq!(stages, vec![10.0, 40.0, 70.0, 100.0]);
        let dims = image::image_dimensions(&res_jpg.output_path).unwrap();
        assert_eq!(dims, (24, 32)); // 64x48 -> 50% (32x24) -> rotated 90deg (24x32)

        // Test PNG -> OxiPNG
        let png_opts = ImageOptions {
            output_format: "png".to_string(),
            png_optimization_level: 2,
            output_dir: Some(dir.to_string_lossy().to_string()),
            ..ImageOptions::default()
        };
        let res_png = process_image_job(&src_png, &png_opts, None, None, |_| {}).unwrap();
        assert!(res_png.output_path.exists());

        // Test PNG -> WebP
        let webp_opts = ImageOptions {
            output_format: "webp".to_string(),
            output_dir: Some(dir.to_string_lossy().to_string()),
            ..ImageOptions::default()
        };
        let res_webp = process_image_job(&src_png, &webp_opts, None, None, |_| {}).unwrap();
        assert!(res_webp.output_path.exists());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn crops_and_generates_image_preview() {
        let dir = std::env::temp_dir().join(format!("mf_crop_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let src_png = dir.join("sample.png");

        let img_buf: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::from_fn(200, 120, |x, y| {
            Rgba([((x * 2) % 255) as u8, ((y * 2) % 255) as u8, 128, 255])
        });
        img_buf.save(&src_png).unwrap();

        let crop_opts = ImageOptions {
            output_format: "jpg".to_string(),
            quality: 75,
            crop_x: Some(20),
            crop_y: Some(10),
            crop_width: Some(100),
            crop_height: Some(60),
            ..ImageOptions::default()
        };

        let preview = generate_image_preview(&src_png, &crop_opts).unwrap();
        assert_eq!(preview.original_width, 200);
        assert_eq!(preview.original_height, 120);
        assert_eq!(preview.processed_width, 100);
        assert_eq!(preview.processed_height, 60);
        assert_eq!(preview.processed_format, "jpg");
        assert!(preview.original_data_url.starts_with("data:image/png;base64,"));
        assert!(preview.processed_data_url.starts_with("data:image/jpeg;base64,"));
        assert!(preview.processed_size > 0);

        let res = process_image_job(&src_png, &crop_opts, None, None, |_| {}).unwrap();
        let decoded_out = ImageReader::open(&res.output_path).unwrap().decode().unwrap();
        assert_eq!(decoded_out.width(), 100);
        assert_eq!(decoded_out.height(), 60);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
