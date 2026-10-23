import { useEffect, useState } from 'react';
import { HardDrive, CloudOff, AlertTriangle, Loader2, History } from 'lucide-react';
import {
  listVersions,
  onSyncStatus,
  restoreVersion,
  syncStatus,
  type LibraryVersion,
  type SyncState,
} from './storage';
import './assets.css';

const labels: Record<SyncState['state'], string> = {
  synced: 'Saved on this computer',
  saving: 'Saving to disk…',
  offline: 'Saved in this browser only',
  conflict: 'Changed elsewhere — reload',
  'browser-only': 'Saved in this browser only',
};
const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';

/** Where the library is saved, and earlier versions kept on disk that can be restored. */
export default function LibrarySync() {
  const [state, setState] = useState(syncStatus);
  const [versions, setVersions] = useState<LibraryVersion[] | null>(null);
  const [choice, setChoice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => onSyncStatus(setState), []);
  async function load() {
    setError('');
    try {
      const list = await listVersions();
      setVersions(list);
      setChoice(list[0]?.id || '');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function restore() {
    const version = versions?.find((v) => v.id === choice);
    if (
      !version ||
      !window.confirm(
        `Restore the library from ${when(version.savedAt)} (${version.items} component${version.items === 1 ? '' : 's'})? Your current library is kept as a version too.`,
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      await restoreVersion(version.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  const Icon =
    state.state === 'synced'
      ? HardDrive
      : state.state === 'saving'
        ? Loader2
        : state.state === 'conflict'
          ? AlertTriangle
          : CloudOff;
  return (
    <details
      className="library-sync"
      onToggle={(e) => {
        if (e.currentTarget.open && !versions) void load();
      }}
    >
      <summary>
        <Icon size={14} className={state.state === 'saving' ? 'spin' : undefined} />
        <span role="status">{labels[state.state]}</span>
        {state.savedAt && state.state === 'synced' && <small>{when(state.savedAt)}</small>}
      </summary>
      <div>
        <p>
          {state.message ||
            "Your saved components and their fonts are stored in this project's .reframe/library folder, so clearing browser data does not remove them. The last 10 versions are kept."}
        </p>
        {versions === null ? (
          !error && <p role="status">Loading versions…</p>
        ) : versions.length ? (
          <div className="library-sync-restore">
            <label>
              <span>
                <History size={14} />
                Earlier versions
              </span>
              <select value={choice} onChange={(e) => setChoice(e.target.value)}>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {when(v.savedAt)} · {v.items} component{v.items === 1 ? '' : 's'}
                    {v.reason === 'browser copy'
                      ? ' · unsynced browser copy'
                      : v.reason === 'before restore'
                        ? ' · before a restore'
                        : ''}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={busy || !choice || state.state === 'conflict'}
              onClick={() => void restore()}
            >
              {busy ? 'Restoring…' : 'Restore'}
            </button>
          </div>
        ) : (
          <p>No earlier versions yet.</p>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  );
}
