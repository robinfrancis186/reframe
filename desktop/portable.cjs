const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createHash } = require('node:crypto');
const {
  mkdir,
  readFile,
  writeFile,
  cp,
  mkdtemp,
  rename,
  rm,
  access,
  readdir,
} = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const run = promisify(execFile);

async function readOnlyVolume(file) {
  const { stdout } = await run('/bin/df', ['-P', file], { timeout: 5000 });
  const device = stdout
    .split('\n')
    .slice(1)
    .find((line) => line.startsWith('/dev/'))
    ?.split(/\s+/)[0];
  if (!device) return false;
  const info = await run('/usr/sbin/diskutil', ['info', '-plist', device], { timeout: 5000 });
  return /<key>WritableVolume<\/key>\s*<false\s*\/>/.test(info.stdout);
}

// Read-only image paging can stall both runtimes; prepare a private, replaceable execution cache.
async function prepareRuntime(root, resources, cache, portable = true) {
  const seal = await readFile(path.resolve(resources, '../../_CodeSignature/CodeResources'));
  const key = createHash('sha256').update(seal).digest('hex');
  const target = path.join(cache, key);
  const paths = {
    root: path.join(target, 'app'),
    resources: portable ? path.join(target, 'runtime') : resources,
  };
  const check = async (folder) => {
    await access(path.join(folder, 'app/server/index.js'));
    if (!portable) return;
    await access(path.join(folder, 'runtime/node'), constants.X_OK);
    await access(path.join(folder, 'runtime/ocr'), constants.X_OK);
    await access(
      path.join(
        folder,
        'runtime/chromium/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      ),
      constants.X_OK,
    );
  };
  try {
    if ((await readFile(path.join(target, 'complete'), 'utf8')) === key) {
      await check(target);
      return { ...paths, reused: true };
    }
  } catch {
    /* Incomplete or missing execution files are rebuilt; the Library is elsewhere. */
  }
  await mkdir(cache, { recursive: true, mode: 0o700 });
  for (const entry of await readdir(cache, { withFileTypes: true }))
    if (entry.isDirectory() && entry.name.startsWith('.preparing-'))
      await rm(path.join(cache, entry.name), { recursive: true, force: true });
  const stage = await mkdtemp(path.join(cache, '.preparing-'));
  try {
    await mkdir(path.join(stage, 'app'));
    await run(
      '/usr/bin/tar',
      ['-xf', path.resolve(root, '../engine.tar'), '-C', path.join(stage, 'app')],
      { timeout: 120000 },
    );
    if (portable)
      await cp(resources, path.join(stage, 'runtime'), { recursive: true, verbatimSymlinks: true });
    await check(stage);
    await writeFile(path.join(stage, 'complete'), key, { mode: 0o600 });
    await rm(target, { recursive: true, force: true });
    await rename(stage, target);
    for (const entry of await readdir(cache, { withFileTypes: true })) {
      if (entry.isDirectory() && /^[a-f0-9]{64}$/.test(entry.name) && entry.name !== key)
        await rm(path.join(cache, entry.name), { recursive: true, force: true });
    }
    return { ...paths, reused: false };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
module.exports = { readOnlyVolume, prepareRuntime };
