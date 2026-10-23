// Counts come from the current package, never from a claimed compatibility percentage.
export function reuseReport(item) {
  const site = item.feature?.spec?.website;
  if (!site) return null;
  const html = site.pages.map((p) => p.html).join('\n');
  const imageSources = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]*)"/gi)].map((m) => m[1]);
  const cssSources = [...site.css.matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/gi)].map(
    (m) => m[1],
  );
  const external = [
    ...new Set(
      [
        ...imageSources,
        ...cssSources,
        ...[...html.matchAll(/<use\b[^>]*\bhref="([^"]*)"/gi)].map((m) => m[1]),
      ].filter((u) => !u.startsWith('data:') && !u.startsWith('#')),
    ),
  ];
  const links = [
    ...new Set([...html.matchAll(/<a\b[^>]*\bhref="(https?:[^"\s]*)"/gi)].map((m) => m[1])),
  ];
  return {
    external,
    links,
    images: imageSources.filter((u) => u.startsWith('data:image/')).length,
    fonts: new Set(cssSources.filter((u) => u.startsWith('data:font/'))).size,
    backgrounds: new Set(cssSources.filter((u) => u.startsWith('data:image/'))).size,
    downloads: site.attachments.length,
    warnings: [...new Set(site.warnings || [])],
    forms: /<form\b/i.test(html),
    selfContained: external.length === 0,
  };
}
