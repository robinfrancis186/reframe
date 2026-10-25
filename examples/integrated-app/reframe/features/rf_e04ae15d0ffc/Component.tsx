import {useState as ReframeFeatureState,useEffect as ReframeFeatureEffect,useRef as ReframeFeatureRef} from 'react';
export default function ReframeFeature() {


const [data, setData] = ReframeFeatureState<{version:number;records:{id:string;values:Record<string,string|boolean>}[];counters:Record<string,number>;toggles:Record<string,boolean>}>({version:0,records:[],counters:{},toggles:{}});
const [ready,setReady]=ReframeFeatureState(false),[busy,setBusy]=ReframeFeatureState(false),[error,setError]=ReframeFeatureState(''),[message,setMessage]=ReframeFeatureState(''),[selected,setSelected]=ReframeFeatureState('');
const pending=ReframeFeatureRef<{fingerprint:string;body:Record<string,unknown>}|null>(null);
const actions=[{"id":"action1","label":"Add Element","href":null,"operation":"create","target":"","message":"","reason":"The capture does not define the intended business rule."},{"id":"action2","label":"Delete","href":null,"operation":"delete","target":"","message":"","reason":"Suggested from visible labels or links; review before building."}];
const endpoint="/api/reframe/rf_e04ae15d0ffc";
ReframeFeatureEffect(()=>{const controller=new AbortController();fetch(endpoint,{signal:controller.signal}).then(async r=>{const result=await r.json();if(!r.ok)throw new Error(result.error||'Could not load feature');return result;}).then(result=>{setData(result);setReady(true);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[]);
async function onAction(id:string){
 if(busy||!ready)return;const action=actions.find(a=>a.id===id);if(!action)return;setError('');setMessage('');
 if(action.operation==='navigate'){window.location.assign(action.target);return;}
 if(action.operation==='details'){setMessage(action.message);return;}
 if(action.operation==='reset'){setSelected('');setMessage('Fields cleared.');return;}
 if(['update','delete'].includes(action.operation)&&!selected){setError('Select a saved record first.');return;}
 const values={};
 const body={action:id,values,recordId:selected,version:data.version,query:Object.values(values).map(String).join(' ')};
 const fingerprint=JSON.stringify({...body,version:undefined});if(pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,body:{...body,requestId:crypto.randomUUID()}};
 setBusy(true);try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending.current.body),signal:AbortSignal.timeout(10000)});const result=await response.json();if(!response.ok){if(response.status<500)pending.current=null;throw new Error(result.error||'Action failed');}setData(result);pending.current=null;setMessage(action.operation==='search'?result.records.length+' matching records.':action.label+' completed.');if(['create','delete'].includes(action.operation)){setSelected('');}}
 catch(e){setError((e as Error).message);try{const r=await fetch(endpoint);if(r.ok)setData(await r.json());}catch{/* Keep confirmed data when offline. */}}finally{setBusy(false);}
}

return (<section style={{fontFamily: "inherit", color: "inherit", display: "grid", gap: 16}}>
<div><button disabled={busy || !ready} type="button" onClick={() => onAction("action1")} style={{font: 'inherit', background: 'var(--primary, var(--color-primary, #3159e8))', color: 'var(--primary-foreground, white)', border: 0, padding: '12px 18px', borderRadius: 'var(--radius, 8px)', cursor: 'pointer'}}>{"Add Element"}</button>
<hr />
<div><button disabled={busy || !ready} type="button" onClick={() => onAction("action2")} style={{font: 'inherit', background: 'var(--primary, var(--color-primary, #3159e8))', color: 'var(--primary-foreground, white)', border: 0, padding: '12px 18px', borderRadius: 'var(--radius, 8px)', cursor: 'pointer'}}>{"Delete"}</button></div></div>
<div aria-live="polite"><p role="status">{!ready?'Loading feature…':busy?'Saving…':message}</p>{error&&<p role="alert">{error}</p>}{!ready&&error&&<button onClick={()=>window.location.reload()}>Retry loading</button>}<h3>Saved records</h3><p>{data.records.length} records · saved on this computer</p><ul>{data.records.map(record=><li key={record.id}><button aria-pressed={selected===record.id} disabled={busy} onClick={()=>{setSelected(record.id);setMessage('Record selected.');}}>{'Record '+record.id.slice(0,8)}</button></li>)}</ul></div></section>);
}