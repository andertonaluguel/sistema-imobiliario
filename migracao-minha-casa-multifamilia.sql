-- ============================================================
-- FASE B — MINHA CASA VIRA PRODUTO VENDAVEL
--
-- Hoje o modulo esta preso de duas formas:
--   1) e_mestre() compara o e-mail com dois enderecos fixos
--      escritos dentro do banco  (migracao-minha-casa.sql:39)
--   2) todas as funcoes resolvem para UMA familia fixa,
--      codigo='familia-anderton'
--
-- Esta migracao troca as duas travas por licenca de modulo e da
-- a cada conta a propria familia.
--
-- SOBRE OS SEUS DADOS: a familia 'familia-anderton' NAO e
-- apagada nem recriada. Ela apenas passa a ter um dono definido
-- (voce). Lancamentos, membros, categorias e contas fixas ficam
-- exatamente onde estao.
--
-- Rode DEPOIS de migracao-modulos.sql. Reexecutavel.
-- ============================================================

-- Garante que a fase A ja rodou.
do $$
begin
  if to_regclass('public.licencas_modulo') is null then
    raise exception
      'Rode antes o arquivo migracao-modulos.sql (fase A).';
  end if;
end
$$;

-- ------------------------------------------------------------
-- 1. CADA FAMILIA PASSA A TER UM DONO
-- ------------------------------------------------------------

alter table public.minha_casa_familias
  add column if not exists proprietario_id uuid
  references public.proprietarios(user_id) on delete cascade;

-- A familia que ja existe passa a ser sua. Sem isso, seus dados
-- ficariam orfaos e invisiveis depois da troca do resolvedor.
update public.minha_casa_familias f
set proprietario_id = (
      select u.id
      from auth.users u
      where lower(u.email) = 'andertonaluguel@gmail.com'
      order by u.created_at
      limit 1
    ),
    updated_at = now()
where f.codigo = 'familia-anderton'
  and f.proprietario_id is null;

-- Rede de seguranca: se por algum motivo o e-mail acima nao
-- existir, adota o primeiro administrador de plataforma.
update public.minha_casa_familias f
set proprietario_id = (
      select a.user_id
      from public.administradores_plataforma a
      join public.proprietarios p on p.user_id = a.user_id
      order by a.user_id
      limit 1
    ),
    updated_at = now()
where f.codigo = 'familia-anderton'
  and f.proprietario_id is null;

do $$
declare
  v_orfas integer;
begin
  select count(*) into v_orfas
  from public.minha_casa_familias
  where proprietario_id is null;

  if v_orfas > 0 then
    raise exception
      'PARE: % familia(s) sem dono. Seus dados de Minha Casa ficariam inacessiveis. Nada foi alterado de forma destrutiva - confira a tabela minha_casa_familias antes de continuar.',
      v_orfas;
  end if;
end
$$;

-- Uma familia por conta.
create unique index if not exists minha_casa_familias_proprietario_idx
  on public.minha_casa_familias(proprietario_id);

-- ------------------------------------------------------------
-- 2. O RESOLVEDOR DEIXA DE APONTAR PARA UMA FAMILIA FIXA
--
-- Antes: "se voce e o Anderton, use a familia-anderton"
-- Agora: "use a familia desta conta, se ela tiver o modulo"
--
-- usuario_proprietario_id() faz o funcionario cair na familia do
-- patrao, igual ao resto do aplicativo.
-- ------------------------------------------------------------

create or replace function public.minha_casa_familia_atual_id()
returns uuid
language sql
stable
security definer
set search_path=public
as $$
  select case
    when public.tem_modulo('minha_casa', auth.uid()) then (
      select f.id
      from public.minha_casa_familias f
      where f.proprietario_id = public.usuario_proprietario_id(auth.uid())
      limit 1
    )
    else null::uuid
  end
$$;

revoke all on function public.minha_casa_familia_atual_id() from public,anon;
grant execute on function public.minha_casa_familia_atual_id() to authenticated;

-- ------------------------------------------------------------
-- 3. A TRAVA DE E-MAIL VIRA TRAVA DE LICENCA
--
-- e_mestre() continua existindo e continua guardando a area
-- Comercial, que nunca e vendida. O que muda e o Minha Casa
-- deixar de perguntar "voce e o Anderton?" e passar a perguntar
-- "esta conta comprou o modulo?".
-- ------------------------------------------------------------

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
    raise exception 'Faca login para acessar Minha Casa.';
  end if;

  if not public.tem_modulo('minha_casa', auth.uid()) then
    raise exception 'Esta conta nao possui o modulo Minha Casa.';
  end if;

  select f.id into v_familia_id
  from public.minha_casa_familias f
  where f.proprietario_id = public.usuario_proprietario_id(auth.uid())
  limit 1;

  if v_familia_id is null then
    raise exception 'Familia Minha Casa nao inicializada.';
  end if;

  return v_familia_id;
end
$$;

revoke all on function public.minha_casa_exigir_mestre()
  from public,anon,authenticated;

-- ------------------------------------------------------------
-- 4. CRIAR A FAMILIA DE UMA CONTA NOVA
--
-- Quando um cliente compra o modulo, ele precisa de familia,
-- membros e categorias proprios - as mesmas categorias padrao
-- que voce ja usa, sem os nomes da sua familia.
-- ------------------------------------------------------------

create or replace function public.minha_casa_criar_familia(
  p_nome text default 'Minha Casa'
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_owner   uuid := public.usuario_proprietario_id(auth.uid());
  v_familia uuid;
  v_codigo  text;
begin
  if v_owner is null then
    raise exception 'Faca login para acessar Minha Casa.';
  end if;

  if not public.tem_modulo('minha_casa', auth.uid()) then
    raise exception 'Esta conta nao possui o modulo Minha Casa.';
  end if;

  select id into v_familia
  from public.minha_casa_familias
  where proprietario_id = v_owner;

  if v_familia is not null then
    return v_familia;
  end if;

  -- Codigo unico e previsivel, dentro do formato aceito pela
  -- restricao existente: ^[a-z0-9-]{3,60}$
  v_codigo := 'familia-' || replace(v_owner::text,'-','');

  insert into public.minha_casa_familias(codigo,nome,proprietario_id)
  values(v_codigo, coalesce(nullif(trim(p_nome),''),'Minha Casa'), v_owner)
  returning id into v_familia;

  insert into public.minha_casa_configuracoes(familia_id)
  values(v_familia)
  on conflict(familia_id) do nothing;

  insert into public.minha_casa_membros(
    familia_id,slug,nome,emoji,cor,ativo,ordem
  )
  select v_familia,v.slug,v.nome,v.emoji,v.cor,true,v.ordem
  from (values
    ('titular','Eu','🙂','#2563EB',10),
    ('casa-todos','Casa/Todos','🏠','#0F766E',20)
  ) as v(slug,nome,emoji,cor,ordem)
  on conflict do nothing;

  insert into public.minha_casa_categorias(
    familia_id,slug,nome,tipo,emoji,cor,ativo,ordem
  )
  select v_familia,v.slug,v.nome,v.tipo,v.emoji,v.cor,true,v.ordem
  from (values
    ('aluguel-recebido','Aluguéis recebidos','entrada','🏘️','#15803D',10),
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
  on conflict do nothing;

  return v_familia;
end
$$;

revoke all on function public.minha_casa_criar_familia(text) from public,anon;
grant execute on function public.minha_casa_criar_familia(text) to authenticated;

-- ------------------------------------------------------------
-- 5. AS POLITICAS DEIXAM DE OLHAR O E-MAIL
--
-- O isolamento entre familias continua sendo garantido por
-- minha_casa_familia_atual_id(), que so devolve a familia da
-- propria conta. A diferenca e que agora existem varias.
-- ------------------------------------------------------------

drop policy if exists minha_casa_so_mestre on public.minha_casa_familias;
create policy minha_casa_so_mestre
on public.minha_casa_familias
for all
to authenticated
using(
  public.tem_modulo('minha_casa', auth.uid())
  and id = public.minha_casa_familia_atual_id()
)
with check(
  public.tem_modulo('minha_casa', auth.uid())
  and id = public.minha_casa_familia_atual_id()
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
         public.tem_modulo(''minha_casa'', auth.uid())
         and familia_id = public.minha_casa_familia_atual_id()
       )
       with check (
         public.tem_modulo(''minha_casa'', auth.uid())
         and familia_id = public.minha_casa_familia_atual_id()
       )',
      v_tabela
    );
  end loop;
end
$$;

-- Continua valendo: o cliente so acessa por RPC, nunca direto.
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
-- 6. CONFERENCIA
-- ------------------------------------------------------------

do $$
declare
  v_familias    integer;
  v_lancamentos integer;
  v_membros     integer;
begin
  select count(*) into v_familias
  from public.minha_casa_familias
  where proprietario_id is not null;

  select count(*) into v_lancamentos from public.minha_casa_lancamentos;
  select count(*) into v_membros     from public.minha_casa_membros;

  raise notice 'Familias com dono: %  |  Lancamentos preservados: %  |  Membros: %',
    v_familias, v_lancamentos, v_membros;
  raise notice 'Fase B concluida. O modulo Minha Casa ja pode ser vendido.';
  raise notice 'TESTE OBRIGATORIO: entre com uma conta que NAO seja a sua e confirme que ela nao enxerga nada de Minha Casa.';
end
$$;
