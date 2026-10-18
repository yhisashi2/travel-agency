import type { Day, Spot, Trip } from '../types/trip';

/**
 * 3-way マージ。base = 最後に同期した版, local = 端末側, remote = GitHub 側。
 * - Trip のトップレベル項目・Day の項目・Spot は ID/日付単位でマージ
 * - 両方が同じものを別々に変更した場合は conflicts に入れ、暫定的に local を採用
 */
export interface Conflict {
  kind: 'spot' | 'field' | 'place';
  id: string;
  label: string;
  local: unknown;
  remote: unknown;
}

export interface MergeResult {
  merged: Trip;
  conflicts: Conflict[];
}

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function pick3<T>(base: T, local: T, remote: T, onConflict: () => void): T {
  if (eq(local, remote)) return local;
  if (eq(base, local)) return remote;
  if (eq(base, remote)) return local;
  onConflict();
  return local;
}

type Loc = { list: string; index: number; spot: Spot };

function locate(trip: Trip): Map<string, Loc> {
  const m = new Map<string, Loc>();
  trip.ideas.forEach((spot, index) => m.set(spot.id, { list: 'ideas', index, spot }));
  trip.days.forEach((d) => d.items.forEach((spot, index) => m.set(spot.id, { list: d.date, index, spot })));
  return m;
}

export function mergeTrips(base: Trip | null, local: Trip, remote: Trip): MergeResult {
  const conflicts: Conflict[] = [];
  const b = base ?? remote; // 基準がない場合は remote 起点（local の差分を全部採用）

  // --- トップレベル項目
  const fields = ['title', 'startDate', 'endDate', 'destination', 'durationDays', 'baseCurrency', 'rates', 'notes'] as const;
  const top: Partial<Trip> = {};
  for (const f of fields) {
    (top as Record<string, unknown>)[f] = pick3(b[f], local[f], remote[f], () =>
      conflicts.push({ kind: 'field', id: f, label: f, local: local[f], remote: remote[f] }),
    );
  }

  // --- Spot 単位
  const lb = locate(b);
  const ll = locate(local);
  const lr = locate(remote);
  const ids = new Set([...ll.keys(), ...lr.keys()]);
  const placed = new Map<string, Loc>();

  for (const id of ids) {
    const bb = lb.get(id);
    const l = ll.get(id);
    const r = lr.get(id);
    if (l && r) {
      const spot = pick3(bb?.spot, l.spot, r.spot, () =>
        conflicts.push({ kind: 'spot', id, label: l.spot.title, local: l.spot, remote: r.spot }),
      ) as Spot;
      const pos = pick3(
        bb ? { list: bb.list, index: bb.index } : undefined,
        { list: l.list, index: l.index },
        { list: r.list, index: r.index },
        () => {}, // 位置の競合は local を優先（内容の競合ではないため通知しない）
      )!;
      placed.set(id, { ...pos, spot });
    } else if (l && !r) {
      // remote で削除された: local が base から変更していなければ削除を採用
      if (bb && eq(bb.spot, l.spot)) continue;
      if (bb) conflicts.push({ kind: 'spot', id, label: l.spot.title, local: l.spot, remote: null });
      placed.set(id, l);
    } else if (r && !l) {
      if (bb && eq(bb.spot, r.spot)) continue;
      if (bb) conflicts.push({ kind: 'spot', id, label: r.spot.title, local: null, remote: r.spot });
      placed.set(id, r);
    }
  }

  // --- Day（日付リストは期間から、タイトルは 3-way）
  const dayMap = (t: Trip) => new Map(t.days.map((d) => [d.date, d]));
  const db = dayMap(b);
  const dl = dayMap(local);
  const dr = dayMap(remote);
  const startDate = top.startDate;
  const endDate = top.endDate;
  // 日程未定（日付なし）の旅行には日がない。予定は下で候補へ回る
  const dates =
    startDate && endDate ? [...new Set([...dl.keys(), ...dr.keys()])].filter((d) => d >= startDate && d <= endDate).sort() : [];

  const lists = new Map<string, Loc[]>();
  for (const loc of placed.values()) {
    const key = loc.list === 'ideas' || dates.includes(loc.list) ? loc.list : 'ideas';
    if (!lists.has(key)) lists.set(key, []);
    lists.get(key)!.push({ ...loc, list: key });
  }
  const ordered = (key: string) => (lists.get(key) ?? []).sort((x, y) => x.index - y.index).map((x) => x.spot);

  const days: Day[] = dates.map((date) => {
    const title = pick3(db.get(date)?.title, dl.get(date)?.title, dr.get(date)?.title, () =>
      conflicts.push({ kind: 'field', id: `day:${date}`, label: `${date} のタイトル`, local: dl.get(date)?.title, remote: dr.get(date)?.title }),
    );
    return { date, ...(title !== undefined ? { title } : {}), items: ordered(date) };
  });

  const merged: Trip = {
    ...remote,
    ...top,
    id: local.id,
    days,
    ideas: ordered('ideas'),
    updatedAt: new Date().toISOString(),
  } as Trip;
  for (const f of fields) if (merged[f] === undefined) delete merged[f];

  return { merged, conflicts };
}

/** 競合解決: 指定した spot / field を remote 側の値で置き換える */
export function applyRemoteChoice(trip: Trip, c: Conflict): Trip {
  if (c.kind === 'field') {
    if (c.id.startsWith('day:')) {
      const date = c.id.slice(4);
      return { ...trip, days: trip.days.map((d) => (d.date === date ? { ...d, title: c.remote as string | undefined } : d)) };
    }
    return { ...trip, [c.id]: c.remote } as Trip;
  }
  const replace = (items: Spot[]) =>
    c.remote === null ? items.filter((s) => s.id !== c.id) : items.map((s) => (s.id === c.id ? (c.remote as Spot) : s));
  const exists = trip.ideas.some((s) => s.id === c.id) || trip.days.some((d) => d.items.some((s) => s.id === c.id));
  if (!exists && c.remote) return { ...trip, ideas: [...trip.ideas, c.remote as Spot] };
  return { ...trip, ideas: replace(trip.ideas), days: trip.days.map((d) => ({ ...d, items: replace(d.items) })) };
}

/**
 * ID を持つ要素のリストの 3-way マージ（places.json 用）。
 * 並びは remote 順 + local で新規追加されたもの。同じ要素の競合は local を採用して conflicts に入れる
 */
export function mergeById<T extends { id: string }>(
  base: T[] | null,
  local: T[],
  remote: T[],
  label: (t: T) => string,
): { merged: T[]; conflicts: Conflict[] } {
  const conflicts: Conflict[] = [];
  const b = new Map((base ?? remote).map((x) => [x.id, x]));
  const l = new Map(local.map((x) => [x.id, x]));
  const r = new Map(remote.map((x) => [x.id, x]));
  const out: T[] = [];
  const push = (id: string) => {
    const bb = b.get(id);
    const ll = l.get(id);
    const rr = r.get(id);
    if (ll && rr) {
      out.push(pick3(bb, ll, rr, () => conflicts.push({ kind: 'place', id, label: label(ll), local: ll, remote: rr })) as T);
    } else if (ll) {
      if (bb && eq(bb, ll)) return; // remote で削除され、local は未変更
      if (bb) conflicts.push({ kind: 'place', id, label: label(ll), local: ll, remote: null });
      out.push(ll);
    } else if (rr) {
      if (bb && eq(bb, rr)) return; // local で削除され、remote は未変更
      if (bb) conflicts.push({ kind: 'place', id, label: label(rr), local: null, remote: rr });
      out.push(rr);
    }
  };
  remote.forEach((x) => push(x.id));
  local.forEach((x) => !r.has(x.id) && push(x.id));
  return { merged: out, conflicts };
}
