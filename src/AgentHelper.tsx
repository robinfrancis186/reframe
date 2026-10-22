import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ArrowRight,Send,X,Square} from 'lucide-react';
import {agents} from './agent-skills.js';
import {agentGuides,contextualAgent,helpActions} from './agent-help.js';
import {type ComponentItem} from './model';
import './workspace.css';
import AgentAvatar,{type AgentMood} from './AgentAvatar';

type Reply={answer:string;action:keyof typeof helpActions;provider:string;model:string|null;limitation:string};
export default function AgentHelper({page,item,invite,hidden,onAction}:{page:string;item:ComponentItem;invite:{id:string;nonce:number}|null;hidden:boolean;onAction:(action:string)=>void}){
  const [agentId,setAgentId]=useState(contextualAgent(page)),[open,setOpen]=useState(false),[tip,setTip]=useState(false);
  const [reaction,setReaction]=useState<AgentMood>('greeting');
  const [question,setQuestion]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [history,setHistory]=useState<{question:string;reply:Reply}[]>([]);
  const [provider,setProvider]=useState('local'),[configured,setConfigured]=useState(false),[apiKey,setApiKey]=useState('');
  const controller=useRef<AbortController|null>(null),panel=useRef<HTMLElement>(null);
  const launcher=useRef<HTMLButtonElement>(null),returnFocus=useRef<HTMLElement|null>(null),wasOpen=useRef(false);
  useEffect(()=>{const abort=new AbortController();fetch('/api/agents/status',{signal:abort.signal}).then(r=>r.json()).then(data=>{if(!abort.signal.aborted){setConfigured(data.openAI);if(data.openAI)setProvider('openai');}}).catch(()=>{});return()=>abort.abort();},[]);
  useEffect(()=>{
    controller.current?.abort();setBusy(false);setOpen(false);setTip(false);setHistory([]);setReaction('greeting');setError('');setQuestion('');setApiKey('');setAgentId(contextualAgent(page));
    const timer=setTimeout(()=>{try{if(sessionStorage.getItem('reframe-help-seen:'+page))return;sessionStorage.setItem('reframe-help-seen:'+page,'1');}catch{}setTip(true);},1600);
    return()=>{clearTimeout(timer);controller.current?.abort();};
  },[page,item.id]);
  useEffect(()=>{if(!tip)return;const timer=setTimeout(()=>setTip(false),8000);return()=>clearTimeout(timer);},[tip]);
  useEffect(()=>{if(invite){controller.current?.abort();setBusy(false);if(invite.id!==agentId)setHistory([]);setQuestion('');setApiKey('');setError('');setAgentId(invite.id);setReaction('greeting');setOpen(true);setTip(false);}},[invite]);
  useLayoutEffect(()=>{
    if(open){returnFocus.current=document.activeElement instanceof HTMLElement&&document.activeElement!==document.body?document.activeElement:null;panel.current?.focus();}
    else if(wasOpen.current)(returnFocus.current?.isConnected?returnFocus.current:launcher.current)?.focus({preventScroll:true});
    wasOpen.current=open;
  },[open]);
  const agent=agents.find(agent=>agent.id===agentId)!,guide=agentGuides[agentId as keyof typeof agentGuides];
  function seen(){setTip(false);try{sessionStorage.setItem('reframe-help-seen:'+page,'1');}catch{}}
  function close(){seen();controller.current?.abort();setBusy(false);setOpen(false);setApiKey('');}
  async function ask(){
    controller.current?.abort();const abort=new AbortController();controller.current=abort;setBusy(true);setError('');
    const temporaryKey=apiKey;setApiKey('');
    try{const result=await fetch('/api/agents/help',{method:'POST',headers:{'Content-Type':'application/json'},signal:abort.signal,body:JSON.stringify({agentId,page,question,provider,history:history.flatMap(turn=>[{role:'user',content:turn.question},{role:'assistant',content:turn.reply.answer}]).slice(-6),itemName:item.name,html:item.html.slice(0,12000),...(temporaryKey?{apiKey:temporaryKey}:{})})});const data=await result.json();if(!result.ok)throw new Error(data.error||'Guidance could not be loaded.');if(!abort.signal.aborted){setReaction('success');setHistory(old=>[...old,{question:provider==='local'?'Show guided help':question,reply:data}].slice(-6));setQuestion('');}}
    catch(e){if(!abort.signal.aborted)setError((e as Error).message);}
    finally{if(!abort.signal.aborted)setBusy(false);}
  }
  if(hidden)return null;
  return <aside className="agent-helper" aria-label="Contextual agent help">
    {tip&&!open&&<div className="agent-tip" role="status"><AgentAvatar id={agent.id} name={agent.name} size={64} mood="greeting"/><div><strong>{agent.name}</strong><p>I can help you here.</p><button onClick={()=>{seen();setOpen(true);}}>See how <ArrowRight size={13}/></button></div><button className="helper-icon" aria-label="Dismiss agent tip" onClick={seen}><X size={15}/></button></div>}
    {open?<section className="helper-panel" ref={panel} tabIndex={-1} role="dialog" aria-label={`${agent.name} specialist help`} onKeyDown={e=>{if(e.key==='Escape')close();}}>
      <header className={busy?'helper-thinking':'helper-ready'}><AgentAvatar id={agent.id} name={agent.name} size={72} mood={busy?'thinking':error?'error':reaction}/><div><strong>{agent.name}</strong><small>{agent.role} · {busy?'Thinking…':error?'Needs attention':reaction==='stopped'?'Stopped':history.length?'Response ready':provider==='openai'?'Ready · OpenAI':'Ready · local guide'}</small></div><button className="helper-icon" aria-label="Close agent help" onClick={close}><X size={17}/></button></header>
      <label>Choose a specialist<select aria-label="Choose a specialist" disabled={busy} value={agentId} onChange={e=>{setAgentId(e.target.value);setHistory([]);setError('');setReaction('greeting');}}>{agents.map(agent=><option key={agent.id} value={agent.id}>{agent.name} · {agent.role}</option>)}</select></label>
      <p className="helper-guide">{guide.text}</p><button className="helper-action" onClick={()=>{close();onAction(guide.action);}}>{helpActions[guide.action as keyof typeof helpActions].label}<ArrowRight size={14}/></button>
      <form onSubmit={e=>{e.preventDefault();void ask();}}><label>Help mode<select aria-label="Agent help mode" value={provider} disabled={busy} onChange={e=>{setProvider(e.target.value);setApiKey('');}}><option value="local">Local guided help</option><option value="openai">Ask with OpenAI</option></select></label>
        {provider==='openai'&&<><label>Your question<textarea aria-label="Question for specialist" value={question} maxLength={1500} disabled={busy} onChange={e=>setQuestion(e.target.value)} placeholder="What can I improve in this component?"/></label>{!configured&&<label>OpenAI key for this question<input aria-label="Agent help OpenAI key" type="password" autoComplete="off" value={apiKey} maxLength={1000} onChange={e=>setApiKey(e.target.value)}/></label>}<p className="helper-note">Sends the question and recent conversation and bounded visible capture text to OpenAI. Per-request keys are cleared immediately; chat cannot apply code changes.</p></>}
        <button className="primary" disabled={busy||provider==='openai'&&(!question.trim()||!configured&&!apiKey.trim())}><Send size={14}/>{busy?'Working…':provider==='openai'?`Ask ${agent.name}`:'Show guided help'}</button>
      </form>
      {busy&&<div className="helper-working" role="status"><span className="helper-pulse">● ● ●</span> {agent.name} is thinking… <button onClick={()=>{controller.current?.abort();setBusy(false);setReaction('stopped');}}><Square size={12}/> Stop</button></div>}
      {history.length>0&&<button disabled={busy} onClick={()=>{setHistory([]);setReaction('greeting');}}>Clear conversation</button>}
      {error&&<p role="alert" className="error-banner">{error}</p>}
      <div className="helper-conversation" aria-label="Specialist conversation" aria-live="polite">{history.map((turn,index)=><div className="helper-answer" key={index}><p className="helper-question"><strong>You</strong><br/>{turn.question}</p><small>{agent.name} · {turn.reply.model||'Local guidance'}</small><p>{turn.reply.answer}</p>{turn.reply.action!=='none'&&<button onClick={()=>{close();onAction(turn.reply.action);}}>{helpActions[turn.reply.action].label}<ArrowRight size={14}/></button>}<small>{turn.reply.limitation}</small></div>)}</div>
    </section>:<button ref={launcher} className="helper-launcher" aria-label="Open agent help" onClick={()=>{seen();setOpen(true);}}><AgentAvatar id={agent.id} name={agent.name} size={40}/>Ask {agent.name}</button>}
  </aside>;
}
