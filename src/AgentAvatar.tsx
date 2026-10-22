import {type CSSProperties} from 'react';
import {Lightbulb,Code2,Check,TriangleAlert,Pause,MessageCircle} from 'lucide-react';
import './agent-avatar.css';
export type AgentMood='idle'|'greeting'|'thinking'|'working'|'success'|'error'|'stopped';
export function agentMood(status?:string):AgentMood {
 if(status==='running')return 'working';
 if(status==='complete'||status==='passed')return 'success';
 if(['failed','passed-with-issues','error','blocked'].includes(status||''))return 'error';
 if(['stopped','cancelled','skipped'].includes(status||''))return 'stopped';
 return 'idle';
}
const labels:Record<AgentMood,string>={idle:'Ready to help',greeting:'Hello!',thinking:'Thinking…',working:'Working…',success:'Complete',error:'Needs attention',stopped:'Stopped'};
export default function AgentAvatar({id,name,mood='idle',size=160}:{id:string;name:string;mood?:AgentMood;size?:number}){
 const Icon={greeting:MessageCircle,thinking:Lightbulb,working:Code2,success:Check,error:TriangleAlert,stopped:Pause,idle:null}[mood];
 return <span className="agent-avatar" data-mood={mood} style={{width:size,maxWidth:'100%'} as CSSProperties} role="img" aria-label={`${name}: ${labels[mood]}`}>
  <img className="agent-original" src={'/agents/'+id+'.webp'} alt="" width="200" height="200"/>
  {Icon&&<span className={'avatar-symbol avatar-'+mood} aria-hidden="true"><Icon className={mood==='thinking'?'avatar-rays avatar-bulb':undefined} size={22}/></span>}
 </span>;
}
