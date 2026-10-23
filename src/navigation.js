export const sections = [
  { name: 'Home', pages: [['Home', 'Home']] },
  {
    name: 'Studio',
    pages: [
      ['Workbench', 'Canvas'],
      ['Browser', 'Browser'],
      ['Native capture', 'Devices'],
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
    name: 'Agents',
    pages: [
      ['Agents', 'Team & workflows'],
      ['Engines', 'Review tools'],
      ['Connections', 'Connections'],
    ],
  },
];
export const sectionFor = (page) =>
  sections.find((section) => section.pages.some(([id]) => id === page)) || sections[0];
export const pageLabel = (page) => sectionFor(page).pages.find(([id]) => id === page)?.[1] || page;
