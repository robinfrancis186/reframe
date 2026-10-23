const query = new URLSearchParams(location.search);
if (query.has('preparing')) {
  document.getElementById('status').textContent =
    'Preparing the bundled capture engine for this Mac.';
  document.getElementById('detail').textContent =
    'This runs once per app version. Your Library stays separate. No downloads or administrator access are needed.';
}
if (query.get('state') === 'failed') {
  document.getElementById('heading').textContent = 'Your work is still here.';
  document.getElementById('status').textContent = 'Reframe could not connect to its local engine.';
  document.getElementById('detail').textContent =
    query.get('message') || 'Try again to reopen your saved Library.';
  document.getElementById('actions').hidden = false;
}
document.getElementById('retry').addEventListener('click', async (event) => {
  event.currentTarget.disabled = true;
  try {
    await window.reframeDesktop.retryStartup();
  } catch {
    document.getElementById('status').textContent = 'Please close and reopen Reframe to try again.';
    document.getElementById('retry').disabled = false;
  }
});
document.getElementById('log').addEventListener('click', async () => {
  const error = await window.reframeDesktop
    .openStartupLog()
    .catch(() => 'Unable to open the diagnostic log.');
  if (error) document.getElementById('status').textContent = error;
});
