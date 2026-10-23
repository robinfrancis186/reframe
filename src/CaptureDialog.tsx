import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X, Code2, Image, FileCode, Upload, Loader2, Film, Camera } from 'lucide-react';
import { api, isItem, isTheme, type ComponentItem } from './model';
import MediaCapture, { type Frame } from './MediaCapture';
interface CaptureResult {
  items: ComponentItem[];
  source: string;
  title: string;
}
export default function CaptureDialog({
  initialTab = 'image',
  initialImage = '',
  initialDescription = '',
  onClose,
  onCapture,
  onImport,
}: {
  initialTab?: string;
  initialImage?: string;
  initialDescription?: string;
  onClose: () => void;
  onCapture: (r: CaptureResult) => void;
  onImport: (items: ComponentItem[]) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState(initialTab);
  const [input, setInput] = useState(initialDescription);
  const [frames, setFrames] = useState<Frame[]>(
    initialImage ? [{ image: initialImage, time: 0 }] : [],
  );
  const media = ['image', 'video', 'camera'].includes(tab);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState('');
  const [vision, setVision] = useState<boolean | null>(null);
  const [remoteVision, setRemoteVision] = useState(false);
  useLayoutEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  useEffect(() => {
    api<{ vision: boolean; openAI: boolean }>('/api/status')
      .then((s) => {
        setVision(s.vision);
        setRemoteVision(s.openAI);
      })
      .catch(() => setVision(false));
  }, []);
  async function submit() {
    setBusy(true);
    setError('');
    try {
      if (tab === 'source') {
        const r = await api<{ report: unknown; limitation: string }>('/api/analyze', {
          code: input,
        });
        setReport(JSON.stringify(r, null, 2));
      } else {
        const r = await api<CaptureResult>(
          tab === 'html' ? '/api/capture' : '/api/reconstruct',
          tab === 'html' ? { html: input } : { frames, description: input },
        );
        onCapture(r);
        onClose();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function file(file: File | undefined) {
    if (!file || busy) return;
    setError('');
    setBusy(true);
    try {
      if (file.size > 5_000_000) throw new Error('Choose a file smaller than 5 MB.');
      if (tab === 'backup') {
        const backup = JSON.parse(await file.text());
        if (
          backup.version !== 1 ||
          !Array.isArray(backup.items) ||
          backup.items.length > 200 ||
          !backup.items.every(isItem)
        )
          throw new Error('This is not a valid Reframe Library backup.');
        const items: ComponentItem[] = [];
        for (const item of backup.items) {
          if (item.feature) {
            items.push({
              ...(await api<ComponentItem>('/api/features/validate', { item })),
              id: crypto.randomUUID(),
            });
            continue;
          }
          const r = await api<CaptureResult>('/api/capture', {
            html: `<section>${item.html}</section>`,
          });
          items.push({
            ...item,
            id: crypto.randomUUID(),
            html: r.items[0].html,
            theme: isTheme(item.theme) ? item.theme : undefined,
          });
        }
        onImport(items);
        onClose();
      } else {
        setInput(await file.text());
        setFileName(file.name);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="capture-dialog"
      aria-labelledby="capture-title"
      aria-describedby="capture-description"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <div>
          <h2 id="capture-title">Bring an idea in</h2>
          <p id="capture-description">Capture a structure. Give it a new home.</p>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          disabled={busy}
          aria-label="Close capture"
        >
          <X size={20} />
        </button>
      </header>
      <div className="dialog-tabs" role="group" aria-label="Capture mode">
        {[
          { id: 'html', label: 'HTML', icon: Code2 },
          { id: 'image', label: 'Screenshot', icon: Image },
          { id: 'video', label: 'Video', icon: Film },
          { id: 'camera', label: 'Camera', icon: Camera },
          { id: 'source', label: 'Source analysis', icon: FileCode },
          { id: 'backup', label: 'Clipboard', icon: Upload },
        ].map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'selected' : ''}
            aria-pressed={tab === t.id}
            disabled={busy}
            onClick={() => {
              setTab(t.id);
              setFrames([]);
              setInput('');
              setReport('');
              setError('');
              setFileName('');
            }}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>
      {media && (
        <p className="notice">
          Android, iOS, desktop or web → editable components.{' '}
          {vision === false
            ? 'Local OCR is unavailable. Configure OpenAI on the server to reconstruct screenshots.'
            : remoteVision
              ? 'Selected frames are sent to the configured OpenAI model. Hidden behavior cannot be recovered from images.'
              : 'Local macOS OCR extracts text and suggests controls without an API key. Review control roles, layout and behavior. Frames stay on this computer.'}
        </p>
      )}
      {tab === 'source' && (
        <p className="notice">
          Built-in REA analysis maps JavaScript / TypeScript structure and dependencies. Source
          stays local and is never executed. This produces an evidence report, not a reconstructed
          interface.
        </p>
      )}
      {tab === 'html' && (
        <p className="notice">
          Paste a page or component. Scripts and original styles are removed; your project theme
          supplies its new appearance.
        </p>
      )}
      {media ? (
        <MediaCapture key={tab} mode={tab} frames={frames} onFrames={setFrames} disabled={busy} />
      ) : (
        <label
          className="upload-area"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!busy) void file(e.dataTransfer.files[0]);
          }}
        >
          <Upload size={20} />
          {fileName ||
            `Drop ${media ? 'a screenshot' : tab === 'backup' ? 'a Reframe backup' : 'a source file'} here, or choose a file`}
          <input
            type="file"
            disabled={busy}
            aria-label="Import file"
            accept={
              media
                ? 'image/png,image/jpeg,image/webp'
                : tab === 'backup'
                  ? '.json'
                  : tab === 'source'
                    ? '.js,.jsx,.ts,.tsx'
                    : '.html,.htm,.txt'
            }
            onChange={(e) => {
              void file(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      )}
      {tab !== 'backup' && (
        <label className="editor-label">
          {media
            ? 'What would you like to capture? (optional)'
            : tab === 'source'
              ? 'JavaScript / TypeScript'
              : 'HTML source'}
          <textarea
            autoFocus={tab === 'html'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            rows={media ? 3 : 8}
            placeholder={
              tab === 'html'
                ? '<section>\n  <h1>Your next building block</h1>\n</section>'
                : tab === 'source'
                  ? 'Paste your component source here…'
                  : 'For example, the bottom navigation and its selected state.'
            }
          />
        </label>
      )}
      {report && (
        <div className="analysis-result">
          <h3>REA evidence report</h3>
          <pre tabIndex={0}>{report}</pre>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {tab === 'backup' && busy && <p role="status">Importing and checking feature source…</p>}
      <footer>
        <span className="muted">
          {media
            ? 'Visual inference · review before shipping'
            : 'Local processing · no model required'}
        </span>
        {tab !== 'backup' && (
          <button
            className="primary"
            disabled={busy || (media ? !frames.length || vision !== true : !input.trim())}
            onClick={() => void submit()}
          >
            {busy ? <Loader2 className="spin" size={16} /> : null}
            {busy
              ? 'Working…'
              : tab === 'source'
                ? 'Analyze with REA'
                : media
                  ? 'Reconstruct interface'
                  : 'Capture elements'}
          </button>
        )}
      </footer>
    </dialog>
  );
}
