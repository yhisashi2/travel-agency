# Travel Agency データリポジトリ

このリポジトリは旅行計画アプリ「Travel Agency」のデータ置き場です。アプリ（スマホ/PC）と Claude Code の両方から同じファイルを編集します。

## ファイル
- `trips/<id>.json` … 旅行 1 件 = 1 ファイル。ファイル名（拡張子なし）と `id` を一致させる
- `schema/trip.schema.json` … JSON Schema（編集後は必ずこれに適合させる）

## データ構造の要点
- `days[]` は `startDate`〜`endDate` の各日 1 要素（`date` は `YYYY-MM-DD`）。期間を変えたら `days` も合わせる
- `days[].items[]` と `ideas[]`（日程未定の候補）は同じ Spot 形式
- Spot の必須は `id`（一意な英数字。新規は 8〜12 文字のランダム英数字）と `title`
- `category`: `sightseeing` | `food` | `lodging` | `transport` | `other`
- `time` / `endTime`: `HH:MM`（24 時間、ゼロ埋め）。items は時刻順に並べる
- `lat` / `lng`: 地図とルートに必要。分かる場合は必ず入れる（小数 4〜6 桁）
- `transportToNext`: 次の予定への移動手段 `walk` | `car` | `bike`（バイク） | `train` | `bus` | `ferry`（フェリー） | `flight`。フェリーに乗る港の Spot には `ferry` を入れる
- `cost` は数値、`currency` は ISO 4217（省略時は `baseCurrency`）。外貨は `rates` に「1 単位 = 何 baseCurrency」を入れる
- `done`: 旅行中にアプリで付ける完了フラグ。理由なく変更しない
- `updatedAt` は編集したら現在時刻（ISO 8601）に更新

## 編集ルール
- 既存 Spot の `id` は絶対に変えない（アプリ側の同期マージが id 単位のため）
- 予定を別の日へ移すときは Spot オブジェクトごと移動する（コピーして新 id にしない）
- JSON は 2 スペースインデント、末尾改行あり
- 1 回の依頼ごとに分かりやすいコミットメッセージでコミットし、プッシュする（アプリはプッシュ後に取り込む）
- 天気・営業時間など不確かな情報は `memo` に「要確認」と書く

## よくある依頼の例
- 「2 日目の午後に浅草寺を追加して」→ 該当日の items に時刻・座標付きで追加し、時刻順に並べ替え
- 「雨なので 3 日目の屋外予定を屋内に差し替えて」→ 屋外 Spot を `ideas` に移し、屋内候補を追加
- 「予算を集計して」→ items の cost を rates で換算して合計を回答（ファイルは変更しない）
