-- 1) Tagline personalizada do jogador (aparece como subtítulo no card OG)
alter table public.user_profiles
  add column if not exists share_tagline text;

-- Limita a 60 caracteres via validação (trigger, não CHECK, para flexibilidade futura)
create or replace function public.validate_share_tagline()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.share_tagline is not null then
    new.share_tagline := nullif(trim(new.share_tagline), '');
    if new.share_tagline is not null and length(new.share_tagline) > 60 then
      raise exception 'share_tagline cannot exceed 60 characters';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_share_tagline on public.user_profiles;
create trigger trg_validate_share_tagline
before insert or update of share_tagline on public.user_profiles
for each row execute function public.validate_share_tagline();

-- 2) Eventos de renderização da OG (para painel hit-rate)
create table if not exists public.og_render_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,           -- jogador alvo da OG
  status text not null check (status in ('HIT','MISS')),
  created_at timestamptz not null default now()
);

create index if not exists idx_og_render_events_created_at
  on public.og_render_events (created_at desc);
create index if not exists idx_og_render_events_user_id
  on public.og_render_events (user_id);

alter table public.og_render_events enable row level security;

-- Apenas criadores de algum grupo podem ler estatísticas
drop policy if exists "Group creators can read og render events" on public.og_render_events;
create policy "Group creators can read og render events"
on public.og_render_events for select
to authenticated
using (
  exists (
    select 1 from public.group_members gm
    where gm.user_id = auth.uid() and gm.role = 'creator' and gm.status = 'active'
  )
);

-- Sem políticas de insert/update/delete: somente service_role (servidor) escreve.