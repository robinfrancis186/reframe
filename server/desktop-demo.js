import { mkdir, writeFile, access, symlink, lstat, readlink, unlink } from 'node:fs/promises';
import path from 'node:path';

/** Create a writable starter without shipping a developer's captures or demo records. */
export async function desktopDemo(store, dependencies) {
  const folder = path.join(store, 'Demo App');
  await mkdir(folder, { recursive: true });
  if ((await lstat(folder)).isSymbolicLink())
    throw new Error('The demo folder must not be a symbolic link.');
  await mkdir(path.join(folder, 'src'), { recursive: true });
  const files = {
    'package.json': JSON.stringify({
      name: 'reframe-demo',
      private: true,
      type: 'module',
      scripts: { dev: 'vite', build: 'vite build' },
      dependencies: { react: '^19.2.0', 'react-dom': '^19.2.0', vite: '^6.4.1' },
    }),
    'vite.config.js': "export default {esbuild:{jsx:'automatic'}};",
    'index.html':
      '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reframe Demo</title><div id="root"></div><script type="module" src="/src/main.tsx"></script></html>',
    'src/main.tsx':
      "import React from 'react';import{createRoot}from'react-dom/client';import App from './App';createRoot(document.getElementById('root')!).render(<App/>);",
    'src/App.tsx':
      "import React from 'react';export default function App(){return <main style={{fontFamily:'system-ui',padding:32,background:'#f7f6f2',color:'#242422',minHeight:'100vh'}}><h1>Your component, at home.</h1><p>Components installed here stay in this demo project.</p><section aria-label=\"Installed components\"></section></main>}",
  };
  for (const [name, text] of Object.entries(files))
    try {
      await writeFile(path.join(folder, name), text, { flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  const modules = path.join(folder, 'node_modules');
  try {
    const entry = await lstat(modules);
    if (entry.isSymbolicLink() && (await readlink(modules)) !== dependencies) {
      await unlink(modules);
      await symlink(dependencies, modules);
    }
    await access(modules);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await symlink(dependencies, path.join(folder, 'node_modules'));
  }
  return folder;
}
