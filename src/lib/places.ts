import { isVisited, type Place } from '../types/place';
import type { Spot, Trip } from '../types/trip';
import { distanceMeters, newId, spotsWithLocation } from './tripOps';

const normalize = (s: string) => s.replace(/[\s　()（）・]/g, '').toLowerCase();

/** 住所（Nominatim の display_name）から都道府県/国を推定 */
export function guessArea(address?: string): string | undefined {
  if (!address) return undefined;
  const parts = address.split(',').map((s) => s.trim());
  const pref = parts.find((p) => /^.+[都道府県]$/.test(p));
  if (pref) return pref;
  const country = parts[parts.length - 1];
  return country && country !== '日本' ? country : undefined;
}

export function placeFromSpot(s: Spot): Place {
  return {
    id: newId(),
    title: s.title,
    category: s.category,
    area: guessArea(s.address),
    lat: s.lat,
    lng: s.lng,
    address: s.address,
    url: s.url,
    visits: [],
    createdAt: new Date().toISOString(),
  };
}

export function spotFromPlace(p: Place): Spot {
  return {
    id: newId(),
    title: p.title,
    category: p.category,
    lat: p.lat,
    lng: p.lng,
    address: p.address,
    url: p.url,
    memo: p.memo,
    placeId: p.id,
  };
}

/** 予定に対応する全体リストの場所（placeId、なければ同名かつ 1km 以内） */
export function matchPlace(places: Place[], s: Spot): Place | undefined {
  if (s.placeId) return places.find((p) => p.id === s.placeId);
  const name = normalize(s.title);
  return places.find((p) => {
    if (normalize(p.title) !== name) return false;
    if (p.lat == null || p.lng == null || s.lat == null || s.lng == null) return true;
    return distanceMeters({ lat: p.lat, lng: p.lng }, { lat: s.lat, lng: s.lng }) < 1000;
  });
}

/** 移動・宿は自動記録しない（明示的にリストと紐付けた予定は記録する） */
const AUTO_RECORD = new Set(['sightseeing', 'food', 'other']);

export interface VisitResult {
  places: Place[];
  trip: Trip;
  /** 評価を聞く場所 */
  ask: Place[];
  changed: boolean;
}

/**
 * 予定の完了/未完了の変化を全体リストへ反映する。
 * 完了: 訪問を記録（リストに無ければ追加）し予定に placeId を付ける / 未完了に戻す: その旅行での訪問を取り消す
 */
export function recordVisits(places: Place[], prev: Trip, next: Trip): VisitResult {
  const prevDone = new Map(prev.days.flatMap((d) => d.items.map((s) => [s.id, !!s.done] as const)));
  let list = [...places];
  const ask: Place[] = [];
  let changed = false;

  const days = next.days.map((d) => ({
    ...d,
    items: d.items.map((s) => {
      const was = prevDone.get(s.id) ?? false;
      if (!!s.done === was) return s;
      if (s.done) {
        if (!s.placeId && !AUTO_RECORD.has(s.category)) return s;
        let place = matchPlace(list, s);
        if (!place) {
          place = placeFromSpot(s);
          list = [...list, place];
        }
        if (!place.visits.some((v) => v.tripId === next.id && v.date === d.date)) {
          const updated = { ...place, visits: [...place.visits, { date: d.date, tripId: next.id }] };
          list = list.map((p) => (p.id === place!.id ? updated : p));
          if (!updated.rating) ask.push(updated);
        }
        changed = true;
        return s.placeId === place.id ? s : { ...s, placeId: place.id };
      }
      // 未完了に戻した
      if (s.placeId) {
        list = list.map((p) =>
          p.id === s.placeId ? { ...p, visits: p.visits.filter((v) => !(v.tripId === next.id && v.date === d.date)) } : p,
        );
        changed = true;
      }
      return s;
    }),
  }));

  return { places: list, trip: changed ? { ...next, days } : next, ask, changed };
}

export interface Suggestion {
  place: Place;
  /** 旅程の最寄り地点からの距離 (m)。位置不明なら null */
  distance: number | null;
  inTrip: boolean;
}

/**
 * 旅行への候補: 未訪問 → また行きたい(★3) → その他の訪問済み の順、同じ順位なら旅程に近い順
 */
export function suggestPlaces(places: Place[], trip: Trip): Suggestion[] {
  const pts = spotsWithLocation([...trip.days.flatMap((d) => d.items), ...trip.ideas]);
  const used = new Set([...trip.days.flatMap((d) => d.items), ...trip.ideas].map((s) => s.placeId).filter(Boolean));
  const rank = (p: Place) => (!isVisited(p) ? 0 : p.rating === 3 ? 1 : 2);
  return places
    .map((place) => ({
      place,
      inTrip: used.has(place.id),
      distance:
        place.lat != null && place.lng != null && pts.length
          ? Math.min(...pts.map((s) => distanceMeters(s, { lat: place.lat!, lng: place.lng! })))
          : null,
    }))
    .sort((a, b) => {
      const r = rank(a.place) - rank(b.place);
      if (r) return r;
      if (a.distance == null) return b.distance == null ? 0 : 1;
      if (b.distance == null) return -1;
      return a.distance - b.distance;
    });
}

export function lastVisit(p: Place): string | undefined {
  return p.visits
    .map((v) => v.date)
    .filter((d): d is string => !!d)
    .sort()
    .pop();
}
