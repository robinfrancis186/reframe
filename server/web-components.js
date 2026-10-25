import { mkdir, readFile, writeFile, readdir, lstat } from 'node:fs/promises';
import { fork } from 'node:child_process';
import path from 'node:path';
import { zipSync } from 'fflate';
import { renderWebBundle } from './previews.js';

// Only canonical generated code is built; connected project scripts are never executed.
export class WebComponents {
  sessions = new Map();
  busy = false;
  constructor(store) {
    this.folder = path.join(store, 'web-components');
  }
  async prepare(item, theme, { hostname = '127.0.0.1', signal } = {}) {
    if (!['localhost', '127.0.0.1'].includes(hostname)) throw new Error('Invalid component host.');
    if (this.busy || (this.sessions.size >= 3 && !this.sessions.has(item.feature?.spec.id)))
      throw new Error('Close a web component before opening another (maximum three).');
    const id = item.feature?.spec.id;
    if (!/^rf_[a-f0-9]{12}$/.test(id || '')) throw new Error('Build this component first.');
    this.busy = true;
    let child;
    try {
      signal?.throwIfAborted();
      await this.stop(id);
      const root = path.join(this.folder, id);
      await mkdir(root, { recursive: true, mode: 0o700 });
      if ((await lstat(root)).isSymbolicLink()) throw new Error('Invalid component folder.');
      const bundle = await renderWebBundle(root, item, theme);
      signal?.throwIfAborted();
      const directory = `reframe/features/${id}`;
      await mkdir(path.join(root, directory), { recursive: true });
      const files = {
        'start.mjs':
          "import{fileURLToPath}from'node:url';process.env.REFRAME_DEMO_ROOT=fileURLToPath(new URL('.',import.meta.url));process.env.REFRAME_EMBED='1';process.argv.push('--production');await import('./reframe/server.mjs');\n",
        'reframe/server.mjs': bundle.files['server.mjs'],
        'reframe/runtime.mjs': bundle.files['runtime.mjs'],
        'reframe/services.mjs': bundle.files['services.mjs'],
        [directory + '/feature.json']: bundle.files['feature.json'],
        'README.md': `# ${bundle.spec.name}\n\nRun with Node 24+: node start.mjs (default port 5175; change PORT if needed). Frontend, validation, API and local persistence are included. No npm install or Reframe application is required. Data is stored in .reframe/data; saved accounts, keys and records are excluded from this download.\n\nPaste the iframe from Reframe into an HTML template (including Go templates) or use its JSX version in React/Next.js. Keep this local backend running while testing. Local embedding permits localhost and 127.0.0.1; use the same hostname for accounts. This package is not a hosted URL. Public hosting needs an authenticated HTTPS deployment, explicit frame origins and durable production storage. Do not expose the development server to the internet.\n\nCaptured appearance is preserved. Only declared actions are implemented; private business logic is independently authored, not recovered. Inspect feature.json and the component's behavior summary for its actions.\n`,
      };
      for (const name of ['website.mjs', 'commerce.mjs'])
        if (bundle.files[name])
          files[directory + '/' + name] = bundle.files[name].replace(
            "from './services.mjs'",
            "from '../../services.mjs'",
          );
      for (const [name, content] of Object.entries(files))
        await writeFile(path.join(root, name), content, { mode: 0o600 });
      const entries = Object.fromEntries(
        Object.entries(files).map(([name, content]) => [name, new TextEncoder().encode(content)]),
      );
      async function collect(folder, relative = '') {
        for (const entry of await readdir(folder, { withFileTypes: true })) {
          const file = path.join(folder, entry.name),
            name = relative + entry.name;
          if (entry.isSymbolicLink()) throw new Error('Invalid export asset.');
          if (entry.isDirectory()) await collect(file, name + '/');
          else if (entry.isFile()) entries['dist/' + name] = await readFile(file);
        }
      }
      await collect(path.join(root, 'dist'));
      const archive = zipSync(entries);
      if (archive.length > 16000000) throw new Error('Component exceeds the 16 MB download limit.');
      await writeFile(path.join(root, 'component.zip'), archive);
      signal?.throwIfAborted();
      child = fork(path.join(root, 'start.mjs'), [], {
        env: { PORT: '0', NODE_ENV: 'production' },
        execArgv: [],
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      });
      const port = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Component startup timed out.')), 10000);
        const finish = (error, port) => {
          clearTimeout(timer);
          if (error) reject(error);
          else resolve(port);
        };
        child.once('error', (error) => finish(error));
        child.once('exit', () => finish(new Error('Component stopped before it was ready.')));
        child.once('message', (message) =>
          Number.isInteger(message?.port) && message.port > 0 && message.port < 65536
            ? finish(null, message.port)
            : finish(new Error('Invalid component address.')),
        );
      });
      signal?.throwIfAborted();
      const session = { id, root, child, url: `http://${hostname}:${port}/` };
      this.sessions.set(id, session);
      child.once('exit', () => {
        if (this.sessions.get(id) === session) this.sessions.delete(id);
      });
      return {
        id,
        url: session.url,
        download: `/api/web-components/${id}/download`,
        height: bundle.spec.website?.pages[0]?.component
          ? bundle.spec.website.pages[0].height + 32
          : 620,
      };
    } catch (error) {
      if (child) await this.stopChild(child);
      throw error;
    } finally {
      this.busy = false;
    }
  }
  async archive(id) {
    const session = this.sessions.get(id);
    if (!session) throw new Error('Prepare the component again to download it.');
    return readFile(path.join(session.root, 'component.zip'));
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
  async stop(id) {
    const session = this.sessions.get(id);
    if (session) {
      this.sessions.delete(id);
      await this.stopChild(session.child);
    }
  }
  async close() {
    await Promise.all([...this.sessions.keys()].map((id) => this.stop(id)));
  }
}
