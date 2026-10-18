import { describe, expect, it } from 'vitest';
import { sampleTrip } from '../sample';
import type { Place } from '../types/place';
import { mergeById } from './merge';
import { guessArea, recordVisits, suggestPlaces } from './places';
import { createTrip, upsertSpot } from './tripOps';

const place = (p: Partial<Place> & { id: string; title: string }): Place => ({ category: 'sightseeing', visits: [], ...p });

describe('recordVisits', () => {
  it('records a visit when a spot is marked done, creating the place if needed', () => {
    const prev = sampleTrip();
    const day = prev.days[0];
    const next = upsertSpot(prev, day.date, { ...day.items[1], done: true }); // 清水寺
    const r = recordVisits([], prev, next);
    expect(r.places).toHaveLength(1);
    expect(r.places[0]).toMatchObject({ title: '清水寺', visits: [{ date: day.date, tripId: prev.id }] });
    expect(r.trip.days[0].items.find((s) => s.id === 's2')?.placeId).toBe(r.places[0].id);
    expect(r.ask.map((p) => p.id)).toEqual([r.places[0].id]);
  });

  it('matches an existing place by name and does not ask again when rated', () => {
    const prev = sampleTrip();
    const existing = place({ id: 'p1', title: '清水寺', lat: 34.995, lng: 135.785, rating: 3, visits: [{ date: '2020-04-01' }] });
    const next = upsertSpot(prev, prev.days[0].date, { ...prev.days[0].items[1], done: true });
    const r = recordVisits([existing], prev, next);
    expect(r.places).toHaveLength(1);
    expect(r.places[0].visits).toHaveLength(2);
    expect(r.ask).toEqual([]);
  });

  it('skips transport and lodging unless linked, and undoes on uncheck', () => {
    const prev = sampleTrip();
    const d = prev.days[0].date;
    const station = upsertSpot(prev, d, { ...prev.days[0].items[0], done: true }); // 京都駅 (transport)
    expect(recordVisits([], prev, station).changed).toBe(false);

    const done = upsertSpot(prev, d, { ...prev.days[0].items[1], done: true });
    const r1 = recordVisits([], prev, done);
    const undone = upsertSpot(r1.trip, d, { ...r1.trip.days[0].items[1], done: false });
    const r2 = recordVisits(r1.places, r1.trip, undone);
    expect(r2.places[0].visits).toEqual([]);
  });
});

describe('suggestPlaces', () => {
  it('ranks unvisited first, then rating 3, then other visited, by distance', () => {
    const trip = sampleTrip();
    const list = [
      place({ id: 'far-new', title: '遠い未訪問', lat: 43.06, lng: 141.35 }),
      place({ id: 'near-visited', title: '近い訪問済み', lat: 35.0, lng: 135.77, visits: [{}], rating: 1 }),
      place({ id: 'near-new', title: '近い未訪問', lat: 35.01, lng: 135.76 }),
      place({ id: 'love', title: 'また行きたい', lat: 35.0, lng: 135.78, visits: [{}], rating: 3 }),
    ];
    expect(suggestPlaces(list, trip).map((s) => s.place.id)).toEqual(['near-new', 'far-new', 'love', 'near-visited']);
  });
});

describe('mergeById', () => {
  it('merges independent changes and keeps additions from both sides', () => {
    const base = [place({ id: 'a', title: 'A' }), place({ id: 'b', title: 'B' })];
    const local = [{ ...base[0], rating: 2 as const, visits: [{}] }, base[1], place({ id: 'c', title: 'C' })];
    const remote = [base[0], { ...base[1], memo: 'remote' }, place({ id: 'd', title: 'D' })];
    const { merged, conflicts } = mergeById(base, local, remote, (p) => p.title);
    expect(conflicts).toEqual([]);
    expect(merged.map((p) => p.id)).toEqual(['a', 'b', 'd', 'c']);
    expect(merged[0].rating).toBe(2);
    expect(merged[1].memo).toBe('remote');
  });
});

describe('guessArea', () => {
  it('extracts prefecture or foreign country', () => {
    expect(guessArea('清水寺, 清水, 東山区, 京都市, 京都府, 605-0862, 日本')).toBe('京都府');
    expect(guessArea('Eiffel Tower, Paris, France')).toBe('France');
  });
});

describe('suggestPlaces（日程未定）', () => {
  it('prefers places in the destination, then nearer to home', () => {
    const trip = createTrip('九州', undefined, undefined, 'JPY', { destination: '熊本' });
    const home = { lat: 33.59, lng: 130.4 }; // 福岡
    const list = [
      place({ id: 'far', title: '桜島', area: '鹿児島県', lat: 31.58, lng: 130.66 }),
      place({ id: 'aso', title: '阿蘇', area: '熊本県', lat: 32.88, lng: 131.1 }),
      place({ id: 'near', title: '太宰府', area: '福岡県', lat: 33.52, lng: 130.53 }),
      place({ id: 'amakusa', title: '天草', area: '熊本県', lat: 32.45, lng: 130.19 }),
    ];
    const ids = suggestPlaces(list, trip, home).map((s) => s.place.id);
    expect(ids).toEqual(['aso', 'amakusa', 'near', 'far']);
  });
});
