# YouTube / YouTube Music no RoomWave

> Evolução posterior: a pesquisa principal passou a NodeLink e foi acrescentado
> um Source Resolver com cache temporária. Consultar a
> [verificação dos endpoints de áudio NodeLink](nodelink-audio-verification.md)
> para os resultados mais recentes. O fluxo abaixo documenta a implementação anterior.

## Fluxo implementado

```text
!add texto ou URL
  → API → packages/music
  → YouTube Music (ytmusicapi), com fallback para YouTube Data API
  → Track / QueueItem com videoId e URL permanente
  → AutoDJ → Audio Engine
  → yt-dlp resolve o áudio no momento de tocar
  → FFmpeg → Liquidsoap Harbor → Icecast
```

Audius já não é usado na pesquisa principal nem como fallback. Os módulos antigos
continuam no repositório, assim como o suporte a fontes HTTP já existentes na fila.
Spotify e o Browser Player não participam neste fluxo.

O resolver está integrado em `apps/audio-engine/src/resolver/youtube.ts`; não exige
outro serviço. A base de dados guarda a URL do vídeo, nunca a URL temporária do áudio.
URLs de YouTube Music, YouTube, youtu.be e IDs de vídeo são suportados pelo motor.
Pedidos de playlists sem um vídeo concreto são rejeitados.

A pesquisa deixou de exigir vídeos incorporáveis em iframe. Esse atributo não
comprova que o extrator consiga obter o áudio, e não é necessário para este motor.

## Configuração

As opções estão também em `.env.example`:

```dotenv
YOUTUBE_API_KEY=...
YTMUSIC_PYTHON=/home/ubuntu/roomwave/tools/ytmusic-test/.venv/bin/python
YTMUSIC_RESOLVER=/home/ubuntu/roomwave/tools/ytmusic-test/resolver.py
YTDLP_BIN=/home/ubuntu/roomwave/tools/audio-gateway/.venv/bin/yt-dlp
FFMPEG_BIN=ffmpeg
ROOMWAVE_AUDIO_ENGINE_URL=http://127.0.0.1:3210
```

A Data API é usada como fallback de pesquisa e para metadados de URLs/IDs explícitos.
`ytmusicapi` é uma integração não oficial. O extrator usa o Node do próprio motor
como runtime JavaScript. O ambiente Python do yt-dlp deve incluir as dependências
de suporte ao YouTube, incluindo `yt-dlp-ejs`.

O funcionamento definido para o RoomWave é anónimo, sem conta YouTube. O extrator
usa explicitamente `--no-cookies --no-cookies-from-browser` e ignora configurações
externas. Uma eventual variável antiga `YTDLP_COOKIES_FILE` não é utilizada.
O código `YOUTUBE_ACCESS_DENIED` indica recusa do acesso anónimo; não implica que
seja necessário introduzir login no produto.

## Diagnóstico sem transmitir

Na raiz do projeto:

```sh
pnpm youtube:probe "Ghost - Mary On A Cross"
```

O comando pesquisa, resolve a fonte e tenta descodificar três segundos para uma
saída nula. Não altera a fila, não controla o Spotify e não envia áudio à rádio.
Devolve código de saída 1 na etapa que falhou e não imprime cookies ou URLs de
áudio assinadas.

## Estados e falhas

`POST /play` responde em `LOADING`. O estado só muda para `PLAYING` quando o FFmpeg
reporta avanço na saída de áudio, em vez de o fazer ao criar o processo.
Isto confirma progresso do encoder; não substitui uma verificação do stream público.

A resolução tem limite de 45 segundos e o arranque do FFmpeg tem limite de 20.
O cliente AutoDJ espera até 70 segundos pelo estado de reprodução. `stop`, `skip`
e outra reprodução cancelam a resolução anterior. Um erro mantém a identidade
da faixa em `/status`, permitindo ao AutoDJ rejeitar o pedido correto.

Erros principais:

| Código | Significado |
| --- | --- |
| `YOUTUBE_ACCESS_DENIED` | O YouTube recusou o acesso anónimo à reprodução. |
| `YOUTUBE_EXTRACTOR_NOT_INSTALLED` | O executável configurado não existe. |
| `YOUTUBE_RESOLUTION_TIMEOUT` | O extrator ultrapassou 45 segundos. |
| `YOUTUBE_VIDEO_UNAVAILABLE` | O vídeo foi indicado como indisponível. |
| `YOUTUBE_RESOLUTION_FAILED` | Outra falha de extração. |
| `FFMPEG_PLAYBACK_FAILED` | O encoder não conseguiu concluir a reprodução. |
| `AUDIO_START_TIMEOUT` | Não houve progresso de áudio nos primeiros 20 segundos do encoder. |

O AutoDJ continua a tratar o pedido como colocado na fila antes de resolver a
fonte. Uma extração rejeitada termina como `SKIPPED` e pedido `REJECTED`; ainda não
existe uma notificação assíncrona desse erro no chat IMVU. Durante o arranque, o
AutoDJ serializa os ciclos; um `!skip` na base de dados pode aguardar esse arranque.
Os comandos diretos do Audio Engine cancelam imediatamente a resolução.

## Verificação e estado em 2026-09-20

```sh
pnpm --filter @roomwave/music --filter @roomwave/player --filter @roomwave/audio-engine --filter @roomwave/api typecheck
node --import tsx --test apps/audio-engine/test/*.test.ts packages/music/test/*.test.ts
```

Os testes usam um extrator simulado para os casos de sucesso, falha e cancelamento.
O teste Harbor usa FFmpeg real com um tom sintético e um recetor TCP local isolado;
não usa o Harbor da rádio. Requer FFmpeg e permissão para abrir um socket local.

Na EC2, a pesquisa real devolveu Ghost — Mary On A Cross, `seJ83vfHoIU`, 245 segundos.
A extração desse vídeo falhou com `YOUTUBE_ACCESS_DENIED`. Assim, a reprodução real
de YouTube até ao stream público ainda não foi validada. Os serviços de produção
não foram reiniciados para ativar estas alterações.

Antes de ativar, repetir o diagnóstico com o acesso ao YouTube resolvido. Depois,
num período sem reprodução ativa, reiniciar Audio Engine, API e AutoDJ e verificar
um pedido completo no IMVU e no stream público.

### Verificação anónima adicional

O requisito confirmado é não depender de login YouTube nem de browser. Foram
testados os caminhos abaixo na EC2, sem transmitir na rádio:

| Caminho | Resultado |
| --- | --- |
| yt-dlp 2026.08.19, versão estável atual, clientes padrão | Recusa anti-bot. |
| yt-dlp, cliente `android_vr`, sem cookies | Recusa anti-bot. |
| Lavalink 4.2.2, plugin YouTube snapshot anterior, `ANDROID_VR` | HTTP 500, `This video cannot be loaded`. |
| Mesmo Lavalink, cliente `IOS` | HTTP 500, `This video cannot be loaded`. |
| yt-dlp isolado com bgutil 2.0.0 e cliente `mweb` | Recusa anti-bot. |
| Mesmo ambiente com `fetch_pot=always` e vídeo oficial `bpY6gGjjy5I` | Recusa anti-bot. |
| Lavalink com plugin estável 1.18.2, OAuth desligado, `ytsearch:` e `ytmsearch:` | Ambas as pesquisas encontraram a faixa correta. |
| Plugin 1.18.2, carga direta e saída `/youtube/stream/` | Carga falhou; stream HTTP 500. Logs: `This video requires login` nos clientes `ANDROID_VR` e `WEB`. |

O bgutil correu temporariamente na porta local 14416, limitado a 256 MB; o contentor
foi parado e removido depois do teste. A instalação do extrator em produção não
foi modificada. O ambiente de teste Python ficou em
`/tmp/roomwave-youtube-anonymous-venv` para reprodução do diagnóstico.

Estes resultados demonstram falha dos caminhos testados neste servidor, não uma
impossibilidade universal de reprodução anónima. Ainda não foi isolada uma causa
única, como reputação de IP, limitação por região ou comportamento do cliente.

A configuração ativa do contentor de testes foi atualizada em
`lavalink-test/application.yml`: plugin estável 1.18.2, `snapshot: false`, fonte
nativa YouTube desativada, OAuth desligado e clientes `MUSIC`, `ANDROID_VR`, `WEB`.
A versão carregada foi confirmada em `/v4/info`. O Lavalink de testes foi
reiniciado por Docker Compose; não existe necessidade de criar um serviço
`lavalink` no systemd. A cópia da configuração anterior está em
`/tmp/roomwave-lavalink-before-stable-1.18.2.yml`, com permissões restritas.
Os serviços API, AutoDJ, Audio Engine e IMVU permaneceram ativos sem reinício.

Uma alternativa a validar é obter o áudio num serviço externo e manter fila,
FFmpeg, Liquidsoap e Icecast na EC2. Um candidato documentado é o
[API YT](https://apiyt.cc/dev/en/), cujo `POST /api/json` recebe um `videoId` e anuncia
devolver uma URL MP3. Exige chave RapidAPI. Não foi contratado, integrado nem
testado; disponibilidade das faixas, custo e estabilidade ainda precisam de
verificação. A documentação de um fornecedor não prova reprodução funcional.

Não foram configurados proxies, outros servidores, login ou cookies de conta.

Referências: [yt-dlp](https://github.com/yt-dlp/yt-dlp),
[ytmusicapi](https://ytmusicapi.readthedocs.io/en/stable/),
[YouTube Data API](https://developers.google.com/youtube/v3/docs/search/list),
[guia PO Token](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide),
[bgutil](https://github.com/Brainicism/bgutil-ytdlp-pot-provider),
[youtube-source](https://github.com/lavalink-devs/youtube-source).
