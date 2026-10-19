import { describe, expect, it } from 'vitest';
import { sampleTrip } from '../sample';
import type { Place } from '../types/place';
import type { Trip } from '../types/trip';
import { applyRemoteChoice, mergeById, mergeTrips } from './merge';
import { IDEAS, clearTripDates, deleteSpot, findSpot, moveSpot, setTripDates, updateDay, upsertSpot } from './tripOps';

const clone = (t: Trip): Trip => JSON.parse(JSON.stringify(t));
const place = (p: Partial<Place> & { id: string; title: string }): Place => ({ category: 'sightseeing', visits: [], ...p });
const allIds = (t: Trip) => [...t.days.flatMap((d) => d.items), ...t.ideas].map((s) => s.id).sort();

describe('mergeTrips', () => {
  it('does not report a conflict when both sides made the same change', () => {
    const base = sampleTrip();
    const edit = (t: Trip) => ({ ...upsertSpot(t, base.days[0].date, { ...base.days[0].items[1], memo: 'same' }), title: 'Same title' });
    const { merged, conflicts } = mergeTrips(base, edit(clone(base)), edit(clone(base)));
    expect(conflicts).toEqual([]);
    expect(merged.title).toBe('Same title');
    expect(findSpot(merged, 's2')?.spot.memo).toBe('same');
  });

  it('reports a top-level field conflict, keeps local, and resolves to remote', () => {
    const base = sampleTrip();
    const { merged, conflicts } = mergeTrips(base, { ...clone(base), title: 'Local' }, { ...clone(base), title: 'Remote' });
    expect(conflicts).toEqual([{ kind: 'field', id: 'title', label: 'title', local: 'Local', remote: 'Remote' }]);
    expect(merged.title).toBe('Local');
    expect(applyRemoteChoice(merged, conflicts[0]).title).toBe('Remote');
  });

  it('applies a local deletion when remote left the spot untouched', () => {
    const base = sampleTrip();
    const { merged, conflicts } = mergeTrips(base, deleteSpot(clone(base), 's4'), clone(base));
    expect(findSpot(merged, 's4')).toBeNull();
    expect(conflicts).toEqual([]);
  });

  it('keeps a locally deleted spot that remote edited, and resolves to the remote version', () => {
    const base = sampleTrip();
    const remote = upsertSpot(clone(base), base.days[0].date, { ...base.days[0].items[3], memo: 'remote' });
    const { merged, conflicts } = mergeTrips(base, deleteSpot(clone(base), 's4'), remote);
    expect(findSpot(merged, 's4')?.spot.memo).toBe('remote');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ kind: 'spot', id: 's4', local: null });
    expect(findSpot(applyRemoteChoice(merged, conflicts[0]), 's4')?.spot.memo).toBe('remote');
  });

  it('removes a spot deleted remotely when the conflict is resolved to remote', () => {
    const base = sampleTrip();
    const local = upsertSpot(clone(base), base.days[0].date, { ...base.days[0].items[3], memo: 'local' });
    const { merged, conflicts } = mergeTrips(base, local, deleteSpot(clone(base), 's4'));
    expect(conflicts[0]).toMatchObject({ kind: 'spot', id: 's4', remote: null });
    expect(findSpot(applyRemoteChoice(merged, conflicts[0]), 's4')).toBeNull();
  });

  it('drops a spot deleted on both sides without a conflict', () => {
    const base = sampleTrip();
    const { merged, conflicts } = mergeTrips(base, deleteSpot(clone(base), 's7'), deleteSpot(clone(base), 's7'));
    expect(findSpot(merged, 's7')).toBeNull();
    expect(conflicts).toEqual([]);
  });

  it('keeps spots added on both sides', () => {
    const base = sampleTrip();
    const d2 = base.days[1].date;
    const local = upsertSpot(clone(base), d2, { id: 'l-new', title: 'Local new', category: 'food' });
    const remote = upsertSpot(clone(base), IDEAS, { id: 'r-new', title: 'Remote new', category: 'food' });
    const { merged, conflicts } = mergeTrips(base, local, remote);
    expect(conflicts).toEqual([]);
    expect(findSpot(merged, 'l-new')?.key).toBe(d2);
    expect(findSpot(merged, 'r-new')?.key).toBe(IDEAS);
  });

  it('prefers the local position when both sides moved the same spot, without a conflict', () => {
    const base = sampleTrip();
    const local = moveSpot(clone(base), 's10', base.days[1].date);
    const remote = moveSpot(clone(base), 's10', base.days[2].date);
    const { merged, conflicts } = mergeTrips(base, local, remote);
    expect(findSpot(merged, 's10')?.key).toBe(base.days[1].date);
    expect(conflicts).toEqual([]);
  });

  it('follows a reorder done remotely', () => {
    const base = sampleTrip();
    const remote = moveSpot(clone(base), 's8', base.days[1].date, 0);
    const { merged } = mergeTrips(base, clone(base), remote);
    expect(merged.days[1].items.map((s) => s.id)).toEqual(['s8', 's6', 's7']);
  });

  it('merges day titles and reports a conflict when both changed them', () => {
    const base = sampleTrip();
    const [d1, d2] = base.days.map((d) => d.date);
    const local = updateDay(updateDay(clone(base), d1, { title: 'Local d1' }), d2, { title: 'Local d2' });
    const remote = updateDay(clone(base), d2, { title: 'Remote d2' });
    const { merged, conflicts } = mergeTrips(base, local, remote);
    expect(merged.days[0].title).toBe('Local d1');
    expect(merged.days[1].title).toBe('Local d2');
    expect(conflicts).toEqual([{ kind: 'field', id: `day:${d2}`, label: `${d2} のタイトル`, local: 'Local d2', remote: 'Remote d2' }]);
    expect(applyRemoteChoice(merged, conflicts[0]).days[1].title).toBe('Remote d2');
  });

  it('moves spots of days dropped by a remote period change to ideas', () => {
    const base = sampleTrip();
    const [d1, d2] = base.days.map((d) => d.date);
    const local = upsertSpot(clone(base), base.days[2].date, { ...base.days[2].items[0], memo: 'local' });
    const { merged, conflicts } = mergeTrips(base, local, setTripDates(clone(base), d1, d2));
    expect(conflicts).toEqual([]);
    expect(merged.endDate).toBe(d2);
    expect(merged.days.map((d) => d.date)).toEqual([d1, d2]);
    expect(findSpot(merged, 's9')).toMatchObject({ key: IDEAS, spot: { memo: 'local' } });
  });

  it('moves every spot to ideas when remote cleared the dates', () => {
    const base = sampleTrip();
    const { merged, conflicts } = mergeTrips(base, clone(base), clearTripDates(clone(base)));
    expect(conflicts).toEqual([]);
    expect(merged.days).toEqual([]);
    expect('startDate' in merged).toBe(false);
    expect('endDate' in merged).toBe(false);
    expect(merged.ideas.map((s) => s.id).sort()).toEqual(allIds(base));
  });

  it('takes all local changes when there is no base, treating remote as the base', () => {
    const remote = upsertSpot({ ...sampleTrip(), title: 'Remote' }, IDEAS, { id: 'r-only', title: 'Remote only', category: 'food' });
    const local = upsertSpot(sampleTrip(), sampleTrip().days[0].date, { ...sampleTrip().days[0].items[0], memo: 'local' });
    const { merged, conflicts } = mergeTrips(null, local, remote);
    expect(conflicts).toEqual([]);
    expect(merged.title).toBe(local.title);
    expect(findSpot(merged, 's1')?.spot.memo).toBe('local');
    expect(findSpot(merged, 'r-only')).toBeNull();
  });

  it('keeps the local id, merges budgetLimit, and omits unset fields', () => {
    const base = sampleTrip();
    const { merged } = mergeTrips(base, clone(base), { ...clone(base), id: 'other' });
    expect(merged.id).toBe(base.id);
    expect('budgetLimit' in merged).toBe(false);
    expect('destination' in merged).toBe(false);
    expect(mergeTrips(base, { ...clone(base), budgetLimit: 50000 }, clone(base)).merged.budgetLimit).toBe(50000);
  });
});

describe('applyRemoteChoice', () => {
  it('adds a spot missing locally to the end of ideas', () => {
    const trip = sampleTrip();
    const spot = { id: 'gone', title: 'Gone', category: 'food' as const };
    const t = applyRemoteChoice(trip, { kind: 'spot', id: 'gone', label: 'Gone', local: null, remote: spot });
    expect(t.ideas.at(-1)).toEqual(spot);
  });
});

describe('mergeById', () => {
  const label = (p: Place) => p.title;

  it('keeps local and reports a conflict when both edited the same place', () => {
    const base = [place({ id: 'a', title: 'A' })];
    const { merged, conflicts } = mergeById(base, [{ ...base[0], memo: 'L' }], [{ ...base[0], memo: 'R' }], label);
    expect(merged[0].memo).toBe('L');
    expect(conflicts).toEqual([{ kind: 'place', id: 'a', label: 'A', local: { ...base[0], memo: 'L' }, remote: { ...base[0], memo: 'R' } }]);
  });

  it('applies deletions of untouched places on either side', () => {
    const base = [place({ id: 'a', title: 'A' }), place({ id: 'b', title: 'B' })];
    const { merged, conflicts } = mergeById(base, [base[1]], [base[0]], label);
    expect(merged).toEqual([]);
    expect(conflicts).toEqual([]);
  });

  it('keeps a deleted place edited on the other side and reports a conflict', () => {
    const base = [place({ id: 'a', title: 'A' }), place({ id: 'b', title: 'B' })];
    const local = [{ ...base[0], rating: 3 as const }];
    const remote = [{ ...base[1], memo: 'R' }];
    const { merged, conflicts } = mergeById(base, local, remote, label);
    expect(merged.map((p) => p.id)).toEqual(['b', 'a']);
    expect(conflicts.map((c) => [c.id, c.local === null, c.remote === null])).toEqual([
      ['b', true, false],
      ['a', false, true],
    ]);
  });

  it('treats remote as the base when there is none', () => {
    const remote = [place({ id: 'a', title: 'A' }), place({ id: 'b', title: 'B' })];
    const local = [{ ...remote[0], memo: 'L' }, place({ id: 'c', title: 'C' })];
    const { merged, conflicts } = mergeById(null, local, remote, label);
    expect(conflicts).toEqual([]);
    expect(merged.map((p) => p.id)).toEqual(['a', 'c']);
    expect(merged[0].memo).toBe('L');
  });
});
