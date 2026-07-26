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
  if(contract.ativo) return 'ATIVO';
  if(contract.fim&&contract.fim<todayISO()) return 'ENCERRADO';
  return 'PROGRAMADO';
}
function contractStatusTone(contract){ return contract.ativo?'brass':'slate'; }

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
  const h=state.houses.find(function(x){return x.id===houseId;});
  const c=currentRentContract(h);
  if(!c){showToast('Cadastre um contrato ativo para esta casa.','error');return;}
  if(contractProrataValue(c)>0&&!c.proporcionalPago){openProrataPaymentModal(houseId,c.id);return;}
  const cur=currentMonthStr(),first=contractFirstFullMonth(c);
  const mes=contractCoversMonth(c,cur)?cur:(first&&first>cur?first:cur);
  openPaymentModal(houseId,mes,c.id);
}

function openProrataPaymentModal(houseId,contractId){
  const h=state.houses.find(function(x){return x.id===houseId;});
  const c=(h.contracts||[]).find(function(x){return x.id===contractId;});
  if(!c) return;
  const t=contractTenant(c),value=contractProrataValue(c),days=contractProrataDays(c);
  openModal('<h3 class="modal-title">Ajuste inicial do contrato</h3>'+
    '<p class="modal-text">'+esc(h.nome)+' · '+esc(t?t.nome:'Inquilino')+'</p>'+
    '<div class="contract-charge-summary"><span>'+days+' dias proporcionais</span><strong class="num">'+fmtMoney(value)+'</strong></div>'+
    '<label class="field"><span>Data do pagamento</span><input id="f_prorata_data" type="date" value="'+esc(c.proporcionalDataPagamento||todayISO())+'"></label>'+
    '<div class="modal-actions">'+(c.proporcionalPago?'<button class="btn btn-danger" onclick="saveProrataPayment(\''+houseId+'\',\''+contractId+'\',false)">Desfazer pagamento</button>':'<span></span>')+
      '<div class="modal-actions-right"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-primary" onclick="saveProrataPayment(\''+houseId+'\',\''+contractId+'\',true)">Registrar pagamento</button></div></div>');
}

async function saveProrataPayment(houseId,contractId,paid){
  const h=state.houses.find(function(x){return x.id===houseId;});
  const c=(h.contracts||[]).find(function(x){return x.id===contractId;});
  const input=document.getElementById('f_prorata_data');
  const date=paid?((input&&input.value)||todayISO()):'';
  try{
    await db.saveContractProrata(contractId,paid,date);
    c.proporcionalPago=paid;c.proporcionalDataPagamento=date;
    closeModal();render();showToast(paid?'Ajuste inicial recebido.':'Pagamento proporcional desfeito.','success');
  }catch(e){console.error(e);showToast('Não foi possível salvar o ajuste inicial.','error');}
}

function renderContractsTab(h){
  const list=(h.contracts||[]).slice().sort(function(a,b){return String(b.inicio).localeCompare(String(a.inicio));});
  if(!list.length) return emptyState('Nenhum contrato cadastrado para esta casa.',FICO.doc)+
    '<div class="quick-actions"><button class="btn btn-primary btn-sm" onclick="openAssignTenantModal(\''+h.id+'\')">Criar primeiro contrato</button></div>';
  return '<div class="tab-summary-row"><div><strong>'+list.length+'</strong> contrato(s) preservado(s)</div>'+
    (h.status!=='alugada'?'<button class="btn btn-primary btn-sm" onclick="openAssignTenantModal(\''+h.id+'\')">+ Novo contrato</button>':'')+'</div>'+
    '<div class="contract-list">'+list.map(function(c){
      const t=contractTenant(c),prorata=contractProrataValue(c);
      return '<article class="contract-card '+(c.ativo?'active':'')+'"><div class="contract-card-head"><div><span class="field-kicker">'+esc(contractStatusLabel(c))+'</span><h3>'+esc(t?t.nome:'Inquilino removido')+'</h3></div><span class="chip chip-'+contractStatusTone(c)+'">'+esc(contractStatusLabel(c))+'</span></div>'+
        '<div class="contract-card-grid"><div><span>Período</span><strong>'+fmtDateBR(c.inicio)+' — '+(c.fim?fmtDateBR(c.fim):'em aberto')+'</strong></div>'+
          '<div><span>Aluguel</span><strong class="num">'+fmtMoney(c.valor)+'</strong></div>'+
          '<div><span>Vencimento</span><strong>'+esc(contractModeLabel(c))+'</strong></div>'+
          '<div><span>Ajuste inicial</span><strong>'+(prorata?fmtMoney(prorata)+' · '+(c.proporcionalPago?'pago':'pendente'):'não necessário')+'</strong></div></div>'+
        '<div class="contract-card-actions">'+(prorata?'<button class="btn btn-ghost btn-sm" onclick="openProrataPaymentModal(\''+h.id+'\',\''+c.id+'\')">'+(c.proporcionalPago?'Ver ajuste pago':'Registrar ajuste')+'</button>':'')+
          '<button class="btn btn-ghost btn-sm" onclick="openEditContractModal(\''+h.id+'\',\''+c.id+'\')">Editar contrato</button>'+
          (c.ativo?'<button class="btn btn-ghost btn-sm" onclick="openFinishContractModal(\''+h.id+'\',\''+c.id+'\')">Ele saiu da casa</button>':'')+
          '<button class="btn btn-danger btn-sm" onclick="openContractMistakePreview(\''+h.id+'\',\''+c.id+'\')">Cadastro errado</button></div></article>';
    }).join('')+'</div>';
}

function openEditContractModal(houseId,contractId){
  const h=state.houses.find(function(x){return x.id===houseId;});
  const c=(h.contracts||[]).find(function(x){return x.id===contractId;});
  if(!c) return;
  const t=contractTenant(c);
  openModal('<h3 class="modal-title">Editar contrato</h3><p class="modal-text">'+esc(h.nome)+' · '+esc(t?t.nome:'Inquilino')+'</p>'+
    contractFormFieldsHtml(c)+'<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveContractEdit(\''+houseId+'\',\''+contractId+'\')">Salvar contrato</button></div></div>');
  updateContractFormPreview();
}

async function saveContractEdit(houseId,contractId){
  const h=state.houses.find(function(x){return x.id===houseId;});
  const c=(h.contracts||[]).find(function(x){return x.id===contractId;});
  const draft=readContractForm(),validation=validateContractDraft(h,draft,contractId);
  if(validation){showToast(validation,'error');return;}
  const wasActive=!!c.ativo;
  if(wasActive&&draft.inicio>todayISO()){showToast('O contrato atual não pode começar em uma data futura.','error');return;}
  const billingChanged=c.inicio!==draft.inicio||Number(c.valor)!==Number(draft.valor)||
    contractBillingDay(c)!==contractBillingDay(draft)||contractMode(c)!==contractMode(draft);
  if(!billingChanged){draft.proporcionalDias=c.proporcionalDias;draft.proporcionalValor=c.proporcionalValor;}
  const prorataChanged=Math.abs(contractProrataValue(c)-draft.proporcionalValor)>0.009;
  const updated=Object.assign({},c,draft,{ativo:draft.inicio<=todayISO()&&(!draft.fim||draft.fim>=todayISO()),
    proporcionalPago:draft.proporcionalValor<=0?true:(prorataChanged?false:c.proporcionalPago),
    proporcionalDataPagamento:draft.proporcionalValor<=0||prorataChanged?'':c.proporcionalDataPagamento});
  try{
    await db.updateContract(updated);
    Object.assign(c,updated);
    if(c.ativo){
      h.tenantId=c.tenantId;h.status='alugada';h.contratoInicio=c.inicio;h.contratoFim=c.fim;
      h.aluguelValor=c.valor;h.diaVencimento=contractBillingDay(c);await db.updateHouse(h);
    }else if(wasActive){
      await db.finishContract(h.id,c.id,c.fim||todayISO(),'vaga');
      applyContractClosureState(h,c,c.fim||todayISO());
    }
    closeModal();render();showToast('Contrato atualizado.','success');
  }catch(e){console.error(e);showToast('Não foi possível atualizar o contrato.','error');}
}

/* ---------- encerramento real x exclusão de cadastro errado ---------- */
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
  const h=state.houses.find(function(x){return x.id===houseId;});
  const c=h&&(h.contracts||[]).find(function(x){return x.id===contractId;});
  if(!h||!c) return;
  const t=contractTenant(c);
  if(!c.ativo){
    showToast('Este contrato já está encerrado.','error');
    return;
  }
  openModal(
    '<h3 class="modal-title">Ele saiu da casa</h3>'+
    '<p class="modal-text">Encerre o contrato de <strong>'+esc(t?t.nome:'Inquilino')+'</strong> em <strong>'+esc(h.nome)+'</strong>. A casa ficará vaga, mas contratos, pagamentos, energia, recibos e histórico continuarão guardados.</p>'+
    '<div class="notice-box"><strong>Nada será apagado.</strong> Use esta opção quando a locação realmente aconteceu e o inquilino saiu.</div>'+
    '<label class="field"><span>Data de saída</span><input id="f_contract_exit_date" type="date" min="'+esc(c.inicio||'')+'" max="'+todayISO()+'" value="'+todayISO()+'"></label>'+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-primary" onclick="finishContractAndVacate(\''+houseId+'\',\''+contractId+'\')">Encerrar e liberar casa</button>'+
    '</div></div>'
  );
}

async function finishContractAndVacate(houseId,contractId){
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

function contractPreviewNumber(preview,key){
  if(!preview) return 0;
  const aliases={
    paymentsCount:'payments_count',
    energyCount:'energy_count',
    pendingSuggestionsCount:'pending_suggestions_count',
    linkedRecordsCount:'linked_records_count',
    willVacateHouse:'will_vacate_house'
  };
  const value=preview[key]!==undefined?preview[key]:preview[aliases[key]];
  return key==='willVacateHouse'?!!value:(Number(value)||0);
}

async function openContractMistakePreview(houseId,contractId){
  const h=state.houses.find(function(x){return x.id===houseId;});
  const c=h&&(h.contracts||[]).find(function(x){return x.id===contractId;});
  if(!h||!c) return;
  openModal('<h3 class="modal-title">Verificando o cadastro…</h3><p class="modal-text">Contando somente os registros ligados diretamente a este contrato.</p>');
  try{
    const preview=await db.previewContractRemoval(contractId);
    const payments=contractPreviewNumber(preview,'paymentsCount');
    const energy=contractPreviewNumber(preview,'energyCount');
    const suggestions=contractPreviewNumber(preview,'pendingSuggestionsCount');
    const willVacate=contractPreviewNumber(preview,'willVacateHouse');
    const t=contractTenant(c);
    openModal(
      '<h3 class="modal-title">Foi um cadastro errado</h3>'+
      '<p class="modal-text">Esta opção é somente para um contrato criado por engano. Confira o que será removido antes de continuar.</p>'+
      '<div class="contract-card-grid">'+
        '<div><span>Contrato</span><strong>1</strong></div>'+
        '<div><span>Pagamentos ligados</span><strong>'+payments+'</strong></div>'+
        '<div><span>Registros de energia ligados</span><strong>'+energy+'</strong></div>'+
        '<div><span>Sugestões pendentes ligadas</span><strong>'+suggestions+'</strong></div>'+
        '<div><span>Inquilino</span><strong>'+esc(t?t.nome:'Cadastro preservado')+'</strong></div>'+
      '</div>'+
      '<div class="notice-box"><strong>Será preservado:</strong> o cadastro do inquilino, outros contratos, documentos, registros sem vínculo direto e o histórico dos demais moradores.'+
        (willVacate?' Como este é o contrato atual, <strong>'+esc(h.nome)+'</strong> ficará vaga.':' A situação atual da casa não será alterada.')+
      '</div>'+
      '<label class="field"><span>Digite EXCLUIR para confirmar</span><input id="f_contract_delete_confirmation" autocomplete="off" oninput="toggleContractMistakeButton()"></label>'+
      '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
        '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
        '<button class="btn btn-danger" id="confirmContractMistakeButton" disabled onclick="deleteContractMistake(\''+houseId+'\',\''+contractId+'\')">Excluir somente este cadastro</button>'+
      '</div></div>'
    );
  }catch(e){
    console.error(e);
    closeModal();
    showToast((e&&e.message)||'Não foi possível conferir o contrato.','error');
  }
}

function toggleContractMistakeButton(){
  const input=document.getElementById('f_contract_delete_confirmation');
  const button=document.getElementById('confirmContractMistakeButton');
  if(button) button.disabled=!input||input.value.trim().toUpperCase()!=='EXCLUIR';
}

async function deleteContractMistake(houseId,contractId){
  const input=document.getElementById('f_contract_delete_confirmation');
  if(!input||input.value.trim().toUpperCase()!=='EXCLUIR'){
    showToast('Digite EXCLUIR para confirmar.','error');
    return;
  }
  const h=state.houses.find(function(x){return x.id===houseId;});
  const c=h&&(h.contracts||[]).find(function(x){return x.id===contractId;});
  if(!h||!c) return;
  try{
    await db.deleteContractMistake(contractId,input.value.trim());
    h.pagamentos=(h.pagamentos||[]).filter(function(item){return item.contractId!==contractId;});
    h.energias=(h.energias||[]).filter(function(item){return item.contractId!==contractId;});
    h.contracts=(h.contracts||[]).filter(function(item){return item.id!==contractId;});
    const otherActive=(h.contracts||[]).find(function(item){return item.ativo;});
    if(c.ativo&&!otherActive&&(h.tenantId||'')===(c.tenantId||'')){
      h.tenantId='';
      h.status='vaga';
      h.contratoInicio='';
      h.contratoFim='';
      appendVacancyStatusState(h,todayISO());
    }
    closeModal();
    render();
    showToast('Contrato cadastrado por engano excluído com segurança.','success');
  }catch(e){
    console.error(e);
    showToast((e&&e.message)||'Não foi possível excluir o contrato.','error');
  }
}
