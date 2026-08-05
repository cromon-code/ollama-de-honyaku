import React from 'react';
import { FileText, Trash2, CheckCircle2, AlertTriangle, Loader2, XCircle, FolderCheck, FolderOpen } from 'lucide-react';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { FileItem } from '../types';

interface FileListProps {
  files: FileItem[];
  onRemoveFile: (id: string) => void;
  onClearAll: () => void;
  disabled?: boolean;
}

export const FileList: React.FC<FileListProps> = ({
  files,
  onRemoveFile,
  onClearAll,
  disabled,
}) => {
  if (files.length === 0) return null;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm space-y-3">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <FileText className="w-5 h-5 text-indigo-400" />
          <h2 className="text-slate-200 font-semibold text-sm">
            対象ファイル一覧 ({files.length} 件)
          </h2>
        </div>
        {!disabled && (
          <button
            onClick={onClearAll}
            className="text-xs text-slate-400 hover:text-rose-400 transition-colors flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" /> すべてクリア
          </button>
        )}
      </div>

      <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
        {files.map((file) => {
          const progressPercent =
            file.totalChunks > 0
              ? Math.min(100, Math.round((file.currentChunk / file.totalChunks) * 100))
              : 0;

          return (
            <div
              key={file.id}
              className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 flex flex-col space-y-2 relative group hover:border-slate-700 transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 overflow-hidden pr-2">
                  <div className="p-2 rounded-lg bg-slate-900 text-indigo-400 border border-slate-800 flex-shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-medium text-slate-200 truncate" title={file.path}>
                      {file.name}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 flex-shrink-0">
                  {/* Status Badge */}
                  {file.status === 'pending' && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                      待機中
                    </span>
                  )}
                  {file.status === 'processing' && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/60 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {progressPercent}% ({file.currentChunk}/{file.totalChunks})
                    </span>
                  )}
                  {file.status === 'cancelling' && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800/60 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                      中断処理中...
                    </span>
                  )}
                  {file.status === 'completed' && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      完了
                    </span>
                  )}
                  {file.status === 'error' && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800/60 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-rose-400" />
                      エラー
                    </span>
                  )}
                  {file.status === 'cancelled' && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800/60 flex items-center gap-1">
                      <XCircle className="w-3 h-3 text-amber-400" />
                      中断
                    </span>
                  )}

                  {!disabled && file.status !== 'processing' && file.status !== 'cancelling' && (
                    <button
                      onClick={() => onRemoveFile(file.id)}
                      className="p-1 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-900 transition-colors cursor-pointer"
                      title="リストから削除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Progress Bar for processing file */}
              {file.status === 'processing' && (
                <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-indigo-500 to-violet-500 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              )}

              {/* Output Path / Error details */}
              {file.outputPath && file.status === 'completed' && (
                <div className="text-[11px] text-emerald-400/90 bg-emerald-950/30 px-2.5 py-1.5 rounded-lg border border-emerald-900/40 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 truncate">
                    <FolderCheck className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" />
                    <span className="truncate">保存先: {file.outputPath}</span>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await revealItemInDir(file.outputPath!);
                      } catch (err) {
                        console.error('Failed to open folder:', err);
                      }
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300 hover:text-emerald-100 transition-colors flex-shrink-0 cursor-pointer font-medium"
                    title="エクスプローラーで保存先フォルダを開く"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>フォルダを開く</span>
                  </button>
                </div>
              )}
              {file.errorMessage && file.status !== 'cancelled' && (
                <div className="text-[11px] text-rose-400 bg-rose-950/30 px-2.5 py-1 rounded-lg border border-rose-900/40">
                  {file.errorMessage}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
