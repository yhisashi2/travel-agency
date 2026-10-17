import type { Trip } from './types/trip';
import { datesBetween, todayLocal } from './lib/tripOps';

/** 動作確認用のサンプル（今日から 3 日間の京都旅行） */
export function sampleTrip(): Trip {
  const start = todayLocal();
  const d = new Date(start + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 2);
  const end = d.toISOString().slice(0, 10);
  const [d1, d2, d3] = datesBetween(start, end);
  return {
    id: 'sample-kyoto',
    title: 'サンプル: 京都 2泊3日',
    startDate: start,
    endDate: end,
    baseCurrency: 'JPY',
    rates: {},
    updatedAt: new Date().toISOString(),
    notes: '持ち物: 歩きやすい靴、モバイルバッテリー',
    days: [
      {
        date: d1,
        title: '東山エリア',
        items: [
          { id: 's1', title: '京都駅', category: 'transport', time: '10:00', lat: 34.9858, lng: 135.7588, transportToNext: 'bus' },
          { id: 's2', title: '清水寺', category: 'sightseeing', time: '11:00', lat: 34.9949, lng: 135.785, cost: 500, transportToNext: 'walk' },
          { id: 's3', title: '二年坂・三年坂で昼食', category: 'food', time: '12:30', lat: 34.9981, lng: 135.7808, cost: 1800, transportToNext: 'walk' },
          { id: 's4', title: '八坂神社', category: 'sightseeing', time: '14:30', lat: 35.0037, lng: 135.7785, transportToNext: 'walk' },
          { id: 's5', title: 'ホテル（四条）', category: 'lodging', time: '17:00', lat: 35.0037, lng: 135.7681, cost: 14000, bookingRef: 'ABC-12345' },
        ],
      },
      {
        date: d2,
        title: '嵐山',
        items: [
          { id: 's6', title: '嵐山 竹林の小径', category: 'sightseeing', time: '09:30', lat: 35.0170, lng: 135.6713, transportToNext: 'walk' },
          { id: 's7', title: '天龍寺', category: 'sightseeing', time: '10:30', lat: 35.0157, lng: 135.6738, cost: 800, transportToNext: 'walk' },
          { id: 's8', title: '渡月橋', category: 'sightseeing', time: '12:00', lat: 35.0128, lng: 135.6777 },
        ],
      },
      {
        date: d3,
        items: [{ id: 's9', title: '伏見稲荷大社', category: 'sightseeing', time: '09:00', lat: 34.9671, lng: 135.7727 }],
      },
    ],
    ideas: [{ id: 's10', title: '錦市場', category: 'food', lat: 35.005, lng: 135.7649, memo: '雨の日の候補' }],
  };
}
