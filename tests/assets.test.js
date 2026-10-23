import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundledFonts, bundledFontFor, fontFaceCss, fontRequirement } from '../src/fonts.js';
import { collectAssets, hexColor, fontFaces, svgDataUri } from '../src/library/assets.js';
import { safeFont } from '../src/branding.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('bundled fonts ship their files and OFL licence, and produce valid theme stacks', () => {
  assert.equal(bundledFonts.length, 8);
  for (const font of bundledFonts) {
    for (const file of Object.values(font.files)) {
      const bytes = readFileSync(path.join(root, 'public', file));
      assert.equal(bytes.subarray(0, 4).toString(), 'wOF2', file);
    }
    assert.match(
      readFileSync(path.join(root, 'public', font.licenseFile), 'utf8'),
      /SIL Open Font License, Version 1\.1/,
    );
    assert.ok(safeFont(font.stack), font.stack);
    assert.equal(bundledFontFor(font.stack), font);
  }
  assert.equal(bundledFontFor('"Lora", Georgia, serif').id, 'lora');
  assert.equal(bundledFontFor('Georgia, serif'), undefined);
  assert.equal(fontFaceCss('Georgia, serif'), '');
  const lora = fontFaceCss('Lora, Lora Variable, Georgia, serif');
  assert.equal((lora.match(/@font-face/g) || []).length, 2);
  assert.match(lora, /font-weight:400 700/);
  assert.doesNotMatch(lora, /Inter/);
  assert.match(fontRequirement('Lora, serif'), /npm i @fontsource-variable\/lora/);
  assert.equal(fontRequirement('Georgia, serif'), '');
  assert.ok(existsSync(path.join(root, 'public/fonts/inter/OFL.txt')));
});

test('captured assets are collected once with the components and sites that use them', () => {
  const font = 'data:font/woff2;base64,d09GMgABAAAA';
  const css = `@font-face{font-family:"Brand Sans";font-weight:600;src:url("${font}") format("woff2")}@font-face{font-family:Brand Sans;font-style:italic;src:url("https://cdn.example.com/b.woff2")}[data-rf-rendered="0"]{color:rgb(29, 29, 31);background-color:rgba(0, 0, 0, 0);border-top-color:#FFF}a{fill:#0071e3}`;
  const icon = '<svg viewBox="0 0 24 24" class="a"><path d="M1 1h22"/></svg>';
  const item = (id, source, extra = '') => ({
    id,
    name: 'Card ' + id,
    source,
    html: '<a>x</a>',
    feature: {
      spec: {
        website: {
          css,
          pages: [
            {
              html: `<div style="color:#0071e3">${icon.replace('class="a"', 'class="b"')}<img src="https://cdn.example.com/hero.jpg"></div>${extra}`,
            },
          ],
        },
      },
    },
  });
  const assets = collectAssets([
    item('1', 'https://www.apple.com/'),
    item('2', 'https://apple.com/iphone/', '<svg onload="x()"><path/></svg>'),
    { id: '3', name: 'Plain', source: 'Reframe starter', html: '<p>hi</p>' },
  ]);
  assert.equal(assets.fonts.length, 2);
  const embedded = assets.fonts.find((f) => f.embedded);
  assert.equal(embedded.family, 'Brand Sans');
  assert.equal(embedded.weight, '600');
  assert.equal(embedded.usedBy.length, 2);
  assert.deepEqual([...new Set(embedded.usedBy.map((u) => u.site))], ['apple.com']);
  assert.equal(assets.fonts.find((f) => !f.embedded).style, 'italic');
  assert.deepEqual(assets.colors.map((c) => c.hex).sort(), ['#0071e3', '#1d1d1f', '#ffffff']);
  assert.equal(
    assets.colors.find((c) => c.hex === '#0071e3').count,
    4,
    'counted per use across components',
  );
  assert.equal(
    assets.icons.length,
    1,
    'class differences do not duplicate an icon; unsafe SVG is skipped',
  );
  assert.match(assets.icons[0].svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svgDataUri(assets.icons[0].svg), /^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
  assert.deepEqual(
    assets.images.map((i) => i.src),
    ['https://cdn.example.com/hero.jpg'],
  );
  assert.equal(collectAssets([]).fonts.length, 0);
});

test('color and font-face parsing handle shorthand, transparency and missing sources', () => {
  assert.equal(hexColor('#abc'), '#aabbcc');
  assert.equal(hexColor('#AABBCC80'), '#aabbcc');
  assert.equal(hexColor('#aabbcc00'), null);
  assert.equal(hexColor('rgb(255 0 0 / 0)'), null);
  assert.equal(hexColor('rgba(0,128,255,.5)'), '#0080ff');
  assert.equal(hexColor('red'), null);
  assert.deepEqual(fontFaces('@font-face{font-family:X}'), []);
});
