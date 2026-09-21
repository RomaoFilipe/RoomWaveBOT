# Moderação IMVU

## Comandos

- `!avisar @username motivo` (ou CID): publica um aviso, apenas na sala atual.
- `!expulsar @username motivo`: reservado e com verificação de permissões, mas
  **indisponível até validar a integração nativa**. Não executa expulsões.
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

## Estado da expulsão

Foram consultados os metadados reais de `/room/room-ID` e a coleção
`/room/room-ID/moderators`. No bundle público do cliente IMVU
`https://webasset-akm.imvu.com/asset/98eac403d6afd842/build/welcome/welcome.min.js`,
o diálogo RemoveUserDialog chama `activeChat.bootFromChat(user)` após confirmação.
Isso identifica a ação do cliente, mas não valida um endpoint, payload ou resposta
que o gateway possa executar. Não foi inventada uma rota HTTP nem feito qualquer
pedido destrutivo de teste. A expulsão permanece indisponível, conforme o plano.
Para a ativar, é necessário validar o transporte nativo e testar com uma conta
explicitamente designada para o teste, nunca com visitantes escolhidos pelo bot.

## Implantação e testes

Migração aditiva: `20260921130000_moderation`. Gerar Prisma antes de iniciar a API.
Reiniciar API, dashboard e gateway; o motor de áudio não precisa de reinício.

- `node --import tsx apps/bot/test/moderation.test.ts`
- `node --import tsx apps/api/test/moderation.integration.ts`
- Typecheck de bot e API; testes existentes do bot/dashboard.

Os testes de integração criam e removem dados temporários. Nenhum teste envia
avisos ou expulsa utilizadores do IMVU real.
