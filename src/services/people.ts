/**
 * People you exchange money with. Created automatically from InstaPay and
 * wallet-transfer SMS (sender / recipient name), or by hand when you record
 * a debt. Banks mask names ("AHMED M******"); the same masked name is
 * treated as the same person.
 */

import { db } from '../db';
import type { Debt, Person, Transaction } from '../types';
import { normalizeKey } from './categoryRules';

export function personKey(name: string): string {
  return normalizeKey(name);
}

/** Names that are clearly not a person (phone-only, card text, your own account). */
export function looksLikePersonName(name: string | undefined | null): name is string {
  if (!name) return false;
  const key = personKey(name);
  if (key.length < 2) return false;
  if (/بطاق|حساب|card|account|wallet|محفظ/.test(key)) return false;
  return /\p{L}/u.test(key);
}

export async function findOrCreatePerson(name: string, phone?: string): Promise<number> {
  // Phone-only counterparts (wallet transfers) are keyed by the number.
  const key = personKey(name) || `tel:${name.replace(/\D/g, '')}`;
  const existing = await db.people.where('key').equals(key).first();
  if (existing?.id) {
    if (phone && !existing.phone) await db.people.update(existing.id, { phone });
    return existing.id;
  }
  return (await db.people.add({ name: name.trim(), key, phone, createdAt: new Date() })) as number;
}

export async function renamePerson(id: number, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Enter a name');
  await db.people.update(id, { name: trimmed });
}

export interface PersonSummary {
  person: Person;
  receivedPiastres: number; // money that came from them
  sentPiastres: number; // money you sent them
  transactionCount: number;
  uncategorizedCount: number;
  /** + they owe you, − you owe them (open debts only) */
  debtBalancePiastres: number;
  lastActivity: Date | null;
}

export function debtOutstanding(d: Debt): number {
  if (d.status === 'settled') return 0;
  const paid = d.repayments.reduce((s, r) => s + r.amountPiastres, 0);
  return Math.max(0, d.amountPiastres - paid);
}

export async function getPeopleSummaries(): Promise<PersonSummary[]> {
  const [people, txns, debts, uncategorized] = await Promise.all([
    db.people.toArray(),
    db.transactions.where('personId').above(0).toArray(),
    db.debts.toArray(),
    db.categories.where('name').equals('Uncategorized').toArray(),
  ]);
  const uncatIds = new Set(uncategorized.map((c) => c.id));
  const byPerson = new Map<number, PersonSummary>();
  for (const person of people) {
    byPerson.set(person.id!, {
      person,
      receivedPiastres: 0,
      sentPiastres: 0,
      transactionCount: 0,
      uncategorizedCount: 0,
      debtBalancePiastres: 0,
      lastActivity: null,
    });
  }
  const touch = (s: PersonSummary, d: Date) => {
    if (!s.lastActivity || d > s.lastActivity) s.lastActivity = d;
  };
  for (const t of txns) {
    const s = byPerson.get(t.personId!);
    if (!s) continue;
    s.transactionCount++;
    if (t.type === 'income') s.receivedPiastres += t.amount;
    else if (t.type === 'expense') s.sentPiastres += t.amount;
    if (t.categoryId != null && uncatIds.has(t.categoryId)) s.uncategorizedCount++;
    touch(s, t.date);
  }
  for (const d of debts) {
    const s = byPerson.get(d.personId);
    if (!s) continue;
    const out = debtOutstanding(d);
    s.debtBalancePiastres += d.direction === 'lent' ? out : -out;
    touch(s, d.date);
  }
  return [...byPerson.values()].sort((a, b) => (b.lastActivity?.getTime() ?? 0) - (a.lastActivity?.getTime() ?? 0));
}

export async function getPersonTransactions(personId: number): Promise<Transaction[]> {
  const rows = await db.transactions.where('personId').equals(personId).toArray();
  return rows.sort((a, b) => b.date.getTime() - a.date.getTime());
}
