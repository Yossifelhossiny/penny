import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Page } from '../types';
import {
  splitSmsMessages,
  processSmsBatch,
  saveConfirmedReviewItems,
  validateReviewItem,
  type SmsReviewItem,
} from '../services/sms/smsImportService';
import { SmsReviewCard } from '../components/sms/SmsReviewCard';
import { formatEGP } from '../utils/format';

interface Props {
  onNavigate?: (page: Page) => void;
}

const SAMPLE_MESSAGES = {
  bankDebit:
    'تم خصم 160.00EGP من بطاقة المدفوعة مقدماً رقم 3956 عند PAYMOB-*vasko egypt TA يوم 09/05 الساعه 17:09 المتاح 3313.78 للمزيد إتصل ب 19623',
  instaPayOut:
    'تم تنفيذ تحويل لحظي من بطاقتكم مسبقة الدفع بمبلغ 45.00 جم إلى محمود ا*** ع******** ف** رقم مرجعي 760182550211 يوم 05-09 الساعة 22:21 للمزيد اتصل بـ 19623',
  vodafoneOut:
    'تم تحويل 600 EGP إلى 01002006618 رسوم 1 EGP معرف 019799986433 26-05-07 21:37',
  bankAtm:
    'تم سحب 2000.00EGP من بطاقة المدفوعة مقدماً رقم 3956 سحب من الصراف يوم 11/05 الساعه 14:00 المتاح 6313.78 للمزيد إتصل ب 19623',
  bankBalance:
    'رصيد بطاقة رقم 3956 المتاح 5000.00 EGP',
  multiBatch: `تم خصم 160.00EGP من بطاقة المدفوعة مقدماً رقم 3956 عند PAYMOB-*vasko egypt TA يوم 09/05 الساعه 17:09 المتاح 3313.78
---
تم تحويل 600 EGP إلى 01002006618 رسوم 1 EGP معرف 019799986433 26-05-07 21:37
---
تم استلام 200 EGP من 01015147307 / Mohamed K Eissa معرف 019756663531 13:32 26-05-06
---
تم سحب 2000.00EGP من بطاقة المدفوعة مقدماً رقم 3956 سحب من الصراف يوم 11/05 الساعه 14:00 المتاح 6313.78
---
رصيد بطاقة رقم 3956 المتاح 5000.00 EGP`,
};

export function SmsImport({ onNavigate }: Props) {
  const [rawText, setRawText] = useState('');
  const [reviewItems, setReviewItems] = useState<SmsReviewItem[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<{
    savedCount: number;
    feeCount: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];

  // Split count preview
  const detectedCount = splitSmsMessages(rawText).length;

  // Handle parsing pasted SMS
  async function handleParse() {
    if (!rawText.trim()) return;
    setParsing(true);
    setErrorMessage('');
    setSaveSuccess(null);

    try {
      const items = await processSmsBatch(rawText, accounts, categories);
      setReviewItems(items);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to parse SMS messages');
    } finally {
      setParsing(false);
    }
  }

  // Handle paste from clipboard
  async function handlePasteClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setRawText(text);
      }
    } catch {
      // Clipboard access might be blocked in some browser settings
    }
  }

  // Handle single card update
  function handleUpdateItem(index: number, updated: SmsReviewItem) {
    setReviewItems((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  }

  // Handle single card removal
  function handleRemoveItem(index: number) {
    setReviewItems((prev) => prev.filter((_, i) => i !== index));
  }

  // Batch selection helpers
  function handleSelectAll(selected: boolean) {
    setReviewItems((prev) =>
      prev.map((item) => (item.isBalanceOnly ? item : { ...item, selected }))
    );
  }

  function handleDeselectDuplicates() {
    setReviewItems((prev) =>
      prev.map((item) =>
        item.isBatchDuplicate || item.isDbDuplicate
          ? { ...item, selected: false }
          : item
      )
    );
  }

  // Confirm and save selected transactions
  async function handleConfirmSave() {
    setSaving(true);
    setErrorMessage('');

    // Pre-validate selected items
    const selected = reviewItems.filter(
      (it) => it.selected && it.action !== 'ignore' && !it.isBalanceOnly
    );

    if (selected.length === 0) {
      setErrorMessage('No transactions selected to save.');
      setSaving(false);
      return;
    }

    for (const item of selected) {
      const err = validateReviewItem(item);
      if (err) {
        setErrorMessage(`Validation error on "${item.merchant || 'item'}": ${err}`);
        setSaving(false);
        return;
      }
    }

    try {
      const result = await saveConfirmedReviewItems(reviewItems);

      if (result.errors.length > 0) {
        setErrorMessage(result.errors.join(', '));
      }

      if (result.savedCount > 0 || result.feeCount > 0) {
        setSaveSuccess({
          savedCount: result.savedCount,
          feeCount: result.feeCount,
        });
        setReviewItems([]);
        setRawText('');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save transactions');
    } finally {
      setSaving(false);
    }
  }

  // Reset import screen
  function handleReset() {
    setReviewItems([]);
    setRawText('');
    setSaveSuccess(null);
    setErrorMessage('');
  }

  // Compute selected stats
  const selectedItems = reviewItems.filter(
    (it) => it.selected && it.action !== 'ignore' && !it.isBalanceOnly
  );
  const sumFor = (action: string) =>
    selectedItems
      .filter((it) => it.action === action)
      .reduce((sum, it) => sum + Math.round((parseFloat(it.amountEgp) || 0) * 100), 0);
  const selectedInPiastres = sumFor('income');
  const selectedOutPiastres = sumFor('expense');

  const duplicateCount = reviewItems.filter(
    (it) => it.isBatchDuplicate || it.isDbDuplicate
  ).length;

  return (
    <div className="p-4 space-y-5">
      {/* Screen Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <span>📥</span>
            <span>Import SMS</span>
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Turn bank and wallet SMS messages into structured transactions
          </p>
        </div>
        {onNavigate && (
          <button
            onClick={() => onNavigate('transactions')}
            className="text-xs text-text-muted hover:text-text px-2 py-1 rounded bg-surface transition-colors"
          >
            ← History
          </button>
        )}
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="bg-danger/10 border border-danger/30 text-danger text-xs rounded-xl p-3 flex items-start gap-2">
          <span className="text-base">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Import Issue</p>
            <p>{errorMessage}</p>
          </div>
          <button
            onClick={() => setErrorMessage('')}
            className="text-text-muted hover:text-text leading-none text-base p-1"
          >
            ×
          </button>
        </div>
      )}

      {/* Success Banner */}
      {saveSuccess && (
        <div className="bg-success/10 border border-success/30 rounded-2xl p-5 text-center space-y-3">
          <div className="text-4xl">🎉</div>
          <div>
            <h3 className="font-bold text-success text-base">Transactions Successfully Imported!</h3>
            <p className="text-xs text-text-muted mt-1">
              Saved {saveSuccess.savedCount} transaction{saveSuccess.savedCount === 1 ? '' : 's'}
              {saveSuccess.feeCount > 0 && ` and ${saveSuccess.feeCount} separate fee record${saveSuccess.feeCount === 1 ? '' : 's'}`}.
              Account balances have been updated automatically.
            </p>
          </div>
          <div className="flex justify-center gap-2 pt-1">
            {onNavigate && (
              <button
                onClick={() => onNavigate('transactions')}
                className="text-xs bg-primary text-white font-medium px-4 py-2 rounded-xl"
              >
                View in History
              </button>
            )}
            <button
              onClick={handleReset}
              className="text-xs bg-surface text-text font-medium px-4 py-2 rounded-xl border border-white/10"
            >
              Import More
            </button>
          </div>
        </div>
      )}

      {/* Input Stage (when no items are currently being reviewed) */}
      {reviewItems.length === 0 && !saveSuccess && (
        <div className="space-y-4">
          {/* Paste Card */}
          <div className="bg-surface rounded-2xl p-4 space-y-3 border border-white/5">
            <div className="flex items-center justify-between">
              <label htmlFor="sms-input" className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                Paste SMS Text
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="text-xs text-primary hover:text-primary-light font-medium flex items-center gap-1"
                >
                  <span>📋</span>
                  <span>Paste Clipboard</span>
                </button>
                {rawText && (
                  <button
                    type="button"
                    onClick={() => setRawText('')}
                    className="text-xs text-text-muted hover:text-danger"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <textarea
              id="sms-input"
              rows={6}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={`Paste one or multiple SMS messages here (Arabic or English)...\n\nExample:\nتم خصم 160.00EGP من بطاقة المدفوعة مقدماً رقم 3956 عند PAYMOB...`}
              className="w-full bg-background border border-white/10 rounded-xl p-3 text-xs leading-relaxed focus:ring-1 focus:ring-primary focus:outline-none resize-none font-sans"
              dir="auto"
            />

            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>
                {detectedCount > 0 ? (
                  <span className="text-primary font-medium">
                    {detectedCount} message{detectedCount === 1 ? '' : 's'} detected
                  </span>
                ) : (
                  'Supports multiple messages separated by blank lines or "---"'
                )}
              </span>

              <button
                type="button"
                onClick={handleParse}
                disabled={!rawText.trim() || parsing}
                className="bg-primary text-white font-medium px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-dark transition-colors cursor-pointer"
              >
                {parsing ? (
                  <>
                    <span className="inline-block animate-spin">⏳</span>
                    <span>Parsing...</span>
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    <span>Parse {detectedCount > 1 ? `${detectedCount} Messages` : 'Message'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Quick Test Samples */}
          <div className="bg-surface rounded-2xl p-4 space-y-2.5 border border-white/5">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Quick Test Samples
            </p>
            <p className="text-[11px] text-text-muted">
              Tap any sample to populate the text area and test Egyptian bank & wallet parsing:
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setRawText(SAMPLE_MESSAGES.bankDebit)}
                className="text-xs bg-surface-light text-text px-2.5 py-1.5 rounded-lg hover:border-primary/50 border border-transparent transition-colors"
              >
                🏦 Bank Card Purchase
              </button>
              <button
                type="button"
                onClick={() => setRawText(SAMPLE_MESSAGES.instaPayOut)}
                className="text-xs bg-surface-light text-text px-2.5 py-1.5 rounded-lg hover:border-primary/50 border border-transparent transition-colors"
              >
                ⚡ InstaPay Transfer
              </button>
              <button
                type="button"
                onClick={() => setRawText(SAMPLE_MESSAGES.vodafoneOut)}
                className="text-xs bg-surface-light text-text px-2.5 py-1.5 rounded-lg hover:border-primary/50 border border-transparent transition-colors"
              >
                📱 Vodafone Cash + Fee
              </button>
              <button
                type="button"
                onClick={() => setRawText(SAMPLE_MESSAGES.bankAtm)}
                className="text-xs bg-surface-light text-text px-2.5 py-1.5 rounded-lg hover:border-primary/50 border border-transparent transition-colors"
              >
                🏧 ATM Withdrawal
              </button>
              <button
                type="button"
                onClick={() => setRawText(SAMPLE_MESSAGES.bankBalance)}
                className="text-xs bg-surface-light text-text px-2.5 py-1.5 rounded-lg hover:border-primary/50 border border-transparent transition-colors"
              >
                📊 Balance Only
              </button>
              <button
                type="button"
                onClick={() => setRawText(SAMPLE_MESSAGES.multiBatch)}
                className="text-xs bg-primary/15 text-primary font-medium px-2.5 py-1.5 rounded-lg hover:bg-primary/25 transition-colors"
              >
                📦 Multi-Message Batch (5 SMS)
              </button>
            </div>
          </div>

          {/* Privacy & Philosophy Notice */}
          <div className="bg-surface/60 rounded-xl p-3 border border-white/5 flex items-start gap-2.5 text-xs text-text-muted">
            <span className="text-base shrink-0">🔒</span>
            <p>
              <strong className="text-text font-medium">100% Local & Private.</strong> All parsing and storage happen locally on your device in IndexedDB. No backend servers, no cloud storage, and no AI tracking your financial data.
            </p>
          </div>
        </div>
      )}

      {/* Review Stage */}
      {reviewItems.length > 0 && (
        <div className="space-y-4">
          {/* Review Batch Controls Header */}
          <div className="bg-surface rounded-xl p-3.5 space-y-2 border border-white/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">
                  Review Parsed Messages ({reviewItems.length})
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  Review and edit detected details before confirming.
                </p>
              </div>

              <button
                type="button"
                onClick={handleReset}
                className="text-xs text-text-muted hover:text-text px-2 py-1 rounded bg-surface-light"
              >
                Discard & Paste New
              </button>
            </div>

            {/* Quick Action Chips */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/5 text-xs">
              <button
                type="button"
                onClick={() => handleSelectAll(true)}
                className="text-xs bg-surface-light hover:text-text px-2.5 py-1 rounded-md text-text-muted"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => handleSelectAll(false)}
                className="text-xs bg-surface-light hover:text-text px-2.5 py-1 rounded-md text-text-muted"
              >
                Deselect All
              </button>
              {duplicateCount > 0 && (
                <button
                  type="button"
                  onClick={handleDeselectDuplicates}
                  className="text-xs bg-warning/15 text-warning font-medium px-2.5 py-1 rounded-md"
                >
                  Uncheck Duplicates ({duplicateCount})
                </button>
              )}
            </div>
          </div>

          {/* List of Parsed Cards */}
          <div className="space-y-3">
            {reviewItems.map((item, idx) => (
              <SmsReviewCard
                key={item.id}
                item={item}
                index={idx}
                accounts={accounts}
                categories={categories}
                onUpdate={(updated) => handleUpdateItem(idx, updated)}
                onRemove={() => handleRemoveItem(idx)}
              />
            ))}
          </div>

          {/* Sticky Confirmation Bar */}
          <div className="sticky bottom-20 z-20 bg-surface/95 backdrop-blur-md rounded-2xl p-4 border border-white/10 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-text-muted">Selected to Save</p>
                <p className="text-sm font-bold text-text">
                  {selectedItems.length} of {reviewItems.length} item{reviewItems.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-text-muted">Money In / Out</p>
                <p className="text-sm font-bold">
                  <span className="text-success">+{formatEGP(selectedInPiastres)}</span>
                  <span className="text-text-muted"> / </span>
                  <span className="text-danger">-{formatEGP(selectedOutPiastres)}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleConfirmSave}
                disabled={selectedItems.length === 0 || saving}
                className="flex-1 bg-primary text-white font-semibold py-2.5 px-4 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-dark transition-colors cursor-pointer"
              >
                {saving ? (
                  <>
                    <span className="inline-block animate-spin">⏳</span>
                    <span>Saving to Penny...</span>
                  </>
                ) : (
                  <>
                    <span>✅</span>
                    <span>Confirm & Save ({selectedItems.length})</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleReset}
                disabled={saving}
                className="px-3 py-2.5 rounded-xl text-xs bg-surface-light text-text-muted hover:text-text transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
