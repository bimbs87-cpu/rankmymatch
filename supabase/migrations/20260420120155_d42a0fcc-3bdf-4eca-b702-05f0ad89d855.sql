INSERT INTO public.release_notes (version, title, description, type, released_at, is_published) VALUES
  ('v0.28.2', 'Painel admin para o changelog', 'Agora dá pra publicar entradas do changelog direto pela UI, sem SQL manual.', 'feature', now(), true),
  ('v0.28.2', 'Popover de Grupos com fundo sólido', 'Corrigido o popover do menu Grupos no desktop que estava sobrepondo a tela.', 'fix', now(), true),
  ('v0.28.2', 'Error boundary granular no menu de Grupos', 'Erros isolados no menu não derrubam mais a página inteira.', 'improvement', now(), true),
  ('v0.28.2', 'Tooltip com tempo de confirmação', 'O ícone de presença na próxima rodada agora mostra "Confirmado por você há X".', 'improvement', now(), true),
  ('v0.28.2', 'Chip de próxima rodada clicável', 'No menu Grupos do BottomNav (1 grupo), o chip de próxima rodada agora vai direto pra rodada.', 'improvement', now(), true),
  ('v0.28.2', 'Cache de pendências admin', 'Cache local de 30s reduz a piscada de skeleton ao navegar entre páginas.', 'improvement', now(), true);