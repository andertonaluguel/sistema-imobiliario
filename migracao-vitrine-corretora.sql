-- ============================================================
-- migracao-vitrine-corretora.sql
-- A Vitrine deixa de ser um classificado pago e vira o SITE DA
-- CORRETORA: entrada por cidade, imóveis para alugar E para vender,
-- e terrenos.
--
-- O que muda:
--   1) Cadastro próprio de CIDADES (os cards da página inicial).
--   2) FINALIDADE do anúncio: alugar, vender ou ambos + preço de venda.
--   3) TERRENO como tipo, com campos próprios.
--   4) Anúncio deixa de vencer: fica no ar até ser tirado.
--
-- O que NÃO muda: `vitrine_anunciantes`, `vitrine_taxas` e a coluna
-- `expira_em` continuam existindo com todos os seus dados. Elas apenas
-- deixam de governar a publicação. Nada é apagado.
--
-- Segura, transacional e REEXECUTÁVEL.
-- ⚠️ NÃO aplicar em produção sem autorização do responsável.
-- ============================================================
begin;

do $$
begin
  if to_regclass('public.vitrine_imoveis') is null then
    raise exception 'Rode antes o arquivo migracao-vitrine.sql.';
  end if;
end
$$;

-- ------------------------------------------------------------
-- 1. CIDADES — os cards por onde o visitante entra
-- ------------------------------------------------------------
create table if not exists public.vitrine_cidades (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid()
             references public.proprietarios(user_id) on delete cascade,
  nome       text not null,
  uf         text not null default 'PE',
  slug       text not null,
  foto_path  text not null default '',
  ordem      int  not null default 0,
  ativa      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vitrine_cidade_nome_check
    check (char_length(trim(nome)) between 1 and 120),
  constraint vitrine_cidade_slug_unico unique (user_id, slug)
);

create index if not exists vitrine_cidades_ordem_idx
  on public.vitrine_cidades(user_id, ativa, ordem, nome);

alter table public.vitrine_cidades enable row level security;
alter table public.vitrine_cidades force row level security;

drop policy if exists vitrine_cidades_dono on public.vitrine_cidades;
create policy vitrine_cidades_dono on public.vitrine_cidades
  for all to authenticated
  using (user_id = auth.uid() and public.tem_modulo('vitrine', auth.uid()))
  with check (user_id = auth.uid() and public.tem_modulo('vitrine', auth.uid()));

revoke all on table public.vitrine_cidades from public, anon;
grant select, insert, update, delete on public.vitrine_cidades to authenticated;

-- ------------------------------------------------------------
-- 2. FINALIDADE, VENDA, CIDADE E TERRENO no anúncio
-- ------------------------------------------------------------
alter table public.vitrine_imoveis
  add column if not exists finalidade   text not null default 'alugar',
  add column if not exists preco_venda  numeric(12,2) not null default 0,
  add column if not exists cidade_id    uuid references public.vitrine_cidades(id) on delete set null,
  -- terreno
  add column if not exists frente_m     numeric(10,2),
  add column if not exists fundo_m      numeric(10,2),
  add column if not exists murado       boolean not null default false,
  add column if not exists esquina      boolean not null default false,
  add column if not exists topografia   text not null default '';

alter table public.vitrine_imoveis
  drop constraint if exists vitrine_imovel_finalidade_check;
alter table public.vitrine_imoveis
  add constraint vitrine_imovel_finalidade_check
  check (finalidade in ('alugar','vender','ambos'));

alter table public.vitrine_imoveis
  drop constraint if exists vitrine_imovel_preco_venda_check;
alter table public.vitrine_imoveis
  add constraint vitrine_imovel_preco_venda_check
  check (preco_venda >= 0);

alter table public.vitrine_imoveis
  drop constraint if exists vitrine_imovel_topografia_check;
alter table public.vitrine_imoveis
  add constraint vitrine_imovel_topografia_check
  check (topografia in ('','plano','aclive','declive','irregular'));

-- Terreno entra como tipo. Os antigos continuam válidos.
alter table public.vitrine_imoveis
  drop constraint if exists vitrine_imovel_tipo_check;
alter table public.vitrine_imoveis
  add constraint vitrine_imovel_tipo_check
  check (tipo in ('casa','apartamento','kitnet','sobrado','comercial','terreno'));

-- "vendido" junta-se a "alugado" como fim de linha do anúncio.
alter table public.vitrine_imoveis
  drop constraint if exists vitrine_imovel_status_check;
alter table public.vitrine_imoveis
  add constraint vitrine_imovel_status_check
  check (status in ('rascunho','ativo','vencido','pausado','alugado','vendido'));

create index if not exists vitrine_imoveis_cidade_idx
  on public.vitrine_imoveis(user_id, cidade_id, status);
create index if not exists vitrine_imoveis_finalidade_idx
  on public.vitrine_imoveis(user_id, finalidade, status);

-- ------------------------------------------------------------
-- 3. Semeia as cidades da região (só se ainda não existirem)
-- ------------------------------------------------------------
insert into public.vitrine_cidades (user_id, nome, uf, slug, ordem)
select p.user_id, c.nome, 'PE', c.slug, c.ordem
  from public.proprietarios p
 cross join (values
    ('Lajedo','lajedo',1),
    ('Jupi','jupi',2),
    ('Calçado','calcado',3),
    ('São Bento do Una','sao-bento-do-una',4),
    ('Ibirajuba','ibirajuba',5)
 ) as c(nome,slug,ordem)
 where public.tem_modulo('vitrine', p.user_id)
   and not exists (
     select 1 from public.vitrine_cidades v
      where v.user_id = p.user_id and v.slug = c.slug
   );

-- Liga os anúncios já existentes à cidade correspondente, quando o nome
-- bate. Quem não bater fica sem cidade e aparece em "Outras".
-- Compara sem acento e sem caixa, usando translate (não depende da
-- extensão unaccent, que pode não estar instalada no projeto).
update public.vitrine_imoveis i
   set cidade_id = c.id
  from public.vitrine_cidades c
 where i.cidade_id is null
   and c.user_id = i.user_id
   and lower(translate(trim(i.cidade),
         'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
         'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
     = lower(translate(trim(c.nome),
         'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
         'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'));

-- ------------------------------------------------------------
-- 4. Página pública: cidades + finalidade, sem vencimento
-- ------------------------------------------------------------
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
    -- Os cards da entrada. Já vêm com quantos imóveis há em cada
    -- finalidade, para a tela não precisar contar de novo.
    'cidades',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',    c.id,
        'nome',  c.nome,
        'uf',    c.uf,
        'slug',  c.slug,
        'ordem', c.ordem,
        'totalAlugar',(
          select count(*) from public.vitrine_imoveis x
           where x.cidade_id = c.id and x.status = 'ativo'
             and x.finalidade in ('alugar','ambos')),
        'totalVender',(
          select count(*) from public.vitrine_imoveis x
           where x.cidade_id = c.id and x.status = 'ativo'
             and x.finalidade in ('vender','ambos'))
      ) order by c.ordem, c.nome)
      from public.vitrine_cidades c, perfil p
      where c.user_id = p.user_id and c.ativa
    ),'[]'::jsonb),
    'imoveis',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',        i.id,
        'codigo',    i.codigo,
        'titulo',    i.titulo,
        'tipo',      i.tipo,
        'finalidade',i.finalidade,
        'aluguel',   i.aluguel,
        'precoVenda',i.preco_venda,
        'condominio',i.condominio,
        'iptu',      i.iptu,
        'quartos',   i.quartos,
        'banheiros', i.banheiros,
        'vagas',     i.vagas,
        'areaM2',    i.area_m2,
        'frenteM',   i.frente_m,
        'fundoM',    i.fundo_m,
        'murado',    i.murado,
        'esquina',   i.esquina,
        'topografia',i.topografia,
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
        'cidadeId',  i.cidade_id,
        'uf',        i.uf,
        'logradouro',i.logradouro,
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
        -- sem vencimento: o anúncio fica no ar até ser tirado
    ),'[]'::jsonb)
  )
$$;

revoke all on function public.listar_vitrine_publica(text) from public;
grant execute on function public.listar_vitrine_publica(text) to anon,authenticated;

-- A rotina que derrubava anúncio vencido passa a não fazer nada. Fica
-- no banco para não quebrar quem ainda a chame.
create or replace function public.vitrine_expirar_vencidos()
returns integer
language sql
security definer
set search_path=public
as $$
  select 0;
$$;

grant execute on function public.vitrine_expirar_vencidos() to authenticated;

commit;
