import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lookupAnkh} from '../../../tools/ankh-directory.mjs';
test('Ankh connector uses real local endpoints and rejects mismatched results',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(url.origin,'http://127.0.0.1:3250');assert.equal(options.method,'GET');assert.equal(url.searchParams.get('userId'),'123');return Response.json({id:'123',kind:'user',source:'Ankh',username:'Test'});};
 assert.equal((await lookupAnkh('user','123')).source,'Ankh');assert.equal(calls,1);
 globalThis.fetch=async(url,options)=>{assert.equal(options.method,'POST');assert.equal(url.pathname,'/api/info/room');assert.equal(url.searchParams.get('roomId'),'123-456');return Response.json({id:'123-456',kind:'room',source:'Ankh',name:'Room'});};
 assert.equal((await lookupAnkh('room','123-456')).name,'Room');
 globalThis.fetch=async()=>Response.json({id:'999',kind:'user',source:'Ankh'});
 await assert.rejects(lookupAnkh('user','123'),/ANKH_UPSTREAM_ERROR/);
 globalThis.fetch=async()=>{throw new Error('offline')};
 await assert.rejects(lookupAnkh('user','123'),/ANKH_UNAVAILABLE/);
 await assert.rejects(lookupAnkh('room','http://localhost'),/INVALID_IMVU_ROOM/);
 }finally{globalThis.fetch=original;}
});
