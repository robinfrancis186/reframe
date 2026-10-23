import test from 'node:test';
import assert from 'node:assert/strict';
import {
  componentReadiness,
  installationName,
  matchesComponent,
  sameComponent,
  preferredCapture,
} from '../src/component-workflow.js';
import {
  readDestination,
  writeDestination,
  readProjectBrief,
  writeProjectBrief,
} from '../src/project-context.js';

const theme = { primary: '#123456' },
  reference = {
    id: 'r',
    name: 'Phone card',
    source: 'https://example.com',
    html: '<a>Buy</a>',
    theme,
  };
test('readiness distinguishes source, local UI and declared backend without claiming runtime verification', () => {
  assert.equal(componentReadiness(reference).kind, 'reference');
  assert.match(componentReadiness(reference).detail, /cannot recover/);
  const original = { ...reference, libraryId: 'tabs' };
  assert.equal(componentReadiness(original).kind, 'original');
  assert.match(componentReadiness(original).detail, /runtime testing is pending/);
  const feature = { ...reference, feature: { spec: { commerce: {}, actions: [] } } };
  assert.equal(componentReadiness(feature).kind, 'feature');
  assert.match(componentReadiness(feature).detail, /React \/ Vite only/);
  assert.match(componentReadiness(feature).preview, /before installation/);
  assert.ok(matchesComponent(feature, '  PHONE  ', 'feature'));
  assert.ok(matchesComponent(original, 'interactive ui', 'all'));
  assert.ok(!matchesComponent(reference, 'phone', 'feature'));
  assert.ok(!matchesComponent(feature, 'missing', 'feature'));
  assert.ok(sameComponent(reference, { ...reference }, theme));
  for (const changed of [
    { name: 'Other' },
    { html: '<button>Buy</button>' },
    { feature: { spec: { actions: [] } } },
    { id: 'new' },
  ])
    assert.ok(!sameComponent(reference, { ...reference, ...changed }, theme));
  assert.ok(!sameComponent(reference, reference, { primary: '#000000' }));
  const navigation = { ...reference, kind: 'nav' },
    content = { ...reference, kind: 'section' };
  assert.equal(preferredCapture([navigation, content]), content);
  assert.equal(preferredCapture([navigation]), navigation);
  assert.equal(preferredCapture([]), undefined);
  const heading = { ...content, html: '<h2>Newsletter example</h2>' },
    form = { ...content, html: '<div><input><button>Subscribe</button></div>' };
  assert.equal(preferredCapture([heading, form]), form);
});
test('destination and per-project brief survive reload while excluding packages, credentials and stale plans', () => {
  const values = new Map(),
    storage = {
      getItem: (key) => values.get(key),
      setItem: (key, value) => values.set(key, value),
    };
  assert.deepEqual(readDestination(storage), {
    id: '',
    file: '',
    point: '',
    appearance: 'light',
    adaptBranding: true,
  });
  writeDestination(
    {
      id: 'p',
      file: 'src/App.tsx',
      point: 'main-1',
      appearance: 'dark',
      adaptBranding: false,
      plan: 'stale',
      apiKey: 'private',
    },
    storage,
  );
  assert.deepEqual(readDestination(storage), {
    id: 'p',
    file: 'src/App.tsx',
    point: 'main-1',
    appearance: 'dark',
    adaptBranding: false,
  });
  writeProjectBrief('p', { purpose: 'A shop', goal: 'Cart', apiKey: 'private' }, storage);
  assert.deepEqual(readProjectBrief('p', storage), { purpose: 'A shop', goal: 'Cart' });
  assert.deepEqual(readProjectBrief('another', storage), { purpose: '', goal: '' });
  assert.doesNotMatch([...values.values()].join(''), /private|stale/);
  values.set('reframe-destination', 'broken');
  assert.equal(readDestination(storage).id, '');
  values.set('reframe-brief:p', JSON.stringify({ purpose: 'x'.repeat(1501), goal: 'cart' }));
  assert.deepEqual(readProjectBrief('p', storage), { purpose: '', goal: '' });
  const unavailable = {
    getItem() {
      throw Error('unavailable');
    },
    setItem() {
      throw Error('full');
    },
  };
  assert.equal(readDestination(unavailable).id, '');
  assert.throws(() => writeDestination({ id: 'p', file: 'x', point: 'y' }, unavailable), /full/);
});

test('installation defaults differ between packages and survive Library renames', () => {
  const a = { ...reference, feature: { spec: { id: 'rf_0123456789ab' } } };
  const b = { ...reference, feature: { spec: { id: 'rf_0123456789ac' } } };
  assert.notEqual(installationName(a), installationName(b));
  assert.equal(installationName(a), installationName({ ...a, id: 'copy', name: 'Renamed' }));
  for (const item of [a, b, reference, { id: '<hostile>/'.repeat(50) }])
    assert.match(installationName(item), /^Reframe[A-Za-z0-9]{1,60}$/);
});
