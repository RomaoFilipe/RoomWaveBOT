# Verificação de áudio NodeLink — 20/09/2026

## Integração ativada

OAuth aplicado ao contentor principal `roomwave-nodelink-test`, mantendo a porta
restrita a `127.0.0.1:2334` e reinício automático. O contentor anterior está
parado como `roomwave-nodelink-before-oauth` para rollback. Ao recriar o principal,
preservar o ambiente anterior e incluir o ficheiro privado `youtube-oauth.env`
com `--env-file`; manter os dois endpoints de áudio ligados.

O Source Resolver resolve IDs YouTube através do NodeLink, exige o ID e a fonte
corretos (inclusive em `newTrack`) e descarrega a URL HTTPS `googlevideo.com`
para a cache temporária existente. O ficheiro conserva o conteúdo original
WebM/Opus, mesmo com extensão `.bin`; FFmpeg deteta o formato. Não é MP3.
O downloader limita os bytes durante a leitura; o Player espera até 90 segundos
pela resolução/download. Links sem correspondência exata já não usam o primeiro
resultado de pesquisa como substituição.

Validação: tipos do Source Resolver, Player e Music passaram; teste de rejeição
de outra fonte, outro ID e emissão em direto passou. Download integral identificado
como Opus, duração 206,021 s. A leitura integral por FFmpeg terminou com código 0,
mas apresentou um aviso `Error parsing Opus packet header`; não assumir uma
validação sem avisos de todos os pacotes.

Teste HTTP do serviço ativo: `/resolve` devolveu `RESOLVED`, `/play` transitou
de `LOADING` para `PLAYING` sem `lastError`. Após seis segundos a reprodução foi
parada e a cache do teste apagada. API, Player, Source Resolver e bot IMVU ativos.
A limpeza automática normal do Player foi preservada; neste teste direto ao
Audio Engine a limpeza foi feita explicitamente. Não foi simulado um comando
no chat IMVU nem comprovada estabilidade 24/7.

## Atualização: teste com OAuth concluído

Após autorização do utilizador, o refresh token foi guardado em
`.data/nodelink/youtube-oauth.env` com permissões 600 e exclusão do Git.
Este ficheiro é configuração para Docker `--env-file`, não um executável nem
um script para carregar com `source`.

Uma cópia temporária `roomwave-nodelink-oauth-probe` recebeu essas variáveis,
com apenas YouTube ativo e os dois endpoints de áudio ligados. Resultados:

- O gestor OAuth da versão instalada conseguiu renovar o token (`valid: true`).
- Pesquisa identificou `lsBmNKMTrtw`, **Plutonio - Interestelar**, 206 segundos.
- `/v4/trackstream`: fonte `googlevideo.com`, formato `webm/opus`, `newTrack: null`.
- `/v4/loadstream`: HTTP 200, `audio/l16;rate=48000;channels=2`.
- Amostra de 192000 bytes PCM: pico 11052 e RMS 2621,47, interpretada como
  inteiros de 16 bits na máquina de teste. Há sinal não nulo.

Isto demonstra obtenção de áudio nesta EC2 com OAuth para o vídeo testado;
não comprova reprodução integral nem estabilidade 24/7. A rádio não recebeu
esta amostra. O contentor temporário foi removido e o principal não foi alterado.
Ainda falta aplicar a configuração persistente e integrar o Source Resolver.

O endpoint `/v4/youtube/config?validate=true` excedeu 100 segundos. No código
instalado, o validador atribui um token string a `refreshToken`, enquanto
`OAuth.getAccessToken()` o percorre como lista; não usar esse resultado para
concluir que o token é inválido. A validação direta utilizou o construtor OAuth
com a configuração e a lista corretas, sem imprimir tokens.

## Resultado

NodeLink 3.9.0 identifica o vídeo `lsBmNKMTrtw` como **Plutonio - Interestelar**.
Os endpoints de áudio existem, mas vêm desativados na configuração instalada.
Ativá-los tornou-os acessíveis; não resolveu a reprodução da gravação YouTube.

| Ambiente | `/v4/trackstream` | `/v4/loadstream` |
| --- | --- | --- |
| Principal, porta 2334, opções originais | HTTP 404 | HTTP 404 |
| Cópia temporária, endpoints ligados, fontes padrão | HTTP 200, URL de SoundCloud | HTTP 200, bytes PCM com sinal não nulo |
| Cópia temporária, apenas fonte YouTube | HTTP 500 | HTTP 500 |

**O sucesso HTTP da segunda linha era uma substituição incorreta.** O campo
`newTrack` identificava a fonte `soundcloud`, ID `2016660099`, autor `GUSTAJONY`,
título “Plutonio - Interestelar vs Tim hox - Riddim (Gustajony & Dkuul Mashup)
[FILTERED for COPYRIGHT]”. A URL apontava para `cf-media.sndcdn.com`.
Não era o vídeo solicitado. A amostra não foi enviada para a rádio.

Sem outras fontes, os dois endpoints responderam:

```text
Failed to get a working track URL from any client.
```

Os logs registaram `No streaming data available` em VisionOs, AndroidVR, TV_DOWN,
TV, TVCast, WebEmbedded, Web e IOS. Isto identifica a etapa que falhou; não prova
uma causa única nem garante que OAuth a resolva.

## Configuração verificada no código instalado

As opções estão sob `api` em `config.default.ts`. As variáveis efetivas são:

```dotenv
NODELINK_API_ENABLETRACKSTREAMENDPOINT=true
NODELINK_API_ENABLELOADSTREAMENDPOINT=true
```

O Compose de exemplo incluído no projeto NodeLink mostra nomes antigos sem
`API_`; verificar a estrutura da versão instalada antes de os utilizar.

`trackstream` devolve JSON com `url`, `protocol`, `format`, `additionalData` e
eventualmente `newTrack`. `loadstream` devolve PCM e anunciou
`audio/l16;rate=48000;channels=2` no teste. Não se deve guardar essa saída como MP3
sem codificação.

Uma lista `fallbackSources: []` não basta para impedir substituições nesta versão:
o código acrescenta uma lista interna de fontes. No teste estrito, todas as
fontes exceto `youtube` foram desativadas. `/v4/info` confirmou `sourceManagers:
["youtube"]`.

## Consequência para o Source Resolver

Antes de descarregar ou transmitir uma resposta do NodeLink, validar que não
existe mudança para outra fonte ou outro identificador em `newTrack`. HTTP 200,
ficheiro não vazio e áudio audível não comprovam a identidade da gravação.

A ligação automática ao Source Resolver ainda não foi feita, pois o teste da
gravação exata falhou. A pesquisa principal, catálogo de fontes e rádio não foram
alterados durante esta verificação.

## Isolamento

Os testes usaram a imagem existente `roomwave-nodelink:v3.9.0`, num contentor
temporário `roomwave-nodelink-audio-probe`, porta local 12334, memória limitada a
256 MB e sem cookies ou refresh tokens configurados. O contentor temporário foi
parado e removido ao terminar. O original `roomwave-nodelink-test` não foi
reiniciado nem reconfigurado.

Referência: [API REST NodeLink](https://nodelink.js.org/docs/api/rest). A análise do
código local foi usada para confirmar os nomes das opções e o comportamento desta
versão.
