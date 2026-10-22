import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isItem, isTheme, themes } from '../src/model.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
export class GradioLab {
  token=randomUUID(); child=null; port=null; context=null; result=null; starting=null;
  python=process.env.REFRAME_GRADIO_PYTHON || path.join(root,'.reframe/gradio-venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  async status(){
    let version=null;try{const r=await promisify(execFile)(this.python,['-c','import importlib.metadata; print(importlib.metadata.version("gradio"))'],{timeout:5000});version=r.stdout.trim();}catch{}
    return {available:!!version,version,running:!!this.child&&!!this.port,url:this.child&&this.port?`http://127.0.0.1:${this.port}`:null,setup:'npm run gradio:setup',limitation:'Local Gradio UI, managed by Reframe. No public share URL and no execution of uploaded source.'};
  }
  async start(body,workbenchPort){
    if(!isItem(body?.item)||body.item.html.length>200000||typeof body.goal!=='string'||body.goal.length>3000)throw new Error('Choose a captured component and instructions first.');
    this.context={item:body.item,theme:isTheme(body.theme)?body.theme:themes[0],goal:body.goal,target:body.target||'react'};this.result=null;
    if(this.starting)return this.starting;
    if(this.child)return this.status();
    this.starting=this.launch(workbenchPort).finally(()=>{this.starting=null;});return this.starting;
  }
  async launch(workbenchPort){
    if(!(await this.status()).available)throw new Error('Gradio is not installed. Run npm run gradio:setup in this project, then start the lab.');
    const server=createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const port=server.address().port;await new Promise(resolve=>server.close(resolve));
    const child=spawn(this.python,[path.join(root,'server/gradio_app.py')],{cwd:root,stdio:['ignore','ignore','pipe'],env:{PATH:process.env.PATH,HOME:process.env.HOME,SYSTEMROOT:process.env.SYSTEMROOT,GRADIO_ANALYTICS_ENABLED:'False',PYTHONUNBUFFERED:'1',REFRAME_URL:`http://127.0.0.1:${workbenchPort}`,REFRAME_GRADIO_TOKEN:this.token,GRADIO_SERVER_PORT:String(port)}});
    this.child=child;child.stderr.resume();
    child.once('exit',()=>{if(this.child===child){this.child=null;this.port=null;}});child.once('error',()=>{if(this.child===child){this.child=null;this.port=null;}});
    for(let attempt=0;attempt<150;attempt++){
      if(child.exitCode!==null||!this.child)throw new Error('Gradio could not start. Check the Python environment and pinned requirements.');
      try{const response=await fetch(`http://127.0.0.1:${port}/config`,{signal:AbortSignal.timeout(500)});if(response.ok){const config=await response.json();if(config.title==='Reframe · Gradio Lab'){this.port=port;return this.status();}}}catch{}
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    await this.stop();throw new Error('Gradio took too long to start. Retry after checking the local Python environment.');
  }
  async stop(){const child=this.child;this.child=null;this.port=null;this.context=null;this.result=null;if(child)child.kill('SIGTERM');return {running:false};}
}
