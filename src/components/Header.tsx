import React from 'react';
import { Languages, Loader2 } from 'lucide-react';

interface HeaderProps {
  isConnected: boolean;
  modelCount: number;
  isChecking: boolean;
  onRefresh: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isConnected,
  modelCount,
  isChecking,
  onRefresh,
}) => {
  return (
    <header className="border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md px-6 py-3 sticky top-0 z-20">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        {/* Left: Minimal text label without title duplication */}
        <div className="flex items-center space-x-2 text-xs text-slate-400 font-medium">
          <Languages className="w-4 h-4 text-indigo-400" />
          <span>ローカル Ollama ドキュメント翻訳</span>
        </div>

        {/* Right: Subtle status badge without heavy button styling */}
        <div
          onClick={onRefresh}
          className="flex items-center space-x-2 text-xs cursor-pointer select-none py-1 px-2.5 rounded-full transition-all hover:bg-slate-900/80"
          title="クリックで接続状態を再確認"
        >
          {isChecking ? (
            <span className="flex items-center gap-1.5 text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
              <span>確認中...</span>
            </span>
          ) : isConnected ? (
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Ollama 接続中 ({modelCount}モデル)</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-rose-400 font-medium">
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
              </span>
              <span>Ollama 未検出 (クリックで再試行)</span>
            </span>
          )}
        </div>
      </div>
    </header>
  );
};
