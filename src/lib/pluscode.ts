/**
 * Plus Code（Open Location Code）の変換。仕様: https://github.com/google/open-location-code
 * - 完全なコード（例 `8Q6QMP2R+XX`）は単独で位置が決まる
 * - 短いコード（例 `MP2R+XX`）は近くの基準点が必要。Google マップは `MP2R+XX 京都市` のように地名を添えて表示する
 */

const ALPHABET = '23456789CFGHJMPQRVWX';
const SEP = '+';
const SEP_POS = 8;
const PAD = '0';
const PAIR_LEN = 10;
const GRID_ROWS = 5;
const GRID_COLS = 4;
/** 10 桁での 1 単位（度の逆数） */
const PAIR_PRECISION = 8000;

export interface CodeArea {
  lat: number;
  lng: number;
  /** 範囲の高さ・幅（度） */
  latSize: number;
  lngSize: number;
}

export function isValidPlusCode(input: string): boolean {
  const code = input.toUpperCase();
  const sep = code.indexOf(SEP);
  if (sep < 2 || sep !== code.lastIndexOf(SEP) || sep > SEP_POS || sep % 2 === 1) return false;
  const pad = code.indexOf(PAD);
  if (pad >= 0) {
    // 0 埋めは区切りの前だけ。偶数個で、偶数位置から、区切りの後ろには何も置けない
    if (pad === 0 || pad % 2 === 1 || sep < SEP_POS) return false;
    if (!/^0+\+$/.test(code.slice(pad)) || (sep - pad) % 2 === 1) return false;
  }
  if (code.length - sep - 1 === 1) return false;
  return [...code.replace(SEP, '').replace(/0+$/, '')].every((c) => ALPHABET.includes(c));
}

export function isFullPlusCode(input: string): boolean {
  if (!isValidPlusCode(input) || input.indexOf(SEP) !== SEP_POS) return false;
  const code = input.toUpperCase();
  return ALPHABET.indexOf(code[0]) * 20 < 180 && ALPHABET.indexOf(code[1]) * 20 < 360;
}

export function isShortPlusCode(input: string): boolean {
  return isValidPlusCode(input) && input.indexOf(SEP) < SEP_POS;
}

const normalizeLng = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;

/** 緯度経度を完全なコードにする。length は 10（約 14m 四方）か 11 以上（グリッドで細分） */
export function encodePlusCode(lat: number, lng: number, length = PAIR_LEN): string {
  const latC = Math.min(Math.max(lat, -90), 90);
  // 浮動小数の誤差で境界を割らないよう、丸めてから切り捨てる（公式実装と同じ）
  const grid = Math.max(0, length - PAIR_LEN);
  const latScale = PAIR_PRECISION * GRID_ROWS ** grid;
  const lngScale = PAIR_PRECISION * GRID_COLS ** grid;
  let latN = Math.floor(Math.round((latC + 90) * latScale * 1e6) / 1e6);
  let lngN = Math.floor(Math.round((normalizeLng(lng) + 180) * lngScale * 1e6) / 1e6);
  latN = Math.min(latN, 180 * latScale - 1);
  lngN = Math.min(lngN, 360 * lngScale - 1);

  let gridPart = '';
  for (let i = 0; i < grid; i++) {
    gridPart = ALPHABET[(latN % GRID_ROWS) * GRID_COLS + (lngN % GRID_COLS)] + gridPart;
    latN = Math.floor(latN / GRID_ROWS);
    lngN = Math.floor(lngN / GRID_COLS);
  }
  let pairs = '';
  for (let i = 0; i < PAIR_LEN / 2; i++) {
    pairs = ALPHABET[latN % 20] + ALPHABET[lngN % 20] + pairs;
    latN = Math.floor(latN / 20);
    lngN = Math.floor(lngN / 20);
  }
  const digits = (pairs + gridPart).slice(0, Math.max(length, 2));
  if (digits.length < SEP_POS) return digits.padEnd(SEP_POS, PAD) + SEP;
  return digits.slice(0, SEP_POS) + SEP + digits.slice(SEP_POS);
}

/** 完全なコードを範囲の中心と大きさにする */
export function decodePlusCode(input: string): CodeArea {
  if (!isFullPlusCode(input)) throw new Error('完全な Plus Code ではありません');
  const digits = input.toUpperCase().replace(SEP, '').replace(/0+$/, '');
  let lat = -90;
  let lng = -180;
  let latSize = 400;
  let lngSize = 400;
  for (let i = 0; i < Math.min(digits.length, PAIR_LEN); i += 2) {
    latSize /= 20;
    lngSize /= 20;
    lat += ALPHABET.indexOf(digits[i]) * latSize;
    lng += ALPHABET.indexOf(digits[i + 1]) * lngSize;
  }
  for (const c of digits.slice(PAIR_LEN)) {
    const v = ALPHABET.indexOf(c);
    latSize /= GRID_ROWS;
    lngSize /= GRID_COLS;
    lat += Math.floor(v / GRID_COLS) * latSize;
    lng += (v % GRID_COLS) * lngSize;
  }
  return { lat: lat + latSize / 2, lng: lng + lngSize / 2, latSize, lngSize };
}

/** 短いコードを基準点にいちばん近い完全なコードに戻す（基準点から 0.5 単位以内なら正しく戻る） */
export function recoverPlusCode(input: string, refLat: number, refLng: number): string {
  if (!isShortPlusCode(input)) {
    if (isFullPlusCode(input)) return input.toUpperCase();
    throw new Error('Plus Code ではありません');
  }
  const short = input.toUpperCase();
  refLat = Math.min(Math.max(refLat, -90), 90);
  refLng = normalizeLng(refLng);
  const padLen = SEP_POS - short.indexOf(SEP);
  const res = 20 ** (2 - padLen / 2);
  const half = res / 2;
  const area = decodePlusCode(encodePlusCode(refLat, refLng).slice(0, padLen) + short);
  let { lat, lng } = area;
  if (refLat + half < lat && lat - res >= -90) lat -= res;
  else if (refLat - half > lat && lat + res <= 90) lat += res;
  if (refLng + half < lng) lng -= res;
  else if (refLng - half > lng) lng += res;
  return encodePlusCode(lat, lng, short.replace(SEP, '').length + padLen);
}

const TOKEN = /(?:^|[\s,、，])([23456789CFGHJMPQRVWX0]{2,8}\+[23456789CFGHJMPQRVWX]*)(?=$|[\s,、，])/i;

/**
 * 入力文から Plus Code を取り出す。`MP2R+XX 京都市` → { code: 'MP2R+XX', locality: '京都市' }
 * Plus Code が含まれなければ null
 */
export function parsePlusCodeInput(input: string): { code: string; locality: string; full: boolean } | null {
  // 日本語入力の全角（＋、英数字、空白）も受け付ける
  const text = input.normalize('NFKC');
  const m = TOKEN.exec(` ${text.trim()} `);
  if (!m || !isValidPlusCode(m[1])) return null;
  const code = m[1].toUpperCase();
  const locality = text
    .replace(m[1], ' ')
    .replace(/^[\s,、，]+|[\s,、，]+$/g, '')
    .trim();
  return { code, locality, full: isFullPlusCode(code) };
}
