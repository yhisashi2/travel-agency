import { useMemo, useState } from 'react';
import { reverseGeocode } from '../lib/geocode';
import { guessArea } from '../lib/places';
import { updatePlaces, usePlaces } from '../lib/store';
import { newId, todayLocal } from '../lib/tripOps';
import { RATING_LABEL, type Place, type Rating } from '../types/place';
import { CATEGORIES, CATEGORY_ICON, CATEGORY_LABEL } from '../types/trip';
import { PickMap, PlaceSearch } from './SpotEditor';

export function Stars({ rating, max = 3 }: { rating?: number; max?: number }) {
  return (
    <span className="stars" aria-label={rating ? `お気に入り ${rating}` : '未評価'}>
      {Array.from({ length: max }, (_, i) => (i < (rating ?? 0) ? '★' : '☆')).join('')}
    </span>
  );
}

export function RatingPicker({ value, onChange }: { value?: Rating; onChange: (r: Rating | undefined) => void }) {
  return (
    <div className="chips">
      {([1, 2, 3] as Rating[]).map((r) => (
        <button key={r} type="button" className={`chip ${value === r ? 'on' : ''}`} onClick={() => onChange(value === r ? undefined : r)}>
          <Stars rating={r} /> {RATING_LABEL[r]}
        </button>
      ))}
    </div>
  );
}

export default function PlaceEditor({ placeId, onClose }: { placeId?: string; onClose: () => void }) {
  const places = usePlaces();
  const existing = placeId ? places.find((p) => p.id === placeId) : undefined;
  const [place, setPlace] = useState<Place>(
    () => existing ?? { id: newId(), title: '', category: 'sightseeing', visits: [], createdAt: new Date().toISOString() },
  );
  const [showMap, setShowMap] = useState(false);
  const set = <K extends keyof Place>(k: K, v: Place[K]) => setPlace((p) => ({ ...p, [k]: v === '' && k !== 'title' ? undefined : v }));

  const near = useMemo(() => {
    const pts = places.filter((p) => p.lat != null && p.lng != null);
    return pts.length ? { lat: pts[pts.length - 1].lat!, lng: pts[pts.length - 1].lng! } : undefined;
  }, [places]);

  const visited = place.visits.length > 0;

  const save = () => {
    if (!place.title.trim()) return;
    const p = { ...place, title: place.title.trim(), rating: visited ? place.rating : undefined };
    void updatePlaces((list) => (list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p]));
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="行きたい所の編集">
        <div className="sheet-head">
          <button className="link" onClick={onClose}>
            キャンセル
          </button>
          <strong>{existing ? '場所を編集' : '行きたい所を追加'}</strong>
          <button className="link strong" onClick={save} disabled={!place.title.trim()}>
            保存
          </button>
        </div>

        <div className="sheet-body form">
          <PlaceSearch
            near={near}
            value={place.title}
            onTitle={(title) => set('title', title)}
            onPick={(r) =>
              setPlace((p) => ({ ...p, title: p.title || r.name, lat: r.lat, lng: r.lng, address: r.address, area: p.area ?? guessArea(r.address) }))
            }
          />

          <div className="chips">
            {CATEGORIES.map((c) => (
              <button key={c} type="button" className={`chip ${place.category === c ? 'on' : ''}`} onClick={() => set('category', c)}>
                {CATEGORY_ICON[c]} {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>

          <label>
            エリア（都道府県・国など）
            <input value={place.area ?? ''} onChange={(e) => set('area', e.target.value)} placeholder="例: 熊本県" />
          </label>

          <div className="loc-box">
            <div className="row between">
              <span className="small">
                📍 {place.lat != null ? (place.address ?? `${place.lat.toFixed(5)}, ${place.lng?.toFixed(5)}`) : <span className="muted">位置未設定</span>}
              </span>
              <button type="button" className="btn sm" onClick={() => setShowMap((v) => !v)}>
                {showMap ? '閉じる' : '地図で指定'}
              </button>
            </div>
            {showMap && (
              <PickMap
                center={place.lat != null && place.lng != null ? [place.lat, place.lng] : near ? [near.lat, near.lng] : [35.68, 139.76]}
                value={place.lat != null && place.lng != null ? [place.lat, place.lng] : null}
                onPick={async (lat, lng) => {
                  setPlace((p) => ({ ...p, lat, lng, address: undefined }));
                  const r = await reverseGeocode(lat, lng).catch(() => null);
                  if (r)
                    setPlace((p) =>
                      p.lat === lat && p.lng === lng ? { ...p, address: r.address, title: p.title || r.name, area: p.area ?? guessArea(r.address) } : p,
                    );
                }}
              />
            )}
          </div>

          <div className="card">
            <div className="row between">
              <strong>{visited ? '✅ 行ったことがある' : '🆕 まだ行っていない'}</strong>
              <button
                type="button"
                className="btn sm"
                onClick={() => setPlace((p) => (p.visits.length ? { ...p, visits: [], rating: undefined } : { ...p, visits: [{}] }))}
              >
                {visited ? '未訪問にする' : '行った'}
              </button>
            </div>
            {visited && (
              <>
                <p className="muted small">訪問日（わからなければ空欄）</p>
                {place.visits.map((v, i) => (
                  <div key={i} className="row gap" style={{ marginBottom: 6 }}>
                    <input
                      type="date"
                      className="grow"
                      value={v.date ?? ''}
                      onChange={(e) =>
                        setPlace((p) => ({ ...p, visits: p.visits.map((x, j) => (j === i ? { ...x, date: e.target.value || undefined } : x)) }))
                      }
                    />
                    {v.tripId && <span className="muted small">旅行で記録</span>}
                    <button type="button" className="btn sm" aria-label="この訪問を削除" onClick={() => setPlace((p) => ({ ...p, visits: p.visits.filter((_, j) => j !== i) }))}>
                      ✕
                    </button>
                  </div>
                ))}
                <button type="button" className="link small" onClick={() => setPlace((p) => ({ ...p, visits: [...p.visits, { date: todayLocal() }] }))}>
                  ＋ 訪問を追加
                </button>
                <p className="muted small" style={{ marginTop: 10 }}>
                  お気に入り度
                </p>
                <RatingPicker value={place.rating} onChange={(r) => set('rating', r)} />
              </>
            )}
          </div>

          <label>
            URL
            <input type="url" value={place.url ?? ''} onChange={(e) => set('url', e.target.value)} placeholder="https://" />
          </label>
          <label>
            メモ
            <textarea rows={3} value={place.memo ?? ''} onChange={(e) => set('memo', e.target.value)} placeholder="行きたい理由、ベストシーズンなど" />
          </label>

          {existing && (
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                if (!confirm(`「${place.title}」をリストから削除しますか？`)) return;
                void updatePlaces((list) => list.filter((x) => x.id !== place.id));
                onClose();
              }}
            >
              リストから削除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
