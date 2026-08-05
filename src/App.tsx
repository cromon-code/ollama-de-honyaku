import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { Header } from './components/Header';
import { DropZone } from './components/DropZone';
import { FileList } from './components/FileList';
import { SettingsPanel } from './components/SettingsPanel';
import { PromptModal } from './components/PromptModal';
import { FileItem, FileProgressEvent, TranslationConfig } from './types';
import { DEFAULT_SYSTEM_PROMPT } from './constants/prompt';
import { Play, Square, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import './App.css';

const DEFAULT_CONFIG: TranslationConfig = {
  ollama_url: 'http://127.0.0.1:11434',
  model: '',
  temperature: 0.3,
  source_lang: 'Auto',
  target_lang: 'Japanese',
  granularity: 1,
  max_chunk_size: 3000,
  retry_count: 0,
  system_prompt: DEFAULT_SYSTEM_PROMPT,
};

const LOCAL_STORAGE_KEY = 'llm_file_translator_config_v1';

export function App() {
  const [config, setConfig] = useState<TranslationConfig>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try {
        return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      } catch (e) {
        console.error('Failed to parse saved config', e);
      }
    }
    return DEFAULT_CONFIG;
  });

  const [models, setModels] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isCheckingOllama, setIsCheckingOllama] = useState<boolean>(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isHoveringDrop, setIsHoveringDrop] = useState<boolean>(false);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState<boolean>(false);

  // Save config to localStorage
  const handleConfigChange = (newConfig: TranslationConfig) => {
    setConfig(newConfig);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newConfig));
  };

  // Check Ollama connection & fetch models
  const checkOllama = useCallback(async () => {
    setIsCheckingOllama(true);
    setGlobalError(null);
    try {
      const fetchedModels = await invoke<string[]>('fetch_ollama_models', {
        ollamaUrl: config.ollama_url,
      });
      setModels(fetchedModels);
      setIsConnected(true);

      // Select default model if currently empty or not in fetched list
      if (fetchedModels.length > 0 && (!config.model || !fetchedModels.includes(config.model))) {
        handleConfigChange({ ...config, model: fetchedModels[0] });
      }
    } catch (err: any) {
      console.error('Failed to fetch Ollama models:', err);
      setIsConnected(false);
      setModels([]);
    } finally {
      setIsCheckingOllama(false);
    }
  }, [config.ollama_url, config.model]);

  useEffect(() => {
    checkOllama();
  }, [config.ollama_url]);

  // Helper to add absolute file paths to queue
  const addPathsToQueue = useCallback((paths: string[]) => {
    if (!paths || paths.length === 0) return;
    const validItems: FileItem[] = [];

    paths.forEach((pathStr) => {
      const ext = pathStr.split('.').pop()?.toLowerCase();
      if (ext === 'txt' || ext === 'md') {
        const filename = pathStr.split(/[/\\]/).pop() || pathStr;
        validItems.push({
          id: `${pathStr}-${Date.now()}-${Math.random()}`,
          path: pathStr,
          name: filename,
          size: 0,
          status: 'pending',
          currentChunk: 0,
          totalChunks: 0,
        });
      }
    });

    if (validItems.length > 0) {
      setFiles((prev) => {
        const existingPaths = new Set(prev.map((p) => p.path));
        const filteredNew = validItems.filter((item) => !existingPaths.has(item.path));
        return [...prev, ...filteredNew];
      });
      setGlobalError(null);
    } else {
      setGlobalError('対象外のファイル形式です。.txt または .md ファイルを選択してください。');
    }
  }, []);

  // Handle native Tauri 2 File Drag & Drop
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    async function setupDragDrop() {
      try {
        unlisten = await getCurrentWebviewWindow().onDragDropEvent((event) => {
          if (event.payload.type === 'over') {
            setIsHoveringDrop(true);
          } else if (event.payload.type === 'leave') {
            setIsHoveringDrop(false);
          } else if (event.payload.type === 'drop') {
            setIsHoveringDrop(false);
            if (event.payload.paths) {
              addPathsToQueue(event.payload.paths);
            }
          }
        });
      } catch (err) {
        console.error('Failed to attach drag drop listener:', err);
      }
    }

    setupDragDrop();

    return () => {
      if (unlisten) unlisten();
    };
  }, [addPathsToQueue]);

  // Listen to Tauri progress events
  useEffect(() => {
    const unlistenPromise = listen<FileProgressEvent>('translation-progress', (event) => {
      const payload = event.payload;

      setFiles((prevFiles) =>
        prevFiles.map((f) => {
          if (f.path === payload.file_path) {
            return {
              ...f,
              status: payload.status,
              currentChunk: payload.current_chunk,
              totalChunks: payload.total_chunks,
              errorMessage: payload.error_message || f.errorMessage,
              outputPath: payload.output_path || f.outputPath,
            };
          }
          return f;
        })
      );
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const handleRemoveFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleClearAll = () => {
    setFiles([]);
  };

  // Start Translation Process
  const handleStartTranslation = async () => {
    if (files.length === 0) {
      setGlobalError('翻訳するファイルを追加してください。');
      return;
    }
    if (!config.model) {
      setGlobalError('使用する Ollama モデルを選択してください。');
      return;
    }

    setGlobalError(null);
    setIsTranslating(true);
    setIsCancelling(false);

    // Reset previous execution status and errors
    setFiles((prevFiles) =>
      prevFiles.map((f) => ({
        ...f,
        status: 'pending',
        currentChunk: 0,
        totalChunks: 0,
        errorMessage: undefined,
        outputPath: undefined,
      }))
    );

    const pendingPaths = files.map((f) => f.path);

    try {
      await invoke('start_translation', {
        filePaths: pendingPaths,
        config: config,
      });

      // Send desktop notification when finished
      try {
        let granted = await isPermissionGranted();
        if (!granted) {
          const permission = await requestPermission();
          granted = permission === 'granted';
        }
        if (granted) {
          sendNotification({
            title: 'Ollama de Honyaku',
            body: `${pendingPaths.length} 件のファイルの翻訳処理が完了しました。`,
          });
        }
      } catch (notifyErr) {
        console.error('Failed to send desktop notification:', notifyErr);
      }
    } catch (err: any) {
      console.error('Translation error:', err);
      setGlobalError(typeof err === 'string' ? err : '翻訳処理中にエラーが発生しました。');
    } finally {
      setIsTranslating(false);
      setIsCancelling(false);
    }
  };

  // Cancel Translation
  const handleCancelTranslation = async () => {
    if (isCancelling) return;
    setIsCancelling(true);

    // Mark pending or processing files as 'cancelled' while keeping 'completed' intact
    setFiles((prevFiles) =>
      prevFiles.map((f) => {
        if (f.status === 'processing' || f.status === 'pending' || f.status === 'cancelling') {
          return {
            ...f,
            status: 'cancelled',
            errorMessage: undefined,
          };
        }
        return f;
      })
    );

    try {
      await invoke('cancel_translation');
    } catch (err) {
      console.error('Failed to cancel translation:', err);
    }
  };

  const completedCount = files.filter((f) => f.status === 'completed').length;
  const totalCount = files.length;
  const isAllFinished =
    totalCount > 0 &&
    files.every((f) => f.status === 'completed' || f.status === 'error' || f.status === 'cancelled');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Header
        isConnected={isConnected}
        modelCount={models.length}
        isChecking={isCheckingOllama}
        onRefresh={checkOllama}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto p-6 space-y-6">
        {globalError && (
          <div className="bg-rose-950/50 border border-rose-900/60 text-rose-300 px-4 py-3 rounded-2xl flex items-center space-x-3 shadow-lg shadow-rose-950/20">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
            <span className="text-xs font-medium">{globalError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: File Upload & List */}
          <div className="lg:col-span-7 space-y-5">
            <DropZone
              onFilePathsSelected={addPathsToQueue}
              disabled={isTranslating}
              isExternalHovering={isHoveringDrop}
            />
            <FileList
              files={files}
              onRemoveFile={handleRemoveFile}
              onClearAll={handleClearAll}
              disabled={isTranslating}
            />
          </div>

          {/* Right Column: Settings & Action Buttons */}
          <div className="lg:col-span-5 space-y-5">
            <SettingsPanel
              config={config}
              onChange={handleConfigChange}
              models={models}
              disabled={isTranslating}
              onOpenPromptModal={() => setIsPromptModalOpen(true)}
            />

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm space-y-3">
              {!isTranslating ? (
                <button
                  onClick={handleStartTranslation}
                  disabled={files.length === 0 || !isConnected || !config.model}
                  className="w-full bg-indigo-950/60 hover:bg-indigo-900/70 text-indigo-200 hover:text-white border border-indigo-800/60 font-medium py-3 px-4 rounded-xl flex items-center justify-center space-x-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current text-indigo-400" />
                  <span>翻訳開始 ({files.length} 件)</span>
                </button>
              ) : (
                <button
                  onClick={handleCancelTranslation}
                  disabled={isCancelling}
                  className={`w-full font-medium py-3 px-4 rounded-xl flex items-center justify-center space-x-2 transition-all ${isCancelling
                      ? 'bg-amber-950/40 text-amber-400/80 border border-amber-800/50 cursor-not-allowed opacity-60 pointer-events-none'
                      : 'bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 hover:text-rose-200 border border-rose-800/50 cursor-pointer'
                    }`}
                >
                  {isCancelling ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                      <span>中断処理中...</span>
                    </>
                  ) : (
                    <>
                      <Square className="w-4 h-4 fill-current text-rose-400" />
                      <span>翻訳処理を中断 (キャンセル)</span>
                    </>
                  )}
                </button>
              )}

              {/* Translation Summary Badge */}
              {isAllFinished && (
                <div className="p-3 bg-emerald-950/30 border border-emerald-900/40 rounded-xl flex items-center space-x-2 text-xs text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>
                    全処理完了: {completedCount} / {totalCount} ファイルが正常に翻訳されました。
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <PromptModal
        isOpen={isPromptModalOpen}
        onClose={() => setIsPromptModalOpen(false)}
        prompt={config.system_prompt || DEFAULT_SYSTEM_PROMPT}
        onSave={(newPrompt) => handleConfigChange({ ...config, system_prompt: newPrompt })}
      />
    </div>
  );
}

export default App;
