import { useMemo, useState } from 'react';
import { suggestPlaces } from '../lib/places';
import { useHome, usePlaces } from '../lib/store';
import { IDEAS, formatDate, formatDistance, spotsWithLocation, type ListKey } from '../lib/tripOps';
import { RATING_LABEL, isVisited, type Place } from '../types/place';
import { CATEGORY_ICON, type Trip } from '../types/trip';
import { Stars } from './PlaceEditor';

/** 全体の行きたい所リストから旅行へ追加（未訪問 → また行きたい → 訪問済み、それぞれ旅程に近い順） */
export default function PlacePicker({
  trip,
  onAdd,
  onClose,
}: {
  trip: Trip;
  onAdd: (place: Place, listKey: ListKey) => void;
  onClose: () => void;
}) {
  const places = usePlaces();
  const home = useHome();
  const [onlyNew, setOnlyNew] = useState(true);
  const [q, setQ] = useState('');
  const [listKey, setListKey] = useState<ListKey>(IDEAS);
  const [added, setAdded] = useState<Set<string>>(new Set());
  // 位置付きの予定がまだ無ければ、距離は自宅から（suggestPlaces と同じ基準）
  const fromHome = !!home && !spotsWithLocation([...trip.days.flatMap((d) => d.items), ...trip.ideas]).length;

  const items = useMemo(
    () =>
      suggestPlaces(places, trip, home).filter(
        (s) => (!onlyNew || !isVisited(s.place)) && (!q || [s.place.title, s.place.area, s.place.memo].some((x) => x?.includes(q))),
      ),
    [places, trip, home, onlyNew, q],
  );

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="行きたい所から追加">
        <div className="sheet-head">
          <span />
          <strong>📍 行きたい所から追加</strong>
          <button className="link strong" onClick={onClose}>
            完了
          </button>
        </div>
        <div className="sheet-body">
          <div className="form" style={{ gap: 8 }}>
            <label>
              追加先
              <select value={listKey} onChange={(e) => setListKey(e.target.value)}>
                <option value={IDEAS}>💡 行きたい場所（日程未定）</option>
                {trip.days.map((d, i) => (
                  <option key={d.date} value={d.date}>
                    {i + 1}日目 {formatDate(d.date)} {d.title ?? ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="row gap">
              <input className="grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 絞り込み" />
              <label className="row small" style={{ flexDirection: 'row', gap: 4, color: 'var(--text)' }}>
                <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} style={{ width: 'auto' }} />
                未訪問のみ
              </label>
            </div>
          </div>

          {places.length === 0 && <p className="muted small">行きたい所リストが空です。トップ画面の 📍 から登録できます。</p>}
          <ul className="place-list" style={{ marginTop: 10 }}>
            {items.map(({ place: p, distance, inTrip }) => {
              const done = inTrip || added.has(p.id);
              return (
                <li key={p.id}>
                  <div className="place-card row between">
                    <div className="grow ellipsis">
                      <strong>
                        {CATEGORY_ICON[p.category]} {p.title}
                      </strong>
                      <div className="muted small ellipsis">
                        {isVisited(p) ? (
                          <>
                            <Stars rating={p.rating} /> {p.rating ? RATING_LABEL[p.rating] : '行った'}
                          </>
                        ) : (
                          <span className="new-tag">未訪問</span>
                        )}
                        {distance != null && ` ・${fromHome ? '🏠自宅' : '旅程'}から ${formatDistance(distance)}`}
                        {p.area && ` ・${p.area}`}
                      </div>
                    </div>
                    <button
                      className={`btn sm ${done ? '' : 'primary'}`}
                      disabled={done}
                      onClick={() => {
                        onAdd(p, listKey);
                        setAdded((s) => new Set(s).add(p.id));
                      }}
                    >
                      {done ? '追加済み' : '追加'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
