-- =====================================================================
-- Importacao atomica do backup normalizado v7
--
-- Pre-requisitos:
--   1. migracao-portal-arquivos.sql
--   2. migracao-vistoria-e-chamados.sql
--   3. migracao-financeiro-v2.sql
--   4. migracao-imovel-tipo.sql      (coluna imoveis.tipo)
--   5. migracao-inquilino-rg.sql     (coluna inquilinos.rg)
--   6. migracao-proprietario-cliente.sql (tabela proprietarios_clientes)
--
-- REVISAO DE 31/07/2026 — leia antes de mexer:
--   A restauracao APAGA tudo da conta e reinsere a partir do retrato, com
--   LISTA EXPLICITA DE COLUNAS. Duas colunas criadas depois desta rotina
--   ficaram de fora dela e eram perdidas em silencio a cada restauracao:
--   imoveis.tipo e inquilinos.rg. Ambas entraram agora.
--
--   REGRA QUE FICA: toda coluna nova em imoveis, inquilinos, contratos,
--   pagamentos, despesas, energia ou interessados precisa entrar aqui no
--   MESMO dia em que e criada — na lista de colunas, no jsonb_to_recordset
--   e no "on conflict do update". Uma coluna esquecida aqui nao quebra
--   nada: ela simplesmente desaparece no pior dia do cliente.
--
--   Este arquivo e reexecutavel. Depois desta revisao, rode-o de novo em
--   todo banco que ja tinha recebido a versao anterior.
--
--   A mesma revisao acrescentou a tabela backups_importados: a importacao
--   ADICIONA registros, e importar o mesmo arquivo duas vezes duplicava a
--   carteira inteira. Agora a exportacao carrega um identificador e a
--   segunda tentativa e recusada — so no modo "adicionar". Substituir e
--   idempotente por natureza e continua livre.
--
-- O cliente normaliza e remapeia os IDs antes de chamar a RPC. Ainda assim,
-- esta funcao volta a proteger colisões globais de UUID e mantem mapas
-- temporarios para que todas as referencias usem o ID efetivamente gravado.
--
-- Uma chamada de funcao PostgreSQL participa de uma unica transacao: qualquer
-- excecao desfaz tanto a substituicao quanto todas as insercoes posteriores.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Exportacoes ja importadas nesta conta
--
-- A importacao ADICIONA registros. Importar o mesmo arquivo duas vezes
-- duplicava imoveis, pessoas e lancamentos, e a unica protecao era uma
-- frase na tela pedindo para nao fazer isso — que e exatamente o tipo de
-- protecao que falha no dia em que a pessoa esta com pressa.
--
-- Vale so para o modo "adicionar". Substituir e idempotente por natureza:
-- restaurar o mesmo retrato duas vezes e legitimo e nao pode ser barrado.
--
-- Arquivo antigo, sem export_id, continua aceito: ele so nao fica
-- protegido contra repeticao. Recusar backups ja baixados seria trocar um
-- risco de duplicidade por um risco de nao conseguir restaurar.
-- ---------------------------------------------------------------------
create table if not exists public.backups_importados (
  user_id       uuid not null references auth.users(id) on delete cascade,
  export_id     uuid not null,
  importado_em  timestamptz not null default now(),
  exportado_em  timestamptz,
  primary key (user_id, export_id)
);

alter table public.backups_importados enable row level security;
alter table public.backups_importados force row level security;

drop policy if exists backups_importados_dono on public.backups_importados;
create policy backups_importados_dono on public.backups_importados
  for select to authenticated
  using (user_id = public.usuario_proprietario_id(auth.uid()));

revoke all on table public.backups_importados from public, anon;
grant select on table public.backups_importados to authenticated;

create or replace function public.importar_backup_atomico_v7(
  p_payload jsonb,
  p_substituir boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_role text;
  v_version_text text;
  v_version integer;
  v_key text;
  v_plan text;
  v_house_limit integer;
  v_house_total integer;
  v_storage_limit bigint;
  v_storage_current bigint;
  v_storage_incoming numeric := 0;
  v_count bigint;

  v_item jsonb;
  v_src uuid;
  v_target uuid;
  v_house uuid;
  v_contract uuid;
  v_tenant uuid;
  v_expense uuid;
  v_charge uuid;
  v_origin uuid;
  v_origin_type text;
  v_type text;
  v_insert_type text;
  v_competence text;
  v_export text;
  v_archived_at timestamptz;
  v_archive_reason text;
  v_confirmed_at timestamptz;
  v_confirmed_by uuid;
  v_matches integer;
begin
  -- -------------------------------------------------------------------
  -- 1. Identidade, papel e formato geral
  -- -------------------------------------------------------------------
  if v_actor is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  v_owner := public.usuario_proprietario_id(v_actor);
  v_role := public.papel_colaborador_atual(v_actor);

  if v_owner is null
     or v_role is distinct from 'administrador'
     or public.usuario_proprietario_id(v_actor) is distinct from v_owner then
    raise exception 'Somente um administrador desta conta pode importar backup.';
  end if;

  if not public.e_acesso_operacional(v_owner) then
    raise exception 'Acesso comercial inativo ou termos pendentes.';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Backup invalido.';
  end if;

  -- normalizeBackupForImport atualmente remove "version" do objeto final.
  -- Ausencia significa, portanto, o payload normalizado corrente (v7).
  v_version_text := nullif(p_payload->>'version', '');
  if v_version_text is null then
    v_version := 7;
  elsif v_version_text !~ '^[0-9]+$' then
    raise exception 'Versao de backup invalida.';
  else
    v_version := v_version_text::integer;
  end if;

  if v_version < 1 or v_version > 7 then
    raise exception 'Esta funcao aceita somente backups das versoes 1 a 7.';
  end if;

  -- Mesma exportacao, duas vezes, no modo "adicionar": recusa antes de
  -- gravar qualquer linha. No modo "substituir" nao ha o que duplicar.
  v_export := nullif(p_payload->>'export_id','');
  if not p_substituir and v_export is not null then
    if exists (
      select 1 from public.backups_importados b
      where b.user_id = v_owner and b.export_id = v_export::uuid
    ) then
      raise exception
        'Esta exportacao ja foi importada nesta conta em %. Importar de novo duplicaria imoveis, pessoas e lancamentos.',
        to_char(
          (select b.importado_em from public.backups_importados b
            where b.user_id = v_owner and b.export_id = v_export::uuid),
          'DD/MM/YYYY HH24:MI'
        );
    end if;
  end if;

  foreach v_key in array array[
    'owners','tenants','houses','contracts','adjustments','charges','payments',
    'energy','receipts','expenses','maintenance','history','photos',
    'documents','interests','events'
  ]
  loop
    if p_payload ? v_key
       and jsonb_typeof(p_payload->v_key) <> 'array' then
      raise exception 'A secao "%" do backup deve ser uma lista.', v_key;
    end if;
  end loop;

  if p_payload ? 'config'
     and jsonb_typeof(p_payload->'config') not in ('object','null') then
    raise exception 'A secao "config" do backup e invalida.';
  end if;

  -- Limites iguais ou mais estritos que os aceitos pelo normalizador atual.
  if jsonb_array_length(coalesce(p_payload->'houses','[]'::jsonb)) > 500
     or jsonb_array_length(coalesce(p_payload->'owners','[]'::jsonb)) > 2000
     or jsonb_array_length(coalesce(p_payload->'tenants','[]'::jsonb)) > 2000
     or jsonb_array_length(coalesce(p_payload->'contracts','[]'::jsonb)) > 5000
     or jsonb_array_length(coalesce(p_payload->'interests','[]'::jsonb)) > 5000
     or jsonb_array_length(coalesce(p_payload->'events','[]'::jsonb)) > 10000
     or jsonb_array_length(coalesce(p_payload->'documents','[]'::jsonb)) > 5000
     or jsonb_array_length(coalesce(p_payload->'photos','[]'::jsonb)) > 50000 then
    raise exception 'O backup ultrapassa o limite seguro de registros.';
  end if;

  if jsonb_array_length(coalesce(p_payload->'payments','[]'::jsonb)) > 50000
     or jsonb_array_length(coalesce(p_payload->'energy','[]'::jsonb)) > 50000
     or jsonb_array_length(coalesce(p_payload->'expenses','[]'::jsonb)) > 50000
     or jsonb_array_length(coalesce(p_payload->'maintenance','[]'::jsonb)) > 50000
     or jsonb_array_length(coalesce(p_payload->'history','[]'::jsonb)) > 50000
     or jsonb_array_length(coalesce(p_payload->'adjustments','[]'::jsonb)) > 50000
     or jsonb_array_length(coalesce(p_payload->'charges','[]'::jsonb)) > 50000
     or jsonb_array_length(coalesce(p_payload->'receipts','[]'::jsonb)) > 100000 then
    raise exception 'O backup ultrapassa o limite seguro de movimentacoes.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(
      coalesce(p_payload->'photos','[]'::jsonb)
    ) as f(item)
    where jsonb_typeof(item) <> 'object'
       or length(coalesce(item->>'dados',''))>2500000
       or coalesce(item->>'dados','') !~*
         '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$'
  ) then
    raise exception 'O backup possui uma foto invalida ou grande demais.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(
      coalesce(p_payload->'documents','[]'::jsonb)
    ) as f(item)
    where jsonb_typeof(item) <> 'object'
       or length(coalesce(item->>'dados',''))>22000000
       or coalesce(item->>'dados','') !~*
         '^data:(application/pdf|image/(jpeg|png|webp));base64,[A-Za-z0-9+/]+={0,2}$'
  ) then
    raise exception 'O backup possui um documento invalido ou grande demais.';
  end if;

  -- A RPC e a fronteira de seguranca: a cota usa os bytes decodificados,
  -- nunca o campo "tamanho" declarado pelo cliente.
  select coalesce(
      sum(
        octet_length(
          decode(split_part(item->>'dados',',',2),'base64')
        )::numeric
      ),
      0
    )
    into v_storage_incoming
  from jsonb_array_elements(
    coalesce(p_payload->'photos','[]'::jsonb)
    || coalesce(p_payload->'documents','[]'::jsonb)
  ) as f(item);

  if v_storage_incoming > 9223372036854775807::numeric then
    raise exception 'O backup ultrapassa o limite seguro de armazenamento.';
  end if;

  select a.plano
    into v_plan
  from public.assinaturas a
  where a.user_id=v_owner
    and a.status='ativa'
  order by a.ativada_em desc nulls last
  limit 1;

  if public.e_administrador_plataforma(v_actor) then
    v_house_limit := 100;
    v_storage_limit := 10737418240::bigint;
  else
    v_house_limit :=
      public.limite_casas_plano(coalesce(v_plan,'gratuito'));
    v_storage_limit :=
      public.limite_armazenamento_plano(coalesce(v_plan,'gratuito'));
  end if;

  v_storage_current := case
    when p_substituir then 0
    else public.armazenamento_usado(v_owner)
  end;

  if v_storage_current::numeric + v_storage_incoming
     > v_storage_limit::numeric then
    raise exception 'Backup acima do limite de armazenamento da conta.';
  end if;

  -- Estas estruturas ainda nao fazem parte do formato V7. Uma substituicao
  -- nao pode apaga-las silenciosamente, nem mesmo quando a RPC for chamada
  -- diretamente sem passar pela verificacao equivalente do aplicativo.
  if p_substituir and (
    exists(
      select 1 from public.vistorias v where v.user_id=v_owner
    )
    or exists(
      select 1 from public.vistoria_fotos f where f.user_id=v_owner
    )
    or exists(
      select 1 from public.chamado_fotos f where f.user_id=v_owner
    )
    or exists(
      select 1
      from public.acessos_inquilino a
      where a.proprietario_id=v_owner
    )
    or exists(
      select 1
      from public.convites_inquilino c
      where c.proprietario_id=v_owner
    )
  ) then
    raise exception
      'Restauracao bloqueada: ha vistorias, fotos de chamados, convites ou acessos do Portal que o backup V7 ainda nao representa.';
  end if;

  -- -------------------------------------------------------------------
  -- 2. Mapas de IDs principais
  -- Um UUID existente na mesma conta e reutilizado (idempotencia).
  -- Um UUID pertencente a outra conta e substituido por gen_random_uuid().
  -- -------------------------------------------------------------------
  drop table if exists pg_temp.import_v7_owners;
  drop table if exists pg_temp.import_v7_tenants;
  drop table if exists pg_temp.import_v7_houses;
  drop table if exists pg_temp.import_v7_contracts;
  drop table if exists pg_temp.import_v7_expenses;
  drop table if exists pg_temp.import_v7_interests;
  drop table if exists pg_temp.import_v7_maintenance;
  drop table if exists pg_temp.import_v7_payments;
  drop table if exists pg_temp.import_v7_energy;
  drop table if exists pg_temp.import_v7_charges;
  drop table if exists pg_temp.import_v7_receipts;
  drop table if exists pg_temp.import_v7_adjustments;

  -- Proprietarios-clientes: os donos dos imoveis que a corretora
  -- administra. Entram no backup porque `imoveis.proprietario_cliente_id`
  -- aponta para eles — sem esta secao, restaurar apagaria o vinculo.
  create temporary table import_v7_owners(
    src_id uuid primary key,
    target_id uuid not null unique,
    archived_at timestamptz,
    archive_reason text not null default ''
  ) on commit drop;

  create temporary table import_v7_tenants(
    src_id uuid primary key,
    target_id uuid not null unique,
    archived_at timestamptz,
    archive_reason text not null default ''
  ) on commit drop;

  create temporary table import_v7_houses(
    src_id uuid primary key,
    target_id uuid not null unique,
    archived_at timestamptz,
    archive_reason text not null default ''
  ) on commit drop;

  create temporary table import_v7_contracts(
    src_id uuid primary key,
    target_id uuid not null unique,
    archived_at timestamptz,
    archive_reason text not null default ''
  ) on commit drop;

  create temporary table import_v7_expenses(
    src_id uuid primary key,
    target_id uuid not null unique,
    archived_at timestamptz,
    archive_reason text not null default ''
  ) on commit drop;

  create temporary table import_v7_interests(
    src_id uuid primary key,
    target_id uuid not null unique
  ) on commit drop;

  create temporary table import_v7_maintenance(
    src_id uuid primary key,
    target_id uuid not null unique
  ) on commit drop;

  insert into pg_temp.import_v7_owners(
    src_id,target_id,archived_at,archive_reason
  )
  select
    x.id,
    case
      when exists(
        select 1 from public.proprietarios_clientes o
        where o.id=x.id and o.user_id=v_owner
      ) then x.id
      when exists(select 1 from public.proprietarios_clientes o where o.id=x.id)
        then gen_random_uuid()
      else x.id
    end,
    x.arquivado_em,
    coalesce(x.motivo_arquivamento,'')
  from jsonb_to_recordset(
    coalesce(p_payload->'owners','[]'::jsonb)
  ) as x(
    id uuid,
    arquivado_em timestamptz,
    motivo_arquivamento text
  );

  insert into pg_temp.import_v7_tenants(
    src_id,target_id,archived_at,archive_reason
  )
  select
    x.id,
    case
      when exists(
        select 1 from public.inquilinos t
        where t.id=x.id and t.user_id=v_owner
      ) then x.id
      when exists(select 1 from public.inquilinos t where t.id=x.id)
        then gen_random_uuid()
      else x.id
    end,
    x.arquivado_em,
    coalesce(x.motivo_arquivamento,'')
  from jsonb_to_recordset(
    coalesce(p_payload->'tenants','[]'::jsonb)
  ) as x(
    id uuid,
    arquivado_em timestamptz,
    motivo_arquivamento text
  );

  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(
    coalesce(p_payload->'tenants','[]'::jsonb)
  ) then
    raise exception 'Ha inquilino sem ID no backup.';
  end if;

  insert into pg_temp.import_v7_houses(
    src_id,target_id,archived_at,archive_reason
  )
  select
    x.id,
    case
      when exists(
        select 1 from public.imoveis i
        where i.id=x.id and i.user_id=v_owner
      ) then x.id
      when exists(select 1 from public.imoveis i where i.id=x.id)
        then gen_random_uuid()
      else x.id
    end,
    x.arquivado_em,
    coalesce(x.motivo_arquivamento,'')
  from jsonb_to_recordset(
    coalesce(p_payload->'houses','[]'::jsonb)
  ) as x(
    id uuid,
    arquivado_em timestamptz,
    motivo_arquivamento text
  );

  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(
    coalesce(p_payload->'houses','[]'::jsonb)
  ) then
    raise exception 'Ha imovel sem ID no backup.';
  end if;

  insert into pg_temp.import_v7_contracts(
    src_id,target_id,archived_at,archive_reason
  )
  select
    x.id,
    case
      when exists(
        select 1 from public.contratos c
        where c.id=x.id and c.user_id=v_owner
      ) then x.id
      when exists(select 1 from public.contratos c where c.id=x.id)
        then gen_random_uuid()
      else x.id
    end,
    x.arquivado_em,
    coalesce(x.motivo_arquivamento,'')
  from jsonb_to_recordset(
    coalesce(p_payload->'contracts','[]'::jsonb)
  ) as x(
    id uuid,
    arquivado_em timestamptz,
    motivo_arquivamento text
  );

  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(
    coalesce(p_payload->'contracts','[]'::jsonb)
  ) then
    raise exception 'Ha contrato sem ID no backup.';
  end if;

  insert into pg_temp.import_v7_expenses(
    src_id,target_id,archived_at,archive_reason
  )
  select
    x.id,
    case
      when exists(
        select 1 from public.despesas d
        where d.id=x.id and d.user_id=v_owner
      ) then x.id
      when exists(select 1 from public.despesas d where d.id=x.id)
        then gen_random_uuid()
      else x.id
    end,
    x.arquivado_em,
    coalesce(x.motivo_arquivamento,'')
  from jsonb_to_recordset(
    coalesce(p_payload->'expenses','[]'::jsonb)
  ) as x(
    id uuid,
    arquivado_em timestamptz,
    motivo_arquivamento text
  );

  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(
    coalesce(p_payload->'expenses','[]'::jsonb)
  ) then
    raise exception 'Ha despesa sem ID no backup.';
  end if;

  insert into pg_temp.import_v7_interests(src_id,target_id)
  select
    x.id,
    case
      when exists(
        select 1 from public.interessados i
        where i.id=x.id and i.user_id=v_owner
      ) then x.id
      when exists(select 1 from public.interessados i where i.id=x.id)
        then gen_random_uuid()
      else x.id
    end
  from jsonb_to_recordset(
    coalesce(p_payload->'interests','[]'::jsonb)
  ) as x(id uuid);

  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(
    coalesce(p_payload->'interests','[]'::jsonb)
  ) then
    raise exception 'Ha interessado sem ID no backup.';
  end if;

  insert into pg_temp.import_v7_maintenance(src_id,target_id)
  select
    x.id,
    case
      when exists(
        select 1 from public.chamados c
        where c.id=x.id and c.user_id=v_owner
      ) then x.id
      when exists(select 1 from public.chamados c where c.id=x.id)
        then gen_random_uuid()
      else x.id
    end
  from jsonb_to_recordset(
    coalesce(p_payload->'maintenance','[]'::jsonb)
  ) as x(id uuid);

  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(
    coalesce(p_payload->'maintenance','[]'::jsonb)
  ) then
    raise exception 'Ha chamado sem ID no backup.';
  end if;

  select
    case
      when p_substituir then
        (select count(*) from pg_temp.import_v7_houses)
      else
        (select count(*) from public.imoveis i where i.user_id=v_owner)
        + (
          select count(*)
          from pg_temp.import_v7_houses m
          where not exists(
            select 1 from public.imoveis i
            where i.id=m.target_id and i.user_id=v_owner
          )
        )
    end
  into v_house_total;

  if v_house_total > v_house_limit then
    raise exception 'Backup acima do limite de imoveis da conta.';
  end if;

  -- Referencias que poderiam virar NULL silenciosamente sao rejeitadas.
  if exists(
    select 1
    from jsonb_to_recordset(
      coalesce(p_payload->'houses','[]'::jsonb)
    ) as x(tenant_id uuid)
    where x.tenant_id is not null
      and not exists(
        select 1 from pg_temp.import_v7_tenants m
        where m.src_id=x.tenant_id
      )
  ) then
    raise exception 'Um imovel aponta para inquilino ausente no backup.';
  end if;

  if exists(
    select 1
    from jsonb_to_recordset(
      coalesce(p_payload->'contracts','[]'::jsonb)
    ) as x(imovel_id uuid,tenant_id uuid)
    where not exists(
            select 1 from pg_temp.import_v7_houses h
            where h.src_id=x.imovel_id
          )
       or not exists(
            select 1 from pg_temp.import_v7_tenants t
            where t.src_id=x.tenant_id
          )
  ) then
    raise exception 'Um contrato possui referencia ausente no backup.';
  end if;

  -- -------------------------------------------------------------------
  -- 3. Substituicao: filhos antes dos pais
  -- Os gatilhos legados podem executar durante DELETE; as tabelas V2 ja
  -- estao vazias quando isso ocorre, logo nao deixam cobrancas orfas.
  -- -------------------------------------------------------------------
  -- A propria RPC e a unica responsavel por reaplicar o estado arquivado do
  -- payload. O sinal e local a esta transacao e sempre e desligado no fim.
  perform set_config('app.alterando_arquivamento','1',true);
  perform set_config('app.restaurando_backup','1',true);

  if p_substituir then
    delete from public.chamado_fotos f
    using public.chamados c
    where f.chamado_id=c.id
      and c.user_id=v_owner;

    delete from public.chamados where user_id=v_owner;

    if to_regclass('public.vistoria_fotos') is not null then
      execute
        'delete from public.vistoria_fotos f using public.vistorias v ' ||
        'where f.vistoria_id=v.id and v.user_id=$1'
      using v_owner;
    end if;
    if to_regclass('public.vistorias') is not null then
      execute 'delete from public.vistorias where user_id=$1'
      using v_owner;
    end if;

    delete from public.financeiro_recebimentos where user_id=v_owner;
    delete from public.financeiro_cobrancas where user_id=v_owner;
    delete from public.fotos where user_id=v_owner;
    delete from public.documentos where user_id=v_owner;
    delete from public.historico_status where user_id=v_owner;
    delete from public.aluguel_historico where user_id=v_owner;
    delete from public.pagamentos where user_id=v_owner;
    delete from public.energia where user_id=v_owner;
    delete from public.despesas where user_id=v_owner;
    delete from public.contratos where user_id=v_owner;
    delete from public.eventos where user_id=v_owner;
    delete from public.interessados where user_id=v_owner;
    delete from public.imoveis where user_id=v_owner;
    delete from public.inquilinos where user_id=v_owner;
    -- Depois dos imoveis: eles apontam para ca.
    delete from public.proprietarios_clientes where user_id=v_owner;
  end if;

  -- -------------------------------------------------------------------
  -- 4. Cadastros-base: inquilinos, imoveis e contratos
  -- Tudo nasce ativo. O estado arquivado e reaplicado somente no final.
  -- -------------------------------------------------------------------
  -- Os proprietarios-clientes vem antes dos imoveis: a coluna
  -- proprietario_cliente_id aponta para ca.
  insert into public.proprietarios_clientes(
    id,user_id,nome,telefone,email,documento,
    pix_chave,banco,agencia,conta,taxa_administracao,observacoes,
    arquivado_em,arquivado_por,motivo_arquivamento,updated_at
  )
  select
    m.target_id,v_owner,x.nome,coalesce(x.telefone,''),
    coalesce(x.email,''),coalesce(x.documento,''),
    coalesce(x.pix_chave,''),coalesce(x.banco,''),
    coalesce(x.agencia,''),coalesce(x.conta,''),
    least(greatest(coalesce(x.taxa_administracao,0),0),100),
    coalesce(x.observacoes,''),null,null,'',now()
  from jsonb_to_recordset(
    coalesce(p_payload->'owners','[]'::jsonb)
  ) as x(
    id uuid,nome text,telefone text,email text,documento text,
    pix_chave text,banco text,agencia text,conta text,
    taxa_administracao numeric,observacoes text
  )
  join pg_temp.import_v7_owners m on m.src_id=x.id
  on conflict(id) do update set
    nome=excluded.nome,
    telefone=excluded.telefone,
    email=excluded.email,
    documento=excluded.documento,
    pix_chave=excluded.pix_chave,
    banco=excluded.banco,
    agencia=excluded.agencia,
    conta=excluded.conta,
    taxa_administracao=excluded.taxa_administracao,
    observacoes=excluded.observacoes,
    arquivado_em=null,
    arquivado_por=null,
    motivo_arquivamento='',
    updated_at=now()
  where public.proprietarios_clientes.user_id=v_owner;

  -- O "rg" entra aqui desde 31/07/2026. Ele foi acrescentado a inquilinos
  -- depois que esta rotina foi escrita e ficou de fora da lista de colunas:
  -- como a restauracao apaga tudo e reinsere, restaurar um backup apagava o
  -- RG de toda a carteira em silencio. Ver a nota no cabecalho do arquivo.
  insert into public.inquilinos(
    id,user_id,nome,telefone,email,documento,rg,emergencia_nome,
    arquivado_em,arquivado_por,motivo_arquivamento
  )
  select
    m.target_id,v_owner,x.nome,coalesce(x.telefone,''),
    coalesce(x.email,''),coalesce(x.documento,''),
    coalesce(x.rg,''),
    coalesce(x.emergencia_nome,''),null,null,''
  from jsonb_to_recordset(
    coalesce(p_payload->'tenants','[]'::jsonb)
  ) as x(
    id uuid,nome text,telefone text,email text,documento text,
    rg text,emergencia_nome text
  )
  join pg_temp.import_v7_tenants m on m.src_id=x.id
  on conflict(id) do update set
    nome=excluded.nome,
    telefone=excluded.telefone,
    email=excluded.email,
    documento=excluded.documento,
    rg=excluded.rg,
    emergencia_nome=excluded.emergencia_nome,
    arquivado_em=null,
    arquivado_por=null,
    motivo_arquivamento=''
  where public.inquilinos.user_id=v_owner;

  -- O "tipo" entra aqui desde 31/07/2026, pelo mesmo motivo do "rg" acima.
  -- O valor passa por uma checagem porque a coluna tem constraint: um
  -- arquivo de outra origem, com tipo desconhecido, cairia em "casa" em vez
  -- de abortar a restauracao inteira.
  insert into public.imoveis(
    id,user_id,nome,endereco,status,tipo,proprietario_cliente_id,
    aluguel_valor,dia_vencimento,
    ultima_vistoria,tenant_id,contrato_inicio,contrato_fim,
    quartos,banheiros,cozinha,sala,garagem,quintal,area_servico,
    energia_ativa,energia_dia_vencimento,publicado,descricao_publica,
    arquivado_em,arquivado_por,motivo_arquivamento
  )
  select
    m.target_id,v_owner,x.nome,coalesce(x.endereco,''),x.status,
    case when x.tipo in ('casa','apartamento','comercial','quarto','outro')
         then x.tipo else 'casa' end,
    om.target_id,
    coalesce(x.aluguel_valor,0),coalesce(x.dia_vencimento,5),
    x.ultima_vistoria,tm.target_id,x.contrato_inicio,x.contrato_fim,
    coalesce(x.quartos,0),coalesce(x.banheiros,0),
    coalesce(x.cozinha,false),coalesce(x.sala,false),
    coalesce(x.garagem,false),coalesce(x.quintal,false),
    coalesce(x.area_servico,false),coalesce(x.energia_ativa,true),
    coalesce(x.energia_dia_vencimento,5),
    coalesce(x.publicado,false),coalesce(x.descricao_publica,''),
    null,null,''
  from jsonb_to_recordset(
    coalesce(p_payload->'houses','[]'::jsonb)
  ) as x(
    id uuid,nome text,endereco text,status text,tipo text,
    proprietario_cliente_id uuid,
    aluguel_valor numeric,
    dia_vencimento integer,ultima_vistoria date,tenant_id uuid,
    contrato_inicio date,contrato_fim date,quartos integer,
    banheiros integer,cozinha boolean,sala boolean,garagem boolean,
    quintal boolean,area_servico boolean,energia_ativa boolean,
    energia_dia_vencimento integer,publicado boolean,
    descricao_publica text
  )
  join pg_temp.import_v7_houses m on m.src_id=x.id
  left join pg_temp.import_v7_tenants tm on tm.src_id=x.tenant_id
  left join pg_temp.import_v7_owners om on om.src_id=x.proprietario_cliente_id
  on conflict(id) do update set
    nome=excluded.nome,
    endereco=excluded.endereco,
    status=excluded.status,
    tipo=excluded.tipo,
    proprietario_cliente_id=excluded.proprietario_cliente_id,
    aluguel_valor=excluded.aluguel_valor,
    dia_vencimento=excluded.dia_vencimento,
    ultima_vistoria=excluded.ultima_vistoria,
    tenant_id=excluded.tenant_id,
    contrato_inicio=excluded.contrato_inicio,
    contrato_fim=excluded.contrato_fim,
    quartos=excluded.quartos,
    banheiros=excluded.banheiros,
    cozinha=excluded.cozinha,
    sala=excluded.sala,
    garagem=excluded.garagem,
    quintal=excluded.quintal,
    area_servico=excluded.area_servico,
    energia_ativa=excluded.energia_ativa,
    energia_dia_vencimento=excluded.energia_dia_vencimento,
    publicado=excluded.publicado,
    descricao_publica=excluded.descricao_publica,
    arquivado_em=null,
    arquivado_por=null,
    motivo_arquivamento='',
    updated_at=now()
  where public.imoveis.user_id=v_owner;

  -- O gatilho contrato_definir_valor_inicial reclassifica a origem
  -- "migracao_valor_atual" em todo INSERT. Ele e suspenso sob lock apenas
  -- durante esta instrucao para preservar exatamente valor_inicial_revisar
  -- e valor_inicial_origem. Em caso de erro, a transacao restaura o gatilho.
  execute
    'alter table public.contratos disable trigger contrato_definir_valor_inicial';
  begin
    insert into public.contratos(
      id,user_id,imovel_id,tenant_id,inicio,fim,valor,valor_inicial,
      valor_inicial_revisar,valor_inicial_origem,dia_vencimento,
      modalidade_vencimento,ativo,proporcional_dias,
      proporcional_valor,proporcional_pago,
      proporcional_data_pagamento,arquivado_em,arquivado_por,
      motivo_arquivamento
    )
    select
      m.target_id,v_owner,hm.target_id,tm.target_id,x.inicio,x.fim,
      coalesce(x.valor,x.valor_inicial,0),
      coalesce(x.valor_inicial,x.valor,0),
      coalesce(x.valor_inicial_revisar,false),
      coalesce(nullif(x.valor_inicial_origem,''),'cadastro_contrato'),
      coalesce(x.dia_vencimento,5),
      coalesce(x.modalidade_vencimento,'fixo'),
      coalesce(x.ativo,false),coalesce(x.proporcional_dias,0),
      coalesce(x.proporcional_valor,0),
      coalesce(x.proporcional_pago,false),
      x.proporcional_data_pagamento,null,null,''
    from jsonb_to_recordset(
      coalesce(p_payload->'contracts','[]'::jsonb)
    ) as x(
      id uuid,imovel_id uuid,tenant_id uuid,inicio date,fim date,
      valor numeric,valor_inicial numeric,
      valor_inicial_revisar boolean,valor_inicial_origem text,
      dia_vencimento integer,modalidade_vencimento text,ativo boolean,
      proporcional_dias integer,proporcional_valor numeric,
      proporcional_pago boolean,proporcional_data_pagamento date
    )
    join pg_temp.import_v7_contracts m on m.src_id=x.id
    join pg_temp.import_v7_houses hm on hm.src_id=x.imovel_id
    join pg_temp.import_v7_tenants tm on tm.src_id=x.tenant_id
    on conflict(id) do update set
      imovel_id=excluded.imovel_id,
      tenant_id=excluded.tenant_id,
      inicio=excluded.inicio,
      fim=excluded.fim,
      valor=excluded.valor,
      valor_inicial=excluded.valor_inicial,
      valor_inicial_revisar=excluded.valor_inicial_revisar,
      valor_inicial_origem=excluded.valor_inicial_origem,
      dia_vencimento=excluded.dia_vencimento,
      modalidade_vencimento=excluded.modalidade_vencimento,
      ativo=excluded.ativo,
      proporcional_dias=excluded.proporcional_dias,
      proporcional_valor=excluded.proporcional_valor,
      proporcional_pago=excluded.proporcional_pago,
      proporcional_data_pagamento=excluded.proporcional_data_pagamento,
      arquivado_em=null,
      arquivado_por=null,
      motivo_arquivamento='',
      updated_at=now()
    where public.contratos.user_id=v_owner;
  exception when others then
    execute
      'alter table public.contratos enable trigger contrato_definir_valor_inicial';
    raise;
  end;
  execute
    'alter table public.contratos enable trigger contrato_definir_valor_inicial';

  -- -------------------------------------------------------------------
  -- 5. Reajustes ativos ANTES de qualquer pagamento/energia
  -- O valor esperado usado pelos gatilhos legados passa a enxergar a linha
  -- do tempo restaurada. Reajustes ja arquivados sao guardados no mapa e
  -- inseridos arquivados somente na etapa final.
  -- -------------------------------------------------------------------
  create temporary table import_v7_adjustments(
    seq bigint primary key,
    target_id uuid not null unique,
    house_id uuid not null,
    contract_id uuid,
    valor numeric not null,
    data_inicio date not null,
    motivo text not null default '',
    confirmed_at timestamptz not null,
    confirmed_by uuid not null,
    archived_at timestamptz,
    archive_reason text not null default ''
  ) on commit drop;

  for v_item, v_count in
    select e.value, e.ordinality
    from jsonb_array_elements(
      coalesce(p_payload->'adjustments','[]'::jsonb)
    ) with ordinality as e(value,ordinality)
  loop
    select m.target_id into v_house
    from pg_temp.import_v7_houses m
    where m.src_id=(v_item->>'imovel_id')::uuid;
    if v_house is null then
      raise exception 'Um reajuste aponta para imovel ausente.';
    end if;

    v_contract := null;
    if nullif(v_item->>'contrato_id','') is not null then
      select m.target_id into v_contract
      from pg_temp.import_v7_contracts m
      where m.src_id=(v_item->>'contrato_id')::uuid;
      if v_contract is null then
        raise exception 'Um reajuste aponta para contrato ausente.';
      end if;
    end if;

    v_archived_at :=
      nullif(v_item->>'arquivado_em','')::timestamptz;
    v_archive_reason :=
      coalesce(v_item->>'motivo_arquivamento','');
    v_confirmed_at := coalesce(
      nullif(v_item->>'confirmado_em','')::timestamptz,
      now()
    );
    v_confirmed_by := nullif(v_item->>'confirmado_por','')::uuid;
    if v_confirmed_by is null
       or public.usuario_proprietario_id(v_confirmed_by)
          is distinct from v_owner then
      v_confirmed_by := v_actor;
    end if;

    if nullif(v_item->>'id','') is not null then
      v_src := (v_item->>'id')::uuid;
    else
      v_src := gen_random_uuid();
    end if;

    select h.id into v_target
    from public.aluguel_historico h
    where h.user_id=v_owner
      and (
        h.id=v_src
        or (
          v_archived_at is null
          and h.arquivado_em is null
          and h.imovel_id=v_house
          and h.contrato_id is not distinct from v_contract
          and h.data_inicio=date_trunc(
            'month',(v_item->>'data_inicio')::date
          )::date
        )
      )
    order by (h.id=v_src) desc
    limit 1;

    if v_target is null then
      if exists(
        select 1 from public.aluguel_historico h where h.id=v_src
      ) then
        v_target := gen_random_uuid();
      else
        v_target := v_src;
      end if;
    end if;

    insert into pg_temp.import_v7_adjustments(
      seq,target_id,house_id,contract_id,valor,data_inicio,motivo,
      confirmed_at,confirmed_by,archived_at,archive_reason
    )
    values(
      v_count,v_target,v_house,v_contract,
      coalesce((v_item->>'valor')::numeric,0),
      date_trunc('month',(v_item->>'data_inicio')::date)::date,
      coalesce(v_item->>'motivo',''),
      v_confirmed_at,v_confirmed_by,v_archived_at,v_archive_reason
    );

    if v_archived_at is null then
      insert into public.aluguel_historico(
        id,user_id,imovel_id,contrato_id,valor,data_inicio,motivo,
        confirmado_em,confirmado_por,arquivado_em,arquivado_por,
        motivo_arquivamento,updated_at
      )
      values(
        v_target,v_owner,v_house,v_contract,
        coalesce((v_item->>'valor')::numeric,0),
        date_trunc('month',(v_item->>'data_inicio')::date)::date,
        coalesce(v_item->>'motivo',''),v_confirmed_at,v_confirmed_by,
        null,null,'',now()
      )
      on conflict(id) do update set
        arquivado_em=null,
        arquivado_por=null,
        motivo_arquivamento='',
        updated_at=now()
      where public.aluguel_historico.user_id=v_owner;
    end if;
  end loop;

  -- -------------------------------------------------------------------
  -- 6. Mapas de pagamentos e energia (necessarios para origem_id)
  -- -------------------------------------------------------------------
  create temporary table import_v7_payments(
    src_id uuid primary key,
    target_id uuid not null unique,
    archived_at timestamptz,
    archive_reason text not null default ''
  ) on commit drop;

  for v_item in
    select value from jsonb_array_elements(
      coalesce(p_payload->'payments','[]'::jsonb)
    )
  loop
    v_src := (v_item->>'id')::uuid;
    select m.target_id into v_house
    from pg_temp.import_v7_houses m
    where m.src_id=(v_item->>'imovel_id')::uuid;
    if v_house is null then
      raise exception 'Um pagamento aponta para imovel ausente.';
    end if;

    v_contract := null;
    if nullif(v_item->>'contrato_id','') is not null then
      select m.target_id into v_contract
      from pg_temp.import_v7_contracts m
      where m.src_id=(v_item->>'contrato_id')::uuid;
      if v_contract is null then
        raise exception 'Um pagamento aponta para contrato ausente.';
      end if;
    end if;

    select p.id into v_target
    from public.pagamentos p
    where p.user_id=v_owner
      and (
        p.id=v_src
        or (
          v_contract is not null
          and p.contrato_id=v_contract
          and p.mes=v_item->>'mes'
        )
      )
    order by (p.id=v_src) desc
    limit 1;

    if v_target is null then
      if exists(select 1 from public.pagamentos p where p.id=v_src) then
        v_target := gen_random_uuid();
      else
        v_target := v_src;
      end if;
    end if;

    insert into pg_temp.import_v7_payments(
      src_id,target_id,archived_at,archive_reason
    )
    values(
      v_src,v_target,
      nullif(v_item->>'arquivado_em','')::timestamptz,
      coalesce(v_item->>'motivo_arquivamento','')
    );
  end loop;

  create temporary table import_v7_energy(
    src_id uuid primary key,
    target_id uuid not null unique,
    archived_at timestamptz,
    archive_reason text not null default ''
  ) on commit drop;

  for v_item in
    select value from jsonb_array_elements(
      coalesce(p_payload->'energy','[]'::jsonb)
    )
  loop
    v_src := (v_item->>'id')::uuid;
    select m.target_id into v_house
    from pg_temp.import_v7_houses m
    where m.src_id=(v_item->>'imovel_id')::uuid;
    if v_house is null then
      raise exception 'Uma leitura de energia aponta para imovel ausente.';
    end if;

    v_contract := null;
    if nullif(v_item->>'contrato_id','') is not null then
      select m.target_id into v_contract
      from pg_temp.import_v7_contracts m
      where m.src_id=(v_item->>'contrato_id')::uuid;
      if v_contract is null then
        raise exception 'Uma leitura de energia aponta para contrato ausente.';
      end if;
    end if;

    select e.id into v_target
    from public.energia e
    where e.user_id=v_owner
      and (
        e.id=v_src
        or (
          v_contract is not null
          and e.contrato_id=v_contract
          and e.mes=v_item->>'mes'
        )
      )
    order by (e.id=v_src) desc
    limit 1;

    if v_target is null then
      if exists(select 1 from public.energia e where e.id=v_src) then
        v_target := gen_random_uuid();
      else
        v_target := v_src;
      end if;
    end if;

    insert into pg_temp.import_v7_energy(
      src_id,target_id,archived_at,archive_reason
    )
    values(
      v_src,v_target,
      nullif(v_item->>'arquivado_em','')::timestamptz,
      coalesce(v_item->>'motivo_arquivamento','')
    );
  end loop;

  -- -------------------------------------------------------------------
  -- 7. Cobrancas V2 antes dos gatilhos de pagamentos/energia
  -- Resolucao: ID -> origem -> assinatura mensal ativa.
  -- Para uma cobranca arquivada que repete a assinatura de outra ativa,
  -- "outro" e usado apenas temporariamente; o tipo original volta depois
  -- que o registro estiver arquivado e fora do indice parcial.
  -- -------------------------------------------------------------------
  create temporary table import_v7_charges(
    src_id uuid primary key,
    target_id uuid not null unique,
    desired_type text not null,
    archived_at timestamptz,
    archive_reason text not null default ''
  ) on commit drop;

  for v_item in
    select e.value
    from jsonb_array_elements(
      coalesce(p_payload->'charges','[]'::jsonb)
    ) with ordinality as e(value,ordinality)
    -- Uma cobranca ativa ocupa a assinatura mensal parcial; por isso ela
    -- precisa ser resolvida antes de copias historicas ja arquivadas.
    order by
      (nullif(e.value->>'arquivado_em','') is not null),
      e.ordinality
  loop
    v_src := (v_item->>'id')::uuid;
    v_type := coalesce(nullif(v_item->>'tipo',''),'outro');
    v_competence := v_item->>'competencia';
    v_archived_at :=
      nullif(v_item->>'arquivado_em','')::timestamptz;
    v_archive_reason :=
      coalesce(v_item->>'motivo_arquivamento','');

    select m.target_id into v_house
    from pg_temp.import_v7_houses m
    where m.src_id=(v_item->>'imovel_id')::uuid;
    if v_house is null then
      raise exception 'Uma cobranca aponta para imovel ausente.';
    end if;

    v_contract := null;
    if nullif(v_item->>'contrato_id','') is not null then
      select m.target_id into v_contract
      from pg_temp.import_v7_contracts m
      where m.src_id=(v_item->>'contrato_id')::uuid;
      if v_contract is null then
        raise exception 'Uma cobranca aponta para contrato ausente.';
      end if;
    end if;

    v_tenant := null;
    if nullif(v_item->>'inquilino_id','') is not null then
      select m.target_id into v_tenant
      from pg_temp.import_v7_tenants m
      where m.src_id=(v_item->>'inquilino_id')::uuid;
      if v_tenant is null then
        raise exception 'Uma cobranca aponta para inquilino ausente.';
      end if;
    end if;

    v_origin_type :=
      coalesce(nullif(v_item->>'origem_tipo',''),'manual');
    v_origin := nullif(v_item->>'origem_id','')::uuid;

    if v_origin is not null then
      if v_origin_type='pagamento_legado' then
        select m.target_id into v_origin
        from pg_temp.import_v7_payments m
        where m.src_id=v_origin;
      elsif v_origin_type in ('energia','energia_legado') then
        select m.target_id into v_origin
        from pg_temp.import_v7_energy m
        where m.src_id=v_origin;
      elsif v_origin_type in ('contrato_ajuste','ajuste_legado') then
        select m.target_id into v_origin
        from pg_temp.import_v7_contracts m
        where m.src_id=v_origin;
      end if;
    end if;

    select c.id into v_target
    from public.financeiro_cobrancas c
    where c.user_id=v_owner
      and c.id=v_src
      and not exists(
        select 1
        from pg_temp.import_v7_charges used
        where used.target_id=c.id
      )
    limit 1;

    if v_target is null and v_origin is not null then
      select c.id into v_target
      from public.financeiro_cobrancas c
      where c.user_id=v_owner
        and c.origem_tipo=v_origin_type
        and c.origem_id=v_origin
        and not exists(
          select 1
          from pg_temp.import_v7_charges used
          where used.target_id=c.id
        )
      order by (c.arquivado_em is null) desc,c.created_at,c.id
      limit 1;
    end if;

    if v_target is null
       and v_archived_at is null
       and v_type in ('aluguel','energia') then
      select c.id into v_target
      from public.financeiro_cobrancas c
      where c.user_id=v_owner
        and c.imovel_id=v_house
        and c.contrato_id is not distinct from v_contract
        and c.competencia=v_competence
        and c.tipo=v_type
        and c.arquivado_em is null
        and not exists(
          select 1
          from pg_temp.import_v7_charges used
          where used.target_id=c.id
        )
      order by c.created_at,c.id
      limit 1;
    end if;

    if v_target is null then
      if exists(
        select 1 from public.financeiro_cobrancas c where c.id=v_src
      ) then
        v_target := gen_random_uuid();
      else
        v_target := v_src;
      end if;
    end if;

    if v_origin_type='backup'
       and nullif(v_item->>'origem_id','')::uuid=v_src then
      v_origin := v_target;
    end if;

    v_insert_type := v_type;
    if v_archived_at is not null
       and v_type in ('aluguel','energia')
       and exists(
         select 1
         from public.financeiro_cobrancas c
         where c.user_id=v_owner
           and c.id<>v_target
           and c.imovel_id=v_house
           and c.contrato_id is not distinct from v_contract
           and c.competencia=v_competence
           and c.tipo=v_type
           and c.arquivado_em is null
       ) then
      v_insert_type := 'outro';
    end if;

    insert into public.financeiro_cobrancas(
      id,user_id,imovel_id,contrato_id,inquilino_id,competencia,tipo,
      descricao,valor_previsto,vencimento,tolerancia_dias,
      origem_tipo,origem_id,observacao,arquivado_em,arquivado_por,
      motivo_arquivamento,updated_at
    )
    values(
      v_target,v_owner,v_house,v_contract,v_tenant,v_competence,
      v_insert_type,coalesce(v_item->>'descricao',''),
      coalesce((v_item->>'valor_previsto')::numeric,0),
      (v_item->>'vencimento')::date,
      coalesce((v_item->>'tolerancia_dias')::integer,5),
      v_origin_type,v_origin,coalesce(v_item->>'observacao',''),
      null,null,'',now()
    )
    on conflict(id) do update set
      imovel_id=excluded.imovel_id,
      contrato_id=excluded.contrato_id,
      inquilino_id=excluded.inquilino_id,
      competencia=excluded.competencia,
      tipo=excluded.tipo,
      descricao=excluded.descricao,
      valor_previsto=excluded.valor_previsto,
      vencimento=excluded.vencimento,
      tolerancia_dias=excluded.tolerancia_dias,
      origem_tipo=excluded.origem_tipo,
      origem_id=excluded.origem_id,
      observacao=excluded.observacao,
      arquivado_em=null,
      arquivado_por=null,
      motivo_arquivamento='',
      updated_at=now()
    where public.financeiro_cobrancas.user_id=v_owner;

    insert into pg_temp.import_v7_charges(
      src_id,target_id,desired_type,archived_at,archive_reason
    )
    values(
      v_src,v_target,v_type,v_archived_at,v_archive_reason
    );
  end loop;

  -- -------------------------------------------------------------------
  -- 8. Legado: pagamentos e energia
  -- As cobrancas correspondentes ja existem. ON CONFLICT(id) aciona os
  -- mesmos gatilhos em UPDATE, sem criar uma segunda origem legada.
  -- -------------------------------------------------------------------
  insert into public.pagamentos(
    id,user_id,imovel_id,contrato_id,mes,valor_pago,data_pagamento,
    arquivado_em,arquivado_por,motivo_arquivamento
  )
  select
    pm.target_id,v_owner,hm.target_id,cm.target_id,x.mes,
    coalesce(x.valor_pago,0),x.data_pagamento,null,null,''
  from jsonb_to_recordset(
    coalesce(p_payload->'payments','[]'::jsonb)
  ) as x(
    id uuid,imovel_id uuid,contrato_id uuid,mes text,
    valor_pago numeric,data_pagamento date
  )
  join pg_temp.import_v7_payments pm on pm.src_id=x.id
  join pg_temp.import_v7_houses hm on hm.src_id=x.imovel_id
  left join pg_temp.import_v7_contracts cm on cm.src_id=x.contrato_id
  on conflict(id) do update set
    imovel_id=excluded.imovel_id,
    contrato_id=excluded.contrato_id,
    mes=excluded.mes,
    valor_pago=excluded.valor_pago,
    data_pagamento=excluded.data_pagamento,
    arquivado_em=null,
    arquivado_por=null,
    motivo_arquivamento=''
  where public.pagamentos.user_id=v_owner;

  insert into public.energia(
    id,user_id,imovel_id,contrato_id,mes,valor,kwh,
    leitura_anterior,leitura_atual,tarifa_kwh,acrescimos,descontos,
    ajuste_descricao,valor_calculado,valor_manual,vencimento,pago,
    data_pagamento,foto_path,arquivado_em,arquivado_por,
    motivo_arquivamento
  )
  select
    em.target_id,v_owner,hm.target_id,cm.target_id,x.mes,
    coalesce(x.valor,0),coalesce(x.kwh,0),
    coalesce(x.leitura_anterior,0),coalesce(x.leitura_atual,0),
    coalesce(x.tarifa_kwh,0),coalesce(x.acrescimos,0),
    coalesce(x.descontos,0),coalesce(x.ajuste_descricao,''),
    coalesce(x.valor_calculado,x.valor,0),coalesce(x.valor_manual,false),
    x.vencimento,coalesce(x.pago,false),x.data_pagamento,
    x.foto_path,null,null,''
  from jsonb_to_recordset(
    coalesce(p_payload->'energy','[]'::jsonb)
  ) as x(
    id uuid,imovel_id uuid,contrato_id uuid,mes text,valor numeric,
    kwh numeric,leitura_anterior numeric,leitura_atual numeric,
    tarifa_kwh numeric,acrescimos numeric,descontos numeric,
    ajuste_descricao text,valor_calculado numeric,valor_manual boolean,
    vencimento date,pago boolean,data_pagamento date,foto_path text
  )
  join pg_temp.import_v7_energy em on em.src_id=x.id
  join pg_temp.import_v7_houses hm on hm.src_id=x.imovel_id
  left join pg_temp.import_v7_contracts cm on cm.src_id=x.contrato_id
  on conflict(id) do update set
    imovel_id=excluded.imovel_id,
    contrato_id=excluded.contrato_id,
    mes=excluded.mes,
    valor=excluded.valor,
    kwh=excluded.kwh,
    leitura_anterior=excluded.leitura_anterior,
    leitura_atual=excluded.leitura_atual,
    tarifa_kwh=excluded.tarifa_kwh,
    acrescimos=excluded.acrescimos,
    descontos=excluded.descontos,
    ajuste_descricao=excluded.ajuste_descricao,
    valor_calculado=excluded.valor_calculado,
    valor_manual=excluded.valor_manual,
    vencimento=excluded.vencimento,
    pago=excluded.pago,
    data_pagamento=excluded.data_pagamento,
    foto_path=excluded.foto_path,
    arquivado_em=null,
    arquivado_por=null,
    motivo_arquivamento=''
  where public.energia.user_id=v_owner;

  -- -------------------------------------------------------------------
  -- 9. Recebimentos V2
  -- Resolucao da cobranca: mapa por ID -> origem -> assinatura.
  -- A unicidade de origem so e usada quando origem_id nao e NULL.
  -- Portanto duas (ou mais) parcelas manuais, cada uma com origem_id NULL,
  -- continuam linhas independentes e nunca sao agregadas.
  -- -------------------------------------------------------------------
  create temporary table import_v7_receipts(
    src_id uuid primary key,
    target_id uuid not null unique,
    archived_at timestamptz,
    archive_reason text not null default ''
  ) on commit drop;

  for v_item in
    select value from jsonb_array_elements(
      coalesce(p_payload->'receipts','[]'::jsonb)
    )
  loop
    v_src := (v_item->>'id')::uuid;
    v_charge := null;

    if nullif(v_item->>'cobranca_id','') is not null then
      select m.target_id into v_charge
      from pg_temp.import_v7_charges m
      where m.src_id=(v_item->>'cobranca_id')::uuid;
    end if;

    if v_charge is null
       and nullif(v_item->>'cobranca_origem_id','') is not null then
      v_origin_type :=
        coalesce(nullif(v_item->>'cobranca_origem_tipo',''),'manual');
      v_origin := (v_item->>'cobranca_origem_id')::uuid;

      if v_origin_type='pagamento_legado' then
        select m.target_id into v_origin
        from pg_temp.import_v7_payments m
        where m.src_id=v_origin;
      elsif v_origin_type in ('energia','energia_legado') then
        select m.target_id into v_origin
        from pg_temp.import_v7_energy m
        where m.src_id=v_origin;
      elsif v_origin_type in ('contrato_ajuste','ajuste_legado') then
        select m.target_id into v_origin
        from pg_temp.import_v7_contracts m
        where m.src_id=v_origin;
      end if;

      select c.id into v_charge
      from public.financeiro_cobrancas c
      where c.user_id=v_owner
        and c.origem_tipo=v_origin_type
        and c.origem_id=v_origin
      limit 1;
    end if;

    if v_charge is null then
      select m.target_id into v_house
      from pg_temp.import_v7_houses m
      where m.src_id=(v_item->>'imovel_id')::uuid;

      v_contract := null;
      if nullif(v_item->>'contrato_id','') is not null then
        select m.target_id into v_contract
        from pg_temp.import_v7_contracts m
        where m.src_id=(v_item->>'contrato_id')::uuid;
      end if;

      select
        count(*),
        (array_agg(c.id order by c.created_at,c.id))[1]
        into v_matches,v_charge
      from public.financeiro_cobrancas c
      where c.user_id=v_owner
        and c.imovel_id=v_house
        and c.contrato_id is not distinct from v_contract
        and c.competencia=v_item->>'competencia'
        and c.tipo=v_item->>'tipo';

      if v_matches > 1 then
        raise exception
          'Recebimento com assinatura de cobranca ambigua no backup.';
      end if;
    end if;

    if v_charge is null then
      raise exception 'Um recebimento aponta para cobranca inexistente.';
    end if;

    v_origin_type :=
      coalesce(nullif(v_item->>'origem_tipo',''),'manual');
    v_origin := nullif(v_item->>'origem_id','')::uuid;
    if v_origin is not null then
      if v_origin_type='pagamento_legado' then
        select m.target_id into v_origin
        from pg_temp.import_v7_payments m
        where m.src_id=v_origin;
      elsif v_origin_type in ('energia','energia_legado') then
        select m.target_id into v_origin
        from pg_temp.import_v7_energy m
        where m.src_id=v_origin;
      elsif v_origin_type in ('contrato_ajuste','ajuste_legado') then
        select m.target_id into v_origin
        from pg_temp.import_v7_contracts m
        where m.src_id=v_origin;
      end if;
    end if;

    select r.id into v_target
    from public.financeiro_recebimentos r
    where r.user_id=v_owner
      and r.id=v_src
    limit 1;

    if v_target is null and v_origin is not null then
      select r.id into v_target
      from public.financeiro_recebimentos r
      where r.user_id=v_owner
        and r.origem_tipo=v_origin_type
        and r.origem_id=v_origin
      limit 1;
    end if;

    if v_target is null then
      if exists(
        select 1 from public.financeiro_recebimentos r where r.id=v_src
      ) then
        v_target := gen_random_uuid();
      else
        v_target := v_src;
      end if;
    end if;

    if v_origin_type='backup'
       and nullif(v_item->>'origem_id','')::uuid=v_src then
      v_origin := v_target;
    end if;

    insert into public.financeiro_recebimentos(
      id,user_id,cobranca_id,valor,data_pagamento,competencia_caixa,
      forma,observacao,origem_tipo,origem_id,arquivado_em,
      arquivado_por,motivo_arquivamento,updated_at
    )
    values(
      v_target,v_owner,v_charge,
      (v_item->>'valor')::numeric,
      (v_item->>'data_pagamento')::date,
      v_item->>'competencia_caixa',
      coalesce(v_item->>'forma',''),
      coalesce(v_item->>'observacao',''),
      v_origin_type,v_origin,null,null,'',now()
    )
    on conflict(id) do update set
      cobranca_id=excluded.cobranca_id,
      valor=excluded.valor,
      data_pagamento=excluded.data_pagamento,
      competencia_caixa=excluded.competencia_caixa,
      forma=excluded.forma,
      observacao=excluded.observacao,
      origem_tipo=excluded.origem_tipo,
      origem_id=excluded.origem_id,
      arquivado_em=null,
      arquivado_por=null,
      motivo_arquivamento='',
      updated_at=now()
    where public.financeiro_recebimentos.user_id=v_owner;

    insert into pg_temp.import_v7_receipts(
      src_id,target_id,archived_at,archive_reason
    )
    values(
      v_src,v_target,
      nullif(v_item->>'arquivado_em','')::timestamptz,
      coalesce(v_item->>'motivo_arquivamento','')
    );
  end loop;

  -- -------------------------------------------------------------------
  -- 10. Despesas e chamados de manutencao
  -- -------------------------------------------------------------------
  insert into public.despesas(
    id,user_id,imovel_id,descricao,categoria,valor,data,prestador,status,
    arquivado_em,arquivado_por,motivo_arquivamento
  )
  select
    dm.target_id,v_owner,hm.target_id,x.descricao,
    coalesce(x.categoria,'Outro'),coalesce(x.valor,0),x.data,
    coalesce(x.prestador,''),coalesce(x.status,'Concluído'),
    null,null,''
  from jsonb_to_recordset(
    coalesce(p_payload->'expenses','[]'::jsonb)
  ) as x(
    id uuid,imovel_id uuid,descricao text,categoria text,valor numeric,
    data date,prestador text,status text
  )
  join pg_temp.import_v7_expenses dm on dm.src_id=x.id
  join pg_temp.import_v7_houses hm on hm.src_id=x.imovel_id
  on conflict(id) do update set
    imovel_id=excluded.imovel_id,
    descricao=excluded.descricao,
    categoria=excluded.categoria,
    valor=excluded.valor,
    data=excluded.data,
    prestador=excluded.prestador,
    status=excluded.status,
    arquivado_em=null,
    arquivado_por=null,
    motivo_arquivamento=''
  where public.despesas.user_id=v_owner;

  if exists(
    select 1
    from jsonb_to_recordset(
      coalesce(p_payload->'maintenance','[]'::jsonb)
    ) as x(imovel_id uuid,inquilino_id uuid,despesa_id uuid)
    where not exists(
            select 1 from pg_temp.import_v7_houses h
            where h.src_id=x.imovel_id
          )
       or (
         x.inquilino_id is not null
         and not exists(
           select 1 from pg_temp.import_v7_tenants t
           where t.src_id=x.inquilino_id
         )
       )
       or (
         x.despesa_id is not null
         and not exists(
           select 1 from pg_temp.import_v7_expenses d
           where d.src_id=x.despesa_id
         )
       )
  ) then
    raise exception 'Um chamado possui referencia ausente no backup.';
  end if;

  insert into public.chamados(
    id,user_id,imovel_id,inquilino_id,titulo,descricao,categoria,
    prioridade,status,aberto_por,resposta,despesa_id,resolvido_em,
    created_at,updated_at
  )
  select
    mm.target_id,v_owner,hm.target_id,tm.target_id,x.titulo,
    coalesce(x.descricao,''),coalesce(x.categoria,'outro'),
    coalesce(x.prioridade,'normal'),coalesce(x.status,'aberto'),
    coalesce(x.aberto_por,'proprietario'),coalesce(x.resposta,''),
    dm.target_id,x.resolvido_em,coalesce(x.created_at,now()),now()
  from jsonb_to_recordset(
    coalesce(p_payload->'maintenance','[]'::jsonb)
  ) as x(
    id uuid,imovel_id uuid,inquilino_id uuid,titulo text,
    descricao text,categoria text,prioridade text,status text,
    aberto_por text,resposta text,despesa_id uuid,
    resolvido_em timestamptz,created_at timestamptz
  )
  join pg_temp.import_v7_maintenance mm on mm.src_id=x.id
  join pg_temp.import_v7_houses hm on hm.src_id=x.imovel_id
  left join pg_temp.import_v7_tenants tm on tm.src_id=x.inquilino_id
  left join pg_temp.import_v7_expenses dm on dm.src_id=x.despesa_id
  on conflict(id) do update set
    imovel_id=excluded.imovel_id,
    inquilino_id=excluded.inquilino_id,
    titulo=excluded.titulo,
    descricao=excluded.descricao,
    categoria=excluded.categoria,
    prioridade=excluded.prioridade,
    status=excluded.status,
    aberto_por=excluded.aberto_por,
    resposta=excluded.resposta,
    despesa_id=excluded.despesa_id,
    resolvido_em=excluded.resolvido_em,
    updated_at=now()
  where public.chamados.user_id=v_owner;

  -- -------------------------------------------------------------------
  -- 11. Historico, fotos, documentos, eventos, interessados e config
  -- As assinaturas NOT EXISTS tornam a repeticao do mesmo payload
  -- normalizado idempotente para linhas que nao carregam ID.
  -- -------------------------------------------------------------------
  if exists(
    select 1
    from jsonb_to_recordset(
      coalesce(p_payload->'history','[]'::jsonb)
    ) as x(imovel_id uuid,tenant_id uuid)
    where not exists(
            select 1 from pg_temp.import_v7_houses h
            where h.src_id=x.imovel_id
          )
       or (
         x.tenant_id is not null
         and not exists(
           select 1 from pg_temp.import_v7_tenants t
           where t.src_id=x.tenant_id
         )
       )
  ) then
    raise exception 'O historico possui referencia ausente no backup.';
  end if;

  insert into public.historico_status(
    user_id,imovel_id,data,status,tenant_id
  )
  select
    v_owner,hm.target_id,x.data,x.status,tm.target_id
  from jsonb_to_recordset(
    coalesce(p_payload->'history','[]'::jsonb)
  ) as x(imovel_id uuid,data date,status text,tenant_id uuid)
  join pg_temp.import_v7_houses hm on hm.src_id=x.imovel_id
  left join pg_temp.import_v7_tenants tm on tm.src_id=x.tenant_id
  where not exists(
    select 1
    from public.historico_status hs
    where hs.user_id=v_owner
      and hs.imovel_id=hm.target_id
      and hs.data=x.data
      and hs.status=x.status
      and hs.tenant_id is not distinct from tm.target_id
  );

  insert into public.fotos(
    user_id,imovel_id,dados,ordem,nome,mime,tamanho
  )
  select
    v_owner,hm.target_id,x.dados,coalesce(x.ordem,0),
    coalesce(x.nome,'foto.jpg'),coalesce(x.mime,'image/jpeg'),
    octet_length(decode(split_part(x.dados,',',2),'base64'))
  from jsonb_to_recordset(
    coalesce(p_payload->'photos','[]'::jsonb)
  ) as x(
    imovel_id uuid,dados text,ordem integer,nome text,mime text,
    tamanho bigint
  )
  join pg_temp.import_v7_houses hm on hm.src_id=x.imovel_id
  where not exists(
    select 1
    from public.fotos f
    where f.user_id=v_owner
      and f.imovel_id=hm.target_id
      and f.ordem=coalesce(x.ordem,0)
      and f.dados=x.dados
  );

  if exists(
    select 1
    from jsonb_to_recordset(
      coalesce(p_payload->'documents','[]'::jsonb)
    ) as x(imovel_id uuid,inquilino_id uuid)
    where not exists(
            select 1 from pg_temp.import_v7_houses h
            where h.src_id=x.imovel_id
          )
       or (
         x.inquilino_id is not null
         and not exists(
           select 1 from pg_temp.import_v7_tenants t
           where t.src_id=x.inquilino_id
         )
       )
  ) then
    raise exception 'Um documento possui referencia ausente no backup.';
  end if;

  insert into public.documentos(
    user_id,imovel_id,inquilino_id,tipo,nome,mime,dados,tamanho,
    visivel_inquilino
  )
  select
    v_owner,hm.target_id,tm.target_id,coalesce(x.tipo,'outro'),
    x.nome,coalesce(x.mime,''),x.dados,
    octet_length(decode(split_part(x.dados,',',2),'base64')),
    coalesce(x.visivel_inquilino,false)
  from jsonb_to_recordset(
    coalesce(p_payload->'documents','[]'::jsonb)
  ) as x(
    imovel_id uuid,inquilino_id uuid,tipo text,nome text,mime text,
    dados text,tamanho bigint,visivel_inquilino boolean
  )
  join pg_temp.import_v7_houses hm on hm.src_id=x.imovel_id
  left join pg_temp.import_v7_tenants tm on tm.src_id=x.inquilino_id
  where not exists(
    select 1
    from public.documentos d
    where d.user_id=v_owner
      and d.imovel_id=hm.target_id
      and d.inquilino_id is not distinct from tm.target_id
      and d.nome=x.nome
      and d.dados=x.dados
  );

  insert into public.eventos(user_id,data,texto)
  select v_owner,x.data,coalesce(x.texto,'')
  from jsonb_to_recordset(
    coalesce(p_payload->'events','[]'::jsonb)
  ) as x(data date,texto text)
  where not exists(
    select 1
    from public.eventos e
    where e.user_id=v_owner
      and e.data=x.data
      and e.texto=coalesce(x.texto,'')
  );

  if exists(
    select 1
    from jsonb_to_recordset(
      coalesce(p_payload->'interests','[]'::jsonb)
    ) as x(inquilino_id uuid)
    where x.inquilino_id is not null
      and not exists(
        select 1 from pg_temp.import_v7_tenants t
        where t.src_id=x.inquilino_id
      )
  ) then
    raise exception 'Um interessado aponta para inquilino ausente.';
  end if;

  insert into public.interessados(
    id,user_id,nome,telefone,valor_maximo,quartos_min,banheiros_min,
    precisa_garagem,precisa_quintal,precisa_cozinha,precisa_sala,
    precisa_area_servico,observacoes,status,inquilino_id,updated_at
  )
  select
    im.target_id,v_owner,x.nome,coalesce(x.telefone,''),
    coalesce(x.valor_maximo,0),coalesce(x.quartos_min,0),
    coalesce(x.banheiros_min,0),coalesce(x.precisa_garagem,false),
    coalesce(x.precisa_quintal,false),coalesce(x.precisa_cozinha,false),
    coalesce(x.precisa_sala,false),coalesce(x.precisa_area_servico,false),
    coalesce(x.observacoes,''),coalesce(x.status,'novo'),
    tm.target_id,now()
  from jsonb_to_recordset(
    coalesce(p_payload->'interests','[]'::jsonb)
  ) as x(
    id uuid,nome text,telefone text,valor_maximo numeric,
    quartos_min integer,banheiros_min integer,precisa_garagem boolean,
    precisa_quintal boolean,precisa_cozinha boolean,precisa_sala boolean,
    precisa_area_servico boolean,observacoes text,status text,
    inquilino_id uuid
  )
  join pg_temp.import_v7_interests im on im.src_id=x.id
  left join pg_temp.import_v7_tenants tm on tm.src_id=x.inquilino_id
  on conflict(id) do update set
    nome=excluded.nome,
    telefone=excluded.telefone,
    valor_maximo=excluded.valor_maximo,
    quartos_min=excluded.quartos_min,
    banheiros_min=excluded.banheiros_min,
    precisa_garagem=excluded.precisa_garagem,
    precisa_quintal=excluded.precisa_quintal,
    precisa_cozinha=excluded.precisa_cozinha,
    precisa_sala=excluded.precisa_sala,
    precisa_area_servico=excluded.precisa_area_servico,
    observacoes=excluded.observacoes,
    status=excluded.status,
    inquilino_id=excluded.inquilino_id,
    updated_at=now()
  where public.interessados.user_id=v_owner;

  if jsonb_typeof(p_payload->'config')='object' then
    insert into public.configuracoes(
      user_id,locador_nome,locador_documento,energia_ativa,tema,
      onboarding_concluido,ultimo_backup_externo,pix_chave,pix_nome,
      pix_cidade,updated_at
    )
    values(
      v_owner,
      coalesce(p_payload#>>'{config,locador_nome}',''),
      coalesce(p_payload#>>'{config,locador_documento}',''),
      coalesce((p_payload#>>'{config,energia_ativa}')::boolean,true),
      case
        when p_payload#>>'{config,tema}'
          in ('original','aurora','oceano','citrico')
          then p_payload#>>'{config,tema}'
        else 'original'
      end,
      coalesce(
        (p_payload#>>'{config,onboarding_concluido}')::boolean,false
      ),
      nullif(
        p_payload#>>'{config,ultimo_backup_externo}',''
      )::timestamptz,
      coalesce(p_payload#>>'{config,pix_chave}',''),
      coalesce(p_payload#>>'{config,pix_nome}',''),
      coalesce(p_payload#>>'{config,pix_cidade}',''),
      now()
    )
    on conflict(user_id) do update set
      locador_nome=excluded.locador_nome,
      locador_documento=excluded.locador_documento,
      energia_ativa=excluded.energia_ativa,
      tema=excluded.tema,
      onboarding_concluido=excluded.onboarding_concluido,
      ultimo_backup_externo=excluded.ultimo_backup_externo,
      pix_chave=excluded.pix_chave,
      pix_nome=excluded.pix_nome,
      pix_cidade=excluded.pix_cidade,
      updated_at=now();
  end if;

  -- -------------------------------------------------------------------
  -- 12. Arquivamento por ultimo
  -- Pais continuam ativos durante todas as validacoes. Primeiro os gatilhos
  -- legados recebem o estado final; depois cobrancas/recebimentos sao
  -- corrigidos explicitamente para refletir exatamente o payload.
  -- -------------------------------------------------------------------
  update public.pagamentos p
  set arquivado_em=m.archived_at,
      arquivado_por=case when m.archived_at is null then null else v_actor end,
      motivo_arquivamento=case
        when m.archived_at is null then '' else m.archive_reason
      end
  from pg_temp.import_v7_payments m
  where p.id=m.target_id
    and p.user_id=v_owner
    and p.arquivado_em is distinct from m.archived_at;

  update public.energia e
  set arquivado_em=m.archived_at,
      arquivado_por=case when m.archived_at is null then null else v_actor end,
      motivo_arquivamento=case
        when m.archived_at is null then '' else m.archive_reason
      end
  from pg_temp.import_v7_energy m
  where e.id=m.target_id
    and e.user_id=v_owner
    and e.arquivado_em is distinct from m.archived_at;

  -- Primeiro deixe ativas todas as cobrancas que devem permanecer ativas,
  -- pois o gatilho de recebimento exige pai ativo inclusive em UPDATE.
  update public.financeiro_cobrancas c
  set arquivado_em=null,
      arquivado_por=null,
      motivo_arquivamento='',
      tipo=m.desired_type,
      updated_at=now()
  from pg_temp.import_v7_charges m
  where c.id=m.target_id
    and c.user_id=v_owner
    and m.archived_at is null;

  update public.financeiro_recebimentos r
  set arquivado_em=m.archived_at,
      arquivado_por=case when m.archived_at is null then null else v_actor end,
      motivo_arquivamento=case
        when m.archived_at is null then '' else m.archive_reason
      end,
      updated_at=now()
  from pg_temp.import_v7_receipts m
  where r.id=m.target_id
    and r.user_id=v_owner;

  -- Cobrancas arquivadas vem depois de seus recebimentos.
  update public.financeiro_cobrancas c
  set arquivado_em=m.archived_at,
      arquivado_por=v_actor,
      motivo_arquivamento=m.archive_reason,
      tipo=m.desired_type,
      updated_at=now()
  from pg_temp.import_v7_charges m
  where c.id=m.target_id
    and c.user_id=v_owner
    and m.archived_at is not null;

  update public.despesas d
  set arquivado_em=m.archived_at,
      arquivado_por=case when m.archived_at is null then null else v_actor end,
      motivo_arquivamento=case
        when m.archived_at is null then '' else m.archive_reason
      end
  from pg_temp.import_v7_expenses m
  where d.id=m.target_id
    and d.user_id=v_owner;

  -- Reajustes que nasceram ativos podem agora ser arquivados.
  update public.aluguel_historico h
  set arquivado_em=m.archived_at,
      arquivado_por=v_actor,
      motivo_arquivamento=m.archive_reason,
      updated_at=now()
  from pg_temp.import_v7_adjustments m
  where h.id=m.target_id
    and h.user_id=v_owner
    and m.archived_at is not null;

  -- Reajustes que ja estavam arquivados foram adiados para esta etapa.
  -- Isso preserva inclusive um registro arquivado com a mesma competencia
  -- de outro reajuste ativo, permitido pelo indice parcial do V2.
  insert into public.aluguel_historico(
    id,user_id,imovel_id,contrato_id,valor,data_inicio,motivo,
    confirmado_em,confirmado_por,arquivado_em,arquivado_por,
    motivo_arquivamento,updated_at
  )
  select
    m.target_id,v_owner,m.house_id,m.contract_id,m.valor,m.data_inicio,
    m.motivo,m.confirmed_at,m.confirmed_by,
    m.archived_at,v_actor,m.archive_reason,now()
  from pg_temp.import_v7_adjustments m
  where m.archived_at is not null
    and not exists(
      select 1 from public.aluguel_historico h
      where h.id=m.target_id
    );

  update public.contratos c
  set arquivado_em=m.archived_at,
      arquivado_por=case when m.archived_at is null then null else v_actor end,
      motivo_arquivamento=case
        when m.archived_at is null then '' else m.archive_reason
      end,
      updated_at=now()
  from pg_temp.import_v7_contracts m
  where c.id=m.target_id
    and c.user_id=v_owner;

  update public.imoveis i
  set arquivado_em=m.archived_at,
      arquivado_por=case when m.archived_at is null then null else v_actor end,
      motivo_arquivamento=case
        when m.archived_at is null then '' else m.archive_reason
      end,
      updated_at=now()
  from pg_temp.import_v7_houses m
  where i.id=m.target_id
    and i.user_id=v_owner;

  update public.inquilinos t
  set arquivado_em=m.archived_at,
      arquivado_por=case when m.archived_at is null then null else v_actor end,
      motivo_arquivamento=case
        when m.archived_at is null then '' else m.archive_reason
      end
  from pg_temp.import_v7_tenants m
  where t.id=m.target_id
    and t.user_id=v_owner;

  update public.proprietarios_clientes o
  set arquivado_em=m.archived_at,
      arquivado_por=case when m.archived_at is null then null else v_actor end,
      motivo_arquivamento=case
        when m.archived_at is null then '' else m.archive_reason
      end
  from pg_temp.import_v7_owners m
  where o.id=m.target_id
    and o.user_id=v_owner;

  if exists(
    select 1
    from public.contratos a
    join public.contratos b
      on b.user_id=a.user_id
     and b.imovel_id=a.imovel_id
     and b.id>a.id
     and b.arquivado_em is null
     and b.inicio<=coalesce(a.fim,'9999-12-31'::date)
     and coalesce(b.fim,'9999-12-31'::date)>=a.inicio
    where a.user_id=v_owner
      and a.arquivado_em is null
  ) then
    raise exception
      'O backup possui contratos ativos com periodos sobrepostos.';
  end if;

  -- Registra a exportacao SO no fim: se qualquer etapa acima falhar, a
  -- transacao inteira e desfeita e o arquivo continua importavel. Marcar
  -- no comeco deixaria o cliente sem poder repetir uma importacao que nao
  -- chegou a gravar nada.
  if not p_substituir and v_export is not null then
    insert into public.backups_importados(user_id,export_id,exportado_em)
    values(
      v_owner,
      v_export::uuid,
      -- Data informativa. O cliente ja valida, e aqui a checagem se repete
      -- porque este insert e a ULTIMA instrucao da rotina: um valor torto
      -- derrubaria a transacao com tudo ja inserido.
      case when p_payload->>'exported_at' ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}'
           then (p_payload->>'exported_at')::timestamptz
           else null end
    )
    on conflict (user_id,export_id) do nothing;
  end if;

  perform set_config('app.restaurando_backup','0',true);
  perform set_config('app.alterando_arquivamento','0',true);
end;
$function$;

revoke all on function
  public.importar_backup_atomico_v7(jsonb,boolean)
  from public,anon,authenticated;
grant execute on function
  public.importar_backup_atomico_v7(jsonb,boolean)
  to authenticated;

-- As versoes anteriores nao possuem as protecoes de papel, dependencias,
-- Financeiro V2 e arquivos do V7. Elas permanecem no historico das
-- migracoes, mas deixam de ser uma rota executavel depois desta atualizacao.
do $revoke_legacy_backup_rpcs$
declare
  v_function text;
begin
  foreach v_function in array array[
    'importar_backup_atomico',
    'importar_backup_atomico_v2',
    'importar_backup_atomico_v3',
    'importar_backup_atomico_v4',
    'importar_backup_atomico_v5',
    'importar_backup_atomico_v6'
  ]
  loop
    if to_regprocedure(
      format('public.%I(jsonb,boolean)',v_function)
    ) is not null then
      execute format(
        'revoke all on function public.%I(jsonb,boolean) from public,anon,authenticated',
        v_function
      );
    end if;
  end loop;
end
$revoke_legacy_backup_rpcs$;

do $$
begin
  -- A observacao distingue a revisao: o arquivo e o mesmo de sempre, mas a
  -- rotina passou a preservar imoveis.tipo e inquilinos.rg.
  if to_regprocedure('public.registrar_migracao(text,text)') is not null then
    perform public.registrar_migracao(
      'migracao-backup-v7.sql',
      'revisao 01/08/2026: preserva tipo e rg, recusa exportacao repetida e carrega os proprietarios-clientes'
    );
  end if;
end
$$;

commit;
