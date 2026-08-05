-- ============================================================
-- migracao-manutencoes.sql
-- Gestão Completa de Manutenções (Parte 3, §14).
--
-- Expande a tabela `chamados` que JÁ EXISTE (migracao-vistoria-e-chamados)
-- em vez de criar uma estrutura paralela. Nenhum chamado antigo é
-- perdido nem alterado: todas as colunas novas entram com default.
--
-- Situações passam de 5 para 6 + a legada. 'resolvido' e 'cancelado'
-- continuam sendo os valores gravados (a interface os chama de
-- "Concluída" e "Cancelada"), então nenhuma linha antiga precisa ser
-- reescrita. 'aguardando_peca' segue aceito para não invalidar o que já
-- existe, mas não é mais oferecido como opção nova.
--
-- Segura, transacional e REEXECUTÁVEL.
-- ⚠️ NÃO aplicar em produção sem autorização do responsável.
-- ============================================================
begin;

-- ------------------------------------------------------------
-- 1. Campos da gestão completa
-- ------------------------------------------------------------
alter table public.chamados
  add column if not exists prazo               date,
  add column if not exists responsavel         text not null default '',
  add column if not exists fornecedor          text not null default '',
  add column if not exists orcamento           numeric(12,2),
  add column if not exists custo_final         numeric(12,2),
  add column if not exists quem_paga           text not null default 'proprietario',
  add column if not exists observacoes         text not null default '',
  add column if not exists motivo_encerramento text not null default '',
  add column if not exists encerrado_em        timestamptz,
  add column if not exists arquivado_em        timestamptz,
  -- Histórico de alterações: lista append-only de {em, quem, texto}.
  add column if not exists historico           jsonb not null default '[]'::jsonb;

alter table public.chamados
  drop constraint if exists chamados_quem_paga_check;
alter table public.chamados
  add constraint chamados_quem_paga_check
  check (quem_paga in ('proprietario','inquilino','dividido','outro'));

-- Valores nunca negativos.
alter table public.chamados
  drop constraint if exists chamados_valores_check;
alter table public.chamados
  add constraint chamados_valores_check
  check ((orcamento is null or orcamento >= 0)
     and (custo_final is null or custo_final >= 0));

-- ------------------------------------------------------------
-- 2. Situações: 6 canônicas + a legada
-- ------------------------------------------------------------
alter table public.chamados
  drop constraint if exists chamados_status_check;
alter table public.chamados
  add constraint chamados_status_check
  check (status in ('aberto','aguardando_orcamento','aprovado','em_andamento',
                    'resolvido','cancelado',
                    -- legado: linhas antigas continuam válidas
                    'aguardando_peca'));

-- ------------------------------------------------------------
-- 3. Fotos antes/depois e comprovantes do chamado
-- Reaproveita a tabela `fotos`, que já tem RLS e já é limpa junto
-- com o imóvel. Uma foto sem chamado_id continua sendo foto do imóvel,
-- exatamente como hoje.
-- ------------------------------------------------------------
alter table public.fotos
  add column if not exists chamado_id uuid references public.chamados(id) on delete cascade,
  add column if not exists momento    text;

alter table public.fotos
  drop constraint if exists fotos_momento_check;
alter table public.fotos
  add constraint fotos_momento_check
  check (momento is null or momento in ('antes','depois'));

create index if not exists fotos_chamado_idx on public.fotos(chamado_id);
create index if not exists chamados_status_idx on public.chamados(status);
create index if not exists chamados_arquivado_idx on public.chamados(arquivado_em);

commit;
