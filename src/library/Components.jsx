import React, { useId, useRef, useState } from 'react';

export function LibraryTabs() {
  const [selected, setSelected] = useState(0), id = useId();
  const tabs = ['Overview', 'Activity', 'Settings'];
  return <section><div role="tablist" aria-label="Workspace sections">{tabs.map((label, index) => <button type="button" key={label} id={`${id}-tab-${index}`} role="tab" aria-selected={selected === index} aria-controls={`${id}-panel`} tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={event => {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
    if (next !== null) { event.preventDefault(); setSelected(next); document.getElementById(`${id}-tab-${next}`)?.focus(); }
  }}>{label}</button>)}</div><div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${selected}`} tabIndex={0}><h2>{tabs[selected]}</h2><p>{['Everything you need, in one thoughtful workspace.', 'Your recent changes will appear in this panel.', 'Make this space work the way you do.'][selected]}</p></div></section>;
}
export function LibraryAccordion() {
  return <section><h2>A little clarity.</h2>{[['Can I make it my own?', 'Yes. Change the content, colors and behavior in your project.'], ['Does it add dependencies?', 'These components use React and platform controls. No animation or UI framework is required.'], ['What is included?', 'The selected component, its styles and its local interaction logic.']].map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</section>;
}
export function LibrarySwitch() {
  const [enabled, setEnabled] = useState(true), id = useId();
  return <section><h2>Your preferences.</h2><div className="rf-row"><button type="button" className="rf-switch" role="switch" aria-checked={enabled} aria-labelledby={id} onClick={() => setEnabled(!enabled)}><span /></button><span id={id}>Weekly updates</span></div><p aria-live="polite">Weekly updates are {enabled ? 'on' : 'off'} for this session.</p></section>;
}
export function LibraryDialog() {
  const dialog = useRef(null), id = useId();
  return <section><h2>Room for the details.</h2><p>Open a focused space without leaving your work.</p><button type="button" data-primary onClick={() => dialog.current?.showModal()}>Open dialog</button><dialog ref={dialog} aria-labelledby={id} onClick={event => { const r=event.currentTarget.getBoundingClientRect(); if (event.target === event.currentTarget && (event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom)) dialog.current?.close(); }}><h2 id={id}>A fresh perspective.</h2><p>This is your space for a focused task, a quick question or the finer details.</p><form method="dialog"><button type="submit" autoFocus>Back to workspace</button></form></dialog></section>;
}
export function LibraryToast() {
  const [visible, setVisible] = useState(false);
  return <section><h2>Keep people in the loop.</h2><p>A small confirmation, right when it matters.</p><button type="button" data-primary onClick={() => setVisible(true)}>Show confirmation</button>{visible && <div role="status"><div className="rf-row"><span>✓ Your preference is confirmed for this session.</span><button type="button" aria-label="Dismiss confirmation" onClick={() => setVisible(false)}>Dismiss</button></div></div>}</section>;
}
export function LibrarySlider() {
  const [value, setValue] = useState(60), id = useId();
  return <section><h2>Find your balance.</h2><label htmlFor={id}>Intensity <output htmlFor={id}>{value}%</output></label><input id={id} type="range" min="0" max="100" step="5" value={value} onChange={event => setValue(Number(event.target.value))} /><small>Use the arrow keys to fine-tune.</small></section>;
}
export function LibraryQuantity() {
  const [count, setCount] = useState(1), id = useId();
  return <section><h2>Make a little room.</h2><p id={id}>Number of seats</p><div className="rf-row" role="group" aria-labelledby={id}><button type="button" aria-label="Remove a seat" disabled={count <= 1} onClick={() => setCount(count - 1)}>−</button><output aria-live="polite" style={{padding:'0 18px'}}>{count}</output><button type="button" aria-label="Add a seat" disabled={count >= 99} onClick={() => setCount(count + 1)}>+</button></div><small>Between 1 and 99 seats. Connect this value to your own billing rules.</small></section>;
}
export function LibrarySteps() {
  const [step, setStep] = useState(0), labels = ['Discover', 'Make it yours', 'Ready to build'];
  return <section><small>A GOOD PLACE TO START</small><h2>{labels[step]}</h2><ol>{labels.map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined}>{label}</li>)}</ol><p>{['Find the pieces that fit your idea.', 'Bring your own colors and personality.', 'Your starting point is ready.'][step]}</p><div className="rf-row"><button type="button" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button><button type="button" data-primary onClick={() => setStep(step === 2 ? 0 : step + 1)}>{step === 2 ? 'Start again' : 'Continue'}</button></div></section>;
}
export function LibraryMenu() {
  const [selected, setSelected] = useState('No action selected');
  return <section><h2>Everything in its place.</h2><details><summary>Workspace actions</summary><div className="rf-row">{['Overview', 'Activity', 'Preferences'].map(action => <button type="button" key={action} onClick={event => { setSelected(action); const menu = event.currentTarget.closest('details'); if (menu) { menu.open = false; menu.querySelector('summary')?.focus(); } }}>{action}</button>)}</div></details><p role="status">{selected}</p></section>;
}
export function LibraryCopy() {
  const [message, setMessage] = useState(''), id = useId(), [value, setValue] = useState('hello@example.com');
  async function copy() { try { await navigator.clipboard.writeText(value); setMessage('Copied to clipboard.'); } catch { setMessage('Clipboard unavailable. Select and copy the text manually.'); } }
  return <section><h2>One less step.</h2><label htmlFor={id}>Shareable value<input id={id} value={value} onChange={event => { setValue(event.target.value); setMessage(''); }} /></label><button type="button" data-primary onClick={copy}>Copy value</button>{message && <p role="status">{message}</p>}</section>;
}
export function LibraryBrand({ brandName = 'Your brand', tagline = 'Good things start with a little intention.', logo = '' } = {}) {
  const [expanded, setExpanded] = useState(false), id = useId();
  return <section>{logo ? <img src={logo} alt={`${brandName} logo`} /> : <div className="rf-brand-mark" aria-hidden="true">{brandName.slice(0,1)}</div>}<small>MADE FOR YOUR NEXT CHAPTER</small><h2>{brandName}</h2><p>{tagline}</p><button type="button" data-primary aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>{expanded ? 'A little less' : 'Meet the idea'} <span aria-hidden="true">↗</span></button><div id={id} hidden={!expanded}><p>A thoughtful starting point. Replace this introduction with your own story.</p></div></section>;
}
