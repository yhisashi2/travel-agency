import { z } from 'zod';

export const CATEGORIES = ['sightseeing', 'food', 'lodging', 'transport', 'other'] as const;
export const CATEGORY_LABEL: Record<Category, string> = {
  sightseeing: '観光',
  food: '食事',
  lodging: '宿',
  transport: '移動',
  other: 'その他',
};
export const CATEGORY_ICON: Record<Category, string> = {
  sightseeing: '📷',
  food: '🍴',
  lodging: '🛏️',
  transport: '🚃',
  other: '📌',
};

export const TRANSPORTS = ['walk', 'car', 'bike', 'train', 'bus', 'ferry', 'flight'] as const;
export const TRANSPORT_LABEL: Record<Transport, string> = {
  walk: '徒歩',
  car: '車',
  bike: 'バイク',
  train: '電車',
  bus: 'バス',
  ferry: 'フェリー',
  flight: '飛行機',
};

const time = z.string().regex(/^\d{2}:\d{2}$/, 'HH:MM 形式');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 形式');

export const SpotSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: z.enum(CATEGORIES).default('sightseeing'),
  time: time.optional(),
  endTime: time.optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  address: z.string().optional(),
  transportToNext: z.enum(TRANSPORTS).optional(),
  cost: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  bookingRef: z.string().optional(),
  url: z.string().optional(),
  memo: z.string().optional(),
  done: z.boolean().optional(),
  /** 全体の「行きたい所リスト」（places.json）の場所 ID */
  placeId: z.string().optional(),
});

export const DaySchema = z.object({
  date,
  title: z.string().optional(),
  items: z.array(SpotSchema).default([]),
});

export const TripSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, '英小文字・数字・ハイフンのみ'),
  title: z.string().min(1),
  startDate: date,
  endDate: date,
  baseCurrency: z.string().length(3).default('JPY'),
  /** 1 単位の外貨が baseCurrency でいくらか（例: { USD: 150 }） */
  rates: z.record(z.number().positive()).default({}),
  updatedAt: z.string().default(() => new Date().toISOString()),
  days: z.array(DaySchema).default([]),
  /** 日程未定の行きたい場所 */
  ideas: z.array(SpotSchema).default([]),
  notes: z.string().optional(),
});

export type Category = (typeof CATEGORIES)[number];
export type Transport = (typeof TRANSPORTS)[number];
export type Spot = z.infer<typeof SpotSchema>;
export type Day = z.infer<typeof DaySchema>;
export type Trip = z.infer<typeof TripSchema>;

export function parseTrip(json: unknown): Trip {
  return TripSchema.parse(json);
}
