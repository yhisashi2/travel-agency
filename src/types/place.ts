import { z } from 'zod';
import { CATEGORIES } from './trip';

/** お気に入り度（行ったことがある場所のみ） */
export const RATING_LABEL: Record<Rating, string> = {
  1: 'まあまあ',
  2: '良い',
  3: 'また行きたい',
};

export const VisitSchema = z.object({
  /** 訪問日（不明なら省略） */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** どの旅行で行ったか（trips/<tripId>.json） */
  tripId: z.string().optional(),
});

export const PlaceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: z.enum(CATEGORIES).default('sightseeing'),
  /** 都道府県・国など（絞り込み用） */
  area: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  address: z.string().optional(),
  url: z.string().optional(),
  memo: z.string().optional(),
  /** 空なら未訪問 */
  visits: z.array(VisitSchema).default([]),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  createdAt: z.string().optional(),
});

export const PlacesFileSchema = z.object({
  updatedAt: z.string().default(() => new Date().toISOString()),
  places: z.array(PlaceSchema).default([]),
});

export type Rating = 1 | 2 | 3;
export type Visit = z.infer<typeof VisitSchema>;
export type Place = z.infer<typeof PlaceSchema>;
export type PlacesFile = z.infer<typeof PlacesFileSchema>;

export const isVisited = (p: Place) => p.visits.length > 0;
