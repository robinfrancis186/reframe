import { useEffect, useRef, useState } from 'react';
import { zipSync, strToU8 } from 'fflate';
import AgentAvatar from './AgentAvatar';
import { api, download, slug, type ComponentItem } from './model';
interface Site {
  id: string;
  name: string;
  source: string;
  createdAt: string;
  item?: ComponentItem;
  files: Record<string, string>;
  pages: { url: string; title: string; file: string; html: string }[];
  failed: { url: string; reason: string }[];
  uncaptured: string[];
  reports: { url: string; controls: number; forms: number; externalAssets: number }[];
}
export default function WebsiteBuilder({
  url,
  onImport,
}: {
  url: string;
  onImport: (items: ComponentItem[]) => boolean;
}) {
  const [address, setAddress] = useState(url),
    [extra, setExtra] = useState(''),
    [discover, setDiscover] = useState(false),
    [limit, setLimit] = useState(4),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [progress, setProgress] = useState(''),
    [site, setSite] = useState<Site | null>(null),
    [saved, setSaved] = useState<{ id: string; name: string; count: number; createdAt: string }[]>(
      [],
    ),
    [file, setFile] = useState('index.html'),
    [mobile, setMobile] = useState(false),
    [message, setMessage] = useState('');
  const request = useRef<AbortController | null>(null);
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    void api<typeof saved>('/api/websites')
      .then(setSaved)
      .catch((e) => setError(e.message));
    return () => request.current?.abort();
  }, []);
  async function capture() {
    setBusy(true);
    setError('');
    setProgress('Opening public website…');
    setMessage('');
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch('/api/websites/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: address,
          urls: extra
            .split('\n')
            .map((u) => u.trim())
            .filter(Boolean),
          discover,
          maxPages: limit,
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body)
        throw new Error('Website reconstruction could not start.');
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = '',
        complete = false;
      function event(line: string) {
        if (!line.trim()) return;
        const e = JSON.parse(line);
        if (e.type === 'error') throw new Error(e.error);
        if (e.type === 'page') setProgress(`Page ${e.index} · ${e.status} · ${e.url}`);
        if (e.type === 'result') {
          setSite(e.result);
          setFile('index.html');
          complete = true;
        }
      }
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        lines.forEach(event);
        if (done) break;
      }
      if (buffer) event(buffer);
      if (!complete) throw new Error('Capture ended without a website package.');
      setSaved(await api('/api/websites'));
      setProgress(
        'Website package saved on this computer. Review the captured page count and failures below.',
      );
    } catch (e) {
      setError(
        (e as Error).name === 'AbortError'
          ? 'Capture cancelled. Earlier saved websites are retained.'
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
      request.current = null;
    }
  }
  async function exportSite() {
    if (!site) return;
    setExporting(true);
    setError('');
    setMessage('Reviewing the current runtime for export…');
    try {
      const files = { ...site.files };
      if (site.item) {
        const fresh = await api<ComponentItem>('/api/features/validate', { item: site.item });
        for (const name of ['feature.json', 'website.mjs', 'services.mjs'])
          files[name] = fresh.feature!.files[name];
        files['server.mjs'] = fresh.feature!.files['website-server.mjs'];
      }
      const zip = zipSync(
        Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])),
      );
      download(
        slug(site.name) + '-website.zip',
        zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer,
        'application/zip',
      );
      setMessage(
        'Website export prepared with the current reviewed runtime. Run node server.mjs in the extracted folder.',
      );
    } catch (e) {
      setError((e as Error).message);
      setMessage('');
    } finally {
      setExporting(false);
    }
  }
  return (
    <section className="panel website-builder" aria-label="Whole website reconstruction">
      <div className="section-heading">
        <AgentAvatar
          id="scout"
          name="Scout"
          size={56}
          mood={
            busy ? 'working' : error || site?.failed.length ? 'error' : site ? 'success' : 'idle'
          }
        />
        <div>
          <span className="eyebrow">WHOLE WEBSITE</span>
          <h2>Rebuild the pages. Keep the connections.</h2>
        </div>
      </div>
      <p>
        Capture public page layouts at desktop and mobile widths, and connect their navigation in a
        runnable website. Review every page before publishing.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void capture();
        }}
      >
        <fieldset disabled={busy}>
          <label>
            Starting URL
            <input
              type="url"
              aria-label="Website reconstruction URL"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
            />
          </label>
          <label>
            Other pages · one URL per line
            <textarea
              aria-label="Other website pages"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              rows={3}
              placeholder="Optional · pages from the same website"
            />
          </label>
          <div className="website-options">
            <label>
              Page limit
              <select
                aria-label="Website page limit"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              >
                {[1, 2, 4, 8].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={discover}
                onChange={(e) => setDiscover(e.target.checked)}
              />
              Follow same-origin links up to this limit
            </label>
          </div>
          <button className="primary">Rebuild website</button>
        </fieldset>
      </form>
      {busy && <button onClick={() => request.current?.abort()}>Cancel website capture</button>}
      {progress && <p role="status">{progress}</p>}
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      <p className="notice">
        Source styling and inline SVG are preserved. Public PDFs and fonts are bundled where
        available; supported images are bundled with remaining external resources reported. Reframe
        authors local navigation, search, theme controls and form storage. Contact forms save
        locally with receipts and do not send email. Private backends, AI services and unsupported
        custom actions need explicit implementations.
      </p>
      {!!saved.length && (
        <label>
          Saved websites
          <select
            aria-label="Saved websites"
            value={site?.id || ''}
            disabled={busy}
            onChange={(e) => {
              if (e.target.value)
                void api<Site>('/api/websites/package', { id: e.target.value })
                  .then((result) => {
                    setSite(result);
                    setFile('index.html');
                    setAddress(result.source);
                    setExtra(
                      result.pages
                        .slice(1)
                        .map((p) => p.url)
                        .join('\n'),
                    );
                    setLimit([1, 2, 4, 8].find((n) => n >= result.pages.length) || 8);
                    setDiscover(false);
                    setError('');
                  })
                  .catch((e) => setError(e.message));
            }}
          >
            <option value="">Choose a saved website…</option>
            {saved.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.count} pages · {new Date(s.createdAt).toLocaleTimeString()}
              </option>
            ))}
          </select>
        </label>
      )}
      {site && (
        <>
          <div className="website-controls">
            <label>
              Preview page
              <select
                aria-label="Website preview page"
                value={file}
                onChange={(e) => setFile(e.target.value)}
              >
                {site.pages.map((p) => (
                  <option key={p.file} value={p.file}>
                    {p.title} · {new URL(p.url).pathname}
                  </option>
                ))}
              </select>
            </label>
            <button aria-pressed={mobile} onClick={() => setMobile((v) => !v)}>
              {mobile ? 'Desktop preview' : 'Mobile preview'}
            </button>
            <button disabled={exporting || busy} onClick={() => void exportSite()}>
              {exporting ? 'Reviewing export…' : 'Export website ZIP'}
            </button>
            <a target="_blank" rel="noreferrer" href={`/api/websites/${site.id}/${file}`}>
              Open reconstructed website ↗
            </a>
          </div>
          <div className={'website-frame ' + (mobile ? 'mobile' : '')}>
            <iframe
              title="Reconstructed website"
              src={`/api/websites/${site.id}/${file}`}
              sandbox="allow-same-origin allow-scripts allow-forms allow-downloads allow-popups"
              referrerPolicy="no-referrer"
              onLoad={(e) => {
                try {
                  const current = e.currentTarget.contentWindow?.location.pathname.split('/').pop();
                  if (current && site.pages.some((p) => p.file === current)) setFile(current);
                } catch {}
              }}
            />
          </div>
          <h3>Capture report · {site.pages.length} pages</h3>
          <ul>
            {site.reports.map((p, i) => (
              <li key={p.url}>
                <strong>{site.pages[i].title}</strong> · {p.controls} controls · {p.forms} local
                forms · {p.externalAssets} online images
              </li>
            ))}
          </ul>
          <p>
            {site.item
              ? 'Captured routes stay inside this replica. Forms validate and persist locally. Uncaptured routes and unsupported custom controls explain what still needs implementation.'
              : 'Legacy visual package: rebuild to add authored interactions and local form storage.'}
          </p>
          {!!site.failed.length && (
            <details>
              <summary>Pages that failed · {site.failed.length}</summary>
              {site.failed.map((p) => (
                <p key={p.url}>
                  {p.url}: {p.reason}
                </p>
              ))}
            </details>
          )}
          {!!site.uncaptured.length && (
            <details>
              <summary>Discovered URLs outside this capture · {site.uncaptured.length}</summary>
              {site.uncaptured.map((u) => (
                <p key={u}>{u}</p>
              ))}
            </details>
          )}
          {site.item && (
            <button
              className="primary"
              onClick={() => {
                setError('');
                setMessage('');
                if (onImport([site.item!]))
                  setMessage(
                    'Working website saved to Library. Choose Fit & install to add it to another app.',
                  );
              }}
            >
              Save working website to Library
            </button>
          )}
          <button
            onClick={async () => {
              setMessage('');
              setError('');
              try {
                const { items } = await api<{ items: ComponentItem[] }>(
                  '/api/websites/components',
                  { id: site.id },
                );
                if (!onImport(items))
                  throw new Error(
                    'Clipboard could not save these components. Back up storage and retry.',
                  );
                setMessage(
                  `${items.length} styled, reusable components saved to Library with their local behavior.`,
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Save reusable components to Library
          </button>
          {message && <p role="status">{message}</p>}
        </>
      )}
    </section>
  );
}
