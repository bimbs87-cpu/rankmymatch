# FASE 2.4 — Privacidade, Analytics, publicidade e segurança complementar

- [x] Etapa A — Rastreamento auditado; GA4/Ads só carregam após consentimento (banner + /privacidade + Perfil → Privacidade); caminhos sanitizados (sem query, convite mascarado); personalização de anúncios desativada
- [x] Etapa B — Política de Privacidade atualizada (origem de cadastro, capturas de bugs, push, medição opcional com controle interativo); pendências de retenção documentadas no relatório
- [x] Etapa C — bug-screenshots privado (dono/admin, 5MB, só imagem); group-images 5MB + só imagem (público mantido); og-cache 2MB; admin lê capturas via URL assinada
- [x] Etapa D — Push: destinatários já restritos a colegas de grupo; adicionado bloqueio de links externos e limite de 30 lotes/hora por remetente (push_send_log)
- [x] Etapa E — 17 testes automatizados passando; build OK; navegador: banner, bloqueio pré-consentimento, ativação, persistência, telas principais logadas, bucket privado (400) e público (200)
- [x] Etapa F — Relatório final entregue no chat

Regras: não apagar dados reais; não alterar rankings/Elo/partidas; sem consentimentos fictícios; não publicar sem testes; não iniciar app Android; não iniciar próxima fase.

Pendente (decisão do proprietário): publicar para valer em produção; prazos de retenção de logs técnicos; ativar ou não personalização de anúncios no futuro.
