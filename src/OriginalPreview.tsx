import * as Expanded from './library/Expanded';
import * as Originals from './library/Components.jsx';
import { libraryEntry, libraryStyles } from './library/catalog';
import { themeStyle } from './branding.js';
import type { CSSProperties, ComponentType } from 'react';
import type { ComponentItem, Theme } from './model';
export default function OriginalPreview(props: {
  item: ComponentItem;
  theme: Theme;
  mini?: boolean;
}) {
  const entry = libraryEntry(props.item.libraryId);
  if (!entry) return null;
  const implementations = { ...Originals, ...Expanded };
  const Component = implementations[
    entry.component as keyof typeof implementations
  ] as ComponentType<{
    variant?: string;
    brandName?: string;
    tagline?: string;
    logo?: string;
    previewOnly?: boolean;
  }>;
  return (
    <div
      className={props.mini ? 'library-preview mini' : 'library-preview'}
      inert={props.mini || undefined}
      aria-hidden={props.mini || undefined}
    >
      <div className="rf-library" style={themeStyle(props.theme) as CSSProperties}>
        <style>{libraryStyles(entry)}</style>
        <Component
          {...entry.props}
          previewOnly={props.mini}
          brandName={props.theme.brandName}
          tagline={props.theme.tagline}
          logo={props.theme.logo}
        />
      </div>
    </div>
  );
}
