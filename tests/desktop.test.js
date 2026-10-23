import { copyRuntime } from '../desktop/runtime.mjs';
import { createServer } from 'node:net';
import { availablePort } from '../desktop/port.cjs';
import { transformWithEsbuild } from 'vite';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readlink,
  realpath,
  symlink,
  rm,
} from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { desktopDemo } from '../server/desktop-demo.js';
import { Projects } from '../server/projects.js';
import { execFileSync } from 'node:child_process';

test(
  'packaged OCR uses the bundled helper without a compiler or app-bundle writes',
  { skip: process.platform !== 'darwin' },
  async () => {
    const folder = await mkdtemp(path.join(tmpdir(), 'reframe-ocr-location-'));
    try {
      const script = `import { localVisionStatus } from './server/vision.js'; console.log(JSON.stringify(await localVisionStatus()));`;
      for (const [helper, available] of [
        ['/bin/echo', true],
        [path.join(folder, 'missing'), false],
      ]) {
        const status = JSON.parse(
          execFileSync(process.execPath, ['--input-type=module', '-e', script], {
            cwd: process.cwd(),
            encoding: 'utf8',
            env: { PATH: '', REFRAME_STORE: folder, REFRAME_OCR: helper },
          }),
        );
        assert.equal(status.available, available);
      }
      await assert.rejects(readFile(path.join(folder, 'bin')), { code: 'ENOENT' });
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  },
);

test('desktop starter creates a writable React destination and preserves later user edits', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'reframe-desktop-starter-'));
  try {
    const dependencies = path.join(folder, 'bundled dependencies');
    await mkdir(dependencies);
    const root = await desktopDemo(folder, dependencies);
    assert.equal(await readlink(path.join(root, 'node_modules')), dependencies);
    const { code } = await transformWithEsbuild(
      await readFile(path.join(root, 'src/App.tsx'), 'utf8'),
      'App.tsx',
      { jsx: 'transform', jsxFactory: 'React.createElement', format: 'cjs' },
    );
    const module = { exports: {} };
    runInNewContext(code, {
      require: createRequire(import.meta.url),
      module,
      exports: module.exports,
    });
    assert.match(
      renderToStaticMarkup(React.createElement(module.exports.default)),
      /Your component, at home/,
    );
    const project = await new Projects(path.join(folder, 'state')).connect(root);
    assert.ok(
      project.files.some((file) => file.path === 'src/App.tsx' && file.framework === 'react'),
    );
    await writeFile(
      path.join(root, 'src/App.tsx'),
      'export default function App(){return <main>Keep my work</main>}',
    );
    await desktopDemo(folder, dependencies);
    assert.match(await readFile(path.join(root, 'src/App.tsx'), 'utf8'), /Keep my work/);
    const updatedDependencies = path.join(folder, 'updated dependencies');
    await mkdir(updatedDependencies);
    await rm(dependencies, { recursive: true });
    await desktopDemo(folder, updatedDependencies);
    assert.equal(await readlink(path.join(root, 'node_modules')), updatedDependencies);
    assert.doesNotMatch(
      await readFile(path.join(root, 'package.json'), 'utf8'),
      /\.env|OPENAI_API_KEY/,
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('desktop reuses its preferred loopback port and falls back when another process owns it', async () => {
  const port = await availablePort();
  assert.equal(await availablePort(port), port);
  const occupied = createServer();
  await new Promise((resolve) => occupied.listen(port, '127.0.0.1', resolve));
  try {
    const fallback = await availablePort(port);
    assert.notEqual(fallback, port);
    assert.ok(fallback > 0 && fallback <= 65535);
  } finally {
    await new Promise((resolve) => occupied.close(resolve));
  }
});

test('runtime framework links remain local after copying and removing the source cache', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'reframe-runtime-links-'));
  try {
    const source = path.join(root, 'cache'),
      target = path.join(root, 'bundle/reframe-runtime');
    await mkdir(path.join(source, 'Framework/Versions/123/Resources'), { recursive: true });
    await writeFile(path.join(source, 'Framework/Versions/123/Resources/font'), 'bundled');
    await symlink('123', path.join(source, 'Framework/Versions/Current'));
    await symlink('Versions/Current/Resources', path.join(source, 'Framework/Resources'));
    await copyRuntime(source, target);
    await rm(source, { recursive: true });
    assert.equal(
      await readlink(path.join(target, 'Framework/Resources')),
      'Versions/Current/Resources',
    );
    assert.equal(await readFile(path.join(target, 'Framework/Resources/font'), 'utf8'), 'bundled');
    assert.ok(
      (await realpath(path.join(target, 'Framework/Resources'))).startsWith(await realpath(target)),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
