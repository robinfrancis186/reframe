export const safeFont = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 160 &&
  /^[a-zA-Z0-9 ,"'_-]+$/.test(value);
export const safeLogo = (value) =>
  typeof value === 'string' &&
  value.length <= 350000 &&
  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
export function validBrand(theme) {
  return (
    (theme.brandName === undefined ||
      (typeof theme.brandName === 'string' && theme.brandName.length <= 100)) &&
    (theme.tagline === undefined ||
      (typeof theme.tagline === 'string' && theme.tagline.length <= 240)) &&
    (theme.logo === undefined || theme.logo === '' || safeLogo(theme.logo))
  );
}
export function themeStyle(theme) {
  if (
    ![theme.primary, theme.background, theme.text].every((v) => /^#[a-f0-9]{6}$/i.test(v || '')) ||
    !safeFont(theme.font) ||
    !Number.isFinite(theme.radius) ||
    theme.radius < 0 ||
    theme.radius > 32 ||
    !validBrand(theme)
  )
    throw new Error('Invalid library theme.');
  const rgb = theme.primary
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const onPrimary =
    rgb.reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0) > 0.179
      ? '#000000'
      : '#ffffff';
  const background = theme.background
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16));
  const scheme =
    background.reduce((n, c, i) => n + c * [0.2126, 0.7152, 0.0722][i], 0) < 128 ? 'dark' : 'light';
  return {
    '--rf-scheme': scheme,
    '--rf-on-primary': onPrimary,
    '--rf-primary': theme.primary,
    '--rf-bg': theme.background,
    '--rf-text': theme.text,
    '--rf-radius': theme.radius + 'px',
    '--rf-font': theme.font,
  };
}

export const defaultBrandTheme = {
  name: 'Project',
  primary: '#6956e8',
  background: '#ffffff',
  text: '#161a27',
  font: 'system-ui, sans-serif',
  radius: 8,
};
export function destinationBrand(theme, detected, framework, automatic = true) {
  const result = { ...defaultBrandTheme, ...theme, ...(automatic ? detected : {}) };
  if (automatic && ['swiftui', 'compose'].includes(framework))
    result.nativeInherited = Object.fromEntries(
      ['primary', 'background', 'text', 'font'].map((key) => [key, detected[key] === undefined]),
    );
  return result;
}
