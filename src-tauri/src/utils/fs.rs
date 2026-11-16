use std::path::{Path, PathBuf};

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            _ => c,
        })
        .collect()
}

/// Resolves the final output path using `naming_pattern` (`{name}`, `{ext}`, `{width}`, `{height}`),
/// falling back to the input file's parent directory if `output_dir` is None/empty,
/// and resolving filename collisions with `stem (1).ext` unless `overwrite == true`.
pub fn resolve_output_path(
    input: &Path,
    output_dir: Option<&str>,
    naming_pattern: &str,
    target_ext: &str,
    width: Option<u32>,
    height: Option<u32>,
    overwrite: bool,
) -> PathBuf {
    let parent_dir = output_dir
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            input
                .parent()
                .map(Path::to_path_buf)
                .unwrap_or_else(|| PathBuf::from("."))
        });

    let orig_stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");

    let clean_ext = target_ext.trim().trim_start_matches('.').to_ascii_lowercase();
    let ext = if clean_ext.is_empty() {
        input
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("out")
            .to_ascii_lowercase()
    } else {
        clean_ext
    };

    let pattern = if naming_pattern.trim().is_empty() {
        "{name}_compressed.{ext}"
    } else {
        naming_pattern.trim()
    };

    let mut rendered = pattern
        .replace("{name}", orig_stem)
        .replace("{ext}", &ext)
        .replace(
            "{width}",
            &width.map(|w| w.to_string()).unwrap_or_else(|| "orig".to_string()),
        )
        .replace(
            "{height}",
            &height.map(|h| h.to_string()).unwrap_or_else(|| "orig".to_string()),
        );

    if !pattern.contains("{ext}") {
        rendered = format!("{rendered}.{ext}");
    }

    let safe_name = sanitize_filename(&rendered);
    let candidate = parent_dir.join(&safe_name);

    // Never overwrite the original input file directly
    let same_as_input = candidate == input;

    if overwrite && !same_as_input {
        return candidate;
    }

    if !candidate.exists() && !same_as_input {
        return candidate;
    }

    let stem_path = Path::new(&safe_name);
    let file_stem = stem_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");
    let final_ext = stem_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or(&ext);

    let mut counter = 1u32;
    loop {
        let numbered = parent_dir.join(format!("{file_stem} ({counter}).{final_ext}"));
        if !numbered.exists() && numbered != input {
            return numbered;
        }
        counter += 1;
    }
}

pub fn part_path_for(output: &Path) -> PathBuf {
    let mut os = output.as_os_str().to_os_string();
    os.push(".part");
    PathBuf::from(os)
}

pub fn cleanup_part_file(part_path: &Path) {
    if part_path.exists() {
        let _ = std::fs::remove_file(part_path);
    }
}

/// Pure-Rust RFC 4648 standard Base64 encoder (no native crate dependencies).
pub fn encode_base64(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(((input.len() + 2) / 3) * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;

        out.push(TABLE[((triple >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            out.push(TABLE[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[(triple & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

/// Encodes raw bytes as a `data:<mime>;base64,...` URI for UI preview display.
pub fn to_data_url(mime: &str, bytes: &[u8]) -> String {
    format!("data:{mime};base64,{}", encode_base64(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_naming_pattern_tokens_and_collisions() {
        let dir = std::env::temp_dir().join(format!("mf_fs_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let input = dir.join("clip.mp4");
        std::fs::write(&input, b"orig").unwrap();

        let out1 = resolve_output_path(
            &input,
            Some(&dir.to_string_lossy()),
            "{name}_compressed.{ext}",
            "mp4",
            Some(1920),
            Some(1080),
            false,
        );
        assert_eq!(out1, dir.join("clip_compressed.mp4"));

        // Simulate existing output collision
        std::fs::write(&out1, b"existing").unwrap();
        let out2 = resolve_output_path(
            &input,
            Some(&dir.to_string_lossy()),
            "{name}_compressed.{ext}",
            "mp4",
            Some(1920),
            Some(1080),
            false,
        );
        assert_eq!(out2, dir.join("clip_compressed (1).mp4"));

        // Verify part path & cleanup
        let part = part_path_for(&out2);
        assert_eq!(part, dir.join("clip_compressed (1).mp4.part"));
        std::fs::write(&part, b"partial").unwrap();
        assert!(part.exists());
        cleanup_part_file(&part);
        assert!(!part.exists());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn encodes_rfc4648_base64_and_data_url() {
        assert_eq!(encode_base64(b""), "");
        assert_eq!(encode_base64(b"f"), "Zg==");
        assert_eq!(encode_base64(b"fo"), "Zm8=");
        assert_eq!(encode_base64(b"foo"), "Zm9v");
        assert_eq!(encode_base64(b"foobar"), "Zm9vYmFy");
        assert_eq!(
            to_data_url("image/png", b"foo"),
            "data:image/png;base64,Zm9v"
        );
    }
}
