const $ = id => document.getElementById(id);
let signedIn=false,tab='overview',editing=false,loading=false,actionBusy=false,lastStatus=null,noticeTimer;
const errors={INVALID_WELCOME:"Escreve uma mensagem entre 1 e 350 caracteres.",OWNER_ONLY:"Só o dono pode alterar esta configuração.",INVALID_ROOM:"Preenche o nome e o link/ID da sala.",INVALID_IMVU_ROOM:"Usa um link IMVU de sala ou o ID no formato 12345-678.",ROOM_NOT_OWNED:"Não tens controlo desta sala no RoomWave.",ROOM_ALREADY_EXISTS:"Essa sala já está registada.",ROOM_SWITCH_IN_PROGRESS:"A mudança de sala está em curso. Aguarda a confirmação.",INVALID_LOGIN:'Utilizador ou senha incorretos.',TOO_MANY_ATTEMPTS:'Demasiadas tentativas. Volta a tentar dentro de 15 minutos.',OWNER_NOT_CONFIGURED:'O dono da sala não está configurado.',SERVICE_UNAVAILABLE:'Não foi possível contactar o serviço. Tenta novamente.',ALREADY_EXISTS:'Esse comando já existe.',NOT_FOUND:'Esse comando já não existe.',RESERVED_OR_INVALID_NAME:'Nome reservado ou inválido. Os comandos existentes estão protegidos.',INVALID_COMMAND:'Confirma o nome e o texto do comando.',ACTION_IN_PROGRESS:'Há uma ação em curso. Aguarda um momento.',PLAYBACK_NOT_READY:'A reprodução não está pronta para essa ação.',INVALID_QUERY:'Escreve um nome de música ou link válido.'};
function showLogin(){signedIn=false;$('login').hidden=false;$('app').hidden=true;}
function showApp(){signedIn=true;$('login').hidden=true;$('app').hidden=false;}
function notice(message,error=false){$('notice').textContent=message;$('notice').className=error?'error':'';$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').hidden=true,7000);}
async function api(path,payload){const response=await fetch('/dashboard/api/'+path,{method:payload===undefined?'GET':'POST',headers:payload===undefined?{}:{'Content-Type':'application/json'},body:payload===undefined?undefined:JSON.stringify(payload)});const data=await response.json();if(!response.ok){if(response.status===401&&path!=='login')showLogin();throw new Error(errors[data.error]||'Não foi possível concluir a ação. Tenta novamente.');}return data;}
function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function duration(seconds){if(!Number.isFinite(seconds))return '—';return `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;}
async function confirmAction(title,description="A ação será aplicada à sala atual."){ $("confirm-dialog").querySelector("p").textContent=description;$('confirm-title').textContent=title;$('confirm-dialog').showModal();return new Promise(resolve=>$('confirm-dialog').addEventListener('close',()=>resolve($('confirm-dialog').returnValue==='confirm'),{once:true}));}
async function action(payload,success){if(actionBusy)return;actionBusy=true;const buttons=[...document.querySelectorAll('#app button')];buttons.forEach(b=>b.disabled=true);try{await api('action',payload);notice(success);await refresh();return true;}catch(e){notice(e.message,true);return false;}finally{actionBusy=false;buttons.forEach(b=>b.disabled=false);updatePlaybackButtons();}}
function updatePlaybackButtons(){const state=lastStatus?.playback?.state;$('pause').disabled=actionBusy||state!=='PLAYING';$('resume').disabled=actionBusy||state!=='PAUSED';$('skip').disabled=actionBusy||!['PLAYING','PAUSED','LOADING','ERROR'].includes(state);}
const states={PLAYING:'A tocar',PAUSED:'Em pausa',LOADING:'A preparar',IDLE:'Em espera',ERROR:'Erro de reprodução'};
function renderStatus(data){const previousRoom=lastStatus?.roomId;lastStatus=data;if(previousRoom&&previousRoom!==data.roomId){resetCommand();if(tab==='commands'){loadCommands();loadWelcome();}}$('owner-label').textContent=data.owner;$('room-label').textContent=data.room;$('connection').textContent=data.partial?'Ligação parcial':'Ligado ao Studio';$('connection').className='badge'+(data.partial?' warn':'');
 const bot=data.services?.find(s=>s.Id==='roomwave-imvu.service');$('bot-state').textContent=bot?.ActiveState==='active'?'Ligado':bot?.ActiveState==='inactive'?'Desligado':bot?.ActiveState||'Indisponível';$('bot-detail').textContent=bot?.ActiveState==='active'?'Gateway em execução':'Estado do serviço IMVU';
 $('queue-count').textContent=data.queue?.length??'—';$('queue-badge').textContent=data.queue?.length??'—';$('volume-metric').textContent=data.volume===null?'—':data.volume+'%';
 if(document.activeElement!==$('volume')){$('volume').value=data.volume??50;$('volume-label').textContent=data.volume===null?'—':data.volume+'%';}
 $('playback-state').textContent=states[data.playback?.state]||'Indisponível';$('now-title').textContent=data.playback?.title||'À espera da próxima música';$('now-subtitle').textContent=data.playback?.state==='ERROR'?'A reprodução encontrou um problema. Consulta os registos.':data.playback?.title?'Pedidos da sala · YouTube':'Adiciona uma faixa e dá o tom à sala.';
 $('elapsed').textContent=data.playback?.startedAt?duration((Date.now()-Date.parse(data.playback.startedAt))/1000):'—';
 const list=$('queue-items');list.replaceChildren();if(!data.queue?.length)list.append(element('div',data.queue===null?'Fila temporariamente indisponível.':'A fila está livre. Qual vai ser a próxima música?','empty'));
 for(const item of data.queue||[]){const row=element('div',undefined,'queue-row');row.append(element('span',String(item.position).padStart(2,'0')));const info=element('div');info.append(element('strong',item.title),element('small',`${item.artist} · ${item.requestedBy}`));row.append(info,element('span',duration(item.duration)));const remove=element('button','×','remove-button');remove.setAttribute('aria-label','Remover '+item.title);remove.onclick=async()=>{if(await confirmAction('Remover esta faixa da fila?'))await action({action:'remove',position:item.position},'Faixa removida.');};row.append(remove);list.append(row);}
 const names={'roomwave-imvu.service':'Bot IMVU','roomwave-api.service':'API','roomwave-player.service':'AutoDJ','roomwave-source-resolver.service':'Source Resolver','roomwave-audio-engine.service':'Audio Engine','roomwave-radio.service':'Rádio'};
 $('services').replaceChildren();for(const service of data.services||[]){const row=element('div',undefined,'service-row');row.append(element('span',names[service.Id]||service.Id));const status=element('span',undefined,'service-state');status.append(element('i',undefined,'dot'+(service.ActiveState==='active'?'':' off')),element('span',service.ActiveState==='active'?'Ativo':service.ActiveState));row.append(status);$('services').append(row);}if(!data.services)$('services').append(element('p','Estado indisponível.','muted'));updatePlaybackButtons();
}
async function refresh(){if(loading||!signedIn)return;loading=true;try{renderStatus(await api('status'));}catch(e){$('connection').textContent='Sem ligação';$('connection').className='badge warn';}finally{loading=false;}}
async function loadCommands(){try{const {commands}=await api('commands');$('command-list').replaceChildren();if(!commands.length)$('command-list').append(element('div','Ainda não há comandos personalizados. Cria o primeiro ao lado.','empty'));for(const command of commands){const row=element('div',undefined,'command-item');row.append(element('strong','!'+command.name),element('p',command.response));const edit=element('button','Editar','text-button');edit.onclick=()=>{editing=true;$('command-form-title').textContent='Editar comando';$('command-form').elements.name.value=command.name;$('command-form').elements.name.readOnly=true;$('command-form').elements.response.value=command.response;$('char-count').textContent=command.response.length+' / 500';$('cancel-edit').hidden=false;$('command-form').elements.response.focus();};const del=element('button','Apagar','text-button');del.onclick=async()=>{if(await confirmAction('Apagar !'+command.name+'?')){if(await action({action:'command-delete',name:command.name},'Comando apagado.')){resetCommand();await loadCommands();}}};row.append(edit,del);$('command-list').append(row);}}catch(e){notice(e.message,true);}}
function resetCommand(){editing=false;$('command-form').reset();$('command-form').elements.name.readOnly=false;$('command-form-title').textContent='Criar comando';$('cancel-edit').hidden=true;$('char-count').textContent='0 / 500';}
let logsBusy=false;
async function loadLogs(){if(logsBusy)return;logsBusy=true;try{const data=await api('logs?service='+encodeURIComponent($('log-service').value));$('log-output').textContent=data.logs.length?data.logs.map(l=>`${new Date(l.time).toLocaleTimeString('pt-PT')}  ${l.message}`).join('\n'):'Sem registos disponíveis para este serviço.';}catch(e){$('log-output').textContent=e.message;}finally{logsBusy=false;}}
$('login-form').onsubmit=async event=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;$('login-error').textContent='';try{await api('login',{username:event.target.elements.username.value,password:event.target.elements.password.value});event.target.elements.password.value='';showApp();await refresh();}catch(e){$('login-error').textContent=e.message;}finally{button.disabled=false;}};
$('logout').onclick=async()=>{try{await api('logout',{});showLogin();}catch(e){notice(e.message,true);}};
for(const nav of document.querySelectorAll('[data-tab]'))nav.onclick=()=>{tab=nav.dataset.tab;for(const node of document.querySelectorAll('.page'))node.hidden=node.id!==tab;for(const node of document.querySelectorAll('[data-tab]'))node.classList.toggle('active',node===nav);$('page-name').textContent={overview:'Visão geral',rooms:'Salas',commands:'Comandos',logs:'Registo de atividade'}[tab];if(tab==='rooms')loadRooms();if(tab==='commands'){loadCommands();loadWelcome();}if(tab==='logs')loadLogs();};
$('add-form').onsubmit=async event=>{event.preventDefault();if(await action({action:'add',query:event.target.elements.query.value.trim()},'Música adicionada à fila.'))event.target.reset();};
$('pause').onclick=()=>action({action:'pause'},'Reprodução em pausa.');$('resume').onclick=()=>action({action:'resume'},'Reprodução retomada.');$('skip').onclick=async()=>{if(await confirmAction('Saltar a música atual?'))await action({action:'skip'},'Música saltada.');};$('clear').onclick=async()=>{if(await confirmAction('Limpar as músicas em espera?'))await action({action:'clear'},'Fila limpa.');};
for(const button of document.querySelectorAll('[data-bot]'))button.onclick=async()=>{const verb=button.dataset.bot;if(verb==='start'||await confirmAction(verb==='stop'?'Desligar o bot da sala?':'Reiniciar a ligação do bot?'))await action({action:'bot-'+verb},'Pedido enviado ao bot.');};
$('volume').oninput=()=>{$('volume-label').textContent=$('volume').value+'%';};$('volume').onchange=()=>action({action:'volume',volume:Number($('volume').value)},'Volume atualizado.');
$('command-form').onsubmit=async event=>{event.preventDefault();if(await action({action:editing?'command-edit':'command-create',name:event.target.elements.name.value.toLowerCase(),response:event.target.elements.response.value.trim()},editing?'Comando atualizado.':'Comando criado.')){resetCommand();await loadCommands();}};
$('command-form').elements.response.oninput=event=>$('char-count').textContent=event.target.value.length+' / 500';$('cancel-edit').onclick=resetCommand;$('refresh-commands').onclick=loadCommands;$('refresh-logs').onclick=loadLogs;$('log-service').onchange=loadLogs;
setInterval(()=>{if(signedIn&&!document.hidden){refresh();if(tab==='rooms')loadRooms();if(tab==='logs'&&$('auto-logs').checked)loadLogs();}$('clock').textContent=new Date().toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'});},8000);
(async()=>{try{const status=await api('status');showApp();renderStatus(status);}catch{showLogin();}})();

let loadingRooms=false,roomsBusy=false;
async function loadRooms(){
 if(loadingRooms)return;loadingRooms=true;
 try{
  const data=await api('rooms');const current=data.rooms.find(r=>r.id===data.active.roomId);
  $('active-room-name').textContent=current?.name||'Sala configurada';
  $('active-room-location').textContent='ID IMVU: '+data.active.imvuRoomId;
  const confirmed=data.connection.roomId===data.active.roomId;
  const connection=data.connection.state==='joined'&&!confirmed?'unknown':data.connection.state;
  const labels={joined:'Entrada confirmada',joining:'A entrar…',offline:'Bot fora da sala',unknown:'A confirmar entrada',error:'Ligação não confirmada'};
  $('room-connection').textContent=labels[connection]||'A confirmar';
  $('room-connection').className='badge'+(connection==='joined'?'':' warn');
  const switching=data.operation?.status==='switching';
  $('leave-room').disabled=switching||connection==='offline';
  const phases={preparing:'A preparar a mudança…',stopping:'A guardar a fila e desligar a sala anterior…',joining:'A entrar na sala escolhida. Pode demorar até dois minutos…','starting-player':'Entrada confirmada. A ligar a fila desta sala…',restoring:'Não foi possível concluir. A recuperar a sala anterior…'};
  const failure=data.operation?.phase==='stopped'?'A recuperação não foi concluída. Bot e Player ficaram parados; verifica os logs antes de tentar novamente.':'A mudança não foi concluída. A configuração anterior foi recuperada.';
  $('room-operation').hidden=!data.operation;
  $('room-operation').className='info-note'+(data.operation?.status==='failed'?' failed':'');
  $('room-operation').textContent=switching?(phases[data.operation.phase]||'A mudar de sala…'):data.operation?.status==='done'?'Mudança concluída. Bot e fila estão na sala escolhida.':failure;
  $('room-form').querySelector('button').disabled=switching||roomsBusy;
  $('room-list').replaceChildren();
  for(const room of data.rooms){
   const row=element('div',undefined,'saved-room');row.append(element('h3',room.name),element('p',room.imvuRoomId?'ID IMVU: '+room.imvuRoomId:'Sem ID IMVU associado'));
   const controls=element('div',undefined,'saved-room-actions');
   const button=element('button',room.id===data.active.roomId?(connection==='joined'?'Nesta sala':'Entrar na sala'):'Entrar nesta sala','secondary');
   button.disabled=switching||!room.imvuRoomId||(room.id===data.active.roomId&&connection==='joined');
   button.onclick=async()=>{
    if(!await confirmAction('Entrar em '+room.name+'?',room.id===data.active.roomId?'O bot vai entrar na sala configurada.':'A música atual para e volta ao início da fila desta sala. Os pedidos ficam guardados. Se a entrada falhar, tentamos recuperar a sala anterior.'))return;
    roomsBusy=true;button.disabled=true;
    try{const result=await api('rooms',{action:'activate',roomId:room.id});notice(result.unchanged?'Entrada solicitada.':'Mudança iniciada. Acompanha o estado nesta página.');await loadRooms();await refresh();}catch(e){notice(e.message,true);}finally{roomsBusy=false;await loadRooms();}
   };
   controls.append(button);if(room.id===data.active.roomId)controls.append(element('span','CONFIGURADA','badge'));row.append(controls);$('room-list').append(row);
  }
  if(!data.rooms.length)$('room-list').append(element('div','Ainda não há salas guardadas.','empty'));
 }catch(e){notice(e.message,true);}finally{loadingRooms=false;}
}
$('room-form').onsubmit=async event=>{
 event.preventDefault();if(roomsBusy)return;roomsBusy=true;const button=event.target.querySelector('button');button.disabled=true;
 try{const result=await api('rooms',{action:'save',name:event.target.elements.name.value.trim(),location:event.target.elements.location.value.trim()});event.target.reset();notice(result.existing?'Esta sala já estava guardada.':'Sala guardada. Podes agora escolher entrar nela.');await loadRooms();}catch(e){notice(e.message,true);}finally{roomsBusy=false;button.disabled=false;}
};
$('refresh-rooms').onclick=loadRooms;
$('leave-room').onclick=async()=>{if(await confirmAction('Sair da sala?','O bot desliga-se. A rádio e a fila continuam a funcionar.')){await action({action:'bot-stop'},'Saída solicitada.');await loadRooms();}};

let welcomeRoomId=null;
async function loadWelcome(){
 const form=$('welcome-form');form.querySelector('button').disabled=true;welcomeRoomId=null;
 try{const data=await api('welcome');welcomeRoomId=data.roomId;form.elements.enabled.checked=data.enabled;form.elements.message.value=data.message;$('welcome-room').textContent=data.roomName;welcomePreview();}
 catch(e){notice(e.message,true);}finally{form.querySelector('button').disabled=!welcomeRoomId;}
}
function welcomePreview(){$('welcome-preview').textContent=$('welcome-form').elements.message.value.replace(/\{(nome|sala|radio)\}/g,(_,key)=>({nome:'Visitante',sala:$('welcome-room').textContent,radio:'https://roomwavebot.duckdns.org/roomwave.mp3'}[key]));}
$('welcome-form').elements.message.oninput=welcomePreview;
$('welcome-form').onsubmit=async event=>{
 event.preventDefault();const form=event.target;const button=form.querySelector('button');button.disabled=true;
 try{await api('welcome',{roomId:welcomeRoomId,enabled:form.elements.enabled.checked,message:form.elements.message.value.trim()});notice('Boas-vindas guardadas.');}
 catch(e){notice(e.message,true);}finally{button.disabled=false;}
};
