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
export function googleMapsDirections(to: Spot, mode?: Transport, avoidHighways = false): string {
  const dest = to.lat != null && to.lng != null ? `${to.lat},${to.lng}` : (to.address ?? to.title);
  if (avoidHighways) {
    // URL API（api=1）には「高速を避ける」指定が無いため、従来形式の dirflg（d=車, h=高速を避ける, t=有料道路を避ける）を使う
    return `https://www.google.com/maps?${new URLSearchParams({ daddr: dest, dirflg: 'dht' })}`;
  }
  const p = new URLSearchParams({ api: '1', destination: dest, travelmode: MODE[mode ?? 'walk'] });
  return `https://www.google.com/maps/dir/?${p}`;
}

export function googleMapsPlace(s: Spot): string {
  const q = s.lat != null && s.lng != null ? `${s.lat},${s.lng}` : (s.address ?? s.title);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
