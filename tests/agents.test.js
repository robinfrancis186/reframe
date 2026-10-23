import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { agents, skills, detectSkills } from '../src/agent-skills.js';
import { decide, runAgents, validateDecision, gradioSource } from '../server/agents.js';
import { GradioLab } from '../server/gradio.js';
import { inspectFeature } from '../server/features.js';
import { featureHandler } from '../server/features/runtime.mjs';
import { isItem, themes } from '../src/model.ts';

const item = {
  id: 'agent-test',
  name: 'Agent community notes',
  html: '<section><h2>Community notes</h2><label>Email<input type="email" required></label><label>Note<input></label><button>Save note</button><button>Count</button></section>',
  source: 'Captured test UI',
  kind: 'section',
  capturedAt: new Date().toISOString(),
  evidence: 'Authored test; no private logic recovered.',
};
const body = {
  item,
  goal: 'Save email and note locally, and keep a persistent counter.',
  provider: 'local',
  target: 'react',
  theme: themes[0],
};
const decision = (report) => ({
  summary: 'Independently author the specified behavior.',
  confidence: 0.95,
  actions: report.actions.map((a) => ({
    id: a.id,
    operation: a.operation,
    reason: 'Explicitly requested behavior.',
  })),
  missing: ['Verify the destination runtime.'],
  questions: [],
});
const response = (value) => ({
  ok: true,
  json: async () => ({
    status: 'completed',
    output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
  }),
});

test('specialist identities and 26 guidance packs cover common stacks without pretending to compile them', async () => {
  assert.equal(agents.length, 6);
  assert.equal(skills.length, 26);
  assert.equal(new Set(skills.map((s) => s.id)).size, 26);
  for (const [source, file, expected] of [
    ['import gradio as gr\nwith gr.Blocks(): pass', 'app.py', 'gradio'],
    ['import Link from "next/link"', 'page.tsx', 'nextjs'],
    ['@RestController public class Notes {}', 'Notes.java', 'spring'],
    ['import androidx.compose.runtime.*\n@Composable fun Screen() {}', 'Screen.kt', 'compose'],
    ['import SwiftUI\nstruct Screen:View {}', 'Screen.swift', 'swiftui'],
    ['import {ref} from "vue"', 'screen.vue', 'vue'],
    ['func main() {}', 'main.go', 'go'],
  ])
    assert.ok(
      detectSkills(source, file).some((s) => s.id === expected),
      expected,
    );
  assert.ok(
    !detectSkills('package com.example; public class Screen {}', 'Screen.java').some(
      (s) => s.id === 'go',
    ),
  );
  for (const agent of agents)
    assert.ok(
      (await readFile(new URL('../public/agents/' + agent.id + '.webp', import.meta.url))).length >
        10000,
    );
});
test('decision validation rejects invented/duplicate IDs, malformed output and invented external contracts', () => {
  const report = inspectFeature(item.html),
    valid = decision(report);
  assert.equal(validateDecision(valid, report).actions[0].operation, 'create');
  assert.throws(
    () =>
      validateDecision(
        { ...valid, actions: [{ ...valid.actions[0], id: 'invented' }, valid.actions[1]] },
        report,
      ),
    /contract/,
  );
  assert.throws(
    () => validateDecision({ ...valid, actions: [valid.actions[0], valid.actions[0]] }, report),
    /contract/,
  );
  assert.throws(() => validateDecision({ ...valid, confidence: NaN }, report), /invalid plan/);
  const restricted = validateDecision(
    { ...valid, actions: valid.actions.map((a) => ({ ...a, operation: 'external' })) },
    report,
  );
  assert.ok(restricted.actions.every((a) => a.operation === 'unresolved' && !a.connection));
});
test('OpenAI uses strict Responses output, sends only selected guidance, and never puts the key into prompts', async () => {
  const report = inspectFeature(item.html),
    key = 'sk-test-ephemeral-only';
  let requests = 0;
  const result = await decide({
    report,
    goal: body.goal,
    source: 'public class Notes {}' + ' '.repeat(40000),
    loaded: skills.filter((s) => s.id === 'java'),
    target: 'react',
    apiKey: key,
    fetcher: async (url, options) => {
      requests++;
      assert.equal(url, 'https://api.openai.com/v1/responses');
      assert.equal(options.headers.Authorization, 'Bearer ' + key);
      const request = JSON.parse(options.body);
      assert.equal(request.store, false);
      assert.equal(request.text.format.strict, true);
      assert.equal(JSON.parse(request.input).source.length, 32000);
      assert.match(request.instructions, /JVM source/);
      assert.match(request.instructions, /shared Node API and persistent destination store/);
      assert.match(request.instructions, /Do not propose localStorage/);
      assert.ok(!options.body.includes(key));
      assert.ok(!request.instructions.includes('Eloquent'));
      return response(decision(report));
    },
  });
  assert.equal(requests, 1);
  assert.equal(result.confidence, 0.95);
  await decide({
    report,
    goal: '',
    source: '',
    loaded: skills.filter((s) => s.id === 'gradio'),
    target: 'gradio',
    apiKey: key,
    fetcher: async (_url, options) => {
      assert.match(
        JSON.parse(options.body).instructions,
        /Bundled Gradio skill:[\s\S]*## Event Listeners/,
      );
      return response(decision(report));
    },
  });
  await assert.rejects(
    decide({
      report,
      goal: '',
      source: '',
      loaded: [],
      target: 'react',
      apiKey: key,
      fetcher: async () => ({ ok: false, status: 401 }),
    }),
    /HTTP 401.*no automatic fallback/,
  );
  await assert.rejects(
    decide({
      report,
      goal: '',
      source: '',
      loaded: [],
      target: 'react',
      apiKey: key,
      fetcher: async () => response({ summary: 'bad' }),
    }),
    /invalid plan/,
  );
});
test('agent pipeline → canonical clipboard package → real validated persistent API behavior', async () => {
  const events = [],
    result = await runAgents(body, { onStage: (e) => events.push(e) });
  assert.equal(result.ready, true);
  assert.equal(result.provider, 'local');
  assert.equal(result.model, null);
  assert.deepEqual(
    result.stages.map((s) => s.id),
    agents.map((a) => a.id),
  );
  assert.equal(events.length, 12);
  assert.ok(result.item.feature.review.analysis.evidenceId);
  const restored = JSON.parse(JSON.stringify(result.item));
  assert.ok(isItem(restored));
  assert.ok(!JSON.stringify(result).includes('console.info('));
  const dir = await mkdtemp(path.join(tmpdir(), 'reframe-agent-')),
    handler = featureHandler(restored.feature.spec, path.join(dir, 'data.json')),
    server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/reframe/${restored.feature.spec.id}`;
  try {
    let state = await (await fetch(url)).json();
    const post = async (action, values) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          values,
          version: state.version,
          requestId: crypto.randomUUID(),
          recordId: '',
        }),
      });
      assert.equal(r.status, 200);
      state = await r.json();
    };
    await post('action1', { field1: 'agent-flow@example.org', field2: 'A real backend record' });
    assert.equal(state.records.length, 1);
    await post('action2', {});
    assert.equal(state.counters.action2, 1);
    assert.equal(
      (await (await fetch(url)).json()).records[0].values.field2,
      'A real backend record',
    );
    assert.equal(JSON.parse(await readFile(path.join(dir, 'data.json'), 'utf8')).records.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
test('ambiguous intent and low-confidence AI plans pause generation instead of inventing working logic', async () => {
  const ambiguous = await runAgents({
    ...body,
    item: { ...item, html: '<section><button>Get started</button></section>' },
  });
  assert.equal(ambiguous.ready, false);
  assert.deepEqual(ambiguous.files, {});
  assert.ok(ambiguous.decision.questions.length);
  const report = inspectFeature(item.html),
    low = await runAgents(
      { ...body, provider: 'openai', apiKey: 'sk-test-low-confidence' },
      { fetcher: async () => response({ ...decision(report), confidence: 0.5 }) },
    );
  assert.equal(low.ready, false);
  assert.equal(low.item.feature, undefined);
  assert.match(low.requirements.join(' '), /below 80%/);
  assert.ok(!JSON.stringify(low).includes('sk-test-low-confidence'));
});
test('invalid input and missing Gradio setup fail before source execution or process startup', async () => {
  await assert.rejects(runAgents({ ...body, target: 'arbitrary-shell' }), /valid capture/);
  await assert.rejects(runAgents({ ...body, source: 'a'.repeat(100001) }), /100 KB/);
  const lab = new GradioLab();
  lab.python = '/nonexistent/reframe-python';
  assert.equal((await lab.status()).available, false);
  await assert.rejects(lab.start(body, 5173), /gradio:setup/);
  assert.equal(lab.child, null);
  await lab.stop();
});
test('Gradio export carries the canonical contract and brand while refusing account/key flows', async () => {
  const spec = { id: 'rf_000000000001', name: 'Public counter', fields: [], actions: [] };
  const source = await gradioSource(spec, themes[0]);
  const encoded = [...source.matchAll(/base64\.b64decode\("([A-Za-z0-9+/=]+)"\)/g)].map((m) =>
    JSON.parse(Buffer.from(m[1], 'base64').toString()),
  );
  assert.equal(encoded[0].id, spec.id);
  assert.equal(encoded[1].primary, themes[0].primary);
  assert.match(source, /session\["pending"\]\["body"\]/);
  await assert.rejects(
    gradioSource({ ...spec, authRequired: true }, themes[0]),
    /public local records/,
  );
});

test('Scout performs requested capture inside the streamed workflow and failing stages report errors', async () => {
  const events = [];
  let captures = 0;
  const result = await runAgents(
    { ...body, url: 'https://example.com/notes' },
    {
      capture: async (url) => {
        captures++;
        return { url, html: item.html };
      },
      onStage: (e) => events.push(e),
    },
  );
  assert.equal(captures, 1);
  assert.equal(events[0].id, 'scout');
  assert.equal(events[0].status, 'running');
  assert.match(events[1].summary, /Captured https/);
  assert.equal(result.item.source, 'https://example.com/notes');
  assert.equal(result.ready, true);
  const errors = [];
  await assert.rejects(
    runAgents(
      { ...body, url: 'https://example.com/broken' },
      {
        capture: async () => {
          throw Error('Source unavailable');
        },
        onStage: (e) => errors.push(e),
      },
    ),
    /Source unavailable/,
  );
  assert.deepEqual(
    errors.map((e) => e.status),
    ['running', 'error'],
  );
  const paused = await runAgents({
    ...body,
    item: { ...item, html: '<section><button>Continue</button></section>' },
  });
  assert.equal(paused.stages.find((s) => s.id === 'forge').status, 'blocked');
  assert.equal(paused.stages.find((s) => s.id === 'sentry').status, 'skipped');
  assert.equal(paused.stages.find((s) => s.id === 'relay').status, 'blocked');
});
