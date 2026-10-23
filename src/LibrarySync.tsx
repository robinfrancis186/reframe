import { useEffect, useState } from 'react';
import { HardDrive, CloudOff, AlertTriangle, Loader2, History } from 'lucide-react';
import {
  listVersions,
  onSyncStatus,
  restoreVersion,
  recoverPendingCopies,
  pendingBackup,
  syncStatus,
  type LibraryVersion,
  type SyncState,
} from './storage';
import './assets.css';
import { download } from './model';

const labels: Record<SyncState['state'], string> = {
  synced: 'Saved on this computer',
  saving: 'Saving to disk…',
  offline: 'Saved in this browser only',
  conflict: 'Conflicting edits kept safely',
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
  const desktop = (
    window as Window & {
      reframeDesktop?: { importLibrary: () => Promise<{ cancelled?: boolean; imported?: number }> };
    }
  ).reframeDesktop;
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
        {desktop && (
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                const result = await desktop.importLibrary();
                if (!result.cancelled) location.reload();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Import an existing Reframe Library…
          </button>
        )}
        <p>
          {state.message ||
            (desktop
              ? 'Your Library is stored in Reframe’s macOS application data folder, separately from this app and your source project. Clearing browser data does not remove it. The last 10 versions are kept.'
              : "Your Library is stored in this project's .reframe/library folder. Clearing browser data does not remove it. The last 10 versions are kept.")}
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
        {state.state === 'conflict' && (
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await recoverPendingCopies();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Keep my edits as new components
          </button>
        )}
        {(state.state === 'conflict' || state.state === 'offline') && (
          <button
            onClick={() =>
              download('reframe-pending-edits.json', pendingBackup(), 'application/json')
            }
          >
            Back up pending edits
          </button>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  );
}
