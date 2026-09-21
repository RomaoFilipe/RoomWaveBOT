import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {rm,writeFile} from 'node:fs/promises';
import {activitySettings,saveActivitySettings,recordActivity,readActivity,clearActivity,purgeActivity} from '../../../tools/room-activity.mjs';
test('room history requires opt-in, isolates rooms, searches and clears records',async()=>{
 const a=randomUUID(),b=randomUUID(),dir=new URL('../../../.data/room-activity/'+a+'/',import.meta.url);
 try{
 assert.equal((await activitySettings(a)).enabled,false);
 assert.equal((await recordActivity(a,{type:'message',text:'hidden'})).stored,false);
 await saveActivitySettings(a,true);
 await Promise.all([recordActivity(a,{type:'message',userId:'123',text:'hello test'}),recordActivity(a,{type:'join',userId:'123'})]);
 assert.equal((await readActivity(a,'HELLO','message')).length,1);
 assert.equal((await readActivity(a,'123','history')).length,1);
 assert.equal((await readActivity(b)).length,0);
 await writeFile(new URL('2000-01-01.jsonl',dir),'{}\n');await purgeActivity();
 await saveActivitySettings(a,false);assert.equal((await recordActivity(a,{type:'message',text:'no'})).stored,false);
 await clearActivity(a);assert.equal((await readActivity(a)).length,0);
 await assert.rejects(readActivity('../unsafe'),/INVALID_ROOM/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
