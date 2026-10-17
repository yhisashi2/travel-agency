import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { reverseGeocode, searchPlaces, type Place } from '../lib/geocode';
import { IDEAS, deleteSpot, findSpot, formatDate, newId, spotsWithLocation, upsertSpot, type ListKey } from '../lib/tripOps';
import { CATEGORIES, CATEGORY_ICON, CATEGORY_LABEL, TRANSPORTS, TRANSPORT_LABEL, type Spot, type Trip } from '../types/trip';
import { TILE_ATTR, TILE_URL, numberIcon } from './mapIcons';

export interface EditTarget {
  listKey: ListKey;
  spotId?: string;
  /** 地図の長押しなどから位置を指定して新規作成 */
  preset?: Partial<Spot>;
}

interface Props {
  trip: Trip;
  target: EditTarget;
  onClose: () => void;
  onChange: (t: Trip) => void;
}

export default function SpotEditor({ trip, target, onClose, onChange }: Props) {
  const existing = target.spotId ? findSpot(trip, target.spotId) : null;
  const [spot, setSpot] = useState<Spot>(
    () => existing?.spot ?? { id: newId(), title: '', category: 'sightseeing', ...target.preset },
  );
  const [listKey, setListKey] = useState<ListKey>(existing?.key ?? target.listKey);
  const [showMap, setShowMap] = useState(false);
  const set = <K extends keyof Spot>(k: K, v: Spot[K]) =>
    setSpot((s) => ({ ...s, [k]: v === '' && k !== 'title' ? undefined : v }));

  // 地図の長押しから開いた場合は住所と名前を補完
  useEffect(() => {
    const p = target.preset;
    if (existing || p?.lat == null || p.lng == null || p.address) return;
    void reverseGeocode(p.lat, p.lng)
      .then((r) => r && setSpot((s) => ({ ...s, address: s.address ?? r.address, title: s.title || r.name })))
      .catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 検索の基準位置（この旅行の地点の平均）
  const near = useMemo(() => {
    const pts = spotsWithLocation([...trip.days.flatMap((d) => d.items), ...trip.ideas]);
    if (!pts.length) return undefined;
    return { lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length, lng: pts.reduce((a, p) => a + p.lng, 0) / pts.length };
  }, [trip]);

  const save = () => {
    if (!spot.title.trim()) return;
    onChange(upsertSpot(trip, listKey, { ...spot, title: spot.title.trim() }));
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="予定の編集">
        <div className="sheet-head">
          <button className="link" onClick={onClose}>
            キャンセル
          </button>
          <strong>{existing ? '予定を編集' : '予定を追加'}</strong>
          <button className="link strong" onClick={save} disabled={!spot.title.trim()}>
            保存
          </button>
        </div>

        <div className="sheet-body form">
          <PlaceSearch
            near={near}
            value={spot.title}
            onTitle={(title) => set('title', title)}
            onPick={(p) => setSpot((s) => ({ ...s, title: s.title || p.name, lat: p.lat, lng: p.lng, address: p.address }))}
          />

          <div className="chips">
            {CATEGORIES.map((c) => (
              <button key={c} type="button" className={`chip ${spot.category === c ? 'on' : ''}`} onClick={() => set('category', c)}>
                {CATEGORY_ICON[c]} {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>

          <label>
            日程
            <select value={listKey} onChange={(e) => setListKey(e.target.value)}>
              {trip.days.map((d, i) => (
                <option key={d.date} value={d.date}>
                  Day {i + 1} {formatDate(d.date)} {d.title ?? ''}
                </option>
              ))}
              <option value={IDEAS}>💡 行きたい場所（日程未定）</option>
            </select>
          </label>

          <div className="row gap">
            <label className="grow">
              開始
              <input type="time" value={spot.time ?? ''} onChange={(e) => set('time', e.target.value)} />
            </label>
            <label className="grow">
              終了
              <input type="time" value={spot.endTime ?? ''} onChange={(e) => set('endTime', e.target.value)} />
            </label>
          </div>

          <div className="loc-box">
            <div className="row between">
              <span className="small">
                📍{' '}
                {spot.lat != null ? (
                  <>
                    {spot.address ?? `${spot.lat.toFixed(5)}, ${spot.lng?.toFixed(5)}`}
                  </>
                ) : (
                  <span className="muted">位置未設定</span>
                )}
              </span>
              <div className="row">
                <button type="button" className="btn sm" onClick={() => setShowMap((v) => !v)}>
                  {showMap ? '閉じる' : '地図で指定'}
                </button>
                {spot.lat != null && (
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => setSpot((s) => ({ ...s, lat: undefined, lng: undefined, address: undefined }))}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            {showMap && (
              <PickMap
                center={spot.lat != null && spot.lng != null ? [spot.lat, spot.lng] : near ? [near.lat, near.lng] : [35.68, 139.76]}
                value={spot.lat != null && spot.lng != null ? [spot.lat, spot.lng] : null}
                onPick={async (lat, lng) => {
                  setSpot((s) => ({ ...s, lat, lng, address: undefined }));
                  const p = await reverseGeocode(lat, lng).catch(() => null);
                  if (p) setSpot((s) => (s.lat === lat && s.lng === lng ? { ...s, address: p.address, title: s.title || p.name } : s));
                }}
              />
            )}
          </div>

          <label>
            次の場所への移動手段
            <select value={spot.transportToNext ?? ''} onChange={(e) => set('transportToNext', (e.target.value || undefined) as Spot['transportToNext'])}>
              <option value="">—</option>
              {TRANSPORTS.map((t) => (
                <option key={t} value={t}>
                  {TRANSPORT_LABEL[t]}
                </option>
              ))}
            </select>
          </label>

          <div className="row gap">
            <label className="grow">
              費用
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={spot.cost ?? ''}
                onChange={(e) => set('cost', e.target.value === '' ? undefined : Number(e.target.value))}
              />
            </label>
            <label style={{ width: '6em' }}>
              通貨
              <input
                value={spot.currency ?? ''}
                placeholder={trip.baseCurrency}
                maxLength={3}
                onChange={(e) => set('currency', e.target.value.toUpperCase() || undefined)}
              />
            </label>
          </div>

          <label>
            予約番号
            <input value={spot.bookingRef ?? ''} onChange={(e) => set('bookingRef', e.target.value)} />
          </label>
          <label>
            URL
            <input type="url" value={spot.url ?? ''} onChange={(e) => set('url', e.target.value)} placeholder="https://" />
          </label>
          <label>
            メモ
            <textarea rows={3} value={spot.memo ?? ''} onChange={(e) => set('memo', e.target.value)} />
          </label>

          {existing && (
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                if (!confirm(`「${spot.title}」を削除しますか？`)) return;
                onChange(deleteSpot(trip, spot.id));
                onClose();
              }}
            >
              この予定を削除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PlaceSearch({
  near,
  value: q,
  onTitle,
  onPick,
}: {
  near?: { lat: number; lng: number };
  value: string;
  onTitle: (t: string) => void;
  onPick: (p: Place) => void;
}) {
  const [autoFocus] = useState(!q);
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await searchPlaces(q.trim(), near);
      setResults(r);
      if (!r.length) setErr('見つかりませんでした');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <label>
        名前・場所
        <div className="row gap">
          <input
            className="grow"
            value={q}
            placeholder="例: 清水寺"
            autoFocus={autoFocus}
            onChange={(e) => onTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void search();
              }
            }}
          />
          <button type="button" className="btn" onClick={() => void search()} disabled={busy}>
            {busy ? '…' : '🔍 検索'}
          </button>
        </div>
      </label>
      {err && <p className="muted small">{err}</p>}
      {results.length > 0 && (
        <ul className="results">
          {results.map((p, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  onPick(p);
                  setResults([]);
                }}
              >
                <strong>{p.name}</strong>
                <div className="muted small ellipsis">{p.address}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PickMap({
  center,
  value,
  onPick,
}: {
  center: [number, number];
  value: [number, number] | null;
  onPick: (lat: number, lng: number) => void;
}) {
  return (
    <div className="pick-map">
      <MapContainer center={center} zoom={value ? 16 : 13} style={{ height: '100%' }}>
        <TileLayer url={TILE_URL} attribution={TILE_ATTR} />
        <ClickHandler onPick={onPick} />
        <Recenter value={value} />
        {value && <Marker position={value} icon={numberIcon('●', { active: true })} />}
      </MapContainer>
      <div className="pick-hint">地図をタップして位置を指定</div>
    </div>
  );
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))) });
  return null;
}

function Recenter({ value }: { value: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (value) map.panTo(value);
  }, [map, value?.[0], value?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
