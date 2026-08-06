-- ============================================================
-- migracao-vitrine-detalhes.sql
--
-- Acrescenta ao anúncio os campos que o visitante procura e hoje não
-- existem: suítes, andar, idade, estado de conservação e área total.
-- São as perguntas que chegam no WhatsApp depois que a pessoa já viu o
-- anúncio — cada uma delas é uma resposta que o anúncio devia ter dado.
--
-- ⚠️ Esta migração REDEFINE listar_vitrine_publica. A versão vigente é a
-- de migracao-vitrine-fotos.sql (miniaturas, legendas, CRECI); partir de
-- uma versão anterior apagaria isso. Por isso o arquivo se recusa a rodar
-- se aquela não tiver rodado antes.
--
-- Só ACRESCENTA coluna, com valor padrão. Nenhum dado existente é tocado:
-- todo anúncio que já existe continua igual, com os campos novos vazios.
--
-- Segura, transacional e REEXECUTÁVEL.
-- ⚠️ NÃO aplicar em produção sem autorização do responsável.
-- ============================================================
begin;

do $$
begin
  if to_regclass('public.vitrine_cidades') is null then
    raise exception 'Rode antes o arquivo migracao-vitrine-corretora.sql.';
  end if;
  -- A miniatura é a marca de que migracao-vitrine-fotos.sql passou por
  -- aqui. Sem ela, a função que este arquivo reescreve perderia campos.
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='vitrine_fotos' and column_name='thumb_path'
  ) then
    raise exception 'Rode antes o arquivo migracao-vitrine-fotos.sql.';
  end if;
end
$$;

-- ------------------------------------------------------------
-- 1. Os campos novos
--
-- suites e andar são contagem: zero quer dizer "não tem" e serve de
-- padrão. idade_anos e area_total_m2 são nulos quando não informados —
-- aqui zero seria mentira ("imóvel com 0 ano", "0 m² de área total"),
-- e o anúncio precisa poder dizer "não informado".
-- ------------------------------------------------------------
alter table public.vitrine_imoveis
  add column if not exists suites          integer not null default 0,
  add column if not exists andar           integer not null default 0,
  add column if not exists idade_anos      integer,
  add column if not exists area_total_m2   numeric(10,2),
  add column if not exists conservacao     text not null default '';

-- Contagem negativa não existe. O banco recusa antes de a tela recusar:
-- a validação da interface protege quem digita, esta protege o dado.
do $$
begin
  if not exists (select 1 from pg_constraint where conname='vitrine_imoveis_suites_nao_negativo') then
    alter table public.vitrine_imoveis
      add constraint vitrine_imoveis_suites_nao_negativo check (suites >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='vitrine_imoveis_andar_nao_negativo') then
    alter table public.vitrine_imoveis
      add constraint vitrine_imoveis_andar_nao_negativo check (andar >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='vitrine_imoveis_idade_faixa') then
    alter table public.vitrine_imoveis
      add constraint vitrine_imoveis_idade_faixa check (idade_anos is null or (idade_anos >= 0 and idade_anos <= 200));
  end if;
  if not exists (select 1 from pg_constraint where conname='vitrine_imoveis_conservacao_valida') then
    alter table public.vitrine_imoveis
      add constraint vitrine_imoveis_conservacao_valida check (
        conservacao in ('','na_planta','novo','semi_novo','reformado','bom_estado','precisa_reforma'));
  end if;
end
$$;

-- Suíte é um quarto: não pode haver mais suíte do que quarto. Sem esta
-- regra o anúncio pode dizer "2 quartos, 3 suítes", que não quer dizer
-- nada e some na busca de quem filtra por quarto.
do $$
begin
  if not exists (select 1 from pg_constraint where conname='vitrine_imoveis_suites_ate_quartos') then
    alter table public.vitrine_imoveis
      add constraint vitrine_imoveis_suites_ate_quartos check (suites <= quartos);
  end if;
end
$$;

-- ------------------------------------------------------------
-- 2. Página pública devolve os campos novos
--
-- Cópia fiel da versão de migracao-vitrine-fotos.sql, acrescentando
-- cinco chaves ao imóvel. Nada foi removido.
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
           p.slug_publico,
           coalesce(p.creci,'') as creci
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
        'slug',   slug_publico,
        'creci',  creci
      ) from perfil
    ),
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
        -- Campos novos desta migração.
        'suites',      i.suites,
        'andar',       i.andar,
        'idadeAnos',   i.idade_anos,
        'areaTotalM2', i.area_total_m2,
        'conservacao', i.conservacao,
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
        ),'[]'::jsonb),
        'thumbs',coalesce((
          select jsonb_agg(
            case when coalesce(f.thumb_path,'') <> '' then f.thumb_path
                 else f.storage_path end
            order by f.ordem, f.created_at)
          from public.vitrine_fotos f
          where f.imovel_id = i.id and coalesce(f.storage_path,'') <> ''
        ),'[]'::jsonb),
        'legendas',coalesce((
          select jsonb_agg(coalesce(f.legenda,'') order by f.ordem, f.created_at)
          from public.vitrine_fotos f
          where f.imovel_id = i.id and coalesce(f.storage_path,'') <> ''
        ),'[]'::jsonb)
      ) order by i.destaque desc, i.publicado_em desc nulls last)
      from public.vitrine_imoveis i, perfil p
      where i.user_id = p.user_id
        and i.status = 'ativo'
    ),'[]'::jsonb)
  )
$$;

revoke all on function public.listar_vitrine_publica(text) from public;
grant execute on function public.listar_vitrine_publica(text) to anon,authenticated;

-- ------------------------------------------------------------
-- 3. Conferência
-- ------------------------------------------------------------
do $$
declare
  n_colunas integer;
  n_imoveis integer;
begin
  select count(*) into n_colunas
  from information_schema.columns
  where table_schema='public' and table_name='vitrine_imoveis'
    and column_name in ('suites','andar','idade_anos','area_total_m2','conservacao');

  select count(*) into n_imoveis from public.vitrine_imoveis;

  if n_colunas <> 5 then
    raise exception 'MIGRACAO INCOMPLETA: esperava 5 colunas novas, encontrei %.', n_colunas;
  end if;

  raise notice 'Colunas novas: %  |  Anuncios preservados: %', n_colunas, n_imoveis;
  raise notice 'Migracao concluida. Todo anuncio existente continua igual, com os campos novos vazios.';
end
$$;

commit;
