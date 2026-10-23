import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'vite';
import express from 'express';
import { chromium } from 'playwright';
import { LibraryStore, mountLibrary } from '../server/library-store.js';
import { starters, themes } from '../src/model.ts';

test(
  'offline metadata operations survive reload, independent edits merge, and conflicting edits can become copies',
  { timeout: 120000 },
  async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'reframe-sync-'))),
      library = new LibraryStore(root);
    let server, browser;
    try {
      for (const id of ['a', 'b'])
        await library.put({
          item: { ...starters[0], id, name: id.toUpperCase(), theme: themes[0] },
          baseRevision: 0,
        });
      const module = path.resolve('src/storage.ts');
      await writeFile(
        path.join(root, 'index.html'),
        '<div id="root"></div><script type="module" src="/main.tsx"></script>',
      );
      await writeFile(
        path.join(root, 'main.tsx'),
        `import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';import{hydrateWorkspace,readWorkspace,writeWorkspace,onLibraryChange,onSyncStatus,syncStatus,recoverPendingCopies}from ${JSON.stringify(module)};await hydrateWorkspace();function App(){const [state,setState]=useState(JSON.parse(readWorkspace())),[status,setStatus]=useState(syncStatus());useEffect(()=>onLibraryChange(raw=>setState(JSON.parse(raw))),[]);useEffect(()=>onSyncStatus(setStatus),[]);function rename(id){const next={...state,items:state.items.map(i=>i.id===id?{...i,name:i.name+' edited'}:i)};writeWorkspace(JSON.stringify(next));setState(next);}return <><p role="status">{status.state}</p><button onClick={()=>rename('a')}>Rename A</button><button onClick={()=>rename('b')}>Rename B</button><button onClick={()=>recoverPendingCopies()}>Keep copies</button><ul>{state.items.map(i=><li key={i.id}>{i.name}</li>)}</ul></>};createRoot(document.getElementById('root')).render(<App/>);`,
      );
      await build({
        root,
        configFile: false,
        envFile: false,
        logLevel: 'error',
        esbuild: { jsx: 'automatic' },
        resolve: {
          alias: {
            react: path.resolve('node_modules/react'),
            'react-dom': path.resolve('node_modules/react-dom'),
          },
        },
        build: { target: 'esnext' },
      });
      const app = express(),
        requests = [];
      app.use((req, _res, next) => {
        if (req.url.startsWith('/api/library')) requests.push({ method: req.method, url: req.url });
        next();
      });
      mountLibrary(app, express, library);
      app.use(express.static(path.join(root, 'dist')));
      app.use((e, _req, res, _next) => res.status(e.status || 400).json({ error: e.message }));
      server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
      });
      browser = await chromium.launch({ headless: true });
      const one = await browser.newContext(),
        two = await browser.newContext();
      const p1 = await one.newPage(),
        p2 = await two.newPage(),
        url = 'http://127.0.0.1:' + server.address().port;
      await p1.goto(url);
      await p2.goto(url);
      await p1.getByRole('button', { name: 'Rename A', exact: true }).waitFor();
      await p2.getByRole('button', { name: 'Rename A', exact: true }).waitFor();
      await one.setOffline(true);
      await p1.getByRole('button', { name: 'Rename A', exact: true }).click();
      await p1.getByRole('status').filter({ hasText: 'offline' }).waitFor();
      await p1.getByRole('button', { name: 'Rename A', exact: true }).click();
      await p1.getByRole('status').filter({ hasText: 'offline' }).waitFor();
      await p2.getByRole('button', { name: 'Rename B', exact: true }).click();
      await p2.getByRole('status').filter({ hasText: 'synced' }).waitFor();
      await one.setOffline(false);
      await p1.reload();
      await p1.getByRole('status').filter({ hasText: 'synced' }).waitFor();
      await p1.getByText('A edited edited', { exact: true }).waitFor();
      await p1.getByText('B edited', { exact: true }).waitFor();
      assert.equal((await library.item('a')).name, 'A edited edited');
      assert.equal((await library.item('b')).name, 'B edited');
      await p2.reload();
      await p2.getByText('A edited edited', { exact: true }).waitFor();
      await two.setOffline(true);
      await p2.getByRole('button', { name: 'Rename A', exact: true }).click();
      await p2.getByRole('status').filter({ hasText: 'offline' }).waitFor();
      await p1.getByRole('button', { name: 'Rename A', exact: true }).click();
      await p1.getByRole('status').filter({ hasText: 'synced' }).waitFor();
      await two.setOffline(false);
      await p2.reload();
      await p2.getByRole('status').filter({ hasText: 'conflict' }).waitFor();
      assert.equal((await library.index()).items.length, 2);
      assert.equal((await library.item('a')).itemRevision, 4);
      await p2.getByRole('button', { name: 'Keep copies', exact: true }).click();
      await p2.getByRole('status').filter({ hasText: 'synced' }).waitFor();
      assert.equal((await library.index()).items.length, 3);
      assert.ok((await library.index()).items.some((i) => i.name.endsWith('(local copy)')));
      assert.ok(
        !requests.some((r) => r.method === 'PUT' && r.url === '/api/library'),
        'no full-library uploads',
      );
      assert.ok(
        !requests.some((r) => r.method === 'GET' && /^\/api\/library\/items\//.test(r.url)) ||
          requests.filter((r) => r.method === 'GET' && /^\/api\/library\/items\//.test(r.url))
            .length === 1,
        'only explicit conflict recovery materializes a component',
      );
    } finally {
      await browser?.close();
      if (server) await new Promise((resolve) => server.close(resolve));
      await rm(root, { recursive: true, force: true });
    }
  },
);
