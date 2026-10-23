import test from 'node:test';
import assert from 'node:assert/strict';
import { mcpSession, runOpenAIMcp } from '../server/openai-mcp.js';
import { loadAppearance } from '../src/appearance.js';

test('workspace appearance is independent, persistent and safe when storage is unavailable', () => {
  assert.equal(loadAppearance({ getItem: () => 'light' }), 'light');
  assert.equal(loadAppearance({ getItem: () => 'dark' }), 'dark');
  assert.equal(loadAppearance({ getItem: () => 'invalid' }), 'dark');
  assert.equal(
    loadAppearance({
      getItem: () => {
        throw new Error('Denied');
      },
    }),
    'dark',
  );
});
test('OpenAI MCP adapter preserves captured control IDs and bundles, refuses save before build', async () => {
  const calls = [],
    item = { id: 'capture1', html: '<button>Count</button>', name: 'Counter' },
    report = {
      fields: [],
      actions: [{ id: 'action1', label: 'Count', operation: 'increment' }],
      blockers: [],
    };
  const client = {
    async callTool({ name, arguments: a }) {
      calls.push({ name, a });
      return {
        structuredContent:
          name === 'capture_component'
            ? { items: [item] }
            : name === 'inspect_component'
              ? report
              : name === 'build_component'
                ? {
                    item: {
                      ...a.item,
                      feature: {
                        spec: { id: 'rf_123456abcdef', actions: a.spec.actions },
                        files: { 'Component.tsx': 'code', 'runtime.mjs': 'api' },
                      },
                    },
                  }
                : { id: a.item.id, name: a.item.name },
      };
    },
  };
  const invoke = mcpSession(client);
  await invoke('capture_component', { url: 'https://example.com', html: null });
  await assert.rejects(invoke('save_component', { ref: item.id }), /Build/);
  await assert.rejects(invoke('build_component', { ref: item.id, actions: [] }), /Inspect/);
  await invoke('inspect_component', { ref: item.id });
  await assert.rejects(
    invoke('build_component', { ref: item.id, actions: [{ id: 'wrong' }] }),
    /every inspected/,
  );
  const result = await invoke('build_component', {
    ref: item.id,
    name: 'Working counter',
    actions: [{ id: 'action1', operation: 'increment', target: '', message: '' }],
  });
  assert.ok(result.files.includes('runtime.mjs'));
  await invoke('save_component', { ref: item.id });
  assert.equal(calls.at(-1).a.item.feature.spec.actions[0].label, 'Count');
  assert.equal(calls[0].a.html, undefined);
  await assert.rejects(invoke('save_component', { ref: 'unknown' }), /reference/);
});
test('OpenAI MCP host rejects empty goals before connecting', async () => {
  await assert.rejects(runOpenAIMcp({ goal: '' }), /Describe/);
});
