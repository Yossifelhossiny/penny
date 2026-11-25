/**
 * BackupExport — UI for JSON backup/restore and CSV export.
 * All operations are 100% local — no network, no servers.
 */

import { useRef, useState } from 'react';
import {
  downloadJsonBackup,
  downloadTransactionsCsv,
  validateBackupData,
  restoreBackupData,
} from '../../services/backup';

type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

let toastSeq = 0;

export function BackupExport() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState<string | null>(null); // which action is running

  /* ── Toast helpers ───────────────────────────────────────────── */
  function addToast(message: string, kind: ToastKind = 'success') {
    const id = ++toastSeq;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }

  /* ── JSON Backup ─────────────────────────────────────────────── */
  async function handleDownloadBackup() {
    try {
      setBusy('backup');
      await downloadJsonBackup();
      addToast('✅ Backup downloaded successfully!', 'success');
    } catch (err) {
      addToast(`❌ Backup failed: ${(err as Error).message}`, 'error');
    } finally {
      setBusy(null);
    }
  }

  /* ── JSON Restore ─────────────────────────────────────────────── */
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // reset input so the same file can be re-selected
    e.target.value = '';

    if (
      !confirm(
        `This will OVERWRITE all current data with the contents of "${file.name}".\n\nAre you sure?`
      )
    )
      return;

    try {
      setBusy('restore');
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const result = validateBackupData(parsed);

      if (!result.valid || !result.data) {
        addToast(`❌ Invalid backup file: ${result.error}`, 'error');
        return;
      }

      const restored = await restoreBackupData(result.data, 'overwrite');
      addToast(
        `✅ Restored: ${restored.accountsRestored} accounts, ${restored.transactionsRestored} transactions, ${restored.categoriesRestored} categories.`,
        'success'
      );
    } catch (err) {
      addToast(`❌ Restore failed: ${(err as Error).message}`, 'error');
    } finally {
      setBusy(null);
    }
  }

  /* ── CSV Export ──────────────────────────────────────────────── */
  async function handleExportCsv() {
    try {
      setBusy('csv');
      await downloadTransactionsCsv();
      addToast('✅ CSV exported successfully!', 'success');
    } catch (err) {
      addToast(`❌ CSV export failed: ${(err as Error).message}`, 'error');
    } finally {
      setBusy(null);
    }
  }

  /* ── Toast colour map ─────────────────────────────────────────── */
  const toastClass: Record<ToastKind, string> = {
    success: 'bg-success/15 border-success/30 text-success',
    error: 'bg-danger/15 border-danger/30 text-danger',
    info: 'bg-primary/15 border-primary/30 text-primary',
  };

  return (
    <div className="space-y-3">
      <p className="font-medium text-sm">📦 Backup &amp; Export</p>
      <p className="text-xs text-text-muted">
        All backups stay on your device — nothing is uploaded anywhere.
      </p>

      {/* Action buttons */}
      <div className="space-y-2">
        {/* Download JSON */}
        <button
          type="button"
          disabled={!!busy}
          onClick={handleDownloadBackup}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <span>💾</span>
            <span>Download JSON Backup</span>
          </span>
          {busy === 'backup' ? (
            <span className="text-xs animate-pulse">Exporting…</span>
          ) : (
            <span className="text-xs opacity-70">Full database</span>
          )}
        </button>

        {/* Import JSON */}
        <button
          type="button"
          disabled={!!busy}
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-warning/10 hover:bg-warning/20 text-warning text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <span>📂</span>
            <span>Import JSON Backup</span>
          </span>
          {busy === 'restore' ? (
            <span className="text-xs animate-pulse">Restoring…</span>
          ) : (
            <span className="text-xs opacity-70">Overwrites data</span>
          )}
        </button>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleImport}
        />

        {/* Export CSV */}
        <button
          type="button"
          disabled={!!busy}
          onClick={handleExportCsv}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-success/10 hover:bg-success/20 text-success text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <span>📊</span>
            <span>Export Transactions CSV</span>
          </span>
          {busy === 'csv' ? (
            <span className="text-xs animate-pulse">Generating…</span>
          ) : (
            <span className="text-xs opacity-70">Excel &amp; Sheets ready</span>
          )}
        </button>
      </div>

      {/* Toast notifications */}
      <div className="fixed bottom-24 left-4 right-4 z-50 space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`border rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${toastClass[t.kind]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
