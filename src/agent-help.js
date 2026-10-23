export const helpActions = {
  test: { label: 'Test in a real browser', page: 'Agents' },
  browse: { label: 'Browse & pick', page: 'Browser' },
  build: { label: 'Define component behavior', page: 'Workbench' },
  recommend: { label: 'Find project components', page: 'Projects' },
  brand: { label: 'Open project branding', page: 'Project theme' },
  review: { label: 'Review source & engines', page: 'Engines' },
  library: { label: 'Open saved components', page: 'Clipboard' },
  workflow: { label: 'Open agent workflow', page: 'Agents' },
  connect: { label: 'Manage MCP connections', page: 'Connections' },
  none: { label: '', page: '' },
};
export const agentGuides = {
  scout: {
    action: 'browse',
    text: 'I can help you capture a reference. Browse a public website and pick an element, or use New capture for HTML, a screenshot, video or camera. Native device capture is in Labs → Device capture.',
  },
  atlas: {
    action: 'recommend',
    text: 'I can help you decide what belongs in your product. In Projects, connect a destination and describe its purpose. OpenAI can identify existing UI and possible missing features, then suggest supported components for review.',
  },
  forge: {
    action: 'build',
    text: 'I can help you define working behavior. Open a captured component in Editor, choose Build working feature, then review fields, validation and actions. Supported contracts generate UI and a backend together; unknown private logic needs your input.',
  },
  hue: {
    action: 'brand',
    text: 'I can help your component feel at home. Projects detects supported static branding. Review the detected values, choose light or dark appearance, or edit colors, typography, corners and logo in Branding.',
  },
  sentry: {
    action: 'test',
    text: 'I can run Playwright browser tests in the demo apps. Choose the testing workspace, define actions and visible outcomes, and review real step results and screenshots. Backend writes are disabled unless you enable them. I can also help you check the actual source. Review tools runs REA, Graphify, the Ponytail policy and Copy Polish. Installation includes source review and guarded undo. Static checks do not replace testing the destination.',
  },
  relay: {
    action: 'library',
    text: 'I can help you reuse a complete component. Save it to your Library, choose a destination screen and container in Projects, check fit, review the source and apply. Keep a Library backup before moving to another browser. Connections lets you create scoped, revocable MCP access for compatible local assistants. Share components explicitly, review their inbox results, then import and install through Projects. Remote assistants need a supported secure local bridge; localhost alone is not a cloud connection.',
  },
};
export const contextualAgent = (page) =>
  ({
    Home: 'scout',
    Workbench: 'forge',
    Browser: 'scout',
    'Native capture': 'scout',
    Clipboard: 'relay',
    'Component library': 'relay',
    Projects: 'atlas',
    'Project theme': 'hue',
    Agents: 'atlas',
    Engines: 'sentry',
    Connections: 'relay',
  })[page] || 'scout';
