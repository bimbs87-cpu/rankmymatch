# Roadmap

## Concluído: Rebrand para Raqueteia — 28/10/2026
- [x] Nome "RankMyMatch" → "Raqueteia" em todo o app (textos, SEO, e-mails, manifest, sw.js)
- [x] URLs do site → raqueteia.app (canonical, sitemap, og, compartilhamento); infra de e-mail segue em rankmymatch.app
- [x] Logo horizontal nova (fundos escuro e claro, transparente), logo quadrada (ícones PWA/favicon), splash screens (iOS/Android)
- [x] og-image refeita com a nova logo

## Concluído: Teste completo de funcionalidade (QA geral) — 27/10/2026
- [x] Fluxo ponta a ponta validado (grupo, temporada, convite, presença, sorteio, resultados, Elo, ranking, convidado, imagem de ranking)
- [x] Correções QA: corrida de carregamento do grupo, salvamento em lote sem perda de dados, nome de perfil vazio

## Concluído: Melhorias pós-QA — 27/10/2026
- [x] Gráfico "Evolução de Elo" desenha linhas desde a 1ª rodada (ponto de base no rating inicial)
- [x] "Total de jogos" nos destaques conta partidas distintas (3), não timestamps
- [x] Botão "Vou" substituído por "A lista de presença abre <data>" antes da abertura
- [x] Lançamento em lote com opção "Fechar em super tie-break (10 pts)" quando 1x1 (não testado no navegador)
- [x] Erros 409 de sessão/aquisição eliminados via upsert idempotente

## Concluído: Otimização da primeira carga da Home — 27/10/2026
- [x] Cache compartilhado (src/lib/shared-fetch.ts) deduplica consultas idênticas simultâneas entre instâncias de hooks (Home, BottomNav, DesktopNav, popovers)
- [x] Removidas consultas redundantes em use-group-pending-tasks (contagens duplas)
- [x] Tempo até conteúdo: ~5,7s → ~3,3s (medido com Playwright, usuário QA)

## Backlog
- [ ] 401/500 no console para usuários criados via SQL (artefato de teste, não afeta produção)
