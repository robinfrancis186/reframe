import type { Browser } from 'playwright';
import type { ComponentItem, Theme } from '../src/model.ts';
export interface PublicResource {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}
export type Resource = (
  url: string,
  headers?: Record<string, string>,
  options?: { method?: string; body?: Buffer },
) => Promise<PublicResource>;
export interface BrowserHost {
  start(): Promise<void>;
  browser: Browser;
}
export interface RenderingOptions {
  browser?: BrowserHost;
  resource?: Resource;
  state?: string;
  diff?: boolean;
}
export type LibraryMetadata = Pick<
  Partial<ComponentItem>,
  'name' | 'tags' | 'collections' | 'theme'
>;
export interface SaveItem {
  item?: ComponentItem;
  id?: string;
  baseRevision: number;
  metadata?: LibraryMetadata;
  operationId?: string;
}
export interface LibraryManifest {
  version: 2;
  revision: number;
  savedAt: string | null;
  theme: Theme | null;
  items: LibraryEntry[];
}
export interface LibraryEntry extends LibraryMetadata {
  id: string;
  name: string;
  source: string;
  body: string;
  assets: string;
  fontHashes: string[];
  reference: string | null;
  itemRevision: number;
  match: string;
  operationId?: string;
}
export interface ExportOptions extends RenderingOptions {
  mode?: 'faithful' | 'clean';
  names?: Record<string, string>;
}
