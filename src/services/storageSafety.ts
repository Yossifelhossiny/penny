/**
 * Keeping your data safe on the device.
 *
 * Penny's data lives only in this iPhone's browser storage. Home Screen web
 * apps are exempt from Safari's 7-day cleanup, but storage can still be
 * cleared if the phone runs very low on space (unless it's marked
 * persistent), if Penny is removed from the Home Screen, or if website data
 * is cleared in Settings. The free protection is: ask for persistent storage,
 * and keep a recent backup file in iCloud Drive.
 */

import { db } from '../db';
import { generateBackupData } from './backup';

const LAST_BACKUP_KEY = 'lastBackupAt';

export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function isStoragePersisted(): Promise<boolean | null> {
  try {
    return navigator.storage?.persisted ? await navigator.storage.persisted() : null;
  } catch {
    return null;
  }
}

export async function getLastBackupAt(): Promise<Date | null> {
  const v = (await db.meta.get(LAST_BACKUP_KEY))?.value;
  return typeof v === 'string' ? new Date(v) : null;
}

export async function markBackedUp(at: Date = new Date()): Promise<void> {
  await db.meta.put({ key: LAST_BACKUP_KEY, value: at.toISOString() });
}

export function backupAgeDays(last: Date | null, now: Date = new Date()): number | null {
  return last ? Math.floor((now.getTime() - last.getTime()) / 86_400_000) : null;
}

/**
 * Save a backup file. On iPhone this opens the share sheet so you can pick
 * "Save to Files" → iCloud Drive (free, and survives losing the phone).
 * Elsewhere it downloads the file. Returns false if the user cancelled.
 */
export async function saveBackupFile(): Promise<boolean> {
  const data = await generateBackupData();
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `penny-backup-${stamp}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });

  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Penny backup' });
      await markBackedUp();
      return true;
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return false;
      // Fall through to a plain download if sharing failed for another reason.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  await markBackedUp();
  return true;
}
