import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '../lib/budget';
import { googleMapsDirections } from '../lib/navigation';
import {
  IDEAS,
  distanceMeters,
  formatDate,
  formatDistance,
  shiftSpot,
  todayLocal,
  updateDay,
  upsertSpot,
  type ListKey,
} from '../lib/tripOps';
import { describeWeather, weatherAdvice, type DailyWeather } from '../lib/weather';
import { CATEGORY_ICON, TRANSPORT_LABEL, type Spot, type Trip } from '../types/trip';
import type { EditTarget } from './SpotEditor';

interface Props {
  trip: Trip;
  weather: Record<string, DailyWeather & { stale: boolean }>;
  onChange: (t: Trip) => void;
  onEdit: (t: EditTarget) => void;
  onShowMap: (date: string) => void;
}

export default function DayTimeline({ trip, weather, onChange, onEdit, onShowMap }: Props) {
  const today = todayLocal();
  const todayRef = useRef<HTMLElement>(null);
  useEffect(() => {
    todayRef.current?.scrollIntoView({ block: 'start' });
  }, []);

  return (
    <div className="timeline">
      {trip.days.map((day, i) => {
        const w = weather[day.date];
        const isToday = day.date === today;
        return (
          <section key={day.date} className={`day ${isToday ? 'today' : ''}`} ref={isToday ? todayRef : undefined}>
            <div className="day-head">
              <div>
                <div className="day-title">
                  Day {i + 1} <span className="muted">{formatDate(day.date)}</span>
                  {isToday && <span className="pill">今日</span>}
                </div>
                <input
                  className="day-subtitle"
                  value={day.title ?? ''}
                  placeholder="エリア・テーマを入力"
                  onChange={(e) => onChange(updateDay(trip, day.date, { title: e.target.value || undefined }))}
                />
              </div>
              <div className="day-side">
                {w ? <WeatherChip w={w} /> : <span className="muted small">天気: 予報期間外</span>}
                <button className="link small" onClick={() => onShowMap(day.date)}>
                  地図で見る
                </button>
              </div>
            </div>
            {w && weatherAdvice(w) && <div className="advice">☂️ {weatherAdvice(w)}</div>}
            <SpotList trip={trip} listKey={day.date} items={day.items} onChange={onChange} onEdit={onEdit} />
            <button className="add-btn" onClick={() => onEdit({ listKey: day.date })}>
              ＋ 予定を追加
            </button>
          </section>
        );
      })}

      <section className="day ideas">
        <div className="day-head">
          <div className="day-title">💡 行きたい場所（日程未定）</div>
        </div>
        <SpotList trip={trip} listKey={IDEAS} items={trip.ideas} onChange={onChange} onEdit={onEdit} />
        <button className="add-btn" onClick={() => onEdit({ listKey: IDEAS })}>
          ＋ 候補を追加
        </button>
      </section>
    </div>
  );
}

function WeatherChip({ w }: { w: DailyWeather & { stale: boolean } }) {
  const d = describeWeather(w.code);
  return (
    <span className="weather" title={d.label + (w.stale ? '（前回取得）' : '')}>
      {d.icon} {Math.round(w.tMax)}°/{Math.round(w.tMin)}°
      {w.precipProb != null && <span className="muted"> ☔{w.precipProb}%</span>}
    </span>
  );
}

function SpotList({
  trip,
  listKey,
  items,
  onChange,
  onEdit,
}: {
  trip: Trip;
  listKey: ListKey;
  items: Spot[];
  onChange: (t: Trip) => void;
  onEdit: (t: EditTarget) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (items.length === 0) return <p className="muted small pad">予定はまだありません</p>;
  return (
    <ol className="spots">
      {items.map((s, i) => {
        const next = items[i + 1];
        const dist =
          next && s.lat != null && s.lng != null && next.lat != null && next.lng != null
            ? distanceMeters({ lat: s.lat, lng: s.lng }, { lat: next.lat, lng: next.lng })
            : null;
        const expanded = open === s.id;
        return (
          <li key={s.id}>
            <div className={`spot ${s.done ? 'done' : ''}`}>
              <button
                className={`check ${s.done ? 'on' : ''}`}
                aria-label="完了"
                onClick={() => onChange(upsertSpot(trip, listKey, { ...s, done: !s.done }))}
              >
                {s.done ? '✓' : ''}
              </button>
              <button className="spot-main" onClick={() => setOpen(expanded ? null : s.id)}>
                <div className="spot-line">
                  {s.time && (
                    <span className="time">
                      {s.time}
                      {s.endTime && `–${s.endTime}`}
                    </span>
                  )}
                  <span className="spot-title">
                    {CATEGORY_ICON[s.category]} {s.title}
                  </span>
                </div>
                {(s.cost || s.bookingRef || s.memo) && (
                  <div className="muted small spot-meta">
                    {s.cost ? formatMoney(s.cost, s.currency ?? trip.baseCurrency) : ''}
                    {s.bookingRef ? ` 予約#${s.bookingRef}` : ''}
                    {s.memo ? ` ${s.memo}` : ''}
                  </div>
                )}
              </button>
            </div>
            {expanded && (
              <div className="spot-actions">
                <button className="btn sm" onClick={() => onEdit({ listKey, spotId: s.id })}>
                  ✏️ 編集
                </button>
                <button className="btn sm" disabled={i === 0} onClick={() => onChange(shiftSpot(trip, s.id, -1))}>
                  ↑
                </button>
                <button className="btn sm" disabled={i === items.length - 1} onClick={() => onChange(shiftSpot(trip, s.id, 1))}>
                  ↓
                </button>
                {(s.lat != null || s.address) && (
                  <a className="btn sm primary" href={googleMapsDirections(s, items[i - 1]?.transportToNext)} target="_blank" rel="noreferrer">
                    🧭 ナビ
                  </a>
                )}
                {s.url && (
                  <a className="btn sm" href={s.url} target="_blank" rel="noreferrer">
                    🔗
                  </a>
                )}
              </div>
            )}
            {next && listKey !== IDEAS && (
              <div className="leg muted small">
                ↓ {s.transportToNext ? TRANSPORT_LABEL[s.transportToNext] : ''}
                {dist != null && ` ${formatDistance(dist)}`}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
