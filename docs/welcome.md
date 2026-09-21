# Boas-vindas automáticas

No Dashboard → Comandos → Boas-vindas automáticas, escrever a mensagem,
ativar a opção e guardar. A configuração aplica-se à sala atual; só o OWNER
pode alterá-la. Mensagem até 350 caracteres, com pré-visualização local.

Variáveis: `{nome}`, `{sala}` (nome no RoomWave), `{radio}`.

Exemplo: `Olá, {nome}! Bem-vindo a {sala}. Usa !comandos para começar.`

A funcionalidade começa desligada. O bot consulta os participantes pela sua
sessão IMVU a cada 10 segundos quando está ativa. O primeiro retrato da sala
é silencioso, incluindo após reinício, ativação ou falha de ligação: quem já
estava presente não recebe boas-vindas. Visitas entre duas consultas podem
não ser detetadas. Envia no máximo uma mensagem por consulta e não repete
para a mesma pessoa durante 10 minutos. Não envia ao próprio bot. Visitantes
que saíram entretanto são retirados da lista de espera.

Configuração persistida em `.data/welcome/<roomId>.json`, com escrita atómica,
fora do Git. Incluir este diretório nos backups. A API exige a chave interna;
para alterar, verifica também a identidade e o cargo OWNER da sala. O dashboard
mantém autenticação, validação de origem e bloqueio durante trocas de sala.

Não depende do DOM, que o modo de baixo consumo remove, nem abre outro browser.
Os nomes são mantidos em memória enquanto o participante está na sala; as
respostas de consulta são libertadas para não acumular memória.

Testes:

```bash
node --test --test-isolation=none --import tsx apps/bot/test/welcome.test.ts
node --env-file=.env --import tsx apps/api/test/welcome.integration.ts
```
