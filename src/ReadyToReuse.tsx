import { useEffect, useRef, useState } from 'react';
import { reuseReport } from './reuse-report.js';
import type { ComponentItem } from './model';

type Check = {
  passed: boolean;
  checkedAt: string;
  scope: string;
  views: {
    page: number;
    width: number;
    images: number;
    brokenImages: number;
    failedFonts: number;
  }[];
  downloads: { name: string; bytes: number; match: boolean }[];
  blocked: string[];
  errors: string[];
};
export default function ReadyToReuse({
  item,
  onUpdate,
}: {
  item: ComponentItem;
  onUpdate?: (item: ComponentItem) => void;
}) {
  const report = reuseReport(item);
  const [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [check, setCheck] = useState<Check | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    setCheck(null);
    setError('');
    setBusy('');
    return () => request.current?.abort();
  }, [item.feature?.spec.website]);
  if (!report) return null;
  async function run(action: 'bundle' | 'check') {
    const controller = new AbortController();
    request.current = controller;
    setBusy(action);
    setError('');
    try {
      const response = await fetch('/api/reuse/' + action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Check failed. Try again.');
      if (controller.signal.aborted) return;
      if (action === 'bundle') onUpdate?.({ ...result, contentHash: undefined });
      else setCheck(result);
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy('');
    }
  }
  return (
    <details
      className="panel reuse-report"
      aria-label="Ready to reuse report"
      style={{ gridColumn: '1 / -1', padding: 20 }}
    >
      <summary>
        <strong>Ready to reuse</strong> ·{' '}
        {report.selfContained
          ? 'Assets included'
          : `${report.external.length} external resource${report.external.length === 1 ? '' : 's'}`}{' '}
        · {check?.passed ? 'Source-blocked check passed' : 'Runtime check needed'}
      </summary>
      <dl className="install-summary">
        <div>
          <dt>Included assets</dt>
          <dd>
            {report.images} images · {report.backgrounds} backgrounds · {report.fonts} fonts ·{' '}
            {report.downloads} PDF{report.downloads === 1 ? '' : 's'}
          </dd>
        </div>
        <div>
          <dt>Appearance</dt>
          <dd>
            {item.fidelity ? `${item.fidelity.score}% measured match` : 'Not measured'} ·{' '}
            {item.captureVariants?.length || 0} additional variants
          </dd>
        </div>
        <div>
          <dt>Behavior</dt>
          <dd>
            {report.forms
              ? 'Forms save local receipts; email delivery is not connected.'
              : 'Local navigation and bundled downloads included.'}{' '}
            Custom actions still need testing.
          </dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>
            Review files in Fit &amp; install, then test inside that app. A fit score is not a
            runtime test.
          </dd>
        </div>
      </dl>
      {report.external.length > 0 && (
        <div>
          <strong>Still depends on external resources</strong>
          <ul>
            {report.external.map((url) => (
              <li key={url} style={{ overflowWrap: 'anywhere' }}>
                {url}
              </li>
            ))}
          </ul>
        </div>
      )}
      {report.links.length > 0 && (
        <p>
          {report.links.length} external navigation links remain. Opening them needs internet
          access.
        </p>
      )}
      {report.warnings.length > 0 && (
        <details>
          <summary>Capture limitations ({report.warnings.length})</summary>
          <ul>
            {report.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="muted">
        Reuse only assets you have permission to use. Supported public raster images are embedded;
        unsupported or oversized assets remain listed above.
      </p>
      <div className="row">
        {onUpdate && report.external.length > 0 && (
          <button disabled={!!busy} onClick={() => run('bundle')}>
            {busy === 'bundle' ? 'Bundling…' : 'Bundle supported assets'}
          </button>
        )}
        <button disabled={!!busy} onClick={() => run('check')}>
          {busy === 'check' ? 'Checking with external sites blocked…' : 'Test with source blocked'}
        </button>
      </div>
      {check && (
        <div role="status">
          <strong>
            {check.passed ? 'Source-blocked check passed' : 'Source-blocked check needs attention'}
          </strong>
          <p>
            {check.views.length} viewport checks · {check.downloads.filter((d) => d.match).length}{' '}
            verified downloads · {check.blocked.length} blocked requests
          </p>
          <p>{check.scope}</p>
          {check.errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
