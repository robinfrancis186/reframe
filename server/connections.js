import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { atomicJSON, fail } from './features/services.mjs';
import { isItem } from '../src/model.ts';
import { cleanHtml } from './capture.js';
import { validatedFeature } from './features.js';
import { libraryEntry, libraryItem } from '../src/library/catalog.js';

export const connectionScopes={library:'Browse Originals and export source',capture:'Capture public URLs or supplied HTML',build:'Inspect and generate declared UI/API behavior',clipboard:'Read and save explicitly shared components',projects:'Inspect connected destinations and estimate fit'};
const hash=value=>createHash('sha256').update(value).digest('hex');
export class Connections {
  constructor(folder){this.file=path.join(folder,'connections.json');this.queue=Promise.resolve();this.active=0;}
  async read(){try{return JSON.parse(await readFile(this.file,'utf8'));}catch(e){if(e.code==='ENOENT')return {clients:[],inbox:[],activity:[]};throw e;}}
  change(fn){const work=this.queue.then(async()=>{const state=await this.read();const result=await fn(state);if(Buffer.byteLength(JSON.stringify(state))>16000000)fail(413,'Shared workspace exceeds 16 MB. Remove shared components first.');await atomicJSON(this.file,state);return result;});this.queue=work.catch(()=>{});return work;}
  async list(){await this.queue;const state=await this.read();return {...state,clients:state.clients.map(({hash,...client})=>client),scopes:connectionScopes};}
  async create({name,scopes}={}){
    if(typeof name!=='string'||!name.trim()||name.length>80||!Array.isArray(scopes)||!scopes.length||scopes.length>5||new Set(scopes).size!==scopes.length||scopes.some(s=>!Object.hasOwn(connectionScopes,s)))fail(400,'Name the assistant and select valid permissions.');
    return this.change(state=>{if(state.clients.filter(c=>!c.revoked).length>=12)fail(400,'At most twelve active connections are supported.');
      const token=randomBytes(32).toString('hex'),client={id:randomUUID(),name:name.trim(),scopes,createdAt:new Date().toISOString(),revoked:false,hash:hash(token)};state.clients.push(client);const {hash:_,...publicClient}=client;return {client:publicClient,token};});
  }
  async revoke(id){return this.change(state=>{const client=state.clients.find(c=>c.id===id);if(!client)fail(404,'Connection not found.');client.revoked=true;return {revoked:true};});}
  async authorize(header){
    const token=typeof header==='string'?header.match(/^Bearer ([a-f0-9]{64})$/)?.[1]:null;
    if(!token)fail(401,'A Reframe connection token is required.');
    await this.queue;const state=await this.read(),digest=Buffer.from(hash(token));
    const client=state.clients.find(c=>!c.revoked&&timingSafeEqual(Buffer.from(c.hash),digest));
    if(!client)fail(401,'Connection is invalid or revoked.');return client;
  }
  async record(client,tool,ok){return this.change(state=>{state.activity.unshift({id:randomUUID(),client:client.name,tool,ok,at:new Date().toISOString()});state.activity=state.activity.slice(0,50);return {};});}
  async save(item){
    if(!isItem(item)||item.id.length>150||item.source.length>2000||item.evidence.length>10000)fail(400,'Share a valid component, not credentials or app records.');
    const clean=Object.fromEntries(['id','name','source','kind','capturedAt','evidence','theme','libraryId'].filter(k=>item[k]!==undefined).map(k=>[k,item[k]]));clean.html=cleanHtml(item.html);
    if(item.libraryId){const original=libraryItem(libraryEntry(item.libraryId));Object.assign(clean,original,{theme:item.theme});}
    if(item.feature)clean.feature=await validatedFeature({...clean,feature:item.feature});
    return this.change(state=>{const existing=state.inbox.findIndex(entry=>entry.item.id===clean.id);const entry={id:clean.id,item:clean,at:new Date().toISOString()};if(existing<0){if(state.inbox.length>=30)fail(400,'Shared clipboard has thirty entries. Remove an entry first.');state.inbox.unshift(entry);}else state.inbox[existing]=entry;return {id:entry.id,name:clean.name};});
  }
  async remove(id){return this.change(state=>{if(!state.inbox.some(entry=>entry.id===id))fail(404,'Shared component not found.');state.inbox=state.inbox.filter(entry=>entry.id!==id);return {removed:true};});}
  async component(id){const entry=(await this.list()).inbox.find(entry=>entry.id===id);if(!entry)fail(404,'Shared component not found.');return entry.item;}
}
