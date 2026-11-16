use std::path::{Path, PathBuf};
use walkdir::WalkDir;

use crate::models::MediaType;

const VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "mkv", "mov", "avi", "webm", "flv", "ts", "m4v", "wmv", "3gp",
];

const IMAGE_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "webp", "avif", "gif", "bmp", "tiff", "tif",
];

const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "wav", "flac", "m4a", "aac", "ogg", "opus", "wma", "aiff",
];

pub fn is_supported_video(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|ext| VIDEO_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

pub fn is_supported_image(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|ext| IMAGE_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

pub fn is_supported_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|ext| AUDIO_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

pub fn is_supported_media(path: &Path, media_type: MediaType) -> bool {
    match media_type {
        MediaType::Video => is_supported_video(path),
        MediaType::Image => is_supported_image(path),
        MediaType::Audio => is_supported_audio(path),
    }
}

fn is_hidden_or_system(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|name| {
            name.starts_with('.')
                || name.eq_ignore_ascii_case("Thumbs.db")
                || name.eq_ignore_ascii_case("desktop.ini")
        })
        .unwrap_or(false)
}

/// Expands a list of file or directory paths, filtering strictly for `media_type`
/// with symlink-loop protection (`follow_links(false)`) and `max_depth(10)`.
pub fn expand_media_paths(paths: &[String], media_type: MediaType) -> Vec<PathBuf> {
    let mut results = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for raw in paths {
        let path = PathBuf::from(raw);
        if !path.exists() {
            continue;
        }

        if path.is_file() {
            if !is_hidden_or_system(&path)
                && is_supported_media(&path, media_type)
                && seen.insert(path.clone())
            {
                results.push(path);
            }
        } else if path.is_dir() {
            for entry in WalkDir::new(&path)
                .max_depth(10)
                .follow_links(false)
                .into_iter()
                .filter_entry(|e| !is_hidden_or_system(e.path()) || e.depth() == 0)
                .flatten()
            {
                let p = entry.path();
                if p.is_file()
                    && !is_hidden_or_system(p)
                    && is_supported_media(p, media_type)
                    && seen.insert(p.to_path_buf())
                {
                    results.push(p.to_path_buf());
                }
            }
        }
    }

    results
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_video_and_image_extensions_correctly() {
        assert!(is_supported_video(Path::new("clip.MP4")));
        assert!(is_supported_video(Path::new("movie.mkv")));
        assert!(!is_supported_video(Path::new("photo.png")));
        assert!(is_supported_image(Path::new("photo.JPG")));
        assert!(is_supported_image(Path::new("hero.avif")));
        assert!(!is_supported_image(Path::new("clip.mp4")));
    }

    #[test]
    fn expands_directory_respecting_media_type() {
        let dir = std::env::temp_dir().join(format!("mf_walker_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("nested")).unwrap();
        std::fs::write(dir.join("a.mp4"), b"dummy").unwrap();
        std::fs::write(dir.join("b.png"), b"dummy").unwrap();
        std::fs::write(dir.join(".hidden.mp4"), b"dummy").unwrap();
        std::fs::write(dir.join("nested/c.mkv"), b"dummy").unwrap();

        let vids = expand_media_paths(&[dir.to_string_lossy().to_string()], MediaType::Video);
        assert_eq!(vids.len(), 2);

        let imgs = expand_media_paths(&[dir.to_string_lossy().to_string()], MediaType::Image);
        assert_eq!(imgs.len(), 1);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
