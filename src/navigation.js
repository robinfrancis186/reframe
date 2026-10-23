export const sections = [
  { name: 'Home', pages: [['Home', 'Home']] },
  {
    name: 'Capture',
    pages: [
      ['Browser', 'Browse & pick'],
      ['Workbench', 'Editor'],
    ],
  },
  {
    name: 'Library',
    pages: [
      ['Clipboard', 'Saved components'],
      ['Assets', 'Fonts & assets'],
      ['Component library', 'Originals'],
    ],
  },
  {
    name: 'Projects',
    pages: [
      ['Projects', 'Integrate'],
      ['Project theme', 'Branding'],
    ],
  },
  {
    name: 'Labs',
    pages: [
      ['Agents', 'Agents & testing'],
      ['Native capture', 'Device capture'],
      ['Engines', 'Review tools'],
      ['Connections', 'Assistant connections'],
    ],
  },
];
export const sectionFor = (page) =>
  sections.find((section) => section.pages.some(([id]) => id === page)) || sections[0];
export const pageLabel = (page) => sectionFor(page).pages.find(([id]) => id === page)?.[1] || page;
