import { transformWithEsbuild } from 'vite';
import { nativeLibrarySource } from './library-native.js';
import { readFile } from 'node:fs/promises';
import { parse } from '@babel/parser';
import { libraryEntry, libraryStyles } from '../src/library/catalog.js';
import { themeStyle } from '../src/branding.js';

export async function librarySource(id, name = 'ReframeOriginal', theme, typescript = false, framework = 'react') {
  const entry = libraryEntry(id);
  if (!entry) throw new Error('Choose a Reframe library component.');
  if (typeof name !== 'string' || !/^[A-Z][A-Za-z0-9]{0,60}$/.test(name)) throw new Error('Use a component name starting with a capital letter (letters and numbers only).');
  const variables = themeStyle(theme);
  if (framework !== 'react') return nativeLibrarySource(entry,name,theme,framework);
  let source, declaration, typedSource = false;
  for (const file of ['Components.jsx','Expanded.tsx']) {
    source = await readFile(new URL('../src/library/' + file, import.meta.url), 'utf8');
    declaration = parse(source, {sourceType:'module',plugins:['jsx','typescript']}).program.body.find(node => node.type === 'ExportNamedDeclaration' && node.declaration?.id?.name === entry.component)?.declaration;
    if (declaration) { typedSource = file.endsWith('.tsx'); break; }
  }
  if (!declaration) throw new Error('Library source unavailable.');
  const alias = '__' + name + 'React', view = name + 'View';
  let logic = source.slice(declaration.start,declaration.end).replace(`function ${entry.component}`,`function ${view}`).replace(/\b(useEffect|useId|useRef|useState)(?=\s*(?:<|\())/g,`${alias}.$1`);
  if (!typescript && typedSource) logic = (await transformWithEsbuild(logic,'Original.tsx',{loader:'tsx',jsx:'preserve',target:'es2022',tsconfigRaw:{compilerOptions:{jsx:'preserve'}}})).code;
  if (typescript && !typedSource) logic = logic.replaceAll('useRef(null)','useRef<HTMLDialogElement>(null)');
  const supplied = {...entry.props, brandName:theme.brandName || 'Your brand',tagline:theme.tagline || 'Good things start with a little intention.',logo:theme.logo || '',previewOnly:false};
  const argument = declaration.params[0]?.type === 'AssignmentPattern' ? declaration.params[0].left : declaration.params[0];
  const keys = new Set(argument?.type === 'ObjectPattern' ? argument.properties.map(property=>property.key?.name) : []);
  const props = Object.fromEntries(Object.entries(supplied).filter(([key])=>keys.has(key)));
  const dataProps=entry.component==='LibrarySearch'?'items,onSelect':entry.component==='LibraryTable'?'rows':'';
  const dataType=entry.component==='LibrarySearch'?'items?:readonly string[];onSelect?:(value:string)=>void':'rows?:readonly {name:string;progress:number}[]';
  const signature=dataProps?`{${dataProps}}${typescript?`:{${dataType}}`:''}={}`:'';
  const code = `${typescript ? '' : `/** @jsx ${alias}.createElement */\n`}export function ${name}(${signature}) {\n  return <div className="rf-library" style={{...${JSON.stringify(variables)}, color:"var(--rf-text)"}}><style>{${JSON.stringify(libraryStyles(entry))}}</style><${view}${dataProps?` {...{${dataProps}}}`:''}${declaration.params.length ? ` {...${JSON.stringify(props)}}` : ''} /></div>;\n}\n\n${logic}`;
  return { code, imports:['"use client";',`import * as ${alias} from "react";`], warnings:[dataProps?'Pass project data through the exported props; defaults are sample data. Search onSelect receives the selected text.':'Original React UI with local interaction state. Connect product-specific data and services yourself.'], actions:[], minimal:{ addedDependencies:0, stateFields:(logic.match(/\.useState\s*(?:<[^\n]*?>)?\s*\(/g)||[]).length, actionCallbacks:0 } };
}

export async function libraryPackage(id,theme) {
  const entry = libraryEntry(id); if (!entry) throw new Error('Choose an original component.');
  const results = await Promise.all(['react','swiftui','compose'].map(framework=>librarySource(id,'ReframeOriginal',theme,framework==='react',framework)));
  const files = Object.fromEntries(results.map((result,index)=>[['Component.tsx','Component.swift','Component.kt'][index],result.imports.join('\n') + '\n\n' + result.code + '\n']));
  files['brand.json'] = JSON.stringify(theme,null,2);
  files['README.md'] = '# ' + entry.name + '\n\nIndependently authored Reframe Original. React, SwiftUI (iOS 17+) and Android Compose / Material 3 source are included. Install only the file for your platform. Native source inherits semantic fonts and uses the selected brand palette and corners.\n\n' + (id==='search'?'React data binding: <ReframeOriginal items={projectNames} onSelect={handleSelection} />. items is a readonly string array; onSelect receives selected text.\n':id==='be-table'?'React data binding: <ReframeOriginal rows={projectRows} />. Each row needs a unique name and numeric progress.\n':'') + (entry.requirements || []).join('\n') + '\n\nNative SDK builds, device behavior and assistive technology testing must be verified in the destination app. Generated UI state is local to the component; service credentials and runtime records are not included.\n';
  return {version:1,id,files,bytes:Object.values(files).reduce((sum,value)=>sum+Buffer.byteLength(value),0),requirements:entry.requirements || []};
}
