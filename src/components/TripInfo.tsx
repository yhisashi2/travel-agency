import { useState } from 'react';
import { loadSettings } from '../lib/github';
import type { Conflict } from '../lib/merge';
import { navigate } from '../lib/router';
import type { TripRecord } from '../lib/storage';
import { deleteTrip, exportTrip, resolveConflict } from '../lib/store';
import { setTripDates } from '../lib/tripOps';
import type { Spot, Trip } from '../types/trip';

export default function TripInfo({ rec, onChange }: { rec: TripRecord; onChange: (t: Trip) => void }) {
  const trip = rec.trip;
  const [start, setStart] = useState(trip.startDate);
  const [end, setEnd] = useState(trip.endDate);
  const gh = loadSettings();

  return (
    <div className="stack">
      {(rec.conflicts?.length ?? 0) > 0 && (
        <div className="card">
          <h3>⚠️ 競合の確認</h3>
          <p className="muted small">同じ項目が端末と GitHub（Claude Code など）の両方で変更されました。現在は端末側を採用しています。</p>
          {rec.conflicts!.map((c) => (
            <ConflictRow key={c.kind + c.id} c={c} onPick={(useRemote) => void resolveConflict(trip.id, c, useRemote)} />
          ))}
        </div>
      )}

      <div className="card form">
        <label>
          旅行名
          <input value={trip.title} onChange={(e) => onChange({ ...trip, title: e.target.value, updatedAt: new Date().toISOString() })} />
        </label>
        <div className="row gap">
          <label className="grow">
            出発日
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="grow">
            帰着日
            <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        {(start !== trip.startDate || end !== trip.endDate) && (
          <button
            className="btn primary"
            disabled={end < start}
            onClick={() => onChange(setTripDates(trip, start, end))}
          >
            期間を変更（はみ出した予定は「行きたい場所」へ移動）
          </button>
        )}
        <label>
          基準通貨
          <input
            value={trip.baseCurrency}
            maxLength={3}
            onChange={(e) => onChange({ ...trip, baseCurrency: e.target.value.toUpperCase(), updatedAt: new Date().toISOString() })}
          />
        </label>
        <label>
          メモ（持ち物・連絡先など）
          <textarea
            rows={6}
            value={trip.notes ?? ''}
            onChange={(e) => onChange({ ...trip, notes: e.target.value || undefined, updatedAt: new Date().toISOString() })}
          />
        </label>
      </div>

      <div className="card">
        <h3>データ</h3>
        <p className="muted small">
          {gh
            ? `GitHub: ${gh.owner}/${gh.repo} の ${gh.dir}/${trip.id}.json に保存${rec.dirty ? '（未送信あり）' : ''}`
            : 'GitHub 未接続（この端末のみに保存）。設定から接続できます。'}
        </p>
        <div className="row gap wrap">
          <button
            className="btn"
            onClick={() => {
              const blob = new Blob([exportTrip(trip)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `${trip.id}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            JSON を書き出し
          </button>
          <button
            className="btn danger"
            onClick={async () => {
              if (!confirm(`「${trip.title}」を削除しますか？${gh ? '\nGitHub 上のファイルも削除されます。' : ''}`)) return;
              await deleteTrip(trip.id);
              navigate();
            }}
          >
            旅行を削除
          </button>
        </div>
      </div>
    </div>
  );
}

function describe(v: unknown): string {
  if (v === null || v === undefined) return '（削除）';
  if (typeof v === 'object' && 'title' in (v as object)) {
    const s = v as Spot;
    return [s.time, s.title, s.cost != null ? `${s.cost}${s.currency ?? ''}` : '', s.memo].filter(Boolean).join(' / ');
  }
  return typeof v === 'string' ? v : JSON.stringify(v);
}

export function ConflictRow({ c, onPick }: { c: Conflict; onPick: (useRemote: boolean) => void }) {
  return (
    <div className="conflict">
      <strong>{c.label}</strong>
      <div className="small">📱 端末: {describe(c.local)}</div>
      <div className="small">☁️ GitHub: {describe(c.remote)}</div>
      <div className="row gap">
        <button className="btn sm" onClick={() => onPick(false)}>
          端末側を残す
        </button>
        <button className="btn sm" onClick={() => onPick(true)}>
          GitHub 側にする
        </button>
      </div>
    </div>
  );
}
