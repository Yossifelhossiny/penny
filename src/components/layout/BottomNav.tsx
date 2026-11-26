import { ChartColumn, House, Plus, ReceiptText, Wallet, type LucideIcon } from 'lucide-react';
import type { Page } from '../../types';
import { cx } from '../ui';

interface BottomNavProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
  onAdd: () => void;
}

const tabs: { page: Page; label: string; icon: LucideIcon; also?: Page[] }[] = [
  { page: 'dashboard', label: 'Home', icon: House, also: ['budgets'] },
  { page: 'transactions', label: 'Activity', icon: ReceiptText, also: ['import'] },
  { page: 'reports', label: 'Reports', icon: ChartColumn },
  { page: 'accounts', label: 'Accounts', icon: Wallet },
];

/**
 * Four destinations around one primary action. Settings, SMS import and
 * budgets are reached from the screens they belong to, keeping the bar calm.
 */
export function BottomNav({ activePage, onNavigate, onAdd }: BottomNavProps) {
  const renderTab = (tab: (typeof tabs)[number]) => {
    const active = activePage === tab.page || !!tab.also?.includes(activePage);
    const Icon = tab.icon;
    return (
      <button
        key={tab.page}
        type="button"
        onClick={() => onNavigate(tab.page)}
        aria-current={active ? 'page' : undefined}
        className="flex-1 flex flex-col items-center justify-center gap-1 h-full"
      >
        <span
          className={cx(
            'flex items-center justify-center h-8 w-14 rounded-full transition-colors duration-200',
            active ? 'bg-grad-soft text-brand-700' : 'text-ink-3'
          )}
        >
          <Icon className="size-[21px]" strokeWidth={active ? 2.2 : 1.8} />
        </span>
        <span className={cx('text-[11px] font-semibold', active ? 'text-brand-700' : 'text-ink-3')}>{tab.label}</span>
      </button>
    );
  };

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-surface/90 backdrop-blur-xl shadow-[0_-1px_0_rgb(36_33_43/0.04),0_-8px_24px_-16px_rgb(80_52_168/0.18)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center max-w-lg mx-auto h-[68px] px-2">
        {tabs.slice(0, 2).map(renderTab)}
        <div className="flex-1 flex justify-center">
          <button
            type="button"
            onClick={onAdd}
            aria-label="Add transaction"
            className="size-[52px] -mt-1 rounded-[18px] bg-grad-primary text-white shadow-raised flex items-center justify-center active:scale-95 transition-transform"
          >
            <Plus className="size-6" strokeWidth={2.4} />
          </button>
        </div>
        {tabs.slice(2).map(renderTab)}
      </div>
    </nav>
  );
}
