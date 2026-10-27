# Roadmap

## Concluído: Teste completo de funcionalidade (QA geral) — 27/10/2026
- [x] Sessões admin + usuário novo; grupo "Grupo Teste QA" criado com regras
- [x] Convite por link + placeholders (Ana, Bruno, Carla); convidado entrou e é reconhecido como membro
- [x] Temporada com 4 rodadas; presença confirmada (5 jogadores); sorteio de 3 partidas
- [x] Resultados lançados (sets, 3º set super tie-break); Elo e ranking corretos; notificações enviadas
- [x] Visão do convidado validada (grupo, ranking, card da última rodada, inativos)
- [x] Imagem de ranking compartilhável gerada em alta resolução (882×1466)
- [x] Correções: corrida de carregamento do grupo (admin sumia), salvamento em lote não perde mais placares digitados, nome de perfil vazio reparado

## Pendências encontradas (backlog)
- [ ] Gráfico "Evolução de Elo" vazio quando só há 1 rodada (todos os pontos na mesma data)
- [ ] Botão "Vou" clicável antes da lista de presença abrir (erro só aparece ao clicar; ideal desabilitar com a data de abertura)
- [ ] Lançamento em lote sem opção "Fechar em super tie-break" quando 1x1 (só 3º set manual)
- [ ] Erros 409 repetidos no console (registro de sessão/visita duplicado) — sem impacto funcional
- [ ] "Total de jogos: 1" nos destaques conta rodadas, não partidas
- [ ] Primeira carga da Home de usuário novo é lenta (~8s de tela de carregamento)
