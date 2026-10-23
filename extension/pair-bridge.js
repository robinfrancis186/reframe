// One-click pairing. Runs only on localhost pages (see manifest). It tells a Reframe page that the extension is installed,
// and accepts a pairing token from that page after the user confirms, so the token never needs copying. The confirmation
// names the address, so another local web app cannot silently redirect captures to itself.
(() => {
  const announce = () => window.postMessage({ source: 'reframe-picker', type: 'ready', version: chrome.runtime.getManifest().version }, location.origin);
  window.addEventListener('message', async event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'reframe') return;
    if (event.data.type === 'hello') return announce();
    if (event.data.type !== 'pair') return;
    const reply = data => window.postMessage({ source: 'reframe-picker', type: 'paired', ...data }, location.origin);
    if (!/^rfx_[\w-]{20,80}$/.test(event.data.token || '')) return reply({ ok: false, error: 'The pairing token is not valid.' });
    if (!window.confirm(`Connect Reframe Picker to Reframe at ${location.origin}?\n\nComponents you pick will be saved there.`)) return reply({ ok: false, error: 'Connection cancelled in the browser.' });
    try {
      const result = await chrome.runtime.sendMessage({ type: 'pair', server: location.origin, token: event.data.token });
      reply(result.ok ? { ok: true } : { ok: false, error: result.error });
    } catch (error) { reply({ ok: false, error: error.message }); }
  });
  announce();
})();
