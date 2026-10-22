import { useEffect, useRef, useState } from "react";
import { Smartphone, RefreshCw, MousePointer2 } from "lucide-react";
import { api, type ComponentItem } from "./model";

interface Node {
  id: string;
  type: string;
  text: string;
  bounds: number[];
  children: Node[];
}
interface Snapshot {
  image?: string;
  raw: string;
  nodes: Node[];
  platform: string;
  source: string;
  notice?: string;
}
export default function NativeCapture({
  onCapture,
}: {
  onCapture: (r: { items: ComponentItem[] }) => void;
}) {
  const [devices, setDevices] = useState<
    { id: string; name: string; platform: string }[]
  >([]);
  const [notices, setNotices] = useState<string[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [platform, setPlatform] = useState("android");
  const [raw, setRaw] = useState("");
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [crop, setCrop] = useState([0, 0, 100, 100]);
  const [vision, setVision] = useState(false);
  const [remoteVision, setRemoteVision] = useState(false);
  const [imageSize, setImageSize] = useState([0, 0]);
  const start = useRef<number[] | null>(null);
  const image = useRef<HTMLImageElement>(null);
  async function task(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function refresh() {
    await task("Finding devices…", async () => {
      const r = await api<{ devices: typeof devices; notices: string[] }>(
        "/api/devices",
      );
      setDevices(r.devices);
      setNotices(r.notices);
    });
  }
  useEffect(() => {
    void refresh();
    api<{ vision: boolean; openAI: boolean }>("/api/status")
      .then((s) => { setVision(s.vision); setRemoteVision(s.openAI); })
      .catch(() => {});
  }, []);
  function load(s: Snapshot) {
    setSnapshot(s);
    setSelected("");
    setCrop([0, 0, 100, 100]);
    setImageSize([0, 0]);
  }
  const flat: (Node & { depth: number })[] = [];
  function flatten(nodes: Node[], depth = 0) {
    for (const n of nodes) {
      flat.push({ ...n, depth });
      flatten(n.children, depth + 1);
    }
  }
  if (snapshot) flatten(snapshot.nodes);
  const current = flat.find((n) => n.id === selected);
  const width = snapshot?.nodes[0]?.children.length
    ? Math.max(1, snapshot.nodes[0].bounds[0] + snapshot.nodes[0].bounds[2])
    : Math.max(1, ...flat.map((n) => n.bounds[0] + n.bounds[2]));
  const height = imageSize[0]
    ? (imageSize[1] * width) / imageSize[0]
    : Math.max(1, ...flat.map((n) => n.bounds[1] + n.bounds[3]));
  const box = current
    ? [
        (current.bounds[0] / width) * 100,
        (current.bounds[1] / height) * 100,
        (current.bounds[2] / width) * 100,
        (current.bounds[3] / height) * 100,
      ]
    : crop;
  async function reconstruct() {
    await task("Reconstructing selected region…", async () => {
      const img = image.current;
      if (!img?.complete || !img.naturalWidth)
        throw new Error("Wait for the screenshot to load.");
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round((img.naturalWidth * box[2]) / 100));
      canvas.height = Math.max(
        1,
        Math.round((img.naturalHeight * box[3]) / 100),
      );
      canvas
        .getContext("2d")!
        .drawImage(
          img,
          (img.naturalWidth * box[0]) / 100,
          (img.naturalHeight * box[1]) / 100,
          canvas.width,
          canvas.height,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      onCapture(
        await api("/api/reconstruct", {
          image: canvas.toDataURL("image/png"),
          description: `Reconstruct this selected ${snapshot?.platform} interface region. Preserve the visible content.`,
        }),
      );
    });
  }
  return (
    <div className="native-page">
      <div className="intro">
        <h2>Pick from a native screen.</h2>
        <p>
          Connect an Android device or a running iOS Simulator. Pick an
          accessible element, or crop a screenshot.
        </p>
      </div>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {busy && <p role="status">{busy}</p>}
      <section className="panel connection-panel">
        <div className="section-heading">
          <h2>
            <Smartphone size={18} /> Connected devices
          </h2>
          <button disabled={!!busy} onClick={() => void refresh()}>
            <RefreshCw size={15} />
            Refresh devices
          </button>
        </div>
        {devices.length ? (
          devices.map((d) => (
            <button
              key={d.id}
              disabled={!!busy}
              onClick={() =>
                void task("Capturing screen…", async () =>
                  load(
                    await api("/api/devices/capture", {
                      id: d.id,
                      platform: d.platform,
                    }),
                  ),
                )
              }
            >
              {d.name} · {d.platform} — Capture
            </button>
          ))
        ) : (
          <p className="muted">
            No available devices. You can also import a hierarchy or screenshot
            below.
          </p>
        )}
        <details>
          <summary>Device setup & availability</summary>
          {notices.map((n) => (
            <p key={n}>{n}</p>
          ))}
          <p>
            Android captures require an authorized USB debugging connection. iOS
            captures use a booted Xcode Simulator; install idb and its companion
            for accessibility picking. Screenshot capture still works without
            idb. Protected screens may prevent capture.
          </p>
        </details>
        <details>
          <summary>Import native hierarchy or screenshot</summary>
          <div className="form-row">
            <label>
              Platform
              <select
                aria-label="Native platform"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                <option value="android">Android · UIAutomator XML</option>
                <option value="ios">iOS · idb accessibility JSON</option>
              </select>
            </label>
            <label>
              Hierarchy file
              <input
                type="file"
                accept=".xml,.json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file)
                    void task("Reading hierarchy…", async () => {
                      if (file.size > 2_000_000)
                        throw new Error("Use a file under 2 MB.");
                      setRaw(await file.text());
                    });
                }}
              />
            </label>
          </div>
          <label>
            Hierarchy content
            <textarea
              aria-label="Native hierarchy"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={5}
              placeholder="Paste UIAutomator XML or idb JSON"
            />
          </label>
          <button
            disabled={!!busy || !raw}
            onClick={() =>
              void task("Reading elements…", async () => {
                const r = await api<{ nodes: Node[] }>("/api/native/inspect", {
                  raw,
                  platform,
                });
                load({
                  raw,
                  platform,
                  nodes: r.nodes,
                  source: `Imported ${platform} hierarchy`,
                });
              })
            }
          >
            Inspect native elements
          </button>
          <label className="file-label">
            Screenshot (also works with a physical iPhone screenshot)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void task("Loading screenshot…", async () => {
                    if (
                      file.size > 5_000_000 ||
                      !/^image\/(png|jpeg|webp)$/.test(file.type)
                    )
                      throw new Error("Use PNG, JPEG or WebP under 5 MB.");
                    const data = await new Promise<string>(
                      (resolve, reject) => {
                        const r = new FileReader();
                        r.onload = () => resolve(String(r.result));
                        r.onerror = reject;
                        r.readAsDataURL(file);
                      },
                    );
                    load({
                      raw: "",
                      platform,
                      nodes: [],
                      image: data,
                      source: `Imported ${platform} screenshot`,
                    });
                  });
              }}
            />
          </label>
        </details>
      </section>
      {snapshot && (
        <div className="native-workspace">
          <section className="panel native-screen">
            <div className="section-heading">
              <h2>Screen selection</h2>
              <span>{snapshot.platform}</span>
            </div>
            {snapshot.image ? (
              <div
                className="screen-image"
                onPointerDown={(e) => {
                  if (flat.length) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  start.current = [
                    ((e.clientX - r.left) / r.width) * 100,
                    ((e.clientY - r.top) / r.height) * 100,
                  ];
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (!start.current) return;
                  const r = e.currentTarget.getBoundingClientRect(),
                    x = Math.max(
                      0,
                      Math.min(100, ((e.clientX - r.left) / r.width) * 100),
                    ),
                    y = Math.max(
                      0,
                      Math.min(100, ((e.clientY - r.top) / r.height) * 100),
                    );
                  setCrop([
                    Math.min(x, start.current[0]),
                    Math.min(y, start.current[1]),
                    Math.abs(x - start.current[0]),
                    Math.abs(y - start.current[1]),
                  ]);
                }}
                onPointerUp={() => {
                  start.current = null;
                }}
                onPointerCancel={() => {
                  start.current = null;
                }}
              >
                <img
                  ref={image}
                  src={snapshot.image}
                  alt="Captured native screen"
                  draggable={false}
                  onLoad={(e) =>
                    setImageSize([
                      e.currentTarget.naturalWidth,
                      e.currentTarget.naturalHeight,
                    ])
                  }
                />
                {flat.map(
                  (n) =>
                    n.bounds[2] > 0 &&
                    n.bounds[3] > 0 && (
                      <button
                        key={n.id}
                        className="native-hit"
                        title={n.text || n.type}
                        aria-label={`Pick ${n.text || n.type}`}
                        onClick={() => setSelected(n.id)}
                        style={{
                          left: `${(n.bounds[0] / width) * 100}%`,
                          top: `${(n.bounds[1] / height) * 100}%`,
                          width: `${(n.bounds[2] / width) * 100}%`,
                          height: `${(n.bounds[3] / height) * 100}%`,
                        }}
                      />
                    ),
                )}
                {(!flat.length || current) && (
                  <div
                    className="selection-box"
                    style={{
                      left: `${box[0]}%`,
                      top: `${box[1]}%`,
                      width: `${box[2]}%`,
                      height: `${box[3]}%`,
                    }}
                  />
                )}
              </div>
            ) : (
              <div className="native-placeholder">
                <MousePointer2 size={32} />
                <p>Choose an element from the hierarchy.</p>
                <p>
                  Accessible structure is available. This import has no
                  screenshot.
                </p>
              </div>
            )}
            {snapshot.notice && <p>{snapshot.notice}</p>}
            {!flat.length && snapshot.image && (
              <>
                <p>
                  Drag a rectangle on the screenshot, or set the region below.
                </p>
                <div className="crop-inputs">
                  {["Left %", "Top %", "Width %", "Height %"].map(
                    (label, i) => (
                      <label key={label}>
                        {label}
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={Math.round(crop[i])}
                          onChange={(e) =>
                            setCrop((c) =>
                              c.map((v, j) =>
                                j === i
                                  ? Math.max(
                                      0,
                                      Math.min(100, Number(e.target.value)),
                                    )
                                  : v,
                              ),
                            )
                          }
                        />
                      </label>
                    ),
                  )}
                </div>
              </>
            )}
          </section>
          <section className="panel native-tree">
            <h2>Elements</h2>
            <div className="tree-list">
              {flat.map((n) => (
                <button
                  key={n.id}
                  aria-pressed={selected === n.id}
                  className={selected === n.id ? "selected" : ""}
                  style={{ paddingLeft: 12 + Math.min(n.depth, 6) * 12 }}
                  onClick={() => setSelected(n.id)}
                >
                  <strong>{n.text || n.type.split(".").pop()}</strong>
                  <small>{n.type}</small>
                </button>
              ))}
            </div>
            {current && (
              <button
                className="primary"
                disabled={!!busy}
                onClick={() =>
                  void task("Picking element…", async () =>
                    onCapture(
                      await api("/api/native/pick", {
                        raw: snapshot.raw,
                        platform: snapshot.platform,
                        nodeId: selected,
                        source: snapshot.source,
                      }),
                    ),
                  )
                }
              >
                Pick selected element
              </button>
            )}
            {snapshot.image && (
              <button
                disabled={
                  !!busy ||
                  !vision ||
                  box[2] < 1 ||
                  box[3] < 1 ||
                  box[0] + box[2] > 100 ||
                  box[1] + box[3] > 100
                }
                onClick={() => void reconstruct()}
              >
                Reconstruct selected region
              </button>
            )}
            {snapshot.image && (
              <p className="muted">
                {vision
                  ? remoteVision ? "Only the selected region is sent to OpenAI when you reconstruct." : "The selected region is processed by local macOS OCR. Review its suggested controls before building behavior."
                  : "Install Swift command-line tools for local macOS OCR, or configure OpenAI on the server."}
              </p>
            )}
            <p className="muted">
              Picking uses observed accessibility content. Destination layouts
              adapt to their framework; hidden app logic is not captured.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
