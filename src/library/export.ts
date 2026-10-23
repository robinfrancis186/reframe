import { zipSync, strToU8 } from 'fflate';
import { api, download, slug, type ComponentItem, type Theme } from '../model';
export async function exportOriginal(item: ComponentItem, theme: Theme) {
  if (!item.libraryId) throw new Error('Choose an original library component.');
  const bundle = await api<{ files: Record<string, string> }>('/api/library/package', {
    id: item.libraryId,
    theme,
  });
  const archive = zipSync(
    Object.fromEntries(
      Object.entries(bundle.files).map(([file, source]) => [file, strToU8(source)]),
    ),
  );
  download(
    `${slug(item.name)}-all-platforms.zip`,
    archive.buffer as ArrayBuffer,
    'application/zip',
  );
}
