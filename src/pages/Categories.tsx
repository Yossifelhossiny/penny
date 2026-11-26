import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { db } from '../db';
import type { Category, Page } from '../types';
import { createCategory, deleteCategory, renameCategory } from '../services/categories';
import { Banner, Button, Card, CategoryIcon, ConfirmSheet, Field, IconButton, PageHeader, Section, Segmented, Sheet, TextInput } from '../components/ui';

export function Categories({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const categories = useLiveQuery(() => db.categories.toArray());
  const txns = useLiveQuery(() => db.transactions.toArray());
  const [editing, setEditing] = useState<Category | 'new' | null>(null);

  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of txns ?? []) if (t.categoryId != null) m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + 1);
    return m;
  }, [txns]);

  const group = (type: Category['type']) =>
    (categories ?? []).filter((c) => c.type === type).sort((a, b) => (counts.get(b.id!) ?? 0) - (counts.get(a.id!) ?? 0) || a.name.localeCompare(b.name));

  const renderGroup = (title: string, list: Category[]) => (
    <Section title={title}>
      <Card padded={false} className="py-1.5">
        {list.map((c) => {
          const n = counts.get(c.id!) ?? 0;
          return (
            <button key={c.id} type="button" onClick={() => setEditing(c)} className="w-full flex items-center gap-3.5 px-4 py-2.5 text-left hover:bg-brand-50/60 transition-colors">
              <CategoryIcon category={c} size="sm" />
              <span className="flex-1 text-[15px] font-semibold text-ink truncate">{c.name}</span>
              <span className="num text-[13px] text-ink-3">{n === 0 ? 'Unused' : `${n} ${n === 1 ? 'transaction' : 'transactions'}`}</span>
            </button>
          );
        })}
      </Card>
    </Section>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        leading={
          <IconButton label="Back to settings" onClick={() => onNavigate('settings')} className="-ml-2.5 mt-[-2px]">
            <ArrowLeft className="size-5" />
          </IconButton>
        }
        actions={
          <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            New
          </Button>
        }
      />
      {renderGroup('Spending', group('expense'))}
      {renderGroup('Income', group('income'))}
      {editing && <CategorySheet category={editing === 'new' ? undefined : editing} usage={editing === 'new' ? 0 : counts.get(editing.id!) ?? 0} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CategorySheet({ category, usage, onClose }: { category?: Category; usage: number; onClose: () => void }) {
  const [name, setName] = useState(category?.name ?? '');
  const [type, setType] = useState<Category['type']>(category?.type ?? 'expense');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const locked = !!category && /^uncategorized$/i.test(category.name);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (category) await renameCategory(category.id!, name);
      else await createCategory({ name, type });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  if (confirm && category) {
    return (
      <ConfirmSheet
        title={`Delete “${category.name}”?`}
        message="It isn’t used by any transaction or budget."
        confirmLabel="Delete"
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          try {
            await deleteCategory(category.id!);
            onClose();
          } catch (err) {
            setConfirm(false);
            setError(err instanceof Error ? err.message : 'Could not delete');
          }
        }}
      />
    );
  }

  return (
    <Sheet
      title={category ? 'Edit category' : 'New category'}
      onClose={onClose}
      footer={
        locked ? undefined : (
          <div className="space-y-2">
            <Button type="submit" form="cat-form" size="lg" block loading={saving}>
              {category ? 'Save' : 'Add category'}
            </Button>
            {category && usage === 0 && (
              <Button variant="ghost" block className="!text-expense" icon={<Trash2 className="size-4" />} onClick={() => setConfirm(true)}>
                Delete category
              </Button>
            )}
          </div>
        )
      }
    >
      <form id="cat-form" onSubmit={save} className="space-y-5">
        {locked ? (
          <Banner tone="info">“Uncategorized” holds transactions saved automatically from SMS until you choose a category. It can’t be changed.</Banner>
        ) : (
          <>
            {!category && (
              <Segmented value={type} onChange={setType} options={[{ value: 'expense', label: 'Spending' }, { value: 'income', label: 'Income' }]} />
            )}
            <div className="flex justify-center">
              <CategoryIcon category={{ name: name || 'x', type }} size="lg" />
            </div>
            <Field label="Name" hint={category && usage > 0 ? `Used by ${usage} ${usage === 1 ? 'transaction' : 'transactions'} — renaming updates them all.` : undefined}>
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Groceries" autoFocus maxLength={30} />
            </Field>
          </>
        )}
        {error && <Banner tone="error">{error}</Banner>}
      </form>
    </Sheet>
  );
}
