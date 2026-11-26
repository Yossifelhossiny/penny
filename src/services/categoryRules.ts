/**
 * Learned categories: "money from/to X goes in category Y".
 *
 * Rules come from two places:
 *  - builtin: common Egyptian merchants (Talabat → Food & Drinks, Uber → Transportation…)
 *  - user: every time you put an SMS transaction into a category, Penny
 *    remembers it for that merchant/person, and the next message from them
 *    is filed there automatically.
 * User rules always win over builtin ones.
 */

import { db } from '../db';
import type { Category, CategoryRule } from '../types';

/** Lower-case, strip masks/punctuation/digits and Arabic letter variants so the same name matches. */
export function normalizeKey(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '') // Arabic diacritics
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\*+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\b\d+\b/g, ' ') // card / phone fragments
    .replace(/\s+/g, ' ')
    .trim();
}

/** Builtin keyword rules (matched by "contains"), by category name. */
export const BUILTIN_RULES: Array<{ keywords: string[]; category: string; type: 'income' | 'expense' }> = [
  { category: 'Food & Drinks', type: 'expense', keywords: ['talabat', 'elmenus', 'breadfast', 'mrsool', 'carrefour', 'spinneys', 'seoudi', 'gourmet', 'metro market', 'kazyon', 'kheir zaman', 'hyperone', 'oscar', 'starbucks', 'costa', 'mcdonald', 'kfc', 'burger king', 'hardee', 'pizza', 'cilantro', 'zooba', 'koshary', 'instashop', 'rabbit'] },
  { category: 'Transportation', type: 'expense', keywords: ['uber', 'careem', 'indriver', 'swvl', 'didi', 'halan', 'metro', 'wasla', 'total energies', 'mobil', 'wataniya', 'chillout', 'emarat misr', 'fuel'] },
  { category: 'Shopping', type: 'expense', keywords: ['amazon', 'noon', 'jumia', 'shein', 'ikea', 'zara', 'h m', 'lc waikiki', 'defacto', 'b tech', 'btech', 'raya', 'tradeline', 'apple store', 'decathlon'] },
  { category: 'Bills', type: 'expense', keywords: ['electric', 'كهرباء', 'water', 'مياه', 'gas', 'غاز', 'we internet', 'te data', 'fawry', 'فوري', 'تليفون ارضي'] },
  { category: 'Mobile Recharge', type: 'expense', keywords: ['recharge', 'شحن رصيد', 'كارت شحن', 'vodafone recharge', 'orange recharge', 'etisalat recharge', 'we recharge'] },
  { category: 'Subscriptions', type: 'expense', keywords: ['netflix', 'spotify', 'anghami', 'shahid', 'watch it', 'osn', 'youtube', 'google', 'apple com', 'icloud', 'chatgpt', 'openai', 'anthropic', 'claude', 'adobe', 'canva', 'figma', 'microsoft', 'playstation'] },
  { category: 'Healthcare', type: 'expense', keywords: ['pharmacy', 'صيدليه', 'صيدلية', 'seif', 'el ezaby', 'العزبي', 'misr pharmacies', 'hospital', 'مستشفي', 'clinic', 'عيادة', 'lab', 'معمل', 'vezeeta', 'chefaa'] },
  { category: 'Entertainment', type: 'expense', keywords: ['vox', 'cinema', 'سينما', 'steam', 'ticketsmarche', 'tazkarti'] },
  { category: 'Rent', type: 'expense', keywords: ['rent', 'ايجار', 'إيجار'] },
];

export interface RuleMatch {
  categoryId: number;
  source: CategoryRule['source'];
}

/**
 * Category for a merchant/person name, or null.
 * Order: user exact → user contains → builtin contains (longest keyword wins).
 */
export function matchCategory(
  name: string | undefined | null,
  type: 'income' | 'expense',
  rules: CategoryRule[],
  categories: Category[]
): RuleMatch | null {
  if (!name) return null;
  const key = normalizeKey(name);
  if (!key) return null;
  const valid = new Set(categories.filter((c) => c.type === type).map((c) => c.id));
  const usable = rules.filter((r) => r.type === type && valid.has(r.categoryId));

  const userExact = usable.find((r) => r.source === 'user' && r.match === 'exact' && r.key === key);
  if (userExact) return { categoryId: userExact.categoryId, source: 'user' };

  const padded = ` ${key} `;
  const contains = (r: CategoryRule) => r.match === 'contains' && padded.includes(` ${r.key} `);
  const best = (list: CategoryRule[]) => list.filter(contains).sort((a, b) => b.key.length - a.key.length)[0];

  const user = best(usable.filter((r) => r.source === 'user'));
  if (user) return { categoryId: user.categoryId, source: 'user' };

  const builtin = best(usable.filter((r) => r.source === 'builtin'));
  if (builtin) return { categoryId: builtin.categoryId, source: 'builtin' };

  // Builtin keywords are matched by name even before they're stored, so new
  // categories (e.g. Rent) work without a migration.
  let bestKw: { kw: string; id: number } | null = null;
  for (const rule of BUILTIN_RULES) {
    if (rule.type !== type) continue;
    const cat = categories.find((c) => c.type === type && c.name === rule.category);
    if (!cat?.id) continue;
    for (const kw of rule.keywords) {
      const k = normalizeKey(kw);
      if (k && padded.includes(` ${k} `) && (!bestKw || k.length > bestKw.kw.length)) bestKw = { kw: k, id: cat.id };
    }
  }
  return bestKw ? { categoryId: bestKw.id, source: 'builtin' } : null;
}

export async function getRules(): Promise<CategoryRule[]> {
  return db.categoryRules.toArray();
}

/** Remember that `name` belongs in `categoryId`. Replaces an older rule for the same name. */
export async function learnCategory(name: string, type: 'income' | 'expense', categoryId: number): Promise<void> {
  const key = normalizeKey(name);
  if (!key) return;
  const cat = await db.categories.get(categoryId);
  // Never learn "Uncategorized" — that would defeat the point.
  if (!cat || cat.type !== type || /^uncategorized$/i.test(cat.name)) return;
  const existing = await db.categoryRules.where('[key+type]').equals([key, type]).first();
  if (existing?.id) await db.categoryRules.update(existing.id, { categoryId, source: 'user', match: 'exact' });
  else await db.categoryRules.add({ key, type, categoryId, match: 'exact', source: 'user', createdAt: new Date() });
}

export async function forgetRule(id: number): Promise<void> {
  await db.categoryRules.delete(id);
}

/**
 * Put every still-uncategorized transaction from `name` into `categoryId`.
 * Returns how many changed. Only touches transactions that are Uncategorized,
 * so nothing you categorised yourself is overwritten.
 */
export async function applyCategoryToMatching(name: string, type: 'income' | 'expense', categoryId: number, excludeId?: number): Promise<number> {
  const key = normalizeKey(name);
  if (!key) return 0;
  const uncategorizedIds = (await db.categories.where('name').equals('Uncategorized').toArray()).map((c) => c.id!);
  if (uncategorizedIds.length === 0) return 0;
  const candidates = await db.transactions.where('categoryId').anyOf(uncategorizedIds).toArray();
  let n = 0;
  for (const t of candidates) {
    if (t.id === excludeId || t.type !== type || !t.merchant) continue;
    if (normalizeKey(t.merchant) === key) n += await db.transactions.update(t.id!, { categoryId });
  }
  return n;
}

/** How many uncategorized transactions share this merchant/person name. */
export async function countUncategorizedMatching(name: string, type: 'income' | 'expense', excludeId?: number): Promise<number> {
  const key = normalizeKey(name);
  if (!key) return 0;
  const ids = (await db.categories.where('name').equals('Uncategorized').toArray()).map((c) => c.id!);
  if (ids.length === 0) return 0;
  return db.transactions
    .where('categoryId')
    .anyOf(ids)
    .filter((t) => t.id !== excludeId && t.type === type && !!t.merchant && normalizeKey(t.merchant) === key)
    .count();
}
