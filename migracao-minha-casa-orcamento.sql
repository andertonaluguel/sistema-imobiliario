-- ============================================================
-- MINHA CASA — ORCAMENTO POR CATEGORIA  +  METAS DE ECONOMIA
--
-- E o que separa "registro" de "controle". Hoje o modulo conta o
-- que ja aconteceu; com orcamento ele avisa ANTES de estourar.
--
-- Duas coisas:
--
-- 1. ORCAMENTO: teto mensal por categoria ("mercado, no maximo
--    R$ 900"). O app compara com o gasto do mes e mostra barra de
--    progresso.
--
-- 2. META DE ECONOMIA: objetivo com valor e prazo ("R$ 6.000 ate
--    dezembro para a viagem"), com aportes registrados.
--
-- Esta migracao e 100% ADITIVA e reexecutavel.
-- Rode DEPOIS de migracao-minha-casa.sql.
-- ============================================================

begin;

do $$
begin
  if to_regclass('public.minha_casa_familias') is null then
    raise exception 'Rode antes o arquivo migracao-minha-casa.sql.';
  end if;
  if to_regclass('public.minha_casa_categorias') is null then
    raise exception 'Rode antes o arquivo migracao-minha-casa.sql (categorias).';
  end if;
end
$$;

-- ------------------------------------------------------------
-- 1. ORCAMENTO POR CATEGORIA
--
-- Um teto por categoria e por mes. O mes fica como date no dia 1
-- (e nao text 'YYYY-MM') para dar ordenacao e intervalo de graca.
--
-- mes = null significa "vale para todo mes", que e o caso comum:
-- ninguem quer redigitar o teto do mercado todo mes. O teto do mes
-- especifico, quando existe, ganha do padrao.
-- ------------------------------------------------------------

create table if not exists public.minha_casa_orcamentos (
  id           uuid primary key default gen_random_uuid(),
  familia_id   uuid not null references public.minha_casa_familias(id) on delete cascade,
  categoria_id uuid not null references public.minha_casa_categorias(id) on delete cascade,
  mes          date,
  valor        numeric(12,2) not null check (valor > 0),
  -- avisa quando passar desta fatia do teto (0.8 = 80%)
  alerta_em    numeric(3,2) not null default 0.80
               check (alerta_em > 0 and alerta_em <= 1),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Um teto por categoria/mes. Dois indices porque, em Postgres,
-- NULL nao colide com NULL num unique comum: sem o segundo indice
-- daria para cadastrar dois padroes para a mesma categoria.
create unique index if not exists minha_casa_orcamentos_mes_uk
  on public.minha_casa_orcamentos (familia_id, categoria_id, mes)
  where mes is not null;

create unique index if not exists minha_casa_orcamentos_padrao_uk
  on public.minha_casa_orcamentos (familia_id, categoria_id)
  where mes is null;

-- A categoria precisa pertencer a mesma familia do orcamento.
-- O FK simples por categoria_id nao garante isso sozinho.
create unique index if not exists minha_casa_categorias_id_familia_uk
  on public.minha_casa_categorias (id, familia_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'minha_casa_orcamentos_categoria_familia_fk'
       and conrelid = 'public.minha_casa_orcamentos'::regclass
  ) then
    alter table public.minha_casa_orcamentos
      add constraint minha_casa_orcamentos_categoria_familia_fk
      foreign key (categoria_id, familia_id)
      references public.minha_casa_categorias(id, familia_id)
      on delete cascade;
  end if;
end
$$;

-- ------------------------------------------------------------
-- 2. METAS DE ECONOMIA
-- ------------------------------------------------------------

create table if not exists public.minha_casa_metas (
  id          uuid primary key default gen_random_uuid(),
  familia_id  uuid not null references public.minha_casa_familias(id) on delete cascade,
  nome        text not null,
  descricao   text not null default '',
  valor_alvo  numeric(12,2) not null check (valor_alvo > 0),
  prazo       date,
  emoji       text not null default '',
  cor         text not null default '',
  status      text not null default 'ativa'
              check (status in ('ativa','concluida','cancelada')),
  concluida_em timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists minha_casa_metas_familia_idx
  on public.minha_casa_metas (familia_id, status);

-- Aportes: cada deposito na meta. Guardar movimento em vez de um
-- saldo unico permite mostrar o historico e desfazer engano sem
-- recalcular nada na mao.
create table if not exists public.minha_casa_meta_aportes (
  id         uuid primary key default gen_random_uuid(),
  meta_id    uuid not null references public.minha_casa_metas(id) on delete cascade,
  familia_id uuid not null references public.minha_casa_familias(id) on delete cascade,
  valor      numeric(12,2) not null check (valor <> 0),
  data       date not null default current_date,
  observacao text not null default '',
  membro_id  uuid references public.minha_casa_membros(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists minha_casa_meta_aportes_meta_idx
  on public.minha_casa_meta_aportes (meta_id, data desc);

-- Impede aporte de uma familia de ser ligado a meta de outra.
create unique index if not exists minha_casa_metas_id_familia_uk
  on public.minha_casa_metas (id, familia_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'minha_casa_meta_aportes_meta_familia_fk'
       and conrelid = 'public.minha_casa_meta_aportes'::regclass
  ) then
    alter table public.minha_casa_meta_aportes
      add constraint minha_casa_meta_aportes_meta_familia_fk
      foreign key (meta_id, familia_id)
      references public.minha_casa_metas(id, familia_id)
      on delete cascade;
  end if;
end
$$;

-- ------------------------------------------------------------
-- 3. SEGURANCA
-- Mesmo criterio do resto da Minha Casa: quem pertence a familia
-- enxerga; quem nao pertence, nao.
-- ------------------------------------------------------------

do $$
declare v_tabela text;
begin
  foreach v_tabela in array array['minha_casa_orcamentos','minha_casa_metas',
                                  'minha_casa_meta_aportes']
  loop
    execute format('alter table public.%I enable row level security', v_tabela);
    execute format('alter table public.%I force row level security', v_tabela);
  end loop;
end
$$;

-- Reaproveita exatamente o criterio que o resto da Minha Casa usa:
-- possuir o modulo E estar na familia atual. A versao anterior desta
-- migracao usava e_mestre(), o que voltava a bloquear clientes pagos.
do $$
begin
  if to_regprocedure('public.minha_casa_familia_atual_id()') is null
     or to_regprocedure('public.tem_modulo(text,uuid)') is null then
    raise exception
      'Funcoes de acesso da Minha Casa nao encontradas. Rode migracao-minha-casa.sql e migracao-modulos.sql primeiro.';
  end if;
end
$$;

drop policy if exists minha_casa_orcamentos_familia on public.minha_casa_orcamentos;
create policy minha_casa_orcamentos_familia on public.minha_casa_orcamentos
  for all to authenticated
  using ((public.tem_modulo('minha_casa', auth.uid())
          and familia_id = public.minha_casa_familia_atual_id()))
  with check ((public.tem_modulo('minha_casa', auth.uid())
          and familia_id = public.minha_casa_familia_atual_id()));

drop policy if exists minha_casa_metas_familia on public.minha_casa_metas;
create policy minha_casa_metas_familia on public.minha_casa_metas
  for all to authenticated
  using ((public.tem_modulo('minha_casa', auth.uid())
          and familia_id = public.minha_casa_familia_atual_id()))
  with check ((public.tem_modulo('minha_casa', auth.uid())
          and familia_id = public.minha_casa_familia_atual_id()));

drop policy if exists minha_casa_meta_aportes_familia on public.minha_casa_meta_aportes;
create policy minha_casa_meta_aportes_familia on public.minha_casa_meta_aportes
  for all to authenticated
  using ((public.tem_modulo('minha_casa', auth.uid())
          and familia_id = public.minha_casa_familia_atual_id()))
  with check ((public.tem_modulo('minha_casa', auth.uid())
          and familia_id = public.minha_casa_familia_atual_id()));

revoke all on table
  public.minha_casa_orcamentos,
  public.minha_casa_metas,
  public.minha_casa_meta_aportes
from public, anon;

grant select, insert, update, delete on table
  public.minha_casa_orcamentos,
  public.minha_casa_metas,
  public.minha_casa_meta_aportes
to authenticated;

-- ------------------------------------------------------------
-- 4. LEITURA: ORCAMENTO x GASTO DO MES
--
-- Devolve tudo pronto para a tela: teto, gasto, quanto sobra e a
-- fatia consumida. A conta fica aqui porque depende de resolver a
-- precedencia entre teto do mes e teto padrao — regra que nao
-- deve viver espalhada no JavaScript.
-- ------------------------------------------------------------

create or replace function public.minha_casa_orcamento_do_mes(
  p_familia_id uuid,
  p_mes date default date_trunc('month', current_date)::date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mes date := date_trunc('month', coalesce(p_mes, current_date))::date;
  v_resultado jsonb;
begin
  if p_familia_id is distinct from public.minha_casa_familia_atual_id() then
    raise exception 'Sem acesso a esta familia.';
  end if;

  select coalesce(jsonb_agg(linha order by linha->>'categoriaNome'), '[]'::jsonb)
    into v_resultado
  from (
    select jsonb_build_object(
             'categoriaId',   c.id,
             'categoriaNome', c.nome,
             'teto',          o.valor,
             'alertaEm',      o.alerta_em,
             'doMes',         (o.mes is not null),
             'gasto',         coalesce(g.total, 0),
             'restante',      greatest(o.valor - coalesce(g.total, 0), 0),
             'estourou',      (coalesce(g.total, 0) > o.valor),
             'fatia',         round(coalesce(g.total, 0) / o.valor * 100)
           ) as linha
      from public.minha_casa_categorias c
      join lateral (
             -- teto do mes ganha do padrao; por isso o order by
             select oo.valor, oo.alerta_em, oo.mes
               from public.minha_casa_orcamentos oo
              where oo.familia_id = p_familia_id
                and oo.categoria_id = c.id
                and (oo.mes = v_mes or oo.mes is null)
              order by oo.mes nulls last
              limit 1
           ) o on true
      left join lateral (
             select sum(l.valor) as total
               from public.minha_casa_lancamentos l
              where l.familia_id = p_familia_id
                and l.categoria_id = c.id
                and l.tipo = 'saida'
                and date_trunc('month', l.data)::date = v_mes
           ) g on true
     where c.familia_id = p_familia_id
  ) t;

  return v_resultado;
end;
$$;

revoke all on function public.minha_casa_orcamento_do_mes(uuid,date)
  from public,anon;
grant execute on function public.minha_casa_orcamento_do_mes(uuid,date)
  to authenticated;

-- ------------------------------------------------------------
-- 5. LEITURA: METAS COM PROGRESSO
-- ------------------------------------------------------------

create or replace function public.minha_casa_listar_metas(p_familia_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_resultado jsonb;
begin
  if p_familia_id is distinct from public.minha_casa_familia_atual_id() then
    raise exception 'Sem acesso a esta familia.';
  end if;

  select coalesce(jsonb_agg(linha order by linha->>'prazo' nulls last), '[]'::jsonb)
    into v_resultado
  from (
    select jsonb_build_object(
             'id',         m.id,
             'nome',       m.nome,
             'descricao',  m.descricao,
             'valorAlvo',  m.valor_alvo,
             'prazo',      m.prazo,
             'emoji',      m.emoji,
             'cor',        m.cor,
             'status',     m.status,
             'guardado',   coalesce(a.total, 0),
             'restante',   greatest(m.valor_alvo - coalesce(a.total, 0), 0),
             'fatia',      round(coalesce(a.total, 0) / m.valor_alvo * 100),
             'aportes',    coalesce(a.n, 0),
             -- quanto guardar por mes para chegar no prazo. null
             -- quando nao ha prazo ou o prazo ja passou.
             'porMes',     case
                             when m.prazo is null then null
                             when m.prazo <= current_date then null
                             else round(
                               greatest(m.valor_alvo - coalesce(a.total,0), 0) /
                               greatest(
                                 (date_part('year', age(m.prazo, current_date)) * 12
                                  + date_part('month', age(m.prazo, current_date)))::numeric,
                                 1)
                             , 2)
                           end
           ) as linha
      from public.minha_casa_metas m
      left join lateral (
             select sum(ap.valor) as total, count(*) as n
               from public.minha_casa_meta_aportes ap
              where ap.meta_id = m.id
                and ap.familia_id = m.familia_id
           ) a on true
     where m.familia_id = p_familia_id
       and m.status <> 'cancelada'
  ) t;

  return v_resultado;
end;
$$;

revoke all on function public.minha_casa_listar_metas(uuid)
  from public,anon;
grant execute on function public.minha_casa_listar_metas(uuid)
  to authenticated;

-- ------------------------------------------------------------
-- 6. CONFERENCIA
-- ------------------------------------------------------------
do $$
begin
  raise notice 'Orcamento e metas prontos.';
  raise notice '  tabelas: minha_casa_orcamentos, minha_casa_metas, minha_casa_meta_aportes';
  raise notice '  leitura: minha_casa_orcamento_do_mes(familia, mes)';
  raise notice '           minha_casa_listar_metas(familia)';
end
$$;

commit;
