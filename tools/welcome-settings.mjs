import {readFile, mkdir, writeFile, rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const directory=new URL('../.data/welcome/',import.meta.url);
export const defaultWelcome={enabled:false,message:'Bem-vindo, {nome}! 🎉 Usa !comandos para conhecer o bot.'};
function location(id){if(!/^[a-f0-9-]{36}$/i.test(id))throw new Error('INVALID_ROOM');return new URL(id+'.json',directory);}
export async function readWelcome(id){try{return JSON.parse(await readFile(location(id),'utf8'));}catch(e){if(e.code==='ENOENT')return {...defaultWelcome};throw e;}}
export async function writeWelcome(id,value){const file=location(id);await mkdir(directory,{recursive:true,mode:0o700});const temp=new URL(randomUUID()+'.tmp',directory);await writeFile(temp,JSON.stringify(value),{mode:0o600});await rename(temp,file);return value;}
