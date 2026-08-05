# Ollama de Honyaku

ローカルで動作する Ollama を利用して、テキストおよび Markdown ファイルを翻訳するデスクトップアプリケーションです。

## 機能

- 完全ローカル動作: 外部サーバーへのデータ送信を行わず、ローカルの Ollama インスタンスで処理します。
- 軽量・高速: Tauri 2 + Rust + React による軽量設計。
- 構造とフォーマットの維持:
  - 改行、段落、Markdown 構造、コードブロック、URL、改行コード (`CRLF` / `LF`)、BOM (`UTF-8 BOM`) を維持します。
  - 行数および文字数制限に基づく自動分割に対応。
  - 長大行は文末記号 (`。！？.!?`) や句読点 (`、、,；;`) で優先分割されます。
- 即時キャンセル: 中断時に Ollama へのリクエストを即時切断し、未完成ファイルを削除します。
- 自動リトライ: 通信エラー発生時、指定回数 (0〜2回) 自動で再試行します。
- システムプロンプトの編集: モーダルダイアログからシステムプロンプトの調整が可能です。
- ファイルアクセスと通知: 翻訳完了後、保存先フォルダを開く機能および OS 通知に対応しています。

## 動作要件

- OS: Windows
- Ollama: ローカル環境で Ollama サーバー (`http://127.0.0.1:11434`) が動作していること
- 翻訳に使用する Ollama モデルがダウンロード済みであること

## 開発・ビルド

```bash
# パッケージインストール
npm install

# 開発モード起動
npm tauri dev

# ビルド
npm tauri build
```

## 設定項目

| 項目 | 説明 | 初期値 |
|---|---|---|
| Ollama API URL | API 接続先 URL | `http://127.0.0.1:11434` |
| 使用モデル | Ollama から取得したモデル | APIより取得 |
| 翻訳元 / 翻訳先言語 | 自動判定 (Auto) / 言語指定 | `Auto` / `Japanese` |
| 翻訳粒度 | 1チャンクの最大非空行数 | `1` |
| 最大チャンクサイズ | 1チャンクの最大文字数 | `3000` |
| 自動リトライ回数 | 通信エラー時の再試行回数 | `0` |
| Temperature | 生成の温度パラメータ | `0.3` |


## 翻訳サンプル

qwen:2.5:latest(7b) をWindowsPCで使用

### 原文

`````md
# Ollama de Honyaku Test

Ollama de Honyaku is a fast and secure local document translator built with Tauri 2 and Rust.

> Note: Translation quality and speed depend on the selected local LLM model and hardware performance.

## Key Protection Features

- **Code Block Bypass**: Whole blocks surrounded by ```bash ... ``` are completely bypassed from LLM translation.
- **Inline Code Protection**: Tokens like `test`, `pnpm tauri dev`, and `ollama run gemma2` are safely masked with placeholders.
- **URL Protection**: Links like https://github.com/ollama/ollama remain completely untouched.

### Nested Markdown Sample (4 Backticks)

````markdown
# Sample Markdown Guide

This section is an outer Markdown guide wrapped in 4 backticks.

```bash
# Internal code block (protected)
ollama run gemma2
```

The header and text above should be translated, while the internal bash command remains intact.

````

Run `npm tauri dev` to test the application locally!

`````

### 翻訳結果

`````md
# オラマデホンヤクテスト

Ollama de HonyakuはTauri 2とRustで構築された高速かつ安全なローカルドキュメント翻訳ソフトウェアです。

> 注：翻訳の品質と速度は、選択されたローカルLLMモデルおよびハードウェア性能に依存します。

## キー保護機能

- **コードブロックバイパス**: ```bash ... ``` で囲まれた全ブロックはLLM翻訳から完全に除外されます。
- **インラインコード保護**: `test`, `pnpm tauri dev`, 以及 `ollama run gemma2` 这样的标记被安全地用占位符掩护了。
- **URL Protection**: リンク如きhttps://github.com/ollama/ollamaは完全に unchanged に保たれます。

### ネストされたマークダウンサンプル（4つのバックティック）

```markdown
Strict Guidelines:
- Return ONLY the translation result. No explanations, intro/outro, or quote wrappers.
- Preserve original line breaks, markdown structure, code blocks, URLs, and formatting.
- Do NOT translate or alter placeholders in the format `__PROTECTED_N__`.
- Maintain style and tone accurately.
```
# サンプル マークダウンガイド

このセクションは、4つのバックティックで囲まれた外側のMarkdownガイドです。

```bash
# Internal code block (protected)
ollama run gemma2
```

Strict Guidelines:
- Return ONLY the translation result. No explanations, intro/outro, or quote wrappers.
- 行頭と上記のテキストを翻訳し、内部のbashコマンドはそのままに保つ。
- 原文の改行やマークダウン構造、コードブロック、URL、およびフォーマットを保持する。
- `__PROTECTED_N__` 形式的なプレースホルダーは翻訳せずに残す。
- 精度を保ちながらスタイルとトーンも維持する。

```

ローカルでアプリケーションをテストするには `npm tauri dev` を実行してください！

`````