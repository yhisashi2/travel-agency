import { useSyncExternalStore } from 'react';
import { parseTrip, type Trip } from '../types/trip';
import { GitHubClient, GitHubError, loadSettings } from './github';
import { applyRemoteChoice, mergeTrips, type Conflict } from './merge';
import { getAllRecords, putRecord, removeRecord, type TripRecord } from './storage';

export type SyncState = 'local' | 'idle' | 'syncing' | 'offline' | 'error';

interface State {
  ready: boolean;
  records: Record<string, TripRecord>;
  sync: SyncState;
  lastSync?: string;
  error?: string;
}

let state: State = { ready: false, records: {}, sync: 'local' };
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

const serialize = (t: Trip) => JSON.stringify(t, null, 2) + '\n';

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
  set({
    ready: true,
    records: Object.fromEntries(recs.map((r) => [r.id, r])),
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
