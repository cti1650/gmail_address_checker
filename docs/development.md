# 開発ガイド

## 必要な環境

- Node.js 25.2.1 以上（Volta で管理）
- npm 11.6.4 以上

## セットアップと開発

```bash
# 依存関係のインストール
npm install

# 開発モード（自動リロード）
npm run dev
npm run dev:chrome
npm run dev:firefox
```

## テスト・型チェック

```bash
npm run test:run     # テストを 1 回実行
npm test             # ウォッチモード
npm run typecheck    # 型チェック
```

Gmail の画面を使うテストは、[test/fixtures/gmail.ts](../test/fixtures/gmail.ts) の再現データで DOM を組み立てます。実際の Gmail の画面から、拡張機能が依存する属性だけを残して簡略化したものです。

```ts
import { composeWindow, receivedMessage, render } from '../fixtures/gmail'

// 作成画面（最小化・全画面表示・件名入り・返信欄なども引数で再現できる）
render(composeWindow({ to: ['a@partner.com'], body: '資料を送ります', minimized: true }))

// 閲覧画面で開いた受信メール
render(receivedMessage({ from: 'sender@example.com', links: [{ href: 'https://evil.test/', text: 'https://example.com' }] }))
```

Gmail の画面構造が変わったときは、まずこの再現データを実際の構造に合わせて直し、テストが落ちることを確かめてから実装を直してください。

## ビルド・配布

```bash
npm run build:chrome    # .output/chrome-mv3
npm run build:firefox   # .output/firefox-mv2

# 配布用 ZIP（.output/ に出力）
npm run zip:chrome
npm run zip:firefox
```

## ローカルへのインストール

**Chrome**

1. `npm run build:chrome` でビルド
2. `chrome://extensions/` を開き、「デベロッパーモード」を有効にする
3. 「パッケージ化されていない拡張機能を読み込む」で `.output/chrome-mv3` を指定

**Firefox**

1. `npm run build:firefox` でビルド
2. `about:debugging#/runtime/this-firefox` を開く
3. 「一時的なアドオンを読み込む」で `.output/firefox-mv2/manifest.json` を指定

## 技術スタック

- フレームワーク: WXT（Manifest V3）
- 言語: TypeScript
- ストレージ: @wxt-dev/storage（Chrome Storage API）
- ドメイン解析: tldts（Public Suffix List ベースの eTLD+1 判定）
- テスト: Vitest + happy-dom

## 構成

```mermaid
flowchart LR
    subgraph Popup[設定ポップアップ]
        P[entrypoints/popup]
    end
    subgraph Content["コンテンツスクリプト (mail.google.com)"]
        C[entrypoints/content.ts] --> SC[features/send-check.ts]
        C --> LC[features/link-check.ts]
        SC --> E[utils/email.ts]
        SC --> UI[utils/ui.ts]
        LC --> L[utils/link-check.ts]
    end
    subgraph Storage[chrome.storage]
        LS[("local / sync<br/>ユーザー設定")]
        MS[("managed<br/>組織ポリシー")]
    end
    P -- 読み書き --> LS
    P -- 読み取り --> MS
    SC -- 読み取り --> LS
    SC -- 読み取り --> MS
    LC -- 読み取り --> LS
    LC -- 読み取り --> MS
```

設定の読み書きは [utils/storage.ts](../utils/storage.ts) に集約しています。判定処理は `getEffectiveSettings()` を通して設定を読み、組織ポリシーで配布された項目はユーザー設定より優先されます。

### ディレクトリ構成

```
entrypoints/
  content.ts          # コンテンツスクリプトのエントリ (薄いオーケストレーター)
  popup/              # 設定ポップアップ
features/
  send-check.ts       # 送信時チェック機能 (コンポーズ画面監視 + 警告UI)
  link-check.ts       # 受信時リンクチェック機能 (DOM スキャン + ツールチップ)
utils/
  link-check.ts       # リンク判定の純関数ロジック (tldts ベース)
  email.ts            # 送信側のドメイン抽出ロジック
  ui.ts               # 共通 UI ヘルパー
  storage.ts          # 設定の永続化定義 (組織ポリシー配布分の読み込みを含む)
  managed-policy.ts   # 組織ポリシーの検証と、ポリシー優先の設定値の解決 (純関数)
  scan-scheduler.ts   # DOM 変更で走るチェックの間引きと同時実行防止
  company-domains.ts  # ポリシー配布分とユーザー設定分の社内ドメイン合算
public/
  managed_schema.json # 組織ポリシー (chrome.storage.managed) のスキーマ
test/
  fixtures/gmail.ts   # Gmail の DOM の再現データ
  features/           # 送信時チェック・受信時チェックを実際に通すテスト
  utils/              # 判定ロジックのテスト
```

## 実装上の工夫

- **チェックの間引き**: DOM 変更のたびに走るチェックは [utils/scan-scheduler.ts](../utils/scan-scheduler.ts) で 0.3 秒に 1 回までにまとめ、送信時チェックとリンクチェックを別々にスケジュールする。実行中のチェックとは重ならないため、古い判定結果で表示が上書きされない
- **設定のキャッシュ**: 判定に使う設定は `getEffectiveSettings()` でまとめて読み込んでキャッシュし、`storage.onChanged`（組織ポリシーの変更を含む）で破棄する
- **状態の一元管理**: 送信時チェックの表示状態は UIState オブジェクトで管理し、状態が変わったときだけ UI を更新する
- **再判定の抑制**: チェック済みのリンクには `data-gmail-link-checked` 属性にチェック時の `href` を記録し、`href` が変わったときだけ再判定する
- **ドメインの比較**: 社内ドメインと宛先のドメインは小文字にそろえて比較する
- **Gmail の DOM への依存**: `name`、`data-compose-id`、`data-message-id`、`email`、`role`、`contenteditable` などの属性だけを使う。`.a3s` のような短縮クラス名はビルドごとに変わりうるため使わない
- **作成画面ごとの判定**: 宛先欄から作成画面の範囲（`[data-compose-id]`、なければフォームの親要素）をたどり、範囲ごとに宛先・本文を取り出して判定する
- **リソースの自動解放**: `setTimeout` / `setInterval` / `addEventListener` / MutationObserver はすべて WXT の `ContentScriptContext` 経由で登録し、拡張機能のリロード時に自動で解放する
- **ツールチップの配置**: `position: fixed` で `document.body` 直下に置き、Gmail の `overflow: hidden` なコンテナで切れないようにしている
- **エラー処理**: 拡張機能の更新時に起きる "Extension context invalidated" に対応
