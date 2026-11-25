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

function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    seedDefaults().then(() => setReady(true));
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
    transactions: <Transactions onNavigate={setPage} />,
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
