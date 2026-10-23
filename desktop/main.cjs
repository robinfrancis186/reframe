const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { spawn } = require('node:child_process');
const {
  mkdir,
  appendFile,
  cp,
  mkdtemp,
  rm,
  access,
  readFile,
  writeFile,
} = require('node:fs/promises');
const path = require('node:path');
const { availablePort } = require('./port.cjs');
const { readOnlyVolume, prepareRuntime } = require('./portable.cjs');
const { pathToFileURL } = require('node:url');
let child,
  window,
  origin,
  starting = false,
  quitting = false;
const root = path.join(__dirname, '..');
const startedAt = Date.now();
let runtime = {
  root,
  resources: app.isPackaged
    ? path.join(process.resourcesPath, 'reframe-runtime')
    : path.join(root, '.desktop-runtime/reframe-runtime'),
};
let prepared = false;
const recoveryURL = pathToFileURL(path.join(__dirname, 'recovery.html')).href;
const store =
  process.env.REFRAME_DESKTOP_TEST_STORE || path.join(app.getPath('userData'), 'workspace');
const log = path.join(store, 'desktop.log');
async function record(phase) {
  try {
    await mkdir(store, { recursive: true, mode: 0o700 });
    await appendFile(log, JSON.stringify({ phase, elapsedMs: Date.now() - startedAt }) + '\n', {
      mode: 0o600,
    });
  } catch {
    /* A full or unwritable disk must not hide the recovery screen. */
  }
}
async function stopBackend() {
  const owned = child;
  child = undefined;
  if (!owned || owned.exitCode !== null || owned.signalCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => owned.kill('SIGKILL'), 6000);
    owned.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    owned.kill('SIGTERM');
  });
}
async function start() {
  if (starting || quitting) return;
  starting = true;
  try {
    await window.loadFile(path.join(__dirname, 'recovery.html'));
    window.show();
    await record('startup-visible');
    await stopBackend();
    if (quitting) return;
    if (!prepared && app.isPackaged) {
      await window.loadFile(path.join(__dirname, 'recovery.html'), { query: { preparing: '1' } });
      runtime = await prepareRuntime(
        root,
        runtime.resources,
        path.join(app.getPath('userData'), 'engine-cache'),
        await readOnlyVolume(root),
      );
      await record(runtime.reused ? 'runtime-cache-reused' : 'runtime-cache-prepared');
    }
    prepared = true;
    if (quitting) return;
    await backend();
    await record('backend-ready');
    if (quitting) return;
    await window.loadURL(origin);
    await record('home-ready');
  } catch (error) {
    await stopBackend();
    if (!quitting) {
      await record('startup-failed');
      await window.loadFile(path.join(__dirname, 'recovery.html'), {
        query: { state: 'failed', message: error.message },
      });
    }
  } finally {
    starting = false;
  }
}
async function backend(attempt = 0) {
  const { resources } = runtime;
  await mkdir(store, { recursive: true, mode: 0o700 });
  let preferred = 5176;
  try {
    const saved = JSON.parse(await readFile(path.join(store, 'desktop-port.json'), 'utf8'));
    if (Number.isInteger(saved.port) && saved.port >= 1024 && saved.port <= 65535)
      preferred = saved.port;
  } catch {
    /* An unavailable port preference never affects the Library. */
  }
  const listen = await availablePort(preferred);
  origin = `http://127.0.0.1:${listen}`;
  await writeFile(path.join(store, 'desktop-port.json'), JSON.stringify({ port: listen }), {
    mode: 0o600,
  });

  child = spawn(path.join(resources, 'node'), [path.join(runtime.root, 'server/index.js')], {
    cwd: runtime.root,
    env: {
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
      HOME: app.getPath('home'),
      NODE_ENV: 'production',
      PORT: String(listen),
      REFRAME_STORE: store,
      REFRAME_DESKTOP: '1',
      NODE_COMPILE_CACHE: path.join(app.getPath('userData'), 'compile-cache'),
      REFRAME_OCR: path.join(resources, 'ocr'),
      REFRAME_CHROMIUM: path.join(
        resources,
        'chromium/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      ),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const append = (chunk) => void appendFile(log, chunk, { mode: 0o600 }).catch(() => {});
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  let launchError;
  child.once('error', (error) => {
    launchError = error;
  });
  const owned = child;
  child.on('exit', () => {
    if (!quitting && !starting && child === owned && window) {
      void window.loadFile(path.join(__dirname, 'recovery.html'), {
        query: {
          state: 'failed',
          message:
            'The local engine stopped unexpectedly. Your Library is saved. Try again to continue.',
        },
      });
    }
  });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (quitting) throw Error('Reframe is closing.');
    if (launchError) {
      child = undefined;
      throw launchError;
    }
    if (owned.exitCode !== null || owned.signalCode !== null) {
      if (attempt < 2) return backend(attempt + 1);
      throw Error('The backend stopped. See ' + log);
    }
    try {
      const response = await fetch(origin + '/api/health', { signal: AbortSignal.timeout(750) });
      if (response.ok && (await response.json()).status === 'ok') return;
    } catch {
      /* Wait for the owned child, never attach to another service. */
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw Error('Startup timed out. See ' + log);
}
async function importLibrary(event) {
  if (
    !window ||
    event.sender !== window.webContents ||
    new URL(event.senderFrame.url).origin !== origin
  )
    throw Error('Invalid import request.');
  const selected = await dialog.showOpenDialog(window, {
    title: 'Choose a Reframe project or Library folder',
    properties: ['openDirectory'],
  });
  if (selected.canceled) return { cancelled: true };
  let source;
  for (const candidate of [
    selected.filePaths[0],
    path.join(selected.filePaths[0], '.reframe/library'),
    path.join(selected.filePaths[0], 'library'),
  ]) {
    for (const marker of ['index.json', 'workspace.json'])
      try {
        await access(path.join(candidate, marker));
        source = candidate;
      } catch {
        /* Try the known layout. */
      }
    if (source) break;
  }
  if (!source) throw Error('This folder does not contain a Reframe Library.');
  const temporary = await mkdtemp(path.join(app.getPath('temp'), 'reframe-import-'));
  try {
    await cp(source, path.join(temporary, 'library'), { recursive: true, dereference: false });
    const { LibraryStore } = await import(
      pathToFileURL(path.join(runtime.root, 'server/library-store.js')).href
    );
    const incoming = await new LibraryStore(temporary).read();
    if (!incoming.workspace) return { imported: 0 };
    const current = await (await fetch(origin + '/api/library')).json();
    const before = current.workspace
      ? JSON.parse(current.workspace)
      : { version: 1, items: [], theme: JSON.parse(incoming.workspace).theme };
    const ids = new Set(before.items.map((i) => i.id));
    for (const item of JSON.parse(incoming.workspace).items) {
      if (ids.has(item.id)) item.id = require('node:crypto').randomUUID();
      before.items.push(item);
    }
    const response = await fetch(origin + '/api/library', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({
        baseRevision: current.revision,
        workspace: JSON.stringify(before),
        fonts: {},
      }),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'Import failed.');
    return { imported: JSON.parse(incoming.workspace).items.length };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (window) {
      window.show();
      window.focus();
    }
  });
  app.whenReady().then(async () => {
    window = new BrowserWindow({
      width: 1280,
      height: 850,
      minWidth: 390,
      minHeight: 650,
      title: 'Reframe — Local unsigned build',
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: path.join(__dirname, 'preload.cjs'),
      },
    });
    window.webContents.session.setPermissionRequestHandler(
      async (contents, permission, callback, details) => {
        if (
          contents !== window.webContents ||
          !origin ||
          new URL(details.requestingUrl || contents.getURL()).origin !== origin ||
          permission !== 'media'
        )
          return callback(false);
        const result = await dialog.showMessageBox(window, {
          type: 'question',
          buttons: ['Allow this capture', 'Cancel'],
          defaultId: 1,
          cancelId: 1,
          message: 'Allow camera or microphone capture?',
          detail: 'Only allow this when you started a screen or camera capture in Reframe.',
        });
        callback(result.response === 0);
      },
    );
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    window.webContents.on('will-navigate', (event, url) => {
      if (origin && new URL(url).origin !== origin) {
        event.preventDefault();
        if (/^https:\/\//.test(url)) void shell.openExternal(url);
      }
    });
    window.on('page-title-updated', (event) => event.preventDefault());
    ipcMain.handle('reframe:import-library', importLibrary);
    const recoveryRequest = (event) => {
      if (
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame ||
        event.senderFrame.url.split('?')[0] !== recoveryURL
      )
        throw Error('Invalid recovery request.');
    };
    ipcMain.handle('reframe:retry-startup', (event) => {
      recoveryRequest(event);
      return start();
    });
    ipcMain.handle('reframe:open-log', (event) => {
      recoveryRequest(event);
      return shell.openPath(log);
    });
    await start();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    void stopBackend().finally(() => app.quit());
  });
}
