const form = document.getElementById('form'),
  server = document.getElementById('server'),
  token = document.getElementById('token'),
  status = document.getElementById('status');
const show = (text, ok) => {
  status.textContent = text;
  status.className = ok ? 'ok' : 'error';
};

chrome.storage.local.get(['server', 'token']).then((saved) => {
  server.value = saved.server || 'http://localhost:5173';
  token.value = saved.token || '';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const address = server.value.trim().replace(/\/+$/, '');
  if (!/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(address))
    return show('Use the address of Reframe on this computer, e.g. http://localhost:5173.', false);
  if (!/^rfx_[\w-]{20,80}$/.test(token.value.trim()))
    return show('Paste the whole token shown in Reframe (it starts with rfx_).', false);
  await chrome.storage.local.set({ server: address, token: token.value.trim() });
  const reply = await chrome.runtime.sendMessage({ type: 'ping' });
  show(reply.ok ? 'Connected to Reframe. You can start picking.' : reply.error, reply.ok);
});

document.getElementById('forget').addEventListener('click', async () => {
  await chrome.storage.local.remove('token');
  token.value = '';
  show('Token removed from this browser.', true);
});
