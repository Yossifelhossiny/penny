/**
 * Backup, restore and CSV export. Everything stays on the device.
 */
import { useRef, useState } from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { downloadJsonBackup, downloadTransactionsCsv, validateBackupData, restoreBackupData, type PennyBackupData } from '../../services/backup';
import { ConfirmSheet, ListRow, useToasts } from '../ui';

export function BackupExport() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'backup' | 'restore' | 'csv' | null>(null);
  const [pending, setPending] = useState<{ name: string; data: PennyBackupData } | null>(null);
  const toast = useToasts();

  async function run(kind: 'backup' | 'csv') {
    setBusy(kind);
    try {
      if (kind === 'backup') await downloadJsonBackup();
      else await downloadTransactionsCsv();
      toast.show(kind === 'backup' ? 'Backup downloaded' : 'CSV exported');
    } catch (err) {
      toast.show(`${kind === 'backup' ? 'Backup' : 'Export'} failed: ${(err as Error).message}`, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow choosing the same file again
    if (!file) return;
    try {
      const result = validateBackupData(JSON.parse(await file.text()));
      if (!result.valid || !result.data) return toast.show(`That file isn’t a Penny backup: ${result.error}`, 'error');
      setPending({ name: file.name, data: result.data });
    } catch {
      toast.show('Couldn’t read that file', 'error');
    }
  }

  async function restore() {
    if (!pending) return;
    setBusy('restore');
    try {
      const r = await restoreBackupData(pending.data, 'overwrite');
      toast.show(`Restored ${r.transactionsRestored} transactions and ${r.accountsRestored} accounts`);
    } catch (err) {
      toast.show(`Restore failed: ${(err as Error).message}`, 'error');
    } finally {
      setBusy(null);
      setPending(null);
    }
  }

  return (
    <>
      <ListRow icon={<Download />} label="Download backup" detail="Everything, as one file" onClick={() => run('backup')} busy={busy === 'backup'} disabled={!!busy} />
      <ListRow icon={<Upload />} label="Restore from backup" detail="Replaces what’s on this device" onClick={() => fileInputRef.current?.click()} busy={busy === 'restore'} disabled={!!busy} />
      <ListRow icon={<FileSpreadsheet />} label="Export to CSV" detail="Opens in Excel or Google Sheets" onClick={() => run('csv')} busy={busy === 'csv'} disabled={!!busy} />
      <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={pickFile} />
      {pending && (
        <ConfirmSheet
          title="Replace your data?"
          message={<>Everything currently in Penny will be replaced with “{pending.name}”. Download a backup first if you might need it.</>}
          confirmLabel="Replace"
          busy={busy === 'restore'}
          onClose={() => setPending(null)}
          onConfirm={restore}
        />
      )}
      {toast.node}
    </>
  );
}
