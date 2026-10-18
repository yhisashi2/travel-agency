import { describe, expect, it } from 'vitest';
import { sampleTrip } from '../sample';
import { parseTrip, type Trip } from '../types/trip';
import { summarizeBudget } from './budget';
import { applyRemoteChoice, mergeTrips } from './merge';
import { IDEAS, clearTripDates, createTrip, deleteSpot, findSpot, moveSpot, setTripDates, shiftSpot, upsertSpot } from './tripOps';

const clone = (t: Trip): Trip => JSON.parse(JSON.stringify(t));

describe('tripOps', () => {
  it('creates one day per date', () => {
    const t = createTrip('Test', '2026-01-30', '2026-02-02');
    expect(t.days.map((d) => d.date)).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
  });

  it('inserts spots sorted by time and moves between lists', () => {
    let t = createTrip('Test', '2026-01-01', '2026-01-02');
    t = upsertSpot(t, '2026-01-01', { id: 'b', title: 'B', category: 'food', time: '12:00' });
    t = upsertSpot(t, '2026-01-01', { id: 'a', title: 'A', category: 'food', time: '09:00' });
    expect(t.days[0].items.map((s) => s.id)).toEqual(['a', 'b']);
    t = moveSpot(t, 'a', IDEAS);
    expect(t.ideas.map((s) => s.id)).toEqual(['a']);
    t = moveSpot(t, 'a', '2026-01-02', 0);
    expect(findSpot(t, 'a')?.key).toBe('2026-01-02');
    t = deleteSpot(t, 'a');
    expect(findSpot(t, 'a')).toBeNull();
  });

  it('shifts spot order', () => {
    const t = shiftSpot(sampleTrip(), 's2', -1);
    expect(t.days[0].items.slice(0, 2).map((s) => s.id)).toEqual(['s2', 's1']);
  });

  it('moves orphaned spots to ideas when shortening the trip', () => {
    const t = sampleTrip();
    const shorter = setTripDates(t, t.startDate!, t.days[1].date);
    expect(shorter.days).toHaveLength(2);
    expect(shorter.ideas.map((s) => s.id)).toContain('s9');
  });
});

describe('budget', () => {
  it('converts currencies and reports missing rates', () => {
    let t = sampleTrip();
    t = upsertSpot(t, t.days[2].date, { id: 'x', title: 'X', category: 'other', cost: 10, currency: 'USD' });
    let b = summarizeBudget(t);
    expect(b.missingRates).toEqual(['USD']);
    expect(b.total).toBe(500 + 1800 + 14000 + 800);
    t = { ...t, rates: { USD: 150 } };
    b = summarizeBudget(t);
    expect(b.total).toBe(500 + 1800 + 14000 + 800 + 1500);
    expect(b.byCategory.lodging).toBe(14000);
  });
});

describe('merge', () => {
  it('merges independent edits from both sides', () => {
    const base = sampleTrip();
    const local = upsertSpot(clone(base), base.days[0].date, { ...base.days[0].items[1], memo: 'local memo' });
    let remote = upsertSpot(clone(base), base.days[1].date, { id: 'new', title: 'Claude added', category: 'food', time: '13:00' });
    remote = { ...remote, title: 'Renamed remotely' };
    const { merged, conflicts } = mergeTrips(base, local, remote);
    expect(conflicts).toEqual([]);
    expect(merged.title).toBe('Renamed remotely');
    expect(findSpot(merged, 's2')?.spot.memo).toBe('local memo');
    expect(findSpot(merged, 'new')?.key).toBe(base.days[1].date);
  });

  it('applies remote deletion of untouched spot and keeps locally edited one', () => {
    const base = sampleTrip();
    const local = upsertSpot(clone(base), base.days[0].date, { ...base.days[0].items[0], memo: 'edited' });
    const remote = deleteSpot(deleteSpot(clone(base), 's1'), 's3');
    const { merged, conflicts } = mergeTrips(base, local, remote);
    expect(findSpot(merged, 's3')).toBeNull();
    expect(findSpot(merged, 's1')).not.toBeNull();
    expect(conflicts.map((c) => c.id)).toEqual(['s1']);
  });

  it('reports conflict on same spot and resolves to remote', () => {
    const base = sampleTrip();
    const local = upsertSpot(clone(base), base.days[0].date, { ...base.days[0].items[1], time: '11:30' });
    const remote = upsertSpot(clone(base), base.days[0].date, { ...base.days[0].items[1], time: '10:45' });
    const { merged, conflicts } = mergeTrips(base, local, remote);
    expect(conflicts).toHaveLength(1);
    expect(findSpot(merged, 's2')?.spot.time).toBe('11:30');
    const resolved = applyRemoteChoice(merged, conflicts[0]);
    expect(findSpot(resolved, 's2')?.spot.time).toBe('10:45');
  });

  it('respects a move done remotely', () => {
    const base = sampleTrip();
    const remote = moveSpot(clone(base), 's10', base.days[2].date);
    const { merged } = mergeTrips(base, clone(base), remote);
    expect(findSpot(merged, 's10')?.key).toBe(base.days[2].date);
  });
});

describe('schema', () => {
  it('accepts sample and fills defaults', () => {
    const t = parseTrip({ id: 'x-1', title: 'T', startDate: '2026-01-01', endDate: '2026-01-01', days: [{ date: '2026-01-01', items: [{ id: 'a', title: 'A' }] }] });
    expect(t.baseCurrency).toBe('JPY');
    expect(t.days[0].items[0].category).toBe('sightseeing');
    expect(parseTrip(JSON.parse(JSON.stringify(sampleTrip()))).id).toBe('sample-kyoto');
  });
  it('rejects bad time', () => {
    expect(() => parseTrip({ id: 'x', title: 'T', startDate: '2026-01-01', endDate: '2026-01-01', days: [{ date: '2026-01-01', items: [{ id: 'a', title: 'A', time: '9:00' }] }] })).toThrow();
  });
});

describe('transport modes', () => {
  it('accepts bike and ferry and maps them for navigation', async () => {
    const { googleMapsDirections } = await import('./navigation');
    const t = parseTrip({
      id: 'x', title: 'T', startDate: '2026-01-01', endDate: '2026-01-01',
      days: [{ date: '2026-01-01', items: [{ id: 'a', title: 'A', lat: 1, lng: 2, transportToNext: 'bike' }, { id: 'b', title: 'B', transportToNext: 'ferry' }] }],
    });
    expect(t.days[0].items.map((s) => s.transportToNext)).toEqual(['bike', 'ferry']);
    expect(googleMapsDirections(t.days[0].items[0], 'bike')).toContain('travelmode=driving');
  });
  it('draws ferry legs as straight lines without calling a router', async () => {
    const { routeLine } = await import('./routing');
    const r = await routeLine([33, 131], [33.1, 131.1], 'ferry');
    expect(r).toEqual({ line: [[33, 131], [33.1, 131.1]], routed: false });
  });
});

describe('日程未定の旅行', () => {
  it('creates an undated trip with destination and no days', () => {
    const t = createTrip('九州', undefined, undefined, 'JPY', { destination: '九州', durationDays: 5 });
    expect(t.startDate).toBeUndefined();
    expect(t.days).toEqual([]);
    expect(parseTrip(JSON.parse(JSON.stringify(t)))).toMatchObject({ destination: '九州', durationDays: 5 });
  });

  it('keeps ideas when the dates are decided, and moves spots back when cleared', () => {
    let t = createTrip('九州', undefined, undefined);
    t = upsertSpot(t, IDEAS, { id: 'a', title: '阿蘇', category: 'sightseeing' });
    t = setTripDates(t, '2026-11-01', '2026-11-03');
    expect(t.days).toHaveLength(3);
    expect(t.ideas.map((s) => s.id)).toEqual(['a']);
    t = moveSpot(t, 'a', '2026-11-02');
    const u = clearTripDates(t);
    expect(u.startDate).toBeUndefined();
    expect('startDate' in u).toBe(false);
    expect(u.days).toEqual([]);
    expect(u.ideas.map((s) => s.id)).toEqual(['a']);
  });

  it('merges when the dates are decided on one side', () => {
    const base = createTrip('九州', undefined, undefined);
    base.ideas = [{ id: 'a', title: '阿蘇', category: 'sightseeing' }];
    const local = moveSpot(setTripDates(clone(base), '2026-11-01', '2026-11-02'), 'a', '2026-11-01');
    const remote = upsertSpot(clone(base), IDEAS, { id: 'b', title: '別府', category: 'sightseeing' });
    const { merged, conflicts } = mergeTrips(base, local, remote);
    expect(conflicts).toEqual([]);
    expect(merged.startDate).toBe('2026-11-01');
    expect(merged.days[0].items.map((s) => s.id)).toEqual(['a']);
    expect(merged.ideas.map((s) => s.id)).toEqual(['b']);
  });

  it('merges back to undated without leaving undefined keys', () => {
    const base = createTrip('九州', '2026-11-01', '2026-11-02');
    const local = clearTripDates(base);
    const { merged } = mergeTrips(base, local, clone(base));
    expect('startDate' in merged).toBe(false);
    expect(merged.days).toEqual([]);
  });
});
