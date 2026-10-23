import WorkingPreview from './WorkingPreview';
import { demoCatalog } from './commerce-catalog.js';
import { useEffect, useState } from 'react';
import {
  api,
  type ComponentItem,
  type FeaturePackage,
  type FeatureSpec,
  type Theme,
} from './model';

type Report = {
  fields: FeatureSpec['fields'];
  actions: FeatureSpec['actions'];
  blockers: string[];
  missing: string[];
  limitation: string;
};
const operations = {
  unresolved: 'Define behavior…',
  create: 'Save a new record',
  update: 'Update selected record',
  delete: 'Delete selected record',
  search: 'Search saved records',
  toggle: 'Persist an on/off state',
  increment: 'Increment a counter',
  navigate: 'Navigate to a destination',
  details: 'Show authored details',
  reset: 'Clear input fields',
  signin: 'Sign in with email/password',
  signup: 'Create an account',
  signout: 'Sign out',
  external: 'Call an external API',
};
export default function FeatureBuilder({
  item,
  theme,
  onBuilt,
}: {
  item: ComponentItem;
  theme: Theme;
  onBuilt: (bundle: FeaturePackage) => void;
}) {
  const [mode, setMode] = useState(item.feature?.spec.commerce ? 'product' : 'actions');
  const [catalog, setCatalog] = useState(() =>
    JSON.stringify(
      item.feature?.spec.commerce ||
        demoCatalog(
          new DOMParser()
            .parseFromString(item.html, 'text/html')
            .querySelector('h1,h2,h3')
            ?.textContent?.trim() || item.name,
        ),
      null,
      2,
    ),
  );
  const [report, setReport] = useState<Report | null>(null);
  const [fields, setFields] = useState<FeatureSpec['fields']>([]);
  const [actions, setActions] = useState<FeatureSpec['actions']>([]);
  const [bundle, setBundle] = useState<FeaturePackage | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [reviewed, setReviewed] = useState(false);
  const [authRequired, setAuthRequired] = useState(!!item.feature?.spec.authRequired);
  useEffect(() => {
    let current = true;
    setAuthRequired(!!item.feature?.spec.authRequired);
    api<Report>('/api/features/inspect', { html: item.html })
      .then((r) => {
        if (current) {
          setReport(r);
          setFields(item.feature?.spec.fields || r.fields);
          setActions(item.feature?.spec.actions || r.actions);
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [item.html, item.feature]);
  function edit(id: string, patch: Partial<FeatureSpec['actions'][number]>) {
    setActions((old) =>
      old.map((a) =>
        a.id === id
          ? {
              ...a,
              ...patch,
              ...(patch.operation === 'external' && !a.connection
                ? {
                    connection: {
                      url: '',
                      method: 'GET',
                      auth: 'bearer',
                      keyName: 'SERVICE_API_KEY',
                      inputMap: {},
                    },
                  }
                : {}),
            }
          : a,
      ),
    );
    setBundle(null);
    setReviewed(false);
  }
  function connection(
    id: string,
    patch: Partial<NonNullable<FeatureSpec['actions'][number]['connection']>>,
  ) {
    const current = actions.find((a) => a.id === id)?.connection;
    if (current) edit(id, { connection: { ...current, ...patch } });
  }
  async function build() {
    setError('');
    setBusy(true);
    setBundle(null);
    setReviewed(false);
    try {
      setBundle(
        await api('/api/features/build', {
          html: item.html,
          name: item.name,
          spec:
            mode === 'product'
              ? {
                  id: item.feature?.spec.id,
                  commerce: JSON.parse(catalog),
                  actions: report!.actions.map((a, i) => ({
                    ...a,
                    operation: i === 0 ? 'product-details' : 'product-options',
                  })),
                }
              : { id: item.feature?.spec.id, fields, actions, authRequired },
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel feature-builder">
      <div className="intro">
        <h2>Turn the capture into a working feature.</h2>
        <p>
          Define the missing behavior once. Keep the UI, API and storage together wherever you reuse
          it.
        </p>
      </div>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {!report ? (
        <p>Inspecting controls and missing logic…</p>
      ) : (
        <>
          <p>{report.limitation}</p>
          <details>
            <summary>Missing logic identified</summary>
            <ul>
              {report.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </details>
          {!!report.blockers.length && (
            <ul role="alert">
              {report.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          <div className="agent-tabs" role="group" aria-label="Feature type">
            <button
              aria-pressed={mode === 'actions'}
              onClick={() => {
                setMode('actions');
                setActions(report.actions);
                setBundle(null);
                setReviewed(false);
              }}
            >
              Actions & records
            </button>
            <button
              aria-pressed={mode === 'product'}
              onClick={() => {
                setMode('product');
                setBundle(null);
                setReviewed(false);
              }}
            >
              Product & cart
            </button>
          </div>
          {mode === 'product' ? (
            <>
              <h3>Own the whole product flow.</h3>
              <p>
                Details, model/finish/storage choices, priced cart and persistent demo orders run
                inside your destination app. Prices and stock are sample data you own.
              </p>
              <p className="muted">
                React + Vite only · one local shared cart · no payment or shipment. Each variant
                allows up to five units. Native product clients are not included.
              </p>
              <details>
                <summary>Edit product catalog and demo prices</summary>
                <label>
                  Product catalog JSON
                  <textarea
                    aria-label="Product catalog JSON"
                    value={catalog}
                    onChange={(e) => {
                      setCatalog(e.target.value);
                      setBundle(null);
                      setReviewed(false);
                    }}
                    rows={14}
                    maxLength={30000}
                  />
                </label>
              </details>
              {(report.fields.length > 0 || report.actions.length !== 2) && (
                <p className="error-banner">
                  Pick a product card with two calls to action and no form fields.
                </p>
              )}
              <button
                className="primary"
                disabled={busy || report.fields.length > 0 || report.actions.length !== 2}
                onClick={() => void build()}
              >
                {busy ? 'Building product and cart…' : 'Build product + cart'}
              </button>
            </>
          ) : (
            <>
              <label className="acknowledge">
                <input
                  type="checkbox"
                  disabled={
                    busy ||
                    actions.some((a) =>
                      ['signin', 'signup', 'signout', 'external'].includes(a.operation),
                    )
                  }
                  checked={
                    authRequired ||
                    actions.some((a) =>
                      ['signin', 'signup', 'signout', 'external'].includes(a.operation),
                    )
                  }
                  onChange={(e) => {
                    setAuthRequired(e.target.checked);
                    setBundle(null);
                    setReviewed(false);
                  }}
                />{' '}
                Require sign-in · isolate saved records by account
              </label>
              {(authRequired ||
                actions.some((a) =>
                  ['signin', 'signup', 'signout', 'external'].includes(a.operation),
                )) && (
                <p className="muted">
                  Local email/password accounts. Existing public records are preserved separately;
                  they are not automatically assigned to an account. Email verification, password
                  recovery and MFA are not enabled.
                </p>
              )}
              {!actions.length && (
                <p>
                  This capture has no actions. Keep it as a presentation component, or add an action
                  through Edit HTML before building behavior.
                </p>
              )}
              {!!fields.length && (
                <fieldset disabled={busy}>
                  <legend>Data and validation</legend>
                  {fields.map((f) => (
                    <label className="feature-field" key={f.id}>
                      <span>
                        {f.label}{' '}
                        <small>
                          {f.id} · {f.type}
                        </small>
                      </span>
                      <span>
                        <input
                          type="checkbox"
                          checked={f.required}
                          onChange={(e) => {
                            setFields((old) =>
                              old.map((x) =>
                                x.id === f.id ? { ...x, required: e.target.checked } : x,
                              ),
                            );
                            setBundle(null);
                            setReviewed(false);
                          }}
                        />{' '}
                        Required
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              <fieldset disabled={busy}>
                <legend>What should each captured action do?</legend>
                {actions.map((a) => (
                  <div className="feature-action" key={a.id}>
                    <label>
                      <strong>{a.label}</strong>
                      <small>
                        {a.id} · {a.reason || 'Reviewed behavior'}
                      </small>
                      <select
                        aria-label={`Behavior for ${a.label}`}
                        value={a.operation}
                        onChange={(e) => edit(a.id, { operation: e.target.value })}
                      >
                        {Object.entries(operations).map(([id, label]) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {a.operation === 'navigate' && (
                      <label>
                        Destination URL
                        <input
                          value={a.target}
                          onChange={(e) => edit(a.id, { target: e.target.value })}
                        />
                      </label>
                    )}
                    {a.operation === 'details' && (
                      <label>
                        Details content
                        <textarea
                          value={a.message}
                          onChange={(e) => edit(a.id, { message: e.target.value })}
                          maxLength={2000}
                        />
                      </label>
                    )}
                    {a.operation === 'external' && a.connection && (
                      <div className="api-connection">
                        <label>
                          HTTPS endpoint for {a.label}
                          <input
                            type="url"
                            value={a.connection.url}
                            onChange={(e) => connection(a.id, { url: e.target.value })}
                            placeholder="https://api.example.com/search"
                          />
                        </label>
                        <label>
                          Method for {a.label}
                          <select
                            value={a.connection.method}
                            onChange={(e) => connection(a.id, { method: e.target.value })}
                          >
                            <option>GET</option>
                            <option>POST</option>
                          </select>
                        </label>
                        <label>
                          API authentication for {a.label}
                          <select
                            value={a.connection.auth}
                            onChange={(e) => connection(a.id, { auth: e.target.value })}
                          >
                            <option value="none">No API key</option>
                            <option value="bearer">Bearer token</option>
                            <option value="x-api-key">X-API-Key header</option>
                          </select>
                        </label>
                        {a.connection.auth !== 'none' && (
                          <label>
                            API key name for {a.label}
                            <input
                              value={a.connection.keyName}
                              onChange={(e) => connection(a.id, { keyName: e.target.value })}
                              placeholder="SERVICE_API_KEY"
                            />
                          </label>
                        )}
                        {fields
                          .filter((f) => f.type !== 'password')
                          .map((f) => (
                            <label key={f.id}>
                              Request parameter for {f.label}
                              <input
                                value={
                                  Object.entries(a.connection!.inputMap).find(
                                    ([, id]) => id === f.id,
                                  )?.[0] || ''
                                }
                                placeholder="Leave empty to omit"
                                onChange={(e) => {
                                  const map = Object.fromEntries(
                                    Object.entries(a.connection!.inputMap).filter(
                                      ([, id]) => id !== f.id,
                                    ),
                                  );
                                  if (e.target.value) map[e.target.value] = f.id;
                                  connection(a.id, { inputMap: map });
                                }}
                              />
                            </label>
                          ))}
                        <p>
                          GET sends mapped fields as query parameters; POST sends JSON. Users add
                          their own key after installation in Account &amp; API keys. Keys never
                          enter this package. Only public HTTPS endpoints are allowed. Review POST
                          actions before invoking them.
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </fieldset>
              <p className="muted">
                Records use this component’s fields. Update and delete act on a selected record.
                Counters and on/off states persist. Install into React + Vite, SwiftUI or Android
                Compose. Native clients connect to the included Node 24+ backend.
              </p>
              <button
                className="primary"
                disabled={
                  busy ||
                  !actions.length ||
                  !!report.blockers.length ||
                  actions.some((a) => a.operation === 'unresolved')
                }
                onClick={() => void build()}
              >
                {busy ? 'Building and checking source…' : 'Generate frontend + backend'}
              </button>
            </>
          )}
        </>
      )}
      {bundle && (
        <div className="feature-result">
          <h3>Review your feature package</h3>
          <p>
            {(bundle.bytes / 1024).toFixed(1)} KB · {Object.keys(bundle.files).length} files · no
            added dependencies
          </p>
          {bundle.review && (
            <details open>
              <summary>Source checks completed</summary>
              <p>
                {bundle.review.analysis.engine} · {bundle.review.analysis.files.length} frontend,
                backend and schema files analyzed. Ponytail structural checks:{' '}
                {bundle.review.policy.status}. Copy Polish: {bundle.review.copy.edits} wording
                suggestions.
              </p>
              <p className="muted">{bundle.review.analysis.limitation}</p>
              <small>Evidence: {bundle.review.analysis.evidenceId}</small>
            </details>
          )}
          <ul>
            {bundle.requirements.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {Object.entries(bundle.files).map(([file, code]) => (
            <details key={file}>
              <summary>{file}</summary>
              <pre tabIndex={0}>{code}</pre>
            </details>
          ))}
          <WorkingPreview key={bundle.builtAt} item={{ ...item, feature: bundle }} theme={theme} />
          <label className="acknowledge">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />{' '}
            I reviewed the behavior, code and local storage requirements.
          </label>
          <button className="primary" disabled={!reviewed} onClick={() => onBuilt(bundle)}>
            Save full feature to clipboard
          </button>
        </div>
      )}
    </section>
  );
}
