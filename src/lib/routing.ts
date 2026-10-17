import type { Transport } from '../types/trip';

/** 公開 OSRM サーバで道路に沿ったルート線を取得。失敗・対象外は直線で代替 */
type LatLng = [number, number];

const cache = new Map<string, LatLng[]>();

export async function routeLine(a: LatLng, b: LatLng, mode: Transport | undefined): Promise<{ line: LatLng[]; routed: boolean }> {
  const profile = mode === 'walk' ? 'foot' : mode === 'car' || mode === 'bus' ? 'driving' : null;
  if (!profile) return { line: [a, b], routed: false };
  const k = `${profile}:${a.join(',')}:${b.join(',')}`;
  const hit = cache.get(k);
  if (hit) return { line: hit, routed: true };
  try {
    // routing.openstreetmap.de は徒歩・車の両プロファイルを提供（FOSSGIS 運営の公開 OSRM）
    const res = await fetch(
      `https://routing.openstreetmap.de/routed-${profile === 'foot' ? 'foot' : 'car'}/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=simplified&geometries=geojson`,
    );
    if (!res.ok) throw new Error();
    const j = await res.json();
    const coords = j.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
    if (!coords?.length) throw new Error();
    const line = coords.map(([lng, lat]) => [lat, lng] as LatLng);
    cache.set(k, line);
    return { line, routed: true };
  } catch {
    return { line: [a, b], routed: false };
  }
}
