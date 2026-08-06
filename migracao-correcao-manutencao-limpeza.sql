-- ============================================================
-- ETAPA 0A - correcao de chamados e limpeza integral da conta
-- Reexecutavel. Aplicar somente depois de backup e validacao em staging.
-- ============================================================
begin;

-- O trigger compartilhado usava campos exclusivos no mesmo AND que testava
-- TG_TABLE_NAME. Em RECORD, PostgreSQL tenta resolver o campo antes do curto-
-- circuito: chamado nao tem contrato_id e vistoria nao tem inquilino_id.
create or replace function public.validar_dono_registro_imovel()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_dono uuid;
  v_resolvido uuid;
  v_inquilino_logado uuid;
  v_resolucao_controlada boolean:=
    coalesce(current_setting('app.resolvendo_chamado',true),'')='1'
    or coalesce(current_setting('app.restaurando_backup',true),'')='1';
begin
  if tg_table_name='chamados' and tg_op='UPDATE' and auth.uid() is not null then
    if new.user_id is distinct from old.user_id
       or new.imovel_id is distinct from old.imovel_id then
      raise exception 'A conta e o imovel de um chamado fazem parte do historico e nao podem ser alterados.';
    end if;
    if new.inquilino_id is distinct from old.inquilino_id then
      raise exception 'O inquilino associado ao chamado nao pode ser alterado.';
    end if;
    if new.created_at is distinct from old.created_at then
      raise exception 'A data de abertura do chamado faz parte do historico e nao pode ser alterada.';
    end if;
  end if;

  v_dono:=public.dono_do_imovel(new.imovel_id);
  v_resolvido:=public.usuario_proprietario_id(auth.uid());
  if v_dono is null then raise exception 'Imovel nao encontrado.'; end if;

  if auth.uid() is null then
    new.user_id:=v_dono;
    if tg_table_name='chamados' and tg_op='INSERT' then
      new.aberto_por:='proprietario';
    end if;
  elsif v_resolvido=v_dono
     and public.pode_escrever_vistoria_chamado(v_dono,auth.uid()) then
    new.user_id:=v_dono;
    if tg_table_name='chamados' and tg_op='INSERT' then
      new.aberto_por:='proprietario';
    end if;
  elsif tg_table_name='chamados' and tg_op='INSERT'
        and public.inquilino_mora_no_imovel(new.imovel_id) then
    v_inquilino_logado:=public.inquilino_logado_no_imovel(new.imovel_id);
    new.user_id:=v_dono;
    new.inquilino_id:=v_inquilino_logado;
    new.aberto_por:='inquilino';
    new.status:='aberto';
    new.resposta:='';
    new.despesa_id:=null;
    new.resolvido_em:=null;
  else
    raise exception 'Sem acesso operacional a este imovel.';
  end if;

  if tg_table_name='vistorias' then
    if tg_op='INSERT' then
      new.criado_por:=coalesce(auth.uid(),v_dono);
    elsif auth.uid() is null and new.criado_por is null then
      new.criado_por:=null;
    else
      new.criado_por:=old.criado_por;
    end if;

    if new.contrato_id is not null and not exists (
      select 1 from public.contratos c
       where c.id=new.contrato_id and c.imovel_id=new.imovel_id
         and c.user_id=v_dono
    ) then
      raise exception 'Contrato nao pertence a este imovel.';
    end if;
  end if;

  if tg_table_name='chamados' then
    if new.inquilino_id is not null and not exists (
      select 1 from public.inquilinos i
      join public.contratos c on c.tenant_id=i.id and c.user_id=i.user_id
      where i.id=new.inquilino_id and i.user_id=v_dono
        and c.imovel_id=new.imovel_id
    ) then
      raise exception 'Inquilino nao pertence a esta conta e a este imovel.';
    end if;

    if tg_op='UPDATE' then
      new.aberto_por:=old.aberto_por;
      if new.despesa_id is distinct from old.despesa_id
         and auth.uid() is not null and not v_resolucao_controlada then
        raise exception 'Use a acao de resolver chamado para vincular uma despesa.';
      end if;
      if old.despesa_id is not null and new.status<>'resolvido'
         and auth.uid() is not null then
        raise exception 'Um chamado com despesa vinculada nao pode ser reaberto ou cancelado.';
      end if;
    elsif new.despesa_id is not null and auth.uid() is not null
          and not v_resolucao_controlada then
      raise exception 'Cadastre o chamado antes de vincular sua despesa.';
    end if;

    if new.status='resolvido' then
      if tg_op='INSERT' then
        new.resolvido_em:=case
          when auth.uid() is null or v_resolucao_controlada
            then coalesce(new.resolvido_em,now()) else now() end;
      elsif old.status='resolvido' then
        new.resolvido_em:=coalesce(old.resolvido_em,now());
      else
        new.resolvido_em:=now();
      end if;
    else
      new.resolvido_em:=null;
    end if;

    if new.despesa_id is not null and not exists (
      select 1 from public.despesas d
       where d.id=new.despesa_id and d.user_id=v_dono
         and d.imovel_id=new.imovel_id
    ) then
      raise exception 'Despesa nao pertence a esta conta e a este imovel.';
    end if;
  end if;
  return new;
end
$$;

revoke all on function public.validar_dono_registro_imovel()
  from public,anon,authenticated;

-- Inclusao atomica e idempotente de chamado aberto pela equipe.
create or replace function public.criar_chamado_manutencao(
  p_id uuid,
  p_imovel_id uuid,
  p_dados jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_ator uuid:=auth.uid();
  v_owner uuid;
  v_row public.chamados%rowtype;
  v_status text:=coalesce(nullif(p_dados->>'status',''),'aberto');
  v_historico jsonb:=coalesce(p_dados->'historico','[]'::jsonb);
begin
  if v_ator is null then raise exception 'Faca login para abrir um chamado.'; end if;
  v_owner:=public.usuario_proprietario_id(v_ator);
  if v_owner is null or not public.pode_escrever_vistoria_chamado(v_owner,v_ator) then
    raise exception 'Seu perfil nao pode abrir chamados nesta conta.';
  end if;
  if not exists(select 1 from public.imoveis i where i.id=p_imovel_id and i.user_id=v_owner) then
    raise exception 'Imovel nao encontrado nesta conta.';
  end if;
  if nullif(trim(coalesce(p_dados->>'titulo','')),'') is null then
    raise exception 'Informe o titulo do chamado.';
  end if;
  if v_status not in ('aberto','aguardando_orcamento','aprovado','em_andamento',
                      'aguardando_peca','resolvido','cancelado') then
    raise exception 'Situacao de chamado invalida.';
  end if;
  if jsonb_typeof(v_historico)<>'array' then
    raise exception 'Historico do chamado invalido.';
  end if;

  -- Se a resposta da rede se perdeu, a repeticao devolve o mesmo registro.
  select * into v_row from public.chamados c where c.id=p_id;
  if found then
    if v_row.user_id<>v_owner or v_row.imovel_id<>p_imovel_id then
      raise exception 'Identificador de chamado indisponivel.';
    end if;
    return to_jsonb(v_row);
  end if;

  insert into public.chamados(
    id,user_id,imovel_id,inquilino_id,titulo,descricao,categoria,prioridade,
    status,aberto_por,resposta,despesa_id,resolvido_em,prazo,responsavel,
    fornecedor,orcamento,custo_final,quem_paga,observacoes,
    motivo_encerramento,encerrado_em,arquivado_em,historico,updated_at
  ) values (
    p_id,v_owner,p_imovel_id,null,trim(p_dados->>'titulo'),
    coalesce(p_dados->>'descricao',''),
    case when p_dados->>'categoria' in
      ('hidraulica','eletrica','estrutura','eletrodomestico','pintura','outro')
      then p_dados->>'categoria' else 'outro' end,
    case when p_dados->>'prioridade' in ('urgente','alta','normal','baixa')
      then p_dados->>'prioridade' else 'normal' end,
    v_status,'proprietario',coalesce(p_dados->>'resposta',''),null,
    case when v_status='resolvido' then
      coalesce(nullif(p_dados->>'resolvido_em','')::timestamptz,now()) else null end,
    nullif(p_dados->>'prazo','')::date,
    left(coalesce(p_dados->>'responsavel',''),180),
    left(coalesce(p_dados->>'fornecedor',''),180),
    nullif(p_dados->>'orcamento','')::numeric,
    nullif(p_dados->>'custo_final','')::numeric,
    case when p_dados->>'quem_paga' in ('proprietario','inquilino','dividido','outro')
      then p_dados->>'quem_paga' else 'proprietario' end,
    left(coalesce(p_dados->>'observacoes',''),4000),
    left(coalesce(p_dados->>'motivo_encerramento',''),600),
    case when v_status in ('resolvido','cancelado') then
      coalesce(nullif(p_dados->>'encerrado_em','')::timestamptz,now()) else null end,
    null,v_historico,now()
  ) returning * into v_row;
  return to_jsonb(v_row);
end
$$;

revoke all on function public.criar_chamado_manutencao(uuid,uuid,jsonb)
  from public,anon;
grant execute on function public.criar_chamado_manutencao(uuid,uuid,jsonb)
  to authenticated;

-- Exclusao integral dos dados operacionais em uma unica transacao.
-- Conta, perfil, configuracoes, assinatura, termos e backups sao preservados.
create or replace function public.apagar_dados_operacionais_conta()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_ator uuid:=auth.uid();
  v_owner uuid;
  v_paths text[]:='{}'::text[];
begin
  if v_ator is null then raise exception 'Faca login para apagar os dados.'; end if;
  v_owner:=public.usuario_proprietario_id(v_ator);
  if v_owner is null or v_ator<>v_owner then
    raise exception 'Somente o proprietario principal pode apagar todos os dados.';
  end if;

  select coalesce(array_agg(distinct path),'{}'::text[]) into v_paths
  from (
    select f.storage_path path from public.fotos f
      where f.user_id=v_owner and nullif(f.storage_path,'') is not null
    union all select d.storage_path from public.documentos d
      where d.user_id=v_owner and nullif(d.storage_path,'') is not null
    union all select e.foto_path from public.energia e
      where e.user_id=v_owner and nullif(e.foto_path,'') is not null
    union all select vf.caminho from public.vistoria_fotos vf
      where vf.user_id=v_owner and nullif(vf.caminho,'') is not null
    union all select cf.caminho from public.chamado_fotos cf
      where cf.user_id=v_owner and nullif(cf.caminho,'') is not null
    union all select vfi.storage_path from public.vitrine_fotos vfi
      where vfi.user_id=v_owner and nullif(vfi.storage_path,'') is not null
    union all select vft.thumb_path from public.vitrine_fotos vft
      where vft.user_id=v_owner and nullif(vft.thumb_path,'') is not null
    union all select vc.foto_path from public.vitrine_cidades vc
      where vc.user_id=v_owner and nullif(vc.foto_path,'') is not null
  ) arquivos;

  delete from public.chamado_fotos where user_id=v_owner;
  delete from public.vistoria_fotos where user_id=v_owner;
  delete from public.fotos where user_id=v_owner;
  delete from public.financeiro_recebimentos where user_id=v_owner;
  delete from public.financeiro_cobrancas where user_id=v_owner;
  delete from public.pagamentos where user_id=v_owner;
  delete from public.energia where user_id=v_owner;
  delete from public.chamados where user_id=v_owner;
  delete from public.vistorias where user_id=v_owner;
  delete from public.despesas where user_id=v_owner;
  delete from public.historico_status where user_id=v_owner;
  delete from public.aluguel_historico where user_id=v_owner;
  delete from public.documentos where user_id=v_owner;
  delete from public.contratos where user_id=v_owner;

  -- Etapas 7 e 8: historico, tarefas, propostas e vinculos saem por
  -- cascata com o interessado; a telemetria tecnica precisa ser explicita.
  if to_regclass('public.vitrine_observabilidade') is not null then
    execute 'delete from public.vitrine_observabilidade where user_id=$1' using v_owner;
  end if;

  -- Etapas 5 e 6 podem ainda nao existir em bancos antigos. Quando
  -- existirem, a limpeza precisa remover tambem retencao e agenda.
  if to_regclass('public.vitrine_visitas') is not null then
    execute 'delete from public.vitrine_visitas where user_id=$1' using v_owner;
  end if;
  if to_regclass('public.vitrine_alertas_preco') is not null then
    execute 'delete from public.vitrine_alertas_preco where user_id=$1' using v_owner;
  end if;
  if to_regclass('public.vitrine_buscas_salvas') is not null then
    execute 'delete from public.vitrine_buscas_salvas where user_id=$1' using v_owner;
  end if;
  if to_regclass('public.vitrine_disponibilidade') is not null then
    execute 'delete from public.vitrine_disponibilidade where user_id=$1' using v_owner;
  end if;
  if to_regclass('public.vitrine_agenda_config') is not null then
    execute 'delete from public.vitrine_agenda_config where user_id=$1' using v_owner;
  end if;
  delete from public.vitrine_fotos where user_id=v_owner;
  delete from public.vitrine_leads where user_id=v_owner;
  delete from public.vitrine_taxas where user_id=v_owner;
  if to_regclass('public.vitrine_documentacao_imovel') is not null then
    execute 'delete from public.vitrine_documentacao_imovel where user_id=$1' using v_owner;
  end if;
  if to_regclass('public.vitrine_imovel_comodidades') is not null then
    execute 'delete from public.vitrine_imovel_comodidades where user_id=$1' using v_owner;
  end if;
  delete from public.vitrine_imoveis where user_id=v_owner;
  if to_regclass('public.vitrine_comodidades_catalogo') is not null then
    execute 'delete from public.vitrine_comodidades_catalogo where user_id=$1' using v_owner;
  end if;
  delete from public.vitrine_anunciantes where user_id=v_owner;
  delete from public.vitrine_cidades where user_id=v_owner;

  delete from public.convites_inquilino where proprietario_id=v_owner;
  delete from public.acessos_inquilino where proprietario_id=v_owner;
  delete from public.interessados where user_id=v_owner;
  delete from public.imoveis where user_id=v_owner;
  delete from public.inquilinos where user_id=v_owner;
  delete from public.proprietarios_clientes where user_id=v_owner;
  delete from public.eventos where user_id=v_owner;
  delete from public.convites_colaborador where proprietario_id=v_owner;
  delete from public.acessos_colaborador where proprietario_id=v_owner;
  -- Por ultimo: gatilhos das exclusoes acima podem ter criado auditoria.
  delete from public.financeiro_auditoria where user_id=v_owner;

  return jsonb_build_object('ok',true,'storage_paths',to_jsonb(v_paths));
end
$$;

revoke all on function public.apagar_dados_operacionais_conta()
  from public,anon;
grant execute on function public.apagar_dados_operacionais_conta()
  to authenticated;

commit;
