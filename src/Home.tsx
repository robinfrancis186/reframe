import { ArrowRight, Camera, Code2, Film, Folder, Globe, ImagePlus, Link, Loader2, Scan } from 'lucide-react';
import Preview from './Preview';
import { starters, type ComponentItem, type Theme } from './model';
import './home.css';
import { componentReadiness } from './component-workflow.js';

export default function Home({ recent, theme, url, busy, error, onDismissError, onUrl, onInspect, onNavigate, onCapture, onOpen }: {
  recent?:ComponentItem;
  theme: Theme; url: string; busy: boolean;
  error: string; onDismissError: () => void;
  onUrl: (value: string) => void;
  onInspect: (event: React.FormEvent) => void;
  onNavigate: (page: string) => void;
  onCapture: (mode: string) => void;
  onOpen: (item: ComponentItem) => void;
}) {
  return <section className="home-workspace" aria-label="Start a capture">
    <div className="home-intro">
      <h2>Good ideas deserve a new home.</h2>
      <p>Capture a reference. Make it fit. Keep it yours.</p>
      <button className="text-button" onClick={()=>onNavigate('Agents')}>Meet your specialist agents <ArrowRight size={16}/></button>
    </div>
    <div className="home-actions">
      <button className="home-action browse-action" onClick={() => onNavigate('Browser')}>
        <span className="action-icon"><Globe size={28}/></span>
        <span><strong>Browse &amp; pick</strong><small>Pick a reference from a public website</small></span><ArrowRight size={20}/>
      </button>
      <button className="home-action capture-action" onClick={() => onCapture('image')}>
        <span className="action-icon"><Scan size={28}/></span>
        <span><strong>Capture a screen</strong><small>Start with a screenshot, video or camera</small></span><ArrowRight size={20}/>
      </button>
      <button className="home-action library-action" onClick={() => onNavigate('Clipboard')}>
        <span className="action-icon"><Folder size={28}/></span>
        <span><strong>Open your clipboard</strong><small>Your saved components, ready to reuse</small></span><ArrowRight size={20}/>
      </button>
    </div>
    <section className="home-composer" aria-label="Website capture">
      <label htmlFor="home-url"><Link size={18}/>Website capture</label>
      <form onSubmit={onInspect}>
        <input id="home-url" value={url} onChange={e => onUrl(e.target.value)} placeholder="Paste a website URL to capture its components" required aria-label="Website URL"/>
        <button className="primary" aria-label={busy ? 'Capturing website' : 'Capture website'} disabled={busy || !url.trim()}>{busy ? <Loader2 size={20} className="spin"/> : <ArrowRight size={20}/>}</button>
      </form>
      {error && <div className="error-banner" role="alert">{error}<button onClick={onDismissError} aria-label="Dismiss error">Dismiss</button></div>}
      <div className="home-sources">
        {[{ id: 'image', name: 'Screenshot', Icon: ImagePlus }, { id: 'video', name: 'Video', Icon: Film }, { id: 'camera', name: 'Camera', Icon: Camera }, { id: 'html', name: 'HTML', Icon: Code2 }].map(({ id, name, Icon }) => <button key={id} onClick={() => onCapture(id)}><Icon size={18}/>{name}</button>)}
      </div>
    </section>
    {recent && <section className="home-resume" aria-label="Continue recent component"><div><span className="eyebrow">FROM YOUR CLIPBOARD</span><p><strong>{recent.name}</strong> · {componentReadiness(recent).label}</p></div><button onClick={()=>onOpen(recent)}>Continue component<ArrowRight size={16}/></button></section>}
    <details className="home-start-guide"><summary>New to Reframe? Your first working component</summary><ol><li>Capture a public page or screen, or choose an interactive Original.</li><li>Define the actions and data you need. Images cannot reveal private backend logic.</li><li>Save the complete package, choose a destination, review its fit and source changes, then test the installed component.</li></ol><button onClick={()=>onNavigate('Projects')}>Choose a destination project<ArrowRight size={16}/></button><p className="muted">No project yet? Use the included React demo in Projects. Native source is available; Android and iOS runtime testing is pending.</p></details>
    <section className="home-starters" aria-label="Starter components">
      <div className="home-section-heading"><h2>Start with a component</h2><button onClick={() => onNavigate('Clipboard')}>View clipboard<ArrowRight size={16}/></button></div>
      <div className="starter-grid">
        {starters.map(item => <button className="starter-card" key={item.id} onClick={() => onOpen(item)} aria-label={`Open ${item.name}`}>
          <span className="starter-preview"><Preview item={item} theme={theme} mini/></span>
          <span className="starter-title">{item.name}<ArrowRight size={17}/></span>
        </button>)}
      </div>
    </section>
  </section>;
}
