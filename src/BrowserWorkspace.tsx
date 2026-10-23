import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Plus,
  X,
  Globe,
  MousePointer2,
  Camera,
  Bookmark,
  Monitor,
  Smartphone,
  ChevronUp,
  ChevronDown,
  Layers,
  Scan,
  Loader2,
  Download,
  FileSearch,
} from 'lucide-react';
import { api, download, slug, type ComponentItem } from './model';
const WebsiteBuilder = lazy(() => import('./WebsiteBuilder'));
interface Tab {
  id: string;
  title: string;
  url: string;
  mobile: boolean;
}
interface Snapshot {
  id: string;
  tabs: Tab[];
  url: string;
  title: string;
  mobile: boolean;
  image: string;
  viewport: { width: number; height: number };
  blocked: number;
  dialog?: { id: string; type: string; message: string; defaultValue: string } | null;
  document?: {
    height: number;
    scrollY: number;
    images: number;
    loadedImages: number;
    ready: string;
  };
  network?: {
    requests: number;
    pending: number;
    bytes: number;
    issues: { type: string; url: string; reason: string }[];
  };
  writeOrigin?: string | null;
  popup?: string | null;
  scanLimited?: boolean;
  selection: {
    name: string;
    tag: string;
    bounds: { x: number; y: number; width: number; height: number };
  } | null;
}
interface ScrapedPage {
  title: string;
  url: string;
  text: string;
  headings: { level: number; text: string }[];
  links: { text: string; url: string }[];
  images: { alt: string; url: string; loaded: boolean }[];
  controls: { tag: string; type: string; label: string; disabled: boolean }[];
  counts: { text: number; headings: number; links: number; images: number; controls: number };
  truncated: boolean;
  scanLimited: boolean;
}
interface PageShot {
  title: string;
  url: string;
  image: string;
  fullPage: boolean;
  truncated: boolean;
  scanLimited: boolean;
}
interface SavedReference {
  title: string;
  url: string;
}
export default function BrowserWorkspace({
  active,
  onCapture,
  onSave,
  onImport,
  onScreenshot,
}: {
  active: boolean;
  onCapture: (r: { items: ComponentItem[] }) => void;
  onSave: (item: ComponentItem) => boolean;
  onImport: (items: ComponentItem[]) => boolean;
  onScreenshot: (image: string, source: string) => void;
}) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [id, setId] = useState('');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [address, setAddress] = useState('https://www.apple.com');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(false);
  const [scraped, setScraped] = useState<ScrapedPage | null>(null),
    [live, setLive] = useState(true);
  const [dialogText, setDialogText] = useState('');
  const pageDialog = useRef<HTMLElement>(null);
  const [picking, setPicking] = useState(false);
  const [typed, setTyped] = useState('');
  const [point, setPoint] = useState<{ x: number; y: number; depth: number } | null>(null);
  const [hovered, setHovered] = useState<{
    tag: string;
    name: string;
    bounds: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const browserSurface = useRef<HTMLDivElement>(null);
  const typeInput = useRef<HTMLInputElement>(null),
    hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    dragStart = useRef<{ x: number; y: number } | null>(null),
    suppressClick = useRef(false);
  const inFlight = useRef(false);
  const waiters = useRef<(() => void)[]>([]);
  const lastUrl = useRef('');
  function release() {
    inFlight.current = false;
    waiters.current.splice(0).forEach((resolve) => resolve());
  }
  async function acquire() {
    while (inFlight.current) await new Promise<void>((resolve) => waiters.current.push(resolve));
    inFlight.current = true;
  }
  const current = useRef(id);
  current.current = id;
  const [saved, setSaved] = useState<SavedReference[]>(() => {
    try {
      const value = JSON.parse(localStorage.getItem('reframe-references') || '[]');
      return Array.isArray(value)
        ? value
            .filter(
              (v) =>
                typeof v.title === 'string' &&
                typeof v.url === 'string' &&
                (() => {
                  try {
                    return ['http:', 'https:'].includes(new URL(v.url).protocol);
                  } catch {
                    return false;
                  }
                })(),
            )
            .slice(0, 30)
        : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    if (!active) return;
    api<Tab[]>('/api/browser/tabs')
      .then((t) => {
        setTabs(t);
        if (!t.some((tab) => tab.id === current.current)) {
          setId(t[0]?.id || '');
          setSnapshot(null);
        }
      })
      .catch((e) => setError(e.message));
  }, [active]);
  function update(data: Snapshot) {
    setSnapshot(data);
    setTabs(data.tabs);
    if (lastUrl.current !== data.url) {
      setScraped(null);
      setPoint(null);
      setHovered(null);
      setAddress(data.url === 'about:blank' ? '' : data.url);
      lastUrl.current = data.url;
    }
  }
  async function action(action: string, payload: object = {}, quiet = false) {
    if (!id || (quiet && inFlight.current)) return;
    await acquire();
    if (current.current !== id) {
      release();
      return;
    }
    if (!quiet) {
      setBusy(
        action === 'prepare'
          ? 'Loading the whole page'
          : action === 'navigate'
            ? 'Loading website'
            : action,
      );
      setError('');
      setMessage('');
    }
    try {
      const data = await api<Snapshot>('/api/browser/action', { id, action, ...payload });
      if (current.current === id) update(data);
      if (action === 'prepare')
        setMessage(
          data.scanLimited
            ? 'The scan reached its limit. Scroll manually to load additional content.'
            : 'Whole-page scan complete. Capture sections, scrape data or export a screenshot.',
        );
      return true;
    } catch (e) {
      const message = (e as Error).message;
      if (/tab closed or expired/.test(message) && current.current === id) {
        setId('');
        setSnapshot(null);
        setTabs([]);
        setPoint(null);
        setError('This browser session ended. Open the reference again to continue.');
      } else if (!quiet) setError(message);
    } finally {
      release();
      if (!quiet) setBusy('');
    }
  }
  useEffect(() => {
    if (!active || !id) return;
    void action('snapshot');
    const timer = setInterval(() => {
      if (live && document.visibilityState === 'visible') void action('snapshot', {}, true);
    }, 1500);
    return () => clearInterval(timer);
  }, [id, active, live]);
  useEffect(
    () => () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (snapshot?.dialog) {
      setDialogText(snapshot.dialog.defaultValue);
      pageDialog.current?.focus();
    }
  }, [snapshot?.dialog?.id]);
  useEffect(() => {
    const surface = browserSurface.current;
    if (!surface || !active || !snapshot) return;
    let timer: ReturnType<typeof setTimeout> | undefined,
      delta = 0,
      x = 0,
      pointerY = 0;
    function wheel(event: WheelEvent) {
      if (!(event.target instanceof HTMLImageElement)) return;
      event.preventDefault();
      delta = Math.max(
        -1000,
        Math.min(
          1000,
          delta +
            event.deltaY *
              (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? snapshot!.viewport.height : 1),
        ),
      );
      const rect = event.target.getBoundingClientRect();
      x = ((event.clientX - rect.left) * snapshot!.viewport.width) / rect.width;
      pointerY = ((event.clientY - rect.top) * snapshot!.viewport.height) / rect.height;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void action('scroll', { y: delta, x, pointerY });
        delta = 0;
      }, 100);
    }
    surface.addEventListener('wheel', wheel, { passive: false });
    return () => {
      surface.removeEventListener('wheel', wheel);
      if (timer) clearTimeout(timer);
    };
  }, [active, id, snapshot?.viewport.width]);
  async function newTab(navigate = false, target = address) {
    await acquire();
    setBusy('Opening browser');
    setError('');
    setScraped(null);
    try {
      const r = await api<{ id: string; tabs: Tab[] }>('/api/browser/tabs', {});
      setTabs(r.tabs);
      current.current = r.id;
      setId(r.id);
      setSnapshot(null);
      setPoint(null);
      const data = await api<Snapshot>('/api/browser/action', {
        id: r.id,
        action: navigate ? 'navigate' : 'snapshot',
        url: target,
      });
      update(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      release();
      setBusy('');
    }
  }
  async function closeTab(tabId: string) {
    await acquire();
    setBusy('Closing tab');
    try {
      const r = await api<{ tabs: Tab[] }>('/api/browser/close', { id: tabId });
      setTabs(r.tabs);
      if (id === tabId) {
        setId(r.tabs[0]?.id || '');
        setSnapshot(null);
        setPoint(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      release();
      setBusy('');
    }
  }
  async function capture(kind: 'adapt' | 'save' | 'all') {
    if (!id) return;
    await acquire();
    setBusy('Capturing');
    setError('');
    try {
      const r = await api<{ items: ComponentItem[] }>('/api/browser/action', {
        id,
        action: kind === 'all' ? 'extract' : 'capture',
      });
      if (kind === 'save') {
        if (onSave(r.items[0]))
          setMessage('Saved to clipboard, including the original reference image.');
      } else onCapture(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      release();
      setBusy('');
    }
  }
  // Outline what a pick at this point would select, so users can aim before committing.
  async function probe(p: { x: number; y: number }) {
    if (!id || inFlight.current) return;
    await acquire();
    try {
      const r = await api<{ probe: typeof hovered }>('/api/browser/action', {
        id,
        action: 'probe',
        ...p,
        depth: 0,
      });
      if (current.current === id) setHovered(r.probe);
    } catch {
      setHovered(null);
    } finally {
      release();
    }
  }
  function bookmark() {
    if (!snapshot || !/^https?:/.test(snapshot.url)) return;
    const next = saved.some((s) => s.url === snapshot.url)
      ? saved.filter((s) => s.url !== snapshot.url)
      : [{ title: snapshot.title || snapshot.url, url: snapshot.url }, ...saved].slice(0, 30);
    try {
      localStorage.setItem('reframe-references', JSON.stringify(next));
      setSaved(next);
    } catch {
      setError('Reference could not be saved. Browser storage is full or unavailable.');
    }
  }
  async function tool(kind: 'scrape' | 'screenshot', fullPage = false) {
    if (!id) return;
    await acquire();
    if (current.current !== id) {
      release();
      return;
    }
    setBusy(
      kind === 'scrape'
        ? 'Reading the full page'
        : fullPage
          ? 'Capturing full page'
          : 'Capturing screenshot',
    );
    setError('');
    setMessage('');
    try {
      if (kind === 'scrape') {
        const result = await api<ScrapedPage>('/api/browser/action', { id, action: kind });
        setScraped(result);
        setMessage(
          `Read ${result.counts.headings} headings, ${result.counts.links} links and ${result.counts.controls} controls.${result.scanLimited ? ' The lazy-load scan reached its limit.' : ''}`,
        );
      } else {
        const result = await api<PageShot>('/api/browser/action', { id, action: kind, fullPage });
        if (fullPage) {
          download(
            slug(result.title) + '-full-page.jpg',
            Uint8Array.from(atob(result.image.split(',')[1]), (c) => c.charCodeAt(0)).buffer,
            'image/jpeg',
          );
          setMessage(
            result.truncated
              ? 'Screenshot downloaded: first 20,000 pixels. Scroll further for additional captures.'
              : 'Full-page screenshot downloaded.',
          );
        } else onScreenshot(result.image, result.url);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      release();
      setBusy('');
    }
  }
  function coordinates(
    event: React.PointerEvent<HTMLImageElement> | React.MouseEvent<HTMLImageElement>,
  ) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          snapshot!.viewport.width - 1,
          ((event.clientX - rect.left) * snapshot!.viewport.width) / rect.width,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          snapshot!.viewport.height - 1,
          ((event.clientY - rect.top) * snapshot!.viewport.height) / rect.height,
        ),
      ),
    };
  }
  const ready = !!snapshot && snapshot.url !== 'about:blank';
  const disabled = !!busy || !!snapshot?.dialog;
  return (
    <div hidden={!active} className="browser-workspace">
      <div className="intro">
        <h2>Explore. Pick. Make it yours.</h2>
        <p>
          Browse a real page, capture the part that matters, and keep its original appearance for
          comparison.
        </p>
        <button onClick={() => setWebsite((v) => !v)}>
          {website ? 'Hide website reconstruction' : 'Rebuild a whole website'}
        </button>
      </div>
      {website && (
        <Suspense fallback={<p role="status">Loading website reconstruction…</p>}>
          <WebsiteBuilder
            url={snapshot?.url && snapshot.url !== 'about:blank' ? snapshot.url : address}
            onImport={onImport}
          />
        </Suspense>
      )}
      <div className="browser-layout">
        <section className="panel browser-shell" aria-label="Reference browser">
          <div className="browser-tabs" role="tablist" aria-label="Reference tabs">
            {tabs.map((t) => (
              <div key={t.id} className={id === t.id ? 'selected' : ''}>
                <button
                  role="tab"
                  aria-selected={id === t.id}
                  disabled={disabled}
                  onClick={() => {
                    setId(t.id);
                    setSnapshot(null);
                    setPoint(null);
                    setAddress(t.url === 'about:blank' ? '' : t.url);
                  }}
                >
                  <Globe size={13} />
                  <span>{t.title || 'New tab'}</span>
                </button>
                <button
                  disabled={disabled}
                  aria-label={`Close ${t.title || 'new tab'}`}
                  onClick={() => void closeTab(t.id)}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            <button
              className="icon-button"
              aria-label="New browser tab"
              title="New tab"
              disabled={disabled || tabs.length >= 4}
              onClick={() => void newTab()}
            >
              <Plus size={17} />
            </button>
          </div>
          <form
            className="browser-address"
            onSubmit={(e) => {
              e.preventDefault();
              setPoint(null);
              void (id ? action('navigate', { url: address }) : newTab(true));
            }}
          >
            <button
              type="button"
              aria-label="Browser back"
              title="Back"
              disabled={disabled || !ready}
              onClick={() => void action('back')}
            >
              <ArrowLeft size={16} />
            </button>
            <button
              type="button"
              aria-label="Browser forward"
              title="Forward"
              disabled={disabled || !ready}
              onClick={() => void action('forward')}
            >
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              aria-label="Refresh reference page"
              title="Refresh"
              disabled={disabled || !ready}
              onClick={() => void action('reload')}
            >
              <RotateCw size={15} />
            </button>
            <input
              aria-label="Browser address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="https://www.apple.com"
              required
            />
            <button className="primary" disabled={disabled || !address.trim()}>
              Go
            </button>
            <button
              type="button"
              aria-label="Bookmark reference"
              title="Save reference"
              aria-pressed={!!snapshot && saved.some((s) => s.url === snapshot.url)}
              disabled={disabled || !ready}
              onClick={bookmark}
            >
              <Bookmark size={16} />
            </button>
          </form>
          <div className="browser-tools">
            <button
              aria-pressed={picking}
              className={picking ? 'selected' : ''}
              disabled={!ready || disabled}
              onClick={() => {
                setPicking(!picking);
                setPoint(null);
                setHovered(null);
              }}
            >
              <MousePointer2 size={15} />
              {picking ? 'Picking element' : 'Pick element'}
            </button>
            <div className="browser-size">
              <button
                aria-label="Browser desktop size"
                aria-pressed={!snapshot?.mobile}
                disabled={!id || disabled}
                onClick={() => void action('viewport', { mobile: false })}
              >
                <Monitor size={15} />
              </button>
              <button
                aria-label="Browser mobile size"
                aria-pressed={!!snapshot?.mobile}
                disabled={!id || disabled}
                onClick={() => void action('viewport', { mobile: true })}
              >
                <Smartphone size={15} />
              </button>
            </div>
            <button disabled={!ready || disabled} onClick={() => void tool('screenshot')}>
              <Camera size={15} />
              Use screenshot
            </button>
            <button disabled={!ready || disabled} onClick={() => void tool('screenshot', true)}>
              <Download size={15} />
              Full-page screenshot
            </button>
            <button disabled={!ready || disabled} onClick={() => void action('prepare')}>
              <RotateCw size={15} />
              Load whole page
            </button>
            <button disabled={!ready || disabled} onClick={() => void tool('scrape')}>
              <FileSearch size={15} />
              Scrape page
            </button>
            <button disabled={!ready || disabled} onClick={() => void capture('all')}>
              <Layers size={15} />
              Capture page sections
            </button>
            <button disabled={disabled} onClick={() => setWebsite((v) => !v)}>
              Rebuild entire website
            </button>
          </div>
          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="browser-feedback" role="status">
              {message}
            </p>
          )}
          {snapshot?.dialog && (
            <section
              ref={pageDialog}
              tabIndex={-1}
              className="browser-page-dialog"
              onKeyDown={(e) => {
                if (
                  !busy &&
                  (e.key === 'Escape' ||
                    (e.key === 'Enter' && e.target instanceof HTMLInputElement))
                ) {
                  e.preventDefault();
                  void action('dialog', { accept: e.key === 'Enter', text: dialogText });
                }
              }}
              role="alertdialog"
              aria-labelledby="website-dialog-title"
              aria-describedby="website-dialog-message"
            >
              <h3 id="website-dialog-title">
                Website {snapshot.dialog.type} · {new URL(snapshot.url).hostname}
              </h3>
              <p id="website-dialog-message">{snapshot.dialog.message}</p>
              {snapshot.dialog.type === 'prompt' && (
                <label>
                  Your response
                  <input
                    maxLength={2000}
                    value={dialogText}
                    onChange={(e) => setDialogText(e.target.value)}
                  />
                </label>
              )}
              <div>
                {snapshot.dialog.type !== 'alert' && (
                  <button
                    disabled={!!busy}
                    onClick={() => void action('dialog', { accept: false })}
                  >
                    Cancel website dialog
                  </button>
                )}
                <button
                  className="primary"
                  disabled={!!busy}
                  onClick={() => void action('dialog', { accept: true, text: dialogText })}
                >
                  {snapshot.dialog.type === 'alert' ? 'OK' : 'Confirm website dialog'}
                </button>
              </div>
              <small>
                This message comes from the website. Confirm only the action you intended.
              </small>
            </section>
          )}
          <div
            ref={browserSurface}
            className={'browser-viewport ' + (snapshot?.mobile ? 'phone-view' : '')}
          >
            {snapshot && ready ? (
              <div
                className={'browser-image ' + (picking ? 'picking' : '')}
                style={{ maxWidth: snapshot.viewport.width }}
              >
                <img
                  src={snapshot.image}
                  alt={`Interactive browser view of ${snapshot.title || snapshot.url}`}
                  draggable={false}
                  tabIndex={0}
                  aria-describedby="browser-control-help"
                  onKeyDown={(e) => {
                    const key =
                      e.key === 'Tab' && e.shiftKey
                        ? 'Shift+Tab'
                        : e.key === ' '
                          ? 'Space'
                          : (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a'
                            ? 'ControlOrMeta+A'
                            : e.key;
                    if (
                      [
                        'Tab',
                        'Shift+Tab',
                        'Enter',
                        'Escape',
                        'Backspace',
                        'Delete',
                        'ArrowUp',
                        'ArrowDown',
                        'ArrowLeft',
                        'ArrowRight',
                        'Home',
                        'End',
                        'PageUp',
                        'PageDown',
                        'Space',
                        'ControlOrMeta+A',
                      ].includes(key)
                    ) {
                      e.preventDefault();
                      void action('key', { key });
                      if (key === 'Escape') typeInput.current?.focus();
                    }
                  }}
                  onPaste={(e) => {
                    e.preventDefault();
                    const text = e.clipboardData.getData('text/plain');
                    if (text.length <= 2000) void action('text', { text });
                    else setError('Paste up to 2,000 characters at a time.');
                  }}
                  onPointerMove={(e) => {
                    if (disabled || e.pointerType !== 'mouse') return;
                    const p = coordinates(e);
                    if (hoverTimer.current) clearTimeout(hoverTimer.current);
                    hoverTimer.current = setTimeout(
                      () => {
                        void (picking ? probe(p) : action('hover', p, true));
                      },
                      picking ? 120 : 200,
                    );
                  }}
                  onPointerLeave={() => {
                    if (hoverTimer.current) clearTimeout(hoverTimer.current);
                    setHovered(null);
                  }}
                  onPointerDown={(e) => {
                    if (!disabled && !picking) dragStart.current = coordinates(e);
                  }}
                  onPointerUp={(e) => {
                    const start = dragStart.current;
                    dragStart.current = null;
                    if (!start || picking || disabled) return;
                    const end = coordinates(e);
                    if (Math.hypot(start.x - end.x, start.y - end.y) > 8) {
                      suppressClick.current = true;
                      void action('drag', { ...start, toX: end.x, toY: end.y });
                    }
                  }}
                  onClick={(e) => {
                    if (hoverTimer.current) clearTimeout(hoverTimer.current);
                    if (suppressClick.current) {
                      suppressClick.current = false;
                      return;
                    }
                    if (disabled) return;
                    const p = { ...coordinates(e), depth: 0 };
                    setPoint(p);
                    setHovered(null);
                    void action(picking ? 'pick' : 'click', {
                      ...p,
                      clickCount: Math.min(2, e.detail || 1),
                    });
                  }}
                />
                {picking && hovered && (
                  <div
                    className="browser-selection hover"
                    style={{
                      left: (hovered.bounds.x / snapshot.viewport.width) * 100 + '%',
                      top: (hovered.bounds.y / snapshot.viewport.height) * 100 + '%',
                      width: (hovered.bounds.width / snapshot.viewport.width) * 100 + '%',
                      height: (hovered.bounds.height / snapshot.viewport.height) * 100 + '%',
                    }}
                  >
                    <span>
                      {hovered.tag}
                      {hovered.name ? ' · ' + hovered.name : ''}
                    </span>
                  </div>
                )}
                {snapshot.selection && (
                  <div
                    className="browser-selection"
                    style={{
                      left: (snapshot.selection.bounds.x / snapshot.viewport.width) * 100 + '%',
                      top: (snapshot.selection.bounds.y / snapshot.viewport.height) * 100 + '%',
                      width:
                        (snapshot.selection.bounds.width / snapshot.viewport.width) * 100 + '%',
                      height:
                        (snapshot.selection.bounds.height / snapshot.viewport.height) * 100 + '%',
                    }}
                  />
                )}
              </div>
            ) : (
              <div className="browser-empty">
                <Globe size={38} />
                <h3>Your next reference starts here.</h3>
                <p>
                  Enter a website above. Reframe renders it in an isolated browser, with scripts and
                  layout intact.
                </p>
                <button
                  className="primary"
                  disabled={disabled}
                  onClick={() =>
                    void (id
                      ? action('navigate', { url: address || 'https://www.apple.com' })
                      : newTab(true, address || 'https://www.apple.com'))
                  }
                >
                  Open reference website
                  <ArrowRight size={16} />
                </button>
              </div>
            )}
          </div>
          <div className="browser-bottom">
            <span role="status">
              {busy ? (
                <>
                  <Loader2 className="spin" size={13} />
                  {busy}…
                </>
              ) : ready ? (
                `${snapshot?.document?.ready || 'Ready'} · ${snapshot?.document?.height?.toLocaleString() || '—'}px page · ${snapshot?.network?.pending || 0} loading`
              ) : (
                'Chromium starts when you open a tab'
              )}
            </span>
            <div>
              <label>
                <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
                Live view
              </label>
              <button
                aria-label="Scroll reference up"
                disabled={!ready || disabled}
                onClick={() => void action('scroll', { y: -550 })}
              >
                <ChevronUp size={17} />
              </button>
              <button
                aria-label="Scroll reference down"
                disabled={!ready || disabled}
                onClick={() => void action('scroll', { y: 550 })}
              >
                <ChevronDown size={17} />
              </button>
            </div>
          </div>
          {ready && (
            <>
              <p id="browser-control-help" className="browser-control-help">
                Click, hover, drag or scroll inside the page. Click a field, then type below or
                paste into the page. Tab, arrows and Enter control the website; Escape returns to
                the text field.
              </p>
              <form
                className="browser-type"
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = typed;
                  void action('text', { text }).then((ok) => {
                    if (ok) setTyped((current) => (current === text ? '' : current));
                  });
                }}
              >
                <input
                  ref={typeInput}
                  aria-label="Text for focused website field"
                  value={typed}
                  maxLength={2000}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="Click a website field, then type here"
                />
                <button disabled={disabled || !typed}>Type into page</button>
                <button type="button" disabled={disabled} onClick={() => void action('enter')}>
                  Enter ↵
                </button>
              </form>
            </>
          )}
        </section>
        <aside className="browser-side">
          <section className="panel browser-pick">
            <Scan size={21} />
            <h2>{snapshot?.selection ? 'Ready to reuse' : 'Pick a component'}</h2>
            <p>
              {snapshot?.selection
                ? snapshot.selection.name
                : 'Turn on Pick element, then click a heading, button, card or section in the page.'}
            </p>
            {snapshot?.selection && (
              <>
                <small>Selected &lt;{snapshot.selection.tag}&gt;</small>
                <button
                  disabled={disabled || !point || point.depth >= 8}
                  onClick={() => {
                    if (point) {
                      const p = { ...point, depth: point.depth + 1 };
                      setPoint(p);
                      void action('pick', p);
                    }
                  }}
                >
                  Select parent container
                </button>
                <button
                  className="primary"
                  disabled={disabled}
                  onClick={() => void capture('adapt')}
                >
                  Adapt in Studio
                  <ArrowRight size={15} />
                </button>
                <button disabled={disabled} onClick={() => void capture('save')}>
                  Save directly to clipboard
                </button>
                <small>The captured reference image stays with your component.</small>
                {message && <p className="browser-pick-note">{message}</p>}
              </>
            )}
          </section>
          <section className="panel browser-bookmarks">
            <h2>
              Saved references <span>{saved.length}</span>
            </h2>
            {saved.length ? (
              saved.map((s) => (
                <button
                  key={s.url}
                  disabled={disabled}
                  onClick={() => {
                    setAddress(s.url);
                    void (id ? action('navigate', { url: s.url }) : newTab(true, s.url));
                  }}
                >
                  <Globe size={14} />
                  <span>
                    {s.title}
                    <small>{new URL(s.url).hostname}</small>
                  </span>
                </button>
              ))
            ) : (
              <p>Bookmark useful pages to build your reference collection.</p>
            )}
          </section>
          {ready && (
            <section className="panel browser-access">
              <h2>Website access</h2>
              <p>
                {snapshot?.writeOrigin
                  ? `Submissions enabled for ${snapshot.writeOrigin} in this tab.`
                  : 'Read-only network access. Forms and APIs that write data need your permission.'}
              </p>
              <button
                disabled={disabled}
                onClick={() => {
                  const origin = new URL(snapshot!.url).origin;
                  if (
                    snapshot?.writeOrigin ||
                    window.confirm(
                      `Enable submissions to ${origin} for this tab? Forms and API requests can change data or submit information you enter. Other origins remain blocked. Access ends when you leave this origin or close the tab. Retry the intended action after enabling.`,
                    )
                  )
                    void action('permissions', { origin, allowWrites: !snapshot?.writeOrigin });
                }}
              >
                {snapshot?.writeOrigin ? 'Disable submissions' : 'Enable submissions…'}
              </button>
              <small>
                Public HTTP(S) only. Each tab has its own temporary cookies. Website file downloads,
                private networks, streaming sockets and camera/microphone access remain unavailable.
                Resources are limited to 8 MB each / 64 MB per navigation.
              </small>
            </section>
          )}
          {snapshot?.popup && /^https?:/.test(snapshot.popup) && (
            <section className="panel browser-access">
              <h2>New-window link</h2>
              <p>{snapshot.popup}</p>
              <button disabled={disabled} onClick={() => void newTab(true, snapshot.popup!)}>
                Open in a browser tab
              </button>
            </section>
          )}
          {ready && (
            <details className="panel browser-diagnostics">
              <summary>
                Page &amp; resource report · {snapshot?.network?.issues.length || 0} issues
              </summary>
              <p>
                {snapshot?.document?.loadedImages || 0} / {snapshot?.document?.images || 0} images
                loaded · {snapshot?.network?.requests || 0} requests ·{' '}
                {Math.round((snapshot?.network?.bytes || 0) / 1024)} KB transferred
              </p>
              {snapshot?.scanLimited && (
                <p>
                  The scan reached its 40-step / 20,000px limit. Scroll manually to inspect
                  additional content.
                </p>
              )}
              <ul>
                {snapshot?.network?.issues.map((issue, index) => (
                  <li key={index}>
                    <strong>
                      {issue.type}: {issue.reason}
                    </strong>
                    <small>{issue.url}</small>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </aside>
      </div>
      {scraped && (
        <section className="panel browser-scrape" aria-label="Scraped website data">
          <div className="section-heading">
            <h2>Page data · {scraped.title}</h2>
            <button
              onClick={() =>
                download(
                  slug(scraped.title) + '-page.json',
                  JSON.stringify(scraped, null, 2),
                  'application/json',
                )
              }
            >
              <Download size={15} />
              Export page data
            </button>
            <button onClick={() => setScraped(null)}>Close data</button>
          </div>
          <p>
            {scraped.url} · {scraped.counts.headings} headings · {scraped.counts.links} links ·{' '}
            {scraped.counts.images} images · {scraped.counts.controls} controls
          </p>
          {(scraped.truncated || scraped.scanLimited) && (
            <p role="status">
              This report reached a capture limit. Counts show the source totals; exported lists or
              text may be shortened.
            </p>
          )}
          <details open>
            <summary>Readable text</summary>
            <pre tabIndex={0}>{scraped.text}</pre>
          </details>
          <details>
            <summary>Headings &amp; links</summary>
            <ul>
              {scraped.headings.map((heading, index) => (
                <li key={index}>
                  H{heading.level} · {heading.text}
                </li>
              ))}
            </ul>
            <ul>
              {scraped.links.map((link, index) => (
                <li key={index}>
                  {link.text || 'Untitled link'}
                  <small>{link.url}</small>
                </li>
              ))}
            </ul>
          </details>
          <details>
            <summary>Controls</summary>
            <ul>
              {scraped.controls.map((control, index) => (
                <li key={index}>
                  {control.tag} {control.type} · {control.label || 'Unlabelled control'}{' '}
                  {control.disabled ? '(disabled)' : ''}
                </li>
              ))}
            </ul>
          </details>
          <p>
            Reads rendered DOM text and metadata. Input values and cookies are excluded. Canvas,
            closed shadow roots and cross-origin frame contents are not included.
          </p>
        </section>
      )}
    </div>
  );
}
