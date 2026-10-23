import { useEffect, useRef, useState } from 'react';
import { isItem, isTheme, themes, type ComponentItem, type Theme } from './model';
import { onLibraryChange, readWorkspace, writeWorkspace, summary } from './storage';

function initialWorkspace(): { items: ComponentItem[]; theme: Theme; error?: string } {
  try {
    const raw = readWorkspace();
    if (!raw) return { items: [], theme: themes[0] };
    const state = JSON.parse(raw);
    if (!Array.isArray(state.items) || !state.items.every(isItem) || !isTheme(state.theme))
      throw Error('Unreadable workspace');
    return state;
  } catch {
    return {
      items: [],
      theme: themes[0],
      error:
        'Saved workspace could not be read. It has not been overwritten. Recover a backup before saving.',
    };
  }
}

/** Owns the lightweight Library index; package data stays in the bounded storage cache. */
export function useLibrary(notify: (text: string) => void, onError: (text: string) => void) {
  const [initial] = useState(initialWorkspace),
    [library, setLibrary] = useState(initial.items);
  const [deleted, setDeleted] = useState<ComponentItem | null>(null);
  const previousCount = useRef(library.length);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  useEffect(
    () =>
      onLibraryChange((raw) => {
        try {
          const state = JSON.parse(raw);
          if (!Array.isArray(state.items) || !state.items.every(isItem)) return;
          const added = state.items.length - previousCount.current;
          previousCount.current = state.items.length;
          setLibrary(state.items);
          if (added > 0)
            notifyRef.current(
              added === 1
                ? `Added "${state.items[0].name}" to your Library.`
                : `Added ${added} components to your Library.`,
            );
        } catch {
          /* Invalid updates never replace the current view. */
        }
      }),
    [],
  );
  function persist(items: ComponentItem[], theme: Theme) {
    if (initial.error) {
      onError(initial.error);
      return false;
    }
    try {
      writeWorkspace(
        JSON.stringify({ version: 1, items, theme }, function (key, value) {
          if (key === 'files' && this.spec?.website)
            return {
              ...value,
              'feature.json': JSON.stringify({
                ...this.spec,
                website: 'Recompiled from spec.website when installed.',
              }),
            };
          return value;
        }),
      );
      previousCount.current = items.length;
      setLibrary(items.map(summary));
      return true;
    } catch (e) {
      onError((e as Error).message);
      return false;
    }
  }
  return { initial, library, setLibrary, deleted, setDeleted, persist };
}
