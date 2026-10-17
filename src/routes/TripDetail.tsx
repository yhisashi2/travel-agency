import { useState } from 'react';
import BudgetView from '../components/BudgetView';
import DayTimeline from '../components/DayTimeline';
import MapView from '../components/MapView';
import PlacePicker from '../components/PlacePicker';
import RatingSheet from '../components/RatingSheet';
import SpotEditor, { type EditTarget } from '../components/SpotEditor';
import SyncBadge from '../components/SyncBadge';
import TripInfo from '../components/TripInfo';
import { navigate } from '../lib/router';
import { recordVisits, spotFromPlace } from '../lib/places';
import { getState, saveTrip, updatePlaces, useStore } from '../lib/store';
import { todayLocal, upsertSpot } from '../lib/tripOps';
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
  const [mapDates, setMapDates] = useState<string[] | null>(null);
  const [picker, setPicker] = useState(false);
  /** 評価を聞く場所 ID の列 */
  const [askQueue, setAskQueue] = useState<string[]>([]);

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
  const validMapDates = mapDates?.filter((d) => trip.days.some((x) => x.date === d)) ?? [];
  const activeMapDates = validMapDates.length ? validMapDates : defaultDate ? [defaultDate] : [];
  const update = (t: Trip) => {
    // 完了/未完了の変化を全体の行きたい所リストへ反映
    const prev = getState().records[id]?.trip ?? trip;
    const r = recordVisits(getState().places?.data.places ?? [], prev, t);
    void saveTrip(r.trip);
    if (r.changed) {
      void updatePlaces(() => r.places);
      if (r.ask.length) setAskQueue((q) => [...q, ...r.ask.map((p) => p.id).filter((x) => !q.includes(x))]);
    }
  };
  const popAsk = () => setAskQueue((q) => q.slice(1));
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
            onPickPlaces={() => setPicker(true)}
            onShowMap={(date) => {
              setMapDates([date]);
              navigate('trip', id, 'map');
            }}
          />
        )}
        {tab === 'map' && activeMapDates.length > 0 && (
          <MapView trip={trip} dates={activeMapDates} onDatesChange={setMapDates} onEdit={setEdit} onChange={update} />
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

      {picker && (
        <PlacePicker
          trip={trip}
          onClose={() => setPicker(false)}
          onAdd={(place, listKey) => {
            const latest = getState().records[id]?.trip ?? trip;
            void saveTrip(upsertSpot(latest, listKey, spotFromPlace(place)));
          }}
        />
      )}

      {askQueue[0] && (
        <RatingSheet
          placeId={askQueue[0]}
          onRate={(rating) => {
            const pid = askQueue[0];
            void updatePlaces((list) => list.map((p) => (p.id === pid ? { ...p, rating } : p)));
            popAsk();
          }}
          onLater={popAsk}
          onExclude={() => {
            const pid = askQueue[0];
            void updatePlaces((list) => list.filter((p) => p.id !== pid));
            const latest = getState().records[id]?.trip ?? trip;
            const strip = (items: Trip['ideas']) => items.map((s) => (s.placeId === pid ? { ...s, placeId: undefined } : s));
            void saveTrip({ ...latest, ideas: strip(latest.ideas), days: latest.days.map((d) => ({ ...d, items: strip(d.items) })) });
            popAsk();
          }}
        />
      )}

      {edit && <SpotEditor trip={trip} target={edit} onClose={() => setEdit(null)} onChange={update} />}
    </div>
  );
}
