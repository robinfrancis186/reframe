import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { loadAppearance, setAppearance } from './appearance.js';
import AgentHelper from './AgentHelper';
const Connections = lazy(() => import('./Connections'));
import { sections, sectionFor } from './navigation.js';
import { helpActions } from './agent-help.js';
const ComponentLibrary = lazy(() => import('./ComponentLibrary'));
import { libraryItem, catalog } from './library/catalog';
import {
  Box,
  Home as HomeIcon,
  Sun,
  Moon,
  ImagePlus,
  Film,
  Camera,
  Braces,
  Wand2,
  Globe,
  LayoutGrid,
  Folder,
  Plus,
  Link,
  ArrowRight,
  Download,
  Check,
  Loader2,
  Undo2,
} from 'lucide-react';
const BrowserWorkspace = lazy(() => import('./BrowserWorkspace'));
import Home from './Home';
import Preview from './Preview';
import Clipboard from './Clipboard';
const CaptureDialog = lazy(() => import('./CaptureDialog'));
import ThemeEditor from './ThemeEditor';
const NativeCapture = lazy(() => import('./NativeCapture'));
const EngineTools = lazy(() => import('./EngineTools'));
const Projects = lazy(() => import('./Projects'));
const FeatureBuilder = lazy(() => import('./FeatureBuilder'));
const WorkingPreview = lazy(() => import('./WorkingPreview'));
import ComponentJourney from './ComponentJourney';
import { sameComponent, preferredCapture } from './component-workflow.js';
import './journey.css';
import { loadItem, summary, saveCaptured, waitForLibrarySave } from './storage';
import { useLibrary } from './useLibrary';
import ExtensionPairing from './ExtensionPairing';
import LibrarySync from './LibrarySync';

const Agents = lazy(() => import('./Agents'));
const AssetLibrary = lazy(() => import('./AssetLibrary'));
import { api, download, type ComponentItem, type Fidelity, type Theme } from './model';
import { useCaptureWorkflow } from './useCaptureWorkflow';
const CaptureEditor = lazy(() => import('./CaptureEditor'));
export default function App() {
  const [appearance, updateAppearance] = useState(loadAppearance);
  const {
    initial,
    library,
    setLibrary,
    deleted,
    setDeleted,
    persist: saveLibrary,
  } = useLibrary(notify, (text) => setError(text));
  const [theme, setTheme] = useState<Theme>(initial.theme);
  const [page, setPage] = useState('Home');
  const group = sectionFor(page);
  const [agentTestInvite, setAgentTestInvite] = useState(0);
  const [agentInvite, setAgentInvite] = useState<{ id: string; nonce: number } | null>(null);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(initial.error || '');
  const workflow = useCaptureWorkflow(theme, setError);
  const {
    setElements,
    active,
    setActive,
    setView,
    setFormat,
    setPicking,
    building,
    setBuilding,
    featureBuilder,
    workingPreview,
    setDragging,
    editor,
    code,
  } = workflow;
  useEffect(() => {
    const failed = (event: Event) => setError((event as CustomEvent<string>).detail);
    window.addEventListener('reframe-download-error', failed);
    window.addEventListener('reframe-storage-error', failed);
    return () => {
      window.removeEventListener('reframe-download-error', failed);
      window.removeEventListener('reframe-storage-error', failed);
    };
  }, []);
  const [capture, setCapture] = useState<string | null>(null);
  const [browserImage, setBrowserImage] = useState<{ image: string; source: string } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );
  function notify(text: string) {
    setMessage(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setMessage(''), 4500);
  }
  function persist(items: ComponentItem[], nextTheme = theme) {
    return saveLibrary(items, nextTheme);
  }
  function changeTheme(t: Theme) {
    if (persist(library, t)) setTheme(t);
  }
  async function open(item: ComponentItem) {
    try {
      item = await loadItem(item);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setActive(item);
    if (item.libraryId) {
      setFormat('react');
      setElements([item]);
    } else
      setElements((current) =>
        current.some((source) => source.id === item.id) ? current : [item],
      );
    if (item.theme) changeTheme(item.theme);
    setPage('Workbench');
    setView('preview');
    setPicking(false);
    setBuilding(false);
  }
  function captured(r: { items: ComponentItem[] }) {
    const selected = preferredCapture(r.items);
    if (!selected) {
      setError('No reusable elements were found. Try a smaller capture or another source.');
      return;
    }
    setElements(r.items);
    open(selected);
    setError('');
    notify(`${r.items.length} element${r.items.length === 1 ? '' : 's'} captured.`);
  }
  async function integrate(item: ComponentItem) {
    await open(item);
    setPage('Projects');
  }
  async function inspect(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      captured(await api('/api/capture', { url: target }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  /** Renames or re-tags a saved component in place. */
  function organise(
    id: string,
    patch: Pick<Partial<ComponentItem>, 'name' | 'tags' | 'collections'>,
  ) {
    const next = library.map((i) => (i.id === id ? { ...i, ...patch } : i));
    if (!persist(next)) return false;
    setLibrary(next.map(summary));
    if (active.id === id) setActive((current) => ({ ...current, ...patch }));
    return true;
  }
  function scored(fidelity: Fidelity) {
    const item = { ...active, fidelity };
    setActive(item);
    setElements((current) => current.map((element) => (element.id === item.id ? item : element)));
    if (library.some((i) => i.id === item.id)) {
      const next = library.map((i) => (i.id === item.id ? item : i));
      if (persist(next)) setLibrary(next);
    }
  }
  function save(candidate = active) {
    if (candidate.libraryId) setFormat('react');
    const item = {
      ...candidate,
      id: candidate.id.startsWith('starter-') ? crypto.randomUUID() : candidate.id,
      theme: { ...theme },
      capturedAt: new Date().toISOString(),
    };
    const next = library.some((i) => i.id === item.id)
      ? library.map((i) => (i.id === item.id ? item : i))
      : [item, ...library];
    if (persist(next)) {
      setLibrary(next.map(summary));
      setActive(item);
      setElements((current) =>
        current.some((source) => source.id === item.id) ? current : [item],
      );
      notify('Saving to your Library…');
      void waitForLibrarySave().then(
        () => notify('Saved on this computer.'),
        (error) => setError((error as Error).message),
      );
      return true;
    }
    return false;
  }
  async function saveBrowserItem(item: ComponentItem) {
    saveCaptured(item, theme);
    notify('Saving capture to your Library…');
    try {
      await waitForLibrarySave();
      notify('Capture saved on this computer.');
      return true;
    } catch (error) {
      setError((error as Error).message);
      return false;
    }
  }
  async function remove(id: string) {
    let item: ComponentItem;
    try {
      item = await loadItem(library.find((i) => i.id === id)!);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    const next = library.filter((i) => i.id !== id);
    if (persist(next)) {
      setLibrary(next.map(summary));
      setDeleted(item);
      notify('Component removed. You can undo this.');
    }
  }
  function restore() {
    if (!deleted) return;
    const next = [deleted, ...library];
    if (persist(next)) {
      setLibrary(next.map(summary));
      setDeleted(null);
      notify('Component restored.');
    }
  }
  function importItems(items: ComponentItem[]) {
    const next = [...items, ...library];
    if (persist(next)) {
      setLibrary(next.map(summary));
      notify(`${items.length} components imported.`);
      setPage('Clipboard');
      return true;
    }
    return false;
  }
  async function pick(html: string) {
    setPicking(false);
    try {
      const result = await api<{ items: ComponentItem[] }>('/api/capture', {
        html: `<section>${html}</section>`,
      });
      const item = {
        ...result.items[0],
        source: active.source,
        evidence: active.evidence,
        name: 'Picked element',
      };
      setElements((old) => [item, ...old]);
      setActive(item);
      notify('Element picked. Rename it and save to your Library.');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function applyEdit() {
    setBusy(true);
    setError('');
    try {
      const r = await api<{ items: ComponentItem[] }>('/api/capture', {
        html: `<section>${editor}</section>`,
      });
      setActive({
        ...active,
        html: r.items[0].html.replace(/^<section>|<\/section>$/g, ''),
        feature: undefined,
      });
      setView('preview');
      notify('HTML updated and sanitized.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      notify('Code copied.');
    } catch {
      setError('Clipboard permission is unavailable. Use Export to download the code.');
    }
  }
  function agentAction(action: string) {
    const target = helpActions[action as keyof typeof helpActions];
    if (action === 'test') {
      setAgentTestInvite(Date.now());
      setPage('Agents');
    } else if (action === 'build') {
      setBuilding(!active.libraryId);
      setPage('Workbench');
    } else if (target?.page) setPage(target.page);
  }
  return (
    <div
      className="app-shell"
      onDragStart={(e) => {
        if (e.dataTransfer.types.includes('application/x-reframe')) setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
    >
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setPage('Home');
          }}
        >
          <Braces size={30} strokeWidth={2} />
          <span>Reframe</span>
        </a>
        <nav aria-label="Main navigation">
          {sections.map((section, index) => {
            const Icon = [HomeIcon, LayoutGrid, Box, Folder, Wand2][index];
            const selected = section.name === group.name;
            return (
              <button
                key={section.name}
                aria-label={section.name}
                aria-current={selected ? 'page' : undefined}
                className={selected ? 'active' : ''}
                onClick={() => setPage(section.pages[0][0])}
              >
                <Icon size={19} />
                {section.name}
                {section.name === 'Library' && library.length > 0 && (
                  <span className="count">{library.length}</span>
                )}
              </button>
            );
          })}
        </nav>
        {library.length > 0 && (
          <div className="sidebar-recent">
            <h2>Recent components</h2>
            {library.slice(0, 3).map((item) => (
              <button key={item.id} onClick={() => open(item)}>
                <Box size={17} />
                <span>{item.name}</span>
              </button>
            ))}
          </div>
        )}

        <div className="workspace-label">
          <Folder size={18} />
          <span>
            Private workspace<small>Saved on this computer</small>
          </span>
        </div>
      </aside>
      <main className={page === 'Home' ? 'home-main' : 'ui-workspace'}>
        <header className="page-header">
          <h1>
            {page === 'Home' ? 'Workspace' : page === 'Connections' ? 'Connections' : group.name}
          </h1>
          <button
            className="appearance-toggle"
            aria-label={`Switch to ${appearance === 'dark' ? 'light' : 'dark'} mode`}
            onClick={() => {
              const next = appearance === 'dark' ? 'light' : 'dark';
              setAppearance(next);
              updateAppearance(next);
            }}
          >
            {appearance === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="primary" onClick={() => setCapture('image')}>
            <Plus size={18} />
            New capture
          </button>
        </header>
        {group.pages.length > 1 && (
          <nav className="section-views" aria-label={`${group.name} views`}>
            {group.pages.map(([id, label]) => (
              <button
                key={id}
                aria-current={page === id ? 'page' : undefined}
                onClick={() => setPage(id)}
              >
                {label}
              </button>
            ))}
          </nav>
        )}
        {page === 'Home' && (
          <Home
            recent={library[0]}
            theme={theme}
            url={url}
            busy={busy}
            error={error}
            onDismissError={() => setError('')}
            onUrl={setUrl}
            onInspect={inspect}
            onNavigate={setPage}
            onCapture={setCapture}
            onOpen={open}
          />
        )}
        {page === 'Browser' && (
          <Suspense fallback={<p role="status">Loading capture browser…</p>}>
            <BrowserWorkspace
              active={true}
              onCapture={captured}
              onSave={saveBrowserItem}
              onImport={importItems}
              onScreenshot={(image, source) => {
                setBrowserImage({ image, source });
                setCapture('image');
              }}
            />
          </Suspense>
        )}
        {page === 'Workbench' && active.id.startsWith('starter-') && (
          <>
            <div className="intro">
              <h2>Bring a good idea into your product.</h2>
              <p>Capture a reference. Keep the part you need. Make it fit.</p>
            </div>
            <div className="capture-strip">
              <form className="url-form" onSubmit={inspect}>
                <label>
                  <Link size={19} />
                  <input
                    aria-label="Website URL"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Paste a website URL"
                    required
                    type="text"
                  />
                </label>
                <button className="primary" disabled={busy || !url.trim()}>
                  {busy ? <Loader2 className="spin" size={17} /> : null}
                  {busy ? 'Inspecting…' : 'Capture website'}
                </button>
              </form>
              <div className="capture-shortcuts">
                <button onClick={() => setPage('Browser')}>
                  <Globe size={17} />
                  Browse & pick
                </button>
                {[
                  { id: 'image', label: 'Screenshot', icon: ImagePlus },
                  { id: 'video', label: 'Video', icon: Film },
                  { id: 'camera', label: 'Camera', icon: Camera },
                ].map((m) => (
                  <button key={m.id} onClick={() => setCapture(m.id)}>
                    <m.icon size={17} />
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        {error && page !== 'Home' && (
          <div role="alert" className="error-banner">
            {error}
            <button onClick={() => setError('')} aria-label="Dismiss error">
              Dismiss
            </button>
          </div>
        )}
        {page === 'Workbench' && (
          <>
            <ComponentJourney
              item={active}
              saved={sameComponent(
                library.find((item) => item.id === active.id),
                active,
                theme,
              )}
              onBuild={() => setBuilding(true)}
              onTest={() => {
                setView('preview');
                const el = active.feature
                  ? workingPreview.current
                  : document.querySelector<HTMLElement>('.preview-panel');
                el?.scrollIntoView({ block: 'start' });
                el?.focus();
              }}
              onSave={() => save()}
              onIntegrate={() => integrate(active)}
            />
            <Suspense fallback={<p role="status">Loading capture editor…</p>}>
              <CaptureEditor
                model={workflow}
                theme={theme}
                busy={busy}
                library={library}
                open={open}
                pick={pick}
                applyEdit={applyEdit}
                copy={copy}
                changeTheme={changeTheme}
                save={save}
                scored={scored}
                setPage={setPage}
                setError={setError}
              />
            </Suspense>
            {active.feature && !building && (
              <div ref={workingPreview} tabIndex={-1} aria-label="Test component behavior">
                <Suspense fallback={<p role="status">Loading working preview…</p>}>
                  <WorkingPreview
                    key={active.id + active.feature.builtAt}
                    item={active}
                    theme={theme}
                  />
                </Suspense>
              </div>
            )}
            {building && (
              <Suspense fallback={<p role="status">Loading behavior editor…</p>}>
                <div ref={featureBuilder} tabIndex={-1} aria-label="Define component behavior">
                  <FeatureBuilder
                    key={active.id + active.html}
                    item={active}
                    theme={theme}
                    onBuilt={(feature) => {
                      if (save({ ...active, feature })) {
                        setBuilding(false);
                        requestAnimationFrame(() => {
                          const next = document.querySelector<HTMLElement>('.component-journey');
                          next?.focus({ preventScroll: true });
                          next?.scrollIntoView({ block: 'start' });
                        });
                        notify('Saving frontend, backend and behavior to Library…');
                      }
                    }}
                  />
                </div>
              </Suspense>
            )}
            <Clipboard
              items={library.slice(0, 3)}
              onOpen={open}
              onDelete={remove}
              onIntegrate={integrate}
            />
            {library.length > 3 && (
              <button className="text-button all-components" onClick={() => setPage('Clipboard')}>
                View all {library.length} components
                <ArrowRight size={16} />
              </button>
            )}
          </>
        )}
        {page === 'Clipboard' && (
          <>
            <p className="library-guidance">Open to refine. Fit &amp; install to reuse.</p>
            <div className="library-status-row">
              <LibrarySync />
              <ExtensionPairing />
            </div>
            <Clipboard
              onCapture={() => setPage('Browser')}
              items={library}
              onOpen={open}
              onDelete={remove}
              onIntegrate={integrate}
              onOrganise={organise}
              full
            />
            {deleted && (
              <button className="undo-button" onClick={restore}>
                <Undo2 size={15} />
                Restore {deleted.name}
              </button>
            )}
          </>
        )}
        {page === 'Engines' && (
          <Suspense fallback={<p role="status">Loading EngineTools…</p>}>
            <EngineTools
              item={active}
              theme={theme}
              onApply={(html, feature) => {
                setActive({ ...active, html, feature });
                notify('Copy updated. Save to Library to keep it.');
              }}
            />
          </Suspense>
        )}
        {page === 'Connections' && (
          <Suspense fallback={<p role="status">Loading Connections…</p>}>
            <Connections active={active} onSave={save} onProjects={() => setPage('Projects')} />
          </Suspense>
        )}
        {page === 'Agents' && (
          <Suspense fallback={<p role="status">Loading Agents…</p>}>
            <Agents
              testInvite={agentTestInvite}
              onAction={agentAction}
              onTalk={(id) => setAgentInvite({ id, nonce: Date.now() })}
              item={active}
              library={library}
              theme={theme}
              onSave={save}
              onNavigate={setPage}
              onEdit={(item) => {
                setActive(item);
                setBuilding(true);
                setPage('Workbench');
              }}
            />
          </Suspense>
        )}
        {page === 'Native capture' && (
          <Suspense fallback={<p role="status">Loading NativeCapture…</p>}>
            <NativeCapture onCapture={captured} />
          </Suspense>
        )}
        {page === 'Projects' && (
          <Suspense fallback={<p role="status">Loading Projects…</p>}>
            <Projects
              active={active}
              items={library}
              theme={theme}
              onTheme={changeTheme}
              onSave={save}
            />
          </Suspense>
        )}
        {page === 'Assets' && (
          <>
            <div className="intro">
              <h2>Every font, color and icon, kept once.</h2>
              <p>Assets from your saved components, plus open fonts you can ship.</p>
            </div>
            <Suspense fallback={<p role="status">Loading assets…</p>}>
              <AssetLibrary items={library} theme={theme} onTheme={changeTheme} />
            </Suspense>
          </>
        )}
        {page === 'Component library' && (
          <Suspense fallback={<p role="status">Loading ComponentLibrary…</p>}>
            <ComponentLibrary
              theme={theme}
              onOpen={open}
              onSave={save}
              onProjects={() => setPage('Projects')}
            />
          </Suspense>
        )}
        {page === 'Project theme' && (
          <>
            <div className="intro">
              <h2>Make every piece feel at home.</h2>
              <p>Your colors, your type, your design language.</p>
            </div>
            <div className="theme-page">
              <section className="panel theme-editor">
                <h2>Your project tokens</h2>
                <ThemeEditor theme={theme} onChange={changeTheme} full />
                <button
                  onClick={() =>
                    download(
                      'reframe-brand.json',
                      JSON.stringify(theme, null, 2),
                      'application/json',
                    )
                  }
                >
                  Export brand kit
                </button>
                <button
                  onClick={() =>
                    download(
                      'reframe-tokens.css',
                      `:root {\n  --primary: ${theme.primary};\n  --background: ${theme.background};\n  --foreground: ${theme.text};\n  --radius: ${theme.radius}px;\n  --font: ${theme.font};\n}\n`,
                      'text/css',
                    )
                  }
                >
                  <Download size={15} />
                  Export tokens
                </button>
              </section>
              <section className="panel theme-preview">
                <div className="section-heading">
                  <h2>Live preview</h2>
                  <Check size={17} />
                </div>
                <div className="canvas">
                  <Preview
                    item={libraryItem(catalog.find((e) => e.id === 'brand')!)}
                    theme={theme}
                  />
                </div>
              </section>
            </div>
          </>
        )}
        <footer className="app-footer">
          <span>Built to be reused.</span>
          <span>Capture · Library · Project integration</span>
        </footer>
      </main>
      <AgentHelper
        page={page}
        item={active}
        invite={agentInvite}
        hidden={!!capture || busy}
        onAction={agentAction}
      />
      {capture && (
        <Suspense fallback={<p role="status">Loading capture…</p>}>
          <CaptureDialog
            initialTab={capture}
            initialImage={browserImage?.image}
            initialDescription={
              browserImage ? `Reconstruct the visible component from ${browserImage.source}.` : ''
            }
            onClose={() => {
              setCapture(null);
              setBrowserImage(null);
            }}
            onCapture={(r) =>
              captured(
                browserImage
                  ? {
                      ...r,
                      items: r.items.map((i) => ({
                        ...i,
                        source: browserImage.source,
                        referenceImage: browserImage.image,
                      })),
                    }
                  : r,
              )
            }
            onImport={importItems}
          />
        </Suspense>
      )}
      {message && (
        <div className="toast" role="status">
          <Check size={16} />
          {message}
          {deleted && <button onClick={restore}>Undo</button>}
        </div>
      )}
    </div>
  );
}
