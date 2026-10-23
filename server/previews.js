import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { build } from 'vite';
import { validatedFeature } from './features.js';
import { themeStyle } from '../src/branding.js';
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
export class WorkingPreviews {
  sessions = new Map();
  building = false;
  constructor(store, parentOrigin) {
    this.folder = path.join(store, 'previews');
    this.parentOrigin = parentOrigin;
  }
  targets() {
    return [...this.sessions.values()].map((s) => ({
      id: s.id,
      name: `Preview · ${s.name}`,
      url: s.url,
    }));
  }
  async start({ item, theme }, { signal, hostname = '127.0.0.1' } = {}) {
    if (this.building || this.sessions.size >= 3)
      throw new Error(
        'Stop a preview before starting another (maximum three, one build at a time).',
      );
    if (!['localhost', '127.0.0.1'].includes(hostname)) throw new Error('Invalid preview host.');
    this.building = true;
    let root, child;
    try {
      signal?.throwIfAborted();
      const variables = themeStyle(theme),
        bundle = await validatedFeature(item);
      await mkdir(this.folder, { recursive: true, mode: 0o700 });
      root = await realpath(await mkdtemp(path.join(this.folder, 'run-')));
      await writeFile(path.join(root, 'feature.json'), JSON.stringify(bundle.spec));
      for (const name of ['Component.tsx', 'Account.tsx'])
        if (bundle.files[name])
          await writeFile(
            path.join(root, name),
            bundle.files[name].replace(
              "if(action.operation==='navigate'){window.location.assign(action.target);return;}",
              "if(action.operation==='navigate'){setMessage('Navigation is disabled in this disposable preview.');return;}",
            ),
          );
      await writeFile(
        path.join(root, 'index.html'),
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reframe · Disposable working preview</title></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>',
      );
      await writeFile(
        path.join(root, 'main.tsx'),
        `import React from 'react';import{createRoot}from'react-dom/client';import Component from './Component';import './preview.css';const brand=${JSON.stringify(variables)};createRoot(document.getElementById('root')!).render(<main style={{...brand,'--primary':brand['--rf-primary'],'--primary-foreground':brand['--rf-on-primary'],'--radius':brand['--rf-radius'],fontFamily:brand['--rf-font'],background:brand['--rf-bg'],color:brand['--rf-text'],colorScheme:brand['--rf-scheme']}}><Component/></main>);`,
      );
      await writeFile(
        path.join(root, 'preview.css'),
        'html,body{margin:0;min-height:100%;font-family:system-ui}*{box-sizing:border-box}main{padding:24px;min-height:100vh}h1,h2,h3{letter-spacing:-.025em;line-height:1.2}input,button,textarea,select{max-width:100%;font:inherit}input,button{min-height:44px}button{cursor:pointer}button:disabled{cursor:wait;opacity:.55}:focus-visible{outline:2px solid var(--primary);outline-offset:3px}pre{white-space:pre-wrap;overflow-wrap:anywhere}li{margin:10px 0}p[role=alert]{color:inherit;border-left:3px solid;padding:12px}',
      );
      await build({
        root,
        configFile: false,
        envFile: false,
        logLevel: 'error',
        esbuild: { jsx: 'automatic' },
        resolve: {
          dedupe: ['react', 'react-dom'],
          alias: {
            'react-dom': path.join(projectRoot, 'node_modules/react-dom'),
            react: path.join(projectRoot, 'node_modules/react'),
          },
        },
        build: { outDir: 'dist', emptyOutDir: true, minify: true },
      });
      signal?.throwIfAborted();
      child = fork(
        fileURLToPath(new URL('./preview-runtime.mjs', import.meta.url)),
        [root, this.parentOrigin],
        {
          env: { NODE_ENV: 'production', PATH: process.env.PATH || '' },
          execArgv: [],
          stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        },
      );
      const port = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Preview startup timed out.')), 10000);
        child.once('message', (m) => {
          clearTimeout(timer);
          Number.isInteger(m?.port) ? resolve(m.port) : reject(new Error('Invalid preview port.'));
        });
        child.once('error', (e) => {
          clearTimeout(timer);
          reject(e);
        });
        child.once('exit', () => {
          clearTimeout(timer);
          reject(new Error('Preview stopped before startup.'));
        });
      });
      signal?.throwIfAborted();
      const id = 'preview-' + randomUUID(),
        expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const session = {
        id,
        name: bundle.spec.name,
        url: `http://${hostname}:${port}/`,
        expiresAt,
        root,
        child,
        timer: setTimeout(() => void this.stop(id), 30 * 60 * 1000),
      };
      this.sessions.set(id, session);
      child.once('exit', () => {
        void this.stop(id);
      });
      return {
        id,
        name: session.name,
        url: session.url,
        expiresAt,
        featureId: bundle.spec.id,
        actions: bundle.spec.actions.map((a) => ({ label: a.label, operation: a.operation })),
        limitations: [
          'Disposable local records and test accounts only. Data is removed when stopped or after 30 minutes.',
          'External APIs, credential writes, popups and top-level navigation are blocked.',
          'A successful preview is not proof of destination integration, native runtime or production readiness.',
        ],
      };
    } catch (error) {
      if (child) {
        child.kill('SIGKILL');
        await new Promise((resolve) =>
          child.exitCode !== null || child.signalCode ? resolve() : child.once('exit', resolve),
        );
      }
      if (root) await rm(root, { recursive: true, force: true });
      throw error;
    } finally {
      this.building = false;
    }
  }
  async stop(id) {
    const session = this.sessions.get(id);
    if (!session) return { stopped: true };
    this.sessions.delete(id);
    clearTimeout(session.timer);
    session.child.kill('SIGKILL');
    await new Promise((resolve) =>
      session.child.exitCode !== null || session.child.signalCode
        ? resolve()
        : session.child.once('exit', resolve),
    );
    await rm(session.root, { recursive: true, force: true });
    return { stopped: true };
  }
  async close() {
    await Promise.all([...this.sessions.keys()].map((id) => this.stop(id)));
  }
}
