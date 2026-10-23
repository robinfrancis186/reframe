import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { archiveEngine } from '../desktop/archive.mjs';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../desktop/main.cjs', import.meta.url), 'utf8');
for (const failure of ['timeout', 'spawn', 'storage']) {
  test(`desktop recovers from ${failure} without orphaning a backend or granting web-page recovery access`, async () => {
    const store = await mkdtemp(path.join(tmpdir(), 'reframe-startup-unit-'));
    const windows = [],
      events = [],
      children = [],
      handlers = new Map();
    let ready,
      now = 0,
      failing = true;
    const app = new EventEmitter();
    Object.assign(app, {
      isPackaged: true,
      getPath: () => store,
      requestSingleInstanceLock: () => true,
      whenReady: () => ({
        then: (callback) => {
          ready = callback();
        },
      }),
      quit: () => events.push('quit'),
    });
    class Window extends EventEmitter {
      constructor(options) {
        super();
        windows.push(this);
        this.options = options;
        this.webContents = new EventEmitter();
        Object.assign(this.webContents, {
          mainFrame: { url: '' },
          session: { setPermissionRequestHandler() {} },
          setWindowOpenHandler() {},
          getURL: () => this.webContents.mainFrame.url,
        });
      }
      async loadFile(file, options) {
        this.webContents.mainFrame.url =
          pathToFileURL(file).href +
          (options?.query ? '?' + new URLSearchParams(options.query) : '');
        events.push(options?.query?.state || 'startup');
      }
      async loadURL(url) {
        this.webContents.mainFrame.url = url;
        events.push('home');
      }
      show() {
        events.push('visible');
      }
    }
    const spawn = () => {
      events.push('spawn');
      const child = new EventEmitter();
      Object.assign(child, {
        exitCode: null,
        signalCode: null,
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        kill(signal) {
          this.signalCode = signal;
          events.push(signal);
          this.emit('exit', null);
        },
      });
      children.push(child);
      if (failing && failure === 'spawn')
        queueMicrotask(() => child.emit('error', Error('Missing bundled runtime')));
      return child;
    };
    try {
      runInNewContext(source, {
        require: (id) =>
          id === 'electron'
            ? {
                app,
                BrowserWindow: Window,
                dialog: {},
                ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
                shell: {},
              }
            : id === 'node:child_process'
              ? { spawn }
              : id === './portable.cjs'
                ? {
                    readOnlyVolume: async () => false,
                    prepareRuntime: async (root, resources) => ({ root, resources, reused: true }),
                  }
                : id === './port.cjs'
                  ? { availablePort: async () => 5176 }
                  : id === 'node:fs/promises'
                    ? {
                        ...require(id),
                        mkdir: async (...args) => {
                          if (failing && failure === 'storage') throw Error('Disk is full');
                          return require(id).mkdir(...args);
                        },
                      }
                    : require(id),
        __dirname: path.resolve('desktop'),
        process: { env: { REFRAME_DESKTOP_TEST_STORE: store }, resourcesPath: store },
        Date: { now: () => now },
        URL,
        AbortSignal,
        setTimeout,
        clearTimeout,
        fetch: async () => {
          if (failing) {
            now += failure === 'timeout' ? 31000 : 1;
            throw Error('not ready');
          }
          return { ok: true, json: async () => ({ status: 'ok' }) };
        },
      });
      await ready;
      const window = windows[0];
      assert.ok(events.includes('visible'));
      if (failure !== 'storage') assert.ok(events.indexOf('visible') < events.indexOf('spawn'));
      assert.equal(events.at(-1), 'failed');
      if (failure === 'timeout') assert.equal(children[0].signalCode, 'SIGTERM');
      const retry = handlers.get('reframe:retry-startup');
      const frame = window.webContents.mainFrame;
      assert.throws(
        () => retry({ sender: window.webContents, senderFrame: { url: frame.url } }),
        /Invalid recovery request/,
      );
      failing = false;
      await retry({ sender: window.webContents, senderFrame: frame });
      assert.equal(events.at(-1), 'home');
      assert.throws(
        () => retry({ sender: window.webContents, senderFrame: frame }),
        /Invalid recovery request/,
      );
      assert.equal(window.options.webPreferences.sandbox, true);
      assert.equal(children.length, failure === 'storage' ? 1 : 2);
      children.at(-1).kill('SIGTERM');
      assert.equal(events.at(-1), 'failed');
      const log = await readFile(path.join(store, 'desktop.log'), 'utf8');
      if (failure !== 'storage') assert.match(log, /startup-failed/);
      assert.match(log, /home-ready/);
    } finally {
      await rm(store, { recursive: true, force: true });
    }
  });
}

test('portable runtime cache commits complete versions, reuses them and recovers from interrupted preparation', async () => {
  const { prepareRuntime, readOnlyVolume } = require('../desktop/portable.cjs');
  const { mkdir, writeFile, access, readdir } = require('node:fs/promises');
  const folder = await mkdtemp(path.join(tmpdir(), 'reframe-portable-unit-'));
  const root = path.join(folder, 'Reframe.app/Contents/Resources/app');
  const resources = path.join(root, '../reframe-runtime');
  const cache = path.join(folder, 'profile/engine-cache');
  const seal = path.resolve(resources, '../../_CodeSignature/CodeResources');
  const files = [
    'node',
    'ocr',
    'chromium/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  ];
  try {
    await mkdir(path.dirname(seal), { recursive: true });
    await mkdir(path.join(root, 'server'), { recursive: true });
    await writeFile(path.join(root, 'server/index.js'), 'export const version = 1;');
    for (const name of ['src', 'dist', 'public', 'vendor', 'extension', 'node_modules'])
      await mkdir(path.join(root, name));
    await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
    await archiveEngine(root);
    await assert.rejects(access(path.join(root, 'server')), { code: 'ENOENT' });
    await access(path.join(root, 'package.json'));
    await writeFile(seal, 'signed version one');
    for (const file of files) {
      await mkdir(path.dirname(path.join(resources, file)), { recursive: true });
      await writeFile(path.join(resources, file), 'runtime', { mode: 0o700 });
    }
    if (process.platform === 'darwin') assert.equal(await readOnlyVolume(folder), false);
    const installed = await prepareRuntime(root, resources, cache, false);
    assert.equal(installed.resources, resources);
    assert.equal((await prepareRuntime(root, resources, cache, false)).reused, true);
    assert.equal(
      await readFile(path.join(installed.root, 'server/index.js'), 'utf8'),
      'export const version = 1;',
    );
    const first = await prepareRuntime(root, resources, cache);
    assert.equal(first.reused, false);
    assert.equal((await prepareRuntime(root, resources, cache)).reused, true);
    await mkdir(path.join(cache, '.preparing-interrupted'));
    await writeFile(seal, 'signed version two');
    await rm(path.join(resources, 'ocr'));
    await assert.rejects(prepareRuntime(root, resources, cache), { code: 'ENOENT' });
    await access(first.root);
    assert.equal(
      (await readdir(cache)).some((name) => name.startsWith('.preparing-')),
      false,
    );
    await writeFile(path.join(resources, 'ocr'), 'restored', { mode: 0o700 });
    const next = await prepareRuntime(root, resources, cache);
    assert.notEqual(next.root, first.root);
    await assert.rejects(access(first.root), { code: 'ENOENT' });
    await rm(path.join(next.resources, 'node'));
    assert.equal((await prepareRuntime(root, resources, cache)).reused, false);
    await access(path.join(next.resources, 'node'));
    await writeFile(seal, 'signed version three');
    await writeFile(path.resolve(root, '../engine.tar'), 'broken archive');
    await assert.rejects(prepareRuntime(root, resources, cache));
    await access(next.root);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
