import {useState as ReframeFeatureState,useEffect as ReframeFeatureEffect,useRef as ReframeFeatureRef} from 'react';
export default function ReframeFeature() {
const [field1, setfield1] = ReframeFeatureState("");
const [field2, setfield2] = ReframeFeatureState("");
const [field3, setfield3] = ReframeFeatureState(false);

const [data, setData] = ReframeFeatureState<{version:number;records:{id:string;values:Record<string,string|boolean>}[];counters:Record<string,number>;toggles:Record<string,boolean>;result?:string}>({version:0,records:[],counters:{},toggles:{}});
const [ready,setReady]=ReframeFeatureState(false),[busy,setBusy]=ReframeFeatureState(false),[error,setError]=ReframeFeatureState(''),[message,setMessage]=ReframeFeatureState(''),[selected,setSelected]=ReframeFeatureState('');
const sessionEpoch=ReframeFeatureRef(0);
const pending=ReframeFeatureRef<{fingerprint:string;body:Record<string,unknown>}|null>(null);
const actions=[{"id":"action1","label":"Subscribe","href":null,"operation":"create","target":"","message":"","reason":"Submitting a new newsletter subscription record with validated form data."}];
const endpoint="/api/reframe/rf_f5dd12c9f266";
ReframeFeatureEffect(()=>{let controller=new AbortController();function load(){sessionEpoch.current++;controller.abort();controller=new AbortController();const current=controller;setBusy(false);setMessage('');setReady(false);setData({version:0,records:[],counters:{},toggles:{}});setSelected('');setfield1('');setfield2('');setfield3(false);pending.current=null;fetch(endpoint,{signal:controller.signal}).then(async r=>{const result=await r.json();if(!r.ok)throw new Error(result.error||'Could not load feature');return result;}).then(result=>{if(!current.signal.aborted){setData(result);setReady(true);setError('');}}).catch(e=>{if(!current.signal.aborted)setError(e.message);});}load();window.addEventListener('reframe-session',load);return()=>{controller.abort();window.removeEventListener('reframe-session',load);};},[]);
async function onAction(id:string){
 const action=actions.find(a=>a.id===id);if(!action||busy||(!ready&&!['signin','signup','signout'].includes(action.operation)))return;setError('');setMessage('');
 if(action.operation==='navigate'){window.location.assign(action.target);return;}
 if(action.operation==='details'){setMessage(action.message);return;}
 if(action.operation==='reset'){setfield1('');setfield2('');setfield3(false);setSelected('');setMessage('Fields cleared.');return;}
 if(['update','delete'].includes(action.operation)&&!selected){setError('Select a saved record first.');return;}
 const actionEpoch=sessionEpoch.current;const values={field1,field2,field3};
 const body={action:id,values,recordId:selected,version:data.version,query:Object.values(values).map(String).join(' ')};
 const fingerprint=JSON.stringify({...body,version:undefined});if(pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,body:{...body,requestId:crypto.randomUUID()}};
 setBusy(true);try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending.current.body),signal:AbortSignal.timeout(15000)});const result=await response.json();if(actionEpoch!==sessionEpoch.current)return;if(!response.ok){if(response.status<500)pending.current=null;throw new Error(result.error||'Action failed');}setData(result);pending.current=null;setMessage(action.operation==='search'?result.records.length+' matching records.':action.label+' completed.');if(['signin','signup','signout'].includes(action.operation)){setfield1('');setfield2('');setfield3(false);window.dispatchEvent(new Event('reframe-session'));}if(['create','delete'].includes(action.operation)){setfield1('');setfield2('');setfield3(false);setSelected('');}}
 catch(e){if(actionEpoch!==sessionEpoch.current)return;setError((e as Error).message);try{const r=await fetch(endpoint);if(r.ok){const latest=await r.json();if(actionEpoch===sessionEpoch.current)setData(latest);}}catch{/* Keep confirmed data when offline. */}}finally{if(actionEpoch===sessionEpoch.current)setBusy(false);}
}

return (<section style={{fontFamily: "inherit", color: "inherit", display: "grid", gap: 16}}>
<div><div><h2>{"Subscribe to our Newsletter"}</h2>
<p>{"Lorem ipsum text about why you should subscribe to our newsletter blabla. Lorem ipsum text about why you should subscribe to our newsletter blabla."}</p></div>
<div><input disabled={busy || !ready} aria-label={"Name"} placeholder={"Name"} type="text" value={field1} onChange={e => setfield1(e.target.value)} style={{font: 'inherit', color: 'inherit', background: 'transparent', border: '1px solid currentColor', borderRadius: 'var(--radius, 8px)', padding: 10, display: 'block', width: 'min(100%, 32rem)', margin: '8px 0'}} />
<input disabled={busy || !ready} aria-label={"Email address"} placeholder={"Email address"} type="text" value={field2} onChange={e => setfield2(e.target.value)} style={{font: 'inherit', color: 'inherit', background: 'transparent', border: '1px solid currentColor', borderRadius: 'var(--radius, 8px)', padding: 10, display: 'block', width: 'min(100%, 32rem)', margin: '8px 0'}} />
<label><input disabled={busy || !ready} type="checkbox" aria-label={"Daily Newsletter"} checked={field3} onChange={e => setfield3(e.target.checked)} />
{" Daily Newsletter\n    "}</label></div>
<div><button disabled={busy || !ready} type="button" onClick={() => onAction("action1")} style={{font: 'inherit', background: 'var(--primary, var(--color-primary, #3159e8))', color: 'var(--primary-foreground, white)', border: 0, padding: '12px 18px', borderRadius: 'var(--radius, 8px)', cursor: 'pointer'}}>{"Subscribe"}</button></div></div>
<div aria-live="polite"><p role="status">{!ready?(error?'':'Loading feature…'):busy?'Working…':message}</p>{error&&<p role="alert">{error}</p>}{!ready&&error&&error!=='Sign in to use this component.'&&<button type="button" onClick={()=>window.location.reload()}>Retry loading</button>}<h3>Saved records</h3><p>{data.records.length} records · saved on this computer</p><ul>{data.records.map(record=><li key={record.id}><button type="button" aria-pressed={selected===record.id} disabled={busy} onClick={()=>{setSelected(record.id);setfield1(String(record.values.field1 ?? ''));setfield2(String(record.values.field2 ?? ''));setfield3(Boolean(record.values.field3));setMessage('Record selected.');}}>{"Name · Email address · Daily Newsletter"+': '+Object.values(record.values).map(String).join(' · ')}</button></li>)}</ul></div>{data.result&&<pre aria-label="API response" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{data.result}</pre>}</section>);
}