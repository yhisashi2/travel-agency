import { useRef, useState } from 'react';
import SyncBadge from '../components/SyncBadge';
import { loadClaudeLink } from '../lib/claudeLink';
import { loadSettings } from '../lib/github';
import { navigate } from '../lib/router';
import { deleteTrip, importTrip, saveTrip, useStore } from '../lib/store';
import { createTrip, formatDate, todayLocal } from '../lib/tripOps';
import { sampleTrip } from '../sample';

export default function TripList() {
  const records = useStore((s) => s.records);
  const trips = Object.values(records)
    .filter((r) => !r.deleted)
    .map((r) => r.trip)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const today = todayLocal();

  return (
    <div className="page">
      <header className="topbar">
        <h1>✈️ Travel Agency</h1>
        <div className="row">
          <SyncBadge />
          <button className="icon-btn" aria-label="行きたい所" onClick={() => navigate('places')}>
            📍
          </button>
          <button className="icon-btn" aria-label="設定" onClick={() => navigate('settings')}>
            ⚙️
          </button>
        </div>
      </header>

      <main className="content">
        {trips.length === 0 && !creating && (
          <div className="empty">
            <p>まだ旅行がありません。</p>
            <button className="btn" onClick={() => void saveTrip(sampleTrip()).then(() => undefined)}>
              サンプル旅行を追加
            </button>
          </div>
        )}

        <ul className="trip-list">
          {trips.map((t) => {
            const ongoing = t.startDate <= today && today <= t.endDate;
            const count = t.days.reduce((n, d) => n + d.items.length, 0);
            return (
              <li key={t.id} className="trip-row">
                <button className="trip-card" onClick={() => navigate('trip', t.id)}>
                  <div className="trip-card-title">
                    {t.title} {ongoing && <span className="pill">旅行中</span>}
                  </div>
                  <div className="muted small">
                    {formatDate(t.startDate)} 〜 {formatDate(t.endDate)}・{t.days.length}日間・{count}件の予定
                  </div>
                </button>
                <button
                  className="trip-delete"
                  aria-label={`「${t.title}」を削除`}
                  onClick={() => {
                    const gh = loadSettings();
                    if (!confirm(`「${t.title}」を削除しますか？${gh ? '\nGitHub 上のファイルも削除されます。' : ''}\nこの操作は元に戻せません。`)) return;
                    void deleteTrip(t.id);
                  }}
                >
                  🗑
                </button>
              </li>
            );
          })}
        </ul>

        <a className="claude-link" href={loadClaudeLink()} target="_blank" rel="noreferrer">
          <span className="claude-link-icon">✳️</span>
          <span className="grow">
            <strong>Claude Code でプランを相談・編集</strong>
            <span className="muted small">travel-agency-data のセッションを開く</span>
          </span>
          <span className="muted">↗</span>
        </a>

        {creating ? (
          <NewTripForm onDone={() => setCreating(false)} />
        ) : (
          <div className="row gap">
            <button className="btn primary grow" onClick={() => setCreating(true)}>
              ＋ 新しい旅行
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              JSON 読込
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const t = await importTrip(await f.text());
                  navigate('trip', t.id);
                } catch (err) {
                  alert('読み込めませんでした: ' + (err as Error).message);
                }
                e.target.value = '';
              }}
            />
          </div>
        )}
      </main>
    </div>
  );
}

function NewTripForm({ onDone }: { onDone: () => void }) {
  const today = todayLocal();
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [currency, setCurrency] = useState('JPY');
  return (
    <form
      className="card form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim() || end < start) return;
        const t = createTrip(title.trim(), start, end, currency.toUpperCase());
        await saveTrip(t);
        onDone();
        navigate('trip', t.id);
      }}
    >
      <label>
        旅行名
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 京都 2泊3日" autoFocus required />
      </label>
      <div className="row gap">
        <label className="grow">
          出発日
          <input type="date" value={start} onChange={(e) => (setStart(e.target.value), end < e.target.value && setEnd(e.target.value))} required />
        </label>
        <label className="grow">
          帰着日
          <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required />
        </label>
      </div>
      <label>
        基準通貨
        <input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} placeholder="JPY" />
      </label>
      <div className="row gap">
        <button type="button" className="btn grow" onClick={onDone}>
          キャンセル
        </button>
        <button className="btn primary grow">作成</button>
      </div>
    </form>
  );
}
