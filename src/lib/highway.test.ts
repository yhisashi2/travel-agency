import { describe, expect, it } from 'vitest';
import { createTrip, upsertSpot } from './tripOps';
import { summarizeBudget } from './budget';
import { estimateToll, nexcoToll, tollSegments, urbanToll } from './highway';

describe('高速料金の概算', () => {
  it('NEXCO 普通区間: ターミナルチャージ + 距離、長距離逓減、軽は 0.8 倍', () => {
    // (150 + 24.6×50) × 1.1 = 1518 → 1520
    expect(nexcoToll(50, 'normal')).toBe(1520);
    expect(nexcoToll(50, 'kei')).toBe(1210);
    // 300 km: 100 + 100×0.75 + 100×0.7 = 245 km 相当 → (150 + 6027) × 1.1 = 6794.7 → 6790
    expect(nexcoToll(300, 'normal')).toBe(6790);
    expect(nexcoToll(0, 'normal')).toBe(0);
  });

  it('都市高速は上限付き', () => {
    expect(urbanToll('阪神高速', 10, 'normal')).toBe(600);
    expect(urbanToll('阪神高速', 80, 'normal')).toBe(1320);
    expect(urbanToll('首都高速', 80, 'normal')).toBe(1950);
    expect(urbanToll('阪神高速', 10, 'kei')).toBe(480);
  });

  it('有料区間を都市高速と NEXCO に分けてまとめる', () => {
    const segs = tollSegments([
      { length: 1.3, street_names: ['国道2号'] },
      { length: 13.6, toll: true, street_names: ['11', '阪神高速11号池田線', 'Hanshin Expressway Route 11 Ikeda Line'] },
      { length: 400, toll: true, street_names: ['E2A', '中国自動車道', 'Chugoku Expressway'] },
      { length: 200, toll: true, street_names: ['E3', '九州自動車道'] },
      { length: 6.7, toll: true, street_names: ['4', '福岡都市高速4号粕屋線'] },
    ]);
    expect(segs).toEqual([
      { name: '阪神高速', km: 13.6, urban: true },
      { name: '中国自動車道→九州自動車道', km: 600, urban: false },
      { name: '福岡都市高速', km: 6.7, urban: true },
    ]);
    expect(estimateToll(segs, 'kei')).toBe(urbanToll('阪神高速', 13.6, 'kei') + nexcoToll(600, 'kei') + urbanToll('福岡都市高速', 6.7, 'kei'));
  });
});

describe('予算への高速料金の合算', () => {
  it('高速を使う区間の料金を「移動」と日別に足す（使わない区間は数えない）', () => {
    let t = createTrip('T', '2026-11-01', '2026-11-01');
    const d = t.days[0].date;
    t = upsertSpot(t, d, { id: 'a', title: 'A', category: 'sightseeing', cost: 500, transportToNext: 'bike', highway: { use: true, toll: 3000 } });
    t = upsertSpot(t, d, { id: 'b', title: 'B', category: 'food', transportToNext: 'bike', highway: { use: false, toll: 9999 } });
    const b = summarizeBudget(t);
    expect(b.tolls).toBe(3000);
    expect(b.total).toBe(3500);
    expect(b.byCategory.transport).toBe(3000);
    expect(b.byDay[0].amount).toBe(3500);
  });
});
