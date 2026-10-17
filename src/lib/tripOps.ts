import type { Day, Spot, Trip } from '../types/trip';

export const IDEAS = 'ideas' as const;
/** 日程の位置: 日付文字列 or 候補リスト */
export type ListKey = string | typeof IDEAS;

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return (s || 'trip') + '-' + Date.now().toString(36).slice(-5);
}

export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  while (d <= e && out.length < 120) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function createTrip(title: string, startDate: string, endDate: string, baseCurrency = 'JPY'): Trip {
  return {
    id: slugify(title),
    title,
    startDate,
    endDate,
    baseCurrency,
    rates: {},
    updatedAt: new Date().toISOString(),
    days: datesBetween(startDate, endDate).map((date) => ({ date, items: [] })),
    ideas: [],
  };
}

/** 期間変更: 既存日の予定は保持し、範囲外になった日の予定は候補へ退避 */
export function setTripDates(trip: Trip, startDate: string, endDate: string): Trip {
  const dates = datesBetween(startDate, endDate);
  const byDate = new Map(trip.days.map((d) => [d.date, d]));
  const orphaned = trip.days.filter((d) => !dates.includes(d.date)).flatMap((d) => d.items);
  return touch({
    ...trip,
    startDate,
    endDate,
    days: dates.map((date) => byDate.get(date) ?? { date, items: [] }),
    ideas: [...trip.ideas, ...orphaned],
  });
}

function touch(trip: Trip): Trip {
  return { ...trip, updatedAt: new Date().toISOString() };
}

function getList(trip: Trip, key: ListKey): Spot[] {
  if (key === IDEAS) return trip.ideas;
  return trip.days.find((d) => d.date === key)?.items ?? [];
}

function setList(trip: Trip, key: ListKey, items: Spot[]): Trip {
  if (key === IDEAS) return { ...trip, ideas: items };
  return { ...trip, days: trip.days.map((d) => (d.date === key ? { ...d, items } : d)) };
}

export function findSpot(trip: Trip, id: string): { key: ListKey; index: number; spot: Spot } | null {
  const i = trip.ideas.findIndex((s) => s.id === id);
  if (i >= 0) return { key: IDEAS, index: i, spot: trip.ideas[i] };
  for (const d of trip.days) {
    const j = d.items.findIndex((s) => s.id === id);
    if (j >= 0) return { key: d.date, index: j, spot: d.items[j] };
  }
  return null;
}

/** 時刻付きの予定を時刻順に並べる（時刻なしは相対位置を維持） */
export function sortByTime(items: Spot[]): Spot[] {
  if (!items.some((s) => s.time)) return items;
  return [...items]
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      if (a.s.time && b.s.time) return a.s.time.localeCompare(b.s.time) || a.i - b.i;
      return a.i - b.i;
    })
    .map((x) => x.s);
}

export function upsertSpot(trip: Trip, key: ListKey, spot: Spot): Trip {
  const found = findSpot(trip, spot.id);
  let t = trip;
  if (found && found.key === key) {
    const list = getList(t, key).map((s) => (s.id === spot.id ? spot : s));
    return touch(setList(t, key, list));
  }
  if (found) t = setList(t, found.key, getList(t, found.key).filter((s) => s.id !== spot.id));
  const list = [...getList(t, key), spot];
  return touch(setList(t, key, key === IDEAS ? list : sortByTime(list)));
}

export function deleteSpot(trip: Trip, id: string): Trip {
  const found = findSpot(trip, id);
  if (!found) return trip;
  return touch(setList(trip, found.key, getList(trip, found.key).filter((s) => s.id !== id)));
}

export function moveSpot(trip: Trip, id: string, toKey: ListKey, toIndex?: number): Trip {
  const found = findSpot(trip, id);
  if (!found) return trip;
  let t = setList(trip, found.key, getList(trip, found.key).filter((s) => s.id !== id));
  const target = [...getList(t, toKey)];
  const idx = toIndex === undefined ? target.length : Math.max(0, Math.min(toIndex, target.length));
  target.splice(idx, 0, found.spot);
  t = setList(t, toKey, target);
  return touch(t);
}

export function shiftSpot(trip: Trip, id: string, delta: -1 | 1): Trip {
  const found = findSpot(trip, id);
  if (!found) return trip;
  return moveSpot(trip, id, found.key, found.index + delta);
}

export function updateDay(trip: Trip, date: string, patch: Partial<Day>): Trip {
  return touch({ ...trip, days: trip.days.map((d) => (d.date === date ? { ...d, ...patch } : d)) });
}

export function spotsWithLocation(items: Spot[]): (Spot & { lat: number; lng: number })[] {
  return items.filter((s): s is Spot & { lat: number; lng: number } => s.lat != null && s.lng != null);
}

/** 2 点間の距離 (m) */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
export function formatDate(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAYS[d.getUTCDay()]})`;
}

export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
