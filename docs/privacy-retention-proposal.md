# Raqueteia — proposta de retenção e descarte

Data: 2 de novembro de 2026. Responsável pelo contato: bimbapps@gmail.com.

## Estado da decisão

Critérios adotados para documentação e revisão. Os prazos abaixo são propostas de limites de retenção, não exigências automáticas da LGPD. A escolha deve ser justificada pela finalidade, necessidade e proporcionalidade. Esta etapa não executa exclusões históricas, pseudonimizações de registros existentes nem ativa novas rotinas de eliminação. A aprovação específica do proprietário permanece obrigatória antes de qualquer implementação de descarte dessas categorias.

| Categoria | Finalidade | Dados mínimos propostos | Prazo proposto / início da contagem |
| --- | --- | --- | --- |
| Pedidos de exclusão | Evidenciar o recebimento e atendimento de um pedido e responder a eventual contestação | Referência aleatória do pedido; datas de recebimento e conclusão; resultado; etapas concluídas e códigos técnicos necessários. Pseudônimo sem nome, e-mail ou vínculo direto com a conta; não preservar justificativa livre ou cópias do perfil | Até 5 anos após conclusão do atendimento; pedidos ainda pendentes precisam ser resolvidos, não eliminados pelo simples decurso do prazo |
| Auditoria de segurança | Investigar incidentes e proteger o serviço | Data, tipo de evento, resultado, referência pseudonimizada do agente/recurso quando necessária e código técnico. Evitar cópias integrais de valores antigos/novos, segredos, conteúdo pessoal e justificativas livres | Até 1 ano desde cada evento; retenção excepcional somente com justificativa específica documentada |
| E-mails transacionais | Comprovar o envio e investigar falhas em comunicações esperadas pelo destinatário | Identificador da mensagem, finalidade/modelo, datas, estado de envio e entrega quando disponível, código de erro sanitizado; destinatário pseudonimizado quando o endereço não for necessário. Não manter corpo completo, tokens ou links privados nos registros de histórico | Até 1 ano desde o envio ou tentativa; mensagens ainda em processamento seguem os prazos operacionais da fila |

## Pseudonimização e acesso

Pseudonimização não equivale a anonimização: se existir possibilidade de religação, a evidência continua sendo dado pessoal. Usar referências aleatórias ou mecanismo criptográfico controlado; nunca hash simples de e-mail. Eventual chave de associação fica separada, com acesso estritamente necessário e prazo justificado. Acesso limitado a responsáveis autorizados pelo atendimento, segurança ou operação de e-mails, não a membros comuns de grupos. Registrar consultas administrativas quando necessário, sem reproduzir os dados consultados.

## Procedimento de descarte a aprovar

1. Inventariar campos efetivamente armazenados e locais de cópia, inclusive fila, fornecedor e backups; identificar excessos antes de implementar minimização.
2. Produzir simulação somente leitura dos registros elegíveis, usando os marcos acima; separar pedidos pendentes e eventual preservação excepcional com justificativa, responsável e revisão de término.
3. Submeter escopo, amostra sanitizada, plano de recuperação, pseudonimização e rotina ao proprietário para aprovação específica; nenhuma aprovação é presumida nesta etapa.
4. Após aprovação, minimizar/pseudonimizar as evidências ainda necessárias e eliminar irreversivelmente os registros vencidos e associações desnecessárias, incluindo cópias operacionais sob controle do app. Não modificar partidas, rankings ou histórico esportivo nessa rotina.
5. Guardar apenas comprovante agregado do descarte (categoria, período, quantidade, data e responsável), sem conteúdo pessoal eliminado.
6. Backups expiram conforme sua política operacional; documentar essa janela e reaplicar descartes após restauração. Não prometer remoção imediata de cópias imutáveis nem retenção igual no provedor sem confirmação.
7. Verificar resultados, acesso restrito, recuperação e ausência de conteúdo excessivo antes de habilitar uma execução periódica aprovada.

## Diferença entre proposta e operação atual

Os registros existentes podem conter identificadores diretos, campos livres, valores antigos/novos ou metadados adicionais. Esta documentação não atesta que já foram minimizados ou pseudonimizados. A fila de e-mails precisa temporariamente do conteúdo para enviar e repetir tentativas; seu histórico deve preferir metadados. Entrega ao destinatário não é comprovada apenas pelo estado de aceitação do provedor.

A rotina já existente de 90 dias para registros operacionais de push e diagnóstico não é ampliada por esta proposta. Pedidos de exclusão, auditoria e histórico de e-mails permanecem fora de novas rotinas até aprovação específica.