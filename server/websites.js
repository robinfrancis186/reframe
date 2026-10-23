import { load } from 'cheerio';
import sanitize from 'sanitize-html';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { referenceUrl } from './browser-network.js';
import { cleanHtml } from './capture.js';
import { atomicJSON } from './features/services.mjs';
import { readRendered, replicaItem, replicaDocument, websiteServer } from './replica.js';
import { reviewFeature } from './engines.js';

const properties =
  'display position float clear box-sizing flex-direction flex-wrap flex-grow flex-shrink flex-basis align-items align-self justify-content gap row-gap column-gap grid-template-columns grid-template-rows grid-column grid-row order width height min-width max-width min-height max-height margin-top margin-right margin-bottom margin-left padding-top padding-right padding-bottom padding-left border-top border-right border-bottom border-left border-radius color background-color background-image background-size background-position background-repeat font-family font-size font-weight font-style line-height letter-spacing text-align text-transform text-decoration white-space overflow-wrap word-break vertical-align list-style-type opacity box-shadow object-fit aspect-ratio'.split(
    ' ',
  );
const q = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export function websiteURL(value, origin) {
  const u = referenceUrl(value);
  if (origin && u.origin !== origin)
    throw new Error('Website pages must use the starting website’s exact origin.');
  u.hash = '';
  return u.href;
}
export function safeSiteCSS(value) {
  // Computed values only: discard URLs and characters capable of leaving a declaration/style tag.
  return typeof value === 'string' &&
    value.length < 1500 &&
    !/[{}<>;\\]|url\s*\(|expression\s*\(|@|image-set\s*\(/i.test(value)
    ? value
    : '';
}
export function websiteFiles(pages) {
  if (!Array.isArray(pages) || !pages.length || pages.length > 8)
    throw new Error('Capture one to eight public pages.');
  const mapping = new Map(
    pages.map((p, i) => [websiteURL(p.url), i ? 'page-' + (i + 1) + '.html' : 'index.html']),
  );
  if (mapping.size !== pages.length) throw new Error('Each website page must have a unique URL.');
  const files = {},
    reports = [],
    assets = [];
  for (const [index, page] of pages.entries()) {
    if (
      typeof page.html !== 'string' ||
      page.html.length > 1500000 ||
      !Array.isArray(page.styles) ||
      page.styles.length > 2500 ||
      typeof page.title !== 'string'
    )
      throw new Error('Website page exceeds the supported size.');
    const $ = load(page.html);
    $(
      'script,style,link,meta,base,iframe,object,embed,template,noscript,canvas,video,audio,svg',
    ).remove();
    $('input').removeAttr('value');
    $('textarea').text('');
    const buttons = $('button,input[type=submit],input[type=button]');
    const forms = $('form').length;
    buttons
      .attr('disabled', 'disabled')
      .attr('title', 'Define this action in Reframe before release.');
    $('a[href]').each((_, el) => {
      try {
        const absolute = new URL($(el).attr('href'), page.url);
        const hash = absolute.hash;
        absolute.hash = '';
        const source = new URL(page.url);
        if (absolute.hostname === source.hostname && !absolute.port)
          absolute.protocol = source.protocol;
        const match = mapping.get(absolute.href);
        $(el).attr('href', match ? match + hash : absolute.href);
        if (!match) $(el).attr('target', '_blank').attr('rel', 'noopener noreferrer');
      } catch {
        $(el).removeAttr('href');
      }
    });
    $('img').each((_, el) => {
      try {
        const src = referenceUrl(new URL($(el).attr('src'), page.url).href);
        $(el).attr('src', src.href).attr('loading', 'lazy');
        if (!assets.includes(src.href)) assets.push(src.href);
      } catch {
        $(el).remove();
      }
    });
    const html = sanitize(
      $.html($('body'))
        .replace(/^<body/, '<main')
        .replace(/<\/body>$/, '</main>'),
      {
        allowedTags: sanitize.defaults.allowedTags.concat([
          'img',
          'input',
          'textarea',
          'select',
          'option',
          'button',
          'details',
          'summary',
          'main',
          'header',
          'footer',
          'section',
          'nav',
          'article',
        ]),
        allowedAttributes: {
          '*': ['id', 'class', 'data-rf-site', 'aria-label', 'role'],
          a: ['href', 'target', 'rel', 'title'],
          img: ['src', 'alt', 'width', 'height', 'loading'],
          input: ['type', 'name', 'placeholder', 'disabled', 'required'],
          textarea: ['placeholder', 'disabled'],
          select: ['disabled', 'aria-label'],
          option: ['value', 'selected'],
          button: ['disabled', 'type', 'title'],
          details: ['open'],
          label: ['for'],
        },
        allowedSchemes: ['https', 'http', 'mailto', 'tel'],
        allowProtocolRelative: false,
        transformTags: {
          body: 'main',
          form: 'div',
          button: (tag, attrs) => ({
            tagName: tag,
            attribs: { ...attrs, type: 'button', disabled: 'disabled' },
          }),
        },
        enforceHtmlBoundary: false,
      },
    );
    function css(view) {
      return page.styles
        .map((s) => {
          if (!Number.isInteger(s.id) || s.id < 0 || s.id > 5000) return '';
          const values = s[view];
          if (!values || typeof values !== 'object') return '';
          return (
            `[data-rf-site="${s.id}"]{` +
            properties
              .map((prop) => {
                const value = safeSiteCSS(values[prop]);
                return value ? prop + ':' + value + ';' : '';
              })
              .join('') +
            '}'
          );
        })
        .join('\n');
    }
    const styles =
      'html{scroll-behavior:smooth}body{margin:0}img{max-width:100%}*{min-width:0}' +
      css('desktop') +
      '\n@media(max-width:767px){' +
      css('mobile') +
      '}';
    const policy =
      "default-src 'none'; img-src https: http:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; object-src 'none'";
    files[index ? 'page-' + (index + 1) + '.html' : 'index.html'] =
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="' +
      q(policy) +
      '"><title>' +
      q(page.title) +
      '</title><style>' +
      styles +
      '</style></head><body>' +
      html +
      '</body></html>';
    reports.push({
      url: page.url,
      title: page.title,
      controls: buttons.length,
      forms,
      externalAssets: $('img[src]').length,
      sourceScripts: 'Removed; behavior requires independent implementation.',
    });
  }
  files['reframe-website.json'] = JSON.stringify(
    {
      version: 1,
      pages: reports,
      viewports: [1280, 390],
      limits: [
        'Rendered DOM plus computed styles at two widths; not a pixel-fidelity guarantee.',
        'External image URLs remain referenced. Fonts, CSS images, video, canvas, SVG and pseudo-elements are not copied.',
        'Navigation between captured pages and native details work. Scripted buttons and form submission require authored behavior.',
        'No original scripts, private backend, account sessions, payments or database are recovered.',
      ],
    },
    null,
    2,
  );
  files['README.md'] =
    '# Reconstructed public website\n\nRun `python3 -m http.server 5180` in this folder, then open http://localhost:5180/. All captured pages navigate locally.\n\nReview reframe-website.json for missing behavior and asset limits. Use Reframe’s component workflow to author APIs and actions for selected regions. The package contains no original JavaScript and no added dependencies. Test keyboard access, responsive widths and all links before release. Keep rights to referenced content and replace remote images with your own licensed assets before publishing.\n';
  if (Buffer.byteLength(JSON.stringify(files)) > 6000000)
    throw new Error('Website package exceeds 6 MB. Capture fewer or smaller pages.');
  return { files, reports, assets };
}

export async function readWebsitePage(page, { signal } = {}) {
  signal?.throwIfAborted();
  try {
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('link[rel~=stylesheet]')]
          .filter((link) => !link.disabled)
          .every((link) => link.sheet),
      null,
      { timeout: 20000 },
    );
  } catch {
    throw new Error(
      'A stylesheet did not load; appearance cannot be reconstructed reliably. Retry this page or use a focused screenshot.',
    );
  }
  signal?.throwIfAborted();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    let id = 0;
    for (const node of [document.body, ...document.body.querySelectorAll('*')])
      node.setAttribute('data-rf-site', String(id++));
  });
  const take = () =>
    page.evaluate((props) => {
      const nodes = [document.body, ...document.body.querySelectorAll('[data-rf-site]')];
      if (nodes.length > 2500)
        throw new Error('Page has more than 2,500 elements. Capture a focused page or section.');
      return nodes.map((el) => ({
        id: Number(el.getAttribute('data-rf-site')),
        values: Object.fromEntries(props.map((p) => [p, getComputedStyle(el).getPropertyValue(p)])),
      }));
    }, properties);
  const desktop = await take();
  signal?.throwIfAborted();
  const document = await page.evaluate(() => ({
    html: document.body.outerHTML,
    title: document.title,
    url: location.href,
    links: [...new Set([...document.querySelectorAll('a[href]')].map((el) => el.href))].slice(
      0,
      150,
    ),
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await take();
  signal?.throwIfAborted();
  const mobileMap = new Map(mobile.map((s) => [s.id, s.values]));
  return {
    ...document,
    styles: desktop.map((s) => ({
      id: s.id,
      desktop: s.values,
      mobile: mobileMap.get(s.id) || s.values,
    })),
  };
}
export class Websites {
  constructor(folder, browser) {
    this.folder = path.join(folder, 'websites');
    this.browser = browser;
    this.running = false;
  }
  async list() {
    await mkdir(this.folder, { recursive: true });
    try {
      return JSON.parse(await readFile(path.join(this.folder, 'index.json'), 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  }
  async get(id) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Choose a saved website.');
    return JSON.parse(await readFile(path.join(this.folder, id, 'package.json'), 'utf8'));
  }
  async capture(
    { url, urls = [], discover = false, maxPages = 4 },
    { signal, onEvent = () => {} } = {},
  ) {
    if (this.running) throw new Error('A website reconstruction is already running.');
    const start = websiteURL(url),
      origin = new URL(start).origin;
    if (
      !Number.isInteger(maxPages) ||
      maxPages < 1 ||
      maxPages > 8 ||
      !Array.isArray(urls) ||
      urls.length > 7 ||
      typeof discover !== 'boolean'
    )
      throw new Error('Choose one to eight same-origin pages.');
    const queue = [...new Set([start, ...urls.map((u) => websiteURL(u, origin))])];
    if (queue.length > maxPages)
      throw new Error('Increase the page limit to include every supplied URL.');
    this.running = true;
    let tab;
    const pages = [],
      failed = [],
      discovered = new Set(queue);
    let committed = false;
    const id = randomUUID(),
      folder = path.join(this.folder, id);
    try {
      tab = await this.browser.create();
      for (let i = 0; i < queue.length && i < maxPages; i++) {
        signal?.throwIfAborted();
        onEvent({ type: 'page', url: queue[i], index: i + 1, status: 'running' });
        try {
          await this.browser.act({
            id: tab.id,
            action: 'navigate',
            url: queue[i],
            snapshot: false,
          });
          const entry = this.browser.tabs.get(tab.id);
          if (entry.dialog)
            throw new Error(
              'This website requires a dialog response. Open it in the reference browser and capture the intended sections there.',
            );
          await this.browser.act({ id: tab.id, action: 'prepare', snapshot: false });
          if (entry.dialog)
            throw new Error(
              'A website dialog interrupted the page scan. Use the reference browser to review it.',
            );
          const page = await readRendered(entry.page);
          websiteURL(page.url, origin);
          const $ = load(page.html);
          $('img').each((_, el) => {
            if ($(el).attr('data-rf-image-loaded') !== 'true') $(el).remove();
          });
          page.html = $('body').html();
          if (!pages.some((p) => p.url === page.url)) pages.push(page);
          for (const link of page.links) {
            try {
              const target = websiteURL(link, origin);
              if (/\.(pdf|png|jpe?g|webp|svg|zip|mp4)$/i.test(new URL(target).pathname)) continue;
              discovered.add(target);
              if (
                discover &&
                queue.length < maxPages &&
                !queue.includes(target) &&
                !pages.some((p) => p.url === target)
              )
                queue.push(target);
            } catch {}
          }
          onEvent({ type: 'page', url: queue[i], index: i + 1, status: 'complete' });
        } catch (error) {
          signal?.throwIfAborted();
          failed.push({ url: queue[i], reason: error.message });
          onEvent({
            type: 'page',
            url: queue[i],
            index: i + 1,
            status: 'error',
            error: error.message,
          });
        }
      }
      signal?.throwIfAborted();
      if (!pages.length)
        throw new Error(failed[0]?.reason || 'No public page could be reconstructed.');
      onEvent({
        type: 'page',
        url: start,
        index: pages.length,
        status: 'building local behavior and reviewing source',
      });
      const item = await replicaItem(pages, pages[0].title, { resource: this.browser.resource });
      item.feature.review = await reviewFeature(item.feature.files, item.html);
      const site = item.feature.spec.website,
        files = Object.fromEntries(
          site.pages.map((p, i) => [
            i ? 'page-' + (i + 1) + '.html' : 'index.html',
            replicaDocument(site, i),
          ]),
        );
      Object.assign(files, {
        'feature.json': item.feature.files['feature.json'],
        'website.mjs': item.feature.files['website.mjs'],
        'services.mjs': item.feature.files['services.mjs'],
        'README.md':
          item.feature.files['README.md'] +
          '\nStandalone: run node server.mjs, then open http://localhost:5180/.\n',
        'server.mjs': websiteServer,
      });
      const reports = site.pages.map((p) => ({
        url: p.url,
        title: p.title,
        controls: (p.html.match(/<button\b/g) || []).length,
        forms: p.forms.length,
        externalAssets: (p.html.match(/<img\b/g) || []).length,
      }));
      const result = {
        id,
        name: item.name,
        source: start,
        createdAt: new Date().toISOString(),
        files,
        reports,
        assets: [],
        item,
        failed,
        uncaptured: [...discovered].filter((u) => !pages.some((p) => p.url === u)),
        pages: site.pages.map((p, i) => ({
          url: p.url,
          title: p.title,
          file: i ? 'page-' + (i + 1) + '.html' : 'index.html',
          html: p.html,
        })),
      };
      await mkdir(folder, { recursive: true });
      await atomicJSON(path.join(folder, 'package.json'), result);
      signal?.throwIfAborted();
      const list = await this.list();
      list.unshift({
        id,
        name: result.name,
        source: start,
        createdAt: result.createdAt,
        count: pages.length,
      });
      await atomicJSON(path.join(this.folder, 'index.json'), list.slice(0, 30));
      committed = true;
      return result;
    } finally {
      if (tab) await this.browser.closeTab(tab.id);
      if (!committed) await rm(folder, { recursive: true, force: true });
      this.running = false;
    }
  }
}
