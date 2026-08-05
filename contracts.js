/* ============================================================
   contracts.js — histórico de contratos e regras de vencimento.
   Cada período pertence a uma casa e a um inquilino específico.
   ============================================================ */

function contractTenant(contract){
  return state.tenants.find(function(t){return t.id===contract.tenantId;})||null;
}
function contractModeLabel(contract){
  return contractMode(contract)==='entrada'
    ? 'Todo dia '+contractBillingDay(contract)+' (dia da entrada)'
    : 'Todo dia '+contractBillingDay(contract)+' (dia fixo)';
}
function contractStatusLabel(contract){
  if(contract.fim&&contract.fim<todayISO()) return 'ENCERRADO';
  if(contract.inicio&&contract.inicio>todayISO()) return 'PROGRAMADO';
  if(contract.ativo) return 'ATIVO';
  return 'INATIVO';
}
function contractStatusTone(contract){ return contractStatusLabel(contract)==='ATIVO'?'brass':'slate'; }
function contractHasFinancialHistory(house,contract){
  if(!house||!contract)return false;
  const contractId=String(contract.id||'');
  const linkedChargeIds=(house.cobrancas||[]).filter(function(item){
    return String(item.contractId||'')===contractId;
  }).map(function(item){return String(item.id||'');});
  return (house.pagamentos||[]).some(function(item){return String(item.contractId||'')===contractId;})
    ||(house.energias||[]).some(function(item){return String(item.contractId||'')===contractId;})
    ||(house.aluguelHistorico||[]).some(function(item){return String(item.contractId||'')===contractId;})
    ||linkedChargeIds.length>0
    ||(house.recebimentos||[]).some(function(item){
      return linkedChargeIds.includes(String(item.cobrancaId||''));
    });
}

function contractFormFieldsHtml(defaults){
  const c=defaults||{};
  return '<div class="field-row">'+
      '<label class="field"><span>Início do contrato</span><input id="f_ini" type="date" value="'+esc(c.inicio||todayISO())+'" oninput="updateContractFormPreview()"></label>'+
      '<label class="field"><span>Fim do contrato (opcional)</span><input id="f_fim" type="date" value="'+esc(c.fim||'')+'"></label>'+
    '</div>'+
    '<div class="field-row">'+
      '<label class="field"><span>Aluguel mensal (R$)</span><input id="f_contract_valor" type="number" min="0" step="0.01" value="'+(Number(c.valor)||0)+'" oninput="updateContractFormPreview()"></label>'+
      '<label class="field"><span>Forma de vencimento</span><select id="f_modalidade" onchange="updateContractFormPreview()">'+
        '<option value="entrada"'+(contractMode(c)==='entrada'?' selected':'')+'>Mesmo dia da entrada</option>'+
        '<option value="fixo"'+(contractMode(c)==='fixo'?' selected':'')+'>Dia fixo do mês</option>'+
      '</select></label>'+
    '</div>'+
    '<label class="field" id="contractDueField"><span>Dia fixo do vencimento</span><input id="f_contract_dia" type="number" min="1" max="31" value="'+contractBillingDay(c)+'" oninput="updateContractFormPreview()"></label>'+
    '<div id="contractPreview" class="contract-preview"></div>';
}

function updateContractFormPreview(){
  const ini=document.getElementById('f_ini'),mode=document.getElementById('f_modalidade');
  const dueInput=document.getElementById('f_contract_dia'),valueInput=document.getElementById('f_contract_valor');
  const root=document.getElementById('contractPreview'),field=document.getElementById('contractDueField');
  if(!ini||!mode||!dueInput||!root) return;
  const start=ini.value||todayISO();
  if(mode.value==='entrada'){
    dueInput.value=String(Number(start.slice(8,10))||1);
    dueInput.disabled=true;
    if(field) field.classList.add('field-muted');
  }else{
    dueInput.disabled=false;
    if(field) field.classList.remove('field-muted');
  }
  const draft={inicio:start,modalidade:mode.value,diaVencimento:Number(dueInput.value)||1,valor:Number(valueInput&&valueInput.value)||0};
  const days=contractProrataDays(draft),amount=contractProrataValue(draft);
  root.innerHTML=mode.value==='entrada'
    ? '<strong>Primeiro pagamento:</strong> aluguel completo na entrada; depois, todo dia '+contractBillingDay(draft)+'.'
    : (days
      ? '<strong>Ajuste inicial:</strong> '+days+' dia(s) × '+fmtMoney(draft.valor/30)+' = <b>'+fmtMoney(amount)+'</b>. Depois, aluguel completo todo dia '+contractBillingDay(draft)+'.'
      : '<strong>Sem ajuste inicial:</strong> a entrada já coincide com o vencimento.');
}

function readContractForm(){
  const inicio=document.getElementById('f_ini').value;
  const fim=document.getElementById('f_fim').value;
  const modalidade=document.getElementById('f_modalidade').value;
  const valor=Number(document.getElementById('f_contract_valor').value)||0;
  const dia=modalidade==='entrada'?(Number(inicio.slice(8,10))||1):Math.min(31,Math.max(1,Number(document.getElementById('f_contract_dia').value)||1));
  const draft={inicio:inicio,fim:fim,modalidade:modalidade,valor:valor,diaVencimento:dia};
  draft.proporcionalDias=contractProrataDays(draft);
  draft.proporcionalValor=contractProrataValue(draft);
  return draft;
}

function validateContractDraft(house,draft,ignoreId){
  if(!draft.inicio) return 'Informe o início do contrato.';
  if(draft.fim&&draft.fim<draft.inicio) return 'O fim não pode ser anterior ao início.';
  if(draft.valor<=0) return 'Informe o valor mensal do aluguel.';
  const overlaps=(house.contracts||[]).some(function(c){
    if(c.id===ignoreId) return false;
    const aEnd=draft.fim||'9999-12-31',bEnd=c.fim||'9999-12-31';
    return draft.inicio<=bEnd&&(c.inicio||'0000-01-01')<=aEnd;
  });
  return overlaps?'Já existe outro contrato ocupando esse período nesta casa.':'';
}

function openQuickRentPayment(houseId){
  if(!requireFinancePermission())return;
  const h=state.houses.find(function(x){return x.id===houseId;});
  const c=currentRentContract(h);
  if(!c){showToast('Cadastre um contrato ativo para esta casa.','error');return;}
  const adjustment=contractProrataPaymentSnapshot(h,c);
  if(adjustment.expected>0&&adjustment.remaining>0){openProrataPaymentModal(houseId,c.id);return;}
  const cur=currentMonthStr(),first=contractFirstFullMonth(c);
  const mes=contractCoversMonth(c,cur)?cur:(first&&first>cur?first:cur);
  openPaymentModal(houseId,mes,c.id);
}

function contractProrataCharge(house,contract){
  if(!house||!contract) return null;
  const charges=activeMoneyRecords(house.cobrancas).filter(function(charge){
    return charge.tipo==='ajuste'&&String(charge.contractId||'')===String(contract.id);
  });
  return charges.find(function(charge){
    return charge.origemTipo==='contrato_ajuste'&&String(charge.origemId||'')===String(contract.id);
  })||charges[0]||null;
}

function contractProrataPaymentSnapshot(house,contract){
  return contractProrataFinancialSnapshot(house,contract);
}

function contractProrataStatusLabel(status){
  const labels={
    nao_necessario:'Não necessário',
    pago:'Pago',
    pago_atraso:'Pago com atraso',
    parcial:'Pagamento parcial',
    parcial_atrasado:'Pagamento parcial em atraso',
    pendente:'A vencer',
    tolerancia:'Em tolerância',
    atrasado:'Em atraso',
    credito:'Crédito a favor'
  };
  return labels[status]||'A vencer';
}

function openProrataPaymentModal(houseId,contractId){
  if(!requireFinancePermission())return;
  const h=state.houses.find(function(x){return x.id===houseId;});
  const c=h&&(h.contracts||[]).find(function(x){return x.id===contractId;});
  if(!h||!c) return;
  const t=contractTenant(c),days=contractProrataDays(c);
  const snapshot=contractProrataPaymentSnapshot(h,c);
  const overdue=snapshot.status==='atrasado'||snapshot.status==='parcial_atrasado';
  const receiptOperationId=newOperationId();
  const receiptsHtml=snapshot.receipts.slice().sort(function(a,b){
    return String(b.dataPagamento||'').localeCompare(String(a.dataPagamento||''));
  }).map(function(receipt){
    return '<div class="ledger-row"><div class="ledger-row-main">'+fmtDateBR(receipt.dataPagamento)+
      '<div class="ledger-row-sub">'+esc(receipt.forma||'Forma não informada')+
      (receipt.observacao?' · '+esc(receipt.observacao):'')+'</div></div>'+
      '<strong class="ledger-row-value num">'+fmtMoney(receipt.valor)+'</strong>'+
      '<button class="btn btn-ghost btn-sm" onclick="openArchiveProrataReceiptModal(\''+houseId+'\',\''+contractId+'\',\''+receipt.id+'\')">Arquivar</button></div>';
  }).join('');
  openModal('<h3 class="modal-title">Ajuste inicial do contrato</h3>'+
    '<p class="modal-text">'+esc(h.nome)+' · '+esc(t?t.nome:'Inquilino')+'</p>'+
    '<span class="simple-modal-status '+(overdue?'overdue':'')+'">'+esc(contractProrataStatusLabel(snapshot.status).toUpperCase())+'</span>'+
    '<p class="modal-hint">'+days+' dia(s) proporcionais. Não há multa nem juros; a tolerância é de 5 dias.</p>'+
    '<div class="simple-modal-values"><div><span>Previsto</span><strong class="num">'+fmtMoney(snapshot.expected)+'</strong></div>'+
      '<div><span>Recebido</span><strong class="num">'+fmtMoney(snapshot.received)+'</strong></div>'+
      '<div><span>'+(snapshot.credit?'Crédito':'Saldo')+'</span><strong class="num">'+fmtMoney(snapshot.credit||snapshot.remaining)+'</strong></div></div>'+
    (snapshot.remaining>0
      ? '<input id="f_prorata_origin" type="hidden" value="'+receiptOperationId+'">'+
        '<label class="field"><span>Valor desta parcela (R$)</span><input id="f_prorata_value" type="number" min="0.01" max="'+snapshot.remaining+'" step="0.01" value="'+snapshot.remaining+'"></label>'+
        '<div class="field-row"><label class="field"><span>Data do recebimento</span><input id="f_prorata_data" type="date" value="'+todayISO()+'"></label>'+
          '<label class="field"><span>Forma (opcional)</span><select id="f_prorata_method"><option value="">Não informar</option>'+
            ['PIX','Dinheiro','Transferência','Cartão','Outro'].map(function(method){return '<option>'+method+'</option>';}).join('')+
          '</select></label></div>'+
        '<label class="field"><span>Observação (opcional)</span><input id="f_prorata_note" maxlength="500" placeholder="Ex.: 1ª parcela"></label>'
      : '<div class="notice-box"><strong>Ajuste quitado.</strong> O histórico abaixo preserva cada recebimento separadamente.</div>')+
    (receiptsHtml?'<div class="form-section-title">Recebimentos já registrados</div><div class="list-card"><div class="ledger">'+receiptsHtml+'</div></div>':'')+
    '<div class="modal-actions"><span></span><div class="modal-actions-right"><button class="btn btn-ghost" onclick="closeModal()">'+(snapshot.remaining>0?'Cancelar':'Fechar')+'</button>'+
      (snapshot.remaining>0?'<button id="btn_save_prorata" class="btn btn-primary" onclick="saveProrataPayment(\''+houseId+'\',\''+contractId+'\')">Registrar parcela</button>':'')+'</div></div>');
}

async function saveProrataPayment(houseId,contractId){
  if(!requireFinancePermission())return;
  const h=state.houses.find(function(x){return x.id===houseId;});
  const c=h&&(h.contracts||[]).find(function(x){return x.id===contractId;});
  if(!h||!c) return;
  const snapshot=contractProrataPaymentSnapshot(h,c);
  const value=Math.round((parseFloat(((document.getElementById('f_prorata_value')||{}).value)||'')||0)*100)/100;
  const date=((document.getElementById('f_prorata_data')||{}).value)||todayISO();
  const method=((document.getElementById('f_prorata_method')||{}).value)||'';
  const note=((document.getElementById('f_prorata_note')||{}).value||'').trim();
  const originId=((document.getElementById('f_prorata_origin')||{}).value)||newOperationId();
  if(snapshot.expected<=0){showToast('Este contrato não possui ajuste inicial.','error');return;}
  if(snapshot.remaining<=0){showToast('O ajuste inicial já está quitado.','success');return;}
  if(value<=0){showToast('Informe o valor recebido nesta parcela.','error');return;}
  if(value-snapshot.remaining>0.005){
    showToast('A parcela não pode ultrapassar o saldo de '+fmtMoney(snapshot.remaining)+'.','error');
    return;
  }
  const submitButton=document.getElementById('btn_save_prorata');
  if(submitButton&&submitButton.disabled)return;
  if(submitButton){submitButton.disabled=true;submitButton.textContent='Registrando…';}
  try{
    const competencia=String(c.inicio||date).slice(0,7);
    const charge=snapshot.charge||await db.upsertCharge(houseId,{
        houseId:houseId,
        contractId:c.id,
        tenantId:c.tenantId||'',
        mes:competencia,
        competencia:competencia,
        tipo:'ajuste',
        descricao:'Ajuste inicial do contrato',
        valorPrevisto:snapshot.expected,
        vencimento:c.inicio||date,
        toleranciaDias:DEFAULT_PAYMENT_GRACE_DAYS,
        origemTipo:'contrato_ajuste',
        origemId:c.id,
        observacao:'Ajuste proporcional do início do contrato.'
      });
    const serverReceived=Math.max(snapshot.received,Number(charge.totalRecebido)||0);
    const serverRemaining=Math.max(0,Math.round((snapshot.expected-serverReceived)*100)/100);
    if(value-serverRemaining>0.005){
      showToast('O saldo foi atualizado. A parcela não pode ultrapassar '+fmtMoney(serverRemaining)+'.','error');
      return;
    }
    const receipt=await db.insertReceipt({
      cobrancaId:charge.id,
      valor:value,
      dataPagamento:date,
      competenciaCaixa:date.slice(0,7),
      forma:method,
      observacao:note,
      origemTipo:'manual',
      origemId:originId
    });
    h.cobrancas=h.cobrancas||[];
    const chargeIndex=h.cobrancas.findIndex(function(item){return item.id===charge.id;});
    const updatedTotal=Math.round((serverReceived+value)*100)/100;
    charge.totalRecebido=updatedTotal;
    charge.saldoAberto=Math.max(0,Math.round((snapshot.expected-updatedTotal)*100)/100);
    charge.creditoAFavor=0;
    charge.status=charge.saldoAberto>0?'pagamento_parcial':'pago';
    if(chargeIndex>=0) h.cobrancas[chargeIndex]=charge; else h.cobrancas.push(charge);
    h.recebimentos=h.recebimentos||[];
    h.recebimentos.push(receipt);
    closeModal();
    render();
    showToast(charge.saldoAberto>0
      ? 'Parcela registrada. Saldo do ajuste: '+fmtMoney(charge.saldoAberto)+'.'
      : 'Ajuste inicial quitado.','success');
  }catch(e){
    if(submitButton){submitButton.disabled=false;submitButton.textContent='Registrar parcela';}
    console.error(e);
    const unavailable=typeof financeV2Unavailable==='function'&&financeV2Unavailable(e);
    showToast(unavailable
      ? 'Aplique a migração Financeiro V2 para registrar parcelas do ajuste inicial.'
      : 'Não foi possível registrar a parcela do ajuste inicial.','error');
  }
}

function openArchiveProrataReceiptModal(houseId,contractId,receiptId){
  if(!requireFinancePermission())return;
  openModal(
    '<h3 class="modal-title">Arquivar esta parcela?</h3>'+
    '<p class="modal-text">Ela sairá do total recebido do ajuste inicial, mas poderá ser restaurada depois.</p>'+
    '<label class="field"><span>Motivo do arquivamento</span><input id="f_archive_prorata_reason" maxlength="300" placeholder="Ex.: parcela registrada em duplicidade"></label>'+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="openProrataPaymentModal(\''+houseId+'\',\''+contractId+'\')">Voltar</button>'+
      '<button class="btn btn-danger" onclick="archiveProrataReceipt(\''+houseId+'\',\''+contractId+'\',\''+receiptId+'\')">Arquivar parcela</button></div>'
  );
}
async function archiveProrataReceipt(houseId,contractId,receiptId){
  if(!requireFinancePermission())return;
  const h=state.houses.find(function(item){return item.id===houseId;});
  const receipt=h&&(h.recebimentos||[]).find(function(item){return item.id===receiptId;});
  const reason=((document.getElementById('f_archive_prorata_reason')||{}).value||'').trim();
  if(!receipt){showToast('Esta parcela não está mais disponível.','error');return;}
  if(reason.length<3){showToast('Informe o motivo do arquivamento.','error');return;}
  try{
    await db.archiveReceipt(receiptId,reason);
    receipt.arquivadoEm=new Date().toISOString();
    openProrataPaymentModal(houseId,contractId);
    showToast('Parcela arquivada.','success');
  }catch(error){
    console.error(error);
    showToast((error&&error.message)||'Não foi possível arquivar a parcela.','error');
  }
}

function renderContractCard(h,c){
  const t=contractTenant(c),prorata=contractProrataValue(c);
  const adjustment=contractProrataPaymentSnapshot(h,c);
  const isCurrent=contractStatusLabel(c)==='ATIVO';
  const isScheduled=contractStatusLabel(c)==='PROGRAMADO';
  const hasHistory=contractHasFinancialHistory(h,c);
  const rentReference=isCurrent
    ?currentMonthStr()
    :(isScheduled?(contractFirstFullMonth(c)||String(c.inicio||'').slice(0,7)):String(c.fim||c.inicio||'').slice(0,7));
  const displayedRent=contractRentValueAt(c,rentReference);
  const canArchive=!c.ativo&&!!c.fim&&c.fim<=todayISO();
  const mayManageFinance=canManageFinance();
  const mayOperate=canOperateProperties();
  return '<article class="contract-card '+(isCurrent?'active':'')+'"><div class="contract-card-head"><div><span class="field-kicker">'+esc(isCurrent?'VÍNCULO ATUAL':'HISTÓRICO DO VÍNCULO')+'</span><h3>'+esc(t?t.nome:'Inquilino não encontrado')+'</h3></div><span class="chip chip-'+contractStatusTone(c)+'">'+esc(contractStatusLabel(c))+'</span></div>'+
    '<div class="contract-card-grid"><div><span>Período do vínculo</span><strong>'+fmtDateBR(c.inicio)+' — '+(c.fim?fmtDateBR(c.fim):'em aberto')+'</strong></div>'+
      '<div><span>Aluguel mensal</span><strong class="num">'+fmtMoney(displayedRent)+'</strong></div>'+
      '<div><span>Regra de vencimento</span><strong>'+esc(contractModeLabel(c))+'</strong></div>'+
      '<div><span>Ajuste de entrada</span><strong>'+(prorata
        ? fmtMoney(prorata)+' · '+esc(contractProrataStatusLabel(adjustment.status).toLowerCase())+
          (adjustment.credit?' · '+fmtMoney(adjustment.credit):adjustment.remaining>0?' · saldo '+fmtMoney(adjustment.remaining):'')
        :'não necessário')+'</strong></div></div>'+
    (c.valorInicialRevisar
      ?'<div class="notice-box"><strong>Conferência pendente:</strong> o valor inicial veio da versão anterior da plataforma. O contrato foi preservado sem reescrever o histórico.'+
        (canAdministerAccount()?'<div class="quick-actions"><button class="btn btn-ghost btn-sm" onclick="openReviewInitialContractValue(\''+h.id+'\',\''+c.id+'\')">Conferir valor inicial</button></div>':'')+
        '</div>'
      :'')+
    '<div class="contract-card-actions">'+
      (mayManageFinance&&prorata?'<button class="btn btn-ghost btn-sm" onclick="openProrataPaymentModal(\''+h.id+'\',\''+c.id+'\')">'+
        (adjustment.remaining<=0?'Ver recebimentos':adjustment.received>0?'Registrar outra parcela':'Registrar ajuste')+'</button>':'')+
      (mayOperate?'<button class="btn btn-ghost btn-sm" onclick="openEditContractModal(\''+h.id+'\',\''+c.id+'\')">'+(isScheduled&&!hasHistory?'Editar programação':'Ver condições')+'</button>':'')+
      (mayOperate&&isCurrent?'<button class="btn btn-primary btn-sm" onclick="openFinishContractModal(\''+h.id+'\',\''+c.id+'\')">Registrar saída</button>':'')+
      (mayOperate&&!hasHistory?'<button class="btn btn-ghost btn-sm" onclick="openCorrectContractLinkModal(\''+h.id+'\',\''+c.id+'\')">Corrigir vínculo</button>':'')+
      (mayOperate&&canArchive?'<button class="btn btn-danger btn-sm" onclick="openArchiveContractModal(\''+h.id+'\',\''+c.id+'\')">Arquivar contrato</button>':'')+
    '</div></article>';
}

function openReviewInitialContractValue(houseId,contractId){
  if(!requireAccountPermission(canAdministerAccount(),'Somente administradores podem conferir o valor inicial.'))return;
  const h=state.houses.find(function(item){return item.id===houseId;});
  const c=h&&(h.contracts||[]).find(function(item){return item.id===contractId;});
  if(!h||!c||!c.valorInicialRevisar){
    showToast('Este valor inicial já foi conferido.','error');
    return;
  }
  const hasHistory=contractHasFinancialHistory(h,c);
  openModal(
    '<h3 class="modal-title">Conferir valor inicial</h3>'+
    '<p class="modal-text">'+esc(h.nome)+' · contrato iniciado em '+fmtDateBR(c.inicio)+'</p>'+
    '<div class="notice-box"><strong>Use o contrato original como referência.</strong> Esta é uma conferência única dos dados trazidos da versão antiga; reajustes posteriores continuam no fluxo “Propor reajuste”.</div>'+
    (hasHistory?'<div class="notice-box">Este vínculo já possui histórico financeiro. Se o valor for corrigido, cobranças já geradas permanecem congeladas; relatórios de meses sem cobrança usarão a base que você confirmar agora.</div>':'')+
    '<label class="field"><span>Aluguel inicial do contrato (R$)</span><input id="f_review_initial_value" type="number" min="0.01" step="0.01" value="'+(Number(c.valorInicial==null?c.valor:c.valorInicial)||0)+'"></label>'+
    '<label class="check-line"><input id="f_review_initial_confirmed" type="checkbox"><span>Conferi este valor no contrato ou em outro registro confiável.</span></label>'+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button id="btn_review_initial" class="btn btn-primary" onclick="saveReviewInitialContractValue(\''+houseId+'\',\''+contractId+'\')">Confirmar valor inicial</button></div>'
  );
}
async function saveReviewInitialContractValue(houseId,contractId){
  if(!requireAccountPermission(canAdministerAccount(),'Somente administradores podem conferir o valor inicial.'))return;
  const h=state.houses.find(function(item){return item.id===houseId;});
  const c=h&&(h.contracts||[]).find(function(item){return item.id===contractId;});
  const value=parseFloat(((document.getElementById('f_review_initial_value')||{}).value)||'')||0;
  const checked=!!((document.getElementById('f_review_initial_confirmed')||{}).checked);
  if(!c||!c.valorInicialRevisar){showToast('Este valor inicial já foi conferido.','error');return;}
  if(value<=0){showToast('Informe um aluguel inicial maior que zero.','error');return;}
  if(!checked){showToast('Confirme que você conferiu uma fonte confiável.','error');return;}
  const button=document.getElementById('btn_review_initial');
  if(button&&button.disabled)return;
  if(button){button.disabled=true;button.textContent='Confirmando…';}
  try{
    const result=await db.confirmContractInitialValue(contractId,value);
    c.valor=Number(result.valorInicial==null?value:result.valorInicial)||value;
    c.valorInicial=c.valor;
    c.valorInicialRevisar=false;
    c.valorInicialOrigem=result.valorInicialOrigem||'revisao_manual_confirmada';
    closeModal();render();
    showToast('Valor inicial conferido e registrado na auditoria.','success');
  }catch(error){
    if(button){button.disabled=false;button.textContent='Confirmar valor inicial';}
    console.error(error);
    showToast((error&&error.message)||'Não foi possível confirmar o valor inicial.','error');
  }
}

function renderContractsTab(h){
  const list=(h.contracts||[]).slice().sort(function(a,b){return String(b.inicio).localeCompare(String(a.inicio));});
  if(!list.length) return emptyState('Nenhum contrato cadastrado para esta casa.',FICO.doc)+
    (canOperateProperties()?'<div class="quick-actions"><button class="btn btn-primary btn-sm" onclick="openAssignTenantModal(\''+h.id+'\')">Criar primeiro vínculo</button></div>':'');
  const current=list.filter(function(c){return contractStatusLabel(c)==='ATIVO';});
  const history=list.filter(function(c){return contractStatusLabel(c)!=='ATIVO';});
  return '<div class="tab-summary-row"><div><strong>'+list.length+'</strong> vínculo(s) preservado(s), incluindo os encerrados</div>'+
    (canOperateProperties()&&h.status!=='alugada'?'<button class="btn btn-primary btn-sm" onclick="openAssignTenantModal(\''+h.id+'\')">+ Novo vínculo</button>':'')+'</div>'+
    (current.length
      ? fieldSection(FICO.doc,'Contrato atual')+'<div class="contract-list">'+current.map(function(c){return renderContractCard(h,c);}).join('')+'</div>'
      : '<div class="notice-box"><strong>Sem contrato atual.</strong> O histórico abaixo continua preservado.</div>')+
    (history.length
      ? fieldSection(FICO.clock,'Contratos anteriores e programados')+'<div class="contract-list">'+history.map(function(c){return renderContractCard(h,c);}).join('')+'</div>'
      : '');
}

function openCorrectContractLinkModal(houseId,contractId){
  if(!requirePropertyPermission())return;
  const h=state.houses.find(function(item){return item.id===houseId;});
  const c=h&&(h.contracts||[]).find(function(item){return item.id===contractId;});
  if(!h||!c) return;
  if(contractHasFinancialHistory(h,c)){
    openModal(
      '<h3 class="modal-title">Vínculo protegido</h3>'+
      '<p class="modal-text">Este contrato já possui movimentações. Trocar o inquilino agora poderia atribuir cobranças e recebimentos à pessoa errada.</p>'+
      '<div class="notice-box">Se o vínculo real estiver incorreto, arquive os lançamentos feitos por engano ou encerre o contrato e crie o vínculo correto. Nenhum histórico será reescrito silenciosamente.</div>'+
      '<div class="modal-actions"><span></span><button class="btn btn-ghost" onclick="closeModal()">Fechar</button></div>'
    );
    return;
  }
  const current=contractTenant(c);
  const options=(state.tenants||[]).map(function(t){
    return '<option value="'+esc(t.id)+'"'+(t.id===c.tenantId?' selected':'')+'>'+esc(t.nome)+'</option>';
  }).join('');
  if(!options){
    showToast('Cadastre o inquilino correto antes de ajustar o vínculo.','error');
    return;
  }
  openModal(
    '<h3 class="modal-title">Corrigir vínculo do contrato</h3>'+
    '<p class="modal-text">Use esta opção somente quando o contrato foi associado à pessoa errada. Datas, valores, pagamentos e energia continuarão ligados ao mesmo contrato.</p>'+
    '<div class="notice-box"><strong>Histórico preservado.</strong> Esta correção não exclui o contrato nem os lançamentos já registrados.</div>'+
    '<label class="field"><span>Inquilino atualmente vinculado</span><input value="'+esc(current?current.nome:'Não encontrado')+'" disabled></label>'+
    '<label class="field"><span>Inquilino correto</span><select id="f_correct_contract_tenant">'+options+'</select></label>'+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-primary" onclick="saveCorrectContractLink(\''+houseId+'\',\''+contractId+'\')">Salvar correção</button>'+
    '</div></div>'
  );
}

async function saveCorrectContractLink(houseId,contractId){
  if(!requirePropertyPermission())return;
  const h=state.houses.find(function(item){return item.id===houseId;});
  const c=h&&(h.contracts||[]).find(function(item){return item.id===contractId;});
  const select=document.getElementById('f_correct_contract_tenant');
  const tenantId=select&&select.value;
  const tenant=state.tenants.find(function(item){return item.id===tenantId;});
  if(!h||!c||!tenant){
    showToast('Selecione o inquilino correto.','error');
    return;
  }
  if(contractHasFinancialHistory(h,c)){
    showToast('O vínculo foi protegido porque o contrato já possui histórico financeiro.','error');
    return;
  }
  if(tenantId===c.tenantId){
    closeModal();
    showToast('O vínculo já está associado a este inquilino.','success');
    return;
  }

  const oldTenantId=c.tenantId;
  const oldHouseTenantId=h.tenantId;
  const oldHistory=(h.statusHistorico||[]).map(function(item){return Object.assign({},item);});
  const updatedContract=Object.assign({},c,{tenantId:tenantId});
  const correctedHistory=oldHistory.map(function(item){
    const insideContract=item.data>=(c.inicio||'0000-01-01')&&(!c.fim||item.data<=c.fim);
    return insideContract&&item.tenantId===oldTenantId
      ? Object.assign({},item,{tenantId:tenantId})
      : Object.assign({},item);
  });

  try{
    await db.updateContract(updatedContract);
    if(c.ativo){
      h.tenantId=tenantId;
      await db.updateHouse(h);
    }
    if(correctedHistory.some(function(item,index){return item.tenantId!==oldHistory[index].tenantId;})){
      await db.replaceStatusHistory(h.id,correctedHistory);
      h.statusHistorico=correctedHistory;
    }
    Object.assign(c,updatedContract);
    closeModal();
    render();
    showToast('Vínculo corrigido. O histórico financeiro foi preservado.','success');
  }catch(e){
    h.tenantId=oldHouseTenantId;
    h.statusHistorico=oldHistory;
    try{
      await db.updateContract(Object.assign({},updatedContract,{tenantId:oldTenantId}));
      if(c.ativo) await db.updateHouse(h);
    }catch(rollbackError){
      console.error('Não foi possível desfazer automaticamente a correção incompleta.',rollbackError);
    }
    console.error(e);
    showToast((e&&e.message)||'Não foi possível corrigir o vínculo.','error');
  }
}

function openEditContractModal(houseId,contractId){
  if(!requirePropertyPermission())return;
  const h=state.houses.find(function(x){return x.id===houseId;});
  const c=(h.contracts||[]).find(function(x){return x.id===contractId;});
  if(!c) return;
  const t=contractTenant(c);
  const isScheduled=contractStatusLabel(c)==='PROGRAMADO';
  const hasHistory=contractHasFinancialHistory(h,c);
  if(!isScheduled||hasHistory){
    const reference=contractStatusLabel(c)==='ATIVO'
      ?currentMonthStr()
      :String(c.fim||c.inicio||'').slice(0,7);
    openModal(
      '<h3 class="modal-title">Condições do contrato</h3>'+
      '<p class="modal-text">'+esc(h.nome)+' · '+esc(t?t.nome:'Inquilino')+'</p>'+
      '<div class="field-card">'+
        '<div class="field-line"><span class="fl-label">Início</span><span class="fl-value">'+fmtDateBR(c.inicio)+'</span></div>'+
        '<div class="field-line"><span class="fl-label">Fim</span><span class="fl-value">'+(c.fim?fmtDateBR(c.fim):'Em aberto')+'</span></div>'+
        '<div class="field-line"><span class="fl-label">Aluguel vigente</span><strong class="fl-value num">'+fmtMoney(contractRentValueAt(c,reference))+'</strong></div>'+
        '<div class="field-line"><span class="fl-label">Vencimento</span><span class="fl-value">'+esc(contractModeLabel(c))+'</span></div>'+
      '</div>'+
      '<div class="notice-box"><strong>Histórico protegido.</strong> Valor, início e vencimento não são alterados retroativamente. Para mudar o aluguel, confirme um reajuste; para finalizar o vínculo, registre a saída.</div>'+
      '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
        (canAdministerAccount()&&c.ativo?'<button class="btn btn-ghost" onclick="closeModal();state.activeTab=\'reajustes\';render()">Ir para reajustes</button>':'')+
        (c.ativo?'<button class="btn btn-primary" onclick="openFinishContractModal(\''+houseId+'\',\''+contractId+'\')">Registrar saída</button>':'')+
        '<button class="btn btn-ghost" onclick="closeModal()">Fechar</button>'+
      '</div></div>'
    );
    return;
  }
  openModal('<h3 class="modal-title">Editar contrato</h3><p class="modal-text">'+esc(h.nome)+' · '+esc(t?t.nome:'Inquilino')+'</p>'+
    '<div class="notice-box">Como este contrato ainda não começou e não possui movimentações, sua programação pode ser corrigida. O valor-base permanece protegido; se ele estiver errado, arquive este contrato programado e crie outro.</div>'+
    contractFormFieldsHtml(c)+'<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveContractEdit(\''+houseId+'\',\''+contractId+'\')">Salvar contrato</button></div></div>');
  const valueInput=document.getElementById('f_contract_valor');
  if(valueInput)valueInput.disabled=true;
  updateContractFormPreview();
}

async function saveContractEdit(houseId,contractId){
  if(!requirePropertyPermission())return;
  const h=state.houses.find(function(x){return x.id===houseId;});
  const c=(h.contracts||[]).find(function(x){return x.id===contractId;});
  if(!h||!c)return;
  if(contractStatusLabel(c)!=='PROGRAMADO'||contractHasFinancialHistory(h,c)){
    showToast('As condições deste contrato já fazem parte do histórico e não podem ser reescritas.','error');
    return;
  }
  const draft=readContractForm(),validation=validateContractDraft(h,draft,contractId);
  if(validation){showToast(validation,'error');return;}
  if(draft.inicio<=todayISO()){
    showToast('Na edição de programação, mantenha o início em uma data futura. Para iniciar uma locação agora, use o fluxo de novo vínculo.','error');
    return;
  }
  if(Math.abs(Number(draft.valor)-Number(c.valor))>0.005){
    showToast('O valor-base de um contrato existente não pode ser alterado.','error');
    return;
  }
  const billingChanged=c.inicio!==draft.inicio||
    contractBillingDay(c)!==contractBillingDay(draft)||contractMode(c)!==contractMode(draft);
  if(!billingChanged){draft.proporcionalDias=c.proporcionalDias;draft.proporcionalValor=c.proporcionalValor;}
  const updated=Object.assign({},c,draft,{
    ativo:true,
    proporcionalPago:c.proporcionalPago,
    proporcionalDataPagamento:c.proporcionalDataPagamento
  });
  try{
    await db.updateContract(updated);
    Object.assign(c,updated);
    closeModal();render();showToast('Programação do contrato atualizada.','success');
  }catch(e){console.error(e);showToast('Não foi possível atualizar o contrato.','error');}
}

/* ---------- encerramento real x arquivamento recuperável ---------- */
function appendVacancyStatusState(h,eventDate){
  if(!h.statusHistorico) h.statusHistorico=[];
  const exists=h.statusHistorico.some(function(item){
    return item.data===eventDate&&item.status==='vaga'&&!(item.tenantId||'');
  });
  if(!exists) h.statusHistorico.push({data:eventDate,status:'vaga',tenantId:''});
  h.statusHistorico.sort(function(a,b){return String(a.data).localeCompare(String(b.data));});
}

function applyContractClosureState(h,c,endDate){
  c.ativo=false;
  c.fim=endDate;
  const otherActive=(h.contracts||[]).some(function(item){return item.id!==c.id&&item.ativo;});
  if(!otherActive&&(h.tenantId||'')===(c.tenantId||'')){
    h.tenantId='';
    h.status='vaga';
    h.contratoInicio='';
    h.contratoFim='';
    appendVacancyStatusState(h,endDate);
  }
}

function openFinishContractModal(houseId,contractId){
  if(!requirePropertyPermission())return;
  const h=state.houses.find(function(x){return x.id===houseId;});
  const c=h&&(h.contracts||[]).find(function(x){return x.id===contractId;});
  if(!h||!c) return;
  const t=contractTenant(c);
  if(!c.ativo){
    showToast('Este contrato já está encerrado.','error');
    return;
  }
  openModal(
    '<h3 class="modal-title">Registrar saída</h3>'+
    '<p class="modal-text">Registre o fim do vínculo de <strong>'+esc(t?t.nome:'Inquilino')+'</strong> com <strong>'+esc(h.nome)+'</strong>. A casa ficará vaga, mas contratos, pagamentos, energia, recibos e histórico continuarão guardados.</p>'+
    '<div class="notice-box"><strong>Nada será apagado.</strong> Use esta opção quando a locação realmente aconteceu e o inquilino saiu.</div>'+
    '<label class="field"><span>Data de saída</span><input id="f_contract_exit_date" type="date" min="'+esc(c.inicio||'')+'" max="'+todayISO()+'" value="'+todayISO()+'"></label>'+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-primary" onclick="finishContractAndVacate(\''+houseId+'\',\''+contractId+'\')">Registrar saída e liberar casa</button>'+
    '</div></div>'
  );
}

async function finishContractAndVacate(houseId,contractId){
  if(!requirePropertyPermission())return;
  const h=state.houses.find(function(x){return x.id===houseId;});
  const c=h&&(h.contracts||[]).find(function(x){return x.id===contractId;});
  const input=document.getElementById('f_contract_exit_date');
  const endDate=(input&&input.value)||todayISO();
  if(!h||!c) return;
  if(endDate<(c.inicio||endDate)){
    showToast('A saída não pode ser anterior ao início do contrato.','error');
    return;
  }
  if(endDate>todayISO()){
    showToast('Para liberar a casa agora, informe hoje ou uma data anterior.','error');
    return;
  }
  try{
    await db.finishContract(houseId,contractId,endDate,'vaga');
    applyContractClosureState(h,c,endDate);
    closeModal();
    render();
    showToast('Contrato encerrado. O histórico foi preservado e a casa está vaga.','success');
  }catch(e){
    console.error(e);
    showToast((e&&e.message)||'Não foi possível encerrar o contrato.','error');
  }
}

function openArchiveContractModal(houseId,contractId){
  if(!requirePropertyPermission())return;
  const h=state.houses.find(function(x){return x.id===houseId;});
  const c=h&&(h.contracts||[]).find(function(x){return x.id===contractId;});
  if(!h||!c)return;
  const t=contractTenant(c);
  if(c.ativo||!c.fim||c.fim>todayISO()){
    openModal(
      '<h3 class="modal-title">Encerre o contrato primeiro</h3>'+
      '<p class="modal-text">Um contrato em andamento ou programado não pode ser arquivado. Registre a saída real antes de retirá-lo das listas ativas.</p>'+
      '<div class="notice-box"><strong>Histórico protegido.</strong><br>O encerramento preserva cobranças, recebimentos e energia.</div>'+
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Voltar</button>'+
        (c.ativo?'<button class="btn btn-primary" onclick="openFinishContractModal(\''+houseId+'\',\''+contractId+'\')">Registrar saída</button>':'')+'</div>'
    );
    return;
  }
  openModal(
    '<h3 class="modal-title">Arquivar contrato encerrado?</h3>'+
    '<p class="modal-text">'+esc(h.nome)+' · '+esc(t?t.nome:'Inquilino')+' · encerrado em '+esc(fmtDateBR(c.fim))+'</p>'+
    '<div class="notice-box"><strong>Nada será apagado.</strong><br>O contrato sairá do histórico visível do imóvel, mas poderá ser restaurado em Backup → Itens arquivados. Lançamentos financeiros permanecem preservados.</div>'+
    '<label class="field"><span>Motivo do arquivamento</span><input id="f_archive_reason" maxlength="300" placeholder="Ex.: contrato duplicado"></label>'+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-danger" onclick="archiveContract(\''+houseId+'\',\''+contractId+'\')">Arquivar contrato</button></div>'
  );
}

async function archiveContract(houseId,contractId){
  if(!requirePropertyPermission())return;
  const h=state.houses.find(function(x){return x.id===houseId;});
  const c=h&&(h.contracts||[]).find(function(x){return x.id===contractId;});
  if(!h||!c)return;
  if(c.ativo||!c.fim||c.fim>todayISO()){
    showToast('Encerre o contrato antes de arquivá-lo.','error');
    return;
  }
  try{
    const reason=((document.getElementById('f_archive_reason')||{}).value||'').trim();
    await db.archiveEntity('contrato',contractId,reason);
    h.contracts=(h.contracts||[]).filter(function(item){return item.id!==contractId;});
    closeModal();
    render();
    showToast('Contrato arquivado. Você pode restaurá-lo pelo Backup.','success');
  }catch(e){
    console.error(e);
    showToast((e&&e.message)||'Não foi possível arquivar o contrato.','error');
  }
}

/* Compatibilidade com uma tela aberta na versão anterior: a ação antiga
   agora sempre leva ao arquivamento recuperável. */
function openContractMistakePreview(houseId,contractId){openArchiveContractModal(houseId,contractId);}
function toggleContractMistakeButton(){}
async function deleteContractMistake(houseId,contractId){return archiveContract(houseId,contractId);}
