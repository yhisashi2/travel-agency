import L from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { googleMapsDirections } from '../lib/navigation';
import { routeLine } from '../lib/routing';
import { IDEAS, distanceMeters, formatDate, formatDistance, spotsWithLocation, upsertSpot } from '../lib/tripOps';
import { CATEGORY_ICON, type Spot, type Trip } from '../types/trip';
import { TILE_ATTR, TILE_URL, meIcon, numberIcon } from './mapIcons';
import type { EditTarget } from './SpotEditor';

const DAY_COLORS = ['#0f766e', '#2563eb', '#c2410c', '#7c3aed', '#be123c', '#4d7c0f', '#0369a1'];

interface Props {
  trip: Trip;
  date: string;
  onDateChange: (d: string) => void;
  onEdit: (t: EditTarget) => void;
  onChange: (t: Trip) => void;
}

type LatLng = [number, number];

export default function MapView({ trip, date, onDateChange, onEdit, onChange }: Props) {
  const [showIdeas, setShowIdeas] = useState(false);
  const [me, setMe] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [tracking, setTracking] = useState(false);
  const [geoErr, setGeoErr] = useState<string | null>(null);

  const dayIndex = trip.days.findIndex((d) => d.date === date);
  const day = trip.days[dayIndex];
  const color = DAY_COLORS[dayIndex % DAY_COLORS.length];
  const spots = useMemo(() => spotsWithLocation(day?.items ?? []), [day]);
  const ideas = useMemo(() => (showIdeas ? spotsWithLocation(trip.ideas) : []), [showIdeas, trip.ideas]);

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

  // ルート線（区間ごとに取得）
  const [legs, setLegs] = useState<{ line: LatLng[]; routed: boolean }[]>([]);
  const legSig = JSON.stringify(spots.map((s) => [s.lat, s.lng, s.transportToNext]));
  useEffect(() => {
    let cancelled = false;
    const straight = spots.slice(0, -1).map((s, i) => ({ line: [[s.lat, s.lng], [spots[i + 1].lat, spots[i + 1].lng]] as LatLng[], routed: false }));
    setLegs(straight);
    (async () => {
      const out = [...straight];
      for (let i = 0; i < spots.length - 1; i++) {
        const a = spots[i];
        const b = spots[i + 1];
        out[i] = await routeLine([a.lat, a.lng], [b.lat, b.lng], a.transportToNext);
        if (cancelled) return;
        setLegs([...out]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [legSig]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = spots.find((s) => !s.done);
  const nextDist = me && next ? distanceMeters(me, next) : null;

  const bounds = useMemo(() => {
    const pts: LatLng[] = [...spots, ...ideas].map((s) => [s.lat, s.lng]);
    return pts.length ? L.latLngBounds(pts) : null;
  }, [spots, ideas]);

  const fallbackCenter: LatLng = (() => {
    const any = spotsWithLocation([...trip.days.flatMap((d) => d.items), ...trip.ideas])[0];
    return any ? [any.lat, any.lng] : [35.68, 139.76];
  })();

  return (
    <div className="map-wrap">
      <div className="day-chips">
        {trip.days.map((d, i) => (
          <button key={d.date} className={`chip ${d.date === date ? 'on' : ''}`} onClick={() => onDateChange(d.date)}>
            Day{i + 1} {formatDate(d.date)}
          </button>
        ))}
        <button className={`chip ${showIdeas ? 'on' : ''}`} onClick={() => setShowIdeas((v) => !v)}>
          💡 候補
        </button>
      </div>

      <div className="map-box">
        <MapContainer center={fallbackCenter} zoom={13} style={{ height: '100%' }} zoomControl={false}>
          <TileLayer url={TILE_URL} attribution={TILE_ATTR} />
          <FitBounds bounds={bounds} sig={date + showIdeas} />
          <LongPress onPress={(lat, lng) => onEdit({ listKey: date, preset: { lat, lng } })} />
          <FollowMe me={tracking ? me : null} />

          {legs.map((l, i) => (
            <Polyline
              key={i}
              positions={l.line}
              pathOptions={{ color, weight: 5, opacity: 0.75, dashArray: l.routed ? undefined : '6 8' }}
            />
          ))}

          {spots.map((s, i) => (
            <Marker key={s.id} position={[s.lat, s.lng]} icon={numberIcon(i + 1, { done: s.done, active: s === next, color })}>
              <Popup>
                <SpotPopup
                  spot={s}
                  prevMode={spots[i - 1]?.transportToNext}
                  onEdit={() => onEdit({ listKey: date, spotId: s.id })}
                  onToggleDone={() => onChange(upsertSpot(trip, date, { ...s, done: !s.done }))}
                />
              </Popup>
            </Marker>
          ))}

          {ideas.map((s) => (
            <Marker key={s.id} position={[s.lat, s.lng]} icon={numberIcon('💡', { color: '#94a3b8' })}>
              <Popup>
                <SpotPopup spot={s} onEdit={() => onEdit({ listKey: IDEAS, spotId: s.id })} />
              </Popup>
            </Marker>
          ))}

          {me && <Marker position={[me.lat, me.lng]} icon={meIcon} />}
        </MapContainer>

        <button
          className={`fab locate ${tracking ? 'on' : ''}`}
          aria-label="現在地"
          onClick={() => setTracking((v) => !v)}
        >
          ◎
        </button>
      </div>

      <div className="next-card">
        {geoErr && <div className="muted small">{geoErr}</div>}
        {next ? (
          <div className="row between">
            <div className="ellipsis">
              <div className="muted small">次の予定{next.time ? ` ${next.time}` : ''}</div>
              <strong>
                {CATEGORY_ICON[next.category]} {next.title}
              </strong>
              {nextDist != null && <span className="muted small"> ・現在地から {formatDistance(nextDist)}</span>}
            </div>
            <a className="btn primary sm" href={googleMapsDirections(next, spots[spots.indexOf(next) - 1]?.transportToNext)} target="_blank" rel="noreferrer">
              🧭 ナビ
            </a>
          </div>
        ) : (
          <div className="muted small">
            {spots.length ? 'この日の予定はすべて完了 🎉' : '位置付きの予定がありません。地図を長押しで追加できます'}
          </div>
        )}
      </div>
    </div>
  );
}

function SpotPopup({
  spot,
  prevMode,
  onEdit,
  onToggleDone,
}: {
  spot: Spot;
  prevMode?: Spot['transportToNext'];
  onEdit: () => void;
  onToggleDone?: () => void;
}) {
  return (
    <div className="popup">
      <strong>
        {CATEGORY_ICON[spot.category]} {spot.title}
      </strong>
      {spot.time && <div className="muted small">{spot.time}</div>}
      {spot.memo && <div className="small">{spot.memo}</div>}
      <div className="row gap" style={{ marginTop: 6 }}>
        <a className="btn sm primary" href={googleMapsDirections(spot, prevMode)} target="_blank" rel="noreferrer">
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
      </div>
    </div>
  );
}

function FitBounds({ bounds, sig }: { bounds: L.LatLngBounds | null; sig: string }) {
  const map = useMap();
  useEffect(() => {
    // コンテナのサイズ確定後に合わせる（初回描画直後はサイズが 0 のことがある）
    const t = setTimeout(() => {
      map.invalidateSize();
      if (bounds) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }, 50);
    return () => clearTimeout(t);
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
