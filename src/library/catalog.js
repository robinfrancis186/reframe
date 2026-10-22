import inspiration from "./inspiration.json" with { type: "json" };
import { adapters, serviceRequirements } from "./adapters.js";
const originals = [
  ['tabs', 'Workspace tabs', 'Navigation', 'Keyboard-friendly panels with a roving tab stop.', 'LibraryTabs'],
  ['accordion', 'Help accordion', 'Content', 'Expandable answers using native disclosure controls.', 'LibraryAccordion'],
  ['switch', 'Preference switch', 'Inputs', 'A labeled switch with an announced on/off state.', 'LibrarySwitch'],
  ['dialog', 'Quick dialog', 'Overlays', 'A modal with focus handling, Escape and backdrop dismissal.', 'LibraryDialog'],
  ['toast', 'Status notice', 'Feedback', 'An announced, dismissible confirmation.', 'LibraryToast'],
  ['slider', 'Range control', 'Inputs', 'A keyboard-accessible slider with a live value.', 'LibrarySlider'],
  ['search', 'Searchable list', 'Navigation', 'Filter options instantly, select a result, and clear search.', 'LibrarySearch'],
  ['quantity', 'Quantity stepper', 'Inputs', 'Increment, decrement and enforce a minimum value.', 'LibraryQuantity'],
  ['steps', 'Onboarding steps', 'Navigation', 'Move forward and back through a short guided flow.', 'LibrarySteps'],
  ['menu', 'Action menu', 'Overlays', 'A compact disclosure menu with a selected action.', 'LibraryMenu'],
  ['copy', 'Copy field', 'Feedback', 'Copy a value with a clear success or permission error.', 'LibraryCopy'],
  ['brand', 'Brand card', 'Content', 'Your name, tagline and logo with an expandable introduction.', 'LibraryBrand'],
].map(([id, name, category, description, component]) => ({ id, name, category, description, component }));
const originalKinds = {tabs:'tabs',accordion:'accordion',switch:'switch',dialog:'overlay',toast:'notice',slider:'slider',search:'search',quantity:'quantity',steps:'steps',menu:'menu',copy:'copy',brand:'brand'};
const reused = {tabs:'tabs',switch:'switch','bouncy-accordion':'accordion','range-slider':'slider','adaptive-stepper':'quantity','morphing-search':'search'};
const families = inspiration.families.map(family => {
  const [component,kind] = family.section === 'charts' ? ['LibraryChart','chart'] : family.section === 'agents' ? ['LibraryAgent','agent'] : adapters[family.slug] || [];
  if (!component) throw new Error('Missing original adapter: ' + family.slug);
  const original = originals.find(item => item.id === reused[family.slug]);
  return {...(original || {}), id:original?.id || 'be-' + family.slug, name:original?.name || family.name, category:original?.category || (family.section === 'charts' ? 'Charts' : family.section === 'agents' ? 'AI interfaces' : family.section === 'blocks' ? 'Layouts' : ['input','select','choices','picker','dates','colors','quantity','slider'].includes(kind) ? 'Inputs' : ['overlay','tooltip'].includes(kind) ? 'Overlays' : ['navigation','tabs','breadcrumb','files'].includes(kind) ? 'Navigation' : 'Content'), description:original?.description || `Original ${family.name.toLowerCase()} pattern with local interaction state.`, component, nativeKind:kind, props:{variant:family.slug}, reference:family.reference, requirements:serviceRequirements[family.slug] || (family.section === 'agents' ? ['Supply your own live content or AI provider. Local drafts, decisions and supplied-content demonstrations do not call a model.'] : [])};
});
export const catalog = [...originals.map(entry => families.find(f=>f.id===entry.id) || {...entry,nativeKind:originalKinds[entry.id],props:{variant:entry.id},reference:"",requirements:[]}), ...families.filter(entry => !originals.some(item=>item.id===entry.id))];
export const coverage = {checkedAt:inspiration.checkedAt, families:inspiration.families.length, entries:catalog.length};
export const libraryEntry = id => catalog.find(item => item.id === id);
export function libraryItem(entry) {
  return { id: 'library-' + entry.id, libraryId: entry.id, name: entry.name, kind: 'section', html: `<section><h2>${entry.name}</h2><p>${entry.description}</p></section>`, source: 'Reframe Originals · authored in-house', capturedAt: new Date().toISOString(), evidence: 'Original UI pattern with React, SwiftUI and Android Compose source and local interaction logic. Service requirements are shown in the library. Exports and installation regenerate trusted source; HTML is a static fallback.' };
}
export {libraryCSS,extendedCSS,libraryStyles} from './styles.js';
