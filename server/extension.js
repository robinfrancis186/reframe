import { readFile, writeFile, rename, unlink, mkdir } from 'node:fs/promises';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { replicaItem, buildReplicaFeature } from './replica.js';
import { finishCapture } from './fidelity.js';
import { referenceResource, referenceUrl } from './browser-network.js';

// The Reframe browser extension picks components on the user's own tabs (logged-in pages, sites that block automated
// browsers) and sends them here. It is paired with a token shown once in the app; only its hash is stored. Capture
// routes accept the extension's origin and a valid token, nothing else, and each capture goes through the same
// sanitizing, repair and scoring as a reference-browser pick before it is added to the library on disk.
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;
export const isExtensionRoute = (req) =>
  /^\/api\/extension\/(?:ping|capture)$/.test(req.path) &&
  EXTENSION_ORIGIN.test(req.headers.origin || '');
const REFERENCE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const digest = (value) => createHash('sha256').update(value).digest();

export class ExtensionPairing {
  constructor(store) {
    this.file = path.join(store, 'extension.json');
    this.store = store;
  }
  async read() {
    try {
      return JSON.parse(await readFile(this.file, 'utf8'));
    } catch {
      return null;
    }
  }
  async write(value) {
    await mkdir(this.store, { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.reframe-${randomUUID()}`;
    try {
      await writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
      await rename(temporary, this.file);
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }
  async status() {
    const state = await this.read();
    return state
      ? {
          paired: true,
          createdAt: state.createdAt,
          lastUsed: state.lastUsed || null,
          captures: state.captures || 0,
        }
      : { paired: false };
  }
  /** Creates a new token (replacing any earlier one) and returns it once. */
  async pair() {
    const token = 'rfx_' + randomBytes(24).toString('base64url');
    await this.write({
      hash: digest(token).toString('hex'),
      createdAt: new Date().toISOString(),
      captures: 0,
    });
    return { token, ...(await this.status()) };
  }
  async revoke() {
    await unlink(this.file).catch((e) => {
      if (e.code !== 'ENOENT') throw e;
    });
    return this.status();
  }
  async verify(header) {
    const state = await this.read(),
      token = /^Bearer (rfx_[\w-]{20,80})$/.exec(header || '')?.[1];
    if (!state || !token || !timingSafeEqual(digest(token), Buffer.from(state.hash, 'hex')))
      throw fail(
        'This extension is not paired with Reframe. Pair it again from Library → Browser extension.',
        401,
      );
    return state;
  }
  async used(state) {
    await this.write({
      ...state,
      lastUsed: new Date().toISOString(),
      captures: (state.captures || 0) + 1,
    });
  }
}

function validCapture(body) {
  const page = body?.page;
  if (!page || typeof page !== 'object' || page.component !== true)
    throw fail('Pick one element on the page.');
  for (const key of ['url', 'title', 'html', 'css', 'rootStyle', 'htmlClass'])
    if (typeof page[key] !== 'string')
      throw fail('The capture is incomplete. Pick the element again.');
  if (page.html.length > 1_500_000 || page.css.length > 3_000_000)
    throw fail('This element is too large. Pick a smaller region.');
  referenceUrl(page.url);
  if (
    body.referenceImage !== undefined &&
    (typeof body.referenceImage !== 'string' ||
      body.referenceImage.length > 2_000_000 ||
      !REFERENCE.test(body.referenceImage))
  )
    throw fail('Invalid reference image.');
  if (typeof body.name !== 'string' || !body.name.trim()) throw fail('Name the component.');
  return page;
}

export function mountExtension(
  app,
  express,
  { pairing, library, browser, isItem, theme, folder, resource = referenceResource },
) {
  const handle = (action) => async (req, res, next) => {
    try {
      res.json(await action(req));
    } catch (error) {
      if (error.status === 401) return res.status(401).json({ error: error.message });
      next(error);
    }
  };
  // Managed from the app (same-origin only, enforced by the server's origin check).
  app.get(
    '/api/extension',
    handle(async () => ({ ...(await pairing.status()), folder })),
  );
  app.post(
    '/api/extension/pair',
    handle(async () => ({ ...(await pairing.pair()), folder })),
  );
  app.delete(
    '/api/extension',
    handle(async () => ({ ...(await pairing.revoke()), folder })),
  );
  // Called by the extension.
  app.get(
    '/api/extension/ping',
    handle(async (req) => {
      await pairing.verify(req.headers.authorization);
      return { ok: true, app: 'Reframe' };
    }),
  );
  app.post(
    '/api/extension/capture',
    express.json({ limit: '12mb' }),
    handle(async (req) => {
      const state = await pairing.verify(req.headers.authorization),
        page = validCapture(req.body);
      let item = {
        ...(await replicaItem([page], req.body.name.trim().slice(0, 200), { resource })),
        ...(req.body.referenceImage ? { referenceImage: req.body.referenceImage } : {}),
        capturedAt: new Date().toISOString(),
        evidence:
          'Picked in your own browser with the Reframe extension. Rendered HTML, source styles and inline SVG; independently authored local interactions. Source images remain online; private source logic is not recovered.',
      };
      item = await finishCapture(item, {
        browser,
        resource,
        rebuild: (item, site) =>
          buildReplicaFeature(item.html, item.name, site, item.feature.spec.id),
      });
      if (!isItem({ ...item, theme })) throw fail('The capture could not be saved as a component.');
      const saved = await library.add(item, { theme });
      await pairing.used(state);
      return {
        id: saved.id,
        name: item.name,
        replaced: saved.replaced,
        fidelity: item.fidelity || null,
        revision: saved.revision,
      };
    }),
  );
}
