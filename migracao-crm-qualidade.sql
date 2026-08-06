-- migracao-crm-qualidade.sql
-- Etapas 7 e 8: CRM operacional e observabilidade tecnica da Vitrine.
-- Reexecutavel. Nao remove interessados, leads, visitas ou anuncios existentes.

begin;

do $$
begin
  if to_regprocedure('public.usuario_proprietario_id(uuid)') is null
     or to_regclass('public.interessados') is null
     or to_regclass('public.vitrine_leads') is null then
    raise exception 'Preflight falhou: aplique primeiro a base comercial e a Vitrine.';
  end if;
end $$;

alter table public.interessados add column if not exists email text not null default '';
alter table public.interessados add column if not exists origem text not null default 'manual';
alter table public.interessados add column if not exists campanha text not null default '';
alter table public.interessados add column if not exists finalidade text not null default 'alugar';
alter table public.interessados add column if not exists responsavel_id uuid;
alter table public.interessados add column if not exists primeira_resposta_em timestamptz;
alter table public.interessados add column if not exists proxima_acao text not null default '';
alter table public.interessados add column if not exists proxima_acao_em timestamptz;
alter table public.interessados add column if not exists motivo_perda text not null default '';
alter table public.interessados add column if not exists lead_id uuid references public.vitrine_leads(id) on delete set null;
alter table public.vitrine_leads add column if not exists campanha text not null default '';
alter table public.vitrine_leads add column if not exists utm_source text not null default '';

alter table public.interessados drop constraint if exists interessados_status_check;
alter table public.interessados add constraint interessados_status_check check(status in (
  'novo','qualificacao','contatado','visita_agendada','visita_realizada','proposta','fechado','perdido',
  'conversando','visita','quente','desistiu'
));
alter table public.interessados drop constraint if exists interessados_finalidade_check;
alter table public.interessados add constraint interessados_finalidade_check
  check(finalidade in ('alugar','vender'));

create index if not exists interessados_crm_funil_idx
  on public.interessados(user_id,status,proxima_acao_em);
create index if not exists interessados_crm_responsavel_idx
  on public.interessados(user_id,responsavel_id,status);
create index if not exists interessados_crm_telefone_idx
  on public.interessados(user_id,(regexp_replace(telefone,'\D','','g')));
create index if not exists interessados_crm_email_idx
  on public.interessados(user_id,(lower(email)));

create table if not exists public.crm_eventos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.proprietarios(user_id) on delete cascade,
  interessado_id uuid not null references public.interessados(id) on delete cascade,
  ator_id uuid,
  ator_papel text not null default '',
  tipo text not null,
  titulo text not null,
  detalhes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists crm_eventos_interessado_idx
  on public.crm_eventos(user_id,interessado_id,created_at desc);

create table if not exists public.crm_tarefas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.proprietarios(user_id) on delete cascade,
  interessado_id uuid not null references public.interessados(id) on delete cascade,
  responsavel_id uuid,
  tipo text not null default 'retorno' check(tipo in ('retorno','ligacao','whatsapp','email','visita','proposta','outro')),
  titulo text not null,
  prazo timestamptz not null,
  status text not null default 'pendente' check(status in ('pendente','concluida','cancelada')),
  concluida_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_tarefas_pendentes_idx
  on public.crm_tarefas(user_id,status,prazo);

create table if not exists public.crm_propostas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.proprietarios(user_id) on delete cascade,
  interessado_id uuid not null references public.interessados(id) on delete cascade,
  vitrine_imovel_id uuid references public.vitrine_imoveis(id) on delete set null,
  imovel_id uuid references public.imoveis(id) on delete set null,
  finalidade text not null default 'alugar' check(finalidade in ('alugar','vender')),
  valor numeric(14,2) not null check(valor>0),
  validade date,
  condicoes text not null default '',
  status text not null default 'rascunho' check(status in ('rascunho','enviada','negociacao','aceita','recusada','cancelada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_proposta_imovel_check check(vitrine_imovel_id is not null or imovel_id is not null)
);
create index if not exists crm_propostas_funil_idx
  on public.crm_propostas(user_id,status,created_at desc);

create table if not exists public.crm_interessado_imoveis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.proprietarios(user_id) on delete cascade,
  interessado_id uuid not null references public.interessados(id) on delete cascade,
  vitrine_imovel_id uuid references public.vitrine_imoveis(id) on delete cascade,
  imovel_id uuid references public.imoveis(id) on delete cascade,
  origem text not null default 'manual',
  created_at timestamptz not null default now(),
  constraint crm_interesse_imovel_check check(vitrine_imovel_id is not null or imovel_id is not null)
);
create unique index if not exists crm_interesse_vitrine_unico_idx
  on public.crm_interessado_imoveis(interessado_id,vitrine_imovel_id) where vitrine_imovel_id is not null;
create unique index if not exists crm_interesse_gestao_unico_idx
  on public.crm_interessado_imoveis(interessado_id,imovel_id) where imovel_id is not null;

create table if not exists public.vitrine_observabilidade (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.proprietarios(user_id) on delete cascade,
  tipo text not null check(tipo in ('carga_publica','erro_carga','lead_enviado','erro_lead','erro_imagem','mapa_aberto')),
  duracao_ms integer not null default 0 check(duracao_ms between 0 and 120000),
  contexto jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists vitrine_observabilidade_periodo_idx
  on public.vitrine_observabilidade(user_id,created_at desc,tipo);

create or replace function public.crm_pode_operar(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public
as $$
  select p_user_id is not null and (
    p_user_id=public.usuario_proprietario_id(p_user_id)
    or exists(select 1 from public.acessos_colaborador a
      where a.user_id=p_user_id and a.proprietario_id=public.usuario_proprietario_id(p_user_id)
        and a.ativo and coalesce(a.papel,'leitura') in ('administrador','operacional'))
    or public.e_administrador_plataforma(p_user_id)
  )
$$;

revoke all on function public.crm_pode_operar(uuid) from public,anon;
grant execute on function public.crm_pode_operar(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['crm_eventos','crm_tarefas','crm_propostas','crm_interessado_imoveis','vitrine_observabilidade'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('drop policy if exists crm_leitura_conta on public.%I',t);
    execute format('drop policy if exists crm_escrita_conta on public.%I',t);
    execute format(
      'create policy crm_leitura_conta on public.%I for select to authenticated using (user_id=public.usuario_proprietario_id(auth.uid()))',t);
    execute format(
      'create policy crm_escrita_conta on public.%I for all to authenticated using (user_id=public.usuario_proprietario_id(auth.uid()) and public.crm_pode_operar(auth.uid())) with check (user_id=public.usuario_proprietario_id(auth.uid()) and public.crm_pode_operar(auth.uid()))',t);
    execute format('revoke all on public.%I from anon',t);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  end loop;
end $$;

alter table public.interessados enable row level security;
alter table public.interessados force row level security;
drop policy if exists own_rows on public.interessados;
drop policy if exists owner_active_rows on public.interessados;
drop policy if exists crm_interessados_leitura on public.interessados;
drop policy if exists crm_interessados_escrita on public.interessados;
create policy crm_interessados_leitura on public.interessados for select to authenticated
  using(user_id=public.usuario_proprietario_id(auth.uid()));
create policy crm_interessados_escrita on public.interessados for all to authenticated
  using(user_id=public.usuario_proprietario_id(auth.uid()) and public.crm_pode_operar(auth.uid()))
  with check(user_id=public.usuario_proprietario_id(auth.uid()) and public.crm_pode_operar(auth.uid()));

create or replace function public.crm_responsavel_valido(p_owner uuid,p_responsavel uuid)
returns boolean language sql stable security definer set search_path=public
as $$
  select p_responsavel is null or p_responsavel=p_owner or exists(
    select 1 from public.acessos_colaborador a
    where a.user_id=p_responsavel and a.proprietario_id=p_owner and a.ativo
  )
$$;
revoke all on function public.crm_responsavel_valido(uuid,uuid) from public,anon;
grant execute on function public.crm_responsavel_valido(uuid,uuid) to authenticated;

create or replace function public.crm_registrar_evento(
  p_interessado uuid,p_tipo text,p_titulo text,p_detalhes jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path=public
as $$
declare v_owner uuid:=public.usuario_proprietario_id(auth.uid());v_id uuid;v_papel text;
begin
  if v_owner is null or not public.crm_pode_operar(auth.uid()) then raise exception 'Sem permissao para operar o CRM.';end if;
  if not exists(select 1 from public.interessados i where i.id=p_interessado and i.user_id=v_owner) then raise exception 'Interessado nao encontrado.';end if;
  select coalesce(a.papel,case when auth.uid()=v_owner then 'administrador' else '' end) into v_papel
    from (select 1) x left join public.acessos_colaborador a on a.user_id=auth.uid() and a.proprietario_id=v_owner;
  insert into public.crm_eventos(user_id,interessado_id,ator_id,ator_papel,tipo,titulo,detalhes)
  values(v_owner,p_interessado,auth.uid(),coalesce(v_papel,''),left(coalesce(p_tipo,'registro'),40),left(coalesce(p_titulo,'Registro'),240),
    jsonb_build_object('etapaAnterior',left(coalesce(p_detalhes->>'etapaAnterior',''),40),'etapaNova',left(coalesce(p_detalhes->>'etapaNova',''),40),
      'responsavelAnterior',left(coalesce(p_detalhes->>'responsavelAnterior',''),80),'responsavelNovo',left(coalesce(p_detalhes->>'responsavelNovo',''),80),
      'observacao',left(coalesce(p_detalhes->>'observacao',''),500))) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.crm_registrar_evento(uuid,text,text,jsonb) from public,anon;
grant execute on function public.crm_registrar_evento(uuid,text,text,jsonb) to authenticated;

create or replace function public.crm_auditar_interessado()
returns trigger language plpgsql security definer set search_path=public
as $$
declare v_papel text;
begin
  select coalesce(a.papel,case when auth.uid()=new.user_id then 'administrador' else '' end) into v_papel
    from (select 1) x left join public.acessos_colaborador a on a.user_id=auth.uid() and a.proprietario_id=new.user_id;
  if tg_op='INSERT' then
    insert into public.crm_eventos(user_id,interessado_id,ator_id,ator_papel,tipo,titulo,detalhes)
    values(new.user_id,new.id,auth.uid(),coalesce(v_papel,''),'criado','Interessado entrou no CRM',jsonb_build_object('etapaNova',new.status));
  else
    if new.status is distinct from old.status then
      insert into public.crm_eventos(user_id,interessado_id,ator_id,ator_papel,tipo,titulo,detalhes)
      values(new.user_id,new.id,auth.uid(),coalesce(v_papel,''),'etapa','Etapa alterada',jsonb_build_object('etapaAnterior',old.status,'etapaNova',new.status));
    end if;
    if new.responsavel_id is distinct from old.responsavel_id then
      insert into public.crm_eventos(user_id,interessado_id,ator_id,ator_papel,tipo,titulo,detalhes)
      values(new.user_id,new.id,auth.uid(),coalesce(v_papel,''),'responsavel','Responsavel alterado',jsonb_build_object('responsavelAnterior',old.responsavel_id,'responsavelNovo',new.responsavel_id));
    end if;
    if new.proxima_acao is distinct from old.proxima_acao or new.proxima_acao_em is distinct from old.proxima_acao_em then
      insert into public.crm_eventos(user_id,interessado_id,ator_id,ator_papel,tipo,titulo,detalhes)
      values(new.user_id,new.id,auth.uid(),coalesce(v_papel,''),'proxima_acao','Proxima acao atualizada',jsonb_build_object('observacao',new.proxima_acao));
    end if;
    if new.primeira_resposta_em is distinct from old.primeira_resposta_em and new.primeira_resposta_em is not null then
      insert into public.crm_eventos(user_id,interessado_id,ator_id,ator_papel,tipo,titulo,detalhes)
      values(new.user_id,new.id,auth.uid(),coalesce(v_papel,''),'primeira_resposta','Primeira resposta registrada',jsonb_build_object());
    end if;
    if new.motivo_perda is distinct from old.motivo_perda and nullif(trim(coalesce(new.motivo_perda,'')),'') is not null then
      insert into public.crm_eventos(user_id,interessado_id,ator_id,ator_papel,tipo,titulo,detalhes)
      values(new.user_id,new.id,auth.uid(),coalesce(v_papel,''),'perda','Motivo de perda registrado',jsonb_build_object('observacao',new.motivo_perda));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists crm_interessado_historico on public.interessados;
create trigger crm_interessado_historico after insert or update on public.interessados
for each row execute function public.crm_auditar_interessado();

create or replace function public.crm_salvar_interessado(p_id uuid,p_dados jsonb,p_lead_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  v_owner uuid:=public.usuario_proprietario_id(auth.uid());v_id uuid:=p_id;v_existente uuid;
  v_nome text:=trim(coalesce(p_dados->>'nome',''));v_tel text:=trim(coalesce(p_dados->>'telefone',''));
  v_email text:=lower(trim(coalesce(p_dados->>'email','')));v_resp uuid;v_status text:=coalesce(nullif(p_dados->>'status',''),'novo');
  v_row public.interessados%rowtype;v_dedup boolean:=false;
begin
  if v_owner is null or not public.crm_pode_operar(auth.uid()) then raise exception 'Sem permissao para operar o CRM.';end if;
  if length(v_nome)<2 then raise exception 'Informe o nome do interessado.';end if;
  if v_email<>'' and v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Informe um e-mail valido.';end if;
  if v_status not in ('novo','qualificacao','contatado','visita_agendada','visita_realizada','proposta','fechado','perdido') then raise exception 'Etapa do funil invalida.';end if;
  begin v_resp=nullif(p_dados->>'responsavelId','')::uuid;exception when others then raise exception 'Responsavel invalido.';end;
  if not public.crm_responsavel_valido(v_owner,v_resp) then raise exception 'Responsavel nao pertence a esta conta.';end if;
  if v_id is null then
    select i.id into v_existente from public.interessados i where i.user_id=v_owner and (
      (regexp_replace(v_tel,'\D','','g')<>'' and regexp_replace(i.telefone,'\D','','g')=regexp_replace(v_tel,'\D','','g'))
      or (v_email<>'' and lower(i.email)=v_email)) order by i.created_at limit 1;
    if v_existente is not null then v_id:=v_existente;v_dedup:=true;end if;
  elsif not exists(select 1 from public.interessados i where i.id=v_id and i.user_id=v_owner) then raise exception 'Interessado nao encontrado.';end if;
  if v_status in ('qualificacao','contatado','visita_agendada','visita_realizada','proposta') then
    if v_resp is null then raise exception 'Defina um responsavel antes de avancar o interessado.';end if;
    if (nullif(trim(coalesce(p_dados->>'proximaAcao','')),'') is null
        or nullif(p_dados->>'proximaAcaoEm','') is null)
       and not exists(
         select 1 from public.crm_tarefas t
         where t.user_id=v_owner and t.interessado_id=v_id and t.status='pendente'
       ) then
      raise exception 'Defina a proxima acao e o prazo antes de avancar o interessado.';
    end if;
  end if;
  if v_status='perdido' and nullif(trim(coalesce(p_dados->>'motivoPerda','')),'') is null then
    raise exception 'Informe o motivo da perda antes de concluir.';
  end if;
  if v_id is null then
    insert into public.interessados(user_id,nome,telefone,email,valor_maximo,quartos_min,banheiros_min,
      precisa_garagem,precisa_quintal,precisa_cozinha,precisa_sala,precisa_area_servico,observacoes,status,
      origem,campanha,finalidade,responsavel_id,primeira_resposta_em,proxima_acao,proxima_acao_em,motivo_perda,lead_id,updated_at)
    values(v_owner,v_nome,v_tel,v_email,greatest(0,coalesce((p_dados->>'valorMaximo')::numeric,0)),greatest(0,coalesce((p_dados->>'quartosMin')::int,0)),
      greatest(0,coalesce((p_dados->>'banheirosMin')::int,0)),coalesce((p_dados->>'precisaGaragem')::boolean,false),
      coalesce((p_dados->>'precisaQuintal')::boolean,false),coalesce((p_dados->>'precisaCozinha')::boolean,false),
      coalesce((p_dados->>'precisaSala')::boolean,false),coalesce((p_dados->>'precisaAreaServico')::boolean,false),
      left(coalesce(p_dados->>'observacoes',''),4000),v_status,left(coalesce(nullif(p_dados->>'origem',''),'manual'),80),
      left(coalesce(p_dados->>'campanha',''),120),coalesce(nullif(p_dados->>'finalidade',''),'alugar'),v_resp,
      nullif(p_dados->>'primeiraRespostaEm','')::timestamptz,left(coalesce(p_dados->>'proximaAcao',''),300),
      nullif(p_dados->>'proximaAcaoEm','')::timestamptz,left(coalesce(p_dados->>'motivoPerda',''),500),p_lead_id,now())
    returning * into v_row;
  else
    update public.interessados set nome=v_nome,telefone=v_tel,email=v_email,
      valor_maximo=greatest(0,coalesce((p_dados->>'valorMaximo')::numeric,valor_maximo)),
      quartos_min=greatest(0,coalesce((p_dados->>'quartosMin')::int,quartos_min)),banheiros_min=greatest(0,coalesce((p_dados->>'banheirosMin')::int,banheiros_min)),
      precisa_garagem=coalesce((p_dados->>'precisaGaragem')::boolean,precisa_garagem),precisa_quintal=coalesce((p_dados->>'precisaQuintal')::boolean,precisa_quintal),
      precisa_cozinha=coalesce((p_dados->>'precisaCozinha')::boolean,precisa_cozinha),precisa_sala=coalesce((p_dados->>'precisaSala')::boolean,precisa_sala),
      precisa_area_servico=coalesce((p_dados->>'precisaAreaServico')::boolean,precisa_area_servico),observacoes=left(coalesce(p_dados->>'observacoes',observacoes),4000),
      status=v_status,origem=left(coalesce(nullif(p_dados->>'origem',''),origem),80),campanha=left(coalesce(p_dados->>'campanha',campanha),120),
      finalidade=coalesce(nullif(p_dados->>'finalidade',''),finalidade),responsavel_id=v_resp,
      primeira_resposta_em=coalesce(nullif(p_dados->>'primeiraRespostaEm','')::timestamptz,primeira_resposta_em),
      proxima_acao=left(coalesce(p_dados->>'proximaAcao',proxima_acao),300),proxima_acao_em=nullif(p_dados->>'proximaAcaoEm','')::timestamptz,
      motivo_perda=left(coalesce(p_dados->>'motivoPerda',motivo_perda),500),lead_id=coalesce(lead_id,p_lead_id),updated_at=now()
    where id=v_id and user_id=v_owner returning * into v_row;
  end if;
  if p_lead_id is not null then
    update public.vitrine_leads set interessado_id=v_row.id,status=case when status='novo' then 'contatado' else status end
      where id=p_lead_id and user_id=v_owner;
  end if;
  return to_jsonb(v_row)||jsonb_build_object('deduplicado',v_dedup);
end $$;
revoke all on function public.crm_salvar_interessado(uuid,jsonb,uuid) from public,anon;
grant execute on function public.crm_salvar_interessado(uuid,jsonb,uuid) to authenticated;

create or replace function public.vitrine_registrar_observabilidade(
  p_slug text,p_tipo text,p_duracao_ms integer default 0,p_contexto jsonb default '{}'::jsonb
) returns boolean language plpgsql security definer set search_path=public
as $$
declare v_owner uuid;
begin
  select user_id into v_owner from public.proprietarios where slug_publico=p_slug limit 1;
  if v_owner is null or p_tipo not in ('carga_publica','erro_carga','lead_enviado','erro_lead','erro_imagem','mapa_aberto') then return false;end if;
  if (select count(*) from public.vitrine_observabilidade where user_id=v_owner and created_at>now()-interval '1 day')>=2000 then return false;end if;
  insert into public.vitrine_observabilidade(user_id,tipo,duracao_ms,contexto)
  values(v_owner,p_tipo,least(120000,greatest(0,coalesce(p_duracao_ms,0))),jsonb_build_object(
    'rota',left(coalesce(p_contexto->>'rota',''),120),'recurso',left(coalesce(p_contexto->>'recurso',''),80),
    'codigoErro',left(coalesce(p_contexto->>'codigoErro',''),80),'quantidade',least(10000,greatest(0,coalesce((p_contexto->>'quantidade')::int,0)))));
  delete from public.vitrine_observabilidade where user_id=v_owner and created_at<now()-interval '90 days';
  return true;
exception when others then return false;
end $$;
revoke all on function public.vitrine_registrar_observabilidade(text,text,integer,jsonb) from public;
grant execute on function public.vitrine_registrar_observabilidade(text,text,integer,jsonb) to anon,authenticated;

create or replace function public.vitrine_registrar_lead_v2(
  p_imovel_id uuid,p_nome text,p_telefone text,p_mensagem text default '',
  p_consentimento boolean default false,p_campanha text default '',p_utm_source text default ''
) returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_result jsonb;v_tel text:=regexp_replace(coalesce(p_telefone,''),'\D','','g');
begin
  v_result:=public.vitrine_registrar_lead(p_imovel_id,p_nome,p_telefone,p_mensagem,p_consentimento);
  update public.vitrine_leads set campanha=left(trim(coalesce(p_campanha,'')),120),utm_source=left(trim(coalesce(p_utm_source,'')),80)
  where id=(select l.id from public.vitrine_leads l where l.imovel_id=p_imovel_id
    and regexp_replace(coalesce(l.telefone,''),'\D','','g')=v_tel order by l.created_at desc limit 1);
  return v_result;
end $$;
revoke all on function public.vitrine_registrar_lead_v2(uuid,text,text,text,boolean,text,text) from public;
grant execute on function public.vitrine_registrar_lead_v2(uuid,text,text,text,boolean,text,text) to anon,authenticated;

do $$
begin
  if to_regprocedure('public.registrar_migracao(text,text)') is not null then
    perform public.registrar_migracao('migracao-crm-qualidade.sql','Etapas 7 e 8: CRM operacional, propostas, tarefas e observabilidade tecnica');
  end if;
end $$;

commit;
