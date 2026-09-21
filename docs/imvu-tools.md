# Ferramentas IMVU

A aba Ferramentas IMVU reúne a pesquisa existente (incluindo Ankh) com:

- Perfil detalhado por CID/username, com contagens públicas de seguidores.
- Informação de sala por link/ID e pesquisa pública de salas por palavras.
- Produtos por PID ou pesquisa de catálogo (até 20 resultados).
- Consulta de outfits quando a API pública os permitir.
- Histórico de entradas/saídas e pesquisa das mensagens públicas da sala do bot.

Nos testes reais, a API exigiu autenticação para outfits (`401`) e a pesquisa
pública de salas retornou uma coleção vazia. A interface mostra a restrição ou
resultado vazio; não apresenta estes casos como disponibilidade garantida.
As salas guardadas continuam em Dashboard → Salas. Perfis detalhados, catálogo,
outfits e listas consultam IMVU; utilizador e sala individual permitem Ankh.

## Recolha da sala

Desligada por defeito. Na aba, informar os participantes e marcar a opção de
recolha, depois guardar. Só o OWNER pode configurar, consultar ou apagar.
O histórico é separado por sala e a interface identifica a sala atual.
Não há dados retroativos. Reiniciar o bot não gera falsas entradas: o primeiro
retrato serve de referência. Novas entradas/saídas são observadas em consultas
a cada dez segundos; visitas muito curtas podem não ser detetadas.

Mensagens são recolhidas após o gateway arrancar apenas se `to` for explicitamente
zero e a fila/chat corresponderem à ligação ativa. Mensagens privadas e eventos
sem destino público explícito são excluídos. Guardam-se CID, texto e hora local
de receção; nomes são incluídos nos eventos de participantes quando disponíveis.
Não existe recolha de outras salas nem acesso forçado a salas privadas.

Dados em `.data/room-activity/<roomId>/`: configuração JSON e ficheiros diários
JSONL, fora do Git, com permissões 600. Retenção até sete dias por ficheiro diário,
limpeza no arranque da API e de hora a hora. Limite de 2 MB por dia/sala; até 100
resultados por pesquisa. Recolha best-effort: falhas ou sobrecarga não interrompem
os comandos, mas podem perder eventos. Apagar histórico remove os ficheiros de
eventos; desativar a recolha não apaga o que já foi guardado.

## Validação

```bash
pnpm --filter @roomwave/api typecheck
pnpm --filter @roomwave/bot typecheck
node --test --test-isolation=none --import tsx apps/bot/test/*.test.ts
node --test --test-isolation=none apps/dashboard/test/*.test.mjs
node --env-file=.env --import tsx apps/api/test/room-activity.integration.ts
```

Testes cobrem exclusão de mensagens privadas, isolamento por sala, opt-in,
pesquisa, eliminação, controlo OWNER e rejeição de gravação para sala inativa.
Catálogo e perfil foram testados no browser real, incluindo viewport móvel.
Recolha em produção fica desligada; a primeira entrada/mensagem real deve ser
verificada após o dono ativar e informar os participantes.
