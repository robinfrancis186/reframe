import express from 'express';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { shopRouter } from './shop.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const app = express();
app.disable('x-powered-by');
app.use('/api/shop', shopRouter(path.join(root, '.reframe', 'shop.json')));
if (process.env.NODE_ENV === 'production') app.use(express.static(path.join(root, 'dist')));
else {
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const server = app.listen(5174, '127.0.0.1', () => console.log('Fieldnotes product demo: http://localhost:5174'));
server.on('error', error => { console.error(error.message); process.exit(1); });
