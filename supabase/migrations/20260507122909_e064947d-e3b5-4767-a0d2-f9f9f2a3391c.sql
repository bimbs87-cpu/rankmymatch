-- Fix incorrect dates on the most recent batch (they were lumped on 2026-04-26 by mistake)
UPDATE public.release_notes SET released_at = '2026-05-06 18:00:00+00' WHERE version = 'v0.34.1';
UPDATE public.release_notes SET released_at = '2026-05-06 17:30:00+00' WHERE version = 'v0.34.0';
UPDATE public.release_notes SET released_at = '2026-05-05 21:00:00+00' WHERE version = 'v0.33.5';
UPDATE public.release_notes SET released_at = '2026-05-05 20:30:00+00' WHERE version = 'v0.33.4';
UPDATE public.release_notes SET released_at = '2026-05-05 20:00:00+00' WHERE version = 'v0.33.3';

INSERT INTO public.release_notes (version, title, description, type, released_at) VALUES
('v0.35.0', 'Partidas avulsas', 'Registre jogos com qualquer pessoa fora dos grupos — 1x1 ou 2x2, com nova rota /partidas-avulsas e estatísticas próprias.', 'feature', '2026-05-06 22:00:00+00'),
('v0.35.1', 'Sets dinâmicos nas partidas avulsas', 'Cada set pode ter duplas diferentes — escolha os jogadores set a set em vez de fixar a formação.', 'improvement', '2026-05-06 22:30:00+00'),
('v0.35.2', 'Vincular jogadores avulsos a usuários', 'Ao registrar uma partida avulsa, busque e vincule jogadores existentes do app aos seus contatos.', 'feature', '2026-05-06 23:00:00+00'),
('v0.35.3', 'Avulsas nos últimos resultados', 'Partidas avulsas registradas agora aparecem no feed de últimos resultados da Home.', 'improvement', '2026-05-06 23:15:00+00'),
('v0.35.4', 'Editar partida avulsa', 'Botão de salvar mostra a contagem de sets para evitar erros, e cada partida avulsa pode ser editada depois.', 'improvement', '2026-05-07 00:30:00+00'),
('v0.35.5', 'Grupos do usuário no /dev', 'A lista de cadastros agora mostra todos os grupos de cada usuário, com selo de criador, admin e membro.', 'improvement', '2026-05-07 01:00:00+00'),
('v0.35.6', 'Cancelar rodada com modal sólido', 'Modal de cancelamento agora tem fundo opaco — sem mais transparência confusa.', 'fix', '2026-05-07 11:00:00+00'),
('v0.35.7', 'Botão Registrar partida avulsa na Home', 'Atalho dedicado na tela inicial, abaixo do botão de criar/entrar em grupo.', 'improvement', '2026-05-07 11:15:00+00'),
('v0.35.8', 'Confirmação sem duplicidade na agenda', 'Removidos os botões duplicados de "Vou / Não vou" na rodada em destaque da agenda.', 'fix', '2026-05-07 11:30:00+00'),
('v0.35.9', 'Sincronização de presença entre telas', 'Ao confirmar/recusar na Home, a tela de agenda já reflete o status correto sem precisar recarregar.', 'fix', '2026-05-07 11:35:00+00'),
('v0.35.10', 'Acesso /dev no menu do desenvolvedor', 'O painel /dev agora aparece no menu do perfil apenas para o desenvolvedor.', 'improvement', '2026-05-07 11:40:00+00'),
('v0.35.11', 'Renomear qualquer atleta (dev)', 'Apenas o desenvolvedor pode renomear membros ativos em qualquer grupo — admins comuns mantêm a permissão antiga.', 'feature', '2026-05-07 11:45:00+00');