/**
 * Turns on automatic import for this iPhone.
 *
 * Every device makes its own push keys (no server secret, nothing to set up on
 * Vercel). Everything the Shortcut needs is packed into one "setup code" that
 * the user pastes into the Shortcut once.
 */

import { db } from '../../db';
import { PUSH_META_KEY, type PushSettings } from './pushHandler';

export interface ShortcutConfig {
  v: 1;
  /** Push subscription (endpoint + browser keys). */
  sub: PushSubscriptionJSON;
  /** VAPID key pair, base64url (public: raw point, private: d). */
  pub: string;
  priv: string;
  secret: string;
}

export type PushSupport =
  | { ok: true }
  | { ok: false; reason: 'not-installed' | 'unsupported' | 'denied' };

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeConfig(cfg: ShortcutConfig): string {
  return 'PENNY1.' + b64url(new TextEncoder().encode(JSON.stringify(cfg)));
}

export function decodeConfig(code: string): ShortcutConfig | null {
  try {
    const body = code.trim().replace(/^PENNY1\./, '');
    const cfg = JSON.parse(new TextDecoder().decode(b64urlToBytes(body))) as ShortcutConfig;
    return cfg?.v === 1 && cfg.sub?.endpoint ? cfg : null;
  } catch {
    return null;
  }
}

export function checkPushSupport(): PushSupport {
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    // On iPhone, push only exists for apps opened from the Home Screen.
    return { ok: false, reason: standalone ? 'unsupported' : 'not-installed' };
  }
  if (Notification.permission === 'denied') return { ok: false, reason: 'denied' };
  return { ok: true };
}

export async function getPushSettings(): Promise<PushSettings | null> {
  return ((await db.meta.get(PUSH_META_KEY))?.value as PushSettings | undefined) ?? null;
}

/** Must be called from a tap (iOS only asks for permission on user gesture). */
export async function enableAutoImport(): Promise<string> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed');

  const reg = await navigator.serviceWorker.ready;

  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pubRaw = await crypto.subtle.exportKey('raw', keys.publicKey);
  const privJwk = await crypto.subtle.exportKey('jwk', keys.privateKey);

  // A subscription is tied to one key pair: replace any older one.
  const old = await reg.pushManager.getSubscription();
  if (old) await old.unsubscribe();
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: new Uint8Array(pubRaw),
  });

  const secretBytes = crypto.getRandomValues(new Uint8Array(18));
  const settings: PushSettings = { secret: b64url(secretBytes), enabledAt: new Date().toISOString() };

  const code = encodeConfig({
    v: 1,
    sub: sub.toJSON(),
    pub: b64url(pubRaw),
    priv: privJwk.d!,
    secret: settings.secret,
  });

  await db.meta.put({ key: PUSH_META_KEY, value: settings });
  await db.meta.put({ key: PUSH_META_KEY + ':code', value: code });
  return code;
}

export async function getSetupCode(): Promise<string | null> {
  return ((await db.meta.get(PUSH_META_KEY + ':code'))?.value as string | undefined) ?? null;
}

export async function disableAutoImport(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await sub.unsubscribe();
  await db.meta.delete(PUSH_META_KEY);
  await db.meta.delete(PUSH_META_KEY + ':code');
}

/** Ask the server to send a test push to this device. */
export async function sendTestPush(code: string): Promise<void> {
  const res = await fetch('/api/sms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config: code, test: true }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || `Server answered ${res.status}`);
  }
}
