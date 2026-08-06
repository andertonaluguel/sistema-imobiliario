-- migracao-vitrine-retencao-agenda.sql
-- Etapas 5 e 6: busca salva, alerta de preco e agenda de visitas.
-- Nao altera nem remove dados existentes. Toda leitura privada permanece sob RLS.

begin;

do $$
begin
  if to_regprocedure('public.usuario_proprietario_id(uuid)') is null
     or to_regprocedure('public.vitrine_pode_operar(uuid)') is null
     or to_regprocedure('public.listar_vitrine_publica_v2(text)') is null then
    raise exception 'Preflight falhou: aplique antes a fundacao e a Etapa 2 da Vitrine.';
  end if;
end $$;

create table if not exists public.vitrine_buscas_salvas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.proprietarios(user_id) on delete cascade,
  nome text not null default '',
  finalidade text not null check (finalidade in ('alugar','vender')),
  cidade_id uuid references public.vitrine_cidades(id) on delete set null,
  filtros jsonb not null default '{}'::jsonb,
  resumo text not null default '',
  assinatura text not null,
  frequencia text not null check (frequencia in ('diaria','semanal')),
  canal text not null check (canal in ('email','whatsapp')),
  destino text not null,
  consentimento_lgpd boolean not null default false,
  ativo boolean not null default true,
  token_cancelamento uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vitrine_buscas_salvas_equivalente_idx
  on public.vitrine_buscas_salvas(user_id,assinatura,canal,lower(destino));
create index if not exists vitrine_buscas_salvas_ativas_idx
  on public.vitrine_buscas_salvas(user_id,ativo,created_at desc);

create table if not exists public.vitrine_alertas_preco (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.proprietarios(user_id) on delete cascade,
  imovel_id uuid not null references public.vitrine_imoveis(id) on delete cascade,
  finalidade text not null check (finalidade in ('alugar','vender')),
  preco_referencia numeric(14,2) not null check (preco_referencia > 0),
  ultimo_preco_notificado numeric(14,2),
  canal text not null check (canal in ('email','whatsapp')),
  destino text not null,
  consentimento_lgpd boolean not null default false,
  ativo boolean not null default true,
  token_cancelamento uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vitrine_alertas_preco_equivalente_idx
  on public.vitrine_alertas_preco(imovel_id,finalidade,canal,lower(destino));
create index if not exists vitrine_alertas_preco_ativos_idx
  on public.vitrine_alertas_preco(user_id,ativo,created_at desc);

create table if not exists public.vitrine_agenda_config (
  user_id uuid primary key references public.proprietarios(user_id) on delete cascade,
  confirmacao_automatica boolean not null default false,
  antecedencia_horas integer not null default 24 check (antecedencia_horas between 1 and 168),
  horizonte_dias integer not null default 30 check (horizonte_dias between 7 and 90),
  updated_at timestamptz not null default now()
);

create table if not exists public.vitrine_disponibilidade (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.proprietarios(user_id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  faixa text not null check (faixa in ('manha','tarde','noite')),
  inicio time not null,
  fim time not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vitrine_disponibilidade_horario_check check (fim > inicio),
  constraint vitrine_disponibilidade_unica unique(user_id,dia_semana,faixa)
);

create table if not exists public.vitrine_visitas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.proprietarios(user_id) on delete cascade,
  imovel_id uuid not null references public.vitrine_imoveis(id) on delete cascade,
  lead_id uuid references public.vitrine_leads(id) on delete set null,
  nome text not null,
  telefone text not null,
  data_preferida date not null,
  faixa text not null check (faixa in ('manha','tarde','noite')),
  mensagem text not null default '',
  status text not null default 'solicitada' check (
    status in ('solicitada','confirmada','reagendada','cancelada','realizada','nao_compareceu')
  ),
  responsavel_id uuid,
  origem text not null default 'vitrine',
  consentimento_lgpd boolean not null default false,
  token_gestao uuid not null default gen_random_uuid() unique,
  lembrete_em timestamptz,
  cancelada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vitrine_visitas_sem_conflito_idx
  on public.vitrine_visitas(user_id,data_preferida,faixa)
  where status in ('solicitada','confirmada','reagendada');
create index if not exists vitrine_visitas_operacao_idx
  on public.vitrine_visitas(user_id,status,data_preferida);

do $$
declare t text;
begin
  foreach t in array array[
    'vitrine_buscas_salvas','vitrine_alertas_preco','vitrine_agenda_config',
    'vitrine_disponibilidade','vitrine_visitas'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('drop policy if exists vitrine_dono on public.%I',t);
    execute format(
      'create policy vitrine_dono on public.%I for all to authenticated
       using (user_id=public.usuario_proprietario_id(auth.uid()) and public.vitrine_pode_operar(auth.uid()))
       with check (user_id=public.usuario_proprietario_id(auth.uid()) and public.vitrine_pode_operar(auth.uid()))',t
    );
    execute format('revoke all on public.%I from anon',t);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  end loop;
end $$;

create or replace function public.salvar_agenda_vitrine(p_config jsonb,p_horarios jsonb) returns boolean
language plpgsql security definer set search_path=public
as $$
declare v_owner uuid:=public.usuario_proprietario_id(auth.uid());v_auto boolean;v_ant integer;v_horizonte integer;
begin
  if v_owner is null or not public.vitrine_pode_operar(auth.uid()) then raise exception 'Sem permissao para configurar a agenda.';end if;
  if jsonb_typeof(coalesce(p_config,'{}'::jsonb))<>'object' or jsonb_typeof(coalesce(p_horarios,'[]'::jsonb))<>'array'
    then raise exception 'Agenda invalida.';end if;
  v_auto=coalesce((p_config->>'confirmacaoAutomatica')::boolean,false);
  v_ant=coalesce((p_config->>'antecedenciaHoras')::integer,24);
  v_horizonte=coalesce((p_config->>'horizonteDias')::integer,30);
  if v_ant not between 1 and 168 or v_horizonte not between 7 and 90 then raise exception 'Limites da agenda invalidos.';end if;
  insert into public.vitrine_agenda_config(user_id,confirmacao_automatica,antecedencia_horas,horizonte_dias,updated_at)
  values(v_owner,v_auto,v_ant,v_horizonte,now()) on conflict(user_id) do update set
    confirmacao_automatica=excluded.confirmacao_automatica,antecedencia_horas=excluded.antecedencia_horas,
    horizonte_dias=excluded.horizonte_dias,updated_at=now();
  delete from public.vitrine_disponibilidade where user_id=v_owner;
  insert into public.vitrine_disponibilidade(user_id,dia_semana,faixa,inicio,fim,ativo)
  select v_owner,h.dia_semana,h.faixa,h.inicio,h.fim,true
  from jsonb_to_recordset(coalesce(p_horarios,'[]'::jsonb))
    as h(dia_semana smallint,faixa text,inicio time,fim time)
  where h.dia_semana between 0 and 6 and h.faixa in ('manha','tarde','noite') and h.fim>h.inicio;
  if (select count(*) from public.vitrine_disponibilidade where user_id=v_owner)<>jsonb_array_length(coalesce(p_horarios,'[]'::jsonb))
    then raise exception 'Um ou mais horarios sao invalidos.';end if;
  return true;
end $$;

create or replace function public.vitrine_salvar_busca(
  p_slug text,p_nome text,p_finalidade text,p_cidade_id uuid,p_filtros jsonb,
  p_resumo text,p_frequencia text,p_canal text,p_destino text,p_consentimento boolean
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_owner uuid;v_assinatura text;v_id uuid;v_token uuid;v_destino text:=trim(coalesce(p_destino,''));
begin
  select user_id into v_owner from public.proprietarios where slug_publico=p_slug limit 1;
  if v_owner is null then raise exception 'Vitrine nao encontrada.';end if;
  if p_finalidade not in ('alugar','vender') or p_frequencia not in ('diaria','semanal')
     or p_canal not in ('email','whatsapp') then raise exception 'Busca invalida.';end if;
  if not coalesce(p_consentimento,false) then raise exception 'E necessario autorizar o alerta.';end if;
  if length(v_destino)<6 or length(v_destino)>180 then raise exception 'Informe um contato valido.';end if;
  if (p_canal='email' and v_destino !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
     or (p_canal='whatsapp' and length(regexp_replace(v_destino,'\D','','g'))<10)
    then raise exception 'Informe um contato valido para o canal escolhido.';end if;
  if (select count(*) from public.vitrine_buscas_salvas
      where user_id=v_owner and lower(destino)=lower(v_destino) and created_at>now()-interval '10 minutes')>=5
    then raise exception 'Muitas solicitacoes seguidas. Tente mais tarde.';end if;
  v_assinatura=md5(p_finalidade||'|'||coalesce(p_cidade_id::text,'')||'|'||coalesce(p_filtros,'{}'::jsonb)::text);
  insert into public.vitrine_buscas_salvas(
    user_id,nome,finalidade,cidade_id,filtros,resumo,assinatura,frequencia,canal,destino,consentimento_lgpd,ativo,updated_at
  ) values(
    v_owner,left(trim(coalesce(p_nome,'')),80),p_finalidade,p_cidade_id,coalesce(p_filtros,'{}'::jsonb),
    left(trim(coalesce(p_resumo,'')),500),v_assinatura,p_frequencia,p_canal,left(v_destino,180),true,true,now()
  ) on conflict(user_id,assinatura,canal,lower(destino)) do update set
    nome=excluded.nome,resumo=excluded.resumo,frequencia=excluded.frequencia,
    consentimento_lgpd=true,ativo=true,updated_at=now()
  returning id,token_cancelamento into v_id,v_token;
  return jsonb_build_object('ok',true,'id',v_id,'token',v_token);
end $$;

create or replace function public.vitrine_cancelar_busca(p_token uuid) returns boolean
language sql security definer set search_path=public
as $$
  update public.vitrine_buscas_salvas set ativo=false,updated_at=now()
  where token_cancelamento=p_token and ativo returning true
$$;

create or replace function public.vitrine_salvar_alerta_preco(
  p_imovel_id uuid,p_finalidade text,p_canal text,p_destino text,p_consentimento boolean
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_owner uuid;v_preco numeric;v_id uuid;v_token uuid;v_destino text:=trim(coalesce(p_destino,''));
begin
  select i.user_id,case when p_finalidade='vender' then i.preco_venda else i.aluguel end
    into v_owner,v_preco from public.vitrine_imoveis i
    where i.id=p_imovel_id and i.status='ativo'
      and (case when p_finalidade='vender' then i.finalidade in ('vender','ambos') else i.finalidade in ('alugar','ambos') end);
  if v_owner is null or coalesce(v_preco,0)<=0 then raise exception 'Imovel indisponivel para este alerta.';end if;
  if p_canal not in ('email','whatsapp') or not coalesce(p_consentimento,false)
    then raise exception 'E necessario autorizar o alerta.';end if;
  if length(v_destino)<6 or length(v_destino)>180 then raise exception 'Informe um contato valido.';end if;
  if (p_canal='email' and v_destino !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
     or (p_canal='whatsapp' and length(regexp_replace(v_destino,'\D','','g'))<10)
    then raise exception 'Informe um contato valido para o canal escolhido.';end if;
  insert into public.vitrine_alertas_preco(
    user_id,imovel_id,finalidade,preco_referencia,canal,destino,consentimento_lgpd,ativo,updated_at
  ) values(v_owner,p_imovel_id,p_finalidade,v_preco,p_canal,left(v_destino,180),true,true,now())
  on conflict(imovel_id,finalidade,canal,lower(destino)) do update set
    preco_referencia=excluded.preco_referencia,consentimento_lgpd=true,ativo=true,updated_at=now()
  returning id,token_cancelamento into v_id,v_token;
  return jsonb_build_object('ok',true,'id',v_id,'token',v_token,'preco',v_preco);
end $$;

create or replace function public.vitrine_cancelar_alerta_preco(p_token uuid) returns boolean
language sql security definer set search_path=public
as $$
  update public.vitrine_alertas_preco set ativo=false,updated_at=now()
  where token_cancelamento=p_token and ativo returning true
$$;

create or replace function public.vitrine_solicitar_visita(
  p_imovel_id uuid,p_nome text,p_telefone text,p_data date,p_faixa text,
  p_mensagem text,p_consentimento boolean
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_owner uuid;v_cfg public.vitrine_agenda_config%rowtype;v_lead uuid;v_visita uuid;v_token uuid;v_status text;
begin
  select user_id into v_owner from public.vitrine_imoveis
   where id=p_imovel_id and status='ativo';
  if v_owner is null then raise exception 'Imovel indisponivel.';end if;
  if not coalesce(p_consentimento,false) then raise exception 'E necessario autorizar o contato.';end if;
  if length(trim(coalesce(p_nome,'')))<2 or length(regexp_replace(coalesce(p_telefone,''),'\D','','g'))<10
    then raise exception 'Informe nome e telefone validos.';end if;
  select * into v_cfg from public.vitrine_agenda_config where user_id=v_owner;
  if not found then raise exception 'Agenda indisponivel no momento.';end if;
  if (select count(*) from public.vitrine_visitas v where v.user_id=v_owner
      and regexp_replace(v.telefone,'\D','','g')=regexp_replace(coalesce(p_telefone,''),'\D','','g')
      and v.created_at>now()-interval '10 minutes')>=3
    then raise exception 'Muitas solicitacoes seguidas. Tente mais tarde.';end if;
  if p_faixa not in ('manha','tarde','noite') or p_data<current_date
     or p_data>current_date+v_cfg.horizonte_dias then raise exception 'Data ou faixa indisponivel.';end if;
  if not exists(select 1 from public.vitrine_disponibilidade d where d.user_id=v_owner and d.ativo
      and d.dia_semana=extract(dow from p_data)::int and d.faixa=p_faixa
      and (p_data+d.inicio)>now()+(v_cfg.antecedencia_horas||' hours')::interval)
    then raise exception 'Horario indisponivel.';end if;
  if exists(select 1 from public.vitrine_visitas v where v.user_id=v_owner and v.data_preferida=p_data
      and v.faixa=p_faixa and v.status in ('solicitada','confirmada','reagendada'))
    then raise exception 'Este horario acabou de ser ocupado. Escolha outro.';end if;
  insert into public.vitrine_leads(user_id,imovel_id,nome,telefone,mensagem,origem,status,consentimento_lgpd)
    values(v_owner,p_imovel_id,left(trim(p_nome),120),left(trim(p_telefone),40),
      left('[Visita '||p_data||' · '||p_faixa||'] '||trim(coalesce(p_mensagem,'')),2000),'formulario','visita',true)
    returning id into v_lead;
  v_status=case when v_cfg.confirmacao_automatica then 'confirmada' else 'solicitada' end;
  insert into public.vitrine_visitas(
    user_id,imovel_id,lead_id,nome,telefone,data_preferida,faixa,mensagem,status,consentimento_lgpd,lembrete_em
  ) values(
    v_owner,p_imovel_id,v_lead,left(trim(p_nome),120),left(trim(p_telefone),40),p_data,p_faixa,
    left(trim(coalesce(p_mensagem,'')),2000),v_status,true,(p_data::timestamp-interval '24 hours')
  ) returning id,token_gestao into v_visita,v_token;
  return jsonb_build_object('ok',true,'id',v_visita,'token',v_token,'status',v_status);
exception when unique_violation then
  raise exception 'Este horario acabou de ser ocupado. Escolha outro.';
end $$;

create or replace function public.vitrine_cancelar_visita(p_token uuid) returns boolean
language sql security definer set search_path=public
as $$
  update public.vitrine_visitas set status='cancelada',cancelada_em=now(),updated_at=now()
  where token_gestao=p_token and status in ('solicitada','confirmada','reagendada') returning true
$$;

create or replace function public.vitrine_reagendar_visita(p_token uuid,p_data date,p_faixa text) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v public.vitrine_visitas%rowtype;v_cfg public.vitrine_agenda_config%rowtype;
begin
  select * into v from public.vitrine_visitas where token_gestao=p_token
    and status in ('solicitada','confirmada','reagendada');
  if not found then raise exception 'Solicitacao nao encontrada.';end if;
  select * into v_cfg from public.vitrine_agenda_config where user_id=v.user_id;
  if p_faixa not in ('manha','tarde','noite') or p_data<current_date or p_data>current_date+v_cfg.horizonte_dias
     or not exists(select 1 from public.vitrine_disponibilidade d where d.user_id=v.user_id and d.ativo
       and d.dia_semana=extract(dow from p_data)::int and d.faixa=p_faixa
       and (p_data+d.inicio)>now()+(v_cfg.antecedencia_horas||' hours')::interval)
    then raise exception 'Data ou faixa indisponivel.';end if;
  update public.vitrine_visitas set data_preferida=p_data,faixa=p_faixa,status='reagendada',
    lembrete_em=(p_data::timestamp-interval '24 hours'),updated_at=now() where id=v.id;
  return jsonb_build_object('ok',true,'status','reagendada');
exception when unique_violation then
  raise exception 'Este horario acabou de ser ocupado. Escolha outro.';
end $$;

create or replace function public.listar_vitrine_publica_v3(p_slug text) returns jsonb
language sql stable security definer set search_path=public
as $$
  with base as (select public.listar_vitrine_publica_v2(p_slug) dados),
  dono as (select user_id from public.proprietarios where slug_publico=p_slug limit 1),
  itens as (
    select coalesce(jsonb_agg(elem||jsonb_build_object('updatedAt',i.updated_at) order by ord),'[]'::jsonb) dados
    from base cross join lateral jsonb_array_elements(coalesce(base.dados->'imoveis','[]'::jsonb)) with ordinality x(elem,ord)
    join public.vitrine_imoveis i on i.id=(elem->>'id')::uuid
  ),
  agenda as (
    select jsonb_build_object(
      'ativa',exists(select 1 from public.vitrine_disponibilidade d join dono on dono.user_id=d.user_id where d.ativo),
      'confirmacaoAutomatica',coalesce((select c.confirmacao_automatica from public.vitrine_agenda_config c join dono on dono.user_id=c.user_id),false),
      'antecedenciaHoras',coalesce((select c.antecedencia_horas from public.vitrine_agenda_config c join dono on dono.user_id=c.user_id),24),
      'horizonteDias',coalesce((select c.horizonte_dias from public.vitrine_agenda_config c join dono on dono.user_id=c.user_id),30),
      'horarios',coalesce((select jsonb_agg(jsonb_build_object('diaSemana',d.dia_semana,'faixa',d.faixa,
        'inicio',to_char(d.inicio,'HH24:MI'),'fim',to_char(d.fim,'HH24:MI')) order by d.dia_semana,d.inicio)
        from public.vitrine_disponibilidade d join dono on dono.user_id=d.user_id where d.ativo),'[]'::jsonb)
    ) dados
  )
  select jsonb_set(jsonb_set(base.dados,'{imoveis}',itens.dados,true),'{agenda}',agenda.dados,true)
  from base,itens,agenda
$$;

revoke all on function public.vitrine_salvar_busca(text,text,text,uuid,jsonb,text,text,text,text,boolean) from public;
revoke all on function public.salvar_agenda_vitrine(jsonb,jsonb) from public;
revoke all on function public.vitrine_cancelar_busca(uuid) from public;
revoke all on function public.vitrine_salvar_alerta_preco(uuid,text,text,text,boolean) from public;
revoke all on function public.vitrine_cancelar_alerta_preco(uuid) from public;
revoke all on function public.vitrine_solicitar_visita(uuid,text,text,date,text,text,boolean) from public;
revoke all on function public.vitrine_cancelar_visita(uuid) from public;
revoke all on function public.vitrine_reagendar_visita(uuid,date,text) from public;
revoke all on function public.listar_vitrine_publica_v3(text) from public;

grant execute on function public.vitrine_salvar_busca(text,text,text,uuid,jsonb,text,text,text,text,boolean) to anon,authenticated;
grant execute on function public.salvar_agenda_vitrine(jsonb,jsonb) to authenticated;
grant execute on function public.vitrine_cancelar_busca(uuid) to anon,authenticated;
grant execute on function public.vitrine_salvar_alerta_preco(uuid,text,text,text,boolean) to anon,authenticated;
grant execute on function public.vitrine_cancelar_alerta_preco(uuid) to anon,authenticated;
grant execute on function public.vitrine_solicitar_visita(uuid,text,text,date,text,text,boolean) to anon,authenticated;
grant execute on function public.vitrine_cancelar_visita(uuid) to anon,authenticated;
grant execute on function public.vitrine_reagendar_visita(uuid,date,text) to anon,authenticated;
grant execute on function public.listar_vitrine_publica_v3(text) to anon,authenticated;

do $$
begin
  if to_regprocedure('public.registrar_migracao(text,text)') is not null then
    perform public.registrar_migracao(
      'migracao-vitrine-retencao-agenda.sql',
      'Etapas 5 e 6: retencao autorizada, alerta de preco e agenda de visitas'
    );
  end if;
end $$;

commit;
