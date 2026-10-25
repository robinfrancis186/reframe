import { useEffect, useRef, useState } from 'react';
import { api, type ComponentItem, type Theme } from './model';

type Package = { id: string; url: string; download: string; height: number };
export default function WebDrop({ item, theme }: { item: ComponentItem; theme: Theme }) {
  const [ready, setReady] = useState<Package | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [copied, setCopied] = useState('');
  const [format, setFormat] = useState('html');
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    setReady(null);
    setBusy(false);
    setError('');
    setCopied('');
    return () => {
      generation.current += 1;
    };
  }, [item.id, item.feature?.builtAt, theme]);
  if (!item.feature) return null;
  const title = item.name.replace(/[<>"&]/g, '');
  const snippet = ready
    ? format === 'jsx'
      ? `<iframe src="${ready.url}" title="${title}" style={{width:'100%',height:${ready.height},border:0}} />`
      : `<iframe src="${ready.url}" title="${title}" style="width:100%;height:${ready.height}px;border:0" loading="lazy"></iframe>`
    : '';
  return (
    <section
      className="panel web-drop"
      style={{ gridColumn: '1 / -1', padding: 20 }}
      aria-label="Use in any website"
    >
      <span className="eyebrow">PICK → MAKE IT WORK → USE IT</span>
      <h2>Use this component in your website.</h2>
      <p>React, Next.js, Go templates or plain HTML. Prepare once, then copy and paste.</p>
      {!ready ? (
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            const current = generation.current;
            setBusy(true);
            setError('');
            try {
              const prepared = await api<Package>('/api/web-components/prepare', { item, theme });
              if (current === generation.current) setReady(prepared);
            } catch (e) {
              if (current === generation.current) setError((e as Error).message);
            } finally {
              if (current === generation.current) setBusy(false);
            }
          }}
        >
          {busy ? 'Preparing your working component…' : 'Prepare for my website'}
        </button>
      ) : (
        <>
          <p role="status">Your working component is ready. Its UI and backend run together.</p>
          <label>
            Paste into
            <select
              value={format}
              onChange={(e) => {
                setFormat(e.target.value);
                setCopied('');
              }}
            >
              <option value="html">HTML, Go or another website</option>
              <option value="jsx">React or Next.js</option>
            </select>
          </label>
          <textarea
            aria-label="Website embed code"
            readOnly
            value={snippet}
            rows={3}
            style={{ width: '100%' }}
          />
          <div className="row">
            <button
              className="primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(snippet);
                  setCopied('Copied. Paste it where you want the component.');
                } catch {
                  setError('Select the embed code above and copy it.');
                }
              }}
            >
              Copy component
            </button>
            <a className="button" href={ready.url} target="_blank" rel="noreferrer">
              Try working component ↗
            </a>
            <a
              className="button"
              href={ready.download}
              download={`${item.name.replace(/[^a-z0-9-]/gi, '-')}-web-component.zip`}
            >
              Download standalone package
            </a>
          </div>
          {copied && <p role="status">{copied}</p>}
          <p className="muted">
            This is a local link. Keep Reframe open while trying it in a local app. Download the
            package to run its backend independently. A public website needs its own hosted
            component address.
          </p>
          <details>
            <summary>What is included?</summary>
            <p>
              Your interface, declared actions, validation and local storage. No original site's
              private server code, saved accounts or API keys are copied. The standalone package
              needs Node 24; its instructions are included. Embedding preserves the captured design.
              For direct source installation, use Projects.
            </p>
            <button
              disabled={busy}
              onClick={async () => {
                const current = generation.current;
                setBusy(true);
                setError('');
                try {
                  await api(`/api/web-components/${ready.id}/stop`, {});
                  if (current === generation.current) setReady(null);
                } catch (e) {
                  if (current === generation.current) setError((e as Error).message);
                } finally {
                  if (current === generation.current) setBusy(false);
                }
              }}
            >
              Stop local component
            </button>
            <p className="muted">
              This stops its local link. Downloaded packages and saved records are kept.
            </p>
          </details>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
