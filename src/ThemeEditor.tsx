import { useState } from 'react';
import BrandingDetector from './BrandingDetector';
import { safeLogo } from './branding.js';
import { type Theme, themes } from './model';
import { bundledFonts } from './fonts.js';
export default function ThemeEditor({
  theme,
  onChange,
  full = false,
}: {
  theme: Theme;
  onChange: (t: Theme) => void;
  full?: boolean;
}) {
  const [css, setCss] = useState('');
  const [message, setMessage] = useState('');
  function importCss() {
    const value = (names: string[]) => {
      for (const name of names) {
        const match = css.match(new RegExp(`--${name}\\s*:\\s*(#[0-9a-f]{6})\\b`, 'i'));
        if (match) return match[1];
      }
      return null;
    };
    const primary = value(['primary', 'color-primary', 'accent']),
      background = value(['background', 'surface', 'color-background']),
      text = value(['foreground', 'text', 'color-text']);
    if (!primary && !background && !text) {
      setMessage(
        'No supported hex tokens found. Use --primary, --background or --foreground with six-digit hex values.',
      );
      return;
    }
    onChange({
      ...theme,
      name: 'My project',
      primary: primary || theme.primary,
      background: background || theme.background,
      text: text || theme.text,
    });
    setMessage('Project colors applied.');
  }
  return (
    <div className="theme-controls">
      {full && <BrandingDetector theme={theme} onChange={onChange} />}
      <label>
        Project theme
        <select
          value={themes.some((t) => t.name === theme.name) ? theme.name : 'Custom'}
          onChange={(e) => {
            const t = themes.find((t) => t.name === e.target.value);
            if (t) onChange({ ...theme, ...t });
          }}
        >
          {themes.map((t) => (
            <option key={t.name}>{t.name}</option>
          ))}
          <option value="Custom">Custom</option>
        </select>
      </label>
      <fieldset>
        <legend>Primary color</legend>
        <div className="swatches">
          {themes.slice(0, 3).map((t) => (
            <button
              key={t.primary}
              aria-label={`Use ${t.name}`}
              aria-pressed={theme.primary === t.primary}
              className={theme.primary === t.primary ? 'active' : ''}
              style={{ background: t.primary }}
              onClick={() => onChange({ ...theme, primary: t.primary, name: 'Custom' })}
            />
          ))}
          <input
            type="color"
            aria-label="Custom primary color"
            value={theme.primary}
            onChange={(e) => onChange({ ...theme, name: 'Custom', primary: e.target.value })}
          />
        </div>
      </fieldset>
      <label>
        Corner radius <span className="muted">({theme.radius}px)</span>
        <input
          type="range"
          min="0"
          max="32"
          value={theme.radius}
          onChange={(e) =>
            onChange({
              ...theme,
              radius: Number(e.target.value),
              name: 'Custom',
            })
          }
        />
        <span className="range-labels">
          <span>0</span>
          <span>32</span>
        </span>
      </label>
      {full && (
        <>
          <div className="brand-fields">
            <h3>Brand identity</h3>
            <label>
              Brand name
              <input
                maxLength={100}
                value={theme.brandName || ''}
                placeholder="Your brand"
                onChange={(e) => onChange({ ...theme, brandName: e.target.value })}
              />
            </label>
            <label>
              Tagline
              <textarea
                rows={2}
                maxLength={240}
                value={theme.tagline || ''}
                placeholder="A little about your brand"
                onChange={(e) => onChange({ ...theme, tagline: e.target.value })}
              />
            </label>
            <label>
              Brand logo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 250000) {
                    setMessage('Choose a PNG, JPEG or WebP logo under 250 KB.');
                    return;
                  }
                  const reader = new FileReader();
                  reader.onerror = () => setMessage('Could not read this logo.');
                  reader.onload = () => {
                    if (safeLogo(reader.result)) {
                      onChange({ ...theme, logo: reader.result as string });
                      setMessage('Brand logo applied.');
                    } else setMessage('Choose a PNG, JPEG or WebP image.');
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            {theme.logo && (
              <div className="brand-logo-row">
                <img src={theme.logo} alt="Current brand logo" />
                <button onClick={() => onChange({ ...theme, logo: '' })}>Remove logo</button>
              </div>
            )}
          </div>
          <div className="theme-colors">
            <label>
              Surface
              <input
                type="color"
                value={theme.background}
                onChange={(e) =>
                  onChange({
                    ...theme,
                    background: e.target.value,
                    name: 'Custom',
                  })
                }
              />
            </label>
            <label>
              Text
              <input
                type="color"
                value={theme.text}
                onChange={(e) => onChange({ ...theme, text: e.target.value, name: 'Custom' })}
              />
            </label>
          </div>
          <label>
            Typography
            <select
              value={theme.font}
              onChange={(e) => onChange({ ...theme, font: e.target.value, name: 'Custom' })}
            >
              {!themes.some((t) => t.font === theme.font) &&
                !bundledFonts.some((f) => f.stack === theme.font) &&
                theme.font !== 'ui-monospace, monospace' && (
                  <option value={theme.font}>{theme.font} (detected)</option>
                )}
              <optgroup label="System">
                <option value="Inter, system-ui, sans-serif">System sans</option>
                <option value="Georgia, serif">Editorial serif</option>
                <option value="ui-monospace, monospace">Monospace</option>
              </optgroup>
              <optgroup label="Bundled open fonts">
                {bundledFonts.map((f) => (
                  <option key={f.id} value={f.stack}>
                    {f.family} · {f.category}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <label>
            Import your CSS tokens
            <textarea
              value={css}
              onChange={(e) => setCss(e.target.value)}
              rows={5}
              placeholder={'--primary: #3159e8;\n--background: #ffffff;\n--foreground: #161a27;'}
            />
          </label>
          <button onClick={importCss}>Apply project colors</button>
          {message && (
            <p className="muted" role="status">
              {message}
            </p>
          )}
        </>
      )}
    </div>
  );
}
