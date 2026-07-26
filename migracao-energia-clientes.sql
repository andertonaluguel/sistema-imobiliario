-- ============================================================
-- Energia completa, características dos imóveis e interessados
-- Idempotente: pode ser executada novamente com segurança.
-- ============================================================

alter table public.configuracoes add column if not exists energia_ativa boolean not null default true;
alter table public.configuracoes add column if not exists tema text not null default 'original';

alter table public.imoveis add column if not exists quartos int not null default 0;
alter table public.imoveis add column if not exists banheiros int not null default 0;
alter table public.imoveis add column if not exists cozinha boolean not null default false;
alter table public.imoveis add column if not exists sala boolean not null default false;
alter table public.imoveis add column if not exists garagem boolean not null default false;
alter table public.imoveis add column if not exists quintal boolean not null default false;
alter table public.imoveis add column if not exists area_servico boolean not null default false;
alter table public.imoveis add column if not exists energia_ativa boolean not null default true;
alter table public.imoveis add column if not exists energia_dia_vencimento int not null default 5;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='imoveis_quartos_check') then
    alter table public.imoveis add constraint imoveis_quartos_check check(quartos>=0);
  end if;
  if not exists(select 1 from pg_constraint where conname='imoveis_banheiros_check') then
    alter table public.imoveis add constraint imoveis_banheiros_check check(banheiros>=0);
  end if;
  if not exists(select 1 from pg_constraint where conname='imoveis_energia_dia_check') then
    alter table public.imoveis add constraint imoveis_energia_dia_check check(energia_dia_vencimento between 1 and 31);
  end if;
end $$;

-- Para os imóveis já existentes, parte do mesmo dia usado pelo aluguel.
update public.imoveis set energia_dia_vencimento=dia_vencimento
where energia_dia_vencimento=5 and dia_vencimento<>5;

alter table public.energia add column if not exists leitura_anterior numeric(14,2) not null default 0;
alter table public.energia add column if not exists leitura_atual numeric(14,2) not null default 0;
alter table public.energia add column if not exists tarifa_kwh numeric(14,4) not null default 0;
alter table public.energia add column if not exists acrescimos numeric(12,2) not null default 0;
alter table public.energia add column if not exists descontos numeric(12,2) not null default 0;
alter table public.energia add column if not exists ajuste_descricao text not null default '';
alter table public.energia add column if not exists valor_calculado numeric(12,2) not null default 0;
alter table public.energia add column if not exists valor_manual boolean not null default false;
alter table public.energia add column if not exists vencimento date;
alter table public.energia add column if not exists foto_path text;

-- Valores antigos foram digitados diretamente, portanto continuam manuais.
update public.energia set valor_calculado=valor,valor_manual=true
where valor_calculado=0 and valor>0 and leitura_atual=0;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='energia_leitura_anterior_check') then
    alter table public.energia add constraint energia_leitura_anterior_check check(leitura_anterior>=0);
  end if;
  if not exists(select 1 from pg_constraint where conname='energia_leitura_atual_check') then
    alter table public.energia add constraint energia_leitura_atual_check check(leitura_atual>=0);
  end if;
  if not exists(select 1 from pg_constraint where conname='energia_tarifa_check') then
    alter table public.energia add constraint energia_tarifa_check check(tarifa_kwh>=0);
  end if;
  if not exists(select 1 from pg_constraint where conname='energia_acrescimos_check') then
    alter table public.energia add constraint energia_acrescimos_check check(acrescimos>=0);
  end if;
  if not exists(select 1 from pg_constraint where conname='energia_descontos_check') then
    alter table public.energia add constraint energia_descontos_check check(descontos>=0);
  end if;
end $$;

create table if not exists public.interessados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  telefone text not null default '',
  valor_maximo numeric(12,2) not null default 0 check(valor_maximo>=0),
  quartos_min int not null default 0 check(quartos_min>=0),
  banheiros_min int not null default 0 check(banheiros_min>=0),
  precisa_garagem boolean not null default false,
  precisa_quintal boolean not null default false,
  precisa_cozinha boolean not null default false,
  precisa_sala boolean not null default false,
  precisa_area_servico boolean not null default false,
  observacoes text not null default '',
  status text not null default 'novo' check(status in ('novo','conversando','visita','quente','fechado','desistiu')),
  inquilino_id uuid references public.inquilinos(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_interessados_user on public.interessados(user_id);
create index if not exists idx_interessados_status on public.interessados(user_id,status);
alter table public.interessados enable row level security;
drop policy if exists own_rows on public.interessados;
create policy own_rows on public.interessados for all to authenticated
  using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update,delete on public.interessados to authenticated;

-- Restauração atômica v5: inclui configurações de energia, imóveis completos
-- e interessados. Fotos de energia permanecem no armazenamento privado.
create or replace function public.importar_backup_atomico_v5(p_payload jsonb,p_substituir boolean default false)
returns void language plpgsql security invoker set search_path=public
as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'Usuario nao autenticado.'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Backup invalido.'; end if;
  if jsonb_array_length(coalesce(p_payload->'houses','[]'::jsonb))>500
    or jsonb_array_length(coalesce(p_payload->'tenants','[]'::jsonb))>2000
    or jsonb_array_length(coalesce(p_payload->'interests','[]'::jsonb))>5000
    or jsonb_array_length(coalesce(p_payload->'contracts','[]'::jsonb))>5000
    or jsonb_array_length(coalesce(p_payload->'payments','[]'::jsonb))>50000
    or jsonb_array_length(coalesce(p_payload->'energy','[]'::jsonb))>50000 then
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
    delete from public.interessados where user_id=v_uid;
    delete from public.imoveis where user_id=v_uid;
    delete from public.inquilinos where user_id=v_uid;
  end if;

  insert into public.inquilinos(id,user_id,nome,telefone,email,documento,emergencia_nome)
  select x.id,v_uid,x.nome,coalesce(x.telefone,''),coalesce(x.email,''),coalesce(x.documento,''),coalesce(x.emergencia_nome,'')
  from jsonb_to_recordset(coalesce(p_payload->'tenants','[]'::jsonb)) as x(
    id uuid,nome text,telefone text,email text,documento text,emergencia_nome text
  );

  insert into public.imoveis(id,user_id,nome,endereco,status,aluguel_valor,dia_vencimento,
    ultima_vistoria,tenant_id,contrato_inicio,contrato_fim,quartos,banheiros,cozinha,sala,
    garagem,quintal,area_servico,energia_ativa,energia_dia_vencimento)
  select x.id,v_uid,x.nome,coalesce(x.endereco,''),x.status,x.aluguel_valor,x.dia_vencimento,
    x.ultima_vistoria,x.tenant_id,x.contrato_inicio,x.contrato_fim,coalesce(x.quartos,0),
    coalesce(x.banheiros,0),coalesce(x.cozinha,false),coalesce(x.sala,false),
    coalesce(x.garagem,false),coalesce(x.quintal,false),coalesce(x.area_servico,false),
    coalesce(x.energia_ativa,true),coalesce(x.energia_dia_vencimento,5)
  from jsonb_to_recordset(coalesce(p_payload->'houses','[]'::jsonb)) as x(
    id uuid,nome text,endereco text,status text,aluguel_valor numeric,dia_vencimento int,
    ultima_vistoria date,tenant_id uuid,contrato_inicio date,contrato_fim date,
    quartos int,banheiros int,cozinha boolean,sala boolean,garagem boolean,quintal boolean,area_servico boolean,
    energia_ativa boolean,energia_dia_vencimento int
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

  insert into public.energia(user_id,imovel_id,contrato_id,mes,valor,kwh,leitura_anterior,
    leitura_atual,tarifa_kwh,acrescimos,descontos,ajuste_descricao,valor_calculado,
    valor_manual,vencimento,pago,data_pagamento)
  select v_uid,x.imovel_id,x.contrato_id,x.mes,x.valor,x.kwh,coalesce(x.leitura_anterior,0),
    coalesce(x.leitura_atual,0),coalesce(x.tarifa_kwh,0),coalesce(x.acrescimos,0),
    coalesce(x.descontos,0),coalesce(x.ajuste_descricao,''),coalesce(x.valor_calculado,x.valor),
    coalesce(x.valor_manual,true),x.vencimento,x.pago,x.data_pagamento
  from jsonb_to_recordset(coalesce(p_payload->'energy','[]'::jsonb)) as x(
    imovel_id uuid,contrato_id uuid,mes text,valor numeric,kwh numeric,leitura_anterior numeric,
    leitura_atual numeric,tarifa_kwh numeric,acrescimos numeric,descontos numeric,
    ajuste_descricao text,valor_calculado numeric,valor_manual boolean,vencimento date,
    pago boolean,data_pagamento date
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
  from jsonb_to_recordset(coalesce(p_payload->'photos','[]'::jsonb)) as x(imovel_id uuid,dados text,ordem int);
  insert into public.eventos(user_id,data,texto)
  select v_uid,x.data,coalesce(x.texto,'')
  from jsonb_to_recordset(coalesce(p_payload->'events','[]'::jsonb)) as x(data date,texto text);

  insert into public.interessados(id,user_id,nome,telefone,valor_maximo,quartos_min,banheiros_min,
    precisa_garagem,precisa_quintal,precisa_cozinha,precisa_sala,precisa_area_servico,
    observacoes,status,inquilino_id)
  select x.id,v_uid,x.nome,coalesce(x.telefone,''),coalesce(x.valor_maximo,0),coalesce(x.quartos_min,0),
    coalesce(x.banheiros_min,0),coalesce(x.precisa_garagem,false),coalesce(x.precisa_quintal,false),
    coalesce(x.precisa_cozinha,false),coalesce(x.precisa_sala,false),coalesce(x.precisa_area_servico,false),
    coalesce(x.observacoes,''),coalesce(x.status,'novo'),x.inquilino_id
  from jsonb_to_recordset(coalesce(p_payload->'interests','[]'::jsonb)) as x(
    id uuid,nome text,telefone text,valor_maximo numeric,quartos_min int,banheiros_min int,
    precisa_garagem boolean,precisa_quintal boolean,precisa_cozinha boolean,precisa_sala boolean,
    precisa_area_servico boolean,observacoes text,
    status text,inquilino_id uuid
  );

  if jsonb_typeof(p_payload->'config')='object' then
    insert into public.configuracoes(user_id,locador_nome,locador_documento,energia_ativa,tema,updated_at)
    values(v_uid,coalesce(p_payload#>>'{config,locador_nome}',''),
      coalesce(p_payload#>>'{config,locador_documento}',''),
      coalesce((p_payload#>>'{config,energia_ativa}')::boolean,true),
      case when p_payload#>>'{config,tema}' in ('original','aurora','oceano','citrico')
        then p_payload#>>'{config,tema}' else 'original' end,now())
    on conflict(user_id) do update set locador_nome=excluded.locador_nome,
      locador_documento=excluded.locador_documento,energia_ativa=excluded.energia_ativa,
      tema=excluded.tema,updated_at=now();
  end if;
end;
$$;

revoke all on function public.importar_backup_atomico_v5(jsonb,boolean) from public,anon;
grant execute on function public.importar_backup_atomico_v5(jsonb,boolean) to authenticated;
