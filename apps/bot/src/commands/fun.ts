import {randomInt, randomUUID} from 'node:crypto';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {lookupUser} from '../../../../tools/imvu-directory.mjs';
import {isInCurrentRoom} from '../imvu/presence.js';
import {addCommand} from './add.js';

export const funCommands = new Set(['abraço','abraco','ship','8ball','dado','moeda','duelo','aceitar','recusar','quiz','responder','top','votar','voto','resultado','dedicar']);
const questions = [
  ['Qual é a capital de Portugal?', ['lisboa']],
  ['Quantos lados tem um hexágono?', ['6','seis']],
  ['Qual é o maior planeta do Sistema Solar?', ['jupiter']],
  ['Quem escreveu Os Lusíadas? (apelido)', ['camoes','luis de camoes']],
  ['Qual é o símbolo químico do oxigénio?', ['o']],
  ['Quantos minutos tem uma hora?', ['60','sessenta']],
  ['Em que continente fica o Brasil?', ['america do sul']],
  ['Qual é o satélite natural da Terra?', ['lua','a lua']],
  ['Quantas cordas tem uma guitarra clássica?', ['6','seis']],
  ['Que instrumento tem teclas, cordas e pedais?', ['piano']],
  ['Qual é o oceano entre Portugal e o Brasil?', ['atlantico','oceano atlantico']],
  ['Qual é a raiz quadrada de 81?', ['9','nove']],
  ['Quem pintou a Mona Lisa?', ['leonardo da vinci','da vinci']],
  ['Qual é a capital do Japão?', ['toquio','tokyo']],
  ['Qual é o planeta conhecido como Planeta Vermelho?', ['marte']],
  ['Quantos segundos tem um minuto?', ['60','sessenta']],
  ['Como se chama um animal que come plantas e carne?', ['omnivoro','onivoro']],
  ['Qual é a língua oficial do Brasil?', ['portugues']],
  ['Qual é o símbolo químico do ouro?', ['au']],
  ['Quantos lados tem um pentágono?', ['5','cinco']],
] as const;
const normalize = (s:string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[.!?]+$/,'').trim();
const label = (s:string) => s.replace(/[\r\n\t\x00-\x1f]/g,' ').slice(0,80);
interface Actor {id:string; name:string; role?:string}
interface State {
  scores: Record<string,{name:string;points:number}>;
  quiz?: {index:number;until:number;attempts:string[]};
  lastQuiz?:number;
  duel?: {from:Actor;to:Actor;until:number};
  poll?: {creator:string;question:string;options:string[];votes:Record<string,number>;until:number;closed?:boolean};
  created?:Record<string,number>;
}
interface Dependencies {
  directory:string;
  now:()=>number;
  random:(max:number)=>number;
  target:(name:string)=>Promise<{id:string;name:string}>;
  dedicate:(query:string,id:string)=>Promise<string>;
}
export function createFunEngine(deps:Dependencies) {
  const pending = new Map<string,Promise<unknown>>();
  const cooldown = new Map<string,number>();
  async function run(room:string,command:string,args:string,actor:Actor):Promise<string> {
    if(!/^[a-zA-Z0-9-]{1,64}$/.test(room)||!/^\d{1,20}$/.test(actor.id))return '❌ Não consegui confirmar a sala ou o utilizador.';
    args=args.trim();
    if(args.length>500)return '❌ Mensagem demasiado longa (máximo 500 caracteres).';
    const now=deps.now(),key=`${room}:${actor.id}`;
    for(const [k,time] of cooldown)if(now-time>=2000)cooldown.delete(k);
    if(cooldown.has(key))return '⏳ Espera 2 segundos entre comandos de diversão.';
    cooldown.set(key,now);
    actor={...actor,name:label(actor.name)};
    const file=join(deps.directory,`${room}.json`);
    let state:State;
    try{state=JSON.parse(await readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;state={scores:{}};}
    const save=async()=>{await mkdir(deps.directory,{recursive:true,mode:0o700});const temp=`${file}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(state),{mode:0o600});await rename(temp,file);};
    const award=(who:Actor,points:number)=>{state.scores[who.id]={name:who.name,points:(state.scores[who.id]?.points??0)+points};};
    const creationAllowed=(kind:string)=>now-(state.created?.[kind]??0)>=60000;
    const created=(kind:string)=>{state.created??={};state.created[kind]=now;};
    const target=async(name:string)=>{const user=await deps.target(name.replace(/^@/,''));return {...user,name:label(user.name)};};
    if(command==='abraço'||command==='abraco'){
      if(!args||/\s/.test(args))return '🤗 Usa !abraço @username';
      const user=await target(args);
      return `🤗 ${actor.name} envia um abraço a ${user.name}! ${['Daqueles que aquecem o coração!','Abraço entregue com sucesso!','Com direito a um sorriso extra!'][deps.random(3)]}`;
    }
    if(command==='ship'){
      const names=args.split(/\s+/);if(names.length!==2)return '💘 Usa !ship nome1 nome2';
      return `💘 ${label(names[0]!.replace(/^@/,''))} + ${label(names[1]!.replace(/^@/,''))}: ${deps.random(101)}% de compatibilidade! Resultado aleatório, só uma brincadeira.`;
    }
    if(command==='8ball')return args?`🎱 ${actor.name}: ${['Sim!','Não.','Talvez…','Tudo indica que sim.','Pergunta outra vez mais tarde.','As estrelas dizem que não.','Sem dúvida!','Ainda é um mistério.'][deps.random(8)]}`:'🎱 Usa !8ball <pergunta>';
    if(command==='dado')return `🎲 ${actor.name} lançou um ${deps.random(6)+1}!`;
    if(command==='moeda')return `🪙 ${actor.name}: ${deps.random(2)?'coroa':'cara'}!`;
    if(command==='dedicar'){
      const match=args.match(/^@?(\S+)\s+(.+)$/);if(!match)return '💝 Usa !dedicar @username artista - música';
      const user=await target(match[1]!);
      const result=await deps.dedicate(match[2]!,actor.id);
      return result.startsWith('❌')?result:`💝 ${actor.name} dedica esta música a ${user.name}!\n${result}`;
    }
    if(command==='top'){
      const rows=Object.values(state.scores).sort((a,b)=>b.points-a.points).slice(0,10);
      return rows.length?['🏆 TOP DESTA SALA',...rows.map((p,i)=>`${i+1}. ${label(p.name)} — ${p.points} pontos`),'Quiz: +5 · Duelo: +3'].join('\n'):'🏆 Ainda não há pontos nesta sala. Experimenta !quiz ou !duelo @nome!';
    }
    if(command==='duelo'){
      if(state.duel&&state.duel.until>now)return '⚔️ Já existe um convite nesta sala. Usa !aceitar ou !recusar se és o convidado.';
      if(!args||/\s/.test(args))return '⚔️ Usa !duelo @username';
      if(!creationAllowed('duel'))return '⏳ Espera um minuto entre convites de duelo.';
      const user=await target(args);if(user.id===actor.id)return '⚔️ Escolhe outra pessoa para o duelo.';
      state.duel={from:actor,to:user,until:now+120000};created('duel');await save();
      return `⚔️ ${user.name}, ${actor.name} desafia-te! Usa !aceitar ou !recusar em 2 minutos. Pedra/papel/tesoura: o bot sorteia as duas jogadas. Vitória: +3 pontos.`;
    }
    if(command==='aceitar'||command==='recusar'){
      const duel=state.duel;if(!duel||duel.until<=now)return '⚔️ Não há convite ativo. Usa !duelo @nome.';
      if(duel.to.id!==actor.id)return '⚔️ Só a pessoa convidada pode aceitar ou recusar.';
      delete state.duel;
      if(command==='recusar'){await save();return `⚔️ ${actor.name} recusou o duelo.`;}
      const a=deps.random(3),b=deps.random(3),hands=['pedra 🪨','papel 📄','tesoura ✂️'];
      const winner=a===b?null:(a-b+3)%3===1?duel.from:actor;
      if(winner)award(winner,3);await save();
      return `⚔️ Jogadas sorteadas: ${duel.from.name}: ${hands[a]} · ${actor.name}: ${hands[b]}\n${winner?`🏆 ${winner.name} venceu! +3 pontos.`:'Empate! Sem pontos.'}`;
    }
    if(command==='quiz'){
      if(state.quiz&&state.quiz.until>now)return `🧠 ${questions[state.quiz.index]![0]}\nResponde com !responder <resposta>. Restam ${Math.ceil((state.quiz.until-now)/1000)}s.`;
      if(!creationAllowed('quiz'))return '⏳ Espera um minuto entre perguntas.';
      let index=deps.random(questions.length);if(index===state.lastQuiz)index=(index+1)%questions.length;
      state.quiz={index,until:now+90000,attempts:[]};state.lastQuiz=index;created('quiz');await save();
      return `🧠 ${questions[index]![0]}\n!responder <resposta> · 90 segundos · uma tentativa por pessoa · +5 pontos.`;
    }
    if(command==='responder'){
      const quiz=state.quiz;if(!quiz||quiz.until<=now)return '🧠 Não há pergunta ativa. Usa !quiz.';
      if(!args)return '🧠 Usa !responder <resposta>';
      if(quiz.attempts.includes(actor.id))return '🧠 Já respondeste a esta pergunta. Aguarda a próxima!';
      quiz.attempts.push(actor.id);
      if(!(questions[quiz.index]![1] as readonly string[]).includes(normalize(args))){await save();return `🧠 ${actor.name}, não é essa! Outros participantes ainda podem tentar.`;}
      award(actor,5);delete state.quiz;await save();return `✅ ${actor.name} acertou! +5 pontos. Consulta !top.`;
    }
    const pollText=()=>{const p=state.poll!;const votes=Object.values(p.votes);return [`📊 ${p.question}`, ...p.options.map((option,i)=>`${i+1}. ${option} — ${votes.filter(v=>v===i).length} votos`),p.closed||now>=p.until?'Votação encerrada.':`!voto <número> · faltam ${Math.ceil((p.until-now)/1000)}s · um voto por pessoa (podes alterar).`].join('\n');};
    if(command==='votar'){
      if(state.poll&&!state.poll.closed&&state.poll.until>now)return '📊 Já há uma votação ativa. Usa !resultado.';
      const [question,...options]=args.split('|').map(s=>s.trim());
      if(!question||question.length>150||options.length<2||options.length>5||options.some(s=>!s||s.length>60)||new Set(options.map(normalize)).size!==options.length)return '📊 Usa !votar pergunta | opção1 | opção2 (2–5 opções distintas, até 60 caracteres cada).';
      if(!creationAllowed('poll'))return '⏳ Espera um minuto entre votações.';
      state.poll={creator:actor.id,question:question.replace(/[\r\n\t\x00-\x1f]/g,' '),options:options.map(label),votes:{},until:now+120000};created('poll');await save();return pollText();
    }
    if(command==='voto'){
      const p=state.poll;if(!p||p.closed||now>=p.until)return '📊 Não há votação ativa. Usa !votar pergunta | opção1 | opção2';
      const n=Number(args);if(!/^\d$/.test(args)||n<1||n>p.options.length)return `📊 Usa !voto <1–${p.options.length}>`;
      p.votes[actor.id]=n-1;await save();return `📊 Voto de ${actor.name} registado na opção ${n}.`;
    }
    if(command==='resultado'){
      if(!state.poll)return '📊 Ainda não há votação nesta sala.';
      if(args&&args!=='fechar')return '📊 Usa !resultado ou !resultado fechar';
      if(args==='fechar'){
        if(state.poll.creator!==actor.id&&actor.role!=='OWNER')return '⛔ Só quem criou a votação ou o dono pode encerrá-la.';
        state.poll.closed=true;await save();
      }
      return pollText();
    }
    return '❌ Comando desconhecido.';
  }
  return (room:string,command:string,args:string,actor:Actor):Promise<string>=>{
    const task=(pending.get(room)??Promise.resolve()).catch(()=>{}).then(()=>run(room,command,args,actor));
    pending.set(room,task);void task.finally(()=>{if(pending.get(room)===task)pending.delete(room);}).catch(()=>{});
    return task;
  };
}
export const funCommand=createFunEngine({
  directory:'/home/ubuntu/roomwave/.data/games',now:Date.now,random:randomInt,
  target:async name=>{const user=await lookupUser(name);if(user.id===process.env.IMVU_BOT_USER_ID)throw new Error('GAME_BOT_TARGET');if(!await isInCurrentRoom(user.id))throw new Error('GAME_TARGET_ABSENT');return {id:user.id,name:user.username};},
  dedicate:addCommand,
});
