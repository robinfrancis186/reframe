import { cp, rm, readdir, readlink, realpath } from 'node:fs/promises';
import path from 'node:path';

/** Node's default recursive copy absolutizes framework links; preserve them so the app can move. */
export async function copyRuntime(source, target) {
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true, verbatimSymlinks: true });
  const root = await realpath(target);
  for (const entry of await readdir(target, { recursive: true, withFileTypes: true }))
    if (entry.isSymbolicLink()) {
      const file = path.join(entry.parentPath, entry.name),
        link = await readlink(file),
        resolved = await realpath(file);
      if (path.isAbsolute(link) || !resolved.startsWith(root + path.sep))
        throw Error('Bundled runtime contains an external framework link. Packaging stopped.');
    }
}
