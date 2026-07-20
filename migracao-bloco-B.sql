-- ============================================================
-- Aluguel — Migração do Bloco B
-- Rode UMA vez no SQL Editor do Supabase (você já tem o schema).
-- Cria: histórico de valor do aluguel e backups automáticos.
-- É idempotente: pode rodar de novo sem dar erro.
-- ============================================================

-- Histórico do valor do aluguel (reajustes)
create table if not exists public.aluguel_historico (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  imovel_id    uuid not null references public.imoveis(id) on delete cascade,
  valor        numeric not null default 0,
  data_inicio  date not null,
  created_at   timestamptz default now()
);

-- Backups automáticos (um retrato dos dados por dia)
create table if not exists public.backups (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dados        jsonb not null,
  criado_em    timestamptz default now()
);

create index if not exists idx_aluguel_historico_user   on public.aluguel_historico(user_id);
create index if not exists idx_aluguel_historico_imovel on public.aluguel_historico(imovel_id);
create index if not exists idx_backups_user             on public.backups(user_id);

-- RLS: cada usuário só acessa as próprias linhas
do $$
declare t text;
begin
  foreach t in array array['aluguel_historico','backups']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists own_rows on public.%I;', t);
    execute format(
      'create policy own_rows on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid());', t);
  end loop;
end $$;

-- Pronto. Histórico de aluguel e backups prontos e protegidos por RLS.
