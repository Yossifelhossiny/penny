import { useEffect, useState } from 'react';
import {
  checkPushSupport,
  disableAutoImport,
  enableAutoImport,
  getPushSettings,
  getSetupCode,
  sendTestPush,
  type PushSupport,
} from '../../services/push/pushSetup';

type Status = 'idle' | 'working' | 'copied' | 'tested';

/**
 * "Automatic import" — lets the iPhone Shortcut deliver SMS straight into
 * Penny (no Sync button) and shows a notification for each one.
 */
export function AutoImportCard() {
  const [support, setSupport] = useState<PushSupport | null>(() => checkPushSupport());
  const [code, setCode] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const settings = await getPushSettings();
      setEnabled(!!settings);
      setCode(await getSetupCode());
    })();
  }, []);

  async function handleEnable() {
    setError(null);
    setStatus('working');
    try {
      const c = await enableAutoImport();
      setCode(c);
      setEnabled(true);
      setStatus('idle');
    } catch (e) {
      setStatus('idle');
      setError(e instanceof Error ? e.message : 'Could not turn on automatic import');
      setSupport(checkPushSupport());
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

  async function handleDisable() {
    if (!confirm('Turn off automatic import? The Shortcut will stop delivering SMS until you turn it on again.')) return;
    await disableAutoImport();
    setEnabled(false);
    setCode(null);
  }

  return (
    <div className="bg-surface rounded-xl p-4 space-y-3 border border-primary/20">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-sm">⚡ Automatic import</p>
          <p className="text-xs text-text-muted mt-0.5">
            Bank SMS are saved by themselves — no Sync button — and you get a notification for each one.
          </p>
        </div>
        <span
          className={`text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
            enabled ? 'bg-primary/15 text-primary' : 'bg-surface-light text-text-muted'
          }`}
        >
          {enabled ? 'On' : 'Off'}
        </span>
      </div>

      {support && !support.ok && (
        <p className="text-xs text-warning bg-warning/10 rounded-lg p-2">
          {support.reason === 'not-installed' &&
            'Open Penny from its Home Screen icon (not Safari) to turn this on.'}
          {support.reason === 'denied' &&
            'Notifications are blocked. iPhone Settings → Notifications → Penny → Allow Notifications, then try again.'}
          {support.reason === 'unsupported' &&
            'This iPhone needs iOS 16.4 or newer for automatic import.'}
        </p>
      )}

      {!enabled && (
        <button
          onClick={handleEnable}
          disabled={status === 'working' || (support !== null && !support.ok && support.reason !== 'denied')}
          className="w-full bg-primary text-background font-semibold py-2.5 rounded-lg text-sm disabled:opacity-50"
        >
          {status === 'working' ? 'Turning on…' : 'Turn on automatic import'}
        </button>
      )}

      {enabled && code && (
        <div className="space-y-2">
          <p className="text-xs text-text-muted">
            Setup code for your Shortcut (keep it private — it lets the Shortcut add SMS to this Penny):
          </p>
          <div className="bg-background rounded-lg p-2 text-[10px] font-mono break-all max-h-16 overflow-y-auto select-all text-text-muted">
            {code}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={handleCopy} className="bg-primary text-background font-semibold py-2 rounded-lg text-sm">
              {status === 'copied' ? '✓ Copied' : '📋 Copy code'}
            </button>
            <button
              onClick={handleTest}
              disabled={status === 'working'}
              className="bg-surface-light text-text font-medium py-2 rounded-lg text-sm disabled:opacity-50"
            >
              {status === 'tested' ? '✓ Sent — check notification' : status === 'working' ? 'Sending…' : '🔔 Send test'}
            </button>
          </div>
          <button onClick={handleDisable} className="w-full text-xs text-text-muted underline py-1">
            Turn off
          </button>
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
