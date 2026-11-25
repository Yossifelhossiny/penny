import type { Page } from '../../types';

interface BottomNavProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
}

const tabs: { page: Page; label: string; icon: string }[] = [
  { page: 'dashboard', label: 'Home', icon: '📊' },
  { page: 'transactions', label: 'History', icon: '📋' },
  { page: 'import', label: 'Import', icon: '📥' },
  { page: 'accounts', label: 'Accounts', icon: '💳' },
  { page: 'settings', label: 'Settings', icon: '⚙️' },
];

export function BottomNav({ activePage, onNavigate }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-10 bg-surface/95 backdrop-blur-md border-t border-white/5 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around max-w-lg mx-auto h-16">
        {tabs.map((tab) => {
          const isActive = activePage === tab.page;
          return (
            <button
              key={tab.page}
              onClick={() => onNavigate(tab.page)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-[64px] ${
                isActive
                  ? 'text-primary'
                  : 'text-text-muted active:text-text'
              }`}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
