import { fork } from 'node:child_process';
import { realpath, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'vite';

const appRoot = fileURLToPath(new URL('..', import.meta.url));

/** Launch only Reframe's owned demo, without running a connected project's scripts or config. */
export class DemoLauncher {
  session = null;
  busy = false;
  constructor(store, projects, parentOrigin = '') {
    this.folder = path.join(store, 'Demo App');
    this.projects = projects;
    this.parentOrigin = parentOrigin;
  }
  targets() {
    return this.session ? [{ id: 'demo-app', name: 'Demo app', url: this.session.url }] : [];
  }
  status() {
    return this.session ? { projectId: this.session.projectId, url: this.session.url } : null;
  }
  /** @param {string} projectId @param {{signal?: AbortSignal}} options */
  async start(projectId, { signal } = {}) {
    if (this.busy) throw new Error('The demo is already starting. Please wait.');
    this.busy = true;
    let child;
    try {
      const project = await this.projects.get(projectId);
      if ((await lstat(this.folder)).isSymbolicLink())
        throw new Error('The demo folder must not be a symbolic link.');
      if ((await realpath(project.root)) !== (await realpath(this.folder)))
        throw new Error('One-click launching is available only for the Reframe demo app.');
      signal?.throwIfAborted();
      await this.close();
      // Ignore package scripts, .env and Vite config; caches and output stay in the writable demo.
      await build({
        root: project.root,
        configFile: false,
        envFile: false,
        logLevel: 'error',
        esbuild: { jsx: 'automatic' },
        resolve: {
          dedupe: ['react', 'react-dom'],
          alias: {
            'react-dom': path.join(appRoot, 'node_modules/react-dom'),
            react: path.join(appRoot, 'node_modules/react'),
          },
        },
        build: { outDir: 'dist', emptyOutDir: true },
      });
      signal?.throwIfAborted();
      child = fork(
        fileURLToPath(new URL('./features/runner.mjs', import.meta.url)),
        ['--production'],
        {
          env: {
            NODE_ENV: 'production',
            PORT: '0',
            REFRAME_DEMO_ROOT: project.root,
            REFRAME_DEMO_PARENT_ORIGIN: this.parentOrigin,
          },
          execArgv: [],
          stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        },
      );
      const port = await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Demo startup timed out. Try launching again.')),
          15000,
        );
        const done = (error, port) => {
          clearTimeout(timer);
          child.removeListener('error', failed);
          child.removeListener('exit', exited);
          if (error) reject(error);
          else resolve(port);
        };
        const failed = (error) => done(error);
        const exited = () => done(new Error('Demo stopped before it was ready.'));
        child.once('error', failed);
        child.once('exit', exited);
        child.once('message', (message) => {
          if (!Number.isInteger(message?.port) || message.port < 1 || message.port > 65535)
            done(new Error('Demo returned an invalid address.'));
          else done(null, message.port);
        });
      });
      const url = `http://127.0.0.1:${port}/`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('The demo did not load. Try launching again.');
      await response.body?.cancel();
      signal?.throwIfAborted();
      const session = { projectId, url, child };
      this.session = session;
      child.once('exit', () => {
        if (this.session === session) this.session = null;
      });
      return this.status();
    } catch (error) {
      if (child) await this.stopChild(child);
      throw error;
    } finally {
      this.busy = false;
    }
  }
  async stopChild(child) {
    if (child.exitCode !== null || child.signalCode) return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill('SIGTERM');
    });
  }
  async close() {
    const session = this.session;
    this.session = null;
    if (session) await this.stopChild(session.child);
  }
}
