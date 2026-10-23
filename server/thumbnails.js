import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Decode only captured image bytes in a network-sealed page; share one page instead of one renderer per card. */
export class Thumbnails {
  constructor(store, browser) {
    this.dir = path.join(store, 'library', 'thumbnails');
    this.browser = browser;
    this.queue = Promise.resolve();
    this.context = null;
    this.page = null;
  }
  async get(data, hash) {
    const file = path.join(this.dir, hash + '.jpg');
    try {
      return 'data:image/jpeg;base64,' + (await readFile(file)).toString('base64');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    const run = this.queue.then(async () => {
      try {
        return 'data:image/jpeg;base64,' + (await readFile(file)).toString('base64');
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      if (!this.page || this.page.isClosed()) {
        await this.browser.start();
        this.context = await this.browser.browser.newContext({ serviceWorkers: 'block' });
        await this.context.route('**/*', (route) => route.abort());
        this.page = await this.context.newPage();
      }
      const image = await this.page.evaluate(async (data) => {
        const image = new Image();
        image.src = data;
        await image.decode();
        const scale = Math.min(1, 360 / image.naturalWidth, 240 / image.naturalHeight);
        const canvas = new OffscreenCanvas(
          Math.max(1, Math.round(image.naturalWidth * scale)),
          Math.max(1, Math.round(image.naturalHeight * scale)),
        );
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const bytes = new Uint8Array(
          await (await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.72 })).arrayBuffer(),
        );
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return 'data:image/jpeg;base64,' + btoa(binary);
      }, data);
      await mkdir(this.dir, { recursive: true, mode: 0o700 });
      try {
        await writeFile(file, Buffer.from(image.split(',')[1], 'base64'), {
          flag: 'wx',
          mode: 0o600,
        });
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
      }
      return image;
    });
    this.queue = run.catch(() => {});
    return run;
  }
  async close() {
    await this.queue;
    await this.context?.close();
    this.context = null;
    this.page = null;
  }
}
