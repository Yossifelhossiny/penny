import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { MonthSummaryItem } from '../../services/insights';
import { formatEGP } from '../../utils/format';

interface Props {
  data: MonthSummaryItem[];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    payload: MonthSummaryItem;
  }>;
  label?: string;
}

function CustomBarTooltip({ active, payload, label }: CustomTooltipProps) {
  if (active && payload && payload.length > 0) {
    const item = payload[0].payload;
    return (
      <div className="bg-surface/95 backdrop-blur-md border border-white/10 rounded-xl p-3 shadow-xl text-xs space-y-1.5 min-w-[140px]">
        <p className="font-bold text-text border-b border-white/5 pb-1">{label} {item.year}</p>
        <div className="flex items-center justify-between text-success">
          <span>Income:</span>
          <span className="font-semibold">{formatEGP(item.incomePiastres)}</span>
        </div>
        <div className="flex items-center justify-between text-danger">
          <span>Expenses:</span>
          <span className="font-semibold">{formatEGP(item.expensesPiastres)}</span>
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-white/5 font-semibold text-text">
          <span>Net:</span>
          <span className={item.netSavingsPiastres >= 0 ? 'text-primary' : 'text-danger'}>
            {item.netSavingsPiastres >= 0 ? '+' : ''}{formatEGP(item.netSavingsPiastres)}
          </span>
        </div>
      </div>
    );
  }
  return null;
}

export function MonthlyComparisonChart({ data }: Props) {
  const hasData = data.some((d) => d.incomePiastres > 0 || d.expensesPiastres > 0);

  if (!hasData) {
    return (
      <div className="bg-surface rounded-2xl p-8 text-center border border-white/5 space-y-2">
        <p className="text-3xl">📊</p>
        <p className="text-sm font-semibold">No multi-month data yet</p>
        <p className="text-xs text-text-muted">
          As you log transactions across months, Penny will show your income vs expense trends here.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-2xl p-4 border border-white/5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text">Income vs. Expenses</h3>
          <p className="text-xs text-text-muted mt-0.5">6-month financial trajectory</p>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-success shrink-0" />
            <span className="text-text-muted text-[11px]">Income</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-danger shrink-0" />
            <span className="text-text-muted text-[11px]">Expenses</span>
          </div>
        </div>
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} vertical={false} />
            <XAxis
              dataKey="label"
              stroke="#94a3b8"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#94a3b8"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)}
            />
            <Tooltip content={<CustomBarTooltip />} />
            <Bar dataKey="incomeEgp" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="expensesEgp" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
