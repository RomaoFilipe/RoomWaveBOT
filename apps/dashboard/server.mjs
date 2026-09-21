import { setupRoomControl } from "./room-integration.mjs";
import { normalizeImvuRoom } from "../../tools/room-runtime.mjs";
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { verifyPassword, makeRedactor } from './security.mjs';
const exec = promisify(execFile);
const data = new URL('../../.data/', import.meta.url);
const auth = JSON.parse(await readFile(new URL('dashboard/auth.json', data), 'utf8'));
const managementRoomId = process.env.ROOMWAVE_ROOM_ID;
let roomId = managementRoomId;
if (!roomId) throw new Error('ROOMWAVE_ROOM_ID required');
const origin = process.env.ROOMWAVE_DASHBOARD_ORIGIN || 'https://13-220-164-169.sslip.io';
const api = process.env.ROOMWAVE_API_URL || 'http://127.0.0.1:3001';
const engine = process.env.ROOMWAVE_AUDIO_ENGINE_URL || 'http://127.0.0.1:3210';
let root = `/api/rooms/${encodeURIComponent(roomId)}`;
const botKey = (await readFile(new URL('custom-commands.key', data), 'utf8')).trim();
const secrets = Object.entries(process.env).filter(([k]) => /password|secret|token|key|database_url/i.test(k)).map(([,v]) => v);
secrets.push(botKey, auth.hash);
for (const file of ['nodelink/password', 'nodelink/youtube-oauth.env', 'dashboard/access.txt']) {
  try { for (const line of (await readFile(new URL(file, data), 'utf8')).split('\n')) {
    if (file.endsWith('/password')) secrets.push(line.trim());
    else if (file.endsWith('access.txt')) secrets.push(line.split(': ').slice(1).join(': '));
    else if (line.includes('=')) {
      const value = line.slice(line.indexOf('=')+1); secrets.push(value);
      try { if (Array.isArray(JSON.parse(value))) secrets.push(...JSON.parse(value)); } catch {}
    }
  }} catch {}
}
const redact = makeRedactor(secrets);
const sessions = new Map();
const attempts = new Map();
const ttl = 12 * 60 * 60 * 1000;
const units = { bot:'roomwave-imvu', api:'roomwave-api', player:'roomwave-player', resolver:'roomwave-source-resolver', audio:'roomwave-audio-engine', radio:'roomwave-radio' };
const assets = { '/dashboard/':['index.html','text/html; charset=utf-8'], '/dashboard/app.js':['app.js','text/javascript; charset=utf-8'], '/dashboard/style.css':['style.css','text/css; charset=utf-8'] };
setInterval(() => {
  const now=Date.now();
  for(const [key,expiry] of sessions) if(expiry<now) sessions.delete(key);
  for(const [key,value] of attempts) if(value.until<now) attempts.delete(key);
},60000).unref();
function json(res,status,body){ res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body)); }
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>8192)throw new Error('BODY_TOO_LARGE');}return JSON.parse(text||'{}');}
async function request(base,path,payload){
  const response=await fetch(base+path,{method:payload===undefined?'GET':'POST',headers:{'Content-Type':'application/json','x-roomwave-bot-key':botKey},body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(45000)});
  const result=await response.json();
  if(!response.ok)throw new Error(typeof result.error==='string'?result.error:`SERVICE_HTTP_${response.status}`);
  return result;
}
async function owner(){
  const {room}=await request(api,`/api/rooms/${encodeURIComponent(managementRoomId)}`);
  const owners=room.members.filter(m=>m.role==='OWNER'&&m.user.imvuUserId);
  const boundId=process.env.ROOMWAVE_DASHBOARD_OWNER_IMVU_ID || auth.ownerImvuId;
  const chosen=owners.find(m=>m.user.imvuUserId===boundId);
  if(!chosen)throw new Error('OWNER_NOT_CONFIGURED');
  return {imvuUserId:chosen.user.imvuUserId, username:chosen.user.username, roomName:room.name};
}
async function serviceStates(){
  const args=['show',...Object.values(units).map(u=>u+'.service'),'--property=Id,ActiveState,SubState,MainPID','--no-pager'];
  const {stdout}=await exec('/usr/bin/systemctl',args,{timeout:5000,maxBuffer:16000});
  return stdout.trim().split(/\n\n+/).map(block=>Object.fromEntries(block.split('\n').map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)];})));
}
const rooms = await setupRoomControl({
  roomId, managementRoomId, actorId:process.env.ROOMWAVE_DASHBOARD_OWNER_IMVU_ID || auth.ownerImvuId,
  request, api, engine, exec, serviceStates,
  onActive:value=>{roomId=value.roomId;root=`/api/rooms/${encodeURIComponent(roomId)}`;},
});
let busy=false;
const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
    const url=new URL(req.url,origin), path=url.pathname;
    if(req.method==='GET'&&path==='/dashboard'){res.writeHead(302,{Location:'/dashboard/'});return res.end();}
    if(req.method==='GET'&&assets[path]){const [file,type]=assets[path];res.writeHead(200,{'Content-Type':type});return res.end(await readFile(new URL('public/'+file,import.meta.url)));}
    if(!path.startsWith('/dashboard/api/'))return json(res,404,{error:'NOT_FOUND'});
    if(req.method!=='GET'&&req.method!=='POST')return json(res,405,{error:'METHOD_NOT_ALLOWED'});
    if(req.method==='POST'&&(req.headers.origin!==origin||!String(req.headers['content-type']).startsWith('application/json')))return json(res,403,{error:'INVALID_ORIGIN'});
    const token=/\brw_session=([a-f0-9]{64})\b/.exec(req.headers.cookie||'')?.[1];
    if(req.method==='POST'&&path==='/dashboard/api/login'){
      const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0].trim();
      let rate=attempts.get(ip);if(!rate||rate.until<Date.now())rate={count:0,until:Date.now()+900000};
      if(rate.count>=5)return json(res,429,{error:'TOO_MANY_ATTEMPTS'});
      if(attempts.size>10000)return json(res,429,{error:'TOO_MANY_ATTEMPTS'});
      rate.count++;attempts.set(ip,rate);
      const input=await body(req);
      if(input.username!==auth.username||!verifyPassword(input.password,auth))return json(res,401,{error:'INVALID_LOGIN'});
      await owner();
      if(token)sessions.delete(token);
      if(sessions.size>=100)sessions.delete(sessions.keys().next().value);
      const id=randomBytes(32).toString('hex');sessions.set(id,Date.now()+ttl);attempts.delete(ip);
      res.setHeader('Set-Cookie',`rw_session=${id}; Path=/dashboard; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`);
      return json(res,200,{ok:true});
    }
    if(!token||!sessions.has(token)||sessions.get(token)<Date.now())return json(res,401,{error:'LOGIN_REQUIRED'});
    if(req.method==='POST'&&path==='/dashboard/api/logout'){sessions.delete(token);res.setHeader('Set-Cookie','rw_session=; Path=/dashboard; HttpOnly; Secure; SameSite=Strict; Max-Age=0');return json(res,200,{ok:true});}
    const actor=await owner(); // Recheck OWNER before every privileged request.
    if(req.method==='POST'&&path==='/dashboard/api/imvu/lookup'){
      const input=await body(req);
      return json(res,200,await request(api,'/api/imvu/lookup',{kind:input.kind,query:input.query,roomId:managementRoomId,imvuUserId:actor.imvuUserId}));
    }
    if(path==='/dashboard/api/welcome'){
      if(req.method==='GET')return json(res,200,{...await request(api,root+'/welcome'),roomId});
      if(busy||rooms.controller.switching)return json(res,409,{error:'ROOM_SWITCH_IN_PROGRESS'});
      const input=await body(req);
      if(input.roomId!==roomId)return json(res,409,{error:'ROOM_SWITCH_IN_PROGRESS'});
      busy=true;
      try{return json(res,200,await request(api,root+'/welcome',{enabled:input.enabled,message:input.message,imvuUserId:actor.imvuUserId}));}finally{busy=false;}
    }
    if(req.method==='GET'&&path==='/dashboard/api/rooms'){
      const saved=await rooms.managed({action:'list'});
      return json(res,200,{...saved,active:rooms.controller.active,operation:rooms.controller.operation,connection:await rooms.botStatus()});
    }
    if(req.method==='POST'&&path==='/dashboard/api/rooms'){
      if(busy||rooms.controller.switching)return json(res,409,{error:'ROOM_SWITCH_IN_PROGRESS'});
      const input=await body(req);
      if(input.action==='save'){
        busy=true;
        try{return json(res,200,await rooms.managed({action:'save',name:input.name,location:input.location}));}finally{busy=false;}
      }
      if(input.action==='activate'){
        busy=true;
        try{
          const {room}=await rooms.managed({action:'get',roomId:input.roomId});
          const target={roomId:room.id,...normalizeImvuRoom(room.imvuRoomId)};
          if(target.roomId===roomId){
            await exec('/usr/bin/sudo',['-n','/usr/local/sbin/roomwave-dashboard-bot','start'],{timeout:30000,maxBuffer:8000});
            return json(res,200,{ok:true,unchanged:true});
          }
          await rooms.controller.begin(target);
          return json(res,202,{ok:true,switching:true});
        }finally{busy=false;}
      }
      return json(res,400,{error:'INVALID_ACTION'});
    }
    if(req.method==='GET'&&path==='/dashboard/api/status'){
      const results=await Promise.allSettled([request(engine,'/status'),request(api,root+'/queue'),request(api,root+'/volume',{imvuUserId:actor.imvuUserId}),serviceStates(),request(api,root)]);
      const values=results.map(r=>r.status==='fulfilled'?r.value:null), playback=values[0];
      return json(res,200,{owner:actor.username,room:values[4]?.room?.name??actor.roomName,roomId,roomSwitch:rooms.controller.operation,playback:playback?{state:playback.state,title:playback.current?.title??null,startedAt:playback.startedAt,lastError:playback.lastError}:null,
        queue:values[1]?.queue.map(q=>({position:q.position,title:q.track.title,artist:q.track.artist,duration:q.track.durationSec,requestedBy:q.requestedBy?.username??'AutoDJ'}))??null,
        volume:values[2]?.volume??null,services:values[3],partial:values.some(v=>v===null)});
    }
    if(req.method==='GET'&&path==='/dashboard/api/commands'){
      const {names}=await request(api,root+'/commands',{action:'list',imvuUserId:actor.imvuUserId});
      const commands=[];
      for(let i=0;i<names.length;i+=5)commands.push(...await Promise.all(names.slice(i,i+5).map(async name=>({name,...await request(api,root+'/commands/'+encodeURIComponent(name))}))));
      return json(res,200,{commands});
    }
    if(req.method==='GET'&&path==='/dashboard/api/logs'){
      const key=url.searchParams.get('service')||'player';if(!units[key])return json(res,400,{error:'INVALID_SERVICE'});
      const {stdout}=await exec('/usr/bin/journalctl',['-u',units[key]+'.service','-n','80','--no-pager','-o','json'],{timeout:5000,maxBuffer:256000});
      const logs=stdout.split('\n').filter(Boolean).map(line=>{try{const j=JSON.parse(line);return{time:new Date(Number(j.__REALTIME_TIMESTAMP)/1000).toISOString(),message:redact(j.MESSAGE??'')};}catch{return null;}}).filter(Boolean);
      return json(res,200,{logs});
    }
    if(req.method==='POST'&&path==='/dashboard/api/action'){
      if(busy||rooms.controller.switching)return json(res,409,{error:'ACTION_IN_PROGRESS'});
      const input=await body(req),identity={imvuUserId:actor.imvuUserId};
      busy=true;
      try{
        switch(input.action){
          case 'add': if(typeof input.query!=='string'||!input.query.trim()||input.query.length>200)throw new Error('INVALID_QUERY');await request(api,root+'/requests',{...identity,query:input.query});break;
          case 'skip':case 'clear':await request(api,root+'/'+input.action,identity);break;
          case 'remove':if(!Number.isInteger(input.position)||input.position<1)throw new Error('INVALID_POSITION');await request(api,root+'/remove',{...identity,position:input.position});break;
          case 'volume':if(!Number.isInteger(input.volume)||input.volume<0||input.volume>100)throw new Error('INVALID_VOLUME');await request(api,root+'/volume',{...identity,volume:input.volume});break;
          case 'pause':case 'resume':{const result=await request(engine,'/'+input.action,{});if(result.ok===false)throw new Error('PLAYBACK_NOT_READY');break;}
          case 'bot-start':case 'bot-stop':case 'bot-restart':await exec('/usr/bin/sudo',['-n','/usr/local/sbin/roomwave-dashboard-bot',input.action.slice(4)],{timeout:30000,maxBuffer:8000});break;
          case 'command-create':case 'command-edit':case 'command-delete':await request(api,root+'/commands',{...identity,action:input.action.slice(8),name:input.name,response:input.response});break;
          default:return json(res,400,{error:'INVALID_ACTION'});
        }
        return json(res,200,{ok:true});
      }finally{busy=false;}
    }
    return json(res,404,{error:'NOT_FOUND'});
  }catch(error){
    const allowed=['IMVU_NOT_FOUND','IMVU_RESTRICTED','IMVU_RATE_LIMIT','IMVU_UNAVAILABLE','INVALID_IMVU_USER','INVALID_WELCOME','OWNER_ONLY','INVALID_ROOM','INVALID_IMVU_ROOM','ROOM_NOT_OWNED','ROOM_ALREADY_EXISTS','ROOM_SWITCH_IN_PROGRESS','OWNER_NOT_CONFIGURED','INVALID_QUERY','INVALID_POSITION','INVALID_VOLUME','RESERVED_OR_INVALID_NAME','ALREADY_EXISTS','NOT_FOUND','RESPONSE_REQUIRED','INVALID_COMMAND','NO_TRACK_PLAYING','QUEUE_EMPTY','PLAYBACK_NOT_READY'];
    const code=allowed.includes(error.message)?error.message:'SERVICE_UNAVAILABLE';
    console.error('Dashboard request failed:',code);
    return json(res,code==='SERVICE_UNAVAILABLE'?503:400,{error:code});
  }
});
server.requestTimeout=60000;server.headersTimeout=10000;
server.listen(Number(process.env.ROOMWAVE_DASHBOARD_PORT||3240),'127.0.0.1',()=>console.log('RoomWave dashboard listening on loopback'));
