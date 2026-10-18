# Travel Agency ✈️ 開発ガイドライン (Claude Code 用)

このリポジトリは旅行計画・ルートマップ作成 Web アプリ（PWA）「Travel Agency」の本体ソースコードです。
メイン設計・実装は **Claude Code** が担当し、**Antigravity (Google)** がサブ設計・テスト・品質支援として協調して開発を進めています。

---

## 開発・検証コマンド

```bash
# 開発サーバー起動
npm run dev

# ユニットテスト実行 (Vitest)
npm test

# 型チェック & プロダクションビルド
npm run build

# Zod から JSON Schema の再生成 (types 変更時)
npm run schema
```

---

## アーキテクチャの要点

1. **オフラインファースト (IndexedDB)**:
   - 全てのデータ操作は `src/lib/storage.ts` を経由してローカル IndexedDB に即時保存されます。
   - オフライン時でも全機能（地図キャッシュ、タイムライン編集、予算管理）が利用可能です。
2. **GitHub による外部同期**:
   - `src/lib/github.ts` で GitHub Contents API を直接呼び出し、非公開データリポジトリ（`travel-agency-data`）と同期します。
   - オンライン時に自動コミットされます。
3. **3-way マージアルゴリズム**:
   - `src/lib/merge.ts` で Spot（予定）の `id` 単位でベース・ローカル・リモートの 3-way マージを行います。
   - Spot の `id` はマージの整合性に不可欠なため、一度発行した `id` は絶対に変更しないでください。
4. **外部サービス連携**:
   - 全て API キー不要の公開サービスを利用（Leaflet / OpenStreetMap / Open-Meteo / Nominatim / OSRM）。

---

## Antigravity との協調方針

- **メイン設計者**: Claude Code
- **サブ設計者**: Antigravity
  - Antigravity はテスト拡充、エッジケース検証、リファクタリング提案、バグ修正などをサポートします。
  - Antigravity 用の設定・ガイドラインは `GEMINI.md` に記載されています。
  - 大規模な仕様変更やアーキテクチャ変更を行う場合は、`GEMINI.md` にも反映して整合性を保ってください。
