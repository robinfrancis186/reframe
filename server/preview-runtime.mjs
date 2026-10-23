// Only canonical Reframe source is compiled by the parent; imported bundle files are never executed.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { featureHandler as records } from './features/runtime.mjs';
import { featureHandler as commerce } from './features/commerce.mjs';
import { featureHandler as website } from './features/website.mjs';
const [root, parentOrigin] = process.argv.slice(2);
const spec = JSON.parse(await readFile(path.join(root, 'feature.json'), 'utf8'));
const handler = spec.website
  ? website(spec, path.join(root, 'data', 'website.json'), {
      frameAncestors: "'self' " + parentOrigin,
    })
  : spec.commerce
    ? commerce(spec, path.join(root, 'data', 'shop.json'))
    : records(spec, path.join(root, 'data', 'records.json'), {
        external: async () => {
          throw Object.assign(
            new Error(
              'External services are disabled in disposable previews. Test the reviewed API in your destination app.',
            ),
            { status: 403 },
          );
        },
      });
let port;
const server = createServer(async (req, res) => {
  try {
    const host = req.headers.host,
      url = new URL(req.url, `http://${host}`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data:; connect-src 'self'; font-src 'self'; frame-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors ${parentOrigin}; object-src 'none'`,
    );
    if (
      ![`127.0.0.1:${port}`, `localhost:${port}`].includes(host) ||
      (req.headers['sec-fetch-site'] === 'cross-site' && url.pathname.startsWith('/api/')) ||
      (req.headers.origin && req.headers.origin !== `http://${host}`)
    ) {
      res.writeHead(403);
      return res.end('Preview accepts only its own origin.');
    }
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname.endsWith('/credentials') && req.method !== 'GET') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            error:
              'Do not add real credentials to a disposable preview. External APIs are disabled.',
          }),
        );
      }
      return await handler(req, res);
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405);
      return res.end();
    }
    const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!/^(index\.html|assets\/[a-zA-Z0-9_.-]+)$/.test(name)) {
      res.writeHead(404);
      return res.end();
    }
    const content = await readFile(path.join(root, 'dist', name));
    res.setHeader(
      'Content-Type',
      name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html',
    );
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch {
    res.writeHead(404);
    res.end('Preview resource unavailable.');
  }
});
server.listen(0, '127.0.0.1', () => {
  port = server.address().port;
  process.send?.({ port });
});
process.on('disconnect', () => process.exit(0));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
