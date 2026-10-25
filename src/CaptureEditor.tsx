import {
  Box,
  ChevronRight,
  ShieldCheck,
  Monitor,
  Smartphone,
  Code2,
  Copy,
  MousePointer2,
  Clipboard as ClipboardIcon,
  Folder,
  ArrowRight,
} from 'lucide-react';
import Preview from './Preview';
import ReadyToReuse from './ReadyToReuse';
import WebDrop from './WebDrop';
import ThemeEditor from './ThemeEditor';
import FidelityCheck, { canCheckFidelity, FidelityBadge } from './FidelityCheck';
import { downloadCode, exportedCode } from './code-export';
import { componentReadiness } from './component-workflow.js';
import { api, download, slug, type ComponentItem, type Theme, type Fidelity } from './model';
import type { useCaptureWorkflow } from './useCaptureWorkflow';
interface Props {
  model: ReturnType<typeof useCaptureWorkflow>;
  theme: Theme;
  busy: boolean;
  library: ComponentItem[];
  open: (item: ComponentItem) => Promise<void>;
  pick: (html: string) => Promise<void>;
  applyEdit: () => Promise<void>;
  copy: () => Promise<void>;
  changeTheme: (theme: Theme) => void;
  save: (candidate?: ComponentItem) => boolean;
  scored: (fidelity: Fidelity) => void;
  setPage: (page: string) => void;
  setError: (text: string) => void;
}
export default function CaptureEditor({
  model,
  theme,
  busy,
  library,
  open,
  pick,
  applyEdit,
  copy,
  changeTheme,
  save,
  scored,
  setPage,
  setError,
}: Props) {
  const {
    elements,
    active,
    setActive,
    mobile,
    setMobile,
    view,
    setView,
    format,
    setFormat,
    picking,
    setPicking,
    dragging,
    setDragging,
    editor,
    setEditor,
    quality,
    exportable,
    exportMode,
    setExportMode,
    exportNames,
    setExportNames,
    exportProposal,
    setExportProposal,
    assisting,
    setAssisting,
    assistKey,
    setAssistKey,
    exported,
    exportedFiles,
    exportKey,
    code,
  } = model;
  return (
    <div className="workbench focused-editor">
      <WebDrop item={active} theme={theme} />
      <ReadyToReuse key={active.id} item={active} onUpdate={setActive} />
      <details className="panel elements editor-sources">
        <summary>Source elements · {elements.length}</summary>
        <div className="section-heading">
          <h2>Source elements</h2>
          <span className="muted">{elements.length}</span>
        </div>
        <div className="element-list">
          {elements.map((item) => (
            <div className={'element ' + (item.id === active.id ? 'selected' : '')} key={item.id}>
              <div className="element-thumb">
                <Preview item={item} theme={theme} mini />
              </div>
              <span>
                <strong>{item.name}</strong>
                <small>
                  {item.source.startsWith('http')
                    ? new URL(item.source).hostname
                    : item.source.startsWith('Reframe')
                      ? item.libraryId
                        ? 'Reframe Original'
                        : 'Starter example'
                      : item.source}
                </small>
              </span>
              <ChevronRight size={15} />
              <button
                className="element-open"
                aria-label={`Select ${item.name}`}
                onClick={() => open(item)}
              />
            </div>
          ))}
        </div>
        <div className="source-note">
          <ShieldCheck size={16} />
          <p>
            {elements[0]?.source.startsWith('Reframe')
              ? 'Original examples to try the workbench. Inspect a URL or import your own.'
              : 'Structure captured. Review behavior and asset rights before reuse.'}
          </p>
        </div>
      </details>
      <section
        className="panel preview-panel"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const id = e.dataTransfer.getData('application/x-reframe');
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
            {active.referenceImage && (
              <button
                className={view === 'reference' ? 'active' : ''}
                onClick={() => setView('reference')}
              >
                Original reference
              </button>
            )}
            <button
              className={view === 'preview' ? 'active' : ''}
              onClick={() => setView('preview')}
            >
              {active.libraryId ? 'Interactive preview' : 'Visual reference'}
            </button>
            <button className={view === 'code' ? 'active' : ''} onClick={() => setView('code')}>
              Code
            </button>
          </div>
          <div className="device-toggle">
            <button
              title="Desktop preview"
              aria-label="Desktop preview"
              aria-pressed={!mobile}
              className={!mobile ? 'selected' : ''}
              onClick={() => setMobile(false)}
            >
              <Monitor size={15} />
              <span>Desktop</span>
            </button>
            <button
              title="Mobile preview"
              aria-label="Mobile preview"
              aria-pressed={mobile}
              className={mobile ? 'selected' : ''}
              onClick={() => setMobile(true)}
            >
              <Smartphone size={15} />
              <span>Mobile</span>
            </button>
          </div>
        </div>
        {view === 'preview' && (
          <p className="preview-explanation">{componentReadiness(active).preview}</p>
        )}
        {view === 'reference' && active.referenceImage ? (
          <div className="reference-comparison">
            {canCheckFidelity(active) ? (
              <FidelityCheck item={active} onScored={scored} />
            ) : (
              <>
                <img src={active.referenceImage} alt={`Original appearance of ${active.name}`} />
                <p>Original captured appearance · use Preview to see the adapted component.</p>
              </>
            )}
            <a
              href={/^https?:\/\//.test(active.source) ? active.source : undefined}
              target="_blank"
              rel="noreferrer"
            >
              {active.source}
            </a>
          </div>
        ) : view === 'preview' ? (
          <div className={'canvas ' + (mobile ? 'mobile-canvas' : '')}>
            <Preview
              item={active}
              theme={theme}
              onPick={picking ? (html) => void pick(html) : undefined}
            />
          </div>
        ) : view === 'edit' ? (
          <div className="code-editor">
            <label>
              Component HTML
              <textarea
                value={editor}
                onChange={(e) => setEditor(e.target.value)}
                spellCheck={false}
              />
            </label>
            <button className="primary" disabled={busy} onClick={() => void applyEdit()}>
              Apply changes
            </button>
          </div>
        ) : (
          <div className="code-view">
            {exportable && (
              <label>
                Export mode
                <select
                  aria-label="Export mode"
                  value={exportMode}
                  onChange={(e) => setExportMode(e.target.value)}
                >
                  <option value="faithful">Faithful</option>
                  <option value="clean">Clean &amp; responsive</option>
                </select>
              </label>
            )}
            <div>
              <select
                aria-label="Code format"
                value={active.libraryId && format === 'html' ? 'react' : format}
                onChange={(e) => setFormat(e.target.value)}
              >
                {!active.libraryId && (
                  <option value="html">{exportable ? 'HTML' : 'HTML + CSS'}</option>
                )}
                <option value="react">{exportable ? 'React component' : 'React JSX'}</option>
                {exportable && <option value="css">Scoped CSS</option>}
                {active.libraryId && (
                  <>
                    <option value="swiftui">iOS · SwiftUI</option>
                    <option value="compose">Android · Compose</option>
                  </>
                )}
              </select>
              <button disabled={!code} onClick={() => void copy()}>
                <Copy size={14} />
                Copy code
              </button>
            </div>
            {exportable && (
              <p className="code-export-status" role="status">
                {exported?.key === exportKey ? (
                  exported.error ? (
                    exported.error
                  ) : (
                    <>
                      Real source, styles scoped under <code>.{exportedFiles!.scope}</code>
                      {exportedFiles!.fidelity && (
                        <>
                          {' '}
                          · exported code <FidelityBadge fidelity={exportedFiles!.fidelity} />
                        </>
                      )}
                    </>
                  )
                ) : (
                  'Generating source and checking it against the original…'
                )}
              </p>
            )}
            {exportMode === 'clean' && exportedFiles && (
              <div className="export-evidence">
                <p>
                  {exportedFiles.removedRules} unused rule groups removed · React interactions:{' '}
                  {exportedFiles.patterns?.join(', ') || 'none identified'}
                </p>
                {exportedFiles.minified?.used && (
                  <p>
                    Redundant CSS removed:{' '}
                    {exportedFiles.minified.declarationsBefore -
                      exportedFiles.minified.declarationsAfter}{' '}
                    of {exportedFiles.minified.declarationsBefore} declarations, including{' '}
                    {exportedFiles.minified.unusedVariables} unused variables · checked at{' '}
                    {exportedFiles.minified.widths.join(', ')}px · match{' '}
                    {exportedFiles.minified.scoreBefore ?? '—'} →{' '}
                    {exportedFiles.minified.scoreAfter ?? '—'}
                  </p>
                )}
                {exportedFiles.warnings?.map((w) => (
                  <p key={w}>{w}</p>
                ))}
                {exportedFiles.variants?.length ? (
                  <table>
                    <caption>
                      Measured source variants · regressions above 3 points are flagged
                    </caption>
                    <thead>
                      <tr>
                        <th>Width / state</th>
                        <th>Faithful</th>
                        <th>Clean</th>
                        <th>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exportedFiles.variants.map((v) => (
                        <tr key={v.width + v.state}>
                          <th>
                            {v.width}px / {v.state}
                          </th>
                          <td>{v.faithful ?? '—'}</td>
                          <td>{v.score ?? '—'}</td>
                          <td>
                            {v.error ||
                              (v.warning
                                ? `Review: ${v.regression} point loss`
                                : 'Within tolerance')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>
                    Only the original viewport was captured. Measure responsive and interaction
                    states in Capture before claiming responsive equivalence.
                  </p>
                )}
              </div>
            )}
            <pre tabIndex={0}>{code}</pre>
          </div>
        )}
        <div className="canvas-footer">
          <button
            disabled={!!active.libraryId}
            className={picking ? 'text-button picking' : 'text-button'}
            onClick={() => {
              setView('preview');
              setPicking(!picking);
            }}
          >
            <MousePointer2 size={14} />
            {picking ? 'Click an element to pick' : 'Pick an element'}
          </button>
          <button
            className="text-button"
            disabled={!!active.libraryId}
            onClick={() => {
              setEditor(active.html);
              setView('edit');
            }}
          >
            <Code2 size={14} />
            Edit HTML
          </button>
        </div>
      </section>
      <aside className="panel inspector">
        <h2>Keep this component</h2>
        <label>
          Component name
          <input
            maxLength={100}
            value={active.name}
            onChange={(e) => setActive({ ...active, name: e.target.value })}
          />
        </label>
        <details className="editor-options">
          <summary>Appearance</summary>
          <ThemeEditor theme={theme} onChange={changeTheme} />
        </details>
        <div className="inspector-actions">
          <button className="primary" disabled={!active.name.trim()} onClick={() => save()}>
            <ClipboardIcon size={16} />
            Save to Library
          </button>
        </div>
        <button className="fit-link" onClick={() => setPage('Projects')}>
          <Folder size={16} />
          Check project fit
          <ArrowRight size={15} />
        </button>
        <details className="editor-options">
          <summary>Export &amp; code options</summary>
          <div className="inspector-actions">
            {exportable ? (
              <button
                onClick={() => {
                  downloadCode(active, exportMode, exportNames).catch((e) =>
                    setError((e as Error).message),
                  );
                }}
              >
                <Code2 size={16} />
                Download code (React, CSS, HTML)
              </button>
            ) : (
              <button
                disabled={!code}
                onClick={() =>
                  download(
                    `${slug(active.name)}.${format === 'swiftui' ? 'swift' : format === 'compose' ? 'kt' : format === 'react' ? 'jsx' : 'html'}`,
                    code,
                    format === 'react'
                      ? 'text/javascript'
                      : format === 'html'
                        ? 'text/html'
                        : 'text/plain',
                  )
                }
              >
                <Code2 size={16} />
                Export {active.feature ? 'visual ' : ''}
                {format === 'swiftui'
                  ? 'SwiftUI'
                  : format === 'compose'
                    ? 'Compose'
                    : format === 'react'
                      ? 'React'
                      : 'HTML'}
              </button>
            )}
            {active.feature && (
              <button
                onClick={() =>
                  download(
                    `${active.feature!.spec.id}-feature.json`,
                    JSON.stringify({ version: 1, items: [{ ...active, theme }] }, null, 2),
                    'application/json',
                  )
                }
              >
                Export UI + backend package
              </button>
            )}
          </div>
          {exportable && (
            <div className="export-assist">
              <label>
                OpenAI key for this request (optional)
                <input
                  type="password"
                  autoComplete="off"
                  maxLength={1000}
                  value={assistKey}
                  onChange={(e) => setAssistKey(e.target.value)}
                  placeholder="Uses the server key when blank"
                />
              </label>
              <button
                disabled={assisting}
                onClick={async () => {
                  setAssisting(true);
                  setError('');
                  try {
                    setExportProposal(
                      await api('/api/export/assist', {
                        item: active,
                        ...(assistKey ? { apiKey: assistKey } : {}),
                      }),
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setAssisting(false);
                    setAssistKey('');
                  }
                }}
              >
                {assisting ? 'Reviewing names…' : 'AI assist: suggest class names'}
              </button>
              <small>
                Explicit OpenAI request: sends this component’s element labels and structure. No
                original scripts or form values are sent.
              </small>
              {exportProposal && (
                <div>
                  <p>{exportProposal.reason}</p>
                  <ul>
                    {Object.entries(exportProposal.names)
                      .slice(0, 12)
                      .map(([id, name]) => (
                        <li key={id}>
                          Element {id}: {name}
                        </li>
                      ))}
                  </ul>
                  <button
                    disabled={assisting}
                    onClick={async () => {
                      setAssisting(true);
                      try {
                        await exportedCode(active, 'clean', exportProposal.names);
                        setExportNames(exportProposal.names);
                        setExportMode('clean');
                        setView('code');
                        setExportProposal(null);
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setAssisting(false);
                      }
                    }}
                  >
                    Validate &amp; apply to export
                  </button>
                  <button onClick={() => setExportProposal(null)}>Discard proposal</button>
                  <p>Changes affect the export preview only. Your saved component stays intact.</p>
                </div>
              )}
            </div>
          )}
        </details>
        {!!active.captureVariants?.length && (
          <p>{active.captureVariants.length} measured responsive/state variants saved.</p>
        )}
        {active.captureWarnings?.map((w) => (
          <p className="muted" key={w}>
            {w}
          </p>
        ))}
        {active.feature?.spec.website && (
          <p className="muted">
            Original styling is preserved. Palette and radius controls do not recolor this package.
            Edit the installed source to customize its design.
          </p>
        )}
        {active.libraryId && (
          <p className="muted">
            Local interactions are included. Export React, SwiftUI or Compose, or integrate through
            Projects to keep them. Edit the exported source to customize behavior.
          </p>
        )}
        {active.feature && (
          <p className="muted">
            Full-stack package · {(active.feature.bytes / 1024).toFixed(1)} KB ·{' '}
            {active.feature.spec.actions.length} defined actions
          </p>
        )}
        <details className="quality">
          <summary>
            Code & evidence{' '}
            <span>
              {active.libraryId
                ? `${(new TextEncoder().encode(code).length / 1024).toFixed(1)} KB`
                : quality
                  ? `${(quality.bytes / 1024).toFixed(1)} KB`
                  : ''}
            </span>
          </summary>
          <p>{active.evidence}</p>
          <p>
            {active.libraryId
              ? 'Selected React component and shared styles · no new dependencies'
              : `${quality?.elements} elements · no component dependencies`}
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
  );
}
