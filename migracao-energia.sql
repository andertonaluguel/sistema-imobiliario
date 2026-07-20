-- ============================================================
-- MIGRAÇÃO — Energia solar (segunda receita por casa/mês)
-- Rode UMA vez no SQL Editor do Supabase. É idempotente:
-- pode rodar de novo sem apagar nada nem duplicar.
-- ============================================================

create extension if not exists "pgcrypto";

-- Tabela de energia: um registro por casa/mês, valor variável.
create table if not exists public.energia (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  imovel_id       uuid not null references public.imoveis(id) on delete cascade,
  mes             text not null,                          -- 'YYYY-MM'
  valor           numeric(12,2) default 0,                -- R$ cobrado no mês
  kwh             numeric(12,2) default 0,                -- consumo do mês
  pago            boolean default false,
  data_pagamento  date,
  created_at      timestamptz default now(),
  unique (imovel_id, mes)
);

create index if not exists idx_energia_imovel on public.energia(imovel_id);
create index if not exists idx_energia_user   on public.energia(user_id);

-- Row Level Security: cada usuário só enxerga/altera os próprios registros.
alter table public.energia enable row level security;
drop policy if exists own_rows on public.energia;
create policy own_rows on public.energia for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Pronto. A tabela de energia está criada e protegida por RLS.
