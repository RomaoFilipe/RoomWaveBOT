# Salas no dashboard

Abrir **Salas** no Studio. Guardar o nome e o link/ID IMVU; guardar não muda a
sala atual. O botão **Entrar nesta sala** solicita uma mudança confirmada pelo
utilizador. Há um bot e um Player: apenas uma sala ativa de cada vez.

São aceites IDs `CID-ROOMID` e links HTTPS `go.imvu.com/chat/room-CID-ROOMID`
ou `www.imvu.com/next/chat/room-CID-ROOMID` (também `pt.imvu.com`). A aplicação
normaliza os links para o endereço oficial `go.imvu.com`; não navega para URLs
arbitrárias. Se o ID já pertence a outra sala RoomWave sem este OWNER, a ação
é recusada. Guardar a mesma sala novamente não duplica o registo.

## Dados e permissões

Usa a tabela `Room` existente, sem migração. O dono do dashboard recebe OWNER
no novo registo RoomWave; isso não atribui propriedade nem permissões na plataforma
IMVU. O bot continua dependente do acesso que a sua conta tem à sala IMVU.

A fila, membros e comandos personalizados pertencem a cada registo de sala.
Os membros novos continuam com as permissões padrão da API. Permissões especiais
e comandos de outra sala não são copiados. As regras fixas e o endereço da rádio
continuam globais nesta versão.

A autorização do painel permanece associada ao OWNER da sala de gestão original;
as operações de destino também verificam OWNER nessa sala. O browser não decide
a identidade do dono. Os endpoints internos exigem a chave privada do bot.

## Mudança

1. Bloquear outras ações de controlo enquanto a mudança decorre.
2. Parar o bot e o Player; parar o Audio Engine e limpar o ficheiro temporário ativo.
3. Repor a faixa interrompida no início da fila original, mantendo os pedidos
   pendentes. Fechar o intervalo de histórico interrompido sem marcar PLAYED.
4. Guardar a configuração ativa atomicamente e arrancar o bot na nova sala.
5. Esperar até 120 segundos pela confirmação do gateway; só depois arrancar o Player.
6. Se falhar, recuperar a configuração anterior e os serviços que estavam ativos.
   Se a recuperação também falhar, manter bot e Player parados e mostrar o erro.

A faixa interrompida recomeça do início quando a sua sala voltar a ser ativada.
Existe uma única rádio pública: quem continuar a ouvir o mesmo URL ouvirá a
programação da sala que estiver ativa. Não são streams independentes por sala.

**Sair da sala** desliga apenas o bot e preserva rádio/fila, como o controlo de
bot já existente. Para trocar de sala, usar o botão da sala pretendida.

## Estado e reinícios

`.data/room-control/active.json` sobrepõe os IDs da `.env` para bot e Player.
A `.env` mantém a sala inicial de gestão. Não editar a configuração ativa enquanto
uma operação estiver em curso. O dashboard, bot e Player leem a mesma seleção.

O gateway escreve `bot.json` com PID, sala, estado e timestamp. O painel confirma
o PID do serviço e exige um relatório recente. O modo de poupança de memória
remove a interface visual, por isso o heartbeat verifica o WebSocket de chat,
não a presença de uma caixa de texto. `unknown` não equivale a entrada confirmada.

A operação em curso fica em `operation.json`. Se o dashboard reiniciar a meio,
tenta restaurar a sala anterior antes de aceitar outra mudança.

## Deploy

Na instalação existente, associar primeiro o registo original ao ID da `.env`:

```bash
node --env-file=.env --import tsx tools/init-room-control.mts
mkdir -p .data/room-control .data/audio/cache
sudo install -m 0755 deploy/roomwave-dashboard-room /usr/local/sbin/roomwave-dashboard-room
sudo install -m 0440 deploy/roomwave-dashboard-sudoers /etc/sudoers.d/roomwave-dashboard
sudo visudo -cf /etc/sudoers.d/roomwave-dashboard
sudo install -m 0644 deploy/roomwave-dashboard.service /etc/systemd/system/roomwave-dashboard.service
sudo systemctl daemon-reload
sudo systemctl restart roomwave-api roomwave-dashboard
sudo systemctl restart roomwave-player roomwave-imvu
```

O novo helper root aceita apenas `stop` (bot e Player), `start-bot` e `start-player`.
Não permite nomes de serviços arbitrários. Liquidsoap, Icecast e FFmpeg não são
reiniciados durante este deploy; uma mudança de sala pára a reprodução via API.

## Verificações

```bash
node --test --test-isolation=none apps/dashboard/test/*.test.mjs
node --env-file=.env --import tsx apps/api/test/managed-rooms.integration.ts
```

Os testes de integração criam e removem salas temporárias. Cobrem permissões,
links inválidos, duplicados e preservação das filas. Testes do controlador cobrem
ordem das ações, mudança concorrente, entrada falhada e reinício interrompido com
serviços simulados; não afirmam que qualquer sala IMVU é acessível.
