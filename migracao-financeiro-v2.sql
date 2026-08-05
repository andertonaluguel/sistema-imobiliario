-- ============================================================
-- FINANCEIRO V2: cobrancas, recebimentos, papeis e arquivamento
-- Execute depois de:
--   1. schema.sql
--   2. migracao-versao-comercial-v1.sql
--   3. migracao-tipos-acesso.sql
--   4. migracao-portal-arquivos.sql
--   5. migracao-contratos-cobrancas.sql
--   6. migracao-vistoria-e-chamados.sql
-- Esta deve rodar depois das migracoes funcionais, para que permissoes e
-- auditoria tambem sejam instaladas nos chamados. Depois dela, instale
-- migracao-backup-v7.sql.
--
-- Pode ser executada novamente. A migracao preserva as tabelas antigas:
-- public.pagamentos e public.energia continuam sendo a fonte compativel
-- com a interface atual enquanto o Financeiro V2 e adotado por etapas.
-- ============================================================

begin;

do $precheck$
begin
  if to_regclass('public.imoveis') is null
     or to_regclass('public.inquilinos') is null
     or to_regclass('public.contratos') is null
     or to_regclass('public.pagamentos') is null
     or to_regclass('public.energia') is null
     or to_regclass('public.acessos_inquilino') is null
     or to_regclass('public.acessos_colaborador') is null
     or to_regclass('public.convites_colaborador') is null
     or to_regclass('public.chamados') is null then
    raise exception
      'Execute primeiro o esquema principal e as migracoes comercial, tipos de acesso, contratos e vistoria/chamados.';
  end if;

  if to_regprocedure('public.usuario_proprietario_id(uuid)') is null
     or to_regprocedure('public.e_acesso_operacional(uuid)') is null
     or to_regprocedure('public.portal_owner_id()') is null
     or to_regprocedure('public.portal_inquilino_id()') is null then
    raise exception
      'As funcoes de proprietario e portal ainda nao existem. Execute as migracoes de portal e tipos de acesso.';
  end if;
end
$precheck$;

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. Papeis de colaboradores
-- ------------------------------------------------------------

alter table public.acessos_colaborador
  add column if not exists papel text;
alter table public.convites_colaborador
  add column if not exists papel text;

-- Quem ja possuia acesso amplo continua com acesso amplo.
update public.acessos_colaborador
set papel='administrador'
where papel is null
   or papel not in ('administrador','financeiro','operacional','leitura');

update public.convites_colaborador
set papel='administrador'
where papel is null
   or papel not in ('administrador','financeiro','operacional','leitura');

alter table public.acessos_colaborador
  alter column papel set default 'administrador',
  alter column papel set not null;
alter table public.convites_colaborador
  alter column papel set default 'administrador',
  alter column papel set not null;

do $constraints$
begin
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.acessos_colaborador'::regclass
      and conname='acessos_colaborador_papel_check'
  ) then
    alter table public.acessos_colaborador
      add constraint acessos_colaborador_papel_check
      check (papel in ('administrador','financeiro','operacional','leitura'));
  end if;

  if not exists(
    select 1 from pg_constraint
    where conrelid='public.convites_colaborador'::regclass
      and conname='convites_colaborador_papel_check'
  ) then
    alter table public.convites_colaborador
      add constraint convites_colaborador_papel_check
      check (papel in ('administrador','financeiro','operacional','leitura'));
  end if;
end
$constraints$;

create or replace function public.papel_colaborador_atual(
  p_user_id uuid default auth.uid()
)
returns text
language sql
stable
security definer
set search_path=public
as $$
  select case
    when p_user_id is null then null
    when public.e_administrador_plataforma(p_user_id) then 'administrador'
    when public.usuario_proprietario_id(p_user_id)=p_user_id
      and exists(
        select 1 from public.proprietarios p where p.user_id=p_user_id
      )
      then 'administrador'
    else (
      select a.papel
      from public.acessos_colaborador a
      where a.user_id=p_user_id
        and a.ativo
      limit 1
    )
  end
$$;

create or replace function public.pode_ler_conta(
  p_proprietario_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select p_user_id is not null
    and p_proprietario_id is not null
    and public.usuario_proprietario_id(p_user_id)=p_proprietario_id
    and public.e_acesso_operacional(p_proprietario_id)
    and public.papel_colaborador_atual(p_user_id)
      in ('administrador','financeiro','operacional','leitura')
$$;

create or replace function public.pode_gerenciar_financeiro(
  p_proprietario_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select public.pode_ler_conta(p_proprietario_id,p_user_id)
    and public.papel_colaborador_atual(p_user_id)
      in ('administrador','financeiro')
$$;

create or replace function public.pode_operar_imoveis(
  p_proprietario_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select public.pode_ler_conta(p_proprietario_id,p_user_id)
    and public.papel_colaborador_atual(p_user_id)
      in ('administrador','operacional')
$$;

revoke all on function public.papel_colaborador_atual(uuid)
  from public,anon;
revoke all on function public.pode_ler_conta(uuid,uuid)
  from public,anon;
revoke all on function public.pode_gerenciar_financeiro(uuid,uuid)
  from public,anon;
revoke all on function public.pode_operar_imoveis(uuid,uuid)
  from public,anon;
grant execute on function public.papel_colaborador_atual(uuid)
  to authenticated;
grant execute on function public.pode_ler_conta(uuid,uuid)
  to authenticated;
grant execute on function public.pode_gerenciar_financeiro(uuid,uuid)
  to authenticated;
grant execute on function public.pode_operar_imoveis(uuid,uuid)
  to authenticated;

-- O fluxo antigo de criacao do usuario nao conhece o novo campo. O gatilho
-- copia o papel do convite antes de salvar o acesso aceito.
create or replace function public.aplicar_papel_convite_colaborador()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_papel text;
begin
  select c.papel into v_papel
  from public.convites_colaborador c
  where c.proprietario_id=new.proprietario_id
    and lower(trim(c.email))=lower(trim(new.email))
    and c.status in ('pendente','aceito')
  order by c.updated_at desc
  limit 1;

  if v_papel is not null then
    new.papel:=v_papel;
  end if;
  return new;
end
$$;

drop trigger if exists acessos_colaborador_aplicar_papel
  on public.acessos_colaborador;
create trigger acessos_colaborador_aplicar_papel
before insert or update of proprietario_id,email
on public.acessos_colaborador
for each row execute function public.aplicar_papel_convite_colaborador();

create or replace function public.criar_convite_colaborador_com_papel(
  p_nome text,
  p_email text,
  p_papel text default 'operacional'
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_owner uuid:=public.usuario_proprietario_id(auth.uid());
  v_result jsonb;
  v_convite_id uuid;
  v_papel text:=lower(trim(coalesce(p_papel,'')));
  v_email text:=lower(trim(coalesce(p_email,'')));
begin
  if v_papel not in ('administrador','financeiro','operacional','leitura') then
    raise exception 'Papel de colaborador invalido.';
  end if;
  if v_owner is null
     or (
       v_owner<>auth.uid()
       and not public.e_administrador_plataforma(auth.uid())
     ) then
    raise exception 'Somente o dono da conta pode gerenciar a equipe.';
  end if;

  v_result:=public.criar_convite_colaborador(p_nome,p_email);
  v_convite_id:=nullif(v_result->>'conviteId','')::uuid;

  update public.convites_colaborador
  set papel=v_papel,updated_at=now()
  where id=v_convite_id
    and proprietario_id=v_owner;

  update public.acessos_colaborador
  set papel=v_papel,updated_at=now()
  where proprietario_id=v_owner
    and lower(trim(email))=v_email;

  return v_result||jsonb_build_object('papel',v_papel);
end
$$;

create or replace function public.atualizar_colaborador_com_papel(
  p_user_id uuid,
  p_ativo boolean,
  p_papel text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_owner uuid:=public.usuario_proprietario_id(auth.uid());
  v_papel text:=lower(trim(coalesce(p_papel,'')));
begin
  if v_papel not in ('administrador','financeiro','operacional','leitura') then
    raise exception 'Papel de colaborador invalido.';
  end if;
  if v_owner is null
     or (
       v_owner<>auth.uid()
       and not public.e_administrador_plataforma(auth.uid())
     ) then
    raise exception 'Somente o dono da conta pode gerenciar a equipe.';
  end if;

  perform public.atualizar_colaborador(p_user_id,p_ativo);
  update public.acessos_colaborador
  set papel=v_papel,updated_at=now()
  where user_id=p_user_id
    and proprietario_id=v_owner;
end
$$;

create or replace function public.listar_colaboradores_com_papel()
returns table(
  convite_id uuid,
  user_id uuid,
  nome text,
  email text,
  ativo boolean,
  aceito boolean,
  status text,
  papel text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path=public
as $$
  with dono as (
    select public.usuario_proprietario_id(auth.uid()) id
  )
  select
    null::uuid,
    a.user_id,
    a.nome,
    a.email,
    a.ativo,
    true,
    'aceito'::text,
    a.papel,
    a.created_at
  from public.acessos_colaborador a
  cross join dono
  where (
      dono.id=auth.uid()
      or public.e_administrador_plataforma(auth.uid())
    )
    and a.proprietario_id=dono.id

  union all

  select
    c.id,
    null::uuid,
    c.nome,
    c.email,
    false,
    false,
    c.status,
    c.papel,
    c.created_at
  from public.convites_colaborador c
  cross join dono
  where (
      dono.id=auth.uid()
      or public.e_administrador_plataforma(auth.uid())
    )
    and c.proprietario_id=dono.id
    and c.status='pendente'
    and not exists(
      select 1
      from public.acessos_colaborador a
      where a.proprietario_id=c.proprietario_id
        and lower(trim(a.email))=lower(trim(c.email))
    )
  order by created_at desc
$$;

revoke all on function
  public.criar_convite_colaborador_com_papel(text,text,text)
  from public,anon;
revoke all on function
  public.atualizar_colaborador_com_papel(uuid,boolean,text)
  from public,anon;
revoke all on function public.listar_colaboradores_com_papel()
  from public,anon;
grant execute on function
  public.criar_convite_colaborador_com_papel(text,text,text)
  to authenticated;
grant execute on function
  public.atualizar_colaborador_com_papel(uuid,boolean,text)
  to authenticated;
grant execute on function public.listar_colaboradores_com_papel()
  to authenticated;

-- ------------------------------------------------------------
-- 2. Arquivamento recuperavel
-- ------------------------------------------------------------

do $archive_columns$
declare
  t text;
begin
  foreach t in array array[
    'imoveis','inquilinos','contratos','pagamentos','energia','despesas',
    'aluguel_historico'
  ]
  loop
    execute format(
      'alter table public.%I add column if not exists arquivado_em timestamptz',
      t
    );
    execute format(
      'alter table public.%I add column if not exists arquivado_por uuid references auth.users(id) on delete set null',
      t
    );
    execute format(
      'alter table public.%I add column if not exists motivo_arquivamento text not null default ''''',
      t
    );
    execute format(
      'create index if not exists %I on public.%I(user_id,arquivado_em)',
      'idx_'||t||'_arquivado',
      t
    );
  end loop;
end
$archive_columns$;

-- Os indices compostos permitem FKs que tambem validam o dono da conta.
create unique index if not exists idx_imoveis_id_user
  on public.imoveis(id,user_id);
create unique index if not exists idx_inquilinos_id_user
  on public.inquilinos(id,user_id);
create unique index if not exists idx_contratos_id_user
  on public.contratos(id,user_id);

-- O valor atual do contrato pode mudar, mas o valor-base nunca deve ser
-- reescrito retroativamente. Instalacoes antigas recebem o valor atual como
-- base inicial; os reajustes confirmados abaixo passam a formar a linha do
-- tempo daquele contrato.
alter table public.contratos
  add column if not exists valor_inicial numeric(12,2),
  add column if not exists valor_inicial_revisar boolean
    not null default false,
  add column if not exists valor_inicial_origem text
    not null default 'migracao_valor_atual';

update public.contratos
set valor_inicial=greatest(coalesce(valor,0),0)
where valor_inicial is null;

update public.contratos
set valor_inicial_revisar=true
where valor_inicial_origem='migracao_valor_atual'
  and valor_inicial_revisar is distinct from true;

alter table public.contratos
  alter column valor_inicial set not null;

do $valor_inicial_constraint$
begin
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.contratos'::regclass
      and conname='contratos_valor_inicial_check'
  ) then
    alter table public.contratos
      add constraint contratos_valor_inicial_check
      check (valor_inicial>=0);
  end if;
end
$valor_inicial_constraint$;

create or replace function public.contrato_definir_valor_inicial()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.valor_inicial is null then
    new.valor_inicial:=greatest(coalesce(new.valor,0),0);
  end if;
  new.valor_inicial_revisar:=coalesce(new.valor_inicial_revisar,false);
  if nullif(trim(coalesce(new.valor_inicial_origem,'')),'') is null
     or new.valor_inicial_origem='migracao_valor_atual' then
    new.valor_inicial_origem:='cadastro_contrato';
  end if;
  -- Os marcadores antigos deixam de representar dinheiro. Todo recebimento
  -- novo, inclusive parcial, vive em financeiro_recebimentos.
  new.proporcional_pago:=false;
  new.proporcional_data_pagamento:=null;
  return new;
end
$$;

drop trigger if exists contrato_definir_valor_inicial
  on public.contratos;
create trigger contrato_definir_valor_inicial
before insert on public.contratos
for each row execute function public.contrato_definir_valor_inicial();

-- Reajustes deixam de ser um historico solto do imovel: cada registro fica
-- ligado ao contrato correto e vale desde o primeiro dia de uma competencia.
alter table public.aluguel_historico
  add column if not exists contrato_id uuid,
  add column if not exists confirmado_em timestamptz,
  add column if not exists confirmado_por uuid
    references auth.users(id) on delete set null,
  add column if not exists motivo text not null default '',
  add column if not exists updated_at timestamptz not null default now();

-- Primeiro tenta o vinculo pela data original, antes de reduzir a
-- competencia ao primeiro dia do mes. Isso preserva a desambiguacao quando
-- houve troca de contrato no meio do mes.
with exact_candidates as (
  select
    h.id,
    count(*) as quantidade,
    (array_agg(c.id order by c.inicio desc,c.created_at desc,c.id))[1]
      as contrato_id
  from public.aluguel_historico h
  join public.contratos c
    on c.user_id=h.user_id
   and c.imovel_id=h.imovel_id
   and c.inicio<=h.data_inicio
   and coalesce(c.fim,'9999-12-31'::date)>=h.data_inicio
  where h.contrato_id is null
    and h.confirmado_em is null
  group by h.id
)
update public.aluguel_historico h
set contrato_id=x.contrato_id
from exact_candidates x
where h.id=x.id
  and x.quantidade=1;

-- Somente um ponto que coincide exatamente com o inicio original do
-- contrato prova o valor-base. Pontos apenas no mesmo mes podem representar
-- reajuste posterior e nao sao usados para reescrever o passado.
with exact_initial as (
  select distinct on (h.contrato_id)
    h.contrato_id,
    h.valor
  from public.aluguel_historico h
  join public.contratos c
    on c.id=h.contrato_id
   and c.user_id=h.user_id
   and c.inicio=h.data_inicio
  where h.contrato_id is not null
    and h.confirmado_em is null
  order by h.contrato_id,h.created_at,h.id
)
update public.contratos c
set valor_inicial=e.valor,
    valor_inicial_revisar=false,
    valor_inicial_origem='historico_inicio_exato'
from exact_initial e
where e.contrato_id=c.id
  and c.valor_inicial_origem='migracao_valor_atual';

-- Para os registros restantes, o mes so e usado quando existe exatamente
-- um contrato candidato. Em caso ambiguo, o dado fica sem contrato e recebe
-- uma marca de revisao, em vez de ser ligado silenciosamente ao morador
-- errado.
with candidates as (
  select
    h.id,
    min(c.id::text)::uuid as contrato_id,
    count(*) as quantidade
  from public.aluguel_historico h
  join public.contratos c
    on c.user_id=h.user_id
   and c.imovel_id=h.imovel_id
   and c.inicio<=(
     date_trunc('month',h.data_inicio)::date
     + interval '1 month - 1 day'
   )::date
   and coalesce(c.fim,'9999-12-31'::date)>=
     date_trunc('month',h.data_inicio)::date
  where h.contrato_id is null
    and h.confirmado_em is null
  group by h.id
)
update public.aluguel_historico h
set contrato_id=c.contrato_id
from candidates c
where h.id=c.id
  and c.quantidade=1;

update public.aluguel_historico
set motivo=concat_ws(
      ' ',
      nullif(trim(motivo),''),
      'Migração: contrato não identificado com segurança; revisar.'
    )
where contrato_id is null
  and confirmado_em is null
  and motivo not ilike
    '%contrato não identificado com segurança%';

update public.aluguel_historico
set data_inicio=date_trunc('month',data_inicio)::date,
    confirmado_em=coalesce(confirmado_em,created_at,now()),
    updated_at=coalesce(updated_at,created_at,now())
where data_inicio is distinct from date_trunc('month',data_inicio)::date
   or confirmado_em is null
   or updated_at is null;

do $historico_contract_fk$
begin
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.aluguel_historico'::regclass
      and conname='aluguel_historico_contrato_owner_fk'
  ) then
    alter table public.aluguel_historico
      add constraint aluguel_historico_contrato_owner_fk
      foreign key (contrato_id,user_id)
      references public.contratos(id,user_id)
      on delete cascade;
  end if;
end
$historico_contract_fk$;

-- Duplicidades antigas da mesma competencia sao preservadas como arquivadas,
-- em vez de apagadas.
with ranked as (
  select
    h.id,
    row_number() over(
      partition by h.user_id,h.imovel_id,h.contrato_id,h.data_inicio
      order by h.confirmado_em desc,h.created_at desc,h.id desc
    ) as posicao
  from public.aluguel_historico h
  where h.arquivado_em is null
)
update public.aluguel_historico h
set arquivado_em=now(),
    motivo_arquivamento='Duplicidade anterior preservada pela migracao.'
from ranked r
where h.id=r.id
  and r.posicao>1;

create unique index if not exists idx_aluguel_historico_contrato_mes_ativo
  on public.aluguel_historico(user_id,contrato_id,data_inicio)
  where contrato_id is not null and arquivado_em is null;
create unique index if not exists idx_aluguel_historico_imovel_mes_ativo
  on public.aluguel_historico(user_id,imovel_id,data_inicio)
  where contrato_id is null and arquivado_em is null;

create or replace function public.validar_reajuste_contrato()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_contract public.contratos%rowtype;
  v_owner uuid:=public.usuario_proprietario_id(auth.uid());
  v_month_start date;
  v_month_end date;
  v_matches integer:=0;
  v_contract_id uuid;
begin
  new.data_inicio:=date_trunc('month',new.data_inicio)::date;
  v_month_start:=new.data_inicio;
  v_month_end:=(v_month_start+interval '1 month - 1 day')::date;

  if tg_op='UPDATE' and old.confirmado_em is not null then
    if (
       new.user_id is distinct from old.user_id
       or new.imovel_id is distinct from old.imovel_id
       or new.contrato_id is distinct from old.contrato_id
       or new.valor is distinct from old.valor
       or new.data_inicio is distinct from old.data_inicio
       or new.motivo is distinct from old.motivo
    ) then
      raise exception
        'Reajuste confirmado nao pode ser reescrito. Arquive-o e confirme outro.';
    end if;
    new.confirmado_em:=old.confirmado_em;
    new.confirmado_por:=old.confirmado_por;
  end if;

  if new.contrato_id is null then
    select
      count(*),
      (array_agg(c.id order by c.inicio desc,c.created_at desc,c.id))[1]
    into v_matches,v_contract_id
    from public.contratos c
    where c.user_id=new.user_id
      and c.imovel_id=new.imovel_id
      and c.inicio<=v_month_end
      and coalesce(c.fim,'9999-12-31'::date)>=v_month_start;
    if v_matches=1 then
      new.contrato_id:=v_contract_id;
      select c.* into v_contract
      from public.contratos c
      where c.id=v_contract_id;
    elsif v_matches>1 then
      raise exception
        'Mais de um contrato coincide com esta competencia. Escolha o contrato.';
    end if;
  else
    select c.* into v_contract
    from public.contratos c
    where c.id=new.contrato_id
      and c.user_id=new.user_id
      and c.imovel_id=new.imovel_id;
    if not found then
      raise exception 'O reajuste nao pertence a este contrato e imovel.';
    end if;
  end if;

  if new.contrato_id is not null
     and (
       v_contract.inicio>v_month_end
       or coalesce(v_contract.fim,'9999-12-31'::date)<v_month_start
     ) then
    raise exception 'A competencia do reajuste esta fora do contrato.';
  end if;

  if v_owner is not null and new.user_id is distinct from v_owner then
    raise exception 'O reajuste nao pertence a conta atual.';
  end if;

  if tg_op='INSERT'
     and auth.uid() is not null
     and coalesce(current_setting('app.restaurando_backup',true),'')<>'1' then
    new.confirmado_em:=now();
    new.confirmado_por:=auth.uid();
  else
    new.confirmado_em:=coalesce(new.confirmado_em,now());
    new.confirmado_por:=coalesce(new.confirmado_por,auth.uid());
  end if;
  new.updated_at:=now();
  return new;
end
$$;

drop trigger if exists validar_reajuste_contrato
  on public.aluguel_historico;
create trigger validar_reajuste_contrato
before insert or update on public.aluguel_historico
for each row execute function public.validar_reajuste_contrato();

-- Depois de criado, o valor-base do contrato nao pode ser reescrito. As
-- demais condicoes financeiras tambem ficam congeladas assim que existe
-- qualquer movimentacao; correcoes posteriores devem ser um novo contrato
-- ou um reajuste confirmado, nunca uma alteracao retroativa.
create or replace function public.proteger_historico_contrato()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_has_history boolean:=false;
  v_review_mode boolean:=
    coalesce(current_setting('app.confirmando_valor_inicial',true),'')='1';
begin
  if coalesce(current_setting('app.restaurando_backup',true),'')='1' then
    return new;
  end if;

  if new.valor_inicial is distinct from old.valor_inicial
     or new.valor_inicial_revisar
       is distinct from old.valor_inicial_revisar
     or new.valor_inicial_origem
       is distinct from old.valor_inicial_origem
     or new.valor is distinct from old.valor then
    if not v_review_mode then
      raise exception
        'O valor-base do contrato e imutavel. Use Propor reajuste.';
    end if;
  end if;

  if new.proporcional_pago is distinct from old.proporcional_pago
     or new.proporcional_data_pagamento
       is distinct from old.proporcional_data_pagamento then
    raise exception
      'Os marcadores antigos de pagamento sao somente leitura. Registre parcelas no Financeiro.';
  end if;

  if new.tenant_id is distinct from old.tenant_id
     or new.inicio is distinct from old.inicio
     or new.dia_vencimento is distinct from old.dia_vencimento
     or new.modalidade_vencimento is distinct from old.modalidade_vencimento
     or new.proporcional_dias is distinct from old.proporcional_dias
     or new.proporcional_valor is distinct from old.proporcional_valor then
    select
      exists(
        select 1
        from public.pagamentos p
        where p.contrato_id=old.id
          and p.arquivado_em is null
      )
      or exists(
        select 1
        from public.aluguel_historico h
        where h.contrato_id=old.id
          and h.arquivado_em is null
      )
      or (
        to_regclass('public.financeiro_cobrancas') is not null
        and exists(
          select 1
          from public.financeiro_cobrancas c
          where c.contrato_id=old.id
            and c.arquivado_em is null
        )
      )
    into v_has_history;

    if v_has_history then
      raise exception
        'Este contrato ja possui historico financeiro. Encerre-o e crie outro para mudar suas condicoes.';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists proteger_historico_contrato
  on public.contratos;
create trigger proteger_historico_contrato
before update on public.contratos
for each row execute function public.proteger_historico_contrato();

-- A única exceção à imutabilidade é a conferência explícita dos contratos
-- herdados. Ela é feita uma só vez, por administrador, e passa pelo gatilho
-- de auditoria. Reajustes normais nunca usam esta função.
create or replace function public.confirmar_valor_inicial_contrato(
  p_contrato_id uuid,
  p_valor numeric
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_owner uuid:=public.usuario_proprietario_id(auth.uid());
  v_contract public.contratos%rowtype;
  v_origin text;
begin
  if v_owner is null
     or public.papel_colaborador_atual(auth.uid())<>'administrador'
     or not public.pode_ler_conta(v_owner,auth.uid()) then
    raise exception
      'Somente administradores podem conferir o valor inicial.';
  end if;
  if p_valor is null or p_valor<=0 then
    raise exception 'Informe um valor inicial maior que zero.';
  end if;

  select c.* into v_contract
  from public.contratos c
  where c.id=p_contrato_id
    and c.user_id=v_owner
    and c.arquivado_em is null
  for update;
  if not found then
    raise exception 'Contrato nao encontrado.';
  end if;
  if not v_contract.valor_inicial_revisar then
    raise exception 'O valor inicial deste contrato ja foi conferido.';
  end if;
  if abs(v_contract.valor_inicial-p_valor)>=0.005
     and to_regclass('public.financeiro_cobrancas') is not null
     and exists(
       select 1
       from public.financeiro_cobrancas c
       where c.user_id=v_owner
         and c.contrato_id=v_contract.id
         and c.arquivado_em is null
     ) then
    raise exception
      'Arquive primeiro as cobrancas ja geradas para corrigir o valor inicial.';
  end if;

  v_origin:=case
    when abs(v_contract.valor_inicial-p_valor)<0.005
      then 'revisao_manual_confirmada'
    else 'revisao_manual_corrigida'
  end;
  perform set_config('app.confirmando_valor_inicial','1',true);
  update public.contratos
  set valor=p_valor,
      valor_inicial=p_valor,
      valor_inicial_revisar=false,
      valor_inicial_origem=v_origin,
      updated_at=now()
  where id=v_contract.id
    and user_id=v_owner;
  perform set_config('app.confirmando_valor_inicial','0',true);

  return jsonb_build_object(
    'id',v_contract.id,
    'valorInicial',p_valor,
    'valorInicialRevisar',false,
    'valorInicialOrigem',v_origin
  );
end
$$;

create or replace function public.valor_aluguel_contrato_mes(
  p_contrato_id uuid,
  p_competencia text
)
returns numeric
language sql
stable
security definer
set search_path=public
as $$
  select coalesce(
    (
      select h.valor
      from public.aluguel_historico h
      where h.contrato_id=c.id
        and h.user_id=c.user_id
        and h.arquivado_em is null
        and substring(h.data_inicio::text,1,7)<=p_competencia
      order by h.data_inicio desc,h.confirmado_em desc
      limit 1
    ),
    c.valor_inicial,
    c.valor,
    0
  )
  from public.contratos c
  where c.id=p_contrato_id
    and (
      auth.uid() is null
      or public.pode_ler_conta(c.user_id,auth.uid())
    )
$$;

revoke all on function public.contrato_definir_valor_inicial()
  from public,anon,authenticated;
revoke all on function public.validar_reajuste_contrato()
  from public,anon,authenticated;
revoke all on function public.proteger_historico_contrato()
  from public,anon,authenticated;
revoke all on function public.confirmar_valor_inicial_contrato(uuid,numeric)
  from public,anon;
grant execute on function public.confirmar_valor_inicial_contrato(uuid,numeric)
  to authenticated;
revoke all on function public.valor_aluguel_contrato_mes(uuid,text)
  from public,anon;
grant execute on function public.valor_aluguel_contrato_mes(uuid,text)
  to authenticated;

-- ------------------------------------------------------------
-- 3. Cobrancas e recebimentos independentes
-- ------------------------------------------------------------

create table if not exists public.financeiro_cobrancas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references auth.users(id) on delete cascade,
  imovel_id uuid not null,
  contrato_id uuid,
  inquilino_id uuid,
  competencia text not null
    check (competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  tipo text not null default 'aluguel'
    check (tipo in ('aluguel','energia','ajuste','outro')),
  descricao text not null default '',
  valor_previsto numeric(12,2) not null default 0
    check (valor_previsto>=0),
  vencimento date not null,
  tolerancia_dias integer not null default 5
    check (tolerancia_dias between 0 and 60),
  origem_tipo text not null default 'manual',
  origem_id uuid,
  observacao text not null default '',
  arquivado_em timestamptz,
  arquivado_por uuid references auth.users(id) on delete set null,
  motivo_arquivamento text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financeiro_cobrancas_imovel_owner_fk
    foreign key (imovel_id,user_id)
    references public.imoveis(id,user_id)
    on delete cascade,
  constraint financeiro_cobrancas_contrato_owner_fk
    foreign key (contrato_id,user_id)
    references public.contratos(id,user_id)
    on delete cascade,
  constraint financeiro_cobrancas_inquilino_owner_fk
    foreign key (inquilino_id,user_id)
    references public.inquilinos(id,user_id)
    on delete cascade,
  constraint financeiro_cobrancas_origem_key
    unique (user_id,origem_tipo,origem_id)
);

create unique index if not exists idx_financeiro_cobrancas_id_user
  on public.financeiro_cobrancas(id,user_id);
create index if not exists idx_financeiro_cobrancas_conta_competencia
  on public.financeiro_cobrancas(user_id,competencia,vencimento);
create index if not exists idx_financeiro_cobrancas_imovel
  on public.financeiro_cobrancas(imovel_id,competencia);
create unique index if not exists idx_financeiro_cobranca_mensal_ativa
  on public.financeiro_cobrancas(
    user_id,
    imovel_id,
    coalesce(contrato_id,'00000000-0000-0000-0000-000000000000'::uuid),
    competencia,
    tipo
  )
  where arquivado_em is null
    and tipo in ('aluguel','energia');

create table if not exists public.financeiro_recebimentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references auth.users(id) on delete cascade,
  cobranca_id uuid not null,
  valor numeric(12,2) not null
    check (valor>0),
  data_pagamento date not null,
  competencia_caixa text not null
    check (competencia_caixa ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  forma text not null default '',
  observacao text not null default '',
  origem_tipo text not null default 'manual',
  origem_id uuid,
  arquivado_em timestamptz,
  arquivado_por uuid references auth.users(id) on delete set null,
  motivo_arquivamento text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financeiro_recebimentos_cobranca_owner_fk
    foreign key (cobranca_id,user_id)
    references public.financeiro_cobrancas(id,user_id)
    on delete cascade,
  constraint financeiro_recebimentos_origem_key
    unique (user_id,origem_tipo,origem_id)
);

create index if not exists idx_financeiro_recebimentos_cobranca
  on public.financeiro_recebimentos(cobranca_id,data_pagamento);
create index if not exists idx_financeiro_recebimentos_conta_caixa
  on public.financeiro_recebimentos(user_id,competencia_caixa,data_pagamento);

create or replace function public.financeiro_preparar_lancamento()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_owner uuid;
  v_charge_owner uuid;
  v_contract public.contratos%rowtype;
begin
  if auth.uid() is null then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;

  v_owner:=public.usuario_proprietario_id(auth.uid());
  if v_owner is null then
    raise exception 'Seu papel nao permite alterar o financeiro.';
  end if;

  if tg_table_name='financeiro_cobrancas' then
    if not (
      public.pode_gerenciar_financeiro(v_owner,auth.uid())
      or (
        public.pode_operar_imoveis(v_owner,auth.uid())
        and (
          new.tipo='energia'
          or (
            new.tipo='ajuste'
            and new.origem_tipo='contrato_ajuste'
          )
        )
      )
    ) then
      raise exception 'Seu papel nao permite alterar o financeiro.';
    end if;
  elsif tg_table_name='financeiro_recebimentos' then
    if not public.pode_gerenciar_financeiro(v_owner,auth.uid()) then
      raise exception 'Seu papel nao permite alterar o financeiro.';
    end if;
  else
    raise exception 'Tabela financeira inesperada.';
  end if;

  new.user_id:=v_owner;
  new.updated_at:=now();

  if tg_table_name='financeiro_cobrancas' then
    if not exists(
      select 1 from public.imoveis i
      where i.id=new.imovel_id
        and i.user_id=v_owner
        and i.arquivado_em is null
    ) then
      raise exception 'Imovel invalido ou arquivado.';
    end if;

    if new.contrato_id is not null then
      select c.* into v_contract
      from public.contratos c
      where c.id=new.contrato_id
        and c.user_id=v_owner
        and c.imovel_id=new.imovel_id
        and c.arquivado_em is null;
      if not found then
        raise exception 'O contrato nao pertence a este imovel.';
      end if;
      if new.inquilino_id is not null
         and new.inquilino_id is distinct from v_contract.tenant_id then
        raise exception 'O inquilino nao pertence a este contrato.';
      end if;
      new.inquilino_id:=v_contract.tenant_id;
      if new.tipo in ('aluguel','ajuste')
         and new.origem_tipo<>'pagamento_legado'
         and (
           new.vencimento<v_contract.inicio
           or new.vencimento>coalesce(v_contract.fim,'9999-12-31'::date)
         ) then
        raise exception 'O vencimento esta fora do periodo do contrato.';
      end if;
    elsif new.inquilino_id is not null
          and not exists(
            select 1 from public.inquilinos t
            where t.id=new.inquilino_id
              and t.user_id=v_owner
              and t.arquivado_em is null
          ) then
      raise exception 'Inquilino invalido ou arquivado.';
    end if;
  elsif tg_table_name='financeiro_recebimentos' then
    select c.user_id into v_charge_owner
    from public.financeiro_cobrancas c
    where c.id=new.cobranca_id
      and c.arquivado_em is null;

    if v_charge_owner is distinct from v_owner then
      raise exception 'Cobranca invalida ou arquivada.';
    end if;
    if new.competencia_caixa is null
       or new.competencia_caixa='' then
      new.competencia_caixa:=substring(new.data_pagamento::text,1,7);
    end if;
  end if;

  if tg_op='DELETE' then return old; end if;
  return new;
end
$$;

drop trigger if exists financeiro_cobrancas_preparar
  on public.financeiro_cobrancas;
create trigger financeiro_cobrancas_preparar
before insert or update on public.financeiro_cobrancas
for each row execute function public.financeiro_preparar_lancamento();

drop trigger if exists financeiro_recebimentos_preparar
  on public.financeiro_recebimentos;
create trigger financeiro_recebimentos_preparar
before insert or update on public.financeiro_recebimentos
for each row execute function public.financeiro_preparar_lancamento();

-- A situacao e calculada na leitura. Assim, uma cobranca muda para atraso
-- com a passagem do tempo sem depender de um processo automatico noturno.
create or replace view public.financeiro_cobrancas_resumo
with (security_invoker=true)
as
select
  c.*,
  c.competencia as mes,
  coalesce(r.total_recebido,0)::numeric(12,2) as total_recebido,
  greatest(c.valor_previsto-coalesce(r.total_recebido,0),0)::numeric(12,2)
    as saldo_aberto,
  greatest(coalesce(r.total_recebido,0)-c.valor_previsto,0)::numeric(12,2)
    as credito_a_favor,
  r.primeiro_pagamento,
  r.ultimo_pagamento,
  case
    when c.valor_previsto=0 then 'sem_cobranca'
    when coalesce(r.total_recebido,0)=0
      and current_date>(c.vencimento+c.tolerancia_dias)
      then 'em_atraso'
    when coalesce(r.total_recebido,0)=0
      and current_date>c.vencimento
      then 'em_tolerancia'
    when coalesce(r.total_recebido,0)=0 then 'a_vencer'
    when coalesce(r.total_recebido,0)<c.valor_previsto
      and current_date>(c.vencimento+c.tolerancia_dias)
      then 'pagamento_parcial_em_atraso'
    when coalesce(r.total_recebido,0)<c.valor_previsto
      then 'pagamento_parcial'
    when coalesce(r.total_recebido,0)>c.valor_previsto
      then 'credito_a_favor'
    when r.ultimo_pagamento>(c.vencimento+c.tolerancia_dias)
      then 'pago_com_atraso'
    else 'pago'
  end as status
from public.financeiro_cobrancas c
join public.imoveis i
  on i.id=c.imovel_id
 and i.user_id=c.user_id
 and i.arquivado_em is null
left join lateral (
  select
    sum(x.valor) as total_recebido,
    min(x.data_pagamento) as primeiro_pagamento,
    max(x.data_pagamento) as ultimo_pagamento
  from public.financeiro_recebimentos x
  where x.cobranca_id=c.id
    and x.user_id=c.user_id
    and x.arquivado_em is null
) r on true
where c.arquivado_em is null;

-- O portal não recebe SELECT direto nas tabelas financeiras. Esta RPC
-- devolve somente campos necessários à própria tela e somente do vínculo
-- autenticado, sem IDs de origem, auditoria ou metadados internos.
create or replace function public.carregar_financeiro_portal()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_owner uuid:=public.portal_owner_id();
  v_tenant uuid:=public.portal_inquilino_id();
  v_charges jsonb;
  v_receipts jsonb;
  v_adjustments jsonb;
begin
  if v_owner is null or v_tenant is null then
    raise exception 'Acesso de inquilino inativo.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,
    'imovel_id',c.imovel_id,
    'contrato_id',c.contrato_id,
    'inquilino_id',c.inquilino_id,
    'competencia',c.competencia,
    'mes',c.competencia,
    'tipo',c.tipo,
    'descricao',c.descricao,
    'valor_previsto',c.valor_previsto,
    'vencimento',c.vencimento,
    'tolerancia_dias',c.tolerancia_dias,
    'total_recebido',c.total_recebido,
    'saldo_aberto',c.saldo_aberto,
    'credito_a_favor',c.credito_a_favor,
    'primeiro_pagamento',c.primeiro_pagamento,
    'ultimo_pagamento',c.ultimo_pagamento,
    'status',c.status
  ) order by c.competencia,c.vencimento,c.id),'[]'::jsonb)
  into v_charges
  from public.financeiro_cobrancas_resumo c
  where c.user_id=v_owner
    and c.inquilino_id=v_tenant;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,
    'cobranca_id',r.cobranca_id,
    'valor',r.valor,
    'data_pagamento',r.data_pagamento,
    'competencia_caixa',r.competencia_caixa,
    'forma',r.forma,
    'observacao',r.observacao
  ) order by r.data_pagamento,r.created_at,r.id),'[]'::jsonb)
  into v_receipts
  from public.financeiro_recebimentos r
  join public.financeiro_cobrancas c
    on c.id=r.cobranca_id
   and c.user_id=r.user_id
  where r.user_id=v_owner
    and r.arquivado_em is null
    and c.arquivado_em is null
    and c.inquilino_id=v_tenant;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',h.id,
    'imovel_id',h.imovel_id,
    'contrato_id',h.contrato_id,
    'valor',h.valor,
    'data_inicio',h.data_inicio,
    'motivo',h.motivo,
    'confirmado_em',h.confirmado_em
  ) order by h.data_inicio,h.id),'[]'::jsonb)
  into v_adjustments
  from public.aluguel_historico h
  join public.contratos c
    on c.id=h.contrato_id
   and c.user_id=h.user_id
  where h.user_id=v_owner
    and h.arquivado_em is null
    and c.tenant_id=v_tenant;

  return jsonb_build_object(
    'charges',v_charges,
    'receipts',v_receipts,
    'adjustments',v_adjustments
  );
end
$$;

revoke all on function public.carregar_financeiro_portal()
  from public,anon,authenticated;
grant execute on function public.carregar_financeiro_portal()
  to authenticated;

-- ------------------------------------------------------------
-- 4. Backfill sem duplicidade
-- ------------------------------------------------------------

create or replace function public.financeiro_vencimento_mes(
  p_competencia text,
  p_dia integer
)
returns date
language sql
immutable
set search_path=public
as $$
  select (
    date_trunc('month',(p_competencia||'-01')::date)
    + (
        least(
          greatest(coalesce(p_dia,5),1),
          extract(
            day from (
              date_trunc('month',(p_competencia||'-01')::date)
              + interval '1 month - 1 day'
            )
          )::integer
        )-1
      )*interval '1 day'
  )::date
$$;

-- Alugueis ja marcados na tabela antiga.
insert into public.financeiro_cobrancas(
  user_id,imovel_id,contrato_id,inquilino_id,competencia,tipo,descricao,
  valor_previsto,vencimento,tolerancia_dias,origem_tipo,origem_id,observacao,
  created_at,updated_at
)
select
  p.user_id,
  p.imovel_id,
  c.id,
  c.tenant_id,
  p.mes,
  'aluguel',
  'Aluguel '||p.mes,
  greatest(
    case
      when c.id is not null then coalesce(
        public.valor_aluguel_contrato_mes(c.id,p.mes),
        c.valor_inicial,
        c.valor,
        i.aluguel_valor,
        0
      )
      else coalesce(nullif(i.aluguel_valor,0),p.valor_pago,0)
    end,
    0
  ),
  public.financeiro_vencimento_mes(
    p.mes,
    coalesce(c.dia_vencimento,i.dia_vencimento,5)
  ),
  5,
  'pagamento_legado',
  p.id,
  case
    when c.id is null
      then 'Importado de public.pagamentos sem contrato validado; revisar o valor previsto.'
    else 'Importado automaticamente de public.pagamentos.'
  end,
  coalesce(p.created_at,now()),
  now()
from public.pagamentos p
join public.imoveis i
  on i.id=p.imovel_id
 and i.user_id=p.user_id
left join public.contratos c
  on c.id=p.contrato_id
 and c.imovel_id=p.imovel_id
 and c.user_id=p.user_id
where p.mes ~ '^\d{4}-(0[1-9]|1[0-2])$'
on conflict do nothing;

insert into public.financeiro_recebimentos(
  user_id,cobranca_id,valor,data_pagamento,competencia_caixa,
  forma,observacao,origem_tipo,origem_id,created_at,updated_at
)
select
  p.user_id,
  c.id,
  p.valor_pago,
  coalesce(p.data_pagamento,p.created_at::date,(p.mes||'-01')::date),
  substring(
    coalesce(p.data_pagamento,p.created_at::date,(p.mes||'-01')::date)::text,
    1,
    7
  ),
  '',
  case
    when p.data_pagamento is null
      then 'Data original ausente; usada a data de criacao do registro.'
    else 'Importado automaticamente de public.pagamentos.'
  end,
  'pagamento_legado',
  p.id,
  coalesce(p.created_at,now()),
  now()
from public.pagamentos p
join lateral (
  select c.id
  from public.financeiro_cobrancas c
  where c.user_id=p.user_id
    and c.arquivado_em is null
    and (
      (
        c.origem_tipo='pagamento_legado'
        and c.origem_id=p.id
      )
      or (
        c.imovel_id=p.imovel_id
        and c.contrato_id is not distinct from p.contrato_id
        and c.competencia=p.mes
        and c.tipo='aluguel'
      )
    )
  order by
    (c.origem_tipo='pagamento_legado' and c.origem_id=p.id) desc,
    c.created_at,
    c.id
  limit 1
) c on true
where p.valor_pago>0
on conflict do nothing;

-- Ajustes proporcionais antigos ficavam gravados no proprio contrato.
insert into public.financeiro_cobrancas(
  user_id,imovel_id,contrato_id,inquilino_id,competencia,tipo,descricao,
  valor_previsto,vencimento,tolerancia_dias,origem_tipo,origem_id,observacao,
  created_at,updated_at
)
select
  c.user_id,
  c.imovel_id,
  c.id,
  c.tenant_id,
  substring(c.inicio::text,1,7),
  'ajuste',
  'Ajuste inicial do contrato',
  c.proporcional_valor,
  c.inicio,
  5,
  'contrato_ajuste',
  c.id,
  'Importado do ajuste proporcional armazenado no contrato.',
  coalesce(c.created_at,now()),
  now()
from public.contratos c
join public.imoveis i
  on i.id=c.imovel_id
 and i.user_id=c.user_id
where c.inicio is not null
  and c.proporcional_valor>0
on conflict do nothing;

insert into public.financeiro_recebimentos(
  user_id,cobranca_id,valor,data_pagamento,competencia_caixa,
  forma,observacao,origem_tipo,origem_id,created_at,updated_at
)
select
  c.user_id,
  f.id,
  c.proporcional_valor,
  coalesce(
    c.proporcional_data_pagamento,
    c.updated_at::date,
    c.created_at::date,
    c.inicio
  ),
  substring(
    coalesce(
      c.proporcional_data_pagamento,
      c.updated_at::date,
      c.created_at::date,
      c.inicio
    )::text,
    1,
    7
  ),
  '',
  case
    when c.proporcional_data_pagamento is null
      then 'Data original ausente; usada a ultima data disponivel do contrato.'
    else 'Importado do ajuste proporcional armazenado no contrato.'
  end,
  'ajuste_legado',
  c.id,
  coalesce(c.updated_at,c.created_at,now()),
  now()
from public.contratos c
join public.financeiro_cobrancas f
  on f.user_id=c.user_id
 and f.origem_tipo='contrato_ajuste'
 and f.origem_id=c.id
where c.proporcional_pago
  and c.proporcional_valor>0
on conflict do nothing;

-- Energia existente. origem_id liga a cobranca diretamente a leitura.
insert into public.financeiro_cobrancas(
  user_id,imovel_id,contrato_id,inquilino_id,competencia,tipo,descricao,
  valor_previsto,vencimento,tolerancia_dias,origem_tipo,origem_id,observacao,
  created_at,updated_at
)
select
  e.user_id,
  e.imovel_id,
  c.id,
  c.tenant_id,
  e.mes,
  'energia',
  'Energia '||e.mes,
  greatest(coalesce(e.valor,0),0),
  coalesce(
    e.vencimento,
    public.financeiro_vencimento_mes(
      e.mes,
      coalesce(i.energia_dia_vencimento,5)
    )
  ),
  5,
  'energia',
  e.id,
  'Gerada a partir do registro de leitura de energia.',
  coalesce(e.created_at,now()),
  now()
from public.energia e
join public.imoveis i
  on i.id=e.imovel_id
 and i.user_id=e.user_id
left join public.contratos c
  on c.id=e.contrato_id
 and c.imovel_id=e.imovel_id
 and c.user_id=e.user_id
where e.mes ~ '^\d{4}-(0[1-9]|1[0-2])$'
on conflict do nothing;

insert into public.financeiro_recebimentos(
  user_id,cobranca_id,valor,data_pagamento,competencia_caixa,
  forma,observacao,origem_tipo,origem_id,created_at,updated_at
)
select
  e.user_id,
  c.id,
  e.valor,
  coalesce(e.data_pagamento,e.created_at::date,(e.mes||'-01')::date),
  substring(
    coalesce(e.data_pagamento,e.created_at::date,(e.mes||'-01')::date)::text,
    1,
    7
  ),
  '',
  case
    when e.data_pagamento is null
      then 'Data original ausente; usada a data de criacao do registro.'
    else 'Importado automaticamente de public.energia.'
  end,
  'energia_legado',
  e.id,
  coalesce(e.created_at,now()),
  now()
from public.energia e
join public.financeiro_cobrancas c
  on c.user_id=e.user_id
 and c.origem_tipo='energia'
 and c.origem_id=e.id
where e.pago
  and e.valor>0
on conflict (user_id,origem_tipo,origem_id) do nothing;

-- Mantem o Financeiro V2 coerente durante a transicao das telas antigas.
create or replace function public.financeiro_sincronizar_pagamento_legado()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_row public.pagamentos%rowtype;
  v_charge_id uuid;
  v_contract public.contratos%rowtype;
  v_house public.imoveis%rowtype;
  v_paid_at date;
begin
  if tg_op='DELETE' then v_row:=old; else v_row:=new; end if;
  perform set_config('app.alterando_arquivamento','1',true);

  if tg_op='DELETE' or v_row.arquivado_em is not null then
    update public.financeiro_recebimentos r
    set arquivado_em=coalesce(r.arquivado_em,now()),
        arquivado_por=coalesce(r.arquivado_por,auth.uid()),
        motivo_arquivamento=case
          when r.motivo_arquivamento='' then 'Pagamento legado removido.'
          else r.motivo_arquivamento
        end,
        updated_at=now()
    where r.user_id=v_row.user_id
      and r.origem_tipo='pagamento_legado'
      and r.origem_id=v_row.id;

    if tg_op='DELETE' then return old; end if;
    return new;
  end if;

  select * into v_house
  from public.imoveis i
  where i.id=v_row.imovel_id
    and i.user_id=v_row.user_id;

  if v_row.contrato_id is not null then
    select * into v_contract
    from public.contratos c
    where c.id=v_row.contrato_id
      and c.imovel_id=v_row.imovel_id
      and c.user_id=v_row.user_id;
  end if;

  select c.id into v_charge_id
  from public.financeiro_cobrancas c
  where c.user_id=v_row.user_id
    and c.origem_tipo='pagamento_legado'
    and c.origem_id=v_row.id
  limit 1;

  if v_charge_id is null then
    select c.id into v_charge_id
    from public.financeiro_cobrancas c
    where c.user_id=v_row.user_id
      and c.imovel_id=v_row.imovel_id
      and c.contrato_id is not distinct from v_row.contrato_id
      and c.competencia=v_row.mes
      and c.tipo='aluguel'
      and c.arquivado_em is null
    order by c.created_at
    limit 1;
  end if;

  if v_charge_id is null then
    insert into public.financeiro_cobrancas(
      user_id,imovel_id,contrato_id,inquilino_id,competencia,tipo,
      descricao,valor_previsto,vencimento,tolerancia_dias,
      origem_tipo,origem_id,observacao
    )
    values(
      v_row.user_id,
      v_row.imovel_id,
      v_row.contrato_id,
      v_contract.tenant_id,
      v_row.mes,
      'aluguel',
      'Aluguel '||v_row.mes,
      greatest(
        case
          when v_contract.id is not null then coalesce(
            public.valor_aluguel_contrato_mes(v_row.contrato_id,v_row.mes),
            v_contract.valor_inicial,
            v_contract.valor,
            v_house.aluguel_valor,
            0
          )
          else coalesce(nullif(v_house.aluguel_valor,0),v_row.valor_pago,0)
        end,
        0
      ),
      public.financeiro_vencimento_mes(
        v_row.mes,
        coalesce(v_contract.dia_vencimento,v_house.dia_vencimento,5)
      ),
      5,
      'pagamento_legado',
      v_row.id,
      case
        when v_contract.id is null
          then 'Sincronizado sem contrato validado; revisar o valor previsto.'
        else 'Sincronizado de public.pagamentos.'
      end
    )
    returning id into v_charge_id;
  else
    update public.financeiro_cobrancas c
    set contrato_id=v_row.contrato_id,
        inquilino_id=v_contract.tenant_id,
        valor_previsto=greatest(
          case
            when v_contract.id is not null then coalesce(
              public.valor_aluguel_contrato_mes(v_row.contrato_id,v_row.mes),
              v_contract.valor_inicial,
              v_contract.valor,
              nullif(v_house.aluguel_valor,0),
              c.valor_previsto,
              0
            )
            else coalesce(
              nullif(v_house.aluguel_valor,0),
              nullif(c.valor_previsto,0),
              v_row.valor_pago,
              0
            )
          end,
          0
        ),
        vencimento=public.financeiro_vencimento_mes(
          v_row.mes,
          coalesce(v_contract.dia_vencimento,v_house.dia_vencimento,5)
        ),
        origem_tipo=case when c.origem_id is null
          then 'pagamento_legado' else c.origem_tipo end,
        origem_id=coalesce(c.origem_id,v_row.id),
        arquivado_em=null,
        arquivado_por=null,
        motivo_arquivamento='',
        updated_at=now()
    where c.id=v_charge_id
      and c.user_id=v_row.user_id;
  end if;

  if v_row.valor_pago>0 then
    v_paid_at:=coalesce(
      v_row.data_pagamento,
      v_row.created_at::date,
      (v_row.mes||'-01')::date
    );
    insert into public.financeiro_recebimentos(
      user_id,cobranca_id,valor,data_pagamento,competencia_caixa,
      forma,observacao,origem_tipo,origem_id
    )
    values(
      v_row.user_id,
      v_charge_id,
      v_row.valor_pago,
      v_paid_at,
      substring(v_paid_at::text,1,7),
      '',
      'Sincronizado de public.pagamentos.',
      'pagamento_legado',
      v_row.id
    )
    on conflict (user_id,origem_tipo,origem_id)
    do update set
      cobranca_id=excluded.cobranca_id,
      valor=excluded.valor,
      data_pagamento=excluded.data_pagamento,
      competencia_caixa=excluded.competencia_caixa,
      arquivado_em=null,
      arquivado_por=null,
      motivo_arquivamento='',
      updated_at=now();
  else
    update public.financeiro_recebimentos r
    set arquivado_em=coalesce(r.arquivado_em,now()),
        arquivado_por=coalesce(r.arquivado_por,auth.uid()),
        motivo_arquivamento='Pagamento legado sem valor recebido.',
        updated_at=now()
    where r.user_id=v_row.user_id
      and r.origem_tipo='pagamento_legado'
      and r.origem_id=v_row.id
      and r.arquivado_em is null;
  end if;

  return new;
end
$$;

create or replace function public.financeiro_sincronizar_energia_legada()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_row public.energia%rowtype;
  v_charge_id uuid;
  v_contract public.contratos%rowtype;
  v_house public.imoveis%rowtype;
  v_paid_at date;
begin
  if tg_op='DELETE' then v_row:=old; else v_row:=new; end if;
  perform set_config('app.alterando_arquivamento','1',true);

  if tg_op='DELETE' or v_row.arquivado_em is not null then
    update public.financeiro_recebimentos r
    set arquivado_em=coalesce(r.arquivado_em,now()),
        arquivado_por=coalesce(r.arquivado_por,auth.uid()),
        motivo_arquivamento=case
          when r.motivo_arquivamento='' then 'Energia legada removida.'
          else r.motivo_arquivamento
        end,
        updated_at=now()
    where r.user_id=v_row.user_id
      and r.origem_tipo='energia_legado'
      and r.origem_id=v_row.id;

    update public.financeiro_cobrancas c
    set arquivado_em=coalesce(c.arquivado_em,now()),
        arquivado_por=coalesce(c.arquivado_por,auth.uid()),
        motivo_arquivamento=case
          when c.motivo_arquivamento='' then 'Energia legada removida.'
          else c.motivo_arquivamento
        end,
        updated_at=now()
    where c.user_id=v_row.user_id
      and c.origem_tipo='energia'
      and c.origem_id=v_row.id;

    if tg_op='DELETE' then return old; end if;
    return new;
  end if;

  select * into v_house
  from public.imoveis i
  where i.id=v_row.imovel_id
    and i.user_id=v_row.user_id;

  if v_row.contrato_id is not null then
    select * into v_contract
    from public.contratos c
    where c.id=v_row.contrato_id
      and c.imovel_id=v_row.imovel_id
      and c.user_id=v_row.user_id;
  end if;

  select c.id into v_charge_id
  from public.financeiro_cobrancas c
  where c.user_id=v_row.user_id
    and c.origem_tipo='energia'
    and c.origem_id=v_row.id
  limit 1;

  if v_charge_id is null then
    select c.id into v_charge_id
    from public.financeiro_cobrancas c
    where c.user_id=v_row.user_id
      and c.imovel_id=v_row.imovel_id
      and c.contrato_id is not distinct from v_row.contrato_id
      and c.competencia=v_row.mes
      and c.tipo='energia'
      and c.arquivado_em is null
    order by c.created_at
    limit 1;
  end if;

  if v_charge_id is null then
    insert into public.financeiro_cobrancas(
      user_id,imovel_id,contrato_id,inquilino_id,competencia,tipo,
      descricao,valor_previsto,vencimento,tolerancia_dias,
      origem_tipo,origem_id,observacao
    )
    values(
      v_row.user_id,
      v_row.imovel_id,
      v_row.contrato_id,
      v_contract.tenant_id,
      v_row.mes,
      'energia',
      'Energia '||v_row.mes,
      greatest(coalesce(v_row.valor,0),0),
      coalesce(
        v_row.vencimento,
        public.financeiro_vencimento_mes(
          v_row.mes,
          coalesce(v_house.energia_dia_vencimento,5)
        )
      ),
      5,
      'energia',
      v_row.id,
      'Sincronizado de public.energia.'
    )
    returning id into v_charge_id;
  else
    update public.financeiro_cobrancas c
    set contrato_id=v_row.contrato_id,
        inquilino_id=v_contract.tenant_id,
        valor_previsto=greatest(coalesce(v_row.valor,0),0),
        vencimento=coalesce(
          v_row.vencimento,
          public.financeiro_vencimento_mes(
            v_row.mes,
            coalesce(v_house.energia_dia_vencimento,5)
          )
        ),
        origem_tipo=case when c.origem_id is null
          then 'energia' else c.origem_tipo end,
        origem_id=coalesce(c.origem_id,v_row.id),
        arquivado_em=null,
        arquivado_por=null,
        motivo_arquivamento='',
        updated_at=now()
    where c.id=v_charge_id
      and c.user_id=v_row.user_id;
  end if;

  -- Fora de uma restauração confiável, os marcadores antigos nunca criam
  -- dinheiro. Durante o V7 eles são aceitos uma única vez para backups
  -- antigos que ainda não possuíam a lista explícita de recebimentos.
  if coalesce(current_setting('app.restaurando_backup',true),'')='1'
     and v_row.pago
     and v_row.valor>0 then
    v_paid_at:=coalesce(
      v_row.data_pagamento,
      v_row.created_at::date,
      (v_row.mes||'-01')::date
    );
    insert into public.financeiro_recebimentos(
      user_id,cobranca_id,valor,data_pagamento,competencia_caixa,
      forma,observacao,origem_tipo,origem_id
    )
    values(
      v_row.user_id,v_charge_id,v_row.valor,v_paid_at,
      substring(v_paid_at::text,1,7),'',
      'Importado de marcador legado de energia pelo Backup V7.',
      'energia_legado',v_row.id
    )
    on conflict (user_id,origem_tipo,origem_id) do update set
      cobranca_id=excluded.cobranca_id,
      valor=excluded.valor,
      data_pagamento=excluded.data_pagamento,
      competencia_caixa=excluded.competencia_caixa,
      arquivado_em=null,
      arquivado_por=null,
      motivo_arquivamento='',
      updated_at=now();
  end if;

  return new;
end
$$;

create or replace function public.financeiro_sincronizar_ajuste_contrato()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_charge_id uuid;
  v_paid_at date;
begin
  perform set_config('app.alterando_arquivamento','1',true);
  if tg_op='UPDATE'
     and old.proporcional_valor is not distinct from new.proporcional_valor
     and old.inicio is not distinct from new.inicio
     and old.imovel_id is not distinct from new.imovel_id
     and old.tenant_id is not distinct from new.tenant_id then
    return new;
  end if;

  select c.id into v_charge_id
  from public.financeiro_cobrancas c
  where c.user_id=new.user_id
    and c.origem_tipo='contrato_ajuste'
    and c.origem_id=new.id
  limit 1;

  if coalesce(new.proporcional_valor,0)<=0 or new.inicio is null then
    update public.financeiro_recebimentos r
    set arquivado_em=coalesce(r.arquivado_em,now()),
        arquivado_por=coalesce(r.arquivado_por,auth.uid()),
        motivo_arquivamento='Contrato sem ajuste proporcional.',
        updated_at=now()
    where r.user_id=new.user_id
      and r.origem_tipo='ajuste_legado'
      and r.origem_id=new.id
      and r.arquivado_em is null;

    update public.financeiro_cobrancas c
    set arquivado_em=coalesce(c.arquivado_em,now()),
        arquivado_por=coalesce(c.arquivado_por,auth.uid()),
        motivo_arquivamento='Contrato sem ajuste proporcional.',
        updated_at=now()
    where c.id=v_charge_id
      and c.arquivado_em is null;
    return new;
  end if;

  if v_charge_id is null then
    insert into public.financeiro_cobrancas(
      user_id,imovel_id,contrato_id,inquilino_id,competencia,tipo,
      descricao,valor_previsto,vencimento,tolerancia_dias,
      origem_tipo,origem_id,observacao
    )
    values(
      new.user_id,
      new.imovel_id,
      new.id,
      new.tenant_id,
      substring(new.inicio::text,1,7),
      'ajuste',
      'Ajuste inicial do contrato',
      new.proporcional_valor,
      new.inicio,
      5,
      'contrato_ajuste',
      new.id,
      'Sincronizado do ajuste proporcional do contrato.'
    )
    returning id into v_charge_id;
  else
    update public.financeiro_cobrancas c
    set imovel_id=new.imovel_id,
        contrato_id=new.id,
        inquilino_id=new.tenant_id,
        competencia=substring(new.inicio::text,1,7),
        valor_previsto=new.proporcional_valor,
        vencimento=new.inicio,
        arquivado_em=null,
        arquivado_por=null,
        motivo_arquivamento='',
        updated_at=now()
    where c.id=v_charge_id
      and c.user_id=new.user_id;
  end if;

  -- A exceção abaixo existe somente dentro da restauração V7 para converter
  -- backups anteriores ao Financeiro V2. No uso normal, parcelas novas
  -- existem exclusivamente em financeiro_recebimentos.
  if coalesce(current_setting('app.restaurando_backup',true),'')='1'
     and new.proporcional_pago
     and new.proporcional_valor>0 then
    v_paid_at:=coalesce(
      new.proporcional_data_pagamento,
      new.updated_at::date,
      new.inicio
    );
    insert into public.financeiro_recebimentos(
      user_id,cobranca_id,valor,data_pagamento,competencia_caixa,
      forma,observacao,origem_tipo,origem_id
    )
    values(
      new.user_id,v_charge_id,new.proporcional_valor,v_paid_at,
      substring(v_paid_at::text,1,7),'',
      'Importado de marcador proporcional legado pelo Backup V7.',
      'ajuste_legado',new.id
    )
    on conflict (user_id,origem_tipo,origem_id) do update set
      cobranca_id=excluded.cobranca_id,
      valor=excluded.valor,
      data_pagamento=excluded.data_pagamento,
      competencia_caixa=excluded.competencia_caixa,
      arquivado_em=null,
      arquivado_por=null,
      motivo_arquivamento='',
      updated_at=now();
  end if;

  return new;
end
$$;

drop trigger if exists financeiro_sync_pagamento_legado
  on public.pagamentos;
create trigger financeiro_sync_pagamento_legado
after insert or update or delete on public.pagamentos
for each row execute function public.financeiro_sincronizar_pagamento_legado();

-- Uma leitura que ja recebeu dinheiro nao pode ter consumo, competencia ou
-- valor reescritos. Primeiro as parcelas devem ser arquivadas; a leitura pode
-- entao ser corrigida e o Financeiro preserva ambos os historicos.
create or replace function public.proteger_energia_com_recebimento()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if coalesce(current_setting('app.restaurando_backup',true),'')='1' then
    return new;
  end if;

  if (
    new.user_id is distinct from old.user_id
    or new.imovel_id is distinct from old.imovel_id
    or new.contrato_id is distinct from old.contrato_id
    or new.mes is distinct from old.mes
    or new.valor is distinct from old.valor
    or new.kwh is distinct from old.kwh
    or new.leitura_anterior is distinct from old.leitura_anterior
    or new.leitura_atual is distinct from old.leitura_atual
    or new.tarifa_kwh is distinct from old.tarifa_kwh
    or new.acrescimos is distinct from old.acrescimos
    or new.descontos is distinct from old.descontos
    or new.valor_calculado is distinct from old.valor_calculado
    or new.valor_manual is distinct from old.valor_manual
    or new.vencimento is distinct from old.vencimento
  ) and exists(
    select 1
    from public.financeiro_cobrancas c
    join public.financeiro_recebimentos r
      on r.cobranca_id=c.id
     and r.user_id=c.user_id
     and r.arquivado_em is null
    where c.user_id=old.user_id
      and c.origem_tipo='energia'
      and c.origem_id=old.id
      and c.arquivado_em is null
  ) then
    raise exception
      'Arquive os recebimentos da energia antes de corrigir a leitura.';
  end if;
  return new;
end
$$;
revoke all on function public.proteger_energia_com_recebimento()
  from public,anon,authenticated;

drop trigger if exists proteger_energia_com_recebimento
  on public.energia;
create trigger proteger_energia_com_recebimento
before update on public.energia
for each row execute function public.proteger_energia_com_recebimento();

drop trigger if exists financeiro_sync_energia_legada
  on public.energia;
create trigger financeiro_sync_energia_legada
after insert or update or delete on public.energia
for each row execute function public.financeiro_sincronizar_energia_legada();

drop trigger if exists financeiro_sync_ajuste_contrato
  on public.contratos;
create trigger financeiro_sync_ajuste_contrato
after insert or update of
  proporcional_valor,proporcional_pago,proporcional_data_pagamento
on public.contratos
for each row execute function public.financeiro_sincronizar_ajuste_contrato();

-- Gera apenas cobrancas ainda inexistentes. Nao marca recebimento e nao
-- calcula multa ou juros. O ajuste inicial continua separado do aluguel.
create or replace function public.gerar_cobrancas_aluguel_mes(
  p_competencia text
)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_owner uuid:=public.usuario_proprietario_id(auth.uid());
  v_first date;
  v_last date;
  v_count integer:=0;
  v_inserted integer:=0;
begin
  if p_competencia is null
     or p_competencia !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Competencia invalida.';
  end if;
  if v_owner is null
     or not public.pode_gerenciar_financeiro(v_owner,auth.uid()) then
    raise exception 'Seu papel nao permite gerar cobrancas.';
  end if;

  v_first:=(p_competencia||'-01')::date;
  v_last:=(v_first+interval '1 month - 1 day')::date;

  if exists(
    select 1
    from public.contratos c
    join public.imoveis i
      on i.id=c.imovel_id
     and i.user_id=c.user_id
     and i.arquivado_em is null
    where c.user_id=v_owner
      and c.arquivado_em is null
      and c.valor_inicial_revisar
      and c.inicio<=v_last
      and coalesce(c.fim,'9999-12-31'::date)>=v_first
  ) then
    raise exception
      'Confira o valor inicial dos contratos pendentes antes de gerar cobrancas deste mes.';
  end if;

  insert into public.financeiro_cobrancas(
    user_id,imovel_id,contrato_id,inquilino_id,competencia,tipo,
    descricao,valor_previsto,vencimento,tolerancia_dias,
    origem_tipo,observacao
  )
  select
    c.user_id,
    c.imovel_id,
    c.id,
    c.tenant_id,
    p_competencia,
    'aluguel',
    'Aluguel '||p_competencia,
    greatest(
      coalesce(
        public.valor_aluguel_contrato_mes(c.id,p_competencia),
        c.valor_inicial,
        c.valor,
        0
      ),
      0
    ),
    public.financeiro_vencimento_mes(p_competencia,c.dia_vencimento),
    5,
    'contrato_mes',
    'Cobranca mensal gerada pelo contrato.'
  from public.contratos c
  join public.imoveis i
    on i.id=c.imovel_id
   and i.user_id=c.user_id
  where c.user_id=v_owner
    and c.arquivado_em is null
    and i.arquivado_em is null
    and public.financeiro_vencimento_mes(
      p_competencia,c.dia_vencimento
    ) between c.inicio and coalesce(c.fim,'9999-12-31'::date)
    and v_first>=case
      when c.modalidade_vencimento='entrada'
        then date_trunc('month',c.inicio)::date
      when c.dia_vencimento>extract(day from c.inicio)::integer
        then date_trunc('month',c.inicio)::date
      else (date_trunc('month',c.inicio)+interval '1 month')::date
    end
  on conflict do nothing;
  get diagnostics v_inserted=row_count;
  v_count:=v_count+v_inserted;

  insert into public.financeiro_cobrancas(
    user_id,imovel_id,contrato_id,inquilino_id,competencia,tipo,
    descricao,valor_previsto,vencimento,tolerancia_dias,
    origem_tipo,origem_id,observacao
  )
  select
    c.user_id,
    c.imovel_id,
    c.id,
    c.tenant_id,
    substring(c.inicio::text,1,7),
    'ajuste',
    'Ajuste inicial do contrato',
    c.proporcional_valor,
    c.inicio,
    5,
    'contrato_ajuste',
    c.id,
    'Ajuste proporcional separado do aluguel mensal.'
  from public.contratos c
  join public.imoveis i
    on i.id=c.imovel_id
   and i.user_id=c.user_id
  where c.user_id=v_owner
    and c.arquivado_em is null
    and i.arquivado_em is null
    and c.proporcional_valor>0
    and substring(c.inicio::text,1,7)=p_competencia
  on conflict (user_id,origem_tipo,origem_id) do nothing;
  get diagnostics v_inserted=row_count;
  v_count:=v_count+v_inserted;

  return v_count;
end
$$;

-- Toda criacao/correcao de periodo serializa pela linha do imovel. Assim,
-- duas abas nao conseguem aprovar contratos sobrepostos ao mesmo tempo,
-- inclusive quando ainda nao existia contrato ativo para bloquear.
create or replace function public.validar_periodo_contrato()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if coalesce(current_setting('app.restaurando_backup',true),'')<>'1'
     and new.arquivado_em is null
     and (
       tg_op='INSERT'
       or new.user_id is distinct from old.user_id
       or new.imovel_id is distinct from old.imovel_id
       or new.inicio is distinct from old.inicio
       or new.fim is distinct from old.fim
       or old.arquivado_em is not null
     ) then
    perform 1
    from public.imoveis i
    where i.id=new.imovel_id
      and i.user_id=new.user_id
      and i.arquivado_em is null
    for update;
    if not found then
      raise exception 'Imovel nao encontrado ou arquivado.';
    end if;

    if exists(
      select 1
      from public.contratos c
      where c.user_id=new.user_id
        and c.imovel_id=new.imovel_id
        and c.id<>new.id
        and c.arquivado_em is null
        and c.inicio<=coalesce(new.fim,'9999-12-31'::date)
        and coalesce(c.fim,'9999-12-31'::date)>=new.inicio
    ) then
      raise exception 'O periodo informado se sobrepoe a outro contrato.';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists validar_periodo_contrato on public.contratos;
create trigger validar_periodo_contrato
before insert or update on public.contratos
for each row execute function public.validar_periodo_contrato();

-- As rotinas antigas aceitavam apenas o proprietario autenticado e, por
-- isso, bloqueavam o colaborador operacional mesmo quando seu papel estava
-- correto. Estas versoes resolvem sempre o dono da conta e mantem a troca
-- de inquilino e o historico de ocupacao na mesma transacao.
create or replace function public.iniciar_contrato_gestao(
  p_imovel_id uuid,
  p_inquilino_id uuid,
  p_inicio date,
  p_fim date,
  p_valor numeric,
  p_dia_vencimento integer,
  p_modalidade text,
  p_proporcional_dias integer,
  p_proporcional_valor numeric
)
returns setof public.contratos
language plpgsql
security definer
set search_path=public
as $$
declare
  v_owner uuid:=public.usuario_proprietario_id(auth.uid());
  v_contract public.contratos%rowtype;
  v_current public.contratos%rowtype;
  v_dia integer;
  v_dias integer;
  v_prop numeric;
begin
  if v_owner is null
     or not public.pode_operar_imoveis(v_owner,auth.uid()) then
    raise exception 'Seu papel nao permite iniciar contratos.';
  end if;
  perform 1
  from public.imoveis i
  where i.id=p_imovel_id
    and i.user_id=v_owner
    and i.arquivado_em is null
  for update;
  if not found then
    raise exception 'Imovel nao encontrado ou arquivado.';
  end if;
  if not exists(
    select 1 from public.inquilinos t
    where t.id=p_inquilino_id
      and t.user_id=v_owner
      and t.arquivado_em is null
  ) then
    raise exception 'Inquilino nao encontrado ou arquivado.';
  end if;
  if p_inicio is null
     or coalesce(p_valor,0)<=0
     or (p_fim is not null and p_fim<p_inicio) then
    raise exception 'Dados do contrato invalidos.';
  end if;

  v_dia:=case
    when p_modalidade='entrada'
      then extract(day from p_inicio)::integer
    else least(31,greatest(1,coalesce(p_dia_vencimento,5)))
  end;
  v_dias:=case
    when p_modalidade='entrada'
      or v_dia=extract(day from p_inicio)::integer
      then 0
    when v_dia>extract(day from p_inicio)::integer
      then v_dia-extract(day from p_inicio)::integer
    else 30-extract(day from p_inicio)::integer+v_dia
  end;
  v_prop:=round((p_valor/30)*v_dias,2);

  select c.* into v_current
  from public.contratos c
  where c.user_id=v_owner
    and c.imovel_id=p_imovel_id
    and c.ativo
    and c.arquivado_em is null
  order by c.inicio desc
  limit 1
  for update;

  if found then
    if p_inicio<=v_current.inicio then
      raise exception
        'O novo contrato deve comecar depois do contrato atual.';
    end if;
    update public.contratos
    set fim=p_inicio-1,
        ativo=false,
        updated_at=now()
    where id=v_current.id
      and user_id=v_owner;
  end if;

  if exists(
    select 1
    from public.contratos c
    where c.user_id=v_owner
      and c.imovel_id=p_imovel_id
      and c.arquivado_em is null
      and (v_current.id is null or c.id<>v_current.id)
      and c.inicio<=coalesce(p_fim,'9999-12-31'::date)
      and coalesce(c.fim,'9999-12-31'::date)>=p_inicio
  ) then
    raise exception 'O periodo informado se sobrepoe a outro contrato.';
  end if;

  insert into public.contratos(
    user_id,imovel_id,tenant_id,inicio,fim,valor,valor_inicial,ativo,
    dia_vencimento,modalidade_vencimento,proporcional_dias,
    proporcional_valor,proporcional_pago,proporcional_data_pagamento
  )
  values(
    v_owner,p_imovel_id,p_inquilino_id,p_inicio,p_fim,p_valor,p_valor,true,
    v_dia,
    case when p_modalidade='entrada' then 'entrada' else 'fixo' end,
    v_dias,v_prop,false,null
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
  where id=p_imovel_id
    and user_id=v_owner;

  if not exists(
    select 1 from public.historico_status h
    where h.user_id=v_owner
      and h.imovel_id=p_imovel_id
      and h.data=p_inicio
      and h.status='alugada'
      and h.tenant_id=p_inquilino_id
  ) then
    insert into public.historico_status(
      user_id,imovel_id,data,status,tenant_id
    )
    values(v_owner,p_imovel_id,p_inicio,'alugada',p_inquilino_id);
  end if;

  return next v_contract;
end
$$;

create or replace function public.encerrar_contrato_gestao(
  p_imovel_id uuid,
  p_contrato_id uuid,
  p_fim date,
  p_novo_status text default 'vaga'
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_owner uuid:=public.usuario_proprietario_id(auth.uid());
  v_contract public.contratos%rowtype;
  v_house_vacated boolean:=false;
begin
  if v_owner is null
     or not public.pode_operar_imoveis(v_owner,auth.uid()) then
    raise exception 'Seu papel nao permite encerrar contratos.';
  end if;
  if p_novo_status not in ('vaga','manutencao') then
    raise exception 'Status invalido.';
  end if;

  select c.* into v_contract
  from public.contratos c
  where c.id=p_contrato_id
    and c.imovel_id=p_imovel_id
    and c.user_id=v_owner
    and c.arquivado_em is null
  for update;
  if not found then
    raise exception 'Contrato nao encontrado.';
  end if;
  if not v_contract.ativo then
    raise exception 'Este contrato ja esta encerrado.';
  end if;
  if p_fim is null
     or p_fim<v_contract.inicio
     or p_fim>current_date then
    raise exception 'Data de saida invalida.';
  end if;
  if exists(
    select 1
    from public.financeiro_cobrancas c
    where c.user_id=v_owner
      and c.contrato_id=v_contract.id
      and c.arquivado_em is null
      and c.vencimento>p_fim
  ) then
    raise exception
      'Existem cobrancas posteriores a data de saida. Arquive-as antes de encerrar o contrato.';
  end if;

  update public.contratos
  set fim=p_fim,
      ativo=false,
      updated_at=now()
  where id=v_contract.id
    and user_id=v_owner;

  update public.imoveis
  set status=p_novo_status,
      tenant_id=null,
      contrato_inicio=null,
      contrato_fim=null,
      updated_at=now()
  where id=p_imovel_id
    and user_id=v_owner
    and not exists(
      select 1
      from public.contratos c
      where c.user_id=v_owner
        and c.imovel_id=p_imovel_id
        and c.id<>v_contract.id
        and c.ativo
        and c.arquivado_em is null
        and c.inicio<=current_date
        and coalesce(c.fim,'9999-12-31'::date)>=current_date
    );
  v_house_vacated:=found;

  if v_house_vacated and not exists(
    select 1 from public.historico_status h
    where h.user_id=v_owner
      and h.imovel_id=p_imovel_id
      and h.data=p_fim
      and h.status=p_novo_status
      and h.tenant_id is null
  ) then
    insert into public.historico_status(
      user_id,imovel_id,data,status,tenant_id
    )
    values(v_owner,p_imovel_id,p_fim,p_novo_status,null);
  end if;
end
$$;

revoke all on function public.iniciar_contrato_gestao(
  uuid,uuid,date,date,numeric,integer,text,integer,numeric
) from public,anon;
revoke all on function public.encerrar_contrato_gestao(
  uuid,uuid,date,text
) from public,anon;
grant execute on function public.iniciar_contrato_gestao(
  uuid,uuid,date,date,numeric,integer,text,integer,numeric
) to authenticated;
grant execute on function public.encerrar_contrato_gestao(
  uuid,uuid,date,text
) to authenticated;

-- ------------------------------------------------------------
-- 5. Auditoria sem expor documentos pessoais ou arquivos
-- ------------------------------------------------------------

create table if not exists public.financeiro_auditoria (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ator_id uuid references auth.users(id) on delete set null,
  ator_papel text not null default '',
  entidade text not null,
  registro_id uuid,
  acao text not null
    check (acao in ('inserir','alterar','arquivar','restaurar','excluir')),
  dados_anteriores jsonb,
  dados_posteriores jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_financeiro_auditoria_conta_data
  on public.financeiro_auditoria(user_id,created_at desc);
create index if not exists idx_financeiro_auditoria_registro
  on public.financeiro_auditoria(entidade,registro_id);

create or replace function public.financeiro_json_auditoria(p_row jsonb)
returns jsonb
language sql
immutable
set search_path=public
as $$
  select case
    when p_row is null then null
    else p_row
      - array[
          'documento','dados','storage_path','foto_path',
          'emergencia_nome','pix_chave'
        ]::text[]
  end
$$;

create or replace function public.financeiro_auditar_alteracao()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_old jsonb:=case when tg_op='INSERT' then null else to_jsonb(old) end;
  v_new jsonb:=case when tg_op='DELETE' then null else to_jsonb(new) end;
  v_owner uuid:=coalesce(
    nullif(v_new->>'user_id','')::uuid,
    nullif(v_old->>'user_id','')::uuid
  );
  v_id uuid:=coalesce(
    nullif(v_new->>'id','')::uuid,
    nullif(v_old->>'id','')::uuid
  );
  v_action text;
begin
  if tg_op='INSERT' then
    v_action:='inserir';
  elsif tg_op='DELETE' then
    v_action:='excluir';
  elsif v_old->>'arquivado_em' is null
        and v_new->>'arquivado_em' is not null then
    v_action:='arquivar';
  elsif v_old->>'arquivado_em' is not null
        and v_new->>'arquivado_em' is null then
    v_action:='restaurar';
  else
    v_action:='alterar';
  end if;

  insert into public.financeiro_auditoria(
    user_id,ator_id,ator_papel,entidade,registro_id,acao,
    dados_anteriores,dados_posteriores
  )
  values(
    v_owner,
    auth.uid(),
    coalesce(public.papel_colaborador_atual(auth.uid()),'sistema'),
    tg_table_name,
    v_id,
    v_action,
    public.financeiro_json_auditoria(v_old),
    public.financeiro_json_auditoria(v_new)
  );
  if tg_op='DELETE' then return old; end if;
  return new;
end
$$;

do $audit_triggers$
declare
  t text;
begin
  foreach t in array array[
    'imoveis','inquilinos','contratos','pagamentos','energia','despesas',
    'aluguel_historico','financeiro_cobrancas',
    'financeiro_recebimentos','chamados'
  ]
  loop
    if to_regclass('public.'||t) is not null then
      execute format(
        'drop trigger if exists financeiro_auditar on public.%I',
        t
      );
      execute format(
        'create trigger financeiro_auditar after insert or update or delete on public.%I for each row execute function public.financeiro_auditar_alteracao()',
        t
      );
    end if;
  end loop;
end
$audit_triggers$;

-- ------------------------------------------------------------
-- 6. Regras por papel tambem para as tabelas antigas
-- ------------------------------------------------------------

create or replace function public.validar_papel_escrita_aluguel()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_row jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_owner uuid:=nullif(v_row->>'user_id','')::uuid;
  v_allowed boolean:=false;
begin
  -- SQL Editor, service_role e rotinas administrativas nao possuem auth.uid().
  if auth.uid() is null then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if coalesce(current_setting('app.restaurando_backup',true),'')='1' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;

  if tg_table_name='contratos' then
    if public.papel_colaborador_atual(auth.uid())='administrador'
       and public.pode_ler_conta(v_owner,auth.uid()) then
      v_allowed:=true;
    elsif tg_op='UPDATE'
          and public.pode_gerenciar_financeiro(v_owner,auth.uid()) then
      -- Financeiro pode confirmar/desfazer apenas o recebimento do ajuste
      -- inicial. Nenhuma condicao do contrato fica editavel por esse atalho.
      v_allowed:=
        new.id is not distinct from old.id
        and new.user_id is not distinct from old.user_id
        and new.imovel_id is not distinct from old.imovel_id
        and new.tenant_id is not distinct from old.tenant_id
        and new.inicio is not distinct from old.inicio
        and new.fim is not distinct from old.fim
        and new.valor is not distinct from old.valor
        and new.valor_inicial is not distinct from old.valor_inicial
        and new.valor_inicial_revisar
          is not distinct from old.valor_inicial_revisar
        and new.valor_inicial_origem
          is not distinct from old.valor_inicial_origem
        and new.dia_vencimento is not distinct from old.dia_vencimento
        and new.modalidade_vencimento
          is not distinct from old.modalidade_vencimento
        and new.ativo is not distinct from old.ativo
        and new.proporcional_dias
          is not distinct from old.proporcional_dias
        and new.proporcional_valor
          is not distinct from old.proporcional_valor
        and new.arquivado_em is not distinct from old.arquivado_em
        and new.arquivado_por is not distinct from old.arquivado_por
        and new.motivo_arquivamento
          is not distinct from old.motivo_arquivamento;
    elsif public.pode_operar_imoveis(v_owner,auth.uid()) then
      -- Operacional cuida do cadastro e encerramento, mas nao confirma
      -- dinheiro. Em INSERT, um ajuste ja marcado como pago tambem falha.
      if tg_op='INSERT' then
        v_allowed:=
          (
            not coalesce(new.proporcional_pago,false)
            or coalesce(new.proporcional_valor,0)=0
          )
          and new.proporcional_data_pagamento is null;
      elsif tg_op='UPDATE' then
        v_allowed:=
          new.proporcional_pago is not distinct from old.proporcional_pago
          and new.proporcional_data_pagamento
            is not distinct from old.proporcional_data_pagamento;
      else
        v_allowed:=true;
      end if;
    end if;
  elsif tg_table_name in ('pagamentos','despesas') then
    v_allowed:=public.pode_gerenciar_financeiro(v_owner,auth.uid());
  elsif tg_table_name='aluguel_historico' then
    -- Reajuste altera uma condição contratual. Somente administrador
    -- pode confirmá-lo; financeiro e operacional continuam separados.
    v_allowed:=public.papel_colaborador_atual(auth.uid())='administrador'
      and public.pode_ler_conta(v_owner,auth.uid());
  elsif tg_table_name='chamados' then
    v_allowed:=public.pode_operar_imoveis(v_owner,auth.uid());
    -- O inquilino pode apenas abrir um chamado da própria moradia.
    -- Atualizações e cancelamentos continuam reservados à operação.
    if not v_allowed
       and tg_op='INSERT'
       and coalesce(v_row->>'aberto_por','')='inquilino'
       and coalesce(v_row->>'status','')='aberto' then
      v_allowed:=exists(
        select 1
        from public.acessos_inquilino a
        join public.contratos c
          on c.tenant_id=a.inquilino_id
         and c.imovel_id=nullif(v_row->>'imovel_id','')::uuid
         and c.user_id=v_owner
        where a.user_id=auth.uid()
          and a.ativo
          and c.ativo
          and c.inicio<=current_date
          and (c.fim is null or c.fim>=current_date)
      );
    end if;
  elsif tg_table_name='energia' then
    v_allowed:=public.pode_gerenciar_financeiro(v_owner,auth.uid())
      or public.pode_operar_imoveis(v_owner,auth.uid());
    -- pago/data_pagamento sao apenas marcadores importados. Nem mesmo o
    -- financeiro os usa para criar dinheiro novo; parcelas passam pela V2.
    if v_allowed and tg_op='INSERT' then
      v_allowed:=coalesce((v_row->>'pago')::boolean,false)=false
        and nullif(v_row->>'data_pagamento','') is null;
    elsif v_allowed and tg_op='UPDATE' then
      v_allowed:=new.pago is not distinct from old.pago
        and new.data_pagamento is not distinct from old.data_pagamento;
    end if;
  elsif tg_table_name in ('configuracoes','backups') then
    v_allowed:=public.papel_colaborador_atual(auth.uid())='administrador'
      and public.pode_ler_conta(v_owner,auth.uid());
  else
    v_allowed:=public.pode_operar_imoveis(v_owner,auth.uid());
  end if;

  if not v_allowed then
    raise exception 'Seu papel nao permite esta alteracao.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end
$$;

do $role_triggers$
declare
  t text;
begin
  foreach t in array array[
    'imoveis','inquilinos','contratos','historico_status','fotos',
    'documentos','eventos','interessados','pagamentos','despesas',
    'aluguel_historico','energia','configuracoes','backups','chamados'
  ]
  loop
    if to_regclass('public.'||t) is not null then
      execute format(
        'drop trigger if exists validar_papel_escrita on public.%I',
        t
      );
      execute format(
        'create trigger validar_papel_escrita before insert or update or delete on public.%I for each row execute function public.validar_papel_escrita_aluguel()',
        t
      );
    end if;
  end loop;
end
$role_triggers$;

-- As colunas de arquivamento nao podem ser alteradas diretamente. A RPC
-- abaixo valida dependencias; sincronizadores e restauração de backup usam
-- a mesma chave transacional depois de fazer suas próprias verificações.
create or replace function public.proteger_arquivamento_direto()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_controlled boolean:=
    coalesce(current_setting('app.alterando_arquivamento',true),'')='1';
begin
  if auth.uid() is null or v_controlled then
    return new;
  end if;

  if (
    tg_op='INSERT'
    and (
      new.arquivado_em is not null
      or new.arquivado_por is not null
      or nullif(trim(coalesce(new.motivo_arquivamento,'')),'') is not null
    )
  ) or (
    tg_op='UPDATE'
    and (
      new.arquivado_em is distinct from old.arquivado_em
      or new.arquivado_por is distinct from old.arquivado_por
      or new.motivo_arquivamento is distinct from old.motivo_arquivamento
    )
  ) then
    raise exception
      'Use a acao Arquivar ou Restaurar para preservar as dependencias.';
  end if;
  return new;
end
$$;

do $archive_protection_triggers$
declare
  t text;
begin
  foreach t in array array[
    'imoveis','inquilinos','contratos','pagamentos','energia','despesas',
    'aluguel_historico','financeiro_cobrancas','financeiro_recebimentos'
  ]
  loop
    if to_regclass('public.'||t) is not null then
      execute format(
        'drop trigger if exists proteger_arquivamento_direto on public.%I',
        t
      );
      execute format(
        'create trigger proteger_arquivamento_direto before insert or update on public.%I for each row execute function public.proteger_arquivamento_direto()',
        t
      );
    end if;
  end loop;
end
$archive_protection_triggers$;

-- ------------------------------------------------------------
-- 7. Arquivar e restaurar com validacao explicita
-- ------------------------------------------------------------

create or replace function public.alterar_arquivamento_aluguel(
  p_entidade text,
  p_id uuid,
  p_arquivar boolean,
  p_motivo text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_owner uuid:=public.usuario_proprietario_id(auth.uid());
  v_entity text:=lower(trim(coalesce(p_entidade,'')));
  v_reason text:=left(trim(coalesce(p_motivo,'')),500);
  v_found boolean:=false;
begin
  if v_owner is null or not public.pode_ler_conta(v_owner,auth.uid()) then
    raise exception 'Conta sem permissao.';
  end if;

  if v_entity in ('imovel','inquilino','contrato') then
    if not public.pode_operar_imoveis(v_owner,auth.uid()) then
      raise exception 'Seu papel nao permite arquivar este cadastro.';
    end if;
  elsif v_entity='reajuste' then
    if public.papel_colaborador_atual(auth.uid())<>'administrador'
       or not public.pode_ler_conta(v_owner,auth.uid()) then
      raise exception 'Somente administrador pode arquivar reajustes.';
    end if;
  elsif v_entity in ('cobranca','recebimento','pagamento','despesa') then
    if not public.pode_gerenciar_financeiro(v_owner,auth.uid()) then
      raise exception 'Seu papel nao permite arquivar este lancamento.';
    end if;
  elsif v_entity='energia' then
    if not (
      public.pode_operar_imoveis(v_owner,auth.uid())
      or public.pode_gerenciar_financeiro(v_owner,auth.uid())
    ) then
      raise exception 'Seu papel nao permite arquivar energia.';
    end if;
  else
    raise exception 'Entidade nao permitida.';
  end if;

  if p_arquivar and v_entity='imovel' and exists(
    select 1 from public.contratos c
    where c.user_id=v_owner
      and c.imovel_id=p_id
      and c.ativo
      and c.arquivado_em is null
  ) then
    raise exception 'Encerre o contrato ativo antes de arquivar o imovel.';
  end if;

  if p_arquivar and v_entity='inquilino' and exists(
    select 1 from public.contratos c
    where c.user_id=v_owner
      and c.tenant_id=p_id
      and c.ativo
      and c.arquivado_em is null
  ) then
    raise exception 'Encerre o contrato ativo antes de arquivar o inquilino.';
  end if;

  if p_arquivar and v_entity='contrato' and exists(
    select 1 from public.contratos c
    where c.user_id=v_owner
      and c.id=p_id
      and c.ativo
  ) then
    raise exception 'Encerre o contrato antes de arquiva-lo.';
  end if;

  if not p_arquivar and v_entity='contrato' and not exists(
    select 1
    from public.contratos c
    join public.imoveis i
      on i.id=c.imovel_id and i.user_id=c.user_id
    left join public.inquilinos t
      on t.id=c.tenant_id and t.user_id=c.user_id
    where c.id=p_id
      and c.user_id=v_owner
      and i.arquivado_em is null
      and (c.tenant_id is null or t.arquivado_em is null)
  ) then
    raise exception 'Restaure primeiro o imovel e o inquilino deste contrato.';
  end if;

  if not p_arquivar and v_entity='reajuste' and not exists(
    select 1
    from public.aluguel_historico h
    join public.imoveis i
      on i.id=h.imovel_id and i.user_id=h.user_id
    left join public.contratos c
      on c.id=h.contrato_id and c.user_id=h.user_id
    where h.id=p_id
      and h.user_id=v_owner
      and i.arquivado_em is null
      and (h.contrato_id is null or c.arquivado_em is null)
  ) then
    raise exception 'Restaure primeiro o imovel e o contrato deste reajuste.';
  end if;

  if not p_arquivar and v_entity='reajuste' and exists(
    select 1
    from public.aluguel_historico source
    join public.aluguel_historico active
      on active.user_id=source.user_id
     and active.id<>source.id
     and active.contrato_id is not distinct from source.contrato_id
     and active.imovel_id=source.imovel_id
     and active.data_inicio=source.data_inicio
     and active.arquivado_em is null
    where source.id=p_id
      and source.user_id=v_owner
  ) then
    raise exception
      'Ja existe outro reajuste ativo para este contrato e competencia.';
  end if;

  if not p_arquivar and v_entity='cobranca' and not exists(
    select 1
    from public.financeiro_cobrancas c
    join public.imoveis i
      on i.id=c.imovel_id and i.user_id=c.user_id
    where c.id=p_id
      and c.user_id=v_owner
      and i.arquivado_em is null
  ) then
    raise exception 'Restaure primeiro o imovel desta cobranca.';
  end if;

  if not p_arquivar and v_entity='cobranca' and exists(
    select 1
    from public.financeiro_cobrancas source
    join public.financeiro_cobrancas active
      on active.user_id=source.user_id
     and active.id<>source.id
     and active.imovel_id=source.imovel_id
     and active.contrato_id is not distinct from source.contrato_id
     and active.competencia=source.competencia
     and active.tipo=source.tipo
     and active.arquivado_em is null
    where source.id=p_id
      and source.user_id=v_owner
  ) then
    raise exception
      'Ja existe outra cobranca ativa deste tipo para o mesmo mes.';
  end if;

  if not p_arquivar and v_entity='recebimento' and not exists(
    select 1
    from public.financeiro_recebimentos r
    join public.financeiro_cobrancas c
      on c.id=r.cobranca_id and c.user_id=r.user_id
    where r.id=p_id
      and r.user_id=v_owner
      and c.arquivado_em is null
  ) then
    raise exception 'Restaure primeiro a cobranca deste recebimento.';
  end if;

  if not p_arquivar and v_entity in ('pagamento','despesa','energia')
     and not exists(
       select 1
       from public.imoveis i
       where i.user_id=v_owner
         and i.arquivado_em is null
         and i.id=case
           when v_entity='pagamento' then (
             select p.imovel_id from public.pagamentos p
             where p.id=p_id and p.user_id=v_owner
           )
           when v_entity='despesa' then (
             select d.imovel_id from public.despesas d
             where d.id=p_id and d.user_id=v_owner
           )
           else (
             select e.imovel_id from public.energia e
             where e.id=p_id and e.user_id=v_owner
           )
         end
     ) then
    raise exception 'Restaure primeiro o imovel deste lancamento.';
  end if;

  perform set_config('app.alterando_arquivamento','1',true);

  if v_entity='imovel' then
    update public.imoveis
    set arquivado_em=case when p_arquivar then now() else null end,
        arquivado_por=case when p_arquivar then auth.uid() else null end,
        motivo_arquivamento=case when p_arquivar then v_reason else '' end,
        publicado=case when p_arquivar then false else publicado end,
        updated_at=now()
    where id=p_id
      and user_id=v_owner
      and (
        (p_arquivar and arquivado_em is null)
        or (not p_arquivar and arquivado_em is not null)
      );
    v_found:=found;
  elsif v_entity='inquilino' then
    update public.inquilinos
    set arquivado_em=case when p_arquivar then now() else null end,
        arquivado_por=case when p_arquivar then auth.uid() else null end,
        motivo_arquivamento=case when p_arquivar then v_reason else '' end
    where id=p_id
      and user_id=v_owner
      and (
        (p_arquivar and arquivado_em is null)
        or (not p_arquivar and arquivado_em is not null)
      );
    v_found:=found;
  elsif v_entity='contrato' then
    update public.contratos
    set arquivado_em=case when p_arquivar then now() else null end,
        arquivado_por=case when p_arquivar then auth.uid() else null end,
        motivo_arquivamento=case when p_arquivar then v_reason else '' end,
        updated_at=now()
    where id=p_id
      and user_id=v_owner
      and (
        (p_arquivar and arquivado_em is null)
        or (not p_arquivar and arquivado_em is not null)
      );
    v_found:=found;
  elsif v_entity='cobranca' then
    update public.financeiro_cobrancas
    set arquivado_em=case when p_arquivar then now() else null end,
        arquivado_por=case when p_arquivar then auth.uid() else null end,
        motivo_arquivamento=case when p_arquivar then v_reason else '' end,
        updated_at=now()
    where id=p_id
      and user_id=v_owner
      and (
        (p_arquivar and arquivado_em is null)
        or (not p_arquivar and arquivado_em is not null)
      );
    v_found:=found;
  elsif v_entity='recebimento' then
    update public.financeiro_recebimentos
    set arquivado_em=case when p_arquivar then now() else null end,
        arquivado_por=case when p_arquivar then auth.uid() else null end,
        motivo_arquivamento=case when p_arquivar then v_reason else '' end,
        updated_at=now()
    where id=p_id
      and user_id=v_owner
      and (
        (p_arquivar and arquivado_em is null)
        or (not p_arquivar and arquivado_em is not null)
      );
    v_found:=found;
  elsif v_entity='pagamento' then
    update public.pagamentos
    set arquivado_em=case when p_arquivar then now() else null end,
        arquivado_por=case when p_arquivar then auth.uid() else null end,
        motivo_arquivamento=case when p_arquivar then v_reason else '' end
    where id=p_id
      and user_id=v_owner
      and (
        (p_arquivar and arquivado_em is null)
        or (not p_arquivar and arquivado_em is not null)
      );
    v_found:=found;
  elsif v_entity='despesa' then
    update public.despesas
    set arquivado_em=case when p_arquivar then now() else null end,
        arquivado_por=case when p_arquivar then auth.uid() else null end,
        motivo_arquivamento=case when p_arquivar then v_reason else '' end
    where id=p_id
      and user_id=v_owner
      and (
        (p_arquivar and arquivado_em is null)
        or (not p_arquivar and arquivado_em is not null)
      );
    v_found:=found;
  elsif v_entity='energia' then
    update public.energia
    set arquivado_em=case when p_arquivar then now() else null end,
        arquivado_por=case when p_arquivar then auth.uid() else null end,
        motivo_arquivamento=case when p_arquivar then v_reason else '' end
    where id=p_id
      and user_id=v_owner
      and (
        (p_arquivar and arquivado_em is null)
        or (not p_arquivar and arquivado_em is not null)
      );
    v_found:=found;
  elsif v_entity='reajuste' then
    update public.aluguel_historico
    set arquivado_em=case when p_arquivar then now() else null end,
        arquivado_por=case when p_arquivar then auth.uid() else null end,
        motivo_arquivamento=case when p_arquivar then v_reason else '' end,
        updated_at=now()
    where id=p_id
      and user_id=v_owner
      and (
        (p_arquivar and arquivado_em is null)
        or (not p_arquivar and arquivado_em is not null)
      );
    v_found:=found;
  end if;

  if not v_found then
    raise exception 'Registro nao encontrado ou ja estava nesse estado.';
  end if;
  perform set_config('app.alterando_arquivamento','0',true);

  return jsonb_build_object(
    'entidade',v_entity,
    'id',p_id,
    'arquivado',p_arquivar
  );
end
$$;

create or replace function public.listar_arquivados_aluguel()
returns table(
  entidade text,
  id uuid,
  titulo text,
  arquivado_em timestamptz,
  motivo text
)
language sql
stable
security definer
set search_path=public
as $$
  with owner as (
    select public.usuario_proprietario_id(auth.uid()) id
  )
  select 'imovel',i.id,i.nome,i.arquivado_em,i.motivo_arquivamento
  from public.imoveis i,owner o
  where i.user_id=o.id and i.arquivado_em is not null
    and public.pode_ler_conta(o.id,auth.uid())
  union all
  select 'inquilino',t.id,t.nome,t.arquivado_em,t.motivo_arquivamento
  from public.inquilinos t,owner o
  where t.user_id=o.id and t.arquivado_em is not null
    and public.pode_ler_conta(o.id,auth.uid())
  union all
  select
    'contrato',
    c.id,
    coalesce(i.nome,'Imovel')||' - '||coalesce(t.nome,'Sem inquilino'),
    c.arquivado_em,
    c.motivo_arquivamento
  from public.contratos c
  left join public.imoveis i on i.id=c.imovel_id and i.user_id=c.user_id
  left join public.inquilinos t on t.id=c.tenant_id and t.user_id=c.user_id
  cross join owner o
  where c.user_id=o.id and c.arquivado_em is not null
    and public.pode_ler_conta(o.id,auth.uid())
  union all
  select
    'cobranca',
    c.id,
    coalesce(nullif(c.descricao,''),c.tipo||' '||c.competencia),
    c.arquivado_em,
    c.motivo_arquivamento
  from public.financeiro_cobrancas c,owner o
  where c.user_id=o.id and c.arquivado_em is not null
    and public.pode_ler_conta(o.id,auth.uid())
  union all
  select
    'recebimento',
    r.id,
    'Recebimento '||r.data_pagamento||' - R$ '||r.valor,
    r.arquivado_em,
    r.motivo_arquivamento
  from public.financeiro_recebimentos r,owner o
  where r.user_id=o.id and r.arquivado_em is not null
    and public.pode_ler_conta(o.id,auth.uid())
  union all
  select
    'pagamento',
    p.id,
    'Pagamento '||p.mes||' - R$ '||p.valor_pago,
    p.arquivado_em,
    p.motivo_arquivamento
  from public.pagamentos p,owner o
  where p.user_id=o.id and p.arquivado_em is not null
    and public.pode_ler_conta(o.id,auth.uid())
  union all
  select
    'despesa',
    d.id,
    coalesce(nullif(d.descricao,''),'Despesa')||' - R$ '||d.valor,
    d.arquivado_em,
    d.motivo_arquivamento
  from public.despesas d,owner o
  where d.user_id=o.id and d.arquivado_em is not null
    and public.pode_ler_conta(o.id,auth.uid())
  union all
  select
    'energia',
    e.id,
    'Energia '||e.mes||' - R$ '||e.valor,
    e.arquivado_em,
    e.motivo_arquivamento
  from public.energia e,owner o
  where e.user_id=o.id and e.arquivado_em is not null
    and public.pode_ler_conta(o.id,auth.uid())
  union all
  select
    'reajuste',
    h.id,
    'Reajuste '||substring(h.data_inicio::text,1,7)||' - R$ '||h.valor,
    h.arquivado_em,
    h.motivo_arquivamento
  from public.aluguel_historico h,owner o
  where h.user_id=o.id and h.arquivado_em is not null
    and public.pode_ler_conta(o.id,auth.uid())
  order by arquivado_em desc
$$;

revoke all on function
  public.alterar_arquivamento_aluguel(text,uuid,boolean,text)
  from public,anon;
revoke all on function public.listar_arquivados_aluguel()
  from public,anon;
grant execute on function
  public.alterar_arquivamento_aluguel(text,uuid,boolean,text)
  to authenticated;
grant execute on function public.listar_arquivados_aluguel()
  to authenticated;

-- ------------------------------------------------------------
-- 7.1 Recortes de dados pessoais e arquivos por papel
-- ------------------------------------------------------------

-- RLS limita as linhas, mas nao consegue ocultar colunas. Estes RPCs sao a
-- unica leitura completa de inquilinos e documentos para o aplicativo.
-- Financeiro e leitura recebem CPF mascarado e nunca recebem o conteudo ou
-- o caminho de um documento pessoal.
create or replace function public.listar_inquilinos_aluguel(
  p_incluir_arquivados boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_owner uuid;
  v_portal_owner uuid;
  v_portal_tenant uuid;
  v_papel text;
  v_sensivel boolean:=false;
begin
  if v_uid is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  v_portal_owner:=public.portal_owner_id();
  v_portal_tenant:=public.portal_inquilino_id();
  if v_portal_owner is not null and v_portal_tenant is not null then
    return coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',t.id,
          'user_id',t.user_id,
          'nome',t.nome,
          'telefone',coalesce(t.telefone,''),
          'email',coalesce(t.email,''),
          'documento',coalesce(t.documento,''),
          'emergencia_nome',coalesce(t.emergencia_nome,''),
          'created_at',t.created_at,
          'arquivado_em',t.arquivado_em,
          'arquivado_por',t.arquivado_por,
          'motivo_arquivamento',coalesce(t.motivo_arquivamento,'')
        )
        order by t.created_at
      )
      from public.inquilinos t
      where t.user_id=v_portal_owner
        and t.id=v_portal_tenant
        and t.arquivado_em is null
    ),'[]'::jsonb);
  end if;

  v_owner:=public.usuario_proprietario_id(v_uid);
  if v_owner is null
     or not public.pode_ler_conta(v_owner,v_uid) then
    raise exception 'Acesso negado aos inquilinos desta conta.';
  end if;

  v_papel:=public.papel_colaborador_atual(v_uid);
  v_sensivel:=v_papel in ('administrador','operacional');

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id',t.id,
        'user_id',t.user_id,
        'nome',t.nome,
        'telefone',coalesce(t.telefone,''),
        'email',coalesce(t.email,''),
        'documento',
          case
            when v_sensivel then coalesce(t.documento,'')
            when nullif(trim(coalesce(t.documento,'')),'') is null then ''
            when length(regexp_replace(t.documento,'\D','','g'))>=4 then
              '•••••••'||right(regexp_replace(t.documento,'\D','','g'),4)
            else 'Documento protegido'
          end,
        'emergencia_nome',
          case when v_sensivel then coalesce(t.emergencia_nome,'') else '' end,
        'created_at',t.created_at,
        'arquivado_em',t.arquivado_em,
        'arquivado_por',t.arquivado_por,
        'motivo_arquivamento',coalesce(t.motivo_arquivamento,'')
      )
      order by t.created_at
    )
    from public.inquilinos t
    where t.user_id=v_owner
      and (p_incluir_arquivados or t.arquivado_em is null)
  ),'[]'::jsonb);
end
$$;

create or replace function public.listar_documentos_imovel(
  p_imovel_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_owner uuid;
  v_portal_owner uuid;
  v_portal_tenant uuid;
  v_papel text;
  v_sensivel boolean:=false;
begin
  if v_uid is null or p_imovel_id is null then
    raise exception 'Usuario ou imovel invalido.';
  end if;

  v_portal_owner:=public.portal_owner_id();
  v_portal_tenant:=public.portal_inquilino_id();
  if v_portal_owner is not null and v_portal_tenant is not null then
    return coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',d.id,
          'user_id',d.user_id,
          'imovel_id',d.imovel_id,
          'inquilino_id',d.inquilino_id,
          'tipo',coalesce(d.tipo,'outro'),
          'nome',coalesce(d.nome,'Arquivo'),
          'mime',coalesce(d.mime,''),
          'dados',coalesce(d.dados,''),
          'storage_path',coalesce(d.storage_path,''),
          'tamanho',coalesce(d.tamanho,0),
          'visivel_inquilino',coalesce(d.visivel_inquilino,false),
          'restrito',false,
          'created_at',d.created_at
        )
        order by d.created_at desc
      )
      from public.documentos d
      join public.imoveis i
        on i.id=d.imovel_id
       and i.user_id=d.user_id
      where d.user_id=v_portal_owner
        and d.imovel_id=p_imovel_id
        and d.inquilino_id=v_portal_tenant
        and d.visivel_inquilino
        and i.tenant_id=v_portal_tenant
    ),'[]'::jsonb);
  end if;

  v_owner:=public.usuario_proprietario_id(v_uid);
  if v_owner is null
     or not public.pode_ler_conta(v_owner,v_uid)
     or not exists(
       select 1 from public.imoveis i
       where i.id=p_imovel_id and i.user_id=v_owner
     ) then
    raise exception 'Acesso negado aos documentos deste imovel.';
  end if;

  v_papel:=public.papel_colaborador_atual(v_uid);
  v_sensivel:=v_papel in ('administrador','operacional');

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id',d.id,
        'user_id',d.user_id,
        'imovel_id',d.imovel_id,
        'inquilino_id',d.inquilino_id,
        'tipo',coalesce(d.tipo,'outro'),
        'nome',
          case when not v_sensivel
            then 'Arquivo protegido'
            else coalesce(d.nome,'Arquivo') end,
        'mime',
          case when not v_sensivel
            then '' else coalesce(d.mime,'') end,
        'dados',
          case when not v_sensivel
            then '' else coalesce(d.dados,'') end,
        'storage_path',
          case when not v_sensivel
            then '' else coalesce(d.storage_path,'') end,
        'tamanho',
          case when not v_sensivel
            then 0 else coalesce(d.tamanho,0) end,
        'visivel_inquilino',coalesce(d.visivel_inquilino,false),
        'restrito',not v_sensivel,
        'created_at',d.created_at
      )
      order by d.created_at desc
    )
    from public.documentos d
    where d.user_id=v_owner
      and d.imovel_id=p_imovel_id
  ),'[]'::jsonb);
end
$$;

create or replace function public.listar_documentos_portal()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_owner uuid:=public.portal_owner_id();
  v_tenant uuid:=public.portal_inquilino_id();
begin
  if auth.uid() is null or v_owner is null or v_tenant is null then
    raise exception 'Acesso do Portal invalido.';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id',d.id,
        'user_id',d.user_id,
        'imovel_id',d.imovel_id,
        'inquilino_id',d.inquilino_id,
        'tipo',coalesce(d.tipo,'outro'),
        'nome',coalesce(d.nome,'Arquivo'),
        'mime',coalesce(d.mime,''),
        'dados',coalesce(d.dados,''),
        'storage_path',coalesce(d.storage_path,''),
        'tamanho',coalesce(d.tamanho,0),
        'visivel_inquilino',coalesce(d.visivel_inquilino,false),
        'restrito',false,
        'created_at',d.created_at
      )
      order by d.created_at desc
    )
    from public.documentos d
    join public.imoveis i
      on i.id=d.imovel_id
     and i.user_id=d.user_id
    where d.user_id=v_owner
      and d.inquilino_id=v_tenant
      and d.visivel_inquilino
      and i.tenant_id=v_tenant
  ),'[]'::jsonb);
end
$$;

create or replace function public.listar_documentos_backup()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_owner uuid:=public.usuario_proprietario_id(auth.uid());
begin
  if auth.uid() is null
     or public.papel_colaborador_atual(auth.uid())<>'administrador'
     or not public.pode_ler_conta(v_owner,auth.uid()) then
    raise exception 'Somente administradores podem exportar documentos.';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id',d.id,
        'user_id',d.user_id,
        'imovel_id',d.imovel_id,
        'inquilino_id',d.inquilino_id,
        'tipo',coalesce(d.tipo,'outro'),
        'nome',coalesce(d.nome,'Arquivo'),
        'mime',coalesce(d.mime,''),
        'dados',coalesce(d.dados,''),
        'storage_path',coalesce(d.storage_path,''),
        'tamanho',coalesce(d.tamanho,0),
        'visivel_inquilino',coalesce(d.visivel_inquilino,false),
        'restrito',false,
        'created_at',d.created_at
      )
      order by d.created_at
    )
    from public.documentos d
    where d.user_id=v_owner
  ),'[]'::jsonb);
end
$$;

create or replace function public.obter_caminho_documento_operacional(
  p_documento_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_owner uuid:=public.usuario_proprietario_id(auth.uid());
  v_path text;
begin
  if auth.uid() is null
     or not public.pode_operar_imoveis(v_owner,auth.uid()) then
    raise exception 'Seu papel nao permite acessar este documento.';
  end if;

  select d.storage_path
    into v_path
  from public.documentos d
  where d.id=p_documento_id
    and d.user_id=v_owner;

  if not found then
    raise exception 'Documento nao encontrado.';
  end if;
  return coalesce(v_path,'');
end
$$;

revoke all on function public.listar_inquilinos_aluguel(boolean)
  from public,anon,authenticated;
revoke all on function public.listar_documentos_imovel(uuid)
  from public,anon,authenticated;
revoke all on function public.listar_documentos_portal()
  from public,anon,authenticated;
revoke all on function public.listar_documentos_backup()
  from public,anon,authenticated;
revoke all on function public.obter_caminho_documento_operacional(uuid)
  from public,anon,authenticated;
grant execute on function public.listar_inquilinos_aluguel(boolean)
  to authenticated;
grant execute on function public.listar_documentos_imovel(uuid)
  to authenticated;
grant execute on function public.listar_documentos_portal()
  to authenticated;
grant execute on function public.listar_documentos_backup()
  to authenticated;
grant execute on function public.obter_caminho_documento_operacional(uuid)
  to authenticated;

-- Esta definicao repete deliberadamente a versao canonica instalada por
-- migracao-vistoria-e-chamados.sql. Assim, reexecutar qualquer uma das duas
-- migracoes mantem a mesma protecao fail-closed no Storage.
create or replace function public.pode_ler_arquivo_operacional(
  p_caminho text
)
returns boolean
language plpgsql
stable
security definer
set search_path=public,storage
as $$
declare
  v_partes text[];
  v_owner uuid;
  v_papel text;
begin
  v_partes:=storage.foldername(p_caminho);
  if coalesce(array_length(v_partes,1),0)<1
     or v_partes[1] !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;

  v_owner:=v_partes[1]::uuid;
  if not public.pode_ler_conta(v_owner,auth.uid()) then
    return false;
  end if;

  v_papel:=public.papel_colaborador_atual(auth.uid());
  if v_papel in ('administrador','operacional') then
    return true;
  end if;
  if v_papel not in ('financeiro','leitura') then
    return false;
  end if;

  return exists(
      select 1 from public.fotos f
      where f.user_id=v_owner and f.storage_path=p_caminho
    )
    or exists(
      select 1 from public.energia e
      where e.user_id=v_owner and e.foto_path=p_caminho
    )
    or exists(
      select 1 from public.chamado_fotos f
      where f.user_id=v_owner and f.caminho=p_caminho
    )
    or exists(
      select 1 from public.vistoria_fotos f
      where f.user_id=v_owner and f.caminho=p_caminho
    );
end
$$;

revoke all on function public.pode_ler_arquivo_operacional(text)
  from public,anon,authenticated;
grant execute on function public.pode_ler_arquivo_operacional(text)
  to authenticated;

-- Remove a leitura irrestrita de colunas sensiveis. Escritas continuam
-- controladas pelos triggers por papel e as leituras completas passam
-- exclusivamente pelos RPCs acima.
revoke select on public.inquilinos from authenticated;
grant select(
  id,user_id,nome,telefone,email,created_at,
  arquivado_em,arquivado_por,motivo_arquivamento
) on public.inquilinos to authenticated;

revoke select on public.documentos from authenticated;
grant select(
  id,user_id,imovel_id,inquilino_id,tipo,visivel_inquilino,created_at
) on public.documentos to authenticated;

-- Convites e acessos do Portal tambem obedecem ao papel. Isso protege as
-- funcoes antigas security definer contra chamadas diretas de financeiro ou
-- leitura, mesmo que a interface ja esconda os botoes.
create or replace function public.validar_papel_portal_inquilino()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_row jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_owner uuid:=nullif(v_row->>'proprietario_id','')::uuid;
begin
  if auth.uid() is null then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if v_owner is null
     or not public.pode_operar_imoveis(v_owner,auth.uid()) then
    raise exception 'Seu papel nao permite alterar o acesso do Portal.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end
$$;

drop trigger if exists validar_papel_portal_inquilino
  on public.convites_inquilino;
create trigger validar_papel_portal_inquilino
before insert or update or delete on public.convites_inquilino
for each row execute function public.validar_papel_portal_inquilino();

drop trigger if exists validar_papel_portal_inquilino
  on public.acessos_inquilino;
create trigger validar_papel_portal_inquilino
before insert or update or delete on public.acessos_inquilino
for each row execute function public.validar_papel_portal_inquilino();

revoke all on function public.validar_papel_portal_inquilino()
  from public,anon,authenticated;

-- Backups contem um retrato amplo da conta e nunca podem virar um atalho para
-- um colaborador de leitura obter dados que os RPCs acima mascaram.
drop policy if exists own_rows on public.backups;
drop policy if exists owner_active_rows on public.backups;
drop policy if exists backups_admin_gerenciar on public.backups;
create policy backups_admin_gerenciar
on public.backups
for all
to authenticated
using (
  public.papel_colaborador_atual(auth.uid())='administrador'
  and public.pode_ler_conta(user_id,auth.uid())
)
with check (
  public.papel_colaborador_atual(auth.uid())='administrador'
  and public.pode_ler_conta(user_id,auth.uid())
);

-- ------------------------------------------------------------
-- 8. RLS, grants e revokes
-- ------------------------------------------------------------

alter table public.financeiro_cobrancas enable row level security;
alter table public.financeiro_cobrancas force row level security;
alter table public.financeiro_recebimentos enable row level security;
alter table public.financeiro_recebimentos force row level security;
alter table public.financeiro_auditoria enable row level security;
alter table public.financeiro_auditoria force row level security;

drop policy if exists financeiro_cobrancas_ler
  on public.financeiro_cobrancas;
create policy financeiro_cobrancas_ler
on public.financeiro_cobrancas
for select
to authenticated
using (
  public.pode_ler_conta(user_id,auth.uid())
);

drop policy if exists financeiro_cobrancas_inserir
  on public.financeiro_cobrancas;
create policy financeiro_cobrancas_inserir
on public.financeiro_cobrancas
for insert
to authenticated
with check (public.pode_gerenciar_financeiro(user_id,auth.uid()));

drop policy if exists financeiro_cobrancas_alterar
  on public.financeiro_cobrancas;
create policy financeiro_cobrancas_alterar
on public.financeiro_cobrancas
for update
to authenticated
using (public.pode_gerenciar_financeiro(user_id,auth.uid()))
with check (public.pode_gerenciar_financeiro(user_id,auth.uid()));

drop policy if exists financeiro_cobrancas_excluir
  on public.financeiro_cobrancas;

drop policy if exists financeiro_recebimentos_ler
  on public.financeiro_recebimentos;
create policy financeiro_recebimentos_ler
on public.financeiro_recebimentos
for select
to authenticated
using (
  public.pode_ler_conta(user_id,auth.uid())
);

-- O portal usa carregar_financeiro_portal(), que devolve um recorte sem
-- metadados internos. Nenhuma leitura direta adicional fica aberta aqui.
drop policy if exists tenant_read
  on public.aluguel_historico;

drop policy if exists financeiro_recebimentos_inserir
  on public.financeiro_recebimentos;
create policy financeiro_recebimentos_inserir
on public.financeiro_recebimentos
for insert
to authenticated
with check (public.pode_gerenciar_financeiro(user_id,auth.uid()));

drop policy if exists financeiro_recebimentos_alterar
  on public.financeiro_recebimentos;
create policy financeiro_recebimentos_alterar
on public.financeiro_recebimentos
for update
to authenticated
using (public.pode_gerenciar_financeiro(user_id,auth.uid()))
with check (public.pode_gerenciar_financeiro(user_id,auth.uid()));

drop policy if exists financeiro_recebimentos_excluir
  on public.financeiro_recebimentos;

drop policy if exists financeiro_auditoria_ler
  on public.financeiro_auditoria;
create policy financeiro_auditoria_ler
on public.financeiro_auditoria
for select
to authenticated
using (
  public.pode_ler_conta(user_id,auth.uid())
  and public.papel_colaborador_atual(auth.uid())='administrador'
);

revoke all on public.financeiro_cobrancas
  from public,anon,authenticated;
revoke all on public.financeiro_recebimentos
  from public,anon,authenticated;
revoke all on public.financeiro_auditoria
  from public,anon,authenticated;
revoke all on public.financeiro_cobrancas_resumo
  from public,anon,authenticated;

grant select,insert,update on public.financeiro_cobrancas
  to authenticated;
grant select,insert,update on public.financeiro_recebimentos
  to authenticated;
grant select on public.financeiro_auditoria
  to authenticated;
grant select on public.financeiro_cobrancas_resumo
  to authenticated;

revoke all on function public.financeiro_preparar_lancamento()
  from public,anon;
revoke all on function public.financeiro_vencimento_mes(text,integer)
  from public,anon;
revoke all on function public.financeiro_json_auditoria(jsonb)
  from public,anon;
revoke all on function public.financeiro_auditar_alteracao()
  from public,anon;
revoke all on function public.validar_papel_escrita_aluguel()
  from public,anon;
revoke all on function public.financeiro_sincronizar_pagamento_legado()
  from public,anon;
revoke all on function public.financeiro_sincronizar_energia_legada()
  from public,anon;
revoke all on function public.financeiro_sincronizar_ajuste_contrato()
  from public,anon;
revoke all on function public.gerar_cobrancas_aluguel_mes(text)
  from public,anon;
revoke all on function public.validar_periodo_contrato()
  from public,anon,authenticated;
revoke all on function public.proteger_arquivamento_direto()
  from public,anon,authenticated;

-- Funcoes de trigger nao precisam ser chamadas diretamente pelo aplicativo.
revoke execute on function public.financeiro_preparar_lancamento()
  from authenticated;
revoke execute on function public.financeiro_json_auditoria(jsonb)
  from authenticated;
revoke execute on function public.financeiro_auditar_alteracao()
  from authenticated;
revoke execute on function public.validar_papel_escrita_aluguel()
  from authenticated;
revoke execute on function public.financeiro_sincronizar_pagamento_legado()
  from authenticated;
revoke execute on function public.financeiro_sincronizar_energia_legada()
  from authenticated;
revoke execute on function public.financeiro_sincronizar_ajuste_contrato()
  from authenticated;
grant execute on function public.financeiro_vencimento_mes(text,integer)
  to authenticated;

-- Exclusão definitiva deixa de ser uma operação comum. Todos estes registros
-- passam pelo arquivamento recuperável e pelas verificações de dependência.
revoke delete on public.imoveis,public.inquilinos,public.contratos,
  public.pagamentos,public.energia,public.despesas,
  public.aluguel_historico
from authenticated;
revoke truncate on public.imoveis,public.inquilinos,public.contratos,
  public.pagamentos,public.energia,public.despesas,
  public.aluguel_historico,public.financeiro_cobrancas,
  public.financeiro_recebimentos,public.financeiro_auditoria
from authenticated;

do $desativar_exclusao_antiga$
begin
  if to_regprocedure(
    'public.excluir_contrato_por_engano(uuid,text)'
  ) is not null then
    execute
      'revoke all on function public.excluir_contrato_por_engano(uuid,text) from public,anon,authenticated';
  end if;
  if to_regprocedure(
    'public.excluir_inquilino_por_engano(uuid,text)'
  ) is not null then
    execute
      'revoke all on function public.excluir_inquilino_por_engano(uuid,text) from public,anon,authenticated';
  end if;
end
$desativar_exclusao_antiga$;

-- Verificacao manual sugerida depois da execucao:
-- select
--   (select count(*) from public.pagamentos) pagamentos_antigos,
--   (select count(*) from public.financeiro_cobrancas
--      where origem_tipo='pagamento_legado') cobrancas_importadas,
--   (select count(*) from public.financeiro_recebimentos
--      where origem_tipo='pagamento_legado') recebimentos_importados;
grant execute on function public.gerar_cobrancas_aluguel_mes(text)
  to authenticated;

commit;
