-- ============================================================
-- migracao-inquilino-rg.sql
-- Adiciona o "RG" do inquilino como campo próprio (a Etapa de cadastro
-- passa a separar CPF e RG). Segura, transacional e REEXECUTÁVEL.
-- Preserva todos os registros existentes (default vazio). A tabela
-- inquilinos já tem RLS; o RG é dado pessoal e fica protegido pelas
-- mesmas permissões do CPF na interface.
--
-- ⚠️ NÃO aplicar em produção sem autorização do responsável.
-- ============================================================
begin;

alter table public.inquilinos
  add column if not exists rg text not null default '';

commit;
