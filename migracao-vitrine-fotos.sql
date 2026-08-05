-- ============================================================
-- migracao-vitrine-fotos.sql
-- Miniatura das fotos, legenda no lugar certo e identificação da
-- corretora no rodapé do site.
--
-- Por que a miniatura:
--   Toda foto é guardada em 1920 px (photos.js:8-29). A grade pública
--   carregava esse arquivo em cada cartão. Com 40 anúncios na tela, são
--   dezenas de megabytes — no 4G do interior, a diferença entre a pessoa
--   esperar e a pessoa desistir. Passa a existir uma segunda versão de
--   640 px, usada só na grade.
--
-- Por que o CRECI:
--   O site público não dizia quem estava falando. Para uma corretora isso
--   é obrigação, e sem uma página de privacidade e um responsável visível
--   não se anuncia no Meta Ads.
--
-- ⚠️ Esta migração REDEFINE listar_vitrine_publica. A versão vigente é a
-- de migracao-vitrine-corretora.sql (cidades, finalidade, preço de venda);
-- partir da versão original apagaria tudo isso. Por isso o arquivo se
-- recusa a rodar se a migração da corretora não tiver rodado antes.
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
end
$$;

-- ------------------------------------------------------------
-- 1. Miniatura e identificação
-- ------------------------------------------------------------
alter table public.vitrine_fotos
  add column if not exists thumb_path text not null default '';

alter table public.proprietarios
  add column if not exists creci text not null default '';

-- ------------------------------------------------------------
-- 2. O arquivo da miniatura também precisa abrir para o visitante
--
-- Sem isto a thumb existe no bucket e devolve 403: a policy do Storage
-- pergunta a esta função se o caminho pode ser lido, e ela só conhecia
-- storage_path.
-- ------------------------------------------------------------
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
    where (f.storage_path = p_path or f.thumb_path = p_path)
      and i.status = 'ativo'
      and public.tem_modulo('vitrine', i.user_id)
  )
$$;

revoke all on function public.arquivo_vitrine_publico(text) from public;
grant execute on function public.arquivo_vitrine_publico(text) to anon,authenticated;

-- ------------------------------------------------------------
-- 3. Página pública: miniaturas, legendas e CRECI
--
-- Parte da versão de migracao-vitrine-corretora.sql:154-252 e acrescenta
-- três campos. Nada é removido.
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
        -- Miniatura na mesma ordem das fotos. Quando a foto ainda não tem
        -- miniatura (subida antes desta migração), vem o caminho grande:
        -- a grade continua funcionando, só sem o ganho de peso.
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
-- 4. Salvar o CRECI junto do perfil público
--
-- Assinatura nova, ao lado da de três argumentos, que continua existindo.
-- O aplicativo tenta esta primeiro e cai na antiga se o banco ainda não
-- tiver recebido este arquivo — mesmo padrão dos papéis de colaborador.
-- ------------------------------------------------------------
create or replace function public.salvar_perfil_publico(
  p_slug text, p_nome text, p_contato text, p_creci text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_owner uuid := public.usuario_proprietario_id();
begin
  if v_owner is null
     or (v_owner <> auth.uid() and not public.e_administrador_plataforma(auth.uid())) then
    raise exception 'Somente o dono da conta pode alterar o anuncio publico.';
  end if;
  perform public.salvar_perfil_publico(p_slug,p_nome,p_contato);
  update public.proprietarios
     set creci = left(trim(coalesce(p_creci,'')),30), updated_at = now()
   where user_id = v_owner;
end
$$;

revoke all on function public.salvar_perfil_publico(text,text,text,text) from public,anon;
grant execute on function public.salvar_perfil_publico(text,text,text,text) to authenticated;

-- ------------------------------------------------------------
-- 5. Conferência
-- ------------------------------------------------------------
do $$
declare
  v_sem_thumb integer;
begin
  select count(*) into v_sem_thumb
    from public.vitrine_fotos where coalesce(thumb_path,'') = '';
  raise notice 'Fotos ainda sem miniatura (usarão a foto grande): %', v_sem_thumb;
  raise notice 'Miniaturas, legendas e CRECI liberados na pagina publica.';

  if to_regprocedure('public.registrar_migracao(text,text)') is not null then
    perform public.registrar_migracao('migracao-vitrine-fotos.sql','');
  end if;
end
$$;

commit;
