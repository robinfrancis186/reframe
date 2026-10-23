// Open-licence (SIL OFL 1.1) variable fonts bundled in public/fonts, Latin subset from Fontsource 5.3.0.
// Stacks name the Fontsource family second so exported code also works after `npm i @fontsource-variable/<id>`.
export const bundledFonts = [
  {
    id: 'inter',
    family: 'Inter',
    category: 'Sans serif',
    weights: [100, 900],
    italic: true,
    designer: 'Rasmus Andersson',
  },
  {
    id: 'dm-sans',
    family: 'DM Sans',
    category: 'Sans serif',
    weights: [100, 1000],
    italic: true,
    designer: 'Colophon Foundry',
  },
  {
    id: 'manrope',
    family: 'Manrope',
    category: 'Sans serif',
    weights: [200, 800],
    italic: false,
    designer: 'Mikhail Sharanda',
  },
  {
    id: 'space-grotesk',
    family: 'Space Grotesk',
    category: 'Sans serif',
    weights: [300, 700],
    italic: false,
    designer: 'Florian Karsten',
  },
  {
    id: 'playfair-display',
    family: 'Playfair Display',
    category: 'Serif',
    weights: [400, 900],
    italic: true,
    designer: 'Claus Eggers Sørensen',
  },
  {
    id: 'lora',
    family: 'Lora',
    category: 'Serif',
    weights: [400, 700],
    italic: true,
    designer: 'Cyreal',
  },
  {
    id: 'fraunces',
    family: 'Fraunces',
    category: 'Serif',
    weights: [100, 900],
    italic: true,
    designer: 'Undercase Type',
  },
  {
    id: 'jetbrains-mono',
    family: 'JetBrains Mono',
    category: 'Monospace',
    weights: [100, 800],
    italic: true,
    designer: 'JetBrains',
  },
].map((font) => ({
  ...font,
  license: 'SIL Open Font License 1.1',
  package: '@fontsource-variable/' + font.id,
  stack: `${font.family}, ${font.family} Variable, ${font.category === 'Serif' ? 'Georgia, serif' : font.category === 'Monospace' ? 'ui-monospace, monospace' : 'system-ui, sans-serif'}`,
  files: {
    normal: `/fonts/${font.id}/${font.id}-latin-wght-normal.woff2`,
    ...(font.italic ? { italic: `/fonts/${font.id}/${font.id}-latin-wght-italic.woff2` } : {}),
  },
  licenseFile: `/fonts/${font.id}/OFL.txt`,
}));

const familyOf = (stack) =>
  String(stack || '')
    .split(',')[0]
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase();
/** The bundled font a theme stack starts with, if any. */
export const bundledFontFor = (stack) =>
  bundledFonts.find((font) => font.family.toLowerCase() === familyOf(stack));

/** @font-face rules for bundled fonts; pass a stack to emit only that family. */
export function fontFaceCss(stack) {
  const fonts = stack === undefined ? bundledFonts : [bundledFontFor(stack)].filter(Boolean);
  return fonts
    .flatMap((font) =>
      Object.entries(font.files).map(
        ([style, url]) =>
          `@font-face{font-family:"${font.family}";font-style:${style};font-weight:${font.weights[0]} ${font.weights[1]};font-display:swap;src:url("${url}") format("woff2-variations"),url("${url}") format("woff2")}`,
      ),
    )
    .join('');
}

/** Installation note for exported source that uses a bundled font. */
export function fontRequirement(stack) {
  const font = bundledFontFor(stack);
  return font
    ? `Font: ${font.family} (${font.license}). Install with \`npm i ${font.package}\` and import "${font.package}" once, or self-host the files from Reframe's public${font.files.normal.replace(/\/[^/]+$/, '/')}.`
    : '';
}
