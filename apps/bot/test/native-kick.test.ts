import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nativeKick} from '../src/imvu/native-kick.js';
function fixture({status=204,throws=false,stays=false,moderator=true,wrongSession=false,initiallyPresent=true}={}){
 let deleted=0;const calls:any[]=[];
 const context:any={get:async(url:string)=>{let data:any;
  if(url.endsWith('/moderators'))data={data:{items:moderator?[url+'/user-3']:[]},relations:{}};
  else if(url.endsWith('/login/me'))data={data:{sauce:'test-only'},relations:{user:'https://api.imvu.com/user/user-'+(wrongSession?'9':'3')}};
  else if(url.endsWith('/participants'))data={data:{items:initiallyPresent&&(!deleted||stays)?[url+'/user-4']:[]}};
  else data={data:{customers_id:1,customers_room_id:2}};
  return {ok:()=>true,json:async()=>({id:url,denormalized:{[url]:data}}),dispose:async()=>{}};
 },delete:async(url:string,options:any)=>{deleted++;calls.push({url,options});if(throws)throw new Error('timeout');return {status:()=>status,dispose:async()=>{}};}};
 return {context,calls};
}
test('native kick performs one exact participant DELETE, JSON reason and verifies absence',async()=>{
 const f=fixture();assert.equal(await nativeKick(f.context,'1-2','1','4','3',async()=>true),'KICK_CONFIRMED');
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,'https://api.imvu.com/chat/chat-1-2/participants/user-4');assert.deepEqual(f.calls[0].options.data,{reason:'booted'});assert.equal(f.calls[0].options.maxRetries,0);assert.equal(f.calls[0].options.maxRedirects,0);
});
test('native kick rejects insufficient rights, protected targets, wrong session and absent target',async()=>{
 for(const overrides of [{moderator:false},{wrongSession:true}]){const f=fixture(overrides);assert.equal(await nativeKick(f.context,'1-2','1','4','3',async()=>true),'KICK_PREFLIGHT_FAILED');assert.equal(f.calls.length,0);}
 for(const target of ['1','3']){const f=fixture();assert.equal(await nativeKick(f.context,'1-2','1',target,'3',async()=>true),'KICK_PREFLIGHT_FAILED');assert.equal(f.calls.length,0);}
 const f=fixture({initiallyPresent:false});assert.equal(await nativeKick(f.context,'1-2','1','4','3',async()=>true),'TARGET_ABSENT');assert.equal(f.calls.length,0);
});
test('native kick never retries timeout or claims confirmed after rejection / still present',async()=>{
 for(const [settings,result]of [[{throws:true},'KICK_UNCONFIRMED'],[{status:403},'KICK_REJECTED'],[{status:500},'KICK_UNCONFIRMED'],[{stays:true},'KICK_UNCONFIRMED']]as const){const f=fixture(settings);assert.equal(await nativeKick(f.context,'1-2','1','4','3',async()=>true),result);assert.equal(f.calls.length,1);}
 const f=fixture();let checks=0;assert.equal(await nativeKick(f.context,'1-2','1','4','3',async()=>++checks<2),'ROOM_CHANGED');assert.equal(f.calls.length,0);
});
