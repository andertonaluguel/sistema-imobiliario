-- ============================================================
-- migracao-vitrine-foto-responsavel.sql
-- Foto ou logo de quem responde pelo imóvel.
--
-- O card do responsável mostrava as iniciais do nome num círculo. Para
-- proprietário pessoa física isso basta; para imobiliária e corretor
-- não: a marca é parte do que eles vendem, e quem procura imóvel
-- reconhece a placa antes do nome.
--
-- Duas decisões que ficam gravadas aqui:
--
--   O CAMINHO, NÃO A IMAGEM. A coluna guarda o caminho no bucket
--   privado — o mesmo de fotos e da logo da Vitrine. A imagem sai pela
--   função og-foto, que assina a URL. Nada de base64 na linha nem
--   bucket público.
--
--   SEM RPC NOVA. A policy `vitrine_dono` já deixa o dono da conta
--   escrever em vitrine_anunciantes. Criar uma função só para gravar
--   um texto seria cerimônia sem ganho — diferente do visto, que
--   precisa de RPC porque o dono NÃO pode acender o próprio selo.
--
-- Segura, transacional e REEXECUTÁVEL.
-- ⚠️ NÃO aplicar em produção sem autorização do responsável.
-- ============================================================
begin;

do $$
begin
  if to_regclass('public.vitrine_anunciantes') is null then
    raise exception 'Rode antes o arquivo migracao-vitrine.sql.';
  end if;
  if to_regprocedure('public.listar_vitrine_publica_v4(text)') is null then
    raise exception 'Rode antes o arquivo migracao-vitrine-responsavel.sql.';
  end if;
end
$$;

alter table public.vitrine_anunciantes
  add column if not exists foto_path text not null default '';

-- ------------------------------------------------------------
-- A v5 leva o caminho da foto ao site
--
-- Mesmo molde das anteriores: chama a v4 e acrescenta. O cliente monta
-- a URL a partir do caminho, como já faz com a logo da corretora.
-- ------------------------------------------------------------
create or replace function public.listar_vitrine_publica_v5(p_slug text) returns jsonb
language sql stable security definer set search_path=public
as $$
  with base as (select public.listar_vitrine_publica_v4(p_slug) dados),
  dono as (select user_id from public.proprietarios where slug_publico=p_slug limit 1),
  comfoto as (
    select coalesce(jsonb_object_agg(k, v || jsonb_build_object(
      'fotoPath', coalesce((select an.foto_path from public.vitrine_anunciantes an
                            where an.id::text = k), '')
    )), '{}'::jsonb) dados
    from base, jsonb_each(coalesce(base.dados->'responsaveis','{}'::jsonb)) e(k,v)
  )
  select case
           when comfoto.dados = '{}'::jsonb then base.dados
           else jsonb_set(base.dados,'{responsaveis}',comfoto.dados,true)
         end
  from base, comfoto
$$;

revoke all on function public.listar_vitrine_publica_v5(text) from public;
grant execute on function public.listar_vitrine_publica_v5(text) to anon,authenticated;

do $$
begin
  if to_regprocedure('public.registrar_migracao(text,text)') is not null then
    perform public.registrar_migracao('migracao-vitrine-foto-responsavel.sql',
      'Foto ou logo do responsavel pelo imovel no card do anuncio');
  end if;
end $$;

commit;
