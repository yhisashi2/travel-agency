import { CATEGORIES, type Category, type Spot, type Trip } from '../types/trip';

export interface BudgetSummary {
  /** baseCurrency 換算の合計（レート未設定の通貨は除外） */
  total: number;
  byCategory: Record<Category, number>;
  byDay: { date: string; amount: number }[];
  ideas: number;
  /** 通貨ごとの元の金額 */
  byCurrency: Record<string, number>;
  /** レート未設定で換算できなかった通貨 */
  missingRates: string[];
  /** 合計のうち高速料金（baseCurrency 換算） */
  tolls: number;
}

export function summarizeBudget(trip: Trip): BudgetSummary {
  const base = trip.baseCurrency;
  const missing = new Set<string>();
  const byCurrency: Record<string, number> = {};
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;

  const convert = (s: Spot): number => {
    if (!s.cost) return 0;
    const cur = s.currency ?? base;
    byCurrency[cur] = (byCurrency[cur] ?? 0) + s.cost;
    if (cur === base) return s.cost;
    const rate = trip.rates[cur];
    if (!rate) {
      missing.add(cur);
      return 0;
    }
    return s.cost * rate;
  };

  // 高速料金は日本円で入力する（基準通貨が円以外ならレートで換算）
  const toll = (s: Spot): number => {
    const yen = s.highway?.use ? (s.highway.toll ?? 0) : 0;
    if (!yen) return 0;
    if (base === 'JPY') return yen;
    const rate = trip.rates.JPY;
    if (!rate) {
      missing.add('JPY');
      return 0;
    }
    return yen * rate;
  };

  let total = 0;
  let tolls = 0;
  const byDay = trip.days.map((d) => {
    let amount = 0;
    for (const s of d.items) {
      const v = convert(s);
      const t = toll(s);
      amount += v + t;
      byCategory[s.category] += v;
      byCategory.transport += t;
      tolls += t;
    }
    total += amount;
    return { date: d.date, amount };
  });
  // 候補は合計に含めず参考値として別集計（通貨集計にも含めない）
  const ideas = trip.ideas.reduce((sum, s) => {
    if (!s.cost) return sum;
    const cur = s.currency ?? base;
    if (cur === base) return sum + s.cost;
    const rate = trip.rates[cur];
    return rate ? sum + s.cost * rate : sum;
  }, 0);

  return { total, byCategory, byDay, ideas, byCurrency, missingRates: [...missing], tolls };
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency,
      maximumFractionDigits: ['JPY', 'KRW', 'VND', 'IDR'].includes(currency) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString('ja-JP')} ${currency}`;
  }
}
