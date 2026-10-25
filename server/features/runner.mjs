import { createServer as httpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { featureHandler } from './runtime.mjs';

const root = process.env.REFRAME_DEMO_ROOT || fileURLToPath(new URL('..', import.meta.url));
const handlers = new Map();
const production = process.argv.includes('--production');
const port = Number(process.env.PORT || 5175);
let vite;
const server = httpServer(async (req, res) => {
  try {
    if (process.env.REFRAME_EMBED === '1') {
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) {
        res.writeHead(403);
        return res.end('Local component host required');
      }
      res.setHeader(
        'Content-Security-Policy',
        "frame-ancestors 'self' http://localhost:* http://127.0.0.1:*",
      );
      res.setHeader('Referrer-Policy', 'no-referrer');
    }
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const id = pathname.match(
      /^\/api\/reframe\/(rf_[a-f0-9]{12})(?:\/(?:auth|credentials|site\/.*))?$/,
    )?.[1];
    if (id) {
      if (!handlers.has(id)) {
        const spec = JSON.parse(
          await readFile(path.join(root, 'reframe', 'features', id, 'feature.json'), 'utf8'),
        );
        const handler = spec.website
          ? (
              await import(
                pathToFileURL(path.join(root, 'reframe', 'features', id, 'website.mjs')).href
              )
            ).featureHandler
          : spec.commerce
            ? (
                await import(
                  pathToFileURL(path.join(root, 'reframe', 'features', id, 'commerce.mjs')).href
                )
              ).featureHandler
            : featureHandler;
        handlers.set(
          id,
          handler(
            spec,
            path.join(
              root,
              '.reframe',
              'data',
              `${id}${spec.website ? '.website' : spec.commerce ? '.commerce' : ''}.json`,
            ),
            spec.website
              ? {
                  frameAncestors:
                    "'self'" +
                    (process.env.REFRAME_EMBED === '1'
                      ? ' http://localhost:* http://127.0.0.1:*'
                      : '') +
                    (process.env.REFRAME_DEMO_PARENT_ORIGIN
                      ? ' ' + process.env.REFRAME_DEMO_PARENT_ORIGIN
                      : ''),
                }
              : undefined,
          ),
        );
      }
      return handlers.get(id)(req, res);
    }
    if (pathname.startsWith('/api/reframe/')) {
      res.statusCode = 404;
      return res.end('Unknown feature');
    }
    if (vite) return vite.middlewares(req, res);
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.statusCode = 405;
      return res.end();
    }
    let relative = decodeURIComponent(pathname);
    if (relative.split('/').some((p) => p.startsWith('.'))) {
      res.statusCode = 403;
      return res.end();
    }
    let file = path.resolve(root, 'dist', '.' + relative);
    if (!file.startsWith(path.join(root, 'dist') + path.sep))
      file = path.join(root, 'dist', 'index.html');
    let content;
    try {
      content = await readFile(file);
    } catch {
      file = path.join(root, 'dist', 'index.html');
      content = await readFile(file);
    }
    res.setHeader(
      'Content-Type',
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
      }[path.extname(file)] || 'application/octet-stream',
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (e) {
    res.statusCode = e.code === 'ENOENT' ? 404 : 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Feature or application files are unavailable.' }));
  }
});
vite = production
  ? null
  : await (
      await import('vite')
    ).createServer({ root, server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
server.listen(port, '127.0.0.1', () => {
  const address = server.address();
  const activePort = typeof address === 'object' && address ? address.port : port;
  console.log(`Integrated app: http://127.0.0.1:${activePort}`);
  process.send?.({ port: activePort });
});
process.once('disconnect', () => {
  server.close();
  process.exit(0);
});
server.on('error', (e) => {
  console.error(e.message);
  process.exit(1);
});
