import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import ipaddr from 'ipaddr.js';
import { load } from 'cheerio';
import sanitize from 'sanitize-html';

export function publicAddress(address) {
  try {
    const parsed = ipaddr.process(address);
    // DNS64 exposes IPv4 through the well-known /96 prefix; validate the embedded destination.
    if (parsed.kind() === 'ipv6' && parsed.match(ipaddr.parse('64:ff9b::'), 96))
      return publicAddress(parsed.toByteArray().slice(-4).join('.'));
    return parsed.range() === 'unicast';
  } catch {
    return false;
  }
}
export async function fetchPage(input, redirects = 0) {
  const url = new URL(input);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80', '443'].includes(url.port))
  )
    throw new Error('Use a public HTTP or HTTPS website on its standard port.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error('Local and private network addresses cannot be inspected. Paste HTML instead.');
  const chosen = addresses[0];
  const result = await new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).get(
      url,
      {
        headers: {
          'User-Agent': 'Reframe/0.1 (component inspection)',
          Accept: 'text/html',
          'Accept-Encoding': 'identity',
        },
        // Pin the validated address so a second DNS resolution cannot reach a private host.
        lookup: (_host, options, cb) =>
          options.all ? cb(null, [chosen]) : cb(null, chosen.address, chosen.family),
        signal: AbortSignal.timeout(15000),
      },
      (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
          response.resume();
          resolve({ redirect: response.headers.location });
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          response.resume();
          reject(
            new Error(`Website returned HTTP ${response.statusCode}. Try importing its HTML.`),
          );
          return;
        }
        if (!/text\/html|application\/xhtml\+xml/i.test(response.headers['content-type'] || '')) {
          response.resume();
          reject(new Error('This URL did not return an HTML page.'));
          return;
        }
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > 2_000_000) {
            response.destroy();
            reject(new Error('Page exceeds the 2 MB capture limit. Import a smaller section.'));
          } else chunks.push(chunk);
        });
        response.on('end', () =>
          resolve({
            html: Buffer.concat(chunks).toString('utf8'),
            url: url.href,
          }),
        );
        response.on('error', reject);
      },
    );
    request.on('error', reject);
  });
  if ('redirect' in result) {
    if (redirects >= 4 || !result.redirect) throw new Error('Website redirected too many times.');
    return fetchPage(new URL(result.redirect, url).href, redirects + 1);
  }
  return result;
}
export function cleanHtml(html) {
  return sanitize(html, {
    allowedTags: [
      'div',
      'section',
      'article',
      'header',
      'footer',
      'main',
      'nav',
      'aside',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'p',
      'span',
      'strong',
      'em',
      'b',
      'i',
      'small',
      'ul',
      'ol',
      'li',
      'a',
      'button',
      'label',
      'input',
      'textarea',
      'select',
      'option',
      'details',
      'summary',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'br',
      'hr',
      'blockquote',
      'pre',
      'code',
      'figure',
      'figcaption',
      'img',
      'form',
    ],
    allowedAttributes: {
      '*': ['id', 'class', 'aria-label', 'role'],
      label: ['for'],
      a: ['href', 'title'],
      img: ['src', 'alt', 'width', 'height'],
      input: ['type', 'placeholder', 'name', 'aria-label', 'required'],
      textarea: ['placeholder', 'aria-label', 'required'],
      select: ['aria-label', 'required'],
      option: ['value'],
      button: ['type'],
      details: ['open'],
    },
    allowedSchemes: ['https', 'http', 'mailto', 'tel'],
    allowProtocolRelative: false,
    transformTags: {
      form: 'div',
      button: (tag, attrs) => ({
        tagName: tag,
        attribs: { ...attrs, type: 'button' },
      }),
      input: (tag, attrs) => {
        const type = (attrs.type || 'text').toLowerCase();
        if (['submit', 'button', 'reset'].includes(type)) {
          const text = attrs.value || (type === 'reset' ? 'Reset' : 'Submit');
          return {
            tagName: 'button',
            attribs: { type: 'button', 'aria-label': attrs['aria-label'] || text },
            text,
          };
        }
        return {
          tagName: tag,
          attribs: {
            ...attrs,
            type: ['text', 'email', 'number', 'checkbox', 'radio', 'search', 'password'].includes(
              type,
            )
              ? type
              : 'text',
          },
        };
      },
    },
    exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
  }).trim();
}
export function extract(html, source = 'Imported HTML') {
  if (typeof html !== 'string' || html.length > 2_000_000 || !html.trim())
    throw new Error('Provide HTML under 2 MB.');
  const $ = load(html);
  $('script,style,noscript,iframe,svg,template,link,meta').remove();
  if (source.startsWith('http'))
    $('a[href],img[src]').each((_, el) => {
      for (const attr of ['href', 'src']) {
        const value = $(el).attr(attr);
        if (value) {
          try {
            $(el).attr(attr, new URL(value, source).href);
          } catch {
            $(el).removeAttr(attr);
          }
        }
      }
    });
  let nodes = $('nav,section,article,header,footer')
    .toArray()
    .filter((el) => $(el).parents('nav,section,article,header,footer').length === 0);
  if (!nodes.length)
    nodes = $('main').length ? $('main').toArray() : $('body').children().toArray();
  nodes = nodes.filter((el) => $(el).text().trim().length > 0).slice(0, 24);
  if (!nodes.length)
    throw new Error(
      'No readable elements found. JavaScript-only pages need rendered HTML or a screenshot.',
    );
  const items = nodes
    .map((el, index) => {
      const name =
        $(el).find('h1,h2,h3').first().text().trim().slice(0, 65) ||
        $(el).attr('aria-label') ||
        `${el.tagName === 'nav' ? 'Navigation' : el.tagName === 'footer' ? 'Footer' : 'Section'} ${index + 1}`;
      return {
        id: crypto.randomUUID(),
        name,
        html: cleanHtml($.html(el)),
        source,
        kind: el.tagName,
        capturedAt: new Date().toISOString(),
        evidence:
          'Observed HTML structure; scripts, original CSS and backend behavior are not carried over.',
      };
    })
    .filter((item) => item.html);
  return {
    title: $('title').text().trim() || 'Imported interface',
    items,
    source,
  };
}
export function pickHtml(html, selector) {
  if (typeof html !== 'string' || !html.trim() || html.length > 500000)
    throw new Error('Pick within a captured component under 500 KB.');
  if (typeof selector !== 'string' || !selector.trim() || selector.length > 300)
    throw new Error('Use a CSS selector under 300 characters.');
  const $ = load(cleanHtml(html), null, false);
  let selected;
  try {
    selected = $.root().find(selector);
  } catch {
    throw new Error('Invalid CSS selector. Choose one element from the capture.');
  }
  if (selected.length !== 1)
    throw new Error('Pick exactly one element; narrow the selector using the captured HTML.');
  const content = cleanHtml($.html(selected));
  if (!selected.text().trim() || content.length > 200000)
    throw new Error('Pick a smaller, readable component under 200 KB.');
  return {
    html: content,
    name: (
      selected.find('h1,h2,h3').first().text() ||
      selected.attr('aria-label') ||
      selected.text()
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 65),
    kind: selected[0].tagName,
  };
}

export function inspectQuality(html) {
  const $ = load(html);
  const issues = [];
  if ($('img:not([alt])').length) issues.push('Add alternative text to images.');
  if (
    $('input,textarea,select')
      .toArray()
      .some(
        (el) =>
          !$(el).attr('aria-label') &&
          !$(el).attr('aria-labelledby') &&
          !$(el).parents('label').length &&
          !$('label')
            .toArray()
            .some((label) => el.attribs.id && $(label).attr('for') === el.attribs.id),
      )
  )
    issues.push('Check that every input has a visible, associated label.');
  if (
    $('a')
      .toArray()
      .some((a) => !$(a).attr('href') || $(a).attr('href') === '#')
  )
    issues.push('Wire placeholder links to their real destinations.');
  if (
    $('button')
      .toArray()
      .some((el) => !$(el).text().trim() && !$(el).attr('aria-label'))
  )
    issues.push('Give every button an accessible name.');
  if ($('button').length) issues.push('Connect buttons to your application actions.');
  return {
    elements: $('body *').length,
    bytes: Buffer.byteLength(html),
    issues,
    dependencies: 0,
  };
}
