-- ============================================================
-- CONTRATOS HISTORICOS + CICLOS DE COBRANCA
-- Evolucao aditiva e segura sobre a base de producao atual.
-- ============================================================

create extension if not exists "pgcrypto";

alter table public.contratos add column if not exists dia_vencimento int not null default 5;
alter table public.contratos add column if not exists modalidade_vencimento text not null default 'fixo';
alter table public.contratos add column if not exists proporcional_dias int not null default 0;
alter table public.contratos add column if not exists proporcional_valor numeric(12,2) not null default 0;
alter table public.contratos add column if not exists proporcional_pago boolean not null default false;
alter table public.contratos add column if not exists proporcional_data_pagamento date;
alter table public.contratos add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists(select 1 from pg_constraint where conname='contratos_dia_vencimento_check') then
    alter table public.contratos add constraint contratos_dia_vencimento_check check(dia_vencimento between 1 and 31);
  end if;
  if not exists(select 1 from pg_constraint where conname='contratos_modalidade_check') then
    alter table public.contratos add constraint contratos_modalidade_check check(modalidade_vencimento in ('entrada','fixo'));
  end if;
end $$;

alter table public.pagamentos add column if not exists contrato_id uuid references public.contratos(id) on delete set null;
alter table public.energia add column if not exists contrato_id uuid references public.contratos(id) on delete set null;

alter table public.pagamentos drop constraint if exists pagamentos_imovel_id_mes_key;
alter table public.energia drop constraint if exists energia_imovel_id_mes_key;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='pagamentos_contrato_mes_key') then
    alter table public.pagamentos add constraint pagamentos_contrato_mes_key unique(contrato_id,mes);
  end if;
  if not exists(select 1 from pg_constraint where conname='energia_contrato_mes_key') then
    alter table public.energia add constraint energia_contrato_mes_key unique(contrato_id,mes);
  end if;
end $$;

create index if not exists idx_contratos_imovel on public.contratos(imovel_id,inicio);
create index if not exists idx_contratos_inquilino on public.contratos(tenant_id,inicio);
create index if not exists idx_pagamentos_contrato on public.pagamentos(contrato_id);
create index if not exists idx_energia_contrato on public.energia(contrato_id);

-- Reconstrucao do historico que ja existe. O proximo evento encerra o periodo
-- anterior. Ajustes proporcionais antigos sao considerados quitados para nao
-- inventar dividas retroativas.
with timeline as (
  select hs.*,
    lead(hs.data) over(partition by hs.imovel_id order by hs.data,hs.created_at,hs.id) as proxima_data
  from public.historico_status hs
), rented as (
  select t.user_id,t.imovel_id,t.tenant_id,
    case when t.proxima_data is null and i.tenant_id=t.tenant_id
      then coalesce(i.contrato_inicio,t.data) else t.data end as inicio,
    case when t.proxima_data is not null then t.proxima_data-1
      when i.tenant_id=t.tenant_id then i.contrato_fim else t.data end as fim,
    i.aluguel_valor as valor,i.dia_vencimento,
    (t.proxima_data is null and i.status='alugada' and i.tenant_id=t.tenant_id) as ativo
  from timeline t join public.imoveis i on i.id=t.imovel_id
  where t.status='alugada' and t.tenant_id is not null
)
insert into public.contratos(user_id,imovel_id,tenant_id,inicio,fim,valor,ativo,
  dia_vencimento,modalidade_vencimento,proporcional_pago)
select r.user_id,r.imovel_id,r.tenant_id,r.inicio,r.fim,r.valor,r.ativo,
  r.dia_vencimento,
  case when extract(day from r.inicio)::int=r.dia_vencimento then 'entrada' else 'fixo' end,
  true
from rented r
where not exists(
  select 1 from public.contratos c
  where c.imovel_id=r.imovel_id and c.tenant_id=r.tenant_id and c.inicio=r.inicio
);

insert into public.contratos(user_id,imovel_id,tenant_id,inicio,fim,valor,ativo,
  dia_vencimento,modalidade_vencimento,proporcional_pago)
select i.user_id,i.id,i.tenant_id,coalesce(i.contrato_inicio,current_date),i.contrato_fim,
  i.aluguel_valor,true,i.dia_vencimento,
  case when extract(day from coalesce(i.contrato_inicio,current_date))::int=i.dia_vencimento then 'entrada' else 'fixo' end,
  true
from public.imoveis i
where i.status='alugada' and i.tenant_id is not null
  and not exists(select 1 from public.contratos c where c.imovel_id=i.id and c.ativo);

-- O historico antigo nao informa se houve acerto proporcional. Mantemos zero
-- para nao inventar nem divida nem receita. Ao editar o contrato, o app calcula
-- o ajuste e permite registra-lo conscientemente.
update public.contratos set proporcional_pago=true
where proporcional_dias=0 and proporcional_valor=0;

create or replace function public.vencimento_do_mes(p_mes text,p_dia int)
returns date language sql immutable set search_path=public
as $$
  select make_date(substring(p_mes,1,4)::int,substring(p_mes,6,2)::int,
    least(greatest(p_dia,1),extract(day from (
      date_trunc('month',make_date(substring(p_mes,1,4)::int,substring(p_mes,6,2)::int,1))
      + interval '1 month - 1 day'))::int))
$$;

revoke all on function public.vencimento_do_mes(text,int) from public,anon;
grant execute on function public.vencimento_do_mes(text,int) to authenticated;

update public.pagamentos p set contrato_id=(
  select c.id from public.contratos c
  where c.imovel_id=p.imovel_id
    and public.vencimento_do_mes(p.mes,c.dia_vencimento)>=c.inicio
    and public.vencimento_do_mes(p.mes,c.dia_vencimento)<=coalesce(c.fim,'9999-12-31'::date)
  order by c.inicio desc limit 1
) where p.contrato_id is null;

update public.energia e set contrato_id=(
  select c.id from public.contratos c
  where c.imovel_id=e.imovel_id
    and (date_trunc('month',make_date(substring(e.mes,1,4)::int,substring(e.mes,6,2)::int,1))
      + interval '1 month - 1 day')::date>=c.inicio
    and make_date(substring(e.mes,1,4)::int,substring(e.mes,6,2)::int,1)
      <=coalesce(c.fim,'9999-12-31'::date)
  order by c.inicio desc limit 1
) where e.contrato_id is null;

-- Leitura do portal estritamente pelo contrato do proprio inquilino.
drop policy if exists tenant_read on public.contratos;
create policy tenant_read on public.contratos for select to authenticated
  using(user_id=public.portal_owner_id() and tenant_id=public.portal_inquilino_id());

drop policy if exists tenant_read on public.pagamentos;
create policy tenant_read on public.pagamentos for select to authenticated
  using(user_id=public.portal_owner_id() and exists(
    select 1 from public.contratos c
    where c.id=pagamentos.contrato_id and c.tenant_id=public.portal_inquilino_id()
  ));

drop policy if exists tenant_read on public.energia;
create policy tenant_read on public.energia for select to authenticated
  using(user_id=public.portal_owner_id() and exists(
    select 1 from public.contratos c
    where c.id=energia.contrato_id and c.tenant_id=public.portal_inquilino_id()
  ));

grant select,insert,update,delete on public.contratos to authenticated;

-- Troca de inquilino atomica: encerra o contrato anterior, cria o novo e
-- atualiza a ficha atual da casa na mesma transacao.
create or replace function public.iniciar_contrato_gestao(
  p_imovel_id uuid,p_inquilino_id uuid,p_inicio date,p_fim date,p_valor numeric,
  p_dia_vencimento int,p_modalidade text,p_proporcional_dias int,p_proporcional_valor numeric
)
returns setof public.contratos language plpgsql security definer set search_path=public
as $$
declare v_uid uuid:=auth.uid();v_contract public.contratos%rowtype;v_dia int;v_dias int;v_prop numeric;
begin
  if v_uid is null or not exists(select 1 from public.proprietarios where user_id=v_uid) then
    raise exception 'Conta sem permissao de proprietario.';
  end if;
  if not exists(select 1 from public.imoveis where id=p_imovel_id and user_id=v_uid) then raise exception 'Imovel nao encontrado.'; end if;
  if not exists(select 1 from public.inquilinos where id=p_inquilino_id and user_id=v_uid) then raise exception 'Inquilino nao encontrado.'; end if;
  if p_inicio is null or p_valor<=0 or (p_fim is not null and p_fim<p_inicio) then raise exception 'Dados do contrato invalidos.'; end if;
  v_dia:=case when p_modalidade='entrada' then extract(day from p_inicio)::int else least(31,greatest(1,p_dia_vencimento)) end;
  v_dias:=case when p_modalidade='entrada' or v_dia=extract(day from p_inicio)::int then 0
    when v_dia>extract(day from p_inicio)::int then v_dia-extract(day from p_inicio)::int
    else 30-extract(day from p_inicio)::int+v_dia end;
  v_prop:=round((p_valor/30)*v_dias,2);

  if exists(select 1 from public.contratos where imovel_id=p_imovel_id and ativo and inicio>=p_inicio) then
    raise exception 'O novo contrato deve comecar depois do contrato atual.';
  end if;
  update public.contratos set fim=p_inicio-1,ativo=false,updated_at=now()
    where imovel_id=p_imovel_id and user_id=v_uid and ativo;
  insert into public.contratos(user_id,imovel_id,tenant_id,inicio,fim,valor,ativo,
    dia_vencimento,modalidade_vencimento,proporcional_dias,proporcional_valor,proporcional_pago)
  values(v_uid,p_imovel_id,p_inquilino_id,p_inicio,p_fim,p_valor,true,v_dia,
    case when p_modalidade='entrada' then 'entrada' else 'fixo' end,v_dias,v_prop,v_dias=0)
  returning * into v_contract;
  update public.imoveis set status='alugada',tenant_id=p_inquilino_id,contrato_inicio=p_inicio,
    contrato_fim=p_fim,aluguel_valor=p_valor,dia_vencimento=v_dia,updated_at=now()
    where id=p_imovel_id and user_id=v_uid;
  return next v_contract;
end;
$$;

create or replace function public.encerrar_contrato_gestao(
  p_imovel_id uuid,p_contrato_id uuid,p_fim date,p_novo_status text default 'vaga'
)
returns void language plpgsql security definer set search_path=public
as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null or not exists(select 1 from public.proprietarios where user_id=v_uid) then raise exception 'Conta sem permissao.'; end if;
  if p_novo_status not in ('vaga','manutencao') then raise exception 'Status invalido.'; end if;
  update public.contratos set fim=p_fim,ativo=false,updated_at=now()
    where id=p_contrato_id and imovel_id=p_imovel_id and user_id=v_uid;
  if not found then raise exception 'Contrato nao encontrado.'; end if;
  update public.imoveis set status=p_novo_status,tenant_id=null,contrato_inicio=null,
    contrato_fim=null,updated_at=now() where id=p_imovel_id and user_id=v_uid;
end;
$$;

revoke all on function public.iniciar_contrato_gestao(uuid,uuid,date,date,numeric,int,text,int,numeric) from public,anon;
revoke all on function public.encerrar_contrato_gestao(uuid,uuid,date,text) from public,anon;
grant execute on function public.iniciar_contrato_gestao(uuid,uuid,date,date,numeric,int,text,int,numeric) to authenticated;
grant execute on function public.encerrar_contrato_gestao(uuid,uuid,date,text) to authenticated;

-- Restauracao transacional da versao 4, agora incluindo contratos e vinculos.
create or replace function public.importar_backup_atomico_v4(p_payload jsonb,p_substituir boolean default false)
returns void language plpgsql security invoker set search_path=public
as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'Usuario nao autenticado.'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Backup invalido.'; end if;
  if jsonb_array_length(coalesce(p_payload->'houses','[]'::jsonb))>500
    or jsonb_array_length(coalesce(p_payload->'tenants','[]'::jsonb))>2000
    or jsonb_array_length(coalesce(p_payload->'contracts','[]'::jsonb))>5000
    or jsonb_array_length(coalesce(p_payload->'payments','[]'::jsonb))>50000 then
    raise exception 'Backup acima do limite permitido.';
  end if;

  if p_substituir then
    delete from public.fotos where user_id=v_uid;
    delete from public.pagamentos where user_id=v_uid;
    delete from public.energia where user_id=v_uid;
    delete from public.despesas where user_id=v_uid;
    delete from public.historico_status where user_id=v_uid;
    delete from public.aluguel_historico where user_id=v_uid;
    delete from public.documentos where user_id=v_uid;
    delete from public.contratos where user_id=v_uid;
    delete from public.eventos where user_id=v_uid;
    delete from public.imoveis where user_id=v_uid;
    delete from public.inquilinos where user_id=v_uid;
  end if;

  insert into public.inquilinos(id,user_id,nome,telefone,email,documento,emergencia_nome)
  select x.id,v_uid,x.nome,coalesce(x.telefone,''),coalesce(x.email,''),coalesce(x.documento,''),coalesce(x.emergencia_nome,'')
  from jsonb_to_recordset(coalesce(p_payload->'tenants','[]'::jsonb)) as x(
    id uuid,nome text,telefone text,email text,documento text,emergencia_nome text
  );

  insert into public.imoveis(id,user_id,nome,endereco,status,aluguel_valor,dia_vencimento,
    ultima_vistoria,tenant_id,contrato_inicio,contrato_fim)
  select x.id,v_uid,x.nome,coalesce(x.endereco,''),x.status,x.aluguel_valor,x.dia_vencimento,
    x.ultima_vistoria,x.tenant_id,x.contrato_inicio,x.contrato_fim
  from jsonb_to_recordset(coalesce(p_payload->'houses','[]'::jsonb)) as x(
    id uuid,nome text,endereco text,status text,aluguel_valor numeric,dia_vencimento int,
    ultima_vistoria date,tenant_id uuid,contrato_inicio date,contrato_fim date
  );

  insert into public.contratos(id,user_id,imovel_id,tenant_id,inicio,fim,valor,ativo,dia_vencimento,
    modalidade_vencimento,proporcional_dias,proporcional_valor,proporcional_pago,proporcional_data_pagamento)
  select x.id,v_uid,x.imovel_id,x.tenant_id,x.inicio,x.fim,x.valor,x.ativo,x.dia_vencimento,
    x.modalidade_vencimento,x.proporcional_dias,x.proporcional_valor,x.proporcional_pago,x.proporcional_data_pagamento
  from jsonb_to_recordset(coalesce(p_payload->'contracts','[]'::jsonb)) as x(
    id uuid,imovel_id uuid,tenant_id uuid,inicio date,fim date,valor numeric,ativo boolean,
    dia_vencimento int,modalidade_vencimento text,proporcional_dias int,proporcional_valor numeric,
    proporcional_pago boolean,proporcional_data_pagamento date
  );

  insert into public.pagamentos(user_id,imovel_id,contrato_id,mes,valor_pago,data_pagamento)
  select v_uid,x.imovel_id,x.contrato_id,x.mes,x.valor_pago,x.data_pagamento
  from jsonb_to_recordset(coalesce(p_payload->'payments','[]'::jsonb)) as x(
    imovel_id uuid,contrato_id uuid,mes text,valor_pago numeric,data_pagamento date
  );

  insert into public.energia(user_id,imovel_id,contrato_id,mes,valor,kwh,pago,data_pagamento)
  select v_uid,x.imovel_id,x.contrato_id,x.mes,x.valor,x.kwh,x.pago,x.data_pagamento
  from jsonb_to_recordset(coalesce(p_payload->'energy','[]'::jsonb)) as x(
    imovel_id uuid,contrato_id uuid,mes text,valor numeric,kwh numeric,pago boolean,data_pagamento date
  );

  insert into public.despesas(user_id,imovel_id,descricao,categoria,valor,data,prestador,status)
  select v_uid,x.imovel_id,x.descricao,x.categoria,x.valor,x.data,coalesce(x.prestador,''),x.status
  from jsonb_to_recordset(coalesce(p_payload->'expenses','[]'::jsonb)) as x(
    imovel_id uuid,descricao text,categoria text,valor numeric,data date,prestador text,status text
  );

  insert into public.historico_status(user_id,imovel_id,data,status,tenant_id)
  select v_uid,x.imovel_id,x.data,x.status,x.tenant_id
  from jsonb_to_recordset(coalesce(p_payload->'history','[]'::jsonb)) as x(
    imovel_id uuid,data date,status text,tenant_id uuid
  );

  insert into public.aluguel_historico(user_id,imovel_id,valor,data_inicio)
  select v_uid,x.imovel_id,x.valor,x.data_inicio
  from jsonb_to_recordset(coalesce(p_payload->'adjustments','[]'::jsonb)) as x(
    imovel_id uuid,valor numeric,data_inicio date
  );

  insert into public.fotos(user_id,imovel_id,dados,ordem)
  select v_uid,x.imovel_id,x.dados,x.ordem
  from jsonb_to_recordset(coalesce(p_payload->'photos','[]'::jsonb)) as x(
    imovel_id uuid,dados text,ordem int
  );

  insert into public.eventos(user_id,data,texto)
  select v_uid,x.data,coalesce(x.texto,'')
  from jsonb_to_recordset(coalesce(p_payload->'events','[]'::jsonb)) as x(data date,texto text);

  if jsonb_typeof(p_payload->'config')='object' then
    insert into public.configuracoes(user_id,locador_nome,locador_documento,updated_at)
    values(v_uid,coalesce(p_payload#>>'{config,locador_nome}',''),
      coalesce(p_payload#>>'{config,locador_documento}',''),now())
    on conflict(user_id) do update set locador_nome=excluded.locador_nome,
      locador_documento=excluded.locador_documento,updated_at=now();
  end if;
end;
$$;

revoke all on function public.importar_backup_atomico_v4(jsonb,boolean) from public,anon;
grant execute on function public.importar_backup_atomico_v4(jsonb,boolean) to authenticated;
