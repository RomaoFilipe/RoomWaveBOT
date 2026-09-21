import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const root=new URL('../.data/room-security/',import.meta.url);let queue=Promise.resolve();
function path(id){if(!/^[a-f0-9-]{36}$/i.test(id))throw new Error('INVALID_ROOM');return new URL(id+'.json',root);}
export async function readSecurity(id){try{return JSON.parse(await readFile(path(id),'utf8'));}catch(e){if(e.code==='ENOENT')return {people:[]};throw e;}}
export async function changePerson(id,person,remove=false){
 const task=queue.then(async()=>{
  const data=await readSecurity(id);data.people=data.people.filter(p=>p.id!==person.id);
  if(!remove){if(data.people.length>=50)throw new Error('WATCH_LIMIT');data.people.push({...person,updatedAt:new Date().toISOString()});}
  await mkdir(root,{recursive:true,mode:0o700});const tmp=new URL(randomUUID()+'.tmp',root);
  await writeFile(tmp,JSON.stringify(data),{mode:0o600});await rename(tmp,path(id));return data;
 });queue=task.catch(()=>{});return task;
}
