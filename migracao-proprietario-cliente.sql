-- ============================================================
-- migracao-proprietario-cliente.sql
-- O dono do imóvel que a corretora administra ganha cadastro próprio.
--
-- Por que uma tabela nova, e não `vitrine_anunciantes`:
--   O anunciante existe desde a Vitrine e serve ao catálogo público. Mas
--   ele é governado por `vitrine_pode_operar()`, que exige o módulo
--   Vitrine. Se `imoveis.proprietario_cliente_id` apontasse para lá, uma
--   conta que tem Aluguéis e NÃO tem Vitrine perderia acesso ao próprio
--   cadastro de proprietários. A tabela nova é governada pelo eixo certo:
--   quem lê a conta lê, quem opera imóveis escreve.
--
--   Os anunciantes que já existem são copiados para cá e os dois ficam
--   ligados, então a Vitrine continua funcionando sem uma linha alterada.
--
-- O que este arquivo cria:
--   1) public.proprietarios_clientes — o cadastro, com dados de repasse.
--   2) imoveis.proprietario_cliente_id — de quem é esta casa.
--   3) vitrine_anunciantes.proprietario_cliente_id — a ponte com a Vitrine.
--   4) vitrine_imoveis.imovel_id — qual imóvel da gestão gerou o anúncio.
--   5) vitrine_leads.interessado_id — o contato do site virou interessado.
--
-- ⚠️ DEPOIS deste arquivo, rode de novo `migracao-backup-v7.sql`: a coluna
-- nova em `imoveis` precisa entrar na restauração, senão ela some a cada
-- backup restaurado. É a regra escrita no cabeçalho daquele arquivo.
--
-- Segura, transacional e REEXECUTÁVEL. Não apaga nada.
-- ⚠️ NÃO aplicar em produção sem autorização do responsável.
-- ============================================================
begin;

do $$
begin
  if to_regprocedure('public.pode_operar_imoveis(uuid,uuid)') is null then
    raise exception 'Rode antes o arquivo migracao-financeiro-v2.sql.';
  end if;
end
$$;

-- ------------------------------------------------------------
-- 1. O cadastro
--
-- O default de user_id resolve o PROPRIETÁRIO da conta, nunca quem está
-- logado: com `auth.uid()` o colaborador gravaria uma linha que o dono não
-- enxerga. Foi exatamente esse o defeito da Vitrine, corrigido em
-- migracao-vitrine-equipe.sql. Não repetir.
-- ------------------------------------------------------------
create table if not exists public.proprietarios_clientes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default public.usuario_proprietario_id(auth.uid())
              references auth.users(id) on delete cascade,
  nome        text not null,
  telefone    text not null default '',
  email       text not null default '',
  documento   text not null default '',
  -- Para onde vai o repasse. Guardado como texto porque o app não move
  -- dinheiro: ele só mostra à pessoa para onde transferir.
  pix_chave   text not null default '',
  banco       text not null default '',
  agencia     text not null default '',
  conta       text not null default '',
  -- Quanto a corretora retém do aluguel recebido, em porcento.
  taxa_administracao numeric(5,2) not null default 0
              check (taxa_administracao >= 0 and taxa_administracao <= 100),
  observacoes text not null default '',
  arquivado_em        timestamptz,
  arquivado_por       uuid,
  motivo_arquivamento text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint proprietario_cliente_nome_check
    check (char_length(trim(nome)) between 1 and 160)
);

create index if not exists proprietarios_clientes_conta_idx
  on public.proprietarios_clientes(user_id, arquivado_em, nome);

alter table public.proprietarios_clientes enable row level security;
alter table public.proprietarios_clientes force row level security;

-- Leitura: qualquer papel que já lê a conta. Escrita: quem opera imóveis.
-- Sem isso, o papel "financeiro" poderia alterar o cadastro do dono, o que
-- contraria a divisão que o resto do app já aplica.
drop policy if exists proprietarios_clientes_ler on public.proprietarios_clientes;
create policy proprietarios_clientes_ler on public.proprietarios_clientes
  for select to authenticated
  using (public.pode_ler_conta(user_id, auth.uid()));

drop policy if exists proprietarios_clientes_escrever on public.proprietarios_clientes;
create policy proprietarios_clientes_escrever on public.proprietarios_clientes
  for all to authenticated
  using (
    user_id = public.usuario_proprietario_id(auth.uid())
    and public.pode_operar_imoveis(user_id, auth.uid())
  )
  with check (
    user_id = public.usuario_proprietario_id(auth.uid())
    and public.pode_operar_imoveis(user_id, auth.uid())
  );

revoke all on table public.proprietarios_clientes from public, anon;
grant select, insert, update, delete on table public.proprietarios_clientes to authenticated;

-- ------------------------------------------------------------
-- 2. De quem é cada casa
--
-- `on delete set null` de propósito: apagar o cadastro do dono não pode
-- levar junto o imóvel, o contrato e o histórico financeiro dele.
-- ------------------------------------------------------------
alter table public.imoveis
  add column if not exists proprietario_cliente_id uuid
  references public.proprietarios_clientes(id) on delete set null;

create index if not exists imoveis_proprietario_cliente_idx
  on public.imoveis(user_id, proprietario_cliente_id);

-- ------------------------------------------------------------
-- 3. A ponte com o anunciante da Vitrine
--
-- Só se a Vitrine existir neste banco. Quem não tem o módulo pula.
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.vitrine_anunciantes') is null then
    raise notice 'Vitrine ausente neste banco: a ponte com anunciantes foi pulada.';
    return;
  end if;

  alter table public.vitrine_anunciantes
    add column if not exists proprietario_cliente_id uuid
    references public.proprietarios_clientes(id) on delete set null;

  -- Copia cada anunciante para o cadastro novo, uma vez. Reexecutável: um
  -- anunciante que já tem vínculo não entra de novo.
  insert into public.proprietarios_clientes(
    user_id,nome,telefone,email,documento,observacoes
  )
  select a.user_id,a.nome,coalesce(a.telefone,''),coalesce(a.email,''),
         coalesce(a.documento,''),coalesce(a.observacoes,'')
    from public.vitrine_anunciantes a
   where a.proprietario_cliente_id is null;

  -- Liga cada anunciante ao cadastro recém-criado, casando por conta e
  -- nome. O nome é único o bastante dentro de uma corretora pequena; em
  -- caso de homônimo, os dois apontam para o mesmo cadastro, que é o
  -- comportamento desejado.
  update public.vitrine_anunciantes a
     set proprietario_cliente_id = p.id,
         updated_at = now()
    from public.proprietarios_clientes p
   where a.proprietario_cliente_id is null
     and p.user_id = a.user_id
     and lower(trim(p.nome)) = lower(trim(a.nome));

  -- ----------------------------------------------------------
  -- 4. Qual imóvel da gestão gerou o anúncio
  --
  -- `set null`, nunca `cascade`: a restauração de backup APAGA e reinsere
  -- public.imoveis. Com cascade, restaurar um backup levaria a Vitrine
  -- inteira junto.
  -- ----------------------------------------------------------
  alter table public.vitrine_imoveis
    add column if not exists imovel_id uuid
    references public.imoveis(id) on delete set null;

  -- Um imóvel da gestão gera no máximo um anúncio. O índice parcial deixa
  -- livres os anúncios de terceiros, que não têm imovel_id.
  create unique index if not exists vitrine_imoveis_origem_unica
    on public.vitrine_imoveis(user_id, imovel_id)
    where imovel_id is not null;

  -- ----------------------------------------------------------
  -- 5. O contato do site virou interessado
  -- ----------------------------------------------------------
  alter table public.vitrine_leads
    add column if not exists interessado_id uuid
    references public.interessados(id) on delete set null;
end
$$;

-- ------------------------------------------------------------
-- 6. Conferência
-- ------------------------------------------------------------
do $$
declare
  v_clientes integer;
  v_ligados  integer := 0;
begin
  select count(*) into v_clientes from public.proprietarios_clientes;
  if to_regclass('public.vitrine_anunciantes') is not null then
    select count(*) into v_ligados
      from public.vitrine_anunciantes where proprietario_cliente_id is not null;
  end if;
  raise notice 'Proprietarios-clientes cadastrados: %', v_clientes;
  raise notice 'Anunciantes da Vitrine ligados a um cadastro: %', v_ligados;
  raise notice 'Lembre-se de rodar migracao-backup-v7.sql de novo.';

  if to_regprocedure('public.registrar_migracao(text,text)') is not null then
    perform public.registrar_migracao('migracao-proprietario-cliente.sql','');
  end if;
end
$$;

commit;
