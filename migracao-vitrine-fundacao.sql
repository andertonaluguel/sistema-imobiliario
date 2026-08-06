-- ============================================================
-- migracao-vitrine-fundacao.sql
-- ETAPA 1: fundacao de dados da Vitrine.
--
-- Completa o anuncio sem transformar cada comodidade em uma coluna.
-- Preserva listar_vitrine_publica e importar_backup_atomico_v7: as novas
-- versoes usam sufixo v2/v8 e o aplicativo faz fallback enquanto esta
-- migracao ainda nao tiver sido aplicada.
--
-- Transacional, aditiva e reexecutavel.
-- NAO aplicar em producao sem preflight e autorizacao do responsavel.
-- ============================================================
begin;

do $$
begin
  if to_regclass('public.vitrine_imoveis') is null
     or to_regprocedure('public.listar_vitrine_publica(text)') is null
     or to_regprocedure('public.importar_backup_atomico_v7(jsonb,boolean)') is null then
    raise exception 'A fundacao requer Vitrine Detalhes e Backup V7 aplicados.';
  end if;
  if not exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='vitrine_imoveis' and column_name='suites')
     or not exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='vitrine_anunciantes' and column_name='proprietario_cliente_id') then
    raise exception 'Rode antes migracao-vitrine-detalhes.sql e migracao-proprietario-cliente.sql.';
  end if;
end
$$;

-- ------------------------------------------------------------
-- 1. CAMPOS CENTRAIS, CONDICOES E TERRENOS
-- ------------------------------------------------------------
alter table public.vitrine_imoveis
  add column if not exists area_util_m2 numeric(10,2),
  add column if not exists total_andares integer,
  add column if not exists ano_construcao integer,
  add column if not exists disponivel_em date,
  add column if not exists endereco_publico_modo text,
  add column if not exists latitude_publica numeric(10,7),
  add column if not exists longitude_publica numeric(10,7),
  add column if not exists garantias_aceitas text[] not null default '{}',
  add column if not exists indice_reajuste text not null default '',
  add column if not exists custos_inclusos text[] not null default '{}',
  add column if not exists aceita_estudante boolean,
  add column if not exists aceita_pessoa_juridica boolean,
  add column if not exists aceita_crianca boolean,
  add column if not exists permite_sublocacao boolean,
  add column if not exists aceita_financiamento boolean,
  add column if not exists aceita_permuta boolean,
  add column if not exists situacao_ocupacao text not null default '',
  add column if not exists observacao_privada text not null default '',
  add column if not exists pavimentacao boolean,
  add column if not exists agua_disponivel boolean,
  add column if not exists energia_disponivel boolean,
  add column if not exists esgoto_disponivel boolean,
  add column if not exists aptidoes_terreno text[] not null default '{}';

-- O campo antigo area_m2 era obrigatorio e usava zero para desconhecido.
-- A coluna nova preserva a diferenca entre ausente e 0 sem reescrever legado.
update public.vitrine_imoveis
set area_util_m2=nullif(area_m2,0)
where area_util_m2 is null and area_m2>0;

update public.vitrine_imoveis
set endereco_publico_modo=case when endereco_exato_publico then 'exato' else 'aproximado' end
where endereco_publico_modo is null;

alter table public.vitrine_imoveis
  alter column endereco_publico_modo set default 'exato',
  alter column endereco_publico_modo set not null;

do $$
declare c record;
begin
  for c in select conname from pg_constraint
    where conrelid='public.vitrine_imoveis'::regclass
      and conname in (
        'vitrine_area_util_faixa','vitrine_total_andares_faixa',
        'vitrine_ano_construcao_faixa','vitrine_endereco_publico_modo_valido',
        'vitrine_situacao_ocupacao_valida','vitrine_latitude_publica_faixa',
        'vitrine_longitude_publica_faixa')
  loop execute format('alter table public.vitrine_imoveis drop constraint %I',c.conname); end loop;
end
$$;

alter table public.vitrine_imoveis
  add constraint vitrine_area_util_faixa
    check (area_util_m2 is null or area_util_m2>0),
  add constraint vitrine_total_andares_faixa
    check (total_andares is null or total_andares between 1 and 300),
  add constraint vitrine_ano_construcao_faixa
    check (ano_construcao is null or ano_construcao between 1700 and 2200),
  add constraint vitrine_endereco_publico_modo_valido
    check (endereco_publico_modo in ('oculto','aproximado','exato')),
  add constraint vitrine_situacao_ocupacao_valida
    check (situacao_ocupacao in ('','vago','ocupado_proprietario','ocupado_inquilino','em_obras')),
  add constraint vitrine_latitude_publica_faixa
    check (latitude_publica is null or latitude_publica between -90 and 90),
  add constraint vitrine_longitude_publica_faixa
    check (longitude_publica is null or longitude_publica between -180 and 180);

create index if not exists vitrine_imoveis_disponibilidade_idx
  on public.vitrine_imoveis(user_id,disponivel_em,status);
create index if not exists vitrine_imoveis_area_util_idx
  on public.vitrine_imoveis(user_id,area_util_m2) where area_util_m2 is not null;

-- ------------------------------------------------------------
-- 2. COMODIDADES E DOCUMENTACAO ESTRUTURADAS
-- ------------------------------------------------------------
create table if not exists public.vitrine_comodidades_catalogo (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.usuario_proprietario_id(auth.uid())
    references public.proprietarios(user_id) on delete cascade,
  codigo text not null,
  rotulo text not null,
  grupo text not null,
  ordem integer not null default 0,
  ativo boolean not null default true,
  tipos_aplicaveis jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,codigo),
  check (codigo ~ '^[a-z0-9_]{2,60}$'),
  check (grupo in ('imovel','condominio','regiao','terreno','acessibilidade','sustentabilidade')),
  check (jsonb_typeof(tipos_aplicaveis)='array')
);

create table if not exists public.vitrine_imovel_comodidades (
  user_id uuid not null default public.usuario_proprietario_id(auth.uid())
    references public.proprietarios(user_id) on delete cascade,
  imovel_id uuid not null references public.vitrine_imoveis(id) on delete cascade,
  comodidade_id uuid not null references public.vitrine_comodidades_catalogo(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(imovel_id,comodidade_id)
);

create index if not exists vitrine_imovel_comodidades_user_idx
  on public.vitrine_imovel_comodidades(user_id,imovel_id);

create table if not exists public.vitrine_documentacao_imovel (
  user_id uuid not null default public.usuario_proprietario_id(auth.uid())
    references public.proprietarios(user_id) on delete cascade,
  imovel_id uuid not null references public.vitrine_imoveis(id) on delete cascade,
  tipo text not null,
  estado text not null default 'nao_informado',
  observacao_privada text not null default '',
  updated_at timestamptz not null default now(),
  primary key(imovel_id,tipo),
  check (tipo in ('matricula','escritura','habite_se','iptu','condominio','financiamento','onus','inventario','usucapiao')),
  check (estado in ('sim','nao','nao_informado'))
);

-- As chaves compostas impedem que um UUID conhecido seja ligado a um
-- anuncio ou catalogo de outra conta, mesmo sob uma futura policy incorreta.
do $$
begin
  if not exists(select 1 from pg_constraint where conname='vitrine_imoveis_user_id_id_key') then
    alter table public.vitrine_imoveis add constraint vitrine_imoveis_user_id_id_key unique(user_id,id);
  end if;
  if not exists(select 1 from pg_constraint where conname='vitrine_comodidades_user_id_id_key') then
    alter table public.vitrine_comodidades_catalogo add constraint vitrine_comodidades_user_id_id_key unique(user_id,id);
  end if;
  if not exists(select 1 from pg_constraint where conname='vitrine_links_imovel_mesma_conta_fk') then
    alter table public.vitrine_imovel_comodidades add constraint vitrine_links_imovel_mesma_conta_fk
      foreign key(user_id,imovel_id) references public.vitrine_imoveis(user_id,id) on delete cascade;
  end if;
  if not exists(select 1 from pg_constraint where conname='vitrine_links_catalogo_mesma_conta_fk') then
    alter table public.vitrine_imovel_comodidades add constraint vitrine_links_catalogo_mesma_conta_fk
      foreign key(user_id,comodidade_id) references public.vitrine_comodidades_catalogo(user_id,id) on delete cascade;
  end if;
  if not exists(select 1 from pg_constraint where conname='vitrine_docs_imovel_mesma_conta_fk') then
    alter table public.vitrine_documentacao_imovel add constraint vitrine_docs_imovel_mesma_conta_fk
      foreign key(user_id,imovel_id) references public.vitrine_imoveis(user_id,id) on delete cascade;
  end if;
end
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'vitrine_comodidades_catalogo','vitrine_imovel_comodidades','vitrine_documentacao_imovel'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('drop policy if exists vitrine_dono on public.%I',t);
    execute format(
      'create policy vitrine_dono on public.%I for all to authenticated
       using (user_id=public.usuario_proprietario_id(auth.uid()) and public.vitrine_pode_operar(auth.uid()))
       with check (user_id=public.usuario_proprietario_id(auth.uid()) and public.vitrine_pode_operar(auth.uid()))',t);
    execute format('revoke all on table public.%I from public,anon',t);
    execute format('grant select,insert,update,delete on table public.%I to authenticated',t);
  end loop;
end
$$;

create or replace function public.garantir_catalogo_comodidades_vitrine()
returns integer language plpgsql security definer set search_path=public
as $$
declare v_owner uuid:=public.usuario_proprietario_id(auth.uid()); v_total integer;
begin
  if v_owner is null or not public.vitrine_pode_operar(auth.uid()) then
    raise exception 'Conta sem permissao para administrar a Vitrine.';
  end if;
  insert into public.vitrine_comodidades_catalogo(user_id,codigo,rotulo,grupo,ordem,tipos_aplicaveis)
  select v_owner,x.codigo,x.rotulo,x.grupo,x.ordem,x.tipos
  from (values
    ('varanda','Varanda','imovel',10,'[]'::jsonb),
    ('closet','Closet','imovel',20,'["casa","apartamento","sobrado"]'::jsonb),
    ('lavabo','Lavabo','imovel',30,'[]'::jsonb),
    ('despensa','Despensa','imovel',40,'[]'::jsonb),
    ('elevador','Elevador','condominio',110,'["apartamento","comercial"]'::jsonb),
    ('portaria_24h','Portaria 24h','condominio',120,'["apartamento","comercial"]'::jsonb),
    ('piscina','Piscina','condominio',130,'[]'::jsonb),
    ('academia','Academia','condominio',140,'[]'::jsonb),
    ('transporte_proximo','Transporte proximo','regiao',210,'[]'::jsonb),
    ('comercio_proximo','Comercio proximo','regiao',220,'[]'::jsonb),
    ('acesso_caminhao','Acesso para caminhao','terreno',260,'["terreno"]'::jsonb),
    ('poco','Poco','terreno',270,'["terreno"]'::jsonb),
    ('nascente','Nascente','terreno',280,'["terreno"]'::jsonb),
    ('acesso_cadeirante','Acesso para cadeirante','acessibilidade',310,'[]'::jsonb),
    ('elevador_acessivel','Elevador acessivel','acessibilidade',320,'[]'::jsonb),
    ('energia_solar','Energia solar','sustentabilidade',410,'[]'::jsonb),
    ('reuso_agua','Reuso de agua','sustentabilidade',420,'[]'::jsonb)
  ) as x(codigo,rotulo,grupo,ordem,tipos)
  on conflict(user_id,codigo) do nothing;
  select count(*) into v_total from public.vitrine_comodidades_catalogo where user_id=v_owner;
  return v_total;
end
$$;
revoke all on function public.garantir_catalogo_comodidades_vitrine() from public,anon;
grant execute on function public.garantir_catalogo_comodidades_vitrine() to authenticated;

create or replace function public.salvar_relacoes_fundacao_vitrine(
  p_imovel_id uuid,p_comodidades text[],p_documentacao jsonb
)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_owner uuid:=public.usuario_proprietario_id(auth.uid()); v_comodidades integer; v_documentos integer;
begin
  if v_owner is null or not public.vitrine_pode_operar(auth.uid())
     or not exists(select 1 from public.vitrine_imoveis where id=p_imovel_id and user_id=v_owner) then
    raise exception 'Anuncio ausente ou sem permissao para editar.';
  end if;
  if jsonb_typeof(coalesce(p_documentacao,'[]'::jsonb))<>'array' then
    raise exception 'Documentacao da Vitrine invalida.';
  end if;

  delete from public.vitrine_imovel_comodidades where user_id=v_owner and imovel_id=p_imovel_id;
  insert into public.vitrine_imovel_comodidades(user_id,imovel_id,comodidade_id)
  select v_owner,p_imovel_id,c.id from public.vitrine_comodidades_catalogo c
  where c.user_id=v_owner and c.codigo=any(coalesce(p_comodidades,'{}'::text[]));
  get diagnostics v_comodidades=row_count;

  delete from public.vitrine_documentacao_imovel where user_id=v_owner and imovel_id=p_imovel_id;
  insert into public.vitrine_documentacao_imovel(user_id,imovel_id,tipo,estado,observacao_privada)
  select v_owner,p_imovel_id,d.tipo,d.estado,left(coalesce(d.observacao_privada,''),2000)
  from jsonb_to_recordset(coalesce(p_documentacao,'[]'::jsonb))
    as d(tipo text,estado text,observacao_privada text);
  get diagnostics v_documentos=row_count;

  return jsonb_build_object('comodidades',v_comodidades,'documentos',v_documentos);
end
$$;
revoke all on function public.salvar_relacoes_fundacao_vitrine(uuid,text[],jsonb) from public,anon;
grant execute on function public.salvar_relacoes_fundacao_vitrine(uuid,text[],jsonb) to authenticated;

-- ------------------------------------------------------------
-- 3. LEITURA PUBLICA V2
-- Reaproveita integralmente o JSON vigente e apenas enriquece cada item.
-- observacao_privada e observacao da documentacao nunca entram no JSON.
-- ------------------------------------------------------------
create or replace function public.listar_vitrine_publica_v2(p_slug text)
returns jsonb language sql stable security definer set search_path=public
as $$
  with base as (select public.listar_vitrine_publica(p_slug) dados),
  itens as (
    select elem,ord from base,
      jsonb_array_elements(coalesce(dados->'imoveis','[]'::jsonb)) with ordinality a(elem,ord)
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
        'codigo',c.codigo,'rotulo',c.rotulo,'grupo',c.grupo) order by c.grupo,c.ordem,c.rotulo)
        from public.vitrine_imovel_comodidades l
        join public.vitrine_comodidades_catalogo c on c.id=l.comodidade_id
        where l.imovel_id=i.id and c.ativo),'[]'::jsonb),
      'documentacao',coalesce((select jsonb_agg(jsonb_build_object(
        'tipo',d.tipo,'estado',d.estado) order by d.tipo)
        from public.vitrine_documentacao_imovel d where d.imovel_id=i.id),'[]'::jsonb)
    ) item
    from itens join public.vitrine_imoveis i on i.id=(elem->>'id')::uuid
  )
  select jsonb_set(base.dados,'{imoveis}',coalesce((select jsonb_agg(item order by ord) from enriquecidos),'[]'::jsonb),true)
  from base
$$;
revoke all on function public.listar_vitrine_publica_v2(text) from public;
grant execute on function public.listar_vitrine_publica_v2(text) to anon,authenticated;

-- ------------------------------------------------------------
-- 4. BACKUP V8 ATOMICO
-- O V7 continua responsavel pela area de alugueis. Como a chamada ocorre
-- dentro desta funcao, qualquer falha posterior desfaz as duas partes.
-- ------------------------------------------------------------
create or replace function public.importar_backup_atomico_v8(
  p_payload jsonb,p_substituir boolean default false
)
returns void language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  v_actor uuid:=auth.uid();
  v_owner uuid:=public.usuario_proprietario_id(auth.uid());
  x jsonb; v_src uuid; v_target uuid; v_parent uuid; v_catalog uuid;
  v_code text; v_slug text;
begin
  if v_actor is null or v_owner is null or public.papel_colaborador_atual(v_actor) is distinct from 'administrador' then
    raise exception 'Somente um administrador desta conta pode importar backup.';
  end if;
  if p_payload ? 'vitrine' and jsonb_typeof(p_payload->'vitrine')<>'object' then
    raise exception 'A secao vitrine do backup e invalida.';
  end if;

  perform public.importar_backup_atomico_v7(p_payload-'vitrine',p_substituir);

  if not (p_payload ? 'vitrine') then return; end if;

  if p_substituir and (
    exists(select 1 from public.vitrine_fotos where user_id=v_owner)
    or exists(select 1 from public.vitrine_leads where user_id=v_owner)
    or exists(select 1 from public.vitrine_taxas where user_id=v_owner)
  ) then
    raise exception 'Restauracao bloqueada: fotos, leads ou taxas da Vitrine ainda nao fazem parte do Backup V8.';
  end if;

  if p_substituir then
    delete from public.vitrine_documentacao_imovel where user_id=v_owner;
    delete from public.vitrine_imovel_comodidades where user_id=v_owner;
    delete from public.vitrine_comodidades_catalogo where user_id=v_owner;
    delete from public.vitrine_imoveis where user_id=v_owner;
    delete from public.vitrine_anunciantes where user_id=v_owner;
    delete from public.vitrine_cidades where user_id=v_owner;
  end if;

  create temporary table if not exists import_v8_cidades(src uuid primary key,target uuid not null) on commit drop;
  create temporary table if not exists import_v8_anunciantes(src uuid primary key,target uuid not null) on commit drop;
  create temporary table if not exists import_v8_imoveis(src uuid primary key,target uuid not null) on commit drop;
  create temporary table if not exists import_v8_comodidades(src uuid primary key,target uuid not null) on commit drop;
  truncate import_v8_cidades,import_v8_anunciantes,import_v8_imoveis,import_v8_comodidades;

  for x in select * from jsonb_array_elements(coalesce(p_payload#>'{vitrine,cidades}','[]'::jsonb)) loop
    v_src=(x->>'id')::uuid;
    v_slug=left(coalesce(nullif(x->>'slug',''),'cidade-'||substr(v_src::text,1,8)),60);
    v_target=null;
    select id into v_target from public.vitrine_cidades
      where user_id=v_owner and (id=v_src or slug=v_slug) order by (id=v_src) desc limit 1;
    if v_target is null then
      v_target=case when exists(select 1 from public.vitrine_cidades where id=v_src) then gen_random_uuid() else v_src end;
      insert into public.vitrine_cidades(id,user_id,nome,uf,slug,ordem,ativa)
      values(v_target,v_owner,left(coalesce(x->>'nome','Cidade'),120),upper(left(coalesce(x->>'uf','PE'),2)),
        v_slug,coalesce((x->>'ordem')::int,0),coalesce((x->>'ativa')::boolean,true));
    end if;
    insert into import_v8_cidades values(v_src,v_target);
  end loop;

  for x in select * from jsonb_array_elements(coalesce(p_payload#>'{vitrine,anunciantes}','[]'::jsonb)) loop
    v_src=(x->>'id')::uuid; v_target=null;
    select id into v_target from public.vitrine_anunciantes where user_id=v_owner and id=v_src;
    if v_target is null then
      v_target=case when exists(select 1 from public.vitrine_anunciantes where id=v_src) then gen_random_uuid() else v_src end;
      insert into public.vitrine_anunciantes(id,user_id,nome,telefone,email,documento,observacoes,proprietario_cliente_id)
      values(v_target,v_owner,left(coalesce(x->>'nome','Anunciante'),160),left(coalesce(x->>'telefone',''),40),
        left(coalesce(x->>'email',''),180),left(coalesce(x->>'documento',''),80),left(coalesce(x->>'observacoes',''),2000),
        case when nullif(x->>'proprietario_cliente_id','') is null then null
          else (select target_id from pg_temp.import_v7_owners where src_id=(x->>'proprietario_cliente_id')::uuid) end);
    end if;
    insert into import_v8_anunciantes values(v_src,v_target);
  end loop;

  for x in select * from jsonb_array_elements(coalesce(p_payload#>'{vitrine,imoveis}','[]'::jsonb)) loop
    v_src=(x->>'id')::uuid; v_target=case when exists(select 1 from public.vitrine_imoveis where id=v_src) then gen_random_uuid() else v_src end;
    v_code=left(coalesce(nullif(x->>'codigo',''),'A-'||substr(v_target::text,1,8)),80);
    if exists(select 1 from public.vitrine_imoveis where user_id=v_owner and codigo=v_code) then
      v_code=left(v_code,67)||'-'||substr(v_target::text,1,8);
    end if;
    insert into import_v8_imoveis values(v_src,v_target);
    insert into public.vitrine_imoveis(
      id,user_id,anunciante_id,cidade_id,codigo,titulo,tipo,finalidade,aluguel,preco_venda,condominio,iptu,
      quartos,suites,banheiros,vagas,area_m2,area_util_m2,area_total_m2,andar,total_andares,idade_anos,ano_construcao,
      conservacao,mobiliado,aceita_pet,quintal,area_servico,frente_m,fundo_m,murado,esquina,topografia,
      pavimentacao,agua_disponivel,energia_disponivel,esgoto_disponivel,aptidoes_terreno,
      exige_fiador,caucao,contrato_minimo_meses,garantias_aceitas,indice_reajuste,custos_inclusos,
      aceita_estudante,aceita_pessoa_juridica,aceita_crianca,permite_sublocacao,aceita_financiamento,aceita_permuta,
      situacao_ocupacao,disponivel_em,descricao,observacao_privada,cep,logradouro,numero,bairro,cidade,uf,
      latitude,longitude,endereco_exato_publico,endereco_publico_modo,latitude_publica,longitude_publica,
      pontos_interesse,status,destaque,publicado_em,expira_em,created_at,updated_at)
    values(
      v_target,v_owner,(select target from import_v8_anunciantes where src=(x->>'anunciante_id')::uuid),
      (select target from import_v8_cidades where src=(x->>'cidade_id')::uuid),v_code,
      left(coalesce(x->>'titulo','Imovel'),160),coalesce(x->>'tipo','casa'),coalesce(x->>'finalidade','alugar'),
      coalesce((x->>'aluguel')::numeric,0),coalesce((x->>'preco_venda')::numeric,0),coalesce((x->>'condominio')::numeric,0),coalesce((x->>'iptu')::numeric,0),
      coalesce((x->>'quartos')::int,0),coalesce((x->>'suites')::int,0),coalesce((x->>'banheiros')::int,0),coalesce((x->>'vagas')::int,0),
      coalesce((x->>'area_m2')::numeric,0),(x->>'area_util_m2')::numeric,(x->>'area_total_m2')::numeric,coalesce((x->>'andar')::int,0),
      (x->>'total_andares')::int,(x->>'idade_anos')::int,(x->>'ano_construcao')::int,coalesce(x->>'conservacao',''),
      coalesce((x->>'mobiliado')::boolean,false),coalesce((x->>'aceita_pet')::boolean,false),coalesce((x->>'quintal')::boolean,false),coalesce((x->>'area_servico')::boolean,false),
      (x->>'frente_m')::numeric,(x->>'fundo_m')::numeric,coalesce((x->>'murado')::boolean,false),coalesce((x->>'esquina')::boolean,false),coalesce(x->>'topografia',''),
      (x->>'pavimentacao')::boolean,(x->>'agua_disponivel')::boolean,(x->>'energia_disponivel')::boolean,(x->>'esgoto_disponivel')::boolean,
      coalesce(array(select jsonb_array_elements_text(coalesce(x->'aptidoes_terreno','[]'::jsonb))),'{}'),
      coalesce((x->>'exige_fiador')::boolean,false),coalesce(x->>'caucao',''),coalesce((x->>'contrato_minimo_meses')::int,12),
      coalesce(array(select jsonb_array_elements_text(coalesce(x->'garantias_aceitas','[]'::jsonb))),'{}'),coalesce(x->>'indice_reajuste',''),
      coalesce(array(select jsonb_array_elements_text(coalesce(x->'custos_inclusos','[]'::jsonb))),'{}'),
      (x->>'aceita_estudante')::boolean,(x->>'aceita_pessoa_juridica')::boolean,(x->>'aceita_crianca')::boolean,(x->>'permite_sublocacao')::boolean,
      (x->>'aceita_financiamento')::boolean,(x->>'aceita_permuta')::boolean,coalesce(x->>'situacao_ocupacao',''),(x->>'disponivel_em')::date,
      left(coalesce(x->>'descricao',''),8000),left(coalesce(x->>'observacao_privada',''),8000),left(coalesce(x->>'cep',''),20),
      left(coalesce(x->>'logradouro',''),300),left(coalesce(x->>'numero',''),40),left(coalesce(x->>'bairro',''),160),left(coalesce(x->>'cidade',''),120),left(coalesce(x->>'uf',''),2),
      (x->>'latitude')::numeric,(x->>'longitude')::numeric,coalesce((x->>'endereco_exato_publico')::boolean,true),coalesce(x->>'endereco_publico_modo','exato'),
      (x->>'latitude_publica')::numeric,(x->>'longitude_publica')::numeric,coalesce(x->'pontos_interesse','[]'::jsonb),coalesce(x->>'status','rascunho'),
      coalesce((x->>'destaque')::boolean,false),(x->>'publicado_em')::timestamptz,(x->>'expira_em')::date,
      coalesce((x->>'created_at')::timestamptz,now()),coalesce((x->>'updated_at')::timestamptz,now()));
  end loop;

  for x in select * from jsonb_array_elements(coalesce(p_payload#>'{vitrine,comodidades_catalogo}','[]'::jsonb)) loop
    v_src=(x->>'id')::uuid; v_target=null;
    select id into v_target from public.vitrine_comodidades_catalogo
      where user_id=v_owner and (id=v_src or codigo=x->>'codigo') order by (id=v_src) desc limit 1;
    if v_target is null then
      v_target=case when exists(select 1 from public.vitrine_comodidades_catalogo where id=v_src) then gen_random_uuid() else v_src end;
      insert into public.vitrine_comodidades_catalogo(id,user_id,codigo,rotulo,grupo,ordem,ativo,tipos_aplicaveis)
      values(v_target,v_owner,left(x->>'codigo',60),left(x->>'rotulo',120),x->>'grupo',coalesce((x->>'ordem')::int,0),coalesce((x->>'ativo')::boolean,true),coalesce(x->'tipos_aplicaveis','[]'::jsonb));
    end if;
    insert into import_v8_comodidades values(v_src,v_target);
  end loop;

  insert into public.vitrine_imovel_comodidades(user_id,imovel_id,comodidade_id)
  select v_owner,im.target,cm.target
  from jsonb_to_recordset(coalesce(p_payload#>'{vitrine,imovel_comodidades}','[]'::jsonb)) as l(imovel_id uuid,comodidade_id uuid)
  join import_v8_imoveis im on im.src=l.imovel_id join import_v8_comodidades cm on cm.src=l.comodidade_id
  on conflict do nothing;

  insert into public.vitrine_documentacao_imovel(user_id,imovel_id,tipo,estado,observacao_privada)
  select v_owner,im.target,d.tipo,d.estado,left(coalesce(d.observacao_privada,''),2000)
  from jsonb_to_recordset(coalesce(p_payload#>'{vitrine,documentacao}','[]'::jsonb))
    as d(imovel_id uuid,tipo text,estado text,observacao_privada text)
  join import_v8_imoveis im on im.src=d.imovel_id
  on conflict(imovel_id,tipo) do update set estado=excluded.estado,observacao_privada=excluded.observacao_privada,updated_at=now();
end
$$;
revoke all on function public.importar_backup_atomico_v8(jsonb,boolean) from public,anon;
grant execute on function public.importar_backup_atomico_v8(jsonb,boolean) to authenticated;

do $$
begin
  if (select count(*) from information_schema.columns where table_schema='public' and table_name='vitrine_imoveis'
      and column_name in ('area_util_m2','total_andares','ano_construcao','disponivel_em','endereco_publico_modo',
      'garantias_aceitas','indice_reajuste','situacao_ocupacao','observacao_privada','aptidoes_terreno'))<>10 then
    raise exception 'Fundacao incompleta: colunas esperadas nao foram criadas.';
  end if;
end
$$;

do $$
begin
  if to_regprocedure('public.registrar_migracao(text,text)') is not null then
    perform public.registrar_migracao(
      'migracao-vitrine-fundacao.sql',
      'Etapa 1: campos, comodidades, documentacao, leitura publica V2 e Backup V8'
    );
  end if;
end
$$;

commit;
