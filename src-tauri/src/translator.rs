use std::path::{Path, PathBuf};
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::watch;

use crate::chunker::{
    build_chunk_blocks, mask_protected_tokens, parse_file_metadata, reconstruct_file,
    restore_protected_tokens, BlockItem,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslationConfig {
    pub ollama_url: String,
    pub model: String,
    pub temperature: f32,
    pub source_lang: String,
    pub target_lang: String,
    pub granularity: usize,
    pub max_chunk_size: usize,
    #[serde(default)]
    pub retry_count: usize,
    pub system_prompt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileProgressEvent {
    pub file_path: String,
    pub status: String, // "processing", "completed", "error", "cancelled"
    pub current_chunk: usize,
    pub total_chunks: usize,
    pub error_message: Option<String>,
    pub output_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct OllamaChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct OllamaChatRequest {
    model: String,
    messages: Vec<OllamaChatMessage>,
    stream: bool,
    options: Option<OllamaOptions>,
}

#[derive(Debug, Serialize)]
struct OllamaOptions {
    temperature: f32,
}

#[derive(Debug, Deserialize)]
struct OllamaChatResponse {
    message: OllamaChatMessage,
}

pub struct TranslationState {
    cancel_tx: watch::Sender<bool>,
    cancel_rx: watch::Receiver<bool>,
}

impl Default for TranslationState {
    fn default() -> Self {
        Self::new()
    }
}

impl TranslationState {
    pub fn new() -> Self {
        let (cancel_tx, cancel_rx) = watch::channel(false);
        Self { cancel_tx, cancel_rx }
    }

    pub fn reset(&self) {
        let _ = self.cancel_tx.send(false);
    }

    pub fn cancel(&self) {
        let _ = self.cancel_tx.send(true);
    }

    pub fn is_cancelled(&self) -> bool {
        *self.cancel_rx.borrow()
    }

    pub fn subscribe_cancel(&self) -> watch::Receiver<bool> {
        self.cancel_rx.clone()
    }
}

/// Derive output file path (e.g. sample.txt -> sample.ja.txt)
pub fn derive_output_path(input_path: &str, target_lang: &str) -> PathBuf {
    let path = Path::new(input_path);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("translated");
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("txt");

    let lang_tag = match target_lang.to_lowercase().as_str() {
        "japanese" | "ja" | "日本語" => "ja",
        "english" | "en" | "英語" => "en",
        "chinese" | "zh" | "中国語" => "zh",
        "korean" | "ko" | "韓国語" => "ko",
        "french" | "fr" | "フランス語" => "fr",
        "german" | "de" | "ドイツ語" => "de",
        "spanish" | "es" | "スペイン語" => "es",
        _ => "translated",
    };

    let base_name = format!("{}.{}", stem, lang_tag);
    let parent = path.parent();

    let initial_path = if let Some(p) = parent {
        p.join(format!("{}.{}", base_name, ext))
    } else {
        PathBuf::from(format!("{}.{}", base_name, ext))
    };

    if !initial_path.exists() {
        return initial_path;
    }

    let mut count = 1;
    loop {
        let numbered_name = format!("{} ({}).{}", base_name, count, ext);
        let candidate = if let Some(p) = parent {
            p.join(&numbered_name)
        } else {
            PathBuf::from(&numbered_name)
        };

        if !candidate.exists() {
            return candidate;
        }
        count += 1;
    }
}

/// Call Ollama API to translate a single text chunk
async fn translate_chunk(
    client: &reqwest::Client,
    config: &TranslationConfig,
    text: &str,
) -> Result<String, String> {
    let url = format!("{}/api/chat", config.ollama_url.trim_end_matches('/'));

    let src_desc = if config.source_lang.is_empty() || config.source_lang.to_lowercase() == "auto" {
        "the original language".to_string()
    } else {
        config.source_lang.clone()
    };

    let masked_input = mask_protected_tokens(text);

    let system_prompt = match &config.system_prompt {
        Some(prompt) if !prompt.trim().is_empty() => prompt
            .replace("{source_lang}", &src_desc)
            .replace("{target_lang}", &config.target_lang),
        _ => format!(
            "Translate the text from {} to {}.\n\n\
            Rules:\n\
            - Output ONLY the translation. No explanations, intro, or outro.\n\
            - Keep markdown formatting, line breaks, and `__PROTECTED_N__` placeholders unchanged.",
            src_desc, config.target_lang
        ),
    };

    let payload = OllamaChatRequest {
        model: config.model.clone(),
        messages: vec![
            OllamaChatMessage {
                role: "system".into(),
                content: system_prompt,
            },
            OllamaChatMessage {
                role: "user".into(),
                content: masked_input.masked_string,
            },
        ],
        stream: false,
        options: Some(OllamaOptions {
            temperature: config.temperature,
        }),
    };

    let res = client
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama ({})", e))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Ollama API returned error: {}", err_text));
    }

    let response_data: OllamaChatResponse = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response ({})", e))?;

    let restored_content = restore_protected_tokens(&response_data.message.content, &masked_input.placeholders);

    Ok(restored_content)
}

/// Call translate_chunk with automatic retry support (0..retry_count times)
async fn translate_chunk_with_retry(
    client: &reqwest::Client,
    config: &TranslationConfig,
    text: &str,
    cancel_rx: &mut watch::Receiver<bool>,
) -> Result<String, String> {
    let max_attempts = config.retry_count + 1;

    for attempt in 0..max_attempts {
        if *cancel_rx.borrow() {
            return Err("Cancelled by user".into());
        }

        if attempt > 0 {
            tokio::select! {
                change_res = cancel_rx.changed() => {
                    if change_res.is_ok() && *cancel_rx.borrow() {
                        return Err("Cancelled by user".into());
                    }
                }
                _ = tokio::time::sleep(std::time::Duration::from_secs(1)) => {}
            }
        }

        let res = tokio::select! {
            change_res = cancel_rx.changed() => {
                if change_res.is_ok() && *cancel_rx.borrow() {
                    return Err("Cancelled by user".into());
                }
                translate_chunk(client, config, text).await
            }
            res = translate_chunk(client, config, text) => res,
        };

        match res {
            Ok(content) => return Ok(content),
            Err(err) => {
                if attempt + 1 >= max_attempts {
                    return Err(err);
                }
            }
        }
    }

    Err("Failed to translate chunk after retries".into())
}

/// Process translation for a single file sequentially chunk by chunk
pub async fn translate_file(
    app: &AppHandle,
    file_path: &str,
    config: &TranslationConfig,
    state: Arc<TranslationState>,
    client: &reqwest::Client,
) -> Result<PathBuf, String> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    let raw_bytes = std::fs::read(path).map_err(|e| format!("Failed to read file ({})", e))?;
    let content = String::from_utf8_lossy(&raw_bytes).to_string();

    let (metadata, lines) = parse_file_metadata(&content, &raw_bytes);
    let mut blocks = build_chunk_blocks(&lines, config.granularity, config.max_chunk_size);

    let total_chunks = blocks.iter().filter(|b| matches!(b, BlockItem::Chunk(_))).count();
    let output_path = derive_output_path(file_path, &config.target_lang);

    // Initial progress event
    let _ = app.emit(
        "translation-progress",
        FileProgressEvent {
            file_path: file_path.to_string(),
            status: "processing".into(),
            current_chunk: 0,
            total_chunks,
            error_message: None,
            output_path: Some(output_path.to_string_lossy().to_string()),
        },
    );

    let mut current_chunk_idx = 0;
    let mut cancel_rx = state.subscribe_cancel();

    for block in blocks.iter_mut() {
        if *cancel_rx.borrow() {
            if output_path.exists() {
                let _ = std::fs::remove_file(&output_path);
            }
            let _ = app.emit(
                "translation-progress",
                FileProgressEvent {
                    file_path: file_path.to_string(),
                    status: "cancelled".into(),
                    current_chunk: current_chunk_idx,
                    total_chunks,
                    error_message: None,
                    output_path: None,
                },
            );
            return Err("Translation cancelled by user".into());
        }

        if let BlockItem::Chunk(orig_chunk) = block {
            current_chunk_idx += 1;

            let translated = match translate_chunk_with_retry(client, config, orig_chunk, &mut cancel_rx).await {
                Ok(res) => res,
                Err(err) => {
                    if err == "Cancelled by user" || *cancel_rx.borrow() {
                        if output_path.exists() {
                            let _ = std::fs::remove_file(&output_path);
                        }
                        let _ = app.emit(
                            "translation-progress",
                            FileProgressEvent {
                                file_path: file_path.to_string(),
                                status: "cancelled".into(),
                                current_chunk: current_chunk_idx,
                                total_chunks,
                                error_message: None,
                                output_path: None,
                            },
                        );
                        return Err("Translation cancelled by user".into());
                    } else {
                        let _ = app.emit(
                            "translation-progress",
                            FileProgressEvent {
                                file_path: file_path.to_string(),
                                status: "error".into(),
                                current_chunk: current_chunk_idx,
                                total_chunks,
                                error_message: Some(err.clone()),
                                output_path: None,
                            },
                        );
                        return Err(err);
                    }
                }
            };

            *orig_chunk = translated;

            let _ = app.emit(
                "translation-progress",
                FileProgressEvent {
                    file_path: file_path.to_string(),
                    status: "processing".into(),
                    current_chunk: current_chunk_idx,
                    total_chunks,
                    error_message: None,
                    output_path: Some(output_path.to_string_lossy().to_string()),
                },
            );
        }
    }

    // Reconstruction and writing to disk
    let output_bytes = reconstruct_file(&blocks, &metadata);
    std::fs::write(&output_path, output_bytes)
        .map_err(|e| format!("Failed to write output file ({})", e))?;

    let _ = app.emit(
        "translation-progress",
        FileProgressEvent {
            file_path: file_path.to_string(),
            status: "completed".into(),
            current_chunk: total_chunks,
            total_chunks,
            error_message: None,
            output_path: Some(output_path.to_string_lossy().to_string()),
        },
    );

    Ok(output_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_derive_output_path_increment() {
        let temp_dir = std::env::temp_dir();
        let unique_stem = format!("test_translation_derive_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos());
        let test_input = temp_dir.join(format!("{}.txt", unique_stem));

        // Candidate 1: test_input.ja.txt (does not exist yet)
        let path1 = derive_output_path(test_input.to_str().unwrap(), "Japanese");
        assert_eq!(path1, temp_dir.join(format!("{}.ja.txt", unique_stem)));

        // Create path1 file on disk
        std::fs::write(&path1, b"hello").unwrap();

        // Candidate 2: test_input.ja (1).txt
        let path2 = derive_output_path(test_input.to_str().unwrap(), "Japanese");
        assert_eq!(path2, temp_dir.join(format!("{}.ja (1).txt", unique_stem)));

        // Create path2 file on disk
        std::fs::write(&path2, b"hello 2").unwrap();

        // Candidate 3: test_input.ja (2).txt
        let path3 = derive_output_path(test_input.to_str().unwrap(), "Japanese");
        assert_eq!(path3, temp_dir.join(format!("{}.ja (2).txt", unique_stem)));

        // Clean up
        let _ = std::fs::remove_file(path1);
        let _ = std::fs::remove_file(path2);
    }
}
