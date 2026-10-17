# Travel Agency ✈️

旅行の計画とルートマップを作るスマホ向け Web アプリ（PWA）。ホーム画面に追加すると単独アプリのように使え、旅行中でもオフラインで閲覧・編集できます。プランは GitHub のリポジトリに JSON で保存されるため、スマホ・PC・Claude Code（web 版を含む）のどこからでも同じプランを編集できます。

## 主な機能
- **日程**: 日ごとのタイムライン、時刻順の自動整列、↑↓ で並べ替え、別の日や「行きたい場所（候補）」へ移動、完了チェック
- **地図**: Leaflet + OpenStreetMap。番号付きピン、徒歩・車の道なりルート線（電車・飛行機は点線の直線）、現在地、次の予定までの距離、長押しでその場所に予定を追加
- **ナビ**: 各予定から Google マップの経路案内を起動
- **天気**: Open-Meteo の 16 日予報を各日に表示。雨・猛暑・氷点下のときは注意を表示
- **行きたい所リスト**: 旅行に関係なく行きたい所をためておける全体リスト（📍）。行った場所は訪問日とお気に入り度（★1〜3）を記録。旅行中に予定を完了にすると自動で記録され、旅行への候補追加や Claude Code のプラン作成では未訪問の場所を優先
- **予算・メモ**: 費用・予約番号・URL・メモ。カテゴリ別/日別集計、外貨は換算レートで合算
- **同期**: 端末内（IndexedDB）に即保存 → オンライン時に GitHub へ自動コミット。別の場所（Claude Code など）での変更は予定単位で自動マージし、同じ予定の競合だけ選択を求めます

API キーは不要です（OSM / Open-Meteo / Nominatim / 公開 OSRM を利用）。

## セットアップ

### 1. アプリを GitHub Pages に公開
1. このフォルダを GitHub のリポジトリ（例: `travel-agency`）に push
2. リポジトリの Settings → Pages → Source を **GitHub Actions** に設定
3. `main` へ push すると `.github/workflows/deploy.yml` がテスト・ビルドして `https://<ユーザー名>.github.io/travel-agency/` に公開

### 2. データ用リポジトリを作る（非公開推奨）
1. 非公開リポジトリ `travel-agency-data` を作成
2. [`data-template/`](data-template) の中身（`CLAUDE.md`, `places.json`, `schema/`, `trips/`）をそのリポジトリのルートにコピーして push
3. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** で、
   対象を `travel-agency-data` のみ、権限 **Contents: Read and write** のトークンを発行

### 3. スマホで使う
1. 公開した URL を開き、⚙️ 設定でオーナー名・リポジトリ名・トークンを入力して「接続」
2. iPhone は Safari の「共有 → ホーム画面に追加」、Android は Chrome の「アプリをインストール」

### Claude Code から編集する
`travel-agency-data` を Claude Code（web 版なら claude.ai/code で GitHub リポジトリを選択）で開き、
「2 日目の午後に浅草寺を追加して」のように頼みます。`CLAUDE.md` に形式と編集ルールが書いてあるので、
Claude はスキーマに沿って `trips/*.json` を編集・コミットします。アプリは次に開いた時（またはフォーカス時）に取り込みます。

## 開発

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

- `npm run schema` … `src/types/trip.ts`（zod）から `data-template/schema/trip.schema.json` とサンプルを再生成
- アイコンの元絵は `public/icon.svg`（PNG は正方形背景・縮小版をここから書き出したもの）

### 構成
| パス | 内容 |
| --- | --- |
| `src/types/trip.ts` | データ形式（zod スキーマ） |
| `src/lib/tripOps.ts` | 予定の追加・移動・期間変更など |
| `src/lib/store.ts` | 状態管理と GitHub 同期 |
| `src/lib/merge.ts` | 3-way マージ（予定 ID 単位） |
| `src/lib/github.ts` | GitHub Contents API |
| `src/lib/weather.ts` / `geocode.ts` / `routing.ts` / `navigation.ts` | 天気・地名検索・ルート線・Google マップ連携 |
| `src/components/` | 日程・地図・予算・編集シートなどの画面部品 |
