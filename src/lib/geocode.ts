/** Nominatim（OpenStreetMap）による地名検索。利用規約に従い 1 秒 1 リクエストまで */

export interface Place {
  name: string;
  address: string;
  lat: number;
  lng: number;
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
