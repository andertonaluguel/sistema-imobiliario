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
  status          text not null default 'vaga' check (status in ('alugada','vaga','manutencao')),
  aluguel_valor   numeric(12,2) default 0 check (aluguel_valor >= 0),
  dia_vencimento  int default 5 check (dia_vencimento between 1 and 31),
  ultima_vistoria date,
  tenant_id       uuid references public.inquilinos(id) on delete set null,
  contrato_inicio date,
  contrato_fim    date,
  quartos         int not null default 0 check (quartos >= 0),
  banheiros       int not null default 0 check (banheiros >= 0),
  garagem         boolean not null default false,
  quintal         boolean not null default false,
  poco_agua       boolean not null default false,
  energia_ativa   boolean not null default true,
  energia_dia_vencimento int not null default 5 check (energia_dia_vencimento between 1 and 31),
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
  mes             text not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  valor_pago      numeric(12,2) default 0 check (valor_pago >= 0),
  data_pagamento  date,
  created_at      timestamptz default now()
);

-- ------------------------------------------------------------
-- ENERGIA SOLAR  (segunda receita; um registro por casa/mês, valor variável)
-- ------------------------------------------------------------
create table if not exists public.energia (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  imovel_id       uuid not null references public.imoveis(id) on delete cascade,
  mes             text not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  valor           numeric(12,2) default 0 check (valor >= 0),
  kwh             numeric(12,2) default 0 check (kwh >= 0),
  leitura_anterior numeric(14,2) not null default 0 check (leitura_anterior >= 0),
  leitura_atual   numeric(14,2) not null default 0 check (leitura_atual >= 0),
  tarifa_kwh      numeric(14,4) not null default 0 check (tarifa_kwh >= 0),
  acrescimos      numeric(12,2) not null default 0 check (acrescimos >= 0),
  descontos       numeric(12,2) not null default 0 check (descontos >= 0),
  ajuste_descricao text not null default '',
  valor_calculado numeric(12,2) not null default 0,
  valor_manual    boolean not null default false,
  vencimento      date,
  foto_path       text,
  pago            boolean default false,
  data_pagamento  date,
  created_at      timestamptz default now()
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
  valor           numeric(12,2) default 0 check (valor >= 0),
  data            date,
  prestador       text default '',
  status          text default 'Concluído' check (status in ('Aberto','Orçamento','Concluído')),
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
  status          text not null check (status in ('alugada','vaga','manutencao')),
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
  dia_vencimento  int not null default 5 check (dia_vencimento between 1 and 31),
  modalidade_vencimento text not null default 'fixo' check (modalidade_vencimento in ('entrada','fixo')),
  proporcional_dias int not null default 0,
  proporcional_valor numeric(12,2) not null default 0,
  proporcional_pago boolean not null default false,
  proporcional_data_pagamento date,
  ativo           boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table public.pagamentos add column if not exists contrato_id uuid references public.contratos(id) on delete set null;
alter table public.energia add column if not exists contrato_id uuid references public.contratos(id) on delete set null;
do $$
begin
  if not exists(select 1 from pg_constraint where conname='pagamentos_contrato_mes_key') then
    alter table public.pagamentos add constraint pagamentos_contrato_mes_key unique(contrato_id,mes);
  end if;
  if not exists(select 1 from pg_constraint where conname='energia_contrato_mes_key') then
    alter table public.energia add constraint energia_contrato_mes_key unique(contrato_id,mes);
  end if;
end $$;

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
  energia_ativa      boolean not null default true,
  updated_at         timestamptz default now()
);

create table if not exists public.interessados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  telefone text not null default '',
  valor_maximo numeric(12,2) not null default 0 check(valor_maximo>=0),
  quartos_min int not null default 0 check(quartos_min>=0),
  banheiros_min int not null default 0 check(banheiros_min>=0),
  precisa_garagem boolean not null default false,
  precisa_quintal boolean not null default false,
  interessa_poco boolean not null default false,
  observacoes text not null default '',
  status text not null default 'novo' check(status in ('novo','conversando','visita','quente','fechado','desistiu')),
  inquilino_id uuid references public.inquilinos(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- ALUGUEL_HISTORICO  (reajustes: valor do aluguel ao longo do tempo)
-- ------------------------------------------------------------
create table if not exists public.aluguel_historico (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  imovel_id    uuid not null references public.imoveis(id) on delete cascade,
  valor        numeric not null default 0 check (valor >= 0),
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
  criado_em    timestamptz default now(),
  dia          date not null default (timezone('America/Sao_Paulo', now()))::date,
  unique (user_id, dia)
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
create index if not exists idx_energia_user      on public.energia(user_id);
create index if not exists idx_desp_imovel       on public.despesas(imovel_id);
create index if not exists idx_hist_imovel       on public.historico_status(imovel_id);
create index if not exists idx_fotos_imovel      on public.fotos(imovel_id);
create index if not exists idx_docs_imovel       on public.documentos(imovel_id);
create index if not exists idx_eventos_user      on public.eventos(user_id);
create index if not exists idx_interessados_user on public.interessados(user_id);

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
    'aluguel_historico','backups','interessados'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists own_rows on public.%I;', t);
    execute format(
      'create policy own_rows on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid());', t);
  end loop;
end $$;

-- ============================================================
-- IMPORTAÇÃO / RESTAURAÇÃO ATÔMICA
-- Todas as etapas acontecem na mesma transação. Se uma linha falhar,
-- o PostgreSQL desfaz tudo e preserva os dados anteriores.
-- ============================================================
create or replace function public.importar_backup_atomico(
  p_payload jsonb,
  p_substituir boolean default false
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado.';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Backup inválido.';
  end if;

  -- Limites também no servidor, mesmo que alguém ignore a validação do app.
  if jsonb_array_length(coalesce(p_payload->'houses','[]'::jsonb)) > 500
     or jsonb_array_length(coalesce(p_payload->'tenants','[]'::jsonb)) > 2000
     or jsonb_array_length(coalesce(p_payload->'payments','[]'::jsonb)) > 50000 then
    raise exception 'Backup acima do limite permitido.';
  end if;

  if p_substituir then
    delete from public.fotos             where user_id = v_uid;
    delete from public.pagamentos        where user_id = v_uid;
    delete from public.energia           where user_id = v_uid;
    delete from public.despesas          where user_id = v_uid;
    delete from public.historico_status  where user_id = v_uid;
    delete from public.aluguel_historico where user_id = v_uid;
    delete from public.documentos        where user_id = v_uid;
    delete from public.contratos         where user_id = v_uid;
    delete from public.eventos           where user_id = v_uid;
    delete from public.imoveis           where user_id = v_uid;
    delete from public.inquilinos        where user_id = v_uid;
  end if;

  insert into public.inquilinos
    (id,user_id,nome,telefone,email,documento,emergencia_nome)
  select x.id,v_uid,x.nome,coalesce(x.telefone,''),coalesce(x.email,''),
         coalesce(x.documento,''),coalesce(x.emergencia_nome,'')
  from jsonb_to_recordset(coalesce(p_payload->'tenants','[]'::jsonb)) as x(
    id uuid, nome text, telefone text, email text, documento text, emergencia_nome text
  );

  insert into public.imoveis
    (id,user_id,nome,endereco,status,aluguel_valor,dia_vencimento,ultima_vistoria,
     tenant_id,contrato_inicio,contrato_fim)
  select x.id,v_uid,x.nome,coalesce(x.endereco,''),x.status,x.aluguel_valor,
         x.dia_vencimento,x.ultima_vistoria,x.tenant_id,x.contrato_inicio,x.contrato_fim
  from jsonb_to_recordset(coalesce(p_payload->'houses','[]'::jsonb)) as x(
    id uuid, nome text, endereco text, status text, aluguel_valor numeric,
    dia_vencimento int, ultima_vistoria date, tenant_id uuid,
    contrato_inicio date, contrato_fim date
  );

  insert into public.pagamentos
    (user_id,imovel_id,mes,valor_pago,data_pagamento)
  select v_uid,x.imovel_id,x.mes,x.valor_pago,x.data_pagamento
  from jsonb_to_recordset(coalesce(p_payload->'payments','[]'::jsonb)) as x(
    imovel_id uuid, mes text, valor_pago numeric, data_pagamento date
  );

  insert into public.energia
    (user_id,imovel_id,mes,valor,kwh,pago,data_pagamento)
  select v_uid,x.imovel_id,x.mes,x.valor,x.kwh,x.pago,x.data_pagamento
  from jsonb_to_recordset(coalesce(p_payload->'energy','[]'::jsonb)) as x(
    imovel_id uuid, mes text, valor numeric, kwh numeric, pago boolean, data_pagamento date
  );

  insert into public.despesas
    (user_id,imovel_id,descricao,categoria,valor,data,prestador,status)
  select v_uid,x.imovel_id,x.descricao,x.categoria,x.valor,x.data,
         coalesce(x.prestador,''),x.status
  from jsonb_to_recordset(coalesce(p_payload->'expenses','[]'::jsonb)) as x(
    imovel_id uuid, descricao text, categoria text, valor numeric,
    data date, prestador text, status text
  );

  insert into public.historico_status
    (user_id,imovel_id,data,status,tenant_id)
  select v_uid,x.imovel_id,x.data,x.status,x.tenant_id
  from jsonb_to_recordset(coalesce(p_payload->'history','[]'::jsonb)) as x(
    imovel_id uuid, data date, status text, tenant_id uuid
  );

  insert into public.aluguel_historico
    (user_id,imovel_id,valor,data_inicio)
  select v_uid,x.imovel_id,x.valor,x.data_inicio
  from jsonb_to_recordset(coalesce(p_payload->'adjustments','[]'::jsonb)) as x(
    imovel_id uuid, valor numeric, data_inicio date
  );

  insert into public.fotos
    (user_id,imovel_id,dados,ordem)
  select v_uid,x.imovel_id,x.dados,x.ordem
  from jsonb_to_recordset(coalesce(p_payload->'photos','[]'::jsonb)) as x(
    imovel_id uuid, dados text, ordem int
  );

  insert into public.eventos
    (user_id,data,texto)
  select v_uid,x.data,coalesce(x.texto,'')
  from jsonb_to_recordset(coalesce(p_payload->'events','[]'::jsonb)) as x(
    data date, texto text
  );

  if jsonb_typeof(p_payload->'config') = 'object' then
    insert into public.configuracoes(user_id,locador_nome,locador_documento,updated_at)
    values (
      v_uid,
      coalesce(p_payload#>>'{config,locador_nome}',''),
      coalesce(p_payload#>>'{config,locador_documento}',''),
      now()
    )
    on conflict (user_id) do update set
      locador_nome = excluded.locador_nome,
      locador_documento = excluded.locador_documento,
      updated_at = now();
  end if;
end;
$$;

revoke all on function public.importar_backup_atomico(jsonb,boolean) from public, anon;
grant execute on function public.importar_backup_atomico(jsonb,boolean) to authenticated;

-- Pronto. Tabelas protegidas e importações/restaurações transacionais.
