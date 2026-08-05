-- ============================================================
-- migracao-controle-versao.sql
-- Saber, olhando o banco, quais migrações ele já recebeu.
--
-- O problema:
--   São 28 arquivos e nenhuma forma de perguntar ao banco o que já rodou.
--   A ordem vive em prosa, espalhada por três documentos, e o principal
--   deles já saiu do ar em relação ao código. Com um banco só dá para
--   conviver; no dia em que existir um segundo cliente, "esse banco já
--   recebeu qual arquivo?" não tem resposta — e o sintoma aparece como
--   comportamento estranho, não como erro.
--
-- A solução tem duas metades:
--   1) REGISTRO, daqui para a frente: uma tabela e uma função que cada
--      migração nova chama no fim, dizendo seu próprio nome.
--   2) DETECÇÃO, para trás: as 28 que já existem não têm como voltar no
--      tempo e se registrar, então a função de diagnóstico procura no
--      esquema a EVIDÊNCIA de cada uma — a tabela, a coluna ou a função
--      que só aquele arquivo cria.
--
-- Como usar depois de aplicar, no SQL Editor:
--     select * from public.diagnostico_migracoes();
--
-- Só quem é Mestre executa: a saída descreve o esquema inteiro.
--
-- Segura, transacional e REEXECUTÁVEL. Não altera nenhuma tabela de
-- negócio — só acrescenta o registro e a consulta.
-- ⚠️ NÃO aplicar em produção sem autorização do responsável.
-- ============================================================
begin;

do $$
begin
  if to_regprocedure('public.e_administrador_plataforma(uuid)') is null then
    raise exception 'Rode antes o arquivo migracao-tipos-acesso.sql.';
  end if;
end
$$;

-- ------------------------------------------------------------
-- 1. O registro
-- ------------------------------------------------------------
create table if not exists public.migracoes_aplicadas (
  arquivo     text primary key,
  aplicada_em timestamptz not null default now(),
  observacao  text not null default ''
);

comment on table public.migracoes_aplicadas is
  'Migrações que já rodaram neste banco. Preenchida por registrar_migracao(), '
  'chamada no fim de cada arquivo. Conferir com diagnostico_migracoes().';

alter table public.migracoes_aplicadas enable row level security;
alter table public.migracoes_aplicadas force row level security;

-- Só Mestre lê. Não há dado de cliente aqui, mas a lista descreve o
-- esquema e não interessa a mais ninguém.
drop policy if exists migracoes_mestre on public.migracoes_aplicadas;
create policy migracoes_mestre on public.migracoes_aplicadas
  for select to authenticated
  using (public.e_administrador_plataforma(auth.uid()));

revoke all on table public.migracoes_aplicadas from public, anon;
grant select on table public.migracoes_aplicadas to authenticated;

create or replace function public.registrar_migracao(
  p_arquivo text,
  p_observacao text default ''
)
returns void
language sql
security definer
set search_path=public
as $$
  insert into public.migracoes_aplicadas(arquivo,aplicada_em,observacao)
  values(trim(p_arquivo),now(),coalesce(p_observacao,''))
  on conflict(arquivo) do update
    set aplicada_em=now(),
        observacao=excluded.observacao;
$$;

revoke all on function public.registrar_migracao(text,text) from public,anon;

-- ------------------------------------------------------------
-- 2. A detecção
--
-- Cada linha diz: arquivo, que tipo de evidência procurar e onde.
--   tabela        -> alvo = nome da tabela
--   coluna        -> alvo = tabela, alvo2 = coluna
--   funcao        -> alvo = nome da função
--   corpo_funcao  -> alvo = nome da função, alvo2 = trecho do corpo
--
-- "corpo_funcao" existe por causa do backup: o arquivo é o mesmo de
-- sempre, mas a rotina mudou em 31/07/2026 para parar de apagar o tipo do
-- imóvel e o RG do inquilino. Só olhar se a função existe não distingue a
-- versão nova da antiga.
-- ------------------------------------------------------------
create or replace function public.diagnostico_migracoes()
returns table(
  ordem      integer,
  arquivo    text,
  evidencia  text,
  aplicada   boolean,
  registrada boolean,
  aplicada_em timestamptz
)
language plpgsql
security definer
set search_path=public
as $$
declare
  r record;
  v_ok boolean;
begin
  if not public.e_administrador_plataforma(auth.uid()) then
    raise exception 'Somente uma conta Mestre pode consultar o diagnostico das migracoes.';
  end if;

  for r in
    select * from (values
      ( 1,'schema.sql',                            'tabela','imoveis',null),
      ( 2,'migracao-portal-arquivos.sql',          'tabela','acessos_inquilino',null),
      ( 3,'migracao-energia.sql',                  'tabela','energia',null),
      ( 4,'migracao-bloco-B.sql',                  'tabela','aluguel_historico',null),
      ( 5,'migracao-comercial.sql',                'tabela','administradores_plataforma',null),
      ( 6,'migracao-contratos-cobrancas.sql',      'coluna','contratos','modalidade_vencimento'),
      ( 7,'migracao-descricao-temas.sql',          'coluna','interessados','precisa_cozinha'),
      ( 8,'migracao-energia-clientes.sql',         'coluna','imoveis','energia_ativa'),
      ( 9,'migracao-tipos-acesso.sql',             'funcao','usuario_proprietario_id',null),
      (10,'migracao-versao-comercial-v1.sql',      'tabela','acessos_colaborador',null),
      (11,'migracao-minha-casa.sql',               'tabela','minha_casa_familias',null),
      (12,'migracao-exclusao-contratos.sql',       'funcao','prever_exclusao_contrato',null),
      (13,'migracao-separacao-inquilinos-clientes.sql','funcao','conta_proprietaria_gratuita_vazia',null),
      (14,'migracao-modulos.sql',                  'tabela','licencas_modulo',null),
      (15,'migracao-minha-casa-multifamilia.sql',  'funcao','minha_casa_familia_atual_id',null),
      (16,'migracao-minha-casa-pagamentos.sql',    'coluna','minha_casa_lancamentos','compra_id'),
      (17,'migracao-vitrine.sql',                  'tabela','vitrine_imoveis',null),
      (18,'migracao-vistoria-e-chamados.sql',      'tabela','vistorias',null),
      (19,'migracao-financeiro-v2.sql',            'funcao','papel_colaborador_atual',null),
      (20,'migracao-backup-v7.sql',                'funcao','importar_backup_atomico_v7',null),
      (21,'migracao-minha-casa-orcamento.sql',     'tabela','minha_casa_orcamentos',null),
      (22,'migracao-tema-usuario.sql',             'tabela','preferencias_usuario',null),
      (23,'migracao-imovel-tipo.sql',              'coluna','imoveis','tipo'),
      (24,'migracao-inquilino-rg.sql',             'coluna','inquilinos','rg'),
      (25,'migracao-minha-casa-formas-pagamento.sql','tabela','minha_casa_preferencias',null),
      (26,'migracao-manutencoes.sql',              'coluna','chamados','prazo'),
      (27,'migracao-vitrine-corretora.sql',        'tabela','vitrine_cidades',null),
      (28,'migracao-vitrine-equipe.sql',           'funcao','vitrine_registrar_clique_whatsapp',null),
      (29,'migracao-vitrine-fotos.sql',            'coluna','vitrine_fotos','thumb_path'),
      (30,'migracao-backup-v7.sql (revisao 31/07/2026)','corpo_funcao','importar_backup_atomico_v7','tipo=excluded.tipo'),
      (31,'migracao-controle-versao.sql',          'tabela','migracoes_aplicadas',null),
      (32,'migracao-proprietario-cliente.sql',     'tabela','proprietarios_clientes',null),
      (33,'migracao-backup-v7.sql (proprietarios no backup)','corpo_funcao','importar_backup_atomico_v7','import_v7_owners')
    ) as t(ord, nome, tipo, alvo, alvo2)
    order by ord
  loop
    if r.tipo='tabela' then
      v_ok := to_regclass('public.'||r.alvo) is not null;
    elsif r.tipo='coluna' then
      v_ok := exists(
        select 1 from information_schema.columns c
        where c.table_schema='public' and c.table_name=r.alvo and c.column_name=r.alvo2
      );
    elsif r.tipo='funcao' then
      v_ok := exists(
        select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname=r.alvo
      );
    else
      v_ok := exists(
        select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname=r.alvo
          and p.prosrc like '%'||r.alvo2||'%'
      );
    end if;

    ordem       := r.ord;
    arquivo     := r.nome;
    evidencia   := r.tipo||' '||r.alvo||coalesce('.'||r.alvo2,'');
    aplicada    := v_ok;
    registrada  := exists(select 1 from public.migracoes_aplicadas m where m.arquivo=r.nome);
    aplicada_em := (select m.aplicada_em from public.migracoes_aplicadas m where m.arquivo=r.nome);
    return next;
  end loop;
end
$$;

revoke all on function public.diagnostico_migracoes() from public,anon;
grant execute on function public.diagnostico_migracoes() to authenticated;

-- ------------------------------------------------------------
-- 3. Registra retroativamente o que a evidência confirma
--
-- Sem inventar data: o "aplicada_em" destas fica como o momento em que
-- este arquivo rodou, e a observação diz que veio da detecção, não de um
-- registro feito na hora certa.
-- ------------------------------------------------------------
do $$
declare
  v_total integer := 0;
begin
  -- A propria funcao exige Mestre; aqui dentro rodamos a deteccao
  -- diretamente, para que este arquivo possa ser aplicado pelo SQL Editor
  -- (que roda como dono do banco, sem auth.uid()).
  if to_regclass('public.imoveis') is not null then
    insert into public.migracoes_aplicadas(arquivo,observacao)
    values('schema.sql','registrada pela deteccao de esquema')
    on conflict(arquivo) do nothing;
    v_total := v_total + 1;
  end if;

  insert into public.migracoes_aplicadas(arquivo,observacao)
  select x.nome,'registrada pela deteccao de esquema'
  from (values
    ('migracao-portal-arquivos.sql',          to_regclass('public.acessos_inquilino')),
    ('migracao-energia.sql',                  to_regclass('public.energia')),
    ('migracao-bloco-B.sql',                  to_regclass('public.aluguel_historico')),
    ('migracao-comercial.sql',                to_regclass('public.administradores_plataforma')),
    ('migracao-versao-comercial-v1.sql',      to_regclass('public.acessos_colaborador')),
    ('migracao-minha-casa.sql',               to_regclass('public.minha_casa_familias')),
    ('migracao-modulos.sql',                  to_regclass('public.licencas_modulo')),
    ('migracao-vitrine.sql',                  to_regclass('public.vitrine_imoveis')),
    ('migracao-vistoria-e-chamados.sql',      to_regclass('public.vistorias')),
    ('migracao-minha-casa-orcamento.sql',     to_regclass('public.minha_casa_orcamentos')),
    ('migracao-tema-usuario.sql',             to_regclass('public.preferencias_usuario')),
    ('migracao-minha-casa-formas-pagamento.sql', to_regclass('public.minha_casa_preferencias')),
    ('migracao-vitrine-corretora.sql',        to_regclass('public.vitrine_cidades')),
    ('migracao-controle-versao.sql',          to_regclass('public.migracoes_aplicadas')),
    ('migracao-proprietario-cliente.sql',     to_regclass('public.proprietarios_clientes'))
  ) as x(nome, achado)
  where x.achado is not null
  on conflict(arquivo) do nothing;

  raise notice 'Registro retroativo concluido. Confira com: select * from public.diagnostico_migracoes();';
end
$$;

-- ------------------------------------------------------------
-- 4. Conferência
-- ------------------------------------------------------------
do $$
declare
  v_registradas integer;
begin
  select count(*) into v_registradas from public.migracoes_aplicadas;
  raise notice 'Migracoes registradas neste banco: %', v_registradas;
end
$$;

commit;
