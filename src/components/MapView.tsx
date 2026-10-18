import L from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { googleMapsDirections } from '../lib/navigation';
import { routeLine } from '../lib/routing';
import { IDEAS, distanceMeters, formatDate, formatDistance, spotsWithLocation, todayLocal, upsertSpot } from '../lib/tripOps';
import { CATEGORY_ICON, type Spot, type Transport, type Trip } from '../types/trip';
import { useHome } from '../lib/store';
import { TILE_ATTR, TILE_URL, homeIcon, meIcon, numberIcon } from './mapIcons';
import type { EditTarget } from './SpotEditor';

const DAY_COLORS = ['#0f766e', '#2563eb', '#c2410c', '#7c3aed', '#be123c', '#4d7c0f', '#0369a1', '#a16207'];
const dayColor = (index: number) => DAY_COLORS[index % DAY_COLORS.length];

interface Props {
  trip: Trip;
  /** 表示する日（複数可） */
  dates: string[];
  onDatesChange: (d: string[]) => void;
  onEdit: (t: EditTarget) => void;
  onChange: (t: Trip) => void;
  /** 日程タブでその予定を開く */
  onShowInPlan: (spotId: string) => void;
}

type LatLng = [number, number];
type Located = Spot & { lat: number; lng: number };
interface MapSpot {
  spot: Located;
  date: string;
  dayIndex: number;
  /** その日の中での番号（1 始まり） */
  order: number;
  prevMode?: Transport;
  /** 前の場所から「高速を使わない」で来る */
  prevAvoid?: boolean;
}
interface Leg {
  key: string;
  from: LatLng;
  to: LatLng;
  mode?: Transport;
  color: string;
}

const legKey = (l: Leg) => `${l.from}|${l.to}|${l.mode ?? ''}`;

export default function MapView({ trip, dates, onDatesChange, onEdit, onChange, onShowInPlan }: Props) {
  // 日程未定（日が無い）なら候補を最初から表示
  const [showIdeas, setShowIdeas] = useState(trip.days.length === 0);
  const home = useHome();
  const [me, setMe] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [tracking, setTracking] = useState(false);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const today = todayLocal();

  const selected = useMemo(() => new Set(dates), [dates]);
  const multi = selected.size > 1;
  const allSelected = trip.days.length > 0 && trip.days.every((d) => selected.has(d.date));

  // 選択した日の地点（日付順）と区間。連続して選択した日は前日の最後と翌日の最初もつなぐ
  const { spots, legs } = useMemo(() => {
    const spots: MapSpot[] = [];
    const legs: Leg[] = [];
    let prev: { spot: Located; dayIndex: number } | null = null;
    trip.days.forEach((d, dayIndex) => {
      if (!selected.has(d.date)) {
        prev = null;
        return;
      }
      spotsWithLocation(d.items).forEach((spot, i) => {
        if (prev) {
          legs.push({
            key: `${prev.spot.id}>${spot.id}`,
            from: [prev.spot.lat, prev.spot.lng],
            to: [spot.lat, spot.lng],
            mode: prev.spot.transportToNext,
            color: dayColor(prev.dayIndex),
          });
        }
        spots.push({ spot, date: d.date, dayIndex, order: i + 1, prevMode: prev?.spot.transportToNext, prevAvoid: prev?.spot.highway?.use === false });
        prev = { spot, dayIndex };
      });
    });
    return { spots, legs };
  }, [trip.days, selected]);

  const ideas = useMemo(() => (showIdeas ? spotsWithLocation(trip.ideas) : []), [showIdeas, trip.ideas]);

  const toggleDay = (date: string) => {
    if (selected.has(date)) {
      if (selected.size > 1) onDatesChange(dates.filter((d) => d !== date));
    } else {
      onDatesChange(trip.days.map((d) => d.date).filter((d) => d === date || selected.has(d)));
    }
  };
  const toggleAll = () => {
    if (!trip.days.length) return;
    if (allSelected) {
      onDatesChange([trip.days.find((d) => d.date === today)?.date ?? trip.days[0].date]);
    } else {
      onDatesChange(trip.days.map((d) => d.date));
    }
  };

  // 現在地の追跡
  useEffect(() => {
    if (!tracking) return;
    if (!('geolocation' in navigator)) {
      setGeoErr('この端末では現在地を取得できません');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setGeoErr(null);
        setMe({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy });
      },
      (e) => setGeoErr(e.code === 1 ? '位置情報の許可が必要です' : '現在地を取得できませんでした'),
      { enableHighAccuracy: true, maximumAge: 10000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [tracking]);

  // ルート線（区間ごとに取得。取得までは点線の直線で表示）
  const [routed, setRouted] = useState<Record<string, { line: LatLng[]; routed: boolean }>>({});
  const legSig = legs.map(legKey).join(';');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const l of legs) {
        const r = await routeLine(l.from, l.to, l.mode);
        if (cancelled) return;
        setRouted((m) => ({ ...m, [legKey(l)]: r }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [legSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // 次の予定: 今日を表示中なら今日の未完了、そうでなければ表示範囲の最初の未完了
  const next = selected.has(today)
    ? spots.find((s) => s.date === today && !s.spot.done)
    : spots.find((s) => !s.spot.done);
  const nextDist = me && next ? distanceMeters(me, next.spot) : null;
  const addDate = selected.has(today) ? today : (trip.days.find((d) => selected.has(d.date))?.date ?? IDEAS);

  const bounds = useMemo(() => {
    const pts: LatLng[] = [...spots.map((s) => s.spot), ...ideas].map((s) => [s.lat, s.lng]);
    return pts.length ? L.latLngBounds(pts) : null;
  }, [spots, ideas]);

  const fallbackCenter: LatLng = (() => {
    const any = spotsWithLocation([...trip.days.flatMap((d) => d.items), ...trip.ideas])[0];
    return any ? [any.lat, any.lng] : home ? [home.lat, home.lng] : [35.68, 139.76];
  })();

  return (
    <div className="map-wrap">
      <div className="day-chips" role="group" aria-label="表示する日">
        {trip.days.length > 0 && (
          <button className={`chip sm ${allSelected ? 'on' : ''}`} aria-pressed={allSelected} onClick={toggleAll}>
            全日程
          </button>
        )}
        {trip.days.map((d, i) => {
          const on = selected.has(d.date);
          return (
            <button
              key={d.date}
              className={`chip sm ${on ? 'on' : ''}`}
              style={on ? { background: dayColor(i), borderColor: dayColor(i) } : undefined}
              aria-pressed={on}
              aria-label={`${i + 1}日目 ${formatDate(d.date)}`}
              onClick={() => toggleDay(d.date)}
            >
              <span className="dot" style={{ background: on ? '#fff' : dayColor(i) }} />
              {i + 1}日目
            </button>
          );
        })}
        <button className={`chip sm ${showIdeas ? 'on' : ''}`} aria-pressed={showIdeas} onClick={() => setShowIdeas((v) => !v)}>
          💡 候補
        </button>
      </div>

      <div className="map-box">
        <MapContainer center={fallbackCenter} zoom={13} style={{ height: '100%' }} zoomControl={false}>
          <TileLayer url={TILE_URL} attribution={TILE_ATTR} />
          <FitBounds bounds={bounds} sig={dates.join() + showIdeas} />
          <LongPress onPress={(lat, lng) => onEdit({ listKey: addDate, preset: { lat, lng } })} />
          <FollowMe me={tracking ? me : null} />

          {legs.map((l) => {
            const r = routed[legKey(l)];
            return (
              <Polyline
                key={l.key}
                positions={r?.line ?? [l.from, l.to]}
                pathOptions={{ color: l.color, weight: 5, opacity: 0.75, dashArray: r?.routed ? undefined : '6 8' }}
              />
            );
          })}

          {spots.map((s) => (
            <Marker
              key={s.spot.id}
              position={[s.spot.lat, s.spot.lng]}
              icon={numberIcon(multi ? `${s.dayIndex + 1}-${s.order}` : s.order, {
                done: s.spot.done,
                active: s === next,
                color: dayColor(s.dayIndex),
              })}
            >
              <Popup>
                <SpotPopup
                  spot={s.spot}
                  label={multi ? `${s.dayIndex + 1}日目 ${formatDate(s.date)}` : undefined}
                  prevMode={s.prevMode}
                  prevAvoid={s.prevAvoid}
                  onEdit={() => onEdit({ listKey: s.date, spotId: s.spot.id })}
                  onShowInPlan={() => onShowInPlan(s.spot.id)}
                  onToggleDone={() => onChange(upsertSpot(trip, s.date, { ...s.spot, done: !s.spot.done }))}
                />
              </Popup>
            </Marker>
          ))}

          {ideas.map((s) => (
            <Marker key={s.id} position={[s.lat, s.lng]} icon={numberIcon('💡', { color: '#94a3b8' })}>
              <Popup>
                <SpotPopup spot={s} onEdit={() => onEdit({ listKey: IDEAS, spotId: s.id })} onShowInPlan={() => onShowInPlan(s.id)} />
              </Popup>
            </Marker>
          ))}

          {home && (
            <Marker position={[home.lat, home.lng]} icon={homeIcon}>
              <Popup>
                <strong>🏠 {home.title}</strong>
                {home.address && <div className="muted small">{home.address}</div>}
              </Popup>
            </Marker>
          )}
          {me && <Marker position={[me.lat, me.lng]} icon={meIcon} />}
        </MapContainer>

        <button className="fab fit" aria-label="全体を表示" onClick={() => window.dispatchEvent(new Event('ta:fit'))}>
          ⤢
        </button>
        <button className={`fab locate ${tracking ? 'on' : ''}`} aria-label="現在地" onClick={() => setTracking((v) => !v)}>
          ◎
        </button>
      </div>

      <div className="next-card">
        {geoErr && <div className="muted small">{geoErr}</div>}
        {next ? (
          <div className="row between">
            <div className="ellipsis">
              <div className="muted small">
                次の予定{multi ? ` ${next.dayIndex + 1}日目` : ''}
                {next.spot.time ? ` ${next.spot.time}` : ''}
              </div>
              <strong>
                {CATEGORY_ICON[next.spot.category]} {next.spot.title}
              </strong>
              {nextDist != null && <span className="muted small"> ・現在地から {formatDistance(nextDist)}</span>}
            </div>
            <div className="row gap">
              <button className="btn sm" aria-label="日程で見る" onClick={() => onShowInPlan(next.spot.id)}>
                🗓️
              </button>
              <a className="btn primary sm" href={googleMapsDirections(next.spot, next.prevMode, next.prevAvoid)} target="_blank" rel="noreferrer">
                🧭 ナビ
              </a>
            </div>
          </div>
        ) : (
          <div className="muted small">
            {spots.length
              ? '表示中の予定はすべて完了 🎉'
              : trip.days.length
                ? '位置付きの予定がありません。地図を長押しで追加できます'
                : '日程は未定です。地図を長押しで候補を追加できます'}
          </div>
        )}
      </div>
    </div>
  );
}

function SpotPopup({
  spot,
  label,
  prevMode,
  prevAvoid,
  onEdit,
  onToggleDone,
  onShowInPlan,
}: {
  spot: Spot;
  label?: string;
  prevMode?: Spot['transportToNext'];
  prevAvoid?: boolean;
  onEdit: () => void;
  onToggleDone?: () => void;
  onShowInPlan?: () => void;
}) {
  return (
    <div className="popup">
      <strong>
        {CATEGORY_ICON[spot.category]} {spot.title}
      </strong>
      {(label || spot.time) && <div className="muted small">{[label, spot.time].filter(Boolean).join(' ')}</div>}
      {spot.memo && <div className="small">{spot.memo}</div>}
      <div className="row gap" style={{ marginTop: 6 }}>
        <a className="btn sm primary" href={googleMapsDirections(spot, prevMode, prevAvoid)} target="_blank" rel="noreferrer">
          ナビ
        </a>
        <button className="btn sm" onClick={onEdit}>
          編集
        </button>
        {onToggleDone && (
          <button className="btn sm" onClick={onToggleDone}>
            {spot.done ? '未完了' : '完了'}
          </button>
        )}
        {onShowInPlan && (
          <button className="btn sm" onClick={onShowInPlan}>
            🗓️ 日程で見る
          </button>
        )}
      </div>
    </div>
  );
}

function FitBounds({ bounds, sig }: { bounds: L.LatLngBounds | null; sig: string }) {
  const map = useMap();
  // 「全体を表示」ボタン
  useEffect(() => {
    const fit = () => bounds && map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    window.addEventListener('ta:fit', fit);
    return () => window.removeEventListener('ta:fit', fit);
  }, [map, bounds]);
  useEffect(() => {
    const fit = () => bounds && map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    fit();
    // 表示直後はレイアウト確定でコンテナのサイズが変わるため、少しの間はサイズ変化のたびに合わせ直す
    const until = Date.now() + 1500;
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      if (Date.now() < until) fit();
    });
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function FollowMe({ me }: { me: { lat: number; lng: number } | null }) {
  const map = useMap();
  const [centered, setCentered] = useState(false);
  useEffect(() => {
    if (!me) {
      setCentered(false);
      return;
    }
    if (!centered) {
      map.setView([me.lat, me.lng], Math.max(map.getZoom(), 15));
      setCentered(true);
    }
  }, [me, centered, map]);
  return null;
}

/** スマホの長押し（contextmenu）/ PC の右クリックでその場所に予定を追加 */
function LongPress({ onPress }: { onPress: (lat: number, lng: number) => void }) {
  useMapEvents({
    contextmenu: (e) => onPress(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))),
  });
  return null;
}
