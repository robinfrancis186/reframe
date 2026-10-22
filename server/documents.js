import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { load } from 'cheerio';
import { refineText, refineCopy, refineSourceComments } from './refine.js';

function prose(text, extension) {
  const edits = [];
  const replace = value => { const after = refineText(value); if (value !== after) edits.push({ before: value.slice(0, 300), after: after.slice(0, 300) }); return after; };
  if (extension !== 'tex') {
    const protectedParts = /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`|\]\([^\n)]*\)|\[\^[^\]\n]*\]|\[@[^\]\n]*\]|https?:\/\/[^\s)]+/g;
    let end = 0, output = '';
    for (const match of text.matchAll(protectedParts)) { output += replace(text.slice(end, match.index)) + match[0]; end = match.index + match[0].length; }
    return { text: output + replace(text.slice(end)), edits };
  }
  let output = '', start = 0, i = 0;
  function balanced(open, close) {
    let depth = 0;
    do { if (text[i] === '\\') { i += 2; continue; } if (text[i] === open) depth++; if (text[i] === close) depth--; i++; } while (i < text.length && depth);
  }
  while (i < text.length) {
    if (!['\\', '$', '%'].includes(text[i])) { i++; continue; }
    output += replace(text.slice(start, i)); const protectedStart = i;
    if (text[i] === '%') { while (i < text.length && text[i] !== '\n') i++; }
    else if (text[i] === '$') { const marker = text.startsWith('$$', i) ? '$$' : '$'; i += marker.length; const end = text.indexOf(marker, i); i = end < 0 ? text.length : end + marker.length; }
    else {
      const begin = text.slice(i).match(/^\\begin\{(equation\*?|align\*?|math|displaymath|verbatim|lstlisting|minted)\}/);
      if (begin) { const marker = `\\end{${begin[1]}}`, end = text.indexOf(marker, i + begin[0].length); i = end < 0 ? text.length : end + marker.length; }
      else if (text.startsWith('\\(', i) || text.startsWith('\\[', i)) { const end = text.indexOf(text[i + 1] === '(' ? '\\)' : '\\]', i + 2); i = end < 0 ? text.length : end + 2; }
      else {
        const verb = text.slice(i).match(/^\\verb\*?(.)/);
        if (verb) { const end = text.indexOf(verb[1], i + verb[0].length); i = end < 0 ? text.length : end + 1; }
        else {
          const command = text.slice(i).match(/^\\(?:[A-Za-z]+\*?|.)/); i += command?.[0].length || 1;
          while (i < text.length) { let next = i; while (/\s/.test(text[next] || '') && next < text.length) next++; if (!['{', '['].includes(text[next])) break; i = next; if (text[i] === '{') balanced('{', '}'); else balanced('[', ']'); }
        }
      }
    }
    output += text.slice(protectedStart, i); start = i;
  }
  return { text: output + replace(text.slice(start)), edits };
}
function docx(input) {
  let total = 0, count = 0;
  const files = unzipSync(input, { filter: entry => {
    total += entry.originalSize;
    if (++count > 1000 || total > 20_000_000 || entry.originalSize > 5_000_000 || entry.name.split(/[\\/]/).includes('..') || /^[\\/]/.test(entry.name) || /vbaProject|\.exe$/i.test(entry.name)) throw new Error('Use a DOCX without macros or unsafe paths, at most 1000 entries and 20 MB expanded.');
    return true;
  } });
  if (!files['[Content_Types].xml'] || !files['word/document.xml']) throw new Error('This file is not a Word DOCX document.');
  const edits = [];
  for (const name of Object.keys(files).filter(name => /^word\/(?:document|footnotes|endnotes|header\d+|footer\d+)\.xml$/.test(name))) {
    const xml = strFromU8(files[name]);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML entities are not supported.');
    const $ = load(xml, { xmlMode: true }); let fieldDepth = 0, changes = 0;
    function walk(node, protectedText = false) {
      if (node.name === 'w:fldChar') { const kind = node.attribs['w:fldCharType']; if (kind === 'begin') fieldDepth++; else if (kind === 'end') fieldDepth = Math.max(0, fieldDepth - 1); }
      const skip = protectedText || ['w:fldSimple', 'w:instrText', 'w:del', 'm:oMath', 'm:oMathPara'].includes(node.name);
      if (node.name === 'w:t' && !skip && !fieldDepth) {
        for (const child of node.children || []) if (child.type === 'text') { const before = child.data, after = refineText(before); if (before !== after) { child.data = after; edits.push({ before: before.slice(0, 300), after: after.slice(0, 300) }); changes++; } }
      } else for (const child of node.children || []) walk(child, skip);
    }
    walk($.root()[0]); if (changes) files[name] = strToU8($.xml());
  }
  return { data: zipSync(files), edits };
}
export function refineDocument({ name, data }) {
  if (typeof name !== 'string' || !/^[^/\\\x00-\x1f]{1,180}\.(?:txt|md|tex|html|js|jsx|ts|tsx|docx)$/i.test(name) || typeof data !== 'string' || data.length > 7_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new Error('Upload TXT, Markdown, LaTeX, HTML, JS/TS or DOCX under 5 MB.');
  const input = Buffer.from(data, 'base64'); if (input.length > 5_000_000) throw new Error('Document exceeds 5 MB.');
  const extension = name.split('.').at(-1).toLowerCase(); let result;
  if (extension === 'docx') result = docx(input);
  else {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(input);
    if (text.length > 500000) throw new Error('Text documents must be under 500000 characters.');
    if (['js', 'jsx', 'ts', 'tsx'].includes(extension)) { const r = refineSourceComments(text); result = { data: Buffer.from(r.code), edits: r.edits }; }
    else if (extension === 'html') { const r = refineCopy(text); result = { data: Buffer.from(r.html), edits: r.edits }; }
    else { const r = prose(text, extension); result = { data: Buffer.from(r.text), edits: r.edits }; }
  }
  return { name: name.replace(/\.[^.]+$/, '-polished.' + extension), data: Buffer.from(result.data).toString('base64'), edits: result.edits.slice(0, 100), totalEdits: result.edits.length, engine: 'Reframe Copy Polish', limitation: 'Conservative, independent wording review. Word fields, citation commands, code and math are protected. Review meaning and formatting; no detector-evasion or authorship guarantees.' };
}
