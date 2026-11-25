import { useState } from 'react';
import type { Account, Category } from '../../types';
import type { SmsReviewItem } from '../../services/sms/smsImportService';
import { formatEGP } from '../../utils/format';

interface Props {
  item: SmsReviewItem;
  index: number;
  accounts: Account[];
  categories: Category[];
  onUpdate: (updated: SmsReviewItem) => void;
  onRemove: () => void;
}

export function SmsReviewCard({
  item,
  index,
  accounts,
  categories,
  onUpdate,
  onRemove,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const parsed = item.parsed;

  // Source styling
  const sourceLabels: Record<string, { label: string; icon: string; color: string }> = {
    generic_bank: { label: 'Bank SMS', icon: '🏦', color: 'bg-blue-500/15 text-blue-400' },
    instapay: { label: 'InstaPay', icon: '⚡', color: 'bg-amber-500/15 text-amber-400' },
    vodafone_cash: { label: 'Vodafone Cash', icon: '📱', color: 'bg-red-500/15 text-red-400' },
    unknown: { label: 'Unknown Source', icon: '❓', color: 'bg-slate-500/15 text-slate-400' },
  };

  const srcInfo = sourceLabels[parsed.source] || sourceLabels.unknown;

  // Type styling
  const typeBadge = {
    income: { label: 'Income', color: 'bg-success/15 text-success' },
    expense: { label: 'Expense', color: 'bg-danger/15 text-danger' },
    transfer: { label: 'Transfer', color: 'bg-warning/15 text-warning' },
    ignore: { label: 'Informational', color: 'bg-slate-500/15 text-slate-400' },
  }[item.action];

  const sourceAccount = accounts.find(a => a.id === item.accountId);
  const toAccount = accounts.find(a => a.id === item.toAccountId);
  const category = categories.find(c => c.id === item.categoryId);

  // Available categories for current action
  const availableCategories = categories.filter(c => {
    if (item.action === 'income') return c.type === 'income';
    if (item.action === 'expense') return c.type === 'expense';
    return false;
  });

  const parsedAmountPiastres = Math.round((parseFloat(item.amountEgp) || 0) * 100);

  return (
    <div
      className={`bg-surface rounded-xl border transition-all ${
        item.isBatchDuplicate || item.isDbDuplicate
          ? 'border-warning/30 bg-surface/80'
          : item.isBalanceOnly
          ? 'border-white/5 opacity-80'
          : item.selected
          ? 'border-primary/40 shadow-sm'
          : 'border-white/5 opacity-70'
      }`}
    >
      {/* Top Header Row */}
      <div className="p-3.5 flex items-start gap-3">
        {/* Checkbox / Selection */}
        <div className="pt-0.5">
          {item.isBalanceOnly ? (
            <span
              className="text-xs text-text-muted px-1.5 py-0.5 rounded bg-surface-light cursor-help"
              title="Balance-only message: no transaction will be created"
            >
              Info
            </span>
          ) : (
            <input
              type="checkbox"
              id={`select-${item.id}`}
              checked={item.selected}
              onChange={(e) => onUpdate({ ...item, selected: e.target.checked })}
              className="w-4 h-4 rounded text-primary bg-surface-light border-white/20 focus:ring-primary focus:ring-offset-surface cursor-pointer"
            />
          )}
        </div>

        {/* Content Preview */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <span className="text-[10px] text-text-muted font-mono">#{index + 1}</span>

            {/* Source Badge */}
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1 ${srcInfo.color}`}>
              <span>{srcInfo.icon}</span>
              <span>{srcInfo.label}</span>
            </span>

            {/* Action Badge */}
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${typeBadge.color}`}>
              {parsed.transactionType === 'atm_withdrawal'
                ? 'ATM (Bank → Cash)'
                : typeBadge.label}
            </span>

            {/* Confidence Badge */}
            {parsed.confidence === 'low' && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-danger/15 text-danger font-medium">
                Low Confidence
              </span>
            )}
          </div>

          {/* Amount & Merchant / Recipient */}
          <div className="flex items-baseline justify-between gap-2 mt-1">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate">
                {item.merchant || (item.action === 'transfer' ? 'Account Transfer' : 'Transaction')}
              </p>
              {item.note && (
                <p className="text-xs text-text-muted truncate mt-0.5">{item.note}</p>
              )}
            </div>

            {/* Amount display */}
            <div className="text-right shrink-0">
              {item.isBalanceOnly ? (
                <p className="text-xs text-text-muted font-medium">No money moved</p>
              ) : (
                <p className={`text-base font-bold ${
                  item.action === 'income' ? 'text-success' :
                  item.action === 'transfer' ? 'text-warning' : 'text-danger'
                }`}>
                  {item.action === 'income' ? '+' : item.action === 'transfer' ? '🔄 ' : '-'}
                  {formatEGP(parsedAmountPiastres)}
                </p>
              )}
            </div>
          </div>

          {/* Key tags & details */}
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-text-muted">
            {/* Account */}
            <span className="inline-flex items-center gap-1 bg-surface-light px-2 py-0.5 rounded-md">
              <span>{sourceAccount?.icon ?? '💳'}</span>
              <span>{sourceAccount?.name ?? 'Select Account'}</span>
              {item.action === 'transfer' && (
                <>
                  <span className="text-warning">→</span>
                  <span>{toAccount?.icon ?? '💳'}</span>
                  <span>{toAccount?.name ?? 'Select Destination'}</span>
                </>
              )}
            </span>

            {/* Category if expense/income */}
            {item.action !== 'transfer' && !item.isBalanceOnly && (
              <span className="inline-flex items-center gap-1 bg-surface-light px-2 py-0.5 rounded-md">
                <span>{category?.icon ?? '❓'}</span>
                <span>{category?.name ?? 'Uncategorized'}</span>
              </span>
            )}

            {/* Date */}
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${
              item.dateUnresolved ? 'bg-warning/15 text-warning font-medium' : 'bg-surface-light'
            }`}>
              <span>📅</span>
              <span>{new Date(item.dateStr).toLocaleDateString()} {new Date(item.dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              {item.dateUnresolved && <span>⚠️</span>}
            </span>

            {/* Fee badge */}
            {item.hasFee && (
              <span className="inline-flex items-center gap-1 bg-warning/15 text-warning px-2 py-0.5 rounded-md font-medium">
                <span>⚡ Fee: {parseFloat(item.feeEgp).toFixed(2)} EGP</span>
              </span>
            )}

            {/* Balance Snapshot */}
            {parsed.balanceSnapshotPiastres !== null && (
              <span className="inline-flex items-center gap-1 bg-surface-light px-2 py-0.5 rounded-md text-text-muted">
                <span>📊 Balance: {formatEGP(parsed.balanceSnapshotPiastres)}</span>
              </span>
            )}

            {/* Reference ID */}
            {parsed.referenceId && (
              <span className="inline-flex items-center gap-1 bg-surface-light px-2 py-0.5 rounded-md font-mono text-[11px]">
                <span>Ref: {parsed.referenceId}</span>
              </span>
            )}
          </div>

          {/* Unresolved Date Alert */}
          {item.dateUnresolved && (
            <div className="mt-2 text-xs bg-warning/10 text-warning rounded-lg p-2 flex items-start gap-1.5">
              <span className="shrink-0 text-sm">⚠️</span>
              <div>
                <p className="font-medium">Unresolved Date (Missing Year)</p>
                <p className="opacity-90">{item.dateWarning}</p>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="mt-1 text-xs underline font-semibold cursor-pointer"
                >
                  Edit / Confirm Date
                </button>
              </div>
            </div>
          )}

          {/* Batch Duplicate Warning */}
          {item.isBatchDuplicate && (
            <div className="mt-2 text-xs bg-warning/10 text-warning rounded-lg p-2 flex items-center gap-1.5">
              <span>⚠️</span>
              <span>Duplicate message in this batch. Unselected by default to prevent duplicate entry.</span>
            </div>
          )}

          {/* Database Duplicate Warning */}
          {item.isDbDuplicate && (
            <div className="mt-2 text-xs bg-danger/10 text-danger rounded-lg p-2 flex items-center gap-1.5">
              <span>⚠️</span>
              <span>{item.dbDuplicateReason || 'Already imported in your transaction history.'}</span>
            </div>
          )}

          {/* Balance-only Explanatory Notice */}
          {item.isBalanceOnly && (
            <div className="mt-2 text-xs bg-surface-light text-text-muted rounded-lg p-2 flex items-center gap-1.5">
              <span>ℹ️</span>
              <span>Balance notification only. Penny does not record balance inquiries as income or expense.</span>
            </div>
          )}

          {/* Action Row: Toggle Edit / View Original / Discard */}
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/5 text-xs">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsEditing(!isEditing)}
                className="text-primary hover:text-primary-light font-medium flex items-center gap-1 cursor-pointer"
              >
                <span>✏️</span>
                <span>{isEditing ? 'Close Editing' : 'Edit Fields'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowOriginal(!showOriginal)}
                className="text-text-muted hover:text-text font-medium flex items-center gap-1 cursor-pointer"
              >
                <span>💬</span>
                <span>{showOriginal ? 'Hide Original SMS' : 'View SMS Text'}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onRemove}
              className="text-text-muted hover:text-danger transition-colors cursor-pointer"
              title="Remove from review"
            >
              Discard
            </button>
          </div>

          {/* Original SMS Accordion */}
          {showOriginal && (
            <div className="mt-2 p-2.5 bg-black/30 rounded-lg font-mono text-[11px] text-text-muted whitespace-pre-wrap break-words border border-white/5 dir-auto" dir="auto">
              <p className="text-[10px] text-text-muted/60 uppercase font-sans mb-1 font-semibold">Original Message:</p>
              {parsed.originalText}
            </div>
          )}
        </div>
      </div>

      {/* Expanded Editing Panel */}
      {isEditing && (
        <div className="p-3.5 bg-surface-light/40 border-t border-white/5 space-y-3">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
            Edit Parsed Fields
          </p>

          <div className="grid grid-cols-2 gap-2.5">
            {/* Transaction Type */}
            <div>
              <label className="text-[11px] text-text-muted block mb-1">Transaction Type</label>
              <select
                value={item.action}
                onChange={(e) => onUpdate({ ...item, action: e.target.value as SmsReviewItem['action'] })}
                className="w-full bg-surface border border-white/10 rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="transfer">Transfer</option>
                <option value="ignore">Ignore / Informational</option>
              </select>
            </div>

            {/* Amount */}
            <div>
              <label className="text-[11px] text-text-muted block mb-1">Amount (EGP)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={item.amountEgp}
                onChange={(e) => onUpdate({ ...item, amountEgp: e.target.value })}
                className="w-full bg-surface border border-white/10 rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Account Selection */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] text-text-muted block mb-1">
                {item.action === 'transfer' ? 'From Account' : 'Account'}
              </label>
              <select
                value={item.accountId}
                onChange={(e) => onUpdate({ ...item, accountId: parseInt(e.target.value, 10) })}
                className="w-full bg-surface border border-white/10 rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
              >
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.icon} {acc.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Destination Account (for transfer) or Category */}
            {item.action === 'transfer' ? (
              <div>
                <label className="text-[11px] text-text-muted block mb-1">To Account (Destination)</label>
                <select
                  value={item.toAccountId ?? ''}
                  onChange={(e) => onUpdate({ ...item, toAccountId: parseInt(e.target.value, 10) })}
                  className="w-full bg-surface border border-white/10 rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                >
                  <option value="">Select destination...</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id} disabled={acc.id === item.accountId}>
                      {acc.icon} {acc.name} {acc.id === item.accountId ? '(Source)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="text-[11px] text-text-muted block mb-1">Category</label>
                <select
                  value={item.categoryId ?? ''}
                  onChange={(e) => onUpdate({ ...item, categoryId: parseInt(e.target.value, 10) })}
                  className="w-full bg-surface border border-white/10 rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                >
                  {availableCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icon} {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Date & Time Picker */}
          <div>
            <label className="text-[11px] text-text-muted block mb-1">
              Date & Time {item.dateUnresolved && <span className="text-warning font-semibold">(Please verify)</span>}
            </label>
            <input
              type="datetime-local"
              value={item.dateStr}
              onChange={(e) => onUpdate({ ...item, dateStr: e.target.value, dateUnresolved: false })}
              className={`w-full bg-surface border rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-primary focus:outline-none ${
                item.dateUnresolved ? 'border-warning/50 text-warning' : 'border-white/10'
              }`}
            />
          </div>

          {/* Merchant / Recipient & Note */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] text-text-muted block mb-1">Merchant / Recipient</label>
              <input
                type="text"
                value={item.merchant}
                onChange={(e) => onUpdate({ ...item, merchant: e.target.value })}
                className="w-full bg-surface border border-white/10 rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                placeholder="Merchant or recipient name"
              />
            </div>
            <div>
              <label className="text-[11px] text-text-muted block mb-1">Note / Reference</label>
              <input
                type="text"
                value={item.note}
                onChange={(e) => onUpdate({ ...item, note: e.target.value })}
                className="w-full bg-surface border border-white/10 rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                placeholder="Notes or ref id"
              />
            </div>
          </div>

          {/* Separate Fee Handling */}
          {item.hasFee && (
            <div className="bg-surface p-2.5 rounded-lg border border-warning/20 space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={item.includeFeeAsExpense}
                    onChange={(e) => onUpdate({ ...item, includeFeeAsExpense: e.target.checked })}
                    className="w-3.5 h-3.5 text-warning rounded bg-surface-light border-white/20"
                  />
                  <span>Record separate fee expense</span>
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.feeEgp}
                    onChange={(e) => onUpdate({ ...item, feeEgp: e.target.value })}
                    className="w-20 bg-surface-light border border-white/10 rounded px-2 py-1 text-xs text-right font-semibold"
                  />
                  <span className="text-xs text-text-muted">EGP</span>
                </div>
              </div>

              {item.includeFeeAsExpense && (
                <div>
                  <label className="text-[10px] text-text-muted block mb-1">Fee Category</label>
                  <select
                    value={item.feeCategoryId ?? ''}
                    onChange={(e) => onUpdate({ ...item, feeCategoryId: parseInt(e.target.value, 10) })}
                    className="w-full bg-surface-light border border-white/10 rounded px-2 py-1 text-xs"
                  >
                    {categories.filter(c => c.type === 'expense').map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="text-xs bg-primary text-white px-3 py-1.5 rounded-lg font-medium cursor-pointer"
            >
              Done Editing
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
