# RoomWave Studio

Dashboard independente em `apps/dashboard`, sem dependências adicionais de runtime.
Node.js serve a interface e comunica com as APIs existentes. O frontend não recebe
credenciais do bot, caminhos da cache nem tokens NodeLink. O serviço escuta apenas
em `127.0.0.1:3240`; o acesso externo passa pelo HTTPS do Caddy em `/dashboard/`.

## Funcionalidades

- Música atual, fila, pedidos, saltar, remover e limpar músicas em espera.
- Pausa/retoma e volume global.
- Ligar, desligar e reiniciar apenas o bot IMVU.
- Criar, editar e apagar comandos personalizados.
- Últimas 80 entradas de logs dos serviços permitidos; atualização automática opcional.
- Indicadores de serviços; estar ativo significa processo em execução, não presença
  confirmada na sala ou receção do áudio por todos os ouvintes.

## Login do dono

Executar `node --env-file=.env apps/dashboard/provision.mjs` cria uma senha aleatória e o hash scrypt
em `.data/dashboard/`, com permissões privadas. Não altera uma credencial existente.
Consultar os dados de acesso na EC2:

```bash
cat /home/ubuntu/roomwave/.data/dashboard/access.txt
```

Não guardar esta senha no repositório. A conta administrativa é `owner`; cada pedido
privilegiado confirma na API que o utilizador IMVU associado continua a ser OWNER.
Na criação, associa o login ao único OWNER da sala, ou a `ROOMWAVE_DASHBOARD_OWNER_IMVU_ID` quando configurado. A associação é persistente: se esse membro deixar de ser OWNER, o acesso é recusado.
O login é próprio do dashboard, não utiliza a senha IMVU ou Google.

Sessões duram 12 horas, ficam apenas na memória e terminam se o serviço reiniciar.
Cookie `HttpOnly`, `Secure`, `SameSite=Strict`; operações exigem a origem HTTPS
configurada e JSON. Login limitado a cinco tentativas por IP em 15 minutos.

## Instalação

Aplicar primeiro a migração de comandos personalizados e preparar
`.data/custom-commands.key` partilhada com a API.

```bash
node --env-file=.env apps/dashboard/provision.mjs
sudo install -m 0755 deploy/roomwave-dashboard-bot /usr/local/sbin/roomwave-dashboard-bot
sudo install -m 0440 deploy/roomwave-dashboard-sudoers /etc/sudoers.d/roomwave-dashboard
sudo visudo -cf /etc/sudoers.d/roomwave-dashboard
sudo install -m 0644 deploy/roomwave-dashboard.service /etc/systemd/system/roomwave-dashboard.service
sudo systemctl daemon-reload
sudo systemctl enable --now roomwave-dashboard
```

A unidade atual usa o utilizador `ubuntu` e `/home/ubuntu/roomwave`; adaptar numa
instalação diferente. O helper root aceita exclusivamente `start`, `stop` e
`restart` para `roomwave-imvu.service`, sem nomes de serviços ou comandos livres.
O utilizador do serviço precisa de acesso de leitura ao journal dos serviços.

No bloco HTTPS existente do Caddy, acrescentar:

```caddyfile
@dashboard path /dashboard /dashboard/*
handle @dashboard {
    reverse_proxy 127.0.0.1:3240
}
```

Validar e recarregar o Caddy, preservando os handlers da rádio. Configurar
`ROOMWAVE_DASHBOARD_ORIGIN` com a origem exata, sem barra final. Não é necessário
abrir a porta 3240 no Security Group.

## Operação

```bash
sudo systemctl status roomwave-dashboard --no-pager
sudo journalctl -u roomwave-dashboard -n 60 --no-pager
sudo systemctl restart roomwave-dashboard
node --test --test-isolation=none apps/dashboard/test/security.test.mjs
```

Reiniciar o dashboard não reinicia rádio, AutoDJ ou bot. O botão de desligar o bot
preserva a rádio; limpar fila não equivale a parar a faixa atual.

## Logs e limites

Os logs omitem URLs e valores de credenciais conhecidas, bem como campos comuns
como password/token. É uma filtragem defensiva, não garantia de remoção de qualquer
segredo arbitrário escrito em mensagens. Podem conter nomes e texto do chat, e
são exclusivos do dono. Logs NodeLink/OAuth e ficheiros `.env` não são expostos.

Esta versão administra uma sala configurada por servidor. Não inclui gestão de
contas, permissões por utilizador do dashboard, editor de `.env`, atualizações de
código ou reinício dos componentes de rádio. Serviços internos existentes devem
continuar protegidos da Internet independentemente do login deste painel.
