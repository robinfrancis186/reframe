import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { publicAddress } from './capture.js';

export function referenceUrl(input) {
  if (typeof input !== 'string' || input.length > 4096) throw new Error('Enter a public website URL.');
  const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw new Error('Use a public HTTP(S) URL on its standard port, without credentials.');
  return url;
}

// Every resource uses the same validated, pinned DNS address; Chromium has no direct network path.
export async function referenceResource(input, requestHeaders = {}, {method='GET',body} = {}) {
  const url = referenceUrl(input);
  if(!['GET','HEAD','OPTIONS','POST','PUT','PATCH','DELETE'].includes(method))throw new Error('Unsupported website request method.');
  if(body&&body.length>1_000_000)throw new Error('Website submission exceeds 1 MB.');
  const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ''), { all: true });
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new Error('Private and local network destinations are blocked.');
  const address = addresses[0];
  const headers = {};
  for (const [key,value] of Object.entries(requestHeaders)) if(!['host','connection','content-length','transfer-encoding','proxy-authorization','proxy-connection','upgrade','accept-encoding'].includes(key.toLowerCase())) headers[key]=value;
  headers['accept-encoding']='identity';
  if(body)headers['content-length']=body.length;
  return new Promise((resolve, reject) => {
    const req = (url.protocol === 'https:' ? https : http).request(url, {
      method,headers, signal: AbortSignal.timeout(20000),
      lookup: (_host, options, cb) => options.all ? cb(null, [address]) : cb(null, address.address, address.family),
    }, response => {
      const chunks = []; let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 8_000_000) { response.destroy(); reject(new Error('Resource exceeds 8 MB.')); }
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        const headers = {};
        for (const [key, value] of Object.entries(response.headers)) {
          if (value && !['connection', 'transfer-encoding', 'content-length'].includes(key)) headers[key] = Array.isArray(value) ? value.join(key==='set-cookie'?'\n':', ') : value;
        }
        resolve({ status: response.statusCode || 502, headers, body: Buffer.concat(chunks) });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}
