import { useState } from 'react';
import type { Account, AccountType } from '../../types';
import { createAccount, updateAccount, deleteAccount } from '../../services/accounts';
import { toPiastres } from '../../utils/format';

interface Props {
  account?: Account; // If provided, editing; otherwise creating
  onClose: () => void;
  onSaved: (accountId?: number) => void;
  onDeleted?: () => void;
}

const AVAILABLE_ICONS = ['🏦', '📱', '💵', '💳', '🪙', '💼', '🏧', '🏷️', '🏢', '💎', '🚗', '✈️'];
const PRESET_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#ef4444', // red
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#64748b', // slate
];

export function AccountFormModal({ account, onClose, onSaved, onDeleted }: Props) {
  const isEditing = !!account;

  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'bank');
  const [openingBalanceStr, setOpeningBalanceStr] = useState(
    account ? (account.openingBalance / 100).toString() : '0'
  );
  const [color, setColor] = useState(account?.color ?? PRESET_COLORS[0]);
  const [icon, setIcon] = useState(account?.icon ?? AVAILABLE_ICONS[0]);

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Please enter an account name');
      return;
    }

    const openingEgp = parseFloat(openingBalanceStr);
    if (isNaN(openingEgp) || openingEgp < 0) {
      setError('Opening balance must be a non-negative number');
      return;
    }

    setSaving(true);
    try {
      const openingBalancePiastres = toPiastres(openingEgp);

      if (isEditing) {
        await updateAccount(account.id!, {
          name: name.trim(),
          type,
          openingBalance: openingBalancePiastres,
          color,
          icon,
        });
        onSaved(account.id);
      } else {
        const id = await createAccount({
          name: name.trim(),
          type,
          openingBalance: openingBalancePiastres,
          color,
          icon,
        });
        onSaved(id);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save account');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!account?.id) return;
    if (!confirm(`Are you sure you want to delete "${account.name}"?`)) return;

    setDeleting(true);
    setError('');
    try {
      const result = await deleteAccount(account.id);
      if (!result.success) {
        setError(result.error || 'Cannot delete account');
        return;
      }
      onDeleted?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-surface w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90dvh] overflow-y-auto border border-white/10 pb-[env(safe-area-inset-bottom)]">
        {/* Sticky Header */}
        <div className="sticky top-0 bg-surface/95 backdrop-blur-md px-4 pt-4 pb-3 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {isEditing ? 'Edit Account' : 'Add New Account'}
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text text-2xl leading-none p-1 cursor-pointer"
          >
            ×
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="bg-danger/10 border border-danger/30 text-danger text-xs rounded-xl p-3">
              {error}
            </div>
          )}

          {/* Account Icon & Name */}
          <div className="space-y-2">
            <label className="text-xs text-text-muted block">Account Icon</label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_ICONS.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIcon(i)}
                  className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all cursor-pointer ${
                    icon === i
                      ? 'bg-surface-light border-2 border-primary scale-105'
                      : 'bg-surface-light/40 border border-white/5 hover:bg-surface-light'
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Account Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CIB Bank, Telda, Cash Wallet"
              className="w-full bg-background border border-white/10 rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
              autoFocus
            />
          </div>

          {/* Account Type */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Account Type</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'bank' as const, label: 'Bank', icon: '🏦' },
                { value: 'vodafone_cash' as const, label: 'Vodafone Cash', icon: '📱' },
                { value: 'cash' as const, label: 'Cash Wallet', icon: '💵' },
              ].map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`py-2 px-2 rounded-xl text-xs font-medium flex flex-col items-center gap-1 border transition-all cursor-pointer ${
                    type === t.value
                      ? 'bg-primary/15 border-primary text-primary'
                      : 'bg-background border-white/5 text-text-muted hover:text-text'
                  }`}
                >
                  <span className="text-base">{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Opening Balance */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Opening Balance (EGP)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={openingBalanceStr}
              onChange={(e) => setOpeningBalanceStr(e.target.value)}
              placeholder="0.00"
              className="w-full bg-background border border-white/10 rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
            />
            <p className="text-[11px] text-text-muted mt-1">
              Starting funds already in this account before logging transactions in Penny.
            </p>
          </div>

          {/* Color Picker */}
          <div>
            <label className="text-xs text-text-muted block mb-1.5">Color Accent</label>
            <div className="flex items-center gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-7 h-7 rounded-full transition-all cursor-pointer ${
                    color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-surface scale-110' : 'opacity-80 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-between gap-3">
            {isEditing && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs text-danger hover:text-red-400 font-medium py-2 px-3 rounded-xl border border-danger/20 hover:bg-danger/10 transition-colors cursor-pointer"
              >
                {deleting ? 'Deleting...' : 'Delete Account'}
              </button>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="text-xs bg-surface-light text-text-muted hover:text-text font-medium py-2 px-4 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="text-xs bg-primary text-white font-medium py-2 px-5 rounded-xl hover:bg-primary-dark transition-colors cursor-pointer disabled:opacity-40"
              >
                {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Account'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
