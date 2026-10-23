import { lazy, Suspense, useMemo, useEffect, useRef } from 'react';
import { documentHtml } from './export';
import type { ComponentItem, Theme } from './model';
const OriginalPreview = lazy(() => import('./OriginalPreview'));
export default function Preview(props: {
  item: ComponentItem;
  theme: Theme;
  mini?: boolean;
  onPick?: (html: string) => void;
}) {
  return props.item.libraryId ? (
    <Suspense fallback={<p role="status">Loading interactive preview…</p>}>
      <OriginalPreview {...props} />
    </Suspense>
  ) : (
    <HtmlPreview {...props} />
  );
}
function HtmlPreview({
  item,
  theme,
  mini = false,
  onPick,
}: {
  item: ComponentItem;
  theme: Theme;
  mini?: boolean;
  onPick?: (html: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const source = useMemo(() => documentHtml(item, theme, true), [item, theme]);
  function bind() {
    const doc = frame.current?.contentDocument;
    if (!doc?.head) return;
    doc.onsubmit = (event) => event.preventDefault();
    doc.onclick = (event) => {
      const target = event.target as Element | null;
      if (onPick || target?.closest('a,button[type=submit]')) event.preventDefault();
      if (onPick && target?.closest) {
        const el = target.closest('article,section,nav,button,h1,h2,h3,p,ul,form,div');
        if (el && !el.classList.contains('rf-component')) onPick(el.outerHTML);
      }
    };
    let style = doc.getElementById('picker-style');
    if (!style) {
      style = doc.createElement('style');
      style.id = 'picker-style';
      doc.head.append(style);
    }
    style.textContent = onPick
      ? '.rf-component *:hover{outline:2px solid #3159e8;outline-offset:2px;cursor:crosshair}'
      : '';
  }
  useEffect(bind, [onPick, source]);
  return (
    <iframe
      ref={frame}
      className={mini ? 'preview-frame mini' : 'preview-frame'}
      title={`${mini ? 'Thumbnail' : 'Component preview'}: ${item.name}`}
      srcDoc={source}
      sandbox="allow-same-origin"
      tabIndex={mini ? -1 : 0}
      aria-hidden={mini || undefined}
      inert={mini || undefined}
      onLoad={bind}
    />
  );
}
