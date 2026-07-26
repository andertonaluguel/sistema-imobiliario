-- ============================================================
-- MINHA CASA - GESTAO FINANCEIRA FAMILIAR
-- Execute depois de migracao-versao-comercial-v1.sql e
-- migracao-tipos-acesso.sql.
--
-- Caracteristicas:
--   * somente as duas contas Mestre possuem acesso real no banco;
--   * as duas contas compartilham a mesma familia;
--   * o modulo inicia zerado e so importa recebimentos posteriores
--     a sua ativacao;
--   * toda automacao cria uma sugestao "A confirmar";
--   * aceitar uma sugestao e criar o lancamento e uma operacao atomica;
--   * a migracao pode ser executada novamente com seguranca.
-- ============================================================

begin;

create extension if not exists "pgcrypto";

do $$
begin
  if to_regclass('public.administradores_plataforma') is null
     or to_regclass('public.proprietarios') is null
     or to_regclass('public.assinaturas') is null
     or to_regclass('public.pagamentos') is null
     or to_regclass('public.energia') is null then
    raise exception
      'Minha Casa requer schema.sql, migracao-versao-comercial-v1.sql e migracao-tipos-acesso.sql.';
  end if;
end
$$;

-- ------------------------------------------------------------
-- IDENTIDADES MESTRE
-- A autorizacao usa o e-mail confirmado em auth.users. Portanto,
-- Mestre 2 e reconhecido mesmo sem uma linha legada de administrador.
-- ------------------------------------------------------------

create or replace function public.e_mestre(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from auth.users u
    where u.id=p_user_id
      and u.email_confirmed_at is not null
      and lower(u.email)=any(
        array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]
      )
  )
$$;

create or replace function public.e_administrador_plataforma(
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select public.e_mestre(p_user_id)
$$;

create or replace function public.e_acesso_operacional(
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select public.e_mestre(p_user_id) or (
    public.e_acesso_comercial_ativo(p_user_id)
    and exists(
      select 1
      from public.aceites_termos t
      where t.user_id=p_user_id and t.versao='1.0'
    )
  )
$$;

revoke all on function public.e_mestre(uuid) from public,anon;
revoke all on function public.e_administrador_plataforma(uuid) from public,anon;
revoke all on function public.e_acesso_operacional(uuid) from public,anon;
grant execute on function public.e_mestre(uuid) to authenticated;
grant execute on function public.e_administrador_plataforma(uuid) to authenticated;
grant execute on function public.e_acesso_operacional(uuid) to authenticated;

-- As duas contas Mestre sempre atuam sobre o proprietario principal. Essa
-- regra tambem protege o acesso caso Mestre 2 ainda possua um perfil legado.
create or replace function public.usuario_proprietario_id(
  p_user_id uuid default auth.uid()
)
returns uuid
language sql
stable
security definer
set search_path=public
as $$
  select case
    when public.e_mestre(p_user_id) then coalesce(
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

insert into public.administradores_plataforma(user_id)
select u.id
from auth.users u
where lower(u.email)=any(
  array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]
)
on conflict(user_id) do nothing;

delete from public.administradores_plataforma a
where not exists(
  select 1
  from auth.users u
  where u.id=a.user_id
    and lower(u.email)=any(
      array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]
    )
);

delete from public.acessos_inquilino a
using auth.users u
where u.id=a.user_id
  and lower(u.email)=any(
    array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]
  );

delete from public.acessos_colaborador a
using auth.users u
where u.id=a.user_id
  and lower(u.email)=any(
    array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]
  );

insert into public.proprietarios(user_id,nome,email,updated_at)
select
  u.id,
  coalesce(nullif(trim(u.raw_user_meta_data->>'name'),''),'Conta Mestre'),
  lower(u.email),
  now()
from auth.users u
where lower(u.email)='andertonaluguel@gmail.com'
on conflict(user_id) do update
set email=excluded.email,updated_at=now();

insert into public.assinaturas(
  user_id,plano,status,valor_pago,pagamento_confirmado_em,ativada_em,updated_at
)
select u.id,'premium','ativa',0,now(),now(),now()
from auth.users u
where lower(u.email)='andertonaluguel@gmail.com'
on conflict(user_id) do update
set plano='premium',status='ativa',updated_at=now();

update auth.users
set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)||
  jsonb_build_object('account_type','admin')
where lower(email)=any(
  array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]
);

-- Detecta se um perfil de proprietario possui qualquer dado que precise ser
-- preservado. E usado somente para limpar o perfil Gratuito vazio criado pelo
-- fluxo antigo para Mestre 2.
create or replace function public.proprietario_tem_dados(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select
    exists(select 1 from public.imoveis x where x.user_id=p_user_id)
    or exists(select 1 from public.inquilinos x where x.user_id=p_user_id)
    or exists(select 1 from public.pagamentos x where x.user_id=p_user_id)
    or exists(select 1 from public.energia x where x.user_id=p_user_id)
    or exists(select 1 from public.despesas x where x.user_id=p_user_id)
    or exists(select 1 from public.historico_status x where x.user_id=p_user_id)
    or exists(select 1 from public.fotos x where x.user_id=p_user_id)
    or exists(select 1 from public.contratos x where x.user_id=p_user_id)
    or exists(select 1 from public.documentos x where x.user_id=p_user_id)
    or exists(select 1 from public.eventos x where x.user_id=p_user_id)
    or exists(select 1 from public.configuracoes x where x.user_id=p_user_id)
    or exists(select 1 from public.aluguel_historico x where x.user_id=p_user_id)
    or exists(select 1 from public.backups x where x.user_id=p_user_id)
    or exists(select 1 from public.interessados x where x.user_id=p_user_id)
    or exists(
      select 1 from public.convites_colaborador x
      where x.proprietario_id=p_user_id
    )
    or exists(
      select 1 from public.acessos_colaborador x
      where x.proprietario_id=p_user_id
    )
    or exists(
      select 1 from public.convites_inquilino x
      where x.proprietario_id=p_user_id
    )
    or exists(
      select 1 from public.acessos_inquilino x
      where x.proprietario_id=p_user_id
    )
    or exists(
      select 1 from public.assinaturas x
      where x.user_id=p_user_id and coalesce(x.valor_pago,0)>0
    )
$$;

revoke all on function public.proprietario_tem_dados(uuid)
  from public,anon,authenticated;

-- Remove somente o perfil vazio legado de Mestre 2. Se houver qualquer dado,
-- ele e preservado; usuario_proprietario_id ainda o direciona ao principal.
delete from public.assinaturas a
using auth.users u
where u.id=a.user_id
  and lower(u.email)='andertonunito@gmail.com'
  and not public.proprietario_tem_dados(u.id);

delete from public.proprietarios p
using auth.users u
where u.id=p.user_id
  and lower(u.email)='andertonunito@gmail.com'
  and not public.proprietario_tem_dados(u.id);

-- Reforco independente para uma das contas Mestre criada futuramente.
create or replace function public.garantir_conta_mestre()
returns trigger
language plpgsql
security definer
set search_path=public,auth
as $$
begin
  if lower(new.email)=any(
    array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]
  ) then
    insert into public.administradores_plataforma(user_id)
    values(new.id)
    on conflict(user_id) do nothing;

    delete from public.acessos_inquilino where user_id=new.id;

    if lower(new.email)='andertonaluguel@gmail.com' then
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

      insert into public.assinaturas(
        user_id,plano,status,valor_pago,pagamento_confirmado_em,ativada_em,updated_at
      )
      values(new.id,'premium','ativa',0,now(),now(),now())
      on conflict(user_id) do update
      set plano='premium',status='ativa',updated_at=now();
    else
      delete from public.assinaturas
      where user_id=new.id
        and not public.proprietario_tem_dados(new.id);
      delete from public.proprietarios
      where user_id=new.id
        and not public.proprietario_tem_dados(new.id);
    end if;

    delete from public.acessos_colaborador where user_id=new.id;

    if lower(coalesce(new.raw_user_meta_data->>'account_type',''))<>'admin' then
      update auth.users
      set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)||
        jsonb_build_object('account_type','admin')
      where id=new.id;
    end if;
  else
    delete from public.administradores_plataforma where user_id=new.id;
    if tg_op='UPDATE' then
      if lower(old.email)=any(
        array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]
      ) then
        delete from public.acessos_colaborador where user_id=new.id;
        delete from public.acessos_inquilino where user_id=new.id;
      end if;
    end if;
  end if;
  return new;
end
$$;

revoke all on function public.garantir_conta_mestre() from public,anon,authenticated;

drop trigger if exists zz_auth_user_master_minha_casa on auth.users;
create trigger zz_auth_user_master_minha_casa
after insert or update of email on auth.users
for each row execute function public.garantir_conta_mestre();

-- Os e-mails Mestre nunca podem ser reaproveitados como convite de
-- inquilino ou funcionario, mesmo antes de a conta de Auth existir.
delete from public.convites_inquilino
where lower(email)=any(
  array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]
);

update public.convites_colaborador
set status='cancelado',updated_at=now()
where lower(email)=any(
    array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]
  )
  and status='pendente';

create or replace function public.proteger_email_mestre_em_convite()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if lower(trim(coalesce(new.email,'')))=any(
    array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]
  ) then
    raise exception 'Este e-mail e reservado para uma conta Mestre.';
  end if;
  return new;
end
$$;

revoke all on function public.proteger_email_mestre_em_convite()
  from public,anon,authenticated;

drop trigger if exists proteger_mestre_convite_inquilino
  on public.convites_inquilino;
create trigger proteger_mestre_convite_inquilino
before insert or update of email on public.convites_inquilino
for each row execute function public.proteger_email_mestre_em_convite();

drop trigger if exists proteger_mestre_convite_colaborador
  on public.convites_colaborador;
create trigger proteger_mestre_convite_colaborador
before insert or update of email on public.convites_colaborador
for each row execute function public.proteger_email_mestre_em_convite();

-- ------------------------------------------------------------
-- FAMILIA, CONFIGURACAO E CADASTROS
-- ------------------------------------------------------------

create table if not exists public.minha_casa_familias (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint minha_casa_familia_codigo_check
    check(codigo ~ '^[a-z0-9-]{3,60}$'),
  constraint minha_casa_familia_nome_check
    check(char_length(trim(nome)) between 1 and 100)
);

create table if not exists public.minha_casa_configuracoes (
  familia_id uuid primary key
    references public.minha_casa_familias(id) on delete cascade,
  ativa boolean not null default false,
  ativada_em timestamptz,
  ativada_por uuid references auth.users(id) on delete set null,
  moeda text not null default 'BRL',
  fuso_horario text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint minha_casa_config_moeda_check check(moeda='BRL'),
  constraint minha_casa_config_ativacao_check
    check((not ativa) or ativada_em is not null)
);

create table if not exists public.minha_casa_membros (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null
    references public.minha_casa_familias(id) on delete cascade,
  slug text not null,
  nome text not null,
  emoji text not null default '👤',
  cor text not null default '#64748B',
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint minha_casa_membro_slug_uk unique(familia_id,slug),
  constraint minha_casa_membro_slug_check
    check(slug ~ '^[a-z0-9-]{3,100}$'),
  constraint minha_casa_membro_nome_check
    check(char_length(trim(nome)) between 1 and 80),
  constraint minha_casa_membro_cor_check
    check(cor ~ '^#[0-9A-Fa-f]{6}$')
);

create unique index if not exists minha_casa_membro_nome_uidx
  on public.minha_casa_membros(familia_id,lower(nome));

create table if not exists public.minha_casa_categorias (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null
    references public.minha_casa_familias(id) on delete cascade,
  slug text not null,
  nome text not null,
  tipo text not null,
  emoji text not null default '📌',
  cor text not null default '#64748B',
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint minha_casa_categoria_slug_uk unique(familia_id,slug),
  constraint minha_casa_categoria_slug_check
    check(slug ~ '^[a-z0-9-]{3,100}$'),
  constraint minha_casa_categoria_nome_check
    check(char_length(trim(nome)) between 1 and 80),
  constraint minha_casa_categoria_tipo_check
    check(tipo in ('entrada','saida','ambos')),
  constraint minha_casa_categoria_cor_check
    check(cor ~ '^#[0-9A-Fa-f]{6}$')
);

create unique index if not exists minha_casa_categoria_nome_tipo_uidx
  on public.minha_casa_categorias(familia_id,tipo,lower(nome));

alter table public.minha_casa_categorias
  drop constraint if exists minha_casa_categoria_tipo_check;
alter table public.minha_casa_categorias
  add constraint minha_casa_categoria_tipo_check
  check(tipo in ('entrada','saida','ambos'));

create table if not exists public.minha_casa_lancamentos (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null
    references public.minha_casa_familias(id) on delete cascade,
  tipo text not null,
  valor numeric(14,2) not null,
  data date not null,
  categoria_id uuid not null
    references public.minha_casa_categorias(id) on delete restrict,
  membro_id uuid not null
    references public.minha_casa_membros(id) on delete restrict,
  descricao text not null default '',
  origem_tipo text not null default 'manual',
  origem_chave text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint minha_casa_lancamento_tipo_check
    check(tipo in ('entrada','saida')),
  constraint minha_casa_lancamento_valor_check check(valor>0),
  constraint minha_casa_lancamento_descricao_check
    check(char_length(descricao)<=500),
  constraint minha_casa_lancamento_origem_check
    check(origem_tipo in (
      'manual','aluguel','energia_inquilino','conta_fixa','ajuste'
    )),
  constraint minha_casa_lancamento_origem_uk
    unique(familia_id,origem_chave)
);

create table if not exists public.minha_casa_sugestoes (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null
    references public.minha_casa_familias(id) on delete cascade,
  origem_tipo text not null,
  origem_id uuid not null,
  origem_chave text not null,
  origem_proprietario_id uuid references auth.users(id) on delete set null,
  competencia text,
  tipo text not null,
  valor_sugerido numeric(14,2) not null,
  data_sugerida date not null,
  categoria_id uuid not null
    references public.minha_casa_categorias(id) on delete restrict,
  membro_id uuid not null
    references public.minha_casa_membros(id) on delete restrict,
  descricao_sugerida text not null default '',
  origem_dados jsonb not null default '{}'::jsonb,
  status text not null default 'pendente',
  lancamento_id uuid
    references public.minha_casa_lancamentos(id) on delete set null,
  respondida_por uuid references auth.users(id) on delete set null,
  respondida_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint minha_casa_sugestao_origem_uk
    unique(familia_id,origem_chave),
  constraint minha_casa_sugestao_origem_check
    check(origem_tipo in ('aluguel','energia_inquilino','conta_fixa')),
  constraint minha_casa_sugestao_tipo_check
    check(tipo in ('entrada','saida')),
  constraint minha_casa_sugestao_valor_check check(valor_sugerido>0),
  constraint minha_casa_sugestao_status_check
    check(status in ('pendente','aceita','ignorada')),
  constraint minha_casa_sugestao_competencia_check
    check(
      competencia is null
      or competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'
    ),
  constraint minha_casa_sugestao_resposta_check
    check(
      (status='pendente' and respondida_em is null)
      or (status in ('aceita','ignorada') and respondida_em is not null)
    )
);

create unique index if not exists minha_casa_sugestao_lancamento_uidx
  on public.minha_casa_sugestoes(lancamento_id)
  where lancamento_id is not null;

create table if not exists public.minha_casa_contas_fixas (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null
    references public.minha_casa_familias(id) on delete cascade,
  nome text not null,
  valor numeric(14,2) not null,
  categoria_id uuid not null
    references public.minha_casa_categorias(id) on delete restrict,
  membro_id uuid not null
    references public.minha_casa_membros(id) on delete restrict,
  dia_mes integer not null,
  inicio date not null,
  fim date,
  descricao text not null default '',
  ativa boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint minha_casa_conta_nome_check
    check(char_length(trim(nome)) between 1 and 100),
  constraint minha_casa_conta_valor_check check(valor>0),
  constraint minha_casa_conta_dia_check check(dia_mes between 1 and 28),
  constraint minha_casa_conta_periodo_check check(fim is null or fim>=inicio),
  constraint minha_casa_conta_descricao_check
    check(char_length(descricao)<=500)
);

alter table public.minha_casa_contas_fixas
  drop constraint if exists minha_casa_conta_dia_check;
update public.minha_casa_contas_fixas
set dia_mes=28,updated_at=now()
where dia_mes>28;
alter table public.minha_casa_contas_fixas
  add constraint minha_casa_conta_dia_check
  check(dia_mes between 1 and 28);

create index if not exists minha_casa_lancamentos_data_idx
  on public.minha_casa_lancamentos(familia_id,data desc);
create index if not exists minha_casa_lancamentos_categoria_idx
  on public.minha_casa_lancamentos(familia_id,categoria_id,data desc);
create index if not exists minha_casa_lancamentos_membro_idx
  on public.minha_casa_lancamentos(familia_id,membro_id,data desc);
create index if not exists minha_casa_sugestoes_status_idx
  on public.minha_casa_sugestoes(familia_id,status,data_sugerida desc);
create index if not exists minha_casa_contas_fixas_ativas_idx
  on public.minha_casa_contas_fixas(familia_id,ativa);

-- ------------------------------------------------------------
-- FAMILIA UNICA E DADOS INICIAIS
-- ------------------------------------------------------------

insert into public.minha_casa_familias(codigo,nome,updated_at)
values('familia-anderton','Minha Casa',now())
on conflict(codigo) do update
set nome=excluded.nome,updated_at=now();

insert into public.minha_casa_configuracoes(familia_id)
select f.id
from public.minha_casa_familias f
where f.codigo='familia-anderton'
on conflict(familia_id) do nothing;

insert into public.minha_casa_membros(
  familia_id,slug,nome,emoji,cor,ativo,ordem
)
select f.id,v.slug,v.nome,v.emoji,v.cor,true,v.ordem
from public.minha_casa_familias f
cross join (
  values
    ('anderton','Anderton','👨','#2563EB',10),
    ('marinalva','Marinalva','👩','#DB2777',20),
    ('paula','Paula','👩','#7C3AED',30),
    ('casa-todos','Casa/Todos','🏠','#0F766E',40)
) as v(slug,nome,emoji,cor,ordem)
where f.codigo='familia-anderton'
on conflict do nothing;

insert into public.minha_casa_categorias(
  familia_id,slug,nome,tipo,emoji,cor,ativo,ordem
)
select f.id,v.slug,v.nome,v.tipo,v.emoji,v.cor,true,v.ordem
from public.minha_casa_familias f
cross join (
  values
    ('aluguel-recebido','Aluguéis recebidos','entrada','🏘️','#15803D',10),
    ('energia-inquilinos','Energia recebida dos inquilinos','entrada','⚡','#CA8A04',20),
    ('salario-renda','Salário ou renda','entrada','💼','#0369A1',30),
    ('ajuda-transferencia','Ajuda ou transferência','entrada','🤝','#0F766E',40),
    ('venda','Venda','entrada','🏷️','#7C3AED',50),
    ('valor-inicial','Valor inicial','entrada','🌱','#16A34A',60),
    ('outros-entrada','Outros','entrada','➕','#64748B',90),
    ('energia-residencia','Energia da residência','saida','💡','#D97706',110),
    ('feira','Feira','saida','🥬','#16A34A',120),
    ('mercado','Mercado','saida','🛒','#0F766E',130),
    ('gas','Gás','saida','🔥','#EA580C',140),
    ('internet','Internet','saida','🌐','#2563EB',150),
    ('credito-celular','Crédito de celular','saida','📱','#7C3AED',160),
    ('agua','Água','saida','💧','#0284C7',170),
    ('saude','Saúde','saida','🩺','#DC2626',180),
    ('transporte','Transporte','saida','🚌','#475569',190),
    ('manutencao-casa','Manutenção da casa','saida','🛠️','#92400E',200),
    ('lazer','Lazer','saida','🎉','#DB2777',210),
    ('outros-saida','Outros','saida','➖','#64748B',290)
) as v(slug,nome,tipo,emoji,cor,ordem)
where f.codigo='familia-anderton'
on conflict do nothing;

-- ------------------------------------------------------------
-- AUTORIZACAO E RLS
-- ------------------------------------------------------------

create or replace function public.minha_casa_familia_atual_id()
returns uuid
language sql
stable
security definer
set search_path=public
as $$
  select case
    when public.e_mestre(auth.uid()) then (
      select f.id
      from public.minha_casa_familias f
      where f.codigo='familia-anderton'
      limit 1
    )
    else null::uuid
  end
$$;

create or replace function public.minha_casa_exigir_mestre()
returns uuid
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_familia_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Faça login para acessar Minha Casa.';
  end if;
  if not public.e_mestre(auth.uid()) then
    raise exception 'Minha Casa e exclusiva das contas Mestre.';
  end if;
  select f.id into v_familia_id
  from public.minha_casa_familias f
  where f.codigo='familia-anderton'
  limit 1;
  if v_familia_id is null then
    raise exception 'Familia Minha Casa nao inicializada.';
  end if;
  return v_familia_id;
end
$$;

revoke all on function public.minha_casa_familia_atual_id()
  from public,anon;
grant execute on function public.minha_casa_familia_atual_id()
  to authenticated;
revoke all on function public.minha_casa_exigir_mestre()
  from public,anon,authenticated;

alter table public.minha_casa_familias enable row level security;
alter table public.minha_casa_configuracoes enable row level security;
alter table public.minha_casa_membros enable row level security;
alter table public.minha_casa_categorias enable row level security;
alter table public.minha_casa_lancamentos enable row level security;
alter table public.minha_casa_sugestoes enable row level security;
alter table public.minha_casa_contas_fixas enable row level security;

alter table public.minha_casa_familias force row level security;
alter table public.minha_casa_configuracoes force row level security;
alter table public.minha_casa_membros force row level security;
alter table public.minha_casa_categorias force row level security;
alter table public.minha_casa_lancamentos force row level security;
alter table public.minha_casa_sugestoes force row level security;
alter table public.minha_casa_contas_fixas force row level security;

drop policy if exists minha_casa_so_mestre on public.minha_casa_familias;
create policy minha_casa_so_mestre
on public.minha_casa_familias
for all
to authenticated
using(
  public.e_mestre(auth.uid())
  and id=public.minha_casa_familia_atual_id()
)
with check(
  public.e_mestre(auth.uid())
  and id=public.minha_casa_familia_atual_id()
);

do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array[
    'minha_casa_configuracoes',
    'minha_casa_membros',
    'minha_casa_categorias',
    'minha_casa_lancamentos',
    'minha_casa_sugestoes',
    'minha_casa_contas_fixas'
  ]
  loop
    execute format(
      'drop policy if exists minha_casa_so_mestre on public.%I',
      v_tabela
    );
    execute format(
      'create policy minha_casa_so_mestre on public.%I
       for all to authenticated
       using (
         public.e_mestre(auth.uid())
         and familia_id=public.minha_casa_familia_atual_id()
       )
       with check (
         public.e_mestre(auth.uid())
         and familia_id=public.minha_casa_familia_atual_id()
       )',
      v_tabela
    );
  end loop;
end
$$;

-- O cliente usa somente RPCs. Mesmo se uma politica for alterada no futuro,
-- nao ha privilegio direto de leitura ou escrita nestas tabelas.
revoke all on table
  public.minha_casa_familias,
  public.minha_casa_configuracoes,
  public.minha_casa_membros,
  public.minha_casa_categorias,
  public.minha_casa_lancamentos,
  public.minha_casa_sugestoes,
  public.minha_casa_contas_fixas
from public,anon,authenticated;

-- ------------------------------------------------------------
-- VALIDADORES INTERNOS
-- ------------------------------------------------------------

create or replace function public.minha_casa_validar_referencias(
  p_familia_id uuid,
  p_tipo text,
  p_categoria_id uuid,
  p_membro_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if p_tipo not in ('entrada','saida') then
    raise exception 'Tipo deve ser entrada ou saida.';
  end if;
  if not exists(
    select 1
    from public.minha_casa_categorias c
    where c.id=p_categoria_id
      and c.familia_id=p_familia_id
      and c.tipo in (p_tipo,'ambos')
  ) then
    raise exception 'Categoria invalida para este tipo de movimentacao.';
  end if;
  if not exists(
    select 1
    from public.minha_casa_membros m
    where m.id=p_membro_id and m.familia_id=p_familia_id
  ) then
    raise exception 'Membro da familia invalido.';
  end if;
end
$$;

revoke all on function public.minha_casa_validar_referencias(
  uuid,text,uuid,uuid
) from public,anon,authenticated;

-- ------------------------------------------------------------
-- INICIALIZACAO
-- ------------------------------------------------------------

create or replace function public.minha_casa_inicializar(
  p_ativar boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_familia_id uuid:=public.minha_casa_exigir_mestre();
  v_config public.minha_casa_configuracoes%rowtype;
begin
  insert into public.minha_casa_configuracoes(familia_id)
  values(v_familia_id)
  on conflict(familia_id) do nothing;

  if coalesce(p_ativar,true) then
    update public.minha_casa_configuracoes
    set ativa=true,
        ativada_em=coalesce(ativada_em,now()),
        ativada_por=coalesce(ativada_por,auth.uid()),
        updated_at=now()
    where familia_id=v_familia_id;
  end if;

  select * into v_config
  from public.minha_casa_configuracoes
  where familia_id=v_familia_id;

  return jsonb_build_object(
    'familiaId',v_familia_id,
    'nome',(
      select f.nome
      from public.minha_casa_familias f
      where f.id=v_familia_id
    ),
    'ativa',v_config.ativa,
    'ativadaEm',v_config.ativada_em,
    'moeda',v_config.moeda,
    'fusoHorario',v_config.fuso_horario
  );
end
$$;

revoke all on function public.minha_casa_inicializar(boolean)
  from public,anon;
grant execute on function public.minha_casa_inicializar(boolean)
  to authenticated;

-- ------------------------------------------------------------
-- CRUD DE MEMBROS
-- ------------------------------------------------------------

create or replace function public.minha_casa_salvar_membro(
  p_nome text,
  p_emoji text default '👤',
  p_cor text default '#64748B',
  p_ativo boolean default true,
  p_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_familia_id uuid:=public.minha_casa_exigir_mestre();
  v_nome text:=trim(coalesce(p_nome,''));
  v_cor text:=upper(trim(coalesce(p_cor,'')));
  v_row public.minha_casa_membros%rowtype;
begin
  if char_length(v_nome) not between 1 and 80 then
    raise exception 'Informe um nome de ate 80 caracteres.';
  end if;
  if v_cor!~'^#[0-9A-F]{6}$' then
    raise exception 'Cor invalida. Use o formato #RRGGBB.';
  end if;
  if exists(
    select 1
    from public.minha_casa_membros m
    where m.familia_id=v_familia_id
      and lower(m.nome)=lower(v_nome)
      and (p_id is null or m.id<>p_id)
  ) then
    raise exception 'Ja existe um membro com esse nome.';
  end if;

  if p_id is null then
    insert into public.minha_casa_membros(
      familia_id,slug,nome,emoji,cor,ativo,ordem,created_by,updated_by
    )
    values(
      v_familia_id,
      'membro-'||substr(replace(gen_random_uuid()::text,'-',''),1,20),
      v_nome,
      left(coalesce(nullif(trim(p_emoji),''),'👤'),16),
      v_cor,
      coalesce(p_ativo,true),
      coalesce((
        select max(m.ordem)+10
        from public.minha_casa_membros m
        where m.familia_id=v_familia_id
      ),10),
      auth.uid(),
      auth.uid()
    )
    returning * into v_row;
  else
    if not coalesce(p_ativo,true) and exists(
      select 1
      from public.minha_casa_membros m
      where m.id=p_id
        and m.familia_id=v_familia_id
        and m.slug='casa-todos'
    ) then
      raise exception 'Casa/Todos precisa permanecer ativo.';
    end if;

    update public.minha_casa_membros
    set nome=v_nome,
        emoji=left(coalesce(nullif(trim(p_emoji),''),'👤'),16),
        cor=v_cor,
        ativo=coalesce(p_ativo,true),
        updated_by=auth.uid(),
        updated_at=now()
    where id=p_id and familia_id=v_familia_id
    returning * into v_row;

    if v_row.id is null then raise exception 'Membro nao encontrado.'; end if;
  end if;

  return jsonb_build_object(
    'id',v_row.id,
    'slug',v_row.slug,
    'nome',v_row.nome,
    'emoji',v_row.emoji,
    'cor',v_row.cor,
    'ativo',v_row.ativo,
    'ordem',v_row.ordem
  );
end
$$;

create or replace function public.minha_casa_excluir_membro(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_familia_id uuid:=public.minha_casa_exigir_mestre();
  v_slug text;
  v_em_uso boolean;
begin
  select m.slug into v_slug
  from public.minha_casa_membros m
  where m.id=p_id and m.familia_id=v_familia_id
  for update;
  if v_slug is null then raise exception 'Membro nao encontrado.'; end if;
  if v_slug='casa-todos' then
    raise exception 'Casa/Todos e necessario para sugestoes automaticas.';
  end if;

  select
    exists(
      select 1 from public.minha_casa_lancamentos l where l.membro_id=p_id
    )
    or exists(
      select 1 from public.minha_casa_sugestoes s where s.membro_id=p_id
    )
    or exists(
      select 1 from public.minha_casa_contas_fixas c where c.membro_id=p_id
    )
  into v_em_uso;

  if v_em_uso then
    update public.minha_casa_membros
    set ativo=false,updated_by=auth.uid(),updated_at=now()
    where id=p_id;
    return jsonb_build_object(
      'id',p_id,'excluido',false,'desativado',true
    );
  end if;

  delete from public.minha_casa_membros where id=p_id;
  return jsonb_build_object(
    'id',p_id,'excluido',true,'desativado',false
  );
end
$$;

revoke all on function public.minha_casa_salvar_membro(
  text,text,text,boolean,uuid
) from public,anon;
revoke all on function public.minha_casa_excluir_membro(uuid)
  from public,anon;
grant execute on function public.minha_casa_salvar_membro(
  text,text,text,boolean,uuid
) to authenticated;
grant execute on function public.minha_casa_excluir_membro(uuid)
  to authenticated;

-- ------------------------------------------------------------
-- CRUD DE CATEGORIAS
-- ------------------------------------------------------------

create or replace function public.minha_casa_salvar_categoria(
  p_nome text,
  p_tipo text,
  p_emoji text default '📌',
  p_cor text default '#64748B',
  p_ativo boolean default true,
  p_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_familia_id uuid:=public.minha_casa_exigir_mestre();
  v_nome text:=trim(coalesce(p_nome,''));
  v_tipo text:=lower(trim(coalesce(p_tipo,'')));
  v_cor text:=upper(trim(coalesce(p_cor,'')));
  v_row public.minha_casa_categorias%rowtype;
  v_slug_atual text;
begin
  if char_length(v_nome) not between 1 and 80 then
    raise exception 'Informe um nome de ate 80 caracteres.';
  end if;
  if v_tipo not in ('entrada','saida','ambos') then
    raise exception 'Tipo deve ser entrada, saida ou ambos.';
  end if;
  if v_cor!~'^#[0-9A-F]{6}$' then
    raise exception 'Cor invalida. Use o formato #RRGGBB.';
  end if;
  if exists(
    select 1
    from public.minha_casa_categorias c
    where c.familia_id=v_familia_id
      and c.tipo=v_tipo
      and lower(c.nome)=lower(v_nome)
      and (p_id is null or c.id<>p_id)
  ) then
    raise exception 'Ja existe uma categoria com esse nome e tipo.';
  end if;

  if p_id is null then
    insert into public.minha_casa_categorias(
      familia_id,slug,nome,tipo,emoji,cor,ativo,ordem,created_by,updated_by
    )
    values(
      v_familia_id,
      'categoria-'||substr(replace(gen_random_uuid()::text,'-',''),1,20),
      v_nome,
      v_tipo,
      left(coalesce(nullif(trim(p_emoji),''),'📌'),16),
      v_cor,
      coalesce(p_ativo,true),
      coalesce((
        select max(c.ordem)+10
        from public.minha_casa_categorias c
        where c.familia_id=v_familia_id and c.tipo=v_tipo
      ),10),
      auth.uid(),
      auth.uid()
    )
    returning * into v_row;
  else
    select c.slug into v_slug_atual
    from public.minha_casa_categorias c
    where c.id=p_id and c.familia_id=v_familia_id
    for update;
    if v_slug_atual is null then raise exception 'Categoria nao encontrada.'; end if;

    if v_slug_atual in ('aluguel-recebido','energia-inquilinos')
       and (v_tipo not in ('entrada','ambos') or not coalesce(p_ativo,true)) then
      raise exception 'Categorias de recebimentos automaticos precisam permanecer ativas.';
    end if;
    if exists(
      select 1
      from public.minha_casa_lancamentos l
      where l.categoria_id=p_id
        and v_tipo<>'ambos'
        and l.tipo<>v_tipo
    ) or exists(
      select 1
      from public.minha_casa_sugestoes s
      where s.categoria_id=p_id
        and v_tipo<>'ambos'
        and s.tipo<>v_tipo
    ) then
      raise exception 'Nao e possivel trocar o tipo de uma categoria em uso.';
    end if;

    update public.minha_casa_categorias
    set nome=v_nome,
        tipo=v_tipo,
        emoji=left(coalesce(nullif(trim(p_emoji),''),'📌'),16),
        cor=v_cor,
        ativo=coalesce(p_ativo,true),
        updated_by=auth.uid(),
        updated_at=now()
    where id=p_id and familia_id=v_familia_id
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'id',v_row.id,
    'slug',v_row.slug,
    'nome',v_row.nome,
    'tipo',v_row.tipo,
    'emoji',v_row.emoji,
    'cor',v_row.cor,
    'ativo',v_row.ativo,
    'ordem',v_row.ordem
  );
end
$$;

create or replace function public.minha_casa_excluir_categoria(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_familia_id uuid:=public.minha_casa_exigir_mestre();
  v_slug text;
  v_em_uso boolean;
begin
  select c.slug into v_slug
  from public.minha_casa_categorias c
  where c.id=p_id and c.familia_id=v_familia_id
  for update;
  if v_slug is null then raise exception 'Categoria nao encontrada.'; end if;
  if v_slug in ('aluguel-recebido','energia-inquilinos') then
    raise exception 'Esta categoria e necessaria para sugestoes automaticas.';
  end if;

  select
    exists(
      select 1 from public.minha_casa_lancamentos l where l.categoria_id=p_id
    )
    or exists(
      select 1 from public.minha_casa_sugestoes s where s.categoria_id=p_id
    )
    or exists(
      select 1 from public.minha_casa_contas_fixas c where c.categoria_id=p_id
    )
  into v_em_uso;

  if v_em_uso then
    update public.minha_casa_categorias
    set ativo=false,updated_by=auth.uid(),updated_at=now()
    where id=p_id;
    return jsonb_build_object(
      'id',p_id,'excluida',false,'desativada',true
    );
  end if;

  delete from public.minha_casa_categorias where id=p_id;
  return jsonb_build_object(
    'id',p_id,'excluida',true,'desativada',false
  );
end
$$;

revoke all on function public.minha_casa_salvar_categoria(
  text,text,text,text,boolean,uuid
) from public,anon;
revoke all on function public.minha_casa_excluir_categoria(uuid)
  from public,anon;
grant execute on function public.minha_casa_salvar_categoria(
  text,text,text,text,boolean,uuid
) to authenticated;
grant execute on function public.minha_casa_excluir_categoria(uuid)
  to authenticated;

-- ------------------------------------------------------------
-- CRUD DE LANCAMENTOS
-- ------------------------------------------------------------

create or replace function public.minha_casa_salvar_lancamento(
  p_tipo text,
  p_valor numeric,
  p_categoria_id uuid,
  p_membro_id uuid,
  p_data date default null,
  p_descricao text default '',
  p_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_familia_id uuid:=public.minha_casa_exigir_mestre();
  v_tipo text:=lower(trim(coalesce(p_tipo,'')));
  v_data date:=coalesce(
    p_data,
    (timezone('America/Sao_Paulo',now()))::date
  );
  v_descricao text:=left(trim(coalesce(p_descricao,'')),500);
  v_row public.minha_casa_lancamentos%rowtype;
begin
  if coalesce(p_valor,0)<=0 then
    raise exception 'O valor precisa ser maior que zero.';
  end if;
  perform public.minha_casa_validar_referencias(
    v_familia_id,v_tipo,p_categoria_id,p_membro_id
  );

  if p_id is null then
    insert into public.minha_casa_lancamentos(
      familia_id,tipo,valor,data,categoria_id,membro_id,descricao,
      origem_tipo,created_by,updated_by
    )
    values(
      v_familia_id,v_tipo,round(p_valor,2),v_data,
      p_categoria_id,p_membro_id,v_descricao,
      'manual',auth.uid(),auth.uid()
    )
    returning * into v_row;
  else
    update public.minha_casa_lancamentos
    set tipo=v_tipo,
        valor=round(p_valor,2),
        data=v_data,
        categoria_id=p_categoria_id,
        membro_id=p_membro_id,
        descricao=v_descricao,
        updated_by=auth.uid(),
        updated_at=now()
    where id=p_id and familia_id=v_familia_id
    returning * into v_row;
    if v_row.id is null then raise exception 'Lancamento nao encontrado.'; end if;
  end if;

  return jsonb_build_object(
    'id',v_row.id,
    'tipo',v_row.tipo,
    'valor',v_row.valor,
    'data',v_row.data,
    'categoriaId',v_row.categoria_id,
    'membroId',v_row.membro_id,
    'descricao',v_row.descricao,
    'origemTipo',v_row.origem_tipo,
    'origemChave',v_row.origem_chave,
    'createdAt',v_row.created_at,
    'updatedAt',v_row.updated_at
  );
end
$$;

create or replace function public.minha_casa_excluir_lancamento(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_familia_id uuid:=public.minha_casa_exigir_mestre();
  v_origem_chave text;
begin
  select l.origem_chave into v_origem_chave
  from public.minha_casa_lancamentos l
  where l.id=p_id and l.familia_id=v_familia_id
  for update;
  if not found then raise exception 'Lancamento nao encontrado.'; end if;

  -- Uma exclusao intencional nao deve recriar automaticamente o mesmo item.
  update public.minha_casa_sugestoes
  set status='ignorada',
      lancamento_id=null,
      respondida_por=auth.uid(),
      respondida_em=now(),
      updated_at=now()
  where familia_id=v_familia_id
    and lancamento_id=p_id
    and status='aceita';

  delete from public.minha_casa_lancamentos
  where id=p_id and familia_id=v_familia_id;

  return jsonb_build_object(
    'id',p_id,
    'excluido',true,
    'origemChave',v_origem_chave
  );
end
$$;

revoke all on function public.minha_casa_salvar_lancamento(
  text,numeric,uuid,uuid,date,text,uuid
) from public,anon;
revoke all on function public.minha_casa_excluir_lancamento(uuid)
  from public,anon;
grant execute on function public.minha_casa_salvar_lancamento(
  text,numeric,uuid,uuid,date,text,uuid
) to authenticated;
grant execute on function public.minha_casa_excluir_lancamento(uuid)
  to authenticated;

-- ------------------------------------------------------------
-- CRUD DE CONTAS FIXAS
-- ------------------------------------------------------------

create or replace function public.minha_casa_salvar_conta_fixa(
  p_nome text,
  p_valor numeric,
  p_categoria_id uuid,
  p_membro_id uuid,
  p_dia_mes integer,
  p_inicio date default null,
  p_fim date default null,
  p_descricao text default '',
  p_ativa boolean default true,
  p_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_familia_id uuid:=public.minha_casa_exigir_mestre();
  v_nome text:=trim(coalesce(p_nome,''));
  v_inicio date;
  v_fim date;
  v_row public.minha_casa_contas_fixas%rowtype;
begin
  if p_id is null then
    v_inicio:=coalesce(
      p_inicio,
      (timezone('America/Sao_Paulo',now()))::date
    );
    v_fim:=p_fim;
  else
    select c.inicio,c.fim
    into v_inicio,v_fim
    from public.minha_casa_contas_fixas c
    where c.id=p_id and c.familia_id=v_familia_id
    for update;
    if not found then raise exception 'Conta fixa nao encontrada.'; end if;
    v_inicio:=coalesce(p_inicio,v_inicio);
    v_fim:=coalesce(p_fim,v_fim);
  end if;

  if char_length(v_nome) not between 1 and 100 then
    raise exception 'Informe o nome da conta fixa.';
  end if;
  if coalesce(p_valor,0)<=0 then
    raise exception 'O valor precisa ser maior que zero.';
  end if;
  if coalesce(p_dia_mes,0) not between 1 and 28 then
    raise exception 'O dia precisa estar entre 1 e 28.';
  end if;
  if v_fim is not null and v_fim<v_inicio then
    raise exception 'A data final nao pode ser anterior a inicial.';
  end if;
  perform public.minha_casa_validar_referencias(
    v_familia_id,'saida',p_categoria_id,p_membro_id
  );

  if p_id is null then
    insert into public.minha_casa_contas_fixas(
      familia_id,nome,valor,categoria_id,membro_id,dia_mes,inicio,fim,
      descricao,ativa,created_by,updated_by
    )
    values(
      v_familia_id,v_nome,round(p_valor,2),p_categoria_id,p_membro_id,
      p_dia_mes,v_inicio,v_fim,left(trim(coalesce(p_descricao,'')),500),
      coalesce(p_ativa,true),auth.uid(),auth.uid()
    )
    returning * into v_row;
  else
    update public.minha_casa_contas_fixas
    set nome=v_nome,
        valor=round(p_valor,2),
        categoria_id=p_categoria_id,
        membro_id=p_membro_id,
        dia_mes=p_dia_mes,
        inicio=v_inicio,
        fim=v_fim,
        descricao=left(trim(coalesce(p_descricao,'')),500),
        ativa=coalesce(p_ativa,true),
        updated_by=auth.uid(),
        updated_at=now()
    where id=p_id and familia_id=v_familia_id
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'id',v_row.id,
    'nome',v_row.nome,
    'valor',v_row.valor,
    'categoriaId',v_row.categoria_id,
    'membroId',v_row.membro_id,
    'diaMes',v_row.dia_mes,
    'inicio',v_row.inicio,
    'fim',v_row.fim,
    'descricao',v_row.descricao,
    'ativa',v_row.ativa,
    'createdAt',v_row.created_at,
    'updatedAt',v_row.updated_at
  );
end
$$;

create or replace function public.minha_casa_excluir_conta_fixa(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_familia_id uuid:=public.minha_casa_exigir_mestre();
begin
  if not exists(
    select 1
    from public.minha_casa_contas_fixas c
    where c.id=p_id and c.familia_id=v_familia_id
  ) then
    raise exception 'Conta fixa nao encontrada.';
  end if;

  -- Sugestoes existentes permanecem no historico e impedem duplicacao.
  update public.minha_casa_sugestoes
  set status='ignorada',
      respondida_por=auth.uid(),
      respondida_em=now(),
      updated_at=now()
  where familia_id=v_familia_id
    and origem_tipo='conta_fixa'
    and origem_id=p_id
    and status='pendente';

  delete from public.minha_casa_contas_fixas
  where id=p_id and familia_id=v_familia_id;

  return jsonb_build_object('id',p_id,'excluida',true);
end
$$;

revoke all on function public.minha_casa_salvar_conta_fixa(
  text,numeric,uuid,uuid,integer,date,date,text,boolean,uuid
) from public,anon;
revoke all on function public.minha_casa_excluir_conta_fixa(uuid)
  from public,anon;
grant execute on function public.minha_casa_salvar_conta_fixa(
  text,numeric,uuid,uuid,integer,date,date,text,boolean,uuid
) to authenticated;
grant execute on function public.minha_casa_excluir_conta_fixa(uuid)
  to authenticated;

-- ------------------------------------------------------------
-- GERACAO SEMIAUTOMATICA DE SUGESTOES
--
-- Somente dados do proprietario principal sao considerados. A data de
-- pagamento/vencimento precisa ser igual ou posterior a ativacao do modulo.
-- A chave unica de origem impede duplicacao em qualquer reexecucao.
-- ------------------------------------------------------------

create or replace function public.minha_casa_gerar_sugestoes(
  p_ate date default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_familia_id uuid:=public.minha_casa_exigir_mestre();
  v_config public.minha_casa_configuracoes%rowtype;
  v_ativacao date;
  v_ate date:=coalesce(
    p_ate,
    (timezone('America/Sao_Paulo',now()))::date
  );
  v_membro_casa uuid;
  v_categoria_aluguel uuid;
  v_categoria_energia uuid;
  v_alugueis integer:=0;
  v_energias integer:=0;
  v_fixas integer:=0;
begin
  select * into v_config
  from public.minha_casa_configuracoes c
  where c.familia_id=v_familia_id;

  if v_config.familia_id is null
     or not v_config.ativa
     or v_config.ativada_em is null then
    return jsonb_build_object(
      'ativa',false,
      'novas',0,
      'alugueis',0,
      'energias',0,
      'contasFixas',0,
      'totalPendentes',0
    );
  end if;

  v_ativacao:=(
    v_config.ativada_em at time zone v_config.fuso_horario
  )::date;

  if v_ate<v_ativacao then
    return jsonb_build_object(
      'ativa',true,
      'ativacao',v_ativacao,
      'ate',v_ate,
      'novas',0,
      'alugueis',0,
      'energias',0,
      'contasFixas',0,
      'totalPendentes',(
        select count(*)
        from public.minha_casa_sugestoes s
        where s.familia_id=v_familia_id and s.status='pendente'
      )
    );
  end if;
  if v_ate>(timezone(v_config.fuso_horario,now()))::date+366 then
    raise exception 'O limite para gerar contas futuras e de 366 dias.';
  end if;

  select m.id into v_membro_casa
  from public.minha_casa_membros m
  where m.familia_id=v_familia_id and m.slug='casa-todos';
  select c.id into v_categoria_aluguel
  from public.minha_casa_categorias c
  where c.familia_id=v_familia_id and c.slug='aluguel-recebido';
  select c.id into v_categoria_energia
  from public.minha_casa_categorias c
  where c.familia_id=v_familia_id and c.slug='energia-inquilinos';

  if v_membro_casa is null
     or v_categoria_aluguel is null
     or v_categoria_energia is null then
    raise exception 'Dados iniciais de Minha Casa estao incompletos.';
  end if;

  insert into public.minha_casa_sugestoes(
    familia_id,origem_tipo,origem_id,origem_chave,
    origem_proprietario_id,competencia,tipo,valor_sugerido,
    data_sugerida,categoria_id,membro_id,descricao_sugerida,
    origem_dados
  )
  select
    v_familia_id,
    'aluguel',
    p.id,
    'aluguel:'||p.id::text,
    p.user_id,
    p.mes,
    'entrada',
    round(p.valor_pago,2),
    p.data_pagamento,
    v_categoria_aluguel,
    v_membro_casa,
    left(
      concat(
        'Aluguel recebido - ',
        coalesce(nullif(i.nome,''),'Casa'),
        ' - ',
        p.mes
      ),
      500
    ),
    jsonb_strip_nulls(jsonb_build_object(
      'proprietarioId',p.user_id,
      'pagamentoId',p.id,
      'imovelId',p.imovel_id,
      'contratoId',p.contrato_id,
      'casa',i.nome,
      'inquilino',t.nome,
      'competencia',p.mes,
      'dataPagamento',p.data_pagamento
    ))
  from public.pagamentos p
  join auth.users proprietario
    on proprietario.id=p.user_id
   and lower(proprietario.email)='andertonaluguel@gmail.com'
  left join public.imoveis i on i.id=p.imovel_id
  left join public.contratos ct on ct.id=p.contrato_id
  left join public.inquilinos t
    on t.id=coalesce(ct.tenant_id,i.tenant_id)
  where p.valor_pago>0
    and p.data_pagamento is not null
    and p.data_pagamento between v_ativacao and v_ate
  on conflict(familia_id,origem_chave) do nothing;
  get diagnostics v_alugueis=row_count;

  insert into public.minha_casa_sugestoes(
    familia_id,origem_tipo,origem_id,origem_chave,
    origem_proprietario_id,competencia,tipo,valor_sugerido,
    data_sugerida,categoria_id,membro_id,descricao_sugerida,
    origem_dados
  )
  select
    v_familia_id,
    'energia_inquilino',
    e.id,
    'energia_inquilino:'||e.id::text,
    e.user_id,
    e.mes,
    'entrada',
    round(
      coalesce(nullif(e.valor,0),nullif(e.valor_calculado,0)),
      2
    ),
    e.data_pagamento,
    v_categoria_energia,
    v_membro_casa,
    left(
      concat(
        'Energia recebida - ',
        coalesce(nullif(i.nome,''),'Casa'),
        ' - ',
        e.mes
      ),
      500
    ),
    jsonb_strip_nulls(jsonb_build_object(
      'proprietarioId',e.user_id,
      'energiaId',e.id,
      'imovelId',e.imovel_id,
      'contratoId',e.contrato_id,
      'casa',i.nome,
      'inquilino',t.nome,
      'competencia',e.mes,
      'kwh',e.kwh,
      'dataPagamento',e.data_pagamento
    ))
  from public.energia e
  join auth.users proprietario
    on proprietario.id=e.user_id
   and lower(proprietario.email)='andertonaluguel@gmail.com'
  left join public.imoveis i on i.id=e.imovel_id
  left join public.contratos ct on ct.id=e.contrato_id
  left join public.inquilinos t
    on t.id=coalesce(ct.tenant_id,i.tenant_id)
  where e.pago
    and e.data_pagamento is not null
    and e.data_pagamento between v_ativacao and v_ate
    and coalesce(nullif(e.valor,0),nullif(e.valor_calculado,0),0)>0
  on conflict(familia_id,origem_chave) do nothing;
  get diagnostics v_energias=row_count;

  with ocorrencias as (
    select
      conta.id conta_id,
      conta.nome,
      conta.valor,
      conta.categoria_id,
      conta.membro_id,
      conta.descricao,
      conta.inicio conta_inicio,
      conta.fim conta_fim,
      mes.inicio_mes,
      (
        mes.inicio_mes+
        (
          least(
            conta.dia_mes,
            extract(
              day from (mes.inicio_mes+interval '1 month - 1 day')
            )::integer
          )-1
        )
      )::date data_vencimento
    from public.minha_casa_contas_fixas conta
    cross join lateral (
      select gs::date inicio_mes
      from generate_series(
        date_trunc(
          'month',
          greatest(conta.inicio,v_ativacao)::timestamp
        ),
        date_trunc(
          'month',
          least(coalesce(conta.fim,v_ate),v_ate)::timestamp
        ),
        interval '1 month'
      ) gs
    ) mes
    where conta.familia_id=v_familia_id
      and conta.ativa
      and conta.inicio<=v_ate
      and (conta.fim is null or conta.fim>=v_ativacao)
  )
  insert into public.minha_casa_sugestoes(
    familia_id,origem_tipo,origem_id,origem_chave,
    competencia,tipo,valor_sugerido,data_sugerida,
    categoria_id,membro_id,descricao_sugerida,origem_dados
  )
  select
    v_familia_id,
    'conta_fixa',
    o.conta_id,
    'conta_fixa:'||o.conta_id::text||':'||
      to_char(o.inicio_mes,'YYYY-MM'),
    to_char(o.inicio_mes,'YYYY-MM'),
    'saida',
    round(o.valor,2),
    o.data_vencimento,
    o.categoria_id,
    o.membro_id,
    left(
      coalesce(nullif(o.descricao,''),'Conta fixa - '||o.nome),
      500
    ),
    jsonb_build_object(
      'contaFixaId',o.conta_id,
      'nome',o.nome,
      'competencia',to_char(o.inicio_mes,'YYYY-MM'),
      'vencimento',o.data_vencimento
    )
  from ocorrencias o
  where o.data_vencimento>=greatest(o.conta_inicio,v_ativacao)
    and o.data_vencimento<=v_ate
    and (o.conta_fim is null or o.data_vencimento<=o.conta_fim)
  on conflict(familia_id,origem_chave) do nothing;
  get diagnostics v_fixas=row_count;

  return jsonb_build_object(
    'ativa',true,
    'ativacao',v_ativacao,
    'ate',v_ate,
    'novas',v_alugueis+v_energias+v_fixas,
    'alugueis',v_alugueis,
    'energias',v_energias,
    'contasFixas',v_fixas,
    'totalPendentes',(
      select count(*)
      from public.minha_casa_sugestoes s
      where s.familia_id=v_familia_id and s.status='pendente'
    )
  );
end
$$;

revoke all on function public.minha_casa_gerar_sugestoes(date)
  from public,anon;
grant execute on function public.minha_casa_gerar_sugestoes(date)
  to authenticated;

-- ------------------------------------------------------------
-- APROVAR / IGNORAR SUGESTOES
-- ------------------------------------------------------------

create or replace function public.minha_casa_aceitar_sugestao(
  p_sugestao_id uuid,
  p_valor numeric default null,
  p_data date default null,
  p_categoria_id uuid default null,
  p_membro_id uuid default null,
  p_descricao text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_familia_id uuid:=public.minha_casa_exigir_mestre();
  v_sugestao public.minha_casa_sugestoes%rowtype;
  v_lancamento public.minha_casa_lancamentos%rowtype;
  v_valor numeric(14,2);
  v_data date;
  v_categoria_id uuid;
  v_membro_id uuid;
  v_descricao text;
begin
  select * into v_sugestao
  from public.minha_casa_sugestoes s
  where s.id=p_sugestao_id and s.familia_id=v_familia_id
  for update;

  if v_sugestao.id is null then
    raise exception 'Sugestao nao encontrada.';
  end if;

  if v_sugestao.status='aceita' then
    select * into v_lancamento
    from public.minha_casa_lancamentos l
    where l.id=v_sugestao.lancamento_id;
    return jsonb_build_object(
      'id',v_sugestao.id,
      'status','aceita',
      'jaProcessada',true,
      'lancamento',case
        when v_lancamento.id is null then null::jsonb
        else jsonb_build_object(
          'id',v_lancamento.id,
          'tipo',v_lancamento.tipo,
          'valor',v_lancamento.valor,
          'data',v_lancamento.data,
          'categoriaId',v_lancamento.categoria_id,
          'membroId',v_lancamento.membro_id,
          'descricao',v_lancamento.descricao,
          'origemTipo',v_lancamento.origem_tipo,
          'origemChave',v_lancamento.origem_chave
        )
      end
    );
  end if;
  if v_sugestao.status='ignorada' then
    raise exception 'A sugestao foi ignorada e nao pode ser aceita.';
  end if;

  v_valor:=round(coalesce(p_valor,v_sugestao.valor_sugerido),2);
  v_data:=coalesce(p_data,v_sugestao.data_sugerida);
  v_categoria_id:=coalesce(p_categoria_id,v_sugestao.categoria_id);
  v_membro_id:=coalesce(p_membro_id,v_sugestao.membro_id);
  v_descricao:=left(
    trim(coalesce(p_descricao,v_sugestao.descricao_sugerida,'')),
    500
  );

  if v_valor<=0 then raise exception 'O valor precisa ser maior que zero.'; end if;
  perform public.minha_casa_validar_referencias(
    v_familia_id,
    v_sugestao.tipo,
    v_categoria_id,
    v_membro_id
  );

  insert into public.minha_casa_lancamentos(
    familia_id,tipo,valor,data,categoria_id,membro_id,descricao,
    origem_tipo,origem_chave,created_by,updated_by
  )
  values(
    v_familia_id,
    v_sugestao.tipo,
    v_valor,
    v_data,
    v_categoria_id,
    v_membro_id,
    v_descricao,
    v_sugestao.origem_tipo,
    v_sugestao.origem_chave,
    auth.uid(),
    auth.uid()
  )
  returning * into v_lancamento;

  update public.minha_casa_sugestoes
  set status='aceita',
      lancamento_id=v_lancamento.id,
      respondida_por=auth.uid(),
      respondida_em=now(),
      updated_at=now()
  where id=v_sugestao.id;

  return jsonb_build_object(
    'id',v_sugestao.id,
    'status','aceita',
    'jaProcessada',false,
    'lancamento',jsonb_build_object(
      'id',v_lancamento.id,
      'tipo',v_lancamento.tipo,
      'valor',v_lancamento.valor,
      'data',v_lancamento.data,
      'categoriaId',v_lancamento.categoria_id,
      'membroId',v_lancamento.membro_id,
      'descricao',v_lancamento.descricao,
      'origemTipo',v_lancamento.origem_tipo,
      'origemChave',v_lancamento.origem_chave,
      'createdAt',v_lancamento.created_at
    )
  );
end
$$;

create or replace function public.minha_casa_ignorar_sugestao(
  p_sugestao_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_familia_id uuid:=public.minha_casa_exigir_mestre();
  v_status text;
begin
  select s.status into v_status
  from public.minha_casa_sugestoes s
  where s.id=p_sugestao_id and s.familia_id=v_familia_id
  for update;

  if v_status is null then raise exception 'Sugestao nao encontrada.'; end if;
  if v_status='aceita' then
    raise exception 'Uma sugestao aceita deve ser excluida pelo lancamento.';
  end if;
  if v_status='pendente' then
    update public.minha_casa_sugestoes
    set status='ignorada',
        respondida_por=auth.uid(),
        respondida_em=now(),
        updated_at=now()
    where id=p_sugestao_id;
  end if;

  return jsonb_build_object(
    'id',p_sugestao_id,
    'status','ignorada',
    'jaProcessada',v_status='ignorada'
  );
end
$$;

revoke all on function public.minha_casa_aceitar_sugestao(
  uuid,numeric,date,uuid,uuid,text
) from public,anon;
revoke all on function public.minha_casa_ignorar_sugestao(uuid)
  from public,anon;
grant execute on function public.minha_casa_aceitar_sugestao(
  uuid,numeric,date,uuid,uuid,text
) to authenticated;
grant execute on function public.minha_casa_ignorar_sugestao(uuid)
  to authenticated;

-- ------------------------------------------------------------
-- LEITURA DO APLICATIVO
-- ------------------------------------------------------------

create or replace function public.minha_casa_carregar(
  p_mes text default null,
  p_status_sugestoes text default 'pendente'
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_familia_id uuid:=public.minha_casa_exigir_mestre();
  v_mes text:=coalesce(
    nullif(trim(p_mes),''),
    to_char(timezone('America/Sao_Paulo',now()),'YYYY-MM')
  );
  v_status text:=lower(coalesce(nullif(trim(p_status_sugestoes),''),'pendente'));
  v_inicio date;
  v_fim date;
  v_config public.minha_casa_configuracoes%rowtype;
  v_membros jsonb;
  v_categorias jsonb;
  v_lancamentos jsonb;
  v_sugestoes jsonb;
  v_recorrencias jsonb;
  v_por_categoria jsonb;
  v_por_membro jsonb;
  v_comparativo jsonb;
  v_entradas numeric(14,2);
  v_saidas numeric(14,2);
begin
  if v_mes!~'^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Mes invalido. Use YYYY-MM.';
  end if;
  if v_status not in ('pendente','aceita','ignorada','todas') then
    raise exception 'Status de sugestao invalido.';
  end if;

  v_inicio:=(v_mes||'-01')::date;
  v_fim:=(v_inicio+interval '1 month - 1 day')::date;

  -- Mantem a caixa "A confirmar" atualizada sem aceitar nada sozinho.
  perform public.minha_casa_gerar_sugestoes(null);

  select * into v_config
  from public.minha_casa_configuracoes c
  where c.familia_id=v_familia_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',m.id,
        'slug',m.slug,
        'name',m.nome,
        'emoji',m.emoji,
        'color',m.cor,
        'active',m.ativo,
        'order',m.ordem
      )
      order by m.ordem,m.nome
    ),
    '[]'::jsonb
  )
  into v_membros
  from public.minha_casa_membros m
  where m.familia_id=v_familia_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',c.id,
        'slug',c.slug,
        'name',c.nome,
        'type',c.tipo,
        'emoji',c.emoji,
        'color',c.cor,
        'active',c.ativo,
        'order',c.ordem
      )
      order by
        case c.tipo when 'entrada' then 0 when 'ambos' then 1 else 2 end,
        c.ordem,
        c.nome
    ),
    '[]'::jsonb
  )
  into v_categorias
  from public.minha_casa_categorias c
  where c.familia_id=v_familia_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',l.id,
        'type',l.tipo,
        'amount',l.valor,
        'date',l.data,
        'categoryId',l.categoria_id,
        'categoryName',c.nome,
        'categoryEmoji',c.emoji,
        'categoryColor',c.cor,
        'memberId',l.membro_id,
        'memberName',m.nome,
        'memberEmoji',m.emoji,
        'description',l.descricao,
        'sourceType',l.origem_tipo,
        'sourceKey',l.origem_chave,
        'createdAt',l.created_at,
        'updatedAt',l.updated_at
      )
      order by l.data desc,l.created_at desc
    ),
    '[]'::jsonb
  )
  into v_lancamentos
  from public.minha_casa_lancamentos l
  join public.minha_casa_categorias c on c.id=l.categoria_id
  join public.minha_casa_membros m on m.id=l.membro_id
  where l.familia_id=v_familia_id
    and l.data between v_inicio and v_fim;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',s.id,
        'type',s.tipo,
        'amount',s.valor_sugerido,
        'date',s.data_sugerida,
        'categoryId',s.categoria_id,
        'categoryName',c.nome,
        'categoryEmoji',c.emoji,
        'memberId',s.membro_id,
        'memberName',m.nome,
        'memberEmoji',m.emoji,
        'description',s.descricao_sugerida,
        'status',s.status,
        'sourceType',s.origem_tipo,
        'sourceId',s.origem_id,
        'sourceKey',s.origem_chave,
        'sourceOwnerId',s.origem_proprietario_id,
        'month',s.competencia,
        'sourceData',s.origem_dados,
        'transactionId',s.lancamento_id,
        'answeredAt',s.respondida_em,
        'createdAt',s.created_at
      )
      order by s.data_sugerida desc,s.created_at desc
    ),
    '[]'::jsonb
  )
  into v_sugestoes
  from public.minha_casa_sugestoes s
  join public.minha_casa_categorias c on c.id=s.categoria_id
  join public.minha_casa_membros m on m.id=s.membro_id
  where s.familia_id=v_familia_id
    and (v_status='todas' or s.status=v_status);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',r.id,
        'name',r.nome,
        'type','saida',
        'amount',r.valor,
        'categoryId',r.categoria_id,
        'categoryName',c.nome,
        'categoryEmoji',c.emoji,
        'memberId',r.membro_id,
        'memberName',m.nome,
        'memberEmoji',m.emoji,
        'dayOfMonth',r.dia_mes,
        'startDate',r.inicio,
        'endDate',r.fim,
        'description',r.descricao,
        'active',r.ativa,
        'createdAt',r.created_at,
        'updatedAt',r.updated_at
      )
      order by r.ativa desc,r.dia_mes,r.nome
    ),
    '[]'::jsonb
  )
  into v_recorrencias
  from public.minha_casa_contas_fixas r
  join public.minha_casa_categorias c on c.id=r.categoria_id
  join public.minha_casa_membros m on m.id=r.membro_id
  where r.familia_id=v_familia_id;

  select
    coalesce(sum(l.valor) filter(where l.tipo='entrada'),0),
    coalesce(sum(l.valor) filter(where l.tipo='saida'),0)
  into v_entradas,v_saidas
  from public.minha_casa_lancamentos l
  where l.familia_id=v_familia_id
    and l.data between v_inicio and v_fim;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'categoryId',x.id,
        'name',x.nome,
        'type',x.tipo,
        'emoji',x.emoji,
        'color',x.cor,
        'amount',x.total,
        'count',x.quantidade
      )
      order by x.total desc,x.nome
    ),
    '[]'::jsonb
  )
  into v_por_categoria
  from (
    select
      c.id,c.nome,c.tipo,c.emoji,c.cor,
      sum(l.valor) total,
      count(*) quantidade
    from public.minha_casa_lancamentos l
    join public.minha_casa_categorias c on c.id=l.categoria_id
    where l.familia_id=v_familia_id
      and l.data between v_inicio and v_fim
    group by c.id,c.nome,c.tipo,c.emoji,c.cor
  ) x;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'memberId',x.id,
        'name',x.nome,
        'emoji',x.emoji,
        'color',x.cor,
        'income',x.entradas,
        'expense',x.saidas,
        'balance',x.entradas-x.saidas,
        'count',x.quantidade
      )
      order by x.saidas desc,x.nome
    ),
    '[]'::jsonb
  )
  into v_por_membro
  from (
    select
      m.id,m.nome,m.emoji,m.cor,
      coalesce(sum(l.valor) filter(where l.tipo='entrada'),0) entradas,
      coalesce(sum(l.valor) filter(where l.tipo='saida'),0) saidas,
      count(*) quantidade
    from public.minha_casa_lancamentos l
    join public.minha_casa_membros m on m.id=l.membro_id
    where l.familia_id=v_familia_id
      and l.data between v_inicio and v_fim
    group by m.id,m.nome,m.emoji,m.cor
  ) x;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'month',x.mes,
        'income',x.entradas,
        'expense',x.saidas,
        'balance',x.entradas-x.saidas
      )
      order by x.inicio
    ),
    '[]'::jsonb
  )
  into v_comparativo
  from (
    select
      serie.inicio,
      to_char(serie.inicio,'YYYY-MM') mes,
      coalesce(sum(l.valor) filter(where l.tipo='entrada'),0) entradas,
      coalesce(sum(l.valor) filter(where l.tipo='saida'),0) saidas
    from generate_series(
      (v_inicio-interval '5 months')::date,
      v_inicio,
      interval '1 month'
    ) serie(inicio)
    left join public.minha_casa_lancamentos l
      on l.familia_id=v_familia_id
     and l.data>=serie.inicio
     and l.data<(serie.inicio+interval '1 month')
    group by serie.inicio
  ) x;

  return jsonb_build_object(
    'familyId',v_familia_id,
    'active',coalesce(v_config.ativa,false),
    'activationDate',v_config.ativada_em,
    'currency',coalesce(v_config.moeda,'BRL'),
    'timeZone',coalesce(v_config.fuso_horario,'America/Sao_Paulo'),
    'month',v_mes,
    'members',v_membros,
    'categories',v_categorias,
    'transactions',v_lancamentos,
    'suggestions',v_sugestoes,
    'recurring',v_recorrencias,
    'pendingCount',(
      select count(*)
      from public.minha_casa_sugestoes s
      where s.familia_id=v_familia_id and s.status='pendente'
    ),
    'summary',jsonb_build_object(
      'income',v_entradas,
      'expense',v_saidas,
      'balance',v_entradas-v_saidas,
      'byCategory',v_por_categoria,
      'byMember',v_por_membro
    ),
    'comparison',v_comparativo
  );
end
$$;

create or replace function public.minha_casa_listar_lancamentos(
  p_data_inicio date default null,
  p_data_fim date default null,
  p_tipo text default null,
  p_membro_id uuid default null,
  p_categoria_id uuid default null,
  p_busca text default null,
  p_limite integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_familia_id uuid:=public.minha_casa_exigir_mestre();
  v_tipo text:=nullif(lower(trim(coalesce(p_tipo,''))),'');
  v_busca text:=nullif(lower(trim(coalesce(p_busca,''))),'');
  v_limite integer:=least(greatest(coalesce(p_limite,100),1),500);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_items jsonb;
  v_total bigint;
begin
  if v_tipo is not null and v_tipo not in ('entrada','saida') then
    raise exception 'Tipo deve ser entrada ou saida.';
  end if;
  if p_data_inicio is not null
     and p_data_fim is not null
     and p_data_fim<p_data_inicio then
    raise exception 'Periodo invalido.';
  end if;

  select count(*)
  into v_total
  from public.minha_casa_lancamentos l
  join public.minha_casa_categorias c on c.id=l.categoria_id
  join public.minha_casa_membros m on m.id=l.membro_id
  where l.familia_id=v_familia_id
    and (p_data_inicio is null or l.data>=p_data_inicio)
    and (p_data_fim is null or l.data<=p_data_fim)
    and (v_tipo is null or l.tipo=v_tipo)
    and (p_membro_id is null or l.membro_id=p_membro_id)
    and (p_categoria_id is null or l.categoria_id=p_categoria_id)
    and (
      v_busca is null
      or lower(l.descricao) like '%'||v_busca||'%'
      or lower(c.nome) like '%'||v_busca||'%'
      or lower(m.nome) like '%'||v_busca||'%'
      or replace(l.valor::text,'.',',') like '%'||replace(v_busca,'.',',')||'%'
    );

  select coalesce(jsonb_agg(x.item order by x.data desc,x.created_at desc),'[]'::jsonb)
  into v_items
  from (
    select
      l.data,
      l.created_at,
      jsonb_build_object(
        'id',l.id,
        'type',l.tipo,
        'amount',l.valor,
        'date',l.data,
        'categoryId',l.categoria_id,
        'categoryName',c.nome,
        'categoryEmoji',c.emoji,
        'categoryColor',c.cor,
        'memberId',l.membro_id,
        'memberName',m.nome,
        'memberEmoji',m.emoji,
        'description',l.descricao,
        'sourceType',l.origem_tipo,
        'sourceKey',l.origem_chave,
        'createdAt',l.created_at,
        'updatedAt',l.updated_at
      ) item
    from public.minha_casa_lancamentos l
    join public.minha_casa_categorias c on c.id=l.categoria_id
    join public.minha_casa_membros m on m.id=l.membro_id
    where l.familia_id=v_familia_id
      and (p_data_inicio is null or l.data>=p_data_inicio)
      and (p_data_fim is null or l.data<=p_data_fim)
      and (v_tipo is null or l.tipo=v_tipo)
      and (p_membro_id is null or l.membro_id=p_membro_id)
      and (p_categoria_id is null or l.categoria_id=p_categoria_id)
      and (
        v_busca is null
        or lower(l.descricao) like '%'||v_busca||'%'
        or lower(c.nome) like '%'||v_busca||'%'
        or lower(m.nome) like '%'||v_busca||'%'
        or replace(l.valor::text,'.',',') like '%'||replace(v_busca,'.',',')||'%'
      )
    order by l.data desc,l.created_at desc
    limit v_limite offset v_offset
  ) x;

  return jsonb_build_object(
    'items',v_items,
    'total',v_total,
    'limit',v_limite,
    'offset',v_offset
  );
end
$$;

revoke all on function public.minha_casa_carregar(text,text)
  from public,anon;
revoke all on function public.minha_casa_listar_lancamentos(
  date,date,text,uuid,uuid,text,integer,integer
) from public,anon;
grant execute on function public.minha_casa_carregar(text,text)
  to authenticated;
grant execute on function public.minha_casa_listar_lancamentos(
  date,date,text,uuid,uuid,text,integer,integer
) to authenticated;

commit;

-- Fim da migracao Minha Casa.
