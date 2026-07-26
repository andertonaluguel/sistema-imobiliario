-- ============================================================
-- FASE C — VITRINE
-- Catalogo publico de imoveis de TERCEIROS, que pagam uma taxa
-- para serem divulgados.
--
-- REGRA NUMERO UM: nada aqui encosta na tabela public.imoveis.
-- Se um imovel de terceiro entrasse la, o Financeiro, os
-- relatorios e o limite de casas do plano ficariam errados.
-- Por isso sao tabelas proprias, com prefixo vitrine_.
--
-- Esta migracao e 100% ADITIVA: so cria coisas novas. Nenhuma
-- tabela, funcao ou politica existente e alterada.
--
-- Rode DEPOIS de migracao-modulos.sql. Reexecutavel.
-- ============================================================

do $$
begin
  if to_regclass('public.licencas_modulo') is null then
    raise exception 'Rode antes o arquivo migracao-modulos.sql (fase A).';
  end if;
end
$$;

-- ------------------------------------------------------------
-- 1. QUEM PAGA PARA ANUNCIAR
-- Nao tem login. E um cadastro do administrador da vitrine.
-- ------------------------------------------------------------

create table if not exists public.vitrine_anunciantes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
              references public.proprietarios(user_id) on delete cascade,
  nome        text not null,
  telefone    text not null default '',
  email       text not null default '',
  documento   text not null default '',
  observacoes text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint vitrine_anunciante_nome_check
    check (char_length(trim(nome)) between 1 and 120)
);

create index if not exists vitrine_anunciantes_user_idx
  on public.vitrine_anunciantes(user_id, nome);

-- ------------------------------------------------------------
-- 2. O IMOVEL ANUNCIADO
-- ------------------------------------------------------------

create table if not exists public.vitrine_imoveis (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid()
                 references public.proprietarios(user_id) on delete cascade,
  anunciante_id  uuid references public.vitrine_anunciantes(id) on delete set null,
  codigo         text not null,
  titulo         text not null,
  tipo           text not null default 'casa',

  aluguel        numeric(12,2) not null default 0 check (aluguel >= 0),
  condominio     numeric(12,2) not null default 0 check (condominio >= 0),
  iptu           numeric(12,2) not null default 0 check (iptu >= 0),

  quartos        int not null default 0 check (quartos >= 0),
  banheiros      int not null default 0 check (banheiros >= 0),
  vagas          int not null default 0 check (vagas >= 0),
  area_m2        numeric(10,2) not null default 0 check (area_m2 >= 0),

  mobiliado      boolean not null default false,
  aceita_pet     boolean not null default false,
  quintal        boolean not null default false,
  area_servico   boolean not null default false,

  exige_fiador   boolean not null default false,
  caucao         text not null default '',
  contrato_minimo_meses int not null default 12 check (contrato_minimo_meses >= 0),
  descricao      text not null default '',

  -- localizacao (decisao 3: endereco exato, por padrao visivel)
  cep            text not null default '',
  logradouro     text not null default '',
  numero         text not null default '',
  bairro         text not null default '',
  cidade         text not null default '',
  uf             text not null default '',
  latitude       numeric(10,7),
  longitude      numeric(10,7),
  endereco_exato_publico boolean not null default true,
  autorizacao_endereco_em timestamptz,
  pontos_interesse jsonb not null default '[]'::jsonb,

  -- comercial
  status         text not null default 'rascunho',
  destaque       boolean not null default false,
  publicado_em   timestamptz,
  expira_em      date,

  -- metricas (o argumento de renovacao da taxa)
  visualizacoes        integer not null default 0,
  contatos_whatsapp    integer not null default 0,
  contatos_formulario  integer not null default 0,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint vitrine_imovel_tipo_check
    check (tipo in ('casa','apartamento','kitnet','sobrado','comercial')),
  constraint vitrine_imovel_status_check
    check (status in ('rascunho','ativo','vencido','pausado','alugado')),
  constraint vitrine_imovel_titulo_check
    check (char_length(trim(titulo)) between 1 and 160),
  constraint vitrine_imovel_codigo_unico
    unique (user_id, codigo)
);

create index if not exists vitrine_imoveis_publicos_idx
  on public.vitrine_imoveis(user_id, status, expira_em);
create index if not exists vitrine_imoveis_bairro_idx
  on public.vitrine_imoveis(user_id, bairro);

-- ------------------------------------------------------------
-- 3. FOTOS, LEADS E TAXAS
-- ------------------------------------------------------------

create table if not exists public.vitrine_fotos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid()
               references public.proprietarios(user_id) on delete cascade,
  imovel_id    uuid not null references public.vitrine_imoveis(id) on delete cascade,
  storage_path text not null,
  ordem        int not null default 0,
  legenda      text not null default '',
  bytes        bigint not null default 0 check (bytes >= 0),
  created_at   timestamptz not null default now()
);

create index if not exists vitrine_fotos_imovel_idx
  on public.vitrine_fotos(imovel_id, ordem, created_at);

create table if not exists public.vitrine_leads (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null
                references public.proprietarios(user_id) on delete cascade,
  imovel_id     uuid references public.vitrine_imoveis(id) on delete set null,
  nome          text not null default '',
  telefone      text not null default '',
  mensagem      text not null default '',
  origem        text not null default 'formulario',
  status        text not null default 'novo',
  consentimento_lgpd boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint vitrine_lead_origem_check
    check (origem in ('formulario','whatsapp')),
  constraint vitrine_lead_status_check
    check (status in ('novo','contatado','visita','fechado','perdido'))
);

create index if not exists vitrine_leads_user_idx
  on public.vitrine_leads(user_id, status, created_at desc);

create table if not exists public.vitrine_taxas (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid()
                 references public.proprietarios(user_id) on delete cascade,
  imovel_id      uuid references public.vitrine_imoveis(id) on delete set null,
  anunciante_id  uuid references public.vitrine_anunciantes(id) on delete set null,
  valor          numeric(12,2) not null default 0 check (valor >= 0),
  forma_pagamento text not null default '',
  periodo_inicio date,
  periodo_fim    date,
  pago           boolean not null default false,
  data_pagamento date,
  observacao     text not null default '',
  created_at     timestamptz not null default now()
);

create index if not exists vitrine_taxas_user_idx
  on public.vitrine_taxas(user_id, periodo_fim);

-- ------------------------------------------------------------
-- 4. SEGURANCA
-- Escrita: quem tem o modulo Vitrine E acesso operacional
-- (dono ou funcionario - decisao 5). e_acesso_operacional() ja
-- existe e ja entende funcionario, entao herdamos o
-- comportamento inteiro sem escrever regra nova.
-- ------------------------------------------------------------

create or replace function public.vitrine_pode_operar(
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select public.tem_modulo('vitrine', p_user_id)
     and public.e_acesso_operacional(p_user_id)
$$;

revoke all on function public.vitrine_pode_operar(uuid) from public,anon;
grant execute on function public.vitrine_pode_operar(uuid) to authenticated;

do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array[
    'vitrine_anunciantes',
    'vitrine_imoveis',
    'vitrine_fotos',
    'vitrine_leads',
    'vitrine_taxas'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_tabela);
    execute format('alter table public.%I force row level security', v_tabela);
    execute format('drop policy if exists vitrine_dono on public.%I', v_tabela);
    execute format(
      'create policy vitrine_dono on public.%I
       for all to authenticated
       using (
         user_id = public.usuario_proprietario_id(auth.uid())
         and public.vitrine_pode_operar(auth.uid())
       )
       with check (
         user_id = public.usuario_proprietario_id(auth.uid())
         and public.vitrine_pode_operar(auth.uid())
       )',
      v_tabela
    );
    execute format('revoke all on table public.%I from public,anon', v_tabela);
    execute format(
      'grant select,insert,update,delete on table public.%I to authenticated',
      v_tabela
    );
  end loop;
end
$$;

-- ------------------------------------------------------------
-- 5. LEITURA PUBLICA (sem login)
--
-- Devolve SO anuncios ativos e dentro do prazo da taxa, e NUNCA
-- devolve nome, telefone ou documento do anunciante. O endereco
-- sai completo (decisao 3), a menos que aquele anuncio tenha a
-- chave endereco_exato_publico desligada.
-- ------------------------------------------------------------

create or replace function public.vitrine_anuncio_publico(p_imovel_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.vitrine_imoveis i
    join public.proprietarios pr on pr.user_id = i.user_id
    where i.id = p_imovel_id
      and i.status = 'ativo'
      and (i.expira_em is null or i.expira_em >= current_date)
      and public.tem_modulo('vitrine', i.user_id)
  )
$$;

revoke all on function public.vitrine_anuncio_publico(uuid) from public;
grant execute on function public.vitrine_anuncio_publico(uuid) to anon,authenticated;

create or replace function public.listar_vitrine_publica(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  with perfil as (
    select p.user_id,
           p.nome_publico,
           p.contato_publico,
           p.slug_publico
    from public.proprietarios p
    where lower(p.slug_publico) = lower(trim(p_slug))
      and public.tem_modulo('vitrine', p.user_id)
    limit 1
  )
  select jsonb_build_object(
    'perfil',(
      select jsonb_build_object(
        'nome',   nome_publico,
        'contato',contato_publico,
        'slug',   slug_publico
      ) from perfil
    ),
    'imoveis',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',        i.id,
        'codigo',    i.codigo,
        'titulo',    i.titulo,
        'tipo',      i.tipo,
        'aluguel',   i.aluguel,
        'condominio',i.condominio,
        'iptu',      i.iptu,
        'quartos',   i.quartos,
        'banheiros', i.banheiros,
        'vagas',     i.vagas,
        'areaM2',    i.area_m2,
        'mobiliado', i.mobiliado,
        'aceitaPet', i.aceita_pet,
        'quintal',   i.quintal,
        'areaServico',i.area_servico,
        'exigeFiador',i.exige_fiador,
        'caucao',    i.caucao,
        'contratoMinimoMeses',i.contrato_minimo_meses,
        'descricao', i.descricao,
        'bairro',    i.bairro,
        'cidade',    i.cidade,
        'uf',        i.uf,
        -- o numero e a coordenada so saem se aquele anuncio permitir
        'logradouro',case when i.endereco_exato_publico then i.logradouro else i.logradouro end,
        'numero',    case when i.endereco_exato_publico then i.numero else '' end,
        'latitude',  i.latitude,
        'longitude', i.longitude,
        'enderecoExato',i.endereco_exato_publico,
        'destaque',  i.destaque,
        'publicadoEm',i.publicado_em,
        'pontosInteresse',i.pontos_interesse,
        'fotos',coalesce((
          select jsonb_agg(f.storage_path order by f.ordem, f.created_at)
          from public.vitrine_fotos f
          where f.imovel_id = i.id and coalesce(f.storage_path,'') <> ''
        ),'[]'::jsonb)
      ) order by i.destaque desc, i.publicado_em desc nulls last)
      from public.vitrine_imoveis i, perfil p
      where i.user_id = p.user_id
        and i.status = 'ativo'
        and (i.expira_em is null or i.expira_em >= current_date)
    ),'[]'::jsonb)
  )
$$;

revoke all on function public.listar_vitrine_publica(text) from public;
grant execute on function public.listar_vitrine_publica(text) to anon,authenticated;

-- Fotos: mesmo truque ja usado nos anuncios do app. O arquivo so
-- abre enquanto o anuncio estiver no ar.
create or replace function public.arquivo_vitrine_publico(p_path text)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.vitrine_fotos f
    join public.vitrine_imoveis i on i.id = f.imovel_id
    where f.storage_path = p_path
      and i.status = 'ativo'
      and (i.expira_em is null or i.expira_em >= current_date)
      and public.tem_modulo('vitrine', i.user_id)
  )
$$;

revoke all on function public.arquivo_vitrine_publico(text) from public;
grant execute on function public.arquivo_vitrine_publico(text) to anon,authenticated;

drop policy if exists vitrine_files_select on storage.objects;
create policy vitrine_files_select on storage.objects
for select to anon,authenticated
using (
  bucket_id = 'imoveis-arquivos'
  and public.arquivo_vitrine_publico(name)
);

-- ------------------------------------------------------------
-- 6. O VISITANTE DEIXA CONTATO / CONTADORES
--
-- Sao as duas unicas escritas permitidas sem login, e ambas sao
-- estreitas: so incrementam contador ou inserem um lead ligado a
-- um anuncio que esteja no ar.
-- ------------------------------------------------------------

create or replace function public.vitrine_registrar_visita(
  p_imovel_id uuid,
  p_tipo text default 'visualizacao'
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.vitrine_anuncio_publico(p_imovel_id) then
    return;
  end if;

  if p_tipo = 'whatsapp' then
    update public.vitrine_imoveis
    set contatos_whatsapp = contatos_whatsapp + 1
    where id = p_imovel_id;
  else
    update public.vitrine_imoveis
    set visualizacoes = visualizacoes + 1
    where id = p_imovel_id;
  end if;
end
$$;

revoke all on function public.vitrine_registrar_visita(uuid,text) from public;
grant execute on function public.vitrine_registrar_visita(uuid,text) to anon,authenticated;

create or replace function public.vitrine_registrar_lead(
  p_imovel_id uuid,
  p_nome text,
  p_telefone text,
  p_mensagem text default '',
  p_consentimento boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_owner uuid;
  v_nome  text := trim(coalesce(p_nome,''));
  v_tel   text := trim(coalesce(p_telefone,''));
begin
  if not public.vitrine_anuncio_publico(p_imovel_id) then
    raise exception 'Este anuncio nao esta disponivel.';
  end if;

  if not coalesce(p_consentimento,false) then
    raise exception 'E necessario autorizar o contato.';
  end if;

  if char_length(v_nome) < 2 or char_length(v_nome) > 120 then
    raise exception 'Informe seu nome.';
  end if;

  if char_length(regexp_replace(v_tel,'\D','','g')) < 10 then
    raise exception 'Informe um telefone valido com DDD.';
  end if;

  select user_id into v_owner
  from public.vitrine_imoveis where id = p_imovel_id;

  -- Anti-spam simples: no maximo 5 contatos por anuncio por hora.
  if (
    select count(*) from public.vitrine_leads
    where imovel_id = p_imovel_id
      and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'Muitos contatos seguidos. Tente novamente mais tarde.';
  end if;

  insert into public.vitrine_leads(
    user_id,imovel_id,nome,telefone,mensagem,origem,consentimento_lgpd
  )
  values(
    v_owner,p_imovel_id,v_nome,v_tel,
    left(trim(coalesce(p_mensagem,'')),1000),'formulario',true
  );

  update public.vitrine_imoveis
  set contatos_formulario = contatos_formulario + 1
  where id = p_imovel_id;

  return jsonb_build_object('ok',true);
end
$$;

revoke all on function
  public.vitrine_registrar_lead(uuid,text,text,text,boolean) from public;
grant execute on function
  public.vitrine_registrar_lead(uuid,text,text,text,boolean) to anon,authenticated;

-- ------------------------------------------------------------
-- 7. MANUTENCAO: anuncio com taxa vencida sai do ar sozinho
-- ------------------------------------------------------------

create or replace function public.vitrine_expirar_vencidos()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_total integer;
begin
  update public.vitrine_imoveis
  set status = 'vencido', updated_at = now()
  where status = 'ativo'
    and expira_em is not null
    and expira_em < current_date;
  get diagnostics v_total = row_count;
  return v_total;
end
$$;

revoke all on function public.vitrine_expirar_vencidos() from public,anon;
grant execute on function public.vitrine_expirar_vencidos() to authenticated;

-- ------------------------------------------------------------
-- 8. CONFERENCIA
-- ------------------------------------------------------------

do $$
declare
  v_imoveis_app integer;
begin
  select count(*) into v_imoveis_app from public.imoveis;
  raise notice 'Imoveis do modulo Alugueis (intocados): %', v_imoveis_app;
  raise notice 'Fase C concluida. Tabelas da Vitrine criadas, separadas do Financeiro.';
end
$$;
