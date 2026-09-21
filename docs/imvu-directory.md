# Pesquisa IMVU

Dashboard → Pesquisa IMVU (dono autenticado):

- Utilizador: username exato, CID ou `https://www.imvu.com/next/av/CID/`.
- Sala: ID `CID-ROOMID` ou link de sala IMVU.
- Resultado da sala → Usar em Salas preenche nome e ID; guardar e entrar continuam
  a ser ações explícitas. Consultar uma sala não atribui permissões no IMVU.

Fonte da implementação: consultas diretas a `api.imvu.com/user?username=...`,
`/user/user-CID` e `/room/room-ID`. A biblioteca `tools/imvu-directory.mjs`
normaliza dados, exige correspondência exata de CID/ID, limita pedidos a cinco
segundos, não segue redirecionamentos e mantém até 100 respostas por um minuto.
A API aceita apenas os tipos de pesquisa definidos, não URLs arbitrários.

O bot aproveita a mesma identificação ao registar um membro novo ou substituir
um nome provisório `IMVU-CID`. Nomes locais já definidos e cargos mantêm-se.
Se a consulta falhar, os comandos continuam a usar o identificador provisório.

A ferramenta mostra apenas os campos de perfil/sala selecionados. Não consulta
históricos de salas, localização, carteira, inventário nem endpoints de escrita
na conta IMVU. Usa leitura pública sem partilhar a sessão do bot.

## Ankh e wrappers analisados

- https://github.com/Yucked/Ankh
- https://github.com/Yucked/Ankh/blob/main/Ankh.Backend/Controllers/InfoController.cs
- https://github.com/imckvu/tool

A pesquisa agora permite também escolher **Ankh**, através de um host C# local
que executa a biblioteca real do projeto. Ver [instalação e limites](ankh.md).
A fonte IMVU direta continua disponível. O backend completo Ankh.Backend,
com RavenDB e workers, não está instalado.
A integração IMQ do bot atual mantém-se; não houve migração para outro wrapper.

## Testes

```bash
node --test --test-isolation=none apps/dashboard/test/*.test.mjs
node --env-file=.env --import tsx apps/api/test/imvu-directory.integration.ts
```

O teste de integração cria e remove uma sala e utilizadores temporários; verifica
chave interna, cargo OWNER e correspondência real. A interface foi testada por
nome, sala, preenchimento de formulário e viewport móvel.
