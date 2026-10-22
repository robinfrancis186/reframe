import { ArrowRight, Check } from 'lucide-react';
import { componentReadiness } from './component-workflow.js';
import type { ComponentItem } from './model';

export default function ComponentJourney({item,saved,onBuild,onTest,onSave,onIntegrate}:{
  item:ComponentItem;saved:boolean;onBuild:()=>void;onTest:()=>void;onSave:()=>void;onIntegrate:()=>void;
}) {
  const state=componentReadiness(item), hasBehavior=state.kind!=='reference';
  return <section className="component-journey panel" aria-label="Component next steps">
    <div className="journey-heading"><div><span className="eyebrow">{state.label}</span><h2>{item.name}</h2></div><span className="muted">{saved?'Saved in clipboard':'Unsaved changes'}</span></div>
    <p>{state.detail}</p>
    <ol className="journey-steps">
      <li><button onClick={item.feature?.spec.website?onTest:onBuild} disabled={!!item.libraryId}><span>{hasBehavior?<Check size={16}/>:1}</span><strong>{hasBehavior?'Behavior included':'Define behavior'}</strong><small>{hasBehavior?'Review the supported actions':'Build the missing UI and API'}</small></button></li>
      <li><button onClick={onTest} disabled={!hasBehavior}><span>2</span><strong>Test behavior</strong><small>{item.feature?'Run UI and backend before installing':hasBehavior?'Try the interactive preview':'Define behavior first'}</small></button></li>
      <li><button onClick={onSave} disabled={!item.name.trim()}><span>{saved?<Check size={16}/>:3}</span><strong>{saved?'Saved together':'Save to clipboard'}</strong><small>Keep source and behavior together</small></button></li>
      <li><button onClick={onIntegrate}><span>4</span><strong>Fit &amp; install <ArrowRight size={15}/></strong><small>Review changes, then test in the app</small></button></li>
    </ol>
  </section>;
}
