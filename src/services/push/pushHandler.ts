/**
 * Handles one SMS pushed by the iOS Shortcut (through /api/sms and Web Push).
 *
 * Runs inside the service worker, so it works while Penny is closed. It goes
 * through exactly the same importer as the "Sync SMS Inbox" button, so the
 * same SMS can never be saved twice — not even if it later arrives again
 * through the inbox file.
 */

import { db } from '../../db';
import { importSmsEntries, countUncategorizedTransactions } from '../sms/smsInboxService';
import { runRecurringIncome } from '../recurring';

export const PUSH_META_KEY = 'autoImportPush';

/** What Penny keeps about automatic import on this device. */
export interface PushSettings {
  /** Shared secret; pushes without it are ignored. */
  secret: string;
  enabledAt: string;
}

/** Payload sent by /api/sms inside the (end-to-end encrypted) push message. */
export interface PushPayload {
  v: 1;
  secret: string;
  kind: 'sms' | 'test';
  received?: string;
  sender?: string;
  text?: string;
}

export interface PushNotice {
  title: string;
  body: string;
  /** Page to open when the notification is tapped. */
  page: 'transactions' | 'import' | 'dashboard';
  filter?: 'uncategorized';
  tag: string;
}

function egp(piastres: number | null | undefined): string {
  if (piastres == null) return '';
  return (piastres / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' ج.م';
}

export async function handlePushPayload(raw: unknown): Promise<PushNotice | null> {
  const data = raw as Partial<PushPayload> | null;
  if (!data || data.v !== 1 || typeof data.secret !== 'string') return null;

  const settings = (await db.meta.get(PUSH_META_KEY))?.value as PushSettings | undefined;
  if (!settings || settings.secret !== data.secret) {
    // Not from this device's Shortcut (or automatic import was turned off).
    return null;
  }

  if (data.kind === 'test') {
    return {
      title: 'Penny · Automatic import is on',
      body: 'الاستيراد التلقائي شغال. أي رسالة بنك هتتسجل لوحدها.',
      page: 'import',
      tag: 'penny-test',
    };
  }

  // A push wakes Penny even when closed — a good moment to add due monthly income.
  await runRecurringIncome().catch(() => {});

  const text = (data.text ?? '').trim();
  if (!text) return null;
  const receivedAt = data.received ? new Date(data.received) : new Date();

  const summary = await importSmsEntries([
    {
      receivedAt: isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
      sender: data.sender?.trim() || null,
      text,
    },
  ]);
  const result = summary.results[0];
  if (!result) return null;

  if (result.status === 'saved') {
    const uncategorized = await countUncategorizedTransactions();
    const sign = result.action === 'income' ? '+' : result.action === 'expense' ? '−' : '';
    const amount = `${sign}${egp(result.amountPiastres)}`;
    const who = result.personName
      ? result.action === 'income'
        ? `من ${result.personName}`
        : `لـ ${result.personName}`
      : result.counterparty ?? '';
    const lines = [[amount, who].filter(Boolean).join(' · ')];
    if (result.categoryName) lines.push(`اتسجلت في ${result.categoryName}.`);
    if (uncategorized > 0) {
      lines.push(`عندك ${uncategorized} ${uncategorized === 1 ? 'معاملة' : 'معاملات'} من غير تصنيف — ادخل ظبطها.`);
    }
    return {
      title:
        result.action === 'income'
          ? result.personName ? `Penny · فلوس جاتلك من ${result.personName}` : 'Penny · فلوس دخلت'
          : result.action === 'transfer' ? 'Penny · تحويل' : 'Penny · مصروف جديد',
      body: lines.join('\n'),
      page: uncategorized > 0 ? 'transactions' : 'dashboard',
      filter: uncategorized > 0 ? 'uncategorized' : undefined,
      tag: 'penny-uncategorized',
    };
  }

  if (result.status === 'pending') {
    return {
      title: 'Penny · رسالة محتاجة مراجعة',
      body: `${result.reason}\nادخل Import وراجعها.`,
      page: 'import',
      tag: 'penny-review',
    };
  }

  if (result.status === 'error') {
    return {
      title: 'Penny · ماقدرتش أسجل الرسالة',
      body: 'افتح Penny وجرب Sync SMS Inbox.',
      page: 'import',
      tag: 'penny-error',
    };
  }

  // duplicate / ignored / already processed: iOS requires a visible
  // notification for every push, so keep it quiet and short.
  return {
    title: 'Penny',
    body: result.status === 'ignored' ? 'رسالة مش مالية — اتجاهلت.' : 'الرسالة دي متسجلة قبل كده.',
    page: 'dashboard',
    tag: 'penny-info',
  };
}
