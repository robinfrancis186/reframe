import test from 'node:test';
import assert from 'node:assert/strict';
import { projectFit, reconstructionFrames } from '../server/fit.js';
import { refineCopy } from '../server/refine.js';

test('fit is weighted, evidence-based, and improves with an available action handler and CSS token', () => {
  const input = {
    html: '<section><h2>Ready</h2><button>Continue</button></section>',
    framework: 'react',
  };
  const base = projectFit(input);
  const wired = projectFit({
    ...input,
    handler: 'onSelect',
    handlers: ['onSelect'],
    themeEvidence: ':root { --primary: #00aaff; }',
  });
  assert.ok(wired.score > base.score);
  assert.equal(
    wired.score,
    Math.round(wired.categories.reduce((n, c) => n + (c.score * c.weight) / 100, 0)),
  );
  assert.equal(
    wired.categories.reduce((n, c) => n + c.weight, 0),
    100,
  );
  assert.ok(wired.bytes > 0);
  assert.equal(wired.themeTokens.primary, '#00aaff');
  assert.throws(() => projectFit({ ...input, handler: 'unknown' }), /available/);
  const big = projectFit({ ...input, html: '<p>' + 'word '.repeat(10000) + '</p>' });
  assert.ok(
    big.categories.find((c) => c.name === 'Code size').score <
      base.categories.find((c) => c.name === 'Code size').score,
  );
});

test('native score identifies manual media adaptation and framework blockers', () => {
  const fit = projectFit({
    html: '<img src="x" alt="Product">',
    framework: 'compose',
    source: 'import androidx.compose.material.Text',
  });
  assert.equal(fit.categories[0].score, 0);
  assert.match(fit.verdict, /Framework/);
});

test('frames support legacy image requests and reject invalid, oversized and unbounded inputs', () => {
  const image = 'data:image/png;base64,aGVsbG8=';
  assert.equal(reconstructionFrames({ image })[0].image, image);
  assert.equal(
    reconstructionFrames({
      frames: [
        { image, time: 1 },
        { image, time: 2 },
      ],
    }).length,
    2,
  );
  for (const body of [
    {},
    { frames: Array(7).fill({ image }) },
    { frames: [{ image, time: -1 }] },
    { image: 'https://evil.invalid/image' },
    { frames: [{ image: 'data:image/png;base64,' + 'a'.repeat(7_000_000) }] },
  ])
    assert.throws(() => reconstructionFrames(body));
});

test('copy polish preserves code, attributes and structure and requires no model', () => {
  const r = refineCopy(
    '<section id="utilize"><h2>Utilize this in order to commence</h2><a href="/utilize">Go</a><pre>utilize()</pre><textarea>utilize</textarea></section>',
  );
  assert.equal(r.edits.length, 1);
  assert.match(r.html, /Use this to start/);
  assert.match(r.html, /id="utilize"/);
  assert.match(r.html, /href="\/utilize"/);
  assert.match(r.html, /<pre>utilize\(\)<\/pre>/);
  assert.match(r.html, /<textarea>utilize<\/textarea>/);
  assert.equal(refineCopy(r.html).edits.length, 0);
});

test('fit detects interactive Next server components and recognizes associated labels', () => {
  const html = '<label for="email">Email</label><input id="email"><button>Send</button>';
  const fit = projectFit({
    html,
    framework: 'react',
    nextApp: true,
    source: 'export default function Page() {}',
  });
  assert.equal(fit.categories[0].score, 0);
  assert.equal(fit.categories.find((c) => c.name === 'Accessibility').score, 100);
  assert.equal(
    projectFit({ html, framework: 'react', nextApp: true, source: '"use client";' }).categories[0]
      .score,
    100,
  );
});

test('local decisions explain blockers, adaptation, missing behavior and review readiness', () => {
  const base = { html: '<button>Continue</button>', framework: 'react' };
  assert.equal(projectFit(base).decision.status, 'connect-actions');
  const wired = projectFit({ ...base, handler: 'onAction', handlers: ['onAction'] });
  assert.equal(wired.decision.status, 'review');
  assert.match(wired.decision.backend, /Not recovered/);
  assert.equal(projectFit({ ...base, nextApp: true }).decision.status, 'blocked');
  assert.equal(
    projectFit({ ...base, html: '<img alt="Product" src="x">' }).decision.status,
    'adapt',
  );
  const fields = projectFit({ ...base, html: '<input aria-label="Email">' });
  assert.match(fields.decision.logic, /1 local input states/);
});
