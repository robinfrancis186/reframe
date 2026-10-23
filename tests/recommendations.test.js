import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, symlink, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { screenSignals, recommendComponents } from '../server/recommend.js';
import { Projects } from '../server/projects.js';
import { catalog, libraryItem } from '../src/library/catalog.js';

const theme = {
  name: 'Test',
  primary: '#176e9b',
  background: '#ffffff',
  text: '#112233',
  font: 'system-ui, sans-serif',
  radius: 12,
};
const screen = (text, framework = 'react', name = 'App.tsx') => ({ text, framework, path: name });
const recommend = (screens, extra = {}) =>
  recommendComponents({
    screens,
    branding: { theme: { brandName: 'Haven' } },
    vite: true,
    ...extra,
  });
const summary = (extra = {}) => ({
  id: 'saved',
  name: 'Saved component',
  html: '<section><h2>Notes</h2><input aria-label="Note"></section>',
  backend: false,
  service: false,
  ...extra,
});

test('source evidence and user goals change ranking, with reasons and six diverse patterns', () => {
  const analytics = recommend([
    screen(
      'export default()=> <main><h1>Revenue dashboard</h1><p>Monthly metrics and reports</p></main>',
    ),
  ]);
  const booking = recommend([
    screen(
      'export default()=> <main><h1>Book appointments</h1><p>Choose availability and dates</p></main>',
    ),
  ]);
  assert.ok(analytics.recommendations.some((item) => item.kind === 'chart'));
  assert.ok(!booking.recommendations.some((item) => item.kind === 'chart'));
  assert.equal(booking.recommendations[0].kind, 'dates');
  const goal = recommend([screen('export default()=> <main><h1>Hello</h1></main>')], {
    goal: 'Show analytics and revenue charts without external APIs',
  });
  assert.equal(goal.recommendations[0].kind, 'chart');
  assert.ok(goal.recommendations[0].reasons.some((reason) => reason.includes('Matches your goal')));
  assert.equal(
    new Set(goal.recommendations.map((item) => item.kind)).size,
    goal.recommendations.length,
  );
  assert.ok(goal.recommendations.every((item) => item.score >= 0 && item.score <= 95));
  assert.ok(goal.recommendations.length <= 6);
  const assistant = recommend(
    [screen('export default()=> <main>Store dashboard, product catalog, tasks and files</main>')],
    { goal: 'AI assistant chat' },
  );
  assert.ok(assistant.recommendations.length);
  assert.ok(assistant.recommendations.every((item) => item.kind === 'agent'));
  assert.ok(assistant.recommendations[0].requirements.length);
});

test('screen signals ignore style, scripts, event code and comments; recognize actual web and native controls', () => {
  const signals = screenSignals(
    'const config="revenue charts"; export default()=> <main style={{content:"dashboard analytics"}} onClick={()=>alert("trading wallet")}><style>{"table{display:block}"}</style><script>{"chart()"}</script><h1>Book appointments</h1><input type="date"/><nav>Pages</nav></main>',
    'react',
  );
  assert.ok(!/table|chart|analytics|wallet|trading/.test(signals.words));
  assert.deepEqual([...signals.present].sort(), ['dates', 'forms', 'navigation']);
  const swift = screenSignals(
    'import SwiftUI\n// Chart { fake }\nVStack { Text("Book appointments") DatePicker("Date",selection:$date) }',
    'swiftui',
  );
  assert.ok(swift.words.includes('Book appointments'));
  assert.ok(swift.present.has('dates'));
  assert.ok(!swift.present.has('chart'));
  const compose = screenSignals(
    '/* Table */ Column { Text(text = "Report")\nTabRow(selectedTabIndex=0) {} }',
    'compose',
  );
  assert.ok(compose.present.has('tabs'));
  assert.ok(!compose.present.has('table'));
  assert.ok(compose.words.includes('Report'));
});

test('canonical catalog identities and installed feature IDs suppress duplicates; saved Originals win deduplication', () => {
  const entry = catalog.find((item) => item.id === 'be-date-range-picker');
  assert.ok(entry);
  const result = recommend(
    [
      screen(
        `import Board from './reframe/features/rf_123456abcdef/Component'; const props={variant:${JSON.stringify(entry.props.variant)}};export default()=> <main><h1>Booking and dates</h1></main>`,
      ),
    ],
    {
      clipboard: [
        summary({ id: 'already-installed', backend: true, featureId: 'rf_123456abcdef' }),
        summary({ id: 'saved-search', name: 'Saved searchable list', libraryId: 'search' }),
      ],
      goal: 'Search collections',
    },
  );
  assert.ok(
    !result.recommendations.some(
      (item) => item.id === entry.id || item.itemId === 'already-installed',
    ),
  );
  const search = result.recommendations.find((item) => item.libraryId === 'search');
  assert.equal(search?.origin, 'clipboard');
  assert.equal(search.itemId, 'saved-search');
  assert.equal(result.recommendations.filter((item) => item.libraryId === 'search').length, 1);
});

test('platform blockers and service requirements are reflected before a component can be selected', () => {
  const server = recommend([screen('export default()=> <main>Booking dates</main>')], {
    next: true,
  });
  assert.equal(server.recommendations.length, 0);
  assert.match(server.warnings.join(' '), /client screen/);
  const client = recommend([screen('"use client";export default()=> <main>Booking dates</main>')], {
    next: true,
    clipboard: [summary({ backend: true, featureId: 'rf_123456abcdef' })],
  });
  assert.ok(client.recommendations.length);
  assert.ok(!client.recommendations.some((item) => item.itemId === 'saved'));
  const rn = recommend(
    [screen('export default()=> <View><Text>Gallery</Text></View>', 'react-native')],
    {
      clipboard: [
        summary({ id: 'table', html: '<table><tr><td>Data</td></tr></table>' }),
        summary({ id: 'simple', html: '<article><h2>Profile</h2></article>' }),
      ],
    },
  );
  assert.equal(rn.recommendations.length, 1);
  assert.equal(rn.recommendations[0].itemId, 'simple');
  const material2 = recommend([
    screen(
      'import androidx.compose.material.Text\n@Composable fun Screen(){Column{Text("Booking")}}',
      'compose',
      'Screen.kt',
    ),
  ]);
  assert.equal(material2.recommendations.length, 0);
  assert.match(material2.warnings.join(' '), /Material 3/);
  for (const [framework, text] of [
    [
      'swiftui',
      'import SwiftUI\nstruct Screen: View {var body: some View {VStack {Text("Booking dates")}}}',
    ],
    [
      'compose',
      'import androidx.compose.material3.Text\n@Composable fun Screen(){Column{Text("Booking dates")}}',
    ],
  ]) {
    assert.equal(recommend([screen(text, framework)]).recommendations[0].kind, 'dates');
  }
  const agent = recommend([screen('export default()=> <main>Assistant chat</main>')], {
    goal: 'AI chat',
  }).recommendations.find((item) => item.kind === 'agent');
  assert.ok(agent?.requirements.length);
  assert.equal(agent.readiness, 'Connect services');
  const local = recommend(
    [screen('export default()=> <main>Assistant chat with analytics and forms</main>')],
    {
      goal: 'No AI, no charts, without backend',
      clipboard: [summary({ backend: true, service: true })],
    },
  );
  assert.ok(
    local.recommendations.every(
      (item) => !['agent', 'chart', 'number'].includes(item.kind) && !item.requirements.length,
    ),
  );
  const saved = recommend([screen('export default()=> <main>Landing and forms</main>')], {
    goal: 'Forms without any external APIs',
    clipboard: [
      summary({ backend: true }),
      summary({ id: 'external', backend: true, service: true }),
      summary({
        id: 'link',
        html: '<article><a href="https://example.org">Read more</a></article>',
      }),
    ],
  });
  assert.ok(
    saved.recommendations.some(
      (item) => item.itemId === 'saved' && item.readiness === 'Backend included',
    ),
  );
  assert.ok(!saved.recommendations.some((item) => item.itemId === 'external'));
  const linked = recommend([screen('export default()=> <main>Marketing</main>')], {
    clipboard: [
      summary({
        id: 'link',
        html: '<article><a href="https://example.org">Read more</a></article>',
      }),
    ],
  });
  assert.equal(
    linked.recommendations.find((item) => item.itemId === 'link')?.readiness,
    'Wire actions',
  );
});

test('connected-project suggestions are bounded, read-only, scoped and feed the real review/apply/undo path', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'reframe-suggestions-'));
  try {
    const root = path.join(dir, 'app');
    await mkdir(root);
    const original =
      'export default function App(){return <main><h1>Booking dates</h1><p>Make an appointment</p></main>}';
    await writeFile(path.join(root, 'App.tsx'), original);
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ dependencies: { react: '19' }, devDependencies: { vite: '6' } }),
    );
    await writeFile(path.join(root, 'index.html'), '<title>Booking Haven</title>');
    await writeFile(path.join(root, 'style.css'), ':root{--primary:#176e9b}');
    await writeFile(path.join(root, '.env'), 'SECRET=must-never-appear');
    await writeFile(
      path.join(dir, 'Outside.tsx'),
      'export default()=> <main>Trading wallet SECRET</main>',
    );
    await symlink(path.join(dir, 'Outside.tsx'), path.join(root, 'Linked.tsx'));
    await writeFile(path.join(root, 'Broken.tsx'), 'export default()=> <main>');
    await writeFile(
      path.join(root, 'Large.tsx'),
      '//' + 'a'.repeat(205000) + '\nexport default()=> <main>Trading</main>',
    );
    const service = new Projects(path.join(dir, 'state')),
      project = await service.connect(root),
      before = await readdir(root);
    const report = await service.recommendations({ id: project.id, clipboard: [] });
    assert.equal(report.brandName, 'Booking Haven');
    assert.deepEqual(
      report.inspected.map((item) => item.path),
      ['App.tsx'],
    );
    assert.match(report.warnings.join(' '), /Broken.tsx.*parsed/);
    assert.match(report.warnings.join(' '), /Large.tsx.*200 KB/);
    assert.ok(!JSON.stringify(report).includes('SECRET'));
    assert.deepEqual(await readdir(root), before);
    assert.equal(await readFile(path.join(root, 'App.tsx'), 'utf8'), original);
    assert.equal((await service.history()).length, 0);
    await assert.rejects(service.recommendations({ id: 'unknown' }), /Connect/);
    for (const file of ['../Outside.tsx', 'Linked.tsx', '.env'])
      await assert.rejects(service.recommendations({ id: project.id, file }), /Screen/);
    await assert.rejects(service.recommendations({ id: project.id, goal: 'a'.repeat(501) }), /500/);
    await assert.rejects(
      service.recommendations({
        id: project.id,
        clipboard: Array.from({ length: 201 }, () => summary()),
      }),
      /200/,
    );
    await assert.rejects(
      service.recommendations({ id: project.id, clipboard: [summary({ libraryId: 'not-real' })] }),
      /valid clipboard/,
    );
    await assert.rejects(
      service.recommendations({
        id: project.id,
        clipboard: [summary({ featureId: '../../secret' })],
      }),
      /valid clipboard/,
    );
    await assert.rejects(service.recommendations({ id: project.id, file: 'Large.tsx' }), /200 KB/);
    const recommendation = report.recommendations[0],
      item = libraryItem(catalog.find((entry) => entry.id === recommendation.libraryId));
    assert.equal(recommendation.kind, 'dates');
    const target = await service.targets(project.id, 'App.tsx');
    const body = {
      projectId: project.id,
      file: 'App.tsx',
      pointId: target.points[0].id,
      hash: target.hash,
      html: item.html,
      libraryId: item.libraryId,
      name: 'ReframeSuggestedDates',
      theme,
    };
    const fit = await service.fit(body);
    assert.equal(fit.decision.status, 'review');
    const plan = await service.plan(body);
    assert.match(plan.after, /ReframeSuggestedDates/);
    assert.match(plan.after, /#176e9b/);
    assert.equal(await readFile(path.join(root, 'App.tsx'), 'utf8'), original);
    await service.apply(plan.id);
    assert.equal(await readFile(path.join(root, 'App.tsx'), 'utf8'), plan.after);
    assert.ok(
      !(await service.recommendations({ id: project.id, file: 'App.tsx' })).recommendations.some(
        (candidate) => candidate.libraryId === recommendation.libraryId,
      ),
    );
    await service.undo(plan.id);
    assert.equal(await readFile(path.join(root, 'App.tsx'), 'utf8'), original);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
