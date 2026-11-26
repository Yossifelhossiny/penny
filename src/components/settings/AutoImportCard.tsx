import { useEffect, useState } from 'react';
import { BellRing, Check, Copy, Zap } from 'lucide-react';
import {
  checkPushSupport,
  disableAutoImport,
  enableAutoImport,
  getPushSettings,
  getSetupCode,
  sendTestPush,
  type PushSupport,
} from '../../services/push/pushSetup';
import { Badge, Banner, Button, Card, ConfirmSheet } from '../ui';

type Status = 'idle' | 'working' | 'copied' | 'tested';

/**
 * "Automatic import" — the iPhone Shortcut delivers each bank SMS straight
 * into Penny (no Sync button) and a notification confirms it.
 */
export function AutoImportCard() {
  const [support, setSupport] = useState<PushSupport | null>(() => checkPushSupport());
  const [code, setCode] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);

  useEffect(() => {
    (async () => {
      setEnabled(!!(await getPushSettings()));
      setCode(await getSetupCode());
    })();
  }, []);

  async function handleEnable() {
    setError(null);
    setStatus('working');
    try {
      setCode(await enableAutoImport());
      setEnabled(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not turn on automatic import');
      setSupport(checkPushSupport());
    } finally {
      setStatus('idle');
    }
  }

  async function handleCopy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setStatus('copied');
      setTimeout(() => setStatus('idle'), 2500);
    } catch {
      setError('Copy failed — press and hold the code to copy it.');
    }
  }

  async function handleTest() {
    if (!code) return;
    setError(null);
    setStatus('working');
    try {
      await sendTestPush(code);
      setStatus('tested');
      setTimeout(() => setStatus('idle'), 4000);
    } catch (e) {
      setStatus('idle');
      setError(e instanceof Error ? e.message : 'Test failed');
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3.5">
        <span className="size-11 rounded-[14px] bg-grad-primary text-white flex items-center justify-center shrink-0 shadow-raised">
          <Zap className="size-5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[15px] font-bold text-ink">Automatic import</p>
            <Badge tone={enabled ? 'brand' : 'neutral'}>{enabled ? 'On' : 'Off'}</Badge>
          </div>
          <p className="text-[13px] text-ink-3 mt-0.5">Bank SMS save themselves — no Sync button — and you get a notification for each.</p>
        </div>
      </div>

      {support && !support.ok && (
        <Banner tone="warning">
          {support.reason === 'not-installed' && 'Open Penny from its Home Screen icon (not Safari) to turn this on.'}
          {support.reason === 'denied' && 'Notifications are blocked. iPhone Settings → Notifications → Penny → Allow Notifications, then try again.'}
          {support.reason === 'unsupported' && 'This iPhone needs iOS 16.4 or newer for automatic import.'}
        </Banner>
      )}

      {!enabled && (
        <Button block onClick={handleEnable} loading={status === 'working'} disabled={support !== null && !support.ok && support.reason !== 'denied'}>
          Turn on automatic import
        </Button>
      )}

      {enabled && code && (
        <div className="space-y-3">
          <div>
            <p className="text-[13px] font-semibold text-ink-2 mb-1.5">Setup code for your Shortcut</p>
            <p className="rounded-xl bg-well px-3 py-2.5 text-[11px] font-mono break-all max-h-16 overflow-y-auto select-all text-ink-3">{code}</p>
            <p className="text-[12px] text-ink-3 mt-1.5">Keep it private — it lets the Shortcut add SMS to this Penny.</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Button onClick={handleCopy} icon={status === 'copied' ? <Check className="size-4" /> : <Copy className="size-4" />}>
              {status === 'copied' ? 'Copied' : 'Copy code'}
            </Button>
            <Button variant="secondary" onClick={handleTest} loading={status === 'working'} icon={<BellRing className="size-4" />}>
              {status === 'tested' ? 'Sent' : 'Send test'}
            </Button>
          </div>
          {status === 'tested' && <p className="text-[13px] text-income font-semibold text-center">Check for a notification from Penny.</p>}
          <button type="button" onClick={() => setConfirmOff(true)} className="w-full text-[13px] font-semibold text-ink-3 py-1">
            Turn off
          </button>
        </div>
      )}

      {error && <Banner tone="error">{error}</Banner>}

      {confirmOff && (
        <ConfirmSheet
          title="Turn off automatic import?"
          message="The Shortcut will stop delivering SMS to Penny until you turn it on again and paste the new code."
          confirmLabel="Turn off"
          onClose={() => setConfirmOff(false)}
          onConfirm={async () => {
            await disableAutoImport();
            setEnabled(false);
            setCode(null);
            setConfirmOff(false);
          }}
        />
      )}
    </Card>
  );
}
