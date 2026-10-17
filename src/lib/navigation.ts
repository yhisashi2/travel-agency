import type { Spot, Transport } from '../types/trip';

const MODE: Record<Transport, string> = {
  walk: 'walking',
  car: 'driving',
  // Google マップの URL API には二輪モードが無いため車ルートで代用
  bike: 'driving',
  bus: 'transit',
  train: 'transit',
  ferry: 'driving',
  flight: 'driving',
};

/** Google マップの経路案内 URL（スマホでは Google マップアプリが開く） */
export function googleMapsDirections(to: Spot, mode?: Transport): string {
  const dest = to.lat != null && to.lng != null ? `${to.lat},${to.lng}` : (to.address ?? to.title);
  const p = new URLSearchParams({ api: '1', destination: dest, travelmode: MODE[mode ?? 'walk'] });
  return `https://www.google.com/maps/dir/?${p}`;
}

export function googleMapsPlace(s: Spot): string {
  const q = s.lat != null && s.lng != null ? `${s.lat},${s.lng}` : (s.address ?? s.title);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
