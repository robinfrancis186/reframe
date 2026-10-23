import { useState, useEffect, useRef } from 'react';
import { starters, type Theme } from './model';
import { canExportCode, exportedCode, type ExportedCode } from './code-export';
import { documentHtml, reactCode } from './export';

/** Active capture/editor state is independent of the Library index and navigation shell. */
export function useCaptureWorkflow(theme: Theme, setError: (text: string) => void) {
  const [elements, setElements] = useState(starters);
  const [active, setActive] = useState(starters[0]);
  const [mobile, setMobile] = useState(false);
  const [view, setView] = useState('preview');
  const [format, setFormat] = useState('html');
  const [picking, setPicking] = useState(false);
  const [building, setBuilding] = useState(false);
  const featureBuilder = useRef<HTMLDivElement>(null),
    workingPreview = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (building) {
      featureBuilder.current?.focus({ preventScroll: true });
      featureBuilder.current?.scrollIntoView({
        block: 'start',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    }
  }, [building]);
  const [dragging, setDragging] = useState(false);
  const [editor, setEditor] = useState('');
  const [quality, setQuality] = useState<{
    bytes: number;
    elements: number;
    issues: string[];
  } | null>(null);
  const [originalSource, setOriginalSource] = useState({ key: '', code: '' });
  const sourceKey = JSON.stringify([active.libraryId, theme, format]);
  useEffect(() => {
    if (!active.libraryId) return;
    const controller = new AbortController();
    fetch('/api/library/source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: active.libraryId,
        name: 'ReframeOriginal',
        theme,
        framework: format === 'swiftui' || format === 'compose' ? format : 'react',
      }),
      signal: controller.signal,
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        return data;
      })
      .then((data) => {
        if (!controller.signal.aborted)
          setOriginalSource({ key: sourceKey, code: data.imports.join('\n') + '\n' + data.code });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [sourceKey]);
  // Website captures export as real source (React component, scoped CSS, static HTML), generated on the server.
  const exportable = canExportCode(active);
  const [exportMode, setExportMode] = useState('faithful');
  const [exportNames, setExportNames] = useState<Record<string, string>>({});
  const [exportProposal, setExportProposal] = useState<{
    reason: string;
    names: Record<string, string>;
  } | null>(null);
  const [assisting, setAssisting] = useState(false);
  const [assistKey, setAssistKey] = useState('');
  useEffect(() => {
    setExportNames({});
    setExportProposal(null);
  }, [active.id, active.feature?.builtAt]);
  const [exported, setExported] = useState<{
    key: string;
    code?: ExportedCode;
    error?: string;
  } | null>(null);
  const exportKey = JSON.stringify([
    active.id,
    active.contentHash,
    active.feature?.builtAt,
    active.name,
    exportMode,
    exportNames,
  ]);
  useEffect(() => {
    if (!exportable || view !== 'code' || exported?.key === exportKey) return;
    let current = true;
    exportedCode(active, exportMode, exportNames).then(
      (code) => {
        if (current) setExported({ key: exportKey, code });
      },
      (e) => {
        if (current) setExported({ key: exportKey, error: (e as Error).message });
      },
    );
    return () => {
      current = false;
    };
  }, [exportKey, exportable, view]);
  const exportedFiles = exported?.key === exportKey ? exported.code : undefined;
  const code = active.libraryId
    ? originalSource.key === sourceKey
      ? originalSource.code
      : ''
    : exportable
      ? exportedFiles
        ? exportedFiles.files[
            `${exportedFiles.name}.${format === 'react' ? 'tsx' : format === 'css' ? 'css' : 'html'}`
          ] || ''
        : ''
      : format === 'react'
        ? reactCode(active, theme)
        : documentHtml(active, theme);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/quality', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: active.html }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then(setQuality)
      .catch(() => {});
    return () => controller.abort();
  }, [active.html]);
  return {
    elements,
    setElements,
    active,
    setActive,
    mobile,
    setMobile,
    view,
    setView,
    format,
    setFormat,
    picking,
    setPicking,
    building,
    setBuilding,
    featureBuilder,
    workingPreview,
    dragging,
    setDragging,
    editor,
    setEditor,
    quality,
    exportable,
    exportMode,
    setExportMode,
    exportNames,
    setExportNames,
    exportProposal,
    setExportProposal,
    assisting,
    setAssisting,
    assistKey,
    setAssistKey,
    exported,
    exportedFiles,
    exportKey,
    code,
  };
}
