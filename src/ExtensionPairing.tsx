import { useEffect, useState } from "react";
import { Puzzle, Copy, Check } from "lucide-react";
import { api } from "./model";
import "./organiser.css";

interface Status { paired: boolean; createdAt?: string; lastUsed?: string | null; captures?: number; folder?: string; token?: string }
const when = (iso?: string | null) => iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "never";

/** Pairs the Reframe Picker browser extension. The token is shown once; only its hash is kept on this computer. */
export default function ExtensionPairing() {
  const [status, setStatus] = useState<Status | null>(null);
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { api<Status>("/api/extension").then(setStatus, e => setError((e as Error).message)); }, []);
  async function run(request: Promise<Status>) {
    setError("");
    try { const next = await request; setStatus(next); setToken(next.token || ""); setCopied(false); } catch (e) { setError((e as Error).message); }
  }
  const pair = () => { if (!status?.paired || window.confirm("Pair again? The extension's current token stops working.")) void run(api<Status>("/api/extension/pair", {})); };
  const revoke = () => { if (window.confirm("Disconnect the browser extension? It can no longer save to this library.")) void run(fetch("/api/extension", { method: "DELETE" }).then(r => r.json())); };
  return <details className="library-sync extension-pairing">
    <summary><Puzzle size={14} /><span>{status?.paired ? `Browser extension paired · last capture ${when(status.lastUsed)}` : "Pick from your own browser"}</span></summary>
    <div>
      <p>The Reframe Picker extension saves components from any tab you have open, including signed-in pages and sites that block automated browsers. Captures are sanitized, repaired and scored like picks in Studio, then appear here.</p>
      <ol>
        <li>In Chrome, open <code>chrome://extensions</code>, turn on Developer mode and choose <b>Load unpacked</b>. Select <code>{status?.folder || "the project's extension folder"}</code>.</li>
        <li>Choose <b>{status?.paired ? "Pair again" : "Pair extension"}</b> below and paste the token into the extension's options, with the address <code>{location.origin}</code>.</li>
        <li>On any page, click the Reframe Picker button (or press Alt+Shift+R), click an element and press Enter.</li>
      </ol>
      {token && <div className="pairing-token" role="status"><p>Copy this token now; it is not shown again.</p><code>{token}</code><button onClick={async () => { try { await navigator.clipboard.writeText(token); setCopied(true); } catch { setCopied(false); } }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy"}</button></div>}
      <div className="organise-actions">
        <button className="primary" onClick={pair}>{status?.paired ? "Pair again" : "Pair extension"}</button>
        {status?.paired && <button onClick={revoke}>Disconnect</button>}
      </div>
      {status?.paired && <p className="muted">Paired {when(status.createdAt)} · {status.captures || 0} capture{status.captures === 1 ? "" : "s"} so far.</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  </details>;
}
