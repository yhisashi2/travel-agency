import { openDB, type IDBPDatabase } from 'idb';
import type { Trip } from '../types/trip';
import type { Conflict } from './merge';

/** 端末内の旅行データ。オフラインでも閲覧・編集できるよう全データをここに持つ */
export interface TripRecord {
  id: string;
  trip: Trip;
  /** GitHub 上のファイル sha（未アップロードなら undefined） */
  sha?: string;
  /** 最後に GitHub と一致していた版（3-way マージの基準） */
  base?: Trip;
  /** GitHub へ未送信の変更あり */
  dirty: boolean;
  /** GitHub 側で削除予定 */
  deleted?: boolean;
  conflicts?: Conflict[];
}

let dbp: Promise<IDBPDatabase> | null = null;
function db() {
  dbp ??= openDB('travel-agency', 1, {
    upgrade(d) {
      d.createObjectStore('trips', { keyPath: 'id' });
    },
  });
  return dbp;
}

export async function getAllRecords(): Promise<TripRecord[]> {
  return (await db()).getAll('trips');
}

export async function getRecord(id: string): Promise<TripRecord | undefined> {
  return (await db()).get('trips', id);
}

export async function putRecord(rec: TripRecord): Promise<void> {
  await (await db()).put('trips', rec);
}

export async function removeRecord(id: string): Promise<void> {
  await (await db()).delete('trips', id);
}
