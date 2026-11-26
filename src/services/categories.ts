/**
 * Category management. Categories referenced by transactions or budgets can
 * be renamed but not deleted, so no financial record ever loses its category.
 */
import { db } from '../db';
import type { Category } from '../types';

const PROTECTED = /^uncategorized$/i;

export async function createCategory(input: { name: string; type: Category['type'] }): Promise<number> {
  const name = input.name.trim();
  if (!name) throw new Error('Give the category a name');
  const dup = (await db.categories.where('name').equalsIgnoreCase(name).toArray()).find((c) => c.type === input.type);
  if (dup) throw new Error('You already have a category with that name');
  // icon/color are legacy fields kept for compatibility; the UI derives its own.
  return (await db.categories.add({ name, type: input.type, icon: '•', color: '#7253d6' })) as number;
}

export async function renameCategory(id: number, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Give the category a name');
  const cat = await db.categories.get(id);
  if (!cat) throw new Error('Category not found');
  if (PROTECTED.test(cat.name)) throw new Error('“Uncategorized” can’t be renamed');
  const dup = (await db.categories.where('name').equalsIgnoreCase(trimmed).toArray()).find((c) => c.type === cat.type && c.id !== id);
  if (dup) throw new Error('You already have a category with that name');
  await db.categories.update(id, { name: trimmed });
}

export async function categoryUsage(id: number): Promise<{ transactions: number; budgets: number }> {
  const [transactions, budgets] = await Promise.all([
    db.transactions.where('categoryId').equals(id).count(),
    db.budgets.where('categoryId').equals(id).count(),
  ]);
  return { transactions, budgets };
}

export async function deleteCategory(id: number): Promise<void> {
  const cat = await db.categories.get(id);
  if (!cat) return;
  if (PROTECTED.test(cat.name)) throw new Error('“Uncategorized” is needed for automatic imports');
  const usage = await categoryUsage(id);
  if (usage.transactions > 0 || usage.budgets > 0) {
    throw new Error('This category is in use. Rename it instead, or move its transactions first.');
  }
  await db.categories.delete(id);
}
