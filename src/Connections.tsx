import OpenAIMcp from './OpenAIMcp';
import { useEffect, useState } from 'react';
import { ArrowRight, Check, Copy, Plug, ShieldCheck, Trash2 } from 'lucide-react';
import { api, download, type ComponentItem } from './model';
import './connections.css';

interface Client {
  id: string;
  name: string;
  scopes: string[];
  revoked: boolean;
  createdAt: string;
}
interface State {
  clients: Client[];
  inbox: { id: string; item: ComponentItem; at: string }[];
  activity: { id: string; client: string; tool: string; ok: boolean; at: string }[];
  scopes: Record<string, string>;
  endpoint: string;
  command: string;
  bridge: string;
  port: number;
  openAI: boolean;
}
export default function Connections({
  active,
  onSave,
  onProjects,
}: {
  active: ComponentItem;
  onSave: (item: ComponentItem) => boolean;
  onProjects: () => void;
}) {
  const [state, setState] = useState<State | null>(null),
    [name, setName] = useState(''),
    [scopes, setScopes] = useState(['library']),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [credential, setCredential] = useState<{ client: Client; token: string } | null>(null),
    [reveal, setReveal] = useState(false),
    [inspecting, setInspecting] = useState<string | null>(null);
  async function refresh() {
    setState(await api<State>('/api/connections'));
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/connections', { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error('Could not load connections.');
        return r.json();
      })
      .then(setState)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  async function task(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const config =
    credential && state
      ? JSON.stringify(
          {
            mcpServers: {
              reframe: {
                command: state.command,
                args: [state.bridge],
                env: { REFRAME_PORT: String(state.port), REFRAME_MCP_TOKEN: credential.token },
              },
            },
          },
          null,
          2,
        )
      : '';
  return (
    <div className="connections-page">
      <div className="intro">
        <h2>Your assistants. One shared workspace.</h2>
        <p>
          Give compatible AI assistants a direct connection to Reframe’s tools. You choose their
          permissions and what to share.
        </p>
      </div>
      <OpenAIMcp ready={!!state?.openAI} onComplete={refresh} />
      <div className="connection-layout">
        <section className="panel connection-create">
          <div className="connection-heading">
            <Plug size={21} />
            <h2>Connect an assistant</h2>
          </div>
          <p className="muted">
            OpenAI / ChatGPT, Dots, Grok Bot or another MCP client. Support depends on the client’s
            connection options.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void task(async () => {
                setCredential(await api('/api/connections/create', { name, scopes }));
                setReveal(false);
                setMessage(
                  'Connection created. Save its credential now; it is shown only in this session.',
                );
              });
            }}
          >
            <label>
              Assistant name
              <input
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. My OpenAI assistant"
                required
                disabled={busy}
              />
            </label>
            <fieldset disabled={busy}>
              <legend>Permissions</legend>
              {Object.entries(state?.scopes || {}).map(([id, label]) => (
                <label className="connection-permission" key={id}>
                  <input
                    type="checkbox"
                    checked={scopes.includes(id)}
                    onChange={(e) =>
                      setScopes((current) =>
                        e.target.checked ? [...current, id] : current.filter((s) => s !== id),
                      )
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            <button className="primary" disabled={busy || !state || !name.trim() || !scopes.length}>
              <Plug size={16} />
              Create connection
            </button>
          </form>
          <div className="connection-boundary">
            <ShieldCheck size={18} />
            <p>
              No provider keys, account records or automatic project installation. Revoke a
              connection at any time. Only explicitly shared components are visible.
            </p>
          </div>
        </section>
        <section className="panel connection-setup">
          <h2>{credential ? 'Finish connecting' : 'A standard connection, on your terms.'}</h2>
          <ol>
            <li>Create a named connection with the permissions it needs.</li>
            <li>Add the generated MCP configuration to your local assistant.</li>
            <li>
              Ask it to find, capture or build a component, then save to Reframe’s shared clipboard.
            </li>
            <li>Review the result here, import it, and use Projects to install it.</li>
          </ol>
          {credential && state && (
            <div className="connection-credential">
              <p>
                <strong>{credential.client.name}</strong> · credential shown once
              </p>
              <label>
                Local HTTP MCP endpoint
                <input readOnly value={state.endpoint} />
              </label>
              <label>
                Bearer token
                <input
                  aria-label="Connection bearer token"
                  readOnly
                  type={reveal ? 'text' : 'password'}
                  value={credential.token}
                  autoComplete="off"
                />
              </label>
              <button onClick={() => setReveal(!reveal)}>
                {reveal ? 'Hide credential' : 'Show credential'}
              </button>
              <button
                onClick={() =>
                  void task(async () => {
                    await navigator.clipboard.writeText(config);
                    setMessage(
                      'MCP configuration copied. It includes this connection’s credential.',
                    );
                  })
                }
              >
                <Copy size={15} />
                Copy local MCP config
              </button>
              <button onClick={() => download('reframe-mcp.json', config, 'application/json')}>
                Download config
              </button>
              <details>
                <summary>Local MCP configuration</summary>
                <pre>
                  {reveal ? config : 'Show credential to inspect the complete configuration.'}
                </pre>
              </details>
              <button
                onClick={() => {
                  setCredential(null);
                  setReveal(false);
                }}
              >
                Done — hide credential
              </button>
            </div>
          )}
          <p className="connection-note">
            Reframe stays on this computer. Local HTTP and stdio clients can connect. A remote/cloud
            assistant cannot reach your localhost directly; use its supported secure local bridge.
            The built-in host above calls OpenAI from this computer. Other assistants use their
            supported local bridge.
          </p>
        </section>
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="connection-message" role="status">
          <Check size={16} />
          {message}
        </p>
      )}
      <section className="panel">
        <div className="connection-heading">
          <h2>Connected assistants</h2>
          <button disabled={busy} onClick={() => void task(refresh)}>
            Refresh status
          </button>
        </div>
        {!state?.clients.some((c) => !c.revoked) ? (
          <p className="muted">No active connections. Your workspace is private.</p>
        ) : (
          <div className="connection-clients">
            {state.clients
              .filter((c) => !c.revoked)
              .map((client) => (
                <article key={client.id}>
                  <div>
                    <h3>{client.name}</h3>
                    <p>{client.scopes.map((scope) => state.scopes[scope]).join(' · ')}</p>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void task(async () => {
                        await api('/api/connections/revoke', { id: client.id });
                        if (credential?.client.id === client.id) setCredential(null);
                        setMessage('Connection revoked. Future requests will be rejected.');
                      })
                    }
                  >
                    Revoke
                  </button>
                </article>
              ))}
          </div>
        )}
      </section>
      <section className="panel">
        <div className="connection-heading">
          <div>
            <h2>Shared clipboard</h2>
            <p className="muted">
              Separate from your private browser clipboard. Imported items keep their complete
              behavior package.
            </p>
          </div>
          <button
            disabled={busy}
            onClick={() =>
              void task(async () => {
                await api('/api/connections/share', { item: active });
                setMessage(
                  `${active.name} shared. Assistants with clipboard permission can read it.`,
                );
              })
            }
          >
            Share selected component
          </button>
        </div>
        <p className="muted">Selected in Studio: {active.name}</p>
        {!state?.inbox.length ? (
          <p className="connection-empty">
            Nothing shared yet. Save a result from your assistant, or share the selected component.
          </p>
        ) : (
          <div className="connection-inbox">
            {state.inbox.map((entry) => (
              <article key={entry.id}>
                <div>
                  <h3>{entry.item.name}</h3>
                  <p>
                    {entry.item.feature
                      ? `${entry.item.feature.spec.actions.length} declared actions · frontend + backend`
                      : entry.item.libraryId
                        ? 'Original · web / iOS / Android source'
                        : 'Captured presentation · inspect missing behavior before use'}
                  </p>
                  <button
                    aria-expanded={inspecting === entry.id}
                    onClick={() => setInspecting(inspecting === entry.id ? null : entry.id)}
                  >
                    Review shared component
                  </button>
                </div>
                <div className="connection-inbox-actions">
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (onSave({ ...entry.item, id: 'shared-' + crypto.randomUUID() }))
                        setMessage(
                          'Imported as a new clipboard item. Open Projects to check its fit and source.',
                        );
                    }}
                  >
                    Import to clipboard
                  </button>
                  <button
                    disabled={busy}
                    aria-label={`Remove shared ${entry.item.name}`}
                    onClick={() =>
                      void task(async () => {
                        await api('/api/connections/remove', { id: entry.id });
                        setMessage(
                          'Removed from the shared inbox. Private clipboard copies remain.',
                        );
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                {inspecting === entry.id && (
                  <details open className="shared-source">
                    <summary>Captured HTML & behavior</summary>
                    <pre>{entry.item.html}</pre>
                    {entry.item.feature && (
                      <>
                        <h4>Declared actions</h4>
                        <ul>
                          {entry.item.feature.spec.actions.map((action) => (
                            <li key={action.id}>
                              {action.label} → {action.operation}
                            </li>
                          ))}
                        </ul>
                        <h4>Generated files</h4>
                        <ul>
                          {Object.keys(entry.item.feature.files).map((file) => (
                            <li key={file}>{file}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </details>
                )}
              </article>
            ))}
          </div>
        )}
        <button className="text-button" onClick={onProjects}>
          Open Projects for fit & installation
          <ArrowRight size={15} />
        </button>
      </section>
      <section className="panel">
        <h2>Recent tool activity</h2>
        <p className="muted">
          Tool names and outcomes only. Credentials, prompts and component contents are excluded.
        </p>
        {!state?.activity.length ? (
          <p className="muted">No tool calls yet.</p>
        ) : (
          <ul className="connection-activity">
            {state.activity.slice(0, 12).map((event) => (
              <li key={event.id}>
                <span>{event.client}</span>
                <code>{event.tool}</code>
                <span className={event.ok ? '' : 'connection-failed'}>
                  {event.ok ? 'Completed' : 'Needs attention'}
                </span>
                <time>{new Date(event.at).toLocaleTimeString()}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
