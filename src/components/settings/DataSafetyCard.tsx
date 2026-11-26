import { useEffect, useState } from 'react';
import { CloudUpload, ShieldCheck, ShieldAlert } from 'lucide-react';
import { backupAgeDays, getLastBackupAt, isStoragePersisted, requestPersistentStorage, saveBackupFile } from '../../services/storageSafety';
import { Banner, Button, Card, cx } from '../ui';

/** Can my data disappear? Status + one-tap backup to iCloud Drive. */
export function DataSafetyCard() {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [last, setLast] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    requestPersistentStorage().then(() => isStoragePersisted().then(setPersisted));
    getLastBackupAt().then(setLast);
  }, []);

  const age = backupAgeDays(last);
  const fresh = age !== null && age <= 7;
  const safe = fresh && persisted !== false;

  async function backup() {
    setBusy(true);
    setMsg('');
    try {
      if (await saveBackupFile()) {
        setLast(await getLastBackupAt());
        setMsg('Backup saved. Keep it in iCloud Drive — you can restore it on any phone.');
      }
    } catch (err) {
      setMsg(`Backup failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3.5">
        <span className={cx('size-11 rounded-[14px] flex items-center justify-center shrink-0', safe ? 'bg-income-soft text-income' : 'bg-caution-soft text-caution')}>
          {safe ? <ShieldCheck className="size-5" /> : <ShieldAlert className="size-5" />}
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-ink">Data safety</p>
          <p className="text-[13px] text-ink-3 mt-0.5">
            {age === null ? 'No backup yet.' : age === 0 ? 'Backed up today.' : `Last backup ${age} ${age === 1 ? 'day' : 'days'} ago.`}{' '}
            {persisted === true ? 'Storage is protected.' : persisted === false ? 'Storage isn’t protected yet.' : ''}
          </p>
        </div>
      </div>
      <ul className="text-[13px] text-ink-2 space-y-1.5 bg-well/70 rounded-xl px-3.5 py-3">
        <li>Penny keeps everything on this phone only — no account, no server copy.</li>
        <li>It won’t clear itself after days of not opening it (Home Screen apps are exempt).</li>
        <li>It <span className="font-semibold">is</span> lost if you delete Penny from the Home Screen, clear Safari website data, or change phones without a backup.</li>
      </ul>
      <Button block icon={<CloudUpload className="size-4" />} loading={busy} onClick={backup}>
        Back up to iCloud Drive
      </Button>
      <p className="text-[12px] text-ink-3">Tap, then choose “Save to Files” → iCloud Drive. Free, and restorable from Settings → Restore.</p>
      {msg && <Banner tone={msg.startsWith('Backup failed') ? 'error' : 'success'}>{msg}</Banner>}
    </Card>
  );
}
