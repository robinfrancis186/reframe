import { useEffect, useState } from 'react';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { libraryEntry, libraryItem } from './library/catalog';
import type { ComponentItem } from './model';
import './suggestions.css';
import { readProjectBrief, writeProjectBrief } from './project-context.js';

interface Suggestion {
  id: string;
  libraryId: string | null;
  itemId: string | null;
  name: string;
  category: string;
  origin: string;
  score: number;
  reasons: string[];
  requirements: string[];
  readiness: string;
}
interface Report {
  recommendations: Suggestion[];
  framework: string;
  brandName: string;
  signals: string[];
  warnings: string[];
  inspected: { path: string }[];
  totalScreens: number;
  considered: number;
  limited: boolean;
  limitation: string;
  provider: string;
  model?: string;
  purpose?: string;
  existingUI?: string[];
  missingFeatures?: string[];
  questions?: string[];
}
export default function ProjectSuggestions({
  projectId,
  file,
  version,
  items,
  appearance,
  selectedId,
  disabled,
  onPick,
  onSave,
}: {
  projectId: string;
  file: string;
  version?: string;
  items: ComponentItem[];
  appearance: string;
  selectedId: string;
  disabled: boolean;
  onPick: (item: ComponentItem) => void;
  onSave: (item: ComponentItem) => boolean;
}) {
  const [brief] = useState(() => readProjectBrief(projectId));
  const [goal, setGoal] = useState(brief.goal),
    [result, setResult] = useState<{ key: string; report: Report } | null>(null);
  const [error, setError] = useState(''),
    [briefError, setBriefError] = useState('');
  const [purpose, setPurpose] = useState(brief.purpose),
    [provider, setProvider] = useState('openai'),
    [configured, setConfigured] = useState(false),
    [checked, setChecked] = useState(false),
    [apiKey, setApiKey] = useState(''),
    [loading, setLoading] = useState(false);
  const [request, setRequest] = useState<{ key: string; body: string } | null>(null);
  useEffect(() => {
    if (!projectId) return;
    try {
      writeProjectBrief(projectId, { purpose, goal });
      setBriefError('');
    } catch {
      setBriefError('Project purpose could not be remembered in this browser.');
    }
  }, [projectId, purpose, goal]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/agents/status', { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error('Could not check model configuration.');
        return r.json();
      })
      .then((data) => {
        setConfigured(data.openAI);
        setChecked(true);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setChecked(true);
          setError(e.message);
        }
      });
    return () => controller.abort();
  }, []);
  // Summaries keep generated source, records, images and credentials out of this request.
  const clipboard = items
    .slice(0, 200)
    .map((item) => ({
      id: item.id,
      name: item.name,
      html: item.html.slice(0, 6000),
      libraryId: item.libraryId,
      backend: !!item.feature,
      featureId: item.feature?.spec.id,
      service: !!item.feature?.spec.actions.some((action) => action.operation === 'external'),
    }));
  const body = JSON.stringify({
    id: projectId,
    file,
    goal,
    purpose,
    provider,
    clipboard,
    appearance,
  });
  const key = JSON.stringify([body, version]);
  useEffect(() => {
    if (projectId && checked && provider === 'local') setRequest({ key, body });
  }, [key, projectId, checked, provider]);
  useEffect(() => {
    setLoading(false);
    if (!request) return;
    if (request.key !== key) {
      setRequest(null);
      return;
    }
    setError('');
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      fetch('/api/projects/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: request.body,
        signal: controller.signal,
      })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Suggestions could not be loaded.');
          return data as Report;
        })
        .then((report) => {
          if (!controller.signal.aborted) setResult({ key, report });
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false);
            setRequest(null);
          }
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [request, key]);
  const report = result?.key === key ? result.report : null;
  return (
    <section
      className="panel project-suggestions"
      aria-labelledby="suggestions-heading"
      aria-busy={loading}
    >
      <div className="suggestions-heading">
        <div>
          <span className="eyebrow">
            <Sparkles size={14} /> FROM YOUR LIBRARY
          </span>
          <h2 id="suggestions-heading">The right pieces for this project.</h2>
          <p className="muted">
            Suggestions from Originals and your clipboard, based on the destination source and your
            goal.
          </p>
        </div>
        {projectId && (
          <button
            disabled={
              disabled ||
              loading ||
              !checked ||
              (provider === 'openai' && !configured && !apiKey.trim())
            }
            onClick={() => {
              setRequest({
                key,
                body: apiKey ? JSON.stringify({ ...JSON.parse(body), apiKey }) : body,
              });
              setApiKey('');
            }}
          >
            {loading ? 'Atlas is thinking…' : 'Suggest components'}
          </button>
        )}
      </div>
      {!projectId ? (
        <p className="muted">
          Choose a destination above. Atlas can read its purpose, existing UI and possible missing
          features.
        </p>
      ) : (
        <>
          <div className="suggestions-settings">
            <label>
              Decision model
              <select
                aria-label="Suggestion decision model"
                value={provider}
                disabled={disabled}
                onChange={(e) => {
                  setProvider(e.target.value);
                  setApiKey('');
                  setRequest(null);
                }}
              >
                <option value="openai">OpenAI · Atlas</option>
                <option value="local">Local matching · no AI inference</option>
              </select>
            </label>
            <label>
              Project purpose <span className="muted">Optional</span>
              <input
                aria-label="Project purpose"
                maxLength={1500}
                value={purpose}
                disabled={disabled}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="Who is this product for, and what should it help them do?"
              />
            </label>
          </div>
          {provider === 'openai' && (
            <div className="suggestions-provider">
              <p className="muted">
                Atlas sends bounded visible-source text, branding and component summaries to OpenAI
                when you choose Suggest components. Editing your brief makes no paid model requests.
                Source files, backend packages and saved credentials are excluded.{' '}
                {configured
                  ? 'The server key is configured.'
                  : 'Add a key for one request, or configure OPENAI_API_KEY on the server.'}
              </p>
              {!configured && (
                <label>
                  OpenAI key for this suggestion
                  <input
                    aria-label="Suggestion OpenAI API key"
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Used once, then cleared"
                    maxLength={1000}
                  />
                </label>
              )}
            </div>
          )}
          <label className="suggestions-goal">
            What would you like to add? <span className="muted">Optional</span>
            <input
              aria-label="Component suggestion goal"
              maxLength={500}
              placeholder="e.g. Booking and dates, or analytics without external APIs"
              value={goal}
              disabled={disabled}
              onChange={(e) => setGoal(e.target.value)}
            />
          </label>
          <p className="project-brief-status">
            {briefError || 'Purpose and goal are remembered for this project on this computer.'}
          </p>
          {error ? (
            <p role="alert" className="error-banner">
              {error}{' '}
              {provider === 'openai' && (
                <button onClick={() => setProvider('local')}>Use local matching explicitly</button>
              )}
            </p>
          ) : !report ? (
            <p role="status" className="muted">
              {loading
                ? 'Finding useful components…'
                : provider === 'openai'
                  ? result
                    ? 'Project context changed. Suggest again to refresh the results.'
                    : 'Choose Suggest components when your project brief is ready. Local matching updates automatically without AI.'
                  : 'Finding local matches…'}
            </p>
          ) : (
            <>
              <p className="suggestions-context" role="status">
                {report.recommendations.length} suggestions · {report.inspected.length} of{' '}
                {report.totalScreens} screens sampled · {report.framework} · {report.brandName}{' '}
                <span>
                  {report.model
                    ? `OpenAI · ${report.model}`
                    : report.provider === 'openai'
                      ? 'No model request'
                      : 'Local matching'}
                </span>
              </p>
              {report.purpose && (
                <details className="suggestions-understanding" open>
                  <summary>Atlas’s project read</summary>
                  <p>{report.purpose}</p>
                  <div>
                    {[
                      ['Existing UI', report.existingUI],
                      ['Possible missing features', report.missingFeatures],
                      ['Questions to resolve', report.questions],
                    ].map(([title, values]) =>
                      Array.isArray(values) && values.length > 0 ? (
                        <section key={String(title)}>
                          <h3>{String(title)}</h3>
                          <ul>
                            {values.map((value) => (
                              <li key={value}>{value}</li>
                            ))}
                          </ul>
                        </section>
                      ) : null,
                    )}
                  </div>
                </details>
              )}
              {report.limited && report.provider !== 'openai' && (
                <p className="muted">
                  Limited intent evidence in this sample.{' '}
                  {goal.trim()
                    ? 'Try naming a task such as booking, search, analytics or onboarding.'
                    : 'Add a goal to make these suggestions more useful.'}
                </p>
              )}
              {report.warnings.map((warning) => (
                <p className="suggestions-warning" key={warning}>
                  {warning}
                </p>
              ))}
              <div className="suggestions-grid">
                {report.recommendations.map((suggestion) => {
                  const saved = suggestion.itemId
                    ? items.find((item) => item.id === suggestion.itemId)
                    : undefined;
                  const entry = suggestion.libraryId
                    ? libraryEntry(suggestion.libraryId)
                    : undefined;
                  const candidate = saved || (entry ? libraryItem(entry) : undefined),
                    selected = candidate?.id === selectedId;
                  return (
                    <article
                      className={`suggestion-card ${selected ? 'selected' : ''}`}
                      key={`${suggestion.origin}:${suggestion.id}`}
                    >
                      <div className="suggestion-meta">
                        <span>
                          {suggestion.origin === 'clipboard' ? 'Your clipboard' : 'Originals'} ·{' '}
                          {suggestion.category}
                        </span>
                        <span className="suggestion-score">
                          <strong>{suggestion.score}</strong>
                          <small>/100 {report.model ? 'AI relevance' : 'relevance'}</small>
                        </span>
                      </div>
                      <h3>{suggestion.name}</h3>
                      <p className="suggestion-readiness">{suggestion.readiness}</p>
                      <ul>
                        {suggestion.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                      {suggestion.requirements.length > 0 && (
                        <details>
                          <summary>Setup needed · {suggestion.requirements.length}</summary>
                          <ul>
                            {suggestion.requirements.map((requirement) => (
                              <li key={requirement}>{requirement}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                      <button
                        aria-pressed={selected}
                        disabled={disabled || !candidate}
                        onClick={() => {
                          if (candidate) onPick(candidate);
                        }}
                      >
                        {selected ? <Check size={15} /> : <ArrowRight size={15} />}{' '}
                        {selected ? 'Selected for destination' : `Use ${suggestion.name}`}
                      </button>
                      <button
                        className="suggestion-save"
                        disabled={disabled || !candidate || !!saved}
                        onClick={() => {
                          if (candidate) onSave(candidate);
                        }}
                      >
                        {saved ? 'Saved in clipboard' : `Save ${suggestion.name} to clipboard`}
                      </button>
                    </article>
                  );
                })}
              </div>
              {!report.recommendations.length && (
                <p role="status">
                  No suitable components found for this screen and goal. Choose another screen or
                  adjust your goal.
                </p>
              )}
              <details className="suggestions-evidence">
                <summary>How these suggestions work</summary>
                <p>
                  {report.limitation} Relevance is separate from the Project fit score below.
                  Selecting a suggestion opens its destination preview; installation still requires
                  source review.
                </p>
                <p>
                  Sampled: {report.inspected.map((screen) => screen.path).join(', ')}. Compared{' '}
                  {report.considered} library and clipboard candidates.{' '}
                  {items.length > 200
                    ? 'Only the first 200 clipboard entries were considered.'
                    : ''}
                </p>
              </details>
            </>
          )}
        </>
      )}
    </section>
  );
}
