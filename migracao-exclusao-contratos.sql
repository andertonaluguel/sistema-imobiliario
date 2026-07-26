-- ============================================================
-- ENCERRAMENTO E EXCLUSAO SEGURA DE CONTRATOS / INQUILINOS
--
-- Depende de migracao-versao-comercial-v1.sql e
-- migracao-tipos-acesso.sql e migracao-minha-casa.sql. E idempotente e pode ser executada
-- novamente com seguranca.
--
-- Saida real:
--   encerra o contrato, libera o imovel e PRESERVA o historico.
--
-- Cadastro errado:
--   sempre oferece uma previa; a exclusao exige confirmacao forte
--   e remove apenas dados do mesmo proprietario e diretamente ligados.
-- ============================================================

begin;

-- A versao original usava auth.uid() como dono direto. Nesta versao, Mestre 2
-- e colaboradores autorizados gravam sempre na conta proprietaria resolvida,
-- exatamente como as politicas RLS atuais.
create or replace function public.iniciar_contrato_gestao(
  p_imovel_id uuid,
  p_inquilino_id uuid,
  p_inicio date,
  p_fim date,
  p_valor numeric,
  p_dia_vencimento int,
  p_modalidade text,
  p_proporcional_dias int,
  p_proporcional_valor numeric
)
returns setof public.contratos
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_owner uuid:=public.usuario_proprietario_id(auth.uid());
  v_contract public.contratos%rowtype;
  v_dia integer;
  v_dias integer;
  v_prop numeric;
begin
  if v_owner is null or not public.e_acesso_operacional(v_owner) then
    raise exception 'Conta sem permissao operacional.';
  end if;
  if p_inicio is null
    or coalesce(p_valor,0)<=0
    or (p_fim is not null and p_fim<p_inicio) then
    raise exception 'Dados do contrato invalidos.';
  end if;
  if coalesce(p_modalidade,'') not in ('entrada','fixo') then
    raise exception 'Modalidade de vencimento invalida.';
  end if;

  perform 1 from public.imoveis i
  where i.id=p_imovel_id and i.user_id=v_owner
  for update;
  if not found then
    raise exception 'Imovel nao encontrado.';
  end if;
  if not exists(
    select 1 from public.inquilinos t
    where t.id=p_inquilino_id and t.user_id=v_owner
  ) then
    raise exception 'Inquilino nao encontrado.';
  end if;
  if exists(
    select 1 from public.contratos c
    where c.imovel_id=p_imovel_id and c.user_id<>v_owner
  ) then
    raise exception 'O imovel possui vinculo fora desta conta. Nenhum dado foi alterado.';
  end if;

  v_dia:=case
    when p_modalidade='entrada' then extract(day from p_inicio)::integer
    else least(31,greatest(1,coalesce(p_dia_vencimento,1)))
  end;
  v_dias:=case
    when p_modalidade='entrada'
      or v_dia=extract(day from p_inicio)::integer then 0
    when v_dia>extract(day from p_inicio)::integer
      then v_dia-extract(day from p_inicio)::integer
    else 30-extract(day from p_inicio)::integer+v_dia
  end;
  v_prop:=round((p_valor/30)*v_dias,2);

  if exists(
    select 1 from public.contratos c
    where c.imovel_id=p_imovel_id
      and c.user_id=v_owner
      and c.ativo
      and c.inicio>=p_inicio
  ) then
    raise exception 'O novo contrato deve comecar depois do contrato atual.';
  end if;

  update public.contratos
  set fim=p_inicio-1,ativo=false,updated_at=now()
  where imovel_id=p_imovel_id and user_id=v_owner and ativo;

  insert into public.contratos(
    user_id,imovel_id,tenant_id,inicio,fim,valor,ativo,
    dia_vencimento,modalidade_vencimento,proporcional_dias,
    proporcional_valor,proporcional_pago
  )
  values(
    v_owner,p_imovel_id,p_inquilino_id,p_inicio,p_fim,p_valor,true,
    v_dia,p_modalidade,v_dias,v_prop,v_dias=0
  )
  returning * into v_contract;

  update public.imoveis
  set status='alugada',
      tenant_id=p_inquilino_id,
      contrato_inicio=p_inicio,
      contrato_fim=p_fim,
      aluguel_valor=p_valor,
      dia_vencimento=v_dia,
      updated_at=now()
  where id=p_imovel_id and user_id=v_owner;

  return next v_contract;
end;
$$;

-- Mantem a assinatura usada pelo aplicativo, mas passa a respeitar a conta
-- proprietaria resolvida para dono/colaborador e registra a casa como vaga
-- sem apagar contratos, pagamentos, energia ou eventos anteriores.
create or replace function public.encerrar_contrato_gestao(
  p_imovel_id uuid,
  p_contrato_id uuid,
  p_fim date,
  p_novo_status text default 'vaga'
)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_owner uuid:=public.usuario_proprietario_id(auth.uid());
  v_contract public.contratos%rowtype;
  v_other_active boolean;
  v_should_release boolean;
begin
  if v_owner is null or not public.e_acesso_operacional(v_owner) then
    raise exception 'Conta sem permissao operacional.';
  end if;
  if p_novo_status not in ('vaga','manutencao') then
    raise exception 'Status final invalido.';
  end if;

  select c.* into v_contract
  from public.contratos c
  where c.id=p_contrato_id
    and c.imovel_id=p_imovel_id
    and c.user_id=v_owner
  for update;

  if not found then
    raise exception 'Contrato nao encontrado.';
  end if;
  if p_fim is null then
    raise exception 'Informe a data de saida.';
  end if;
  if v_contract.inicio is not null and p_fim<v_contract.inicio then
    raise exception 'A saida nao pode ser anterior ao inicio do contrato.';
  end if;
  if p_fim>current_date then
    raise exception 'A data de saida nao pode estar no futuro.';
  end if;
  if v_contract.tenant_id is not null and exists(
    select 1 from public.inquilinos t
    where t.id=v_contract.tenant_id and t.user_id<>v_owner
  ) then
    raise exception 'Vinculo de inquilino invalido. Nenhum dado foi alterado.';
  end if;

  perform 1 from public.imoveis i
  where i.id=p_imovel_id and i.user_id=v_owner
  for update;
  if not found then
    raise exception 'Imovel nao encontrado.';
  end if;

  select exists(
    select 1 from public.contratos c
    where c.imovel_id=p_imovel_id
      and c.user_id=v_owner
      and c.id<>p_contrato_id
      and c.ativo
  ) into v_other_active;

  select not v_other_active
    and v_contract.tenant_id is not null
    and exists(
      select 1 from public.imoveis i
      where i.id=p_imovel_id
        and i.user_id=v_owner
        and i.tenant_id=v_contract.tenant_id
    )
  into v_should_release;

  update public.contratos
  set fim=p_fim,ativo=false,updated_at=now()
  where id=p_contrato_id and user_id=v_owner;

  if v_should_release then
    update public.imoveis
    set status=p_novo_status,
        tenant_id=null,
        contrato_inicio=null,
        contrato_fim=null,
        updated_at=now()
    where id=p_imovel_id and user_id=v_owner;

    insert into public.historico_status(user_id,imovel_id,data,status,tenant_id)
    select v_owner,p_imovel_id,p_fim,p_novo_status,null
    where not exists(
      select 1 from public.historico_status h
      where h.user_id=v_owner
        and h.imovel_id=p_imovel_id
        and h.data=p_fim
        and h.status=p_novo_status
        and h.tenant_id is null
    );
  end if;
end;
$$;

-- Previa de exclusao de um unico contrato. Nenhuma linha e alterada.
create or replace function public.prever_exclusao_contrato(
  p_contrato_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_owner uuid:=public.usuario_proprietario_id(auth.uid());
  v_contract public.contratos%rowtype;
  v_payments integer;
  v_energy integer;
  v_pending_suggestions integer;
  v_will_vacate boolean;
begin
  if v_owner is null or not public.e_acesso_operacional(v_owner) then
    raise exception 'Conta sem permissao operacional.';
  end if;

  select c.* into v_contract
  from public.contratos c
  where c.id=p_contrato_id and c.user_id=v_owner;
  if not found then
    raise exception 'Contrato nao encontrado.';
  end if;

  if exists(
    select 1 from public.pagamentos p
    where p.contrato_id=p_contrato_id and p.user_id<>v_owner
  ) or exists(
    select 1 from public.energia e
    where e.contrato_id=p_contrato_id and e.user_id<>v_owner
  ) or (
    v_contract.imovel_id is not null and not exists(
      select 1 from public.imoveis i
      where i.id=v_contract.imovel_id and i.user_id=v_owner
    )
  ) or (
    v_contract.tenant_id is not null and not exists(
      select 1 from public.inquilinos t
      where t.id=v_contract.tenant_id and t.user_id=v_owner
    )
  ) then
    raise exception 'O contrato possui vinculo fora desta conta. Nenhum dado pode ser excluido.';
  end if;

  select count(*)::integer into v_payments
  from public.pagamentos p
  where p.user_id=v_owner and p.contrato_id=p_contrato_id;

  select count(*)::integer into v_energy
  from public.energia e
  where e.user_id=v_owner and e.contrato_id=p_contrato_id;

  select count(*)::integer into v_pending_suggestions
  from public.minha_casa_sugestoes s
  where s.status='pendente'
    and s.origem_proprietario_id=v_owner
    and exists(
      select 1 from public.minha_casa_familias f
      where f.id=s.familia_id and f.codigo='familia-anderton'
    )
    and (
      (
        s.origem_tipo='aluguel'
        and exists(
          select 1 from public.pagamentos p
          where p.id=s.origem_id
            and p.user_id=v_owner
            and p.contrato_id=p_contrato_id
        )
      )
      or (
        s.origem_tipo='energia_inquilino'
        and exists(
          select 1 from public.energia e
          where e.id=s.origem_id
            and e.user_id=v_owner
            and e.contrato_id=p_contrato_id
        )
      )
    );

  select v_contract.ativo
    and v_contract.tenant_id is not null
    and exists(
      select 1 from public.imoveis i
      where i.id=v_contract.imovel_id
        and i.user_id=v_owner
        and i.tenant_id=v_contract.tenant_id
    )
    and not exists(
      select 1 from public.contratos c
      where c.user_id=v_owner
        and c.imovel_id=v_contract.imovel_id
        and c.id<>p_contrato_id
        and c.ativo
    )
  into v_will_vacate;

  return jsonb_build_object(
    'contractId',v_contract.id,
    'houseId',v_contract.imovel_id,
    'houseName',coalesce((
      select i.nome from public.imoveis i
      where i.id=v_contract.imovel_id and i.user_id=v_owner
    ),''),
    'tenantId',v_contract.tenant_id,
    'tenantName',coalesce((
      select t.nome from public.inquilinos t
      where t.id=v_contract.tenant_id and t.user_id=v_owner
    ),''),
    'active',v_contract.ativo,
    'startDate',v_contract.inicio,
    'endDate',v_contract.fim,
    'paymentsCount',v_payments,
    'energyCount',v_energy,
    'pendingSuggestionsCount',v_pending_suggestions,
    'linkedRecordsCount',1+v_payments+v_energy+v_pending_suggestions,
    'willVacateHouse',v_will_vacate,
    'historyPreserved',true,
    'energyPhotoPaths',coalesce((
      select jsonb_agg(e.foto_path)
      from public.energia e
      where e.user_id=v_owner
        and e.contrato_id=p_contrato_id
        and e.foto_path is not null
        and e.foto_path<>''
    ),'[]'::jsonb)
  );
end;
$$;

-- Exclui somente o contrato informado e movimentos com contrato_id exatamente
-- igual a ele. O cadastro do inquilino, documentos e outros contratos ficam.
create or replace function public.excluir_contrato_por_engano(
  p_contrato_id uuid,
  p_confirmacao text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_owner uuid:=public.usuario_proprietario_id(auth.uid());
  v_contract public.contratos%rowtype;
  v_payments integer:=0;
  v_energy integer:=0;
  v_pending_suggestions integer:=0;
  v_will_vacate boolean:=false;
  v_energy_paths jsonb:='[]'::jsonb;
begin
  if v_owner is null or not public.e_acesso_operacional(v_owner) then
    raise exception 'Conta sem permissao operacional.';
  end if;
  if upper(trim(coalesce(p_confirmacao,'')))<>'EXCLUIR' then
    raise exception 'Confirmacao invalida. Digite EXCLUIR.';
  end if;

  select c.* into v_contract
  from public.contratos c
  where c.id=p_contrato_id and c.user_id=v_owner
  for update;
  if not found then
    raise exception 'Contrato nao encontrado.';
  end if;

  if exists(
    select 1 from public.pagamentos p
    where p.contrato_id=p_contrato_id and p.user_id<>v_owner
  ) or exists(
    select 1 from public.energia e
    where e.contrato_id=p_contrato_id and e.user_id<>v_owner
  ) or (
    v_contract.imovel_id is not null and not exists(
      select 1 from public.imoveis i
      where i.id=v_contract.imovel_id and i.user_id=v_owner
    )
  ) or (
    v_contract.tenant_id is not null and not exists(
      select 1 from public.inquilinos t
      where t.id=v_contract.tenant_id and t.user_id=v_owner
    )
  ) then
    raise exception 'O contrato possui vinculo fora desta conta. Nenhum dado foi excluido.';
  end if;

  if v_contract.imovel_id is not null then
    perform 1 from public.imoveis i
    where i.id=v_contract.imovel_id and i.user_id=v_owner
    for update;
  end if;

  select v_contract.ativo
    and v_contract.tenant_id is not null
    and exists(
      select 1 from public.imoveis i
      where i.id=v_contract.imovel_id
        and i.user_id=v_owner
        and i.tenant_id=v_contract.tenant_id
    )
    and not exists(
      select 1 from public.contratos c
      where c.user_id=v_owner
        and c.imovel_id=v_contract.imovel_id
        and c.id<>p_contrato_id
        and c.ativo
    )
  into v_will_vacate;

  select coalesce(jsonb_agg(e.foto_path),'[]'::jsonb)
  into v_energy_paths
  from public.energia e
  where e.user_id=v_owner
    and e.contrato_id=p_contrato_id
    and e.foto_path is not null
    and e.foto_path<>'';

  delete from public.minha_casa_sugestoes s
  where s.status='pendente'
    and s.origem_proprietario_id=v_owner
    and exists(
      select 1 from public.minha_casa_familias f
      where f.id=s.familia_id and f.codigo='familia-anderton'
    )
    and (
      (
        s.origem_tipo='aluguel'
        and exists(
          select 1 from public.pagamentos p
          where p.id=s.origem_id
            and p.user_id=v_owner
            and p.contrato_id=p_contrato_id
        )
      )
      or (
        s.origem_tipo='energia_inquilino'
        and exists(
          select 1 from public.energia e
          where e.id=s.origem_id
            and e.user_id=v_owner
            and e.contrato_id=p_contrato_id
        )
      )
    );
  get diagnostics v_pending_suggestions=row_count;

  delete from public.pagamentos p
  where p.user_id=v_owner and p.contrato_id=p_contrato_id;
  get diagnostics v_payments=row_count;

  delete from public.energia e
  where e.user_id=v_owner and e.contrato_id=p_contrato_id;
  get diagnostics v_energy=row_count;

  if v_will_vacate then
    update public.imoveis
    set status='vaga',
        tenant_id=null,
        contrato_inicio=null,
        contrato_fim=null,
        updated_at=now()
    where id=v_contract.imovel_id and user_id=v_owner;

    insert into public.historico_status(user_id,imovel_id,data,status,tenant_id)
    select v_owner,v_contract.imovel_id,current_date,'vaga',null
    where not exists(
      select 1 from public.historico_status h
      where h.user_id=v_owner
        and h.imovel_id=v_contract.imovel_id
        and h.data=current_date
        and h.status='vaga'
        and h.tenant_id is null
    );
  end if;

  delete from public.contratos c
  where c.id=p_contrato_id and c.user_id=v_owner;

  return jsonb_build_object(
    'contractId',p_contrato_id,
    'paymentsDeleted',v_payments,
    'energyDeleted',v_energy,
    'pendingSuggestionsDeleted',v_pending_suggestions,
    'contractDeleted',true,
    'tenantPreserved',true,
    'historyPreserved',true,
    'houseVacated',v_will_vacate,
    'energyPhotoPaths',v_energy_paths
  );
end;
$$;

-- Previa completa de um cadastro de inquilino. Contagens de "pagamentos" e
-- "energia" incluem somente linhas que possuem contrato_id de um contrato
-- deste inquilino; registros antigos sem contrato_id sao preservados.
create or replace function public.prever_exclusao_inquilino(
  p_inquilino_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_owner uuid:=public.usuario_proprietario_id(auth.uid());
  v_tenant public.inquilinos%rowtype;
  v_houses integer;
  v_contracts integer;
  v_active_contracts integer;
  v_payments integer;
  v_energy integer;
  v_pending_suggestions integer;
  v_documents integer;
  v_history integer;
  v_interests integer;
  v_portal integer;
begin
  if v_owner is null or not public.e_acesso_operacional(v_owner) then
    raise exception 'Conta sem permissao operacional.';
  end if;

  select t.* into v_tenant
  from public.inquilinos t
  where t.id=p_inquilino_id and t.user_id=v_owner;
  if not found then
    raise exception 'Inquilino nao encontrado.';
  end if;

  if exists(select 1 from public.imoveis i where i.tenant_id=p_inquilino_id and i.user_id<>v_owner)
    or exists(select 1 from public.contratos c where c.tenant_id=p_inquilino_id and c.user_id<>v_owner)
    or exists(select 1 from public.historico_status h where h.tenant_id=p_inquilino_id and h.user_id<>v_owner)
    or exists(select 1 from public.documentos d where d.inquilino_id=p_inquilino_id and d.user_id<>v_owner)
    or exists(select 1 from public.interessados x where x.inquilino_id=p_inquilino_id and x.user_id<>v_owner)
    or exists(select 1 from public.convites_inquilino c where c.inquilino_id=p_inquilino_id and c.proprietario_id<>v_owner)
    or exists(select 1 from public.acessos_inquilino a where a.inquilino_id=p_inquilino_id and a.proprietario_id<>v_owner)
    or exists(
      select 1
      from public.pagamentos p
      join public.contratos c on c.id=p.contrato_id
      where c.tenant_id=p_inquilino_id and p.user_id<>v_owner
    )
    or exists(
      select 1
      from public.energia e
      join public.contratos c on c.id=e.contrato_id
      where c.tenant_id=p_inquilino_id and e.user_id<>v_owner
    ) then
    raise exception 'O inquilino possui vinculo fora desta conta. Nenhum dado pode ser excluido.';
  end if;

  if exists(
    select 1
    from public.imoveis i
    where i.user_id=v_owner
      and i.tenant_id=p_inquilino_id
      and exists(
        select 1 from public.contratos c
        where c.user_id=v_owner
          and c.imovel_id=i.id
          and c.ativo
          and c.tenant_id is distinct from p_inquilino_id
      )
  ) then
    raise exception 'Uma casa possui outro contrato ativo. Corrija esse vinculo antes de excluir.';
  end if;

  select count(*)::integer into v_houses
  from public.imoveis i
  where i.user_id=v_owner and i.tenant_id=p_inquilino_id;

  select count(*)::integer,count(*) filter(where c.ativo)::integer
  into v_contracts,v_active_contracts
  from public.contratos c
  where c.user_id=v_owner and c.tenant_id=p_inquilino_id;

  select count(*)::integer into v_payments
  from public.pagamentos p
  where p.user_id=v_owner and exists(
    select 1 from public.contratos c
    where c.id=p.contrato_id
      and c.user_id=v_owner
      and c.tenant_id=p_inquilino_id
  );

  select count(*)::integer into v_energy
  from public.energia e
  where e.user_id=v_owner and exists(
    select 1 from public.contratos c
    where c.id=e.contrato_id
      and c.user_id=v_owner
      and c.tenant_id=p_inquilino_id
  );

  select count(*)::integer into v_pending_suggestions
  from public.minha_casa_sugestoes s
  where s.status='pendente'
    and s.origem_proprietario_id=v_owner
    and exists(
      select 1 from public.minha_casa_familias f
      where f.id=s.familia_id and f.codigo='familia-anderton'
    )
    and (
      (
        s.origem_tipo='aluguel'
        and exists(
          select 1
          from public.pagamentos p
          join public.contratos c on c.id=p.contrato_id
          where p.id=s.origem_id
            and p.user_id=v_owner
            and c.user_id=v_owner
            and c.tenant_id=p_inquilino_id
        )
      )
      or (
        s.origem_tipo='energia_inquilino'
        and exists(
          select 1
          from public.energia e
          join public.contratos c on c.id=e.contrato_id
          where e.id=s.origem_id
            and e.user_id=v_owner
            and c.user_id=v_owner
            and c.tenant_id=p_inquilino_id
        )
      )
    );

  select count(*)::integer into v_documents
  from public.documentos d
  where d.user_id=v_owner and d.inquilino_id=p_inquilino_id;

  select count(*)::integer into v_history
  from public.historico_status h
  where h.user_id=v_owner and h.tenant_id=p_inquilino_id;

  select count(*)::integer into v_interests
  from public.interessados x
  where x.user_id=v_owner and x.inquilino_id=p_inquilino_id;

  select
    (select count(*) from public.convites_inquilino c
      where c.proprietario_id=v_owner and c.inquilino_id=p_inquilino_id)
    +(select count(*) from public.acessos_inquilino a
      where a.proprietario_id=v_owner and a.inquilino_id=p_inquilino_id)
  into v_portal;

  return jsonb_build_object(
    'tenantId',v_tenant.id,
    'tenantName',v_tenant.nome,
    'activeHousesCount',v_houses,
    'activeHouseNames',coalesce((
      select jsonb_agg(i.nome order by i.nome)
      from public.imoveis i
      where i.user_id=v_owner and i.tenant_id=p_inquilino_id
    ),'[]'::jsonb),
    'contractsCount',v_contracts,
    'activeContractsCount',v_active_contracts,
    'paymentsCount',v_payments,
    'energyCount',v_energy,
    'pendingSuggestionsCount',v_pending_suggestions,
    'documentsCount',v_documents,
    'statusHistoryCount',v_history,
    'interestLinksCount',v_interests,
    'portalLinksCount',v_portal,
    'linkedRecordsCount',1+v_contracts+v_payments+v_energy+v_pending_suggestions+v_documents+v_history+v_portal,
    'preservedInterestLinksCount',v_interests,
    'documentStoragePaths',coalesce((
      select jsonb_agg(d.storage_path)
      from public.documentos d
      where d.user_id=v_owner
        and d.inquilino_id=p_inquilino_id
        and d.storage_path is not null
        and d.storage_path<>''
    ),'[]'::jsonb),
    'energyPhotoPaths',coalesce((
      select jsonb_agg(e.foto_path)
      from public.energia e
      where e.user_id=v_owner
        and e.foto_path is not null
        and e.foto_path<>''
        and exists(
          select 1 from public.contratos c
          where c.id=e.contrato_id
            and c.user_id=v_owner
            and c.tenant_id=p_inquilino_id
        )
    ),'[]'::jsonb)
  );
end;
$$;

-- Exclui por engano um cadastro inteiro. A confirmacao deve ser exatamente o
-- nome do inquilino (comparacao sem diferenciar maiusculas/minusculas).
-- Outros inquilinos, casas e interessados sao preservados.
create or replace function public.excluir_inquilino_por_engano(
  p_inquilino_id uuid,
  p_confirmacao text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_owner uuid:=public.usuario_proprietario_id(auth.uid());
  v_tenant public.inquilinos%rowtype;
  v_contract_ids uuid[]:=array[]::uuid[];
  v_house_ids uuid[]:=array[]::uuid[];
  v_payments integer:=0;
  v_energy integer:=0;
  v_pending_suggestions integer:=0;
  v_contracts integer:=0;
  v_documents integer:=0;
  v_history integer:=0;
  v_interests integer:=0;
  v_invites integer:=0;
  v_accesses integer:=0;
  v_document_paths jsonb:='[]'::jsonb;
  v_energy_paths jsonb:='[]'::jsonb;
begin
  if v_owner is null or not public.e_acesso_operacional(v_owner) then
    raise exception 'Conta sem permissao operacional.';
  end if;

  select t.* into v_tenant
  from public.inquilinos t
  where t.id=p_inquilino_id and t.user_id=v_owner
  for update;
  if not found then
    raise exception 'Inquilino nao encontrado.';
  end if;
  if lower(trim(coalesce(p_confirmacao,'')))<>lower(trim(v_tenant.nome)) then
    raise exception 'Confirmacao invalida. Digite exatamente o nome do inquilino.';
  end if;

  if exists(select 1 from public.imoveis i where i.tenant_id=p_inquilino_id and i.user_id<>v_owner)
    or exists(select 1 from public.contratos c where c.tenant_id=p_inquilino_id and c.user_id<>v_owner)
    or exists(select 1 from public.historico_status h where h.tenant_id=p_inquilino_id and h.user_id<>v_owner)
    or exists(select 1 from public.documentos d where d.inquilino_id=p_inquilino_id and d.user_id<>v_owner)
    or exists(select 1 from public.interessados x where x.inquilino_id=p_inquilino_id and x.user_id<>v_owner)
    or exists(select 1 from public.convites_inquilino c where c.inquilino_id=p_inquilino_id and c.proprietario_id<>v_owner)
    or exists(select 1 from public.acessos_inquilino a where a.inquilino_id=p_inquilino_id and a.proprietario_id<>v_owner)
    or exists(
      select 1
      from public.pagamentos p
      join public.contratos c on c.id=p.contrato_id
      where c.tenant_id=p_inquilino_id and p.user_id<>v_owner
    )
    or exists(
      select 1
      from public.energia e
      join public.contratos c on c.id=e.contrato_id
      where c.tenant_id=p_inquilino_id and e.user_id<>v_owner
    ) then
    raise exception 'O inquilino possui vinculo fora desta conta. Nenhum dado foi excluido.';
  end if;

  if exists(
    select 1
    from public.imoveis i
    where i.user_id=v_owner
      and i.tenant_id=p_inquilino_id
      and exists(
        select 1 from public.contratos c
        where c.user_id=v_owner
          and c.imovel_id=i.id
          and c.ativo
          and c.tenant_id is distinct from p_inquilino_id
      )
  ) then
    raise exception 'Uma casa possui outro contrato ativo. Corrija esse vinculo antes de excluir.';
  end if;

  select coalesce(array_agg(c.id),array[]::uuid[])
  into v_contract_ids
  from public.contratos c
  where c.user_id=v_owner and c.tenant_id=p_inquilino_id;

  select coalesce(array_agg(i.id),array[]::uuid[])
  into v_house_ids
  from public.imoveis i
  where i.user_id=v_owner and i.tenant_id=p_inquilino_id;

  perform 1 from public.imoveis i
  where i.id=any(v_house_ids) and i.user_id=v_owner
  for update;

  select coalesce(jsonb_agg(d.storage_path),'[]'::jsonb)
  into v_document_paths
  from public.documentos d
  where d.user_id=v_owner
    and d.inquilino_id=p_inquilino_id
    and d.storage_path is not null
    and d.storage_path<>'';

  select coalesce(jsonb_agg(e.foto_path),'[]'::jsonb)
  into v_energy_paths
  from public.energia e
  where e.user_id=v_owner
    and e.contrato_id=any(v_contract_ids)
    and e.foto_path is not null
    and e.foto_path<>'';

  delete from public.minha_casa_sugestoes s
  where s.status='pendente'
    and s.origem_proprietario_id=v_owner
    and exists(
      select 1 from public.minha_casa_familias f
      where f.id=s.familia_id and f.codigo='familia-anderton'
    )
    and (
      (
        s.origem_tipo='aluguel'
        and exists(
          select 1 from public.pagamentos p
          where p.id=s.origem_id
            and p.user_id=v_owner
            and p.contrato_id=any(v_contract_ids)
        )
      )
      or (
        s.origem_tipo='energia_inquilino'
        and exists(
          select 1 from public.energia e
          where e.id=s.origem_id
            and e.user_id=v_owner
            and e.contrato_id=any(v_contract_ids)
        )
      )
    );
  get diagnostics v_pending_suggestions=row_count;

  delete from public.pagamentos p
  where p.user_id=v_owner and p.contrato_id=any(v_contract_ids);
  get diagnostics v_payments=row_count;

  delete from public.energia e
  where e.user_id=v_owner and e.contrato_id=any(v_contract_ids);
  get diagnostics v_energy=row_count;

  delete from public.documentos d
  where d.user_id=v_owner and d.inquilino_id=p_inquilino_id;
  get diagnostics v_documents=row_count;

  delete from public.historico_status h
  where h.user_id=v_owner and h.tenant_id=p_inquilino_id;
  get diagnostics v_history=row_count;

  delete from public.contratos c
  where c.user_id=v_owner and c.tenant_id=p_inquilino_id;
  get diagnostics v_contracts=row_count;

  update public.interessados x
  set inquilino_id=null,updated_at=now()
  where x.user_id=v_owner and x.inquilino_id=p_inquilino_id;
  get diagnostics v_interests=row_count;

  delete from public.acessos_inquilino a
  where a.proprietario_id=v_owner and a.inquilino_id=p_inquilino_id;
  get diagnostics v_accesses=row_count;

  delete from public.convites_inquilino c
  where c.proprietario_id=v_owner and c.inquilino_id=p_inquilino_id;
  get diagnostics v_invites=row_count;

  update public.imoveis i
  set status='vaga',
      tenant_id=null,
      contrato_inicio=null,
      contrato_fim=null,
      updated_at=now()
  where i.user_id=v_owner and i.id=any(v_house_ids);

  insert into public.historico_status(user_id,imovel_id,data,status,tenant_id)
  select v_owner,h.id,current_date,'vaga',null
  from unnest(v_house_ids) as h(id)
  where not exists(
    select 1 from public.historico_status s
    where s.user_id=v_owner
      and s.imovel_id=h.id
      and s.data=current_date
      and s.status='vaga'
      and s.tenant_id is null
  );

  delete from public.inquilinos t
  where t.id=p_inquilino_id and t.user_id=v_owner;
  if not found then
    raise exception 'O cadastro mudou durante a exclusao. Nenhum dado foi confirmado.';
  end if;

  return jsonb_build_object(
    'tenantId',p_inquilino_id,
    'tenantDeleted',true,
    'housesVacated',coalesce(array_length(v_house_ids,1),0),
    'contractsDeleted',v_contracts,
    'paymentsDeleted',v_payments,
    'energyDeleted',v_energy,
    'pendingSuggestionsDeleted',v_pending_suggestions,
    'documentsDeleted',v_documents,
    'historyEventsDeleted',v_history,
    'interestLinksCleared',v_interests,
    'portalLinksDeleted',v_invites+v_accesses,
    'documentStoragePaths',v_document_paths,
    'energyPhotoPaths',v_energy_paths
  );
end;
$$;

revoke all on function public.iniciar_contrato_gestao(uuid,uuid,date,date,numeric,int,text,int,numeric) from public,anon;
revoke all on function public.encerrar_contrato_gestao(uuid,uuid,date,text) from public,anon;
revoke all on function public.prever_exclusao_contrato(uuid) from public,anon;
revoke all on function public.excluir_contrato_por_engano(uuid,text) from public,anon;
revoke all on function public.prever_exclusao_inquilino(uuid) from public,anon;
revoke all on function public.excluir_inquilino_por_engano(uuid,text) from public,anon;

grant execute on function public.iniciar_contrato_gestao(uuid,uuid,date,date,numeric,int,text,int,numeric) to authenticated;
grant execute on function public.encerrar_contrato_gestao(uuid,uuid,date,text) to authenticated;
grant execute on function public.prever_exclusao_contrato(uuid) to authenticated;
grant execute on function public.excluir_contrato_por_engano(uuid,text) to authenticated;
grant execute on function public.prever_exclusao_inquilino(uuid) to authenticated;
grant execute on function public.excluir_inquilino_por_engano(uuid,text) to authenticated;

comment on function public.prever_exclusao_contrato(uuid)
  is 'Previa RLS-aware dos registros diretamente ligados a um contrato.';
comment on function public.excluir_contrato_por_engano(uuid,text)
  is 'Exclui cadastro errado de contrato e somente pagamentos/energia com o mesmo contrato_id.';
comment on function public.prever_exclusao_inquilino(uuid)
  is 'Previa RLS-aware de exclusao completa de um cadastro de inquilino.';
comment on function public.excluir_inquilino_por_engano(uuid,text)
  is 'Exclui inquilino cadastrado por engano sem afetar vinculos de outras contas ou pessoas.';

commit;
