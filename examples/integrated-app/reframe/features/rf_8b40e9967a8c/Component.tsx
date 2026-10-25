import {useState as ReframeFeatureState,useEffect as ReframeFeatureEffect,useRef as ReframeFeatureRef} from 'react';
export default function ReframeFeature() {
const [field1, setfield1] = ReframeFeatureState("");

const [data, setData] = ReframeFeatureState<{version:number;records:{id:string;values:Record<string,string|boolean>}[];counters:Record<string,number>;toggles:Record<string,boolean>;result?:string}>({version:0,records:[],counters:{},toggles:{}});
const [ready,setReady]=ReframeFeatureState(false),[busy,setBusy]=ReframeFeatureState(false),[error,setError]=ReframeFeatureState(''),[message,setMessage]=ReframeFeatureState(''),[selected,setSelected]=ReframeFeatureState('');
const sessionEpoch=ReframeFeatureRef(0);
const pending=ReframeFeatureRef<{fingerprint:string;body:Record<string,unknown>}|null>(null);
const actions=[{"id":"action1","label":"Save idea","href":null,"operation":"create","target":"","message":"","reason":"Suggested from visible labels or links; review before building."},{"id":"action2","label":"Count","href":null,"operation":"increment","target":"","message":"","reason":"Suggested from visible labels or links; review before building."}];
const endpoint="/api/reframe/rf_8b40e9967a8c";
ReframeFeatureEffect(()=>{let controller=new AbortController();function load(){sessionEpoch.current++;controller.abort();controller=new AbortController();const current=controller;setBusy(false);setMessage('');setReady(false);setData({version:0,records:[],counters:{},toggles:{}});setSelected('');setfield1('');pending.current=null;fetch(endpoint,{signal:controller.signal}).then(async r=>{const result=await r.json();if(!r.ok)throw new Error(result.error||'Could not load feature');return result;}).then(result=>{if(!current.signal.aborted){setData(result);setReady(true);setError('');}}).catch(e=>{if(!current.signal.aborted)setError(e.message);});}load();window.addEventListener('reframe-session',load);return()=>{controller.abort();window.removeEventListener('reframe-session',load);};},[]);
async function onAction(id:string){
 const action=actions.find(a=>a.id===id);if(!action||busy||(!ready&&!['signin','signup','signout'].includes(action.operation)))return;setError('');setMessage('');
 if(action.operation==='navigate'){window.location.assign(action.target);return;}
 if(action.operation==='details'){setMessage(action.message);return;}
 if(action.operation==='reset'){setfield1('');setSelected('');setMessage('Fields cleared.');return;}
 if(['update','delete'].includes(action.operation)&&!selected){setError('Select a saved record first.');return;}
 const actionEpoch=sessionEpoch.current;const values={field1};
 const body={action:id,values,recordId:selected,version:data.version,query:Object.values(values).map(String).join(' ')};
 const fingerprint=JSON.stringify({...body,version:undefined});if(pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,body:{...body,requestId:crypto.randomUUID()}};
 setBusy(true);try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending.current.body),signal:AbortSignal.timeout(15000)});const result=await response.json();if(actionEpoch!==sessionEpoch.current)return;if(!response.ok){if(response.status<500)pending.current=null;throw new Error(result.error||'Action failed');}setData(result);pending.current=null;setMessage(action.operation==='search'?result.records.length+' matching records.':action.label+' completed.');if(['signin','signup','signout'].includes(action.operation)){setfield1('');window.dispatchEvent(new Event('reframe-session'));}if(['create','delete'].includes(action.operation)){setfield1('');setSelected('');}}
 catch(e){if(actionEpoch!==sessionEpoch.current)return;setError((e as Error).message);try{const r=await fetch(endpoint);if(r.ok){const latest=await r.json();if(actionEpoch===sessionEpoch.current)setData(latest);}}catch{/* Keep confirmed data when offline. */}}finally{if(actionEpoch===sessionEpoch.current)setBusy(false);}
}

return (<section style={{fontFamily: "inherit", color: "inherit", display: "grid", gap: 16}}>
<section><h2>{"MCP idea inbox"}</h2>
<p>{"Keep a thought from your connected assistant."}</p>
<label>{"Idea"}
<input disabled={busy || !ready} aria-label={"Idea"} placeholder={"Idea"} type="text" value={field1} onChange={e => setfield1(e.target.value)} style={{font: 'inherit', color: 'inherit', background: 'transparent', border: '1px solid currentColor', padding: 10}} /></label>
<button disabled={busy || !ready} type="button" onClick={() => onAction("action1")} style={{font: 'inherit', background: 'var(--primary, var(--color-primary, #3159e8))', color: 'var(--primary-foreground, white)', border: 0, padding: '12px 18px', borderRadius: 'var(--radius, 8px)', cursor: 'pointer'}}>{"Save idea"}</button>
<button disabled={busy || !ready} type="button" onClick={() => onAction("action2")} style={{font: 'inherit', background: 'var(--primary, var(--color-primary, #3159e8))', color: 'var(--primary-foreground, white)', border: 0, padding: '12px 18px', borderRadius: 'var(--radius, 8px)', cursor: 'pointer'}}>{"Count"}</button></section>
<div aria-live="polite"><p role="status">{!ready?(error?'':'Loading feature…'):busy?'Working…':message}</p>{error&&<p role="alert">{error}</p>}{!ready&&error&&error!=='Sign in to use this component.'&&<button onClick={()=>window.location.reload()}>Retry loading</button>}<p>Counts: {Object.entries(data.counters).map(([id,value])=>actions.find(a=>a.id===id)?.label+": "+value).join(" · ")}</p><h3>Saved records</h3><p>{data.records.length} records · saved on this computer</p><ul>{data.records.map(record=><li key={record.id}><button aria-pressed={selected===record.id} disabled={busy} onClick={()=>{setSelected(record.id);setfield1(String(record.values.field1 ?? ''));setMessage('Record selected.');}}>{"Idea"+': '+Object.values(record.values).map(String).join(' · ')}</button></li>)}</ul></div>{data.result&&<pre aria-label="API response" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{data.result}</pre>}</section>);
}