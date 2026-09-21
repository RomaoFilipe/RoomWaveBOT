# Segurança das salas próprias

Dashboard → Segurança.

1. Introduzir link/ID da sala em «Adicionar sala da minha propriedade».
2. O servidor compara o proprietário IMVU com o CID da conta OWNER autenticada
   no dashboard. Só depois guarda a sala e permite monitorização.
3. Selecionar uma sala verificada. Informar os participantes e ativar a recolha.
4. Para colocar o bot nessa sala, usar Dashboard → Salas → Entrar nesta sala.
5. Adicionar usernames/CIDs e notas à lista «Pessoas a destacar nesta sala».

A lista usa CID canónico, incluindo resolução de nomes Guest_. Um destaque não
é uma acusação, ban ou pesquisa de localização global: apenas assinala o nome
nos participantes observados e os eventos dessa pessoa no histórico da sala.
Até 50 pessoas por sala. Remover destaque não apaga o histórico; esse tem a sua
opção de eliminação na aba Ferramentas IMVU.

## Estados reais

O painel verifica até 20 salas guardadas. Uma sala com OWNER local diferente do
proprietário real IMVU aparece como não verificada. As APIs de leitura e escrita
revalidam a propriedade; não basta esconder um botão na interface.

Os dados de proprietário usam a cache IMVU de até um minuto. Se a verificação
falhar, a recolha é recusada. Configurações antigas de recolha também passam
pela verificação; o cargo local sozinho deixou de autorizar novos registos.
É possível desligar e limpar a recolha antiga sem depender da API IMVU.

Participantes são retratos obtidos pelo bot através da sua sessão na sala,
a cada dez segundos quando há recolha ativa. O painel mostra a hora observada.
Retratos com mais de 30 segundos, de outra sala ativa ou de recolha desligada
não são apresentados como atuais. Expiram também da memória da API.

Só existe um bot neste deployment: várias salas podem ser configuradas,
mas apenas uma é observada de cada vez. Reinícios ou falhas são apresentados
como ausência de observação recente, não como uma sala vazia. O histórico
continua separado por sala, com as regras descritas em `imvu-tools.md`.

## Serviços e dados

- API privada `POST /api/security` exige chave interna. As ações do dashboard
  exigem também OWNER na sala de gestão e propriedade real na sala consultada.
- `snapshot` aceita apenas o bot com chave interna, para a sala ativa e com
  recolha autorizada. O dashboard não permite encaminhar esta ação.
- Lista de pessoas/notas: `.data/room-security/<UUID>.json`, escrita atómica,
  permissões 600, fora do Git. Persiste até ser alterada/removida pelo dono.
- Participantes atuais: memória da API, no máximo 30 segundos.
- As rotas existentes do histórico também exigem propriedade real para ativar,
  recolher e consultar. Não há fallback para permissões locais se o IMVU falhar.

## Validação

`apps/api/test/security.integration.ts` verifica chave interna, OWNER, propriedade
real versus cargo local, recusa de snapshots de salas inativas e separação das
pessoas/eventos destacados por sala. Os registos de teste são removidos no fim.
A interface foi testada com a sala original, com a rejeição da sala de outra
conta e com viewport móvel.

Esta versão não inclui bans automáticos, notificações externas, recolha de
outras salas, acesso a inventários privados ou renderização 3D. Perfis, catálogo,
Ankh, ferramentas de pesquisa e histórico continuam nas abas existentes.
