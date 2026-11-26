import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import type { SmsInboxEntry } from '../../types';
import {
  importSmsInbox,
  dismissInboxEntry,
  type InboxImportSummary,
} from '../../services/sms/smsInboxService';

interface Props {
  /** Open a pending SMS in the normal review screen. */
  onReview: (entry: SmsInboxEntry) => void;
}

const STATUS_LABEL: Record<SmsInboxEntry['status'], { label: string; cls: string }> = {
  saved: { label: 'Saved', cls: 'bg-success/15 text-success' },
  resolved: { label: 'Reviewed', cls: 'bg-success/15 text-success' },
  pending: { label: 'Needs review', cls: 'bg-warning/15 text-warning' },
  duplicate: { label: 'Duplicate', cls: 'bg-white/10 text-text-muted' },
  ignored: { label: 'Not a transaction', cls: 'bg-white/10 text-text-muted' },
  dismissed: { label: 'Dismissed', cls: 'bg-white/10 text-text-muted' },
};

function formatWhen(d: Date | null): string {
  if (!d) return 'Time unknown';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * "Auto-import from iPhone" card on the Import screen.
 * Reads the inbox file written by the iOS Shortcut and imports it.
 */
export function SmsInboxSync({ onReview }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [syncing, setSyncing] = useState(false);
  const [summary, setSummary] = useState<InboxImportSummary | null>(null);
  const [error, setError] = useState('');
  const [showLog, setShowLog] = useState(false);

  const pending = useLiveQuery(
    () => db.smsInbox.where('status').equals('pending').reverse().sortBy('createdAt'),
    []
  ) ?? [];
  const recent = useLiveQuery(
    async () => (await db.smsInbox.toArray()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 15),
    []
  ) ?? [];

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again next time
    if (!file) return;
    setSyncing(true);
    setError('');
    setSummary(null);
    try {
      const text = await file.text();
      const result = await importSmsInbox(text);
      setSummary(result);
      if (result.total === 0) {
        setError('That file has no SMS in it yet. Check that the automation is writing to penny-sms-inbox.txt.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the inbox file');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="bg-surface rounded-2xl p-4 space-y-3 border border-primary/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <span>📲</span>
            <span>Auto-import from iPhone</span>
          </h3>
          <p className="text-xs text-text-muted mt-0.5">
            SMS captured by your Shortcut are saved automatically. Unclear ones wait below for you.
          </p>
        </div>
        {pending.length > 0 && (
          <span className="shrink-0 text-[11px] font-semibold bg-warning/15 text-warning px-2 py-1 rounded-full">
            {pending.length} to review
          </span>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".txt,text/plain"
        className="hidden"
        onChange={handleFile}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={syncing}
        className="w-full bg-primary text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
      >
        {syncing ? (
          <>
            <span className="inline-block animate-spin">⏳</span>
            <span>Importing…</span>
          </>
        ) : (
          <>
            <span>🔄</span>
            <span>Sync SMS Inbox</span>
          </>
        )}
      </button>
      <p className="text-[11px] text-text-muted text-center -mt-1">
        Pick <span className="font-medium text-text">penny-sms-inbox.txt</span> in iCloud Drive › Shortcuts
      </p>

      {error && <p className="text-xs text-danger">{error}</p>}

      {summary && summary.total > 0 && (
        <div className="bg-background rounded-xl p-3 space-y-2" role="status">
          <div className="grid grid-cols-4 gap-2 text-center">
            <Stat n={summary.saved} label="Saved" cls="text-success" />
            <Stat n={summary.pending} label="To review" cls="text-warning" />
            <Stat n={summary.duplicates} label="Duplicates" cls="text-text-muted" />
            <Stat n={summary.ignored} label="Skipped" cls="text-text-muted" />
          </div>
          <p className="text-[11px] text-text-muted text-center">
            {summary.alreadyProcessed > 0 && `${summary.alreadyProcessed} already synced before. `}
            {summary.errors > 0 && <span className="text-danger">{summary.errors} failed — see log. </span>}
            {summary.saved > 0 && 'Balances are updated.'}
          </p>
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Needs your review</p>
          {pending.map((entry) => (
            <div key={entry.id} className="bg-background rounded-xl p-3 space-y-2 border border-warning/20">
              <p className="text-xs leading-relaxed line-clamp-3" dir="auto">{entry.text}</p>
              <p className="text-[11px] text-warning">⚠️ {entry.reason}</p>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-text-muted">
                  {entry.sender ? `${entry.sender} · ` : ''}{formatWhen(entry.receivedAt)}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => dismissInboxEntry(entry.id!)}
                    className="text-xs text-text-muted px-3 py-1.5 rounded-lg bg-surface cursor-pointer"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => onReview(entry)}
                    className="text-xs text-white font-medium px-3 py-1.5 rounded-lg bg-primary cursor-pointer"
                  >
                    Review
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowLog((v) => !v)}
            className="text-xs text-primary font-medium cursor-pointer"
          >
            {showLog ? 'Hide' : 'Show'} import log ({recent.length} latest)
          </button>
          {showLog && (
            <ul className="mt-2 space-y-1.5">
              {recent.map((entry) => {
                const s = STATUS_LABEL[entry.status];
                return (
                  <li key={entry.id} className="bg-background rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${s.cls}`}>{s.label}</span>
                      <span className="text-[10px] text-text-muted">{formatWhen(entry.receivedAt)}</span>
                    </div>
                    <p className="text-[11px] mt-1 truncate" dir="auto">{entry.text}</p>
                    <p className="text-[10px] text-text-muted truncate">{entry.reason}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ n, label, cls }: { n: number; label: string; cls: string }) {
  return (
    <div>
      <p className={`text-lg font-bold ${cls}`}>{n}</p>
      <p className="text-[10px] text-text-muted">{label}</p>
    </div>
  );
}
