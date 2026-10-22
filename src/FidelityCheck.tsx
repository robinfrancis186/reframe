import { useEffect, useState } from "react";
import { Gauge, Loader2 } from "lucide-react";
import { api, type ComponentItem, type Fidelity } from "./model";
import "./fidelity.css";

type Result = Fidelity & { diff: string; renderedImage: string };
export const fidelityTier = (score: number) => score >= 90 ? "close" : score >= 75 ? "minor" : score >= 55 ? "noticeable" : "low";
export const canCheckFidelity = (item: ComponentItem) => !!(item.referenceImage && item.feature?.spec.website?.pages[0]?.component);

export function FidelityBadge({ fidelity }: { fidelity?: Fidelity }) {
  if (!fidelity) return null;
  return <span className={"fidelity-badge " + fidelityTier(fidelity.score)} title={`${fidelity.grade} · checked ${new Date(fidelity.checkedAt).toLocaleString()}`}><Gauge size={12} />{Math.round(fidelity.score)}% match</span>;
}

/** Original reference next to the saved replica, with a heatmap of where they differ. */
export default function FidelityCheck({ item, onScored }: { item: ComponentItem; onScored: (fidelity: Fidelity) => void }) {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setResult(null); setError(""); }, [item.id, item.feature?.builtAt]);
  async function check() {
    setBusy(true); setError("");
    try {
      const r = await api<Result>("/api/fidelity", { item, diff: true });
      setResult(r);
      const { score, grade, fitted, reference, rendered, differing, checkedAt } = r;
      onScored({ score, grade, fitted, reference, rendered, differing, checkedAt });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const fidelity = result || item.fidelity;
  return <div className="fidelity-check">
    <div className="fidelity-summary">
      {fidelity ? <><FidelityBadge fidelity={fidelity} /><span>{fidelity.grade}{fidelity.fitted === false ? " · size differs from the original" : ""}</span></> : <span>Not checked yet</span>}
      <button disabled={busy} onClick={() => void check()}>{busy ? <><Loader2 size={14} className="spin" />Comparing…</> : result ? "Check again" : "Compare with original"}</button>
    </div>
    {error && <p role="alert">{error}</p>}
    <div className="fidelity-images">
      <figure><img src={item.referenceImage} alt={`Original appearance of ${item.name}`} /><figcaption>Original</figcaption></figure>
      {result && <figure><img src={result.renderedImage} alt={`Saved replica of ${item.name}`} /><figcaption>Saved replica</figcaption></figure>}
      {result && <figure><img src={result.diff} alt="Differences highlighted in red over the original" /><figcaption>Differences · {Math.round(result.differing * 100)}% of the area</figcaption></figure>}
    </div>
    <p className="fidelity-note">Compares layout, text placement and color block by block against the image taken when you picked it. Hover and animation states are not compared.</p>
  </div>;
}
