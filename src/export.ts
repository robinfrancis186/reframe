import type { ComponentItem, Theme } from "./model";
export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function componentCss(theme: Theme) {
  return `.rf-component{--primary:${theme.primary};--surface:${theme.background};--ink:${theme.text};--radius:${theme.radius}px;color:var(--ink);font-family:${theme.font};font-size:15px;line-height:1.55;width:100%;overflow-wrap:anywhere}.rf-component *{box-sizing:border-box}.rf-component h1,.rf-component h2,.rf-component h3{line-height:1.17;letter-spacing:-.035em;margin:0 0 14px}.rf-component h1{font-size:34px}.rf-component h2{font-size:27px}.rf-component h3{font-size:17px}.rf-component p{margin:0 0 20px}.rf-component small{font-size:10px;letter-spacing:.15em;font-weight:600;display:block;margin-bottom:12px}.rf-component a{color:var(--primary);text-decoration:underline;text-underline-offset:3px}.rf-component button{background:var(--primary);color:${contrastText(theme.primary)};border:0;border-radius:var(--radius);padding:13px 20px;font:600 14px ${theme.font};cursor:pointer}.rf-component button:focus-visible,.rf-component a:focus-visible{outline:3px solid var(--primary);outline-offset:3px}.rf-component input,.rf-component select,.rf-component textarea{font:inherit;max-width:100%;padding:10px;border:1px solid #8992a5;border-radius:var(--radius);background:var(--surface);color:var(--ink)}.rf-component label{display:block;margin:12px 0 5px}.rf-component img{max-width:100%;height:auto}.rf-component hr{border:0;border-top:1px solid #8992a533;margin:20px 0}.rf-component table{width:100%;border-collapse:collapse}.rf-component th,.rf-component td{padding:8px;border-bottom:1px solid #8992a544;text-align:left}.rf-component pre{overflow:auto;white-space:pre-wrap}.rf-component>section,.rf-component>article,.rf-component>div,.rf-component>header,.rf-component>footer,.rf-component>main,.rf-component>nav{background:var(--surface);padding:28px;border-radius:var(--radius);border:1px solid #8992a52b}.rf-component .pricing{max-width:310px;margin:auto;padding:28px}.rf-component .pricing p:not(.price){font-size:13px;opacity:.65}.rf-component .price{margin:18px 0 8px}.rf-component .price strong{font-size:36px;letter-spacing:-.05em}.rf-component .price span{font-size:13px;opacity:.6}.rf-component .pricing ul{padding:0;list-style:none;margin:0 0 24px}.rf-component .pricing li{font-size:12px;margin:12px 0}.rf-component .pricing li:before{content:'✓';color:var(--primary);margin-right:12px;font-weight:bold}.rf-component .pricing button{width:100%}.rf-component .navigation{display:flex;align-items:center;gap:20px;padding:18px;flex-wrap:wrap}.rf-component .navigation strong{margin-right:auto}.rf-component .navigation a{font-size:12px;text-decoration:none;color:inherit}.rf-component .features{text-align:center}.rf-component .features small{color:var(--primary)}.rf-component .feature-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:30px;text-align:left}.rf-component .feature-grid p{font-size:12px;opacity:.7}.rf-component .feature-icon{display:inline-grid;place-items:center;color:var(--primary);border:1px solid var(--primary);border-radius:5px;width:28px;height:28px;margin-bottom:15px}.rf-component .pricing h1{font-size:32px;line-height:1.12;margin-bottom:12px}.rf-component .pricing p:not(.price){margin-bottom:0}.rf-component .pricing hr{margin:16px 0}.rf-component .pricing li{margin:9px 0}@media(max-width:430px){.rf-component h1{font-size:28px}.rf-component .feature-grid{grid-template-columns:1fr}.rf-component .navigation{gap:14px}.rf-component>section{padding:20px}}`;
}
function contrastText(hex: string) {
  const values = hex
    .slice(1)
    .match(/../g)!
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722 > 0.179
    ? "#101522"
    : "#ffffff";
}
export function documentHtml(
  item: ComponentItem,
  theme: Theme,
  preview = false,
) {
  const site=item.feature?.spec.website;
  if(site){const page=site.pages[0];return `<!doctype html><html lang="en" class="${escapeHtml(page.htmlClass||'')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: http: data:; font-src https: data:; form-action 'none'; base-uri 'none'"><title>${escapeHtml(item.name)}</title><style>${site.css.replace(/<\/style/gi,'')}body{margin:0;${page.component?'padding:16px;':''}${(page.rootStyle||'').replace(/[<>]/g,'')}}</style></head><body>${page.html}</body></html>`;}
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${preview ? "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'\">" : ""}<title>${escapeHtml(item.name)}</title><style>${preview ? "html,body{box-sizing:border-box;margin:0;min-height:100%;background:transparent}body{padding:20px;display:grid;align-items:center;min-height:100vh}" : ""}${componentCss(theme)}</style></head><body>\n<!-- Source: ${escapeHtml(item.source).replace(/--/g, "")} | ${escapeHtml(item.evidence).replace(/--/g, "")} -->\n<div class="rf-component">${item.html}</div>\n</body></html>`;
}
export function reactCode(item: ComponentItem, theme: Theme) {
  if(item.feature?.spec.website)return '// Install the UI + backend package through Projects; this component uses its bundled local website API.\n'+item.feature.files['Component.tsx'];
  const doc = new DOMParser().parseFromString(item.html, "text/html");
  const voids = new Set(["input", "img", "br", "hr"]);
  const jsx = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE)
      return node.textContent?.trim()
        ? `{${JSON.stringify(node.textContent)}}`
        : "";
    if (!(node instanceof Element)) return "";
    const tag = node.tagName.toLowerCase();
    const attrs = Array.from(node.attributes)
      .map(
        (a) =>
          `${a.name === "class" ? "className" : a.name === "for" ? "htmlFor" : a.name === "tabindex" ? "tabIndex" : a.name === "readonly" ? "readOnly" : a.name}={${a.name === "open" ? "true" : JSON.stringify(a.value)}}`,
      )
      .join(" ");
    return `<${tag}${attrs ? " " + attrs : ""}${voids.has(tag) ? " />" : `>${Array.from(node.childNodes).map(jsx).join("")}</${tag}>`}`;
  };
  return `// Source: ${item.source.replace(/[\r\n]/g, " ")}\n// ${item.evidence.replace(/[\r\n]/g, " ")}\n// Connect actions and routes in your app; styles are scoped to .rf-component.\nexport default function CapturedComponent() {\n  return (\n    <div className="rf-component">\n      <style>{${JSON.stringify(componentCss(theme))}}</style>\n      ${Array.from(doc.body.childNodes).map(jsx).join("\n      ")}\n    </div>\n  );\n}\n`;
}
