import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { refineDocument } from '../server/documents.js';
const review = (name, text) => refineDocument({ name, data: Buffer.from(text).toString('base64') });

test('document review protects Markdown code, links, citations and LaTeX commands, math and comments', () => {
  const markdown = review('paper.md', 'Utilize this in order to commence. `utilize` [@utilize] [guide](https://example.org/utilize)\n```js\nutilize();\n```');
  assert.match(Buffer.from(markdown.data, 'base64').toString(), /Use this to start\. `utilize` \[@utilize\]/);
  assert.match(Buffer.from(markdown.data, 'base64').toString(), /https:\/\/example.org\/utilize/);
  const tex = review('paper.tex', String.raw`Utilize this in order to commence. \cite {utilize} \ref{in order to} $utilize$ \verb|utilize| % utilize`);
  const output = Buffer.from(tex.data, 'base64').toString();
  assert.match(output, /Use this to start/); assert.match(output, /\\cite \{utilize\}/); assert.match(output, /\$utilize\$/); assert.match(output, /\\verb\|utilize\|/); assert.match(output, /% utilize/);
  const source = review('file.ts', '// Utilize this in order to commence\nconst text="utilize";');
  assert.match(Buffer.from(source.data, 'base64').toString(), /const text="utilize"/);
});
test('DOCX review preserves formatting, citation fields, relationships and original archive data', () => {
  const xml = '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Utilize this in order to commence.</w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>CITATION utilize</w:instrText></w:r><w:r><w:t>utilize in order to</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:body></w:document>';
  const original = { '[Content_Types].xml': strToU8('<Types/>'), 'word/document.xml': strToU8(xml), 'word/_rels/document.xml.rels': strToU8('<Relationships/>') };
  const result = review('paper.docx', zipSync(original));
  assert.equal(result.totalEdits, 1);
  const files = unzipSync(Buffer.from(result.data, 'base64')), output = strFromU8(files['word/document.xml']);
  assert.match(output, /<w:b\/>/); assert.match(output, /Use this to start/); assert.match(output, /CITATION utilize/); assert.match(output, />utilize in order to<\/w:t>/);
  assert.deepEqual(files['word/_rels/document.xml.rels'], original['word/_rels/document.xml.rels']);
  assert.match(strFromU8(original['word/document.xml']), /Utilize this/);
  assert.throws(() => review('bad.docx', zipSync({ '../escape': strToU8('bad') })), /unsafe paths/);
  assert.throws(() => review('bomb.docx', zipSync({ large: new Uint8Array(5000001) })), /expanded/);
  assert.throws(() => review('bad.docx', Buffer.from('not zip')));
  assert.throws(() => review('../file.txt', 'text'));
});
