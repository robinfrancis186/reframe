import { mkdir, cp, symlink, rm, mkdtemp } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
const run = promisify(execFile),
  stage = await mkdtemp(path.join(tmpdir(), 'reframe-dmg-'));
try {
  const source = path.resolve('out/Reframe-darwin-arm64/Reframe.app');
  const stagedApp = path.join(stage, 'Reframe.app');
  await cp(source, stagedApp, { recursive: true, verbatimSymlinks: true });
  // File Provider can recreate Finder metadata in Documents; seal outside that folder.
  for (const attribute of ['com.apple.FinderInfo', 'com.apple.ResourceFork'])
    await run('/usr/bin/xattr', ['-dr', attribute, stagedApp]);
  if (!process.env.MAC_SIGN_IDENTITY)
    await run('/usr/bin/codesign', [
      '--force',
      '--deep',
      '--sign',
      '-',
      '--preserve-metadata=entitlements,flags,runtime',
      stagedApp,
    ]);
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', stagedApp]);
  await cp(stagedApp, source, {
    recursive: true,
    verbatimSymlinks: true,
  });
  await symlink('/Applications', path.join(stage, 'Applications'));
  await mkdir('out/make', { recursive: true });
  await run(
    '/usr/bin/hdiutil',
    [
      'create',
      '-volname',
      'Reframe',
      '-srcfolder',
      stage,
      '-ov',
      '-format',
      'ULFO',
      path.resolve('out/make/Reframe-arm64-local-unsigned.dmg'),
    ],
    { maxBuffer: 1024 * 1024 },
  );
  console.log('Created out/make/Reframe-arm64-local-unsigned.dmg');
} finally {
  await rm(stage, { recursive: true, force: true });
}
