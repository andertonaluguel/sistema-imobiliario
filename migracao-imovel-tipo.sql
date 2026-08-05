-- ============================================================
-- migracao-imovel-tipo.sql
-- Adiciona o "tipo" do imóvel (Etapa 1 do cadastro em 3 etapas).
-- Segura, transacional e REEXECUTÁVEL. Preserva todos os registros
-- existentes (default 'casa'). A tabela imoveis já tem RLS.
--
-- ⚠️ NÃO aplicar em produção sem autorização do responsável.
-- ============================================================
begin;

alter table public.imoveis
  add column if not exists tipo text not null default 'casa';

-- Reexecutável: derruba e recria a checagem dos valores permitidos.
alter table public.imoveis
  drop constraint if exists imoveis_tipo_check;
alter table public.imoveis
  add constraint imoveis_tipo_check
  check (tipo in ('casa','apartamento','comercial','quarto','outro'));

commit;
