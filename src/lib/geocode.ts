/** Nominatim（OpenStreetMap）による地名検索。利用規約に従い 1 秒 1 リクエストまで */
import { decodePlusCode, parsePlusCodeInput, recoverPlusCode } from './pluscode';

export interface Place {
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** Plus Code で指定したときのコード */
  plusCode?: string;
}

let last = 0;
async function throttle() {
  const wait = last + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
}

export async function searchPlaces(q: string, near?: { lat: number; lng: number }, signal?: AbortSignal): Promise<Place[]> {
  await throttle();
  const params = new URLSearchParams({ q, format: 'jsonv2', limit: '8', 'accept-language': 'ja,en' });
  if (near) {
    const d = 1.5;
    params.set('viewbox', `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal });
  if (!res.ok) throw new Error('地名検索に失敗しました');
  const j = (await res.json()) as { name?: string; display_name: string; lat: string; lon: string }[];
  return j.map((p) => ({
    name: p.name || p.display_name.split(',')[0],
    address: p.display_name,
    lat: Number(p.lat),
    lng: Number(p.lon),
  }));
}

export async function reverseGeocode(lat: number, lng: number): Promise<Place | null> {
  await throttle();
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&accept-language=ja,en`,
  );
  if (!res.ok) return null;
  const p = await res.json();
  if (!p?.display_name) return null;
  return { name: p.name || p.display_name.split(',')[0], address: p.display_name, lat, lng };
}

/**
 * 入力に Plus Code が含まれていれば位置にする（含まれなければ null）。
 * 短いコードは添えられた地名（例 `MP2R+XX 京都市`）、無ければ near を基準にする
 */
export async function lookupPlusCode(text: string, near?: { lat: number; lng: number }): Promise<Place | null> {
  const parsed = parsePlusCodeInput(text);
  if (!parsed) return null;
  let code = parsed.code;
  if (!parsed.full) {
    let ref = near;
    if (parsed.locality) {
      const [hit] = await searchPlaces(parsed.locality, near);
      if (!hit) throw new Error(`「${parsed.locality}」が見つかりませんでした`);
      ref = hit;
    }
    if (!ref) throw new Error('短い Plus Code は地名と一緒に入力してください（例: MP2R+XX 京都市）');
    code = recoverPlusCode(code, ref.lat, ref.lng);
  }
  const { lat, lng } = decodePlusCode(code);
  const r = await reverseGeocode(lat, lng).catch(() => null);
  return { name: r?.name ?? code, address: r?.address ?? code, lat, lng, plusCode: code };
}
