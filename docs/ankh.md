# Ankh no RoomWave

Dashboard → Pesquisa IMVU → Fonte **Ankh · Serviço C#**.

A integração executa a biblioteca real Yucked/Ankh num host ASP.NET Core 8 do
RoomWave. Não é a aplicação Ankh.Backend original: usa os seus `UserHandler`
e `RoomHandler` com uma API de consulta reduzida. O backend original inclui
RavenDB, Chromium e workers de recolha, que não são executados neste host.

Fonte: https://github.com/Yucked/Ankh
Revisão fixada: `baefed7dcc9692c7f0ab31fac4d843031300432e`.
Código upstream obtido em `_reference/Ankh`; não é copiado para o Git RoomWave.
O script de build extrai a revisão fixada sem alterar o checkout de referência.

## Consultas

- `GET /api/info/user?userId=CID`: `UserHandler.GetUserByIdAsync`.
- `POST /api/info/room?roomId=CID-ROOMID`: `RoomHandler.GetRoomByIdAsync`.
- `GET /health`: serviço, biblioteca e revisão.

O Ankh consulta REST IMVU e endpoints legacy. Alguns campos legacy podem não
ser disponibilizados anonimamente; só são apresentados os campos normalizados
expostos pelo host. Não há login adicional nem credenciais IMVU no contentor.
Para username/link, o RoomWave resolve primeiro o CID pela API IMVU e pede os
dados ao Ankh. Para CID e sala, consulta diretamente o Ankh.

Os resultados indicam `Fonte: Ankh`. Não há fallback silencioso: se o serviço
falhar, o dashboard avisa e o utilizador pode escolher a fonte IMVU direta.
A identificação normal do bot continua com o resolver anterior.
Histórico, ripper, recolha automática e rastreamento não fazem parte deste host.

## Execução

Contentor `roomwave-ankh`, acessível apenas em `127.0.0.1:3250`; não abrir
esta porta no Security Group. O dashboard mantém autenticação e verificação
OWNER na API RoomWave. O host retorna apenas campos selecionados, sem objetos
de sessão, cookies ou HTML recebido do IMVU.

Limites: 256 MB RAM, 384 MB RAM+swap, 0,5 CPU, 128 processos, utilizador não root,
filesystem read-only, cache de 100 consultas durante um minuto e duas consultas
simultâneas. Reinicia com Docker após o arranque da EC2.

Build e instalação:

```bash
cd /home/ubuntu/roomwave
bash tools/build-ankh.sh
docker compose -f deploy/ankh.compose.yml up -d
```

Diagnóstico:

```bash
curl http://127.0.0.1:3250/health
docker logs --tail 50 roomwave-ankh
docker stats --no-stream roomwave-ankh
```

Testes realizados: consultas reais de utilizador/CID e sala; pesquisas no
dashboard com fonte Ankh; formulário de sala; interface móvel; testes do
conector (IDs exatos, falha explícita, destinos fixos) e typecheck API.
