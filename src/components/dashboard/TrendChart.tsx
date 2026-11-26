import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import type { MonthTotals } from '../../services/periods';
import { formatEGP } from '../../utils/format';
import { sameMonth, type YearMonth } from '../../utils/months';

function compact(piastres: number): string {
  const egp = piastres / 100;
  if (egp >= 1_000_000) return `${(egp / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (egp >= 1_000) return `${(egp / 1_000).toFixed(egp >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return Math.round(egp).toString();
}

function ChartTooltip({ active, payload, mode }: { active?: boolean; payload?: Array<{ payload: MonthTotals }>; mode: 'spending' | 'both' }) {
  if (!active || !payload?.length) return null;
  const m = payload[0].payload;
  return (
    <div className="rounded-xl bg-surface px-3 py-2.5 shadow-[0_8px_24px_-8px_rgb(36_33_43/0.25)] text-xs space-y-1 min-w-[150px]">
      <p className="font-semibold text-ink">{m.label} {m.year}</p>
      {mode === 'both' && (
        <p className="flex justify-between gap-4 text-ink-3">Income <span className="num font-semibold text-income">{formatEGP(m.incomePiastres)}</span></p>
      )}
      <p className="flex justify-between gap-4 text-ink-3">Spent <span className="num font-semibold text-ink">{formatEGP(m.expensesPiastres)}</span></p>
      {mode === 'both' && (
        <p className="flex justify-between gap-4 text-ink-3">Left <span className={`num font-semibold ${m.netPiastres < 0 ? 'text-expense' : 'text-brand-700'}`}>{formatEGP(m.netPiastres)}</span></p>
      )}
    </div>
  );
}

/**
 * Month bars. "spending" shows one bar per month (selected month in the brand
 * gradient); "both" pairs income and spending. Every month passed in is drawn,
 * including empty ones.
 */
export function TrendChart({
  data,
  selected,
  onSelect,
  mode = 'spending',
  height = 168,
}: {
  data: MonthTotals[];
  selected?: YearMonth;
  onSelect?: (ym: YearMonth) => void;
  mode?: 'spending' | 'both';
  height?: number;
}) {
  const isSel = (m: MonthTotals) => !!selected && sameMonth(m, selected);
  if (!data.some((m) => m.incomePiastres > 0 || m.expensesPiastres > 0)) {
    return (
      <div style={{ height: Math.min(height, 120) }} className="flex flex-col items-center justify-center rounded-2xl bg-well/60 text-center px-6">
        <p className="text-sm font-semibold text-ink-2">Nothing to chart yet</p>
        <p className="text-[13px] text-ink-3 mt-0.5">Bars appear here as you add or import transactions.</p>
      </div>
    );
  }
  return (
    <div style={{ height }} className="w-full -ml-1">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap={mode === 'both' ? '22%' : '28%'} barGap={3} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="barSelected" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9678ED" />
              <stop offset="100%" stopColor="#5034A8" />
            </linearGradient>
            <linearGradient id="barIncome" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4fb98f" />
              <stop offset="100%" stopColor="#269b70" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#f1eef6" />
          <XAxis
            dataKey="shortLabel"
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={{ fill: '#736d7e', fontSize: 11, fontWeight: 600 }}
            dy={4}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={34}
            tickFormatter={compact}
            tick={{ fill: '#a39dad', fontSize: 10 }}
            allowDecimals={false}
          />
          <Tooltip cursor={{ fill: '#f7f4ff', radius: 8 }} content={<ChartTooltip mode={mode} />} />
          {mode === 'both' && (
            <Bar dataKey="incomePiastres" name="Income" radius={[6, 6, 2, 2]} fill="url(#barIncome)" maxBarSize={14} />
          )}
          <Bar
            dataKey="expensesPiastres"
            name="Spent"
            radius={[6, 6, 2, 2]}
            maxBarSize={mode === 'both' ? 14 : 26}
            onClick={(d: unknown) => {
              const m = (d as { payload?: MonthTotals })?.payload;
              if (m && onSelect) onSelect({ year: m.year, month: m.month });
            }}
            className={onSelect ? 'cursor-pointer' : undefined}
          >
            {data.map((m) => (
              <Cell key={m.key} fill={mode === 'both' ? 'url(#barSelected)' : isSel(m) ? 'url(#barSelected)' : '#ddd3f8'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
