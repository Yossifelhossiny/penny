/**
 * Debts: money you lent or borrowed. Entered by hand. They don't change
 * account balances (the cash movement, if any, is a normal transaction).
 */

import { db } from '../db';
import type { Debt, DebtDirection } from '../types';
import { debtOutstanding, findOrCreatePerson } from './people';

export { debtOutstanding };

export interface DebtInput {
  personId?: number;
  personName?: string;
  direction: DebtDirection;
  amountPiastres: number;
  reason?: string;
  date: Date;
  dueDate?: Date | null;
}

async function resolvePerson(input: Pick<DebtInput, 'personId' | 'personName'>): Promise<number> {
  if (input.personId) return input.personId;
  if (input.personName?.trim()) return findOrCreatePerson(input.personName);
  throw new Error('Choose who this is with');
}

export async function createDebt(input: DebtInput): Promise<number> {
  if (!(input.amountPiastres > 0)) throw new Error('Enter an amount greater than zero');
  const personId = await resolvePerson(input);
  return (await db.debts.add({
    personId,
    direction: input.direction,
    amountPiastres: input.amountPiastres,
    reason: input.reason?.trim() || undefined,
    date: input.date,
    dueDate: input.dueDate ?? null,
    repayments: [],
    status: 'open',
    createdAt: new Date(),
  })) as number;
}

export async function updateDebt(id: number, input: DebtInput): Promise<void> {
  const debt = await db.debts.get(id);
  if (!debt) throw new Error('Debt not found');
  if (!(input.amountPiastres > 0)) throw new Error('Enter an amount greater than zero');
  const paid = debt.repayments.reduce((s, r) => s + r.amountPiastres, 0);
  if (input.amountPiastres < paid) throw new Error('Amount can’t be less than what was already repaid');
  const personId = await resolvePerson(input);
  await db.debts.update(id, {
    personId,
    direction: input.direction,
    amountPiastres: input.amountPiastres,
    reason: input.reason?.trim() || undefined,
    date: input.date,
    dueDate: input.dueDate ?? null,
    status: input.amountPiastres - paid <= 0 ? 'settled' : 'open',
  });
}

export async function addRepayment(id: number, amountPiastres: number, date: Date, note?: string): Promise<void> {
  const debt = await db.debts.get(id);
  if (!debt) throw new Error('Debt not found');
  const outstanding = debtOutstanding(debt);
  if (!(amountPiastres > 0)) throw new Error('Enter an amount greater than zero');
  if (amountPiastres > outstanding) throw new Error('That’s more than what’s left');
  const repayments = [...debt.repayments, { amountPiastres, date, note: note?.trim() || undefined }];
  await db.debts.update(id, { repayments, status: amountPiastres === outstanding ? 'settled' : 'open' });
}

export async function settleDebt(id: number): Promise<void> {
  const debt = await db.debts.get(id);
  if (!debt) return;
  const left = debtOutstanding(debt);
  const repayments = left > 0 ? [...debt.repayments, { amountPiastres: left, date: new Date(), note: 'Marked as settled' }] : debt.repayments;
  await db.debts.update(id, { repayments, status: 'settled' });
}

export async function deleteDebt(id: number): Promise<void> {
  await db.debts.delete(id);
}

export interface DebtTotals {
  owedToYouPiastres: number;
  youOwePiastres: number;
  openCount: number;
  overdue: Debt[];
}

export async function getDebtTotals(now: Date = new Date()): Promise<DebtTotals> {
  const debts = await db.debts.where('status').equals('open').toArray();
  let owedToYou = 0;
  let youOwe = 0;
  const overdue: Debt[] = [];
  for (const d of debts) {
    const out = debtOutstanding(d);
    if (out <= 0) continue;
    if (d.direction === 'lent') owedToYou += out;
    else youOwe += out;
    if (d.dueDate && d.dueDate.getTime() < now.getTime()) overdue.push(d);
  }
  return { owedToYouPiastres: owedToYou, youOwePiastres: youOwe, openCount: debts.length, overdue };
}
