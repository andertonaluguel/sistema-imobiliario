-- ============================================================
-- MINHA CASA — FORMA DE PAGAMENTO E PARCELAMENTO
--
-- Motivo: uma compra de R$ 1.200 em 10x no cartao nao e uma
-- despesa de R$ 1.200 neste mes. Sao R$ 120 por mes, durante 10
-- meses. Sem isso, o resumo mensal fica errado justamente no mes
-- da compra e nos nove seguintes.
--
-- Como resolvemos: ao lancar no credito com N parcelas, o banco
-- grava N lancamentos, um por mes, ligados pelo mesmo compra_id.
-- Assim todo o resto do aplicativo (resumo do mes, relatorios,
-- graficos) continua funcionando sem saber o que e parcelamento.
--
-- ADITIVA e REEXECUTAVEL. Nenhum lancamento existente e alterado
-- alem de receber 'dinheiro' como forma de pagamento padrao.
-- ============================================================

do $$
begin
  if to_regclass('public.minha_casa_lancamentos') is null then
    raise exception 'Rode antes migracao-minha-casa.sql.';
  end if;
end
$$;

-- ------------------------------------------------------------
-- 1. COLUNAS NOVAS
-- ------------------------------------------------------------

alter table public.minha_casa_lancamentos
  add column if not exists forma_pagamento text not null default 'dinheiro';

alter table public.minha_casa_lancamentos
  add column if not exists compra_id uuid;

alter table public.minha_casa_lancamentos
  add column if not exists parcela_numero integer not null default 1;

alter table public.minha_casa_lancamentos
  add column if not exists parcela_total integer not null default 1;

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conname='minha_casa_lancamento_forma_check'
  ) then
    alter table public.minha_casa_lancamentos
      add constraint minha_casa_lancamento_forma_check
      check (forma_pagamento in
        ('dinheiro','pix','debito','credito','boleto','transferencia'));
  end if;
  if not exists(
    select 1 from pg_constraint
    where conname='minha_casa_lancamento_parcela_check'
  ) then
    alter table public.minha_casa_lancamentos
      add constraint minha_casa_lancamento_parcela_check
      check (parcela_numero >= 1
             and parcela_total >= 1
             and parcela_numero <= parcela_total);
  end if;
end
$$;

create index if not exists minha_casa_lancamentos_compra_idx
  on public.minha_casa_lancamentos(familia_id, compra_id)
  where compra_id is not null;

create index if not exists minha_casa_lancamentos_forma_idx
  on public.minha_casa_lancamentos(familia_id, forma_pagamento);

-- ------------------------------------------------------------
-- 2. SALVAR LANCAMENTO, AGORA COM PAGAMENTO E PARCELAS
--
-- A assinatura antiga sai de cena para nao ficar ambigua com a
-- nova. O aplicativo chama por nome de parametro, entao a troca
-- e transparente.
-- ------------------------------------------------------------

drop function if exists public.minha_casa_salvar_lancamento(
  text,numeric,uuid,uuid,date,text,uuid
);

create or replace function public.minha_casa_salvar_lancamento(
  p_tipo text,
  p_valor numeric,
  p_categoria_id uuid,
  p_membro_id uuid,
  p_data date default null,
  p_descricao text default '',
  p_id uuid default null,
  p_forma_pagamento text default 'dinheiro',
  p_parcelas integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_familia_id uuid:=public.minha_casa_exigir_mestre();
  v_tipo text:=lower(trim(coalesce(p_tipo,'')));
  v_forma text:=lower(trim(coalesce(p_forma_pagamento,'dinheiro')));
  v_data date:=coalesce(
    p_data,
    (timezone('America/Sao_Paulo',now()))::date
  );
  v_descricao text:=left(trim(coalesce(p_descricao,'')),500);
  v_parcelas integer:=greatest(coalesce(p_parcelas,1),1);
  v_total numeric:=round(coalesce(p_valor,0),2);
  v_parcela numeric;
  v_primeira numeric;
  v_compra uuid;
  v_row public.minha_casa_lancamentos%rowtype;
  i integer;
begin
  if v_total<=0 then
    raise exception 'O valor precisa ser maior que zero.';
  end if;
  if v_forma not in ('dinheiro','pix','debito','credito','boleto','transferencia') then
    raise exception 'Forma de pagamento invalida.';
  end if;
  -- Parcelar so faz sentido no credito. Nas outras formas o
  -- dinheiro sai de uma vez, entao o lancamento tambem.
  if v_forma<>'credito' then
    v_parcelas:=1;
  end if;
  if v_parcelas>60 then
    raise exception 'No maximo 60 parcelas.';
  end if;

  perform public.minha_casa_validar_referencias(
    v_familia_id,v_tipo,p_categoria_id,p_membro_id
  );

  -- ---------- edicao ----------
  -- Editar mexe apenas na parcela aberta. Para trocar o valor da
  -- compra inteira, exclua a compra e lance de novo.
  if p_id is not null then
    update public.minha_casa_lancamentos
    set tipo=v_tipo,
        valor=v_total,
        data=v_data,
        categoria_id=p_categoria_id,
        membro_id=p_membro_id,
        descricao=v_descricao,
        forma_pagamento=v_forma,
        updated_by=auth.uid(),
        updated_at=now()
    where id=p_id and familia_id=v_familia_id
    returning * into v_row;
    if v_row.id is null then raise exception 'Lancamento nao encontrado.'; end if;

    return jsonb_build_object(
      'id',v_row.id,'tipo',v_row.tipo,'valor',v_row.valor,'data',v_row.data,
      'categoriaId',v_row.categoria_id,'membroId',v_row.membro_id,
      'descricao',v_row.descricao,'formaPagamento',v_row.forma_pagamento,
      'compraId',v_row.compra_id,'parcelaNumero',v_row.parcela_numero,
      'parcelaTotal',v_row.parcela_total,'origemTipo',v_row.origem_tipo,
      'origemChave',v_row.origem_chave,
      'createdAt',v_row.created_at,'updatedAt',v_row.updated_at,
      'parcelasCriadas',1
    );
  end if;

  -- ---------- lancamento novo ----------
  if v_parcelas=1 then
    insert into public.minha_casa_lancamentos(
      familia_id,tipo,valor,data,categoria_id,membro_id,descricao,
      forma_pagamento,origem_tipo,created_by,updated_by
    )
    values(
      v_familia_id,v_tipo,v_total,v_data,
      p_categoria_id,p_membro_id,v_descricao,
      v_forma,'manual',auth.uid(),auth.uid()
    )
    returning * into v_row;

    return jsonb_build_object(
      'id',v_row.id,'tipo',v_row.tipo,'valor',v_row.valor,'data',v_row.data,
      'categoriaId',v_row.categoria_id,'membroId',v_row.membro_id,
      'descricao',v_row.descricao,'formaPagamento',v_row.forma_pagamento,
      'compraId',null,'parcelaNumero',1,'parcelaTotal',1,
      'origemTipo',v_row.origem_tipo,'origemChave',v_row.origem_chave,
      'createdAt',v_row.created_at,'updatedAt',v_row.updated_at,
      'parcelasCriadas',1
    );
  end if;

  -- Parcelamento: a sobra do arredondamento vai na primeira
  -- parcela, para a soma bater com o valor da compra ao centavo.
  v_compra:=gen_random_uuid();
  v_parcela:=trunc(v_total/v_parcelas,2);
  v_primeira:=v_total-(v_parcela*(v_parcelas-1));

  for i in 1..v_parcelas loop
    insert into public.minha_casa_lancamentos(
      familia_id,tipo,valor,data,categoria_id,membro_id,descricao,
      forma_pagamento,compra_id,parcela_numero,parcela_total,
      origem_tipo,created_by,updated_by
    )
    values(
      v_familia_id,v_tipo,
      case when i=1 then v_primeira else v_parcela end,
      (v_data + ((i-1) * interval '1 month'))::date,
      p_categoria_id,p_membro_id,v_descricao,
      v_forma,v_compra,i,v_parcelas,
      'manual',auth.uid(),auth.uid()
    )
    returning * into v_row;
  end loop;

  return jsonb_build_object(
    'compraId',v_compra,
    'parcelasCriadas',v_parcelas,
    'valorTotal',v_total,
    'valorParcela',v_parcela,
    'primeiraParcela',v_primeira,
    'formaPagamento',v_forma,
    'recarregar',true
  );
end
$$;

revoke all on function public.minha_casa_salvar_lancamento(
  text,numeric,uuid,uuid,date,text,uuid,text,integer
) from public,anon;
grant execute on function public.minha_casa_salvar_lancamento(
  text,numeric,uuid,uuid,date,text,uuid,text,integer
) to authenticated;

-- ------------------------------------------------------------
-- 3. EXCLUIR A COMPRA INTEIRA
-- Apagar uma parcela sozinha deixaria a compra pela metade.
-- ------------------------------------------------------------

create or replace function public.minha_casa_excluir_compra(p_compra_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_familia_id uuid:=public.minha_casa_exigir_mestre();
  v_total integer;
begin
  if p_compra_id is null then
    raise exception 'Compra nao informada.';
  end if;

  delete from public.minha_casa_lancamentos
  where familia_id=v_familia_id and compra_id=p_compra_id;
  get diagnostics v_total = row_count;

  if v_total=0 then raise exception 'Compra nao encontrada.'; end if;

  return jsonb_build_object('compraId',p_compra_id,'parcelasExcluidas',v_total);
end
$$;

revoke all on function public.minha_casa_excluir_compra(uuid) from public,anon;
grant execute on function public.minha_casa_excluir_compra(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. A LISTA PASSA A DEVOLVER OS CAMPOS NOVOS
-- Mesma funcao de sempre, com quatro chaves a mais.
-- ------------------------------------------------------------

create or replace function public.minha_casa_listar_lancamentos(
  p_data_inicio date default null,
  p_data_fim date default null,
  p_tipo text default null,
  p_membro_id uuid default null,
  p_categoria_id uuid default null,
  p_busca text default null,
  p_limite integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_familia_id uuid:=public.minha_casa_exigir_mestre();
  v_tipo text:=nullif(lower(trim(coalesce(p_tipo,''))),'');
  v_busca text:=nullif(lower(trim(coalesce(p_busca,''))),'');
  v_limite integer:=least(greatest(coalesce(p_limite,100),1),500);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_items jsonb;
  v_total bigint;
begin
  if v_tipo is not null and v_tipo not in ('entrada','saida') then
    raise exception 'Tipo deve ser entrada ou saida.';
  end if;
  if p_data_inicio is not null
     and p_data_fim is not null
     and p_data_fim<p_data_inicio then
    raise exception 'Periodo invalido.';
  end if;

  select count(*)
  into v_total
  from public.minha_casa_lancamentos l
  join public.minha_casa_categorias c on c.id=l.categoria_id
  join public.minha_casa_membros m on m.id=l.membro_id
  where l.familia_id=v_familia_id
    and (p_data_inicio is null or l.data>=p_data_inicio)
    and (p_data_fim is null or l.data<=p_data_fim)
    and (v_tipo is null or l.tipo=v_tipo)
    and (p_membro_id is null or l.membro_id=p_membro_id)
    and (p_categoria_id is null or l.categoria_id=p_categoria_id)
    and (
      v_busca is null
      or lower(l.descricao) like '%'||v_busca||'%'
      or lower(c.nome) like '%'||v_busca||'%'
      or lower(m.nome) like '%'||v_busca||'%'
      or replace(l.valor::text,'.',',') like '%'||replace(v_busca,'.',',')||'%'
    );

  select coalesce(jsonb_agg(x.item order by x.data desc,x.created_at desc),'[]'::jsonb)
  into v_items
  from (
    select
      l.data,
      l.created_at,
      jsonb_build_object(
        'id',l.id,
        'type',l.tipo,
        'amount',l.valor,
        'date',l.data,
        'categoryId',l.categoria_id,
        'categoryName',c.nome,
        'categoryEmoji',c.emoji,
        'categoryColor',c.cor,
        'memberId',l.membro_id,
        'memberName',m.nome,
        'memberEmoji',m.emoji,
        'description',l.descricao,
        'paymentMethod',l.forma_pagamento,
        'purchaseId',l.compra_id,
        'installment',l.parcela_numero,
        'installments',l.parcela_total,
        'sourceType',l.origem_tipo,
        'sourceKey',l.origem_chave,
        'createdAt',l.created_at,
        'updatedAt',l.updated_at
      ) item
    from public.minha_casa_lancamentos l
    join public.minha_casa_categorias c on c.id=l.categoria_id
    join public.minha_casa_membros m on m.id=l.membro_id
    where l.familia_id=v_familia_id
      and (p_data_inicio is null or l.data>=p_data_inicio)
      and (p_data_fim is null or l.data<=p_data_fim)
      and (v_tipo is null or l.tipo=v_tipo)
      and (p_membro_id is null or l.membro_id=p_membro_id)
      and (p_categoria_id is null or l.categoria_id=p_categoria_id)
      and (
        v_busca is null
        or lower(l.descricao) like '%'||v_busca||'%'
        or lower(c.nome) like '%'||v_busca||'%'
        or lower(m.nome) like '%'||v_busca||'%'
        or replace(l.valor::text,'.',',') like '%'||replace(v_busca,'.',',')||'%'
      )
    order by l.data desc,l.created_at desc
    limit v_limite offset v_offset
  ) x;

  return jsonb_build_object('items',v_items,'total',v_total);
end
$$;

revoke all on function public.minha_casa_listar_lancamentos(
  date,date,text,uuid,uuid,text,integer,integer
) from public,anon;
grant execute on function public.minha_casa_listar_lancamentos(
  date,date,text,uuid,uuid,text,integer,integer
) to authenticated;

-- ------------------------------------------------------------
-- 5. CONFERENCIA
-- ------------------------------------------------------------

do $$
declare
  v_lancamentos integer;
  v_sem_forma   integer;
begin
  select count(*) into v_lancamentos from public.minha_casa_lancamentos;
  select count(*) into v_sem_forma
  from public.minha_casa_lancamentos
  where coalesce(forma_pagamento,'')='';

  raise notice 'Lancamentos preservados: %  |  Sem forma de pagamento: %',
    v_lancamentos, v_sem_forma;
  raise notice 'Pronto. Lancamentos antigos ficaram como dinheiro; e so editar o que foi no cartao.';
end
$$;
