
-- Ajusta as datas/versões das entradas de bug report para ANTES do changelog público
UPDATE release_notes
SET version = 'v0.26.3', released_at = '2026-04-19 02:30:00+00'
WHERE version = 'v0.27.0' AND title = 'Reportar bugs no app';

UPDATE release_notes
SET version = 'v0.26.4', released_at = '2026-04-19 02:45:00+00'
WHERE version = 'v0.28.0' AND title = 'Vote nos bugs da comunidade';

-- Adiciona as 3 últimas implementações reais (hoje)
INSERT INTO release_notes (version, type, title, description, released_at, is_published) VALUES
('v0.27.0', 'feature', 'Página completa de changelog', 'Nova página dedicada com todo o histórico de atualizações desde o início do projeto, organizada por mês e em formato condensado.', '2026-04-19 03:30:00+00', true),
('v0.27.1', 'feature', 'Filtro de prioridade no painel admin', 'Admins podem filtrar bugs por prioridade (baixa, média, alta, crítica) e alterar a prioridade de cada report direto pelo painel.', '2026-04-19 03:45:00+00', true),
('v0.27.2', 'improvement', 'Botão Triagem só para admins', 'O link para o painel admin de bugs agora só aparece para usuários autorizados.', '2026-04-19 03:50:00+00', true),
('v0.27.3', 'feature', 'Busca no changelog', 'Campo de busca por palavra-chave no /changelog, filtrando por título, descrição e versão em todas as entradas.', '2026-04-19 04:15:00+00', true);
