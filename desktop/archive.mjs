import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rm } from 'node:fs/promises';
import path from 'node:path';

// Seal thousands of dependency files as one resource; extract only into the private cache.
export async function archiveEngine(root) {
  const entries = ['server', 'src', 'dist', 'public', 'vendor', 'extension', 'node_modules'];
  await promisify(execFile)(
    '/usr/bin/tar',
    ['-cf', path.resolve(root, '../engine.tar'), '-C', root, ...entries, 'package.json'],
    { env: { ...process.env, COPYFILE_DISABLE: '1' } },
  );
  for (const entry of entries) await rm(path.join(root, entry), { recursive: true });
}
