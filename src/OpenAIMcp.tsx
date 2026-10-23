import { useRef, useEffect, useState } from 'react';
import { Loader2, Plug } from 'lucide-react';
export default function OpenAIMcp({
  ready,
  onComplete,
}: {
  ready: boolean;
  onComplete: () => Promise<void>;
}) {
  const [goal, setGoal] = useState(''),
    [busy, setBusy] = useState(false),
    [steps, setSteps] = useState<{ tool: string; ok: boolean }[]>([]),
    [error, setError] = useState(''),
    [summary, setSummary] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function run(event: React.FormEvent) {
    event.preventDefault();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError('');
    setSummary('');
    setSteps([]);
    try {
      const response = await fetch('/api/connections/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error('Could not start the OpenAI MCP run.');
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = '',
        completed = false;
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + 1);
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === 'step') setSteps((current) => [...current, event]);
          if (event.type === 'error') throw new Error(event.error);
          if (event.type === 'result') {
            completed = true;
            setSummary(event.result.summary);
          }
        }
        if (done) break;
      }
      if (!completed)
        throw new Error(
          'Connection ended before completion. Check the shared inbox before retrying.',
        );
    } catch (e) {
      setError(
        controller.signal.aborted
          ? 'Run stopped. Any already saved components remain in the shared inbox.'
          : (e as Error).message,
      );
    } finally {
      pending.current = null;
      setBusy(false);
      await onComplete().catch(() => {});
    }
  }
  return (
    <section className="panel openai-mcp">
      <div className="connection-heading">
        <h2>
          <Plug size={19} /> OpenAI · local MCP host
        </h2>
        <span className="muted">{ready ? 'Server key configured' : 'Server key required'}</span>
      </div>
      <p className="muted">
        Ask OpenAI to capture a website or supplied HTML, identify missing behavior, build the
        frontend and API, and save a working package. Each tool call goes through MCP on this
        computer.
      </p>
      <form onSubmit={run}>
        <label htmlFor="mcp-goal">What should this component do?</label>
        <textarea
          id="mcp-goal"
          rows={4}
          value={goal}
          maxLength={12000}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Capture https://… and build … with persistent records. Save it to the Library."
          disabled={busy}
          required
        />
        <div className="connection-heading">
          <button className="primary" disabled={busy || !ready || !goal.trim()}>
            {busy ? <Loader2 size={17} className="spin" /> : <Plug size={17} />}Run with OpenAI
          </button>
          {busy && (
            <button type="button" onClick={() => pending.current?.abort()}>
              Stop run
            </button>
          )}
        </div>
      </form>
      <div aria-live="polite">
        {steps.map((step, i) => (
          <p key={i}>
            <code>{step.tool}</code> · {step.ok ? 'Completed' : 'Needs attention'}
          </p>
        ))}
        {busy && <p className="muted">OpenAI is choosing the next MCP tool…</p>}
        {summary && <p className="openai-summary">{summary}</p>}
      </div>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      <p className="connection-note">
        Uses your server OpenAI key and API quota. Only this run’s captures and control descriptions
        go to the model. Each run’s MCP credential is revoked when it ends. Review the shared result
        below, import it, then install through Projects.
      </p>
    </section>
  );
}
