import { useMemo, useState } from 'react';
import { Copy, Download, Check, Type, Palette, Shapes, Image as ImageIcon } from 'lucide-react';
import { collectAssets, svgDataUri } from './library/assets.js';
import { bundledFonts } from './fonts.js';
import { download, type ComponentItem, type Theme } from './model';
import './assets.css';

type Tab = 'Fonts' | 'Colors' | 'Icons' | 'Images';
const tabs: [Tab, typeof Type][] = [
  ['Fonts', Type],
  ['Colors', Palette],
  ['Icons', Shapes],
  ['Images', ImageIcon],
];
const sample = 'The quick brown fox jumps over the lazy dog 0123456789';

export default function AssetLibrary({
  items,
  theme,
  onTheme,
}: {
  items: ComponentItem[];
  theme: Theme;
  onTheme: (theme: Theme) => void;
}) {
  const [tab, setTab] = useState<Tab>('Fonts');
  const [site, setSite] = useState('All sites');
  const [copied, setCopied] = useState('');
  const assets = useMemo(() => collectAssets(items), [items]);
  const sites = useMemo(
    () =>
      [
        ...new Set(
          [...assets.fonts, ...assets.colors, ...assets.icons, ...assets.images].flatMap((a) =>
            a.usedBy.map((u: { site: string }) => u.site),
          ),
        ),
      ].sort(),
    [assets],
  );
  const fromSite = <T extends { usedBy: { site: string }[] }>(list: T[]) =>
    site === 'All sites' ? list : list.filter((a) => a.usedBy.some((u) => u.site === site));
  const fonts = fromSite(assets.fonts),
    colors = fromSite(assets.colors),
    icons = fromSite(assets.icons),
    images = fromSite(assets.images);
  // Captured faces get private family names so previews never override the app's or a bundled font.
  const faceCss = useMemo(
    () =>
      fonts
        .map(
          (f, i) =>
            `@font-face{font-family:"rf-asset-${i}";font-style:${f.style};font-weight:${f.weight.replace(/[^0-9 a-z]/gi, '')};src:url("${f.src.replace(/["\\\n]/g, '')}")}`,
        )
        .join(''),
    [fonts],
  );
  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? '' : c)), 1600);
    } catch {
      setCopied('');
    }
  }
  const used = (usedBy: { name: string; site: string }[]) => (
    <small className="asset-used" title={usedBy.map((u) => `${u.name} · ${u.site}`).join('\n')}>
      {usedBy.length === 1 ? usedBy[0].name : `${usedBy.length} components`} ·{' '}
      {[...new Set(usedBy.map((u) => u.site))].join(', ')}
    </small>
  );
  const counts: Record<Tab, number> = {
    Fonts: bundledFonts.length + fonts.length,
    Colors: colors.length,
    Icons: icons.length,
    Images: images.length,
  };

  return (
    <div className="asset-library">
      <style>{faceCss}</style>
      <div className="asset-toolbar">
        <div className="asset-tabs" role="tablist" aria-label="Asset types">
          {tabs.map(([name, Icon]) => (
            <button key={name} role="tab" aria-selected={tab === name} onClick={() => setTab(name)}>
              <Icon size={15} />
              {name}
              <span>{counts[name]}</span>
            </button>
          ))}
        </div>
        <label>
          Source
          <select value={site} onChange={(e) => setSite(e.target.value)}>
            <option>All sites</option>
            {sites.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      {!items.length && (
        <p className="asset-empty">
          Save components from websites to collect their fonts, colors, icons and images here.
          Bundled fonts are always available.
        </p>
      )}

      {tab === 'Fonts' && (
        <>
          <section aria-labelledby="bundled-fonts">
            <div className="section-heading">
              <h2 id="bundled-fonts">Bundled open fonts</h2>
              <span className="muted">SIL Open Font License · works offline · safe to ship</span>
            </div>
            <div className="asset-font-grid">
              {bundledFonts.map((f) => {
                const active = theme.font === f.stack;
                return (
                  <article key={f.id} className={'panel asset-font' + (active ? ' active' : '')}>
                    <p className="asset-font-sample" style={{ fontFamily: f.stack }}>
                      <span style={{ fontWeight: 400 }}>Aa</span>{' '}
                      <span style={{ fontWeight: Math.min(700, f.weights[1]) }}>Aa</span>
                    </p>
                    <p className="asset-font-line" style={{ fontFamily: f.stack }}>
                      {sample}
                    </p>
                    <h3>{f.family}</h3>
                    <small>
                      {f.category} · weights {f.weights[0]}–{f.weights[1]}
                      {f.italic ? ' · italic' : ''} · {f.designer}
                    </small>
                    <div className="asset-actions">
                      <button
                        className={active ? '' : 'primary'}
                        disabled={active}
                        onClick={() => onTheme({ ...theme, font: f.stack, name: 'Custom' })}
                      >
                        {active ? (
                          <>
                            <Check size={14} />
                            In your theme
                          </>
                        ) : (
                          'Use in theme'
                        )}
                      </button>
                      <a href={f.files.normal} download>
                        Download
                      </a>
                      <a href={f.licenseFile} target="_blank" rel="noreferrer">
                        License
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
          <section aria-labelledby="captured-fonts">
            <div className="section-heading">
              <h2 id="captured-fonts">Captured from websites</h2>
              <span className="muted">{fonts.length} faces · each stored once</span>
            </div>
            {fonts.length ? (
              <>
                <p className="asset-note">
                  Captured fonts belong to their foundries. They preview your references; check the
                  licence before using them in a product, or pick a bundled font instead.
                </p>
                <div className="asset-font-grid">
                  {fonts.map((f, i) => (
                    <article key={i} className="panel asset-font">
                      <p
                        className="asset-font-line"
                        style={{
                          fontFamily: `"rf-asset-${i}", system-ui`,
                          fontWeight: parseInt(f.weight) || 400,
                          fontStyle: f.style,
                        }}
                      >
                        {sample}
                      </p>
                      <h3>{f.family}</h3>
                      <small>
                        {f.weight} · {f.style} ·{' '}
                        {f.embedded
                          ? 'embedded'
                          : 'online reference · the source site may block this preview'}
                      </small>
                      {used(f.usedBy)}
                      <div className="asset-actions">
                        <button onClick={() => copy(`font-family: "${f.family}";`, 'font' + i)}>
                          {copied === 'font' + i ? <Check size={14} /> : <Copy size={14} />}Copy CSS
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <p className="asset-empty">
                No captured fonts{site === 'All sites' ? ' yet' : ' from ' + site}. Pick an element
                in Studio → Browser and save it.
              </p>
            )}
          </section>
        </>
      )}

      {tab === 'Colors' &&
        (colors.length ? (
          <div className="asset-color-grid">
            {colors.map((c) => (
              <article key={c.hex} className="panel asset-color">
                <button
                  className="asset-swatch"
                  style={{ background: c.hex }}
                  aria-label={`Copy ${c.hex}`}
                  onClick={() => copy(c.hex, c.hex)}
                />
                <strong>{copied === c.hex ? 'Copied' : c.hex}</strong>
                <small>{c.count} uses</small>
                {used(c.usedBy)}
                <div className="asset-actions">
                  {(['primary', 'background', 'text'] as const).map((key) => (
                    <button
                      key={key}
                      disabled={theme[key].toLowerCase() === c.hex}
                      onClick={() => onTheme({ ...theme, [key]: c.hex, name: 'Custom' })}
                    >
                      {key[0].toUpperCase() + key.slice(1)}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="asset-empty">
            No captured colors yet. Colors come from the rendered styles of components you pick from
            websites.
          </p>
        ))}

      {tab === 'Icons' &&
        (icons.length ? (
          <div className="asset-icon-grid">
            {icons.map((icon, i) => (
              <article key={i} className="panel asset-icon">
                <img src={svgDataUri(icon.svg)} alt="" />
                {used(icon.usedBy)}
                <div className="asset-actions">
                  <button
                    aria-label="Copy SVG"
                    title="Copy SVG"
                    onClick={() => copy(icon.svg, 'icon' + i)}
                  >
                    {copied === 'icon' + i ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                  <button
                    aria-label="Download SVG"
                    title="Download SVG"
                    onClick={() => download(`icon-${i + 1}.svg`, icon.svg, 'image/svg+xml')}
                  >
                    <Download size={14} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="asset-empty">No inline SVG icons captured yet.</p>
        ))}

      {tab === 'Images' &&
        (images.length ? (
          <>
            <p className="asset-note">
              Images stay online references to their source sites; nothing is downloaded until you
              choose to.
            </p>
            <div className="asset-image-grid">
              {images.map((img, i) => (
                <article key={img.src} className="panel asset-image">
                  <img src={img.src} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  {used(img.usedBy)}
                  <div className="asset-actions">
                    <button onClick={() => copy(img.src, 'img' + i)}>
                      {copied === 'img' + i ? <Check size={14} /> : <Copy size={14} />}Copy URL
                    </button>
                    <a href={img.src} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className="asset-empty">No images captured yet.</p>
        ))}
    </div>
  );
}
