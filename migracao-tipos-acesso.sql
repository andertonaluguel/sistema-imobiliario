-- ============================================================
-- TIPOS DE ACESSO: MESTRE, ADMINISTRADOR E INQUILINO
-- Execute depois de migracao-versao-comercial-v1.sql.
-- Pode ser executada novamente com seguranca.
-- ============================================================

begin;

-- As areas Comercial e Minha Casa pertencem somente as duas contas Mestre.
insert into public.administradores_plataforma(user_id)
select id
from auth.users
where lower(email)=any(array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[])
on conflict(user_id) do nothing;

-- A tabela antiga pode conter administradores adicionados pelo fluxo comercial.
-- Eles continuam sendo contas administrativas comuns, mas nao sao Mestre.
delete from public.administradores_plataforma a
where not exists(
  select 1
  from auth.users u
  where u.id=a.user_id
    and lower(u.email)=any(array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[])
);

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

revoke all on function public.e_administrador_plataforma(uuid) from public,anon;
grant execute on function public.e_administrador_plataforma(uuid) to authenticated;

-- As duas contas Mestre operam a mesma base de aluguel do Mestre principal.
create or replace function public.usuario_proprietario_id(
  p_user_id uuid default auth.uid()
)
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
    when exists(
      select 1 from public.proprietarios p where p.user_id=p_user_id
    ) then p_user_id
    else (
      select a.proprietario_id
      from public.acessos_colaborador a
      where a.user_id=p_user_id and a.ativo
      limit 1
    )
  end
$$;

revoke all on function public.usuario_proprietario_id(uuid) from public,anon;
grant execute on function public.usuario_proprietario_id(uuid) to authenticated;

-- Mestre nao depende de assinatura nem de aceite antigo para operar.
create or replace function public.e_acesso_operacional(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public
as $$
  select public.e_administrador_plataforma(p_user_id) or (
    public.e_acesso_comercial_ativo(p_user_id)
    and exists(
      select 1 from public.aceites_termos t
      where t.user_id=p_user_id and t.versao='1.0'
    )
  )
$$;

revoke all on function public.e_acesso_operacional(uuid) from public,anon;
grant execute on function public.e_acesso_operacional(uuid) to authenticated;

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

-- Repara somente contas gratuitas e vazias que o fluxo antigo classificou
-- como proprietario, apesar de terem sido criadas/vinculadas como inquilino.
create temporary table tmp_inquilinos_para_reparar on commit drop as
select distinct p.user_id
from public.proprietarios p
join auth.users u on u.id=p.user_id
left join public.assinaturas s on s.user_id=p.user_id
where not public.e_administrador_plataforma(p.user_id)
  and not exists(select 1 from public.imoveis i where i.user_id=p.user_id)
  and not exists(select 1 from public.inquilinos i where i.user_id=p.user_id)
  and not exists(select 1 from public.convites_colaborador c where c.proprietario_id=p.user_id)
  and not exists(select 1 from public.acessos_colaborador a where a.proprietario_id=p.user_id)
  and coalesce(s.plano,'gratuito')='gratuito'
  and coalesce(s.valor_pago,0)=0
  and not exists(
    select 1 from public.convites_proprietario c
    where c.aceito_por=p.user_id and c.status='aceito'
  )
  and (
    lower(coalesce(u.raw_user_meta_data->>'account_type',''))='tenant'
    or exists(
      select 1
      from public.acessos_inquilino a
      join public.convites_inquilino c
        on c.proprietario_id=a.proprietario_id
       and c.inquilino_id=a.inquilino_id
      where a.user_id=p.user_id and c.aceito_em is not null
    )
  );

delete from public.assinaturas s
using tmp_inquilinos_para_reparar r
where s.user_id=r.user_id;

delete from public.proprietarios p
using tmp_inquilinos_para_reparar r
where p.user_id=r.user_id;

update public.acessos_inquilino a
set ativo=true,updated_at=now()
from tmp_inquilinos_para_reparar r
where a.user_id=r.user_id;

update auth.users u
set raw_user_meta_data=coalesce(u.raw_user_meta_data,'{}'::jsonb)||
  jsonb_build_object('account_type','tenant')
where exists(select 1 from tmp_inquilinos_para_reparar r where r.user_id=u.id)
   or (
     exists(select 1 from public.acessos_inquilino a where a.user_id=u.id and a.ativo)
     and not exists(select 1 from public.proprietarios p where p.user_id=u.id)
   );

update auth.users
set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)||
  jsonb_build_object('account_type','admin')
where lower(email)=any(array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]);

-- Remove classificacoes conflitantes e garante um perfil operacional para
-- Mestre 2 mesmo quando a conta ja existia antes desta migracao.
delete from public.acessos_inquilino a
using auth.users u
where u.id=a.user_id
  and lower(u.email)=any(array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]);

delete from public.acessos_colaborador a
using auth.users u
where u.id=a.user_id
  and lower(u.email)=any(array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]);

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

-- Ao vincular um e-mail a um inquilino, uma conta gratuita vazia criada pelo
-- fluxo antigo pode ser convertida. Contas em uso ou pagas nunca sao alteradas.
create or replace function public.configurar_acesso_inquilino(p_inquilino_id uuid,p_email text,p_ativo boolean default true)
returns jsonb language plpgsql security definer set search_path=public,auth
as $$
declare
  v_uid uuid:=public.usuario_proprietario_id();
  v_auth_user uuid;
  v_email text:=lower(trim(coalesce(p_email,'')));
begin
  if v_uid is null or not public.e_acesso_operacional(v_uid) then
    raise exception 'Conta sem permissao de proprietario.';
  end if;
  if v_email='' or position('@' in v_email)<2 then raise exception 'E-mail invalido.'; end if;
  if v_email=any(
    array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]
  ) then
    raise exception 'Este e-mail e reservado para uma conta Mestre.';
  end if;
  if not exists(select 1 from public.inquilinos where id=p_inquilino_id and user_id=v_uid) then
    raise exception 'Inquilino nao encontrado.';
  end if;

  select id into v_auth_user
  from auth.users where lower(email)=v_email order by created_at limit 1;

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
    delete from public.assinaturas where user_id=v_auth_user;
    delete from public.proprietarios where user_id=v_auth_user;
  end if;

  if exists(
    select 1 from public.convites_proprietario
    where lower(email)=v_email and status in ('aguardando_pagamento','pendente')
  ) then
    raise exception 'Este e-mail esta reservado para uma conta de administrador.';
  end if;
  if exists(select 1 from public.convites_colaborador where lower(email)=v_email and status='pendente')
     or (
       v_auth_user is not null
       and exists(select 1 from public.acessos_colaborador where user_id=v_auth_user and ativo)
     ) then
    raise exception 'Este e-mail esta reservado para um funcionario.';
  end if;

  insert into public.convites_inquilino(proprietario_id,inquilino_id,email,updated_at)
  values(v_uid,p_inquilino_id,v_email,now())
  on conflict(proprietario_id,inquilino_id)
  do update set email=excluded.email,updated_at=now(),aceito_em=null;

  if v_auth_user is not null then
    insert into public.acessos_inquilino(user_id,proprietario_id,inquilino_id,email,ativo,updated_at)
    values(v_auth_user,v_uid,p_inquilino_id,v_email,p_ativo,now())
    on conflict(user_id)
    do update set proprietario_id=excluded.proprietario_id,inquilino_id=excluded.inquilino_id,
      email=excluded.email,ativo=excluded.ativo,updated_at=now();
    update auth.users
    set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)||
      jsonb_build_object('account_type','tenant')
    where id=v_auth_user;
    update public.convites_inquilino
    set aceito_em=now(),updated_at=now()
    where proprietario_id=v_uid and inquilino_id=p_inquilino_id;
  end if;

  return jsonb_build_object('email',v_email,'ativo',p_ativo,'aceito',v_auth_user is not null);
end
$$;

revoke all on function public.configurar_acesso_inquilino(uuid,text,boolean) from public,anon;
grant execute on function public.configurar_acesso_inquilino(uuid,text,boolean) to authenticated;

-- Um unico gatilho decide o perfil: venda > funcionario > inquilino >
-- aguardando vinculo de inquilino > administrador gratuito.
create or replace function public.processar_novo_usuario_aluguel()
returns trigger language plpgsql security definer set search_path=public,auth
as $$
declare
  v_owner public.convites_proprietario%rowtype;
  v_staff public.convites_colaborador%rowtype;
  v_tenant public.convites_inquilino%rowtype;
  v_account_type text:=lower(coalesce(new.raw_user_meta_data->>'account_type','admin'));
begin
  if new.raw_user_meta_data->>'terms_version'='1.0' then
    insert into public.aceites_termos(user_id,versao,aceito_em)
    values(new.id,'1.0',now())
      on conflict(user_id) do update set versao='1.0',aceito_em=now();
  end if;

  -- As duas identidades Mestre sempre prevalecem sobre convite ou perfil.
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

  select * into v_owner
  from public.convites_proprietario
  where lower(email)=lower(new.email)
    and status='pendente'
    and expira_em>=now()
    and pagamento_status in ('confirmado','gratuito')
  order by created_at desc limit 1;
  if found then
    perform public.ativar_convite_proprietario(v_owner.id,new.id);
    return new;
  end if;

  select * into v_staff
  from public.convites_colaborador
  where lower(email)=lower(new.email) and status='pendente' and expira_em>=now()
  order by updated_at desc limit 1;
  if found then
    insert into public.acessos_colaborador(user_id,proprietario_id,nome,email,ativo)
    values(new.id,v_staff.proprietario_id,v_staff.nome,lower(new.email),true)
    on conflict(user_id) do update set proprietario_id=excluded.proprietario_id,
      nome=excluded.nome,email=excluded.email,ativo=true,updated_at=now();
    update public.convites_colaborador
    set status='aceito',aceito_em=now(),updated_at=now()
    where id=v_staff.id;
    return new;
  end if;

  select * into v_tenant
  from public.convites_inquilino
  where lower(email)=lower(new.email)
  order by updated_at desc limit 1;
  if found then
    insert into public.acessos_inquilino(user_id,proprietario_id,inquilino_id,email,ativo)
    values(new.id,v_tenant.proprietario_id,v_tenant.inquilino_id,lower(new.email),true)
    on conflict(user_id) do update set proprietario_id=excluded.proprietario_id,
      inquilino_id=excluded.inquilino_id,email=excluded.email,ativo=true,updated_at=now();
    update public.convites_inquilino
    set aceito_em=now(),updated_at=now()
    where id=v_tenant.id;
    return new;
  end if;

  if v_account_type='tenant' then return new; end if;

  insert into public.proprietarios(user_id,nome,email,updated_at)
  values(new.id,coalesce(new.raw_user_meta_data->>'name','Novo proprietario'),lower(new.email),now());
  insert into public.assinaturas(user_id,plano,status,valor_pago,ativada_em)
  values(new.id,'gratuito','ativa',0,now());
  return new;
end
$$;

drop trigger if exists on_auth_user_created_portal on auth.users;
drop trigger if exists on_auth_user_created_comercial on auth.users;
drop trigger if exists on_auth_user_created_aluguel on auth.users;
create trigger on_auth_user_created_aluguel
after insert on auth.users
for each row execute function public.processar_novo_usuario_aluguel();

commit;
