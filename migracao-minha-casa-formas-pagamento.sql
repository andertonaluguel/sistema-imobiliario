-- ============================================================
-- migracao-minha-casa-formas-pagamento.sql
-- Quais FORMAS DE PAGAMENTO ficam disponíveis nos NOVOS lançamentos.
--
-- Guarda somente a lista de formas DESATIVADAS. Isso é de propósito:
-- desativar não apaga código nem dado. Um lançamento antigo feito no
-- Boleto continua mostrando Boleto mesmo que o Boleto seja desligado
-- hoje, e volta a aparecer para todos se ele for reativado.
--
-- Escopo: a configuração é OPERACIONAL, então vale para a família
-- inteira (conta e colaboradores), não por usuário.
--
-- Segura, transacional e REEXECUTÁVEL.
-- ⚠️ NÃO aplicar em produção sem autorização do responsável.
-- ============================================================
begin;

-- Depende das funções de acesso já existentes na Minha Casa.
do $$
begin
  if to_regprocedure('public.minha_casa_familia_atual_id()') is null
     or to_regprocedure('public.tem_modulo(text,uuid)') is null then
    raise exception
      'Funcoes de acesso da Minha Casa nao encontradas. Rode migracao-minha-casa.sql e migracao-modulos.sql primeiro.';
  end if;
end
$$;

create table if not exists public.minha_casa_preferencias (
  familia_id                 uuid primary key default public.minha_casa_familia_atual_id(),
  formas_pagamento_inativas  text[] not null default '{}',
  atualizado_em              timestamptz not null default now()
);

-- Só as seis formas que o produto conhece podem ser desativadas.
alter table public.minha_casa_preferencias
  drop constraint if exists minha_casa_preferencias_formas_check;
alter table public.minha_casa_preferencias
  add constraint minha_casa_preferencias_formas_check
  check (formas_pagamento_inativas <@ array['dinheiro','pix','debito','credito','boleto','transferencia']::text[]);

-- Trava de consistência: nunca é possível desligar todas. Sem pelo menos
-- uma forma ativa, a tela de lançamento fica sem opção nenhuma.
alter table public.minha_casa_preferencias
  drop constraint if exists minha_casa_preferencias_sobra_uma;
alter table public.minha_casa_preferencias
  add constraint minha_casa_preferencias_sobra_uma
  check (array_length(formas_pagamento_inativas,1) is null
         or array_length(formas_pagamento_inativas,1) < 6);

alter table public.minha_casa_preferencias enable row level security;
alter table public.minha_casa_preferencias force row level security;

drop policy if exists minha_casa_preferencias_familia on public.minha_casa_preferencias;
create policy minha_casa_preferencias_familia on public.minha_casa_preferencias
  for all to authenticated
  using ((public.tem_modulo('minha_casa', auth.uid())
          and familia_id = public.minha_casa_familia_atual_id()))
  with check ((public.tem_modulo('minha_casa', auth.uid())
          and familia_id = public.minha_casa_familia_atual_id()));

revoke all on table public.minha_casa_preferencias from public, anon;
grant select, insert, update on public.minha_casa_preferencias to authenticated;

-- ------------------------------------------------------------
-- Leitura e gravação. O cliente nunca precisa saber o familia_id:
-- as funções resolvem sozinhas, como o resto da Minha Casa.
-- ------------------------------------------------------------
create or replace function public.minha_casa_formas_pagamento()
returns text[]
language sql
stable
as $$
  select coalesce(
    (select formas_pagamento_inativas
       from public.minha_casa_preferencias
      where familia_id = public.minha_casa_familia_atual_id()),
    '{}'::text[]
  );
$$;

create or replace function public.minha_casa_salvar_formas_pagamento(p_inativas text[])
returns text[]
language plpgsql
as $$
declare
  v_familia uuid := public.minha_casa_familia_atual_id();
  v_lista   text[] := coalesce(p_inativas,'{}'::text[]);
begin
  if v_familia is null then
    raise exception 'Familia da Minha Casa nao encontrada para este usuario.';
  end if;
  if array_length(v_lista,1) is not null and array_length(v_lista,1) >= 6 then
    raise exception 'Pelo menos uma forma de pagamento precisa continuar ativa.';
  end if;

  insert into public.minha_casa_preferencias(familia_id, formas_pagamento_inativas, atualizado_em)
       values (v_familia, v_lista, now())
  on conflict (familia_id)
    do update set formas_pagamento_inativas = excluded.formas_pagamento_inativas,
                  atualizado_em = now();

  return v_lista;
end
$$;

revoke all on function public.minha_casa_formas_pagamento() from public, anon;
revoke all on function public.minha_casa_salvar_formas_pagamento(text[]) from public, anon;
grant execute on function public.minha_casa_formas_pagamento() to authenticated;
grant execute on function public.minha_casa_salvar_formas_pagamento(text[]) to authenticated;

commit;
