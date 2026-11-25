import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import type { CategorySpendingItem } from '../../services/insights';
import { formatEGP } from '../../utils/format';

interface Props {
  items: CategorySpendingItem[];
  totalExpensesPiastres: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: CategorySpendingItem;
  }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (active && payload && payload.length > 0) {
    const data = payload[0].payload;
    return (
      <div className="bg-surface/95 backdrop-blur-md border border-white/10 rounded-xl p-2.5 shadow-xl text-xs">
        <div className="flex items-center gap-1.5 font-semibold text-text">
          <span>{data.icon}</span>
          <span>{data.name}</span>
        </div>
        <p className="text-primary font-bold mt-1 text-sm">
          {formatEGP(data.amountPiastres)}
        </p>
        <p className="text-text-muted text-[11px]">
          {data.percentage}% of total expenses
        </p>
      </div>
    );
  }
  return null;
}

export function CategoryBreakdownChart({ items, totalExpensesPiastres }: Props) {
  if (items.length === 0 || totalExpensesPiastres === 0) {
    return (
      <div className="bg-surface rounded-2xl p-8 text-center border border-white/5 space-y-2">
        <p className="text-3xl">🛍️</p>
        <p className="text-sm font-semibold">No expenses recorded</p>
        <p className="text-xs text-text-muted">
          Expenses logged for this month will appear here broken down by category.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-2xl p-4 border border-white/5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text">Spending by Category</h3>
          <p className="text-xs text-text-muted mt-0.5">
            Total: {formatEGP(totalExpensesPiastres)} across {items.length} categories
          </p>
        </div>
      </div>

      {/* Donut Chart */}
      <div className="h-52 w-full flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={items}
              dataKey="amountEgp"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={3}
              stroke="transparent"
            >
              {items.map((entry) => (
                <Cell key={`cell-${entry.categoryId}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Category List with Progress Bars */}
      <div className="space-y-2.5 pt-2 border-t border-white/5">
        {items.map((item) => (
          <div key={item.categoryId} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-base shrink-0">{item.icon}</span>
                <span className="font-medium truncate">{item.name}</span>
                <span className="text-text-muted text-[11px] shrink-0 font-mono">
                  ({item.percentage}%)
                </span>
              </div>
              <span className="font-semibold shrink-0 text-text">
                {formatEGP(item.amountPiastres)}
              </span>
            </div>

            {/* Visual Bar */}
            <div className="h-1.5 w-full bg-surface-light rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, Math.max(3, item.percentage))}%`,
                  backgroundColor: item.color,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
