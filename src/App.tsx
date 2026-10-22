import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { loadAppearance, setAppearance } from './appearance.js';
import AgentHelper from './AgentHelper';
const Connections=lazy(()=>import('./Connections'));
import { sections, sectionFor } from './navigation.js';
import { helpActions } from './agent-help.js';
const ComponentLibrary=lazy(()=>import('./ComponentLibrary'));
import { libraryItem, catalog } from "./library/catalog";
import {
  Box, Home as HomeIcon, Plug, Sun, Moon,
  ImagePlus, Film, Camera, Braces, Wand2, Globe,
  LayoutGrid,
  Clipboard as ClipboardIcon,
  Folder,
  Plus,
  Link,
  ArrowRight,
  Monitor,
  Smartphone,
  Code2,
  Copy,
  Download,
  MousePointer2,
  Check,
  Loader2,
  Undo2,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import BrowserWorkspace from "./BrowserWorkspace";
import Home from "./Home";
import Preview from "./Preview";
import Clipboard from "./Clipboard";
import CaptureDialog from "./CaptureDialog";
import ThemeEditor from "./ThemeEditor";
const NativeCapture=lazy(()=>import('./NativeCapture'));
const EngineTools=lazy(()=>import('./EngineTools'));
const Projects=lazy(()=>import('./Projects'));
const FeatureBuilder=lazy(()=>import('./FeatureBuilder'));
const WorkingPreview=lazy(()=>import('./WorkingPreview'));
import ComponentJourney from './ComponentJourney';
import { componentReadiness, sameComponent, preferredCapture } from './component-workflow.js';
import './journey.css';
import { readWorkspace, writeWorkspace } from './storage';
const Agents=lazy(()=>import('./Agents'));
import {
  api,
  download,
  isItem,
  isTheme,
  slug,
  starters,
  themes,
  type ComponentItem,
  type Theme,
} from "./model";
import { documentHtml, reactCode } from "./export";
interface Workspace {
  items: ComponentItem[];
  theme: Theme;
  error?: string;
}
function loadWorkspace(): Workspace {
  try {
    const raw = readWorkspace();
    if (!raw) return { items: [], theme: themes[0] };
    const state = JSON.parse(raw);
    if (
      !Array.isArray(state.items) ||
      !state.items.every(isItem) ||
      !isTheme(state.theme)
    )
      throw new Error();
    return state;
  } catch {
    return {
      items: [],
      theme: themes[0],
      error:
        "Saved workspace could not be read. It has not been overwritten. Export a backup or clear the saved data manually before saving again.",
    };
  }
}
export default function App() {
  const [appearance, updateAppearance] = useState(loadAppearance);
  const [initial] = useState(loadWorkspace);
  const [library, setLibrary] = useState<ComponentItem[]>(initial.items);
  const [theme, setTheme] = useState<Theme>(initial.theme);
  const [page, setPage] = useState("Home");
  const group=sectionFor(page);
  const [agentTestInvite,setAgentTestInvite]=useState(0);
  const [agentInvite,setAgentInvite]=useState<{id:string;nonce:number}|null>(null);
  useEffect(() => { window.scrollTo(0, 0); }, [page]);
  const [elements, setElements] = useState(starters);
  const [active, setActive] = useState(starters[0]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(initial.error || "");
  useEffect(()=>{const failed=(event:Event)=>setError((event as CustomEvent<string>).detail);window.addEventListener('reframe-download-error',failed);window.addEventListener('reframe-storage-error',failed);return()=>{window.removeEventListener('reframe-download-error',failed);window.removeEventListener('reframe-storage-error',failed);};},[]);
  const [capture, setCapture] = useState<string | null>(null);
  const [browserImage, setBrowserImage] = useState<{ image: string; source: string } | null>(null);
  const [mobile, setMobile] = useState(false);
  const [view, setView] = useState("preview");
  const [format, setFormat] = useState("html");
  const [picking, setPicking] = useState(false);
  const [building, setBuilding] = useState(false);
  const featureBuilder=useRef<HTMLDivElement>(null),workingPreview=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(building){featureBuilder.current?.focus({preventScroll:true});featureBuilder.current?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}},[building]);
  const [dragging, setDragging] = useState(false);
  const [editor, setEditor] = useState("");
  const [quality, setQuality] = useState<{
    bytes: number;
    elements: number;
    issues: string[];
  } | null>(null);
  const [deleted, setDeleted] = useState<ComponentItem | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [originalSource, setOriginalSource] = useState({ key:'', code:'' });
  const sourceKey = JSON.stringify([active.libraryId, theme, format]);
  useEffect(() => {
    if (!active.libraryId) return;
    const controller = new AbortController();
    fetch('/api/library/source', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:active.libraryId,name:'ReframeOriginal',theme,framework:format==='swiftui'||format==='compose'?format:'react'}),signal:controller.signal })
      .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); return data; })
      .then(data => { if (!controller.signal.aborted) setOriginalSource({key:sourceKey,code:data.imports.join('\n') + '\n' + data.code}); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [sourceKey]);
  const code = active.libraryId ? originalSource.key === sourceKey ? originalSource.code : '' : format === "react" ? reactCode(active, theme) : documentHtml(active, theme);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/quality", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: active.html }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then(setQuality)
      .catch(() => {});
    return () => controller.abort();
  }, [active.html]);
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );
  function notify(text: string) {
    setMessage(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setMessage(""), 4500);
  }
  function persist(items: ComponentItem[], nextTheme = theme) {
    if (initial.error) {
      setError(initial.error);
      return false;
    }
    try {
      writeWorkspace(
        JSON.stringify({ version: 1, items, theme: nextTheme },function(key,value){if(key==='files'&&this.spec?.website)return {...value,'feature.json':JSON.stringify({...this.spec,website:'Recompiled from spec.website when installed.'})};return value;}),
      );
      return true;
    } catch {
      setError(
        "Your browser storage is full or unavailable. Download a backup before making more changes.",
      );
      return false;
    }
  }
  function changeTheme(t: Theme) {
    if (persist(library, t)) setTheme(t);
  }
  function open(item: ComponentItem) {
    setActive(item);
    if (item.libraryId) { setFormat("react"); setElements([item]); }
    else setElements(current=>current.some(source=>source.id===item.id)?current:[item]);
    if (item.theme) changeTheme(item.theme);
    setPage("Workbench");
    setView("preview");
    setPicking(false);
    setBuilding(false);
  }
  function captured(r: { items: ComponentItem[] }) {
    const selected=preferredCapture(r.items);
    if(!selected){setError('No reusable elements were found. Try a smaller capture or another source.');return;}
    setElements(r.items);
    open(selected);
    setError("");
    notify(
      `${r.items.length} element${r.items.length === 1 ? "" : "s"} captured.`,
    );
  }
  function integrate(item: ComponentItem) {
    open(item);
    setPage('Projects');
  }
  async function inspect(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      captured(await api("/api/capture", { url: target }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function save(candidate = active) {
    if (candidate.libraryId) setFormat("react");
    const item = {
      ...candidate,
      id: candidate.id.startsWith("starter-") ? crypto.randomUUID() : candidate.id,
      theme: { ...theme },
      capturedAt: new Date().toISOString(),
    };
    const next = library.some((i) => i.id === item.id)
      ? library.map((i) => (i.id === item.id ? item : i))
      : [item, ...library];
    if (persist(next)) {
      setLibrary(next);
      setActive(item);
      setElements(current=>current.some(source=>source.id===item.id)?current:[item]);
      notify("Saved to your clipboard.");
      return true;
    }
    return false;
  }
  function saveBrowserItem(item: ComponentItem) {
    const existing = library.find(i => i.html === item.html && i.source === item.source);
    const saved = { ...item, id: existing?.id || item.id, theme: { ...theme } };
    const next = existing ? library.map(i => i.id === existing.id ? saved : i) : [saved, ...library];
    if (!persist(next)) return false;
    setLibrary(next); notify('Saved reference and component to clipboard.'); return true;
  }
  function remove(id: string) {
    const item = library.find((i) => i.id === id)!;
    const next = library.filter((i) => i.id !== id);
    if (persist(next)) {
      setLibrary(next);
      setDeleted(item);
      notify("Component removed. You can undo this.");
    }
  }
  function restore() {
    if (!deleted) return;
    const next = [deleted, ...library];
    if (persist(next)) {
      setLibrary(next);
      setDeleted(null);
      notify("Component restored.");
    }
  }
  function importItems(items: ComponentItem[]) {
    const next = [...items, ...library];
    if (persist(next)) {
      setLibrary(next);
      notify(`${items.length} components imported.`);
      setPage("Clipboard");
      return true;
    }
    return false;
  }
  async function pick(html: string) {
    setPicking(false);
    try {
      const result = await api<{ items: ComponentItem[] }>("/api/capture", {
        html: `<section>${html}</section>`,
      });
      const item = {
        ...result.items[0],
        source: active.source,
        evidence: active.evidence,
        name: "Picked element",
      };
      setElements((old) => [item, ...old]);
      setActive(item);
      notify("Element picked. Rename it and save to your clipboard.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function applyEdit() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ items: ComponentItem[] }>("/api/capture", {
        html: `<section>${editor}</section>`,
      });
      setActive({
        ...active,
        html: r.items[0].html.replace(/^<section>|<\/section>$/g, ""),
        feature: undefined,
      });
      setView("preview");
      notify("HTML updated and sanitized.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      notify("Code copied.");
    } catch {
      setError(
        "Clipboard permission is unavailable. Use Export to download the code.",
      );
    }
  }
  function agentAction(action:string){
    const target=helpActions[action as keyof typeof helpActions];
    if(action==='test'){setAgentTestInvite(Date.now());setPage('Agents');}
    else if(action==='build'){setBuilding(!active.libraryId);setPage('Workbench');}
    else if(target?.page)setPage(target.page);
  }
  return (
    <div
      className="app-shell"
      onDragStart={(e) => {
        if (e.dataTransfer.types.includes("application/x-reframe"))
          setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
    >
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setPage("Home");
          }}
        >
          <Braces size={30} strokeWidth={2} />
          <span>Reframe</span>
        </a>
        <nav aria-label="Main navigation">
          {sections.map((section,index)=>{
            const Icon=[HomeIcon,LayoutGrid,Box,Folder,Wand2][index];
            const selected=section.name===group.name;
            return <button key={section.name} aria-current={selected?'page':undefined} className={selected?'active':''} onClick={()=>setPage(section.pages[0][0])}><Icon size={19}/>{section.name}{section.name==='Library'&&library.length>0&&<span className="count">{library.length}</span>}</button>;
          })}
        </nav>
        {library.length > 0 && <div className="sidebar-recent"><h2>Recent components</h2>{library.slice(0, 3).map(item => <button key={item.id} onClick={() => open(item)}><Box size={17}/><span>{item.name}</span></button>)}</div>}
        <button className={`sidebar-connection ${page==='Connections'?'active':''}`} onClick={()=>setPage('Connections')}><Plug size={18}/>Connections</button>
        <div className="workspace-label">
          <Folder size={18} />
          <span>
            Private workspace<small>Saved on this computer</small>
          </span>
        </div>
      </aside>
      <main className={page === 'Home' ? 'home-main' : 'ui-workspace'}>
        <header className="page-header">
          <h1>{page==='Home'?'Workspace':page==='Connections'?'Connections':group.name}</h1>
          <button className="appearance-toggle" aria-label={`Switch to ${appearance==='dark'?'light':'dark'} mode`} onClick={()=>{const next=appearance==='dark'?'light':'dark';setAppearance(next);updateAppearance(next);}}>{appearance==='dark'?<Sun size={18}/>:<Moon size={18}/>}</button>
          <button className="primary" onClick={() => setCapture("image")}>
            <Plus size={18} />
            New capture
          </button>
        </header>
        {group.pages.length>1&&<nav className="section-views" aria-label={`${group.name} views`}>{group.pages.map(([id,label])=><button key={id} aria-current={page===id?'page':undefined} onClick={()=>setPage(id)}>{label}</button>)}</nav>}
        {page === 'Home' && <Home recent={library[0]} theme={theme} url={url} busy={busy} error={error} onDismissError={() => setError('')} onUrl={setUrl} onInspect={inspect} onNavigate={setPage} onCapture={setCapture} onOpen={open}/>}
        <BrowserWorkspace active={page === 'Browser'} onCapture={captured} onSave={saveBrowserItem} onImport={importItems} onScreenshot={(image, source) => { setBrowserImage({ image, source }); setCapture('image'); }}/>
        {page === "Workbench" && (
          <>
            <div className="intro">
              <h2>Bring a good idea into your product.</h2>
              <p>Capture a reference. Keep the part you need. Make it fit.</p>
            </div>
            <div className="capture-strip"><form className="url-form" onSubmit={inspect}>
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
                {busy ? "Inspecting…" : "Capture website"}
              </button>
            </form>
            <div className="capture-shortcuts"><button onClick={() => setPage("Browser")}><Globe size={17}/>Browse & pick</button>{[{id: 'image', label: 'Screenshot', icon: ImagePlus}, {id: 'video', label: 'Video', icon: Film}, {id: 'camera', label: 'Camera', icon: Camera}].map(m => <button key={m.id} onClick={() => setCapture(m.id)}><m.icon size={17}/>{m.label}</button>)}</div></div>
          </>
        )}
        {error && page !== 'Home' && (
          <div role="alert" className="error-banner">
            {error}
            <button onClick={() => setError("")} aria-label="Dismiss error">
              Dismiss
            </button>
          </div>
        )}
        {page === "Workbench" && (
          <>
            <ComponentJourney item={active} saved={sameComponent(library.find(item=>item.id===active.id),active,theme)} onBuild={()=>setBuilding(true)} onTest={()=>{setView('preview');const el=active.feature?workingPreview.current:document.querySelector<HTMLElement>('.preview-panel');el?.scrollIntoView({block:'start'});el?.focus();}} onSave={()=>save()} onIntegrate={()=>integrate(active)}/>
            <div className="workbench">
              <section className="panel elements">
                <div className="section-heading">
                  <h2>Source elements</h2>
                  <span className="muted">{elements.length}</span>
                </div>
                <div className="element-list">
                  {elements.map((item) => (
                    <div
                      className={
                        "element " + (item.id === active.id ? "selected" : "")
                      }
                      key={item.id}
                    >
                      <div className="element-thumb">
                        <Preview item={item} theme={theme} mini />
                      </div>
                      <span>
                        <strong>{item.name}</strong>
                        <small>
                          {item.source.startsWith("http")
                            ? new URL(item.source).hostname
                            : item.source.startsWith("Reframe")
                              ? item.libraryId ? "Reframe Original" : "Starter example"
                              : item.source}
                        </small>
                      </span>
                      <ChevronRight size={15} />
                      <button className="element-open" aria-label={`Select ${item.name}`} onClick={() => open(item)}/>
                    </div>
                  ))}
                </div>
                <div className="source-note">
                  <ShieldCheck size={16} />
                  <p>
                    {elements[0]?.source.startsWith("Reframe")
                      ? "Original examples to try the workbench. Inspect a URL or import your own."
                      : "Structure captured. Review behavior and asset rights before reuse."}
                  </p>
                </div>
              </section>
              <section
                className="panel preview-panel"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const id = e.dataTransfer.getData("application/x-reframe");
                  const item = library.find((i) => i.id === id);
                  if (item) open(item);
                }}
              >
                {dragging && (
                  <div className="drop-overlay">
                    <Box size={28} />
                    <strong>Drop to adapt</strong>
                    <span>Open this component in your workbench</span>
                  </div>
                )}
                <div className="preview-toolbar">
                  <div className="view-tabs">
                    {active.referenceImage && <button className={view === "reference" ? "active" : ""} onClick={() => setView("reference")}>Original reference</button>}
                    <button
                      className={view === "preview" ? "active" : ""}
                      onClick={() => setView("preview")}
                    >
                      {active.libraryId?'Interactive preview':'Visual reference'}
                    </button>
                    <button
                      className={view === "code" ? "active" : ""}
                      onClick={() => setView("code")}
                    >
                      Code
                    </button>
                  </div>
                  <div className="device-toggle">
                    <button
                      title="Desktop preview"
                      aria-label="Desktop preview"
                      aria-pressed={!mobile}
                      className={!mobile ? "selected" : ""}
                      onClick={() => setMobile(false)}
                    >
                      <Monitor size={15} />
                      <span>Desktop</span>
                    </button>
                    <button
                      title="Mobile preview"
                      aria-label="Mobile preview"
                      aria-pressed={mobile}
                      className={mobile ? "selected" : ""}
                      onClick={() => setMobile(true)}
                    >
                      <Smartphone size={15} />
                      <span>Mobile</span>
                    </button>
                  </div>
                </div>
                {view==='preview' && <p className="preview-explanation">{componentReadiness(active).preview}</p>}
                {view === "reference" && active.referenceImage ? <div className="reference-comparison"><img src={active.referenceImage} alt={`Original appearance of ${active.name}`}/><p>Original captured appearance · use Preview to see the adapted component.</p><a href={/^https?:\/\//.test(active.source) ? active.source : undefined} target="_blank" rel="noreferrer">{active.source}</a></div> : view === "preview" ? (
                  <div className={"canvas " + (mobile ? "mobile-canvas" : "")}>
                    <Preview
                      item={active}
                      theme={theme}
                      onPick={picking ? (html) => void pick(html) : undefined}
                    />
                  </div>
                ) : view === "edit" ? (
                  <div className="code-editor">
                    <label>
                      Component HTML
                      <textarea
                        value={editor}
                        onChange={(e) => setEditor(e.target.value)}
                        spellCheck={false}
                      />
                    </label>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => void applyEdit()}
                    >
                      Apply changes
                    </button>
                  </div>
                ) : (
                  <div className="code-view">
                    <div>
                      <select
                        aria-label="Code format"
                        value={active.libraryId && format==="html" ? "react" : format}
                        onChange={(e) => setFormat(e.target.value)}
                      >
                        {!active.libraryId && <option value="html">HTML + CSS</option>}
                        <option value="react">React JSX</option>
                        {active.libraryId && <><option value="swiftui">iOS · SwiftUI</option><option value="compose">Android · Compose</option></>}
                      </select>
                      <button disabled={!code} onClick={() => void copy()}>
                        <Copy size={14} />
                        Copy code
                      </button>
                    </div>
                    <pre tabIndex={0}>{code}</pre>
                  </div>
                )}
                <div className="canvas-footer">
                  <button
                    disabled={!!active.libraryId}
                    className={picking ? "text-button picking" : "text-button"}
                    onClick={() => {
                      setView("preview");
                      setPicking(!picking);
                    }}
                  >
                    <MousePointer2 size={14} />
                    {picking ? "Click an element to pick" : "Pick an element"}
                  </button>
                  <button
                    className="text-button"
                    disabled={!!active.libraryId}
                    onClick={() => {
                      setEditor(active.html);
                      setView("edit");
                    }}
                  >
                    <Code2 size={14} />
                    Edit HTML
                  </button>
                </div>
              </section>
              <aside className="panel inspector">
                <h2>Make it yours</h2>
                <label>
                  Component name
                  <input
                    maxLength={100}
                    value={active.name}
                    onChange={(e) =>
                      setActive({ ...active, name: e.target.value })
                    }
                  />
                </label>
                <ThemeEditor theme={theme} onChange={changeTheme} />
                <div className="inspector-actions">
                  
                  <button
                    className="primary"
                    disabled={!active.name.trim()}
                    onClick={() => save()}
                  >
                    <ClipboardIcon size={16} />
                    Save to clipboard
                  </button>
                  <button
                    disabled={!code}
                    onClick={() =>
                      download(
                        `${slug(active.name)}.${format === "swiftui" ? "swift" : format === "compose" ? "kt" : format === "react" ? "jsx" : "html"}`,
                        code,
                        format === "react" ? "text/javascript" : format === "html" ? "text/html" : "text/plain",
                      )
                    }
                  >
                    <Code2 size={16} />
                    Export {active.feature?'visual ':''}{format === "swiftui" ? "SwiftUI" : format === "compose" ? "Compose" : format === "react" ? "React" : "HTML"}
                  </button>
                  {active.feature && <button onClick={()=>download(`${active.feature!.spec.id}-feature.json`,JSON.stringify({version:1,items:[{...active,theme}]},null,2),'application/json')}>Export UI + backend package</button>}
                </div>
                <button disabled={!!active.libraryId||!!active.feature?.spec.website} onClick={() => setBuilding(!building)}><Wand2 size={16}/>{active.feature?.spec.website ? 'Rendered website runtime included' : active.feature ? "Edit working feature" : "Build working feature"}</button>
                {active.feature?.spec.website&&<p className="muted">Original styling is preserved. Palette and radius controls do not recolor this package. Edit the installed source to customize its design.</p>}
                {active.libraryId && <p className="muted">Local interactions are included. Export React, SwiftUI or Compose, or integrate through Projects to keep them. Edit the exported source to customize behavior.</p>}
                {active.feature && <p className="muted">Full-stack package · {(active.feature.bytes / 1024).toFixed(1)} KB · {active.feature.spec.actions.length} defined actions</p>}
                <button className="fit-link" onClick={() => setPage("Projects")}><Folder size={16}/>Check project fit<ArrowRight size={15}/></button>
                <details className="quality">
                  <summary>
                    Code & evidence{" "}
                    <span>
                      {active.libraryId ? `${(new TextEncoder().encode(code).length / 1024).toFixed(1)} KB` : quality ? `${(quality.bytes / 1024).toFixed(1)} KB` : ""}
                    </span>
                  </summary>
                  <p>{active.evidence}</p>
                  <p>
                    {active.libraryId ? "Selected React component and shared styles · no new dependencies" : `${quality?.elements} elements · no component dependencies`}
                  </p>
                  <ul>
                    {quality?.issues.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                  <p className="source-url">{active.source}</p>
                </details>
              </aside>
            </div>
            {active.feature&&<div ref={workingPreview} tabIndex={-1} aria-label="Test component behavior"><Suspense fallback={<p role="status">Loading working preview…</p>}><WorkingPreview key={active.id+active.feature.builtAt} item={active} theme={theme}/></Suspense></div>}
            {building && <Suspense fallback={<p role="status">Loading behavior editor…</p>}><div ref={featureBuilder} tabIndex={-1} aria-label="Define component behavior"><FeatureBuilder key={active.id + active.html} item={active} theme={theme} onBuilt={feature => { if (save({ ...active, feature })) notify('Frontend, backend and behavior saved to clipboard.'); }}/></div></Suspense>}
            <Clipboard
              items={library.slice(0, 3)}
              onOpen={open}
              onDelete={remove}
              onIntegrate={integrate}
            />
            {library.length > 3 && (
              <button
                className="text-button all-components"
                onClick={() => setPage("Clipboard")}
              >
                View all {library.length} components
                <ArrowRight size={16} />
              </button>
            )}
          </>
        )}
        {page === "Clipboard" && (
          <>
            <div className="intro">
              <h2>Collect once. Create again.</h2>
              <p>
                Drag a saved component onto the workbench, or open it to adapt.
              </p>
            </div>
            <Clipboard items={library} onOpen={open} onDelete={remove} onIntegrate={integrate} full />
            {deleted && (
              <button className="undo-button" onClick={restore}>
                <Undo2 size={15} />
                Restore {deleted.name}
              </button>
            )}
          </>
        )}
        {page === 'Engines' && <Suspense fallback={<p role="status">Loading EngineTools…</p>}><EngineTools item={active} theme={theme} onApply={(html, feature) => { setActive({ ...active, html, feature }); notify('Copy updated. Save to clipboard to keep it.'); }}/></Suspense>}
        {page === 'Connections' && <Suspense fallback={<p role="status">Loading Connections…</p>}><Connections active={active} onSave={save} onProjects={()=>setPage('Projects')}/></Suspense>}
        {page === 'Agents' && <Suspense fallback={<p role="status">Loading Agents…</p>}><Agents testInvite={agentTestInvite} onAction={agentAction} onTalk={id=>setAgentInvite({id,nonce:Date.now()})} item={active} library={library} theme={theme} onSave={save} onNavigate={setPage} onEdit={item=>{setActive(item);setBuilding(true);setPage('Workbench');}}/></Suspense>}
        {page === 'Native capture' && <Suspense fallback={<p role="status">Loading NativeCapture…</p>}><NativeCapture onCapture={captured} /></Suspense>}
        {page === 'Projects' && <Suspense fallback={<p role="status">Loading Projects…</p>}><Projects active={active} items={library} theme={theme} onTheme={changeTheme} onSave={save} /></Suspense>}
        {page === 'Component library' && <Suspense fallback={<p role="status">Loading ComponentLibrary…</p>}><ComponentLibrary theme={theme} onOpen={open} onSave={save} onProjects={()=>setPage('Projects')}/></Suspense>}
        {page === "Project theme" && (
          <>
            <div className="intro">
              <h2>Make every piece feel at home.</h2>
              <p>Your colors, your type, your design language.</p>
            </div>
            <div className="theme-page">
              <section className="panel theme-editor">
                <h2>Your project tokens</h2>
                <ThemeEditor theme={theme} onChange={changeTheme} full />
                <button onClick={() => download("reframe-brand.json", JSON.stringify(theme,null,2), "application/json")}>Export brand kit</button>
                <button
                  onClick={() =>
                    download(
                      "reframe-tokens.css",
                      `:root {\n  --primary: ${theme.primary};\n  --background: ${theme.background};\n  --foreground: ${theme.text};\n  --radius: ${theme.radius}px;\n  --font: ${theme.font};\n}\n`,
                      "text/css",
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
                  <Preview item={libraryItem(catalog.find(e => e.id === "brand")!)} theme={theme} />
                </div>
              </section>
            </div>
          </>
        )}
        <footer className="app-footer">
          <span>Built to be reused.</span>
          <span>Local clipboard · Native capture · Project integration</span>
        </footer>
      </main>
      <AgentHelper page={page} item={active} invite={agentInvite} hidden={!!capture||busy} onAction={agentAction}/>
      {capture && (
        <CaptureDialog
          initialTab={capture}
          initialImage={browserImage?.image}
          initialDescription={browserImage ? `Reconstruct the visible component from ${browserImage.source}.` : ""}
          onClose={() => { setCapture(null); setBrowserImage(null); }}
          onCapture={r => captured(browserImage ? { ...r, items: r.items.map(i => ({ ...i, source: browserImage.source, referenceImage: browserImage.image })) } : r)}
          onImport={importItems}
        />
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
