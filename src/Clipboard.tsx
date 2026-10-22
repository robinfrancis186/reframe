import { exportOriginal } from "./library/export";
import {
  Search,
  Download,
  Trash2,
  Clipboard as ClipboardIcon,
  GripVertical,
} from "lucide-react";
import { useState } from "react";
import Preview from "./Preview";
import { download, themes, type ComponentItem } from "./model";
import { componentReadiness, matchesComponent } from './component-workflow.js';
import { FidelityBadge } from './FidelityCheck';
import './fidelity.css';
export default function Clipboard({
  items,
  onOpen,
  onDelete,
  onIntegrate,
  full = false,
}: {
  items: ComponentItem[];
  onOpen: (item: ComponentItem) => void;
  onDelete: (id: string) => void;
  onIntegrate?: (item:ComponentItem)=>void;
  full?: boolean;
}) {
  const [exportError,setExportError] = useState("");
  const [exporting,setExporting] = useState("");
  const [query, setQuery] = useState("");
  const [kind,setKind]=useState('all');
  const [limit,setLimit]=useState(24);
  const visible = items.filter(i=>matchesComponent(i,query,kind));
  const shown = full ? visible.slice(0,limit) : visible;
  return (
    <section className={"clipboard panel " + (full ? "full-library" : "")}>
      <div className="section-heading">
        <h2>Your clipboard</h2>
        <span className="muted">
          {items.length} component{items.length !== 1 ? "s" : ""}
        </span>
        {full && items.length > 0 && (
          <button
            onClick={() =>
              download(
                "reframe-clipboard.json",
                JSON.stringify({ version: 1, items }, null, 2),
                "application/json",
              )
            }
          >
            <Download size={15} />
            Back up
          </button>
        )}
      </div>
      {full && (
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Search clipboard"
            type="search"
            value={query}
            onChange={(e) => {setQuery(e.target.value);setLimit(24);}}
            placeholder="Search components or sources"
          />
        </label>
      )}
      {full && <div className="clipboard-filters" role="group" aria-label="Filter saved components">{[['all','All'],['feature','UI + backend'],['original','Interactive UI'],['reference','Visual references']].map(([id,label])=><button key={id} aria-pressed={kind===id} onClick={()=>{setKind(id);setLimit(24);}}>{label} · {items.filter(item=>matchesComponent(item,'',id)).length}</button>)}</div>}
      {full && <p className="clipboard-result-count" role="status">Showing {shown.length.toLocaleString()} of {visible.length.toLocaleString()} matching component{visible.length!==1?'s':''}</p>}
      {exportError && <p className="error-banner" role="alert">{exportError}</p>}
      {!items.length ? (
        <div className="empty-library">
          <ClipboardIcon size={25} />
          <div>
            <strong>A home for your next good idea.</strong>
            <p>
              Save a component above. It stays here, ready for your next
              project.
            </p>
          </div>
        </div>
      ) : (
        <div className="clipboard-grid">
          {shown.map((item) => (
            <article
              key={item.id}
              className="clip-card"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-reframe", item.id);
                e.dataTransfer.setData("text/html", item.html);
                e.dataTransfer.effectAllowed = "copy";
              }}
            >
              <div className="thumbnail">
                <Preview item={item} theme={item.theme || themes[0]} mini />
                <button className="thumbnail-open" onClick={() => onOpen(item)} aria-label={`Open ${item.name}`}/>
              </div>
              <div className="clip-title">
                <GripVertical size={14} />
                <button className="text-button" title={item.name} onClick={() => onOpen(item)}>
                  {item.name}
                </button>
                <button
                  className="icon-button"
                  aria-label={`Delete ${item.name}`}
                  onClick={() => onDelete(item.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <span className="component-status">{componentReadiness(item).label}</span>
              <FidelityBadge fidelity={item.fidelity} />
              {full && item.libraryId && <button disabled={!!exporting} onClick={async()=>{setExportError("");setExporting(item.id);try{await exportOriginal(item,item.theme || themes[0]);}catch(e){setExportError((e as Error).message);}finally{setExporting("");}}}>{exporting===item.id?"Preparing…":"Export all platforms"}</button>}
              {item.feature && <p className="clip-source">Working feature · {item.feature.spec.actions.length} action{item.feature.spec.actions.length!==1?'s':''} · frontend + backend</p>}
              {full && item.feature && <button onClick={() => download(`${item.feature!.spec.id}-feature.json`, JSON.stringify({ version: 1, items: [item] }, null, 2), 'application/json')}>Export full feature</button>}
              {full && <p className="clip-source" title={item.source}>{item.source}</p>}
              {full && onIntegrate && <button className="clip-handoff" onClick={()=>onIntegrate(item)} aria-label={`Fit & install ${item.name}`}>Fit &amp; install</button>}
            </article>
          ))}
        </div>
      )}
      {full && visible.length>shown.length && <button className="clipboard-more" onClick={()=>setLimit(limit+24)}>Show more · {(visible.length-shown.length).toLocaleString()} remaining</button>}
      {items.length > 0 && !visible.length && (
        <div className="empty-library"><p>No components match these filters{query?` and “${query}”`:''}.</p><button onClick={()=>{setQuery('');setKind('all');}}>Clear filters</button></div>
      )}
    </section>
  );
}
