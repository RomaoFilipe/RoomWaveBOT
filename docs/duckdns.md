# Endereço fixo com DuckDNS

Domínio: `roomwavebot.duckdns.org`.

Ativado em 20/09/2026 com certificado HTTPS válido:

- Rádio: https://roomwavebot.duckdns.org/roomwave.mp3
- Dashboard: https://roomwavebot.duckdns.org/dashboard/

O login mantém as mesmas credenciais. Usar o novo endereço do dashboard,
pois a validação de origem das ações foi atualizada. Configuração Caddy de
referência: `deploy/roomwave.Caddyfile`.

O updater consulta o IPv4 público através de IMDSv2 da EC2 e atualiza o DuckDNS
por HTTPS. O timer executa no arranque e a cada cinco minutos. O token fica
em `.data/duckdns/token` (600), fora do Git, e nunca é escrito nos logs.

Guardar o token e testar a primeira atualização:

```bash
cd /home/ubuntu/roomwave
python3 tools/duckdns-update.py --setup
```

Instalação do timer:

```bash
sudo install -m 644 deploy/roomwave-duckdns.service /etc/systemd/system/
sudo install -m 644 deploy/roomwave-duckdns.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now roomwave-duckdns.timer
```

Após verificar que o DNS aponta para a EC2, adicionar o domínio ao site Caddy
existente, validar e recarregar Caddy. Configurar na `.env`:

```dotenv
ROOMWAVE_PUBLIC_RADIO_URL=https://roomwavebot.duckdns.org/roomwave.mp3
ROOMWAVE_DASHBOARD_ORIGIN=https://roomwavebot.duckdns.org
```

Reiniciar o dashboard e o bot para lerem a configuração. Não modificar o callback
Spotify sem também atualizar a aplicação Spotify. Manter o hostname anterior
no Caddy durante a migração.

Diagnóstico:

```bash
systemctl status roomwave-duckdns.timer
journalctl -u roomwave-duckdns.service -n 20 --no-pager
```

A EC2 desligada não transmite rádio; após um novo IP pode existir um curto
intervalo até as caches DNS atualizarem. DNS dinâmico não elimina custos AWS.
