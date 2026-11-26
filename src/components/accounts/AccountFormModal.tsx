import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Account, AccountType } from '../../types';
import { createAccount, updateAccount, deleteAccount } from '../../services/accounts';
import { toPiastres } from '../../utils/format';
import { AccountIcon, Banner, Button, ConfirmSheet, Field, Sheet, TextInput, cx } from '../ui';

interface Props {
  account?: Account; // editing when provided
  onClose: () => void;
  onSaved: (accountId?: number) => void;
  onDeleted?: () => void;
}

const TYPES: { value: AccountType; label: string; hint: string }[] = [
  { value: 'bank', label: 'Bank', hint: 'Cards and bank accounts' },
  { value: 'vodafone_cash', label: 'Mobile wallet', hint: 'Vodafone Cash and similar' },
  { value: 'cash', label: 'Cash', hint: 'Money in your pocket' },
];

// Stored for backward compatibility with older versions/backups; not shown.
const LEGACY_ICON: Record<AccountType, string> = { bank: '🏦', vodafone_cash: '📱', cash: '💵' };

export function AccountFormModal({ account, onClose, onSaved, onDeleted }: Props) {
  const isEditing = !!account;
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'bank');
  const [openingStr, setOpeningStr] = useState(account ? (account.openingBalance / 100).toString() : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Give the account a name');
    const opening = openingStr.trim() === '' ? 0 : parseFloat(openingStr);
    if (isNaN(opening) || opening < 0) return setError('Starting balance can’t be negative');

    setSaving(true);
    try {
      const data = {
        name: name.trim(),
        type,
        openingBalance: toPiastres(opening),
        color: account?.color ?? '#7253d6',
        icon: account && account.type === type ? account.icon : LEGACY_ICON[type],
      };
      if (isEditing) {
        await updateAccount(account.id!, data);
        onSaved(account.id);
      } else {
        onSaved(await createAccount(data));
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the account');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!account?.id) return;
    setDeleting(true);
    try {
      const result = await deleteAccount(account.id);
      if (!result.success) {
        setConfirmDelete(false);
        setError(result.error || 'This account can’t be deleted');
        return;
      }
      onDeleted?.();
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  if (confirmDelete && account) {
    return (
      <ConfirmSheet
        title={`Delete ${account.name}?`}
        message="Accounts that still have transactions can’t be deleted. Move or delete those first."
        confirmLabel="Delete account"
        busy={deleting}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
      />
    );
  }

  return (
    <Sheet
      title={isEditing ? 'Edit account' : 'New account'}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <Button type="submit" form="account-form" size="lg" block loading={saving}>
            {isEditing ? 'Save changes' : 'Add account'}
          </Button>
          {isEditing && (
            <Button variant="ghost" block className="!text-expense" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>
              Delete account
            </Button>
          )}
        </div>
      }
    >
      <form id="account-form" onSubmit={handleSubmit} className="space-y-5">
        <Field label="Type">
          <div className="space-y-2">
            {TYPES.map((t) => {
              const active = type === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  aria-pressed={active}
                  className={cx('w-full flex items-center gap-3.5 rounded-2xl p-3 text-left transition-colors', active ? 'bg-brand-50 ring-2 ring-brand-500' : 'bg-well/70 hover:bg-well')}
                >
                  <AccountIcon type={t.value} size="sm" />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-ink">{t.label}</span>
                    <span className="block text-[13px] text-ink-3">{t.hint}</span>
                  </span>
                  <span className={cx('size-5 rounded-full shrink-0 transition-all', active ? 'border-[6px] border-brand-500' : 'border-2 border-well-strong')} />
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. NBE Prepaid" autoFocus={!isEditing} maxLength={40} />
        </Field>

        <Field label="Starting balance" hint="What was in the account when you started tracking it.">
          <TextInput type="number" inputMode="decimal" step="0.01" min="0" value={openingStr} onChange={(e) => setOpeningStr(e.target.value)} placeholder="0.00" className="num" />
        </Field>

        {error && <Banner tone="error">{error}</Banner>}
      </form>
    </Sheet>
  );
}
