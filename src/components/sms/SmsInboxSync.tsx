import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, FolderSync, Inbox } from 'lucide-react';
import { db } from '../../db';
import type { SmsInboxEntry } from '../../types';
import { importSmsInbox, dismissInboxEntry, type InboxImportSummary } from '../../services/sms/smsInboxService';
import { Badge, Banner, Button, Card, Section, cx } from '../ui';

interface Props {
  /** Open a pending SMS in the review screen. */
  onReview: (entry: SmsInboxEntry) => void;
}

const STATUS: Record<SmsInboxEntry['status'], { label: string; tone: 'income' | 'warning' | 'neutral' }> = {
  saved: { label: 'Saved', tone: 'income' },
  resolved: { label: 'Reviewed', tone: 'income' },
  pending: { label: 'Needs review', tone: 'warning' },
  duplicate: { label: 'Duplicate', tone: 'neutral' },
  ignored: { label: 'Not a transaction', tone: 'neutral' },
  dismissed: { label: 'Dismissed', tone: 'neutral' },
};

const when = (d: Date | null) => (d ? d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'Time unknown');

/** Pending queue + manual sync of the iPhone Shortcut's inbox file. */
export function SmsInboxSync({ onReview }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [syncing, setSyncing] = useState(false);
  const [summary, setSummary] = useState<InboxImportSummary | null>(null);
  const [error, setError] = useState('');
  const [showLog, setShowLog] = useState(false);

  const pending = useLiveQuery(() => db.smsInbox.where('status').equals('pending').reverse().sortBy('createdAt'), []) ?? [];
  const recent =
    useLiveQuery(async () => (await db.smsInbox.toArray()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 15), []) ?? [];

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (!file) return;
    setSyncing(true);
    setError('');
    setSummary(null);
    try {
      const result = await importSmsInbox(await file.text());
      setSummary(result);
      if (result.total === 0) setError('That file has no SMS yet. Check that the Shortcut writes to penny-sms-inbox.txt.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the inbox file');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <Section title={`Waiting for you · ${pending.length}`}>
          <div className="space-y-2.5">
            {pending.map((entry) => (
              <Card key={entry.id} className="space-y-3">
                <p dir="auto" className="text-sm text-ink-2 leading-relaxed line-clamp-3">{entry.text}</p>
                <Banner tone="warning" className="py-2.5">{entry.reason}</Banner>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12px] text-ink-3 truncate">{entry.sender ? `${entry.sender} · ` : ''}{when(entry.receivedAt)}</span>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="plain" onClick={() => dismissInboxEntry(entry.id!)}>Dismiss</Button>
                    <Button size="sm" onClick={() => onReview(entry)}>Review</Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      )}

      <Card className="space-y-4">
        <div className="flex items-start gap-3.5">
          <span className="size-11 rounded-[14px] bg-grad-soft text-brand-700 flex items-center justify-center shrink-0">
            <FolderSync className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-ink">Sync from file</p>
            <p className="text-[13px] text-ink-3 mt-0.5">Backup route: pick <span className="font-semibold text-ink-2">penny-sms-inbox.txt</span> in iCloud Drive › Shortcuts. Already-imported SMS are skipped.</p>
          </div>
        </div>
        <input ref={fileRef} type="file" accept=".txt,text/plain" onChange={handleFile} className="hidden" />
        <Button variant="secondary" block loading={syncing} onClick={() => fileRef.current?.click()}>
          {syncing ? 'Importing…' : 'Choose inbox file'}
        </Button>

        {summary && summary.total > 0 && (
          <div className="grid grid-cols-4 gap-1 rounded-2xl bg-well/70 p-3 text-center">
            {[
              { n: summary.saved, label: 'Saved', cls: 'text-income' },
              { n: summary.pending, label: 'To review', cls: 'text-caution' },
              { n: summary.duplicates, label: 'Duplicate', cls: 'text-ink-2' },
              { n: summary.ignored, label: 'Skipped', cls: 'text-ink-2' },
            ].map((s) => (
              <div key={s.label}>
                <p className={cx('num text-xl font-bold', s.cls)}>{s.n}</p>
                <p className="text-[11px] font-semibold text-ink-3">{s.label}</p>
              </div>
            ))}
            {summary.alreadyProcessed > 0 && <p className="col-span-4 text-[12px] text-ink-3 mt-2">{summary.alreadyProcessed} were already synced before.</p>}
          </div>
        )}
        {error && <Banner tone="error">{error}</Banner>}
      </Card>

      {recent.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowLog((v) => !v)} className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 px-1" aria-expanded={showLog}>
            <Inbox className="size-4" /> Import log
            <ChevronDown className={cx('size-4 transition-transform', showLog && 'rotate-180')} />
          </button>
          {showLog && (
            <Card padded={false} className="mt-3 py-1.5">
              {recent.map((e) => (
                <div key={e.id} className="px-4 py-2.5 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p dir="auto" className="text-[13px] text-ink-2 truncate">{e.text}</p>
                    <p className="text-[11px] text-ink-3 mt-0.5">{when(e.receivedAt)}</p>
                  </div>
                  <Badge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Badge>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
