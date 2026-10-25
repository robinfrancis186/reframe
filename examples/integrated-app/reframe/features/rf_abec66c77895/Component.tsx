import {useState as ReframeFeatureState,useEffect as ReframeFeatureEffect,useRef as ReframeFeatureRef} from 'react';
export default function ReframeFeature() {
const [field1, setfield1] = ReframeFeatureState("");

const [data, setData] = ReframeFeatureState<{version:number;records:{id:string;values:Record<string,string|boolean>}[];counters:Record<string,number>;toggles:Record<string,boolean>}>({version:0,records:[],counters:{},toggles:{}});
const [ready,setReady]=ReframeFeatureState(false),[busy,setBusy]=ReframeFeatureState(false),[error,setError]=ReframeFeatureState(''),[message,setMessage]=ReframeFeatureState(''),[selected,setSelected]=ReframeFeatureState('');
const pending=ReframeFeatureRef<{fingerprint:string;id:string}|null>(null);
const actions=[{"id":"action1","label":"Subscribe","href":null,"operation":"create","target":"","message":"","reason":"Suggested from visible labels or links; review before building."},{"id":"action2","label":"Update","href":null,"operation":"update","target":"","message":"","reason":"Suggested from visible labels or links; review before building."},{"id":"action3","label":"Delete","href":null,"operation":"delete","target":"","message":"","reason":"Suggested from visible labels or links; review before building."},{"id":"action4","label":"Search","href":null,"operation":"search","target":"","message":"","reason":"Suggested from visible labels or links; review before building."},{"id":"action5","label":"Like","href":null,"operation":"toggle","target":"","message":"","reason":"Suggested from visible labels or links; review before building."}];
const endpoint="/api/reframe/rf_abec66c77895";
ReframeFeatureEffect(()=>{const controller=new AbortController();fetch(endpoint,{signal:controller.signal}).then(async r=>{const result=await r.json();if(!r.ok)throw new Error(result.error||'Could not load feature');return result;}).then(result=>{setData(result);setReady(true);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[]);
async function onAction(id:string){
 if(busy||!ready)return;const action=actions.find(a=>a.id===id);if(!action)return;setError('');setMessage('');
 if(action.operation==='navigate'){window.location.assign(action.target);return;}
 if(action.operation==='details'){setMessage(action.message);return;}
 if(action.operation==='reset'){setfield1('');setSelected('');setMessage('Fields cleared.');return;}
 if(['update','delete'].includes(action.operation)&&!selected){setError('Select a saved record first.');return;}
 const values={field1};
 const body={action:id,values,recordId:selected,version:data.version,query:Object.values(values).map(String).join(' ')};
 const fingerprint=JSON.stringify(body);if(pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,id:crypto.randomUUID()};
 setBusy(true);try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,requestId:pending.current.id}),signal:AbortSignal.timeout(10000)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Action failed');setData(result);pending.current=null;setMessage(action.operation==='search'?result.records.length+' matching records.':action.label+' completed.');if(['create','delete'].includes(action.operation)){setfield1('');setSelected('');}}
 catch(e){setError((e as Error).message);try{const r=await fetch(endpoint);if(r.ok)setData(await r.json());}catch{/* Keep confirmed data when offline. */}}finally{setBusy(false);}
}

return (<section style={{fontFamily: "inherit", color: "inherit", display: "grid", gap: 16}}>
<section><h2>{"Community contacts"}</h2>
<p>{"Keep the people you want to build with."}</p>
<label>{"Email"}
<input disabled={busy || !ready} aria-label={"Email"} placeholder={"Email"} type="email" value={field1} onChange={e => setfield1(e.target.value)} style={{font: 'inherit', color: 'inherit', background: 'transparent', border: '1px solid currentColor', padding: 10}} /></label>
<button disabled={busy || !ready} type="button" onClick={() => onAction("action1")} style={{font: 'inherit', background: 'var(--primary, var(--color-primary, #3159e8))', color: 'var(--primary-foreground, white)', border: 0, padding: '12px 18px', borderRadius: 'var(--radius, 8px)', cursor: 'pointer'}}>{"Subscribe"}</button>
<button disabled={busy || !ready} type="button" onClick={() => onAction("action2")} style={{font: 'inherit', background: 'var(--primary, var(--color-primary, #3159e8))', color: 'var(--primary-foreground, white)', border: 0, padding: '12px 18px', borderRadius: 'var(--radius, 8px)', cursor: 'pointer'}}>{"Update"}</button>
<button disabled={busy || !ready} type="button" onClick={() => onAction("action3")} style={{font: 'inherit', background: 'var(--primary, var(--color-primary, #3159e8))', color: 'var(--primary-foreground, white)', border: 0, padding: '12px 18px', borderRadius: 'var(--radius, 8px)', cursor: 'pointer'}}>{"Delete"}</button>
<button disabled={busy || !ready} type="button" onClick={() => onAction("action4")} style={{font: 'inherit', background: 'var(--primary, var(--color-primary, #3159e8))', color: 'var(--primary-foreground, white)', border: 0, padding: '12px 18px', borderRadius: 'var(--radius, 8px)', cursor: 'pointer'}}>{"Search"}</button>
<button disabled={busy || !ready} type="button" onClick={() => onAction("action5")} style={{font: 'inherit', background: 'var(--primary, var(--color-primary, #3159e8))', color: 'var(--primary-foreground, white)', border: 0, padding: '12px 18px', borderRadius: 'var(--radius, 8px)', cursor: 'pointer'}}>{"Like"}</button></section>
<div aria-live="polite"><p role="status">{!ready?'Loading feature…':busy?'Saving…':message}</p>{error&&<p role="alert">{error}</p>}{!ready&&error&&<button onClick={()=>window.location.reload()}>Retry loading</button>}<p>Saved states: {Object.entries(data.toggles).map(([id,value])=>actions.find(a=>a.id===id)?.label+": "+(value?"On":"Off")).join(" · ")}</p><h3>Saved records</h3><p>{data.records.length} records · saved on this computer</p><ul>{data.records.map(record=><li key={record.id}><button aria-pressed={selected===record.id} disabled={busy} onClick={()=>{setSelected(record.id);setfield1(String(record.values.field1 ?? ''));setMessage('Record selected.');}}>{"Email"+': '+Object.values(record.values).map(String).join(' · ')}</button></li>)}</ul></div></section>);
}