// Reframe Picker overlay, injected only when the user starts it on this tab. Hover outlines what a click will select;
// click selects; ↑/↓ move to the parent/child; Enter saves; Esc closes. Element rules match the reference browser
// (server/browser.js): clicks inside links and buttons select the control, and parent steps skip wrappers that would not
// visibly change the selection. The overlay lives in a closed shadow root, so page styles cannot reach it.
(() => {
  if (window.__reframePicker) return;
  const interactive = 'a,button,input,textarea,select,summary';
  const host = document.createElement('reframe-picker');
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>
    *{box-sizing:border-box;font:13px/1.4 system-ui,-apple-system,sans-serif}
    .box{position:fixed;border:2px dashed #2f7cf6;background:#2f7cf61a;pointer-events:none;border-radius:2px}
    .box.selected{border-style:solid;background:#2f7cf626}
    .label{position:absolute;left:-2px;bottom:100%;max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:#2f7cf6;color:#fff;font-size:11px;padding:2px 6px;border-radius:4px 4px 0 0}
    .bar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);display:flex;flex-wrap:wrap;gap:8px;align-items:center;max-width:min(760px,calc(100vw - 32px));padding:10px 12px;border-radius:12px;background:#1d1d1f;color:#f5f5f7;box-shadow:0 8px 30px #0006;pointer-events:auto}
    .bar b{font-weight:600}.hint{color:#c7c7cc}
    input{min-width:200px;flex:1;padding:6px 8px;border-radius:6px;border:1px solid #555;background:#2c2c2e;color:#fff}
    button{padding:6px 10px;border-radius:6px;border:1px solid #555;background:#2c2c2e;color:#fff;cursor:pointer}
    button.primary{background:#2f7cf6;border-color:#2f7cf6}button:disabled{opacity:.5;cursor:default}
    .message{width:100%}.message.error{color:#ff9f9f}.message.ok{color:#8fe3a8}
  </style><div class="box" hidden><span class="label"></span></div><div class="bar" role="dialog" aria-label="Reframe Picker"></div>`;
  const box = shadow.querySelector('.box'), label = shadow.querySelector('.label'), bar = shadow.querySelector('.bar');
  document.documentElement.append(host);

  let hovered = null, selected = null, chain = [], saving = false;
  const send = message => chrome.runtime.sendMessage(message);
  const frame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
  const resolve = el => { if (!(el instanceof Element) || el === host) return null; el = el.closest(interactive) || el; return el === document.body || el === document.documentElement ? null : el; };
  const rectKey = el => { const r = el.getBoundingClientRect(); return r.width < 1 || r.height < 1 ? null : [r.x, r.y, r.width, r.height].map(Math.round).join(); };
  const parentOf = el => { const start = rectKey(el); let next = el.parentElement; while (next && next !== document.body && (rectKey(next) === null || rectKey(next) === start)) next = next.parentElement; return next && next !== document.body ? next : null; };
  const nameOf = el => ([...el.querySelectorAll('h1,h2,h3')].find(h => h.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && h.getBoundingClientRect().width > 0)?.textContent || el.getAttribute('aria-label') || el.textContent || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 80);

  function draw() {
    const el = selected || hovered;
    if (!el) { box.hidden = true; return; }
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    box.classList.toggle('selected', !!selected);
    label.textContent = el.tagName.toLowerCase() + ' · ' + nameOf(el);
    box.hidden = false;
  }
  function render(message = '', tone = '') {
    bar.replaceChildren();
    const add = (tag, props = {}, text = '') => { const node = Object.assign(document.createElement(tag), props); if (text) node.textContent = text; bar.append(node); return node; };
    if (!selected) add('span', { className: 'hint' }, 'Reframe Picker · hover and click an element · Esc to close');
    else {
      const name = add('input', { value: nameOf(selected), maxLength: 200, ariaLabel: 'Component name' });
      add('button', { title: 'Select the parent (↑)', disabled: !parentOf(selected), onclick: () => up() }, '↑ Parent');
      add('button', { title: 'Back to the child (↓)', disabled: !chain.length, onclick: () => down() }, '↓ Child');
      add('button', { className: 'primary', disabled: saving, onclick: () => save(name.value) }, saving ? 'Saving…' : 'Save to Reframe');
      name.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); save(name.value); } });
    }
    add('button', { onclick: close }, 'Close');
    if (message) add('span', { className: 'message ' + tone, role: 'status' }, message);
  }
  const up = () => { const parent = selected && parentOf(selected); if (parent) { chain.push(selected); selected = parent; draw(); render(); } };
  const down = () => { if (chain.length) { selected = chain.pop(); draw(); render(); } };

  // The reference image shows only the element over its own backdrop, as in the reference browser.
  async function screenshot(el) {
    const r = el.getBoundingClientRect(), x = Math.max(0, r.x), y = Math.max(0, r.y), w = Math.min(innerWidth, r.right) - x, h = Math.min(innerHeight, r.bottom) - y;
    if (w < 1 || h < 1) return undefined;
    for (let node = el; node.parentElement; node = node.parentElement) for (const sibling of node.parentElement.children) if (sibling !== node) sibling.setAttribute('data-rf-isolate', '');
    const style = document.createElement('style'); style.textContent = '[data-rf-isolate]{visibility:hidden!important}'; document.head.append(style);
    host.style.display = 'none';
    try {
      await frame(); await frame();
      const reply = await send({ type: 'screenshot' });
      if (!reply.ok) throw new Error(reply.error);
      const image = new Image(); image.src = reply.result.image; await image.decode();
      const scale = image.naturalWidth / innerWidth, canvas = document.createElement('canvas');
      canvas.width = Math.round(w); canvas.height = Math.round(h);
      canvas.getContext('2d').drawImage(image, x * scale, y * scale, w * scale, h * scale, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.65);
    } finally {
      style.remove(); for (const node of document.querySelectorAll('[data-rf-isolate]')) node.removeAttribute('data-rf-isolate');
      host.style.display = '';
    }
  }
  async function save(name) {
    if (!selected || saving) return;
    saving = true; render('Reading the element…');
    try {
      document.querySelector('[data-rf-picked]')?.removeAttribute('data-rf-picked');
      selected.setAttribute('data-rf-picked', 'true');
      let page;
      try { page = globalThis.reframeSnapshot('[data-rf-picked]'); } finally { selected.removeAttribute('data-rf-picked'); }
      const referenceImage = await screenshot(selected);
      render('Saving to Reframe and checking the match…');
      const reply = await send({ type: 'save', capture: { page, name: name.trim() || nameOf(selected), referenceImage } });
      if (!reply.ok) throw new Error(reply.error);
      const { fidelity, replaced } = reply.result;
      saving = false; render(`${replaced ? 'Updated' : 'Saved'} in Reframe${fidelity ? ` · ${Math.round(fidelity.score)}% match` : ''}. Pick another element or close.`, 'ok');
    } catch (error) { saving = false; render(error.message, 'error'); }
  }
  function close() {
    for (const [type, listener] of listeners) window.removeEventListener(type, listener, true);
    host.remove(); delete window.__reframePicker;
  }
  const ours = event => event.composedPath().includes(host);
  const block = event => { if (!ours(event)) { event.preventDefault(); event.stopPropagation(); } };
  const listeners = [
    ['mousemove', event => { if (!selected && !ours(event)) { hovered = resolve(event.target); draw(); } }],
    ['click', event => { if (ours(event)) return; block(event); if (saving) return; selected = resolve(event.target); chain = []; draw(); render(); }],
    ['mousedown', block], ['mouseup', block], ['pointerdown', block], ['pointerup', block], ['dblclick', block],
    ['keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); if (selected && !saving) { selected = null; chain = []; draw(); render(); } else close(); return; }
      if (!selected || ours(event) && event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      if (event.key === 'ArrowUp') { event.preventDefault(); up(); }
      else if (event.key === 'ArrowDown') { event.preventDefault(); down(); }
      else if (event.key === 'Enter') { event.preventDefault(); save(nameOf(selected)); }
    }],
    ['scroll', () => draw()], ['resize', () => draw()],
  ];
  for (const [type, listener] of listeners) window.addEventListener(type, listener, true);
  window.__reframePicker = { close };
  render();
})();
