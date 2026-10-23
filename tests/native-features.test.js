import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { nativeItem } from '../server/native.js';
import { inspectFeature, buildFeature } from '../server/features.js';
import { Projects } from '../server/projects.js';
import { featureHandler } from '../server/features/runtime.mjs';
import { observedMarkup, reconstructLocal } from '../server/vision.js';
const run = promisify(execFile);
const fixtures = {
  android:
    '<hierarchy><node class="android.widget.LinearLayout" bounds="[0,0][390,844]"><node class="android.widget.TextView" text="Captured contacts"/><node class="android.widget.EditText" text="Email"/><node class="android.widget.Button" text="Save"/><node class="android.widget.Button" text="Count"/></node></hierarchy>',
  ios: JSON.stringify({
    type: 'Group',
    children: [
      { type: 'StaticText', label: 'Captured contacts' },
      { type: 'TextField', label: 'Email' },
      { type: 'Button', label: 'Save' },
      { type: 'Button', label: 'Count' },
    ],
  }),
};
async function temporary(fn) {
  const folder = await mkdtemp(path.join(tmpdir(), 'reframe-native-test-'));
  try {
    return await fn(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
for (const platform of ['android', 'ios'])
  test(`${platform} capture → declared logic → native source and backend installation → safe undo`, () =>
    temporary(async (folder) => {
      const item = nativeItem(fixtures[platform], platform, '1');
      const report = inspectFeature(item.html);
      assert.equal(report.fields[0].type, 'email');
      assert.deepEqual(
        report.actions.map((a) => a.operation),
        ['create', 'increment'],
      );
      const feature = await buildFeature({
        html: item.html,
        name: 'Contacts',
        spec: { ...inspectFeature(item.html), authRequired: true },
      });
      const root = path.join(folder, 'app');
      await mkdir(root);
      const file =
        platform === 'ios' ? 'Screen.swift' : 'app/src/main/java/com/reframe/demo/Screen.kt';
      const source =
        platform === 'ios'
          ? 'import SwiftUI\nstruct Screen: View { var body: some View { VStack { Text("Destination") } } }'
          : 'package com.reframe.demo\nimport androidx.compose.runtime.Composable\nimport androidx.compose.foundation.layout.Column\n@Composable fun Screen() { Column { } }';
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      if (platform === 'android')
        await writeFile(
          path.join(root, 'app/src/main/AndroidManifest.xml'),
          '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application/></manifest>',
        );
      await writeFile(path.join(root, file), source);
      const service = new Projects(path.join(folder, 'state')),
        project = await service.connect(root),
        target = await service.targets(project.id, file);
      const request = {
        projectId: project.id,
        file,
        pointId: target.points[0].id,
        hash: target.hash,
        html: item.html,
        feature,
        name: 'ReframeContacts',
      };
      const fit = await service.fit(request);
      assert.equal(fit.decision.status, 'review');
      assert.ok(
        fit.bytes > 5000,
        'Native size includes its actual UI/client code, not only the Compose wrapper.',
      );
      const plan = await service.plan(request);
      assert.equal(plan.fullStack, true);
      assert.equal(plan.analysis.files.length, 7);
      assert.ok(plan.changes.some((c) => c.file === 'reframe/server.mjs'));
      assert.match(plan.after, /ReframeContacts\(\)/);
      await service.apply(plan.id);
      assert.match(
        await readFile(
          path.join(
            root,
            platform === 'ios'
              ? 'ReframeContacts.swift'
              : 'app/src/main/java/com/reframe/demo/ReframeContactsView.java',
          ),
          'utf8',
        ),
        /apiBase/,
      );
      if (platform === 'android') {
        assert.match(
          await readFile(path.join(root, 'app/src/main/AndroidManifest.xml'), 'utf8'),
          /android.permission.INTERNET/,
        );
        assert.match(
          await readFile(
            path.join(root, 'app/src/debug/res/xml/reframe_network_security.xml'),
            'utf8',
          ),
          /<domain>10.0.2.2<\/domain>/,
        );
      }
      if (platform === 'ios' && process.platform === 'darwin')
        await run(
          'swiftc',
          [
            '-typecheck',
            path.join(root, 'ReframeClient.swift'),
            path.join(root, 'ReframeContacts.swift'),
            path.join(root, file),
          ],
          { timeout: 60000 },
        );
      const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
      assert.equal(pkg.scripts['reframe:backend'], 'node reframe/server.mjs');
      await service.undo(plan.id);
      assert.equal(await readFile(path.join(root, file), 'utf8'), source);
      await assert.rejects(readFile(path.join(root, 'reframe/server.mjs')), /ENOENT/);
    }));

test(
  'compiled Swift client exercises the real API, validation, idempotent retry, persistence and counters',
  { skip: process.platform !== 'darwin' },
  () =>
    temporary(async (folder) => {
      const item = nativeItem(fixtures.ios, 'ios', '1');
      const bundle = await buildFeature({ html: item.html, name: 'Native contacts' });
      const file = path.join(folder, 'state.json');
      const server = createServer(featureHandler(bundle.spec, file));
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      try {
        await writeFile(path.join(folder, 'Client.swift'), bundle.files['ReframeClient.swift']);
        await writeFile(
          path.join(folder, 'Probe.swift'),
          `import Foundation
@main struct Probe { static func main() async throws {
let client = ReframeClient(baseURL: URL(string:"http://127.0.0.1:${server.address().port}")!, featureID:"${bundle.spec.id}")
let original = try await client.request(); assert(original.version == 0)
let invalid = ReframeRequest(action:"action1",values:["field1":.text("invalid")],recordId:"",query:"",version:0,requestId:UUID().uuidString)
do { _ = try await client.request(invalid); fatalError("Invalid email accepted") } catch let error as ReframeFailure { assert(error.status == 400) }
let request = ReframeRequest(action:"action1",values:["field1":.text("native@example.org")],recordId:"",query:"",version:0,requestId:UUID().uuidString)
let saved = try await client.request(request); assert(saved.records.count == 1)
let retry = try await client.request(request); assert(retry.records.count == 1 && retry.version == 1)
let counter = ReframeRequest(action:"action2",values:[:],recordId:"",query:"",version:1,requestId:UUID().uuidString)
let counted = try await client.request(counter); assert(counted.counters["action2"] == 1)
let reloaded = try await client.request(); assert(reloaded.records.count == 1 && reloaded.version == 2)
print("Swift API round trip passed")
} }
`,
        );
        await run(
          'swiftc',
          [
            '-parse-as-library',
            path.join(folder, 'Client.swift'),
            path.join(folder, 'Probe.swift'),
            '-o',
            path.join(folder, 'probe'),
          ],
          { timeout: 60000 },
        );
        const result = await run(path.join(folder, 'probe'), [], { timeout: 30000 });
        assert.match(result.stdout, /round trip passed/);
        assert.equal(JSON.parse(await readFile(file, 'utf8')).records.length, 1);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    }),
);

test('fieldless native collections keep an accessible record selector and compile as SwiftUI', () =>
  temporary(async (folder) => {
    const html = '<section><button>Save</button><button>Delete</button></section>';
    const spec = inspectFeature(html);
    spec.actions[0].operation = 'create';
    const bundle = await buildFeature({ html, spec, name: 'Collection' });
    assert.equal(bundle.spec.fields.length, 0);
    assert.match(
      bundle.files['Component.swift'],
      /Button\(label\.isEmpty \? "Select record" : label\)/,
    );
    assert.match(bundle.files['ReframeFeatureView.java'], /:"Select record"/);
    if (process.platform === 'darwin') {
      await writeFile(path.join(folder, 'Client.swift'), bundle.files['ReframeClient.swift']);
      await writeFile(path.join(folder, 'Component.swift'), bundle.files['Component.swift']);
      await run(
        'swiftc',
        ['-typecheck', path.join(folder, 'Client.swift'), path.join(folder, 'Component.swift')],
        { timeout: 60000 },
      );
    }
  }));

test(
  'local OCR reconstructs real screenshot pixels and ordered video frames without an API key',
  { skip: process.platform !== 'darwin' },
  () =>
    temporary(async (folder) => {
      const image = path.join(folder, 'screen.png');
      const source = path.join(folder, 'Image.swift');
      await writeFile(
        source,
        `import AppKit
let image=NSImage(size:NSSize(width:600,height:400));image.lockFocus();NSColor.white.setFill();NSRect(x:0,y:0,width:600,height:400).fill()
for (text,y) in [("Captured contacts",300),("Email",220),("Save",140),("Count",60)] { (text as NSString).draw(at:NSPoint(x:40,y:y),withAttributes:[.font:NSFont.systemFont(ofSize:32),.foregroundColor:NSColor.black]) }
image.unlockFocus();let rep=NSBitmapImageRep(data:image.tiffRepresentation!)!;try rep.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:"${image}"))
`,
      );
      await run('swift', [source], { timeout: 60000 });
      const data = 'data:image/png;base64,' + (await readFile(image)).toString('base64');
      const result = await reconstructLocal({
        frames: [
          { image: data, time: 0 },
          { image: data, time: 1 },
        ],
      });
      assert.equal(result.observations.length, 2);
      assert.equal(result.engine, 'macOS Vision OCR');
      assert.match(result.items[0].html, /type="email"/);
      assert.match(result.items[0].html, /<button[^>]*>Save<\/button>/);
      const bundle = await buildFeature({
        html: result.items[0].html,
        name: 'Screenshot contacts',
      });
      assert.equal(bundle.spec.actions.length, 2);
      assert.throws(() => observedMarkup({ blocks: [] }), /No readable text/);
      assert.throws(
        () => observedMarkup({ blocks: [{ text: 'bad', bounds: [-1, 0, 1, 1] }] }),
        /No readable text/,
      );
    }),
);
