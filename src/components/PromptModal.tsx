import React, { useState, useEffect, useRef } from 'react';
import { X, RotateCcw, Check, Sparkles, HelpCircle } from 'lucide-react';
import { DEFAULT_SYSTEM_PROMPT } from '../constants/prompt';

interface PromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: string;
  onSave: (newPrompt: string) => void;
}

export const PromptModal: React.FC<PromptModalProps> = ({
  isOpen,
  onClose,
  prompt,
  onSave,
}) => {
  const [localPrompt, setLocalPrompt] = useState<string>(prompt || DEFAULT_SYSTEM_PROMPT);
  const [isSaved, setIsSaved] = useState<boolean>(true);
  const isInitialMount = useRef<boolean>(true);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // Sync external prompt when modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalPrompt(prompt || DEFAULT_SYSTEM_PROMPT);
      setIsSaved(true);
      isInitialMount.current = true;
    }
  }, [isOpen]);

  // Debounced auto-save effect (500ms)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    setIsSaved(false);
    const timer = setTimeout(() => {
      onSaveRef.current(localPrompt);
      setIsSaved(true);
    }, 500);

    return () => clearTimeout(timer);
  }, [localPrompt]);

  const handleReset = () => {
    setLocalPrompt(DEFAULT_SYSTEM_PROMPT);
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
    >
      <div
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-xl bg-indigo-950 text-indigo-400 border border-indigo-800/40">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">システムプロンプトの編集</h2>
              <p className="text-xs text-slate-400">Ollama API に送るシステムプロンプトを変更できます</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Auto-save status indicator */}
            <span className="text-xs flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800/60 border border-slate-700/50">
              {isSaved ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-medium">自動保存済み</span>
                </>
              ) : (
                <span className="text-amber-400 animate-pulse font-medium">保存中...</span>
              )}
            </span>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
              title="閉じる"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Helper variables box */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-300 space-y-1.5">
            <div className="flex items-center space-x-1.5 font-semibold text-indigo-400">
              <HelpCircle className="w-4 h-4" />
              <span>使用可能な変数プレースホルダー</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              プロンプト内に以下の変数を記述すると、設定画面で選択した言語名に自動置換されます：
            </p>
            <div className="flex flex-wrap gap-2 pt-1 font-mono text-[11px]">
              <span className="bg-slate-900 border border-slate-800 text-indigo-300 px-2 py-0.5 rounded">
                {"{source_lang}"} : 翻訳元言語 (例: English)
              </span>
              <span className="bg-slate-900 border border-slate-800 text-indigo-300 px-2 py-0.5 rounded">
                {"{target_lang}"} : 翻訳先言語 (例: Japanese)
              </span>
            </div>
          </div>

          {/* Prompt Textarea */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">システム指示文 (System Prompt)</label>
            <textarea
              rows={9}
              value={localPrompt}
              onChange={(e) => setLocalPrompt(e.target.value)}
              placeholder="システムプロンプトを入力してください..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors leading-relaxed resize-none"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900/80">
          <button
            onClick={handleReset}
            className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 px-3 py-2 rounded-xl transition-all cursor-pointer font-medium"
            title="標準プロンプトに復元"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>デフォルトに戻す</span>
          </button>

          <button
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs px-5 py-2 rounded-xl border border-slate-700/60 transition-all cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
