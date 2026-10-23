import ReadyToReuse from './ReadyToReuse';
import BehaviorSummary from './BehaviorSummary';
import AgentAvatar from './AgentAvatar';
import BrandingDetector from './BrandingDetector';
import { useEffect, useRef, useState } from 'react';
import { FolderOpen, GripVertical, Undo2, ArrowRight } from 'lucide-react';
import { api, type ComponentItem, type Theme } from './model';
import Preview from './Preview';
import { loadItem } from './storage';
import ProjectSuggestions from './ProjectSuggestions';
import { componentReadiness, installationName } from './component-workflow.js';
import { readDestination, writeDestination } from './project-context.js';

interface Fit {
  decision: {
    model: string;
    status: string;
    label: string;
    reason: string;
    frontend: string;
    logic: string;
    backend: string;
  };
  bundleBytes?: number;
  themeTokens: Partial<Theme>;
  score: number;
  verdict: string;
  bytes: number;
  elements: number;
  cssFilesInspected: number;
  themeFilesInspected: number;
  limitation: string;
  recommendations: string[];
  categories: { name: string; score: number; weight: number; reason: string }[];
}
interface Project {
  id: string;
  name: string;
  root: string;
  demo?: boolean;
  files?: { path: string; framework: string }[];
}
interface Targets {
  framework: string;
  hash: string;
  points: {
    id: string;
    label: string;
    handlers: string[];
    dataSources?: { name: string; kind: string }[];
  }[];
}
interface Plan {
  id: string;
  file: string;
  before: string;
  after: string;
  warnings: string[];
  actions: { id: string; label: string; href: string | null }[];
  analysis: {
    reused?: boolean;
    status: string;
    engine?: string;
    evidenceId?: string;
    nodes?: number;
    files?: string[];
    limitation: string;
  };
  minimal: { addedDependencies: number; stateFields: number; actionCallbacks: number };
  framework: string;
  fullStack?: boolean;
  changes?: { file: string; before: string | null; after: string }[];
}
interface Change {
  id: string;
  projectId: string;
  file: string;
  name: string;
}
export default function Projects({
  active,
  items,
  theme,
  onTheme,
  onSave,
}: {
  active: ComponentItem;
  items: ComponentItem[];
  theme: Theme;
  onTheme: (t: Theme) => void;
  onSave: (item: ComponentItem) => boolean;
}) {
  const [remembered] = useState(readDestination);
  const [adaptBranding, setAdaptBranding] = useState(remembered.adaptBranding),
    [appearance, setAppearance] = useState(remembered.appearance);
  const drag = useRef<{ item: ComponentItem; x: number; y: number; moved: boolean } | null>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const destination = useRef<HTMLElement>(null);
  const review = useRef<HTMLElement>(null),
    receipt = useRef<HTMLElement>(null);
  const suppressClick = useRef(false);
  const [dragItem, setDragItem] = useState<ComponentItem | null>(null);
  const [fit, setFit] = useState<Fit | null>(null);
  const [fitError, setFitError] = useState('');
  const [fitBusy, setFitBusy] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [folder, setFolder] = useState('');
  const [file, setFile] = useState('');
  const [targets, setTargets] = useState<Targets | null>(null);
  const [point, setPoint] = useState('');
  const [component, setComponent] = useState(active);
  const [name, setName] = useState(() => installationName(active));
  const [handler, setHandler] = useState('');
  const [dataBinding, setDataBinding] = useState('');
  useEffect(() => {
    setDataBinding('');
    setHandler('');
    invalidate();
  }, [point, file, component.id]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [changes, setChanges] = useState<Change[]>([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [restored, setRestored] = useState(false),
    [contextError, setContextError] = useState('');
  const [demo, setDemo] = useState<{ projectId: string; url: string } | null>(null);
  async function launchDemo(projectId: string) {
    await task('Building and starting demo…', async () => {
      setDemo(null);
      setDemo(await api('/api/projects/demo/launch', { projectId }));
    });
  }
  const [installed, setInstalled] = useState<{
    projectId: string;
    demo: boolean;
    name: string;
    project: string;
    framework: string;
    fullStack: boolean;
    commerce: boolean;
  } | null>(null);
  useEffect(() => {
    if (plan) {
      review.current?.focus({ preventScroll: true });
      review.current?.scrollIntoView({
        block: 'start',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    }
  }, [plan]);
  useEffect(() => {
    if (installed) {
      receipt.current?.focus({ preventScroll: true });
      receipt.current?.scrollIntoView({
        block: 'start',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    }
  }, [installed]);
  async function task(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  async function refresh() {
    const [p, h] = await Promise.all([
      api<Project[]>('/api/projects'),
      api<Change[]>('/api/projects/history'),
    ]);
    setProjects(p);
    setChanges(h);
  }
  useEffect(() => {
    let cancelled = false;
    void task('Loading projects…', async () => {
      await refresh();
      setDemo(await api('/api/projects/demo'));
      if (remembered.id) {
        try {
          const previous = await api<Project>('/api/projects/inspect', { id: remembered.id });
          if (!cancelled) {
            setProject(previous);
            if (previous.files?.some((f) => f.path === remembered.file)) {
              setFile(remembered.file);
              setPoint(remembered.point);
            }
          }
        } catch {
          if (!cancelled)
            setContextError(
              'The previous destination is unavailable. Choose a connected project to continue.',
            );
        }
      }
      if (!cancelled) setRestored(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!restored) return;
    try {
      writeDestination({ id: project?.id || '', file, point, appearance, adaptBranding });
    } catch {
      setContextError(
        'This destination works for this visit, but browser storage could not remember it.',
      );
    }
  }, [restored, project?.id, file, point, appearance, adaptBranding]);
  useEffect(() => {
    if (!project || !file) return;
    const controller = new AbortController();
    setBusy('Reading insertion points…');
    fetch('/api/projects/targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: project.id, file }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data as Targets;
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setTargets(data);
          setPoint((current) =>
            data.points.some((p) => p.id === current)
              ? current
              : project.demo
                ? data.points.find((p) => p.label.startsWith('section'))?.id || ''
                : '',
          );
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy('');
      });
    return () => controller.abort();
  }, [project?.id, file]);
  useEffect(() => {
    invalidate();
  }, [theme, adaptBranding, appearance]);
  function invalidate() {
    setPlan(null);
    setAcknowledged(false);
  }
  function choose(p: Project) {
    setContextError('');
    setProject(p);
    setFile(p.demo ? 'src/App.tsx' : '');
    setTargets(null);
    setPoint('');
    setHandler('');
    invalidate();
  }
  async function pick(item: ComponentItem) {
    try {
      item = await loadItem(item);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setComponent(item);
    setName(installationName(item));
    invalidate();
  }
  function selectFile(f: string) {
    setFile(f);
    setTargets(null);
    setPoint('');
    setHandler('');
    invalidate();
  }
  const handlers = targets?.points.find((p) => p.id === point)?.handlers || [];
  useEffect(() => {
    setFit(null);
    setFitError('');
    setFitBusy(false);
    if (!project || !file || !point || !targets) return;
    const controller = new AbortController();
    setFitBusy(true);
    const timer = setTimeout(() => {
      fetch('/api/projects/fit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          projectId: project.id,
          file,
          pointId: point,
          hash: targets.hash,
          html: component.html,
          handler,
          dataBinding,
          feature: component.feature,
          libraryId: component.libraryId,
          theme,
          adaptBranding,
          appearance,
        }),
      })
        .then(async (r) => {
          const data = await r.json();
          if (!r.ok) throw new Error(data.error);
          return data;
        })
        .then((data) => {
          if (!controller.signal.aborted) setFit(data);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setFitError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setFitBusy(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    project,
    file,
    point,
    targets,
    component.html,
    component.feature,
    component.libraryId,
    theme,
    handler,
    dataBinding,
    adaptBranding,
    appearance,
  ]);
  return (
    <div className="projects-page">
      <div className="intro">
        <span className="eyebrow">
          {installed
            ? '3 · TRY IN YOUR APP'
            : plan
              ? '2 · REVIEW & INSTALL'
              : '1 · CHOOSE DESTINATION'}
        </span>
        <h2>
          {installed
            ? 'Installed. Try it in your app.'
            : plan
              ? 'Ready to install?'
              : 'Where should this component go?'}
        </h2>
        <p>
          {installed
            ? 'Test the actual behavior below.'
            : plan
              ? 'Check what changes before installing. You can undo an installation if the files have not changed.'
              : 'Start with the demo app, or connect your own project.'}
        </p>
      </div>
      {error && (
        <p role="alert" className="error-banner">
          <AgentAvatar id="relay" name="Relay" size={42} mood="error" />
          {error}
        </p>
      )}
      {(busy || message) && (
        <p role="status" className="integration-status">
          <AgentAvatar id="relay" name="Relay" size={42} mood={busy ? 'working' : 'success'} />
          {busy || message}
        </p>
      )}
      {contextError && (
        <p className="muted" role="status">
          {contextError}
        </p>
      )}
      {installed && (
        <section
          ref={receipt}
          tabIndex={-1}
          className="install-receipt"
          aria-label="Test installed component"
        >
          <h3>
            {installed.name} installed in {installed.project}
          </h3>
          <p>
            Source changes are applied. Runtime behavior still needs checking in the destination
            app.
          </p>
          {installed.demo && (
            <button
              className="primary"
              disabled={!!busy}
              onClick={() => void launchDemo(installed.projectId)}
            >
              {busy ? 'Starting demo…' : 'Launch demo app'}
            </button>
          )}
          {demo?.projectId === installed.projectId && (
            <iframe
              title="Installed demo app"
              className="installed-demo"
              src={demo.url}
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          )}
          {demo?.projectId === installed.projectId && (
            <p role="status">
              Demo is ready.{' '}
              <a href={demo.url} target="_blank" rel="noreferrer">
                Open demo app ↗
              </a>
              <button
                disabled={!!busy}
                onClick={() =>
                  void task('Stopping demo…', async () => {
                    await api('/api/projects/demo/stop', {});
                    setDemo(null);
                  })
                }
              >
                Stop demo
              </button>
            </p>
          )}
          <button
            disabled={!!busy}
            onClick={() => {
              setInstalled(null);
              if (project) choose(project);
            }}
          >
            Install another component
          </button>
          <ol>
            {!installed.demo && (
              <li>
                {installed.fullStack ? (
                  <>
                    Restart the destination with{' '}
                    <code>
                      {installed.framework === 'react'
                        ? 'npm run reframe:dev'
                        : 'npm run reframe:backend'}
                    </code>
                    .
                  </>
                ) : (
                  <>
                    Start the destination with its usual development command. If it already contains
                    Reframe APIs, keep using npm run reframe:dev so the backend starts too.
                  </>
                )}
              </li>
            )}
            <li>
              {installed.commerce
                ? 'Choose a variant, add it to the cart, change quantity and place a demo order.'
                : 'Try every action, including empty inputs, errors and account or API requirements.'}
            </li>
            <li>
              Reload to check saved state, then check the narrow layout and keyboard navigation.
            </li>
          </ol>
          <p className="muted">
            Check the actual behavior below before shipping. Installation and fit scores alone do
            not prove runtime correctness.
          </p>
        </section>
      )}
      <div hidden={!!plan || !!installed} className="installation-setup">
        <section className="panel connection-panel">
          <div className="section-heading">
            <h2>
              <FolderOpen size={18} /> Destination
            </h2>
            <select
              aria-label="Destination project"
              value={project?.id || ''}
              disabled={!!busy}
              onChange={(e) => {
                const id = e.target.value;
                if (!id) {
                  setProject(null);
                  selectFile('');
                } else
                  void task('Reading project…', async () =>
                    choose(await api('/api/projects/inspect', { id })),
                  );
              }}
            >
              <option value="">Choose a project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              disabled={!!busy}
              onClick={() =>
                void task('Connecting demo app…', async () => {
                  choose(await api('/api/projects/feature-starter', {}));
                  await refresh();
                })
              }
            >
              Use demo app
            </button>
            {project?.demo && !installed && (
              <button disabled={!!busy} onClick={() => void launchDemo(project.id)}>
                Launch demo app
              </button>
            )}
            {demo && project && demo.projectId === project.id && !installed && (
              <a href={demo.url} target="_blank" rel="noreferrer">
                Open demo app ↗
              </a>
            )}
            <details className="other-starters">
              <summary>Other starters</summary>
              {['ios', 'android'].map((platform) => (
                <button
                  key={platform}
                  disabled={!!busy}
                  onClick={() =>
                    void task('Connecting native app…', async () => {
                      choose(await api('/api/projects/native-starter', { platform }));
                      await refresh();
                    })
                  }
                >
                  Use {platform === 'ios' ? 'iOS' : 'Android'} app
                </button>
              ))}
              <button
                disabled={!!busy}
                onClick={() =>
                  void task('Connecting starter app…', async () => {
                    choose(await api('/api/projects/starter', {}));
                    await refresh();
                  })
                }
              >
                Use starter app
              </button>
            </details>
          </div>
          <details className="connect-details">
            <summary>Connect an existing project folder</summary>
            <form
              className="form-row"
              onSubmit={(e) => {
                e.preventDefault();
                void task('Connecting project…', async () => {
                  choose(await api('/api/projects/connect', { path: folder }));
                  await refresh();
                });
              }}
            >
              <label>
                Existing app folder
                <input
                  placeholder="/Users/you/Projects/my-app"
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                  required
                />
              </label>
              <button disabled={!!busy || !folder}>Connect project</button>
            </form>
            <p className="muted">
              React / Next.js, React Native / Expo, SwiftUI, and Jetpack Compose. Files stay on this
              computer. Starter preview:{' '}
              <a href="http://localhost:5174" target="_blank" rel="noreferrer">
                localhost:5174
              </a>{' '}
              (start with <code>npm run demo</code> from the Reframe folder). The full-stack demo
              uses <code>npm run reframe:dev</code> from its own folder on port 5175. Existing demo
              data is kept.
            </p>
          </details>
        </section>
        {project && (
          <details className="panel project-branding">
            <summary>Project branding · detect colors, type and identity</summary>
            <BrandingDetector
              projectId={project.id}
              theme={theme}
              onChange={onTheme}
              onAutomaticChange={setAdaptBranding}
              onAppearanceChange={setAppearance}
              initialMode={appearance}
              initialAutomatic={adaptBranding}
            />
          </details>
        )}
        <details className="panel installation-suggestions">
          <summary>Find a different component for this project</summary>
          <ProjectSuggestions
            key={project?.id || 'none'}
            projectId={project?.id || ''}
            file={file}
            version={targets?.hash}
            items={items}
            appearance={appearance}
            selectedId={component.id}
            disabled={!!busy}
            onSave={onSave}
            onPick={(item) => {
              pick(item);
              destination.current?.focus({ preventScroll: true });
              destination.current?.scrollIntoView({
                block: 'start',
                behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                  ? 'instant'
                  : 'smooth',
              });
            }}
          />
        </details>
        {dragItem && (
          <div ref={ghost} className="integration-drag-preview" role="status">
            {dragItem.name} · drop onto the destination
          </div>
        )}
        <div className="integration-grid">
          <details className="panel integration-library">
            <summary>Choose another Library component</summary>
            <p className="muted">Drag a saved item onto the destination, or select it here.</p>
            {[active, ...items.filter((i) => i.id !== active.id)].map((item) => (
              <button
                key={item.id}
                draggable={false}
                disabled={!!busy}
                onPointerDown={(event) => {
                  if (
                    busy ||
                    event.button !== 0 ||
                    !(event.target as Element).closest('[data-drag-handle]')
                  )
                    return;
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  drag.current = { item, x: event.clientX, y: event.clientY, moved: false };
                }}
                onPointerMove={(event) => {
                  const current = drag.current;
                  if (!current) return;
                  if (
                    !current.moved &&
                    Math.hypot(event.clientX - current.x, event.clientY - current.y) > 8
                  ) {
                    current.moved = true;
                    setDragItem(current.item);
                  }
                  if (ghost.current)
                    ghost.current.style.transform = `translate(${event.clientX + 14}px,${event.clientY + 14}px)`;
                }}
                onPointerUp={(event) => {
                  const current = drag.current;
                  drag.current = null;
                  setDragItem(null);
                  if (!current?.moved) return;
                  suppressClick.current = true;
                  setTimeout(() => {
                    suppressClick.current = false;
                  }, 0);
                  if (
                    document
                      .elementFromPoint(event.clientX, event.clientY)
                      ?.closest('.integration-destination')
                  )
                    pick(current.item);
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={() => {
                  drag.current = null;
                  setDragItem(null);
                }}
                onClick={() => {
                  if (!suppressClick.current) pick(item);
                }}
                className={'integration-item ' + (component.id === item.id ? 'selected' : '')}
                aria-pressed={component.id === item.id}
              >
                <span data-drag-handle title="Drag this component">
                  <GripVertical size={17} />
                </span>
                <span>
                  <strong>{item.name}</strong>
                  <small>{componentReadiness(item).label}</small>
                </span>
              </button>
            ))}
          </details>
          <section
            className="panel integration-destination"
            ref={destination}
            tabIndex={-1}
            aria-label="Destination component"
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('application/x-reframe')) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (busy) return;
              const id = e.dataTransfer.getData('application/x-reframe');
              const item = [active, ...items].find((i) => i.id === id);
              if (item) pick(item);
            }}
          >
            <div className="section-heading">
              <h2>Component placement</h2>
              <span className="muted">{project?.demo ? 'Demo app ready' : 'Drop here'}</span>
            </div>
            <div className="selected-block">
              <span>
                <strong>{component.name}</strong>
                <small>{component.source}</small>
              </span>
              <ArrowRight size={18} />
              <strong>{project?.name || 'Choose a project'}</strong>
            </div>
            <div className="integration-preview">
              <Preview item={component} theme={theme} mini />
            </div>
            <p className="preview-caption">
              {componentReadiness(component).preview}{' '}
              {component.feature?.spec.website
                ? 'Original reference styling is preserved; destination colors do not recolor this package.'
                : fit && Object.keys(fit.themeTokens).length
                  ? 'Detected color tokens applied. Layout and typography are illustrative.'
                  : ''}
            </p>
            {project && (
              <div className="destination-fields">
                {project.demo && (
                  <p>
                    We’ll add <strong>{component.name}</strong> to the demo’s main screen. No
                    folder, code or terminal needed.
                  </p>
                )}
                <details key={project.id} open={!project.demo} className="placement-settings">
                  <summary>Placement & code settings</summary>
                  <label>
                    Screen file
                    <select
                      aria-label="Screen file"
                      value={file}
                      disabled={!!busy}
                      onChange={(e) => void selectFile(e.target.value)}
                    >
                      <option value="">Choose a screen…</option>
                      {project.files?.map((f) => (
                        <option key={f.path} value={f.path}>
                          {f.path} · {f.framework}
                        </option>
                      ))}
                    </select>
                  </label>
                  {targets && (
                    <>
                      <label>
                        Insert inside
                        <select
                          aria-label="Insert inside"
                          disabled={!!busy}
                          value={point}
                          onChange={(e) => {
                            setPoint(e.target.value);
                            setHandler('');
                            invalidate();
                          }}
                        >
                          <option value="">Choose a container…</option>
                          {targets.points.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {!targets.points.length && (
                        <p>
                          No supported container found. Use a normal view container such as a div,
                          VStack or Column in this screen.
                        </p>
                      )}
                      <label>
                        Component name
                        <input
                          value={name}
                          disabled={!!busy}
                          pattern="Reframe[A-Za-z0-9]{1,60}"
                          maxLength={67}
                          onChange={(e) => {
                            setName(e.target.value);
                            invalidate();
                          }}
                        />
                      </label>
                      {targets.framework === 'react' &&
                        ['search', 'be-table'].includes(component.libraryId || '') && (
                          <label>
                            Use project data
                            <select
                              aria-label="Use project data"
                              value={dataBinding}
                              onChange={(e) => {
                                setDataBinding(e.target.value);
                                invalidate();
                              }}
                            >
                              <option value="">Sample data (replace before release)</option>
                              {(targets.points.find((p) => p.id === point)?.dataSources || [])
                                .filter(
                                  (d) =>
                                    d.kind ===
                                    (component.libraryId === 'search' ? 'items' : 'rows'),
                                )
                                .map((d) => (
                                  <option key={d.name} value={d.name}>
                                    {d.name} · existing project state
                                  </option>
                                ))}
                            </select>
                            <small>
                              Uses an existing array in this container’s scope. Updates from your
                              app flow into this component. Other data sources can be passed through
                              the exported props.
                            </small>
                          </label>
                        )}
                      {handlers.length > 0 &&
                        !component.feature &&
                        (!component.libraryId || component.libraryId === 'search') && (
                          <label>
                            Connect actions to existing handler
                            <select
                              aria-label="Connect actions to existing handler"
                              disabled={!!busy}
                              value={handler}
                              onChange={(e) => {
                                setHandler(e.target.value);
                                invalidate();
                              }}
                            >
                              <option value="">
                                {component.libraryId === 'search'
                                  ? 'Selection state only'
                                  : 'Log action IDs for now'}
                              </option>
                              {handlers.map((h) => (
                                <option key={h}>{h}</option>
                              ))}
                            </select>
                            <small>
                              {component.libraryId === 'search'
                                ? 'Called with the selected project item.'
                                : 'Called with the action ID string shown in the change preview.'}
                            </small>
                          </label>
                        )}
                      <p className="muted">
                        {targets.framework === 'swiftui'
                          ? 'Uses SwiftUI semantic fonts and the app accent color.'
                          : targets.framework === 'compose'
                            ? 'Uses the enclosing MaterialTheme colors and typography.'
                            : targets.framework === 'react-native'
                              ? 'Uses your selected project colors; theme prop remains editable.'
                              : component.feature?.spec.website
                                ? 'Keeps the original styling inside an isolated document.'
                                : 'Inherits the screen typography and CSS color tokens.'}
                      </p>
                    </>
                  )}
                </details>
                {targets && (
                  <button
                    className="primary"
                    disabled={
                      !!busy ||
                      !point ||
                      fit?.decision.status === 'blocked' ||
                      !/^Reframe[A-Za-z0-9]{1,60}$/.test(name)
                    }
                    onClick={() =>
                      void task('Preparing source change…', async () => {
                        setAcknowledged(false);
                        setPlan(
                          await api('/api/projects/plan', {
                            projectId: project.id,
                            file,
                            pointId: point,
                            hash: targets.hash,
                            html: component.html,
                            feature: component.feature,
                            libraryId: component.libraryId,
                            adaptBranding,
                            appearance,
                            name,
                            handler,
                            dataBinding,
                            theme,
                          }),
                        );
                      })
                    }
                  >
                    Review installation
                  </button>
                )}
              </div>
            )}
          </section>
          <aside className="panel fit-panel" aria-live="polite">
            <h2>Project fit</h2>
            {fitBusy ? (
              <p>Inspecting your destination…</p>
            ) : fit ? (
              <>
                <div className="fit-score">
                  <strong>{fit.score}</strong>
                  <span>/ 100</span>
                </div>
                <h3>{fit.verdict}</h3>
                <p className="muted">Source-based compatibility estimate</p>
                <div className="fit-categories">
                  {fit.categories.map((c) => (
                    <div className="fit-category" key={c.name}>
                      <details>
                        <summary>
                          <span>{c.name}</span>
                          <strong>
                            {c.score}
                            <small>/100</small>
                          </strong>
                        </summary>
                        <p>{c.reason}</p>
                        <small>{c.weight}% of overall score</small>
                      </details>
                      <meter min="0" max="100" value={c.score} aria-label={`${c.name} score`} />
                    </div>
                  ))}
                </div>
                <div className="fit-size">
                  <strong>{(fit.bytes / 1024).toFixed(1)} KB</strong>
                  <span>
                    generated frontend · {fit.elements} elements
                    {fit.bundleBytes
                      ? ` · ${(fit.bundleBytes / 1024).toFixed(1)} KB complete package`
                      : ''}
                  </span>
                </div>
                <div className="fit-next">
                  <small>{fit.decision.model} · built-in decision</small>
                  <h3>{fit.decision.label}</h3>
                  <p>{fit.decision.reason}</p>
                  <details>
                    <summary>What is actually reconstructed?</summary>
                    <p>
                      <strong>Frontend:</strong> {fit.decision.frontend}
                    </p>
                    <p>
                      <strong>Logic:</strong> {fit.decision.logic}
                    </p>
                    <p>
                      <strong>Backend:</strong> {fit.decision.backend}
                    </p>
                  </details>
                </div>
                {fit.recommendations.length > 0 && (
                  <div className="fit-next">
                    <h3>Before you integrate</h3>
                    <ul>
                      {fit.recommendations.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="muted">
                  {fit.limitation} {fit.themeFilesInspected} branding files inspected.
                </p>
              </>
            ) : (
              <div className="fit-empty">
                <ArrowRight size={24} />
                <h3>Find the right fit</h3>
                <p>
                  Select a project, screen and container to calculate compatibility. Connect an
                  action handler to improve wiring.
                </p>
              </div>
            )}
            {fitError && (
              <p role="alert" className="error">
                {fitError}
              </p>
            )}
          </aside>
        </div>
      </div>
      {plan && (
        <section
          ref={review}
          tabIndex={-1}
          aria-label="Review installation"
          className="panel integration-review"
        >
          <div className="section-heading">
            <h2>
              {component.name} → {project?.name}
            </h2>
            <button disabled={!!busy} onClick={invalidate}>
              Back to placement
            </button>
          </div>
          <dl className="install-summary">
            <div>
              <dt>Where</dt>
              <dd>{plan.file}</dd>
            </div>
            <div>
              <dt>Files</dt>
              <dd>
                {plan.changes
                  ? `${plan.changes.filter((c) => c.before === null).length} new · ${plan.changes.filter((c) => c.before !== null).length} updated`
                  : '1 updated'}
              </dd>
            </div>
            <div>
              <dt>Includes</dt>
              <dd>
                {plan.fullStack
                  ? 'Interface, backend and local storage'
                  : 'Interface and declared interactions'}
              </dd>
            </div>
            <div>
              <dt>New dependencies</dt>
              <dd>{plan.minimal.addedDependencies}</dd>
            </div>
          </dl>
          <ReadyToReuse key={component.id} item={component} />
          {component.feature && !component.feature.spec.website && (
            <BehaviorSummary spec={component.feature.spec} />
          )}
          {plan.fullStack && (
            <p>
              {project?.demo
                ? 'After installation, launch the demo here. No terminal needed. Preview test records are not copied.'
                : `Start the destination with ${plan.framework === 'react' ? 'npm run reframe:dev' : 'npm run reframe:backend and your native build tools'}. Preview test records are not copied.`}
            </p>
          )}
          {plan.warnings.length > 0 && (
            <div className="install-warnings">
              <strong>Before installing</strong>
              <ul>
                {plan.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <details className="installation-source">
            <summary>Inspect source changes & analysis</summary>
            {plan.actions.length > 0 && (
              <div>
                <h3>Action contract</h3>
                {plan.actions.map((a) => (
                  <p key={a.id}>
                    <strong>
                      {a.id} → {a.label}
                    </strong>
                    {a.href && (
                      <>
                        <br />
                        <small>Original destination: {a.href}</small>
                      </>
                    )}
                  </p>
                ))}
              </div>
            )}
            <p>
              <strong>Minimal generation:</strong> {plan.minimal.addedDependencies} added
              dependencies · {plan.minimal.stateFields} input states ·{' '}
              {plan.minimal.actionCallbacks} action callbacks.
            </p>
            <details>
              <summary>
                {plan.analysis.engine || 'REA'} ·{' '}
                {plan.analysis.status === 'analyzed'
                  ? 'Source analyzed'
                  : plan.analysis.status === 'failed'
                    ? 'Analysis unavailable'
                    : 'Native analyzer not included'}
              </summary>
              {plan.analysis.reused && (
                <p>
                  Reused verified evidence for identical source. Edited source is analyzed again.
                </p>
              )}
              <p>{plan.analysis.limitation}</p>
              {plan.analysis.files && <p>Files checked: {plan.analysis.files.join(', ')}</p>}
              {plan.analysis.evidenceId && (
                <p>
                  {plan.analysis.nodes} graph nodes · Evidence:{' '}
                  <code>{plan.analysis.evidenceId}</code>
                </p>
              )}
            </details>
            {plan.changes ? (
              <div className="source-comparison">
                {plan.changes.map((change) => (
                  <details key={change.file}>
                    <summary>
                      {change.file} · {change.before === null ? 'New file' : 'Modified'}
                    </summary>
                    <h3>Before</h3>
                    <pre tabIndex={0}>{change.before ?? '(new file)'}</pre>
                    <h3>After</h3>
                    <pre tabIndex={0}>{change.after}</pre>
                  </details>
                ))}
              </div>
            ) : (
              <div className="source-comparison">
                <details>
                  <summary>Before</summary>
                  <pre tabIndex={0}>{plan.before}</pre>
                </details>
                <details open>
                  <summary>After</summary>
                  <pre tabIndex={0}>{plan.after}</pre>
                </details>
              </div>
            )}
          </details>
          <label className="acknowledge">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            Allow these files to be added or updated in {project?.name}.
          </label>
          <button
            className="primary"
            disabled={!!busy || !acknowledged}
            onClick={() =>
              void task('Applying integration…', async () => {
                if (!project) return;
                const receipt = {
                  projectId: project.id,
                  demo: !!project.demo,
                  name: component.name,
                  project: project?.name || '',
                  framework: plan.framework,
                  fullStack: !!plan.fullStack,
                  commerce: !!component.feature?.spec.commerce,
                };
                const r = await api<{ message: string }>('/api/projects/apply', { id: plan.id });
                invalidate();
                setTargets(null);
                setPoint('');
                setFile('');
                await refresh();
                setInstalled(receipt);
                setMessage(r.message);
              })
            }
          >
            {busy ? 'Installing…' : 'Install component'}
          </button>
        </section>
      )}
      {changes.length > 0 && (
        <details className="panel integration-history">
          <summary>Applied changes · {changes.length} · undo history</summary>
          <p className="muted">
            Undo restores the original screen only if no later edits would be lost.
          </p>
          {changes.map((c) => (
            <div key={c.id}>
              <span>
                <strong>{c.name}</strong>
                <small>
                  {projects.find((p) => p.id === c.projectId)?.name} / {c.file}
                </small>
              </span>
              <button
                disabled={!!busy}
                onClick={() =>
                  void task('Restoring screen…', async () => {
                    const r = await api<{ message: string }>('/api/projects/undo', { id: c.id });
                    invalidate();
                    setInstalled(null);
                    setTargets(null);
                    setFile('');
                    await refresh();
                    setMessage(r.message);
                  })
                }
              >
                <Undo2 size={15} />
                Undo integration
              </button>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
