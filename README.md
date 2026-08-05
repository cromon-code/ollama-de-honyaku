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

`````md# Ollama de Honyaku Test

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
# オルマハーニャクテスト

Ollama de HonyakuはTauri 2とRustで構築された高速かつ安全なローカルドキュメント翻訳ソフトウェアです。

> 注：翻訳の品質と速度は、選択されたローカルLLMモデルやハードウェアの性能に依存します。

## キー保護機能

- **コードブロックバイパス**: ```bash ... ``` で囲まれた全ブロックは、LLM翻訳から完全に除外されます。
- **インラインコード保護**: テキスト内の`test`、`pnpm tauri dev`、`ollama run gemma2`などのトークンは、プレースホルダーで置き換えられています。
- **URL保護**: リンク_like https://github.com/ollama/ollama は完全に変更されません。

### ネストされたマークダウンサンプル（4つのバックティック）

````markdown
# マークダウン GUIDE

このセクションは4つのバックティックで囲まれた外部Markdownガイドです。

```bash
# Internal code block (protected)
ollama run gemma2
```

上のヘッダーとテキストを日本語に翻訳し、内部のbashコマンドはそのままにします。

````

ローカルでアプリケーションをテストするには `npm tauri dev` を実行してください！

`````