import React from 'react';
import { Settings2, Cpu, Globe, Sliders, Layers, Maximize2, ShieldAlert, RotateCcw, FileEdit } from 'lucide-react';
import { TranslationConfig } from '../types';

interface SettingsPanelProps {
  config: TranslationConfig;
  onChange: (newConfig: TranslationConfig) => void;
  models: string[];
  disabled?: boolean;
  onOpenPromptModal: () => void;
}

const COMMON_LANGUAGES = [
  { label: '日本語 (Japanese)', value: 'Japanese' },
  { label: '英語 (English)', value: 'English' },
  { label: '中国語 (Chinese)', value: 'Chinese' },
  { label: '韓国語 (Korean)', value: 'Korean' },
  { label: 'フランス語 (French)', value: 'French' },
  { label: 'ドイツ語 (German)', value: 'German' },
  { label: 'スペイン語 (Spanish)', value: 'Spanish' },
];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  config,
  onChange,
  models,
  disabled,
  onOpenPromptModal,
}) => {
  const handleChange = <K extends keyof TranslationConfig>(
    key: K,
    value: TranslationConfig[K]
  ) => {
    onChange({
      ...config,
      [key]: value,
    });
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2 text-slate-200 font-semibold">
          <Settings2 className="w-5 h-5 text-indigo-400" />
          <h2>翻訳設定</h2>
        </div>
        <button
          onClick={onOpenPromptModal}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 hover:text-indigo-200 border border-indigo-800/60 text-xs font-medium transition-all cursor-pointer"
          title="システムプロンプトの閲覧・編集"
        >
          <FileEdit className="w-3.5 h-3.5 text-indigo-400" />
          <span>プロンプト編集</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Ollama URL */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-indigo-400" /> Ollama API URL
          </label>
          <input
            type="text"
            value={config.ollama_url}
            onChange={(e) => handleChange('ollama_url', e.target.value)}
            disabled={disabled}
            placeholder="http://127.0.0.1:11434"
            className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
          />
        </div>

        {/* Model Selection */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" /> 使用モデル
          </label>
          {models.length > 0 ? (
            <select
              value={config.model}
              onChange={(e) => handleChange('model', e.target.value)}
              disabled={disabled}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-950/30 border border-amber-900/40 rounded-xl px-3 py-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span>利用可能なモデルが見つかりません</span>
            </div>
          )}
        </div>

        {/* Source Language */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300">翻訳元言語</label>
          <input
            type="text"
            value={config.source_lang}
            onChange={(e) => handleChange('source_lang', e.target.value)}
            disabled={disabled}
            placeholder="Auto (自動判定)"
            className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
          />
        </div>

        {/* Target Language */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300">翻訳先言語</label>
          <select
            value={config.target_lang}
            onChange={(e) => handleChange('target_lang', e.target.value)}
            disabled={disabled}
            className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
          >
            {COMMON_LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>

        {/* Granularity */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" /> 翻訳粒度
            </span>
            <span className="text-indigo-400 font-mono font-bold text-xs">
              {config.granularity} 行
            </span>
          </label>
          <input
            type="number"
            min={1}
            max={100}
            value={config.granularity}
            onChange={(e) =>
              handleChange('granularity', Math.max(1, parseInt(e.target.value) || 1))
            }
            disabled={disabled}
            className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
          />
        </div>

        {/* Max Chunk Size */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Maximize2 className="w-3.5 h-3.5 text-indigo-400" /> 最大チャンクサイズ
            </span>
            <span className="text-indigo-400 font-mono font-bold text-xs">
              {config.max_chunk_size} 文字
            </span>
          </label>
          <input
            type="number"
            step={500}
            min={500}
            max={20000}
            value={config.max_chunk_size}
            onChange={(e) =>
              handleChange(
                'max_chunk_size',
                Math.max(100, parseInt(e.target.value) || 3000)
              )
            }
            disabled={disabled}
            className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
          />
        </div>

        {/* Retry Count */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <RotateCcw className="w-3.5 h-3.5 text-indigo-400" /> 自動リトライ回数
            </span>
          </label>
          <select
            value={config.retry_count ?? 0}
            onChange={(e) => handleChange('retry_count', parseInt(e.target.value) || 0)}
            disabled={disabled}
            className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
          >
            <option value={0}>0 回 (なし)</option>
            <option value={1}>1 回</option>
            <option value={2}>2 回</option>
          </select>
        </div>

        {/* Temperature */}
        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" /> Temperature
            </span>
            <span className="text-indigo-400 font-mono font-bold text-xs">
              {config.temperature}
            </span>
          </label>
          <input
            type="range"
            min={0.0}
            max={1.0}
            step={0.05}
            value={config.temperature}
            onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
            disabled={disabled}
            className="w-full accent-indigo-500 cursor-pointer disabled:opacity-50"
          />
        </div>
      </div>
    </div>
  );
};
