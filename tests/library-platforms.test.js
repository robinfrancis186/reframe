import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { catalog, coverage, libraryItem } from '../src/library/catalog.js';
import { librarySource, libraryPackage } from '../server/library.js';
import { detectBranding } from '../server/branding.js';
import { detectNativeTokens } from '../server/branding-native.js';
import { destinationBrand } from '../src/branding.js';
import { isItem, isTheme } from '../src/model.ts';
import { Projects } from '../server/projects.js';
const run = promisify(execFile),
  theme = {
    name: 'Brand',
    primary: '#176e9b',
    background: '#ffffff',
    text: '#22394a',
    font: 'system-ui, sans-serif',
    radius: 12,
    brandName: 'Haven',
    tagline: 'Your everyday workspace.',
  };
const temporary = async (fn) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'reframe-platforms-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

test('public family coverage is explicit and every clipboard identity regenerates three independent source files', async () => {
  assert.equal(coverage.families, 108);
  assert.equal(new Set(catalog.filter((e) => e.reference).map((e) => e.reference)).size, 108);
  assert.equal(new Set(catalog.map((e) => e.id)).size, catalog.length);
  for (const entry of catalog) {
    const item = JSON.parse(JSON.stringify({ ...libraryItem(entry), theme }));
    assert.ok(isItem(item), entry.id);
    const bundle = await libraryPackage(item.libraryId, item.theme);
    assert.deepEqual(Object.keys(bundle.files).sort(), [
      'Component.kt',
      'Component.swift',
      'Component.tsx',
      'README.md',
      'brand.json',
    ]);
    assert.match(bundle.files['Component.swift'], /struct ReframeOriginal: View/);
    assert.match(bundle.files['Component.kt'], /@Composable\nfun ReframeOriginal\(\)/);
    assert.ok(
      !Object.values(bundle.files).some(
        (text) => text.includes('console.info(') || text.includes('Reframe action:'),
      ),
    );
    const kotlin = bundle.files['Component.kt'].replace(/"(?:\\.|[^"\\])*"/g, '');
    let depth = 0;
    for (const char of kotlin) {
      if (char === '{') depth++;
      if (char === '}') depth--;
      assert.ok(depth >= 0, entry.id);
    }
    assert.equal(depth, 0, entry.id);
    assert.equal(JSON.parse(bundle.files['brand.json']).primary, theme.primary);
  }
  assert.equal(isItem({ ...libraryItem(catalog[0]), libraryId: 'untrusted-script' }), false);
  assert.equal(isTheme({ ...theme, tagline: 22 }), false);
  await assert.rejects(librarySource('tabs', 'Bad;code', theme, false, 'compose'), /capital/);
});
test('native branding resolves Android colors, light/dark schemes, names, radius and Swift color assets', () => {
  const android = [
    {
      path: 'app/src/main/res/values/colors.xml',
      text: '<resources><color name="brand">#A13C5F</color><color name="colorPrimary">@color/brand</color><color name="colorSurface">#FFFFFF</color><color name="colorOnSurface">#112233</color><dimen name="corner_radius">16dp</dimen><string name="app_name">Native Haven</string></resources>',
    },
    {
      path: 'app/src/main/res/values-night/colors.xml',
      text: '<resources><color name="colorPrimary">#AACCFF</color></resources>',
    },
  ];
  const light = detectNativeTokens(android),
    dark = detectNativeTokens(android, 'dark');
  assert.equal(light.theme.primary, '#a13c5f');
  assert.equal(dark.theme.primary, '#aaccff');
  assert.equal(light.theme.radius, 16);
  assert.equal(light.theme.brandName, 'Native Haven');
  const kotlin = [
    { path: 'Color.kt', text: 'val BrandPrimary = Color(0xFF246B51)' },
    {
      path: 'Theme.kt',
      text: 'val Light = lightColorScheme(primary = BrandPrimary, background = Color(0xFFF1F5F3), onSurface = Color(0xFF102016))\nval Dark = darkColorScheme(primary = Color(0xFF88CCAA))',
    },
  ];
  assert.equal(detectNativeTokens(kotlin).theme.primary, '#246b51');
  assert.equal(detectNativeTokens(kotlin, 'dark').theme.primary, '#88ccaa');
  const asset = {
    colors: [
      {
        idiom: 'universal',
        color: { components: { red: '0x11', green: '0x66', blue: '0xAA', alpha: '1.000' } },
      },
      {
        idiom: 'universal',
        appearances: [{ appearance: 'luminosity', value: 'dark' }],
        color: { components: { red: '0.5', green: '0.6', blue: '0.7', alpha: '1.000' } },
      },
    ],
  };
  const swift = [
    { path: 'Assets.xcassets/AccentColor.colorset/Contents.json', text: JSON.stringify(asset) },
    {
      path: 'Theme.swift',
      text: 'let background = Color(red:1, green:1, blue:1)\nlet cornerRadius = 18',
    },
  ];
  assert.equal(detectNativeTokens(swift).theme.primary, '#1166aa');
  assert.equal(detectNativeTokens(swift, 'dark').theme.primary, '#8099b3');
  assert.equal(detectNativeTokens(swift).theme.radius, 18);
});
for (const [framework, file, original] of [
  [
    'swiftui',
    'Screen.swift',
    'import SwiftUI\nstruct Screen: View { var body:some View { VStack { Text("Destination") } } }',
  ],
  [
    'compose',
    'app/src/main/java/com/example/Screen.kt',
    'package com.example\nimport androidx.compose.runtime.Composable\nimport androidx.compose.foundation.layout.Column\nimport androidx.compose.material3.Text\n@Composable fun Screen() { Column { Text("Destination") } }',
  ],
])
  test(`${framework}: clipboard → destination branding → working source insertion → safe undo`, () =>
    temporary(async (dir) => {
      const root = path.join(dir, 'app');
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), original);
      if (framework === 'swiftui') {
        await mkdir(path.join(root, 'Assets.xcassets/AccentColor.colorset'), { recursive: true });
        await writeFile(
          path.join(root, 'Assets.xcassets/AccentColor.colorset/Contents.json'),
          JSON.stringify({
            colors: [
              { color: { components: { red: '0.8', green: '0.2', blue: '0.1', alpha: '1' } } },
            ],
          }),
        );
      } else {
        await mkdir(path.join(root, 'app/src/main/res/values'), { recursive: true });
        await writeFile(
          path.join(root, 'app/src/main/res/values/colors.xml'),
          '<resources><color name="colorPrimary">#CC331A</color></resources>',
        );
      }
      const service = new Projects(path.join(dir, 'state')),
        project = await service.connect(root),
        target = await service.targets(project.id, file);
      const item = JSON.parse(
        JSON.stringify({
          ...libraryItem(catalog.find((e) => e.id === 'be-date-range-picker')),
          theme,
        }),
      );
      const body = {
        projectId: project.id,
        file,
        hash: target.hash,
        pointId: target.points[0].id,
        html: item.html,
        libraryId: item.libraryId,
        theme: item.theme,
        name: 'ReframeNativeDates',
      };
      const detected = await detectBranding(root);
      assert.equal(detected.theme.primary, '#cc331a');
      const fit = await service.fit(body);
      assert.equal(fit.decision.status, 'review');
      assert.equal(fit.themeTokens.primary, '#cc331a');
      const plan = await service.plan(body);
      assert.equal(plan.actions.length, 0);
      assert.equal(plan.minimal.addedDependencies, 0);
      assert.ok(!plan.after.includes('console.info'));
      assert.match(
        plan.after,
        framework === 'swiftui' ? /DatePicker\("Start"/ : /DatePickerDialog/,
      );
      assert.match(plan.after, framework === 'swiftui' ? /red:0.8/ : /Color\(0xFFCC331A\)/);
      await service.apply(plan.id);
      assert.equal(await readFile(path.join(root, file), 'utf8'), plan.after);
      await service.undo(plan.id);
      assert.equal(await readFile(path.join(root, file), 'utf8'), original);
      const selected = await service.plan({ ...body, adaptBranding: false });
      assert.match(
        selected.after,
        framework === 'swiftui' ? /green:0.43137254901960786/ : /Color\(0xFF176E9B\)/,
      );
      const manualFit = await service.fit({ ...body, adaptBranding: false });
      assert.deepEqual(manualFit.themeTokens, {});
      assert.match(
        manualFit.categories.find((c) => c.name === 'Theme').reason,
        /automatic destination branding is off/,
      );
    }));
test('unresolved native colors inherit destination runtime tokens; hostile brand text remains a literal', async () => {
  for (const framework of ['swiftui', 'compose']) {
    const inherited = destinationBrand(theme, {}, framework, true),
      result = await librarySource('brand', 'ReframeBrand', inherited, false, framework);
    assert.match(
      result.code,
      framework === 'swiftui' ? /Color.accentColor/ : /MaterialTheme.colorScheme.primary/,
    );
    const manual = await librarySource(
      'brand',
      'ReframeBrand',
      destinationBrand(theme, {}, framework, false),
      false,
      framework,
    );
    assert.ok(
      !manual.code.includes(
        framework === 'swiftui' ? 'Color.accentColor' : 'val primary = MaterialTheme',
      ),
    );
    const escaped = await librarySource(
      'brand',
      'ReframeBrand',
      { ...theme, brandName: '" $evil \\(code) \u0008 \n' },
      false,
      framework,
    );
    assert.ok(!escaped.code.includes('\u0008'));
    assert.ok(escaped.code.includes(framework === 'swiftui' ? '\\u{8}' : '\\u0008'));
  }
});
test(
  'every SwiftUI export typechecks with the installed macOS SDK, including inherited themes and embedded brand images',
  { skip: process.platform !== 'darwin' },
  () =>
    temporary(async (dir) => {
      const sources = [];
      for (let i = 0; i < catalog.length; i++) {
        const result = await librarySource(
          catalog[i].id,
          'ReframeLibrary' + i,
          theme,
          false,
          'swiftui',
        );
        sources.push(result.imports.join('\n') + '\n' + result.code);
      }
      for (const [index, extra] of [
        {
          ...theme,
          logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=',
        },
        destinationBrand(theme, {}, 'swiftui', true),
      ].entries()) {
        const result = await librarySource(
          'brand',
          'ReframeBrandExtra' + index,
          extra,
          false,
          'swiftui',
        );
        sources.push(result.imports.join('\n') + '\n' + result.code);
      }
      const file = path.join(dir, 'All.swift');
      await writeFile(file, sources.join('\n'));
      await run('swiftc', ['-typecheck', file], { timeout: 60000, maxBuffer: 1000000 });
    }),
);
