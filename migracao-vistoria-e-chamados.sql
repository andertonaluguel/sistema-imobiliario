-- ============================================================
-- VISTORIA COM FOTO  +  CHAMADO DE MANUTENCAO
--
-- Duas coisas que hoje vivem fora do app:
--
-- 1. VISTORIA. A tabela imoveis ja tem ultima_vistoria, mas e uma
--    data solta: nao guarda o que foi visto, nem foto, nem quem
--    fez. Numa discussao sobre estado do imovel, data sozinha nao
--    prova nada.
--
-- 2. CHAMADO DE MANUTENCAO. Hoje o inquilino liga. O pedido nao
--    fica registrado, nao vira despesa e ninguem sabe quanto tempo
--    levou para resolver.
--
-- Esta migracao cria somente estruturas deste modulo e pode ser
-- reexecutada. Ao repetir, atualiza as funcoes, gatilhos e politicas
-- do proprio modulo para aplicar correcoes de seguranca.
--
-- Rode DEPOIS de migracao-modulos.sql.
-- ============================================================

begin;

do $$
begin
  if to_regclass('public.imoveis') is null then
    raise exception 'Rode antes as migracoes base (schema.sql e anteriores).';
  end if;
  if to_regclass('public.acessos_inquilino') is null then
    raise exception 'Rode antes o arquivo migracao-tipos-acesso.sql.';
  end if;
  if to_regprocedure('public.usuario_proprietario_id(uuid)') is null
     or to_regprocedure('public.e_acesso_operacional(uuid)') is null then
    raise exception 'Rode antes o arquivo migracao-versao-comercial-v1.sql.';
  end if;
end
$$;

-- ------------------------------------------------------------
-- 1. VISTORIAS
-- Uma linha por vistoria feita. A data solta em imoveis continua
-- valendo como "ultima" para nao quebrar o que ja existe; esta
-- tabela e o historico com conteudo.
-- ------------------------------------------------------------

create table if not exists public.vistorias (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid()
               references auth.users(id) on delete cascade,
  imovel_id    uuid not null references public.imoveis(id) on delete cascade,
  contrato_id  uuid references public.contratos(id) on delete set null,
  data         date not null default current_date,
  -- entrada: antes de o inquilino mudar. saida: quando devolve.
  -- periodica: a de rotina, sem troca de morador.
  tipo         text not null default 'periodica'
               check (tipo in ('entrada','saida','periodica')),
  -- estado geral, para dar uma leitura rapida na lista
  estado       text not null default 'bom'
               check (estado in ('otimo','bom','regular','ruim')),
  observacoes  text not null default '',
  -- itens conferidos, em JSON, para nao precisar de tabela filha:
  -- [{"item":"Pintura","estado":"bom","nota":"parede da sala manchada"}]
  itens        jsonb not null default '[]'::jsonb,
  criado_por   uuid default auth.uid()
               references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.vistorias
  add column if not exists criado_por uuid default auth.uid();

create index if not exists vistorias_imovel_idx on public.vistorias (imovel_id, data desc);
create index if not exists vistorias_user_idx   on public.vistorias (user_id, data desc);

-- Fotos da vistoria. Reaproveita o mesmo bucket de fotos do imovel;
-- aqui so fica a referencia.
create table if not exists public.vistoria_fotos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
              references auth.users(id) on delete cascade,
  vistoria_id uuid not null references public.vistorias(id) on delete cascade,
  caminho     text not null,
  legenda     text not null default '',
  ordem       integer not null default 0,
  enviado_por uuid default auth.uid()
              references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.vistoria_fotos
  add column if not exists enviado_por uuid default auth.uid()
  references auth.users(id) on delete set null;

create index if not exists vistoria_fotos_vistoria_idx
  on public.vistoria_fotos (vistoria_id, ordem);

-- ------------------------------------------------------------
-- 2. CHAMADOS DE MANUTENCAO
-- Aberto pelo INQUILINO ou pelo proprietario. O inquilino so
-- enxerga os chamados das casas dele.
-- ------------------------------------------------------------

create table if not exists public.chamados (
  id           uuid primary key default gen_random_uuid(),
  -- dono dos dados: sempre o proprietario, mesmo quando quem abre
  -- e o inquilino. E o que mantem a regra de isolamento do app.
  user_id      uuid not null
               references auth.users(id) on delete cascade,
  imovel_id    uuid not null references public.imoveis(id) on delete cascade,
  inquilino_id uuid references public.inquilinos(id) on delete set null,
  titulo       text not null,
  descricao    text not null default '',
  categoria    text not null default 'outro'
               check (categoria in ('hidraulica','eletrica','estrutura',
                                    'eletrodomestico','pintura','outro')),
  -- urgente: risco ou casa inabitavel. alta: atrapalha o uso.
  prioridade   text not null default 'normal'
               check (prioridade in ('urgente','alta','normal','baixa')),
  status       text not null default 'aberto'
               check (status in ('aberto','em_andamento','aguardando_peca',
                                 'resolvido','cancelado')),
  -- quem abriu, para o historico nao ficar ambiguo
  aberto_por   text not null default 'proprietario'
               check (aberto_por in ('inquilino','proprietario')),
  resposta     text not null default '',
  -- ligacao com a despesa gerada, quando houver: e assim que o
  -- chamado alimenta o Financeiro em vez de virar papel solto
  despesa_id   uuid references public.despesas(id) on delete set null,
  resolvido_em timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists chamados_imovel_idx on public.chamados (imovel_id, created_at desc);
create index if not exists chamados_user_idx   on public.chamados (user_id, status, created_at desc);

create table if not exists public.chamado_fotos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  chamado_id uuid not null references public.chamados(id) on delete cascade,
  caminho    text not null,
  legenda    text not null default '',
  enviado_por uuid default auth.uid()
              references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.chamado_fotos
  add column if not exists enviado_por uuid default auth.uid()
  references auth.users(id) on delete set null;

create index if not exists chamado_fotos_chamado_idx on public.chamado_fotos (chamado_id);

-- Uma despesa representa a resolucao financeira de no maximo um chamado.
-- Se houver duplicidade legada, interrompemos com uma mensagem clara em vez
-- de desligar silenciosamente um historico que precisa ser conferido.
do $despesa_chamado_unica$
begin
  if exists (
    select 1
      from public.chamados c
     where c.despesa_id is not null
     group by c.despesa_id
    having count(*)>1
  ) then
    raise exception
      'Existe uma despesa vinculada a mais de um chamado. Corrija essa duplicidade antes de repetir a migracao.';
  end if;
end
$despesa_chamado_unica$;

create unique index if not exists idx_chamados_despesa_unica
  on public.chamados(despesa_id)
  where despesa_id is not null;

-- ------------------------------------------------------------
-- 2.1. REPARO DE INSTALACOES ANTIGAS
-- CREATE TABLE IF NOT EXISTS nao reaplica defaults nem constraints em
-- tabelas que ja existiam. Este bloco normaliza somente valores invalidos
-- e reinstala as regras esperadas, sem apagar registros validos.
-- Os gatilhos deste proprio modulo sao removidos antes do reparo para que
-- a reexecucao pelo SQL Editor nao dependa de uma sessao autenticada.
-- ------------------------------------------------------------

drop trigger if exists vistorias_validar_dono on public.vistorias;
drop trigger if exists chamados_validar_dono on public.chamados;
drop trigger if exists vistoria_fotos_validar_dono on public.vistoria_fotos;
drop trigger if exists chamado_fotos_validar_dono on public.chamado_fotos;

alter table public.vistorias
  alter column user_id set default auth.uid(),
  alter column data set default current_date,
  alter column tipo set default 'periodica',
  alter column estado set default 'bom',
  alter column observacoes set default '',
  alter column itens set default '[]'::jsonb,
  alter column criado_por set default auth.uid(),
  alter column created_at set default now(),
  alter column updated_at set default now();

update public.vistorias
   set data=coalesce(data,current_date),
       tipo=case
         when tipo in ('entrada','saida','periodica') then tipo
         else 'periodica'
       end,
       estado=case
         when estado in ('otimo','bom','regular','ruim') then estado
         else 'bom'
       end,
       observacoes=coalesce(observacoes,''),
       itens=case
         when jsonb_typeof(itens)='array' then itens
         else '[]'::jsonb
       end,
       created_at=coalesce(created_at,now()),
       updated_at=coalesce(updated_at,created_at,now())
 where data is null
    or tipo is null
    or tipo not in ('entrada','saida','periodica')
    or estado is null
    or estado not in ('otimo','bom','regular','ruim')
    or observacoes is null
    or itens is null
    or jsonb_typeof(itens) is distinct from 'array'
    or created_at is null
    or updated_at is null;

-- Vistorias antigas sem autor recebem a conta como origem conhecida.
-- Um autor que ja nao existe em auth.users nao pode impedir a FK; nesse
-- caso o historico continua existindo, apenas sem o ator removido.
update public.vistorias v
   set criado_por=v.user_id
 where v.criado_por is null
   and exists (
     select 1 from auth.users u where u.id=v.user_id
   );

update public.vistorias v
   set criado_por=null
 where v.criado_por is not null
   and not exists (
     select 1 from auth.users u where u.id=v.criado_por
   );

alter table public.vistorias
  alter column data set not null,
  alter column tipo set not null,
  alter column estado set not null,
  alter column observacoes set not null,
  alter column itens set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

alter table public.vistorias
  drop constraint if exists vistorias_tipo_check,
  drop constraint if exists vistorias_estado_check,
  drop constraint if exists vistorias_itens_array_check,
  drop constraint if exists vistorias_criado_por_fkey;

alter table public.vistorias
  add constraint vistorias_tipo_check
    check (tipo in ('entrada','saida','periodica')) not valid,
  add constraint vistorias_estado_check
    check (estado in ('otimo','bom','regular','ruim')) not valid,
  add constraint vistorias_itens_array_check
    check (jsonb_typeof(itens)='array') not valid,
  add constraint vistorias_criado_por_fkey
    foreign key (criado_por)
    references auth.users(id)
    on delete set null
    not valid;

alter table public.vistorias
  validate constraint vistorias_tipo_check,
  validate constraint vistorias_estado_check,
  validate constraint vistorias_itens_array_check,
  validate constraint vistorias_criado_por_fkey;

alter table public.vistoria_fotos
  alter column user_id set default auth.uid(),
  alter column legenda set default '',
  alter column ordem set default 0,
  alter column enviado_por set default auth.uid(),
  alter column created_at set default now();

update public.vistoria_fotos
   set legenda=coalesce(legenda,''),
       ordem=coalesce(ordem,0),
       created_at=coalesce(created_at,now())
 where legenda is null
    or ordem is null
    or created_at is null;

update public.vistoria_fotos f
   set enviado_por=null
 where f.enviado_por is not null
   and not exists (
     select 1 from auth.users u where u.id=f.enviado_por
   );

alter table public.vistoria_fotos
  alter column legenda set not null,
  alter column ordem set not null,
  alter column created_at set not null;

alter table public.vistoria_fotos
  drop constraint if exists vistoria_fotos_enviado_por_fkey;

alter table public.vistoria_fotos
  add constraint vistoria_fotos_enviado_por_fkey
    foreign key (enviado_por)
    references auth.users(id)
    on delete set null
    not valid;

alter table public.vistoria_fotos
  validate constraint vistoria_fotos_enviado_por_fkey;

alter table public.chamados
  alter column descricao set default '',
  alter column categoria set default 'outro',
  alter column prioridade set default 'normal',
  alter column status set default 'aberto',
  alter column aberto_por set default 'proprietario',
  alter column resposta set default '',
  alter column created_at set default now(),
  alter column updated_at set default now();

update public.chamados
   set titulo=coalesce(nullif(trim(titulo),''),'Chamado sem titulo'),
       descricao=coalesce(descricao,''),
       categoria=case
         when categoria in (
           'hidraulica','eletrica','estrutura',
           'eletrodomestico','pintura','outro'
         ) then categoria
         else 'outro'
       end,
       prioridade=case
         when prioridade in ('urgente','alta','normal','baixa')
           then prioridade
         else 'normal'
       end,
       status=case
         when despesa_id is not null then 'resolvido'
         when status in (
           'aberto','em_andamento','aguardando_peca',
           'resolvido','cancelado'
         ) then status
         else 'aberto'
       end,
       aberto_por=case
         when aberto_por in ('inquilino','proprietario') then aberto_por
         else 'proprietario'
       end,
       resposta=coalesce(resposta,''),
       created_at=coalesce(created_at,now()),
       updated_at=coalesce(updated_at,created_at,now())
 where titulo is null
    or trim(titulo)=''
    or descricao is null
    or categoria is null
    or categoria not in (
      'hidraulica','eletrica','estrutura',
      'eletrodomestico','pintura','outro'
    )
    or prioridade is null
    or prioridade not in ('urgente','alta','normal','baixa')
    or status is null
    or status not in (
      'aberto','em_andamento','aguardando_peca',
      'resolvido','cancelado'
    )
    or (despesa_id is not null and status is distinct from 'resolvido')
    or aberto_por is null
    or aberto_por not in ('inquilino','proprietario')
    or resposta is null
    or created_at is null
    or updated_at is null;

-- Uma despesa vinculada e evidencia de que o chamado foi resolvido.
-- Preservamos esse vinculo e completamos o horario ausente. Para os
-- demais estados, um horario antigo de resolucao nao deve sobreviver.
update public.chamados
   set resolvido_em=coalesce(resolvido_em,updated_at,created_at,now())
 where status='resolvido'
   and resolvido_em is null;

update public.chamados
   set resolvido_em=null
 where status<>'resolvido'
   and resolvido_em is not null;

alter table public.chamados
  alter column titulo set not null,
  alter column descricao set not null,
  alter column categoria set not null,
  alter column prioridade set not null,
  alter column status set not null,
  alter column aberto_por set not null,
  alter column resposta set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

alter table public.chamados
  drop constraint if exists chamados_categoria_check,
  drop constraint if exists chamados_prioridade_check,
  drop constraint if exists chamados_status_check,
  drop constraint if exists chamados_aberto_por_check,
  drop constraint if exists chamados_resolucao_coerente_check,
  drop constraint if exists chamados_despesa_apenas_resolvido_check;

alter table public.chamados
  add constraint chamados_categoria_check
    check (
      categoria in (
        'hidraulica','eletrica','estrutura',
        'eletrodomestico','pintura','outro'
      )
    ) not valid,
  add constraint chamados_prioridade_check
    check (prioridade in ('urgente','alta','normal','baixa')) not valid,
  add constraint chamados_status_check
    check (
      status in (
        'aberto','em_andamento','aguardando_peca',
        'resolvido','cancelado'
      )
    ) not valid,
  add constraint chamados_aberto_por_check
    check (aberto_por in ('inquilino','proprietario')) not valid,
  add constraint chamados_resolucao_coerente_check
    check (
      (status='resolvido' and resolvido_em is not null)
      or
      (status<>'resolvido' and resolvido_em is null)
    ) not valid,
  add constraint chamados_despesa_apenas_resolvido_check
    check (despesa_id is null or status='resolvido') not valid;

alter table public.chamados
  validate constraint chamados_categoria_check,
  validate constraint chamados_prioridade_check,
  validate constraint chamados_status_check,
  validate constraint chamados_aberto_por_check,
  validate constraint chamados_resolucao_coerente_check,
  validate constraint chamados_despesa_apenas_resolvido_check;

alter table public.chamado_fotos
  alter column legenda set default '',
  alter column enviado_por set default auth.uid(),
  alter column created_at set default now();

update public.chamado_fotos
   set legenda=coalesce(legenda,''),
       created_at=coalesce(created_at,now())
 where legenda is null
    or created_at is null;

update public.chamado_fotos f
   set enviado_por=null
 where f.enviado_por is not null
   and not exists (
     select 1 from auth.users u where u.id=f.enviado_por
   );

alter table public.chamado_fotos
  alter column legenda set not null,
  alter column created_at set not null;

alter table public.chamado_fotos
  drop constraint if exists chamado_fotos_enviado_por_fkey;

alter table public.chamado_fotos
  add constraint chamado_fotos_enviado_por_fkey
    foreign key (enviado_por)
    references auth.users(id)
    on delete set null
    not valid;

alter table public.chamado_fotos
  validate constraint chamado_fotos_enviado_por_fkey;

-- Chaves compostas evitam que IDs validos, mas pertencentes a outra
-- conta ou a outro imovel, sejam combinados no mesmo chamado. Os FKs
-- entram como NOT VALID: passam a proteger toda escrita nova sem exigir
-- que uma instalacao antiga corrija seu legado durante esta migracao.
create unique index if not exists idx_imoveis_id_user
  on public.imoveis(id,user_id);
create unique index if not exists idx_inquilinos_id_user
  on public.inquilinos(id,user_id);
create unique index if not exists idx_despesas_id_imovel_user
  on public.despesas(id,imovel_id,user_id);
create unique index if not exists idx_contratos_id_imovel_user
  on public.contratos(id,imovel_id,user_id);
create unique index if not exists idx_vistorias_id_user
  on public.vistorias(id,user_id);
create unique index if not exists idx_chamados_id_user
  on public.chamados(id,user_id);

do $integridade_chamados$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid='public.vistorias'::regclass
       and conname='vistorias_imovel_dono_fk'
  ) then
    alter table public.vistorias
      add constraint vistorias_imovel_dono_fk
      foreign key (imovel_id,user_id)
      references public.imoveis(id,user_id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid='public.vistorias'::regclass
       and conname='vistorias_contrato_imovel_dono_fk'
  ) then
    alter table public.vistorias
      add constraint vistorias_contrato_imovel_dono_fk
      foreign key (contrato_id,imovel_id,user_id)
      references public.contratos(id,imovel_id,user_id)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid='public.chamados'::regclass
       and conname='chamados_imovel_dono_fk'
  ) then
    alter table public.chamados
      add constraint chamados_imovel_dono_fk
      foreign key (imovel_id,user_id)
      references public.imoveis(id,user_id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid='public.chamados'::regclass
       and conname='chamados_inquilino_dono_fk'
  ) then
    alter table public.chamados
      add constraint chamados_inquilino_dono_fk
      foreign key (inquilino_id,user_id)
      references public.inquilinos(id,user_id)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid='public.chamados'::regclass
       and conname='chamados_despesa_imovel_dono_fk'
  ) then
    alter table public.chamados
      add constraint chamados_despesa_imovel_dono_fk
      foreign key (despesa_id,imovel_id,user_id)
      references public.despesas(id,imovel_id,user_id)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid='public.vistoria_fotos'::regclass
       and conname='vistoria_fotos_pai_dono_fk'
  ) then
    alter table public.vistoria_fotos
      add constraint vistoria_fotos_pai_dono_fk
      foreign key (vistoria_id,user_id)
      references public.vistorias(id,user_id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid='public.chamado_fotos'::regclass
       and conname='chamado_fotos_pai_dono_fk'
  ) then
    alter table public.chamado_fotos
      add constraint chamado_fotos_pai_dono_fk
      foreign key (chamado_id,user_id)
      references public.chamados(id,user_id)
      on delete cascade
      not valid;
  end if;
end
$integridade_chamados$;

-- ------------------------------------------------------------
-- 3. SEGURANCA
-- Proprietario ve e mexe no que e dele. Inquilino ve e abre
-- chamado somente das casas em que mora.
-- ------------------------------------------------------------

-- Descobre o proprietario a partir do imovel, para o inquilino
-- nao precisar (nem poder) informar o user_id na mao.
create or replace function public.dono_do_imovel(p_imovel_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select user_id from public.imoveis where id = p_imovel_id;
$$;

revoke all on function public.dono_do_imovel(uuid) from public,anon;
grant execute on function public.dono_do_imovel(uuid) to authenticated;

-- Retorna o cadastro do inquilino logado somente quando o acesso, o
-- contrato e o imovel pertencem a mesma conta. Alem de reduzir repeticao,
-- esta funcao impede que um tenant_id valido de outra conta seja usado
-- para atravessar o isolamento do proprietario.
create or replace function public.inquilino_logado_no_imovel(
  p_imovel_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.inquilino_id
    from public.acessos_inquilino a
    join public.inquilinos t
      on t.id=a.inquilino_id
     and t.user_id=a.proprietario_id
    join public.contratos c
      on c.tenant_id=t.id
     and c.user_id=a.proprietario_id
    join public.imoveis i
      on i.id=c.imovel_id
     and i.user_id=c.user_id
   where a.user_id=auth.uid()
     and a.ativo=true
     and c.imovel_id=p_imovel_id
     and coalesce(c.ativo,true)
     and c.inicio <= current_date
     and (c.fim is null or c.fim >= current_date)
   order by c.inicio desc
   limit 1
$$;

revoke all on function public.inquilino_logado_no_imovel(uuid)
  from public,anon;
grant execute on function public.inquilino_logado_no_imovel(uuid)
  to authenticated;

-- O inquilino logado mora neste imovel?
create or replace function public.inquilino_mora_no_imovel(p_imovel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.inquilino_logado_no_imovel(p_imovel_id) is not null
$$;

revoke all on function public.inquilino_mora_no_imovel(uuid) from public,anon;
grant execute on function public.inquilino_mora_no_imovel(uuid) to authenticated;

-- Papel local e compativel com duas ordens de instalacao:
--   * antes do Financeiro V2, colaboradores antigos continuam como admin;
--   * depois dele, respeita administrador/financeiro/operacional/leitura.
-- A consulta dinamica evita referenciar a coluna "papel" quando ela ainda
-- nao existe numa instalacao antiga.
create or replace function public.papel_vistoria_chamado_atual(
  p_user_id uuid default auth.uid()
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_papel text;
begin
  if p_user_id is null then
    return null;
  end if;

  if public.e_administrador_plataforma(p_user_id) then
    return 'administrador';
  end if;

  if public.usuario_proprietario_id(p_user_id)=p_user_id
     and exists (
       select 1 from public.proprietarios p where p.user_id=p_user_id
     ) then
    return 'administrador';
  end if;

  if not exists (
    select 1
      from public.acessos_colaborador a
     where a.user_id=p_user_id
       and a.ativo
  ) then
    return null;
  end if;

  if exists (
    select 1
      from pg_attribute
     where attrelid='public.acessos_colaborador'::regclass
       and attname='papel'
       and not attisdropped
  ) then
    execute
      'select coalesce(nullif(a.papel,'''') ,''administrador'')
         from public.acessos_colaborador a
        where a.user_id=$1 and a.ativo
        limit 1'
      into v_papel
      using p_user_id;
  else
    v_papel:='administrador';
  end if;

  return v_papel;
end
$$;

create or replace function public.pode_ler_vistoria_chamado(
  p_proprietario_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null
    and p_proprietario_id is not null
    and public.usuario_proprietario_id(p_user_id)=p_proprietario_id
    and public.e_acesso_operacional(p_proprietario_id)
    and public.papel_vistoria_chamado_atual(p_user_id)
      in ('administrador','financeiro','operacional','leitura')
$$;

create or replace function public.pode_escrever_vistoria_chamado(
  p_proprietario_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.pode_ler_vistoria_chamado(
      p_proprietario_id,
      p_user_id
    )
    and public.papel_vistoria_chamado_atual(p_user_id)
      in ('administrador','operacional')
$$;

revoke all on function public.papel_vistoria_chamado_atual(uuid)
  from public,anon;
revoke all on function public.pode_ler_vistoria_chamado(uuid,uuid)
  from public,anon;
revoke all on function public.pode_escrever_vistoria_chamado(uuid,uuid)
  from public,anon;
grant execute on function public.papel_vistoria_chamado_atual(uuid)
  to authenticated;
grant execute on function public.pode_ler_vistoria_chamado(uuid,uuid)
  to authenticated;
grant execute on function public.pode_escrever_vistoria_chamado(uuid,uuid)
  to authenticated;

-- Um inquilino le e anexa somente no chamado associado ao proprio
-- cadastro, nao em chamados de moradores anteriores da mesma casa.
create or replace function public.inquilino_pode_acessar_chamado(
  p_chamado_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.chamados c
     where c.id=p_chamado_id
       and c.inquilino_id=
         public.inquilino_logado_no_imovel(c.imovel_id)
       and c.user_id=public.dono_do_imovel(c.imovel_id)
  )
$$;

revoke all on function public.inquilino_pode_acessar_chamado(uuid)
  from public,anon;
grant execute on function public.inquilino_pode_acessar_chamado(uuid)
  to authenticated;

-- Garante a propriedade real do imovel mesmo que alguem tente
-- informar manualmente um user_id de outra conta. Para colaborador,
-- grava sempre o proprietario resolvido, como o restante do app.
create or replace function public.validar_dono_registro_imovel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dono uuid;
  v_resolvido uuid;
  v_inquilino_logado uuid;
  v_resolucao_controlada boolean:=
    coalesce(current_setting('app.resolvendo_chamado',true),'')='1'
    or coalesce(current_setting('app.restaurando_backup',true),'')='1';
begin
  if tg_table_name='chamados'
     and tg_op='UPDATE'
     and auth.uid() is not null then
    if new.user_id is distinct from old.user_id
       or new.imovel_id is distinct from old.imovel_id then
      raise exception
        'A conta e o imovel de um chamado fazem parte do historico e nao podem ser alterados.';
    end if;
    if new.inquilino_id is distinct from old.inquilino_id then
      raise exception
        'O inquilino associado ao chamado nao pode ser alterado.';
    end if;
    if new.created_at is distinct from old.created_at then
      raise exception
        'A data de abertura do chamado faz parte do historico e nao pode ser alterada.';
    end if;
  end if;

  v_dono := public.dono_do_imovel(new.imovel_id);
  v_resolvido := public.usuario_proprietario_id(auth.uid());

  if v_dono is null then
    raise exception 'Imovel nao encontrado.';
  end if;

  if auth.uid() is null then
    -- SQL Editor/service_role nao representa um usuario final. Nessa
    -- situacao administrativa, a propria conta e o autor rastreavel.
    new.user_id:=v_dono;
    if tg_table_name='chamados' and tg_op='INSERT' then
      new.aberto_por:='proprietario';
    end if;
  elsif v_resolvido=v_dono
     and public.pode_escrever_vistoria_chamado(v_dono,auth.uid()) then
    new.user_id := v_dono;
    if tg_table_name='chamados' and tg_op='INSERT' then
      new.aberto_por := 'proprietario';
    end if;
  elsif tg_table_name = 'chamados'
        and tg_op='INSERT'
        and public.inquilino_mora_no_imovel(new.imovel_id) then
    v_inquilino_logado :=
      public.inquilino_logado_no_imovel(new.imovel_id);
    new.user_id := v_dono;
    new.inquilino_id := v_inquilino_logado;
    new.aberto_por := 'inquilino';
    new.status := 'aberto';
    new.resposta := '';
    new.despesa_id := null;
    new.resolvido_em := null;
  else
    raise exception 'Sem acesso operacional a este imovel.';
  end if;

  if tg_table_name='vistorias' then
    -- O cliente nunca escolhe o autor. Em operacoes autenticadas,
    -- registramos o ator real; em importacoes administrativas sem
    -- auth.uid(), registramos a conta proprietaria.
    if tg_op='INSERT' then
      new.criado_por:=coalesce(auth.uid(),v_dono);
    elsif auth.uid() is null and new.criado_por is null then
      -- Permite que a FK ON DELETE SET NULL preserve a vistoria quando
      -- o usuario autor for removido.
      new.criado_por:=null;
    else
      new.criado_por:=old.criado_por;
    end if;
  end if;

  /* Campos exclusivos de cada tabela ficam em blocos separados. Em um
     trigger RECORD, referenciar NEW.contrato_id no chamado falha antes de o
     PostgreSQL conseguir aproveitar o primeiro lado do AND. */
  if tg_table_name = 'vistorias' then
    if new.contrato_id is not null
       and not exists (
         select 1 from public.contratos c
          where c.id = new.contrato_id
            and c.imovel_id = new.imovel_id
            and c.user_id = v_dono
       ) then
      raise exception 'Contrato nao pertence a este imovel.';
    end if;
  end if;

  if tg_table_name='chamados' then
    if new.inquilino_id is not null
       and not exists (
         select 1
           from public.inquilinos i
           join public.contratos c
             on c.tenant_id=i.id
            and c.user_id=i.user_id
          where i.id=new.inquilino_id
            and i.user_id=v_dono
            and c.imovel_id=new.imovel_id
       ) then
      raise exception
        'Inquilino nao pertence a esta conta e a este imovel.';
    end if;
  end if;

  if tg_table_name='chamados' then
    if tg_op='UPDATE' then
      -- Quem abriu faz parte do historico e nao pode ser reescrito.
      new.aberto_por:=old.aberto_por;

      if new.despesa_id is distinct from old.despesa_id
         and auth.uid() is not null
         and not v_resolucao_controlada then
        raise exception
          'Use a acao de resolver chamado para vincular uma despesa.';
      end if;

      if old.despesa_id is not null
         and new.status<>'resolvido'
         and auth.uid() is not null then
        raise exception
          'Um chamado com despesa vinculada nao pode ser reaberto ou cancelado.';
      end if;
    elsif new.despesa_id is not null
          and auth.uid() is not null
          and not v_resolucao_controlada then
      raise exception
        'Cadastre o chamado antes de vincular sua despesa.';
    end if;

    if new.status='resolvido' then
      if tg_op='INSERT' then
        new.resolvido_em:=case
          when auth.uid() is null or v_resolucao_controlada
            then coalesce(new.resolvido_em,now())
          else now()
        end;
      elsif old.status='resolvido' then
        new.resolvido_em:=coalesce(old.resolvido_em,now());
      else
        new.resolvido_em:=now();
      end if;
    else
      new.resolvido_em:=null;
    end if;
  end if;

  if tg_table_name='chamados' then
    if new.despesa_id is not null
       and not exists (
         select 1
           from public.despesas d
          where d.id=new.despesa_id
            and d.user_id=v_dono
            and d.imovel_id=new.imovel_id
       ) then
      raise exception
        'Despesa nao pertence a esta conta e a este imovel.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.validar_dono_registro_imovel()
  from public,anon,authenticated;

drop trigger if exists vistorias_validar_dono on public.vistorias;
create trigger vistorias_validar_dono
before insert or update of user_id,imovel_id,contrato_id,criado_por
on public.vistorias
for each row execute function public.validar_dono_registro_imovel();

drop trigger if exists chamados_validar_dono on public.chamados;
create trigger chamados_validar_dono
before insert or update of
  user_id,imovel_id,inquilino_id,despesa_id,aberto_por,status,resolvido_em,
  created_at
on public.chamados
for each row execute function public.validar_dono_registro_imovel();

-- A foto herda obrigatoriamente o dono do registro pai.
create or replace function public.validar_dono_foto_operacional()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dono uuid;
  v_imovel uuid;
  v_inquilino boolean:=false;
begin
  if tg_table_name = 'vistoria_fotos' then
    select v.user_id,v.imovel_id into v_dono,v_imovel
      from public.vistorias v
     where v.id=new.vistoria_id;
  else
    select c.user_id,c.imovel_id into v_dono,v_imovel
      from public.chamados c
     where c.id=new.chamado_id;
  end if;

  if v_dono is null then
    raise exception 'Registro pai nao encontrado.';
  end if;

  if auth.uid() is null then
    -- SQL Editor/service_role e a acao interna ON DELETE SET NULL das
    -- FKs podem manter o registro sem personificar um usuario final.
    null;
  elsif not public.pode_escrever_vistoria_chamado(v_dono,auth.uid()) then
    v_inquilino :=
      tg_table_name='chamado_fotos'
      and tg_op='INSERT'
      and public.inquilino_pode_acessar_chamado(new.chamado_id);
    if not v_inquilino then
      raise exception 'Sem permissao para alterar fotos deste registro.';
    end if;
  end if;

  new.user_id := v_dono;
  if tg_op='INSERT' then
    if auth.uid() is null then
      new.enviado_por:=v_dono;
    else
      new.enviado_por:=auth.uid();
    end if;
  elsif auth.uid() is null and new.enviado_por is null then
    new.enviado_por:=null;
  else
    new.enviado_por:=old.enviado_por;
  end if;

  if tg_table_name = 'vistoria_fotos'
     and new.caminho not like (
       v_dono::text || '/vistorias/' || new.vistoria_id::text || '/%'
     ) then
    raise exception 'Caminho da foto de vistoria invalido.';
  end if;
  if tg_table_name = 'chamado_fotos'
     and new.caminho not like (
       v_dono::text || '/chamados/' || new.chamado_id::text || '/%'
     ) then
    raise exception 'Caminho da foto de chamado invalido.';
  end if;
  if v_inquilino
     and new.caminho not like (
       v_dono::text || '/chamados/' || new.chamado_id::text || '/' ||
       auth.uid()::text || '/%'
  ) then
    raise exception 'Caminho da foto enviada pelo inquilino invalido.';
  end if;

  if (
       tg_op='INSERT'
       or new.caminho is distinct from old.caminho
     )
     and not exists (
       select 1
         from storage.objects o
        where o.bucket_id='imoveis-arquivos'
          and o.name=new.caminho
     ) then
    raise exception
      'O arquivo da foto precisa existir no armazenamento antes do registro.';
  end if;
  return new;
end;
$$;

revoke all on function public.validar_dono_foto_operacional()
  from public,anon,authenticated;

drop trigger if exists vistoria_fotos_validar_dono on public.vistoria_fotos;
create trigger vistoria_fotos_validar_dono
before insert or update of user_id,vistoria_id,caminho,enviado_por
on public.vistoria_fotos
for each row execute function public.validar_dono_foto_operacional();

drop trigger if exists chamado_fotos_validar_dono on public.chamado_fotos;
create trigger chamado_fotos_validar_dono
before insert or update of user_id,chamado_id,caminho,enviado_por
on public.chamado_fotos
for each row execute function public.validar_dono_foto_operacional();

do $$
declare v_tabela text;
begin
  foreach v_tabela in array array['vistorias','vistoria_fotos','chamados','chamado_fotos']
  loop
    execute format('alter table public.%I enable row level security', v_tabela);
    execute format('alter table public.%I force row level security', v_tabela);
  end loop;
end
$$;

-- --- Vistorias: todos os papeis autorizados leem; somente
-- administrador/operacional escrevem.
drop policy if exists vistorias_dono on public.vistorias;
drop policy if exists vistorias_ler on public.vistorias;
drop policy if exists vistorias_inserir on public.vistorias;
drop policy if exists vistorias_alterar on public.vistorias;
drop policy if exists vistorias_excluir on public.vistorias;

create policy vistorias_ler on public.vistorias
  for select to authenticated
  using (public.pode_ler_vistoria_chamado(user_id,auth.uid()));

create policy vistorias_inserir on public.vistorias
  for insert to authenticated
  with check (
    public.pode_escrever_vistoria_chamado(user_id,auth.uid())
    and user_id = public.dono_do_imovel(imovel_id)
  );

create policy vistorias_alterar on public.vistorias
  for update to authenticated
  using (
    public.pode_escrever_vistoria_chamado(user_id,auth.uid())
  )
  with check (
    public.pode_escrever_vistoria_chamado(user_id,auth.uid())
    and user_id=public.dono_do_imovel(imovel_id)
  );

create policy vistorias_excluir on public.vistorias
  for delete to authenticated
  using (public.pode_escrever_vistoria_chamado(user_id,auth.uid()));

drop policy if exists vistoria_fotos_dono on public.vistoria_fotos;
drop policy if exists vistoria_fotos_ler on public.vistoria_fotos;
drop policy if exists vistoria_fotos_inserir on public.vistoria_fotos;
drop policy if exists vistoria_fotos_alterar on public.vistoria_fotos;
drop policy if exists vistoria_fotos_excluir on public.vistoria_fotos;

create policy vistoria_fotos_ler on public.vistoria_fotos
  for select to authenticated
  using (public.pode_ler_vistoria_chamado(user_id,auth.uid()));

-- Upload direto de fotos de vistoria permanece bloqueado. Sem uma reserva
-- de cota atomica entre banco e Storage, permitir upload antes da linha
-- deixaria objetos orfaos e permitiria ultrapassar o plano.

create policy vistoria_fotos_alterar on public.vistoria_fotos
  for update to authenticated
  using (
    public.pode_escrever_vistoria_chamado(user_id,auth.uid())
  )
  with check (
    public.pode_escrever_vistoria_chamado(user_id,auth.uid())
    and exists (
      select 1 from public.vistorias v
       where v.id=vistoria_id
         and v.user_id=vistoria_fotos.user_id
    )
  );

create policy vistoria_fotos_excluir on public.vistoria_fotos
  for delete to authenticated
  using (public.pode_escrever_vistoria_chamado(user_id,auth.uid()));

-- --- Chamados: leitura para papeis autorizados; insert/update apenas
-- administrador/operacional. DELETE nao recebe politica nem privilegio.
drop policy if exists chamados_dono on public.chamados;
drop policy if exists chamados_ler on public.chamados;
drop policy if exists chamados_inserir on public.chamados;
drop policy if exists chamados_alterar on public.chamados;
drop policy if exists chamados_excluir on public.chamados;

create policy chamados_ler on public.chamados
  for select to authenticated
  using (public.pode_ler_vistoria_chamado(user_id,auth.uid()));

create policy chamados_inserir on public.chamados
  for insert to authenticated
  with check (
    public.pode_escrever_vistoria_chamado(user_id,auth.uid())
    and user_id=public.dono_do_imovel(imovel_id)
  );

create policy chamados_alterar on public.chamados
  for update to authenticated
  using (
    public.pode_escrever_vistoria_chamado(user_id,auth.uid())
  )
  with check (
    public.pode_escrever_vistoria_chamado(user_id,auth.uid())
    and user_id=public.dono_do_imovel(imovel_id)
  );

-- --- Inquilino: le e abre somente chamado associado ao proprio
-- cadastro. Nao existe politica de update ou delete para ele.
drop policy if exists chamados_inquilino_le on public.chamados;
create policy chamados_inquilino_le on public.chamados
  for select to authenticated
  using (public.inquilino_pode_acessar_chamado(id));

drop policy if exists chamados_inquilino_abre on public.chamados;
create policy chamados_inquilino_abre on public.chamados
  for insert to authenticated
  with check (
    public.inquilino_mora_no_imovel(imovel_id)
    and inquilino_id=public.inquilino_logado_no_imovel(imovel_id)
    and user_id=public.dono_do_imovel(imovel_id)
    and aberto_por='inquilino'
    and status='aberto'
    and resposta=''
    and despesa_id is null
    and resolvido_em is null
  );

drop policy if exists chamado_fotos_dono on public.chamado_fotos;
drop policy if exists chamado_fotos_ler on public.chamado_fotos;
drop policy if exists chamado_fotos_inserir on public.chamado_fotos;
drop policy if exists chamado_fotos_alterar on public.chamado_fotos;
drop policy if exists chamado_fotos_excluir on public.chamado_fotos;

create policy chamado_fotos_ler on public.chamado_fotos
  for select to authenticated
  using (public.pode_ler_vistoria_chamado(user_id,auth.uid()));

-- O mesmo bloqueio vale para fotos de chamado. Uma futura RPC de upload
-- devera reservar a cota, criar o objeto e registrar a linha como uma unica
-- operacao compensavel.

create policy chamado_fotos_alterar on public.chamado_fotos
  for update to authenticated
  using (
    public.pode_escrever_vistoria_chamado(user_id,auth.uid())
  )
  with check (
    public.pode_escrever_vistoria_chamado(user_id,auth.uid())
    and exists (
      select 1 from public.chamados c
       where c.id=chamado_id
         and c.user_id=chamado_fotos.user_id
    )
  );

create policy chamado_fotos_excluir on public.chamado_fotos
  for delete to authenticated
  using (public.pode_escrever_vistoria_chamado(user_id,auth.uid()));

drop policy if exists chamado_fotos_inquilino on public.chamado_fotos;
create policy chamado_fotos_inquilino on public.chamado_fotos
  for select to authenticated
  using (public.inquilino_pode_acessar_chamado(chamado_id));

drop policy if exists chamado_fotos_inquilino_insere on public.chamado_fotos;
-- O portal ainda pode ler fotos existentes, mas nao recebe INSERT enquanto
-- o upload controlado por cota nao estiver implementado.

revoke all on table
  public.vistorias,
  public.vistoria_fotos,
  public.chamados,
  public.chamado_fotos
from public,anon,authenticated;

-- ALL ja inclui TRUNCATE, mas a revogacao explicita documenta e garante
-- a regra destrutiva mesmo em instalacoes que concederam esse privilegio
-- separadamente em versoes anteriores.
revoke truncate on table
  public.vistorias,
  public.vistoria_fotos,
  public.chamados,
  public.chamado_fotos
from public,anon,authenticated;

grant select,insert,update,delete on table public.vistorias
  to authenticated;
grant select,update,delete on table
  public.vistoria_fotos,
  public.chamado_fotos
to authenticated;

grant select,insert,update on table public.chamados to authenticated;
revoke delete on table public.chamados from authenticated;
revoke truncate on table public.chamados from authenticated;

-- Fotos enviadas pelo inquilino usam uma pasta do proprio uploader:
--   <dono>/chamados/<chamado-id>/<auth.uid>/<arquivo>
-- Fotos da equipe podem manter o caminho antigo, sem esse segmento.
-- A funcao valida o caminho antes de qualquer cast para UUID.
create or replace function public.inquilino_pode_acessar_foto_chamado(
  p_caminho text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public,storage
as $$
declare
  v_partes text[];
  v_chamado uuid;
  v_dono uuid;
begin
  v_partes := storage.foldername(p_caminho);
  if coalesce(array_length(v_partes,1),0) < 3
     or v_partes[2] <> 'chamados'
     or v_partes[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or v_partes[3] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;

  v_dono := v_partes[1]::uuid;
  v_chamado := v_partes[3]::uuid;
  return exists (
    select 1 from public.chamados c
     where c.id = v_chamado
       and c.user_id = v_dono
       and public.inquilino_pode_acessar_chamado(c.id)
  );
end;
$$;

revoke all on function public.inquilino_pode_acessar_foto_chamado(text)
  from public,anon;
grant execute on function public.inquilino_pode_acessar_foto_chamado(text)
  to authenticated;

create or replace function public.inquilino_pode_enviar_foto_chamado(
  p_caminho text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public,storage
as $$
declare
  v_partes text[];
begin
  v_partes:=storage.foldername(p_caminho);
  return public.inquilino_pode_acessar_foto_chamado(p_caminho)
    and coalesce(array_length(v_partes,1),0)>=4
    and v_partes[4]=auth.uid()::text;
end;
$$;

revoke all on function public.inquilino_pode_enviar_foto_chamado(text)
  from public,anon;
grant execute on function public.inquilino_pode_enviar_foto_chamado(text)
  to authenticated;

create or replace function public.pode_ler_arquivo_operacional(
  p_caminho text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public,storage
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
  if not public.pode_ler_vistoria_chamado(v_owner,auth.uid()) then
    return false;
  end if;

  v_papel:=public.papel_vistoria_chamado_atual(auth.uid());
  if v_papel in ('administrador','operacional') then
    return true;
  end if;
  if v_papel not in ('financeiro','leitura') then
    return false;
  end if;

  -- Financeiro e leitura recebem somente arquivos operacionais com uma
  -- linha conhecida no banco. A tabela documentos fica inteiramente
  -- restrita, pois contratos, comprovantes, RG/CPF e tipos legados podem
  -- conter dados pessoais mesmo quando a categoria foi preenchida errada.
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
end;
$$;

create or replace function public.pode_escrever_arquivo_operacional(
  p_caminho text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public,storage
as $$
declare
  v_partes text[];
begin
  v_partes:=storage.foldername(p_caminho);
  if coalesce(array_length(v_partes,1),0)<1
     or v_partes[1] !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.pode_escrever_vistoria_chamado(
    v_partes[1]::uuid,
    auth.uid()
  );
end;
$$;

revoke all on function public.pode_ler_arquivo_operacional(text)
  from public,anon;
revoke all on function public.pode_escrever_arquivo_operacional(text)
  from public,anon;
grant execute on function public.pode_ler_arquivo_operacional(text)
  to authenticated;
grant execute on function public.pode_escrever_arquivo_operacional(text)
  to authenticated;

-- As politicas gerais do bucket tambem precisam respeitar o papel do
-- colaborador. Como politicas RLS sao permissivas (OR), deixar as versoes
-- antigas faria financeiro/leitura continuarem escrevendo arquivos.
drop policy if exists owner_files_select on storage.objects;
drop policy if exists owner_files_insert on storage.objects;
drop policy if exists owner_files_update on storage.objects;
drop policy if exists owner_files_delete on storage.objects;

create policy owner_files_select on storage.objects
  for select to authenticated
  using (
    bucket_id='imoveis-arquivos'
    and public.pode_ler_arquivo_operacional(name)
  );

create policy owner_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id='imoveis-arquivos'
    and public.pode_escrever_arquivo_operacional(name)
    and coalesce((storage.foldername(name))[2],'')
      not in ('chamados','vistorias')
  );

create policy owner_files_update on storage.objects
  for update to authenticated
  using (
    bucket_id='imoveis-arquivos'
    and public.pode_escrever_arquivo_operacional(name)
  )
  with check (
    bucket_id='imoveis-arquivos'
    and public.pode_escrever_arquivo_operacional(name)
    and coalesce((storage.foldername(name))[2],'')
      not in ('chamados','vistorias')
  );

create policy owner_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id='imoveis-arquivos'
    and public.pode_escrever_arquivo_operacional(name)
  );

drop policy if exists tenant_chamado_files_select on storage.objects;
create policy tenant_chamado_files_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'imoveis-arquivos'
    and public.inquilino_pode_acessar_foto_chamado(name)
  );

drop policy if exists tenant_chamado_files_insert on storage.objects;

-- Remove permissoes de versoes anteriores. O inquilino continua lendo
-- fotos existentes, mas upload/delete ficam bloqueados ate existir uma
-- operacao de Storage com reserva de cota e compensacao de falhas.
drop policy if exists tenant_chamado_files_delete on storage.objects;

-- ------------------------------------------------------------
-- 4. REGISTRAR VISTORIA BASICA
-- A acao compacta da ficha do imovel passa a criar historico real. Ela
-- nao inventa checklist: registra uma vistoria periodica com estado inicial
-- "bom", que podera ser detalhada por uma tela propria no futuro.
-- A linha do imovel e bloqueada para tornar dois cliques no mesmo dia
-- idempotentes.
-- ------------------------------------------------------------

create or replace function public.registrar_vistoria_basica(
  p_imovel_id uuid,
  p_data date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dono uuid;
  v_contrato_id uuid;
  v_total_contratos integer:=0;
  v_vistoria public.vistorias%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sessao expirada.';
  end if;
  if p_data is null or p_data>current_date then
    raise exception 'A data da vistoria nao pode ficar no futuro.';
  end if;

  select i.user_id
    into v_dono
    from public.imoveis i
   where i.id=p_imovel_id
   for update;

  if not found then
    raise exception 'Imovel nao encontrado.';
  end if;
  if not public.pode_escrever_vistoria_chamado(v_dono,auth.uid()) then
    raise exception 'Sem permissao para registrar vistoria.';
  end if;

  select
    count(*)::integer,
    (array_agg(c.id order by c.inicio desc,c.id))[1]
    into v_total_contratos,v_contrato_id
    from public.contratos c
   where c.user_id=v_dono
     and c.imovel_id=p_imovel_id
     and c.inicio<=p_data
     and (c.fim is null or c.fim>=p_data);

  if v_total_contratos<>1 then
    v_contrato_id:=null;
  end if;

  select v.*
    into v_vistoria
    from public.vistorias v
   where v.user_id=v_dono
     and v.imovel_id=p_imovel_id
     and v.data=p_data
     and v.tipo='periodica'
   order by v.created_at
   limit 1;

  if not found then
    insert into public.vistorias(
      user_id,imovel_id,contrato_id,data,tipo,estado,observacoes,itens
    )
    values(
      v_dono,p_imovel_id,v_contrato_id,p_data,
      'periodica','bom','Registro basico pela ficha do imovel','[]'::jsonb
    )
    returning * into v_vistoria;
  end if;

  update public.imoveis
     set ultima_vistoria=case
           when ultima_vistoria is null or ultima_vistoria<p_data
             then p_data
           else ultima_vistoria
         end,
         updated_at=now()
   where id=p_imovel_id
     and user_id=v_dono;

  return jsonb_build_object(
    'id',v_vistoria.id,
    'imovel_id',v_vistoria.imovel_id,
    'contrato_id',v_vistoria.contrato_id,
    'data',v_vistoria.data,
    'tipo',v_vistoria.tipo,
    'estado',v_vistoria.estado,
    'observacoes',v_vistoria.observacoes,
    'criado_por',v_vistoria.criado_por
  );
end;
$$;

revoke all on function public.registrar_vistoria_basica(uuid,date)
  from public,anon,authenticated;
grant execute on function public.registrar_vistoria_basica(uuid,date)
  to authenticated;

-- ------------------------------------------------------------
-- 5. ABRIR CHAMADO
-- Funcao propria para o inquilino nao precisar saber o user_id do
-- proprietario nem o id do proprio cadastro.
-- ------------------------------------------------------------

create or replace function public.abrir_chamado(
  p_imovel_id uuid,
  p_titulo    text,
  p_descricao text default '',
  p_categoria text default 'outro',
  p_prioridade text default 'normal'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dono uuid;
  v_inquilino uuid;
  v_aberto_por text;
  v_operador_dono uuid;
  v_id uuid;
begin
  if coalesce(trim(p_titulo),'') = '' then
    raise exception 'Descreva o problema em poucas palavras.';
  end if;

  v_dono := public.dono_do_imovel(p_imovel_id);
  if v_dono is null then
    raise exception 'Imovel nao encontrado.';
  end if;

  v_operador_dono := public.usuario_proprietario_id(auth.uid());
  if v_operador_dono = v_dono
     and public.pode_escrever_vistoria_chamado(v_dono,auth.uid()) then
    v_aberto_por := 'proprietario';
    v_inquilino := null;
  elsif public.inquilino_mora_no_imovel(p_imovel_id) then
    v_aberto_por := 'inquilino';
    v_inquilino:=public.inquilino_logado_no_imovel(p_imovel_id);
  else
    raise exception 'Voce nao tem acesso a este imovel.';
  end if;

  insert into public.chamados
    (user_id, imovel_id, inquilino_id, titulo, descricao,
     categoria, prioridade, aberto_por, status)
  values
    (v_dono, p_imovel_id, v_inquilino, trim(p_titulo), coalesce(p_descricao,''),
     coalesce(p_categoria,'outro'), coalesce(p_prioridade,'normal'), v_aberto_por, 'aberto')
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.abrir_chamado(uuid,text,text,text,text)
  from public,anon;
grant execute on function public.abrir_chamado(uuid,text,text,text,text) to authenticated;

-- Resolve o chamado e, opcionalmente, cria e vincula a despesa na mesma
-- transacao. O cliente atual pode continuar fazendo as duas gravacoes
-- separadas; esta RPC oferece o caminho seguro para uma atualizacao futura
-- sem deixar despesa orfa se a segunda gravacao falhar.
create or replace function public.resolver_chamado_com_despesa(
  p_chamado_id uuid,
  p_resposta text default '',
  p_criar_despesa boolean default false,
  p_valor numeric default null,
  p_data date default current_date,
  p_prestador text default '',
  p_categoria_despesa text default 'Manutenção'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chamado public.chamados%rowtype;
  v_despesa_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sessao expirada.';
  end if;

  select c.*
    into v_chamado
    from public.chamados c
   where c.id=p_chamado_id
   for update;

  if not found then
    raise exception 'Chamado nao encontrado.';
  end if;

  if not public.pode_escrever_vistoria_chamado(
    v_chamado.user_id,
    auth.uid()
  ) then
    raise exception 'Sem permissao para resolver este chamado.';
  end if;

  v_despesa_id:=v_chamado.despesa_id;

  if coalesce(p_criar_despesa,false) and v_despesa_id is null then
    if public.papel_vistoria_chamado_atual(auth.uid())
       <> 'administrador' then
      raise exception
        'Somente administrador pode criar a despesa ao resolver.';
    end if;

    if coalesce(p_valor,0)<=0 then
      raise exception 'Informe um valor de despesa maior que zero.';
    end if;

    insert into public.despesas(
      user_id,
      imovel_id,
      descricao,
      categoria,
      valor,
      data,
      prestador,
      status
    )
    values (
      v_chamado.user_id,
      v_chamado.imovel_id,
      'Manutenção: ' || v_chamado.titulo,
      coalesce(nullif(trim(p_categoria_despesa),''),'Manutenção'),
      p_valor,
      coalesce(p_data,current_date),
      coalesce(trim(p_prestador),''),
      'Concluído'
    )
    returning id into v_despesa_id;
  end if;

  -- Somente esta transacao pode alterar o vinculo financeiro do chamado.
  -- O gatilho rejeita UPDATE direto, inclusive feito por colaborador
  -- operacional, e o escopo local desaparece no COMMIT/ROLLBACK.
  perform set_config('app.resolvendo_chamado','1',true);

  update public.chamados
     set status='resolvido',
         resposta=coalesce(p_resposta,''),
         despesa_id=v_despesa_id,
         resolvido_em=coalesce(v_chamado.resolvido_em,now()),
         updated_at=now()
   where id=v_chamado.id
   returning * into v_chamado;

  return jsonb_build_object(
    'chamado_id',v_chamado.id,
    'status',v_chamado.status,
    'resolvido_em',v_chamado.resolvido_em,
    'despesa_id',v_chamado.despesa_id
  );
end;
$$;

revoke all on function public.resolver_chamado_com_despesa(
  uuid,text,boolean,numeric,date,text,text
) from public,anon,authenticated;
grant execute on function public.resolver_chamado_com_despesa(
  uuid,text,boolean,numeric,date,text,text
) to authenticated;

-- Se o Financeiro V2 já estiver instalado, aplica também o papel operacional
-- aos chamados. Quando esta migração roda antes dele, o próprio Financeiro V2
-- cria o mesmo gatilho depois. O INSERT fica com o validador proprio
-- acima para preservar a excecao minima do inquilino; update/delete
-- continuam passando tambem pelo validador compartilhado.
do $papel_chamados$
begin
  if to_regprocedure('public.validar_papel_escrita_aluguel()') is not null then
    drop trigger if exists validar_papel_escrita on public.chamados;
    create trigger validar_papel_escrita
    before update or delete on public.chamados
    for each row execute function public.validar_papel_escrita_aluguel();
  end if;
end
$papel_chamados$;

-- ------------------------------------------------------------
-- 5. CONFERENCIA
-- ------------------------------------------------------------
do $$
begin
  raise notice 'Vistorias e chamados prontos.';
  raise notice '  tabelas: vistorias, vistoria_fotos, chamados, chamado_fotos';
  raise notice '  funcao para o inquilino: abrir_chamado(imovel, titulo, descricao, categoria, prioridade)';
  raise notice '  resolucao atomica: resolver_chamado_com_despesa(chamado, resposta, criar_despesa, valor, data, prestador, categoria)';
end
$$;

commit;
