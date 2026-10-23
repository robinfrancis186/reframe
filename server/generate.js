import { load } from 'cheerio';
import { cleanHtml } from './capture.js';

export function generate(html, name, framework, typed = true) {
  if (typeof html !== 'string' || html.length > 200000)
    throw new Error('Component must be under 200 KB.');
  if (!/^Reframe[A-Za-z0-9]{1,60}$/.test(name))
    throw new Error('Use a component name starting with Reframe, followed by letters or numbers.');
  if (!['react', 'react-native', 'swiftui', 'compose'].includes(framework))
    throw new Error('Unsupported project framework.');
  const $ = load(cleanHtml(html), null, false),
    actions = [],
    fields = [],
    warnings = new Set();
  let count = 0;
  const q = (text) =>
    JSON.stringify(String(text))
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  const nativeQuote = (text, language) =>
    '"' +
    String(text).replace(/[\\"\x00-\x1f\u2028\u2029$]/g, (c) => {
      if (c === '$') return language === 'kotlin' ? '\\$' : c;
      if (c === '\\' || c === '"') return '\\' + c;
      const hex = c.charCodeAt(0).toString(16).padStart(4, '0');
      return language === 'swift' ? `\\u{${hex}}` : `\\u${hex}`;
    }) +
    '"';
  const swift = (text) => nativeQuote(text, 'swift');
  const kotlin = (text) => nativeQuote(text, 'kotlin');
  function render(el, depth = 0) {
    if (++count > 1200 || depth > 40)
      throw new Error('Component is too complex. Pick a smaller region.');
    if (el.type === 'text') {
      const text = el.data.replace(/\s+/g, ' ').trim();
      if (!text) return '';
      if (framework === 'swiftui') return `Text(${swift(text)})`;
      if (framework === 'compose') return `Text(${kotlin(text)})`;
      if (framework === 'react-native') return `<${name}UI.Text>{${q(text)}}</${name}UI.Text>`;
      return `{${q(el.data)}}`;
    }
    if (!el.name) return '';
    const tag = el.name,
      text = $(el).text().replace(/\s+/g, ' ').trim();
    const label =
      el.attribs['aria-label'] ||
      (el.attribs.id &&
        $('label')
          .filter((_, n) => n.attribs.for === el.attribs.id)
          .first()
          .text()
          .trim()) ||
      $(el).closest('label').text().trim() ||
      el.attribs.placeholder ||
      text ||
      'Field';
    const action = ['button', 'a'].includes(tag)
      ? `action${actions.push({ id: `action${actions.length + 1}`, label: text || label || 'Continue', href: el.attribs.href || null })}`
      : null;
    const input = ['input', 'textarea', 'select'].includes(tag);
    const password = input && el.attribs.type === 'password';
    const toggle = input && ['checkbox', 'radio'].includes(el.attribs.type);
    const field = input ? `field${fields.push({ toggle })}` : null;
    if (['img', 'video', 'svg'].includes(tag))
      warnings.add(
        'Media is represented by its accessible description. Supply licensed assets in the destination app.',
      );
    if (tag === 'select')
      warnings.add(
        'Select controls become text fields. Replace with the destination app’s picker if needed.',
      );
    const children = () =>
      (el.children || [])
        .map((c) => render(c, depth + 1))
        .filter(Boolean)
        .join('\n');
    if (framework === 'swiftui') {
      if (action)
        return `Button(${swift(text || 'Continue')}) { onAction(${swift(action)}) }\n.buttonStyle(.borderedProminent)`;
      if (field)
        return toggle
          ? `Toggle(${swift(label)}, isOn: $${field})`
          : `${password ? 'SecureField' : 'TextField'}(${swift(label)}, text: $${field})\n.textFieldStyle(.roundedBorder)`;
      if (tag === 'img')
        return `Text(${swift(el.attribs.alt || 'Image')}).foregroundStyle(.secondary)`;
      if (tag === 'hr') return 'Divider()';
      if (tag === 'br') return 'Spacer().frame(height: 4)';
      if (/^h[1-6]$/.test(tag))
        return `Text(${swift(text)}).font(.${tag === 'h1' ? 'title' : 'headline'})`;
      if (
        ['p', 'span', 'small', 'strong', 'li', 'label'].includes(tag) &&
        !$(el).find('input,textarea,select,button,a').length
      )
        return `Text(${swift(text)})${tag === 'strong' ? '.bold()' : ''}`;
      return `${tag === 'nav' ? 'HStack' : 'VStack'}(alignment: ${tag === 'nav' ? '.center' : '.leading'}, spacing: 12) {\n${children()}\n}`;
    }
    if (framework === 'compose') {
      if (action)
        return `Button(onClick = { onAction(${kotlin(action)}) }) { Text(${kotlin(text || 'Continue')}) }`;
      if (field)
        return toggle
          ? `Row { Checkbox(checked = ${field}, onCheckedChange = { ${field} = it }); Text(${kotlin(label)}) }`
          : `OutlinedTextField(value = ${field}, onValueChange = { ${field} = it }, label = { Text(${kotlin(label)}) }${password ? ', visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation()' : ''})`;
      if (tag === 'img')
        return `Text(${kotlin(el.attribs.alt || 'Image')}, color = MaterialTheme.colorScheme.onSurfaceVariant)`;
      if (tag === 'hr') return 'HorizontalDivider()';
      if (tag === 'br') return 'Spacer(Modifier.height(4.dp))';
      if (/^h[1-6]$/.test(tag))
        return `Text(${kotlin(text)}, style = MaterialTheme.typography.${tag === 'h1' ? 'headlineMedium' : 'titleMedium'})`;
      if (
        ['p', 'span', 'small', 'strong', 'li', 'label'].includes(tag) &&
        !$(el).find('input,textarea,select,button,a').length
      )
        return `Text(${kotlin(text)})`;
      return `${tag === 'nav' ? 'Row' : 'Column'}(${tag === 'nav' ? 'horizontalArrangement' : 'verticalArrangement'} = Arrangement.spacedBy(12.dp)) {\n${children()}\n}`;
    }
    if (framework === 'react-native') {
      const ui = name + 'UI';
      if (action)
        return `<${ui}.Pressable accessibilityRole="button" onPress={() => onAction(${q(action)})} style={{ backgroundColor: theme.primary, padding: 12, borderRadius: 8 }}><${ui}.Text style={{color: theme.onPrimary}}>{${q(text || 'Continue')}}</${ui}.Text></${ui}.Pressable>`;
      if (field)
        return toggle
          ? `<${ui}.View><${ui}.Text>{${q(label)}}</${ui}.Text><${ui}.Switch accessibilityLabel={${q(label)}} value={${field}} onValueChange={set${field}} /></${ui}.View>`
          : `<${ui}.TextInput${password ? ' secureTextEntry' : ''} accessibilityLabel={${q(label)}} placeholder={${q(label)}} value={${field}} onChangeText={set${field}} style={{color: theme.text, borderColor: theme.text, borderWidth: 1, padding: 12}} />`;
      if (tag === 'hr')
        return `<${ui}.View style={{height: 1, backgroundColor: theme.text, opacity: 0.2}} />`;
      if (tag === 'img') return `<${ui}.Text>{${q(el.attribs.alt || 'Image')}}</${ui}.Text>`;
      if (tag === 'br') return `<${ui}.View style={{height: 4}} />`;
      if (
        (['p', 'span', 'small', 'strong', 'li', 'label'].includes(tag) &&
          !$(el).find('input,textarea,select,button,a').length) ||
        /^h[1-6]$/.test(tag)
      )
        return `<${ui}.Text style={{color: theme.text${/^h/.test(tag) ? ', fontSize: 24, fontWeight: "600"' : ''}}}>{${q(text)}}</${ui}.Text>`;
      return `<${ui}.View style={{gap: 12${tag === 'nav' ? ', flexDirection: "row", flexWrap: "wrap"' : ''}}}>${children()}</${ui}.View>`;
    }
    if (action)
      return `<button type="button" onClick={() => onAction(${q(action)})} style={{font: 'inherit', background: 'var(--primary, var(--color-primary, #3159e8))', color: 'var(--primary-foreground, white)', border: 0, padding: '12px 18px', borderRadius: 'var(--radius, 8px)', cursor: 'pointer'}}>{${q(text || 'Continue')}}</button>`;
    if (field)
      return toggle
        ? `<input type="checkbox" aria-label={${q(label)}} checked={${field}} onChange={e => set${field}(e.target.checked)} />`
        : `<input aria-label={${q(label)}} placeholder={${q(label)}} type=${q(['password', 'email', 'number', 'search'].includes(el.attribs.type) ? el.attribs.type : 'text')} value={${field}} onChange={e => set${field}(e.target.value)} style={{font: 'inherit', color: 'inherit', background: 'transparent', border: '1px solid currentColor', borderRadius: 'var(--radius, 8px)', padding: 10, display: 'block', width: 'min(100%, 32rem)', margin: '8px 0'}} />`;
    if (tag === 'img')
      return `<span role="img" aria-label={${q(el.attribs.alt || 'Image')}}>{${q(el.attribs.alt || 'Image')}}</span>`;
    if (['br', 'hr'].includes(tag)) return `<${tag} />`;
    // Preserve semantic tags, while inheriting host typography and token colors.
    const safeTag = [
      'section',
      'article',
      'nav',
      'header',
      'footer',
      'div',
      'p',
      'span',
      'small',
      'strong',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'label',
      'em',
      'blockquote',
      'details',
      'summary',
    ].includes(tag)
      ? tag
      : 'div';
    const actionGroup =
      (el.children || []).filter((c) => c.type === 'tag').length > 1 &&
      (el.children || [])
        .filter((c) => c.type === 'tag')
        .every((c) => ['button', 'a'].includes(c.name));
    return `<${safeTag}${actionGroup ? ' style={{display: "flex", flexWrap: "wrap", gap: 8}}' : ''}>${children()}</${safeTag}>`;
  }
  const body = $.root()
    .contents()
    .toArray()
    .map((el) => render(el))
    .join('\n');
  let code,
    imports = [];
  if (framework === 'swiftui') {
    imports = ['import SwiftUI'];
    code = `struct ${name}: View {\n${actions.length ? 'var onAction: (String) -> Void' : ''}\n${fields.map((f, i) => `@State private var field${i + 1} = ${f.toggle ? 'false' : '""'}`).join('\n')}\nvar body: some View {\nVStack(alignment: .leading, spacing: 16) {\n${body}\n}\n.padding()\n}\n}`;
  } else if (framework === 'compose') {
    imports = [
      'import androidx.compose.runtime.Composable',
      ...(fields.length
        ? [
            'import androidx.compose.runtime.getValue',
            'import androidx.compose.runtime.setValue',
            'import androidx.compose.runtime.remember',
            'import androidx.compose.runtime.mutableStateOf',
          ]
        : []),
      'import androidx.compose.foundation.layout.*',
      'import androidx.compose.material3.*',
      'import androidx.compose.ui.Modifier',
      'import androidx.compose.ui.unit.dp',
    ];
    code = `@Composable\nfun ${name}(${actions.length ? 'onAction: (String) -> Unit' : ''}) {\n${fields.map((f, i) => `var field${i + 1} by remember { mutableStateOf(${f.toggle ? 'false' : '""'}) }`).join('\n')}\nColumn(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {\n${body}\n}\n}`;
  } else {
    if (fields.length) imports.push(`import { useState as ${name}State } from 'react';`);
    if (framework === 'react-native') imports.push(`import * as ${name}UI from 'react-native';`);
    const native = framework === 'react-native';
    const names = [...(actions.length ? ['onAction'] : []), ...(native ? ['theme'] : [])];
    const types = [
      ...(actions.length ? ['onAction: (action: string) => void'] : []),
      ...(native
        ? ['theme: { primary: string; onPrimary: string; text: string; background: string }']
        : []),
    ];
    const props = names.length
      ? `{ ${names.join(', ')} }${typed ? `: { ${types.join('; ')} }` : ''}`
      : '';
    code = `function ${name}(${props}) {\n${fields.map((f, i) => `const [field${i + 1}, setfield${i + 1}] = ${name}State(${f.toggle ? 'false' : '""'});`).join('\n')}\nreturn (${native ? `<${name}UI.View style={{backgroundColor: theme.background, padding: 16, gap: 16}}>` : '<section style={{fontFamily: "inherit", color: "inherit", display: "grid", gap: 16}}>'}\n${body}\n${native ? `</${name}UI.View>` : '</section>'});\n}`;
  }
  if (actions.length)
    warnings.add(
      'Bind each action to a handler in the destination screen. Captures do not recover business logic.',
    );
  return {
    code,
    imports,
    actions,
    warnings: [...warnings],
    name,
    framework,
    minimal: {
      policy: 'Ponytail-informed generation rules',
      addedDependencies: 0,
      stateFields: fields.length,
      actionCallbacks: actions.length ? 1 : 0,
      imports: imports.length,
    },
  };
}
