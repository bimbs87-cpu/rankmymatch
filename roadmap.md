# FASE 2.4 — Privacidade, Analytics, publicidade e segurança complementar

- [x] Etapa A — Rastreamento auditado; GA4/Ads só carregam após consentimento (banner + /privacidade + Perfil → Privacidade); caminhos sanitizados (sem query, convite mascarado); personalização de anúncios desativada
- [x] Etapa B — Política de Privacidade atualizada (origem de cadastro, capturas de bugs, push, medição opcional com controle interativo); pendências de retenção documentadas no relatório
- [x] Etapa C — bug-screenshots privado (dono/admin, 5MB, só imagem); group-images 5MB + só imagem (público mantido); og-cache 2MB; admin lê capturas via URL assinada
- [x] Etapa D — Push: destinatários já restritos a colegas de grupo; adicionado bloqueio de links externos e limite de 30 lotes/hora por remetente (push_send_log)
- [x] Etapa E — 17 testes automatizados passando; build OK; navegador: banner, bloqueio pré-consentimento, ativação, persistência, telas principais logadas, bucket privado (400) e público (200)
- [x] Etapa F — Relatório final entregue no chat

Regras: não apagar dados reais; não alterar rankings/Elo/partidas; sem consentimentos fictícios; não publicar sem testes; não iniciar app Android; não iniciar próxima fase.

Estado atualizado no encerramento abaixo; personalização de anúncios segue desativada.

# FASE 2.4.1 — Fechamento de privacidade e validação da publicação

- [x] Revogação de consentimento: eventos param imediatamente (opt-out GA4 + consent mode denied + remoção de cookies _ga), sem recarregar; reautorização limpa o opt-out
- [x] Minimização de parâmetros: scrubParams descarta chaves sensíveis (token/convite/e-mail/nome) e strings longas
- [x] Retenção 90 dias adotada para logs de push e diagnóstico (cron log-retention-cleanup-daily, 04:30 UTC); tabelas estavam vazias — nenhum histórico apagado
- [x] Política de Privacidade atualizada (revogação imediata + prazos de retenção)
- [x] Publicação: revogação confirmada em raqueteia.app no encerramento abaixo
- [x] Testes: 21 automatizados passando; navegador: aceitar→revogar→reaceitar sem reload, 0 requests Google após revogação, app íntegro com recusa

Estado atualizado no encerramento abaixo; Fase 2.5 (Android) não iniciada.

# ENCERRAMENTO DA FASE 2 — 2 de novembro de 2026

- [x] Documentar propostas de retenção, minimização e descarte, sem novas rotinas nem exclusões históricas
- [x] Confirmar consentimento em produção: recusar sem scripts, aceitar, revogar imediatamente e persistir após recarregar
- [x] SPF/DMARC confirmados; domínio verificado; um e-mail de teste aceito pelo provedor para o contato autorizado
- [x] 32 regressões passaram; grupos, partidas, rankings, temporadas, sessão e notificações verificados em leitura; divergência inicial do controle push corrigida
- [x] Relatório de encerramento documentado com limites e requisitos Android; nenhum AAB ou alteração de identificador
- [ ] Proprietário: publicar nova política e ajuste de apresentação push; revogação já validada em produção
- [ ] Proprietário: confirmar recebimento do e-mail e cabeçalhos DKIM/SPF/DMARC; seletor DKIM não fornecido pelas ferramentas
- [ ] Proprietário: validar push em celular físico e login Google completo em produção
- [ ] Aprovação específica necessária antes de implementar minimização/descarte das categorias propostas; nenhum novo descarte ativado
