import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '../lib/budget';
import { estimateLeg, formatMinutes, isRoadMode, toHighway } from '../lib/highway';
import { googleMapsDirections } from '../lib/navigation';
import { navigate } from '../lib/router';
import { getState, useHome, usePlaces } from '../lib/store';
import {
  IDEAS,
  distanceMeters,
  formatDate,
  formatDistance,
  shiftSpot,
  shiftVisible,
  sortByTime,
  todayLocal,
  updateDay,
  upsertSpot,
  type ListKey,
} from '../lib/tripOps';
import { describeWeather, weatherAdvice, type DailyWeather } from '../lib/weather';
import { CATEGORY_ICON, TRANSPORT_LABEL, type Spot, type Trip } from '../types/trip';
import { Stars } from './PlaceEditor';
import type { EditTarget } from './SpotEditor';

interface Props {
  trip: Trip;
  weather: Record<string, DailyWeather & { stale: boolean }>;
  onChange: (t: Trip) => void;
  onEdit: (t: EditTarget) => void;
  onPickPlaces: () => void;
  onShowMap: (date: string) => void;
  /** 地図などから「日程で見る」で開いた予定。開いた状態で画面中央にスクロールする */
  focusId?: string | null;
}

export default function DayTimeline({ trip, weather, onChange, onEdit, onPickPlaces, onShowMap, focusId }: Props) {
  const today = todayLocal();
  const todayRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = focusId ? document.getElementById(`spot-${focusId}`) : null;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    else todayRef.current?.scrollIntoView({ block: 'start' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const home = useHome();
  const undated = trip.days.length === 0;
  const located = home ? trip.ideas.filter((s) => s.lat != null && s.lng != null) : [];
  const fromHome = (s: Spot) => distanceMeters(home!, { lat: s.lat!, lng: s.lng! });
  const sortByHome = () => {
    const withLoc = [...located].sort((a, b) => fromHome(a) - fromHome(b));
    const rest = trip.ideas.filter((s) => s.lat == null || s.lng == null);
    onChange({ ...trip, ideas: [...withLoc, ...rest], updatedAt: new Date().toISOString() });
  };

  const [hideDone, setHideDone] = useState(() => {
    try {
      return localStorage.getItem('ta.hideDone') === 'true';
    } catch {
      return false;
    }
  });
  const toggleHideDone = () => {
    setHideDone((v) => {
      const next = !v;
      try {
        localStorage.setItem('ta.hideDone', String(next));
      } catch {}
      return next;
    });
  };

  const doneTotal =
    trip.days.reduce((n, d) => n + d.items.filter((s) => s.done).length, 0) +
    trip.ideas.filter((s) => s.done).length;

  return (
    <div className="timeline">
      {doneTotal > 0 && (
        <div className="timeline-toolbar">
          <button
            type="button"
            className={`chip sm ${hideDone ? 'on' : ''}`}
            aria-pressed={hideDone}
            onClick={toggleHideDone}
          >
            {hideDone ? '✓ 完了した予定を非表示中' : '✓ 完了した予定を隠す'}
            <span className="muted" style={hideDone ? { color: '#fff' } : undefined}>
              （{doneTotal}件）
            </span>
          </button>
        </div>
      )}

      {undated && (
        <div className="card undated">
          <div>
            <strong>📅 日程は未定</strong>
            <div className="muted small">
              {[trip.destination && `目的地: ${trip.destination}`, trip.durationDays && `${trip.durationDays}日間くらい`].filter(Boolean).join('・') ||
                '行きたい場所を集めておき、日程が決まったら日ごとに振り分けます'}
            </div>
          </div>
          <button className="btn sm primary" onClick={() => navigate('trip', trip.id, 'info')}>
            日程を決める
          </button>
        </div>
      )}
      {trip.days.map((day, i) => {
        const w = weather[day.date];
        const isToday = day.date === today;
        // 時刻付きが 2 件以上あり、時刻順になっていない日だけ「時刻順」を出す
        const sorted = sortByTime(day.items);
        const unsorted = day.items.filter((s) => s.time).length >= 2 && sorted.some((s, k) => s !== day.items[k]);
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
                <div className="row gap">
                  {unsorted && (
                    <button className="link small" onClick={() => onChange(updateDay(trip, day.date, { items: sorted }))}>
                      ⏰ 時刻順
                    </button>
                  )}
                  <button className="link small" onClick={() => onShowMap(day.date)}>
                    地図で見る
                  </button>
                </div>
              </div>
            </div>
            {w && weatherAdvice(w) && <div className="advice">☂️ {weatherAdvice(w)}</div>}
            <SpotList trip={trip} listKey={day.date} items={day.items} onChange={onChange} onEdit={onEdit} hideDone={hideDone} focusId={focusId} />
            <button className="add-btn" onClick={() => onEdit({ listKey: day.date })}>
              ＋ 予定を追加
            </button>
          </section>
        );
      })}

      <section className="day ideas">
        <div className="day-head">
          <div className="day-title">💡 行きたい場所{undated ? (trip.destination ? `（${trip.destination}）` : '') : '（日程未定）'}</div>
          {located.length > 1 && (
            <button className="link small" onClick={sortByHome}>
              🏠 自宅から近い順
            </button>
          )}
        </div>
        <SpotList trip={trip} listKey={IDEAS} items={trip.ideas} onChange={onChange} onEdit={onEdit} home={home} hideDone={hideDone} focusId={focusId} />
        <div className="add-row">
          <button className="add-btn" onClick={() => onEdit({ listKey: IDEAS })}>
            ＋ 候補を追加
          </button>
          <button className="add-btn" onClick={onPickPlaces}>
            📍 行きたい所から
          </button>
        </div>
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
  home,
  hideDone,
  focusId,
}: {
  trip: Trip;
  listKey: ListKey;
  items: Spot[];
  onChange: (t: Trip) => void;
  onEdit: (t: EditTarget) => void;
  /** 指定すると各予定に自宅からの距離を出す（候補リスト用） */
  home?: { lat: number; lng: number };
  hideDone?: boolean;
  focusId?: string | null;
}) {
  const today = todayLocal();
  const focused = focusId ? items.find((s) => s.id === focusId) : undefined;
  const [open, setOpen] = useState<string | null>(focused ? focused.id : null);
  // ジャンプ先が隠れた完了予定なら表示する
  const [showDoneOverride, setShowDoneOverride] = useState(!!focused?.done);
  const places = usePlaces();

  const doneCount = items.filter((s) => s.done).length;
  const isFiltering = Boolean(hideDone && !showDoneOverride && doneCount > 0);
  const visibleItems = isFiltering ? items.filter((s) => !s.done) : items;

  const dayIndex = listKey !== IDEAS ? trip.days.findIndex((d) => d.date === listKey) : -1;
  const prevDay = dayIndex > 0 ? trip.days[dayIndex - 1] : null;
  const nextDay = dayIndex >= 0 && dayIndex < trip.days.length - 1 ? trip.days[dayIndex + 1] : null;
  const targetDay = listKey === IDEAS ? (trip.days.find((d) => d.date === today) ?? trip.days[0] ?? null) : null;

  if (items.length === 0) return <p className="muted small pad">予定はまだありません</p>;

  // 全て完了していて非表示中の場合
  if (visibleItems.length === 0 && doneCount > 0) {
    return (
      <div className="all-done-box">
        <span className="muted small">✓ すべての予定（{doneCount}件）が完了しました 🎉</span>
        <button type="button" className="link small" onClick={() => setShowDoneOverride(true)}>
          完了した予定を表示
        </button>
      </div>
    );
  }

  return (
    <>
      {isFiltering && doneCount > 0 && (
        <div className="hidden-done-banner">
          <span className="muted small">✓ 完了した予定 {doneCount} 件を非表示中</span>
          <button type="button" className="link small" onClick={() => setShowDoneOverride(true)}>
            表示
          </button>
        </div>
      )}
      {showDoneOverride && doneCount > 0 && hideDone && (
        <div className="hidden-done-banner">
          <span className="muted small">✓ 完了した予定を表示中</span>
          <button type="button" className="link small" onClick={() => setShowDoneOverride(false)}>
            隠す
          </button>
        </div>
      )}
      <ol className="spots">
        {visibleItems.map((s, i) => {
          // 区間・ナビは隠した予定も含めた本当の前後で決める（隠れた予定を飛ばした区間を作らない）
          const at = items.indexOf(s);
          const prev = items[at - 1];
          const realNext = items[at + 1];
          const next = realNext && (!isFiltering || !realNext.done) ? realNext : undefined;
          const dist =
            next && s.lat != null && s.lng != null && next.lat != null && next.lng != null
              ? distanceMeters({ lat: s.lat, lng: s.lng }, { lat: next.lat, lng: next.lng })
              : null;
          const expanded = open === s.id;
          // 別の旅行で行ったことがある場所なら再訪マーク
          const place = s.placeId ? places.find((p) => p.id === s.placeId) : undefined;
          const before = place?.visits.some((v) => v.tripId !== trip.id);
          return (
            <li key={s.id} id={`spot-${s.id}`}>
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
                    {home && s.lat != null && s.lng != null && (
                      <span className="muted small nowrap">🏠 {formatDistance(distanceMeters(home, { lat: s.lat, lng: s.lng }))}</span>
                    )}
                    {(s.lat == null || s.lng == null) && (
                      <span
                        className="no-loc"
                        role="button"
                        tabIndex={0}
                        title="位置を設定すると地図に表示されます"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit({ listKey, spotId: s.id });
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter' && e.key !== ' ') return;
                          e.preventDefault();
                          e.stopPropagation();
                          onEdit({ listKey, spotId: s.id });
                        }}
                      >
                        📍 位置未設定
                      </span>
                    )}
                    {before && (
                      <span className="revisit" title="以前にも行ったことがある場所">
                        再訪 <Stars rating={place!.rating} />
                      </span>
                    )}
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
                  <button
                    className="btn sm"
                    disabled={i === 0}
                    onClick={() => onChange(isFiltering ? shiftVisible(trip, s.id, -1, (x) => !x.done) : shiftSpot(trip, s.id, -1))}
                  >
                    ↑
                  </button>
                  <button
                    className="btn sm"
                    disabled={i === visibleItems.length - 1}
                    onClick={() => onChange(isFiltering ? shiftVisible(trip, s.id, 1, (x) => !x.done) : shiftSpot(trip, s.id, 1))}
                  >
                    ↓
                  </button>

                  {listKey !== IDEAS ? (
                    <>
                      {prevDay && (
                        <button
                          type="button"
                          className="btn sm"
                          title={`${dayIndex}日目へ戻す`}
                          onClick={() => {
                            onChange(upsertSpot(trip, prevDay.date, s));
                            setOpen(null);
                          }}
                        >
                          ← 前日へ
                        </button>
                      )}
                      {nextDay && (
                        <button
                          type="button"
                          className="btn sm"
                          title={`${dayIndex + 2}日目へ送る`}
                          onClick={() => {
                            onChange(upsertSpot(trip, nextDay.date, s));
                            setOpen(null);
                          }}
                        >
                          → 翌日へ
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn sm"
                        title="日程未定の候補リストに移す"
                        onClick={() => {
                          onChange(upsertSpot(trip, IDEAS, s));
                          setOpen(null);
                        }}
                      >
                        💡 候補へ
                      </button>
                    </>
                  ) : (
                    targetDay && (
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => {
                          onChange(upsertSpot(trip, targetDay.date, s));
                          setOpen(null);
                        }}
                      >
                        🗓️ {targetDay.date === today ? '今日の日程へ' : `${trip.days.indexOf(targetDay) + 1}日目へ`}
                      </button>
                    )
                  )}

                  {(s.lat != null || s.address) && (
                    <a className="btn sm primary" href={googleMapsDirections(s, prev?.transportToNext, prev?.highway?.use === false)} target="_blank" rel="noreferrer">
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
                <Leg trip={trip} listKey={listKey} from={s} to={next} dist={dist} onChange={onChange} />
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** 予定と予定の間の移動。車・バイク・バスは高速道路の利用と所要時間・料金の概算を出せる */
function Leg({
  trip,
  listKey,
  from,
  to,
  dist,
  onChange,
}: {
  trip: Trip;
  listKey: ListKey;
  from: Spot;
  to: Spot;
  dist: number | null;
  onChange: (t: Trip) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mode = from.transportToNext;
  const hw = from.highway;
  const road = isRoadMode(mode);
  const canEstimate = road && from.lat != null && from.lng != null && to.lat != null && to.lng != null;

  const estimate = async () => {
    if (!canEstimate) return;
    setBusy(true);
    setErr(null);
    try {
      const use = hw?.use ?? true;
      const e = await estimateLeg({ lat: from.lat!, lng: from.lng! }, { lat: to.lat!, lng: to.lng! }, mode!, use);
      // 計算中に別の編集が入っても消さないよう、最新の旅行に反映する
      const latest = getState().records[trip.id]?.trip ?? trip;
      const cur = latest.days.flatMap((d) => d.items).find((x) => x.id === from.id) ?? from;
      onChange(upsertSpot(latest, listKey, { ...cur, highway: toHighway(e, use) }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="leg muted small">
      ↓ {mode ? TRANSPORT_LABEL[mode] : ''}
      {road && hw && <span className={hw.use ? 'hw-tag on' : 'hw-tag'}>{hw.use ? '🛣️ 高速' : '下道'}</span>}
      {hw?.minutes != null && ` 約${formatMinutes(hw.minutes)}`}
      {hw?.km != null ? ` ${hw.km} km` : dist != null && ` ${formatDistance(dist)}`}
      {hw?.use && hw.toll != null && (
        <strong className="toll">
          {' '}
          {formatMoney(hw.toll, 'JPY')}
          {hw.estimated && <span className="muted">（概算）</span>}
        </strong>
      )}
      {canEstimate && (
        <button className="link small" disabled={busy} onClick={() => void estimate()}>
          {busy ? '計算中…' : hw?.minutes != null ? '↻' : '🛣️ 概算'}
        </button>
      )}
      {hw?.use && hw.section && <div className="hw-section">{hw.section}</div>}
      {err && <div className="warn-text">{err}</div>}
    </div>
  );
}
