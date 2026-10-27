# Roadmap

## Concluído: Teste completo de funcionalidade (QA geral) — 27/10/2026
- [x] Fluxo ponta a ponta validado (grupo, temporada, convite, presença, sorteio, resultados, Elo, ranking, convidado, imagem de ranking)
- [x] Correções QA: corrida de carregamento do grupo, salvamento em lote sem perda de dados, nome de perfil vazio

## Concluído: Melhorias pós-QA — 27/10/2026
- [x] Gráfico "Evolução de Elo" desenha linhas desde a 1ª rodada (ponto de base no rating inicial)
- [x] "Total de jogos" nos destaques conta partidas distintas (3), não timestamps
- [x] Botão "Vou" substituído por "A lista de presença abre <data>" antes da abertura
- [x] Lançamento em lote com opção "Fechar em super tie-break (10 pts)" quando 1x1 (não testado no navegador)
- [x] Erros 409 de sessão/aquisição eliminados via upsert idempotente

## Backlog
- [ ] Primeira carga da Home de usuário novo é lenta (~8s; queries redundantes de group_members/groups)
- [ ] 401/500 no console para usuários criados via SQL (artefato de teste, não afeta produção)
