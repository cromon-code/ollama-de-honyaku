export interface TranslationConfig {
  ollama_url: string;
  model: string;
  temperature: number;
  source_lang: string;
  target_lang: string;
  granularity: number;
  max_chunk_size: number;
  retry_count: number;
  system_prompt?: string;
}

export type FileStatus = 'pending' | 'processing' | 'cancelling' | 'completed' | 'error' | 'cancelled';

export interface FileItem {
  id: string;
  path: string;
  name: string;
  size: number;
  status: FileStatus;
  currentChunk: number;
  totalChunks: number;
  errorMessage?: string;
  outputPath?: string;
}

export interface FileProgressEvent {
  file_path: string;
  status: FileStatus;
  current_chunk: number;
  total_chunks: number;
  error_message?: string;
  output_path?: string;
}
