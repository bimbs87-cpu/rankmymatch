# Raqueteia — encerramento da Fase 2

Verificação realizada em 2 de novembro de 2026. Resultado: correções verificadas com pendências explícitas; preparação Android não iniciada.

## 1. Retenção: critérios documentados

| Categoria | Proposta | Finalidade e dados mínimos |
| --- | --- | --- |
| Pedidos de exclusão | Até 5 anos após conclusão | Evidência mínima de atendimento: referência pseudonimizada, datas, resultado e etapas/códigos necessários; acesso restrito |
| Auditoria de segurança | Até 1 ano desde o evento | Investigação e proteção: data, evento, resultado e referências necessárias, evitando cópias integrais e conteúdo pessoal |
| E-mails transacionais | Até 1 ano desde envio/tentativa | Metadados de mensagem, finalidade, estado, datas e erros sanitizados; evitar corpo completo desnecessário |

Os prazos são propostas, não exigências automáticas da LGPD. A documentação detalha pseudonimização, acesso mínimo, simulação de descarte, aprovação específica, eliminação de registros vencidos e associações desnecessárias, evidência agregada e tratamento de backups. Não houve exclusão histórica, pseudonimização de registros existentes ou nova rotina de descarte dessas três categorias. Não se atesta minimização já implementada. A rotina operacional anterior de 90 dias para push/diagnóstico não foi ampliada.

## 2. Publicação e consentimento

A correção de revogação **já está publicada e funcionando em https://raqueteia.app**. Teste real do navegador, sem conta e sem registrar consentimentos fictícios em contas:

- Antes da escolha: zero requisições aos serviços Google observados.
- Recusar: zero requisições Google; aplicativo continua acessível.
- Ativar: cinco requisições Google observadas, comprovando ativação após escolha.
- Desativar na mesma página: opt-out GA4 verdadeiro; consentimento Analytics/Ads negado; cookies Google ausentes; zero novas requisições Google na janela observada.
- Recarregar após revogar: escolha negada persistida e nenhum script Google carregado.
- Nenhum erro de execução nessa verificação pública.

A nova descrição das propostas de retenção e o ajuste de abertura inicial da tela de notificações estão preparados na versão de teste, **não foram publicados nesta etapa**. O proprietário deve usar **Publicar → Publicar alterações** para disponibilizá-los. Não é necessária publicação para tornar válida a correção de revogação já confirmada.

## 3. Infraestrutura de e-mail

- `notify.raqueteia.app`: serviço informa domínio verificado e habilitado; fila saudável.
- SPF confirmado em DNS público: `v=spf1 include:mailgun.org ~all`.
- DMARC confirmado em `_dmarc.notify.raqueteia.app`: `v=DMARC1; p=none`. Há monitoramento, mas essa política não exige quarentena/rejeição.
- DKIM: **não confirmado independentemente**. O serviço atesta domínio verificado, mas não retornou o seletor/registro DKIM. Consultas a seletores candidatos não forneceram evidência; isso não prova ausência de DKIM, pois o seletor real é desconhecido. A pendência é consultar os cabeçalhos da mensagem recebida e verificar `dkim=pass`, domínio assinante e seletor.

Foi criado um modelo neutro de teste, preso ao destinatário autorizado, sem fingir pedido de exclusão ou relatório. **Um único e-mail** foi solicitado para **bimbapps@gmail.com**. Resposta do envio: HTTP 200, enfileirado. O registro passou de pendente às **21:48:23 UTC** para **sent às 21:48:27 UTC** (18:48 Brasília), sem erro; um único identificador de mensagem foi contabilizado.

`sent` comprova aceitação pelo provedor, **não chegada à caixa de entrada**. Não foi acessada a caixa Gmail. O proprietário deve confirmar recebimento e, em “Mostrar original”, conferir SPF, DKIM e DMARC. Nenhum reenvio foi feito. A mensagem de teste enviada pela versão de teste foi processada pela infraestrutura compartilhada; não é evidência de que o novo modelo já esteja publicado.

## 4. Integridade e regressões

**32 testes automatizados passaram, zero falhas**, cobrindo exclusão confiável/repetição, caminhos push internos, minimização de analytics, lembretes por horário de São Paulo, tema único e destinatário fixo do teste.

Com sessão autorizada do proprietário, as telas de Home, grupos, ranking, temporadas, histórico de partidas, notificações e perfil carregaram dados reais. Foram verificados grupo com temporadas ativas/encerradas, rodada concluída e seus três placares salvos: 4–6, 5–7 e 5–7. Não foram salvos resultados ou alterações esportivas. Esta é verificação de leitura, não um teste de criação/edição de partidas.

Foi detectada e corrigida uma divergência entre a apresentação inicial e a apresentação carregada do controle de push. Uma execução nova da tela não apresentou esse erro. Os registros automáticos de compilação indicaram **build OK** após as alterações.

Push: chave pública disponível (HTTP 200 e valor presente) no teste e no domínio publicado; notificações existentes e preferências visíveis; seis inscrições atualmente registradas; agendador de lembretes ativo e execuções recentes registradas como bem-sucedidas. O sucesso do agendador não comprova entrega de cada aviso. Não foi enviado push a usuários reais nem comprovado recebimento em celular físico.

Sessão e leituras autenticadas funcionaram. A emissão de uma nova sessão pelo login Google em produção não foi repetida; essa etapa externa continua a ser conferida antes da entrega Android.

Inventário de referência, sem mudança esportiva nesta etapa: **14 grupos, 27 temporadas, 309 rodadas, 666 partidas, 247 snapshots de ranking e zero pedidos de exclusão**. Não executar exclusão de contas como teste de encerramento. Testes de navegação podem gerar registros operacionais normais de acesso; o teste de e-mail criou seu histórico operacional esperado.

## 5. Segurança: limites da avaliação

A consulta disponível mostrou quatro avisos de segurança relacionados a funções da infraestrutura de e-mail, sem achado crítico nos resultados retornados. Algumas avaliações estão desatualizadas ou incompletas; isso **não equivale a certificação de segurança completa**. Não foram alteradas essas funções ou políticas nesta etapa. Uma avaliação atualizada e revisão dos avisos deve preceder a próxima publicação/entrega Android.

## 6. Pendências e requisitos Android

1. Publicar a nova redação de retenção e o ajuste de apresentação inicial de push; a revogação já está em produção.
2. Confirmar recebimento do teste em bimbapps@gmail.com e inspecionar cabeçalhos para DKIM e alinhamento SPF/DMARC.
3. Testar ativação e recebimento de push num celular real em raqueteia.app, incluindo preferências e abertura do destino correto.
4. Repetir um login Google completo no domínio de produção.
5. Atualizar a avaliação de segurança e revisar os avisos existentes antes da entrega.
6. Aprovar especificamente minimização/pseudonimização e descarte antes de implementar qualquer rotina das três categorias propostas. Aprovar a proposta documental não habilita descarte.
7. Para iniciar Android: autorização explícita para a próxima fase, acesso ao Play Console, conta de desenvolvedor habilitada, declarações Data Safety revisadas com a coleta real, URLs públicas de privacidade/exclusão, contato bimbapps@gmail.com, faixa etária/público-alvo e materiais da loja definidos.
8. Na fase autorizada, definir pacote e assinatura, validar domínio/TWA e Digital Asset Links. **Não foi gerado AAB nem modificado identificador Android nesta etapa.**

Conclusão: encerramento documentado e consentimento publicado confirmado; entrega final de e-mail, DKIM independente, celular físico, login Google completo e publicação dos novos ajustes permanecem pendentes de confirmação/ação do proprietário.