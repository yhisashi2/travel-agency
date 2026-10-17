/** Open-Meteo（無料・API キー不要）による日別天気予報 */

export interface DailyWeather {
  date: string;
  code: number;
  tMax: number;
  tMin: number;
  precipProb: number | null;
}

const CACHE_KEY = 'ta.weather';
const TTL = 60 * 60 * 1000; // 1 時間

type Cache = Record<string, { at: number; days: DailyWeather[] }>;

function readCache(): Cache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

const key = (lat: number, lng: number) => `${lat.toFixed(2)},${lng.toFixed(2)}`;

const inflight = new Map<string, Promise<{ days: DailyWeather[]; stale: boolean }>>();

/** 予報は今日から 16 日先まで。オフライン時は最後に取得した値を返す */
export function getForecast(lat: number, lng: number): Promise<{ days: DailyWeather[]; stale: boolean }> {
  const k = key(lat, lng);
  // 同じ地点への同時リクエストはまとめる（API のレート制限対策）
  let p = inflight.get(k);
  if (!p) {
    p = fetchForecast(lat, lng).finally(() => inflight.delete(k));
    inflight.set(k, p);
  }
  return p;
}

async function fetchForecast(lat: number, lng: number): Promise<{ days: DailyWeather[]; stale: boolean }> {
  const cache = readCache();
  const k = key(lat, lng);
  const hit = cache[k];
  if (hit && Date.now() - hit.at < TTL) return { days: hit.days, stale: false };
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=auto&forecast_days=16`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.statusText);
    const j = await res.json();
    const days: DailyWeather[] = j.daily.time.map((date: string, i: number) => ({
      date,
      code: j.daily.weather_code[i],
      tMax: j.daily.temperature_2m_max[i],
      tMin: j.daily.temperature_2m_min[i],
      precipProb: j.daily.precipitation_probability_max?.[i] ?? null,
    }));
    // キャッシュは最大 30 地点
    const entries = Object.entries({ ...cache, [k]: { at: Date.now(), days } })
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, 30);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
    return { days, stale: false };
  } catch (e) {
    if (hit) return { days: hit.days, stale: true };
    throw e;
  }
}

/** WMO weather code → アイコンと説明 */
export function describeWeather(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: '☀️', label: '快晴' };
  if (code <= 2) return { icon: '🌤️', label: '晴れ' };
  if (code === 3) return { icon: '☁️', label: 'くもり' };
  if (code <= 48) return { icon: '🌫️', label: '霧' };
  if (code <= 57) return { icon: '🌦️', label: '霧雨' };
  if (code <= 67) return { icon: '🌧️', label: '雨' };
  if (code <= 77) return { icon: '🌨️', label: '雪' };
  if (code <= 82) return { icon: '🌧️', label: 'にわか雨' };
  if (code <= 86) return { icon: '🌨️', label: 'にわか雪' };
  return { icon: '⛈️', label: '雷雨' };
}

/** 旅程の注意喚起（雨・暑さ・寒さ） */
export function weatherAdvice(w: DailyWeather): string | null {
  const tips: string[] = [];
  if ((w.precipProb ?? 0) >= 50 || (w.code >= 51 && w.code <= 99)) tips.push('雨具を。屋内プランも検討');
  if (w.tMax >= 32) tips.push('猛暑。水分補給と日中の屋外を控えめに');
  if (w.tMin <= 0) tips.push('氷点下。防寒と路面凍結に注意');
  return tips.length ? tips.join(' / ') : null;
}
