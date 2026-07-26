-- ============================================================
-- ALUGUEL COMERCIAL 1.0
-- Atualizacao unica para o banco de producao existente.
-- Requer schema.sql e as migracoes de portal/contratos/energia ja aplicadas.
-- Pode ser executada novamente: todas as operacoes sao idempotentes.
-- ============================================================

begin;

create extension if not exists "pgcrypto";

-- Descricao dos imoveis, temas e configuracao de primeiro acesso.
alter table public.imoveis add column if not exists cozinha boolean not null default false;
alter table public.imoveis add column if not exists sala boolean not null default false;
alter table public.imoveis add column if not exists area_servico boolean not null default false;
alter table public.imoveis add column if not exists publicado boolean not null default false;
alter table public.imoveis add column if not exists descricao_publica text not null default '';
alter table public.imoveis drop column if exists poco_agua;
alter table public.interessados add column if not exists precisa_cozinha boolean not null default false;
alter table public.interessados add column if not exists precisa_sala boolean not null default false;
alter table public.interessados add column if not exists precisa_area_servico boolean not null default false;
alter table public.interessados drop column if exists interessa_poco;
alter table public.configuracoes add column if not exists tema text not null default 'original';
alter table public.configuracoes add column if not exists onboarding_concluido boolean not null default false;
alter table public.configuracoes add column if not exists ultimo_backup_externo timestamptz;
alter table public.configuracoes add column if not exists pix_chave text not null default '';
alter table public.configuracoes add column if not exists pix_nome text not null default '';
alter table public.configuracoes add column if not exists pix_cidade text not null default '';
alter table public.configuracoes drop constraint if exists configuracoes_tema_check;
alter table public.configuracoes add constraint configuracoes_tema_check
  check (tema in ('original','aurora','oceano','citrico'));

-- Perfis, planos e vendas.
alter table public.proprietarios add column if not exists email text;
alter table public.proprietarios add column if not exists telefone text not null default '';
alter table public.proprietarios add column if not exists documento text not null default '';
alter table public.proprietarios add column if not exists empresa text not null default '';
alter table public.proprietarios add column if not exists slug_publico text;
alter table public.proprietarios add column if not exists nome_publico text not null default '';
alter table public.proprietarios add column if not exists contato_publico text not null default '';
alter table public.proprietarios add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_proprietarios_slug_publico
  on public.proprietarios(lower(slug_publico)) where slug_publico is not null;

update public.proprietarios p set email=lower(u.email),updated_at=now()
from auth.users u where u.id=p.user_id and coalesce(p.email,'')='';

create table if not exists public.administradores_plataforma (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  criado_por uuid references auth.users(id) on delete set null
);
alter table public.administradores_plataforma add column if not exists criado_por uuid references auth.users(id) on delete set null;

insert into public.administradores_plataforma(user_id)
select id
from auth.users
where lower(email)=any(array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[])
on conflict(user_id) do nothing;

delete from public.administradores_plataforma a
where not exists(
  select 1
  from auth.users u
  where u.id=a.user_id
    and lower(u.email)=any(array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[])
);

create table if not exists public.assinaturas (
  user_id uuid primary key references public.proprietarios(user_id) on delete cascade,
  plano text not null default 'gratuito',
  status text not null default 'ativa',
  valor_pago numeric(12,2) not null default 0,
  forma_pagamento text not null default '',
  referencia_pagamento text not null default '',
  observacoes text not null default '',
  pagamento_confirmado_em timestamptz,
  ativada_em timestamptz,
  criado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.assinaturas add column if not exists valor_pago numeric(12,2) not null default 0;
alter table public.assinaturas add column if not exists forma_pagamento text not null default '';
alter table public.assinaturas add column if not exists referencia_pagamento text not null default '';
alter table public.assinaturas add column if not exists observacoes text not null default '';
alter table public.assinaturas add column if not exists pagamento_confirmado_em timestamptz;
alter table public.assinaturas add column if not exists periodo_atual_fim date;
alter table public.assinaturas add column if not exists pagamento_vitalicio_em timestamptz;

do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid='public.assinaturas'::regclass and contype='c'
  loop execute format('alter table public.assinaturas drop constraint %I',c.conname); end loop;
end $$;

update public.assinaturas set
  plano=case plano when 'vitalicio' then 'premium' when 'mensal' then 'basico' else plano end,
  status=case when status in ('aguardando','atrasada') then 'suspensa' else status end,
  pagamento_confirmado_em=coalesce(pagamento_confirmado_em,pagamento_vitalicio_em,ativada_em)
where plano in ('vitalicio','mensal') or status in ('aguardando','atrasada');

alter table public.assinaturas drop column if exists periodo_atual_fim;
alter table public.assinaturas drop column if exists pagamento_vitalicio_em;
alter table public.assinaturas alter column plano set default 'gratuito';
alter table public.assinaturas add constraint assinaturas_plano_check
  check (plano in ('gratuito','basico','premium'));
alter table public.assinaturas add constraint assinaturas_status_check
  check (status in ('ativa','suspensa','cancelada'));
alter table public.assinaturas add constraint assinaturas_valor_check check (valor_pago>=0);

-- Contas antigas viram Premium para nunca perderem casas existentes.
insert into public.assinaturas(user_id,plano,status,valor_pago,pagamento_confirmado_em,ativada_em)
select user_id,'premium','ativa',0,now(),now() from public.proprietarios
on conflict(user_id) do nothing;

-- Contas antigas que estavam sem convite passam a usar o plano Gratuito.
insert into public.proprietarios(user_id,nome,email,updated_at)
select u.id,coalesce(u.raw_user_meta_data->>'name','Novo proprietario'),lower(u.email),now()
from auth.users u
where not exists(select 1 from public.proprietarios p where p.user_id=u.id)
  and not exists(select 1 from public.acessos_inquilino a where a.user_id=u.id and a.ativo)
  and lower(coalesce(u.raw_user_meta_data->>'account_type','admin'))<>'tenant'
on conflict(user_id) do nothing;
insert into public.assinaturas(user_id,plano,status,valor_pago,ativada_em)
select p.user_id,'gratuito','ativa',0,now() from public.proprietarios p
where not exists(select 1 from public.assinaturas a where a.user_id=p.user_id)
on conflict(user_id) do nothing;

-- As duas contas Mestre sempre possuem perfil operacional completo. A
-- autorizacao nao depende de uma linha antiga em administradores_plataforma.
insert into public.proprietarios(user_id,nome,email,updated_at)
select
  u.id,
  coalesce(nullif(trim(u.raw_user_meta_data->>'name'),''),'Conta Mestre'),
  lower(u.email),
  now()
from auth.users u
where lower(u.email)=any(array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[])
on conflict(user_id) do update
set email=excluded.email,updated_at=now();

insert into public.assinaturas(user_id,plano,status,valor_pago,pagamento_confirmado_em,ativada_em,updated_at)
select u.id,'premium','ativa',0,now(),now(),now()
from auth.users u
where lower(u.email)=any(array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[])
on conflict(user_id) do update
set plano='premium',status='ativa',updated_at=now();

update auth.users
set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)||
  jsonb_build_object('account_type','admin')
where lower(email)=any(array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]);

-- Nunca desativa um portal de inquilino automaticamente. Contas antigas que
-- receberam dois perfis sao corrigidas pela migracao-tipos-acesso.sql.

create table if not exists public.convites_proprietario (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null,
  telefone text not null default '',
  documento text not null default '',
  empresa text not null default '',
  plano text not null,
  status text not null default 'aguardando_pagamento',
  pagamento_status text not null default 'pendente',
  valor_pago numeric(12,2) not null default 0,
  forma_pagamento text not null default '',
  referencia_pagamento text not null default '',
  observacoes text not null default '',
  expira_em timestamptz not null default (now()+interval '7 days'),
  pagamento_confirmado_em timestamptz,
  aceito_por uuid references auth.users(id) on delete set null,
  aceito_em timestamptz,
  criado_por uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.convites_proprietario add column if not exists telefone text not null default '';
alter table public.convites_proprietario add column if not exists documento text not null default '';
alter table public.convites_proprietario add column if not exists empresa text not null default '';
alter table public.convites_proprietario add column if not exists pagamento_status text not null default 'pendente';
alter table public.convites_proprietario add column if not exists valor_pago numeric(12,2) not null default 0;
alter table public.convites_proprietario add column if not exists forma_pagamento text not null default '';
alter table public.convites_proprietario add column if not exists referencia_pagamento text not null default '';
alter table public.convites_proprietario add column if not exists observacoes text not null default '';
alter table public.convites_proprietario add column if not exists pagamento_confirmado_em timestamptz;

do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid='public.convites_proprietario'::regclass and contype='c'
  loop execute format('alter table public.convites_proprietario drop constraint %I',c.conname); end loop;
end $$;

update public.convites_proprietario set
  plano=case plano when 'vitalicio' then 'premium' when 'mensal' then 'basico' else plano end,
  pagamento_status=case when status in ('pendente','aceito') then 'confirmado' else pagamento_status end,
  pagamento_confirmado_em=case when status in ('pendente','aceito') then coalesce(pagamento_confirmado_em,created_at) else pagamento_confirmado_em end
where plano in ('vitalicio','mensal') or status in ('pendente','aceito');

alter table public.convites_proprietario drop column if exists periodo_atual_fim;
alter table public.convites_proprietario add constraint convites_plano_check
  check (plano in ('gratuito','basico','premium'));
alter table public.convites_proprietario add constraint convites_status_check
  check (status in ('aguardando_pagamento','pendente','aceito','cancelado','expirado'));
alter table public.convites_proprietario add constraint convites_pagamento_check
  check (pagamento_status in ('gratuito','pendente','confirmado'));
alter table public.convites_proprietario add constraint convites_valor_check check (valor_pago>=0);

create unique index if not exists idx_convite_proprietario_aberto_email
  on public.convites_proprietario(lower(email))
  where status in ('aguardando_pagamento','pendente');

-- Funcionarios usam login proprio, mas operam sempre dentro da conta do dono.
create table if not exists public.convites_colaborador (
  id uuid primary key default gen_random_uuid(),
  proprietario_id uuid not null references public.proprietarios(user_id) on delete cascade,
  nome text not null,
  email text not null,
  status text not null default 'pendente',
  expira_em timestamptz not null default (now()+interval '14 days'),
  aceito_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.acessos_colaborador (
  user_id uuid primary key references auth.users(id) on delete cascade,
  proprietario_id uuid not null references public.proprietarios(user_id) on delete cascade,
  nome text not null,
  email text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.convites_colaborador drop constraint if exists convites_colaborador_status_check;
alter table public.convites_colaborador add constraint convites_colaborador_status_check
  check(status in ('pendente','aceito','cancelado','expirado'));
create unique index if not exists idx_convite_colaborador_aberto_email
  on public.convites_colaborador(proprietario_id,lower(email)) where status='pendente';
create unique index if not exists idx_convite_colaborador_email_global
  on public.convites_colaborador(lower(email)) where status='pendente';
create index if not exists idx_acesso_colaborador_proprietario on public.acessos_colaborador(proprietario_id);

delete from public.acessos_inquilino a
using auth.users u
where u.id=a.user_id
  and lower(u.email)=any(array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]);

delete from public.acessos_colaborador a
using auth.users u
where u.id=a.user_id
  and lower(u.email)=any(array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]);

create table if not exists public.auditoria_comercial (
  id uuid primary key default gen_random_uuid(),
  administrador_id uuid references auth.users(id) on delete set null,
  cliente_id uuid references auth.users(id) on delete set null,
  convite_id uuid references public.convites_proprietario(id) on delete set null,
  acao text not null,
  detalhes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.aceites_termos (
  user_id uuid primary key references auth.users(id) on delete cascade,
  versao text not null,
  aceito_em timestamptz not null default now()
);

create index if not exists idx_assinaturas_status on public.assinaturas(status);
create index if not exists idx_auditoria_comercial_data on public.auditoria_comercial(created_at desc);

-- Funcoes centrais de autorizacao e limites.
create or replace function public.e_administrador_plataforma(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public
as $$
  select exists(
    select 1
    from auth.users u
    where u.id=p_user_id
      and u.email_confirmed_at is not null
      and lower(u.email)=any(array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[])
  )
$$;

create or replace function public.usuario_proprietario_id(p_user_id uuid default auth.uid())
returns uuid language sql stable security definer set search_path=public
as $$
  select case
    when public.e_administrador_plataforma(p_user_id) then coalesce(
      (
        select u.id
        from auth.users u
        where lower(u.email)='andertonaluguel@gmail.com'
        order by u.created_at
        limit 1
      ),
      p_user_id
    )
    when exists(select 1 from public.proprietarios p where p.user_id=p_user_id) then p_user_id
    else (select a.proprietario_id from public.acessos_colaborador a
          where a.user_id=p_user_id and a.ativo limit 1)
  end
$$;

create or replace function public.limite_casas_plano(p_plano text)
returns integer language sql immutable set search_path=public
as $$ select case p_plano when 'premium' then 100 when 'basico' then 3 else 1 end $$;

create or replace function public.limite_armazenamento_plano(p_plano text)
returns bigint language sql immutable set search_path=public
as $$ select case p_plano when 'premium' then 10737418240::bigint when 'basico' then 1073741824::bigint else 52428800::bigint end $$;

create or replace function public.e_acesso_comercial_ativo(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public
as $$
  select public.e_administrador_plataforma(p_user_id) or exists(
    select 1 from public.assinaturas a where a.user_id=p_user_id and a.status='ativa'
  )
$$;

create or replace function public.e_acesso_operacional(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public
as $$
  select public.e_administrador_plataforma(p_user_id) or (
    public.e_acesso_comercial_ativo(p_user_id) and exists(
      select 1 from public.aceites_termos t where t.user_id=p_user_id and t.versao='1.0'
    )
  )
$$;

create or replace function public.armazenamento_usado(p_user_id uuid default auth.uid())
returns bigint language sql stable security definer set search_path=public
as $$
  select coalesce((select sum(coalesce(tamanho,0)) from public.fotos where user_id=p_user_id),0)::bigint+
         coalesce((select sum(coalesce(tamanho,0)) from public.documentos where user_id=p_user_id),0)::bigint
$$;

revoke all on function public.e_administrador_plataforma(uuid) from public,anon;
revoke all on function public.usuario_proprietario_id(uuid) from public,anon;
revoke all on function public.e_acesso_comercial_ativo(uuid) from public,anon;
revoke all on function public.e_acesso_operacional(uuid) from public,anon;
revoke all on function public.armazenamento_usado(uuid) from public,anon;
grant execute on function public.e_administrador_plataforma(uuid) to authenticated;
grant execute on function public.usuario_proprietario_id(uuid) to authenticated;
grant execute on function public.e_acesso_comercial_ativo(uuid) to authenticated;
grant execute on function public.e_acesso_operacional(uuid) to authenticated;
grant execute on function public.armazenamento_usado(uuid) to authenticated;

create or replace function public.acesso_comercial_atual()
returns jsonb language sql stable security definer set search_path=public
as $$
  select jsonb_build_object(
    'administradorPlataforma',public.e_administrador_plataforma(s.uid),
    'proprietario',p.user_id is not null,
    'proprietarioId',s.owner_id,
    'colaborador',s.owner_id is not null and s.owner_id<>s.uid,
    'plano',coalesce(a.plano,'gratuito'),
    'status',coalesce(a.status,'suspensa'),
    'podeAcessar',public.e_acesso_comercial_ativo(s.owner_id),
    'limiteCasas',case when public.e_administrador_plataforma(s.uid) then 100 else public.limite_casas_plano(coalesce(a.plano,'gratuito')) end,
    'quantidadeCasas',(select count(*) from public.imoveis i where i.user_id=s.owner_id),
    'limiteArmazenamento',case when public.e_administrador_plataforma(s.uid) then 10737418240::bigint else public.limite_armazenamento_plano(coalesce(a.plano,'gratuito')) end,
    'armazenamentoUsado',public.armazenamento_usado(s.owner_id),
    'termosAceitos',exists(select 1 from public.aceites_termos t where t.user_id=s.owner_id and t.versao='1.0')
  )
  from (select auth.uid() uid,public.usuario_proprietario_id(auth.uid()) owner_id) s
  left join public.proprietarios p on p.user_id=s.owner_id
  left join public.assinaturas a on a.user_id=s.owner_id
$$;

revoke all on function public.acesso_comercial_atual() from public,anon;
grant execute on function public.acesso_comercial_atual() to authenticated;

-- RLS: suspender/cancelar bloqueia tambem o acesso direto ao banco.
alter table public.administradores_plataforma enable row level security;
alter table public.assinaturas enable row level security;
alter table public.convites_proprietario enable row level security;
alter table public.auditoria_comercial enable row level security;
alter table public.aceites_termos enable row level security;
alter table public.convites_colaborador enable row level security;
alter table public.acessos_colaborador enable row level security;

drop policy if exists platform_admin_own_profile on public.administradores_plataforma;
create policy platform_admin_own_profile on public.administradores_plataforma
  for select to authenticated using(user_id=auth.uid());
drop policy if exists subscription_owner_read on public.assinaturas;
create policy subscription_owner_read on public.assinaturas
  for select to authenticated using(user_id=auth.uid());
drop policy if exists platform_subscription_all on public.assinaturas;
create policy platform_subscription_all on public.assinaturas for all to authenticated
  using(public.e_administrador_plataforma()) with check(public.e_administrador_plataforma());
drop policy if exists platform_owner_invites on public.convites_proprietario;
create policy platform_owner_invites on public.convites_proprietario for all to authenticated
  using(public.e_administrador_plataforma()) with check(public.e_administrador_plataforma());
drop policy if exists platform_audit_read on public.auditoria_comercial;
create policy platform_audit_read on public.auditoria_comercial for select to authenticated
  using(public.e_administrador_plataforma());
drop policy if exists own_terms on public.aceites_termos;
create policy own_terms on public.aceites_termos for select to authenticated using(user_id=auth.uid());
drop policy if exists collaborator_owner_invites on public.convites_colaborador;
create policy collaborator_owner_invites on public.convites_colaborador for select to authenticated
  using(proprietario_id=auth.uid());
drop policy if exists collaborator_own_access on public.acessos_colaborador;
create policy collaborator_own_access on public.acessos_colaborador for select to authenticated
  using(user_id=auth.uid() or proprietario_id=auth.uid());

grant select on public.administradores_plataforma to authenticated;
grant select,insert,update,delete on public.assinaturas to authenticated;
grant select,insert,update,delete on public.convites_proprietario to authenticated;
grant select on public.auditoria_comercial to authenticated;
grant select on public.aceites_termos to authenticated;
grant select on public.convites_colaborador to authenticated;
grant select on public.acessos_colaborador to authenticated;

do $$ declare t text; begin
  foreach t in array array['inquilinos','imoveis','pagamentos','energia','despesas','historico_status',
    'fotos','contratos','documentos','eventos','configuracoes','aluguel_historico','backups','interessados']
  loop
    if to_regclass('public.'||t) is not null then
      execute format('drop policy if exists own_rows on public.%I',t);
      execute format('drop policy if exists owner_active_rows on public.%I',t);
      execute format('create policy owner_active_rows on public.%I for all to authenticated using (user_id=public.usuario_proprietario_id(auth.uid()) and public.e_acesso_operacional(public.usuario_proprietario_id(auth.uid()))) with check (user_id=public.usuario_proprietario_id(auth.uid()) and public.e_acesso_operacional(public.usuario_proprietario_id(auth.uid())))',t);
    end if;
  end loop;
end $$;

drop policy if exists owner_profile on public.proprietarios;
create policy owner_profile on public.proprietarios for select to authenticated
  using(user_id=public.usuario_proprietario_id(auth.uid()));

drop policy if exists owner_invites on public.convites_inquilino;
create policy owner_invites on public.convites_inquilino for all to authenticated
  using(proprietario_id=public.usuario_proprietario_id()) with check(proprietario_id=public.usuario_proprietario_id());
drop policy if exists owner_tenant_access on public.acessos_inquilino;
create policy owner_tenant_access on public.acessos_inquilino for all to authenticated
  using(proprietario_id=public.usuario_proprietario_id()) with check(proprietario_id=public.usuario_proprietario_id());

drop policy if exists owner_files_select on storage.objects;
drop policy if exists owner_files_insert on storage.objects;
drop policy if exists owner_files_update on storage.objects;
drop policy if exists owner_files_delete on storage.objects;
create policy owner_files_select on storage.objects for select to authenticated
  using(bucket_id='imoveis-arquivos' and (storage.foldername(name))[1]=public.usuario_proprietario_id()::text and public.e_acesso_operacional(public.usuario_proprietario_id()));
create policy owner_files_insert on storage.objects for insert to authenticated
  with check(bucket_id='imoveis-arquivos' and (storage.foldername(name))[1]=public.usuario_proprietario_id()::text and public.e_acesso_operacional(public.usuario_proprietario_id()));
create policy owner_files_update on storage.objects for update to authenticated
  using(bucket_id='imoveis-arquivos' and (storage.foldername(name))[1]=public.usuario_proprietario_id()::text and public.e_acesso_operacional(public.usuario_proprietario_id()))
  with check(bucket_id='imoveis-arquivos' and (storage.foldername(name))[1]=public.usuario_proprietario_id()::text and public.e_acesso_operacional(public.usuario_proprietario_id()));
create policy owner_files_delete on storage.objects for delete to authenticated
  using(bucket_id='imoveis-arquivos' and (storage.foldername(name))[1]=public.usuario_proprietario_id()::text and public.e_acesso_operacional(public.usuario_proprietario_id()));

-- Limite de casas protegido por trigger.
create or replace function public.validar_limite_imoveis()
returns trigger language plpgsql security definer set search_path=public
as $$ declare v_plano text; v_limite int; v_total int; begin
  if new.user_id is null then new.user_id:=public.usuario_proprietario_id(); end if;
  if new.user_id is distinct from public.usuario_proprietario_id() then raise exception 'Conta proprietaria invalida.'; end if;
  if not public.e_acesso_operacional(new.user_id) then raise exception 'Acesso comercial inativo ou termos pendentes.'; end if;
  select plano into v_plano from public.assinaturas where user_id=new.user_id and status='ativa';
  v_limite:=public.limite_casas_plano(coalesce(v_plano,'gratuito'));
  select count(*) into v_total from public.imoveis where user_id=new.user_id;
  if v_total>=v_limite then
    raise exception 'Limite de % casa(s) do plano % atingido.',v_limite,coalesce(v_plano,'gratuito');
  end if;
  return new;
end $$;

drop trigger if exists validar_limite_imoveis_trigger on public.imoveis;
create trigger validar_limite_imoveis_trigger before insert on public.imoveis
for each row execute function public.validar_limite_imoveis();

-- Limite de armazenamento protegido nos metadados. Se a gravacao for negada,
-- o aplicativo remove imediatamente o arquivo que acabou de enviar.
create or replace function public.validar_limite_armazenamento()
returns trigger language plpgsql security definer set search_path=public
as $$ declare v_plano text; v_limite bigint; v_usado bigint; begin
  if new.user_id is null then new.user_id:=public.usuario_proprietario_id(); end if;
  if new.user_id is distinct from public.usuario_proprietario_id() then raise exception 'Conta proprietaria invalida.'; end if;
  if not public.e_acesso_operacional(new.user_id) then raise exception 'Acesso comercial inativo ou termos pendentes.'; end if;
  select plano into v_plano from public.assinaturas where user_id=new.user_id and status='ativa';
  v_limite:=public.limite_armazenamento_plano(coalesce(v_plano,'gratuito'));
  v_usado:=public.armazenamento_usado(new.user_id);
  if tg_op='UPDATE' then v_usado:=greatest(0,v_usado-coalesce(old.tamanho,0)); end if;
  if v_usado+coalesce(new.tamanho,0)>v_limite then raise exception 'Limite de armazenamento do plano atingido.'; end if;
  return new;
end $$;

drop trigger if exists validar_armazenamento_fotos on public.fotos;
create trigger validar_armazenamento_fotos before insert or update of tamanho on public.fotos
for each row execute function public.validar_limite_armazenamento();
drop trigger if exists validar_armazenamento_documentos on public.documentos;
create trigger validar_armazenamento_documentos before insert or update of tamanho on public.documentos
for each row execute function public.validar_limite_armazenamento();

-- Aceite dos termos.
create or replace function public.aceitar_termos_atuais()
returns void language plpgsql security definer set search_path=public
as $$
declare
  v_destino uuid;
begin
  if auth.uid() is null then raise exception 'Usuario nao autenticado.'; end if;
  v_destino:=case
    when public.e_administrador_plataforma(auth.uid())
      then public.usuario_proprietario_id(auth.uid())
    else auth.uid()
  end;
  insert into public.aceites_termos(user_id,versao,aceito_em)
  values(v_destino,'1.0',now())
  on conflict(user_id) do update set versao='1.0',aceito_em=now();
end
$$;
revoke all on function public.aceitar_termos_atuais() from public,anon;
grant execute on function public.aceitar_termos_atuais() to authenticated;

-- Ativacao interna de uma venda confirmada.
create or replace function public.ativar_convite_proprietario(p_convite_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path=public
as $$ declare v public.convites_proprietario%rowtype; begin
  select * into v from public.convites_proprietario where id=p_convite_id for update;
  if not found or v.status<>'pendente' or v.expira_em<now() or v.pagamento_status not in ('confirmado','gratuito') then
    raise exception 'Convite indisponivel para ativacao.';
  end if;
  if exists(select 1 from public.acessos_inquilino where user_id=p_user_id and ativo) then
    raise exception 'Este e-mail ja pertence a um portal de inquilino.';
  end if;
  if exists(select 1 from public.acessos_colaborador where user_id=p_user_id and ativo) then
    raise exception 'Este e-mail ja pertence a um funcionario.';
  end if;
  insert into public.proprietarios(user_id,nome,email,telefone,documento,empresa,updated_at)
  values(p_user_id,left(v.nome,160),lower(v.email),left(v.telefone,40),left(v.documento,80),left(v.empresa,160),now())
  on conflict(user_id) do update set nome=excluded.nome,email=excluded.email,telefone=excluded.telefone,
    documento=excluded.documento,empresa=excluded.empresa,updated_at=now();
  insert into public.assinaturas(user_id,plano,status,valor_pago,forma_pagamento,referencia_pagamento,
    observacoes,pagamento_confirmado_em,ativada_em,criado_por,updated_at)
  values(p_user_id,v.plano,'ativa',v.valor_pago,v.forma_pagamento,v.referencia_pagamento,v.observacoes,
    v.pagamento_confirmado_em,now(),v.criado_por,now())
  on conflict(user_id) do update set plano=excluded.plano,status='ativa',valor_pago=excluded.valor_pago,
    forma_pagamento=excluded.forma_pagamento,referencia_pagamento=excluded.referencia_pagamento,
    observacoes=excluded.observacoes,pagamento_confirmado_em=excluded.pagamento_confirmado_em,updated_at=now();
  update public.convites_proprietario set status='aceito',aceito_por=p_user_id,aceito_em=now(),updated_at=now() where id=p_convite_id;
  insert into public.auditoria_comercial(administrador_id,cliente_id,convite_id,acao,detalhes)
  values(v.criado_por,p_user_id,p_convite_id,'cliente_ativado',jsonb_build_object('plano',v.plano));
end $$;
revoke all on function public.ativar_convite_proprietario(uuid,uuid) from public,anon,authenticated;

-- Registra a venda. Basico e Premium aguardam confirmacao do pagamento.
create or replace function public.criar_venda_cliente(
  p_nome text,p_email text,p_telefone text,p_documento text,p_empresa text,p_plano text,
  p_valor_pago numeric,p_forma_pagamento text,p_referencia_pagamento text,p_observacoes text
)
returns uuid language plpgsql security definer set search_path=public,auth
as $$ declare v_admin uuid:=auth.uid();v_email text:=lower(trim(coalesce(p_email,'')));v_id uuid;begin
  if not public.e_administrador_plataforma(v_admin) then raise exception 'Acesso negado.'; end if;
  if trim(coalesce(p_nome,''))='' then raise exception 'Informe o nome do cliente.'; end if;
  if v_email='' or position('@' in v_email)<2 then raise exception 'E-mail invalido.'; end if;
  if p_plano not in ('gratuito','basico','premium') then raise exception 'Plano invalido.'; end if;
  if exists(select 1 from public.acessos_inquilino a join auth.users u on u.id=a.user_id where lower(u.email)=v_email and a.ativo) then
    raise exception 'Este e-mail ja esta ligado a um inquilino. Use outro e-mail.';
  end if;
  if exists(select 1 from public.acessos_colaborador a join auth.users u on u.id=a.user_id where lower(u.email)=v_email and a.ativo)
     or exists(select 1 from public.convites_colaborador where lower(email)=v_email and status='pendente') then
    raise exception 'Este e-mail ja esta ligado a um funcionario. Use outro e-mail.';
  end if;
  insert into public.convites_proprietario(nome,email,telefone,documento,empresa,plano,status,pagamento_status,
    valor_pago,forma_pagamento,referencia_pagamento,observacoes,expira_em,criado_por)
  values(left(trim(p_nome),160),v_email,left(coalesce(p_telefone,''),40),left(coalesce(p_documento,''),80),
    left(coalesce(p_empresa,''),160),p_plano,case when p_plano='gratuito' then 'pendente' else 'aguardando_pagamento' end,
    case when p_plano='gratuito' then 'gratuito' else 'pendente' end,greatest(coalesce(p_valor_pago,0),0),
    left(coalesce(p_forma_pagamento,''),80),left(coalesce(p_referencia_pagamento,''),180),
    left(coalesce(p_observacoes,''),2000),now()+interval '7 days',v_admin)
  returning id into v_id;
  insert into public.auditoria_comercial(administrador_id,convite_id,acao,detalhes)
  values(v_admin,v_id,'venda_criada',jsonb_build_object('plano',p_plano,'email',v_email));
  if p_plano='gratuito' then
    perform public.ativar_convite_proprietario(v_id,(select id from auth.users where lower(email)=v_email order by created_at limit 1))
    where exists(select 1 from auth.users where lower(email)=v_email);
  end if;
  return v_id;
end $$;

revoke all on function public.criar_venda_cliente(text,text,text,text,text,text,numeric,text,text,text) from public,anon;
grant execute on function public.criar_venda_cliente(text,text,text,text,text,text,numeric,text,text,text) to authenticated;

create or replace function public.confirmar_pagamento_venda(p_convite_id uuid)
returns void language plpgsql security definer set search_path=public,auth
as $$ declare v_admin uuid:=auth.uid();v_email text;v_user uuid;begin
  if not public.e_administrador_plataforma(v_admin) then raise exception 'Acesso negado.'; end if;
  update public.convites_proprietario set pagamento_status='confirmado',pagamento_confirmado_em=now(),
    status='pendente',expira_em=now()+interval '7 days',updated_at=now()
  where id=p_convite_id and status='aguardando_pagamento' returning email into v_email;
  if not found then raise exception 'Venda nao encontrada ou ja confirmada.'; end if;
  select id into v_user from auth.users where lower(email)=lower(v_email) order by created_at limit 1;
  insert into public.auditoria_comercial(administrador_id,convite_id,acao) values(v_admin,p_convite_id,'pagamento_confirmado');
  if v_user is not null then perform public.ativar_convite_proprietario(p_convite_id,v_user); end if;
end $$;
revoke all on function public.confirmar_pagamento_venda(uuid) from public,anon;
grant execute on function public.confirmar_pagamento_venda(uuid) to authenticated;

create or replace function public.cancelar_convite_proprietario(p_convite_id uuid)
returns void language plpgsql security definer set search_path=public
as $$ begin
  if not public.e_administrador_plataforma(auth.uid()) then raise exception 'Acesso negado.'; end if;
  update public.convites_proprietario set status='cancelado',updated_at=now()
  where id=p_convite_id and status in ('aguardando_pagamento','pendente');
  insert into public.auditoria_comercial(administrador_id,convite_id,acao) values(auth.uid(),p_convite_id,'venda_cancelada');
end $$;
revoke all on function public.cancelar_convite_proprietario(uuid) from public,anon;
grant execute on function public.cancelar_convite_proprietario(uuid) to authenticated;

create or replace function public.atualizar_cliente_comercial(
  p_user_id uuid,p_plano text,p_status text,p_telefone text,p_documento text,p_empresa text,
  p_valor_pago numeric,p_forma_pagamento text,p_referencia_pagamento text,p_observacoes text
)
returns void language plpgsql security definer set search_path=public
as $$ begin
  if not public.e_administrador_plataforma(auth.uid()) then raise exception 'Acesso negado.'; end if;
  if p_plano not in ('gratuito','basico','premium') or p_status not in ('ativa','suspensa','cancelada') then raise exception 'Plano ou situacao invalida.'; end if;
  if p_status='ativa' and (select count(*) from public.imoveis where user_id=p_user_id)>public.limite_casas_plano(p_plano) then
    raise exception 'O cliente possui mais casas do que o novo plano permite.';
  end if;
  if p_status='ativa' and public.armazenamento_usado(p_user_id)>public.limite_armazenamento_plano(p_plano) then
    raise exception 'O cliente usa mais armazenamento do que o novo plano permite.';
  end if;
  update public.proprietarios set telefone=left(coalesce(p_telefone,''),40),documento=left(coalesce(p_documento,''),80),
    empresa=left(coalesce(p_empresa,''),160),updated_at=now() where user_id=p_user_id;
  update public.assinaturas set plano=p_plano,status=p_status,valor_pago=greatest(coalesce(p_valor_pago,0),0),
    forma_pagamento=left(coalesce(p_forma_pagamento,''),80),referencia_pagamento=left(coalesce(p_referencia_pagamento,''),180),
    observacoes=left(coalesce(p_observacoes,''),2000),updated_at=now() where user_id=p_user_id;
  if not found then raise exception 'Cliente nao encontrado.'; end if;
  insert into public.auditoria_comercial(administrador_id,cliente_id,acao,detalhes)
  values(auth.uid(),p_user_id,'cliente_atualizado',jsonb_build_object('plano',p_plano,'status',p_status));
end $$;
revoke all on function public.atualizar_cliente_comercial(uuid,text,text,text,text,text,numeric,text,text,text) from public,anon;
grant execute on function public.atualizar_cliente_comercial(uuid,text,text,text,text,text,numeric,text,text,text) to authenticated;

drop function if exists public.listar_clientes_comerciais();
create or replace function public.listar_clientes_comerciais()
returns table(user_id uuid,nome text,email text,telefone text,documento text,empresa text,plano text,status text,
  valor_pago numeric,forma_pagamento text,referencia_pagamento text,observacoes text,quantidade_imoveis bigint,
  limite_imoveis integer,armazenamento_usado bigint,limite_armazenamento bigint,criado_em timestamptz)
language plpgsql security definer set search_path=public
as $$ begin
  if not public.e_administrador_plataforma(auth.uid()) then raise exception 'Acesso negado.'; end if;
  return query select p.user_id,p.nome,p.email,p.telefone,p.documento,p.empresa,a.plano,a.status,a.valor_pago,
    a.forma_pagamento,a.referencia_pagamento,a.observacoes,
    (select count(*) from public.imoveis i where i.user_id=p.user_id),public.limite_casas_plano(a.plano),
    public.armazenamento_usado(p.user_id),public.limite_armazenamento_plano(a.plano),p.created_at
  from public.proprietarios p join public.assinaturas a on a.user_id=p.user_id order by p.created_at desc;
end $$;
revoke all on function public.listar_clientes_comerciais() from public,anon;
grant execute on function public.listar_clientes_comerciais() to authenticated;

create or replace function public.listar_vendas_comerciais()
returns table(id uuid,nome text,email text,telefone text,documento text,empresa text,plano text,status text,
  pagamento_status text,valor_pago numeric,forma_pagamento text,referencia_pagamento text,observacoes text,
  expira_em timestamptz,aceito_em timestamptz,created_at timestamptz)
language plpgsql security definer set search_path=public
as $$ begin
  if not public.e_administrador_plataforma(auth.uid()) then raise exception 'Acesso negado.'; end if;
  update public.convites_proprietario c set status='expirado',updated_at=now()
    where c.status='pendente' and c.expira_em<now();
  return query select c.id,c.nome,c.email,c.telefone,c.documento,c.empresa,c.plano,c.status,c.pagamento_status,
    c.valor_pago,c.forma_pagamento,c.referencia_pagamento,c.observacoes,c.expira_em,c.aceito_em,c.created_at
  from public.convites_proprietario c order by c.created_at desc;
end $$;
revoke all on function public.listar_vendas_comerciais() from public,anon;
grant execute on function public.listar_vendas_comerciais() to authenticated;

create or replace function public.listar_administradores_plataforma()
returns table(user_id uuid,email text,created_at timestamptz)
language plpgsql security definer set search_path=public,auth
as $$ begin
  if not public.e_administrador_plataforma(auth.uid()) then raise exception 'Acesso negado.'; end if;
  return query select a.user_id,u.email::text,a.created_at from public.administradores_plataforma a join auth.users u on u.id=a.user_id order by a.created_at;
end $$;
revoke all on function public.listar_administradores_plataforma() from public,anon;
grant execute on function public.listar_administradores_plataforma() to authenticated;

create or replace function public.listar_auditoria_comercial()
returns table(acao text,detalhes jsonb,administrador_email text,cliente_email text,created_at timestamptz)
language plpgsql security definer set search_path=public,auth
as $$ begin
  if not public.e_administrador_plataforma(auth.uid()) then raise exception 'Acesso negado.'; end if;
  return query select a.acao,a.detalhes,ua.email::text,uc.email::text,a.created_at
  from public.auditoria_comercial a left join auth.users ua on ua.id=a.administrador_id
  left join auth.users uc on uc.id=a.cliente_id order by a.created_at desc limit 100;
end $$;
revoke all on function public.listar_auditoria_comercial() from public,anon;
grant execute on function public.listar_auditoria_comercial() to authenticated;

create or replace function public.adicionar_administrador_plataforma(p_email text)
returns void language plpgsql security definer set search_path=public,auth
as $$ declare v_user uuid;begin
  if not public.e_administrador_plataforma(auth.uid()) then raise exception 'Acesso negado.'; end if;
  if lower(trim(coalesce(p_email,'')))<>all(array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]) then
    raise exception 'As contas Mestre sao fixas e nao podem ser ampliadas.';
  end if;
  select id into v_user from auth.users where lower(email)=lower(trim(p_email)) order by created_at limit 1;
  if v_user is null then raise exception 'Essa pessoa precisa criar uma conta antes.'; end if;
  if exists(select 1 from public.acessos_inquilino where user_id=v_user and ativo) then raise exception 'Uma conta de inquilino nao pode administrar a plataforma.'; end if;
  insert into public.administradores_plataforma(user_id,criado_por) values(v_user,auth.uid()) on conflict(user_id) do nothing;
  insert into public.proprietarios(user_id,nome,email,updated_at) values(v_user,coalesce((select raw_user_meta_data->>'name' from auth.users where id=v_user),'Administrador'),lower(trim(p_email)),now()) on conflict(user_id) do nothing;
  insert into public.assinaturas(user_id,plano,status,ativada_em) values(v_user,'premium','ativa',now())
    on conflict(user_id) do update set plano='premium',status='ativa',updated_at=now();
  insert into public.auditoria_comercial(administrador_id,cliente_id,acao) values(auth.uid(),v_user,'administrador_adicionado');
end $$;
revoke all on function public.adicionar_administrador_plataforma(text) from public,anon;
grant execute on function public.adicionar_administrador_plataforma(text) to authenticated;

create or replace function public.remover_administrador_plataforma(p_user_id uuid)
returns void language plpgsql security definer set search_path=public
as $$ begin
  if not public.e_administrador_plataforma(auth.uid()) then raise exception 'Acesso negado.'; end if;
  if exists(
    select 1 from auth.users u
    where u.id=p_user_id
      and lower(u.email)=any(array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[])
  ) then
    raise exception 'Uma conta Mestre fixa nao pode ser removida.';
  end if;
  if p_user_id=auth.uid() then raise exception 'Outro administrador deve remover esta conta.'; end if;
  if (select count(*) from public.administradores_plataforma)<=1 then raise exception 'A plataforma precisa manter ao menos um administrador.'; end if;
  delete from public.administradores_plataforma where user_id=p_user_id;
  insert into public.auditoria_comercial(administrador_id,cliente_id,acao) values(auth.uid(),p_user_id,'administrador_removido');
end $$;
revoke all on function public.remover_administrador_plataforma(uuid) from public,anon;
grant execute on function public.remover_administrador_plataforma(uuid) to authenticated;

-- Equipe do proprietario. O limite fixo evita abuso sem criar assinatura externa.
create or replace function public.criar_convite_colaborador(p_nome text,p_email text)
returns jsonb language plpgsql security definer set search_path=public,auth
as $$ declare v_owner uuid:=public.usuario_proprietario_id();v_email text:=lower(trim(coalesce(p_email,'')));
  v_nome text:=trim(coalesce(p_nome,''));v_auth_user uuid;v_id uuid;
begin
  if v_owner is null
     or (v_owner<>auth.uid() and not public.e_administrador_plataforma(auth.uid()))
     or not public.e_acesso_operacional(v_owner) then
    raise exception 'Somente o dono da conta pode gerenciar funcionarios.';
  end if;
  if v_nome='' then raise exception 'Informe o nome do funcionario.'; end if;
  if v_email='' or position('@' in v_email)<2 then raise exception 'E-mail invalido.'; end if;
  if v_email=any(
    array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]
  ) then
    raise exception 'Contas Mestre nao podem ser cadastradas como funcionarios.';
  end if;
  update public.convites_colaborador set status='expirado',updated_at=now()
    where proprietario_id=v_owner and status='pendente' and expira_em<now();
  if (
       select count(*)
       from public.acessos_colaborador a
       left join auth.users u on u.id=a.user_id
       where a.proprietario_id=v_owner
         and a.ativo
         and lower(coalesce(u.email,a.email))<>all(
           array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]
         )
     )+
     (select count(*) from public.convites_colaborador where proprietario_id=v_owner and status='pendente')>=10 then
    raise exception 'Limite de 10 funcionarios e convites atingido.';
  end if;
  select id into v_auth_user from auth.users where lower(email)=v_email order by created_at limit 1;
  if v_auth_user=v_owner or (v_auth_user is not null and exists(select 1 from public.proprietarios where user_id=v_auth_user)) then
    raise exception 'Este e-mail pertence a uma conta de proprietario.';
  end if;
  if v_auth_user is not null and exists(select 1 from public.acessos_inquilino where user_id=v_auth_user and ativo) then
    raise exception 'Este e-mail ja esta sendo usado por um inquilino.';
  end if;
  if v_auth_user is not null and exists(select 1 from public.acessos_colaborador
      where user_id=v_auth_user and ativo and proprietario_id<>v_owner) then
    raise exception 'Este e-mail ja pertence a equipe de outro proprietario.';
  end if;
  if exists(select 1 from public.convites_colaborador
      where lower(email)=v_email and status='pendente' and proprietario_id<>v_owner) then
    raise exception 'Este e-mail ja foi convidado por outro proprietario.';
  end if;
  if exists(select 1 from public.convites_proprietario where lower(email)=v_email and status in ('aguardando_pagamento','pendente')) then
    raise exception 'Este e-mail esta reservado para uma conta de proprietario.';
  end if;
  update public.convites_colaborador set nome=v_nome,expira_em=now()+interval '14 days',updated_at=now()
    where proprietario_id=v_owner and lower(email)=v_email and status='pendente' returning id into v_id;
  if v_id is null then
    insert into public.convites_colaborador(proprietario_id,nome,email) values(v_owner,v_nome,v_email) returning id into v_id;
  end if;
  if v_auth_user is not null then
    insert into public.acessos_colaborador(user_id,proprietario_id,nome,email,ativo,updated_at)
    values(v_auth_user,v_owner,v_nome,v_email,true,now()) on conflict(user_id) do update set
      proprietario_id=excluded.proprietario_id,nome=excluded.nome,email=excluded.email,ativo=true,updated_at=now();
    update public.convites_colaborador set status='aceito',aceito_em=now(),updated_at=now() where id=v_id;
  end if;
  return jsonb_build_object('conviteId',v_id,'email',v_email,'aceito',v_auth_user is not null);
end $$;
revoke all on function public.criar_convite_colaborador(text,text) from public,anon;
grant execute on function public.criar_convite_colaborador(text,text) to authenticated;

create or replace function public.listar_colaboradores()
returns table(convite_id uuid,user_id uuid,nome text,email text,ativo boolean,aceito boolean,status text,created_at timestamptz)
language sql stable security definer set search_path=public
as $$
  with dono as (select public.usuario_proprietario_id() id)
  select null::uuid,a.user_id,a.nome,a.email,a.ativo,true,'aceito'::text,a.created_at
    from public.acessos_colaborador a
    join auth.users u on u.id=a.user_id
    cross join dono
    where (dono.id=auth.uid() or public.e_administrador_plataforma(auth.uid()))
      and a.proprietario_id=dono.id
      and lower(u.email)<>all(
        array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]
      )
  union all
  select c.id,null::uuid,c.nome,c.email,false,false,c.status,c.created_at
    from public.convites_colaborador c,dono
    where (dono.id=auth.uid() or public.e_administrador_plataforma(auth.uid()))
      and c.proprietario_id=dono.id
      and c.status='pendente'
      and lower(c.email)<>all(
        array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]
      )
      and not exists(select 1 from public.acessos_colaborador a where a.proprietario_id=c.proprietario_id and lower(a.email)=lower(c.email))
  order by created_at desc
$$;
revoke all on function public.listar_colaboradores() from public,anon;
grant execute on function public.listar_colaboradores() to authenticated;

create or replace function public.atualizar_colaborador(p_user_id uuid,p_ativo boolean)
returns void language plpgsql security definer set search_path=public
as $$ declare v_owner uuid:=public.usuario_proprietario_id();begin
  if v_owner is null
     or (v_owner<>auth.uid() and not public.e_administrador_plataforma(auth.uid())) then
    raise exception 'Somente o dono da conta pode gerenciar funcionarios.';
  end if;
  if exists(
    select 1
    from auth.users u
    where u.id=p_user_id
      and lower(u.email)=any(
        array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]
      )
  ) then
    raise exception 'Uma conta Mestre nao pode ser alterada como funcionario.';
  end if;
  update public.acessos_colaborador set ativo=p_ativo,updated_at=now()
    where user_id=p_user_id and proprietario_id=v_owner;
  if not found then raise exception 'Funcionario nao encontrado.'; end if;
end $$;
revoke all on function public.atualizar_colaborador(uuid,boolean) from public,anon;
grant execute on function public.atualizar_colaborador(uuid,boolean) to authenticated;

create or replace function public.cancelar_convite_colaborador(p_convite_id uuid)
returns void language plpgsql security definer set search_path=public
as $$ declare v_owner uuid:=public.usuario_proprietario_id();begin
  if v_owner is null
     or (v_owner<>auth.uid() and not public.e_administrador_plataforma(auth.uid())) then
    raise exception 'Somente o dono da conta pode gerenciar funcionarios.';
  end if;
  if exists(
    select 1
    from public.convites_colaborador c
    where c.id=p_convite_id
      and lower(c.email)=any(
        array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]
      )
  ) then
    raise exception 'Convites de contas Mestre nao podem ser alterados.';
  end if;
  update public.convites_colaborador set status='cancelado',updated_at=now()
    where id=p_convite_id and proprietario_id=v_owner and status='pendente';
  if not found then raise exception 'Convite nao encontrado.'; end if;
end $$;
revoke all on function public.cancelar_convite_colaborador(uuid) from public,anon;
grant execute on function public.cancelar_convite_colaborador(uuid) to authenticated;

-- Perfil e catalogo publico. Nenhum dado de inquilino e retornado.
create or replace function public.salvar_perfil_publico(p_slug text,p_nome text,p_contato text)
returns void language plpgsql security definer set search_path=public
as $$ declare v_owner uuid:=public.usuario_proprietario_id();v_slug text:=lower(trim(coalesce(p_slug,'')));begin
  if v_owner is null
     or (v_owner<>auth.uid() and not public.e_administrador_plataforma(auth.uid())) then
    raise exception 'Somente o dono da conta pode alterar o anuncio publico.';
  end if;
  if v_slug<>'' and v_slug!~'^[a-z0-9][a-z0-9-]{2,39}$' then raise exception 'Use de 3 a 40 letras, numeros ou hifens no endereco publico.'; end if;
  update public.proprietarios set slug_publico=nullif(v_slug,''),nome_publico=left(trim(coalesce(p_nome,'')),120),
    contato_publico=left(regexp_replace(coalesce(p_contato,''),'[^0-9]','','g'),20),updated_at=now() where user_id=v_owner;
end $$;
revoke all on function public.salvar_perfil_publico(text,text,text) from public,anon;
grant execute on function public.salvar_perfil_publico(text,text,text) to authenticated;

create or replace function public.listar_imoveis_publicos(p_slug text)
returns jsonb language sql stable security definer set search_path=public
as $$
  with perfil as (
    select p.user_id,p.nome_publico,p.contato_publico,p.slug_publico,
      coalesce(c.tema,'original') tema
    from public.proprietarios p
    join public.assinaturas a on a.user_id=p.user_id and a.status='ativa'
    left join public.configuracoes c on c.user_id=p.user_id
    where lower(p.slug_publico)=lower(trim(p_slug)) limit 1
  )
  select jsonb_build_object(
    'perfil',(select jsonb_build_object('nome',nome_publico,'contato',contato_publico,'slug',slug_publico,'tema',tema) from perfil),
    'imoveis',coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'nome',i.nome,'endereco',i.endereco,'aluguelValor',i.aluguel_valor,
      'quartos',i.quartos,'banheiros',i.banheiros,'cozinha',i.cozinha,'sala',i.sala,
      'garagem',i.garagem,'quintal',i.quintal,'areaServico',i.area_servico,
      'descricao',i.descricao_publica,'fotoPath',(select f.storage_path from public.fotos f
        where f.imovel_id=i.id and coalesce(f.storage_path,'')<>'' order by f.ordem,f.created_at limit 1)
    ) order by i.created_at desc) from public.imoveis i,perfil p
      where i.user_id=p.user_id and i.publicado and i.status='vaga'),'[]'::jsonb)
  )
$$;
revoke all on function public.listar_imoveis_publicos(text) from public;
grant execute on function public.listar_imoveis_publicos(text) to anon,authenticated;

create or replace function public.arquivo_anuncio_publico(p_path text)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(
  select 1 from public.fotos f join public.imoveis i on i.id=f.imovel_id
  join public.assinaturas a on a.user_id=i.user_id and a.status='ativa'
  where f.storage_path=p_path and i.publicado and i.status='vaga'
) $$;
revoke all on function public.arquivo_anuncio_publico(text) from public;
grant execute on function public.arquivo_anuncio_publico(text) to anon,authenticated;

drop policy if exists public_listing_files_select on storage.objects;
create policy public_listing_files_select on storage.objects for select to anon,authenticated
  using(bucket_id='imoveis-arquivos' and public.arquivo_anuncio_publico(name));

-- Convite de inquilino sem colisao com proprietarios ou funcionarios.
create or replace function public.configurar_acesso_inquilino(p_inquilino_id uuid,p_email text,p_ativo boolean default true)
returns jsonb language plpgsql security definer set search_path=public,auth
as $$ declare v_uid uuid:=public.usuario_proprietario_id();v_auth_user uuid;v_email text:=lower(trim(coalesce(p_email,'')));begin
  if v_uid is null or not public.e_acesso_operacional(v_uid) then raise exception 'Conta sem permissao de proprietario.'; end if;
  if v_email='' or position('@' in v_email)<2 then raise exception 'E-mail invalido.'; end if;
  if v_email=any(
    array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]
  ) then
    raise exception 'Este e-mail e reservado para uma conta Mestre.';
  end if;
  if not exists(select 1 from public.inquilinos where id=p_inquilino_id and user_id=v_uid) then raise exception 'Inquilino nao encontrado.'; end if;
  select id into v_auth_user from auth.users where lower(email)=v_email order by created_at limit 1;
  if v_auth_user is not null and exists(select 1 from public.proprietarios where user_id=v_auth_user) then
    if not p_ativo
       or public.e_administrador_plataforma(v_auth_user)
       or exists(select 1 from public.imoveis where user_id=v_auth_user)
       or exists(select 1 from public.inquilinos where user_id=v_auth_user)
       or exists(select 1 from public.assinaturas where user_id=v_auth_user and (plano<>'gratuito' or valor_pago>0))
       or exists(select 1 from public.convites_proprietario where aceito_por=v_auth_user and status='aceito')
       or exists(select 1 from public.acessos_colaborador where user_id=v_auth_user and ativo) then
      raise exception 'Este e-mail pertence a um administrador em uso. Use outro e-mail.';
    end if;
    if exists(select 1 from public.convites_colaborador where proprietario_id=v_auth_user)
       or exists(select 1 from public.acessos_colaborador where proprietario_id=v_auth_user) then
      raise exception 'Este e-mail pertence a um administrador em uso. Use outro e-mail.';
    end if;
    -- Repara a classificacao criada pelo fluxo antigo: uma conta gratuita,
    -- vazia e explicitamente vinculada pelo dono passa a ser inquilino.
    delete from public.assinaturas where user_id=v_auth_user;
    delete from public.proprietarios where user_id=v_auth_user;
  end if;
  if exists(select 1 from public.convites_proprietario where lower(email)=v_email and status in ('aguardando_pagamento','pendente')) then
    raise exception 'Este e-mail esta reservado para uma conta de proprietario.';
  end if;
  if exists(select 1 from public.convites_colaborador where lower(email)=v_email and status='pendente')
     or (v_auth_user is not null and exists(select 1 from public.acessos_colaborador where user_id=v_auth_user and ativo)) then
    raise exception 'Este e-mail esta reservado para um funcionario.';
  end if;
  insert into public.convites_inquilino(proprietario_id,inquilino_id,email,updated_at)
  values(v_uid,p_inquilino_id,v_email,now()) on conflict(proprietario_id,inquilino_id)
  do update set email=excluded.email,updated_at=now(),aceito_em=null;
  if v_auth_user is not null then
    insert into public.acessos_inquilino(user_id,proprietario_id,inquilino_id,email,ativo,updated_at)
    values(v_auth_user,v_uid,p_inquilino_id,v_email,p_ativo,now()) on conflict(user_id)
    do update set proprietario_id=excluded.proprietario_id,inquilino_id=excluded.inquilino_id,email=excluded.email,ativo=excluded.ativo,updated_at=now();
    update auth.users set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)||
      jsonb_build_object('account_type','tenant') where id=v_auth_user;
    update public.convites_inquilino set aceito_em=now(),updated_at=now() where proprietario_id=v_uid and inquilino_id=p_inquilino_id;
  end if;
  return jsonb_build_object('email',v_email,'ativo',p_ativo,'aceito',v_auth_user is not null);
end $$;
revoke all on function public.configurar_acesso_inquilino(uuid,text,boolean) from public,anon;
grant execute on function public.configurar_acesso_inquilino(uuid,text,boolean) to authenticated;

create or replace function public.listar_acessos_inquilino()
returns table(inquilino_id uuid,email text,ativo boolean,aceito boolean)
language sql stable security definer set search_path=public
as $$
  select c.inquilino_id,c.email,coalesce(a.ativo,false),a.user_id is not null
  from public.convites_inquilino c
  left join public.acessos_inquilino a
    on a.proprietario_id=c.proprietario_id and a.inquilino_id=c.inquilino_id
  where c.proprietario_id=public.usuario_proprietario_id()
$$;
revoke all on function public.listar_acessos_inquilino() from public,anon;
grant execute on function public.listar_acessos_inquilino() to authenticated;

-- Um unico gatilho decide o perfil: venda > funcionario > inquilino > Gratuito.
create or replace function public.processar_novo_usuario_aluguel()
returns trigger language plpgsql security definer set search_path=public,auth
as $$ declare v_owner public.convites_proprietario%rowtype;v_staff public.convites_colaborador%rowtype;
  v_tenant public.convites_inquilino%rowtype;
  v_account_type text:=lower(coalesce(new.raw_user_meta_data->>'account_type','admin'));begin
  if new.raw_user_meta_data->>'terms_version'='1.0' then
    insert into public.aceites_termos(user_id,versao,aceito_em) values(new.id,'1.0',now())
    on conflict(user_id) do update set versao='1.0',aceito_em=now();
  end if;
  if lower(new.email)=any(array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]) then
    insert into public.administradores_plataforma(user_id)
    values(new.id)
    on conflict(user_id) do nothing;
    delete from public.acessos_inquilino where user_id=new.id;
    delete from public.acessos_colaborador where user_id=new.id;
    insert into public.proprietarios(user_id,nome,email,updated_at)
    values(
      new.id,
      coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''),'Conta Mestre'),
      lower(new.email),
      now()
    )
    on conflict(user_id) do update
    set email=excluded.email,updated_at=now();
    insert into public.assinaturas(user_id,plano,status,valor_pago,pagamento_confirmado_em,ativada_em,updated_at)
    values(new.id,'premium','ativa',0,now(),now(),now())
    on conflict(user_id) do update
    set plano='premium',status='ativa',updated_at=now();
    return new;
  end if;
  select * into v_owner from public.convites_proprietario
    where lower(email)=lower(new.email) and status='pendente' and expira_em>=now()
      and pagamento_status in ('confirmado','gratuito') order by created_at desc limit 1;
  if found then
    perform public.ativar_convite_proprietario(v_owner.id,new.id);
    return new;
  end if;
  select * into v_staff from public.convites_colaborador
    where lower(email)=lower(new.email) and status='pendente' and expira_em>=now()
    order by updated_at desc limit 1;
  if found then
    insert into public.acessos_colaborador(user_id,proprietario_id,nome,email,ativo)
    values(new.id,v_staff.proprietario_id,v_staff.nome,lower(new.email),true)
    on conflict(user_id) do update set proprietario_id=excluded.proprietario_id,nome=excluded.nome,
      email=excluded.email,ativo=true,updated_at=now();
    update public.convites_colaborador set status='aceito',aceito_em=now(),updated_at=now() where id=v_staff.id;
    return new;
  end if;
  select * into v_tenant from public.convites_inquilino where lower(email)=lower(new.email) order by updated_at desc limit 1;
  if found then
    insert into public.acessos_inquilino(user_id,proprietario_id,inquilino_id,email,ativo)
    values(new.id,v_tenant.proprietario_id,v_tenant.inquilino_id,lower(new.email),true)
    on conflict(user_id) do update set proprietario_id=excluded.proprietario_id,inquilino_id=excluded.inquilino_id,email=excluded.email,ativo=true,updated_at=now();
    update public.convites_inquilino set aceito_em=now(),updated_at=now() where id=v_tenant.id;
    return new;
  end if;
  -- Inquilino sem vinculo pronto fica aguardando o administrador, sem plano
  -- Gratuito e sem receber um perfil de proprietario.
  if v_account_type='tenant' then return new; end if;
  insert into public.proprietarios(user_id,nome,email,updated_at)
  values(new.id,coalesce(new.raw_user_meta_data->>'name','Novo proprietario'),lower(new.email),now());
  insert into public.assinaturas(user_id,plano,status,valor_pago,ativada_em)
  values(new.id,'gratuito','ativa',0,now());
  return new;
end $$;

drop trigger if exists on_auth_user_created_portal on auth.users;
drop trigger if exists on_auth_user_created_comercial on auth.users;
drop trigger if exists on_auth_user_created_aluguel on auth.users;
create trigger on_auth_user_created_aluguel after insert on auth.users
for each row execute function public.processar_novo_usuario_aluguel();

-- Mantem o e-mail comercial sincronizado quando o proprio usuario o altera.
create or replace function public.sincronizar_email_aluguel()
returns trigger language plpgsql security definer set search_path=public
as $$ begin
  if new.email is distinct from old.email then
    update public.proprietarios set email=lower(new.email),updated_at=now() where user_id=new.id;
    update public.acessos_inquilino set email=lower(new.email),updated_at=now() where user_id=new.id;
    update public.acessos_colaborador set email=lower(new.email),updated_at=now() where user_id=new.id;
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_email_updated_aluguel on auth.users;
create trigger on_auth_user_email_updated_aluguel after update of email on auth.users
for each row execute function public.sincronizar_email_aluguel();

-- Restauracao atomica v6: inclui fotos, documentos, temas e onboarding.
create or replace function public.importar_backup_atomico_v6(p_payload jsonb,p_substituir boolean default false)
returns void language plpgsql security invoker set search_path=public
as $$ declare v_uid uuid:=public.usuario_proprietario_id();begin
  if v_uid is null then raise exception 'Usuario nao autenticado.'; end if;
  if not public.e_acesso_operacional(v_uid) then raise exception 'Acesso comercial inativo ou termos pendentes.'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Backup invalido.'; end if;
  if jsonb_array_length(coalesce(p_payload->'houses','[]'))>public.limite_casas_plano(coalesce((select plano from public.assinaturas where user_id=v_uid),'gratuito'))
    or jsonb_array_length(coalesce(p_payload->'tenants','[]'))>2000
    or jsonb_array_length(coalesce(p_payload->'interests','[]'))>5000
    or jsonb_array_length(coalesce(p_payload->'contracts','[]'))>5000
    or jsonb_array_length(coalesce(p_payload->'payments','[]'))>50000
    or jsonb_array_length(coalesce(p_payload->'documents','[]'))>5000 then raise exception 'Backup acima do limite do plano.'; end if;
  if p_substituir then
    delete from public.fotos where user_id=v_uid;delete from public.pagamentos where user_id=v_uid;
    delete from public.energia where user_id=v_uid;delete from public.despesas where user_id=v_uid;
    delete from public.historico_status where user_id=v_uid;delete from public.aluguel_historico where user_id=v_uid;
    delete from public.documentos where user_id=v_uid;delete from public.contratos where user_id=v_uid;
    delete from public.eventos where user_id=v_uid;delete from public.interessados where user_id=v_uid;
    delete from public.imoveis where user_id=v_uid;delete from public.inquilinos where user_id=v_uid;
  end if;
  insert into public.inquilinos(id,user_id,nome,telefone,email,documento,emergencia_nome)
    select x.id,v_uid,x.nome,coalesce(x.telefone,''),coalesce(x.email,''),coalesce(x.documento,''),coalesce(x.emergencia_nome,'')
    from jsonb_to_recordset(coalesce(p_payload->'tenants','[]')) x(id uuid,nome text,telefone text,email text,documento text,emergencia_nome text);
  insert into public.imoveis(id,user_id,nome,endereco,status,aluguel_valor,dia_vencimento,ultima_vistoria,tenant_id,
    contrato_inicio,contrato_fim,quartos,banheiros,cozinha,sala,garagem,quintal,area_servico,energia_ativa,energia_dia_vencimento,
    publicado,descricao_publica)
    select x.id,v_uid,x.nome,coalesce(x.endereco,''),x.status,x.aluguel_valor,x.dia_vencimento,x.ultima_vistoria,x.tenant_id,
      x.contrato_inicio,x.contrato_fim,coalesce(x.quartos,0),coalesce(x.banheiros,0),coalesce(x.cozinha,false),coalesce(x.sala,false),
      coalesce(x.garagem,false),coalesce(x.quintal,false),coalesce(x.area_servico,false),coalesce(x.energia_ativa,true),coalesce(x.energia_dia_vencimento,5),
      coalesce(x.publicado,false),coalesce(x.descricao_publica,'')
    from jsonb_to_recordset(coalesce(p_payload->'houses','[]')) x(id uuid,nome text,endereco text,status text,aluguel_valor numeric,
      dia_vencimento int,ultima_vistoria date,tenant_id uuid,contrato_inicio date,contrato_fim date,quartos int,banheiros int,
       cozinha boolean,sala boolean,garagem boolean,quintal boolean,area_servico boolean,energia_ativa boolean,energia_dia_vencimento int,
       publicado boolean,descricao_publica text);
  insert into public.contratos(id,user_id,imovel_id,tenant_id,inicio,fim,valor,ativo,dia_vencimento,modalidade_vencimento,
    proporcional_dias,proporcional_valor,proporcional_pago,proporcional_data_pagamento)
    select x.id,v_uid,x.imovel_id,x.tenant_id,x.inicio,x.fim,x.valor,x.ativo,x.dia_vencimento,x.modalidade_vencimento,
      x.proporcional_dias,x.proporcional_valor,x.proporcional_pago,x.proporcional_data_pagamento
    from jsonb_to_recordset(coalesce(p_payload->'contracts','[]')) x(id uuid,imovel_id uuid,tenant_id uuid,inicio date,fim date,
      valor numeric,ativo boolean,dia_vencimento int,modalidade_vencimento text,proporcional_dias int,proporcional_valor numeric,
      proporcional_pago boolean,proporcional_data_pagamento date);
  insert into public.pagamentos(user_id,imovel_id,contrato_id,mes,valor_pago,data_pagamento)
    select v_uid,x.imovel_id,x.contrato_id,x.mes,x.valor_pago,x.data_pagamento
    from jsonb_to_recordset(coalesce(p_payload->'payments','[]')) x(imovel_id uuid,contrato_id uuid,mes text,valor_pago numeric,data_pagamento date);
  insert into public.energia(user_id,imovel_id,contrato_id,mes,valor,kwh,leitura_anterior,leitura_atual,tarifa_kwh,acrescimos,
    descontos,ajuste_descricao,valor_calculado,valor_manual,vencimento,pago,data_pagamento)
    select v_uid,x.imovel_id,x.contrato_id,x.mes,x.valor,x.kwh,coalesce(x.leitura_anterior,0),coalesce(x.leitura_atual,0),
      coalesce(x.tarifa_kwh,0),coalesce(x.acrescimos,0),coalesce(x.descontos,0),coalesce(x.ajuste_descricao,''),
      coalesce(x.valor_calculado,x.valor),coalesce(x.valor_manual,true),x.vencimento,x.pago,x.data_pagamento
    from jsonb_to_recordset(coalesce(p_payload->'energy','[]')) x(imovel_id uuid,contrato_id uuid,mes text,valor numeric,kwh numeric,
      leitura_anterior numeric,leitura_atual numeric,tarifa_kwh numeric,acrescimos numeric,descontos numeric,ajuste_descricao text,
      valor_calculado numeric,valor_manual boolean,vencimento date,pago boolean,data_pagamento date);
  insert into public.despesas(user_id,imovel_id,descricao,categoria,valor,data,prestador,status)
    select v_uid,x.imovel_id,x.descricao,x.categoria,x.valor,x.data,coalesce(x.prestador,''),x.status
    from jsonb_to_recordset(coalesce(p_payload->'expenses','[]')) x(imovel_id uuid,descricao text,categoria text,valor numeric,data date,prestador text,status text);
  insert into public.historico_status(user_id,imovel_id,data,status,tenant_id)
    select v_uid,x.imovel_id,x.data,x.status,x.tenant_id from jsonb_to_recordset(coalesce(p_payload->'history','[]')) x(imovel_id uuid,data date,status text,tenant_id uuid);
  insert into public.aluguel_historico(user_id,imovel_id,valor,data_inicio)
    select v_uid,x.imovel_id,x.valor,x.data_inicio from jsonb_to_recordset(coalesce(p_payload->'adjustments','[]')) x(imovel_id uuid,valor numeric,data_inicio date);
  insert into public.fotos(user_id,imovel_id,dados,ordem,nome,mime,tamanho)
    select v_uid,x.imovel_id,x.dados,x.ordem,coalesce(x.nome,'foto.jpg'),coalesce(x.mime,'image/jpeg'),coalesce(x.tamanho,0)
    from jsonb_to_recordset(coalesce(p_payload->'photos','[]')) x(imovel_id uuid,dados text,ordem int,nome text,mime text,tamanho bigint);
  insert into public.documentos(user_id,imovel_id,inquilino_id,tipo,nome,mime,dados,tamanho,visivel_inquilino)
    select v_uid,x.imovel_id,x.inquilino_id,coalesce(x.tipo,'outro'),x.nome,coalesce(x.mime,''),x.dados,coalesce(x.tamanho,0),coalesce(x.visivel_inquilino,false)
    from jsonb_to_recordset(coalesce(p_payload->'documents','[]')) x(imovel_id uuid,inquilino_id uuid,tipo text,nome text,mime text,dados text,tamanho bigint,visivel_inquilino boolean);
  insert into public.eventos(user_id,data,texto) select v_uid,x.data,coalesce(x.texto,'')
    from jsonb_to_recordset(coalesce(p_payload->'events','[]')) x(data date,texto text);
  insert into public.interessados(id,user_id,nome,telefone,valor_maximo,quartos_min,banheiros_min,precisa_garagem,
    precisa_quintal,precisa_cozinha,precisa_sala,precisa_area_servico,observacoes,status,inquilino_id)
    select x.id,v_uid,x.nome,coalesce(x.telefone,''),coalesce(x.valor_maximo,0),coalesce(x.quartos_min,0),coalesce(x.banheiros_min,0),
      coalesce(x.precisa_garagem,false),coalesce(x.precisa_quintal,false),coalesce(x.precisa_cozinha,false),coalesce(x.precisa_sala,false),
      coalesce(x.precisa_area_servico,false),coalesce(x.observacoes,''),coalesce(x.status,'novo'),x.inquilino_id
    from jsonb_to_recordset(coalesce(p_payload->'interests','[]')) x(id uuid,nome text,telefone text,valor_maximo numeric,quartos_min int,
      banheiros_min int,precisa_garagem boolean,precisa_quintal boolean,precisa_cozinha boolean,precisa_sala boolean,
      precisa_area_servico boolean,observacoes text,status text,inquilino_id uuid);
  if jsonb_typeof(p_payload->'config')='object' then
    insert into public.configuracoes(user_id,locador_nome,locador_documento,energia_ativa,tema,onboarding_concluido,ultimo_backup_externo,
      pix_chave,pix_nome,pix_cidade,updated_at)
    values(v_uid,coalesce(p_payload#>>'{config,locador_nome}',''),coalesce(p_payload#>>'{config,locador_documento}',''),
      coalesce((p_payload#>>'{config,energia_ativa}')::boolean,true),case when p_payload#>>'{config,tema}' in ('original','aurora','oceano','citrico') then p_payload#>>'{config,tema}' else 'original' end,
      coalesce((p_payload#>>'{config,onboarding_concluido}')::boolean,false),nullif(p_payload#>>'{config,ultimo_backup_externo}','')::timestamptz,
      coalesce(p_payload#>>'{config,pix_chave}',''),coalesce(p_payload#>>'{config,pix_nome}',''),coalesce(p_payload#>>'{config,pix_cidade}',''),now())
    on conflict(user_id) do update set locador_nome=excluded.locador_nome,locador_documento=excluded.locador_documento,
      energia_ativa=excluded.energia_ativa,tema=excluded.tema,onboarding_concluido=excluded.onboarding_concluido,
      ultimo_backup_externo=excluded.ultimo_backup_externo,pix_chave=excluded.pix_chave,pix_nome=excluded.pix_nome,
      pix_cidade=excluded.pix_cidade,updated_at=now();
  end if;
end $$;
revoke all on function public.importar_backup_atomico_v6(jsonb,boolean) from public,anon;
grant execute on function public.importar_backup_atomico_v6(jsonb,boolean) to authenticated;

-- Fim da atualizacao comercial 1.0.
commit;
