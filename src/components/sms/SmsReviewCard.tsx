import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Copy, MessageSquareText, X } from 'lucide-react';
import type { Account, Category } from '../../types';
import type { SmsReviewItem } from '../../services/sms/smsImportService';
import { Amount, Badge, CategoryIcon, Field, Select, TextInput, Toggle, cx } from '../ui';

interface Props {
  item: SmsReviewItem;
  index: number;
  accounts: Account[];
  categories: Category[];
  onUpdate: (updated: SmsReviewItem) => void;
  onRemove: () => void;
}

const SOURCE: Record<string, string> = {
  generic_bank: 'Bank',
  instapay: 'InstaPay',
  vodafone_cash: 'Vodafone Cash',
  unknown: 'Unrecognised',
};

/**
 * One parsed SMS. The summary shows what Penny will save; details open in
 * place for corrections. Problems (duplicates, unclear dates) are shown as
 * plain sentences above the fields they concern.
 */
export function SmsReviewCard({ item, accounts, categories, onUpdate, onRemove }: Props) {
  const parsed = item.parsed;
  const needsDate = !item.isBalanceOnly && item.action !== 'ignore' && item.dateUnresolved && !!item.dateWarning;
  const [open, setOpen] = useState(needsDate || (parsed.confidence === 'low' && !item.isBalanceOnly));
  const [showSms, setShowSms] = useState(false);

  const account = accounts.find((a) => a.id === item.accountId);
  const toAccount = accounts.find((a) => a.id === item.toAccountId);
  const category = categories.find((c) => c.id === item.categoryId);
  const options = categories.filter((c) => (item.action === 'income' ? c.type === 'income' : item.action === 'expense' ? c.type === 'expense' : false));
  const piastres = Math.round((parseFloat(item.amountEgp) || 0) * 100);
  const duplicate = item.isBatchDuplicate || item.isDbDuplicate;
  const inactive = item.isBalanceOnly || item.action === 'ignore';
  const date = new Date(item.dateStr);

  const title = item.merchant || (item.action === 'transfer' ? 'Transfer' : category?.name ?? 'Transaction');
  const sub =
    item.action === 'transfer'
      ? `${account?.name ?? 'Choose account'} → ${toAccount?.name ?? 'Choose account'}`
      : [category?.name ?? 'No category', account?.name ?? 'Choose account'].join(' · ');

  return (
    <div className={cx('bg-surface rounded-card shadow-card overflow-hidden transition-opacity', !item.selected && !inactive && 'opacity-60')}>
      <div className="flex items-start gap-3 p-4">
        {!inactive && (
          <button
            type="button"
            role="checkbox"
            aria-checked={item.selected}
            aria-label={item.selected ? 'Don’t save this one' : 'Save this one'}
            onClick={() => onUpdate({ ...item, selected: !item.selected })}
            className={cx('mt-2.5 size-6 rounded-lg shrink-0 flex items-center justify-center transition-colors', item.selected ? 'bg-grad-primary text-white' : 'bg-well text-transparent')}
          >
            <Check className="size-4" strokeWidth={3} />
          </button>
        )}
        <CategoryIcon category={inactive ? null : category} transfer={item.action === 'transfer'} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[15px] font-semibold text-ink truncate" dir="auto">{title}</p>
            {item.isBalanceOnly ? (
              <Badge>Balance info</Badge>
            ) : (
              <Amount piastres={piastres} tone={item.action === 'income' ? 'income' : item.action === 'transfer' ? 'transfer' : 'expense'} signed={item.action !== 'transfer'} />
            )}
          </div>
          <p className="text-[13px] text-ink-3 truncate mt-0.5">{inactive ? 'Won’t be saved' : sub}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <Badge tone="brand">{SOURCE[parsed.source] ?? 'SMS'}</Badge>
            <Badge tone={needsDate ? 'warning' : 'neutral'}>
              {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, {date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </Badge>
            {item.hasFee && <Badge>Fee {parseFloat(item.feeEgp).toFixed(2)}</Badge>}
            {parsed.transactionType === 'atm_withdrawal' && <Badge>ATM · bank to cash</Badge>}
            {parsed.confidence === 'low' && <Badge tone="warning">Check details</Badge>}
          </div>
        </div>
      </div>

      {(duplicate || needsDate || item.isBalanceOnly) && (
        <div className="px-4 pb-3 space-y-2">
          {duplicate && (
            <p className="flex gap-2 text-[13px] text-caution bg-caution-soft rounded-xl px-3 py-2">
              <Copy className="size-4 shrink-0 mt-px" />
              {item.isBatchDuplicate ? 'Same message appears twice in what you pasted — this copy is unticked.' : item.dbDuplicateReason || 'Looks like this is already in your history.'}
            </p>
          )}
          {needsDate && (
            <p className="flex gap-2 text-[13px] text-caution bg-caution-soft rounded-xl px-3 py-2">
              <AlertTriangle className="size-4 shrink-0 mt-px" />
              {item.dateWarning}
            </p>
          )}
          {item.isBalanceOnly && <p className="text-[13px] text-ink-3 px-1">A balance notice, not a payment — Penny doesn’t record it.</p>}
        </div>
      )}

      <div className="flex items-center gap-1 px-2 pb-2">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="h-9 px-3 rounded-xl text-[13px] font-semibold text-brand-700 hover:bg-brand-50 inline-flex items-center gap-1">
          {open ? 'Hide details' : 'Edit details'} <ChevronDown className={cx('size-4 transition-transform', open && 'rotate-180')} />
        </button>
        <button type="button" onClick={() => setShowSms((v) => !v)} className="h-9 px-3 rounded-xl text-[13px] font-semibold text-ink-3 hover:bg-well inline-flex items-center gap-1.5">
          <MessageSquareText className="size-4" /> {showSms ? 'Hide SMS' : 'SMS'}
        </button>
        <button type="button" onClick={onRemove} className="ml-auto h-9 px-3 rounded-xl text-[13px] font-semibold text-ink-3 hover:bg-well inline-flex items-center gap-1.5">
          <X className="size-4" /> Remove
        </button>
      </div>

      {showSms && (
        <p dir="auto" className="mx-4 mb-4 text-sm text-ink-2 leading-relaxed bg-brand-50 rounded-2xl px-4 py-3 whitespace-pre-wrap break-words">{parsed.originalText}</p>
      )}

      {open && (
        <div className="bg-well/50 px-4 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={item.action} onChange={(e) => onUpdate({ ...item, action: e.target.value as SmsReviewItem['action'] })} className="bg-surface">
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="transfer">Transfer</option>
                <option value="ignore">Don’t save</option>
              </Select>
            </Field>
            <Field label="Amount (EGP)">
              <TextInput type="number" inputMode="decimal" step="0.01" min="0.01" value={item.amountEgp} onChange={(e) => onUpdate({ ...item, amountEgp: e.target.value })} className="bg-surface num" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={item.action === 'transfer' ? 'From' : 'Account'}>
              <Select value={item.accountId} onChange={(e) => onUpdate({ ...item, accountId: parseInt(e.target.value, 10) })} className="bg-surface">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </Field>
            {item.action === 'transfer' ? (
              <Field label="To">
                <Select value={item.toAccountId ?? ''} onChange={(e) => onUpdate({ ...item, toAccountId: parseInt(e.target.value, 10) })} className="bg-surface">
                  <option value="">Choose</option>
                  {accounts.filter((a) => a.id !== item.accountId).map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label="Category">
                <Select value={item.categoryId ?? ''} onChange={(e) => onUpdate({ ...item, categoryId: parseInt(e.target.value, 10) })} className="bg-surface" disabled={item.action === 'ignore'}>
                  {options.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
            )}
          </div>

          <Field label="Date and time">
            <TextInput type="datetime-local" value={item.dateStr} onChange={(e) => onUpdate({ ...item, dateStr: e.target.value, dateUnresolved: false, dateWarning: undefined })} className="bg-surface text-sm" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={item.action === 'income' ? 'From' : 'Paid to'}>
              <TextInput value={item.merchant} onChange={(e) => onUpdate({ ...item, merchant: e.target.value })} className="bg-surface" dir="auto" />
            </Field>
            <Field label="Note">
              <TextInput value={item.note} onChange={(e) => onUpdate({ ...item, note: e.target.value })} className="bg-surface" />
            </Field>
          </div>

          {item.hasFee && (
            <div className="rounded-2xl bg-surface p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-ink">Save the fee as its own expense</span>
                <Toggle label="Save fee separately" checked={item.includeFeeAsExpense} onChange={(v) => onUpdate({ ...item, includeFeeAsExpense: v })} />
              </div>
              {item.includeFeeAsExpense && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Fee (EGP)">
                    <TextInput type="number" step="0.01" min="0" value={item.feeEgp} onChange={(e) => onUpdate({ ...item, feeEgp: e.target.value })} className="num" />
                  </Field>
                  <Field label="Category">
                    <Select value={item.feeCategoryId ?? ''} onChange={(e) => onUpdate({ ...item, feeCategoryId: parseInt(e.target.value, 10) })}>
                      {categories.filter((c) => c.type === 'expense').map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
