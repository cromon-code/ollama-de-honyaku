mod chunker;
mod translator;

use std::sync::Arc;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use translator::{translate_file, TranslationConfig, TranslationState};

#[derive(Default)]
pub struct AppState {
    pub translation_state: Arc<TranslationState>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaModel {
    pub name: String,
}

#[derive(Debug, Deserialize)]
struct OllamaTagsResponse {
    models: Option<Vec<OllamaModel>>,
}

#[tauri::command]
async fn fetch_ollama_models(ollama_url: String) -> Result<Vec<String>, String> {
    let url = format!("{}/api/tags", ollama_url.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Ollama server is unavailable: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Failed to fetch models from Ollama ({})", res.status()));
    }

    let tags: OllamaTagsResponse = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama model response: {}", e))?;

    let models = tags
        .models
        .unwrap_or_default()
        .into_iter()
        .map(|m| m.name)
        .collect();

    Ok(models)
}

#[tauri::command]
async fn start_translation(
    app: AppHandle,
    file_paths: Vec<String>,
    config: TranslationConfig,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.translation_state.reset();
    let client = reqwest::Client::new();

    for file_path in &file_paths {
        if state.translation_state.is_cancelled() {
            let _ = app.emit(
                "translation-progress",
                translator::FileProgressEvent {
                    file_path: file_path.to_string(),
                    status: "cancelled".into(),
                    current_chunk: 0,
                    total_chunks: 0,
                    error_message: None,
                    output_path: None,
                },
            );
            continue;
        }

        // Translate file sequentially
        let _ = translate_file(
            &app,
            file_path,
            &config,
            Arc::clone(&state.translation_state),
            &client,
        )
        .await;
    }

    Ok(())
}

#[tauri::command]
fn cancel_translation(state: State<'_, AppState>) {
    state.translation_state.cancel();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState {
            translation_state: Arc::new(TranslationState::new()),
        })
        .invoke_handler(tauri::generate_handler![
            fetch_ollama_models,
            start_translation,
            cancel_translation
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
