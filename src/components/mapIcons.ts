import L from 'leaflet';

/** 番号付きピン（Leaflet 標準アイコンはバンドラで画像パスが壊れるため divIcon を使う） */
export function numberIcon(label: string | number, opts: { done?: boolean; active?: boolean; color?: string } = {}) {
  const cls = ['num-pin', opts.done ? 'done' : '', opts.active ? 'active' : '', String(label).length > 2 ? 'long' : ''].join(' ');
  return L.divIcon({
    className: '',
    html: `<div class="${cls}" style="${opts.color ? `background:${opts.color}` : ''}"><span>${label}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -28],
  });
}

export const homeIcon = L.divIcon({
  className: '',
  html: '<div class="home-pin">🏠</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -14],
});

export const meIcon = L.divIcon({
  className: '',
  html: '<div class="me-dot"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
