import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { generateRequestDetails, sendNotification } from 'web-push';

vi.mock('web-push', async (orig) => ({
  ...(await orig<typeof import('web-push')>()),
  sendNotification: vi.fn(async () => ({ statusCode: 201, body: '', headers: {} })),
}));
import { db, seedDefaults } from '../../db';
import { handlePushPayload, PUSH_META_KEY } from './pushHandler';
import { encodeConfig, decodeConfig } from './pushSetup';
import handler from '../../../api/sms';

const IN_SMS = 'تم إضافة تحويل لحظي بمبلغ 500.00 جم من AHMED M****** إلى بطاقتكم مسبقة الدفع رقم مرجعي 287630550001 يوم 26-11 الساعة 14:10';
const b64url = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString('base64url');

/** Make keys exactly the way the browser code does (WebCrypto). */
async function browserLikeConfig() {
  const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pubRaw = await webcrypto.subtle.exportKey('raw', keys.publicKey);
  const privJwk = await webcrypto.subtle.exportKey('jwk', keys.privateKey);
  // A browser-side push subscription (p256dh = ECDH public key, auth = 16 random bytes)
  const ecdh = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const p256dh = b64url(await webcrypto.subtle.exportKey('raw', ecdh.publicKey));
  return {
    v: 1 as const,
    sub: { endpoint: 'https://web.push.apple.com/QH-test-token', keys: { p256dh, auth: b64url(webcrypto.getRandomValues(new Uint8Array(16))) } },
    pub: b64url(pubRaw),
    priv: privJwk.d!,
    secret: 'device-secret-123',
  };
}

function fakeRes() {
  const r = { statusCode: 0, body: '' as unknown, headers: {} as Record<string, string> };
  const res = {
    setHeader: (k: string, v: string) => { r.headers[k] = v; return res; },
    status: (c: number) => { r.statusCode = c; return res; },
    send: (b: unknown) => { r.body = b; return res; },
    json: (b: unknown) => { r.body = b; return res; },
  };
  return { r, res };
}

describe('setup code', () => {
  it('round-trips', async () => {
    const cfg = await browserLikeConfig();
    expect(decodeConfig(encodeConfig(cfg))).toEqual(cfg);
    expect(decodeConfig('garbage')).toBeNull();
  });

  it('browser-made keys produce a valid VAPID-signed, encrypted request for Apple', async () => {
    const cfg = await browserLikeConfig();
    const details = generateRequestDetails(cfg.sub, 'hello', {
      vapidDetails: { subject: 'https://penny-nine-tawny.vercel.app', publicKey: cfg.pub, privateKey: cfg.priv },
    });
    expect(details.endpoint).toBe(cfg.sub.endpoint);
    expect(details.headers.Authorization).toMatch(/^vapid t=.+, k=/);
    expect(details.headers['Content-Encoding']).toBe('aes128gcm');
    expect((details.body as Buffer).includes(Buffer.from('hello'))).toBe(false); // encrypted
  });
});

describe('/api/sms', () => {
  it('relays the SMS to the phone as a push, with the device secret', async () => {
    const cfg = await browserLikeConfig();
    const spy = vi.mocked(sendNotification);
    const { r, res } = fakeRes();
    await handler(
      { method: 'POST', headers: { host: 'penny-nine-tawny.vercel.app' }, body: { config: encodeConfig(cfg), received: '2026-11-26T15:00:00+02:00', sender: 'BanK-AlAhly', text: IN_SMS } } as never,
      res as never
    );
    expect(r.statusCode).toBe(200);
    const [sub, payload, opts] = spy.mock.calls[0];
    expect(sub).toEqual(cfg.sub);
    expect(JSON.parse(payload as string)).toMatchObject({ v: 1, secret: cfg.secret, kind: 'sms', text: IN_SMS, sender: 'BanK-AlAhly' });
    expect(opts?.vapidDetails?.subject).toBe('https://penny-nine-tawny.vercel.app');
  });

  it('rejects bad codes, non-push endpoints and GET', async () => {
    const cfg = await browserLikeConfig();
    const evil = { ...cfg, sub: { ...cfg.sub, endpoint: 'https://attacker.example/collect' } };
    for (const [req, code] of [
      [{ method: 'POST', headers: {}, body: { config: 'nope', text: 'x' } }, 400],
      [{ method: 'POST', headers: {}, body: { config: encodeConfig(evil as never), text: 'x' } }, 400],
      [{ method: 'GET', headers: {}, body: {} }, 405],
    ] as const) {
      const { r, res } = fakeRes();
      await handler(req as never, res as never);
      expect(r.statusCode).toBe(code);
    }
  });
});

describe('service worker push handling', () => {
  beforeEach(async () => {
    await Promise.all([db.accounts.clear(), db.transactions.clear(), db.categories.clear(), db.smsInbox.clear(), db.meta.clear()]);
    await seedDefaults();
    await db.meta.put({ key: PUSH_META_KEY, value: { secret: 's3cret', enabledAt: '' } });
  });

  it('saves the SMS while Penny is closed and words the notification', async () => {
    const notice = await handlePushPayload({ v: 1, secret: 's3cret', kind: 'sms', received: '2026-11-26T15:00:00+02:00', sender: 'BanK-AlAhly', text: IN_SMS });
    expect(await db.transactions.count()).toBe(1);
    expect(notice?.title).toContain('فلوس دخلت');
    expect(notice?.body).toContain('+500 ج.م');
    expect(notice?.body).toContain('عندك 1 معاملة من غير تصنيف');
    expect(notice).toMatchObject({ page: 'transactions', filter: 'uncategorized' });
  });

  it('a repeated push does not save twice', async () => {
    const p = { v: 1, secret: 's3cret', kind: 'sms', received: '2026-11-26T15:00:00+02:00', sender: 'B', text: IN_SMS };
    await handlePushPayload(p);
    const second = await handlePushPayload(p);
    expect(await db.transactions.count()).toBe(1);
    expect(second?.body).toContain('متسجلة قبل كده');
  });

  it('ignores pushes with the wrong secret', async () => {
    expect(await handlePushPayload({ v: 1, secret: 'wrong', kind: 'sms', text: IN_SMS })).toBeNull();
    expect(await db.transactions.count()).toBe(0);
  });

  it('test push', async () => {
    expect((await handlePushPayload({ v: 1, secret: 's3cret', kind: 'test' }))?.title).toContain('Automatic import is on');
  });
});
