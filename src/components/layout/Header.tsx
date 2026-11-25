export function Header() {
  return (
    <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-white/5">
      <div className="flex items-center justify-between px-4 h-14 max-w-lg mx-auto">
        <h1 className="text-lg font-bold tracking-tight text-primary">
          Penny
        </h1>
        <span className="text-xs text-text-muted">Finance Tracker</span>
      </div>
    </header>
  );
}
