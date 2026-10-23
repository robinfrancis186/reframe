import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { featureHandler } from './runtime.mjs';

const root = fileURLToPath(new URL('..', import.meta.url)),
  handlers = new Map();
const port = Number(process.env.PORT || 5176);
createServer(async (req, res) => {
  try {
    const id = new URL(req.url, 'http://localhost').pathname.match(
      /^\/api\/reframe\/(rf_[a-f0-9]{12})(?:\/(?:auth|credentials))?$/,
    )?.[1];
    if (!id) {
      res.statusCode = 404;
      return res.end();
    }
    if (!handlers.has(id)) {
      const spec = JSON.parse(
        await readFile(path.join(root, 'reframe/features', id, 'feature.json'), 'utf8'),
      );
      handlers.set(id, featureHandler(spec, path.join(root, '.reframe/data', id + '.json')));
    }
    await handlers.get(id)(req, res);
  } catch {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Feature backend unavailable. Previous data was preserved.' }));
  }
}).listen(port, '127.0.0.1', () => console.log(`Native feature backend: http://localhost:${port}`));
