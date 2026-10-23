import { zipSync, strToU8 } from 'fflate';
import { api, download, slug, type ComponentItem, type Fidelity } from './model';
import { loadItem } from './storage';

export interface ExportedCode {
  name: string;
  scope: string;
  files: Record<string, string>;
  fonts: Record<string, string>;
  fidelity: Fidelity | null;
  mode?: string;
  patterns?: string[];
  warnings?: string[];
  variants?: {
    width: number;
    state: string;
    score?: number;
    faithful?: number;
    regression?: number;
    warning: boolean;
    error?: string;
  }[];
  removedRules?: number;
}
export const canExportCode = (item: ComponentItem) =>
  !!(item.hasCode || item.feature?.spec.website?.pages[0]?.component);

// Export results depend only on the saved package, so they are reused until it is rebuilt.
const cache = new Map<string, Promise<ExportedCode>>();
export function exportedCode(
  item: ComponentItem,
  mode = 'faithful',
  names: Record<string, string> = {},
) {
  const key = `${item.id}:${item.feature?.builtAt || item.contentHash}:${item.name}:${mode}:${JSON.stringify(names)}`;
  let result = cache.get(key);
  if (!result) {
    result = loadItem(item).then((full) =>
      api<ExportedCode>('/api/export/code', { item: full, mode, names }),
    );
    if (cache.size >= 5) cache.delete(cache.keys().next().value!);
    result.catch(() => cache.delete(key));
    cache.set(key, result);
  }
  return result;
}

/** Downloads the React component, scoped stylesheet, static HTML, README and fonts as one ZIP. */
export async function downloadCode(
  item: ComponentItem,
  mode = 'faithful',
  names: Record<string, string> = {},
) {
  const code = await exportedCode(item, mode, names);
  const folder = code.name + '/';
  const entries: Record<string, Uint8Array> = {};
  for (const [file, text] of Object.entries(code.files)) entries[folder + file] = strToU8(text);
  for (const [file, base64] of Object.entries(code.fonts))
    entries[folder + file] = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const archive = zipSync(entries);
  await download(`${slug(item.name)}-code.zip`, archive.buffer as ArrayBuffer, 'application/zip');
  return code;
}
