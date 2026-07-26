-- ============================================================
-- SEPARACAO DEFINITIVA: INQUILINOS X CLIENTES PROPRIETARIOS
--
-- Execute depois de:
--   1. migracao-versao-comercial-v1.sql
--   2. migracao-tipos-acesso.sql
--   3. migracao-minha-casa.sql
--   4. migracao-exclusao-contratos.sql
--
-- Objetivos:
--   * inquilino nunca possui plano ou perfil de proprietario;
--   * cliente comercial e sempre um proprietario real da plataforma;
--   * funcionario usa a conta do proprietario e nao tem plano proprio;
--   * qualquer perfil duplo falha fechado nas funcoes de autorizacao;
--   * o reparo pontual de Gabriel/Nicolas preserva auth e todos os dados;
--   * a migracao pode ser executada novamente com seguranca.
--
-- ============================================================

begin;

-- ------------------------------------------------------------
-- PRE-REQUISITOS
-- ------------------------------------------------------------

do $preflight$
begin
  if to_regclass('auth.users') is null
     or to_regclass('public.proprietarios') is null
     or to_regclass('public.assinaturas') is null
     or to_regclass('public.inquilinos') is null
     or to_regclass('public.convites_inquilino') is null
     or to_regclass('public.acessos_inquilino') is null
     or to_regclass('public.convites_colaborador') is null
     or to_regclass('public.acessos_colaborador') is null
     or to_regclass('public.convites_proprietario') is null
     or to_regclass('public.auditoria_comercial') is null
     or to_regclass('storage.objects') is null
     or to_regprocedure('public.e_administrador_plataforma(uuid)') is null then
    raise exception
      'A separacao de contas requer as migracoes Comercial, Tipos de Acesso e Minha Casa.';
  end if;
end
$preflight$;

-- ------------------------------------------------------------
-- FUNCOES INTERNAS DE INTEGRIDADE
-- ------------------------------------------------------------

-- Backups v2/v6 guardam as colecoes em arrays e fotos/documentos em mapas.
-- Ausencia de uma chave e aceita, mas qualquer tipo inesperado falha fechado:
-- o backup passa a ser considerado operacional e nunca e apagado pelo reparo.
create or replace function public.backup_possui_dados_operacionais(
  p_dados jsonb
)
returns boolean
language sql
immutable
security definer
set search_path=public
as $$
  select
    p_dados is null
    or jsonb_typeof(p_dados)<>'object'
    or exists(
      select 1
      from (
        values
          ('houses'),('tenants'),('contracts'),('payments'),('energy'),
          ('expenses'),('history'),('adjustments'),('interests'),
          ('eventos'),('events')
      ) as colecao(chave)
      where p_dados ? colecao.chave
        and (
          jsonb_typeof(p_dados->colecao.chave)<>'array'
          or p_dados->colecao.chave<>'[]'::jsonb
        )
    )
    or exists(
      select 1
      from (values ('photos'),('documents')) as mapa(chave)
      where p_dados ? mapa.chave
        and (
          jsonb_typeof(p_dados->mapa.chave)<>'object'
          or p_dados->mapa.chave<>'{}'::jsonb
        )
    )
$$;

revoke all on function public.backup_possui_dados_operacionais(jsonb)
  from public,anon,authenticated;

-- Detecta qualquer dado operacional criado por uma conta proprietaria.
-- Termos aceitos e o proprio perfil comercial nao entram nesta verificacao:
-- eles nao sao dados de casas e podem permanecer associados ao auth.user.
create or replace function public.conta_possui_dados_operacionais(
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select
    p_user_id is null
    or exists(select 1 from public.imoveis i where i.user_id=p_user_id)
    or exists(select 1 from public.inquilinos i where i.user_id=p_user_id)
    or exists(select 1 from public.pagamentos p where p.user_id=p_user_id)
    or exists(select 1 from public.energia e where e.user_id=p_user_id)
    or exists(select 1 from public.despesas d where d.user_id=p_user_id)
    or exists(select 1 from public.historico_status h where h.user_id=p_user_id)
    or exists(select 1 from public.fotos f where f.user_id=p_user_id)
    or exists(select 1 from public.contratos c where c.user_id=p_user_id)
    or exists(select 1 from public.documentos d where d.user_id=p_user_id)
    or exists(select 1 from public.eventos e where e.user_id=p_user_id)
    or exists(select 1 from public.configuracoes c where c.user_id=p_user_id)
    or exists(select 1 from public.aluguel_historico h where h.user_id=p_user_id)
    or exists(
      select 1
      from public.backups b
      where b.user_id=p_user_id
        and public.backup_possui_dados_operacionais(b.dados)
    )
    or exists(select 1 from public.interessados i where i.user_id=p_user_id)
    or exists(
      select 1
      from storage.objects o
      where o.bucket_id='imoveis-arquivos'
        and (storage.foldername(o.name))[1]=p_user_id::text
    )
$$;

revoke all on function public.conta_possui_dados_operacionais(uuid)
  from public,anon,authenticated;

-- So autoriza a conversao quando o perfil foi criado automaticamente como
-- Gratuito, nunca recebeu pagamento, nunca foi uma venda e esta vazio.
create or replace function public.conta_proprietaria_gratuita_vazia(
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select
    p_user_id is not null
    and not public.e_administrador_plataforma(p_user_id)
    and not exists(
      select 1
      from public.administradores_plataforma m
      where m.user_id=p_user_id
    )
    and exists(
      select 1
      from public.proprietarios p
      join public.assinaturas a on a.user_id=p.user_id
      where p.user_id=p_user_id
        and a.plano='gratuito'
        and a.status='ativa'
        and coalesce(a.valor_pago,0)=0
        and a.criado_por is null
        and a.pagamento_confirmado_em is null
        and trim(coalesce(a.forma_pagamento,''))=''
        and trim(coalesce(a.referencia_pagamento,''))=''
        and trim(coalesce(a.observacoes,''))=''
        and trim(coalesce(p.telefone,''))=''
        and trim(coalesce(p.documento,''))=''
        and trim(coalesce(p.empresa,''))=''
        and p.slug_publico is null
        and trim(coalesce(p.nome_publico,''))=''
        and trim(coalesce(p.contato_publico,''))=''
    )
    and not public.conta_possui_dados_operacionais(p_user_id)
    and not exists(
      select 1
      from public.convites_proprietario c
      where c.aceito_por=p_user_id
        and c.status='aceito'
    )
    and not exists(
      select 1
      from public.convites_colaborador c
      where c.proprietario_id=p_user_id
    )
    and not exists(
      select 1
      from public.acessos_colaborador a
      where a.proprietario_id=p_user_id or a.user_id=p_user_id
    )
$$;

revoke all on function public.conta_proprietaria_gratuita_vazia(uuid)
  from public,anon,authenticated;

-- Reserva de e-mail para o papel de inquilino. Convite ainda nao aceito,
-- acesso suspenso e conta aguardando vinculo continuam sendo inquilino:
-- suspender o portal nao transforma a pessoa em cliente comercial.
create or replace function public.email_reservado_inquilino(
  p_email text
)
returns boolean
language sql
stable
security definer
set search_path=public,auth
as $$
  with alvo as (
    select lower(trim(coalesce(p_email,''))) as email
  )
  select exists(
    select 1
    from public.convites_inquilino c,alvo
    where lower(trim(c.email))=alvo.email
  )
  or exists(
    select 1
    from public.acessos_inquilino a
    left join auth.users u on u.id=a.user_id
    cross join alvo
    where lower(trim(coalesce(u.email,a.email)))=alvo.email
  )
  or exists(
    select 1
    from auth.users u,alvo
    where lower(trim(u.email))=alvo.email
      and lower(coalesce(u.raw_user_meta_data->>'account_type',''))='tenant'
  )
$$;

revoke all on function public.email_reservado_inquilino(text)
  from public,anon,authenticated;

create or replace function public.email_reservado_colaborador(
  p_email text
)
returns boolean
language sql
stable
security definer
set search_path=public,auth
as $$
  with alvo as (
    select lower(trim(coalesce(p_email,''))) as email
  )
  select exists(
    select 1
    from public.convites_colaborador c,alvo
    where lower(trim(c.email))=alvo.email
      and c.status='pendente'
  )
  or exists(
    select 1
    from public.acessos_colaborador a
    left join auth.users u on u.id=a.user_id
    cross join alvo
    where lower(trim(coalesce(u.email,a.email)))=alvo.email
  )
$$;

revoke all on function public.email_reservado_colaborador(text)
  from public,anon,authenticated;

-- ------------------------------------------------------------
-- REPARO PONTUAL, ESTRITAMENTE GUARDADO
--
-- Login real:       gabrielsousa__@outlook.com (dois "_")
-- Cadastro Nicolas: gabrielsousa_@outlook.com  (um "_", erro de digitacao)
--
-- O bloco nao apaga auth.users, inquilino, casa, contrato, pagamento,
-- energia ou documento. Se qualquer evidencia indicar que a conta e um
-- proprietario real, toda a migracao e interrompida sem alterar nada.
-- ------------------------------------------------------------

do $reparo_gabriel_nicolas$
declare
  v_auth_email constant text:='gabrielsousa__@outlook.com';
  v_email_antigo constant text:='gabrielsousa_@outlook.com';
  v_auth_user uuid;
  v_owner uuid;
  v_inquilino uuid;
  v_total integer;
  v_ja_corrigido boolean:=false;
  v_removeu_perfil boolean:=false;
begin
  select count(*)
    into v_total
  from auth.users u
  where lower(trim(u.email))=v_auth_email;

  -- Permite instalar as protecoes em ambientes em que este usuario nao existe.
  if v_total=0 then
    raise notice
      'Reparo Gabriel/Nicolas ignorado: auth user % nao existe neste ambiente.',
      v_auth_email;
    return;
  end if;
  if v_total<>1 then
    raise exception
      'Reparo Gabriel/Nicolas abortado: existem % auth users para %.',
      v_total,v_auth_email;
  end if;

  select u.id
    into v_auth_user
  from auth.users u
  where lower(trim(u.email))=v_auth_email
  order by u.created_at
  limit 1;

  perform pg_advisory_xact_lock(hashtextextended(v_auth_user::text,0));
  perform 1 from auth.users u where u.id=v_auth_user for update;

  if public.e_administrador_plataforma(v_auth_user) then
    raise exception
      'Reparo Gabriel/Nicolas abortado: a conta foi reconhecida como Mestre.';
  end if;
  if exists(
    select 1
    from public.administradores_plataforma m
    where m.user_id=v_auth_user
  ) then
    raise exception
      'Reparo Gabriel/Nicolas abortado: existe um cadastro administrativo legado.';
  end if;

  select count(*)
    into v_total
  from auth.users u
  where lower(trim(u.email))='andertonaluguel@gmail.com'
    and u.email_confirmed_at is not null;
  if v_total<>1 then
    raise exception
      'Reparo Gabriel/Nicolas abortado: o Mestre principal confirmado nao e unico.';
  end if;

  select u.id
    into v_owner
  from auth.users u
  where lower(trim(u.email))='andertonaluguel@gmail.com'
    and u.email_confirmed_at is not null
  order by u.created_at
  limit 1;

  select count(*)
    into v_total
  from public.inquilinos i
  where i.user_id=v_owner
    and lower(trim(i.nome))='nicolas'
    and lower(trim(coalesce(i.email,''))) in (v_email_antigo,v_auth_email);
  if v_total<>1 then
    raise exception
      'Reparo Gabriel/Nicolas abortado: esperava um Nicolas do Mestre com e-mail de um ou dois sublinhados; encontrados %.',
      v_total;
  end if;

  select i.id
    into v_inquilino
  from public.inquilinos i
  where i.user_id=v_owner
    and lower(trim(i.nome))='nicolas'
    and lower(trim(coalesce(i.email,''))) in (v_email_antigo,v_auth_email)
  order by i.created_at
  limit 1;

  perform 1
  from public.inquilinos i
  where i.id=v_inquilino
  for update;

  if exists(
    select 1
    from public.acessos_inquilino a
    where a.user_id=v_auth_user
      and (
        a.proprietario_id is distinct from v_owner
        or a.inquilino_id is distinct from v_inquilino
      )
  ) then
    raise exception
      'Reparo Gabriel/Nicolas abortado: o login ja esta ligado a outro inquilino ou proprietario.';
  end if;

  if exists(
    select 1
    from public.acessos_inquilino a
    where a.proprietario_id=v_owner
      and a.inquilino_id=v_inquilino
      and a.user_id<>v_auth_user
  ) then
    raise exception
      'Reparo Gabriel/Nicolas abortado: Nicolas ja esta ligado a outro auth user.';
  end if;

  if exists(
    select 1
    from public.acessos_colaborador a
    where a.user_id=v_auth_user
  ) then
    raise exception
      'Reparo Gabriel/Nicolas abortado: a conta possui perfil de colaborador.';
  end if;

  if exists(
    select 1
    from public.convites_colaborador c
    where lower(trim(c.email))=v_auth_email
      and c.status='pendente'
  ) then
    raise exception
      'Reparo Gabriel/Nicolas abortado: existe convite pendente de colaborador.';
  end if;

  if exists(
    select 1
    from public.convites_proprietario c
    where (
      c.aceito_por=v_auth_user
      or lower(trim(c.email))=v_auth_email
    )
      and c.status in ('aguardando_pagamento','pendente','aceito')
  ) then
    raise exception
      'Reparo Gabriel/Nicolas abortado: existe venda ou convite de proprietario.';
  end if;

  if exists(
    select 1
    from public.convites_inquilino c
    where lower(trim(c.email))=v_auth_email
      and (
        c.proprietario_id is distinct from v_owner
        or c.inquilino_id is distinct from v_inquilino
      )
  ) then
    raise exception
      'Reparo Gabriel/Nicolas abortado: o e-mail esta reservado para outro portal.';
  end if;

  v_ja_corrigido:=
    exists(
      select 1
      from public.acessos_inquilino a
      where a.user_id=v_auth_user
        and a.proprietario_id=v_owner
        and a.inquilino_id=v_inquilino
    )
    and not exists(
      select 1 from public.proprietarios p where p.user_id=v_auth_user
    )
    and not exists(
      select 1 from public.assinaturas a where a.user_id=v_auth_user
    );

  if exists(
    select 1 from public.proprietarios p where p.user_id=v_auth_user
  ) then
    if not public.conta_proprietaria_gratuita_vazia(v_auth_user) then
      raise exception
        'Reparo Gabriel/Nicolas abortado: o perfil nao e Gratuito e vazio. Nenhum dado foi alterado.';
    end if;

    -- O app cria um retrato diario mesmo quando a conta esta totalmente vazia.
    -- A validacao acima garante que nenhum backup com dado real chega aqui.
    delete from public.backups b
    where b.user_id=v_auth_user
      and not public.backup_possui_dados_operacionais(b.dados);

    delete from public.assinaturas a
    where a.user_id=v_auth_user;
    if not found then
      raise exception
        'Reparo Gabriel/Nicolas abortado: assinatura Gratuita esperada nao foi encontrada.';
    end if;

    delete from public.proprietarios p
    where p.user_id=v_auth_user;
    if not found then
      raise exception
        'Reparo Gabriel/Nicolas abortado: perfil de proprietario esperado nao foi encontrado.';
    end if;
    v_removeu_perfil:=true;
  elsif public.conta_possui_dados_operacionais(v_auth_user) then
    raise exception
      'Reparo Gabriel/Nicolas abortado: existem dados operacionais orfaos ligados ao auth user.';
  end if;

  -- Corrige somente o e-mail digitado no cadastro de Nicolas. Todos os
  -- demais campos e todos os relacionamentos do inquilino sao preservados.
  update public.inquilinos
  set email=v_auth_email
  where id=v_inquilino
    and user_id=v_owner;
  if not found then
    raise exception
      'Reparo Gabriel/Nicolas abortado: Nicolas deixou de pertencer ao Mestre.';
  end if;

  insert into public.convites_inquilino(
    proprietario_id,inquilino_id,email,aceito_em,updated_at
  )
  values(v_owner,v_inquilino,v_auth_email,now(),now())
  on conflict(proprietario_id,inquilino_id)
  do update set
    email=excluded.email,
    aceito_em=now(),
    updated_at=now();

  insert into public.acessos_inquilino(
    user_id,proprietario_id,inquilino_id,email,ativo,updated_at
  )
  values(v_auth_user,v_owner,v_inquilino,v_auth_email,true,now())
  on conflict(user_id)
  do update set
    proprietario_id=excluded.proprietario_id,
    inquilino_id=excluded.inquilino_id,
    email=excluded.email,
    ativo=true,
    updated_at=now();

  update auth.users
  set raw_user_meta_data=
    coalesce(raw_user_meta_data,'{}'::jsonb)
    || jsonb_build_object('account_type','tenant')
  where id=v_auth_user;

  if v_removeu_perfil or not v_ja_corrigido then
    insert into public.auditoria_comercial(
      administrador_id,cliente_id,acao,detalhes
    )
    values(
      v_owner,
      v_auth_user,
      'perfil_corrigido_para_inquilino',
      jsonb_build_object(
        'inquilinoId',v_inquilino,
        'emailAuth',v_auth_email,
        'emailCorrigidoDe',v_email_antigo,
        'perfilGratuitoRemovido',v_removeu_perfil
      )
    );
  end if;
end
$reparo_gabriel_nicolas$;

-- ------------------------------------------------------------
-- EXCLUSIVIDADE FORTE ENTRE PERFIS
--
-- Nao e possivel criar uma unica constraint entre tabelas diferentes.
-- Os gatilhos abaixo usam a mesma trava transacional por auth user para
-- impedir inclusive duas insercoes concorrentes com papeis diferentes.
-- ------------------------------------------------------------

create or replace function public.validar_exclusividade_perfil_usuario()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user_id uuid:=new.user_id;
begin
  if v_user_id is null then
    raise exception 'Perfil sem usuario.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text,0));

  if public.e_administrador_plataforma(v_user_id) then
    if tg_table_schema<>'public'
       or tg_table_name not in ('proprietarios','assinaturas') then
      raise exception 'Uma conta Mestre nao pode ser inquilino ou colaborador.';
    end if;
    return new;
  end if;

  if tg_table_name='proprietarios' then
    if exists(
      select 1 from public.acessos_inquilino a where a.user_id=v_user_id
    ) or exists(
      select 1 from public.acessos_colaborador a where a.user_id=v_user_id
    ) then
      raise exception
        'Perfil conflitante: inquilino ou colaborador nao pode ser proprietario.';
    end if;
  elsif tg_table_name='assinaturas' then
    if not exists(
      select 1 from public.proprietarios p where p.user_id=v_user_id
    ) or exists(
      select 1 from public.acessos_inquilino a where a.user_id=v_user_id
    ) or exists(
      select 1 from public.acessos_colaborador a where a.user_id=v_user_id
    ) then
      raise exception
        'Assinatura invalida: somente proprietario exclusivo pode possuir plano.';
    end if;
  elsif tg_table_name='acessos_inquilino' then
    if new.proprietario_id=v_user_id then
      raise exception 'Um inquilino nao pode ser proprietario de si mesmo.';
    end if;
    if not exists(
      select 1
      from public.inquilinos i
      where i.id=new.inquilino_id
        and i.user_id=new.proprietario_id
    ) then
      raise exception
        'Acesso invalido: o inquilino nao pertence ao proprietario informado.';
    end if;
    if exists(
      select 1 from public.proprietarios p where p.user_id=v_user_id
    ) or exists(
      select 1 from public.acessos_colaborador a where a.user_id=v_user_id
    ) then
      raise exception
        'Perfil conflitante: proprietario ou colaborador nao pode ser inquilino.';
    end if;
  elsif tg_table_name='acessos_colaborador' then
    if new.proprietario_id=v_user_id then
      raise exception 'Um colaborador nao pode ser proprietario de si mesmo.';
    end if;
    if not exists(
      select 1
      from public.proprietarios p
      where p.user_id=new.proprietario_id
    ) then
      raise exception
        'Acesso invalido: o proprietario do colaborador nao existe.';
    end if;
    if exists(
      select 1 from public.proprietarios p where p.user_id=v_user_id
    ) or exists(
      select 1 from public.acessos_inquilino a where a.user_id=v_user_id
    ) then
      raise exception
        'Perfil conflitante: proprietario ou inquilino nao pode ser colaborador.';
    end if;
  else
    raise exception
      'Tabela inesperada no validador de perfil: %.%.',
      tg_table_schema,tg_table_name;
  end if;

  return new;
end
$$;

revoke all on function public.validar_exclusividade_perfil_usuario()
  from public,anon,authenticated;

drop trigger if exists perfil_exclusivo_proprietario
  on public.proprietarios;
create trigger perfil_exclusivo_proprietario
before insert or update of user_id on public.proprietarios
for each row execute function public.validar_exclusividade_perfil_usuario();

drop trigger if exists perfil_exclusivo_assinatura
  on public.assinaturas;
create trigger perfil_exclusivo_assinatura
before insert or update of user_id on public.assinaturas
for each row execute function public.validar_exclusividade_perfil_usuario();

drop trigger if exists perfil_exclusivo_inquilino
  on public.acessos_inquilino;
create trigger perfil_exclusivo_inquilino
before insert or update on public.acessos_inquilino
for each row execute function public.validar_exclusividade_perfil_usuario();

drop trigger if exists perfil_exclusivo_colaborador
  on public.acessos_colaborador;
create trigger perfil_exclusivo_colaborador
before insert or update on public.acessos_colaborador
for each row execute function public.validar_exclusividade_perfil_usuario();

-- ------------------------------------------------------------
-- AUTORIZACAO FAIL-CLOSED
--
-- Mestre prevalece. Fora disso, qualquer perfil duplo retorna NULL.
-- Uma conta suspensa de inquilino continua sendo inquilino e nao ganha
-- permissao de proprietario por possuir uma linha legada.
-- ------------------------------------------------------------

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
    when p_user_id is null then null::uuid
    when public.e_administrador_plataforma(p_user_id) then coalesce(
      (
        select u.id
        from auth.users u
        where lower(u.email)='andertonaluguel@gmail.com'
          and u.email_confirmed_at is not null
        order by u.created_at
        limit 1
      ),
      p_user_id
    )
    when exists(
      select 1 from public.acessos_inquilino a where a.user_id=p_user_id
    ) then null::uuid
    when exists(
      select 1 from public.proprietarios p where p.user_id=p_user_id
    ) and not exists(
      select 1 from public.acessos_colaborador a where a.user_id=p_user_id
    ) then p_user_id
    when not exists(
      select 1 from public.proprietarios p where p.user_id=p_user_id
    ) and not exists(
      select 1 from public.acessos_inquilino a where a.user_id=p_user_id
    ) then (
      select a.proprietario_id
      from public.acessos_colaborador a
      join public.proprietarios p on p.user_id=a.proprietario_id
      where a.user_id=p_user_id
        and a.ativo
        and not exists(
          select 1
          from public.acessos_inquilino ti
          where ti.user_id=a.proprietario_id
        )
        and not exists(
          select 1
          from public.acessos_colaborador sc
          where sc.user_id=a.proprietario_id
        )
      limit 1
    )
    else null::uuid
  end
$$;

revoke all on function public.usuario_proprietario_id(uuid)
  from public,anon;
grant execute on function public.usuario_proprietario_id(uuid)
  to authenticated;

create or replace function public.e_acesso_comercial_ativo(
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select
    public.e_administrador_plataforma(p_user_id)
    or (
      p_user_id is not null
      and not exists(
        select 1 from public.acessos_inquilino a where a.user_id=p_user_id
      )
      and not exists(
        select 1 from public.acessos_colaborador a where a.user_id=p_user_id
      )
      and exists(
        select 1
        from public.proprietarios p
        join public.assinaturas a on a.user_id=p.user_id
        where p.user_id=p_user_id
          and a.status='ativa'
      )
    )
$$;

revoke all on function public.e_acesso_comercial_ativo(uuid)
  from public,anon;
grant execute on function public.e_acesso_comercial_ativo(uuid)
  to authenticated;

-- Para inquilino ou conta pendente, plano/status/limites sao NULL ou zero.
-- Assim nem uma interface futura podera interpretar ausencia de assinatura
-- como plano Gratuito.
create or replace function public.acesso_comercial_atual()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'administradorPlataforma',
      public.e_administrador_plataforma(s.uid),
    'proprietario',
      s.owner_id is not null and p.user_id is not null,
    'proprietarioId',
      s.owner_id,
    'colaborador',
      s.owner_id is not null and s.owner_id<>s.uid,
    'plano',
      case when s.owner_id is null then null else a.plano end,
    'status',
      case when s.owner_id is null then null else a.status end,
    'podeAcessar',
      case
        when s.owner_id is null then false
        else public.e_acesso_comercial_ativo(s.owner_id)
      end,
    'limiteCasas',
      case
        when public.e_administrador_plataforma(s.uid) then 100
        when s.owner_id is null then 0
        else public.limite_casas_plano(a.plano)
      end,
    'quantidadeCasas',
      case
        when s.owner_id is null then 0
        else (select count(*) from public.imoveis i where i.user_id=s.owner_id)
      end,
    'limiteArmazenamento',
      case
        when public.e_administrador_plataforma(s.uid) then 10737418240::bigint
        when s.owner_id is null then 0::bigint
        else public.limite_armazenamento_plano(a.plano)
      end,
    'armazenamentoUsado',
      case
        when s.owner_id is null then 0::bigint
        else public.armazenamento_usado(s.owner_id)
      end,
    'termosAceitos',
      case
        when s.owner_id is null then false
        else exists(
          select 1
          from public.aceites_termos t
          where t.user_id=s.owner_id and t.versao='1.0'
        )
      end
  )
  from (
    select
      auth.uid() as uid,
      public.usuario_proprietario_id(auth.uid()) as owner_id
  ) s
  left join public.proprietarios p on p.user_id=s.owner_id
  left join public.assinaturas a on a.user_id=s.owner_id
$$;

revoke all on function public.acesso_comercial_atual()
  from public,anon;
grant execute on function public.acesso_comercial_atual()
  to authenticated;

-- ------------------------------------------------------------
-- CONFIGURACAO DO PORTAL
-- Converte somente uma conta Gratuita realmente vazia.
-- ------------------------------------------------------------

create or replace function public.configurar_acesso_inquilino(
  p_inquilino_id uuid,
  p_email text,
  p_ativo boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_owner uuid:=public.usuario_proprietario_id();
  v_auth_user uuid;
  v_email text:=lower(trim(coalesce(p_email,'')));
begin
  if v_owner is null or not public.e_acesso_operacional(v_owner) then
    raise exception 'Conta sem permissao de proprietario.';
  end if;
  if v_email='' or position('@' in v_email)<2 then
    raise exception 'E-mail invalido.';
  end if;
  if v_email=any(
    array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]
  ) then
    raise exception 'Este e-mail e reservado para uma conta Mestre.';
  end if;
  if not exists(
    select 1
    from public.inquilinos i
    where i.id=p_inquilino_id and i.user_id=v_owner
  ) then
    raise exception 'Inquilino nao encontrado.';
  end if;

  select u.id
    into v_auth_user
  from auth.users u
  where lower(trim(u.email))=v_email
  order by u.created_at
  limit 1;

  if exists(
    select 1
    from public.convites_inquilino c
    where lower(trim(c.email))=v_email
      and (
        c.proprietario_id is distinct from v_owner
        or c.inquilino_id is distinct from p_inquilino_id
      )
  ) then
    raise exception 'Este e-mail ja esta reservado para outro inquilino.';
  end if;

  if exists(
    select 1
    from public.acessos_inquilino a
    left join auth.users u on u.id=a.user_id
    where lower(trim(coalesce(u.email,a.email)))=v_email
      and (
        a.proprietario_id is distinct from v_owner
        or a.inquilino_id is distinct from p_inquilino_id
      )
  ) then
    raise exception 'Este e-mail ja esta ligado a outro inquilino.';
  end if;

  if exists(
    select 1
    from public.convites_proprietario c
    where lower(trim(c.email))=v_email
      and c.status in ('aguardando_pagamento','pendente','aceito')
  ) then
    raise exception 'Este e-mail esta reservado para um cliente proprietario.';
  end if;
  if public.email_reservado_colaborador(v_email) then
    raise exception 'Este e-mail esta reservado para um colaborador.';
  end if;

  if v_auth_user is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_auth_user::text,0));
    perform 1 from auth.users u where u.id=v_auth_user for update;

    if public.e_administrador_plataforma(v_auth_user) then
      raise exception 'Uma conta Mestre nao pode ser inquilino.';
    end if;
    if exists(
      select 1
      from public.administradores_plataforma m
      where m.user_id=v_auth_user
    ) then
      raise exception 'Este login possui um cadastro administrativo legado.';
    end if;

    if exists(
      select 1 from public.acessos_colaborador a where a.user_id=v_auth_user
    ) then
      raise exception 'Este login pertence a um colaborador.';
    end if;

    if exists(
      select 1 from public.proprietarios p where p.user_id=v_auth_user
    ) then
      if not p_ativo
         or not public.conta_proprietaria_gratuita_vazia(v_auth_user) then
        raise exception
          'Este e-mail pertence a um cliente proprietario em uso. Use outro e-mail.';
      end if;
      delete from public.assinaturas where user_id=v_auth_user;
      delete from public.proprietarios where user_id=v_auth_user;
    elsif public.conta_possui_dados_operacionais(v_auth_user) then
      raise exception
        'Este login possui dados operacionais sem perfil. Procure o suporte.';
    end if;
  end if;

  update public.inquilinos
  set email=v_email
  where id=p_inquilino_id and user_id=v_owner;

  insert into public.convites_inquilino(
    proprietario_id,inquilino_id,email,updated_at
  )
  values(v_owner,p_inquilino_id,v_email,now())
  on conflict(proprietario_id,inquilino_id)
  do update set
    email=excluded.email,
    updated_at=now(),
    aceito_em=null;

  if v_auth_user is not null then
    if exists(
      select 1
      from public.acessos_inquilino a
      where a.proprietario_id=v_owner
        and a.inquilino_id=p_inquilino_id
        and a.user_id<>v_auth_user
    ) then
      raise exception 'Este inquilino ja esta ligado a outro login.';
    end if;

    insert into public.acessos_inquilino(
      user_id,proprietario_id,inquilino_id,email,ativo,updated_at
    )
    values(
      v_auth_user,v_owner,p_inquilino_id,v_email,p_ativo,now()
    )
    on conflict(user_id)
    do update set
      proprietario_id=excluded.proprietario_id,
      inquilino_id=excluded.inquilino_id,
      email=excluded.email,
      ativo=excluded.ativo,
      updated_at=now();

    update auth.users
    set raw_user_meta_data=
      coalesce(raw_user_meta_data,'{}'::jsonb)
      || jsonb_build_object('account_type','tenant')
    where id=v_auth_user;

    update public.convites_inquilino
    set aceito_em=now(),updated_at=now()
    where proprietario_id=v_owner
      and inquilino_id=p_inquilino_id;
  end if;

  return jsonb_build_object(
    'email',v_email,
    'ativo',p_ativo,
    'aceito',v_auth_user is not null
  );
end
$$;

revoke all on function public.configurar_acesso_inquilino(uuid,text,boolean)
  from public,anon;
grant execute on function public.configurar_acesso_inquilino(uuid,text,boolean)
  to authenticated;

-- Um convite de colaborador tambem respeita a reserva de inquilino, mesmo
-- quando o portal ainda nao foi aceito ou esta suspenso.
create or replace function public.criar_convite_colaborador(
  p_nome text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_owner uuid:=public.usuario_proprietario_id();
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_nome text:=trim(coalesce(p_nome,''));
  v_auth_user uuid;
  v_id uuid;
begin
  if v_owner is null
     or (
       v_owner<>auth.uid()
       and not public.e_administrador_plataforma(auth.uid())
     )
     or not public.e_acesso_operacional(v_owner) then
    raise exception 'Somente o dono da conta pode gerenciar funcionarios.';
  end if;
  if v_nome='' then
    raise exception 'Informe o nome do funcionario.';
  end if;
  if v_email='' or position('@' in v_email)<2 then
    raise exception 'E-mail invalido.';
  end if;
  if v_email=any(
    array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]
  ) then
    raise exception 'Contas Mestre nao podem ser cadastradas como funcionarios.';
  end if;
  if public.email_reservado_inquilino(v_email) then
    raise exception
      'Este e-mail pertence a um inquilino e nao pode ser colaborador.';
  end if;

  update public.convites_colaborador
  set status='expirado',updated_at=now()
  where proprietario_id=v_owner
    and status='pendente'
    and expira_em<now();

  if (
    select count(*)
    from public.acessos_colaborador a
    left join auth.users u on u.id=a.user_id
    where a.proprietario_id=v_owner
      and a.ativo
      and lower(coalesce(u.email,a.email))<>all(
        array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]
      )
  ) + (
    select count(*)
    from public.convites_colaborador c
    where c.proprietario_id=v_owner
      and c.status='pendente'
  ) >= 10 then
    raise exception 'Limite de 10 funcionarios e convites atingido.';
  end if;

  select u.id
    into v_auth_user
  from auth.users u
  where lower(trim(u.email))=v_email
  order by u.created_at
  limit 1;

  if v_auth_user is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_auth_user::text,0));
  end if;

  if v_auth_user=v_owner
     or (
       v_auth_user is not null
       and exists(
         select 1
         from public.proprietarios p
         where p.user_id=v_auth_user
       )
     ) then
    raise exception 'Este e-mail pertence a uma conta de proprietario.';
  end if;
  if v_auth_user is not null
     and exists(
       select 1
       from public.acessos_inquilino a
       where a.user_id=v_auth_user
     ) then
    raise exception 'Este e-mail ja esta sendo usado por um inquilino.';
  end if;
  if v_auth_user is not null
     and exists(
       select 1
       from public.acessos_colaborador a
       where a.user_id=v_auth_user
         and a.proprietario_id<>v_owner
     ) then
    raise exception
      'Este e-mail ja pertence a equipe de outro proprietario.';
  end if;
  if exists(
    select 1
    from public.convites_colaborador c
    where lower(trim(c.email))=v_email
      and c.status='pendente'
      and c.proprietario_id<>v_owner
  ) then
    raise exception 'Este e-mail ja foi convidado por outro proprietario.';
  end if;
  if exists(
    select 1
    from public.convites_proprietario c
    where lower(trim(c.email))=v_email
      and c.status in ('aguardando_pagamento','pendente')
  ) then
    raise exception
      'Este e-mail esta reservado para uma conta de proprietario.';
  end if;

  update public.convites_colaborador
  set nome=v_nome,
      expira_em=now()+interval '14 days',
      updated_at=now()
  where proprietario_id=v_owner
    and lower(trim(email))=v_email
    and status='pendente'
  returning id into v_id;

  if v_id is null then
    insert into public.convites_colaborador(
      proprietario_id,nome,email
    )
    values(v_owner,v_nome,v_email)
    returning id into v_id;
  end if;

  if v_auth_user is not null then
    insert into public.acessos_colaborador(
      user_id,proprietario_id,nome,email,ativo,updated_at
    )
    values(v_auth_user,v_owner,v_nome,v_email,true,now())
    on conflict(user_id)
    do update set
      proprietario_id=excluded.proprietario_id,
      nome=excluded.nome,
      email=excluded.email,
      ativo=true,
      updated_at=now();

    update public.convites_colaborador
    set status='aceito',aceito_em=now(),updated_at=now()
    where id=v_id;

    update auth.users
    set raw_user_meta_data=
      coalesce(raw_user_meta_data,'{}'::jsonb)
      || jsonb_build_object('account_type','admin')
    where id=v_auth_user;
  end if;

  return jsonb_build_object(
    'conviteId',v_id,
    'email',v_email,
    'aceito',v_auth_user is not null
  );
end
$$;

revoke all on function public.criar_convite_colaborador(text,text)
  from public,anon;
grant execute on function public.criar_convite_colaborador(text,text)
  to authenticated;

-- ------------------------------------------------------------
-- PROTECOES COMERCIAIS
-- ------------------------------------------------------------

-- Funcao interna: somente uma venda valida pode criar proprietario/plano.
create or replace function public.ativar_convite_proprietario(
  p_convite_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_convite public.convites_proprietario%rowtype;
  v_user_email text;
begin
  if p_user_id is null then
    raise exception 'Usuario da venda nao encontrado.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));

  select *
    into v_convite
  from public.convites_proprietario
  where id=p_convite_id
  for update;

  if not found
     or v_convite.status<>'pendente'
     or v_convite.expira_em<now()
     or v_convite.pagamento_status not in ('confirmado','gratuito') then
    raise exception 'Convite indisponivel para ativacao.';
  end if;

  select lower(trim(u.email))
    into v_user_email
  from auth.users u
  where u.id=p_user_id
  for update;

  if v_user_email is null
     or v_user_email<>lower(trim(v_convite.email)) then
    raise exception 'O usuario nao corresponde ao e-mail da venda.';
  end if;
  if public.e_administrador_plataforma(p_user_id) then
    raise exception 'Conta Mestre nao pode ser cadastrada como cliente.';
  end if;
  if public.email_reservado_inquilino(v_user_email) then
    raise exception 'Este e-mail pertence a um inquilino e nao possui plano.';
  end if;
  if public.email_reservado_colaborador(v_user_email) then
    raise exception 'Este e-mail pertence a um colaborador e nao possui plano.';
  end if;

  insert into public.proprietarios(
    user_id,nome,email,telefone,documento,empresa,updated_at
  )
  values(
    p_user_id,
    left(v_convite.nome,160),
    v_user_email,
    left(v_convite.telefone,40),
    left(v_convite.documento,80),
    left(v_convite.empresa,160),
    now()
  )
  on conflict(user_id)
  do update set
    nome=excluded.nome,
    email=excluded.email,
    telefone=excluded.telefone,
    documento=excluded.documento,
    empresa=excluded.empresa,
    updated_at=now();

  insert into public.assinaturas(
    user_id,plano,status,valor_pago,forma_pagamento,
    referencia_pagamento,observacoes,pagamento_confirmado_em,
    ativada_em,criado_por,updated_at
  )
  values(
    p_user_id,
    v_convite.plano,
    'ativa',
    v_convite.valor_pago,
    v_convite.forma_pagamento,
    v_convite.referencia_pagamento,
    v_convite.observacoes,
    v_convite.pagamento_confirmado_em,
    now(),
    v_convite.criado_por,
    now()
  )
  on conflict(user_id)
  do update set
    plano=excluded.plano,
    status='ativa',
    valor_pago=excluded.valor_pago,
    forma_pagamento=excluded.forma_pagamento,
    referencia_pagamento=excluded.referencia_pagamento,
    observacoes=excluded.observacoes,
    pagamento_confirmado_em=excluded.pagamento_confirmado_em,
    criado_por=excluded.criado_por,
    updated_at=now();

  update auth.users
  set raw_user_meta_data=
    coalesce(raw_user_meta_data,'{}'::jsonb)
    || jsonb_build_object('account_type','admin')
  where id=p_user_id;

  update public.convites_proprietario
  set status='aceito',
      aceito_por=p_user_id,
      aceito_em=now(),
      updated_at=now()
  where id=p_convite_id;

  insert into public.auditoria_comercial(
    administrador_id,cliente_id,convite_id,acao,detalhes
  )
  values(
    v_convite.criado_por,
    p_user_id,
    p_convite_id,
    'cliente_ativado',
    jsonb_build_object('plano',v_convite.plano)
  );
end
$$;

revoke all on function public.ativar_convite_proprietario(uuid,uuid)
  from public,anon,authenticated;

create or replace function public.criar_venda_cliente(
  p_nome text,
  p_email text,
  p_telefone text,
  p_documento text,
  p_empresa text,
  p_plano text,
  p_valor_pago numeric,
  p_forma_pagamento text,
  p_referencia_pagamento text,
  p_observacoes text
)
returns uuid
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_admin uuid:=auth.uid();
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_id uuid;
  v_auth_user uuid;
begin
  if not public.e_administrador_plataforma(v_admin) then
    raise exception 'Acesso negado.';
  end if;
  if trim(coalesce(p_nome,''))='' then
    raise exception 'Informe o nome do cliente.';
  end if;
  if v_email='' or position('@' in v_email)<2 then
    raise exception 'E-mail invalido.';
  end if;
  if p_plano not in ('gratuito','basico','premium') then
    raise exception 'Plano invalido.';
  end if;
  if v_email=any(
    array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]
  ) then
    raise exception 'Conta Mestre nao e cliente comercial.';
  end if;
  if public.email_reservado_inquilino(v_email) then
    raise exception 'Este e-mail pertence a um inquilino e nao possui plano.';
  end if;
  if public.email_reservado_colaborador(v_email) then
    raise exception 'Este e-mail pertence a um colaborador e nao possui plano.';
  end if;

  select u.id
    into v_auth_user
  from auth.users u
  where lower(trim(u.email))=v_email
  order by u.created_at
  limit 1;
  if v_auth_user is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_auth_user::text,0));
  end if;

  insert into public.convites_proprietario(
    nome,email,telefone,documento,empresa,plano,status,
    pagamento_status,valor_pago,forma_pagamento,
    referencia_pagamento,observacoes,expira_em,criado_por
  )
  values(
    left(trim(p_nome),160),
    v_email,
    left(coalesce(p_telefone,''),40),
    left(coalesce(p_documento,''),80),
    left(coalesce(p_empresa,''),160),
    p_plano,
    case
      when p_plano='gratuito' then 'pendente'
      else 'aguardando_pagamento'
    end,
    case
      when p_plano='gratuito' then 'gratuito'
      else 'pendente'
    end,
    greatest(coalesce(p_valor_pago,0),0),
    left(coalesce(p_forma_pagamento,''),80),
    left(coalesce(p_referencia_pagamento,''),180),
    left(coalesce(p_observacoes,''),2000),
    now()+interval '7 days',
    v_admin
  )
  returning id into v_id;

  insert into public.auditoria_comercial(
    administrador_id,convite_id,acao,detalhes
  )
  values(
    v_admin,
    v_id,
    'venda_criada',
    jsonb_build_object('plano',p_plano,'email',v_email)
  );

  if p_plano='gratuito' and v_auth_user is not null then
    perform public.ativar_convite_proprietario(v_id,v_auth_user);
  end if;

  return v_id;
end
$$;

revoke all on function public.criar_venda_cliente(
  text,text,text,text,text,text,numeric,text,text,text
) from public,anon;
grant execute on function public.criar_venda_cliente(
  text,text,text,text,text,text,numeric,text,text,text
) to authenticated;

create or replace function public.atualizar_cliente_comercial(
  p_user_id uuid,
  p_plano text,
  p_status text,
  p_telefone text,
  p_documento text,
  p_empresa text,
  p_valor_pago numeric,
  p_forma_pagamento text,
  p_referencia_pagamento text,
  p_observacoes text
)
returns void
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_email text;
begin
  if not public.e_administrador_plataforma(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;
  if p_plano not in ('gratuito','basico','premium')
     or p_status not in ('ativa','suspensa','cancelada') then
    raise exception 'Plano ou situacao invalida.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));

  select lower(trim(u.email))
    into v_email
  from auth.users u
  join public.proprietarios p on p.user_id=u.id
  join public.assinaturas a on a.user_id=p.user_id
  where u.id=p_user_id;
  if v_email is null then
    raise exception 'Cliente nao encontrado.';
  end if;
  if public.e_administrador_plataforma(p_user_id) then
    raise exception 'Conta Mestre nao e cliente comercial.';
  end if;
  if public.email_reservado_inquilino(v_email)
     or exists(
       select 1
       from public.acessos_inquilino a
       where a.user_id=p_user_id
     ) then
    raise exception 'Inquilino nao possui plano comercial.';
  end if;
  if public.email_reservado_colaborador(v_email)
     or exists(
       select 1
       from public.acessos_colaborador a
       where a.user_id=p_user_id
     ) then
    raise exception 'Colaborador nao possui plano comercial.';
  end if;
  if p_status='ativa'
     and (
       select count(*)
       from public.imoveis i
       where i.user_id=p_user_id
     )>public.limite_casas_plano(p_plano) then
    raise exception 'O cliente possui mais casas do que o novo plano permite.';
  end if;
  if p_status='ativa'
     and public.armazenamento_usado(p_user_id)>
       public.limite_armazenamento_plano(p_plano) then
    raise exception
      'O cliente usa mais armazenamento do que o novo plano permite.';
  end if;

  update public.proprietarios
  set telefone=left(coalesce(p_telefone,''),40),
      documento=left(coalesce(p_documento,''),80),
      empresa=left(coalesce(p_empresa,''),160),
      updated_at=now()
  where user_id=p_user_id;
  if not found then
    raise exception 'Cliente nao encontrado.';
  end if;

  update public.assinaturas
  set plano=p_plano,
      status=p_status,
      valor_pago=greatest(coalesce(p_valor_pago,0),0),
      forma_pagamento=left(coalesce(p_forma_pagamento,''),80),
      referencia_pagamento=
        left(coalesce(p_referencia_pagamento,''),180),
      observacoes=left(coalesce(p_observacoes,''),2000),
      updated_at=now()
  where user_id=p_user_id;
  if not found then
    raise exception 'Assinatura do cliente nao encontrada.';
  end if;

  insert into public.auditoria_comercial(
    administrador_id,cliente_id,acao,detalhes
  )
  values(
    auth.uid(),
    p_user_id,
    'cliente_atualizado',
    jsonb_build_object('plano',p_plano,'status',p_status)
  );
end
$$;

revoke all on function public.atualizar_cliente_comercial(
  uuid,text,text,text,text,text,numeric,text,text,text
) from public,anon;
grant execute on function public.atualizar_cliente_comercial(
  uuid,text,text,text,text,text,numeric,text,text,text
) to authenticated;

drop function if exists public.listar_clientes_comerciais();
create or replace function public.listar_clientes_comerciais()
returns table(
  user_id uuid,
  nome text,
  email text,
  telefone text,
  documento text,
  empresa text,
  plano text,
  status text,
  valor_pago numeric,
  forma_pagamento text,
  referencia_pagamento text,
  observacoes text,
  quantidade_imoveis bigint,
  limite_imoveis integer,
  armazenamento_usado bigint,
  limite_armazenamento bigint,
  criado_em timestamptz
)
language plpgsql
security definer
set search_path=public,auth
as $$
begin
  if not public.e_administrador_plataforma(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;

  return query
  select
    p.user_id,
    p.nome,
    p.email,
    p.telefone,
    p.documento,
    p.empresa,
    a.plano,
    a.status,
    a.valor_pago,
    a.forma_pagamento,
    a.referencia_pagamento,
    a.observacoes,
    (select count(*) from public.imoveis i where i.user_id=p.user_id),
    public.limite_casas_plano(a.plano),
    public.armazenamento_usado(p.user_id),
    public.limite_armazenamento_plano(a.plano),
    p.created_at
  from public.proprietarios p
  join public.assinaturas a on a.user_id=p.user_id
  join auth.users u on u.id=p.user_id
  where not public.e_administrador_plataforma(p.user_id)
    and not exists(
      select 1
      from public.acessos_inquilino ti
      where ti.user_id=p.user_id
    )
    and not exists(
      select 1
      from public.acessos_colaborador sc
      where sc.user_id=p.user_id
    )
    and lower(coalesce(u.raw_user_meta_data->>'account_type','admin'))
      <>'tenant'
  order by p.created_at desc;
end
$$;

revoke all on function public.listar_clientes_comerciais()
  from public,anon;
grant execute on function public.listar_clientes_comerciais()
  to authenticated;

-- ------------------------------------------------------------
-- NOVO USUARIO
--
-- Ordem definitiva:
--   Mestre > convite de inquilino > venda de proprietario >
--   convite de colaborador > inquilino aguardando > Gratuito.
-- ------------------------------------------------------------

create or replace function public.processar_novo_usuario_aluguel()
returns trigger
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_owner public.convites_proprietario%rowtype;
  v_staff public.convites_colaborador%rowtype;
  v_tenant public.convites_inquilino%rowtype;
  v_account_type text:=
    lower(coalesce(new.raw_user_meta_data->>'account_type','admin'));
  v_total integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.id::text,0));

  if new.raw_user_meta_data->>'terms_version'='1.0' then
    insert into public.aceites_termos(user_id,versao,aceito_em)
    values(new.id,'1.0',now())
    on conflict(user_id)
    do update set versao='1.0',aceito_em=now();
  end if;

  if lower(new.email)=any(
    array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]
  ) then
    insert into public.administradores_plataforma(user_id)
    values(new.id)
    on conflict(user_id) do nothing;

    delete from public.acessos_inquilino where user_id=new.id;
    delete from public.acessos_colaborador where user_id=new.id;

    insert into public.proprietarios(user_id,nome,email,updated_at)
    values(
      new.id,
      coalesce(
        nullif(trim(new.raw_user_meta_data->>'name'),''),
        'Conta Mestre'
      ),
      lower(new.email),
      now()
    )
    on conflict(user_id)
    do update set email=excluded.email,updated_at=now();

    insert into public.assinaturas(
      user_id,plano,status,valor_pago,pagamento_confirmado_em,
      ativada_em,updated_at
    )
    values(new.id,'premium','ativa',0,now(),now(),now())
    on conflict(user_id)
    do update set plano='premium',status='ativa',updated_at=now();

    update auth.users
    set raw_user_meta_data=
      coalesce(raw_user_meta_data,'{}'::jsonb)
      || jsonb_build_object('account_type','admin')
    where id=new.id;
    return new;
  end if;

  -- O convite do portal e a fonte primaria para identificar um inquilino.
  select count(*)
    into v_total
  from public.convites_inquilino c
  where lower(trim(c.email))=lower(trim(new.email));
  if v_total>1 then
    raise exception
      'Existem varios convites de inquilino para este e-mail. O administrador deve corrigir os cadastros.';
  end if;
  if v_total=1 then
    select *
      into v_tenant
    from public.convites_inquilino c
    where lower(trim(c.email))=lower(trim(new.email))
    order by c.updated_at desc
    limit 1;

    insert into public.acessos_inquilino(
      user_id,proprietario_id,inquilino_id,email,ativo,updated_at
    )
    values(
      new.id,
      v_tenant.proprietario_id,
      v_tenant.inquilino_id,
      lower(trim(new.email)),
      true,
      now()
    )
    on conflict(user_id)
    do update set
      proprietario_id=excluded.proprietario_id,
      inquilino_id=excluded.inquilino_id,
      email=excluded.email,
      ativo=true,
      updated_at=now();

    update public.convites_inquilino
    set aceito_em=now(),updated_at=now()
    where id=v_tenant.id;

    update auth.users
    set raw_user_meta_data=
      coalesce(raw_user_meta_data,'{}'::jsonb)
      || jsonb_build_object('account_type','tenant')
    where id=new.id;
    return new;
  end if;

  select *
    into v_owner
  from public.convites_proprietario c
  where lower(trim(c.email))=lower(trim(new.email))
    and c.status='pendente'
    and c.expira_em>=now()
    and c.pagamento_status in ('confirmado','gratuito')
  order by c.created_at desc
  limit 1;
  if found then
    perform public.ativar_convite_proprietario(v_owner.id,new.id);
    return new;
  end if;

  select *
    into v_staff
  from public.convites_colaborador c
  where lower(trim(c.email))=lower(trim(new.email))
    and c.status='pendente'
    and c.expira_em>=now()
  order by c.updated_at desc
  limit 1;
  if found then
    insert into public.acessos_colaborador(
      user_id,proprietario_id,nome,email,ativo,updated_at
    )
    values(
      new.id,
      v_staff.proprietario_id,
      v_staff.nome,
      lower(trim(new.email)),
      true,
      now()
    )
    on conflict(user_id)
    do update set
      proprietario_id=excluded.proprietario_id,
      nome=excluded.nome,
      email=excluded.email,
      ativo=true,
      updated_at=now();

    update public.convites_colaborador
    set status='aceito',aceito_em=now(),updated_at=now()
    where id=v_staff.id;

    update auth.users
    set raw_user_meta_data=
      coalesce(raw_user_meta_data,'{}'::jsonb)
      || jsonb_build_object('account_type','admin')
    where id=new.id;
    return new;
  end if;

  -- Um inquilino que criou a conta antes da liberacao fica pendente.
  -- Nenhum perfil de proprietario ou assinatura e criado.
  if v_account_type='tenant' then
    return new;
  end if;

  insert into public.proprietarios(user_id,nome,email,updated_at)
  values(
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'name'),''),
      'Novo proprietario'
    ),
    lower(trim(new.email)),
    now()
  );

  insert into public.assinaturas(
    user_id,plano,status,valor_pago,ativada_em
  )
  values(new.id,'gratuito','ativa',0,now());

  update auth.users
  set raw_user_meta_data=
    coalesce(raw_user_meta_data,'{}'::jsonb)
    || jsonb_build_object('account_type','admin')
  where id=new.id;

  return new;
end
$$;

drop trigger if exists on_auth_user_created_portal on auth.users;
drop trigger if exists on_auth_user_created_comercial on auth.users;
drop trigger if exists on_auth_user_created_aluguel on auth.users;
create trigger on_auth_user_created_aluguel
after insert on auth.users
for each row execute function public.processar_novo_usuario_aluguel();

-- ------------------------------------------------------------
-- VERIFICACAO FINAL DA MIGRACAO
-- ------------------------------------------------------------

do $validacao$
begin
  if exists(
    select 1
    from public.proprietarios p
    join public.acessos_inquilino t on t.user_id=p.user_id
  ) then
    raise exception
      'Ainda existe usuario simultaneamente proprietario e inquilino.';
  end if;

  if exists(
    select 1
    from public.proprietarios p
    join public.acessos_colaborador c on c.user_id=p.user_id
  ) then
    raise exception
      'Ainda existe usuario simultaneamente proprietario e colaborador.';
  end if;

  if exists(
    select 1
    from public.acessos_inquilino t
    join public.acessos_colaborador c on c.user_id=t.user_id
  ) then
    raise exception
      'Ainda existe usuario simultaneamente inquilino e colaborador.';
  end if;

  if exists(
    select 1
    from public.assinaturas s
    join public.acessos_inquilino t on t.user_id=s.user_id
  ) then
    raise exception 'Ainda existe inquilino com assinatura.';
  end if;
end
$validacao$;

commit;

-- Fim da separacao definitiva entre inquilinos e clientes.
