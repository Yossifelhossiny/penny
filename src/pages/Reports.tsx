import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChartColumn, ChevronLeft, ChevronRight } from 'lucide-react';
import { db } from '../db';
import { getYearMonthlyTotals, getActiveYears, type MonthTotals } from '../services/periods';
import { generateFinancialReport, type PeriodFinancialReport } from '../services/reports';
import { getFinancialHealthInsights, getCategorySpendingBreakdown, type CategorySpendingItem, type FinancialHealthInsights } from '../services/insights';
import { useMonthSelection } from '../hooks/useMonthSelection';
import { compareMonths, monthLabel, yearMonthOf } from '../utils/months';
import { formatEGP, formatWhole } from '../utils/format';
import { TrendChart } from '../components/dashboard/TrendChart';
import { CategoryBreakdown } from '../components/dashboard/CategoryBreakdown';
import { MonthInsights } from '../components/dashboard/MonthInsights';
import { AdviceList } from '../components/dashboard/AdviceList';
import { getAdvice, type Advice } from '../services/advice';
import { isStoragePersisted } from '../services/storageSafety';
import { AccountIcon, Amount, Card, EmptyState, IconButton, MonthSwitcher, PageHeader, Section, Segmented, Skeleton, cx } from '../components/ui';
import type { Page } from '../types';

type Mode = 'month' | 'year';

export function Reports({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const sel = useMonthSelection();
  const [mode, setMode] = useState<Mode>('month');
  const [year, setYear] = useState<number | null>(null); // null = follow selected month's year
  const shownYear = year ?? sel.year;

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" />
      <Segmented
        label="Report period"
        value={mode}
        onChange={(m) => {
          setMode(m);
          if (m === 'year') setYear(sel.year);
        }}
        options={[
          { value: 'month', label: 'Month' },
          { value: 'year', label: 'Year' },
        ]}
      />
      <HealthChecks onNavigate={onNavigate} />
      {mode === 'month' ? (
        <MonthReport key={`${sel.year}-${sel.month}`} sel={sel} onNavigate={onNavigate} />
      ) : (
        <YearReport
          year={shownYear}
          today={sel.today}
          onYear={setYear}
          onOpenMonth={(m) => {
            sel.set({ year: shownYear, month: m });
            setMode('month');
          }}
        />
      )}
    </div>
  );
}

function SummaryStrip({ income, expenses }: { income: number; expenses: number }) {
  const net = income - expenses;
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {[
        { label: 'Income', v: income, cls: 'text-income' },
        { label: 'Spent', v: expenses, cls: 'text-ink' },
        { label: net < 0 ? 'Overspent' : 'Kept', v: Math.abs(net), cls: net < 0 ? 'text-expense' : 'text-brand-700' },
      ].map((s, i) => (
        <div key={s.label} className={cx('rounded-2xl p-3.5 min-w-0', i === 2 ? 'bg-grad-soft' : 'bg-surface shadow-card')}>
          <p className="text-[12px] font-semibold text-ink-3">{s.label} <span className="font-medium opacity-70">EGP</span></p>
          <p className={cx('num text-[17px] font-bold mt-1 truncate', s.cls)}>{formatWhole(s.v)}</p>
        </div>
      ))}
    </div>
  );
}

function MonthReport({ sel, onNavigate }: { sel: ReturnType<typeof useMonthSelection>; onNavigate: (p: Page) => void }) {
  const { year, month } = sel;
  const [report, setReport] = useState<PeriodFinancialReport | null>(null);
  const [insights, setInsights] = useState<FinancialHealthInsights | null>(null);
  const [cats, setCats] = useState<CategorySpendingItem[]>([]);
  const txns = useLiveQuery(() => db.transactions.toArray());

  useEffect(() => {
    if (txns === undefined) return;
    let cancelled = false;
    Promise.all([generateFinancialReport('monthly', year, month), getFinancialHealthInsights(year, month), getCategorySpendingBreakdown(year, month)]).then(
      ([r, i, c]) => {
        if (cancelled) return;
        setReport(r);
        setInsights(i);
        setCats(c);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [txns, year, month]);

  return (
    <div className="space-y-6">
      <MonthSwitcher sel={sel} />
      {!report ? (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-44" />
        </div>
      ) : report.transactionCount === 0 ? (
        <Card>
          <EmptyState
            icon={<ChartColumn />}
            title={`Nothing recorded in ${monthLabel(year, month)}`}
            message={sel.isFuture ? 'This month hasn’t started yet.' : 'Transactions you add or import for this month will be summarised here.'}
          />
        </Card>
      ) : (
        <>
          <SummaryStrip income={report.totalIncomePiastres} expenses={report.totalExpensePiastres} />

          {insights && (
            <Section title="How the month went">
              <Card>
                <MonthInsights insights={insights} />
              </Card>
            </Section>
          )}

          {cats.length > 0 && (
            <Section title="Spending by category">
              <Card>
                <CategoryBreakdown items={cats} />
              </Card>
            </Section>
          )}

          <Section title="Accounts this month">
            <Card padded={false} className="py-1.5">
              {report.accountStatements.map((a) => (
                <div key={a.accountId} className="flex items-center gap-3.5 px-4 py-3">
                  <AccountIcon type={a.type as never} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{a.name}</p>
                    <p className="text-[12px] text-ink-3 num">
                      In {formatWhole(a.totalInPiastres)} · Out {formatWhole(a.totalOutPiastres)}
                    </p>
                  </div>
                  <div className="text-right">
                    <Amount piastres={a.endingBalancePiastres} size="sm" />
                    <p className={cx('text-[12px] font-semibold num', a.netChangePiastres < 0 ? 'text-expense' : a.netChangePiastres > 0 ? 'text-income' : 'text-ink-3')}>
                      {a.netChangePiastres > 0 ? '+' : a.netChangePiastres < 0 ? '−' : ''}
                      {formatEGP(Math.abs(a.netChangePiastres))}
                    </p>
                  </div>
                </div>
              ))}
            </Card>
          </Section>

          {report.largestExpense && (
            <Card className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ink-3">Largest expense</p>
                <p className="text-sm font-semibold text-ink truncate mt-0.5" dir="auto">
                  {report.largestExpense.merchant || report.largestExpense.categoryName || 'Expense'}
                </p>
                <p className="text-[12px] text-ink-3">{report.largestExpense.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
              </div>
              <Amount piastres={report.largestExpense.amountPiastres} size="lg" />
            </Card>
          )}

          <button type="button" onClick={() => onNavigate('transactions')} className="w-full text-center text-[13px] font-semibold text-brand-700">
            See all {report.transactionCount} transactions
          </button>
        </>
      )}
    </div>
  );
}

function YearReport({ year, today, onYear, onOpenMonth }: { year: number; today: Date; onYear: (y: number) => void; onOpenMonth: (m: number) => void }) {
  const [months, setMonths] = useState<MonthTotals[] | null>(null);
  const [years, setYears] = useState<number[]>([]);
  const txns = useLiveQuery(() => db.transactions.toArray());

  useEffect(() => {
    if (txns === undefined) return;
    let cancelled = false;
    getYearMonthlyTotals(year).then((m) => !cancelled && setMonths(m));
    getActiveYears(today).then((y) => !cancelled && setYears(y));
    return () => {
      cancelled = true;
    };
  }, [txns, year, today]);

  const income = months?.reduce((s, m) => s + m.incomePiastres, 0) ?? 0;
  const expenses = months?.reduce((s, m) => s + m.expensesPiastres, 0) ?? 0;
  const current = yearMonthOf(today);
  const minYear = years.length ? Math.min(...years) : year;
  const maxMonthTotal = Math.max(1, ...(months ?? []).map((m) => Math.max(m.incomePiastres, m.expensesPiastres)));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1">
        <IconButton label="Previous year" size="sm" onClick={() => onYear(year - 1)} disabled={year <= minYear}>
          <ChevronLeft className="size-[18px]" />
        </IconButton>
        <span className="num text-[15px] font-semibold min-w-16 text-center">{year}</span>
        <IconButton label="Next year" size="sm" onClick={() => onYear(year + 1)} disabled={year >= today.getFullYear()}>
          <ChevronRight className="size-[18px]" />
        </IconButton>
      </div>

      {!months ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <SummaryStrip income={income} expenses={expenses} />

          <Section title="Income and spending">
            <Card>
              <div className="flex items-center gap-4 mb-3 text-[12px] font-semibold text-ink-3">
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-income-500" />Income</span>
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-grad-accent" />Spent</span>
              </div>
              <TrendChart data={months} mode="both" height={200} />
            </Card>
          </Section>

          <Section title="Month by month">
            <Card padded={false} className="py-1.5">
              {months.map((m) => {
                const future = compareMonths(m, current) > 0;
                const isNow = compareMonths(m, current) === 0;
                const empty = m.transactionCount === 0;
                return (
                  <button
                    key={m.key}
                    type="button"
                    disabled={future}
                    onClick={() => onOpenMonth(m.month)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-brand-50/60 transition-colors disabled:hover:bg-transparent"
                  >
                    <div className="w-[88px] shrink-0">
                      <p className={cx('text-sm font-semibold', future ? 'text-ink-4' : 'text-ink')}>{m.label}</p>
                      {isNow && <p className="text-[11px] font-semibold text-brand-600">This month</p>}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="h-1.5 rounded-full bg-well overflow-hidden">
                        <div className="h-full bg-income-500 rounded-full" style={{ width: `${(m.incomePiastres / maxMonthTotal) * 100}%` }} />
                      </div>
                      <div className="h-1.5 rounded-full bg-well overflow-hidden">
                        <div className="h-full bg-grad-accent rounded-full" style={{ width: `${(m.expensesPiastres / maxMonthTotal) * 100}%` }} />
                      </div>
                    </div>
                    <div className="w-[104px] text-right shrink-0">
                      {empty ? (
                        <span className="text-[13px] text-ink-4">{future ? '' : 'No activity'}</span>
                      ) : (
                        <span className={cx('num text-sm font-bold', m.netPiastres < 0 ? 'text-expense' : 'text-ink')}>
                          {m.netPiastres > 0 ? '+' : m.netPiastres < 0 ? '−' : ''}
                          {formatWhole(Math.abs(m.netPiastres))}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </Card>
            <p className="text-[12px] text-ink-3 px-1">Net is income minus spending. Transfers between your accounts aren’t counted.</p>
          </Section>
        </>
      )}
    </div>
  );
}

/** All current warnings, each with the guideline it's based on. */
function HealthChecks({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const [items, setItems] = useState<Advice[] | null>(null);
  const txns = useLiveQuery(() => db.transactions.count());
  useEffect(() => {
    let cancelled = false;
    isStoragePersisted()
      .then((p) => getAdvice({ storagePersisted: p }))
      .then((a) => !cancelled && setItems(a));
    return () => {
      cancelled = true;
    };
  }, [txns]);
  if (!items) return null;
  return (
    <Section title={items.length ? `Health checks · ${items.length}` : 'Health checks'}>
      {items.length === 0 ? (
        <Card className="text-sm text-ink-2">Nothing to flag — spending, savings, budgets and debts all look within common guidelines.</Card>
      ) : (
        <AdviceList items={items} onNavigate={onNavigate} />
      )}
      <p className="text-[12px] text-ink-3 px-1">Based on widely used rules of thumb (50/30/20 budgeting, a 3–6 month emergency fund, debt under ~36% of income). Not financial advice.</p>
    </Section>
  );
}
