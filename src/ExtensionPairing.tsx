import { useEffect, useState } from "react";
import { Puzzle, Copy, Check, Loader2 } from "lucide-react";
import { api } from "./model";
import "./organiser.css";

interface Status { paired: boolean; createdAt?: string; lastUsed?: string | null; captures?: number; folder?: string; token?: string }
const when = (iso?: string | null) => iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "never";
type BridgeReply = { source: "reframe-picker"; type: string; ok?: boolean; error?: string; version?: string };

/**
 * Pairs the Reframe Picker browser extension. With the extension installed in this browser, Connect extension hands it
 * a fresh token directly (the extension asks you to confirm). Otherwise a token is shown once to paste by hand. Only the
 * token's hash is kept on this computer.
 */
export default function ExtensionPairing() {
  const [status, setStatus] = useState<Status | null>(null);
  const [bridge, setBridge] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { api<Status>("/api/extension").then(setStatus, e => setError((e as Error).message)); }, []);
  // The extension's localhost bridge answers "hello", so the page knows it can connect in one click.
  useEffect(() => {
    const listen = (event: MessageEvent<BridgeReply>) => { if (event.source === window && event.origin === location.origin && event.data?.source === "reframe-picker" && event.data.type === "ready") setBridge(event.data.version || "installed"); };
    window.addEventListener("message", listen);
    window.postMessage({ source: "reframe", type: "hello" }, location.origin);
    return () => window.removeEventListener("message", listen);
  }, []);
  async function connect() {
    if (status?.paired && !window.confirm("Connect again? The extension's current token stops working.")) return;
    setConnecting(true); setError(""); setMessage(""); setToken("");
    try {
      const next = await api<Status>("/api/extension/pair", {});
      const reply = await new Promise<BridgeReply>((resolve, reject) => {
        const timer = setTimeout(() => { window.removeEventListener("message", listen); reject(new Error("The extension did not answer. Reload this page and try again.")); }, 120000);
        function listen(event: MessageEvent<BridgeReply>) {
          if (event.source !== window || event.origin !== location.origin || event.data?.source !== "reframe-picker" || event.data.type !== "paired") return;
          clearTimeout(timer); window.removeEventListener("message", listen); resolve(event.data);
        }
        window.addEventListener("message", listen);
        window.postMessage({ source: "reframe", type: "pair", token: next.token }, location.origin);
      });
      if (!reply.ok) throw new Error(reply.error || "The extension could not connect.");
      setStatus({ ...next, token: undefined });
      setMessage("Extension connected. Click Reframe Picker on any page (Alt+Shift+R) to start picking.");
    } catch (e) {
      setError((e as Error).message);
      setStatus(await api<Status>("/api/extension").catch(() => status));
    } finally { setConnecting(false); }
  }
  async function manual() {
    if (status?.paired && !window.confirm("Create a new token? The extension's current token stops working.")) return;
    setError(""); setMessage("");
    try { const next = await api<Status>("/api/extension/pair", {}); setStatus(next); setToken(next.token || ""); setCopied(false); } catch (e) { setError((e as Error).message); }
  }
  async function revoke() {
    if (!window.confirm("Disconnect the browser extension? It can no longer save to this library.")) return;
    try { setStatus(await fetch("/api/extension", { method: "DELETE" }).then(r => r.json())); setToken(""); setMessage(""); } catch (e) { setError((e as Error).message); }
  }
  return <details className="library-sync extension-pairing" open={!status?.paired && !!bridge || undefined}>
    <summary><Puzzle size={14} /><span>{status?.paired ? `Browser extension connected · last capture ${when(status.lastUsed)}` : bridge ? "Browser extension found · connect it" : "Pick from your own browser"}</span></summary>
    <div>
      <p>The Reframe Picker extension saves components from any tab you have open, including signed-in pages and sites that block automated browsers. Captures are sanitized, repaired and scored like picks in Studio, then appear here.</p>
      {bridge ? <div className="organise-actions">
        <button className="primary" disabled={connecting} onClick={() => void connect()}>{connecting ? <><Loader2 size={14} className="spin" />Confirm in the browser…</> : status?.paired ? "Connect again" : "Connect extension"}</button>
        {status?.paired && <button onClick={() => void revoke()}>Disconnect</button>}
      </div> : <ol>
        <li>In Chrome, open <code>chrome://extensions</code>, turn on <b>Developer mode</b> (top right) and choose <b>Load unpacked</b>. Select <code>{status?.folder || "the project's extension folder"}</code>.</li>
        <li>Open Reframe in that browser at <code>{location.origin}</code> (if it is already open, reload this page). A <b>Connect extension</b> button appears here; choose it and confirm.</li>
        <li>On any page, click the Reframe Picker button (or press Alt+Shift+R), click an element and press Enter.</li>
      </ol>}
      {message && <p role="status">{message}</p>}
      {token && <div className="pairing-token" role="status"><p>Paste this token into the extension's options. It is not shown again.</p><code>{token}</code><button onClick={async () => { try { await navigator.clipboard.writeText(token); setCopied(true); } catch { setCopied(false); } }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy"}</button></div>}
      <p className="muted">
        {status?.paired && <>Connected {when(status.createdAt)} · {status.captures || 0} capture{status.captures === 1 ? "" : "s"} so far. </>}
        <button className="text-button" onClick={() => void manual()}>Show a token</button> to connect by hand{!bridge && status?.paired && <> · <button className="text-button" onClick={() => void revoke()}>Disconnect</button></>}.
      </p>
      {error && <p role="alert">{error}</p>}
    </div>
  </details>;
}
