import { useState, useEffect } from 'react';
import type { Page } from './types';
import { seedDefaults } from './db';
import { AppShell } from './components/layout/AppShell';
import { Dashboard } from './pages/Dashboard';
import { Transactions } from './pages/Transactions';
import { Accounts } from './pages/Accounts';
import { Settings } from './pages/Settings';
import { SmsImport } from './pages/SmsImport';
import { Budgets } from './pages/Budgets';

const PAGES: Page[] = ['dashboard', 'transactions', 'accounts', 'settings', 'import', 'budgets', 'reports'];

/** Page/filter from a notification tap: /?page=transactions&filter=uncategorized */
function readDeepLink(): { page: Page; filter?: 'uncategorized' } {
  const params = new URLSearchParams(window.location.search);
  const p = params.get('page') as Page | null;
  const filter = params.get('filter') === 'uncategorized' ? 'uncategorized' as const : undefined;
  if (params.has('page')) window.history.replaceState(null, '', '/');
  return { page: p && PAGES.includes(p) ? p : 'dashboard', filter };
}

function App() {
  const [initial] = useState(readDeepLink);
  const [page, setPage] = useState<Page>(initial.page);
  const [txnFilter, setTxnFilter] = useState<{ value?: 'uncategorized'; nonce: number }>({ value: initial.filter, nonce: 0 });
  const [ready, setReady] = useState(false);

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
      setTxnFilter(f => ({ value: e.data.filter === 'uncategorized' ? 'uncategorized' : undefined, nonce: f.nonce + 1 }));
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  if (!ready) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-3xl mb-2">🪙</p>
          <p className="text-primary font-semibold">Loading Penny…</p>
        </div>
      </div>
    );
  }

  const pageContent: Record<Page, React.ReactNode> = {
    dashboard: <Dashboard onNavigate={setPage} />,
    transactions: <Transactions key={txnFilter.nonce} onNavigate={setPage} initialFilter={txnFilter.value} />,
    accounts: <Accounts />,
    settings: <Settings onNavigate={setPage} />,
    import: <SmsImport onNavigate={setPage} />,
    budgets: <Budgets onNavigate={setPage} />,
    reports: <Settings onNavigate={setPage} />,
  };

  return (
    <AppShell activePage={page} onNavigate={setPage}>
      {pageContent[page]}
    </AppShell>
  );
}

export default App;
