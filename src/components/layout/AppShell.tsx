import type { ReactNode } from 'react';
import type { Page } from '../../types';
import { BottomNav } from './BottomNav';

interface AppShellProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
  onAdd: () => void;
  children: ReactNode;
}

export function AppShell({ activePage, onNavigate, onAdd, children }: AppShellProps) {
  return (
    <div className="min-h-dvh bg-grad-canvas bg-fixed text-ink">
      <main className="max-w-lg mx-auto w-full px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[calc(96px+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <BottomNav activePage={activePage} onNavigate={onNavigate} onAdd={onAdd} />
    </div>
  );
}
