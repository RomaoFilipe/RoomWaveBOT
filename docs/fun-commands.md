# Diversão e jogos

Todos os membros podem utilizar estes comandos. `!help` / `!comandos` apresenta
categorias: `musica`, `diversao`, `jogos`, `sala`, `dono`.

| Comando | Utilização |
| --- | --- |
| `!abraço @nome` / `!abraco @nome` | Abraço para uma pessoa presente |
| `!ship nome1 nome2` | Percentagem aleatória, identificada como brincadeira |
| `!8ball pergunta` | Resposta aleatória |
| `!dado` | Dado de seis faces |
| `!moeda` | Cara ou coroa |
| `!duelo @nome` | Convite de pedra/papel/tesoura com duas jogadas sorteadas pelo bot |
| `!aceitar` / `!recusar` | Apenas o convidado pode responder, em até dois minutos |
| `!quiz` | Pergunta de cultura geral, válida durante 90 segundos |
| `!responder resposta` | Uma tentativa por pessoa; primeiro acerto recebe cinco pontos |
| `!top` | Dez melhores pontuações desta sala |
| `!votar pergunta \| opção1 \| opção2` | Votação de dois minutos, entre duas e cinco opções |
| `!voto 2` | Regista ou altera o voto dessa pessoa |
| `!resultado` | Contagem da votação mais recente |
| `!resultado fechar` | Encerra antecipadamente; apenas criador ou dono |
| `!dedicar @nome artista - música` | Usa o pedido musical existente e anuncia a dedicatória ao adicionar |

Os destinatários de abraços, duelos e dedicatórias são resolvidos por username
ou CID e confirmados na sala atual. O bot não pode ser destinatário. Os duelos
não exigem enviar escolhas em público: o bot sorteia as duas mãos após o aceite.
Vitória vale três pontos; empate não atribui pontos. Não há dinheiro/apostas.

Intervalo global de dois segundos por pessoa entre comandos de diversão. Há
no máximo um duelo, quiz e votação ativos por sala. Cada tipo de atividade tem
intervalo mínimo de um minuto entre criações. Votações expiradas são encerradas
logicamente pelo prazo, e os resultados ficam disponíveis através de
`!resultado`; o bot não publica mensagens automáticas ao expirar.

Pontuações, jogos ativos e votos persistem em `.data/games/<roomId>.json`, com
permissões 600, escrita atómica e processamento sequencial por sala. Os prazos
continuam a contar durante reinícios. Os dados ficam separados por sala e não
entram no Git. Pontuações não são apagadas ao trocar de sala. O quiz usa um banco
local de perguntas, sem serviços pagos. Dedicatórias são anunciadas na confirmação
do pedido, não novamente quando a música começa.

Validação: `node --import tsx --test apps/bot/test/*.test.ts`, typecheck do bot/API.
Os testes cobrem aceite/recusa, prazos, pontuação sem duplicação, concorrência,
persistência, separação de salas, alterações de voto e permissões de encerramento.
