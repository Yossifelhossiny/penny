/**
 * POST /api/sms — relay one SMS from the iPhone Shortcut to Penny on the
 * same iPhone, as an end-to-end encrypted Web Push message.
 *
 * Stateless by design:
 *   - nothing is stored, logged or forwarded anywhere except Apple's push
 *     service, which only sees ciphertext (RFC 8291 encryption to the
 *     phone's own key);
 *   - there are no server secrets: the push keys travel inside the setup code
 *     the user pasted into their own Shortcut.
 *
 * Body (JSON): { config: "PENNY1.…", received?, sender?, text?, test? }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendNotification } from 'web-push';

interface ShortcutConfig {
  v: 1;
  sub: { endpoint: string; keys: { p256dh: string; auth: string } };
  pub: string;
  priv: string;
  secret: string;
}

const MAX_TEXT = 2500; // stay well under the 4 KB push payload limit

function decodeConfig(code: unknown): ShortcutConfig | null {
  if (typeof code !== 'string') return null;
  try {
    const body = code.trim().replace(/^PENNY1\./, '');
    const json = Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const cfg = JSON.parse(json) as ShortcutConfig;
    if (cfg?.v !== 1 || !cfg.sub?.endpoint || !cfg.sub.keys?.p256dh || !cfg.pub || !cfg.priv || !cfg.secret) return null;
    // Only real push services, never an arbitrary URL.
    const host = new URL(cfg.sub.endpoint).hostname;
    if (!/(^|\.)(push\.apple\.com|googleapis\.com|mozilla\.com|notify\.windows\.com)$/.test(host)) return null;
    return cfg;
  } catch {
    return null;
  }
}

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  return v.slice(0, max);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).send('Use POST');
    return;
  }

  const body = (typeof req.body === 'string' ? safeJson(req.body) : req.body) ?? {};
  const cfg = decodeConfig(body.config);
  if (!cfg) {
    res.status(400).send('Invalid setup code — copy it again from Penny → Settings → Automatic import');
    return;
  }

  const isTest = body.test === true || body.test === 'true';
  const text = str(body.text, MAX_TEXT);
  if (!isTest && !text?.trim()) {
    res.status(400).send('No message text');
    return;
  }

  const payload = JSON.stringify({
    v: 1,
    secret: cfg.secret,
    kind: isTest ? 'test' : 'sms',
    received: str(body.received, 64),
    sender: str(body.sender, 120),
    text,
  });

  try {
    await sendNotification(cfg.sub, payload, {
      vapidDetails: {
        subject: `https://${req.headers.host ?? 'penny.app'}`,
        publicKey: cfg.pub,
        privateKey: cfg.priv,
      },
      TTL: 60 * 60 * 24,
      urgency: 'high',
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    // 404/410: the phone's subscription is gone (Penny removed or turned off).
    res
      .status(status === 404 || status === 410 ? 410 : 502)
      .send(status === 404 || status === 410
        ? 'Penny on this iPhone is no longer subscribed — turn automatic import on again in Penny and paste the new code'
        : 'Push service error');
  }
}

function safeJson(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
