import { useEffect, useState } from 'react';
import { Code2, Wand2 } from 'lucide-react';
import { api, download, type ComponentItem, type EngineReview, type FeaturePackage, type Theme } from './model';
import { reactCode } from './export';

interface Polish { before: string; html: string; edits: { before: string; after: string }[]; limitation: string }
interface Status {
  vision: boolean; model: string; openAI: boolean;
  localVision: { available: boolean; engine: string; limitation: string };
  engines: {
    ponytail: { available: boolean; version?: string; sha256?: string; limitation: string };
    versionsCheckedAt:string;
    graphify:{available:boolean;version:string|null;latestVerified:string;scope:string};
    rea: { available: boolean; version: string | null; scope: string };
    turnitout: { available: boolean; scope: string; limitation: string };
  };
}
export default function EngineTools({ item, theme, onApply }: { item: ComponentItem; theme: Theme; onApply: (html: string, feature?: FeaturePackage) => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [polish, setPolish] = useState<Polish | null>(null);
  const [review, setReview] = useState<EngineReview | null>(null);
  const [source, setSource] = useState('');
  const [graph,setGraph]=useState<{engine:string;sourceDigest:string;nodes:number;edges:number;graph:{nodes:{id:string;label?:string;name?:string;type?:string;_callable?:boolean;file_type?:string}[]};limitation:string}|null>(null);
  const [comments, setComments] = useState<{ code: string; edits: Polish['edits']; limitation: string } | null>(null);
  const [document, setDocument] = useState<{ name: string; data: string; totalEdits: number; edits: Polish['edits']; limitation: string } | null>(null);
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  useEffect(() => { api<Status>('/api/status').then(setStatus).catch(() => setError('Could not read engine status.')); }, []);
  useEffect(() => {
    setPolish(null); setReview(null); setComments(null);setGraph(null);
    if (!item.libraryId) { setSource(item.feature?.files['Component.tsx'] || reactCode(item, theme)); return; }
    let current = true;
    setSource('');
    api<{imports:string[];code:string}>('/api/library/source', {id:item.libraryId,name:'ReframeOriginal',theme}).then(data => { if (current) setSource(data.imports.join('\n') + '\n' + data.code); }).catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [item.id, item.html, item.feature, theme]);
  async function run(type: string) {
    setBusy(type); setError('');
    try {
      if (type === 'graph')setGraph(await api('/api/graphify',{code:source}));
      else if (type === 'polish') setPolish(await api('/api/refine', { html: item.html }));
      else if (type === 'comments') setComments(await api('/api/refine/source', { code: source }));
      else if (type === 'apply' && polish) {
        const feature = item.feature ? await api<FeaturePackage>('/api/features/build', { html: polish.html, name: item.name, spec: item.feature.spec }) : undefined;
        onApply(polish.html, feature); setPolish(null);
      }
      else setReview(await api('/api/engines/review', { item, theme }));
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  async function reviewDocument(file?: File) {
    if (!file || busy) return; setBusy('document'); setError(''); setDocument(null);
    try {
      if (file.size > 5000000) throw new Error('Use a document under 5 MB.');
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Document could not be read.')); reader.readAsDataURL(file); });
      setDocument(await api('/api/refine/document', { name: file.name, data }));
    } catch (error) { setError((error as Error).message); } finally { setBusy(''); }
  }
  return <div className="engines-page">
    <div className="intro"><h2>Purposeful code. Verifiable checks.</h2><p>Inspect the actual source package for <strong>{item.name}</strong>. Checks run again when a full feature is built, imported or reviewed for installation.</p></div>
    <div className="engine-list">
      <section className="panel engine-row"><div><span className="engine-state">Local · independent replacement</span><h2>Reframe Copy Polish</h2><p>Review visible wording and JavaScript/TypeScript comments while preserving executable code.</p><small>{status?.engines.turnitout.limitation || 'No Turnitout engine is bundled. Our own replacement provides conservative copy and comment suggestions.'}</small></div><button disabled={!!busy || !!item.libraryId} onClick={() => void run('polish')}><Wand2 size={16}/>{busy === 'polish' ? 'Reviewing…' : 'Review copy'}</button></section>
      <section className="panel engine-row"><div><span className={'engine-state ' + (status?.engines.rea.available ? '' : 'pending')}>{status ? status.engines.rea.available ? `Installed · REA ${status.engines.rea.version}` : 'Unavailable' : 'Checking…'}</span><h2>REA source analysis</h2><p>Full features include frontend, backend and schema analysis. Presentation captures include generated frontend source. Code stays local and is never executed by analysis.</p><small>{status?.engines.rea.scope}</small><a href="https://github.com/morluto/rea" target="_blank" rel="noreferrer">View upstream project</a></div><button disabled={!!busy || !status?.engines.rea.available || !status?.engines.ponytail.available} onClick={() => void run('verify')}><Code2 size={16}/>{busy === 'verify' ? 'Checking package…' : 'Verify integrations'}</button></section>
      <section className="panel engine-row"><div><span className={'engine-state ' + (status?.engines.ponytail.available ? '' : 'pending')}>{status ? status.engines.ponytail.available ? `Bundled policy · Ponytail ${status.engines.ponytail.version}` : 'Unavailable' : 'Checking…'}</span><h2>Ponytail minimal-code policy</h2><p>The upstream policy guides vision reconstruction. Local checks parse generated source, count imports and flag added dependencies. Deterministic generators omit unused state and callbacks.</p><small>{status?.engines.ponytail.limitation}</small><a href="https://github.com/DietrichGebert/ponytail" target="_blank" rel="noreferrer">View upstream project</a></div></section>
      <section className="panel engine-row"><div><span className={'engine-state '+(status?.engines.graphify.available?'':'pending')}>{status?.engines.graphify.available?`Installed · Graphify ${status.engines.graphify.version}`:'Graphify setup needed'}</span><h2>Graphify source graph</h2><p>Map functions, imports and relationships in the current JavaScript/TypeScript source. The real AST extractor runs locally without an LLM or executing your code.</p><small>{status?.engines.graphify.scope} Upstream versions checked {status?.engines.versionsCheckedAt||'…'}; latest verified Graphify {status?.engines.graphify.latestVerified||'…'}.</small></div><button disabled={!!busy||!source.trim()||!status?.engines.graphify.available} onClick={()=>void run('graph')}><Code2 size={16}/>{busy==='graph'?'Mapping source…':'Map source graph'}</button></section>
      <section className="panel engine-row"><div><span className={'engine-state ' + (status?.vision ? '' : 'pending')}>{status ? status.vision ? status.openAI ? 'OpenAI configured' : 'Local OCR ready' : 'Setup needed' : 'Checking…'}</span><h2>Screenshot, video & camera reconstruction</h2><p>{status?.openAI ? `${status.model} · selected frames are sent only when you reconstruct.` : status?.localVision.available ? 'Local macOS Vision extracts text and suggests editable controls without a server API key. Frames stay on this computer.' : 'Install Swift command-line tools on macOS for local OCR, or configure OPENAI_API_KEY on the server.'}</p><small>{status?.localVision.limitation}</small></div></section>
    </div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    <section className="panel polish-review"><h2>Review a document</h2><p>TXT, Markdown, LaTeX, HTML, JS/TS or Word DOCX. Protected code, citation fields and math are preserved. The original file stays unchanged.</p><label>Document file<input aria-label="Document file" type="file" accept=".txt,.md,.tex,.html,.js,.jsx,.ts,.tsx,.docx" disabled={!!busy} onChange={e => { void reviewDocument(e.target.files?.[0]); e.target.value = ''; }}/></label>{busy === 'document' && <p role="status">Reviewing document…</p>}{document && <><p role="status">{document.totalEdits} wording suggestions.</p><details><summary>Review suggested edits</summary>{document.edits.map((edit, i) => <p key={i}>{edit.before} → <strong>{edit.after}</strong></p>)}</details><button onClick={() => download(document.name, Uint8Array.from(atob(document.data), c => c.charCodeAt(0)).buffer, 'application/octet-stream')}>Download reviewed document</button><p className="muted">{document.limitation}</p></>}</section>
    {graph&&<section className="panel graph-result" aria-live="polite"><h2>{graph.engine} · Source mapped</h2><p>{graph.nodes} {graph.nodes===1?'symbol':'symbols'} · {graph.edges} {graph.edges===1?'relationship':'relationships'}</p><p className="muted">{graph.limitation}</p><table><thead><tr><th>Symbol</th><th>Kind</th></tr></thead><tbody>{graph.graph.nodes.slice(0,20).map((node,index)=><tr key={node.id+index}><td>{node.label||node.name||node.id}</td><td>{node._callable?'Callable':node.type||node.file_type||'Source symbol'}</td></tr>)}</tbody></table><button onClick={()=>download('reframe-source-graph.json',JSON.stringify(graph,null,2),'application/json')}>Download source graph</button><p className="muted">Source SHA-256: <code>{graph.sourceDigest}</code></p></section>}
    {review && <section className="panel analysis-result" aria-live="polite"><h2>Package checks completed</h2><p>{review.analysis.engine} · {review.analysis.files.length} files · {review.analysis.nodes} graph nodes</p><p>Files checked: <strong>{review.analysis.files.join(', ')}</strong></p><p>Ponytail structural checks: <strong>{review.policy.status}</strong> · {review.policy.bytes.toLocaleString()} source bytes · {review.policy.addedDependencies.length} added dependencies.</p><p>Copy Polish: {review.copy.edits} wording suggestions · {review.copy.comments.reduce((n, f) => n + f.edits, 0)} comment suggestions.</p><p className="muted">{review.analysis.limitation}</p><details><summary>Evidence and limitations</summary><p>Checked {new Date(review.checkedAt).toLocaleString()}</p><p>Evidence: <code>{review.analysis.evidenceId}</code></p><p>Source SHA-256: <code>{review.sourceDigest}</code></p><p>Policy SHA-256: <code>{review.policy.policySha256}</code></p><ul>{review.policy.checks.map(c => <li key={c}>{c}</li>)}</ul><p>{review.policy.limitation}</p><ul>{review.analysis.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul><p>{review.analysis.unknowns === null ? 'Unresolved semantic count unavailable.' : `${review.analysis.unknowns} unresolved semantic items.`}</p></details></section>}
    {polish && <section className="panel polish-review"><h2>Review copy suggestions</h2>{polish.edits.length ? <><div className="copy-comparison"><strong>Before</strong><strong>After</strong>{polish.edits.map((e, i) => <div className="copy-pair" key={i}><p>{e.before}</p><p>{e.after}</p></div>)}</div>{item.feature && <p>The feature will be rebuilt and checked with the same actions and storage identity.</p>}<button className="primary" disabled={!!busy} onClick={() => void run('apply')}>{busy === 'apply' ? 'Rebuilding and checking…' : 'Apply wording to component'}</button></> : <p>No matching inflated phrases found. Your copy is unchanged.</p>}<p className="muted">{polish.limitation}</p></section>}
    <section className="panel polish-review"><details><summary>Review JavaScript / TypeScript comments</summary><p>Paste source or review this component’s frontend. Suggestions affect comments only. Review the result before using it in your project.</p><label htmlFor="review-source">Source code</label><textarea id="review-source" value={source} onChange={e => { setSource(e.target.value); setComments(null);setGraph(null); }} rows={8} spellCheck={false} maxLength={500000}/><button disabled={!!busy || !source.trim()} onClick={() => void run('comments')}>{busy === 'comments' ? 'Reviewing comments…' : 'Review comments'}</button>{comments && <><p role="status">{comments.edits.length} comment suggestions. Executable code preserved.</p><label htmlFor="reviewed-source">Reviewed source</label><textarea id="reviewed-source" readOnly value={comments.code} rows={8} spellCheck={false}/><p className="muted">{comments.limitation}</p></>}</details></section>
  </div>;
}
