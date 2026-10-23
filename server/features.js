import { validateCatalog } from './features/commerce.mjs';
import { load } from 'cheerio';
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { cleanHtml } from './capture.js';
import { generate } from './generate.js';
import { validateSpec } from './features/runtime.mjs';
import { nativeSources } from './features/nativegen.js';
import { buildReplicaFeature } from './replica.js';

const hash = (text) => createHash('sha256').update(text).digest('hex');
export function inspectFeature(html) {
  if (typeof html !== 'string' || !html.trim() || html.length > 200000)
    throw new Error('Pick a component under 200 KB.');
  const safe = cleanHtml(html),
    $ = load(safe, null, false);
  const generated = generate(safe, 'ReframeFeature', 'react');
  const fields = $('input,textarea,select')
    .toArray()
    .map((el, i) => ({
      id: `field${i + 1}`,
      label: (
        el.attribs['aria-label'] ||
        (el.attribs.id &&
          $(`label`)
            .filter((_, label) => label.attribs.for === el.attribs.id)
            .text()) ||
        $(el).closest('label').text() ||
        el.attribs.placeholder ||
        el.attribs.name ||
        `Field ${i + 1}`
      )
        .trim()
        .slice(0, 200),
      type: ['checkbox', 'radio'].includes(el.attribs.type)
        ? 'checkbox'
        : el.attribs.type || 'text',
      required: 'required' in el.attribs,
    }));
  const actions = generated.actions.map((a) => {
    const label = a.label.toLowerCase();
    const operation =
      fields.some((f) => f.type === 'password') && /sign.?up|register|create account/.test(label)
        ? 'signup'
        : fields.some((f) => f.type === 'password') && /sign.?in|log.?in/.test(label)
          ? 'signin'
          : /sign.?out|log.?out/.test(label)
            ? 'signout'
            : /\b(search|find|filter)\b/.test(label)
              ? 'search'
              : /\b(delete|remove)\b/.test(label)
                ? 'delete'
                : /\b(update|edit)\b/.test(label)
                  ? 'update'
                  : /\b(count|increment|check in)\b/.test(label)
                    ? 'increment'
                    : /\b(submit|send|subscribe|save|add|create|join|register)\b/.test(label) &&
                        fields.length
                      ? 'create'
                      : /\b(like|favorite|follow|enable|disable)\b/.test(label)
                        ? 'toggle'
                        : /\b(reset|clear)\b/.test(label)
                          ? 'reset'
                          : a.href && /^(https?:\/\/|\/(?!\/)|#)/.test(a.href) && a.href !== '#'
                            ? 'navigate'
                            : 'unresolved';
    return {
      ...a,
      operation,
      target: a.href || '',
      message: '',
      reason:
        operation === 'unresolved'
          ? 'The capture does not define the intended business rule.'
          : 'Suggested from visible labels or links; review before building.',
    };
  });
  const blockers = [];
  if ($('select,input[type=radio]').length)
    blockers.push(
      'Radio groups and select pickers need a choice-model implementation before building a working package.',
    );
  if (
    fields.some(
      (f) => !['text', 'email', 'number', 'checkbox', 'search', 'password'].includes(f.type),
    )
  )
    blockers.push('Convert unsupported field types before building.');
  if (fields.length > 30 || actions.length > 30 || fields.length !== generated.minimal.stateFields)
    blockers.push('Pick a smaller component with at most 30 fields and 30 actions.');
  return {
    fields,
    actions,
    blockers,
    sourceHash: hash(safe),
    missing: [
      'Action intent and validation rules',
      ...(fields.length ? ['Persistent records and field validation'] : []),
      ...(actions.some((a) =>
        ['create', 'update', 'delete', 'toggle', 'increment'].includes(a.operation),
      )
        ? ['API, concurrency protection and durable storage']
        : []),
      'Authentication and external API contracts',
      'Destination runtime and permissions',
    ],
    limitation:
      'Labels suggest intent. Review account requirements and configure API endpoints explicitly; private business rules and provider credentials cannot be recovered from a capture.',
  };
}

function frontend(html, spec) {
  const name = 'ReframeFeature';
  const g = generate(html, name, 'react');
  let code = g.code.slice(g.code.indexOf('\n') + 1);
  code = `export default function ${name}() {\n` + code;
  const defaults = spec.fields
    .map((f) => `set${f.id}(${f.type === 'checkbox' ? 'false' : "''"});`)
    .join('');
  const select = spec.fields
    .map(
      (f) =>
        `set${f.id}(${f.type === 'checkbox' ? `Boolean(record.values.${f.id})` : `String(record.values.${f.id} ?? '')`});`,
    )
    .join('');
  const hooks = `
const [data, setData] = ${name}State<{version:number;records:{id:string;values:Record<string,string|boolean>}[];counters:Record<string,number>;toggles:Record<string,boolean>;result?:string}>({version:0,records:[],counters:{},toggles:{}});
const [ready,setReady]=${name}State(false),[busy,setBusy]=${name}State(false),[error,setError]=${name}State(''),[message,setMessage]=${name}State(''),[selected,setSelected]=${name}State('');
const sessionEpoch=${name}Ref(0);
const pending=${name}Ref<{fingerprint:string;body:Record<string,unknown>}|null>(null);
const actions=${JSON.stringify(spec.actions)};
const endpoint=${JSON.stringify('/api/reframe/' + spec.id)};
${name}Effect(()=>{let controller=new AbortController();function load(){sessionEpoch.current++;controller.abort();controller=new AbortController();const current=controller;setBusy(false);setMessage('');setReady(false);setData({version:0,records:[],counters:{},toggles:{}});setSelected('');${defaults}pending.current=null;fetch(endpoint,{signal:controller.signal}).then(async r=>{const result=await r.json();if(!r.ok)throw new Error(result.error||'Could not load feature');return result;}).then(result=>{if(!current.signal.aborted){setData(result);setReady(true);setError('');}}).catch(e=>{if(!current.signal.aborted)setError(e.message);});}load();window.addEventListener('reframe-session',load);return()=>{controller.abort();window.removeEventListener('reframe-session',load);};},[]);
async function onAction(id:string){
 const action=actions.find(a=>a.id===id);if(!action||busy||(!ready&&!['signin','signup','signout'].includes(action.operation)))return;setError('');setMessage('');
 if(action.operation==='navigate'){window.location.assign(action.target);return;}
 if(action.operation==='details'){setMessage(action.message);return;}
 if(action.operation==='reset'){${defaults}setSelected('');setMessage('Fields cleared.');return;}
 if(['update','delete'].includes(action.operation)&&!selected){setError('Select a saved record first.');return;}
 const actionEpoch=sessionEpoch.current;const values={${spec.fields.map((f) => f.id).join(',')}};
 const body={action:id,values,recordId:selected,version:data.version,query:Object.values(values).map(String).join(' ')};
 const fingerprint=JSON.stringify({...body,version:undefined});if(pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,body:{...body,requestId:crypto.randomUUID()}};
 setBusy(true);try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending.current.body),signal:AbortSignal.timeout(15000)});const result=await response.json();if(actionEpoch!==sessionEpoch.current)return;if(!response.ok){if(response.status<500)pending.current=null;throw new Error(result.error||'Action failed');}setData(result);pending.current=null;setMessage(action.operation==='search'?result.records.length+' matching records.':action.label+' completed.');if(['signin','signup','signout'].includes(action.operation)){${defaults}window.dispatchEvent(new Event('reframe-session'));}if(['create','delete'].includes(action.operation)){${defaults}setSelected('');}}
 catch(e){if(actionEpoch!==sessionEpoch.current)return;setError((e as Error).message);try{const r=await fetch(endpoint);if(r.ok){const latest=await r.json();if(actionEpoch===sessionEpoch.current)setData(latest);}}catch{/* Keep confirmed data when offline. */}}finally{if(actionEpoch===sessionEpoch.current)setBusy(false);}
}
`;
  code = code.replace('return (', hooks + '\nreturn (');
  const authForm = spec.fields.some((f) => f.type === 'password');
  code = code
    .replaceAll(
      '<button type="button"',
      `<button disabled={busy${authForm ? '' : ' || !ready'}} type="button"`,
    )
    .replaceAll('<input ', `<input disabled={busy${authForm ? '' : ' || !ready'}} `);
  if (spec.authRequired)
    code = code.replace(
      /(<section[^>]*>)/,
      '$1<ReframeAccount endpoint={endpoint}' + (authForm ? ' showLogin={false}' : '') + '/>',
    );
  const output = `<div aria-live="polite"><p role="status">{!ready?(error?'':'Loading feature…'):busy?'Working…':message}</p>{error&&<p role="alert">{error}</p>}{!ready&&error&&error!=='Sign in to use this component.'&&<button type="button" onClick={()=>window.location.reload()}>Retry loading</button>}${spec.actions.some((a) => a.operation === 'increment') ? '<p>Counts: {Object.entries(data.counters).map(([id,value])=>actions.find(a=>a.id===id)?.label+": "+value).join(" · ")}</p>' : ''}${spec.actions.some((a) => a.operation === 'toggle') ? '<p>Saved states: {Object.entries(data.toggles).map(([id,value])=>actions.find(a=>a.id===id)?.label+": "+(value?"On":"Off")).join(" · ")}</p>' : ''}${spec.actions.some((a) => ['create', 'update', 'delete', 'search'].includes(a.operation)) ? `<h3>Saved records</h3><p>{data.records.length} records · saved on this computer</p><ul>{data.records.map(record=><li key={record.id}><button type="button" aria-pressed={selected===record.id} disabled={busy} onClick={()=>{setSelected(record.id);${select}setMessage('Record selected.');}}>{${spec.fields.length ? JSON.stringify(spec.fields.map((f) => f.label).join(' · ')) + `+': '+Object.values(record.values).map(String).join(' · ')` : "'Record '+record.id.slice(0,8)"}}</button></li>)}</ul>` : ''}</div>`;
  const end = code.lastIndexOf('</section>);');
  if (end < 0)
    throw new Error('Generated component wrapper changed; rebuild the feature compiler.');
  code =
    code.slice(0, end) +
    output +
    '{data.result&&<pre aria-label="API response" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{data.result}</pre>}' +
    code.slice(end);
  return (
    `import {useState as ${name}State,useEffect as ${name}Effect,useRef as ${name}Ref} from 'react';\n` +
    (spec.authRequired ? "import ReframeAccount from './Account';\n" : '') +
    code
  );
}

async function buildCommerce(safe, name, spec, report) {
  if (spec.authRequired)
    throw new Error(
      'Product mode currently supports one local shared demo cart; account-scoped carts are not implemented.',
    );
  const catalog = validateCatalog(spec.commerce);
  if (catalog.variants.length > 1 && !Object.keys(catalog.variants[0].options || {}).length)
    throw new Error('Multiple variants need named product options.');
  if (
    report.fields.length ||
    report.actions.length !== 2 ||
    spec.actions?.length !== 2 ||
    spec.actions.some((a, i) => a.id !== report.actions[i].id) ||
    spec.actions[0].operation !== 'product-details' ||
    spec.actions[1].operation !== 'product-options'
  )
    throw new Error('Product mode needs a two-action card: details, then product options.');
  const id = spec.id || `rf_${randomBytes(6).toString('hex')}`;
  if (!/^rf_[a-f0-9]{12}$/.test(id)) throw new Error('Invalid product feature ID.');
  const canonical = {
    version: 1,
    id,
    name: String(name || catalog.product.name).slice(0, 100),
    fields: [],
    actions: report.actions.map((a, i) => ({
      ...a,
      operation: i === 0 ? 'product-details' : 'product-options',
      target: '',
      message: 'Independently authored in-app product behavior.',
    })),
    commerce: catalog,
  };
  const read = (file) => readFile(new URL('./features/' + file, import.meta.url), 'utf8');
  const [component, commerce, runtime, runner, services] = await Promise.all(
    ['Commerce.tsx', 'commerce.mjs', 'runtime.mjs', 'runner.mjs', 'services.mjs'].map(read),
  );
  const files = {
    'Component.tsx': component.replace('__REFRAME_ENDPOINT__', '/api/reframe/' + id),
    'feature.json': JSON.stringify(canonical, null, 2),
    'commerce.mjs': commerce,
    'runtime.mjs': runtime,
    'server.mjs': runner,
    'services.mjs': services,
    'README.md': `# ${canonical.name}\n\nIndependent web product/configurator and local cart backend. Install via Reframe Projects in React + Vite. Run npm run reframe:dev, or build then npm run reframe:start. No added dependencies.\n\nSample catalog prices use integer minor units. The server validates variant IDs, stock and quantities, calculates totals and serializes atomic cart writes. Demo orders have durable request IDs and decrement local inventory. Cart and orders persist in .reframe/data/${id}.commerce.json and are excluded from clipboard exports. Existing record data uses a separate file and is preserved.\n\nOne local workspace and server process. Up to 48 variants, five units per variant, 200 demo orders and 10000 writes. No payment, shipment or Apple order is made. Before public commerce, add identity-scoped carts, a transactional database, authenticated HTTPS, tax/shipping rules, fulfillment and a real payment provider. Native product clients are not included.\n`,
  };
  return {
    version: 1,
    spec: canonical,
    sourceHash: report.sourceHash,
    files,
    bytes: Buffer.byteLength(JSON.stringify(files)),
    builtAt: new Date().toISOString(),
    requirements: [
      'React + Vite web screen',
      'Node 24+ backend',
      'One local shared demo cart; no payment or shipment',
      'Sample prices and stock must be reviewed before use',
    ],
  };
}

export async function buildFeature({ html, name, spec }) {
  const safe = cleanHtml(html),
    report = inspectFeature(safe);
  if (spec?.commerce) return buildCommerce(safe, name, spec, report);
  if (report.blockers.length) throw new Error(report.blockers.join(' '));
  const id = spec?.id || `rf_${randomBytes(6).toString('hex')}`;
  const canonical = {
    version: 1,
    id,
    name: String(name || 'Captured feature').slice(0, 100),
    authRequired:
      !!spec?.authRequired ||
      (spec?.actions || report.actions).some((a) =>
        ['signin', 'signup', 'signout', 'external'].includes(a.operation),
      ),
    fields: spec?.fields || report.fields,
    actions: spec?.actions || report.actions,
  };
  validateSpec(canonical);
  if (
    canonical.fields.length !== report.fields.length ||
    canonical.fields.some(
      (f, i) => f.id !== report.fields[i].id || f.type !== report.fields[i].type,
    ) ||
    canonical.actions.length !== report.actions.length ||
    canonical.actions.some((a, i) => a.id !== report.actions[i].id)
  )
    throw new Error(
      'The specification no longer matches this capture. Inspect missing logic again.',
    );
  const [runtime, runner] = await Promise.all([
    readFile(new URL('./features/runtime.mjs', import.meta.url), 'utf8'),
    readFile(new URL('./features/runner.mjs', import.meta.url), 'utf8'),
  ]);
  const files = {
    'Component.tsx': frontend(safe, canonical),
    'feature.json': JSON.stringify(canonical, null, 2),
    'runtime.mjs': runtime,
    'server.mjs': runner,
    'README.md': `# ${canonical.name}\n\nGenerated from captured UI; action rules were reviewed and authored independently.\n\nInstall through Reframe Projects to wire source, API and scripts. Web: React + Vite, npm run reframe:dev. Production: npm run build && npm run reframe:start. SwiftUI: Component.swift + ReframeClient.swift. Android Compose: Component.kt wraps ReframeFeatureView.java with MaterialTheme colors. Native: npm run reframe:backend (Node 24+, port 5176); the backend remains on the Mac. iOS Simulator uses localhost; Android Emulator uses 10.0.2.2. Physical Android: adb reverse tcp:5176 tcp:5176 and pass localhost apiBase. Add generated Swift files to explicit Xcode targets; synchronized groups and SwiftPM discover them. Android debug-only local HTTP configuration is included by the installer. Production requires an authenticated HTTPS service.\n\nThe API /api/reframe/${id} provides GET state and POST declared actions. Data stays in .reframe/data/${id}.json. Optional local accounts isolate records by user. Authentication uses scrypt password hashes and revocable sessions. No email verification, password recovery, MFA or team roles. API keys are entered after installation, encrypted under .reframe/security/ and scoped to the account, endpoint, method and header type. Clipboard exports contain no saved keys or accounts. Back up the entire .reframe/ directory securely; losing vault.key makes its saved keys unreadable. External actions send only explicitly mapped fields to a reviewed public HTTPS endpoint. No payment behavior is implied. An uncertain POST is blocked until its outcome is manually reconciled with the provider and its pending entry resolved in the local store. Production requires a database, a managed secret store, TLS and identity lifecycle support.\n\nPersistent actions use schema validation, optimistic versions, idempotent request IDs and atomic writes. Supports 200 records and 10000 writes before migration. Generated feature data is not part of the clipboard bundle.\n`,
  };
  Object.assign(files, nativeSources(safe, canonical), {
    'services.mjs': await readFile(new URL('./features/services.mjs', import.meta.url), 'utf8'),
    'ReframeClient.swift': await readFile(
      new URL('./features/ReframeClient.swift', import.meta.url),
      'utf8',
    ),
    'native-server.mjs': await readFile(
      new URL('./features/native-runner.mjs', import.meta.url),
      'utf8',
    ),
  });
  if (canonical.authRequired)
    files['Account.tsx'] = await readFile(
      new URL('./features/Account.tsx', import.meta.url),
      'utf8',
    );
  return {
    version: 1,
    spec: canonical,
    sourceHash: report.sourceHash,
    files,
    bytes: Buffer.byteLength(JSON.stringify(files)),
    builtAt: new Date().toISOString(),
    requirements: [
      'React + Vite, SwiftUI, or Android Compose',
      'Node 24+ backend',
      'One local workspace',
      'Native: npm run reframe:backend; web: npm run reframe:dev or reframe:start',
      'Native debug builds need local HTTP permission; production needs an authenticated HTTPS backend',
    ],
  };
}
export async function validatedFeature(item) {
  if (
    !item?.feature ||
    item.feature.version !== 1 ||
    item.feature.sourceHash !== hash(cleanHtml(item.html))
  )
    throw new Error('Feature source changed. Rebuild the feature before integrating.');
  if (item.feature.spec?.website)
    return buildReplicaFeature(
      item.html,
      item.feature.spec.name,
      item.feature.spec.website,
      item.feature.spec.id,
    );
  // Recompile imported metadata; never install arbitrary executable files from a clipboard backup.
  return buildFeature({ html: item.html, name: item.feature.spec?.name, spec: item.feature.spec });
}
