-- ============================================================
-- migracao-vitrine-chacara.sql
-- Chácara entra como tipo próprio de imóvel na Vitrine.
--
-- Por que não bastava usar "terreno":
--   Terreno e chácara não são a mesma coisa. Terreno é lote — pode ser
--   urbano, na cidade, para construir ou revender. Chácara é rural e
--   costuma ter casa, poço, pomar: tem cômodo para descrever, e o
--   anúncio de terreno esconde justamente esses campos.
--
--   Cadastrar chácara como terreno fazia o anúncio omitir quartos e
--   banheiros, e quem procura terreno urbano recebia chácara no meio.
--
-- A categoria "Terreno e chácara" da vitrine agrupa os dois na busca —
-- quem procura área costuma olhar as duas. Agrupar na BUSCA e separar
-- no CADASTRO é o que deixa a ficha correta sem picotar o filtro.
--
-- Segura, transacional e REEXECUTÁVEL.
-- ⚠️ NÃO aplicar em produção sem autorização do responsável.
-- ============================================================
begin;

do $$
begin
  if to_regclass('public.vitrine_imoveis') is null then
    raise exception 'Rode antes o arquivo migracao-vitrine.sql.';
  end if;
end
$$;

-- A restrição é recriada com o valor novo. Nenhuma linha muda de tipo:
-- só passa a ser possível gravar 'chacara'.
alter table public.vitrine_imoveis
  drop constraint if exists vitrine_imovel_tipo_check;

alter table public.vitrine_imoveis
  add constraint vitrine_imovel_tipo_check
  check (tipo = any (array['casa','apartamento','kitnet','sobrado',
                           'comercial','terreno','chacara']::text[]));

do $$
begin
  if to_regprocedure('public.registrar_migracao(text,text)') is not null then
    perform public.registrar_migracao('migracao-vitrine-chacara.sql',
      'Chacara como tipo proprio de imovel na Vitrine');
  end if;
end $$;

commit;
