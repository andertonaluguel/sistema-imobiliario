-- ============================================================
-- ETAPA 2 — BASE PUBLICA, SEO E MARCA
-- Migracao 37 · aditiva, transacional e reexecutavel
-- ============================================================

begin;

do $$
begin
  if to_regclass('public.proprietarios') is null
     or to_regclass('public.vitrine_imoveis') is null
     or to_regclass('public.vitrine_cidades') is null
     or to_regprocedure('public.listar_vitrine_publica_v2(text)') is null then
    raise exception 'Rode antes migracao-vitrine-fundacao.sql.';
  end if;
end
$$;

alter table public.proprietarios
  add column if not exists descricao_publica text not null default '',
  add column if not exists cidade_sede text not null default '',
  add column if not exists uf_sede text not null default '',
  add column if not exists marca_tema text not null default 'floresta',
  add column if not exists logo_path text not null default '';

alter table public.proprietarios drop constraint if exists proprietarios_marca_tema_check;
alter table public.proprietarios add constraint proprietarios_marca_tema_check
  check (marca_tema in ('floresta','oceano','terracota','grafite'));

alter table public.proprietarios drop constraint if exists proprietarios_uf_sede_check;
alter table public.proprietarios add constraint proprietarios_uf_sede_check
  check (uf_sede='' or uf_sede ~ '^[A-Z]{2}$');

-- Somente o dono principal pode mudar a marca e os dados institucionais.
create or replace function public.salvar_perfil_publico(
  p_slug text,
  p_nome text,
  p_contato text,
  p_creci text,
  p_descricao text,
  p_cidade_sede text,
  p_uf_sede text,
  p_marca_tema text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_owner uuid := public.usuario_proprietario_id();
  v_tema text := lower(trim(coalesce(p_marca_tema,'')));
begin
  if v_owner is null
     or (v_owner <> auth.uid() and not public.e_administrador_plataforma(auth.uid())) then
    raise exception 'Somente o dono da conta pode alterar o anuncio publico.';
  end if;
  if v_tema not in ('floresta','oceano','terracota','grafite') then
    raise exception 'Paleta de marca invalida.';
  end if;

  perform public.salvar_perfil_publico(p_slug,p_nome,p_contato,p_creci);

  update public.proprietarios
     set descricao_publica=left(trim(coalesce(p_descricao,'')),320),
         cidade_sede=left(trim(coalesce(p_cidade_sede,'')),120),
         uf_sede=upper(left(trim(coalesce(p_uf_sede,'')),2)),
         marca_tema=v_tema,
         updated_at=now()
   where user_id=v_owner;
end
$$;

revoke all on function public.salvar_perfil_publico(text,text,text,text,text,text,text,text)
  from public,anon;
grant execute on function public.salvar_perfil_publico(text,text,text,text,text,text,text,text)
  to authenticated;

-- O arquivo fica no mesmo bucket privado dos demais anexos. A RPC grava
-- somente um caminho dentro da pasta de marca da propria conta.
create or replace function public.salvar_logo_vitrine(p_logo_path text)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_owner uuid := public.usuario_proprietario_id();
  v_path text := trim(coalesce(p_logo_path,''));
begin
  if v_owner is null
     or (v_owner <> auth.uid() and not public.e_administrador_plataforma(auth.uid())) then
    raise exception 'Somente o dono da conta pode alterar a marca publica.';
  end if;
  if v_path<>'' and v_path not like v_owner::text||'/vitrine-marca/%' then
    raise exception 'Caminho de logo invalido.';
  end if;
  update public.proprietarios set logo_path=v_path,updated_at=now()
   where user_id=v_owner;
  return v_path;
end
$$;

revoke all on function public.salvar_logo_vitrine(text) from public,anon;
grant execute on function public.salvar_logo_vitrine(text) to authenticated;

-- Fotos e logo continuam privados no Storage. Esta funcao apenas confirma
-- que o arquivo pertence a uma pagina publica ativa antes de a borda servi-lo.
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
    join public.vitrine_imoveis i on i.id=f.imovel_id
    where (f.storage_path=p_path or f.thumb_path=p_path)
      and i.status='ativo'
      and public.tem_modulo('vitrine',i.user_id)
  ) or exists(
    select 1 from public.proprietarios p
    where p.logo_path=p_path and p.logo_path<>'' and p.slug_publico is not null
      and public.tem_modulo('vitrine',p.user_id)
  )
$$;

revoke all on function public.arquivo_vitrine_publico(text) from public;
grant execute on function public.arquivo_vitrine_publico(text) to anon,authenticated;

-- A V2 preserva o JSON anterior, acrescenta somente dados publicos da marca
-- e nunca inclui observacao_privada nem observacoes privadas de documentos.
create or replace function public.listar_vitrine_publica_v2(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  with perfil as (
    select p.user_id,p.descricao_publica,p.cidade_sede,p.uf_sede,
           p.marca_tema,p.logo_path
      from public.proprietarios p
     where lower(p.slug_publico)=lower(trim(p_slug))
       and public.tem_modulo('vitrine',p.user_id)
     limit 1
  ), base_original as (
    select public.listar_vitrine_publica(p_slug) dados
  ), base as (
    select jsonb_set(
      b.dados,'{perfil}',
      coalesce(b.dados->'perfil','{}'::jsonb) || jsonb_build_object(
        'descricao',p.descricao_publica,
        'cidadeSede',p.cidade_sede,
        'ufSede',p.uf_sede,
        'marcaTema',p.marca_tema,
        'logoPath',p.logo_path
      ),true
    ) dados
    from base_original b left join perfil p on true
  ), itens as (
    select elem,ord from base,
      jsonb_array_elements(coalesce(dados->'imoveis','[]'::jsonb))
      with ordinality a(elem,ord)
  ), enriquecidos as (
    select ord,elem || jsonb_build_object(
      'areaM2',case when i.tipo='terreno' then nullif(i.area_m2,0) else i.area_util_m2 end,
      'areaUtilM2',i.area_util_m2,
      'totalAndares',i.total_andares,
      'anoConstrucao',i.ano_construcao,
      'disponivelEm',i.disponivel_em,
      'atualizadoEm',i.updated_at,
      'enderecoModo',i.endereco_publico_modo,
      'bairro',case when i.endereco_publico_modo='oculto' then '' else i.bairro end,
      'logradouro',case when i.endereco_publico_modo='exato' then i.logradouro else '' end,
      'numero',case when i.endereco_publico_modo='exato' then i.numero else '' end,
      'latitude',case when i.endereco_publico_modo='exato' then i.latitude when i.endereco_publico_modo='aproximado' then i.latitude_publica else null end,
      'longitude',case when i.endereco_publico_modo='exato' then i.longitude when i.endereco_publico_modo='aproximado' then i.longitude_publica else null end,
      'garantiasAceitas',to_jsonb(i.garantias_aceitas),
      'indiceReajuste',i.indice_reajuste,
      'custosInclusos',to_jsonb(i.custos_inclusos),
      'aceitaEstudante',i.aceita_estudante,
      'aceitaPessoaJuridica',i.aceita_pessoa_juridica,
      'aceitaCrianca',i.aceita_crianca,
      'permiteSublocacao',i.permite_sublocacao,
      'aceitaFinanciamento',i.aceita_financiamento,
      'aceitaPermuta',i.aceita_permuta,
      'situacaoOcupacao',i.situacao_ocupacao,
      'pavimentacao',i.pavimentacao,
      'aguaDisponivel',i.agua_disponivel,
      'energiaDisponivel',i.energia_disponivel,
      'esgotoDisponivel',i.esgoto_disponivel,
      'aptidoesTerreno',to_jsonb(i.aptidoes_terreno),
      'comodidades',coalesce((select jsonb_agg(jsonb_build_object(
        'codigo',c.codigo,'rotulo',c.rotulo,'grupo',c.grupo)
        order by c.grupo,c.ordem,c.rotulo)
        from public.vitrine_imovel_comodidades l
        join public.vitrine_comodidades_catalogo c on c.id=l.comodidade_id
        where l.imovel_id=i.id and c.ativo),'[]'::jsonb),
      'documentacao',coalesce((select jsonb_agg(jsonb_build_object(
        'tipo',d.tipo,'estado',d.estado) order by d.tipo)
        from public.vitrine_documentacao_imovel d
        where d.imovel_id=i.id),'[]'::jsonb)
    ) item
    from itens join public.vitrine_imoveis i on i.id=(elem->>'id')::uuid
  )
  select jsonb_set(base.dados,'{imoveis}',coalesce(
    (select jsonb_agg(item order by ord) from enriquecidos),'[]'::jsonb),true)
  from base
$$;

revoke all on function public.listar_vitrine_publica_v2(text) from public;
grant execute on function public.listar_vitrine_publica_v2(text) to anon,authenticated;

-- Uma unica leitura segura alimenta sitemap.xml. So entram paginas com
-- modulo ativo, cidade ativa e anuncio ativo; nenhuma pessoa ou contato sai.
create or replace function public.listar_vitrine_sitemap_publico()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug',p.slug_publico,
    'atualizadoEm',p.updated_at,
    'cidades',coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug',cs.slug,
        'atualizadoEm',coalesce(cs.atualizado_em,p.updated_at)
      ) order by cs.slug)
      from (
        select c.slug,max(i.updated_at) atualizado_em
        from public.vitrine_cidades c
        join public.vitrine_imoveis i on i.cidade_id=c.id
         and i.user_id=p.user_id and i.status='ativo'
        where c.user_id=p.user_id and c.ativa
        group by c.slug
      ) cs
    ),'[]'::jsonb),
    'imoveis',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',i.id,
        'titulo',i.titulo,
        'tipo',i.tipo,
        'finalidade',i.finalidade,
        'cidadeSlug',coalesce(c.slug,''),
        'atualizadoEm',i.updated_at
      ) order by i.updated_at desc)
      from public.vitrine_imoveis i
      left join public.vitrine_cidades c on c.id=i.cidade_id and c.ativa
      where i.user_id=p.user_id and i.status='ativo'
    ),'[]'::jsonb)
  ) order by p.slug_publico),'[]'::jsonb)
  from public.proprietarios p
  where p.slug_publico is not null and trim(p.slug_publico)<>''
    and public.tem_modulo('vitrine',p.user_id)
    and exists(select 1 from public.vitrine_imoveis i
      where i.user_id=p.user_id and i.status='ativo')
$$;

revoke all on function public.listar_vitrine_sitemap_publico() from public;
grant execute on function public.listar_vitrine_sitemap_publico() to anon,authenticated;

do $$
begin
  if to_regprocedure('public.registrar_migracao(text,text)') is not null then
    perform public.registrar_migracao(
      'migracao-vitrine-seo-marca.sql',
      'Etapa 2: marca publica, rotas canonicas, preview e sitemap'
    );
  end if;
end
$$;

commit;
