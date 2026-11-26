import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, CheckCircle2, ClipboardPaste, Sparkles } from 'lucide-react';
import { db } from '../db';
import type { Page, SmsInboxEntry } from '../types';
import { splitSmsMessages, processSmsBatch, saveConfirmedReviewItems, validateReviewItem, type SmsReviewItem } from '../services/sms/smsImportService';
import { reviewItemsForEntry, markInboxEntryResolved } from '../services/sms/smsInboxService';
import { SmsReviewCard } from '../components/sms/SmsReviewCard';
import { SmsInboxSync } from '../components/sms/SmsInboxSync';
import { AutoImportCard } from '../components/settings/AutoImportCard';
import { Amount, Banner, Button, Card, EmptyState, IconButton, PageHeader, Section, TextArea } from '../components/ui';

interface Props {
  onNavigate?: (page: Page) => void;
}

const SAMPLES: Array<{ label: string; text: string }> = [
  { label: 'Card purchase', text: 'تم خصم 160.00EGP من بطاقة المدفوعة مقدماً رقم 3956 عند PAYMOB-*vasko egypt TA يوم 09/05 الساعه 17:09 المتاح 3313.78 للمزيد إتصل ب 19623' },
  { label: 'InstaPay sent', text: 'تم تنفيذ تحويل لحظي من بطاقتكم مسبقة الدفع بمبلغ 45.00 جم إلى محمود ا*** ع******** ف** رقم مرجعي 760182550211 يوم 05-09 الساعة 22:21 للمزيد اتصل بـ 19623' },
  { label: 'InstaPay received', text: 'تم إضافة تحويل لحظي بمبلغ 500.00 جم من AHMED M****** إلى بطاقتكم مسبقة الدفع رقم مرجعي 287630550001 يوم 06-09 الساعة 14:10' },
  { label: 'Vodafone Cash + fee', text: 'تم تحويل 600 EGP إلى 01002006618 رسوم 1 EGP معرف 019799986433 26-05-07 21:37' },
  { label: 'ATM withdrawal', text: 'تم سحب 2000.00EGP من بطاقة المدفوعة مقدماً رقم 3956 سحب من الصراف يوم 11/05 الساعه 14:00 المتاح 6313.78 للمزيد إتصل ب 19623' },
  {
    label: 'Several at once',
    text: `تم خصم 160.00EGP من بطاقة المدفوعة مقدماً رقم 3956 عند PAYMOB-*vasko egypt TA يوم 09/05 الساعه 17:09 المتاح 3313.78
---
تم تحويل 600 EGP إلى 01002006618 رسوم 1 EGP معرف 019799986433 26-05-07 21:37
---
تم استلام 200 EGP من 01015147307 / Mohamed K Eissa معرف 019756663531 13:32 26-05-06
---
رصيد بطاقة رقم 3956 المتاح 5000.00 EGP`,
  },
];

export function SmsImport({ onNavigate }: Props) {
  const [rawText, setRawText] = useState('');
  const [items, setItems] = useState<SmsReviewItem[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ savedCount: number; feeCount: number } | null>(null);
  const [error, setError] = useState('');
  /** Set while reviewing a pending SMS from the iPhone inbox. */
  const [reviewingInboxId, setReviewingInboxId] = useState<number | null>(null);

  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const detected = splitSmsMessages(rawText).length;

  async function reviewInboxEntry(entry: SmsInboxEntry) {
    setError('');
    try {
      const next = await reviewItemsForEntry(entry);
      if (next.length === 0) return setError('This SMS couldn’t be turned into a transaction.');
      setItems(next);
      setReviewingInboxId(entry.id ?? null);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t open this SMS');
    }
  }

  async function parse() {
    if (!rawText.trim()) return;
    setParsing(true);
    setError('');
    setSaved(null);
    try {
      setItems(await processSmsBatch(rawText, accounts, categories));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t read those messages');
    } finally {
      setParsing(false);
    }
  }

  async function pasteClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setRawText(text);
    } catch {
      setError('Penny can’t read the clipboard here — long-press the box and choose Paste.');
    }
  }

  const update = (i: number, next: SmsReviewItem) => setItems((p) => p.map((it, j) => (j === i ? next : it)));
  const remove = (i: number) => setItems((p) => p.filter((_, j) => j !== i));
  const selectAll = (selected: boolean) => setItems((p) => p.map((it) => (it.isBalanceOnly ? it : { ...it, selected })));
  const untickDuplicates = () => setItems((p) => p.map((it) => (it.isBatchDuplicate || it.isDbDuplicate ? { ...it, selected: false } : it)));

  async function confirm() {
    setError('');
    const chosen = items.filter((it) => it.selected && it.action !== 'ignore' && !it.isBalanceOnly);
    if (chosen.length === 0) return setError('Tick at least one message to save.');
    for (const it of chosen) {
      const err = validateReviewItem(it);
      if (err) return setError(`${it.merchant || 'One message'}: ${err}`);
    }
    setSaving(true);
    try {
      const result = await saveConfirmedReviewItems(items);
      if (result.errors.length > 0) setError(result.errors.join(' · '));
      if (result.savedCount > 0 || result.feeCount > 0) {
        if (reviewingInboxId !== null) {
          await markInboxEntryResolved(reviewingInboxId, result.transactionIds);
          setReviewingInboxId(null);
        }
        setSaved({ savedCount: result.savedCount, feeCount: result.feeCount });
        setItems([]);
        setRawText('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save');
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setReviewingInboxId(null);
    setItems([]);
    setRawText('');
    setSaved(null);
    setError('');
  }

  const chosen = items.filter((it) => it.selected && it.action !== 'ignore' && !it.isBalanceOnly);
  const sum = (a: string) => chosen.filter((it) => it.action === a).reduce((s, it) => s + Math.round((parseFloat(it.amountEgp) || 0) * 100), 0);
  const dupes = items.filter((it) => it.isBatchDuplicate || it.isDbDuplicate).length;

  const header = (
    <PageHeader
      title={items.length > 0 ? 'Review' : 'Import SMS'}
      subtitle={items.length > 0 ? `${items.length} ${items.length === 1 ? 'message' : 'messages'} read — check before saving` : undefined}
      leading={
        onNavigate && (
          <IconButton label={items.length > 0 ? 'Cancel review' : 'Back'} onClick={() => (items.length > 0 ? reset() : onNavigate('transactions'))} className="-ml-2.5 mt-[-2px]">
            <ArrowLeft className="size-5" />
          </IconButton>
        )
      }
    />
  );

  if (saved) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <EmptyState
            icon={<CheckCircle2 />}
            title={`Saved ${saved.savedCount} ${saved.savedCount === 1 ? 'transaction' : 'transactions'}`}
            message={`${saved.feeCount > 0 ? `Plus ${saved.feeCount} ${saved.feeCount === 1 ? 'fee' : 'fees'}. ` : ''}Balances are up to date.`}
            action={
              <div className="flex gap-2">
                {onNavigate && <Button onClick={() => onNavigate('transactions')}>See activity</Button>}
                <Button variant="secondary" onClick={reset}>Import more</Button>
              </div>
            }
          />
        </Card>
      </div>
    );
  }

  if (items.length > 0) {
    return (
      <div className="space-y-5 pb-28">
        {header}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="plain" onClick={() => selectAll(true)}>Tick all</Button>
          <Button size="sm" variant="plain" onClick={() => selectAll(false)}>Untick all</Button>
          {dupes > 0 && <Button size="sm" variant="plain" onClick={untickDuplicates}>Untick duplicates ({dupes})</Button>}
        </div>
        {error && <Banner tone="error">{error}</Banner>}
        <div className="space-y-3">
          {items.map((it, i) => (
            <SmsReviewCard key={it.id} item={it} index={i} accounts={accounts} categories={categories} onUpdate={(n) => update(i, n)} onRemove={() => remove(i)} />
          ))}
        </div>

        <div className="fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 px-5">
          <div className="max-w-lg mx-auto rounded-[22px] bg-surface/95 backdrop-blur-xl shadow-[0_12px_40px_-12px_rgb(80_52_168/0.35)] p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0 pl-1">
              <p className="text-[13px] font-semibold text-ink num">{chosen.length} of {items.length} selected</p>
              <p className="flex gap-2.5 mt-0.5">
                {sum('income') > 0 && <Amount piastres={sum('income')} tone="income" signed size="sm" />}
                {sum('expense') > 0 && <Amount piastres={sum('expense')} tone="expense" signed size="sm" />}
              </p>
            </div>
            <Button onClick={confirm} loading={saving} disabled={chosen.length === 0}>
              Save {chosen.length || ''}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}
      {error && <Banner tone="error">{error}</Banner>}

      <AutoImportCard />
      <SmsInboxSync onReview={reviewInboxEntry} />

      <Section title="Paste messages">
        <Card className="space-y-3">
          <TextArea
            rows={6}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste one or more bank or wallet SMS here — Arabic or English."
            dir="auto"
            aria-label="SMS text"
            className="text-sm"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1.5">
              <Button size="sm" variant="plain" icon={<ClipboardPaste className="size-4" />} onClick={pasteClipboard}>Paste</Button>
              {rawText && <Button size="sm" variant="ghost" onClick={() => setRawText('')}>Clear</Button>}
            </div>
            <Button size="sm" icon={<Sparkles className="size-4" />} onClick={parse} loading={parsing} disabled={!rawText.trim()}>
              Read {detected > 1 ? `${detected} messages` : 'message'}
            </Button>
          </div>
          <p className="text-[12px] text-ink-3">Separate messages with a blank line or “---”.</p>
        </Card>
      </Section>

      <Section title="Try an example">
        <div className="flex flex-wrap gap-2">
          {SAMPLES.map((s) => (
            <button key={s.label} type="button" onClick={() => setRawText(s.text)} className="h-9 px-3.5 rounded-full bg-surface shadow-card text-[13px] font-semibold text-ink-2 hover:text-brand-700 transition-colors">
              {s.label}
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}
