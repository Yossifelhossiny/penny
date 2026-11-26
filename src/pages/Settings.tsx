import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Page } from '../types';
import { BackupExport } from '../components/settings/BackupExport';
import { AutoImportCard } from '../components/settings/AutoImportCard';

export function Settings({ onNavigate }: { onNavigate?: (page: Page) => void }) {
  const txnCount = useLiveQuery(() => db.transactions.count());
  const accountCount = useLiveQuery(() => db.accounts.count());
  const categoryCount = useLiveQuery(() => db.categories.count());
  const budgetCount = useLiveQuery(() => db.budgets.count());
  const goalCount = useLiveQuery(() => db.goals.count());

  async function handleClearData() {
    if (confirm('Are you sure you want to delete ALL transactions? This cannot be undone.')) {
      if (confirm('This will permanently delete all your transaction history. Continue?')) {
        await db.transactions.clear();
      }
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold">Settings</h2>
      <AutoImportCard />
      <div className="bg-surface rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">Currency</p>
            <p className="text-xs text-text-muted">Egyptian Pound (EGP)</p>
          </div>
          <span className="text-text-muted text-sm">E£</span>
        </div>
        <hr className="border-white/5" />
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">Data Storage</p>
            <p className="text-xs text-text-muted">All data stored locally on device</p>
          </div>
          <span className="text-xs text-primary font-medium">Local</span>
        </div>
        <hr className="border-white/5" />
        {onNavigate && (
          <>
            <div
              onClick={() => onNavigate('budgets')}
              className="flex items-center justify-between cursor-pointer py-1 group"
            >
              <div>
                <p className="font-medium text-sm text-text group-hover:text-primary transition-colors">
                  🎯 Budgets & Financial Goals
                </p>
                <p className="text-xs text-text-muted">
                  Configure monthly spending limits and savings goals
                </p>
              </div>
              <span className="text-xs text-primary font-medium">Manage →</span>
            </div>
            <hr className="border-white/5" />
          </>
        )}
        <div>
          <p className="font-medium text-sm mb-2">Statistics</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-surface-light rounded-lg p-2.5 text-center">
              <p className="text-base font-bold text-primary">{txnCount ?? 0}</p>
              <p className="text-[10px] text-text-muted">Transactions</p>
            </div>
            <div className="bg-surface-light rounded-lg p-2.5 text-center">
              <p className="text-base font-bold text-primary">{accountCount ?? 0}</p>
              <p className="text-[10px] text-text-muted">Accounts</p>
            </div>
            <div className="bg-surface-light rounded-lg p-2.5 text-center">
              <p className="text-base font-bold text-primary">{categoryCount ?? 0}</p>
              <p className="text-[10px] text-text-muted">Categories</p>
            </div>
            <div className="bg-surface-light rounded-lg p-2.5 text-center">
              <p className="text-base font-bold text-primary">{budgetCount ?? 0}</p>
              <p className="text-[10px] text-text-muted">Budgets</p>
            </div>
            <div className="bg-surface-light rounded-lg p-2.5 text-center col-span-2">
              <p className="text-base font-bold text-primary">{goalCount ?? 0}</p>
              <p className="text-[10px] text-text-muted">Savings Goals</p>
            </div>
          </div>
        </div>
        <hr className="border-white/5" />
        <div>
          <p className="font-medium text-sm">About</p>
          <p className="text-xs text-text-muted mt-1">
            Penny v0.3.0 — Local-first finance tracker. No data ever leaves your device.
          </p>
        </div>
        <hr className="border-white/5" />
        {/* Backup & Export Section */}
        <BackupExport />
        <hr className="border-white/5" />
        <button
          onClick={handleClearData}
          className="w-full text-sm text-danger bg-danger/10 rounded-xl py-2.5 font-medium cursor-pointer"
        >
          Clear All Transactions
        </button>
      </div>
    </div>
  );
}
