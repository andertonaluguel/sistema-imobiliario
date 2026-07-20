-- ============================================================
-- TALÃO — Esquema do banco (Supabase / PostgreSQL)
-- Rode este arquivo UMA vez no SQL Editor do seu projeto Supabase.
-- Tudo é isolado por usuário via Row Level Security (RLS):
-- cada pessoa só enxerga e altera os próprios dados.
-- ============================================================

-- gen_random_uuid() para gerar IDs
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- INQUILINOS  (cadastro central, reutilizável entre casas)
-- ------------------------------------------------------------
create table if not exists public.inquilinos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome            text not null,
  telefone        text default '',
  email           text default '',
  documento       text default '',
  emergencia_nome text default '',
  created_at      timestamptz default now()
);

-- ------------------------------------------------------------
-- IMÓVEIS / CASAS
-- ------------------------------------------------------------
create table if not exists public.imoveis (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome            text not null,
  endereco        text default '',
  status          text not null default 'vaga',         -- 'alugada' | 'vaga' | 'manutencao'
  aluguel_valor   numeric(12,2) default 0,
  dia_vencimento  int default 5,
  ultima_vistoria date,
  tenant_id       uuid references public.inquilinos(id) on delete set null,
  contrato_inicio date,
  contrato_fim    date,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ------------------------------------------------------------
-- PAGAMENTOS  (um por casa/mês)
-- ------------------------------------------------------------
create table if not exists public.pagamentos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  imovel_id       uuid not null references public.imoveis(id) on delete cascade,
  mes             text not null,                          -- 'YYYY-MM'
  valor_pago      numeric(12,2) default 0,
  data_pagamento  date,
  created_at      timestamptz default now(),
  unique (imovel_id, mes)
);

-- ------------------------------------------------------------
-- ENERGIA SOLAR  (segunda receita; um registro por casa/mês, valor variável)
-- ------------------------------------------------------------
create table if not exists public.energia (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  imovel_id       uuid not null references public.imoveis(id) on delete cascade,
  mes             text not null,                          -- 'YYYY-MM'
  valor           numeric(12,2) default 0,                -- R$ cobrado do inquilino no mês
  kwh             numeric(12,2) default 0,                -- consumo do mês
  pago            boolean default false,
  data_pagamento  date,
  created_at      timestamptz default now(),
  unique (imovel_id, mes)
);

-- ------------------------------------------------------------
-- DESPESAS / MANUTENÇÃO
-- ------------------------------------------------------------
create table if not exists public.despesas (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  imovel_id       uuid not null references public.imoveis(id) on delete cascade,
  descricao       text not null,
  categoria       text default 'Outro',
  valor           numeric(12,2) default 0,
  data            date,
  prestador       text default '',
  status          text default 'Concluído',               -- 'Aberto' | 'Orçamento' | 'Concluído'
  created_at      timestamptz default now()
);

-- ------------------------------------------------------------
-- HISTÓRICO DE STATUS  (linha do tempo: vaga/alugada/manutenção)
-- Alimenta o relatório anual (dias vago, períodos de contrato...)
-- ------------------------------------------------------------
create table if not exists public.historico_status (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  imovel_id       uuid not null references public.imoveis(id) on delete cascade,
  data            date not null,
  status          text not null,
  tenant_id       uuid references public.inquilinos(id) on delete set null,
  created_at      timestamptz default now()
);

-- ------------------------------------------------------------
-- FOTOS  (base64 no próprio banco, conforme escolhido)
-- ------------------------------------------------------------
create table if not exists public.fotos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  imovel_id       uuid not null references public.imoveis(id) on delete cascade,
  dados           text not null,                          -- dataURL JPEG comprimido
  ordem           int default 0,
  created_at      timestamptz default now()
);

-- ------------------------------------------------------------
-- CONTRATOS  (estrutura pronta — módulo entra na Fase 2)
-- ------------------------------------------------------------
create table if not exists public.contratos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  imovel_id       uuid references public.imoveis(id) on delete cascade,
  tenant_id       uuid references public.inquilinos(id) on delete set null,
  inicio          date,
  fim             date,
  valor           numeric(12,2) default 0,
  ativo           boolean default true,
  created_at      timestamptz default now()
);

-- ------------------------------------------------------------
-- DOCUMENTOS  (base64 — módulo entra na Fase 2)
-- ------------------------------------------------------------
create table if not exists public.documentos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  imovel_id       uuid references public.imoveis(id) on delete cascade,
  inquilino_id    uuid references public.inquilinos(id) on delete cascade,
  tipo            text default '',                        -- 'contrato' | 'rg' | 'cpf' | 'comprovante' | ...
  nome            text default '',
  mime            text default '',
  dados           text not null,                          -- dataURL (PDF/imagem)
  created_at      timestamptz default now()
);

-- ------------------------------------------------------------
-- EVENTOS DO CALENDÁRIO  (estrutura pronta — Calendário entra na Fase 2)
-- ------------------------------------------------------------
create table if not exists public.eventos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data            date not null,
  texto           text default '',
  created_at      timestamptz default now()
);

-- ------------------------------------------------------------
-- CONFIGURAÇÕES  (dados do locador p/ recibos — 1 linha por usuário)
-- ------------------------------------------------------------
create table if not exists public.configuracoes (
  user_id            uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  locador_nome       text default '',
  locador_documento  text default '',
  updated_at         timestamptz default now()
);

-- ------------------------------------------------------------
-- ALUGUEL_HISTORICO  (reajustes: valor do aluguel ao longo do tempo)
-- ------------------------------------------------------------
create table if not exists public.aluguel_historico (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  imovel_id    uuid not null references public.imoveis(id) on delete cascade,
  valor        numeric not null default 0,
  data_inicio  date not null,
  created_at   timestamptz default now()
);

-- ------------------------------------------------------------
-- BACKUPS  (retrato diário dos dados, p/ restauração)
-- ------------------------------------------------------------
create table if not exists public.backups (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dados        jsonb not null,
  criado_em    timestamptz default now()
);

-- ------------------------------------------------------------
-- ÍNDICES (consultas por usuário e por imóvel)
-- ------------------------------------------------------------
create index if not exists idx_aluguel_historico_user   on public.aluguel_historico(user_id);
create index if not exists idx_aluguel_historico_imovel on public.aluguel_historico(imovel_id);
create index if not exists idx_backups_user             on public.backups(user_id);
create index if not exists idx_imoveis_user      on public.imoveis(user_id);
create index if not exists idx_inquilinos_user   on public.inquilinos(user_id);
create index if not exists idx_pag_imovel        on public.pagamentos(imovel_id);
create index if not exists idx_energia_imovel    on public.energia(imovel_id);
create index if not exists idx_desp_imovel       on public.despesas(imovel_id);
create index if not exists idx_hist_imovel       on public.historico_status(imovel_id);
create index if not exists idx_fotos_imovel      on public.fotos(imovel_id);
create index if not exists idx_docs_imovel       on public.documentos(imovel_id);
create index if not exists idx_eventos_user      on public.eventos(user_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- Habilita RLS e cria uma política única por tabela:
-- o usuário autenticado só acessa linhas onde user_id = auth.uid()
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'inquilinos','imoveis','pagamentos','energia','despesas','historico_status',
    'fotos','contratos','documentos','eventos','configuracoes',
    'aluguel_historico','backups'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists own_rows on public.%I;', t);
    execute format(
      'create policy own_rows on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid());', t);
  end loop;
end $$;

-- Pronto. Tabelas criadas e protegidas por RLS.
