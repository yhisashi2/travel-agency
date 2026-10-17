import { useEffect, useState } from 'react';
import type { Trip } from '../types/trip';
import { spotsWithLocation } from './tripOps';
import { getForecast, type DailyWeather } from './weather';

/** 各日の天気（その日の最初の地点、無ければ旅行内の最初の地点で予報を取得） */
export function useTripWeather(trip: Trip | undefined): Record<string, DailyWeather & { stale: boolean }> {
  const [byDate, setByDate] = useState<Record<string, DailyWeather & { stale: boolean }>>({});

  const firstAny = trip && spotsWithLocation([...trip.days.flatMap((d) => d.items), ...trip.ideas])[0];
  const points =
    trip?.days.map((d) => {
      const p = spotsWithLocation(d.items)[0] ?? firstAny;
      return p ? { date: d.date, lat: Math.round(p.lat * 10) / 10, lng: Math.round(p.lng * 10) / 10 } : null;
    }) ?? [];
  const sig = JSON.stringify(points);

  useEffect(() => {
    let cancelled = false;
    const pts = JSON.parse(sig) as ({ date: string; lat: number; lng: number } | null)[];
    const groups = new Map<string, string[]>();
    for (const p of pts) {
      if (!p) continue;
      const k = `${p.lat},${p.lng}`;
      groups.set(k, [...(groups.get(k) ?? []), p.date]);
    }
    (async () => {
      const out: Record<string, DailyWeather & { stale: boolean }> = {};
      for (const [k, dates] of groups) {
        const [lat, lng] = k.split(',').map(Number);
        try {
          const { days, stale } = await getForecast(lat, lng);
          for (const date of dates) {
            const w = days.find((x) => x.date === date);
            if (w) out[date] = { ...w, stale };
          }
        } catch {
          /* 天気は補助情報なので失敗は無視 */
        }
      }
      if (!cancelled) setByDate(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [sig]);

  return byDate;
}
