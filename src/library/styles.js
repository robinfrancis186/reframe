export const libraryCSS = `
.rf-library{box-sizing:border-box;--text:var(--rf-text);--surface:var(--rf-bg);--border:color-mix(in srgb,var(--rf-text) 18%,transparent);font:14px/1.6 var(--rf-font);color:var(--rf-text);background:var(--rf-bg);color-scheme:var(--rf-scheme,light);padding:clamp(18px,4vw,30px);width:100%;min-width:0;border:1px solid var(--border);border-radius:var(--rf-radius);text-align:left;overflow-wrap:anywhere}
.rf-library *{box-sizing:border-box}.rf-library :is(section,article,form){min-width:0}.rf-library h2{font-size:clamp(20px,2.5vw,25px);line-height:1.25;letter-spacing:-.035em;margin:0 0 12px;color:inherit}.rf-library h3{font-size:16px;margin:18px 0 8px;color:inherit}.rf-library p{margin:10px 0 18px}.rf-library small{display:block;font-size:12px;line-height:1.6;color:inherit;opacity:.8}.rf-library button,.rf-library input,.rf-library select,.rf-library textarea{font:inherit;color:inherit;max-width:100%}
.rf-library button{background:transparent;border:1px solid var(--border);padding:9px 15px;min-height:44px;line-height:1.4;border-radius:var(--rf-radius);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;white-space:normal;box-shadow:none;transition:background .15s,border-color .15s}.rf-library button:hover:not(:disabled){background:color-mix(in srgb,var(--rf-primary) 9%,var(--rf-bg));border-color:var(--rf-primary)}.rf-library button:disabled{opacity:.45;cursor:not-allowed}.rf-library button[data-primary],.rf-library [role=tab][aria-selected=true]{background:var(--rf-primary);color:var(--rf-on-primary);border-color:transparent}.rf-library button[data-primary]:hover:not(:disabled),.rf-library [role=tab][aria-selected=true]:hover{background:var(--rf-primary);color:var(--rf-on-primary);filter:brightness(.94)}.rf-library :focus-visible{outline:2px solid var(--rf-primary);outline-offset:3px}.rf-library [aria-pressed=true]{border-color:var(--rf-primary);box-shadow:inset 0 0 0 1px var(--rf-primary)}
.rf-library .rf-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.rf-library label{display:grid;gap:7px;margin:16px 0 10px;font-weight:500}.rf-library :is(input,select,textarea){background:var(--rf-bg);border:1px solid var(--border);padding:11px 12px;border-radius:var(--rf-radius);margin:0}.rf-library input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=color]),.rf-library textarea{width:100%}.rf-library input[type=range]{width:100%;accent-color:var(--rf-primary)}.rf-library input:is([type=checkbox],[type=radio]){width:18px;height:18px;flex:0 0 18px;padding:0;accent-color:var(--rf-primary)}.rf-library textarea{min-height:100px;resize:vertical}.rf-library fieldset{border:1px solid var(--border);border-radius:var(--rf-radius);padding:12px 16px;min-width:0}.rf-library legend{padding:0 6px}.rf-library output{font-variant-numeric:tabular-nums}
.rf-library :is([role=status],[role=alert]){font-size:13px;padding:12px 14px;background:color-mix(in srgb,var(--rf-primary) 6%,var(--rf-bg));border-radius:var(--rf-radius);margin:16px 0 0}.rf-library [role=alert]{border-left:3px solid var(--rf-primary)}.rf-library details{border-bottom:1px solid var(--border);padding:14px 0}.rf-library summary{cursor:pointer;font-weight:600;min-height:32px}.rf-library details p{margin:12px 0 4px}.rf-library img{max-width:80px;max-height:80px;object-fit:contain}.rf-library pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;padding:16px;background:color-mix(in srgb,var(--rf-text) 5%,var(--rf-bg));border-radius:var(--rf-radius)}
@media(prefers-reduced-motion:reduce){.rf-library *{animation:none!important;transition:none!important;scroll-behavior:auto!important}.rf-library .rf-tilt{transform:none!important}}
`;
const rules = {
  tabs: `.rf-library [role=tablist]{display:flex;flex-wrap:wrap;gap:4px;padding:5px;background:color-mix(in srgb,var(--rf-text) 5%,var(--rf-bg));border-radius:var(--rf-radius)}.rf-library [role=tab]{flex:1;border-color:transparent}.rf-library [role=tabpanel]{padding:24px 4px 4px;min-height:140px}`,
  search: `.rf-library .rf-results{list-style:none;padding:0;margin:16px 0;max-height:250px;overflow:auto}.rf-library .rf-results>li{padding:3px}.rf-library .rf-results button{width:100%;justify-content:space-between;text-align:left}.rf-library .rf-results .rf-row{padding:12px 0;border-bottom:1px solid var(--border)}.rf-library .rf-results .rf-row button{width:auto}`,
  switch: `.rf-library .rf-switch{width:56px;padding:5px;border-radius:30px;justify-content:flex-start}.rf-library .rf-switch[aria-checked=true]{background:var(--rf-primary);justify-content:flex-end}.rf-library .rf-switch span{height:24px;width:24px;border-radius:50%;background:var(--rf-text)}.rf-library .rf-switch[aria-checked=true] span{background:var(--rf-on-primary)}`,
  overlay: `.rf-library dialog{color:var(--rf-text);background:var(--rf-bg);border:1px solid var(--border);border-radius:var(--rf-radius);padding:28px;width:min(440px,calc(100vw - 32px));max-height:85dvh;box-shadow:0 24px 80px #0003}.rf-library dialog::backdrop{background:#0007;backdrop-filter:blur(3px)}.rf-library dialog[data-placement=drawer]{margin:0 0 0 auto;height:100dvh;max-height:100dvh}.rf-library dialog[data-placement=bottom-sheet]{margin:auto auto 0;width:min(600px,calc(100vw - 20px))}`,
  navigation: `.rf-library .rf-nav-vertical{display:grid;gap:6px;margin:16px 0}.rf-library .rf-nav-vertical button{justify-content:flex-start}.rf-library nav{margin:16px 0}.rf-library ol{padding-left:24px}.rf-library li[aria-current=step]{color:var(--rf-primary);font-weight:700}`,
  brand: `.rf-library .rf-brand-mark{display:grid;place-items:center;width:54px;height:54px;border-radius:var(--rf-radius);background:var(--rf-primary);color:var(--rf-on-primary);font-weight:700;font-size:24px;margin-bottom:20px}`,
  picker: `.rf-library .rf-picker,.rf-library .rf-arc{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0}.rf-library input[type=color]{height:48px;width:100px}`,
  table: `.rf-library .rf-table-scroll{overflow:auto}.rf-library table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}.rf-library th,.rf-library td{padding:13px 10px;text-align:left;border-bottom:1px solid var(--border)}.rf-library thead{background:color-mix(in srgb,var(--rf-text) 4%,var(--rf-bg))}`,
  gallery: `.rf-library .rf-gallery-window{overflow:auto;max-width:100%;padding:12px 0}.rf-library .rf-artwork{transform-origin:center;transition:transform .2s;display:grid;place-items:center;overflow:hidden;border-radius:var(--rf-radius);margin:16px 0;font-size:30px;font-weight:600}`,
  tooltip: `.rf-library [role=tooltip]{display:block;padding:12px;border:1px solid var(--border);border-radius:var(--rf-radius);margin-top:12px}`,
  card: `.rf-library .rf-tilt{transition:transform .12s}`,
  agent: `.rf-library .rf-message-scroll{display:grid;gap:8px;max-height:250px;overflow:auto}.rf-library .rf-message{padding:14px 16px;background:color-mix(in srgb,var(--rf-primary) 8%,var(--rf-bg));border-radius:var(--rf-radius);margin:0}.rf-library .rf-orb{width:90px;height:90px;margin:28px auto;border-radius:50%;background:radial-gradient(circle at 30% 30%,var(--rf-bg),var(--rf-primary));transition:transform .2s}`,
  motion: `.rf-library .rf-reveal{animation:rf-reveal .25s ease-out}.rf-library .rf-motion{padding:28px;border-radius:var(--rf-radius);margin:16px 0;overflow:hidden;background:linear-gradient(130deg,var(--rf-bg),color-mix(in srgb,var(--rf-primary) 28%,var(--rf-bg)));animation:rf-ambient 4s ease-in-out infinite alternate}.rf-library .rf-motion[data-playing=false]{animation-play-state:paused}@keyframes rf-reveal{from{opacity:.2;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}@keyframes rf-ambient{from{filter:saturate(.7)}to{filter:saturate(1.4)}}`,
};
const groups = {
  command: ['overlay', 'navigation'],
  sortable: ['search'],
  steps: ['navigation'],
  files: ['navigation'],
  breadcrumb: ['navigation'],
  colors: ['picker'],
  notice: ['motion'],
  number: ['motion'],
  actions: ['motion'],
  agent: ['agent', 'navigation'],
};
export function libraryStyles(entry) {
  return (
    libraryCSS +
    (groups[entry.nativeKind] || [entry.nativeKind]).map((key) => rules[key] || '').join('\n')
  );
}
export const extendedCSS = Object.values(rules).join('\n');
