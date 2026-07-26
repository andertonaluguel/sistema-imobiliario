-- ============================================================
-- FASE A — MODULOS VENDAVEIS
-- Separa "o que a conta acessa" (modulo) de "quanto ela pode
-- usar" (plano gratuito/basico/premium, que continua igual).
--
-- Esta migracao e ADITIVA e REEXECUTAVEL:
--   * nenhuma tabela existente perde coluna ou linha
--   * nenhum dado de imovel, inquilino ou pagamento e tocado
--   * rodar duas vezes produz o mesmo resultado
--
-- Ao terminar, o aplicativo continua funcionando exatamente
-- como antes. Nada e liberado e nada e bloqueado nesta fase.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LICENCAS DE MODULO
-- ------------------------------------------------------------

create table if not exists public.licencas_modulo (
  user_id       uuid not null
                references public.proprietarios(user_id) on delete cascade,
  modulo        text not null,
  status        text not null default 'ativa',
  expira_em     date,
  valor_pago    numeric(12,2) not null default 0,
  origem        text not null default 'venda',
  observacoes   text not null default '',
  ativada_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por    uuid references auth.users(id) on delete set null,
  primary key (user_id, modulo)
);

-- Restricoes recriadas sempre, para a migracao poder evoluir sem
-- quebrar quem ja rodou uma versao anterior deste arquivo.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.licencas_modulo'::regclass
      and contype = 'c'
  loop
    execute format(
      'alter table public.licencas_modulo drop constraint %I',
      c.conname
    );
  end loop;
end
$$;

alter table public.licencas_modulo
  add constraint licencas_modulo_modulo_check
  check (modulo in ('alugueis','minha_casa','vitrine'));

alter table public.licencas_modulo
  add constraint licencas_modulo_status_check
  check (status in ('ativa','suspensa','cancelada','avaliacao'));

alter table public.licencas_modulo
  add constraint licencas_modulo_origem_check
  check (origem in ('venda','bonus','cortesia','avaliacao','migracao'));

alter table public.licencas_modulo
  add constraint licencas_modulo_valor_check
  check (valor_pago >= 0);

create index if not exists licencas_modulo_modulo_idx
  on public.licencas_modulo(modulo, status);

create index if not exists licencas_modulo_expira_idx
  on public.licencas_modulo(expira_em)
  where expira_em is not null;

-- ------------------------------------------------------------
-- 2. A PERGUNTA CENTRAL: esta conta tem este modulo?
--
-- Tres detalhes importantes:
--   a) e_mestre() vem primeiro  -> voce nunca perde acesso a nada,
--      aconteca o que acontecer com a tabela de licencas.
--   b) usuario_proprietario_id() -> o funcionario herda a licenca
--      do patrao automaticamente, sem licenca propria.
--   c) status 'avaliacao' + expira_em -> teste gratis de 7 dias
--      sai de graca, sem nenhuma regra nova.
-- ------------------------------------------------------------

create or replace function public.tem_modulo(
  p_modulo text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select
    public.e_mestre(p_user_id)
    or exists(
      select 1
      from public.licencas_modulo l
      where l.user_id = public.usuario_proprietario_id(p_user_id)
        and l.modulo = p_modulo
        and l.status in ('ativa','avaliacao')
        and (l.expira_em is null or l.expira_em >= current_date)
    )
$$;

revoke all on function public.tem_modulo(text,uuid) from public,anon;
grant execute on function public.tem_modulo(text,uuid) to authenticated;

-- Pacote pronto para o front-end montar o topo da tela.
create or replace function public.modulos_da_conta(
  p_user_id uuid default auth.uid()
)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'alugueis',  public.tem_modulo('alugueis',  p_user_id),
    'minhaCasa', public.tem_modulo('minha_casa',p_user_id),
    'vitrine',   public.tem_modulo('vitrine',   p_user_id)
  )
$$;

revoke all on function public.modulos_da_conta(uuid) from public,anon;
grant execute on function public.modulos_da_conta(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. MIGRACAO DAS CONTAS QUE JA EXISTEM
--
-- Ninguem pode perder acesso na virada. Todo proprietario com
-- assinatura ativa recebe o modulo Alugueis, que e o que ele ja
-- usava antes desta migracao existir.
-- ------------------------------------------------------------

insert into public.licencas_modulo(user_id,modulo,status,origem,observacoes)
select a.user_id,'alugueis','ativa','migracao',
       'Concedido na migracao para modulos'
from public.assinaturas a
join public.proprietarios p on p.user_id = a.user_id
where a.status = 'ativa'
on conflict (user_id,modulo) do nothing;

-- Contas Mestre recebem os tres modulos explicitamente. Nao e
-- estritamente necessario (tem_modulo ja libera pelo e_mestre),
-- mas deixa a tabela legivel e serve de exemplo na tela de venda.
insert into public.licencas_modulo(user_id,modulo,status,origem,observacoes)
select p.user_id,m.modulo,'ativa','cortesia','Conta Mestre'
from public.proprietarios p
cross join (values ('alugueis'),('minha_casa'),('vitrine')) as m(modulo)
where public.e_administrador_plataforma(p.user_id)
on conflict (user_id,modulo) do nothing;

-- ------------------------------------------------------------
-- 4. SEGURANCA DA TABELA
-- O cliente le a propria licenca; so a conta Mestre escreve.
-- ------------------------------------------------------------

alter table public.licencas_modulo enable row level security;
alter table public.licencas_modulo force row level security;

drop policy if exists licencas_modulo_leitura on public.licencas_modulo;
create policy licencas_modulo_leitura
on public.licencas_modulo
for select
to authenticated
using (
  user_id = public.usuario_proprietario_id(auth.uid())
  or public.e_administrador_plataforma(auth.uid())
);

drop policy if exists licencas_modulo_admin on public.licencas_modulo;
create policy licencas_modulo_admin
on public.licencas_modulo
for all
to authenticated
using (public.e_administrador_plataforma(auth.uid()))
with check (public.e_administrador_plataforma(auth.uid()));

revoke all on table public.licencas_modulo from public,anon;
grant select on table public.licencas_modulo to authenticated;

-- ------------------------------------------------------------
-- 5. VENDA E CANCELAMENTO DE MODULO (area Comercial)
-- ------------------------------------------------------------

create or replace function public.definir_licenca_modulo(
  p_user_id   uuid,
  p_modulo    text,
  p_status    text default 'ativa',
  p_expira_em date default null,
  p_valor     numeric default 0,
  p_origem    text default 'venda'
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_admin uuid := auth.uid();
begin
  if not public.e_administrador_plataforma(v_admin) then
    raise exception 'Somente a conta Mestre pode conceder modulos.';
  end if;

  if p_modulo not in ('alugueis','minha_casa','vitrine') then
    raise exception 'Modulo desconhecido: %', p_modulo;
  end if;

  if p_status not in ('ativa','suspensa','cancelada','avaliacao') then
    raise exception 'Situacao invalida: %', p_status;
  end if;

  if not exists(select 1 from public.proprietarios where user_id = p_user_id) then
    raise exception 'Esta conta nao e de um proprietario.';
  end if;

  insert into public.licencas_modulo(
    user_id,modulo,status,expira_em,valor_pago,origem,criado_por
  )
  values(
    p_user_id,p_modulo,p_status,p_expira_em,
    coalesce(p_valor,0),coalesce(p_origem,'venda'),v_admin
  )
  on conflict (user_id,modulo) do update
  set status        = excluded.status,
      expira_em     = excluded.expira_em,
      valor_pago    = excluded.valor_pago,
      origem        = excluded.origem,
      atualizado_em = now(),
      criado_por    = excluded.criado_por;

  return public.modulos_da_conta(p_user_id);
end
$$;

revoke all on function
  public.definir_licenca_modulo(uuid,text,text,date,numeric,text)
  from public,anon;
grant execute on function
  public.definir_licenca_modulo(uuid,text,text,date,numeric,text)
  to authenticated;

-- Lista as licencas para a tabela de clientes da area Comercial.
create or replace function public.listar_licencas_modulo()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select case
    when not public.e_administrador_plataforma(auth.uid()) then '[]'::jsonb
    else coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'userId',    l.user_id,
          'modulo',    l.modulo,
          'status',    l.status,
          'expiraEm',  l.expira_em,
          'valorPago', l.valor_pago,
          'origem',    l.origem,
          'ativadaEm', l.ativada_em
        ) order by l.user_id, l.modulo)
        from public.licencas_modulo l
      ),
      '[]'::jsonb
    )
  end
$$;

revoke all on function public.listar_licencas_modulo() from public,anon;
grant execute on function public.listar_licencas_modulo() to authenticated;

-- ------------------------------------------------------------
-- 6. O LOGIN PASSA A DEVOLVER OS MODULOS
--
-- Mesma funcao de sempre, com uma chave a mais no final. Nada
-- do que ja existia foi removido ou renomeado, entao telas que
-- ainda nao conhecem 'modulos' continuam funcionando igual.
-- ------------------------------------------------------------

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
    'termosAceitos',exists(select 1 from public.aceites_termos t where t.user_id=s.owner_id and t.versao='1.0'),
    'modulos',public.modulos_da_conta(s.uid)
  )
  from (select auth.uid() uid,public.usuario_proprietario_id(auth.uid()) owner_id) s
  left join public.proprietarios p on p.user_id=s.owner_id
  left join public.assinaturas a on a.user_id=s.owner_id
$$;

revoke all on function public.acesso_comercial_atual() from public,anon;
grant execute on function public.acesso_comercial_atual() to authenticated;

-- ------------------------------------------------------------
-- 7. CONFERENCIA
-- Os dois numeros abaixo tem que bater. Se nao baterem, alguma
-- conta ficaria sem o modulo Alugueis e perderia acesso.
-- ------------------------------------------------------------

do $$
declare
  v_assinaturas integer;
  v_licencas    integer;
begin
  select count(*) into v_assinaturas
  from public.assinaturas a
  join public.proprietarios p on p.user_id = a.user_id
  where a.status = 'ativa';

  select count(*) into v_licencas
  from public.licencas_modulo
  where modulo = 'alugueis' and status = 'ativa';

  raise notice 'Assinaturas ativas: %  |  Licencas de Alugueis: %',
    v_assinaturas, v_licencas;

  if v_licencas < v_assinaturas then
    raise exception
      'MIGRACAO INCOMPLETA: % assinaturas ativas mas so % licencas. Nada foi perdido, mas revise antes de publicar o app.',
      v_assinaturas, v_licencas;
  end if;

  raise notice 'Fase A concluida. O aplicativo continua funcionando como antes.';
end
$$;
