# Comandos personalizados

No chat, apenas o membro com cargo OWNER na sala pode gerir comandos:

- `!criarcomando festa A festa começa às 22h!`
- `!editarcomando festa A festa começa às 23h!`
- `!apagarcomando festa`
- `!listarcomandos`

Qualquer utilizador pode usar `!festa` depois da criação. São respostas de texto,
sem execução de código. Os nomes aceitam letras ASCII, números, `_` e `-`,
começam por letra e têm até 32 caracteres. O prefixo `!` no nome é opcional;
nomes são convertidos para minúsculas. Respostas têm até 500 caracteres.
Os comandos existentes e de gestão estão reservados. Criar um nome existente
não o substitui; usar edição. Cada sala tem os seus comandos na tabela
`CustomCommand`, preservados após reinícios.

A gestão usa POST `/api/rooms/:roomId/commands` com ação, identidade IMVU,
nome e resposta; a API verifica OWNER na base de dados e a chave privada do bot.
GET `/api/rooms/:roomId/commands/:name` devolve apenas a resposta pública.

Deploy: aplicar migrações Prisma e gerar o cliente. Bot e API leem a mesma chave
privada `.data/custom-commands.key`, com permissões 600, fora do Git.
Num servidor novo, gerar uma chave aleatória nesse ficheiro antes de iniciar.
Reiniciar apenas API e bot. A rádio e a fila não dependem desta tabela.

Verificação de integração (cria e apaga uma sala temporária):
`node --env-file=.env --import tsx apps/api/test/custom-commands.integration.ts`.
