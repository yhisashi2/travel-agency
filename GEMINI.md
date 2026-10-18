# Antigravity 開発ガイド & サブ設計ガイドライン

このリポジトリは旅行計画・ルートマップ作成アプリ「Travel Agency」のソースコードです。
メイン設計・アーキテクチャ設計は **Claude Code** が主導しており、**Antigravity はサブ設計・実装支援・検証パートナー** として協調動作します。

---

## 1. Antigravity の役割と設計方針（サブ設計者としての行動規範）

1. **メイン設計（Claude Code）との整合性を最優先**:
   - すでに確立されているアーキテクチャ方針（オフラインファースト、IndexedDB、Zod スキーマ、3-way マージ、GitHub API 直接同期、PWA など）を尊重してください。
   - 独断で根本的なアーキテクチャの変更（状態管理ライブラリの差し替え、UIフレームワークの変更、データスキーマの破壊的変更など）を行わないでください。
2. **サブ設計者としての担当領域**:
   - **機能設計の壁打ち・ブラッシュアップ**: Claude Code が設計した機能や仕様のレビュー、エッジケースの洗い出し、改善案の提案。
   - **機能実装・UI改善**: 既存コードの設計思想に沿ったコンポーネント追加や機能拡張。
   - **品質担保・テスト**: Vitest を用いたユニットテスト・ロジックテストの拡充、回帰防止。
   - **不具合調査・修正**: 実行時エラーやレイアウト崩れ、同期エラー等の原因究明とピンポイント修正。
   - **ドキュメント整備**: 型定義コメント、README、データリポジトリ向けガイドラインの更新。
3. **重要な設計判断を行う場合**:
   - Claude Code の設計意図と競合する可能性がある大きな変更は、事前にユーザーへ確認・提案を行ってください。

---

## 2. プロジェクト概要 & 技術スタック

- **フレームワーク**: React 18 (`src/App.tsx`, `src/routes/`, `src/components/`)
- **言語**: TypeScript (strict mode)
- **ビルドツール**: Vite + `vite-plugin-pwa`
- **ストレージ**: `idb` (IndexedDB) によるローカル即時保存 (`src/lib/storage.ts`)
- **外部データ同期**: GitHub REST API (Contents API) を用いた非公開データリポジトリとの同期 (`src/lib/github.ts`)
- **データマージ**: 予定 ID 単位の 3-way マージアルゴリズム (`src/lib/merge.ts`)
- **地図・ルート**: Leaflet + `react-leaflet` + OpenStreetMap + OSRM (ルート検索) (`src/components/MapView.tsx`, `src/lib/routing.ts`)
- **天気**: Open-Meteo API (16日間予報) (`src/lib/weather.ts`, `src/lib/useWeather.ts`)
- **ジオコーディング**: Nominatim (OSM) (`src/lib/geocode.ts`)
- **バリデーション**: Zod (`src/types/trip.ts`, `src/types/place.ts`)
- **テスト**: Vitest (`src/lib/*.test.ts`)
- **スタイル**: `src/styles.css`（モダンでシンプルなレスポンシブ CSS）

---

## 3. 主要ファイル構成

```
src/
├── types/
│   ├── trip.ts          # 旅行データ (Trip, Day, Spot) の Zod スキーマ & 型
│   └── place.ts         # 行きたい所 (Place, Visit) の Zod スキーマ & 型
├── lib/
│   ├── storage.ts       # IndexedDB ラッパー
│   ├── store.ts         # 全体状態管理 & GitHub 自動同期オーケストレーション
│   ├── github.ts        # GitHub Contents API との送受信
│   ├── merge.ts         # 3-way マージ（競合解決ロジック）
│   ├── tripOps.ts       # 予定の追加・並べ替え・移動・日程変更
│   ├── places.ts        # 行きたい所リストの CRUD・評価
│   ├── routing.ts       # OSRM ルート検索
│   ├── weather.ts       # Open-Meteo 天気取得 & アラート判定
│   └── router.ts        # ハッシュベースの軽量ルーター
├── routes/
│   ├── TripList.tsx     # 旅行一覧画面（Claude リンク含む）
│   ├── TripDetail.tsx   # 旅行詳細（日程・地図・予算・アイデアタブ）
│   ├── Places.tsx       # 行きたい所リスト画面
│   └── Settings.tsx     # GitHub 連携・各種設定画面
└── components/          # 各画面部品（Timeline, Map, Budget, Editor 等）
```

---

## 4. 開発・検証コマンド

変更作業を行った際は、必ず以下のコマンドを実行して正常に通過することを確認してください。

```bash
# テストの実行（必須）
npm test

# 型チェック & プロダクションビルド（必須）
npm run build

# スキーマ再生成（src/types/trip.ts や place.ts を変更した場合のみ）
npm run schema
```

---

## 5. コーディング規約 & 注意事項

- **型安全性の徹底**: `any` の使用は避け、厳格な型定義を行ってください。
- **ID の永続性**: Spot や Place の `id` はマージや同期のキーとなるため、更新時に安易に変更・再生成しないでください。
- **オフライン動作の維持**: ネットワーク接続がなくてもローカル（IndexedDB）で動作することを常に前提としてください。
- **既存コードのコメント・ドキュメントの維持**: 意図のある既存コメントを勝手に削除しないでください。
