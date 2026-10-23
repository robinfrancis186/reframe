// Reframe Picker background worker: starts the picker on the current tab when the toolbar button (or Alt+Shift+R) is
// used, takes the visible-tab screenshot the picker crops to the element, and sends captures to the local Reframe
// server with the pairing token. Nothing runs on a page until the user starts the picker there.
const DEFAULT_SERVER = 'http://localhost:5173';

async function settings() {
  const { server = DEFAULT_SERVER, token = '' } = await chrome.storage.local.get([
    'server',
    'token',
  ]);
  return { server: server.replace(/\/+$/, ''), token };
}

async function reframe(path, init = {}) {
  const { server, token } = await settings();
  if (!token)
    throw new Error(
      'Pair the extension first: open its options and paste the token from Reframe → Library → Browser extension.',
    );
  if (!/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(server))
    throw new Error('The Reframe address must be on this computer (localhost).');
  let response;
  try {
    response = await fetch(server + path, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error(
      `Reframe is not running at ${server}. Start it with npm run dev, then try again.`,
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Reframe answered ${response.status}.`);
  return data;
}

// Starts the picker on one tab (the toolbar button's handler; also used by the extension's end-to-end test).
self.startPicker = async (tab) => {
  if (!tab.id || !/^https?:/.test(tab.url || '')) return false;
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['generated/snapshot.js', 'picker.js'],
  });
  return true;
};
chrome.action.onClicked.addListener((tab) =>
  self
    .startPicker(tab)
    .catch((error) => console.warn('Reframe Picker cannot run on this page:', error.message)),
);

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const run = async () => {
    if (message.type === 'screenshot')
      return { image: await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }) };
    if (message.type === 'save')
      return reframe('/api/extension/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message.capture),
      });
    if (message.type === 'ping') return reframe('/api/extension/ping');
    if (message.type === 'pair') {
      // Sent by pair-bridge.js after the user confirmed on a Reframe page; only a page on this computer can pair.
      if (
        !sender.tab ||
        !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(message.server) ||
        new URL(sender.tab.url).origin !== message.server
      )
        throw new Error('Pairing must come from Reframe on this computer.');
      if (!/^rfx_[\w-]{20,80}$/.test(message.token || ''))
        throw new Error('The pairing token is not valid.');
      await chrome.storage.local.set({ server: message.server, token: message.token });
      return reframe('/api/extension/ping');
    }
    throw new Error('Unknown request.');
  };
  run().then(
    (result) => reply({ ok: true, result }),
    (error) => reply({ ok: false, error: error.message }),
  );
  return true;
});
