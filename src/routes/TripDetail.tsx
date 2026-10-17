import { useState } from 'react';
import BudgetView from '../components/BudgetView';
import DayTimeline from '../components/DayTimeline';
import MapView from '../components/MapView';
import SpotEditor, { type EditTarget } from '../components/SpotEditor';
import SyncBadge from '../components/SyncBadge';
import TripInfo from '../components/TripInfo';
import { navigate } from '../lib/router';
import { saveTrip, useStore } from '../lib/store';
import { todayLocal } from '../lib/tripOps';
import { useTripWeather } from '../lib/useWeather';
import type { Trip } from '../types/trip';

const TABS = [
  { id: 'plan', label: '日程', icon: '🗓️' },
  { id: 'map', label: '地図', icon: '🗺️' },
  { id: 'budget', label: '予算', icon: '💰' },
  { id: 'info', label: '情報', icon: 'ℹ️' },
];

export default function TripDetail({ id, tab }: { id: string; tab: string }) {
  const rec = useStore((s) => s.records[id]);
  const trip = rec && !rec.deleted ? rec.trip : undefined;
  const weather = useTripWeather(trip);
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [mapDate, setMapDate] = useState<string | null>(null);

  if (!trip) {
    return (
      <div className="page">
        <div className="center">
          <p>旅行が見つかりません。</p>
          <button className="btn" onClick={() => navigate()}>
            一覧へ
          </button>
        </div>
      </div>
    );
  }

  const today = todayLocal();
  const defaultDate = trip.days.find((d) => d.date === today)?.date ?? trip.days[0]?.date ?? null;
  const activeMapDate = mapDate && trip.days.some((d) => d.date === mapDate) ? mapDate : defaultDate;
  const update = (t: Trip) => void saveTrip(t);
  const conflictCount = rec.conflicts?.length ?? 0;

  return (
    <div className="page with-tabs">
      <header className="topbar">
        <button className="icon-btn" aria-label="戻る" onClick={() => navigate()}>
          ‹
        </button>
        <h1 className="ellipsis">{trip.title}</h1>
        <SyncBadge />
      </header>

      {conflictCount > 0 && (
        <button className="banner warn" onClick={() => navigate('trip', id, 'info')}>
          ⚠️ 他の端末/Claude Code での変更と {conflictCount} 件の競合があります（タップして確認）
        </button>
      )}

      <main className={tab === 'map' ? 'content map-content' : 'content'}>
        {tab === 'plan' && (
          <DayTimeline
            trip={trip}
            weather={weather}
            onChange={update}
            onEdit={setEdit}
            onShowMap={(date) => {
              setMapDate(date);
              navigate('trip', id, 'map');
            }}
          />
        )}
        {tab === 'map' && activeMapDate && (
          <MapView trip={trip} date={activeMapDate} onDateChange={setMapDate} onEdit={setEdit} onChange={update} />
        )}
        {tab === 'budget' && <BudgetView trip={trip} onChange={update} />}
        {tab === 'info' && <TripInfo rec={rec} onChange={update} />}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => navigate('trip', id, t.id)}>
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {edit && <SpotEditor trip={trip} target={edit} onClose={() => setEdit(null)} onChange={update} />}
    </div>
  );
}
