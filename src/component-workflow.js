export function componentReadiness(item) {
  if (item.feature)
    return {
      kind: 'feature',
      label: 'UI + backend package',
      detail: item.feature.spec.website
        ? 'Original rendered styling, local navigation, PDF downloads and an independently authored form backend. Source images remain online. React / Vite only.'
        : item.feature.spec.commerce
          ? 'Product options, shared demo cart and local orders. React / Vite only; no payments or shipment.'
          : 'Declared actions, API and storage are included. Configure any account and external service requirements before use.',
      preview:
        'This is the captured appearance. Use Working preview below to test the generated UI and backend before installation.',
    };
  if (item.libraryId)
    return {
      kind: 'original',
      label: 'Interactive UI',
      detail:
        'Local UI interactions are included. External services need their own integration. Native source is available; device runtime testing is pending.',
      preview: 'Try the local interactions here. Review the exported source before installing.',
    };
  return {
    kind: 'reference',
    label: 'Visual reference',
    detail:
      'HTML structure and appearance only. Define the behavior you need; a capture cannot recover a private backend.',
    preview:
      'Links and submissions are disabled in this visual reference. Build behavior or connect your own application handlers.',
  };
}

export function matchesComponent(item, query, kind = 'all') {
  const state = componentReadiness(item);
  return (
    (kind === 'all' || kind === state.kind) &&
    `${item.name} ${item.source} ${state.label}`.toLowerCase().includes(query.trim().toLowerCase())
  );
}

export function sameComponent(saved, current, theme) {
  return (
    !!saved &&
    saved.id === current.id &&
    saved.name === current.name &&
    saved.html === current.html &&
    saved.libraryId === current.libraryId &&
    JSON.stringify(saved.feature) === JSON.stringify(current.feature) &&
    JSON.stringify(saved.theme) === JSON.stringify(theme)
  );
}

export function preferredCapture(items) {
  const content = items.filter((item) => !['nav', 'header', 'footer'].includes(item.kind));
  return (
    content.find((item) => /<(?:button|input|textarea|select)\b/i.test(item.html)) ||
    content[0] ||
    items[0]
  );
}
