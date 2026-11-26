import {
  ArrowLeftRight, Banknote, BriefcaseBusiness, Bus, CircleHelp, Clapperboard, HeartPulse, Landmark,
  Laptop, Package, Receipt, CirclePlay, ShoppingBag, Smartphone, UtensilsCrossed, Wallet, Wifi, Zap,
  GraduationCap, House, Gift, Plane, Shirt, PawPrint, Fuel, Coffee, PiggyBank, TrendingUp, type LucideIcon,
} from 'lucide-react';
import type { AccountType, Category } from '../../types';

/**
 * Categories and accounts store an emoji in the database (kept for backward
 * compatibility). The interface never shows it: icons come from the
 * category's name / the account's type instead.
 */
const CATEGORY_RULES: Array<[RegExp, LucideIcon]> = [
  [/uncategor/i, CircleHelp],
  [/salary|payroll|راتب/i, Banknote],
  [/freelanc/i, Laptop],
  [/business|work/i, BriefcaseBusiness],
  [/invest|dividend|interest/i, TrendingUp],
  [/saving/i, PiggyBank],
  [/food|drink|restaurant|grocer/i, UtensilsCrossed],
  [/coffee|cafe/i, Coffee],
  [/transport|taxi|uber|ride|car\b/i, Bus],
  [/fuel|gas|petrol/i, Fuel],
  [/shop|cloth/i, ShoppingBag],
  [/fashion|apparel/i, Shirt],
  [/bill|utilit|electric/i, Receipt],
  [/recharge|mobile|phone/i, Smartphone],
  [/internet|wifi/i, Wifi],
  [/subscri/i, CirclePlay],
  [/health|medic|pharm|doctor/i, HeartPulse],
  [/entertain|movie|game|fun/i, Clapperboard],
  [/transfer/i, ArrowLeftRight],
  [/educat|school|course/i, GraduationCap],
  [/rent|home|house/i, House],
  [/gift/i, Gift],
  [/travel|trip|flight/i, Plane],
  [/pet/i, PawPrint],
  [/energy|power/i, Zap],
];

export function categoryLucide(name?: string, type?: Category['type']): LucideIcon {
  if (name) for (const [re, Icon] of CATEGORY_RULES) if (re.test(name)) return Icon;
  return type === 'income' ? Banknote : Package;
}

export { ArrowLeftRight };

const ACCOUNT_ICONS: Record<AccountType, LucideIcon> = {
  bank: Landmark,
  vodafone_cash: Smartphone,
  cash: Wallet,
};

export function accountLucide(type?: AccountType): LucideIcon {
  return (type && ACCOUNT_ICONS[type]) || Wallet;
}


/** Muted, violet-anchored palette for charts (category order). */
export const CHART_PALETTE = ['#7253d6', '#a48bf0', '#3a9e95', '#e0a03d', '#d65d6d', '#5b84d9', '#c9b8f4', '#8f8a99'];
