-- ============================================================
-- VERSAO COMERCIAL
-- Administrador da plataforma, contas de clientes e planos.
--
-- Esta migracao preserva o isolamento existente: cada gestor continua
-- vendo somente as linhas cujo user_id e o seu auth.uid(). A plataforma
-- consulta dados comerciais apenas por funcoes SECURITY DEFINER restritas.
-- ============================================================

create extension if not exists "pgcrypto";

alter table public.proprietarios add column if not exists email text;
alter table public.proprietarios add column if not exists updated_at timestamptz not null default now();

update public.proprietarios p
set email=lower(u.email), updated_at=now()
from auth.users u
where u.id=p.user_id and (p.email is null or p.email='');

create table if not exists public.administradores_plataforma (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- Mantem a conta original como administradora da plataforma.
insert into public.administradores_plataforma(user_id)
select id from auth.users where lower(email)=lower('andertonaluguel@gmail.com')
on conflict (user_id) do nothing;

create table if not exists public.assinaturas (
  user_id                uuid primary key references public.proprietarios(user_id) on delete cascade,
  plano                  text not null check (plano in ('mensal','vitalicio')),
  status                 text not null default 'ativa'
                         check (status in ('aguardando','ativa','atrasada','suspensa','cancelada')),
  periodo_atual_fim      date,
  ativada_em             timestamptz,
  pagamento_vitalicio_em timestamptz,
  criado_por             uuid references auth.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (plano <> 'vitalicio' or periodo_atual_fim is null)
);

-- Contas que ja administravam casas continuam com acesso, sem surpresa.
insert into public.assinaturas(user_id,plano,status,ativada_em,pagamento_vitalicio_em)
select user_id,'vitalicio','ativa',now(),now() from public.proprietarios
on conflict (user_id) do nothing;

create table if not exists public.convites_proprietario (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null,
  email              text not null,
  plano              text not null check (plano in ('mensal','vitalicio')),
  periodo_atual_fim  date,
  status             text not null default 'pendente'
                     check (status in ('pendente','aceito','cancelado','expirado')),
  expira_em          timestamptz not null default (now()+interval '7 days'),
  aceito_por         uuid references auth.users(id) on delete set null,
  aceito_em          timestamptz,
  criado_por         uuid not null references auth.users(id) on delete cascade,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (plano <> 'vitalicio' or periodo_atual_fim is null)
);

create index if not exists idx_convites_proprietario_email
  on public.convites_proprietario(lower(email));
create index if not exists idx_assinaturas_status on public.assinaturas(status);

alter table public.administradores_plataforma enable row level security;
alter table public.assinaturas enable row level security;
alter table public.convites_proprietario enable row level security;

create or replace function public.e_administrador_plataforma(p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists(select 1 from public.administradores_plataforma a where a.user_id=p_user_id)
$$;

revoke all on function public.e_administrador_plataforma(uuid) from public, anon;
grant execute on function public.e_administrador_plataforma(uuid) to authenticated;

drop policy if exists platform_admin_own_profile on public.administradores_plataforma;
create policy platform_admin_own_profile on public.administradores_plataforma
  for select to authenticated using (user_id=auth.uid());

drop policy if exists subscription_owner_read on public.assinaturas;
create policy subscription_owner_read on public.assinaturas
  for select to authenticated using (user_id=auth.uid());

drop policy if exists platform_subscription_all on public.assinaturas;
create policy platform_subscription_all on public.assinaturas
  for all to authenticated
  using (public.e_administrador_plataforma())
  with check (public.e_administrador_plataforma());

drop policy if exists platform_owner_invites on public.convites_proprietario;
create policy platform_owner_invites on public.convites_proprietario
  for all to authenticated
  using (public.e_administrador_plataforma())
  with check (public.e_administrador_plataforma());

grant select on public.administradores_plataforma to authenticated;
grant select,insert,update,delete on public.assinaturas to authenticated;
grant select,insert,update,delete on public.convites_proprietario to authenticated;

-- Retorna somente o acesso comercial da propria sessao.
create or replace function public.acesso_comercial_atual()
returns jsonb
language sql stable security definer set search_path=public
as $$
  select jsonb_build_object(
    'administradorPlataforma', public.e_administrador_plataforma(auth.uid()),
    'proprietario', p.user_id is not null,
    'plano', coalesce(a.plano,'mensal'),
    'status', coalesce(a.status,'aguardando'),
    'periodoAtualFim', a.periodo_atual_fim,
    'podeAcessar',
      public.e_administrador_plataforma(auth.uid())
      or (
        p.user_id is not null
        and a.status='ativa'
        and (a.plano='vitalicio' or a.periodo_atual_fim>=current_date)
      )
  )
  from (select auth.uid() as uid) s
  left join public.proprietarios p on p.user_id=s.uid
  left join public.assinaturas a on a.user_id=s.uid
$$;

revoke all on function public.acesso_comercial_atual() from public, anon;
grant execute on function public.acesso_comercial_atual() to authenticated;

-- Cria o convite. Se o e-mail ja tiver conta, o acesso e ativado na hora.
create or replace function public.criar_convite_proprietario(
  p_nome text,
  p_email text,
  p_plano text,
  p_periodo_atual_fim date default null
)
returns uuid
language plpgsql security definer set search_path=public,auth
as $$
declare
  v_admin uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email,'')));
  v_nome text := trim(coalesce(p_nome,''));
  v_id uuid;
  v_auth_user uuid;
begin
  if not public.e_administrador_plataforma(v_admin) then
    raise exception 'Apenas o administrador da plataforma pode criar clientes.';
  end if;
  if v_nome='' then raise exception 'Informe o nome do cliente.'; end if;
  if v_email='' or position('@' in v_email)<2 then raise exception 'E-mail invalido.'; end if;
  if p_plano not in ('mensal','vitalicio') then raise exception 'Plano invalido.'; end if;
  if p_plano='mensal' and (p_periodo_atual_fim is null or p_periodo_atual_fim<current_date) then
    raise exception 'Informe uma validade mensal igual ou posterior a hoje.';
  end if;

  select id into v_id from public.convites_proprietario
  where lower(email)=v_email and status='pendente'
  order by created_at desc limit 1;

  if v_id is null then
    insert into public.convites_proprietario
      (nome,email,plano,periodo_atual_fim,criado_por)
    values
      (left(v_nome,160),v_email,p_plano,
       case when p_plano='vitalicio' then null else p_periodo_atual_fim end,v_admin)
    returning id into v_id;
  else
    update public.convites_proprietario set
      nome=left(v_nome,160), plano=p_plano,
      periodo_atual_fim=case when p_plano='vitalicio' then null else p_periodo_atual_fim end,
      expira_em=now()+interval '7 days', updated_at=now()
    where id=v_id;
  end if;

  select id into v_auth_user from auth.users
  where lower(email)=v_email order by created_at limit 1;

  if v_auth_user is not null then
    insert into public.proprietarios(user_id,nome,email,updated_at)
    values(v_auth_user,left(v_nome,160),v_email,now())
    on conflict(user_id) do update set
      nome=excluded.nome,email=excluded.email,updated_at=now();

    insert into public.assinaturas
      (user_id,plano,status,periodo_atual_fim,ativada_em,pagamento_vitalicio_em,criado_por,updated_at)
    values
      (v_auth_user,p_plano,'ativa',
       case when p_plano='vitalicio' then null else p_periodo_atual_fim end,
       now(),case when p_plano='vitalicio' then now() else null end,v_admin,now())
    on conflict(user_id) do update set
      plano=excluded.plano,status='ativa',periodo_atual_fim=excluded.periodo_atual_fim,
      ativada_em=coalesce(public.assinaturas.ativada_em,now()),
      pagamento_vitalicio_em=excluded.pagamento_vitalicio_em,
      criado_por=v_admin,updated_at=now();

    update public.convites_proprietario set
      status='aceito',aceito_por=v_auth_user,aceito_em=now(),updated_at=now()
    where id=v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.criar_convite_proprietario(text,text,text,date) from public, anon;
grant execute on function public.criar_convite_proprietario(text,text,text,date) to authenticated;

create or replace function public.atualizar_assinatura(
  p_user_id uuid,
  p_plano text,
  p_status text,
  p_periodo_atual_fim date default null
)
returns void
language plpgsql security definer set search_path=public
as $$
begin
  if not public.e_administrador_plataforma(auth.uid()) then
    raise exception 'Apenas o administrador da plataforma pode alterar planos.';
  end if;
  if p_plano not in ('mensal','vitalicio') then raise exception 'Plano invalido.'; end if;
  if p_status not in ('aguardando','ativa','atrasada','suspensa','cancelada') then
    raise exception 'Status invalido.';
  end if;
  if p_plano='mensal' and p_status='ativa'
     and (p_periodo_atual_fim is null or p_periodo_atual_fim<current_date) then
    raise exception 'Uma mensalidade ativa precisa de uma validade atual.';
  end if;

  update public.assinaturas set
    plano=p_plano,
    status=p_status,
    periodo_atual_fim=case when p_plano='vitalicio' then null else p_periodo_atual_fim end,
    ativada_em=case when p_status='ativa' then coalesce(ativada_em,now()) else ativada_em end,
    pagamento_vitalicio_em=case
      when p_plano='vitalicio' and p_status='ativa' then coalesce(pagamento_vitalicio_em,now())
      else null end,
    updated_at=now()
  where user_id=p_user_id;

  if not found then raise exception 'Cliente nao encontrado.'; end if;
end;
$$;

revoke all on function public.atualizar_assinatura(uuid,text,text,date) from public, anon;
grant execute on function public.atualizar_assinatura(uuid,text,text,date) to authenticated;

create or replace function public.cancelar_convite_proprietario(p_convite_id uuid)
returns void
language plpgsql security definer set search_path=public
as $$
begin
  if not public.e_administrador_plataforma(auth.uid()) then
    raise exception 'Apenas o administrador da plataforma pode cancelar convites.';
  end if;
  update public.convites_proprietario
  set status='cancelado',updated_at=now()
  where id=p_convite_id and status='pendente';
end;
$$;

revoke all on function public.cancelar_convite_proprietario(uuid) from public, anon;
grant execute on function public.cancelar_convite_proprietario(uuid) to authenticated;

-- Painel comercial: os dados operacionais dos clientes nunca sao retornados.
create or replace function public.listar_clientes_comerciais()
returns table(
  user_id uuid,
  nome text,
  email text,
  plano text,
  status text,
  periodo_atual_fim date,
  quantidade_imoveis bigint,
  criado_em timestamptz
)
language plpgsql security definer set search_path=public
as $$
begin
  if not public.e_administrador_plataforma(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;
  return query
    select p.user_id,p.nome,p.email,a.plano,a.status,a.periodo_atual_fim,
      (select count(*) from public.imoveis i where i.user_id=p.user_id),p.created_at
    from public.proprietarios p
    join public.assinaturas a on a.user_id=p.user_id
    order by p.created_at desc;
end;
$$;

revoke all on function public.listar_clientes_comerciais() from public, anon;
grant execute on function public.listar_clientes_comerciais() to authenticated;

create or replace function public.listar_convites_proprietario()
returns table(
  id uuid,
  nome text,
  email text,
  plano text,
  periodo_atual_fim date,
  status text,
  expira_em timestamptz,
  aceito_em timestamptz,
  created_at timestamptz
)
language plpgsql security definer set search_path=public
as $$
begin
  if not public.e_administrador_plataforma(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;
  update public.convites_proprietario as c
    set status='expirado',updated_at=now()
    where c.status='pendente' and c.expira_em<now();
  return query
    select c.id,c.nome,c.email,c.plano,c.periodo_atual_fim,c.status,c.expira_em,c.aceito_em,c.created_at
    from public.convites_proprietario c order by c.created_at desc limit 200;
end;
$$;

revoke all on function public.listar_convites_proprietario() from public, anon;
grant execute on function public.listar_convites_proprietario() to authenticated;

-- Aceita automaticamente o convite quando a pessoa cria a conta.
create or replace function public.processar_novo_proprietario_comercial()
returns trigger
language plpgsql security definer set search_path=public,auth
as $$
declare v_convite public.convites_proprietario%rowtype;
begin
  select * into v_convite from public.convites_proprietario
  where lower(email)=lower(new.email) and status='pendente' and expira_em>=now()
  order by created_at desc limit 1;

  if found then
    insert into public.proprietarios(user_id,nome,email,updated_at)
    values(new.id,v_convite.nome,lower(new.email),now())
    on conflict(user_id) do update set
      nome=excluded.nome,email=excluded.email,updated_at=now();

    insert into public.assinaturas
      (user_id,plano,status,periodo_atual_fim,ativada_em,pagamento_vitalicio_em,criado_por)
    values(
      new.id,v_convite.plano,'ativa',
      case when v_convite.plano='vitalicio' then null else v_convite.periodo_atual_fim end,
      now(),case when v_convite.plano='vitalicio' then now() else null end,v_convite.criado_por
    )
    on conflict(user_id) do update set
      plano=excluded.plano,status='ativa',periodo_atual_fim=excluded.periodo_atual_fim,
      ativada_em=coalesce(public.assinaturas.ativada_em,now()),
      pagamento_vitalicio_em=excluded.pagamento_vitalicio_em,updated_at=now();

    update public.convites_proprietario set
      status='aceito',aceito_por=new.id,aceito_em=now(),updated_at=now()
    where id=v_convite.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_comercial on auth.users;
create trigger on_auth_user_created_comercial
after insert on auth.users for each row execute function public.processar_novo_proprietario_comercial();

-- Revalida o acesso de mensalidades vencidas sem apagar nenhum dado.
create or replace function public.marcar_assinaturas_atrasadas()
returns integer
language plpgsql security definer set search_path=public
as $$
declare v_total integer;
begin
  if not public.e_administrador_plataforma(auth.uid()) then raise exception 'Acesso negado.'; end if;
  update public.assinaturas set status='atrasada',updated_at=now()
  where plano='mensal' and status='ativa' and periodo_atual_fim<current_date;
  get diagnostics v_total=row_count;
  return v_total;
end;
$$;

revoke all on function public.marcar_assinaturas_atrasadas() from public, anon;
grant execute on function public.marcar_assinaturas_atrasadas() to authenticated;
