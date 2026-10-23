import { useEffect, useState, useRef } from 'react';
import { ArrowRight, Search, Clipboard, Check, Download } from 'lucide-react';
import { catalog, libraryItem } from './library/catalog';
import { type ComponentItem, type Theme } from './model';
import { exportOriginal } from './library/export';
import Preview from './Preview';
import { componentReview, reviewDate } from './library/review.js';
export default function ComponentLibrary({
  theme,
  onOpen,
  onSave,
  onProjects,
}: {
  onProjects: () => void;
  theme: Theme;
  onOpen: (item: ComponentItem) => void;
  onSave: (item: ComponentItem) => boolean;
}) {
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState('All'),
    [selected, setSelected] = useState(catalog[0]),
    [saved, setSaved] = useState('');
  const [platform, setPlatform] = useState('react'),
    [source, setSource] = useState({ key: '', code: '' }),
    [error, setError] = useState(''),
    [exporting, setExporting] = useState(false),
    [limit, setLimit] = useState(12),
    [showSource, setShowSource] = useState(false);
  const detail = useRef<HTMLElement>(null),
    review = componentReview(selected);
  const sourceKey = JSON.stringify([selected.id, platform, theme]);
  useEffect(() => {
    if (!showSource) return;
    const controller = new AbortController();
    setError('');
    fetch('/api/library/source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: selected.id,
        name: 'ReframeOriginal',
        theme,
        framework: platform,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        return result;
      })
      .then((result) => {
        if (!controller.signal.aborted)
          setSource({ key: sourceKey, code: result.imports.join('\n') + '\n\n' + result.code });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [sourceKey, showSource]);
  const results = catalog.filter(
    (entry) =>
      (category === 'All' || entry.category === category) &&
      `${entry.name} ${entry.description} ${componentReview(entry).note}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <div className="originals-page">
      <div className="intro">
        <span className="eyebrow">REFRAME ORIGINALS · {catalog.length} COMPONENTS</span>
        <h2>Good pieces. Your signature.</h2>
        <p>Explore live patterns. Review their quality. Bring your own branding.</p>
        <p className="library-coverage">
          {catalog.length} original patterns in one library · Native runtime verification pending.
        </p>
        <button className="library-project-link" onClick={onProjects}>
          Find components for my project <ArrowRight size={15} />
        </button>
      </div>
      <div className="library-tools">
        <label className="library-search">
          <Search size={17} />
          <input
            aria-label="Search component library"
            type="search"
            placeholder="Find a component…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(12);
            }}
          />
        </label>
        <div className="library-filters">
          {['All', ...new Set(catalog.map((entry) => entry.category))].map((value) => (
            <button
              key={value}
              aria-pressed={category === value}
              onClick={() => {
                setCategory(value);
                setLimit(12);
              }}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <p className="library-result-count" role="status">
        {results.length} presets · Ratings are expert web reviews, not production certification.
      </p>
      <div className="library-workspace">
        <section className="library-grid" aria-label="Component catalog">
          {results.slice(0, limit).map((entry) => {
            const rating = componentReview(entry);
            return (
              <article
                className={`library-card ${entry.id === selected.id ? 'selected' : ''}`}
                key={entry.id}
              >
                <div className="library-sample">
                  <Preview item={libraryItem(entry)} theme={theme} mini />
                </div>
                <button
                  className="library-card-select"
                  aria-label={`Preview ${entry.name}`}
                  aria-pressed={entry.id === selected.id}
                  onClick={() => {
                    setSelected(entry);
                    setSaved('');
                    setError('');
                    if (window.matchMedia('(max-width:1100px)').matches) detail.current?.focus();
                  }}
                >
                  <span className="library-card-number">
                    {entry.category}
                    <span>{rating.score.toFixed(1)}/10</span>
                  </span>
                  <strong>{entry.name}</strong>
                  <span>{rating.note}</span>
                  <small>
                    {rating.level} <ArrowRight size={14} />
                  </small>
                </button>
              </article>
            );
          })}
          {!results.length && (
            <div>
              <p role="status">No components match.</p>
              <button
                onClick={() => {
                  setQuery('');
                  setCategory('All');
                }}
              >
                Clear filters
              </button>
            </div>
          )}
          {results.length > limit && (
            <button onClick={() => setLimit(limit + 24)}>
              Show more · {results.length - limit} remaining
            </button>
          )}
        </section>
        <aside
          className="panel library-detail"
          ref={detail}
          tabIndex={-1}
          aria-label="Selected component details"
        >
          <div className="section-heading">
            <h2>{selected.name}</h2>
            <span className="muted">Live web preview</span>
          </div>
          <div className="library-rating">
            <div>
              <strong>
                {review.score.toFixed(1)}
                <small>/ 10</small>
              </strong>
              <span>Expert review</span>
            </div>
            <dl>
              <div>
                <dt>Design</dt>
                <dd>{review.design.toFixed(1)}</dd>
              </div>
              <div>
                <dt>Code</dt>
                <dd>{review.code.toFixed(1)}</dd>
              </div>
            </dl>
            <span className="library-level">{review.level}</span>
          </div>
          <p className="library-review-note">{review.note}</p>
          <Preview key={selected.id} item={libraryItem(selected)} theme={theme} />
          <div className="library-platforms" role="group" aria-label="Source platform">
            {[
              ['react', 'React'],
              ['swiftui', 'iOS · SwiftUI'],
              ['compose', 'Android · Compose'],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={platform === value}
                onClick={() => {
                  setPlatform(value);
                  setShowSource(true);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {
            <details
              className="library-source"
              open={showSource}
              onToggle={(e) => setShowSource(e.currentTarget.open)}
            >
              <summary>
                {platform === 'react' ? 'React' : platform === 'swiftui' ? 'SwiftUI' : 'Compose'}{' '}
                source {platform !== 'react' && '· device testing pending'}
              </summary>
              <pre tabIndex={0}>
                {source.key === sourceKey
                  ? source.code
                  : error
                    ? 'Source unavailable. Choose a platform to retry.'
                    : 'Loading source…'}
              </pre>
            </details>
          }
          <div className="library-detail-actions">
            <button className="primary" onClick={() => onOpen({ ...libraryItem(selected), theme })}>
              Use in Studio <ArrowRight size={16} />
            </button>
            <button
              onClick={() => {
                if (onSave({ ...libraryItem(selected), theme })) setSaved(selected.id);
              }}
            >
              {saved === selected.id ? <Check size={16} /> : <Clipboard size={16} />}{' '}
              {saved === selected.id ? 'Saved to clipboard' : 'Save to clipboard'}
            </button>
            <button
              disabled={exporting}
              onClick={async () => {
                setExporting(true);
                setError('');
                try {
                  await exportOriginal(libraryItem(selected), theme);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setExporting(false);
                }
              }}
            >
              <Download size={15} />
              {exporting ? 'Preparing…' : 'Export all platforms'}
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
          {selected.requirements.length > 0 && (
            <ul className="library-requirements">
              {selected.requirements.map((requirement: string) => (
                <li key={requirement}>{requirement}</li>
              ))}
            </ul>
          )}
          <p className="muted">
            {review.scope} Reviewed {reviewDate}. Existing installed copies are unchanged until you
            reinstall or update their source.
          </p>
        </aside>
      </div>
    </div>
  );
}
