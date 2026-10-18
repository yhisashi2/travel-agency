import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { reverseGeocode, searchPlaces, type Place } from '../lib/geocode';
import { VEHICLE_LABEL, estimateLeg, formatMinutes, isRoadMode, toHighway, vehicleOf } from '../lib/highway';
import { placeFromSpot } from '../lib/places';
import { updatePlaces, usePlaces } from '../lib/store';
import { IDEAS, addMinutes, deleteSpot, findSpot, formatDate, newId, spotsWithLocation, upsertSpot, type ListKey } from '../lib/tripOps';
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
          <div className="chips duration-chips" role="group" aria-label="滞在時間から終了時刻を入れる">
            {(
              [
                [30, '+30分'],
                [60, '+1時間'],
                [90, '+1.5時間'],
                [120, '+2時間'],
              ] as const
            ).map(([min, label]) => (
              <button
                key={min}
                type="button"
                className="chip sm"
                disabled={!spot.time}
                onClick={() => spot.time && set('endTime', addMinutes(spot.time, min))}
              >
                {label}
              </button>
            ))}
            <button type="button" className="chip sm" disabled={!spot.endTime} onClick={() => set('endTime', undefined)}>
              クリア
            </button>
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

          {isRoadMode(spot.transportToNext) && (
            <HighwayFields trip={trip} listKey={listKey} spot={spot} onChange={(highway) => setSpot((s) => ({ ...s, highway }))} />
          )}

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

          <ListLink spot={spot} onLink={(placeId) => setSpot((s) => ({ ...s, placeId }))} />

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

/** 全体の行きたい所リストとの紐付け */
function ListLink({ spot, onLink }: { spot: Spot; onLink: (placeId: string | undefined) => void }) {
  const place = usePlaces().find((p) => p.id === spot.placeId);
  if (place) {
    return (
      <div className="row between small">
        <span>📍 行きたい所リストに登録済み{place.visits.length ? '（行ったことあり）' : ''}</span>
        <button type="button" className="link small" onClick={() => onLink(undefined)}>
          紐付けを外す
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      className="btn sm"
      disabled={!spot.title.trim()}
      onClick={() => {
        const p = placeFromSpot({ ...spot, title: spot.title.trim() });
        void updatePlaces((list) => [...list, p]);
        onLink(p.id);
      }}
    >
      📍 行きたい所リストにも保存
    </button>
  );
}

export function PlaceSearch({
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

export function PickMap({
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

/** 次の場所までの高速道路（使う/使わない、区間、料金、時間、距離）と概算 */
function HighwayFields({
  trip,
  listKey,
  spot,
  onChange,
}: {
  trip: Trip;
  listKey: ListKey;
  spot: Spot;
  onChange: (h: Spot['highway']) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hw = spot.highway;
  const mode = spot.transportToNext!;
  const list = listKey === IDEAS ? trip.ideas : (trip.days.find((d) => d.date === listKey)?.items ?? []);
  const idx = list.findIndex((s) => s.id === spot.id);
  const next = idx >= 0 ? list[idx + 1] : undefined;
  const canEstimate = spot.lat != null && spot.lng != null && next?.lat != null && next.lng != null;
  // 手で直した項目は概算ではなくなる
  const edit = (patch: Partial<NonNullable<Spot['highway']>>) => onChange({ use: hw?.use ?? true, ...hw, ...patch, estimated: false });
  const num = (v: string) => (v === '' ? undefined : Math.max(0, Number(v)));

  const estimate = async (use: boolean) => {
    if (!canEstimate) return;
    setBusy(true);
    setErr(null);
    try {
      const e = await estimateLeg({ lat: spot.lat!, lng: spot.lng! }, { lat: next!.lat!, lng: next!.lng! }, mode, use);
      onChange(toHighway(e, use));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hw-box">
      <div className="row between">
        <strong className="small">🛣️ 高速道路</strong>
        <div className="segmented sm" role="radiogroup" aria-label="高速道路">
          {(
            [
              [undefined, '未定'],
              [true, '使う'],
              [false, '使わない'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={hw?.use === v}
              className={hw?.use === v ? 'on' : ''}
              onClick={() => (v === undefined ? onChange(undefined) : canEstimate ? void estimate(v) : edit({ use: v }))}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {hw && (
        <>
          {hw.use && (
            <label>
              区間
              <input value={hw.section ?? ''} placeholder="例: 吹田IC→小倉東IC" onChange={(e) => edit({ section: e.target.value || undefined })} />
            </label>
          )}
          <div className="row gap">
            {hw.use && (
              <label className="grow">
                料金（円）
                <input type="number" inputMode="numeric" min={0} value={hw.toll ?? ''} onChange={(e) => edit({ toll: num(e.target.value) })} />
              </label>
            )}
            <label className="grow">
              時間（分）
              <input type="number" inputMode="numeric" min={0} value={hw.minutes ?? ''} onChange={(e) => edit({ minutes: num(e.target.value) })} />
            </label>
            <label className="grow">
              距離（km）
              <input type="number" inputMode="decimal" min={0} value={hw.km ?? ''} onChange={(e) => edit({ km: num(e.target.value) })} />
            </label>
          </div>
        </>
      )}
      <div className="row gap between">
        <span className="muted small">
          {hw?.estimated
            ? `概算（${hw.use ? `${VEHICLE_LABEL[vehicleOf(mode)]}・ETC` : '下道'}）${hw.minutes != null ? ` 約${formatMinutes(hw.minutes)}` : ''}`
            : canEstimate
              ? '次の予定までの時間・距離・料金を計算できます'
              : '次の予定に位置がないため概算できません'}
        </span>
        {canEstimate && (
          <button type="button" className="btn sm" disabled={busy} onClick={() => void estimate(hw?.use ?? true)}>
            {busy ? '計算中…' : '概算を計算'}
          </button>
        )}
      </div>
      {err && <p className="warn-text small">{err}</p>}
    </div>
  );
}
