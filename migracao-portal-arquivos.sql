-- ============================================================
-- EVOLUCAO: portal do inquilino + arquivos privados
-- Pode ser executada uma vez sobre o banco de producao atual.
-- ============================================================

create extension if not exists "pgcrypto";

-- A conta administrativa e explicitamente autorizada. Contas novas criadas
-- pela tela publica so entram no portal quando o e-mail foi liberado antes.
create table if not exists public.proprietarios (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  nome        text default '',
  created_at  timestamptz default now()
);

insert into public.proprietarios(user_id,nome)
select id, coalesce(raw_user_meta_data->>'name','Anderton')
from auth.users
where lower(email)=lower('andertonaluguel@gmail.com')
on conflict (user_id) do nothing;

create table if not exists public.convites_inquilino (
  id                uuid primary key default gen_random_uuid(),
  proprietario_id   uuid not null references auth.users(id) on delete cascade,
  inquilino_id      uuid not null references public.inquilinos(id) on delete cascade,
  email             text not null,
  aceito_em         timestamptz,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  unique (proprietario_id, inquilino_id)
);

create table if not exists public.acessos_inquilino (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  proprietario_id    uuid not null references auth.users(id) on delete cascade,
  inquilino_id       uuid not null references public.inquilinos(id) on delete cascade,
  email              text not null,
  ativo              boolean not null default true,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  unique (proprietario_id, inquilino_id)
);

create index if not exists idx_convites_email on public.convites_inquilino(lower(email));
create index if not exists idx_acessos_owner on public.acessos_inquilino(proprietario_id);
create index if not exists idx_acessos_tenant on public.acessos_inquilino(inquilino_id);

alter table public.proprietarios enable row level security;
alter table public.convites_inquilino enable row level security;
alter table public.acessos_inquilino enable row level security;

drop policy if exists owner_profile on public.proprietarios;
create policy owner_profile on public.proprietarios for select to authenticated
  using (user_id=auth.uid());

drop policy if exists owner_invites on public.convites_inquilino;
create policy owner_invites on public.convites_inquilino for all to authenticated
  using (proprietario_id=auth.uid()) with check (proprietario_id=auth.uid());

drop policy if exists owner_tenant_access on public.acessos_inquilino;
create policy owner_tenant_access on public.acessos_inquilino for all to authenticated
  using (proprietario_id=auth.uid()) with check (proprietario_id=auth.uid());
drop policy if exists tenant_own_access on public.acessos_inquilino;
create policy tenant_own_access on public.acessos_inquilino for select to authenticated
  using (user_id=auth.uid() and ativo);

grant select on public.proprietarios to authenticated;
grant select,insert,update,delete on public.convites_inquilino to authenticated;
grant select,insert,update,delete on public.acessos_inquilino to authenticated;

-- Funcoes pequenas, com search_path fixo, evitam recursao nas politicas RLS.
create or replace function public.portal_owner_id()
returns uuid language sql stable security definer set search_path=public
as $$
  select proprietario_id from public.acessos_inquilino
  where user_id=auth.uid() and ativo limit 1
$$;

create or replace function public.portal_inquilino_id()
returns uuid language sql stable security definer set search_path=public
as $$
  select inquilino_id from public.acessos_inquilino
  where user_id=auth.uid() and ativo limit 1
$$;

revoke all on function public.portal_owner_id() from public, anon;
revoke all on function public.portal_inquilino_id() from public, anon;
grant execute on function public.portal_owner_id() to authenticated;
grant execute on function public.portal_inquilino_id() to authenticated;

-- Leitura estritamente limitada ao cadastro e ao imovel do inquilino.
drop policy if exists tenant_read on public.inquilinos;
create policy tenant_read on public.inquilinos for select to authenticated
  using (user_id=public.portal_owner_id() and id=public.portal_inquilino_id());

drop policy if exists tenant_read on public.imoveis;
create policy tenant_read on public.imoveis for select to authenticated
  using (user_id=public.portal_owner_id() and tenant_id=public.portal_inquilino_id());

drop policy if exists tenant_read on public.pagamentos;
create policy tenant_read on public.pagamentos for select to authenticated
  using (user_id=public.portal_owner_id() and exists (
    select 1 from public.imoveis i
    where i.id=pagamentos.imovel_id and i.tenant_id=public.portal_inquilino_id()
  ));

drop policy if exists tenant_read on public.energia;
create policy tenant_read on public.energia for select to authenticated
  using (user_id=public.portal_owner_id() and exists (
    select 1 from public.imoveis i
    where i.id=energia.imovel_id and i.tenant_id=public.portal_inquilino_id()
  ));

drop policy if exists tenant_read on public.configuracoes;
create policy tenant_read on public.configuracoes for select to authenticated
  using (user_id=public.portal_owner_id());

-- Metadados de arquivos. O conteudo fica em um bucket privado.
alter table public.fotos add column if not exists storage_path text;
alter table public.fotos add column if not exists nome text default '';
alter table public.fotos add column if not exists mime text default '';
alter table public.fotos add column if not exists tamanho bigint default 0;
alter table public.fotos alter column dados drop not null;

alter table public.documentos add column if not exists storage_path text;
alter table public.documentos add column if not exists tamanho bigint default 0;
alter table public.documentos add column if not exists visivel_inquilino boolean not null default false;
alter table public.documentos alter column dados drop not null;

create index if not exists idx_docs_storage on public.documentos(storage_path);
create index if not exists idx_fotos_storage on public.fotos(storage_path);

drop policy if exists tenant_read on public.documentos;
create policy tenant_read on public.documentos for select to authenticated
  using (
    user_id=public.portal_owner_id()
    and visivel_inquilino
    and inquilino_id=public.portal_inquilino_id()
    and exists (
      select 1 from public.imoveis i
      where i.id=documentos.imovel_id and i.tenant_id=public.portal_inquilino_id()
    )
  );

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'imoveis-arquivos','imoveis-arquivos',false,15728640,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists owner_files_select on storage.objects;
drop policy if exists owner_files_insert on storage.objects;
drop policy if exists owner_files_update on storage.objects;
drop policy if exists owner_files_delete on storage.objects;
create policy owner_files_select on storage.objects for select to authenticated
  using (bucket_id='imoveis-arquivos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy owner_files_insert on storage.objects for insert to authenticated
  with check (bucket_id='imoveis-arquivos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy owner_files_update on storage.objects for update to authenticated
  using (bucket_id='imoveis-arquivos' and (storage.foldername(name))[1]=auth.uid()::text)
  with check (bucket_id='imoveis-arquivos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy owner_files_delete on storage.objects for delete to authenticated
  using (bucket_id='imoveis-arquivos' and (storage.foldername(name))[1]=auth.uid()::text);

create or replace function public.portal_pode_ler_arquivo(p_path text)
returns boolean language sql stable security definer set search_path=public
as $$
  select exists (
    select 1 from public.documentos d
    join public.imoveis i on i.id=d.imovel_id
    where d.storage_path=p_path
      and d.visivel_inquilino
      and d.user_id=public.portal_owner_id()
      and d.inquilino_id=public.portal_inquilino_id()
      and i.tenant_id=public.portal_inquilino_id()
  )
$$;
revoke all on function public.portal_pode_ler_arquivo(text) from public, anon;
grant execute on function public.portal_pode_ler_arquivo(text) to authenticated;

drop policy if exists tenant_files_select on storage.objects;
create policy tenant_files_select on storage.objects for select to authenticated
  using (bucket_id='imoveis-arquivos' and public.portal_pode_ler_arquivo(name));

-- O proprietario libera o e-mail. Se a conta ja existir, o acesso e ligado
-- na hora; caso contrario o gatilho conclui o vinculo no cadastro.
create or replace function public.configurar_acesso_inquilino(
  p_inquilino_id uuid,
  p_email text,
  p_ativo boolean default true
)
returns jsonb language plpgsql security definer set search_path=public,auth
as $$
declare
  v_uid uuid := auth.uid();
  v_auth_user uuid;
  v_email text := lower(trim(coalesce(p_email,'')));
begin
  if v_uid is null or not exists(select 1 from public.proprietarios where user_id=v_uid) then
    raise exception 'Conta sem permissao de proprietario.';
  end if;
  if v_email='' or position('@' in v_email)<2 then raise exception 'E-mail invalido.'; end if;
  if not exists(select 1 from public.inquilinos where id=p_inquilino_id and user_id=v_uid) then
    raise exception 'Inquilino nao encontrado.';
  end if;

  insert into public.convites_inquilino(proprietario_id,inquilino_id,email,updated_at)
  values(v_uid,p_inquilino_id,v_email,now())
  on conflict(proprietario_id,inquilino_id) do update
    set email=excluded.email, updated_at=now(), aceito_em=null;

  select id into v_auth_user from auth.users where lower(email)=v_email order by created_at limit 1;
  if v_auth_user is not null then
    insert into public.acessos_inquilino(user_id,proprietario_id,inquilino_id,email,ativo,updated_at)
    values(v_auth_user,v_uid,p_inquilino_id,v_email,p_ativo,now())
    on conflict(user_id) do update set
      proprietario_id=excluded.proprietario_id,
      inquilino_id=excluded.inquilino_id,
      email=excluded.email,
      ativo=excluded.ativo,
      updated_at=now();
    update public.convites_inquilino set aceito_em=now() where proprietario_id=v_uid and inquilino_id=p_inquilino_id;
  end if;
  return jsonb_build_object('vinculado',v_auth_user is not null,'email',v_email);
end;
$$;

revoke all on function public.configurar_acesso_inquilino(uuid,text,boolean) from public, anon;
grant execute on function public.configurar_acesso_inquilino(uuid,text,boolean) to authenticated;

create or replace function public.processar_novo_usuario_portal()
returns trigger language plpgsql security definer set search_path=public,auth
as $$
declare v_convite public.convites_inquilino%rowtype;
begin
  select * into v_convite from public.convites_inquilino
  where lower(email)=lower(new.email) order by updated_at desc limit 1;
  if found then
    insert into public.acessos_inquilino(user_id,proprietario_id,inquilino_id,email,ativo)
    values(new.id,v_convite.proprietario_id,v_convite.inquilino_id,lower(new.email),true)
    on conflict(user_id) do update set
      proprietario_id=excluded.proprietario_id,
      inquilino_id=excluded.inquilino_id,
      email=excluded.email,
      ativo=true,
      updated_at=now();
    update public.convites_inquilino set aceito_em=now(),updated_at=now() where id=v_convite.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_portal on auth.users;
create trigger on_auth_user_created_portal
after insert on auth.users for each row execute function public.processar_novo_usuario_portal();

-- Estado do acesso para a tela do proprietario.
create or replace function public.listar_acessos_inquilino()
returns table(inquilino_id uuid,email text,ativo boolean,aceito boolean)
language sql stable security definer set search_path=public
as $$
  select c.inquilino_id,c.email,coalesce(a.ativo,false),a.user_id is not null
  from public.convites_inquilino c
  left join public.acessos_inquilino a
    on a.proprietario_id=c.proprietario_id and a.inquilino_id=c.inquilino_id
  where c.proprietario_id=auth.uid()
$$;
revoke all on function public.listar_acessos_inquilino() from public, anon;
grant execute on function public.listar_acessos_inquilino() to authenticated;

