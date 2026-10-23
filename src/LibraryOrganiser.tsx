import { useId, useMemo, useState } from 'react';
import { X, FolderPlus, Tag, Check } from 'lucide-react';
import {
  SORTS,
  autoTags,
  facets,
  normalizeCollection,
  normalizeTag,
  addCollection,
  withTags,
} from './library/organize.js';
import type { ComponentItem } from './model';
import './organiser.css';

export interface LibraryFilter {
  type: string;
  site: string;
  collection: string;
  tag: string;
}
export const noFilter: LibraryFilter = { type: '', site: '', collection: '', tag: '' };

/** Type, site, collection and tag filters with counts, plus sorting. */
export function LibraryFilters({
  items,
  filter,
  onFilter,
  sort,
  onSort,
}: {
  items: ComponentItem[];
  filter: LibraryFilter;
  onFilter: (filter: LibraryFilter) => void;
  sort: string;
  onSort: (sort: string) => void;
}) {
  const counts = useMemo(() => facets(items), [items]);
  const select = (key: keyof LibraryFilter, label: string, values: [string, number][]) =>
    values.length > 0 && (
      <label>
        {label}
        <select
          value={filter[key]}
          onChange={(e) => onFilter({ ...filter, [key]: e.target.value })}
        >
          <option value="">All</option>
          {values.map(([value, count]) => (
            <option key={value} value={value}>
              {value} · {count}
            </option>
          ))}
        </select>
      </label>
    );
  const active = Object.values(filter).some(Boolean);
  return (
    <div className="library-filters">
      {select('type', 'Type', counts.types)}
      {select('site', 'Site', counts.sites)}
      {select('collection', 'Collection', counts.collections)}
      {select('tag', 'Tag', counts.tags)}
      <label>
        Sort
        <select value={sort} onChange={(e) => onSort(e.target.value)}>
          {SORTS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {active && (
        <button className="text-button" onClick={() => onFilter(noFilter)}>
          <X size={14} />
          Clear filters
        </button>
      )}
    </div>
  );
}

/** The automatic and user tags shown on a card; user tags and collections filter the library when clicked. */
export function ItemTags({
  item,
  onFilter,
}: {
  item: ComponentItem;
  onFilter: (patch: Partial<LibraryFilter>) => void;
}) {
  const auto = autoTags(item);
  return (
    <ul className="item-tags" aria-label={`Tags for ${item.name}`}>
      <li>
        <button className="auto" onClick={() => onFilter({ type: auto.type })}>
          {auto.type}
        </button>
      </li>
      <li>
        <button className="auto" onClick={() => onFilter({ site: auto.site })}>
          {auto.site}
        </button>
      </li>
      {(item.collections || []).map((name) => (
        <li key={'c' + name}>
          <button className="collection" onClick={() => onFilter({ collection: name })}>
            {name}
          </button>
        </li>
      ))}
      {(item.tags || []).map((tag) => (
        <li key={'t' + tag}>
          <button onClick={() => onFilter({ tag })}>#{tag}</button>
        </li>
      ))}
      {auto.colors.map((hex: string) => (
        <li key={hex} className="swatch" title={hex} style={{ background: hex }} />
      ))}
    </ul>
  );
}

/** Rename, tag and add to collections. Suggestions come from tags and collections already in the library. */
export function OrganisePanel({
  item,
  items,
  onSave,
  onClose,
}: {
  item: ComponentItem;
  items: ComponentItem[];
  onSave: (patch: { name: string; tags: string[]; collections: string[] }) => boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [tags, setTags] = useState(item.tags || []);
  const [collections, setCollections] = useState(item.collections || []);
  const [tag, setTag] = useState('');
  const [collection, setCollection] = useState('');
  const ids = { tags: useId(), collections: useId() };
  const known = useMemo(() => facets(items), [items]);
  const auto = autoTags(item);
  const dirty =
    name.trim() !== item.name ||
    JSON.stringify(tags) !== JSON.stringify(item.tags || []) ||
    JSON.stringify(collections) !== JSON.stringify(item.collections || []);
  function addTag() {
    setTags((list) => withTags(list, tag));
    setTag('');
  }
  function addTo() {
    setCollections((list) => addCollection(list, collection));
    setCollection('');
  }
  return (
    <form
      className="organise-panel"
      aria-label={`Organise ${item.name}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() && onSave({ name: name.trim().slice(0, 200), tags, collections }))
          onClose();
      }}
    >
      <label>
        Name
        <input value={name} maxLength={200} required onChange={(e) => setName(e.target.value)} />
      </label>
      <fieldset>
        <legend>
          <Tag size={13} />
          Tags
        </legend>
        <div className="organise-chips">
          {tags.map((t) => (
            <button
              type="button"
              key={t}
              aria-label={`Remove tag ${t}`}
              onClick={() => setTags((list) => list.filter((v) => v !== t))}
            >
              #{t}
              <X size={12} />
            </button>
          ))}
        </div>
        <div className="organise-add">
          <input
            list={ids.tags}
            value={tag}
            placeholder="Add a tag"
            maxLength={40}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
              }
            }}
          />
          <datalist id={ids.tags}>
            {known.tags.map(([t]) => (
              <option key={t} value={t} />
            ))}
            {[auto.type, ...auto.fonts]
              .map((t) => normalizeTag(t))
              .filter(Boolean)
              .map((t) => (
                <option key={'s' + t} value={t} />
              ))}
          </datalist>
          <button type="button" disabled={!normalizeTag(tag)} onClick={addTag}>
            Add
          </button>
        </div>
      </fieldset>
      <fieldset>
        <legend>
          <FolderPlus size={13} />
          Collections
        </legend>
        <div className="organise-chips">
          {collections.map((c) => (
            <button
              type="button"
              key={c}
              className="collection"
              aria-label={`Remove from ${c}`}
              onClick={() => setCollections((list) => list.filter((v) => v !== c))}
            >
              {c}
              <X size={12} />
            </button>
          ))}
        </div>
        <div className="organise-add">
          <input
            list={ids.collections}
            value={collection}
            placeholder="Add to a collection"
            maxLength={40}
            onChange={(e) => setCollection(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTo();
              }
            }}
          />
          <datalist id={ids.collections}>
            {known.collections.map(([c]) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <button type="button" disabled={!normalizeCollection(collection)} onClick={addTo}>
            Add
          </button>
        </div>
      </fieldset>
      <p className="organise-auto">
        Automatic: {auto.type} · {auto.site}
        {auto.fonts.length ? ' · ' + auto.fonts.join(', ') : ''}
      </p>
      <div className="organise-actions">
        <button type="submit" className="primary" disabled={!dirty || !name.trim()}>
          <Check size={14} />
          Save
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}
