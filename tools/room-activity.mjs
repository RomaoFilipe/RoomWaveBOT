import {readFile,writeFile,appendFile,mkdir,rename,readdir,unlink,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const root=new URL('../.data/room-activity/',import.meta.url);
let queue=Promise.resolve();
function folder(id){if(!/^[a-f0-9-]{36}$/i.test(id))throw new Error('INVALID_ROOM');return new URL(id+'/',root);}
async function serial(fn){const task=queue.then(fn);queue=task.catch(()=>{});return task;}
export async function activitySettings(id){try{return JSON.parse(await readFile(new URL('settings.json',folder(id)),'utf8'));}catch(e){if(e.code==='ENOENT')return {enabled:false};throw e;}}
export async function saveActivitySettings(id,enabled){return serial(async()=>{const dir=folder(id);await mkdir(dir,{recursive:true,mode:0o700});const temp=new URL(randomUUID()+'.tmp',dir);await writeFile(temp,JSON.stringify({enabled}),{mode:0o600});await rename(temp,new URL('settings.json',dir));return {enabled};});}
export async function recordActivity(id,event){return serial(async()=>{
 if(!(await activitySettings(id)).enabled)return {stored:false};
 const dir=folder(id);await mkdir(dir,{recursive:true,mode:0o700});const now=new Date(),path=new URL(now.toISOString().slice(0,10)+'.jsonl',dir);
 if((await stat(path).catch(()=>({size:0}))).size>2_000_000)return {stored:false,limit:true};
 await appendFile(path,JSON.stringify({...event,time:now.toISOString()})+'\n',{mode:0o600});return {stored:true};
});}
export async function clearActivity(id){return serial(async()=>{const dir=folder(id);for(const file of await readdir(dir).catch(()=>[]))if(file.endsWith('.jsonl'))await unlink(new URL(file,dir));return {ok:true};});}
export async function readActivity(id,query='',kind='all'){
 const dir=folder(id),cutoff=Date.now()-7*86400000;const output=[];
 for(const file of (await readdir(dir).catch(()=>[])).filter(f=>/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort().reverse()){
  if(Date.parse(file.slice(0,10))<cutoff)continue;
  const lines=(await readFile(new URL(file,dir),'utf8')).trim().split('\n').reverse();
  for(const line of lines){let event;try{event=JSON.parse(line);}catch{continue;}if(Date.parse(event.time)<cutoff)continue;
   if(kind==='message'&&event.type!=='message'||kind==='history'&&event.type==='message')continue;
   if(query&&!`${event.userId??''} ${event.name??''} ${event.text??''}`.toLowerCase().includes(query.toLowerCase()))continue;
   output.push(event);if(output.length>=100)return output;
  }
 }return output;
}
export async function purgeActivity(){const cutoff=Date.now()-7*86400000;for(const id of await readdir(root).catch(()=>[])){if(!/^[a-f0-9-]{36}$/i.test(id))continue;const dir=folder(id);for(const file of await readdir(dir))if(/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(file)&&Date.parse(file.slice(0,10))<cutoff)await unlink(new URL(file,dir)).catch(()=>{});}}
