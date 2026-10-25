import { useEffect, useState } from 'react';

export default function ReframeAccount({ endpoint, showLogin = true }: { endpoint: string; showLogin?: boolean }) {
  const [user, setUser] = useState<{email:string}|null>(null), [email,setEmail] = useState(''), [password,setPassword] = useState('');
  const [keys,setKeys] = useState<{name:string;configured:boolean;endpoint:string;method:string}[]>([]), [values,setValues] = useState<Record<string,string>>({});
  const [busy,setBusy] = useState(false), [message,setMessage] = useState('');
  async function request(route:string, body?:unknown) {
    const response=await fetch(endpoint+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Account request failed.');return result;
  }
  useEffect(()=>{
    let current=true,revision=0;
    async function refresh(){const own=++revision;setUser(null);setKeys([]);setValues({});try{const result=await request('/auth');if(!current||own!==revision)return;setUser(result.user);if(result.user){const credentials=await request('/credentials');if(current&&own===revision)setKeys(credentials.keys);}else setKeys([]);}catch(error){if(current&&own===revision)setMessage((error as Error).message);}}
    void refresh();window.addEventListener('reframe-session',refresh);return()=>{current=false;window.removeEventListener('reframe-session',refresh);};
  },[endpoint]);
  async function authenticate(operation:string){
    setBusy(true);setMessage('');
    try{await request('/auth',{operation,email,password});setPassword('');window.dispatchEvent(new Event('reframe-session'));setMessage(operation==='signout'?'Signed out.':'Signed in.');}
    catch(error){setMessage((error as Error).message);}finally{setBusy(false);}
  }
  async function saveKey(name:string,value:string){
    setBusy(true);setMessage('');
    try{const result=await request('/credentials',{name,value});setKeys(result.keys);setValues(old=>({...old,[name]:''}));setMessage(value?'API key saved on this server.':'API key removed.');}
    catch(error){setMessage((error as Error).message);}finally{setBusy(false);}
  }
  return <section aria-label="Account and API keys" style={{border:'1px solid currentColor',borderRadius:12,padding:16,marginBlock:16}}>
    <h3>Account &amp; API keys</h3>
    {user ? <><p>Signed in as <strong>{user.email}</strong></p><button disabled={busy} onClick={()=>void authenticate('signout')}>Sign out</button>
      {keys.map(key=><fieldset key={key.name} disabled={busy}><legend>{key.name} · {key.configured?'Configured':'Not configured'}</legend><p style={{overflowWrap:'anywhere'}}>Destination: {key.method} {key.endpoint}</p><label>API key for {key.name}<input type="password" autoComplete="off" value={values[key.name]||''} onChange={event=>setValues(old=>({...old,[key.name]:event.target.value}))}/></label><button disabled={!values[key.name]} onClick={()=>void saveKey(key.name,values[key.name])}>Save API key</button>{key.configured&&<button onClick={()=>void saveKey(key.name,'')}>Remove API key</button>}</fieldset>)}
      {!!keys.length&&<p>Keys are encrypted on this server and never included in clipboard exports. Review the API endpoint before saving a key.</p>}</>
      : showLogin ? <fieldset disabled={busy}><legend>Sign in to use this component</legend><label>Account email<input type="email" autoComplete="username" value={email} onChange={event=>setEmail(event.target.value)}/></label><label>Account password<input type="password" autoComplete="current-password" minLength={12} maxLength={128} value={password} onChange={event=>setPassword(event.target.value)}/></label><p>Use a password of at least 12 characters. This creates a local account; email verification and password recovery are not enabled.</p><button onClick={()=>void authenticate('signin')}>Sign in</button><button onClick={()=>void authenticate('signup')}>Create account</button></fieldset> : <p>Use the captured email/password form below to sign in or create an account.</p>}
    {message&&<p role="status">{message}</p>}
  </section>;
}
