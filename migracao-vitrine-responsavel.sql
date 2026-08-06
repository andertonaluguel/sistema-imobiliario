-- ============================================================
-- migracao-vitrine-responsavel.sql
-- Quem responde pelo imóvel: etiqueta, estrelas e visto.
--
-- O que isto resolve:
--   O anúncio dizia "Responsável pelo anúncio" e mostrava sempre o
--   perfil DA CONTA — o mesmo texto em todos os imóveis. Numa corretora
--   que anuncia imóvel de terceiro isso é impreciso: quem responde por
--   aquele imóvel específico já está gravado em `vitrine_imoveis.
--   anunciante_id`, e a página nunca usou.
--
-- O que passa a existir:
--   1) `vitrine_anunciantes.tipo` — imobiliária, corretor ou proprietário.
--   2) `vitrine_avaliacoes` — nota de 1 a 5 dada por quem ALUGOU.
--   3) O visto de validação, que só o administrador da plataforma acende.
--   4) `listar_vitrine_publica_v4` — leva o bloco do responsável ao site.
--
-- Duas decisões que valem ser lidas antes de mexer:
--
--   AVALIAÇÃO NÃO É LIVRE. Só grava quem tem acesso de inquilino ativo
--   E contrato num imóvel daquele responsável. Nota aberta a visitante
--   vira arma de concorrente e elogio do próprio dono; aqui ela custa
--   um contrato para existir. Uma nota por inquilino por responsável,
--   editável pelo autor — não acumulável.
--
--   O VISTO NÃO É AUTOSSERVIÇO. `verificado` não entra na policy de
--   escrita do dono: quem acende é `e_administrador_plataforma()`, pela
--   RPC abaixo, depois de conferir CRECI/CNPJ e receber. Um selo que
--   diz "validado" sem ninguém ter validado é propaganda enganosa, e
--   a conta que responde por isso é a da plataforma.
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
  if to_regclass('public.acessos_inquilino') is null then
    raise exception 'Rode antes o arquivo migracao-tipos-acesso.sql.';
  end if;
  if to_regprocedure('public.listar_vitrine_publica_v3(text)') is null then
    raise exception 'Rode antes o arquivo migracao-vitrine-retencao-agenda.sql.';
  end if;
  if not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='vitrine_anunciantes'
      and column_name='proprietario_cliente_id') then
    raise exception 'Rode antes o arquivo migracao-proprietario-cliente.sql.';
  end if;
end
$$;

-- ------------------------------------------------------------
-- 1. O anunciante ganha etiqueta, registro e visto
--
-- `registro` guarda CRECI do corretor ou CNPJ da imobiliária. É o que
-- o administrador confere antes de acender o visto — por isso mora
-- junto, e não numa observação solta.
-- ------------------------------------------------------------
alter table public.vitrine_anunciantes
  add column if not exists tipo           text,
  add column if not exists registro       text not null default '',
  add column if not exists verificado     boolean not null default false,
  add column if not exists verificado_em  timestamptz,
  add column if not exists verificado_ate date;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='vitrine_anunciante_tipo_check') then
    alter table public.vitrine_anunciantes
      add constraint vitrine_anunciante_tipo_check
      check (tipo is null or tipo in ('imobiliaria','corretor','proprietario'));
  end if;
end
$$;

-- Todo cadastro existente nasceu espelhando `proprietarios_clientes`:
-- é proprietário até que alguém diga o contrário na tela.
update public.vitrine_anunciantes set tipo='proprietario' where tipo is null;
alter table public.vitrine_anunciantes alter column tipo set default 'proprietario';

-- ------------------------------------------------------------
-- 2. As avaliações
--
-- `user_id` é o dono da conta, como nas outras tabelas da Vitrine —
-- é o que faz a policy de leitura do gestor funcionar sem inventar
-- caminho novo. `autor_user_id` é o inquilino que assinou a nota.
-- ------------------------------------------------------------
create table if not exists public.vitrine_avaliacoes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.proprietarios(user_id) on delete cascade,
  anunciante_id uuid not null references public.vitrine_anunciantes(id) on delete cascade,
  inquilino_id  uuid not null references public.inquilinos(id) on delete cascade,
  autor_user_id uuid not null references auth.users(id) on delete cascade,
  nota          smallint not null check (nota between 1 and 5),
  comentario    text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint vitrine_avaliacao_comentario_check
    check (char_length(comentario) <= 600),
  -- uma nota por inquilino por responsável: reavaliar é corrigir a
  -- própria nota, não somar outra
  constraint vitrine_avaliacao_unica unique (anunciante_id, inquilino_id)
);

create index if not exists vitrine_avaliacoes_anunciante_idx
  on public.vitrine_avaliacoes(anunciante_id);
create index if not exists vitrine_avaliacoes_autor_idx
  on public.vitrine_avaliacoes(autor_user_id);

alter table public.vitrine_avaliacoes enable row level security;
alter table public.vitrine_avaliacoes force row level security;

-- O gestor LÊ e pode APAGAR (moderação de ofensa), mas não escreve:
-- nota que o avaliado consegue editar não vale nada.
drop policy if exists vitrine_avaliacoes_dono on public.vitrine_avaliacoes;
create policy vitrine_avaliacoes_dono on public.vitrine_avaliacoes
  for select to authenticated
  using (user_id = public.usuario_proprietario_id(auth.uid()));

drop policy if exists vitrine_avaliacoes_dono_apaga on public.vitrine_avaliacoes;
create policy vitrine_avaliacoes_dono_apaga on public.vitrine_avaliacoes
  for delete to authenticated
  using (user_id = public.usuario_proprietario_id(auth.uid()));

-- O inquilino enxerga a própria nota para poder corrigi-la.
drop policy if exists vitrine_avaliacoes_autor on public.vitrine_avaliacoes;
create policy vitrine_avaliacoes_autor on public.vitrine_avaliacoes
  for select to authenticated
  using (autor_user_id = auth.uid());

revoke all on table public.vitrine_avaliacoes from public,anon;
grant select,delete on table public.vitrine_avaliacoes to authenticated;
-- Sem insert/update direto de propósito: a escrita passa pela RPC
-- abaixo, que é onde o vínculo de contrato é conferido.

-- ------------------------------------------------------------
-- 3. Quem pode avaliar
--
-- Precisa das duas coisas ao mesmo tempo:
--   a) acesso de inquilino ativo na conta dona do responsável;
--   b) contrato — de agora ou de antes — num imóvel cujo proprietário
--      seja aquele responsável.
--
-- Contrato encerrado continua valendo: é justamente quem já saiu que
-- tem a opinião mais honesta sobre como foi alugar ali.
-- ------------------------------------------------------------
create or replace function public.vitrine_pode_avaliar(
  p_anunciante_id uuid,
  p_user_id       uuid default auth.uid()
)
returns uuid language sql stable security definer set search_path=public
as $$
  select a.inquilino_id
  from public.acessos_inquilino a
  join public.vitrine_anunciantes an
    on an.id = p_anunciante_id
   and an.user_id = a.proprietario_id
  where a.user_id = p_user_id
    and a.ativo
    and an.proprietario_cliente_id is not null
    and exists (
      select 1
      from public.contratos c
      join public.imoveis i on i.id = c.imovel_id
      where c.tenant_id = a.inquilino_id
        and c.user_id = a.proprietario_id
        and i.proprietario_cliente_id = an.proprietario_cliente_id
    )
  limit 1
$$;

revoke all on function public.vitrine_pode_avaliar(uuid,uuid) from public,anon;
grant execute on function public.vitrine_pode_avaliar(uuid,uuid) to authenticated;

create or replace function public.vitrine_avaliar_responsavel(
  p_anunciante_id uuid,
  p_nota          int,
  p_comentario    text default ''
)
returns jsonb language plpgsql volatile security definer set search_path=public
as $$
declare
  v_inquilino uuid;
  v_dono      uuid;
  v_texto     text := left(coalesce(trim(p_comentario),''),600);
begin
  if p_nota is null or p_nota < 1 or p_nota > 5 then
    raise exception 'A nota vai de 1 a 5.';
  end if;

  v_inquilino := public.vitrine_pode_avaliar(p_anunciante_id, auth.uid());
  if v_inquilino is null then
    raise exception 'Só quem alugou um imóvel deste responsável pode avaliar.';
  end if;

  select user_id into v_dono from public.vitrine_anunciantes where id = p_anunciante_id;

  insert into public.vitrine_avaliacoes(
      user_id, anunciante_id, inquilino_id, autor_user_id, nota, comentario)
  values (v_dono, p_anunciante_id, v_inquilino, auth.uid(), p_nota, v_texto)
  on conflict (anunciante_id, inquilino_id) do update
    set nota       = excluded.nota,
        comentario = excluded.comentario,
        updated_at = now()
    -- trava de segurança: o conflito só pode cair na linha do próprio
    -- autor. Sem isto, dois acessos para o mesmo inquilino deixariam um
    -- sobrescrever a nota do outro.
    where vitrine_avaliacoes.autor_user_id = auth.uid();

  -- Sem isto o caso acima falharia calado: o insert seria descartado e a
  -- pessoa veria "obrigado pela avaliação" sem nada ter sido gravado.
  if not found then
    raise exception 'Já existe uma avaliação deste inquilino feita por outro acesso.';
  end if;

  return jsonb_build_object('ok', true);
end
$$;

revoke all on function public.vitrine_avaliar_responsavel(uuid,int,text) from public,anon;
grant execute on function public.vitrine_avaliar_responsavel(uuid,int,text) to authenticated;

-- O portal do inquilino não enxerga `vitrine_anunciantes` — a policy de
-- lá é do dono da conta, e assim deve continuar. Esta função devolve só
-- o que o inquilino precisa para avaliar: quem ele pode avaliar e que
-- nota ele já deu. Nome e etiqueta, nada de telefone ou documento.
create or replace function public.vitrine_meus_responsaveis()
returns jsonb language sql stable security definer set search_path=public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',         an.id,
    'nome',       an.nome,
    'tipo',       coalesce(an.tipo,'proprietario'),
    'verificado', (an.verificado and (an.verificado_ate is null or an.verificado_ate >= current_date)),
    'minhaNota',  av.nota,
    'meuComentario', coalesce(av.comentario,'')
  ) order by an.nome), '[]'::jsonb)
  from public.acessos_inquilino a
  join public.vitrine_anunciantes an on an.user_id = a.proprietario_id
  left join public.vitrine_avaliacoes av
    on av.anunciante_id = an.id and av.autor_user_id = auth.uid()
  where a.user_id = auth.uid()
    and a.ativo
    and public.vitrine_pode_avaliar(an.id, auth.uid()) is not null
$$;

revoke all on function public.vitrine_meus_responsaveis() from public,anon;
grant execute on function public.vitrine_meus_responsaveis() to authenticated;

create or replace function public.vitrine_remover_avaliacao(p_anunciante_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=public
as $$
begin
  delete from public.vitrine_avaliacoes
  where anunciante_id = p_anunciante_id and autor_user_id = auth.uid();
  return jsonb_build_object('ok', true);
end
$$;

revoke all on function public.vitrine_remover_avaliacao(uuid) from public,anon;
grant execute on function public.vitrine_remover_avaliacao(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. O visto de validação
--
-- Só o administrador da plataforma acende, e a data de validade fica
-- gravada: selo pago que não vence é selo vitalício vendido uma vez só.
-- Vencido, o site deixa de mostrar sem que ninguém precise apagar nada.
-- ------------------------------------------------------------
create or replace function public.vitrine_definir_visto(
  p_anunciante_id uuid,
  p_ativo         boolean,
  p_ate           date default null
)
returns jsonb language plpgsql volatile security definer set search_path=public
as $$
begin
  if not public.e_administrador_plataforma(auth.uid()) then
    raise exception 'Somente o administrador da plataforma libera o visto.';
  end if;
  update public.vitrine_anunciantes
     set verificado     = coalesce(p_ativo,false),
         verificado_em  = case when p_ativo then now() else null end,
         verificado_ate = case when p_ativo then p_ate else null end,
         updated_at     = now()
   where id = p_anunciante_id;
  if not found then
    raise exception 'Responsável não encontrado.';
  end if;
  return jsonb_build_object('ok', true);
end
$$;

revoke all on function public.vitrine_definir_visto(uuid,boolean,date) from public,anon;
grant execute on function public.vitrine_definir_visto(uuid,boolean,date) to authenticated;

-- ------------------------------------------------------------
-- 5. O responsável chega ao site público
--
-- Mesmo molde das versões anteriores: v4 chama v3 e acrescenta. Nada
-- do que já vai no payload muda de forma, então o app antigo continua
-- lendo o novo retorno sem enxergar diferença.
--
-- Vai só o que a página mostra: nome, etiqueta, visto, média, quantas
-- notas e quantos anúncios. Telefone, e-mail e documento do responsável
-- NÃO vão — o contato do site é o da conta, e dado pessoal de terceiro
-- não vira JSON público.
-- ------------------------------------------------------------
create or replace function public.listar_vitrine_publica_v4(p_slug text) returns jsonb
language sql stable security definer set search_path=public
as $$
  with base as (select public.listar_vitrine_publica_v3(p_slug) dados),
  dono as (select user_id from public.proprietarios where slug_publico=p_slug limit 1),
  -- quantos anúncios ativos cada responsável tem hoje: é o "958 imóveis"
  -- do card, e o que dá sentido ao "ver anúncios deste responsável"
  contagem as (
    select vi.anunciante_id, count(*) total
    from public.vitrine_imoveis vi
    join dono on dono.user_id = vi.user_id
    where vi.status = 'ativo'
    group by vi.anunciante_id
  ),
  notas as (
    select av.anunciante_id,
           round(avg(av.nota)::numeric, 1) media,
           count(*) total
    from public.vitrine_avaliacoes av
    join dono on dono.user_id = av.user_id
    group by av.anunciante_id
  ),
  responsaveis as (
    select coalesce(jsonb_object_agg(an.id::text, jsonb_build_object(
      'id',            an.id,
      'nome',          an.nome,
      'tipo',          coalesce(an.tipo,'proprietario'),
      'registro',      coalesce(an.registro,''),
      -- visto vencido não aparece: a data manda, não o booleano
      'verificado',    (an.verificado and (an.verificado_ate is null or an.verificado_ate >= current_date)),
      'totalImoveis',  coalesce(c.total,0),
      'notaMedia',     n.media,
      'totalNotas',    coalesce(n.total,0)
    )), '{}'::jsonb) dados
    from public.vitrine_anunciantes an
    join dono on dono.user_id = an.user_id
    left join contagem c on c.anunciante_id = an.id
    left join notas    n on n.anunciante_id = an.id
  ),
  -- cada imóvel passa a dizer de quem ele é, para a página do anúncio
  -- achar o responsável sem uma segunda consulta
  itens as (
    select coalesce(jsonb_agg(
      elem || jsonb_build_object('responsavelId', i.anunciante_id) order by ord
    ),'[]'::jsonb) dados
    from base
    cross join lateral jsonb_array_elements(coalesce(base.dados->'imoveis','[]'::jsonb))
      with ordinality x(elem,ord)
    join public.vitrine_imoveis i on i.id=(elem->>'id')::uuid
  )
  select jsonb_set(
           jsonb_set(base.dados,'{imoveis}',itens.dados,true),
           '{responsaveis}',responsaveis.dados,true)
  from base, itens, responsaveis
$$;

revoke all on function public.listar_vitrine_publica_v4(text) from public;
grant execute on function public.listar_vitrine_publica_v4(text) to anon,authenticated;

do $$
begin
  if to_regprocedure('public.registrar_migracao(text,text)') is not null then
    perform public.registrar_migracao('migracao-vitrine-responsavel.sql',
      'Responsavel pelo imovel: etiqueta, avaliacao de inquilinos e visto de validacao');
  end if;
end $$;

commit;
