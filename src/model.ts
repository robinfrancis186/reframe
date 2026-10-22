import { safeFont, validBrand } from "./branding.js";
import { libraryEntry } from "./library/catalog.js";
export interface ProductCatalog {
  product:{id:string;name:string;description:string;currency:string;details:string[];notice:string};
  variants:{id:string;name:string;options?:Record<string,string>;priceCents:number;initialStock:number}[];
}
export interface FeatureSpec {
  website?: {version:number;css:string;pages:{url:string;title:string;html:string;rootStyle:string;htmlClass:string;height:number;component:boolean;backdrop?:string;viewport?:number;rem?:number}[];attachments:{name:string;type:string;base64:string}[];warnings:string[]};
  commerce?:ProductCatalog;
  version: number; id: string; name: string; authRequired?: boolean;
  fields: { id: string; label: string; type: string; required: boolean }[];
  actions: { id: string; label: string; operation: string; target: string; message: string; reason?: string; connection?: { url:string; method:string; auth:string; keyName:string; inputMap:Record<string,string> } }[];
}
export interface FeaturePackage {
  version: number; spec: FeatureSpec; sourceHash: string; files: Record<string, string>;
  bytes: number; builtAt: string; requirements: string[];
  review?: EngineReview;
}
export interface EngineReview {
  checkedAt: string; sourceDigest: string;
  analysis: { status: string; engine: string; files: string[]; evidenceId: string; nodes: number; unknowns: number | null; limitations: string[]; limitation: string };
  policy: { status: string; policySha256: string; bytes: number; dependencies: string[]; addedDependencies: string[]; files: string[]; checks: string[]; limitation: string };
  copy: { engine: string; edits: number; suggestions: { before: string; after: string }[]; comments: { file: string; edits: number }[]; limitation: string };
}
export interface ComponentItem {
  id: string;
  name: string;
  html: string;
  source: string;
  kind: string;
  capturedAt: string;
  evidence: string;
  theme?: Theme;
  referenceImage?: string;
  feature?: FeaturePackage;
  libraryId?: string;
  fidelity?: Fidelity;
}
/** How closely a saved replica matches the reference image taken when it was picked. */
export interface Fidelity {
  score: number; grade: string; fitted: boolean; differing: number; checkedAt: string;
  reference: { width: number; height: number }; rendered: { width: number; height: number };
}
export const isFidelity = (f: unknown): f is Fidelity => { const v = f as Fidelity; return !!v && Number.isFinite(v.score) && v.score >= 0 && v.score <= 100 && typeof v.grade === "string" && v.grade.length <= 60 && typeof v.checkedAt === "string"; };
export interface Theme {
  name: string;
  primary: string;
  background: string;
  text: string;
  radius: number;
  font: string;
  brandName?: string;
  tagline?: string;
  logo?: string;
}
export const themes: Theme[] = [
  {
    name: "Studio violet",
    primary: "#6956e8",
    background: "#ffffff",
    text: "#161a27",
    radius: 8,
    font: "Inter, system-ui, sans-serif",
  },
  {
    name: "Warm orange",
    primary: "#c44b18",
    background: "#fffdf9",
    text: "#28201b",
    radius: 12,
    font: "Georgia, serif",
  },
  {
    name: "Forest",
    primary: "#247457",
    background: "#ffffff",
    text: "#172d25",
    radius: 4,
    font: "Inter, system-ui, sans-serif",
  },
  {
    name: "Midnight",
    primary: "#8dacf7",
    background: "#181c29",
    text: "#f4f6fc",
    radius: 12,
    font: "Inter, system-ui, sans-serif",
  },
];
const seed = (
  id: string,
  name: string,
  kind: string,
  html: string,
): ComponentItem => ({
  id,
  name,
  kind,
  html,
  source: "Reframe starter • original example",
  capturedAt: new Date(0).toISOString(),
  evidence:
    "Original starter component. Buttons need your application handlers.",
});
export const starters: ComponentItem[] = [
  seed(
    "starter-pricing",
    "Pricing card",
    "article",
    `<article class="pricing"><small>PRO</small><h1>A little more<br>possibility.</h1><p>Everything you need to build, faster.</p><p class="price"><strong>$24</strong> <span>/ month</span></p><hr><ul><li>Unlimited projects</li><li>Advanced components</li><li>Priority support</li></ul><button type="button">Get started</button></article>`,
  ),
  seed(
    "starter-navigation",
    "Navigation",
    "nav",
    `<nav class="navigation"><strong>◈ Acme</strong><a href="#product">Product</a><a href="#solutions">Solutions</a><a href="#pricing">Pricing</a><button type="button">Get started</button></nav>`,
  ),
  seed(
    "starter-features",
    "Feature section",
    "section",
    `<section class="features"><small>FEATURES</small><h1>Built for what's next.</h1><div class="feature-grid"><article><span class="feature-icon">↗</span><h3>Faster builds</h3><p>Go from idea to interface in minutes.</p></article><article><span class="feature-icon">◇</span><h3>Fully customizable</h3><p>Make it yours with simple controls.</p></article><article><span class="feature-icon">✓</span><h3>Made to adapt</h3><p>Thoughtful, readable code. Yours to build on.</p></article></div></section>`,
  ),
];
export function isTheme(value: unknown): value is Theme {
  const t = value as Theme;
  return (
    !!t &&
    typeof t.name === "string" &&
    t.name.length <= 100 &&
    [t.primary, t.background, t.text].every(
      (x) => typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x),
    ) &&
    Number.isFinite(t.radius) &&
    t.radius >= 0 &&
    t.radius <= 32 &&
    safeFont(t.font) && validBrand(t)
  );
}
export function isItem(value: unknown): value is ComponentItem {
  const i = value as ComponentItem;
  return (
    !!i &&
    ["id", "name", "html", "source", "kind", "capturedAt", "evidence"].every(
      (key) => typeof i[key as keyof ComponentItem] === "string",
    ) &&
    i.html.length < 2_000_000 &&
    (!i.feature || isFeature(i.feature)) &&
    (i.libraryId === undefined || typeof i.libraryId === "string" && !!libraryEntry(i.libraryId) && !i.feature) &&
    i.name.length <= 200 &&
    (!i.theme || isTheme(i.theme)) &&
    (!i.fidelity || isFidelity(i.fidelity)) &&
    (!i.referenceImage || (typeof i.referenceImage === "string" && i.referenceImage.length <= 2_000_000 && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(i.referenceImage)))
  );
}
export function isFeature(value: unknown): value is FeaturePackage {
  const p = value as FeaturePackage;
  return !!p && p.version === 1 && typeof p.sourceHash === 'string' && /^[a-f0-9]{64}$/.test(p.sourceHash) && !!p.spec && /^rf_[a-f0-9]{12}$/.test(p.spec.id) && typeof p.spec.name === 'string' && Array.isArray(p.spec.fields) && p.spec.fields.length <= 30 && Array.isArray(p.spec.actions) && p.spec.actions.length <= 30 && (!p.spec.website || p.spec.website.version===1 && Array.isArray(p.spec.website.pages) && p.spec.website.pages.length>0 && p.spec.website.pages.length<=8 && p.spec.website.pages.every(page=>typeof page.html==='string'&&page.html.length<1500000&&typeof page.url==='string'&&typeof page.title==='string') && typeof p.spec.website.css==='string' && p.spec.website.css.length<500000 && JSON.stringify(p.spec.website).length<6000000) && !!p.files && Object.keys(p.files).length <= 12 && Object.entries(p.files).every(([name,v]) => typeof v === 'string' && v.length <= (p.spec.website&&name==='feature.json'?6100000:200000)) && typeof p.bytes === 'number' && typeof p.builtAt === 'string' && Array.isArray(p.requirements) && p.requirements.every(r => typeof r === 'string');
}
export async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(
    url,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}
export function download(name: string, content: string | ArrayBuffer, type = "text/plain") {
  void (async()=>{
    const bytes=new Uint8Array(await new Blob([content],{type}).arrayBuffer());
    if(bytes.length>6000000)throw new Error('Export exceeds 6 MB. Export individual components instead.');
    let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    const {url}=await api<{url:string}>('/api/downloads',{name,type,base64:btoa(binary)});
    const a=document.createElement('a');a.href=url;a.download=name;a.hidden=true;document.body.append(a);a.click();a.remove();
  })().catch(error=>window.dispatchEvent(new CustomEvent('reframe-download-error',{detail:(error as Error).message})));
}
export function slug(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "component"
  );
}
