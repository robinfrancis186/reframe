import AgentAvatar, { agentMood } from './AgentAvatar';
import { useEffect, useRef, useState } from 'react';
import { Play, Square, Plus, Trash2, Download } from 'lucide-react';
import { download } from './model';
type Step = { action: string; by: string; name: string; value: string };
type Result = {
  status: string;
  steps: { index: number; status: string; error?: string }[];
  errors: string[];
  warnings: string[];
  blocked: number;
  screenshot: string | null;
  limitation: string;
};
const example: Step[] = [
  { action: 'fill', by: 'label', name: 'Search projects', value: 'brand' },
  { action: 'click', by: 'button', name: 'Brand guidelines', value: '' },
  { action: 'visible', by: 'text', name: 'Selected: Brand guidelines', value: '' },
];
export default function BrowserTesting({
  onStatus,
  initialTarget,
}: {
  onStatus: (status: string) => void;
  initialTarget?: string;
}) {
  const [targets, setTargets] = useState<{ id: string; name: string; url: string }[]>([]),
    [target, setTarget] = useState(initialTarget || 'haven'),
    [viewport, setViewport] = useState('desktop'),
    [steps, setSteps] = useState<Step[]>(
      initialTarget ? [{ action: 'visible', by: 'text', name: '', value: '' }] : example,
    ),
    [allowWrites, setAllowWrites] = useState(!!initialTarget);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [statuses, setStatuses] = useState<Record<number, string>>({}),
    [result, setResult] = useState<Result | null>(null);
  const report = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (result) report.current?.focus();
  }, [result]);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/testing/targets', { signal: abort.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error('Could not load test targets.');
        return r.json();
      })
      .then(setTargets)
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => {
      abort.abort();
      controller.current?.abort();
    };
  }, []);
  function edit() {
    setResult(null);
    setStatuses({});
    setMessage('');
    setError('');
  }
  function update(index: number, key: keyof Step, value: string) {
    edit();
    setSteps((old) => old.map((s, i) => (i === index ? { ...s, [key]: value } : s)));
  }
  async function run() {
    edit();
    setBusy(true);
    onStatus('running');
    const abort = new AbortController();
    controller.current = abort;
    try {
      const response = await fetch('/api/testing/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, viewport, allowWrites, steps }),
        signal: abort.signal,
      });
      if (!response.ok || !response.body) throw new Error('Could not start browser testing.');
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = '',
        complete = false;
      function event(line: string) {
        if (!line.trim()) return;
        const e = JSON.parse(line);
        if (e.type === 'error') throw new Error(e.error);
        if (e.type === 'progress') setMessage(e.message);
        if (e.type === 'step') {
          setStatuses((old) => ({ ...old, [e.index]: e.status }));
          setMessage(`Step ${e.index + 1} · ${e.status}`);
        }
        if (e.type === 'result') {
          onStatus(e.result.status);
          setResult(e.result);
          setMessage(`Sentry finished · ${e.result.status.replaceAll('-', ' ')}`);
          complete = true;
        }
      }
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        lines.forEach(event);
        if (done) break;
      }
      if (buffer) event(buffer);
      if (!complete) throw new Error('The test ended without a report.');
    } catch (e) {
      onStatus('stopped');
      abort.abort();
      setStatuses((old) =>
        Object.fromEntries(
          Object.entries(old).map(([k, v]) => [k, v === 'running' ? 'stopped' : v]),
        ),
      );
      setError(
        (e as Error).name === 'AbortError'
          ? 'Cancelled. Completed backend changes are not rolled back.'
          : (e as Error).message,
      );
      setMessage('Test stopped.');
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }
  return (
    <section className="panel browser-testing" aria-label="Playwright testing">
      <div className={'test-host ' + (busy ? 'working' : '')}>
        <AgentAvatar
          id="sentry"
          name="Sentry"
          size={80}
          mood={busy ? 'working' : error ? 'error' : agentMood(result?.status)}
        />
        <div>
          <h3>Sentry’s browser lab</h3>
          <p>
            Real Playwright checks against a running demo. Write what a user should do, then the
            visible result they should see.
          </p>
        </div>
      </div>
      <fieldset disabled={busy}>
        <div className="test-options">
          <label>
            Running app
            <select
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                edit();
              }}
            >
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Viewport
            <select
              value={viewport}
              onChange={(e) => {
                setViewport(e.target.value);
                edit();
              }}
            >
              <option value="desktop">Desktop · 1280 × 900</option>
              <option value="mobile">Mobile · 390 × 844</option>
            </select>
          </label>
        </div>
        <p className="agent-caption">
          {targets.find((t) => t.id === target)?.url} · Start the app before running. A fresh
          browser is used each time. External services and popups are blocked.
        </p>
        <details>
          <summary>How to write a test</summary>
          <p>
            Use exact visible labels. Choose Fill + Label for an input, Click + Button for an
            action, then Visible + Text for the expected outcome. Duplicate names fail instead of
            choosing an arbitrary element. Don’t put passwords or API keys in steps. A passing test
            covers only your assertions.
          </p>
          <a href="https://playwright.dev/docs/locators" target="_blank" rel="noreferrer">
            Playwright locator guide ↗
          </a>
        </details>
        <button
          onClick={() => {
            setTarget('haven');
            setSteps(example);
            setAllowWrites(false);
            edit();
          }}
        >
          Load Haven search example
        </button>
        <ol className="test-steps">
          {steps.map((step, index) => (
            <li key={index}>
              <div className="test-step-head">
                <strong>Step {index + 1}</strong>
                <span>{statuses[index] || 'Ready'}</span>
                <button
                  aria-label={`Remove step ${index + 1}`}
                  disabled={steps.length === 1}
                  onClick={() => {
                    setSteps((old) => old.filter((_, i) => i !== index));
                    edit();
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="test-options">
                <label>
                  Action
                  <select
                    aria-label={`Step ${index + 1} action`}
                    value={step.action}
                    onChange={(e) => update(index, 'action', e.target.value)}
                  >
                    {['visible', 'click', 'fill', 'press'].map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Find by
                  <select
                    aria-label={`Step ${index + 1} locator`}
                    value={step.by}
                    onChange={(e) => update(index, 'by', e.target.value)}
                  >
                    {['label', 'button', 'text', 'placeholder'].map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Exact label or text
                <input
                  aria-label={`Step ${index + 1} name`}
                  value={step.name}
                  maxLength={200}
                  onChange={(e) => update(index, 'name', e.target.value)}
                />
              </label>
              {['fill', 'press'].includes(step.action) && (
                <label>
                  {step.action === 'fill'
                    ? 'Value'
                    : 'Key (Enter, Tab, Escape, Space, ArrowDown, ArrowUp)'}
                  <input
                    aria-label={`Step ${index + 1} value`}
                    value={step.value}
                    maxLength={500}
                    onChange={(e) => update(index, 'value', e.target.value)}
                  />
                </label>
              )}
            </li>
          ))}
        </ol>
        <button
          disabled={steps.length >= 12}
          onClick={() => {
            setSteps((old) => [...old, { action: 'visible', by: 'text', name: '', value: '' }]);
            edit();
          }}
        >
          <Plus size={14} /> Add step
        </button>
        <label className="test-write">
          <input
            type="checkbox"
            checked={allowWrites}
            onChange={(e) => {
              setAllowWrites(e.target.checked);
              edit();
            }}
          />{' '}
          Allow real backend changes in this demo.{' '}
          {initialTarget
            ? 'This preview’s data is removed when stopped.'
            : 'Test data is not automatically removed.'}
        </label>
        <button
          className="primary"
          disabled={!targets.length || steps.some((s) => !s.name.trim())}
          onClick={() => void run()}
        >
          <Play size={15} /> Run Playwright test
        </button>
      </fieldset>
      {busy && (
        <button onClick={() => controller.current?.abort()}>
          <Square size={14} /> Cancel test
        </button>
      )}
      <p role="status">{message}</p>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {result && (
        <div className="test-report" ref={report} tabIndex={-1} aria-label="Browser test report">
          <h4>
            {result.status === 'passed-with-issues'
              ? 'Steps passed · page issues need review'
              : `Test ${result.status}`}
          </h4>
          <p>
            {result.steps.filter((s) => s.status === 'passed').length} of {steps.length} steps
            passed · {result.errors.length} errors · {result.blocked} blocked requests
          </p>
          {result.steps
            .filter((s) => s.error)
            .map((s) => (
              <p key={s.index}>
                Step {s.index + 1}: {s.error}
              </p>
            ))}
          {[...result.errors, ...result.warnings].map((e, i) => (
            <p key={i}>{e}</p>
          ))}
          <p className="agent-caption">{result.limitation}</p>
          <button
            onClick={() =>
              download(
                'reframe-browser-test.json',
                JSON.stringify(result, null, 2),
                'application/json',
              )
            }
          >
            <Download size={14} /> Export test report
          </button>
          {result.screenshot && (
            <img src={result.screenshot} alt="Final viewport captured by the Playwright test" />
          )}
        </div>
      )}
    </section>
  );
}
