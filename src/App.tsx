import { useState, useEffect, useCallback } from 'react';
import type { Page } from './types';
import { seedDefaults } from './db';
import { AppShell } from './components/layout/AppShell';
import { Dashboard } from './pages/Dashboard';
import { Transactions } from './pages/Transactions';
import { Accounts } from './pages/Accounts';
import { Settings } from './pages/Settings';
import { SmsImport } from './pages/SmsImport';
import { Budgets } from './pages/Budgets';
import { Reports } from './pages/Reports';
import { Categories } from './pages/Categories';
import { AddTransactionForm, type EntryMode } from './components/transactions/AddTransactionForm';
import { PennyMark } from './components/layout/PennyMark';

const PAGES: Page[] = ['dashboard', 'transactions', 'accounts', 'settings', 'import', 'budgets', 'reports', 'categories'];

/** Page/filter from a notification tap: /?page=transactions&filter=uncategorized */
function readDeepLink(): { page: Page; filter?: 'uncategorized' } {
  const params = new URLSearchParams(window.location.search);
  const p = params.get('page') as Page | null;
  const filter = params.get('filter') === 'uncategorized' ? ('uncategorized' as const) : undefined;
  if (params.has('page')) window.history.replaceState(null, '', '/');
  return { page: p && PAGES.includes(p) ? p : 'dashboard', filter };
}

function App() {
  const [initial] = useState(readDeepLink);
  const [page, setPage] = useState<Page>(initial.page);
  const [txnFilter, setTxnFilter] = useState<{ value?: 'uncategorized'; nonce: number }>({ value: initial.filter, nonce: 0 });
  const [ready, setReady] = useState(false);
  const [adding, setAdding] = useState<EntryMode | null>(null);

  useEffect(() => {
    seedDefaults().then(() => setReady(true));
  }, []);

  // The service worker asks us to open a page when a notification is tapped.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== 'penny:navigate') return;
      const p = e.data.page as Page;
      if (PAGES.includes(p)) setPage(p);
      setTxnFilter((f) => ({ value: e.data.filter === 'uncategorized' ? 'uncategorized' : undefined, nonce: f.nonce + 1 }));
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  const navigate = useCallback((p: Page) => {
    setPage(p);
    window.scrollTo({ top: 0 });
  }, []);

  const openUncategorized = useCallback(() => {
    setTxnFilter((f) => ({ value: 'uncategorized', nonce: f.nonce + 1 }));
    navigate('transactions');
  }, [navigate]);

  if (!ready) {
    return (
      <div className="min-h-dvh bg-grad-canvas flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 animate-fade-in">
          <PennyMark className="size-12" />
          <p className="text-sm font-semibold text-ink-3">Loading Penny…</p>
        </div>
      </div>
    );
  }

  const pageContent: Record<Page, React.ReactNode> = {
    dashboard: <Dashboard onNavigate={navigate} onAdd={setAdding} onOpenUncategorized={openUncategorized} />,
    transactions: <Transactions key={txnFilter.nonce} onNavigate={navigate} initialFilter={txnFilter.value} />,
    accounts: <Accounts />,
    settings: <Settings onNavigate={navigate} />,
    import: <SmsImport onNavigate={navigate} />,
    budgets: <Budgets onNavigate={navigate} />,
    reports: <Reports onNavigate={navigate} />,
    categories: <Categories onNavigate={navigate} />,
  };

  return (
    <AppShell activePage={page} onNavigate={navigate} onAdd={() => setAdding('expense')}>
      {pageContent[page]}
      {adding && <AddTransactionForm initialMode={adding} onClose={() => setAdding(null)} onSaved={() => {}} />}
    </AppShell>
  );
}

export default App;
