const sections: Record<string,string[]> = {
  moderacao: ["🛡️ MODERAÇÃO IMVU", "!avisar @nome motivo — aviso público com histórico", "!expulsar @nome motivo — indisponível até validação nativa", "Só dono e moderadores reais da sala. Intervalo: 5 segundos.", "Dono, moderadores e bot estão protegidos."],
  musica: ['🎵 MÚSICA','!add <música/link> — adicionar à fila','!dedicar @nome <música> — pedido com dedicatória','!queue — fila · !now — música atual','!radio — ouvir a rádio','DJ+: !volume [0–100] · !skip','MOD+: !remove <posição> · ADMIN+: !clear'],
  jogos: ['🎮 JOGOS','!duelo @nome — convite; jogadas sorteadas','!aceitar / !recusar — responder ao convite','!quiz — pergunta de cultura geral','!responder <resposta> — uma tentativa por pergunta','!top — pontos desta sala (quiz +5, duelo +3)','!votar pergunta | opção1 | opção2 — votação de 2 minutos','!voto <número> — votar ou alterar voto','!resultado — contagem · !resultado fechar — criador/dono'],
  diversao: ['🎉 DIVERSÃO','!abraço @nome (ou !abraco) — abraço','!ship nome1 nome2 — compatibilidade aleatória','!8ball <pergunta> — resposta da bola mágica','!dado — lançar dado · !moeda — cara ou coroa','Abraços, duelos e dedicatórias: destinatário nesta sala.'],
  sala: ['🏠 SALA','!regras — regras · !staff — equipa','!radio — link da rádio · !ping — ligação','!listarcomandos — comandos personalizados (dono)'],
  dono: ['🔑 DONO','!onde <nome/CID> — presença nesta sala','!historico <nome/CID> — entradas/saídas observadas','!criarcomando <nome> <texto>','!editarcomando <nome> <texto>','!apagarcomando <nome> · !listarcomandos','!disconnect — desligar o bot'],
};
export function helpCommand(args=''):string {
  const category=args.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(Object.hasOwn(sections,category))return sections[category]!.join('\n');
  return ['🎧 ROOMWAVE — COMANDOS','!help musica — fila, rádio e dedicatórias','!help diversao — abraços, ship, dado, moeda, 8ball','!help jogos — duelos, quiz, pontos e votações','!help sala — regras e equipa','!help moderacao — avisos e expulsões','!help dono — administração','Também podes usar !comandos <categoria>.','Diversão: intervalo de 2 segundos por pessoa.'].join('\n');
}
