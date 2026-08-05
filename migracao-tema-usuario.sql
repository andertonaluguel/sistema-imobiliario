-- ============================================================
-- migracao-tema-usuario.sql
-- Preferência de TEMA POR USUÁRIO (cada colaborador tem a sua).
-- Segura, transacional e REEXECUTÁVEL. Protegida por RLS: cada
-- usuário só enxerga e altera a própria linha.
--
-- Contexto: o tema da conta (tabela `configuracoes.tema`) continua
-- servindo ao Portal do Inquilino. Esta tabela é só a preferência
-- pessoal de cada usuário dentro do app.
--
-- ⚠️ NÃO aplicar em produção sem autorização do responsável.
-- ============================================================
begin;

create table if not exists public.preferencias_usuario (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  tema          text not null default 'original',
  atualizado_em timestamptz not null default now()
);

-- Só os dois temas oferecidos hoje. Reexecutável: derruba e recria.
alter table public.preferencias_usuario
  drop constraint if exists preferencias_usuario_tema_check;
alter table public.preferencias_usuario
  add constraint preferencias_usuario_tema_check check (tema in ('original','roxo'));

alter table public.preferencias_usuario enable row level security;
alter table public.preferencias_usuario force row level security;

drop policy if exists preferencias_usuario_sel on public.preferencias_usuario;
create policy preferencias_usuario_sel on public.preferencias_usuario
  for select using (user_id = auth.uid());

drop policy if exists preferencias_usuario_ins on public.preferencias_usuario;
create policy preferencias_usuario_ins on public.preferencias_usuario
  for insert with check (user_id = auth.uid());

drop policy if exists preferencias_usuario_upd on public.preferencias_usuario;
create policy preferencias_usuario_upd on public.preferencias_usuario
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.preferencias_usuario to authenticated;

commit;
