import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Projects, insertionPoints } from "../server/projects.js";
import { generate } from "../server/generate.js";
import { nativeItem, parseHierarchy } from "../server/native.js";
import { parse } from "@babel/parser";

const html =
  '<section><h2>Make it yours</h2><label>Email<input placeholder="Your email"></label><input type="checkbox" aria-label="Updates"><button>Continue</button></section>';
const theme = { primary: "#3159e8", text: "#112233", background: "#ffffff" };
const fixtures = {
  react: [
    "App.tsx",
    '"use client";\nexport default function App() { function handleAction(action: string) { console.log(action); } return <main><section><h1>Existing</h1></section></main>; }',
  ],
  "react-native": [
    "App.tsx",
    'import { View, Text } from "react-native"; export default function App() { function handleAction(action: string) { console.log(action); } return <View><Text>Existing</Text></View>; }',
  ],
  swiftui: [
    "Screen.swift",
    'import SwiftUI\nstruct Screen: View { func handleAction(_ action: String) { print(action) }\nvar body: some View { VStack { Text("Existing }") } } }',
  ],
  compose: [
    "Screen.kt",
    'package example\nimport androidx.compose.runtime.Composable\nimport androidx.compose.foundation.layout.Column\nimport androidx.compose.material3.Text\nfun handleAction(action: String) { println(action) }\n@Composable fun Screen() { Column { Text("Existing }") } }',
  ],
};
for (const [framework, [file, original]] of Object.entries(fixtures)) {
  test(`${framework}: insert a wired component, preserve original source, and undo after a server restart`, async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "reframe-test-"));
    try {
      const root = path.join(dir, "app");
      await mkdir(root);
      await writeFile(path.join(root, file), original);
      await writeFile(
        path.join(root, "package.json"),
        JSON.stringify({
          dependencies:
            framework === "react-native"
              ? { "react-native": "1" }
              : { react: "1" },
        }),
      );
      const service = new Projects(path.join(dir, "state"));
      const project = await service.connect(root);
      const targets = await service.targets(project.id, file);
      assert.equal(targets.framework, framework);
      assert.ok(targets.points.length);
      assert.ok(
        targets.points[0].handlers.includes("handleAction"),
        JSON.stringify(targets.points),
      );
      const fit = await service.fit({ projectId: project.id, file, pointId: targets.points[0].id, hash: targets.hash, html, handler: 'handleAction' });
      assert.ok(fit.score > 0 && fit.score <= 100);
      assert.equal(await readFile(path.join(root, file), 'utf8'), original);
      await assert.rejects(service.fit({ projectId: project.id, file, pointId: targets.points[0].id, hash: 'stale', html }), /changed/);
      const plan = await service.plan({
        projectId: project.id,
        file,
        pointId: targets.points[0].id,
        hash: targets.hash,
        html,
        name: "ReframeTest",
        handler: "handleAction",
        theme,
      });
      assert.match(plan.after, /ReframeTest/);
      assert.equal(plan.decision.status, 'review');
      assert.equal(plan.minimal.addedDependencies, 0);
      assert.equal(plan.analysis.status, ['react', 'react-native'].includes(framework) ? 'analyzed' : 'not-applicable');
      if (plan.analysis.status === 'analyzed') assert.ok(plan.analysis.evidenceId);
      assert.equal(await readFile(path.join(root, file), "utf8"), original);
      assert.match(
        plan.after,
        framework === "swiftui"
          ? /onAction: handleAction/
          : framework === "compose"
            ? /onAction = ::handleAction/
            : /onAction=\{handleAction\}/,
      );
      if (framework === "react" || framework === "react-native")
        parse(plan.after, {
          sourceType: "module",
          plugins: ["jsx", "typescript"],
        });
      if (framework === "react")
        assert.ok(plan.after.startsWith('"use client";'));
      if (framework === "compose")
        assert.ok(plan.after.startsWith("package example"));
      await service.apply(plan.id);
      assert.equal(await readFile(path.join(root, file), "utf8"), plan.after);
      await assert.rejects(service.apply(plan.id), /expired/);
      const restarted = new Projects(path.join(dir, "state"));
      assert.equal((await restarted.history()).length, 1);
      await restarted.undo(plan.id);
      assert.equal(await readFile(path.join(root, file), "utf8"), original);
      assert.equal((await restarted.history()).length, 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}
test("concurrent edits, invalid handlers, traversal and symlinks cannot overwrite source", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "reframe-safety-"));
  try {
    const root = path.join(dir, "app");
    await mkdir(root);
    const [file, source] = fixtures.react;
    await writeFile(path.join(root, file), source);
    const service = new Projects(path.join(dir, "state")),
      project = await service.connect(root),
      targets = await service.targets(project.id, file);
    const request = {
      projectId: project.id,
      file,
      pointId: targets.points[0].id,
      hash: targets.hash,
      html,
      name: "ReframeSafety",
    };
    await assert.rejects(
      service.plan({ ...request, handler: "doSomethingEvil()" }),
      /handler/,
    );
    const plan = await service.plan(request);
    await writeFile(path.join(root, file), source + "\n// User edit");
    await assert.rejects(service.apply(plan.id), /Screen changed/);
    await writeFile(path.join(root, file), source);
    await service.apply(plan.id);
    await writeFile(path.join(root, file), plan.after + "\n// New edit");
    await assert.rejects(service.undo(plan.id), /newer edits/);
    await assert.rejects(service.source(project, "../outside.tsx"));
    await writeFile(path.join(dir, "outside.tsx"), source);
    await symlink(path.join(dir, "outside.tsx"), path.join(root, "Linked.tsx"));
    await assert.rejects(service.source(project, "Linked.tsx"), /Symlinked/);
    assert.equal(await readFile(path.join(dir, "outside.tsx"), "utf8"), source);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("native container detection ignores comments and strings; web scopes exclude sibling handlers", () => {
  assert.equal(
    insertionPoints(
      'import SwiftUI\n// VStack { fake }\nlet s = "VStack { fake }"\nVStack { Text("OK") }',
      "S.swift",
      "swiftui",
    ).length,
    1,
  );
  const points = insertionPoints(
    "function Other(){function privateAction(){} return <div/>} function App(){ const activeHandler=(action)=>{}; return <main/>;}",
    "A.tsx",
    "react",
  );
  assert.equal(points.length, 0);
  const scope = insertionPoints(
    "function Other(){function privateAction(){} return <div/>} function App(){ const activeHandler=(action)=>{}; if(false){const hidden=()=>{}} return <main></main>;}",
    "A.tsx",
    "react",
  )[0];
  assert.ok(scope.handlers.includes("activeHandler"));
  assert.ok(!scope.handlers.includes("privateAction"));
  assert.ok(!scope.handlers.includes("hidden"));
});
test("native hierarchy extraction selects the correct subtree and rejects malformed or hostile input", () => {
  const raw =
    '<hierarchy><node class="android.widget.LinearLayout" bounds="[0,0][400,800]"><node class="android.widget.TextView" text="Welcome" bounds="[0,0][200,80]"/><node class="android.widget.Button" text="Continue" clickable="true" bounds="[0,100][200,180]"/></node></hierarchy>';
  const nodes = parseHierarchy(raw, "android");
  assert.equal(nodes[0].children.length, 2);
  const item = nativeItem(raw, "android", nodes[0].children[1].id);
  assert.match(item.html, /<button/);
  assert.match(item.html, /Continue/);
  assert.doesNotMatch(item.html, /Welcome/);
  assert.throws(
    () =>
      parseHierarchy(
        '<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><hierarchy/>',
        "android",
      ),
    /entities/,
  );
  assert.throws(
    () =>
      parseHierarchy(
        '<hierarchy><node bounds="[2,1][1,0]"/></hierarchy>',
        "android",
      ),
    /bounds/,
  );
  const ios = parseHierarchy(
    JSON.stringify([
      {
        type: "Button",
        label: "Buy",
        frame: { x: 0, y: 20, width: 90, height: 30 },
      },
    ]),
    "ios",
  );
  assert.equal(ios[0].text, "Buy");
  assert.throws(() => nativeItem(raw, "android", "missing"), /Select/);
});
test("generated source escapes untrusted content and does not include executable HTML", () => {
  for (const framework of Object.keys(fixtures)) {
    const result = generate(
      '<p>Price $9 &quot;quoted&quot; \\ path</p><script>EVIL()</script><button onclick="EVIL()">Buy</button>',
      "ReframeSafe",
      framework,
    );
    assert.doesNotMatch(result.code, /EVIL/);
    assert.equal(result.actions.length, 1);
    if (framework === "compose") assert.match(result.code, /\\\$9/);
    if (framework === "react" || framework === "react-native")
      parse(result.imports.join("\n") + "\n" + result.code, {
        sourceType: "module",
        plugins: ["jsx", "typescript"],
      });
  }
  assert.throws(() => generate(html, "x);EVIL(", "react"), /component name/);
});

test("password fields stay secure in every destination framework", () => {
  const html = '<input type="password" aria-label="Password">';
  assert.match(generate(html, "ReframeLogin", "swiftui").code, /SecureField/);
  assert.match(
    generate(html, "ReframeLogin", "compose").code,
    /PasswordVisualTransformation/,
  );
  assert.match(
    generate(html, "ReframeLogin", "react-native").code,
    /secureTextEntry/,
  );
  assert.match(generate(html, "ReframeLogin", "react").code, /type="password"/);
});

test("Android adapter invokes bounded capture commands and removes its temporary device dump", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "reframe-adapter-"));
  const previous = process.env.ADB_PATH;
  try {
    const executable = path.join(dir, "adb");
    const log = path.join(dir, "calls.jsonl");
    const xml =
      '<hierarchy><node class="android.widget.Button" text="Connect" clickable="true" bounds="[0,0][100,40]"/></hierarchy>';
    await writeFile(
      executable,
      `#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(args)+'\\n');if(args[0]==='devices')console.log('List of devices attached\\nfixture-android device model:Fixture');else if(args.includes('screencap'))process.stdout.write(Buffer.from('89504e470d0a1a0a','hex'));else if(args.includes('cat'))process.stdout.write(${JSON.stringify(xml)});`,
      { mode: 0o700 },
    );
    process.env.ADB_PATH = executable;
    const { captureDevice } = await import("../server/native.js");
    const snapshot = await captureDevice("fixture-android", "android");
    assert.equal(snapshot.nodes[0].text, "Connect");
    assert.match(snapshot.image, /^data:image\/png;base64,/);
    const calls = (await readFile(log, "utf8"))
      .trim()
      .split("\n")
      .map(JSON.parse);
    const dump = calls.find((args) => args.includes("uiautomator"));
    assert.ok(dump.at(-1).startsWith("/sdcard/reframe-"));
    assert.ok(
      calls.some((args) => args.includes("rm") && args.at(-1) === dump.at(-1)),
    );
    await assert.rejects(
      captureDevice("unlisted-device", "android"),
      /no longer available/,
    );
  } finally {
    if (previous === undefined) delete process.env.ADB_PATH;
    else process.env.ADB_PATH = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test('minimal generation omits unused callbacks and state across frameworks', () => {
  for (const framework of Object.keys(fixtures)) {
    const staticResult = generate('<p>Hello</p>', 'ReframeStatic', framework);
    assert.doesNotMatch(staticResult.code, /onAction|useState|remember/);
    assert.doesNotMatch(staticResult.imports.join('\n'), /useState|remember|getValue|setValue/);
    assert.equal(staticResult.minimal.addedDependencies, 0);
    assert.equal(staticResult.minimal.stateFields, 0);
    assert.equal(staticResult.minimal.actionCallbacks, 0);
    const form = generate('<label for="email">Email address</label><input id="email"><a href="https://www.apple.com/">Learn more</a>', 'ReframeForm', framework);
    assert.match(form.code, /Email address/);
    assert.equal(form.minimal.stateFields, 1);
    assert.equal(form.minimal.actionCallbacks, 1);
    assert.equal(form.actions[0].href, 'https://www.apple.com/');
  }
  assert.match(generate('<details><summary>More</summary><p>Content</p></details>', 'ReframeDetails', 'react').code, /<details><summary>/);
});


test('action discovery excludes components, hooks, event callbacks and incompatible signatures', () => {
  const source = `function App(){ function noArgs(){} function save(id: string){} function event(e: MouseEvent){} const wrong=(a,b)=>{}; const useThing=(id)=>{}; const cached=useCallback((id: string)=>{},[]); return <main></main>; }`;
  assert.deepEqual(insertionPoints(source, 'App.tsx', 'react')[0].handlers.sort(), ['cached', 'save']);
});
