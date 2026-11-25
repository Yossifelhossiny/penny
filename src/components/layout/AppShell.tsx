import type { ReactNode } from 'react';
import type { Page } from '../../types';
import { Header } from './Header';
import { BottomNav } from './BottomNav';

interface AppShellProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
  children: ReactNode;
}

export function AppShell({ activePage, onNavigate, children }: AppShellProps) {
  return (
    <div className="min-h-dvh bg-background text-text flex flex-col">
      <Header />
      <main className="flex-1 pb-20 max-w-lg mx-auto w-full">
        {children}
      </main>
      <BottomNav activePage={activePage} onNavigate={onNavigate} />
    </div>
  );
}
