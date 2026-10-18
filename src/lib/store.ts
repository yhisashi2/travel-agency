import { useSyncExternalStore } from 'react';
import { PlacesFileSchema, type Home, type Place, type PlacesFile } from '../types/place';
import { parseTrip, type Trip } from '../types/trip';
import { GitHubClient, GitHubError, loadSettings } from './github';
import { applyRemoteChoice, mergeById, mergeTrips, type Conflict } from './merge';
import {
  getAllRecords,
  getPlacesRecord,
  putPlacesRecord,
  putRecord,
  removeRecord,
  type PlacesRecord,
  type TripRecord,
} from './storage';

export type SyncState = 'local' | 'idle' | 'syncing' | 'offline' | 'error';

interface State {
  ready: boolean;
  records: Record<string, TripRecord>;
  places: PlacesRecord | null;
  sync: SyncState;
  lastSync?: string;
  error?: string;
}

let state: State = { ready: false, records: {}, places: null, sync: 'local' };
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => sel(state),
  );
}

export const getState = () => state;

const serialize = (t: Trip | PlacesFile) => JSON.stringify(t, null, 2) + '\n';

function client(): GitHubClient | null {
  const s = loadSettings();
  return s ? new GitHubClient(s) : null;
}

async function save(rec: TripRecord) {
  await putRecord(rec);
  set({ records: { ...state.records, [rec.id]: rec } });
}

export async function initStore() {
  const recs = await getAllRecords();
  const places = (await getPlacesRecord()) ?? null;
  set({
    ready: true,
    records: Object.fromEntries(recs.map((r) => [r.id, r])),
    places,
    sync: client() ? 'idle' : 'local',
  });
  window.addEventListener('online', () => void syncAll());
  window.addEventListener('focus', () => void syncAll());
  void syncAll();
}

// ---- 編集操作（常にまず端末に保存し、その後 GitHub に送る）

let pushTimer: ReturnType<typeof setTimeout> | undefined;
function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void syncAll(), 2500);
}

export async function saveTrip(trip: Trip) {
  const prev = state.records[trip.id];
  await save({ ...(prev ?? { id: trip.id }), id: trip.id, trip, dirty: true, deleted: false });
  schedulePush();
}

export async function deleteTrip(id: string) {
  const rec = state.records[id];
  if (!rec) return;
  if (!rec.sha) {
    await removeRecord(id);
    const { [id]: _, ...rest } = state.records;
    set({ records: rest });
    return;
  }
  await save({ ...rec, deleted: true, dirty: true });
  schedulePush();
}

export async function resolveConflict(id: string, conflict: Conflict, useRemote: boolean) {
  const rec = state.records[id];
  if (!rec) return;
  const trip = useRemote ? applyRemoteChoice(rec.trip, conflict) : rec.trip;
  const conflicts = (rec.conflicts ?? []).filter((c) => !(c.id === conflict.id && c.kind === conflict.kind));
  await save({ ...rec, trip, conflicts, dirty: true });
  schedulePush();
}

// ---- 行きたい所リスト

const NO_PLACES: Place[] = [];
export const usePlaces = () => useStore((s) => s.places?.data.places ?? NO_PLACES);

const homeOf = (s: State) => s.places?.data.home;
export const useHome = () => useStore(homeOf);

/** 自宅を設定（undefined で解除）。places.json の home として GitHub に同期される */
export async function setHome(home: Home | undefined) {
  const rec = state.places;
  await savePlacesRecord({
    ...(rec ?? { id: 'places' }),
    id: 'places',
    data: { updatedAt: new Date().toISOString(), places: rec?.data.places ?? [], ...(home ? { home } : {}) },
    dirty: true,
  });
  schedulePush();
}

async function savePlacesRecord(rec: PlacesRecord) {
  await putPlacesRecord(rec);
  set({ places: rec });
}

/** 最新の一覧に対して変更を適用して保存（古い一覧での上書きを防ぐ） */
export async function updatePlaces(fn: (places: Place[]) => Place[]) {
  const rec = state.places;
  const places = fn(rec?.data.places ?? []);
  await savePlacesRecord({
    ...(rec ?? { id: 'places' }),
    id: 'places',
    data: { ...rec?.data, updatedAt: new Date().toISOString(), places },
    dirty: true,
  });
  schedulePush();
}

export async function resolvePlaceConflict(conflict: Conflict, useRemote: boolean) {
  const rec = state.places;
  if (!rec) return;
  let places = rec.data.places;
  if (useRemote) {
    const remote = conflict.remote as Place | null;
    places = remote
      ? places.some((p) => p.id === conflict.id)
        ? places.map((p) => (p.id === conflict.id ? remote : p))
        : [...places, remote]
      : places.filter((p) => p.id !== conflict.id);
  }
  const conflicts = (rec.conflicts ?? []).filter((c) => c.id !== conflict.id);
  await savePlacesRecord({ ...rec, data: { ...rec.data, places }, conflicts, dirty: true });
  schedulePush();
}

async function syncPlaces(gh: GitHubClient) {
  const path = gh.placesPath();
  const rec = state.places;
  const file = await gh.getFile(path);
  let remote: PlacesFile | null = null;
  if (file) {
    try {
      remote = PlacesFileSchema.parse(JSON.parse(file.text));
    } catch (e) {
      console.warn('places.json の形式が不正です', e);
      set({ error: 'places.json の形式が不正です（スキーマを確認してください）' });
      return;
    }
  }

  if (!rec?.dirty) {
    if (file && remote && file.sha !== rec?.sha) {
      await savePlacesRecord({ id: 'places', data: remote, base: remote, sha: file.sha, dirty: false, conflicts: rec?.conflicts });
    }
    return;
  }

  let data = rec.data;
  let conflicts = rec.conflicts ?? [];
  if (file && remote && file.sha !== rec.sha) {
    const m = mergeById(rec.base?.places ?? null, data.places, remote.places, (p) => p.title);
    // 自宅は端末側で変えていなければ remote を採用（変えていれば端末側）
    const home = JSON.stringify(rec.base?.home) === JSON.stringify(data.home) ? remote.home : data.home;
    data = { updatedAt: new Date().toISOString(), places: m.merged, ...(home ? { home } : {}) };
    conflicts = [...conflicts.filter((c) => !m.conflicts.some((n) => n.id === c.id)), ...m.conflicts];
  }
  try {
    const sha = await gh.putFile(path, serialize(data), 'Update places', file?.sha);
    await savePlacesRecord({ id: 'places', data, base: data, sha, dirty: false, conflicts });
  } catch (e) {
    if (e instanceof GitHubError && (e.status === 409 || e.status === 422)) {
      await savePlacesRecord({ ...rec, data, conflicts });
      schedulePush();
      return;
    }
    throw e;
  }
}

// ---- 同期

let syncing: Promise<void> | null = null;

export function syncAll(): Promise<void> {
  if (syncing) return syncing;
  syncing = doSync().finally(() => (syncing = null));
  return syncing;
}

async function doSync() {
  const gh = client();
  if (!gh) {
    set({ sync: 'local' });
    return;
  }
  if (!navigator.onLine) {
    set({ sync: 'offline' });
    return;
  }
  set({ sync: 'syncing', error: undefined });
  try {
    const remote = await gh.listTrips();
    const remoteById = new Map(remote.map((r) => [r.path.split('/').pop()!.replace(/\.json$/, ''), r]));

    // 1) 端末側の変更を送信 / 削除
    for (const rec of Object.values(state.records)) {
      if (!rec.dirty) continue;
      const path = gh.tripPath(rec.id);
      const r = remoteById.get(rec.id);
      if (rec.deleted) {
        if (r) await gh.deleteFile(path, r.sha, `Delete trip: ${rec.trip.title}`);
        await removeRecord(rec.id);
        const { [rec.id]: _, ...rest } = state.records;
        set({ records: rest });
        remoteById.delete(rec.id);
        continue;
      }
      await pushRecord(gh, rec, r?.sha);
      remoteById.delete(rec.id);
    }

    // 2) GitHub 側の変更を取り込み
    for (const [id, r] of remoteById) {
      const rec = state.records[id];
      if (rec && rec.sha === r.sha) continue;
      const file = await gh.getFile(r.path);
      if (!file) continue;
      const trip = parseRemote(file.text, id);
      if (!trip) continue;
      await save({ id, trip, base: trip, sha: file.sha, dirty: false, conflicts: rec?.conflicts });
    }

    // 3) GitHub 側で削除された旅行（未変更のもののみ端末からも削除）
    const remoteIds = new Set(remote.map((r) => r.path.split('/').pop()!.replace(/\.json$/, '')));
    for (const rec of Object.values(state.records)) {
      if (rec.sha && !rec.dirty && !remoteIds.has(rec.id)) {
        await removeRecord(rec.id);
        const { [rec.id]: _, ...rest } = state.records;
        set({ records: rest });
      }
    }

    // 4) 行きたい所リスト
    await syncPlaces(gh);

    set({ sync: 'idle', lastSync: new Date().toISOString() });
  } catch (e) {
    const offline = !navigator.onLine || e instanceof TypeError;
    set({ sync: offline ? 'offline' : 'error', error: e instanceof Error ? e.message : String(e) });
  }
}

function parseRemote(text: string, id: string): Trip | null {
  try {
    const t = parseTrip(JSON.parse(text));
    return { ...t, id };
  } catch (e) {
    console.warn(`trips/${id}.json の形式が不正です`, e);
    set({ error: `trips/${id}.json の形式が不正です（スキーマを確認してください）` });
    return null;
  }
}

async function pushRecord(gh: GitHubClient, rec: TripRecord, remoteSha?: string) {
  const path = gh.tripPath(rec.id);
  let trip = rec.trip;
  let sha = rec.sha;
  let conflicts = rec.conflicts ?? [];

  // GitHub 側が先に更新されていたらマージしてから送る
  if (remoteSha && remoteSha !== rec.sha) {
    const file = await gh.getFile(path);
    const remoteTrip = file && parseRemote(file.text, rec.id);
    if (file && remoteTrip) {
      const m = mergeTrips(rec.base ?? null, trip, remoteTrip);
      trip = m.merged;
      sha = file.sha;
      conflicts = [...conflicts.filter((c) => !m.conflicts.some((n) => n.id === c.id)), ...m.conflicts];
    }
  } else if (!remoteSha) {
    sha = undefined; // 新規 or GitHub 側で削除済み → 作り直す
  }

  try {
    const newSha = await gh.putFile(path, serialize(trip), `Update trip: ${trip.title}`, sha);
    await save({ ...rec, trip, base: trip, sha: newSha, dirty: false, conflicts });
  } catch (e) {
    if (e instanceof GitHubError && (e.status === 409 || e.status === 422)) {
      // 送信直前に更新された → 次回の同期で再マージ
      await save({ ...rec, trip, conflicts, sha });
      schedulePush();
      return;
    }
    throw e;
  }
}

/** JSON ファイルから旅行を取り込む（バックアップ復元用） */
export async function importTrip(text: string) {
  const trip = parseTrip(JSON.parse(text));
  await saveTrip(trip);
  return trip;
}

export function exportTrip(trip: Trip) {
  return serialize(trip);
}
