-- ============================================================
-- migracao-vitrine-equipe.sql
-- A Vitrine passa a funcionar para a EQUIPE, não só para o dono.
--
-- O problema que isto conserta:
--   As tabelas da Vitrine nasceram com `user_id ... default auth.uid()`,
--   mas a policy exige `user_id = usuario_proprietario_id(auth.uid())`.
--   Para o proprietário os dois valores são iguais e ninguém percebeu.
--   Para um COLABORADOR são diferentes: o insert é rejeitado pela policy
--   e pela chave estrangeira para `proprietarios`. Na prática, corretor
--   nenhum conseguia cadastrar imóvel, cidade, anunciante, foto ou taxa.
--
--   `vitrine_cidades` errava de outro jeito: a policy dela compara com
--   `auth.uid()` direto, então o colaborador GRAVAVA — numa linha que o
--   proprietário nunca via. Split-brain silencioso.
--
-- O que muda:
--   1) Default de `user_id` das seis tabelas passa a resolver o dono.
--   2) Policy de `vitrine_cidades` volta ao molde das demais.
--   3) Reparo das cidades gravadas por colaborador.
--   4) Clique no WhatsApp passa a virar lead de verdade.
--   5) Anti-spam do formulário deixa de ser por anúncio e passa a ser
--      por pessoa.
--
-- O que NÃO muda: nenhuma linha é apagada, nenhuma coluna é removida,
-- nenhuma função de papel é redefinida. Atribuir não é permitir.
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
  if to_regclass('public.vitrine_cidades') is null then
    raise exception 'Rode antes o arquivo migracao-vitrine-corretora.sql.';
  end if;
end
$$;

-- ------------------------------------------------------------
-- 1. O default de user_id resolve o PROPRIETÁRIO
--
-- Cinto e suspensório: o aplicativo passou a mandar o user_id certo em
-- todo insert, mas quem gravar direto pelo PostgREST também tem de cair
-- na linha do dono, não na de quem está logado.
--
-- Trocar o default não altera nenhuma linha já existente.
-- ------------------------------------------------------------
do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array[
    'vitrine_anunciantes',
    'vitrine_imoveis',
    'vitrine_fotos',
    'vitrine_leads',
    'vitrine_taxas',
    'vitrine_cidades'
  ]
  loop
    execute format(
      'alter table public.%I alter column user_id set default public.usuario_proprietario_id(auth.uid())',
      v_tabela
    );
  end loop;
end
$$;

-- ------------------------------------------------------------
-- 2. vitrine_cidades volta ao molde das outras cinco
--
-- Substitui a policy de migracao-vitrine-corretora.sql:57-60, que
-- comparava com auth.uid().
-- ------------------------------------------------------------
drop policy if exists vitrine_cidades_dono on public.vitrine_cidades;
drop policy if exists vitrine_dono on public.vitrine_cidades;

create policy vitrine_dono on public.vitrine_cidades
  for all to authenticated
  using (
    user_id = public.usuario_proprietario_id(auth.uid())
    and public.vitrine_pode_operar(auth.uid())
  )
  with check (
    user_id = public.usuario_proprietario_id(auth.uid())
    and public.vitrine_pode_operar(auth.uid())
  );

revoke all on table public.vitrine_cidades from public, anon;
grant select, insert, update, delete on table public.vitrine_cidades to authenticated;

-- ------------------------------------------------------------
-- 3. Reparo: cidade gravada por colaborador volta para o dono
--
-- Só toca em linha cujo user_id seja de um colaborador conhecido. Uma
-- linha já correta não casa com o `exists` e fica intocada — por isso é
-- seguro reexecutar.
-- ------------------------------------------------------------
update public.vitrine_cidades c
   set user_id = a.proprietario_id,
       updated_at = now()
  from public.acessos_colaborador a
 where a.user_id = c.user_id
   and a.proprietario_id <> c.user_id;

-- Se o reparo criou slug repetido (a mesma cidade cadastrada pelo dono e
-- pelo colaborador), a constraint vitrine_cidade_slug_unico avisa e o
-- arquivo inteiro é desfeito. Nesse caso, apague a cidade duplicada pela
-- tela e rode de novo.

-- ------------------------------------------------------------
-- 4. Clique no WhatsApp vira lead
--
-- Até aqui o clique só incrementava `contatos_whatsapp`. O valor
-- 'whatsapp' da coluna `origem` existia no check e nunca era gravado por
-- caminho nenhum, então a lista de contatos mostrava só metade de quem
-- procurou a corretora.
--
-- Sem nome e sem telefone — o visitante não preencheu nada. O que fica
-- registrado é o interesse pelo anúncio, com dedupe de uma hora para o
-- curioso que clica cinco vezes não virar cinco linhas.
-- ------------------------------------------------------------
create or replace function public.vitrine_registrar_clique_whatsapp(
  p_imovel_id uuid,
  p_contexto  text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_owner uuid;
begin
  if not public.vitrine_anuncio_publico(p_imovel_id) then
    return jsonb_build_object('ok',false);
  end if;

  update public.vitrine_imoveis
  set contatos_whatsapp = contatos_whatsapp + 1
  where id = p_imovel_id
  returning user_id into v_owner;

  if v_owner is null then
    return jsonb_build_object('ok',false);
  end if;

  if exists (
    select 1 from public.vitrine_leads
    where imovel_id = p_imovel_id
      and origem = 'whatsapp'
      and created_at > now() - interval '1 hour'
  ) then
    return jsonb_build_object('ok',true,'lead',false);
  end if;

  insert into public.vitrine_leads(
    user_id,imovel_id,nome,telefone,mensagem,origem,consentimento_lgpd
  )
  values(
    v_owner,p_imovel_id,'(clique no WhatsApp)','',
    left(trim(coalesce(p_contexto,'')),1000),'whatsapp',false
  );

  return jsonb_build_object('ok',true,'lead',true);
end
$$;

revoke all on function public.vitrine_registrar_clique_whatsapp(uuid,text) from public;
grant execute on function public.vitrine_registrar_clique_whatsapp(uuid,text) to anon,authenticated;

-- ------------------------------------------------------------
-- 5. Anti-spam por pessoa, não por anúncio
--
-- A regra antiga recusava o 6º contato do MESMO ANÚNCIO na mesma hora.
-- Num anúncio que circulou no grupo de WhatsApp da cidade, isso barra
-- interessado legítimo — o pior erro possível para uma corretora.
--
-- A regra nova barra a mesma PESSOA repetindo no mesmo anúncio, e mantém
-- um teto alto por anúncio só para conter robô.
--
-- Mesma assinatura da versão de migracao-vitrine.sql:415, portanto é um
-- create or replace limpo.
-- ------------------------------------------------------------
create or replace function public.vitrine_registrar_lead(
  p_imovel_id uuid,
  p_nome text,
  p_telefone text,
  p_mensagem text default '',
  p_consentimento boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_owner uuid;
  v_nome  text := trim(coalesce(p_nome,''));
  v_tel   text := trim(coalesce(p_telefone,''));
  v_tel_num text;
begin
  if not public.vitrine_anuncio_publico(p_imovel_id) then
    raise exception 'Este anuncio nao esta disponivel.';
  end if;

  if not coalesce(p_consentimento,false) then
    raise exception 'E necessario autorizar o contato.';
  end if;

  if char_length(v_nome) < 2 or char_length(v_nome) > 120 then
    raise exception 'Informe seu nome.';
  end if;

  v_tel_num := regexp_replace(v_tel,'\D','','g');
  if char_length(v_tel_num) < 10 then
    raise exception 'Informe um telefone valido com DDD.';
  end if;

  select user_id into v_owner
  from public.vitrine_imoveis where id = p_imovel_id;

  -- A mesma pessoa, no mesmo anuncio, uma vez por hora.
  if exists (
    select 1 from public.vitrine_leads
    where imovel_id = p_imovel_id
      and regexp_replace(coalesce(telefone,''),'\D','','g') = v_tel_num
      and created_at > now() - interval '1 hour'
  ) then
    raise exception 'Ja recebemos seu contato para este imovel. Aguarde nosso retorno.';
  end if;

  -- Teto por anuncio, alto o bastante para nao pegar gente de verdade.
  if (
    select count(*) from public.vitrine_leads
    where imovel_id = p_imovel_id
      and origem = 'formulario'
      and created_at > now() - interval '1 hour'
  ) >= 30 then
    raise exception 'Muitos contatos seguidos. Tente novamente mais tarde.';
  end if;

  insert into public.vitrine_leads(
    user_id,imovel_id,nome,telefone,mensagem,origem,consentimento_lgpd
  )
  values(
    v_owner,p_imovel_id,v_nome,v_tel,
    left(trim(coalesce(p_mensagem,'')),1000),'formulario',true
  );

  update public.vitrine_imoveis
  set contatos_formulario = contatos_formulario + 1
  where id = p_imovel_id;

  return jsonb_build_object('ok',true);
end
$$;

revoke all on function
  public.vitrine_registrar_lead(uuid,text,text,text,boolean) from public;
grant execute on function
  public.vitrine_registrar_lead(uuid,text,text,text,boolean) to anon,authenticated;

-- ------------------------------------------------------------
-- 6. Conferência
-- ------------------------------------------------------------
do $$
declare
  v_orfas integer;
begin
  select count(*) into v_orfas
    from public.vitrine_cidades c
    join public.acessos_colaborador a on a.user_id = c.user_id
   where a.proprietario_id <> c.user_id;
  raise notice 'Cidades ainda presas a um colaborador (deve ser 0): %', v_orfas;
  raise notice 'Vitrine liberada para a equipe.';

  -- Deixa registrado que este arquivo rodou. A funcao so existe depois de
  -- migracao-controle-versao.sql; sem ela, o diagnostico ainda detecta este
  -- arquivo pela evidencia no esquema.
  if to_regprocedure('public.registrar_migracao(text,text)') is not null then
    perform public.registrar_migracao('migracao-vitrine-equipe.sql','');
  end if;
end
$$;

commit;
