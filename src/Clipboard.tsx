import { exportOriginal } from './library/export';
import { Search, Download, Trash2, Clipboard as ClipboardIcon, GripVertical } from 'lucide-react';
import { useState } from 'react';
import { loadItem } from './storage';
import { download, themes, type ComponentItem } from './model';
import { componentReadiness, matchesComponent } from './component-workflow.js';
import { FidelityBadge } from './FidelityCheck';
import { canExportCode, downloadCode } from './code-export';
import {
  LibraryFilters,
  ItemTags,
  OrganisePanel,
  noFilter,
  type LibraryFilter,
} from './LibraryOrganiser';
import { matchesLibrary, sortLibrary } from './library/organize.js';
import './fidelity.css';
export default function Clipboard({
  items,
  onOpen,
  onDelete,
  onIntegrate,
  onOrganise,
  onCapture,
  full = false,
}: {
  items: ComponentItem[];
  onOpen: (item: ComponentItem) => void;
  onDelete: (id: string) => void;
  onIntegrate?: (item: ComponentItem) => void;
  onCapture?: () => void;
  onOrganise?: (
    id: string,
    patch: { name: string; tags: string[]; collections: string[] },
  ) => boolean;
  full?: boolean;
}) {
  const [filter, setFilter] = useState<LibraryFilter>(noFilter);
  const [sort, setSort] = useState('newest');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editing, setEditing] = useState('');
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState('');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const activeFilters = Object.values(filter).filter(Boolean).length + (kind !== 'all' ? 1 : 0);
  const [limit, setLimit] = useState(24);
  // The compact clipboard keeps its plain name search; the full library adds tags, facets and sorting.
  const visible = full
    ? sortLibrary(
        items.filter(
          (i) => matchesComponent(i, '', kind) && matchesLibrary(i, { query, ...filter }),
        ),
        sort,
      )
    : items.filter((i) => matchesComponent(i, query, kind));
  const refine = (patch: Partial<LibraryFilter>) => {
    setFilter((current) => ({ ...current, ...patch }));
    setLimit(24);
  };
  const shown = full ? visible.slice(0, limit) : visible;
  return (
    <section className={'clipboard panel ' + (full ? 'full-library' : '')}>
      <div className="section-heading">
        <h2>Your Library</h2>
        <span className="muted">
          {items.length} component{items.length !== 1 ? 's' : ''}
        </span>
        {full && items.length > 0 && (
          <button
            onClick={() => {
              const link = document.createElement('a');
              link.href = '/api/library/export';
              link.download = 'reframe-library.json';
              link.click();
            }}
          >
            <Download size={15} />
            Back up
          </button>
        )}
      </div>
      {full && (
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Search Library"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(24);
            }}
            placeholder="Search names, sites, tags, fonts or colors"
          />
        </label>
      )}
      {full && items.length > 0 && (
        <>
          <div className="library-tools">
            <button
              aria-expanded={filtersOpen}
              aria-controls="library-facets"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              Filters &amp; sort{activeFilters ? ` · ${activeFilters} active` : ''}
            </button>
            {(activeFilters > 0 || query || sort !== 'newest') && (
              <button
                className="text-button"
                onClick={() => {
                  setFilter(noFilter);
                  setQuery('');
                  setKind('all');
                  setSort('newest');
                  setLimit(24);
                }}
              >
                Clear filters
              </button>
            )}
          </div>
          {!filtersOpen && activeFilters > 0 && (
            <p className="clipboard-result-count">
              {[
                kind !== 'all'
                  ? (
                      {
                        feature: 'UI + backend',
                        original: 'Interactive UI',
                        reference: 'Visual references',
                      } as Record<string, string>
                    )[kind]
                  : '',
                ...Object.entries(filter)
                  .filter(([, value]) => value)
                  .map(([key, value]) => `${key}: ${value}`),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          <div id="library-facets" hidden={!filtersOpen}>
            <div className="clipboard-filters" role="group" aria-label="Filter saved components">
              {[
                ['all', 'All'],
                ['feature', 'UI + backend'],
                ['original', 'Interactive UI'],
                ['reference', 'Visual references'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={kind === id}
                  onClick={() => {
                    setKind(id);
                    setLimit(24);
                  }}
                >
                  {label} · {items.filter((item) => matchesComponent(item, '', id)).length}
                </button>
              ))}
            </div>
            <LibraryFilters
              items={items}
              filter={filter}
              onFilter={(next) => {
                setFilter(next);
                setLimit(24);
              }}
              sort={sort}
              onSort={setSort}
            />
          </div>
        </>
      )}
      {full && (
        <p className="clipboard-result-count" role="status">
          Showing {shown.length.toLocaleString()} of {visible.length.toLocaleString()} matching
          component{visible.length !== 1 ? 's' : ''}
        </p>
      )}
      {exportError && (
        <p className="error-banner" role="alert">
          {exportError}
        </p>
      )}
      {!items.length ? (
        <div className="empty-library">
          <ClipboardIcon size={25} />
          <div>
            <strong>A home for your next good idea.</strong>
            <p>Capture a component, then save it here for your next project.</p>
            {onCapture && (
              <button className="primary" onClick={onCapture}>
                Capture your first component
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="clipboard-grid">
          {shown.map((item) => (
            <article
              key={item.id}
              className="clip-card"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-reframe', item.id);
                e.dataTransfer.setData('text/html', item.html);
                e.dataTransfer.effectAllowed = 'copy';
              }}
            >
              <div className="thumbnail">
                {item.thumbnail || item.referenceImage ? (
                  <img
                    className="library-thumbnail-image"
                    src={item.thumbnail || item.referenceImage}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="library-thumbnail-placeholder" aria-hidden="true">
                    <ClipboardIcon size={28} />
                    <span>{item.name}</span>
                  </div>
                )}
                <button
                  className="thumbnail-open"
                  onClick={() => onOpen(item)}
                  aria-label={`Open ${item.name}`}
                />
              </div>
              <div className="clip-title">
                <GripVertical size={14} />
                <button className="text-button" title={item.name} onClick={() => onOpen(item)}>
                  {item.name}
                </button>
              </div>
              <span className="component-status">{componentReadiness(item).label}</span>
              <FidelityBadge fidelity={item.fidelity} />
              {full && <ItemTags item={item} onFilter={refine} />}
              {full && (
                <details className="card-options">
                  <summary aria-label={`More options for ${item.name}`}>More options</summary>
                  {full &&
                    onOrganise &&
                    (editing === item.id ? (
                      <OrganisePanel
                        item={item}
                        items={items}
                        onSave={(patch) => onOrganise(item.id, patch)}
                        onClose={() => setEditing('')}
                      />
                    ) : (
                      <button
                        onClick={() => setEditing(item.id)}
                        aria-label={`Organise ${item.name}`}
                      >
                        Rename &amp; tag
                      </button>
                    ))}
                  {full && item.libraryId && (
                    <button
                      disabled={!!exporting}
                      onClick={async () => {
                        setExportError('');
                        setExporting(item.id);
                        try {
                          await exportOriginal(item, item.theme || themes[0]);
                        } catch (e) {
                          setExportError((e as Error).message);
                        } finally {
                          setExporting('');
                        }
                      }}
                    >
                      {exporting === item.id ? 'Preparing…' : 'Export all platforms'}
                    </button>
                  )}
                  {(item.feature || item.hasFeature) && (
                    <p className="clip-source">
                      Working feature · {item.feature?.spec.actions.length ?? item.actionsCount}{' '}
                      action
                      {(item.feature?.spec.actions.length ?? item.actionsCount) !== 1 ? 's' : ''} ·
                      frontend + backend
                    </p>
                  )}
                  {full && canExportCode(item) && (
                    <button
                      disabled={exporting === 'code:' + item.id}
                      onClick={async () => {
                        setExportError('');
                        setExporting('code:' + item.id);
                        try {
                          await downloadCode(item);
                        } catch (e) {
                          setExportError((e as Error).message);
                        } finally {
                          setExporting('');
                        }
                      }}
                    >
                      {exporting === 'code:' + item.id ? 'Preparing…' : 'Export code'}
                    </button>
                  )}
                  {full && (item.feature || item.hasFeature) && (
                    <button
                      onClick={async () => {
                        try {
                          const fullItem = await loadItem(item);
                          await download(
                            `${fullItem.feature!.spec.id}-feature.json`,
                            JSON.stringify({ version: 1, items: [fullItem] }, null, 2),
                            'application/json',
                          );
                        } catch (e) {
                          setExportError((e as Error).message);
                        }
                      }}
                    >
                      Export full feature
                    </button>
                  )}
                  {full && (
                    <p className="clip-source" title={item.source}>
                      {item.source}
                    </p>
                  )}
                  <button
                    className="icon-button"
                    aria-label={`Delete ${item.name}`}
                    onClick={() => onDelete(item.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </details>
              )}
              {full && onIntegrate && (
                <button
                  className="clip-handoff"
                  onClick={() => onIntegrate(item)}
                  aria-label={`Fit & install ${item.name}`}
                >
                  Fit &amp; install
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      {full && visible.length > shown.length && (
        <button className="clipboard-more" onClick={() => setLimit(limit + 24)}>
          Show more · {(visible.length - shown.length).toLocaleString()} remaining
        </button>
      )}
      {items.length > 0 && !visible.length && (
        <div className="empty-library">
          <p>No components match these filters{query ? ` and “${query}”` : ''}.</p>
        </div>
      )}
    </section>
  );
}
