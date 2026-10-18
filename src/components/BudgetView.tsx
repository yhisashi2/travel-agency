import { useState } from 'react';
import { formatMoney, summarizeBudget } from '../lib/budget';
import { formatDate } from '../lib/tripOps';
import { CATEGORIES, CATEGORY_ICON, CATEGORY_LABEL, type Trip } from '../types/trip';

export default function BudgetView({ trip, onChange }: { trip: Trip; onChange: (t: Trip) => void }) {
  const b = summarizeBudget(trip);
  const base = trip.baseCurrency;
  const max = Math.max(1, ...Object.values(b.byCategory));
  const foreign = [...new Set([...Object.keys(b.byCurrency), ...Object.keys(trip.rates)])].filter((c) => c !== base);
  const [newCur, setNewCur] = useState('');

  const setRate = (cur: string, v: string) => {
    const rates = { ...trip.rates };
    const n = Number(v);
    if (v === '' || !(n > 0)) delete rates[cur];
    else rates[cur] = n;
    onChange({ ...trip, rates, updatedAt: new Date().toISOString() });
  };

  return (
    <div className="stack">
      <div className="card total">
        <div className="muted small">合計（日程に入っている予定）</div>
        <div className="big">{formatMoney(b.total, base)}</div>
        <BudgetMeter trip={trip} total={b.total} onChange={onChange} />
        {b.tolls > 0 && <div className="muted small">うち 🛣️ 高速料金 {formatMoney(b.tolls, base)}（「移動」に含む）</div>}
        {b.ideas > 0 && <div className="muted small">候補を全部入れると +{formatMoney(b.ideas, base)}</div>}
        {b.missingRates.length > 0 && (
          <div className="warn-text small">⚠️ {b.missingRates.join(', ')} の換算レートが未設定のため合計に含まれていません</div>
        )}
      </div>

      <div className="card">
        <h3>カテゴリ別</h3>
        {CATEGORIES.map((c) => (
          <div key={c} className="bar-row">
            <span className="bar-label">
              {CATEGORY_ICON[c]} {CATEGORY_LABEL[c]}
            </span>
            <div className="bar">
              <div style={{ width: `${(b.byCategory[c] / max) * 100}%` }} />
            </div>
            <span className="bar-value">{formatMoney(b.byCategory[c], base)}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>日別</h3>
        <table className="table">
          <tbody>
            {b.byDay.map((d, i) => (
              <tr key={d.date}>
                <td>
                  Day {i + 1} <span className="muted">{formatDate(d.date)}</span>
                </td>
                <td className="num">{formatMoney(d.amount, base)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>通貨と換算レート</h3>
        <p className="muted small">1 単位あたり何 {base} か（例: USD → 150）。旅行中に両替レートで更新できます。</p>
        {Object.entries(b.byCurrency).map(([cur, amt]) => (
          <div key={cur} className="small">
            {cur}: {formatMoney(amt, cur)}
          </div>
        ))}
        {foreign.map((cur) => (
          <label key={cur} className="row gap">
            <span style={{ width: '4em' }}>1 {cur} =</span>
            <input
              className="grow"
              type="number"
              inputMode="decimal"
              step="any"
              defaultValue={trip.rates[cur] ?? ''}
              onBlur={(e) => setRate(cur, e.target.value)}
            />
            <span>{base}</span>
          </label>
        ))}
        <div className="row gap">
          <input value={newCur} onChange={(e) => setNewCur(e.target.value.toUpperCase())} maxLength={3} placeholder="通貨を追加 (USD)" />
          <button
            className="btn sm"
            disabled={newCur.length !== 3 || newCur === base}
            onClick={() => {
              setRate(newCur, '1');
              setNewCur('');
            }}
          >
            追加
          </button>
        </div>
      </div>
    </div>
  );
}

/** 目標予算の入力と残額メーター（80% 未満は緑、100% までは橙、超えたら赤） */
function BudgetMeter({ trip, total, onChange }: { trip: Trip; total: number; onChange: (t: Trip) => void }) {
  const base = trip.baseCurrency;
  const limit = trip.budgetLimit;
  const ratio = limit ? total / limit : 0;
  const level = ratio > 1 ? 'over' : ratio >= 0.8 ? 'near' : 'ok';
  return (
    <div className="budget-meter">
      <label className="row gap small">
        <span className="muted">目標予算</span>
        <input
          className="grow"
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="未設定"
          defaultValue={limit ?? ''}
          onBlur={(e) => {
            const n = Number(e.target.value);
            const next = e.target.value !== '' && n > 0 ? n : undefined;
            if (next === limit) return;
            const { budgetLimit: _old, ...rest } = trip;
            onChange({ ...rest, ...(next ? { budgetLimit: next } : {}), updatedAt: new Date().toISOString() });
          }}
        />
        <span className="muted">{base}</span>
      </label>
      {limit != null && (
        <>
          <div className={`meter ${level}`} role="meter" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={total} aria-label="予算の使用率">
            <div style={{ width: `${Math.min(100, ratio * 100)}%` }} />
          </div>
          <div className={`small ${level === 'over' ? 'err-text' : level === 'near' ? 'warn-text' : 'muted'}`}>
            {level === 'over'
              ? `⚠️ ${formatMoney(total - limit, base)} オーバー`
              : `残り ${formatMoney(limit - total, base)}（${Math.round(ratio * 100)}% 使用）`}
          </div>
        </>
      )}
    </div>
  );
}
