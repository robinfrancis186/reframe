import { randomUUID } from 'node:crypto';
import express from 'express';
export function mountDownloads(app) {
  const files = new Map();
  let retained = 0;
  app.post('/api/downloads', express.json({ limit: '24mb' }), (req, res) => {
    const { name, type, base64 } = req.body || {};
    if (
      typeof name !== 'string' ||
      !name.trim() ||
      name.length > 180 ||
      /[\x00-\x1f/\\]/.test(name) ||
      typeof type !== 'string' ||
      !/^(?:application|text|image|audio|video)\/[a-z0-9.+-]{1,110}$/i.test(type) ||
      typeof base64 !== 'string' ||
      base64.length > 21333336 ||
      base64.length % 4 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
    )
      return res
        .status(400)
        .json({ error: 'Choose a valid export filename, type and content under 16 MB.' });
    if (files.size >= 8)
      return res
        .status(429)
        .json({ error: 'Eight downloads are being prepared. Retry in one minute.' });
    const id = randomUUID(),
      body = Buffer.from(base64, 'base64');
    if (body.toString('base64') !== base64)
      return res.status(400).json({ error: 'Invalid export encoding.' });
    if (body.length > 16000000 || retained + body.length > 48000000)
      return res.status(429).json({ error: 'Download size budget reached. Retry in one minute.' });
    retained += body.length;
    files.set(id, { name, type, body });
    setTimeout(() => {
      if (files.delete(id)) retained -= body.length;
    }, 60000).unref();
    res.json({ url: '/api/downloads/' + id });
  });
  app.get('/api/downloads/:id', (req, res) => {
    const file = files.get(req.params.id);
    if (!file)
      return res
        .status(410)
        .json({ error: 'Download expired. Export again; saved components are unchanged.' });
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.attachment(file.name).type(file.type).send(file.body);
  });
}
