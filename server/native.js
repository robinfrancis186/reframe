import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { load } from "cheerio";
import { extract } from "./capture.js";

const run = promisify(execFile);
const options = { timeout: 20000, maxBuffer: 12_000_000 };
async function adbPath() {
  for (const candidate of [
    process.env.ADB_PATH,
    path.join(homedir(), "Library/Android/sdk/platform-tools/adb"),
    "/opt/homebrew/bin/adb",
  ]) {
    if (candidate) {
      try {
        await access(candidate);
        return candidate;
      } catch {}
    }
  }
  return "adb";
}
export async function devices() {
  const devices = [],
    notices = [];
  try {
    const { stdout } = await run(await adbPath(), ["devices", "-l"], options);
    for (const line of stdout.split("\n").slice(1)) {
      const [id, state] = line.trim().split(/\s+/);
      if (state === "device")
        devices.push({
          id,
          platform: "android",
          name: line.match(/model:(\S+)/)?.[1] || id,
        });
      else if (state)
        notices.push(
          `${id}: ${state}. Unlock the device and authorize USB debugging.`,
        );
    }
  } catch {
    notices.push(
      "Android: install Android SDK Platform Tools and enable USB debugging on your device. Set ADB_PATH if adb is outside PATH.",
    );
  }
  try {
    const { stdout } = await run(
      "xcrun",
      ["simctl", "list", "devices", "booted", "--json"],
      options,
    );
    for (const entries of Object.values(JSON.parse(stdout).devices)) {
      for (const d of entries)
        if (d.state === "Booted")
          devices.push({ id: d.udid, platform: "ios", name: d.name });
    }
  } catch {
    notices.push(
      "iOS: install full Xcode, select its developer directory, and open an iOS Simulator. Physical iPhones are not supported by this capture adapter.",
    );
  }
  return { devices, notices };
}
const escape = (s) =>
  String(s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function parseHierarchy(raw, platform) {
  if (
    typeof raw !== "string" ||
    raw.length > 2_000_000 ||
    /<!DOCTYPE|<!ENTITY/i.test(raw)
  )
    throw new Error("Use a UI hierarchy under 2 MB without XML entities.");
  let count = 0;
  function normalize(obj, depth = 0) {
    if (++count > 3000 || depth > 60)
      throw new Error("UI hierarchy is too large or deep.");
    const android = platform === "android";
    const type = String(
      android ? obj.class || "View" : obj.type || obj.role || "View",
    ).slice(0, 200);
    const text = String(
      android
        ? obj.text || obj["content-desc"] || ""
        : obj.label || obj.AXLabel || obj.value || obj.AXValue || "",
    ).slice(0, 2000);
    const matches = android
      ? String(obj.bounds).match(/^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/)
      : null;
    const f = obj.frame || {};
    const bounds =
      android && matches
        ? [
            Number(matches[1]),
            Number(matches[2]),
            Number(matches[3]) - Number(matches[1]),
            Number(matches[4]) - Number(matches[2]),
          ]
        : [
            Number(f.x || 0),
            Number(f.y || 0),
            Number(f.width || 0),
            Number(f.height || 0),
          ];
    if (
      !bounds.every(
        (n, i) => Number.isFinite(n) && n >= (i < 2 ? -30000 : 0) && n <= 30000,
      )
    )
      throw new Error("Invalid UI bounds.");
    return {
      id: String(count),
      type,
      text,
      bounds,
      clickable: obj.clickable === "true" || /Button/i.test(type),
      editable: /EditText|TextField|TextView.*editable/i.test(type),
      password: obj.password === "true" || /Secure|Password/i.test(type),
      children: (obj.children || []).map((child) =>
        normalize(child, depth + 1),
      ),
    };
  }
  if (platform === "android") {
    const $ = load(raw, { xmlMode: true });
    function object(el) {
      return {
        ...el.attribs,
        children: $(el).children("node").toArray().map(object),
      };
    }
    const roots = $("hierarchy").children("node").toArray();
    if (!roots.length)
      throw new Error(
        "No Android UI nodes found. Import a uiautomator XML dump.",
      );
    // Limit before recursively converting the XML tree.
    if ($("node").length > 3000)
      throw new Error("UI hierarchy exceeds 3000 nodes.");
    function checkDepth(el, depth = 0) {
      if (depth > 60) throw new Error("UI hierarchy too deep.");
      $(el)
        .children("node")
        .each((_, e) => checkDepth(e, depth + 1));
    }
    roots.forEach((e) => checkDepth(e));
    return roots.map((e) => normalize(object(e)));
  }
  if (platform !== "ios") throw new Error("Choose Android or iOS.");
  const json = JSON.parse(raw);
  const roots = Array.isArray(json) ? json : [json];
  return roots.map((obj) => normalize(obj));
}
export function nativeItem(
  raw,
  platform,
  nodeId,
  source = "Imported native hierarchy",
) {
  const nodes = parseHierarchy(raw, platform);
  const find = (list) => {
    for (const n of list) {
      if (n.id === nodeId) return n;
      const found = find(n.children);
      if (found) return found;
    }
  };
  const selected = find(nodes);
  if (!selected) throw new Error("Select a native element first.");
  function html(n) {
    const text = escape(n.text);
    if (n.editable)
      return `<label>${text || "Text field"}<input type="${n.password ? "password" : /email/i.test(n.text) ? 'email' : 'text'}" aria-label="${text || "Text field"}" placeholder="${text}"></label>`;
    if (/Switch|CheckBox/i.test(n.type))
      return `<label><input type="checkbox" aria-label="${text || "Toggle"}">${text || "Toggle"}</label>`;
    const containsControls = children => children.some(child => child.editable || child.clickable || containsControls(child.children));
    if (n.clickable && !containsControls(n.children))
      return `<button>${
        text ||
        escape(
          n.children
            .map((c) => c.text)
            .filter(Boolean)
            .join(" "),
        ) ||
        "Continue"
      }</button>`;
    return `<div>${text ? `<p>${text}</p>` : ""}${n.children.map(html).join("")}</div>`;
  }
  const item = extract(`<section>${html(selected)}</section>`, source).items[0];
  return {
    ...item,
    name: selected.text.slice(0, 80) || selected.type.split(".").pop(),
    kind: platform,
    evidence:
      "Observed native accessibility structure. Layout is adapted; app logic and hidden states are not recovered.",
  };
}
export async function captureDevice(id, platform) {
  const available = await devices();
  if (!available.devices.some((d) => d.id === id && d.platform === platform))
    throw new Error("Device is no longer available. Refresh devices.");
  const folder = await mkdtemp(path.join(tmpdir(), "reframe-device-"));
  let raw = "",
    screenshot;
  try {
    if (platform === "android") {
      const adb = await adbPath(),
        remote = `/sdcard/reframe-${randomUUID()}.xml`;
      screenshot = (
        await run(adb, ["-s", id, "exec-out", "screencap", "-p"], {
          ...options,
          encoding: "buffer",
        })
      ).stdout;
      try {
        await run(
          adb,
          ["-s", id, "shell", "uiautomator", "dump", remote],
          options,
        );
        raw = (await run(adb, ["-s", id, "exec-out", "cat", remote], options))
          .stdout;
      } catch {
        raw = "";
      } finally {
        await run(adb, ["-s", id, "shell", "rm", remote], options).catch(
          () => {},
        );
      }
    } else {
      const file = path.join(folder, "screen.png");
      await run("xcrun", ["simctl", "io", id, "screenshot", file], options);
      screenshot = await readFile(file);
      try {
        raw = (
          await run(
            "idb",
            [
              "ui",
              "describe-all",
              "--udid",
              id,
              "--api",
              "axbridge",
              "--format",
              "nested",
            ],
            options,
          )
        ).stdout;
      } catch {}
    }
    let nodes = [],
      notice = "";
    try {
      if (raw) nodes = parseHierarchy(raw, platform);
    } catch {
      raw = "";
    }
    if (!nodes.length)
      notice =
        "Accessibility hierarchy unavailable. Select a screenshot region and reconstruct with local OCR or the configured vision model.";
    return {
      image: `data:image/png;base64,${screenshot.toString("base64")}`,
      raw,
      nodes,
      platform,
      notice,
      source: `${platform} device ${id}`,
    };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
