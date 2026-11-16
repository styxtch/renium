use tauri::State;

use crate::error::AppError;
use crate::models::{AppSettings, AudioOptions, ImageOptions, JobOptions, MediaType, Preset, VideoOptions};
use crate::queue::manager::AppState;
use crate::storage::{built_in_presets, save_custom_presets, save_settings as persist_settings};

fn parse_presets_from_json(json: &str) -> Result<Vec<Preset>, AppError> {
    let parsed: serde_json::Value = serde_json::from_str(json)?;
    let items = match parsed {
        serde_json::Value::Array(arr) => arr,
        serde_json::Value::Object(_) => vec![parsed],
        _ => {
            return Err(AppError::InvalidState(
                "Preset JSON must be an object or an array of preset objects.".into(),
            ))
        }
    };

    if items.is_empty() {
        return Err(AppError::InvalidState(
            "Preset JSON array is empty.".into(),
        ));
    }

    let mut result = Vec::with_capacity(items.len());
    for item in items {
        let obj = item.as_object().ok_or_else(|| {
            AppError::InvalidState("Each preset entry must be a JSON object.".into())
        })?;

        let raw_options = obj
            .get("options")
            .cloned()
            .unwrap_or_else(|| serde_json::Value::Object(Default::default()));
        let opts_obj = raw_options.as_object().ok_or_else(|| {
            AppError::InvalidState("Preset 'options' field must be a JSON object.".into())
        })?;

        let media_type = match obj.get("type").and_then(|v| v.as_str()) {
            Some("image") => MediaType::Image,
            Some("video") => MediaType::Video,
            Some(other) => {
                return Err(AppError::InvalidState(format!(
                    "Unsupported preset type '{other}'. Expected 'image' or 'video'."
                )))
            }
            None => {
                if opts_obj.contains_key("pngOptimizationLevel")
                    || opts_obj.contains_key("metadataMode")
                    || opts_obj.contains_key("resizeMode")
                {
                    MediaType::Image
                } else if opts_obj.contains_key("videoCodec") || opts_obj.contains_key("crf") {
                    MediaType::Video
                } else {
                    return Err(AppError::InvalidState(
                        "Preset is missing required 'type' field ('image' or 'video').".into(),
                    ));
                }
            }
        };

        let name = obj
            .get("name")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| AppError::InvalidState("Preset is missing required 'name'.".into()))?
            .to_string();

        let id = obj
            .get("id")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(ToString::to_string)
            .unwrap_or_else(|| format!("custom-{}", uuid::Uuid::new_v4()));

        let media_label = match media_type {
            MediaType::Image => "image",
            MediaType::Video => "video",
            MediaType::Audio => "audio",
        };
        let description = obj
            .get("description")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(ToString::to_string)
            .unwrap_or_else(|| format!("Custom {media_label} preset"));

        let mut base_value = match media_type {
            MediaType::Image => serde_json::to_value(ImageOptions::default())?,
            MediaType::Video => serde_json::to_value(VideoOptions::default())?,
            MediaType::Audio => serde_json::to_value(AudioOptions::default())?,
        };
        if let Some(base_map) = base_value.as_object_mut() {
            for (k, v) in opts_obj {
                base_map.insert(k.clone(), v.clone());
            }
        }

        let options = match media_type {
            MediaType::Image => {
                JobOptions::Image(serde_json::from_value::<ImageOptions>(base_value)?)
            }
            MediaType::Video => {
                JobOptions::Video(serde_json::from_value::<VideoOptions>(base_value)?)
            }
            MediaType::Audio => {
                JobOptions::Audio(serde_json::from_value::<AudioOptions>(base_value)?)
            }
        };

        result.push(Preset {
            id,
            name,
            description,
            media_type,
            built_in: false,
            options,
        });
    }

    Ok(result)
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, AppError> {
    let guard = state
        .settings
        .read()
        .map_err(|_| AppError::InvalidState("Settings lock poisoned".into()))?;
    Ok(guard.clone())
}

#[tauri::command]
pub fn save_settings(state: State<'_, AppState>, settings: AppSettings) -> Result<(), AppError> {
    let mut guard = state
        .settings
        .write()
        .map_err(|_| AppError::InvalidState("Settings lock poisoned".into()))?;
    *guard = settings.clone();
    persist_settings(&state.storage, &guard)?;
    Ok(())
}

#[tauri::command]
pub fn get_presets(state: State<'_, AppState>) -> Result<Vec<Preset>, AppError> {
    let guard = state
        .presets
        .read()
        .map_err(|_| AppError::InvalidState("Presets lock poisoned".into()))?;
    Ok(guard.clone())
}

#[tauri::command]
pub fn save_preset(state: State<'_, AppState>, mut preset: Preset) -> Result<Vec<Preset>, AppError> {
    preset.built_in = false;
    let mut guard = state
        .presets
        .write()
        .map_err(|_| AppError::InvalidState("Presets lock poisoned".into()))?;

    if let Some(existing) = guard.iter_mut().find(|p| p.id == preset.id && !p.built_in) {
        *existing = preset;
    } else {
        guard.push(preset);
    }

    save_custom_presets(&state.storage, &guard)?;
    Ok(guard.clone())
}

#[tauri::command]
pub fn delete_preset(state: State<'_, AppState>, id: String) -> Result<Vec<Preset>, AppError> {
    let mut guard = state
        .presets
        .write()
        .map_err(|_| AppError::InvalidState("Presets lock poisoned".into()))?;
    guard.retain(|p| p.built_in || p.id != id);
    save_custom_presets(&state.storage, &guard)?;
    Ok(guard.clone())
}

#[tauri::command]
pub fn export_presets_json(state: State<'_, AppState>) -> Result<String, AppError> {
    let guard = state
        .presets
        .read()
        .map_err(|_| AppError::InvalidState("Presets lock poisoned".into()))?;
    let custom: Vec<&Preset> = guard.iter().filter(|p| !p.built_in).collect();
    let payload = if custom.is_empty() {
        serde_json::to_string_pretty(&*guard)?
    } else {
        serde_json::to_string_pretty(&custom)?
    };
    Ok(payload)
}

#[tauri::command]
pub fn import_presets_json(state: State<'_, AppState>, json: String) -> Result<Vec<Preset>, AppError> {
    let imported = parse_presets_from_json(&json)?;
    let mut guard = state
        .presets
        .write()
        .map_err(|_| AppError::InvalidState("Presets lock poisoned".into()))?;

    for mut p in imported {
        p.built_in = false;
        if let Some(existing) = guard.iter_mut().find(|e| e.id == p.id && !e.built_in) {
            *existing = p;
        } else {
            if guard.iter().any(|e| e.id == p.id) {
                p.id = format!("custom-{}", uuid::Uuid::new_v4());
            }
            guard.push(p);
        }
    }

    // Ensure built-ins are always intact
    for bi in built_in_presets() {
        if !guard.iter().any(|e| e.id == bi.id) {
            guard.insert(0, bi);
        }
    }

    save_custom_presets(&state.storage, &guard)?;
    Ok(guard.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_single_partial_image_preset_json() {
        let json = r#"{
            "name": "Instagram Square WebP",
            "type": "image",
            "options": {
                "outputFormat": "webp",
                "quality": 78,
                "resizeMode": "dimensions",
                "targetWidth": 1080
            }
        }"#;

        let parsed = parse_presets_from_json(json).expect("single partial preset should parse");
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].name, "Instagram Square WebP");
        assert_eq!(parsed[0].media_type, MediaType::Image);
        assert!(!parsed[0].built_in);
        match &parsed[0].options {
            JobOptions::Image(opts) => {
                assert_eq!(opts.output_format, "webp");
                assert_eq!(opts.quality, 78);
                assert_eq!(opts.resize_mode, "dimensions");
                assert_eq!(opts.target_width, Some(1080));
                assert_eq!(opts.naming_pattern, "{name}_compressed.{ext}");
            }
            _ => panic!("Expected ImageOptions"),
        }
    }

    #[test]
    fn parse_array_of_presets_json() {
        let json = r#"[
            {
                "id": "custom-png-fast",
                "name": "Fast PNG",
                "description": "Fast OxiPNG",
                "type": "image",
                "options": { "outputFormat": "png", "pngOptimizationLevel": 2 }
            },
            {
                "name": "Mini MP4",
                "type": "video",
                "options": { "crf": 28, "resolution": "720p" }
            }
        ]"#;

        let parsed = parse_presets_from_json(json).expect("array presets should parse");
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].id, "custom-png-fast");
        assert_eq!(parsed[1].media_type, MediaType::Video);
    }
}
