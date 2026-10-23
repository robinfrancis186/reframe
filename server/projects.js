import { destinationBrand } from '../src/branding.js';
import { libraryEntry } from '../src/library/catalog.js';
import { detectBranding } from './branding.js';
import { librarySource } from './library.js';
import {
  readdir,
  readFile,
  writeFile,
  realpath,
  stat,
  lstat,
  mkdir,
  rename,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parse } from '@babel/parser';
import { generate } from './generate.js';
import { projectFit } from './fit.js';
import { analyzeSource, analysisSummary } from './analyze.js';
import { reviewFeature } from './engines.js';
import { validatedFeature } from './features.js';
import { load } from 'cheerio';
import { recommendComponents, screenSignals } from './recommend.js';
import { rankWithOpenAI } from './recommend-ai.js';

const digest = (text) => createHash('sha256').update(text).digest('hex');
const priorRuntimes = {
  'reframe/runtime.mjs': [
    '659fab7c33efb910df107b98972e60bd626bc8dbf96b61dbcb947bf67d535c1a',
    'e17ed1c7d2c2b1ea23fbf41d70863e43c1b3cd28a9c7006971bead2b60fab937',
  ],
  'reframe/services.mjs': ['a9410c7fa98a24a3667490bb189247df2ded62f7bf36534b3df24b35b7dbb1a0'],
  'reframe/server.mjs': [
    'e930756247039ed7d931c72e11a0923c2bf37e116de52dbe22db8bb373f8007e',
    'ab1a15cc477b34ca45cecf2571eac41e58d29a53ee5d354d236dc0e2cc1bf19c',
    'bf4da23ba05f8e9ba505f0b4e5a8eaecdf5927adfe3a0d31bea10bbd9badb623',
  ],
};
const compatibleRuntime = (file, previous, next) =>
  previous === null ||
  previous === next ||
  (file === 'reframe/server.mjs' &&
    digest(previous) === 'b61560c7f7a9cdc5d4c6a20a177603631d4e40b8b57ed02cc81d0a2256133e7a') ||
  priorRuntimes[file]?.includes(digest(previous));
const inside = (root, file) => file.startsWith(root + path.sep);
const skip = new Set([
  'node_modules',
  'build',
  'dist',
  'Pods',
  'DerivedData',
  'vendor',
  'coverage',
]);
const parsers = (file) => ['jsx', ...(/\.tsx?$/.test(file) ? ['typescript'] : [])];

function mask(source) {
  // Keep offsets while excluding comments and quoted content from native container detection.
  return source.replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"""[\s\S]*?"""|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g,
    (s) => s.replace(/[^\n]/g, ' '),
  );
}
function nativeHandlers(masked, offset, framework) {
  const stack = [0],
    scopes = [];
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === '{') stack.push(i + 1);
    if (masked[i] === '}') {
      const start = stack.pop();
      if (start <= offset && i >= offset) scopes.push([start, i]);
    }
  }
  scopes.push([0, masked.length]);
  const names = new Set();
  for (const [start, end] of scopes) {
    let depth = 0,
      top = '';
    for (const c of masked.slice(start, end)) {
      if (c === '{') depth++;
      top += depth ? ' ' : c;
      if (c === '}') depth--;
    }
    const pattern =
      framework === 'swiftui'
        ? /\bfunc\s+(\w+)\s*\(\s*_\s+\w+\s*:\s*String\s*\)/g
        : /\bfun\s+(\w+)\s*\(\s*\w+\s*:\s*String\s*\)/g;
    for (const m of top.matchAll(pattern)) names.add(m[1]);
  }
  return [...names];
}
export function insertionPoints(source, file, framework) {
  const points = [];
  if (['react', 'react-native'].includes(framework)) {
    const ast = parse(source, { sourceType: 'module', plugins: parsers(file) });
    function walk(node, ancestors = []) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'JSXElement' && !node.openingElement.selfClosing) {
        const tag = source.slice(node.openingElement.name.start, node.openingElement.name.end);
        if (
          (framework === 'react-native'
            ? /(^|\.)(View|ScrollView|SafeAreaView)$/
            : /^(div|main|section|article|aside|header|footer|form|body)$/
          ).test(tag)
        ) {
          // Only offer handlers declared in enclosing lexical scopes, excluding nested functions.
          const handlers = new Set(),
            dataSources = new Map();
          function acceptsAction(fn, name) {
            const param = fn?.params?.[0];
            return (
              /^[a-z]/.test(name) &&
              !/^use[A-Z]/.test(name) &&
              fn?.params?.length === 1 &&
              param.type === 'Identifier' &&
              (!param.typeAnnotation ||
                param.typeAnnotation.typeAnnotation?.type === 'TSStringKeyword')
            );
          }
          function bindings(n) {
            if (!n || typeof n !== 'object') return;
            if (n.type === 'VariableDeclarator' && n.start < node.start) {
              const state =
                n.init?.type === 'CallExpression' &&
                (n.init.callee?.name === 'useState' ||
                  (n.init.callee?.object?.name === 'React' &&
                    n.init.callee?.property?.name === 'useState'));
              const name =
                n.id?.type === 'Identifier'
                  ? n.id.name
                  : state && n.id?.type === 'ArrayPattern'
                    ? n.id.elements[0]?.name
                    : null;
              if (name) {
                dataSources.delete(name);
                const value = state ? n.init.arguments[0] : n.init;
                if (value?.type === 'ArrayExpression' && value.elements.length) {
                  const strings = value.elements.every((e) => e?.type === 'StringLiteral');
                  const rows = value.elements.every(
                    (e) =>
                      e?.type === 'ObjectExpression' &&
                      ['name', 'progress'].every((key) =>
                        e.properties.some(
                          (p) =>
                            p.type === 'ObjectProperty' &&
                            !p.computed &&
                            (p.key.name || p.key.value) === key &&
                            p.value.type === (key === 'name' ? 'StringLiteral' : 'NumericLiteral'),
                        ),
                      ),
                  );
                  if (strings || rows)
                    dataSources.set(name, { name, kind: strings ? 'items' : 'rows' });
                }
              }
            }
            if (n.type === 'FunctionDeclaration' && n.id && acceptsAction(n, n.id.name))
              handlers.add(n.id.name);
            if (
              n.type === 'VariableDeclarator' &&
              n.id?.type === 'Identifier' &&
              acceptsAction(
                n.init?.type === 'CallExpression' ? n.init.arguments[0] : n.init,
                n.id.name,
              ) &&
              (['ArrowFunctionExpression', 'FunctionExpression'].includes(n.init?.type) ||
                (n.init?.type === 'CallExpression' && n.init.callee?.name === 'useCallback'))
            )
              handlers.add(n.id.name);
            if (['Program', 'BlockStatement'].includes(n.type)) n.body.forEach(bindings);
            if (n.type === 'VariableDeclaration') n.declarations.forEach(bindings);
            if (n.type === 'ExportNamedDeclaration' || n.type === 'ExportDefaultDeclaration')
              bindings(n.declaration);
          }
          for (const a of ancestors) {
            if (['Program', 'BlockStatement'].includes(a.type)) bindings(a);
            if (
              ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(
                a.type,
              )
            ) {
              function shadow(pattern) {
                if (pattern?.type === 'Identifier') dataSources.delete(pattern.name);
                else if (pattern?.type === 'ObjectPattern')
                  pattern.properties.forEach((p) => shadow(p.value || p.argument));
                else if (pattern?.type === 'ArrayPattern') pattern.elements.forEach(shadow);
                else if (pattern?.type === 'AssignmentPattern') shadow(pattern.left);
              }
              a.params.forEach(shadow);
            }
          }
          points.push({
            id: String(node.closingElement.start),
            offset: node.closingElement.start,
            label: `${tag} · line ${node.loc.start.line}`,
            dataSources: [...dataSources.values()],
            handlers: [...handlers].filter((h) => !h.startsWith('Reframe')),
          });
        }
      }
      for (const [key, value] of Object.entries(node))
        if (!['loc', 'extra'].includes(key)) {
          if (Array.isArray(value)) value.forEach((v) => walk(v, [...ancestors, node]));
          else if (value && typeof value === 'object') walk(value, [...ancestors, node]);
        }
    }
    walk(ast.program);
  } else {
    const masked = mask(source);
    const pattern =
      framework === 'swiftui'
        ? /\b(VStack|HStack|ZStack|LazyVStack|LazyHStack|ScrollView|Form|Section|List)\s*(?:\([^{}]*?\))?\s*\{/g
        : /\b(Column|Row|Box|LazyColumn|LazyRow)\s*(?:\([^{}]*?\))?\s*\{/g;
    for (const match of masked.matchAll(pattern)) {
      // Lazy list DSLs require item wrappers; offer only ordinary view containers.
      if (/^Lazy/.test(match[1]) && framework === 'compose') continue;
      const start = match.index + match[0].length;
      let balance = 1,
        end = start;
      for (; end < masked.length && balance; end++) {
        if (masked[end] === '{') balance++;
        if (masked[end] === '}') balance--;
      }
      if (!balance)
        points.push({
          id: String(end - 1),
          offset: end - 1,
          label: `${match[1]} · line ${source.slice(0, match.index).split('\n').length}`,
          handlers: nativeHandlers(masked, end - 1, framework),
        });
    }
  }
  return points;
}

export class Projects {
  constructor(store) {
    this.store = store;
    this.plans = new Map();
    this.locked = false;
  }
  async registry() {
    try {
      return JSON.parse(await readFile(path.join(this.store, 'projects.json'), 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  }
  async exclusive(fn) {
    if (this.locked) throw new Error('A project change is already running. Try again.');
    this.locked = true;
    try {
      return await fn();
    } finally {
      this.locked = false;
    }
  }
  async saveRegistry(projects) {
    await mkdir(this.store, { recursive: true, mode: 0o700 });
    await this.atomic(path.join(this.store, 'projects.json'), JSON.stringify(projects));
  }
  async atomic(file, content, mode = 0o600) {
    const temporary = `${file}.reframe-${randomUUID()}`;
    try {
      await writeFile(temporary, content, { flag: 'wx', mode });
      await rename(temporary, file);
    } finally {
      await unlink(temporary).catch((e) => {
        if (e.code !== 'ENOENT') throw e;
      });
    }
  }
  async connect(folder) {
    return this.exclusive(async () => {
      if (typeof folder !== 'string' || !path.isAbsolute(folder))
        throw new Error('Enter an absolute local project folder.');
      const root = await realpath(folder);
      if (!(await stat(root)).isDirectory() || root === path.parse(root).root)
        throw new Error('Choose an application folder.');
      const projects = await this.registry();
      const existing = projects.find((p) => p.root === root);
      if (existing) return this.inspect(existing);
      const project = { id: randomUUID(), name: path.basename(root), root };
      const result = await this.inspect(project);
      if (!result.files.length)
        throw new Error('No React, React Native, SwiftUI or Compose screens found in this folder.');
      await this.saveRegistry([...projects, project]);
      return result;
    });
  }
  async get(id) {
    const p = (await this.registry()).find((p) => p.id === id);
    if (!p) throw new Error('Connect this project first.');
    if ((await realpath(p.root)) !== p.root) throw new Error('Project location changed.');
    return p;
  }
  async inspect(project) {
    let native = false;
    try {
      const pkg = JSON.parse(await readFile(path.join(project.root, 'package.json'), 'utf8'));
      native = Boolean(pkg.dependencies?.['react-native'] || pkg.devDependencies?.['react-native']);
    } catch {}
    const files = [];
    let visited = 0;
    async function scan(dir, depth = 0) {
      if (depth > 8) return;
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (++visited > 12000)
          throw new Error('Project scan exceeds 12000 entries. Connect the app subfolder instead.');
        if (
          entry.name.startsWith('.') ||
          skip.has(entry.name) ||
          (dir === project.root && entry.name === 'reframe') ||
          entry.isSymbolicLink()
        )
          continue;
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) await scan(file, depth + 1);
        else if (
          entry.isFile() &&
          /\.(jsx|tsx|swift|kt)$/.test(entry.name) &&
          !/\.(test|spec)\./.test(entry.name)
        ) {
          if ((await stat(file)).size > 1000000) continue;
          const source = await readFile(file, 'utf8');
          const framework = entry.name.endsWith('.swift')
            ? 'swiftui'
            : entry.name.endsWith('.kt')
              ? 'compose'
              : native
                ? 'react-native'
                : 'react';
          if (
            (framework === 'swiftui' && !/\bimport SwiftUI\b/.test(source)) ||
            (framework === 'compose' && !/\bComposable\b/.test(source))
          )
            continue;
          files.push({ path: path.relative(project.root, file), framework });
        }
      }
    }
    await scan(project.root);
    return { ...project, demo: await this.isDemo(project), files };
  }
  async isDemo(project) {
    const demoRoot = await realpath(path.join(this.store, 'Demo App')).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    return project.root === demoRoot;
  }
  async source(project, relative) {
    if (
      typeof relative !== 'string' ||
      path.isAbsolute(relative) ||
      relative.split(/[\\/]/).some((p) => p === '..' || p.startsWith('.')) ||
      !/\.(jsx|tsx|swift|kt)$/.test(relative)
    )
      throw new Error('Choose a supported screen inside the project.');
    const file = path.resolve(project.root, relative);
    if (
      !inside(project.root, file) ||
      (await realpath(file)) !== file ||
      !(await lstat(file)).isFile()
    )
      throw new Error('Symlinked or external source files cannot be modified.');
    if ((await stat(file)).size > 1000000) throw new Error('Screen exceeds 1 MB.');
    return {
      file,
      text: await readFile(file, 'utf8'),
      mode: (await stat(file)).mode,
    };
  }
  async targets(id, relative) {
    const project = await this.get(id),
      info = await this.inspect(project);
    const entry = info.files.find((f) => f.path === relative);
    if (!entry) throw new Error('Screen is not in this connected project.');
    const source = await this.source(project, relative);
    return {
      framework: entry.framework,
      hash: digest(source.text),
      points: insertionPoints(source.text, relative, entry.framework),
    };
  }
  async recommendations(
    {
      id,
      file = '',
      goal = '',
      purpose = '',
      clipboard = [],
      appearance = 'light',
      provider = 'local',
      apiKey,
    },
    options = {},
  ) {
    if (
      typeof file !== 'string' ||
      typeof goal !== 'string' ||
      goal.length > 500 ||
      !['light', 'dark'].includes(appearance)
    )
      throw new Error(
        'Choose a screen, a light or dark appearance and a goal under 500 characters.',
      );
    if (
      !['local', 'openai'].includes(provider) ||
      typeof purpose !== 'string' ||
      purpose.length > 1500 ||
      (apiKey !== undefined && typeof apiKey !== 'string')
    )
      throw new Error('Choose a decision provider and keep project purpose under 1500 characters.');
    if (
      !Array.isArray(clipboard) ||
      clipboard.length > 200 ||
      clipboard.some(
        (item) =>
          !item ||
          typeof item.id !== 'string' ||
          !item.id ||
          item.id.length > 200 ||
          typeof item.name !== 'string' ||
          item.name.length > 200 ||
          typeof item.html !== 'string' ||
          item.html.length > 6000 ||
          typeof item.backend !== 'boolean' ||
          typeof item.service !== 'boolean' ||
          (item.libraryId !== undefined && !libraryEntry(item.libraryId)) ||
          (item.featureId !== undefined && !/^rf_[a-f0-9]{12}$/.test(item.featureId)),
      )
    )
      throw new Error(
        'Send up to 200 valid clipboard summaries, without package source or credentials.',
      );
    const project = await this.get(id),
      info = await this.inspect(project);
    const selected = info.files.find((entry) => entry.path === file);
    if (file && !selected) throw new Error('Screen is not in this connected project.');
    const ordered = [...info.files].sort(
      (a, b) =>
        Number(/(?:^|\/)(App|page|Screen)\./i.test(b.path)) -
          Number(/(?:^|\/)(App|page|Screen)\./i.test(a.path)) || a.path.localeCompare(b.path),
    );
    const candidates = selected
      ? [selected]
      : ordered.filter((entry) => entry.framework === ordered[0]?.framework).slice(0, 4);
    const screens = [],
      warnings = [];
    let bytes = 0;
    for (const entry of candidates) {
      const { text } = await this.source(project, entry.path);
      if (bytes + Buffer.byteLength(text) > 200000) {
        warnings.push(
          `${entry.path}: exceeds the 200 KB source sample limit; choose a smaller screen.`,
        );
        continue;
      }
      bytes += Buffer.byteLength(text);
      try {
        screens.push({ ...entry, text, signals: screenSignals(text, entry.framework) });
      } catch {
        warnings.push(
          `${entry.path}: source could not be parsed; choose another screen or check its syntax.`,
        );
      }
    }
    if (!screens.length)
      throw new Error(
        warnings.join(' ') || 'No supported screens available. Choose another project.',
      );
    let pkg = {};
    const packageFile = path.join(project.root, 'package.json');
    try {
      if (!(await lstat(packageFile)).isSymbolicLink() && (await stat(packageFile)).size < 100000)
        pkg = JSON.parse(await readFile(packageFile, 'utf8'));
    } catch {}
    const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
    const branding = await detectBranding(project.root, appearance);
    const summaries = clipboard.map((item) => ({
      ...item,
      visibleText: load(item.html, null, false).text().slice(0, 1000),
    }));
    let result = recommendComponents({
      screens,
      branding,
      clipboard: summaries,
      goal: provider === 'local' ? [purpose, goal].filter(Boolean).join(' ') : goal,
      next: !!dependencies.next,
      vite: !!dependencies.vite,
      totalScreens: info.files.length,
      semantic: provider === 'openai',
    });
    if (provider === 'openai')
      result = await rankWithOpenAI(result, {
        screens,
        branding,
        clipboard: summaries,
        purpose,
        goal,
        apiKey,
        ...options,
      });
    return {
      ...result,
      provider,
      warnings: [...warnings, ...result.warnings],
      brandName: branding.theme.brandName || project.name,
    };
  }
  async fit({
    projectId,
    file,
    pointId,
    hash,
    html,
    handler = '',
    dataBinding = '',
    feature,
    libraryId,
    theme,
    adaptBranding = true,
    appearance = 'light',
  }) {
    const project = await this.get(projectId),
      target = await this.targets(projectId, file);
    const source = await this.source(project, file);
    if (target.hash !== hash || digest(source.text) !== hash)
      throw new Error('Screen changed. Select the screen again.');
    const point = target.points.find((p) => p.id === pointId);
    if (!point) throw new Error('Select a destination container to calculate fit.');
    const branding = await detectBranding(project.root, appearance);
    const inspected = branding.cssFilesScanned;
    const themeEvidence = Object.entries(branding.theme)
      .filter(([k]) => ['primary', 'background', 'text'].includes(k))
      .map(([k, v]) => `--${k === 'text' ? 'foreground' : k}: ${v};`)
      .join('\n');
    let nextApp = false;
    try {
      const pkg = JSON.parse(await readFile(path.join(project.root, 'package.json'), 'utf8'));
      nextApp = Boolean(pkg.dependencies?.next || pkg.devDependencies?.next);
    } catch {}
    const result = projectFit({
      nextApp,
      html,
      framework: target.framework,
      source: source.text,
      handler,
      handlers: point.handlers,
      themeEvidence,
    });
    result.themeTokens = branding.theme;
    result.branding = branding;
    if (libraryId) {
      if (!adaptBranding) result.themeTokens = {};
      const generated = await librarySource(
        libraryId,
        'ReframeLibraryFit',
        destinationBrand(theme, branding.theme, target.framework, adaptBranding),
        false,
        ['swiftui', 'compose'].includes(target.framework) ? target.framework : 'react',
      );
      const requirements = libraryEntry(libraryId).requirements;
      const supported =
        ['react', 'swiftui', 'compose'].includes(target.framework) &&
        !(target.framework === 'react' && nextApp && !/^\s*["']use client["']/.test(source.text)) &&
        !(target.framework === 'compose' && /androidx\.compose\.material\./.test(source.text));
      result.bytes = Buffer.byteLength(generated.code + generated.imports.join('\n'));
      result.actions = 0;
      result.elements = (
        generated.code.match(
          target.framework === 'react'
            ? /<[a-z][a-z0-9-]*/g
            : /\b(?:Text|Button|Toggle|Picker|DatePicker|Slider|Checkbox|OutlinedTextField|Menu|Surface|Canvas|Circle|Rectangle)\(/g,
        ) || []
      ).length;
      result.categories[0].reason = `Original ${target.framework} controls and their local behavior are included.`;
      const themeCategory = result.categories.find((c) => c.name === 'Theme');
      themeCategory.reason = !adaptBranding
        ? 'The saved palette is applied; automatic destination branding is off.'
        : target.framework === 'react'
          ? 'Detected destination branding or selected tokens are applied.'
          : 'Detected native colors are applied; unresolved colors and typography inherit the native theme.';
      const accessibility = result.categories.find((c) => c.name === 'Accessibility');
      accessibility.score = 85;
      accessibility.reason =
        'Authored labels and native control semantics. Screen-reader testing in the destination is still required.';
      const action = result.categories.find((c) => c.name === 'Action wiring');
      const bindingKind =
        libraryId === 'search' ? 'items' : libraryId === 'be-table' ? 'rows' : null;
      if (
        dataBinding &&
        (target.framework !== 'react' ||
          !bindingKind ||
          !point.dataSources?.some((d) => d.name === dataBinding && d.kind === bindingKind))
      )
        throw new Error('Choose compatible project data available at this insertion point.');
      action.score = requirements.length ? 60 : 100;
      action.reason = requirements.length
        ? 'Local UI logic is included. ' + requirements.join(' ')
        : 'Original local interaction logic is included. No demo handler or backend is required.';
      if (bindingKind) {
        action.score = dataBinding ? 95 : 70;
        action.reason = dataBinding
          ? `Reads ${dataBinding} from the existing screen; verify its values and update behavior in the app.`
          : 'Local interactions work with sample data. Bind project data before treating this as a connected feature.';
      }
      const size = result.categories.find((c) => c.name === 'Code size');
      size.score = result.bytes <= 10240 ? 100 : 80;
      size.reason = `${(result.bytes / 1024).toFixed(1)} KB including the selected component and shared styles. No new dependencies.`;
      if (!supported) {
        result.categories[0].score = 0;
        result.categories[0].reason =
          'Choose a React client screen, SwiftUI container, or Material 3 Compose screen.';
      }
      result.score = Math.round(
        result.categories.reduce((sum, c) => sum + (c.score * c.weight) / 100, 0),
      );
      result.verdict = supported
        ? requirements.length
          ? 'UI ready; connect required services'
          : 'Interactive component ready for review'
        : 'Supported destination needed';
      result.decision = {
        model: 'Local rules v1',
        status: supported ? 'review' : 'blocked',
        label: result.verdict,
        reason: supported
          ? 'Selected source and local state are included; verify in your destination.'
          : result.categories[0].reason,
        frontend: `Original ${target.framework} component styled for the destination.`,
        logic: 'Local interaction behavior included.',
        backend: requirements.length
          ? requirements.join(' ')
          : 'None required for this UI primitive.',
      };
      result.recommendations = result.categories.filter((c) => c.score < 85).map((c) => c.reason);
    }
    if (feature) {
      const bundle = await validatedFeature({ html, feature });
      if ((bundle.spec.commerce || bundle.spec.website) && target.framework !== 'react')
        throw new Error(
          'Product/cart and rendered website packages currently require a React + Vite web screen.',
        );
      const pkg = JSON.parse((await this.changeSource(project, 'package.json')).text || '{}');
      const supported =
        ['swiftui', 'compose'].includes(target.framework) ||
        (target.framework === 'react' &&
          Boolean(pkg.devDependencies?.vite || pkg.dependencies?.vite) &&
          !nextApp);
      const frontendFiles =
        target.framework === 'swiftui'
          ? ['Component.swift', 'ReframeClient.swift']
          : target.framework === 'compose'
            ? ['Component.kt', 'ReframeFeatureView.java']
            : ['Component.tsx'];
      if (target.framework === 'react' && bundle.files['Account.tsx'])
        frontendFiles.push('Account.tsx');
      result.bytes = frontendFiles.reduce(
        (bytes, file) => bytes + Buffer.byteLength(bundle.files[file]),
        0,
      );
      result.bundleBytes = bundle.bytes;
      const size = result.categories.find((c) => c.name === 'Code size');
      size.score =
        result.bytes <= 3072 ? 100 : result.bytes <= 10240 ? 80 : result.bytes <= 30720 ? 50 : 20;
      size.reason = `${(result.bytes / 1024).toFixed(1)} KB generated frontend; ${(bundle.bytes / 1024).toFixed(1)} KB full package including backend and setup. Excludes dependencies and compiled bundles.`;
      const action = result.categories.find((c) => c.name === 'Action wiring');
      action.score = 90;
      action.reason =
        'Actions call the bundled API or declared local behavior. Run the destination with its generated runtime and verify the rules.';
      const framework = result.categories[0];
      if (!supported) {
        framework.score = 0;
        framework.reason =
          'Automatic full-stack installation supports React + Vite, SwiftUI and Android Compose.';
      }
      result.score = Math.round(
        result.categories.reduce((sum, c) => sum + (c.score * c.weight) / 100, 0),
      );
      result.verdict = supported ? 'Full-stack source ready for review' : 'Runtime adapter needed';
      result.decision = {
        model: 'Local rules v1',
        status: supported ? 'review' : 'blocked',
        label: supported ? 'Review frontend and backend together' : 'Choose a supported runtime',
        reason: supported
          ? 'A declared behavior contract, validated API and local storage are bundled. Destination runtime verification is still required.'
          : framework.reason,
        frontend:
          'Captured content with generated state, validation errors and record selection. Native layout uses platform controls.',
        logic: `${bundle.spec.actions.length} explicitly defined actions.`,
        backend:
          'Our generated local API and atomic storage. Authentication, payments and external services require separate implementations.',
      };
      result.recommendations = result.categories.filter((c) => c.score < 85).map((c) => c.reason);
      if (bundle.spec.website) {
        framework.score = supported ? 100 : 0;
        framework.reason = supported
          ? 'Browser-native HTML, CSS and SVG run inside the generated React wrapper.'
          : 'This package needs React + Vite.';
        result.themeTokens = {};
        const palette = result.categories.find((c) => c.name === 'Theme');
        palette.score = 70;
        palette.reason =
          'Reference styling is preserved in an isolated document. Destination branding does not recolor this package.';
        result.score = Math.round(
          result.categories.reduce((sum, c) => sum + (c.score * c.weight) / 100, 0),
        );
        result.decision.frontend =
          'Original rendered HTML, CSS and SVG isolated in a reusable React component.';
        result.decision.logic =
          'Local routes, search, supported UI controls and bundled PDF downloads.';
        result.decision.backend =
          'Independently authored form validation, idempotent local storage and receipts. No email or original private service is called.';
        result.recommendations = result.categories.filter((c) => c.score < 85).map((c) => c.reason);
      }
    }
    return {
      ...result,
      cssFilesInspected: inspected,
      themeFilesInspected: branding.filesScanned,
      hash,
    };
  }
  async plan({
    projectId,
    file,
    pointId,
    hash,
    html,
    name = 'ReframeComponent',
    handler = '',
    dataBinding = '',
    theme,
    feature,
    libraryId,
    adaptBranding = true,
    appearance = 'light',
  }) {
    const project = await this.get(projectId),
      target = await this.targets(projectId, file),
      source = await this.source(project, file);
    if (target.hash !== hash || digest(source.text) !== hash)
      throw new Error('Screen changed. Reload insertion points before preparing the change.');
    const point = target.points.find((p) => p.id === pointId);
    if (!point) throw new Error('Select an available insertion point.');
    if (feature && libraryId)
      throw new Error('A library primitive cannot also be a captured feature.');
    if (libraryId && !['react', 'swiftui', 'compose'].includes(target.framework))
      throw new Error('Choose React, SwiftUI or Android Compose for this original component.');
    if (feature)
      return this.featurePlan({ project, target, source, point, file, name, html, feature });
    if (new RegExp(`\\b${name.replace(/[^A-Za-z0-9]/g, '')}\\b`).test(source.text))
      throw new Error('That component name is already in this screen. Choose a different name.');
    const generated = libraryId
      ? await librarySource(
          libraryId,
          name,
          destinationBrand(
            theme,
            (await detectBranding(project.root, appearance)).theme,
            target.framework,
            adaptBranding,
          ),
          file.endsWith('.tsx'),
          target.framework,
        )
      : generate(html, name, target.framework, file.endsWith('.tsx'));
    if (libraryId && target.framework === 'react')
      generated.imports = generated.imports.filter((line) => line !== '"use client";');
    if (target.framework === 'react') {
      let pkg;
      try {
        pkg = JSON.parse(await readFile(path.join(project.root, 'package.json'), 'utf8'));
      } catch {}
      if (
        (pkg?.dependencies?.next || pkg?.devDependencies?.next) &&
        !/^\s*["']use client["']/.test(source.text) &&
        (libraryId || /onClick|onChange/.test(generated.code))
      )
        throw new Error(
          'This Next.js screen is a server component. Choose an existing "use client" component for interactive integration.',
        );
    }
    if (target.framework === 'compose' && /import androidx\.compose\.material\./.test(source.text))
      throw new Error(
        'This screen uses Material 2. Automatic Compose integration currently requires a Material 3 screen.',
      );
    if (handler && (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(handler) || !point.handlers.includes(handler)))
      throw new Error('Choose a handler available at this insertion point.');
    const bindingKind = libraryId === 'search' ? 'items' : libraryId === 'be-table' ? 'rows' : null;
    if (
      dataBinding &&
      (target.framework !== 'react' ||
        !bindingKind ||
        !point.dataSources?.some((d) => d.name === dataBinding && d.kind === bindingKind))
    )
      throw new Error('Choose compatible project data available at this insertion point.');
    const warnings = [...generated.warnings];
    if (bindingKind && !dataBinding)
      warnings.push(
        'This preset uses sample data. Bind compatible project data or pass props in your app.',
      );

    let call;
    if (target.framework === 'swiftui') {
      call = `${name}(${generated.actions.length ? `onAction: ${handler || '{ action in print("Reframe action:", action) }'}` : ''})`;
      if (!handler && generated.actions.length)
        warnings.push(
          'SwiftUI actions currently log their identifier. Replace the onAction closure with your app navigation or business logic.',
        );
    } else if (target.framework === 'compose') {
      call = `${name}(${generated.actions.length ? `onAction = ${handler ? '::' + handler : '{ action -> println("Reframe action: $action") }'}` : ''})`;
      if (!handler && generated.actions.length)
        warnings.push(
          'Compose actions currently log their identifier. Replace onAction with your app navigation or business logic.',
        );
    } else {
      let colors = '';
      if (target.framework === 'react-native') {
        const valid = (value) => /^#[0-9a-f]{6}$/i.test(value || '');
        if (![theme?.primary, theme?.text, theme?.background].every(valid))
          throw new Error('Select valid project colors before integrating React Native.');
        colors = ` theme={${JSON.stringify({ primary: theme.primary, onPrimary: '#ffffff', text: theme.text, background: theme.background })}}`;
        warnings.push(
          'React Native uses the selected project colors. Connect the generated theme prop to your app theme provider for dynamic themes.',
        );
      }
      call = `<${name}${dataBinding ? ` ${bindingKind}={${dataBinding}}` : ''}${libraryId === 'search' && handler ? ` onSelect={${handler}}` : ''}${generated.actions.length ? ` onAction={${handler || '(action) => console.info("Reframe action:", action)'}}` : ''}${colors} />`;
      if (!handler && generated.actions.length)
        warnings.push('Actions log their identifier until you connect an existing handler.');
    }
    let after =
      source.text.slice(0, point.offset) +
      `\n    ${call}\n  ` +
      source.text.slice(point.offset) +
      `\n\n${generated.code}\n`;
    const imports = generated.imports.filter(
      (i) => !source.text.split('\n').some((line) => line.trim() === i),
    );
    if (imports.length) {
      let offset = 0;
      if (['react', 'react-native'].includes(target.framework)) {
        const ast = parse(source.text, {
          sourceType: 'module',
          plugins: parsers(file),
        });
        offset = ast.program.directives.at(-1)?.end || 0;
      } else if (target.framework === 'compose') {
        const declaration = source.text.match(/^package[^\n]+/m);
        offset = declaration ? declaration.index + declaration[0].length : 0;
      }
      after = after.slice(0, offset) + '\n' + imports.join('\n') + '\n' + after.slice(offset);
    }
    if (['react', 'react-native'].includes(target.framework))
      parse(after, { sourceType: 'module', plugins: parsers(file) });
    const fit = await this.fit({
      projectId,
      file,
      pointId,
      hash,
      html,
      handler,
      libraryId,
      theme,
      adaptBranding,
      appearance,
    });
    let analysis = {
      status: 'not-applicable',
      limitation:
        'The embedded REA analyzer supports JavaScript/TypeScript. Native runtime and binary analysis require separate toolchains and app artifacts.',
    };
    if (['react', 'react-native'].includes(target.framework)) {
      try {
        analysis = analysisSummary(
          await analyzeSource(generated.imports.join('\n') + '\n' + generated.code),
        );
      } catch (error) {
        analysis = { status: 'failed', limitation: error.message };
        warnings.push(`REA analysis did not complete: ${error.message}`);
      }
    }
    const plan = {
      id: randomUUID(),
      projectId,
      file,
      name,
      before: source.text,
      after,
      mode: source.mode,
      warnings,
      actions: generated.actions,
      analysis,
      decision: fit.decision,
      minimal: generated.minimal,
      created: Date.now(),
      framework: target.framework,
    };
    // Plans are short-lived; the durable undo record is written before modifying source.
    for (const [id, p] of this.plans) if (Date.now() - p.created > 1800000) this.plans.delete(id);
    if (this.plans.size >= 40) this.plans.delete(this.plans.keys().next().value);
    this.plans.set(plan.id, plan);
    return plan;
  }
  async changeSource(project, relative) {
    if (
      typeof relative !== 'string' ||
      path.isAbsolute(relative) ||
      relative
        .split(/[\\/]/)
        .some((p) => !p || p === '..' || (p.startsWith('.') && p !== '.gitignore')) ||
      relative.includes('node_modules')
    )
      throw new Error('Invalid feature file path.');
    const file = path.resolve(project.root, relative);
    if (!inside(project.root, file)) throw new Error('Feature file is outside this app.');
    let current = project.root;
    for (const part of relative.split('/')) {
      current = path.join(current, part);
      try {
        if ((await lstat(current)).isSymbolicLink())
          throw new Error('Symlinked feature files cannot be modified.');
      } catch (e) {
        if (e.code === 'ENOENT') break;
        throw e;
      }
    }
    try {
      const info = await stat(file);
      const limit = /^reframe\/features\/rf_[a-f0-9]{12}\/feature\.json$/.test(relative)
        ? 6100000
        : 1000000;
      if (!info.isFile() || info.size > limit)
        throw new Error('Feature destination exceeds its bounded source or website-data limit.');
      return { file, text: await readFile(file, 'utf8'), mode: info.mode };
    } catch (e) {
      if (e.code === 'ENOENT') return { file, text: null, mode: 0o600 };
      throw e;
    }
  }
  async featurePlan({ project, target, source, point, file, name, html, feature }) {
    if (['swiftui', 'compose'].includes(target.framework))
      return this.nativeFeaturePlan({ project, target, source, point, file, name, html, feature });
    if (target.framework !== 'react' || !/^Reframe[A-Za-z0-9]{1,60}$/.test(name))
      throw new Error(
        'Full-stack installation currently needs a React web screen and a valid Reframe component name.',
      );
    const pkgSource = await this.changeSource(project, 'package.json');
    const pkg = JSON.parse(pkgSource.text);
    if (!(pkg.devDependencies?.vite || pkg.dependencies?.vite) || pkg.dependencies?.next)
      throw new Error(
        'Automatic full-stack installation requires a React + Vite app. Export the package for other runtimes.',
      );
    const bundle = await validatedFeature({ html, feature });
    const directory = `reframe/features/${bundle.spec.id}`;
    const component = directory + '/Component.tsx';
    let relative = path
      .relative(path.dirname(file), component)
      .replaceAll('\\', '/')
      .replace(/\.tsx$/, '');
    if (!relative.startsWith('.')) relative = './' + relative;
    const ast = parse(source.text, { sourceType: 'module', plugins: parsers(file) });
    const installed = ast.program.body.find(
      (n) =>
        n.type === 'ImportDeclaration' &&
        n.source.value === relative &&
        n.specifiers.some((s) => s.type === 'ImportDefaultSpecifier' && s.local.name === name),
    );
    if (!installed && new RegExp(`\\b${name}\\b`).test(source.text))
      throw new Error('Choose a different component name; this one belongs to existing source.');
    let after = source.text;
    if (!installed) {
      after =
        source.text.slice(0, point.offset) + `\n<${name} />\n` + source.text.slice(point.offset);
      const offset = ast.program.directives.at(-1)?.end || 0;
      after =
        after.slice(0, offset) +
        `\nimport ${name} from ${JSON.stringify(relative)};\n` +
        after.slice(offset);
    }
    parse(after, { sourceType: 'module', plugins: parsers(file) });
    const outputs = {
      [file]: after,
      [component]: bundle.files['Component.tsx'],
      [directory + '/feature.json']: bundle.files['feature.json'],
      [directory + '/README.md']: bundle.files['README.md'],
    };
    if (bundle.files['Account.tsx'])
      outputs[directory + '/Account.tsx'] = bundle.files['Account.tsx'];
    if (bundle.spec.commerce)
      outputs[directory + '/commerce.mjs'] = bundle.files['commerce.mjs'].replace(
        "from './services.mjs'",
        "from '../../services.mjs'",
      );
    if (bundle.spec.website)
      outputs[directory + '/website.mjs'] = bundle.files['website.mjs'].replace(
        "from './services.mjs'",
        "from '../../services.mjs'",
      );
    for (const [relative, content] of Object.entries({
      'reframe/runtime.mjs': bundle.files['runtime.mjs'],
      'reframe/server.mjs': bundle.files['server.mjs'],
      'reframe/services.mjs': bundle.files['services.mjs'],
    })) {
      const existing = await this.changeSource(project, relative);
      if (!compatibleRuntime(relative, existing.text, content))
        throw new Error(
          'This app has a different Reframe runtime. Review a runtime migration before adding this package.',
        );
      outputs[relative] = content;
    }
    pkg.scripts ||= {};
    for (const [key, value] of Object.entries({
      'reframe:dev': 'node reframe/server.mjs',
      'reframe:start': 'node reframe/server.mjs --production',
    })) {
      if (pkg.scripts[key] && pkg.scripts[key] !== value)
        throw new Error(`Existing ${key} script conflicts with the generated runtime.`);
      pkg.scripts[key] = value;
    }
    outputs['package.json'] = JSON.stringify(pkg, null, 2) + '\n';
    const ignored = await this.changeSource(project, '.gitignore');
    outputs['.gitignore'] =
      (ignored.text || '') +
      ((ignored.text || '').split('\n').includes('/.reframe/') ? '' : '\n/.reframe/\n');
    const changes = [];
    for (const [relative, after] of Object.entries(outputs)) {
      const before = await this.changeSource(project, relative);
      if (relative === component && before.text !== null && !installed)
        throw new Error('This feature is already installed in that app.');
      if (before.text !== after)
        changes.push({ file: relative, before: before.text, after, mode: before.mode });
    }
    const review = await reviewFeature(bundle.files, html);
    const plan = {
      id: randomUUID(),
      projectId: project.id,
      file,
      name,
      before: source.text,
      after,
      mode: source.mode,
      changes,
      framework: 'react',
      actions: bundle.spec.actions,
      warnings: [
        (await this.isDemo(project))
          ? 'Launch demo app after installing or updating to build and start the current interface and backend.'
          : 'Start or restart the destination with npm run reframe:dev. Its frontend and backend run together on port 5175 (override PORT if needed).',
        'Optional accounts and API keys remain local. Add TLS, identity recovery and database transactions before public hosting.',
        'Undo keeps runtime data in .reframe/data so saved user records are never deleted.',
      ],
      analysis: review.analysis,
      review,
      minimal: {
        addedDependencies: 0,
        stateFields: bundle.spec.fields.length,
        actionCallbacks: bundle.spec.actions.length ? 1 : 0,
      },
      created: Date.now(),
      fullStack: true,
    };
    if (this.plans.size >= 40) this.plans.delete(this.plans.keys().next().value);
    this.plans.set(plan.id, plan);
    return plan;
  }
  async nativeFeaturePlan({ project, target, source, point, file, name, html, feature }) {
    if (!/^Reframe[A-Za-z0-9]{1,60}$/.test(name))
      throw new Error('Use a Reframe component name with letters and numbers.');
    const bundle = await validatedFeature({ html, feature });
    if (bundle.spec.commerce || bundle.spec.website)
      throw new Error(
        'Product/cart and rendered website packages currently require a React + Vite web screen.',
      );
    const swift = target.framework === 'swiftui',
      folder = path.dirname(file);
    const packageName = source.text.match(/^\s*package\s+([A-Za-z_][\w.]*)/m)?.[1];
    const prefix = packageName ? `package ${packageName}\n\n` : '';
    const className = name + 'View';
    const component = path.join(folder, name + (swift ? '.swift' : '.kt')).replaceAll('\\', '/');
    const existing = await this.changeSource(project, component);
    const installed = new RegExp(`\\b${name}\\s*\\(`).test(mask(source.text));
    if (
      (existing.text !== null) !== installed ||
      new RegExp(`\\b(?:struct|class|fun)\\s+${name}\\b`).test(mask(source.text))
    )
      throw new Error('This component name conflicts with existing source. Choose another name.');
    const after = installed
      ? source.text
      : source.text.slice(0, point.offset) + `\n${name}()\n` + source.text.slice(point.offset);
    const outputs = {
      [file]: after,
      [component]: swift
        ? bundle.files['Component.swift'].replace(/\bReframeFeature\b/g, name)
        : prefix +
          bundle.files['Component.kt']
            .replace(/\bReframeFeature\b/g, name)
            .replace(/\bReframeFeatureView\b/g, className),
    };
    if (swift) {
      const core = path.join(folder, 'ReframeClient.swift').replaceAll('\\', '/');
      const previous = await this.changeSource(project, core);
      if (
        previous.text !== null &&
        previous.text !== bundle.files['ReframeClient.swift'] &&
        digest(previous.text) !== '95b0615853edfdf814d4b05c67e44b7eb9d7270f33904fdef3c2fd4657f544ff'
      )
        throw new Error('Native client runtime differs. Review a migration before replacing it.');
      outputs[core] = bundle.files['ReframeClient.swift'];
    } else {
      // Android compiles Java from src/main/java even when the selected Kotlin screen is under src/main/kotlin.
      const sourceRoot = file.match(/^(.*\/src\/[^/]+)\/(?:java|kotlin)\//)?.[1];
      const java = sourceRoot
        ? `${sourceRoot}/java/${packageName?.replaceAll('.', '/') || ''}/${className}.java`.replace(
            /\/+/g,
            '/',
          )
        : path.join(folder, className + '.java').replaceAll('\\', '/');
      outputs[java] =
        (packageName ? `package ${packageName};\n\n` : '') +
        bundle.files['ReframeFeatureView.java'].replace(/\bReframeFeatureView\b/g, className);
      if (sourceRoot?.endsWith('/src/main')) {
        const manifestFile = sourceRoot + '/AndroidManifest.xml',
          manifest = await this.changeSource(project, manifestFile);
        if (manifest.text === null) throw new Error('Android main manifest is missing.');
        const xml = load(manifest.text, { xmlMode: true });
        if (
          !xml('uses-permission')
            .toArray()
            .some((n) => n.attribs['android:name'] === 'android.permission.INTERNET')
        )
          xml('manifest').prepend('<uses-permission android:name="android.permission.INTERNET"/>');
        outputs[manifestFile] = xml.xml();
        const debugRoot = sourceRoot.replace(/\/main$/, '/debug'),
          debugFile = debugRoot + '/AndroidManifest.xml';
        const debug = await this.changeSource(project, debugFile);
        const dx = load(
          debug.text ||
            '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application/></manifest>',
          { xmlMode: true },
        );
        if (!dx('application').length) dx('manifest').append('<application/>');
        const policy = dx('application').attr('android:networkSecurityConfig');
        if (policy && policy !== '@xml/reframe_network_security')
          throw new Error(
            'Existing Android debug network policy needs explicit localhost configuration. Reframe will not overwrite it.',
          );
        dx('application').attr('android:networkSecurityConfig', '@xml/reframe_network_security');
        outputs[debugFile] = dx.xml();
        outputs[debugRoot + '/res/xml/reframe_network_security.xml'] =
          '<network-security-config><base-config cleartextTrafficPermitted="false"/><domain-config cleartextTrafficPermitted="true"><domain>localhost</domain><domain>127.0.0.1</domain><domain>10.0.2.2</domain></domain-config></network-security-config>\n';
      }
    }
    outputs[`reframe/features/${bundle.spec.id}/feature.json`] = bundle.files['feature.json'];
    for (const [relative, content] of Object.entries({
      'reframe/runtime.mjs': bundle.files['runtime.mjs'],
      'reframe/server.mjs': bundle.files['native-server.mjs'],
      'reframe/services.mjs': bundle.files['services.mjs'],
    })) {
      const prior = await this.changeSource(project, relative);
      if (!compatibleRuntime(relative, prior.text, content))
        throw new Error('A different backend runtime is installed. Review migration first.');
      outputs[relative] = content;
    }
    const pkg = JSON.parse(
      (await this.changeSource(project, 'package.json')).text || '{"private":true,"type":"module"}',
    );
    pkg.scripts ||= {};
    if (
      pkg.scripts['reframe:backend'] &&
      pkg.scripts['reframe:backend'] !== 'node reframe/server.mjs'
    )
      throw new Error('Backend launch script conflicts with existing project.');
    pkg.scripts['reframe:backend'] = 'node reframe/server.mjs';
    outputs['package.json'] = JSON.stringify(pkg, null, 2) + '\n';
    const ignored = (await this.changeSource(project, '.gitignore')).text || '';
    outputs['.gitignore'] =
      ignored + (ignored.split('\n').includes('/.reframe/') ? '' : '\n/.reframe/\n');
    const changes = [];
    for (const [relative, content] of Object.entries(outputs)) {
      const previous = await this.changeSource(project, relative);
      if (previous.text !== content)
        changes.push({
          file: relative,
          before: previous.text,
          after: content,
          mode: previous.mode,
        });
    }
    const review = await reviewFeature(bundle.files, html);
    const plan = {
      id: randomUUID(),
      projectId: project.id,
      file,
      name,
      before: source.text,
      after,
      mode: source.mode,
      changes,
      framework: target.framework,
      actions: bundle.spec.actions,
      analysis: review.analysis,
      review,
      fullStack: true,
      minimal: { addedDependencies: 0, stateFields: bundle.spec.fields.length, actionCallbacks: 1 },
      warnings: [
        'Run npm run reframe:backend on this Mac. Native clients use port 5176; production needs your authenticated HTTPS backend.',
        swift
          ? 'Add generated Swift files to your app target if Xcode uses explicit file references. SwiftPM and synchronized folders discover them automatically.'
          : 'Requires Android INTERNET permission. Allow localhost/10.0.2.2 HTTP only in debug network security settings. Physical Android can use adb reverse tcp:5176 tcp:5176 and apiBase http://127.0.0.1:5176.',
        'REA checks JS/TS and schema only. Compile and run the native destination before shipping.',
        'Optional accounts isolate user records. This loopback backend is not a hosted identity service. Undo preserves accounts, keys and records.',
      ],
      created: Date.now(),
    };
    if (this.plans.size >= 40) this.plans.delete(this.plans.keys().next().value);
    this.plans.set(plan.id, plan);
    return plan;
  }
  async restoreFiles(project, changes) {
    for (const change of [...changes].reverse()) {
      const current = await this.changeSource(project, change.file);
      if (current.text === change.before) continue;
      if (current.text !== change.after)
        throw new Error(
          'A feature file has newer edits. Reframe will not overwrite them: ' + change.file,
        );
      if (change.before === null) await unlink(current.file);
      else await this.atomic(current.file, change.before, change.mode);
    }
  }
  async apply(id) {
    return this.exclusive(async () => {
      const plan = this.plans.get(id);
      if (!plan || Date.now() - plan.created > 1800000)
        throw new Error('Change expired. Prepare it again.');
      const project = await this.get(plan.projectId),
        current = await this.source(project, plan.file);
      if (plan.changes) {
        for (const c of plan.changes)
          if ((await this.changeSource(project, c.file)).text !== c.before)
            throw new Error(
              'A feature file changed since review. No files were modified: ' + c.file,
            );
        const record = path.join(this.store, 'changes', `${plan.id}.json`);
        await mkdir(path.dirname(record), { recursive: true, mode: 0o700 });
        await this.atomic(record, JSON.stringify({ ...plan, state: 'prepared' }));
        try {
          for (const c of plan.changes) {
            const destination = await this.changeSource(project, c.file);
            await mkdir(path.dirname(destination.file), { recursive: true, mode: 0o700 });
            await this.atomic(destination.file, c.after, c.mode);
          }
          await this.atomic(record, JSON.stringify({ ...plan, state: 'applied' }));
        } catch (e) {
          try {
            await this.restoreFiles(project, plan.changes);
            await unlink(record);
          } catch {
            throw new Error(
              'Installation interrupted. Use Undo integration to recover the recorded files.',
            );
          }
          throw e;
        }
        this.plans.delete(id);
        return {
          id,
          file: plan.file,
          message:
            plan.framework === 'react'
              ? 'Frontend, API, storage runtime and scripts installed. Start this app with npm run reframe:dev (port 5175); build and run npm run reframe:start for production.'
              : 'Native UI, API client, backend and storage installed. Run npm run reframe:backend on this Mac (port 5176), then build the native app with its platform tools.',
        };
      }
      if (current.text !== plan.before)
        throw new Error(
          'Screen changed since preview. No files were modified. Prepare a new change.',
        );
      await mkdir(path.join(this.store, 'changes'), {
        recursive: true,
        mode: 0o700,
      });
      await this.atomic(path.join(this.store, 'changes', `${plan.id}.json`), JSON.stringify(plan));
      await this.atomic(current.file, plan.after, current.mode);
      this.plans.delete(id);
      return {
        id,
        file: plan.file,
        message: 'Component inserted into the screen. Build and run your app to verify the result.',
      };
    });
  }
  async history() {
    let files;
    try {
      files = await readdir(path.join(this.store, 'changes'));
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
    const records = await Promise.all(
      files
        .filter((f) => /^[\da-f-]+\.json$/.test(f))
        .map(async (f) => {
          const p = JSON.parse(await readFile(path.join(this.store, 'changes', f), 'utf8'));
          return {
            id: p.id,
            projectId: p.projectId,
            file: p.file,
            name: p.name,
            created: p.created,
          };
        }),
    );
    return records.sort((a, b) => b.created - a.created);
  }
  async undo(id) {
    return this.exclusive(async () => {
      if (!/^[\da-f-]{36}$/.test(id)) throw new Error('Invalid change.');
      const record = path.join(this.store, 'changes', `${id}.json`),
        plan = JSON.parse(await readFile(record, 'utf8'));
      const project = await this.get(plan.projectId),
        current = await this.source(project, plan.file);
      if (plan.changes) {
        for (const c of plan.changes) {
          const now = (await this.changeSource(project, c.file)).text;
          if (now !== c.after && now !== c.before)
            throw new Error('A feature file has newer edits. Undo will not overwrite: ' + c.file);
        }
        await this.restoreFiles(project, plan.changes);
        await unlink(record);
        return {
          message: 'Frontend and backend integration undone. Saved feature data was preserved.',
        };
      }
      if (current.text !== plan.after)
        throw new Error(
          'This screen has newer edits. Undo those changes first; Reframe will not overwrite them.',
        );
      await this.atomic(current.file, plan.before, current.mode);
      await unlink(record);
      return { message: 'Integration undone. Original screen restored.' };
    });
  }
}
