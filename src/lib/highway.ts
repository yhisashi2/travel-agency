import type { Highway, Transport } from '../types/trip';

/**
 * 高速道路の概算（所要時間・距離・料金）。
 * 経路は FOSSGIS 運営の公開 Valhalla（二輪・車のプロファイルと「高速を使わない」に対応）で求め、
 * 料金は有料区間の距離から NEXCO の料金式で見積もる。実際の料金（割引・料金所の位置など）とは差が出るので必ず「概算」として扱う。
 */

const VALHALLA = 'https://valhalla1.openstreetmap.de/route';

/** 高速料金の車種区分。バイクは「軽自動車等（二輪）」 */
export type VehicleClass = 'kei' | 'normal';
export const VEHICLE_LABEL: Record<VehicleClass, string> = { kei: '軽自動車等（二輪）', normal: '普通車' };

/** 高速を使うかを選べる移動手段 */
export const ROAD_MODES: Transport[] = ['car', 'bike', 'bus'];
export const isRoadMode = (m?: Transport): m is Transport => !!m && ROAD_MODES.includes(m);
export const vehicleOf = (m: Transport): VehicleClass => (m === 'bike' ? 'kei' : 'normal');

/** 有料区間（同じ路線網ごとにまとめた距離） */
export interface TollSegment {
  name: string;
  km: number;
  /** 都市高速（阪神高速・首都高など）。距離ではなく上限付きの料金体系 */
  urban: boolean;
}

/** 都市高速の路線網と、普通車 ETC の上限料金の目安 */
const URBAN: { re: RegExp; name: string; cap: number }[] = [
  { re: /首都高|Shuto/i, name: '首都高速', cap: 1950 },
  { re: /阪神高速|Hanshin Expressway/i, name: '阪神高速', cap: 1320 },
  { re: /名古屋高速|Nagoya Expressway/i, name: '名古屋高速', cap: 1320 },
  { re: /北九州都市高速|Kitakyushu/i, name: '北九州都市高速', cap: 1000 },
  { re: /福岡都市高速|福岡高速|Fukuoka Expressway/i, name: '福岡都市高速', cap: 1000 },
  { re: /広島高速|Hiroshima Expressway/i, name: '広島高速', cap: 1000 },
];

/**
 * NEXCO 普通区間の料金式（ETC・税込の目安）:
 *   (ターミナルチャージ 150 円 + 24.6 円/km × 距離) × 1.1
 *   100〜200 km の部分は 25%、200 km を超える部分は 30% の長距離逓減
 *   軽自動車等（二輪含む）は普通車の 0.8 倍
 */
export function nexcoToll(km: number, vehicle: VehicleClass): number {
  if (km <= 0) return 0;
  const perKm = 24.6;
  const a = Math.min(km, 100);
  const b = Math.min(Math.max(km - 100, 0), 100);
  const c = Math.max(km - 200, 0);
  const normal = (150 + perKm * (a + b * 0.75 + c * 0.7)) * 1.1;
  return Math.round((vehicle === 'kei' ? normal * 0.8 : normal) / 10) * 10;
}

/** 都市高速: 普通車 ETC 300 円 + 約 30 円/km、上限あり（軽・二輪は 0.8 倍の目安） */
export function urbanToll(name: string, km: number, vehicle: VehicleClass): number {
  if (km <= 0) return 0;
  const cap = URBAN.find((u) => u.name === name)?.cap ?? 1320;
  const normal = Math.min(cap, 300 + 30 * km);
  return Math.round((vehicle === 'kei' ? normal * 0.8 : normal) / 10) * 10;
}

export function estimateToll(segments: TollSegment[], vehicle: VehicleClass): number {
  return segments.reduce((sum, s) => sum + (s.urban ? urbanToll(s.name, s.km, vehicle) : nexcoToll(s.km, vehicle)), 0);
}

interface Maneuver {
  length: number;
  toll?: boolean;
  street_names?: string[];
}

/** Valhalla の案内（maneuver）から有料区間を路線網ごとにまとめる。都市高速以外の有料道路は NEXCO 式で一括計算 */
export function tollSegments(maneuvers: Maneuver[]): TollSegment[] {
  const byName = new Map<string, TollSegment>();
  const nexcoNames: string[] = [];
  for (const m of maneuvers) {
    if (!m.toll || !(m.length > 0)) continue;
    const names = (m.street_names ?? []).join(' ');
    const u = URBAN.find((x) => x.re.test(names));
    const key = u ? u.name : 'NEXCO';
    const seg = byName.get(key) ?? { name: key, km: 0, urban: !!u };
    seg.km += m.length;
    byName.set(key, seg);
    if (!u) {
      // 日本語の路線名（例: 中国自動車道）を区間表示用に拾う
      const ja = m.street_names?.find((n) => /[ぁ-んァ-ン一-龥]/.test(n) && /(自動車道|道路|高速|バイパス)/.test(n));
      if (ja && !nexcoNames.includes(ja)) nexcoNames.push(ja);
    }
  }
  const nexco = byName.get('NEXCO');
  if (nexco) nexco.name = nexcoNames.length ? nexcoNames.join('→') : '高速道路';
  return [...byName.values()].map((s) => ({ ...s, km: Math.round(s.km * 10) / 10 }));
}

export interface LegEstimate {
  km: number;
  minutes: number;
  toll: number;
  segments: TollSegment[];
  /** 区間の表示（例: 阪神高速→中国自動車道） */
  section?: string;
}

const COSTING: Record<string, string> = { bike: 'motorcycle', car: 'auto', bus: 'bus' };
const cache = new Map<string, LegEstimate>();
let last = 0;

/** 2 地点間の所要時間・距離・高速料金の概算 */
export async function estimateLeg(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode: Transport,
  useHighway: boolean,
): Promise<LegEstimate> {
  const costing = COSTING[mode] ?? 'auto';
  const key = [from.lat, from.lng, to.lat, to.lng, costing, useHighway].join(',');
  const hit = cache.get(key);
  if (hit) return hit;

  // 公開サーバへの負荷を抑えるため 1 秒 1 リクエストまで
  const wait = last + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();

  const opt = useHighway ? { use_highways: 1, use_tolls: 1 } : { use_highways: 0, use_tolls: 0 };
  const res = await fetch(VALHALLA, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locations: [
        { lat: from.lat, lon: from.lng },
        { lat: to.lat, lon: to.lng },
      ],
      costing,
      costing_options: { [costing]: opt },
      units: 'kilometers',
      language: 'ja-JP',
      directions_options: { units: 'kilometers' },
    }),
  });
  if (!res.ok) throw new Error(res.status === 400 ? 'この 2 地点の経路が見つかりませんでした' : `経路の取得に失敗しました（${res.status}）`);
  const j = await res.json();
  const trip = j.trip;
  if (!trip) throw new Error('経路の取得に失敗しました');
  const maneuvers: Maneuver[] = trip.legs.flatMap((l: { maneuvers: Maneuver[] }) => l.maneuvers);
  const segments = useHighway ? tollSegments(maneuvers) : [];
  const vehicle = vehicleOf(mode);
  const out: LegEstimate = {
    km: Math.round(trip.summary.length),
    minutes: Math.round(trip.summary.time / 60),
    toll: estimateToll(segments, vehicle),
    segments,
    section: segments.length ? segments.map((s) => s.name).join('→') : undefined,
  };
  cache.set(key, out);
  return out;
}

/** 概算結果を Spot の highway に入れる形に */
export function toHighway(e: LegEstimate, use: boolean): Highway {
  return {
    use,
    ...(e.section ? { section: e.section } : {}),
    ...(use && e.toll ? { toll: e.toll } : {}),
    minutes: e.minutes,
    km: e.km,
    estimated: true,
  };
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min}分`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}時間${m}分` : `${h}時間`;
}
