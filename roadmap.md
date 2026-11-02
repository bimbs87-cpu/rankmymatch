# FASE 2.4 — Privacidade, Analytics, publicidade e segurança complementar

- [x] Etapa A — Rastreamento auditado; GA4/Ads só carregam após consentimento (banner + /privacidade + Perfil → Privacidade); caminhos sanitizados (sem query, convite mascarado); personalização de anúncios desativada
- [x] Etapa B — Política de Privacidade atualizada (origem de cadastro, capturas de bugs, push, medição opcional com controle interativo); pendências de retenção documentadas no relatório
- [x] Etapa C — bug-screenshots privado (dono/admin, 5MB, só imagem); group-images 5MB + só imagem (público mantido); og-cache 2MB; admin lê capturas via URL assinada
- [x] Etapa D — Push: destinatários já restritos a colegas de grupo; adicionado bloqueio de links externos e limite de 30 lotes/hora por remetente (push_send_log)
- [x] Etapa E — 17 testes automatizados passando; build OK; navegador: banner, bloqueio pré-consentimento, ativação, persistência, telas principais logadas, bucket privado (400) e público (200)
- [x] Etapa F — Relatório final entregue no chat

Regras: não apagar dados reais; não alterar rankings/Elo/partidas; sem consentimentos fictícios; não publicar sem testes; não iniciar app Android; não iniciar próxima fase.

Pendente (decisão do proprietário): publicar para valer em produção; prazos de retenção de logs técnicos; ativar ou não personalização de anúncios no futuro.

# FASE 2.4.1 — Fechamento de privacidade e validação da publicação

- [x] Revogação de consentimento: eventos param imediatamente (opt-out GA4 + consent mode denied + remoção de cookies _ga), sem recarregar; reautorização limpa o opt-out
- [x] Minimização de parâmetros: scrubParams descarta chaves sensíveis (token/convite/e-mail/nome) e strings longas
- [x] Retenção 90 dias adotada para logs de push e diagnóstico (cron log-retention-cleanup-daily, 04:30 UTC); tabelas estavam vazias — nenhum histórico apagado
- [x] Política de Privacidade atualizada (revogação imediata + prazos de retenção)
- [x] Publicação verificada: raqueteia.app já servia o código da Fase 2.4; nova publicação necessária para a revogação
- [x] Testes: 21 automatizados passando; navegador: aceitar→revogar→reaceitar sem reload, 0 requests Google após revogação, app íntegro com recusa

Pendente: publicar a versão com revogação; proposta de retenção para exclusões/auditoria/e-mails aguarda aprovação do proprietário; Fase 2.5 (Android) não iniciada.

# ENCERRAMENTO DA FASE 2 — 2 de novembro de 2026

- [ ] Documentar propostas de retenção, minimização e descarte, sem novas rotinas nem exclusões históricas
- [x] Confirmar consentimento em produção: recusar sem scripts, aceitar, revogar imediatamente e persistir após recarregar
- [ ] Verificar SPF, DKIM e DMARC e enviar um único e-mail de teste explícito ao contato autorizado
- [ ] Executar regressões e verificar grupos, partidas, rankings, temporadas, sessão e notificações sem alterar dados esportivos
- [ ] Entregar relatório de encerramento com limites e requisitos Android, sem gerar AAB nem mudar identificador
