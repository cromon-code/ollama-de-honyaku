import React, { useState } from 'react';
import { UploadCloud, FileText, AlertCircle } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';

interface DropZoneProps {
  onFilePathsSelected: (paths: string[]) => void;
  disabled?: boolean;
  isExternalHovering?: boolean;
}

export const DropZone: React.FC<DropZoneProps> = ({
  onFilePathsSelected,
  disabled,
  isExternalHovering,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleClick = async () => {
    if (disabled) return;
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: 'Text & Markdown',
            extensions: ['txt', 'md'],
          },
        ],
      });

      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        if (paths.length > 0) {
          onFilePathsSelected(paths);
          setErrorMsg(null);
        }
      }
    } catch (err) {
      console.error('Failed to open file dialog:', err);
      setErrorMsg('ファイル選択ダイアログの起動に失敗しました。');
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  return (
    <div className="w-full">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center min-h-[180px] ${
          disabled
            ? 'opacity-50 cursor-not-allowed border-slate-800 bg-slate-900/20'
            : isDragOver || isExternalHovering
            ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10 scale-[1.01]'
            : 'border-slate-800 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-900/70'
        }`}
      >
        <div className="w-14 h-14 rounded-2xl bg-indigo-950/60 border border-indigo-500/20 flex items-center justify-center mb-3 text-indigo-400">
          <UploadCloud
            className={`w-8 h-8 ${isDragOver || isExternalHovering ? 'animate-bounce' : ''}`}
          />
        </div>

        <h3 className="text-base font-semibold text-slate-200 mb-1">
          翻訳するテキストファイルをドラッグ＆ドロップ
        </h3>
        <p className="text-xs text-slate-400 max-w-sm mb-3">
          または クリックしてファイルを選択（複数選択対応）
        </p>

        <div className="flex items-center space-x-2 text-[11px] text-slate-500 bg-slate-950/60 px-3 py-1 rounded-full border border-slate-800">
          <FileText className="w-3.5 h-3.5 text-indigo-400" />
          <span>対応形式: .txt / .md (UTF-8, UTF-8 BOM)</span>
        </div>
      </div>

      {errorMsg && (
        <div className="mt-3 flex items-center space-x-2 text-xs text-rose-400 bg-rose-950/40 border border-rose-900/50 px-4 py-2.5 rounded-xl animate-fade-in">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
};
