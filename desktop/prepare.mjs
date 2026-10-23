import { cp, mkdir, access, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url),
  root = process.cwd(),
  folder = path.join(root, '.desktop-runtime/reframe-runtime');
await mkdir(folder, { recursive: true });
await cp(require.resolve('node/bin/node'), path.join(folder, 'node'));
execFileSync(
  '/usr/bin/xcrun',
  [
    'swiftc',
    path.join(root, 'server/ocr.swift'),
    '-target',
    'arm64-apple-macos13.0',
    '-O',
    '-o',
    path.join(folder, 'ocr'),
  ],
  { timeout: 120000 },
);
const executable = chromium.executablePath(),
  chromiumRoot = path.dirname(path.dirname(path.dirname(path.dirname(path.dirname(executable)))));
await access(executable);
await rm(path.join(folder, 'chromium'), { recursive: true, force: true });
await cp(chromiumRoot, path.join(folder, 'chromium'), { recursive: true, verbatimSymlinks: true });
console.log(
  'Bundled Node, Chromium and macOS OCR prepared. No credentials or workspace files copied.',
);
