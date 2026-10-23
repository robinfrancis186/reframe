import { useEffect, useRef, useState } from 'react';
import { api, type Theme } from './model';
type Detection = {
  theme: Partial<Theme>;
  mode: string;
  filesScanned: number;
  evidence: {
    field: string;
    value: string | number;
    file: string;
    token: string;
    confidence: string;
  }[];
  warnings: string[];
};
export default function BrandingDetector({
  theme,
  onChange,
  projectId,
  onAutomaticChange,
  onAppearanceChange,
  initialAutomatic = true,
  initialMode = 'light',
}: {
  theme: Theme;
  onChange: (t: Theme) => void;
  projectId?: string;
  onAutomaticChange?: (value: boolean) => void;
  onAppearanceChange?: (value: string) => void;
  initialAutomatic?: boolean;
  initialMode?: string;
}) {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]),
    [chosen, setChosen] = useState(''),
    [mode, setMode] = useState(initialMode);
  const [automatic, setAutomatic] = useState(initialAutomatic),
    [result, setResult] = useState<Detection | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const latest = useRef({ theme, onChange, automatic });
  latest.current = { theme, onChange, automatic };
  const id = projectId === undefined ? chosen : projectId;
  useEffect(() => {
    if (projectId === undefined)
      api<typeof projects>('/api/projects')
        .then(setProjects)
        .catch((e) => setError(e.message));
  }, [projectId]);
  function apply(data: Detection) {
    latest.current.onChange({
      ...latest.current.theme,
      ...data.theme,
      name: `${data.theme.brandName || 'Detected project'} · ${data.mode}`,
    });
  }
  useEffect(() => {
    setResult(null);
    setError('');
    setBusy(false);
    if (!id) return;
    const controller = new AbortController();
    setBusy(true);
    fetch('/api/projects/branding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, mode }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data as Detection;
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setResult(data);
          if (latest.current.automatic) apply(data);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [id, mode, revision]);
  return (
    <section className="brand-detection">
      <h3>Detect project branding</h3>
      <p className="muted">Read your connected app’s colors, type, corners and brand metadata.</p>
      {projectId === undefined && (
        <label>
          Connected project
          <select
            aria-label="Branding project"
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
          >
            <option value="">Choose a project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="brand-scan-row">
        <label>
          Appearance
          <select
            aria-label="Brand appearance"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              onAppearanceChange?.(e.target.value);
            }}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <button disabled={!id || busy} onClick={() => setRevision((v) => v + 1)}>
          {busy ? 'Detecting…' : 'Scan again'}
        </button>
      </div>
      <label className="brand-auto">
        <input
          type="checkbox"
          checked={automatic}
          onChange={(e) => {
            setAutomatic(e.target.checked);
            onAutomaticChange?.(e.target.checked);
          }}
        />
        Apply detected branding automatically
      </label>
      {!id && (
        <p className="muted">
          Connect a local app in Projects, then choose it here. You can also set branding below.
        </p>
      )}
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {result && (
        <>
          <p role="status">
            {result.evidence.length
              ? `${result.evidence.length} brand values detected across ${result.filesScanned} files.`
              : 'No static brand values detected. Native installations inherit platform colors; use Project theme for manual branding.'}
          </p>
          {!automatic && (
            <button disabled={!result.evidence.length} onClick={() => apply(result)}>
              Apply detected brand
            </button>
          )}
          <details>
            <summary>Detection evidence</summary>
            <ul className="brand-evidence">
              {result.evidence.map((e) => (
                <li key={e.field}>
                  <strong>{e.field}</strong>
                  <span>{String(e.value)}</span>
                  <small>
                    {e.file} · {e.token} · {e.confidence} confidence
                  </small>
                </li>
              ))}
            </ul>
            <p className="muted">{result.warnings.join(' ')}</p>
          </details>
        </>
      )}
    </section>
  );
}
