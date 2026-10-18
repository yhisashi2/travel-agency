import L from 'leaflet';
import { useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import { TILE_ATTR, TILE_URL, numberIcon } from '../components/mapIcons';
import PlaceEditor, { Stars } from '../components/PlaceEditor';
import SyncBadge from '../components/SyncBadge';
import { ConflictRow } from '../components/TripInfo';
import type { Conflict } from '../lib/merge';
import { lastVisit } from '../lib/places';
import { navigate } from '../lib/router';
import { resolvePlaceConflict, useHome, usePlaces, useStore } from '../lib/store';
import { distanceMeters, formatDate, formatDistance } from '../lib/tripOps';
import { RATING_LABEL, isVisited, type Place } from '../types/place';
import { CATEGORIES, CATEGORY_ICON, CATEGORY_LABEL, type Category } from '../types/trip';

type Filter = 'todo' | 'done' | 'all';
/** 評価の絞り込み: 3 = ★★★ のみ、2 = ★★ 以上 */
type RatingFilter = '' | '3' | '2+';
const matchesRating = (rating: number | undefined, f: RatingFilter) => !f || (f === '3' ? rating === 3 : (rating ?? 0) >= 2);
const NO_CONFLICTS: Conflict[] = [];

export default function Places() {
  const places = usePlaces();
  const conflicts = useStore((s) => s.places?.conflicts) ?? NO_CONFLICTS;
  const [filter, setFilter] = useState<Filter>('todo');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [q, setQ] = useState('');
  const [area, setArea] = useState('');
  const [cat, setCat] = useState<Category | ''>('');
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('');
  // 評価は行った場所にしか無いので「未訪問」タブでは絞り込まない
  const rf: RatingFilter = filter === 'todo' ? '' : ratingFilter;
  const [edit, setEdit] = useState<{ id?: string } | null>(null);
  const home = useHome();
  const [nearFirst, setNearFirst] = useState(false);
  const fromHome = (p: Place) => (home && p.lat != null && p.lng != null ? distanceMeters(home, { lat: p.lat, lng: p.lng }) : null);

  const counts = { todo: places.filter((p) => !isVisited(p)).length, done: places.filter(isVisited).length, all: places.length };
  const areas = useMemo(() => [...new Set(places.map((p) => p.area).filter((a): a is string => !!a))].sort(), [places]);

  const shown = places.filter(
    (p) =>
      (filter === 'all' || (filter === 'todo' ? !isVisited(p) : isVisited(p))) &&
      (!area || p.area === area) &&
      (!cat || p.category === cat) &&
      matchesRating(p.rating, rf) &&
      (!q || [p.title, p.area, p.memo, p.address].some((x) => x?.toLowerCase().includes(q.toLowerCase()))),
  );
  const groups = useMemo(() => {
    if (nearFirst && home) {
      const d = (p: Place) => fromHome(p) ?? Infinity;
      return [['🏠 自宅から近い順', [...shown].sort((a, b) => d(a) - d(b))]] as [string, Place[]][];
    }
    const m = new Map<string, Place[]>();
    for (const p of shown) {
      const k = p.area ?? 'エリア未設定';
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()].sort(([a], [b]) => (a === 'エリア未設定' ? 1 : b === 'エリア未設定' ? -1 : a.localeCompare(b, 'ja')));
  }, [shown, nearFirst, home]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page">
      <header className="topbar">
        <button className="icon-btn" aria-label="戻る" onClick={() => navigate()}>
          ‹
        </button>
        <h1>📍 行きたい所</h1>
        <SyncBadge />
      </header>

      <div className="filters">
        <div className="segmented" role="tablist">
          {(
            [
              ['todo', '未訪問'],
              ['done', '行った'],
              ['all', 'すべて'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
              {label} <span className="muted">{counts[k]}</span>
            </button>
          ))}
        </div>
        <div className="row gap">
          <input className="grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 名前・メモで検索" />
          {areas.length > 0 && (
            <select value={area} onChange={(e) => setArea(e.target.value)} style={{ width: '8.5em' }}>
              <option value="">全エリア</option>
              {areas.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          )}
          {home && view === 'list' && (
            <button className={`btn sm ${nearFirst ? 'primary' : ''}`} aria-pressed={nearFirst} onClick={() => setNearFirst((v) => !v)}>
              🏠 近い順
            </button>
          )}
        </div>
        <div className="row gap">
          <select className="grow" value={cat} onChange={(e) => setCat(e.target.value as Category | '')} aria-label="カテゴリ">
            <option value="">全カテゴリ</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_ICON[c]} {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          {filter !== 'todo' && (
            <select className="grow" value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value as RatingFilter)} aria-label="評価">
              <option value="">全評価</option>
              <option value="3">★★★ のみ</option>
              <option value="2+">★★ 以上</option>
            </select>
          )}
          <button className="btn sm" onClick={() => setView((v) => (v === 'list' ? 'map' : 'list'))}>
            {view === 'list' ? '🗺️ 地図' : '☰ 一覧'}
          </button>
        </div>
      </div>

      {view === 'map' ? (
        <PlacesMap places={shown} onEdit={(id) => setEdit({ id })} />
      ) : (
        <main className="content stack">
          {conflicts.length > 0 && (
            <div className="card">
              <h3>⚠️ 競合の確認</h3>
              {conflicts.map((c) => (
                <ConflictRow key={c.id} c={c} onPick={(useRemote) => void resolvePlaceConflict(c, useRemote)} />
              ))}
            </div>
          )}

          {places.length === 0 && (
            <div className="empty">
              <p>旅行に関係なく「いつか行きたい所」をためておくリストです。</p>
              <p className="muted small">行った場所はお気に入り度を付けて記録でき、旅行の計画では未訪問の場所を優先して提案します。旅行中に予定を「完了」にすると自動で記録されます。</p>
            </div>
          )}

          {groups.map(([g, list]) => (
            <section key={g}>
              <h3 className="group-title">
                {g} <span className="muted small">{list.length}</span>
              </h3>
              <ul className="place-list">
                {list.map((p) => (
                  <li key={p.id}>
                    <button className="place-card" onClick={() => setEdit({ id: p.id })}>
                      <div className="row between">
                        <strong className="ellipsis">
                          {CATEGORY_ICON[p.category]} {p.title}
                        </strong>
                        {isVisited(p) ? <Stars rating={p.rating} /> : <span className="pill">未訪問</span>}
                      </div>
                      <div className="muted small ellipsis">
                        {isVisited(p)
                          ? [p.rating ? RATING_LABEL[p.rating] : '未評価', lastVisit(p) ? `${formatDate(lastVisit(p)!)} 訪問` : '', p.visits.length > 1 ? `${p.visits.length}回` : '']
                              .filter(Boolean)
                              .join('・')
                          : (p.memo ?? '')}
                        {fromHome(p) != null && ` 🏠${formatDistance(fromHome(p)!)}`}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {places.length > 0 && shown.length === 0 && <p className="muted center">該当する場所はありません</p>}
        </main>
      )}

      <button className="fab-add" aria-label="行きたい所を追加" onClick={() => setEdit({})}>
        ＋
      </button>

      {edit && <PlaceEditor placeId={edit.id} onClose={() => setEdit(null)} />}
    </div>
  );
}

function PlacesMap({ places, onEdit }: { places: Place[]; onEdit: (id: string) => void }) {
  const located = places.filter((p): p is Place & { lat: number; lng: number } => p.lat != null && p.lng != null);
  const bounds = located.length ? L.latLngBounds(located.map((p) => [p.lat, p.lng])) : undefined;
  return (
    <div className="map-box places-map">
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [40, 40], maxZoom: 14 }}
        center={bounds ? undefined : [36.2, 138.25]}
        zoom={bounds ? undefined : 5}
        style={{ height: '100%' }}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTR} />
        {located.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={numberIcon(isVisited(p) ? '★'.repeat(p.rating ?? 0) || '✓' : '', { color: isVisited(p) ? '#94a3b8' : '#0f766e' })}
          >
            <Popup>
              <strong>
                {CATEGORY_ICON[p.category]} {p.title}
              </strong>
              <div className="muted small">{isVisited(p) ? `行った ${p.rating ? RATING_LABEL[p.rating] : ''}` : '未訪問'}</div>
              <button className="btn sm" style={{ marginTop: 6 }} onClick={() => onEdit(p.id)}>
                編集
              </button>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
