# Moderação IMVU

## Comandos

- `!avisar @username motivo` (ou CID): publica um aviso, apenas na sala atual.
- `!expulsar @username motivo` (ou CID): expulsão nativa, validada na conta de teste
  explicitamente indicada pelo dono. Exige também permissão IMVU do bot.
- `!help moderacao`: ajuda; `!comandos moderacao` é equivalente.

Só dono e moderadores reais no IMVU podem ordenar ações. Os cargos locais do
RoomWave não atribuem este poder. A conta do bot foi confirmada como moderadora
da sala original em 21/09/2026; cada ação consulta novamente a autoridade real.
Falhas de consulta recusam a ação. Coleções incompletas de moderadores também
são recusadas para não deixar de proteger algum membro da equipa.

Os comandos são aceites apenas em mensagens públicas da sala ativa. É preciso
motivo (1–200 caracteres), destinatário presente e intervalo de cinco segundos
por executor. Dono, moderadores, próprio executor e bot são alvos protegidos.
Não há banimento permanente, decisões automáticas nem operações em lote.

## Confirmação e histórico

O pedido é guardado antes de publicar. Se a base de dados estiver indisponível,
não é enviado. Cada aviso tem referência única. Só um eco recebido no chat
público, vindo da conta do bot e com o texto correspondente, confirma a publicação.
A chamada local de envio ao WebSocket, sozinha, não conta como confirmação.
Sem eco em oito segundos o resultado é «não confirmado», sem nova tentativa.
Registos de pedidos sem resultado há mais de um minuto passam a não confirmados.

Dashboard → Segurança → escolher sala → Histórico de moderação. Filtros por
pessoa (executor ou destinatário, nome/CID), ação e datas UTC; páginas de 50
resultados. Consulta exclusiva do dono local com propriedade real IMVU verificada.
O painel distingue pedido, confirmado, falhou e não confirmado.

Dados PostgreSQL: ModerationEvent, com sala, CID/nome do executor e destinatário,
motivo, ação, resultado e datas. Retenção de 30 dias, limpeza a cada minuto e no
arranque da API. As ações não dependem da opção de recolha de mensagens da sala.
`POST /api/moderation` exige chave interna; operações start/finish são exclusivas
do gateway. O dashboard expõe apenas consulta e injeta a identidade autenticada.
Não guarda cookies, credenciais nem respostas IMVU completas.

## Expulsão nativa validada

O cliente autenticado IMVU, bundle
`https://webasset-akm.imvu.com/asset/c0c70ab04c14dfe4/build/withme/withme.min.js`,
implementa `bootFromChat` com DELETE na relação do participante e corpo JSON
`{reason:"booted"}`. O UiCore Rest obtém `X-imvu-sauce` do recurso `/login/me`.

O adaptador usa a sessão existente, confirma que pertence ao bot, revalida os
cargos e a presença, e só remove a relação exata do destinatário na sala ativa.
Cookies e sauce não são escritos nos logs. Redirecionamentos e repetições estão
desativados. Não implementa a operação diferente de banlist usada nas Live Rooms.

Só marca confirmado quando o DELETE recebe HTTP 2xx e uma consulta posterior
confirma a ausência do participante. Timeout, resposta ambígua ou permanência na
sala produzem «não confirmado». A saída isolada de alguém, sem resposta de sucesso
ao DELETE, nunca é tratada como prova de expulsão.

Em 21/09/2026 o dono indicou Guest_teste22221 (CID 391952406) como alvo de teste.
Foi feito um único DELETE; resultado KICK_CONFIRMED, com auditoria
`03193b95-a5e8-4604-ab07-8669c5cfb0c9`. Nenhum outro visitante foi usado.

## Implantação e testes

Migração aditiva: `20260921130000_moderation`. Gerar Prisma antes de iniciar a API.
Reiniciar API, dashboard e gateway; o motor de áudio não precisa de reinício.

- `node --import tsx apps/bot/test/moderation.test.ts`
- `node --import tsx apps/api/test/moderation.integration.ts`
- Typecheck de bot e API; testes existentes do bot/dashboard.

Os testes automatizados usam simulações e registos temporários, removidos no fim.
A validação real separada foi limitada à conta indicada acima.
Teste do adaptador: `node --import tsx apps/bot/test/native-kick.test.ts`.
