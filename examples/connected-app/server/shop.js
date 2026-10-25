import { Shop as ProductShop } from '../../../server/features/commerce.mjs';
import express from 'express';

const product = {
  id: 'fieldnotes-pocket', name: 'The Pocket Set', currency: 'USD',
  description: 'Three pocket notebooks for ideas worth keeping. Choose a cover, make room in your bag, and take your next thought offline.',
  details: ['Three 48-page notebooks', 'Dot-grid pages · 90 gsm paper', '3.5 × 5.5 inches · stitched binding'],
  notice: 'An original demo product. Reservations are stored locally; no payment or shipment occurs.',
};
const variants = [
  { id: 'moss', name: 'Moss', color: '#496348', priceCents: 1800, initialStock: 8 },
  { id: 'clay', name: 'Clay', color: '#a4654b', priceCents: 1800, initialStock: 6 },
  { id: 'ink', name: 'Ink', color: '#343e50', priceCents: 2000, initialStock: 4 },
];
export class Shop extends ProductShop { constructor(file){super(file,{product,variants});} }

export function shopRouter(file) {
  const router = express.Router(), shop = new Shop(file);
  router.use((req, res, next) => {
    const host = req.headers.host;
    if (!host || !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) || (req.headers.origin && req.headers.origin !== `http://${host}`)) return res.status(403).json({ error: 'This demo API is local and same-origin only.' });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  router.use(express.json({ limit: '8kb' }));
  router.get('/', async (_req, res) => res.json(await shop.get()));
  router.put('/cart', async (req, res) => res.json(await shop.setItem(req.body)));
  router.post('/reservations', async (req, res) => res.json(await shop.reserve(req.body)));
  router.use((error, _req, res, _next) => {
    const status = error.status || 503;
    res.status(status).json({ error: status >= 500 ? 'Could not save your changes. Your previous data is preserved; try again.' : error.message });
  });
  return router;
}
