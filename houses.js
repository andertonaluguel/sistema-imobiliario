/* ============================================================
   houses.js — Casas: grade, detalhe (abas), CRUD, pagamentos
   Reaproveita o estado em memória; grava no banco via db.*
   ============================================================ */

/* ---------- card e grade ---------- */
function renderHouseCard(h){
  const cur = currentMonthStr();
  const contract=currentRentContract(h);
  const contractId=contract?contract.id:'';
  const st = paymentStatus(h, cur,contractId);
  const t = tenantOf(h);
  const rent=contract?Number(contract.valor)||0:aluguelValorMes(h,cur);
  const energy=energiaValorMes(h,cur,contractId);
  const total=rent+energy;
  const prorataPending=contract&&contractProrataValue(contract)>0&&!contract.proporcionalPago;
  const charge=computeCobrancaCasa(h);
  const isOverdue=!!(charge&&charge.tipo==='atraso');
  let tabColor, statusLabel;
  if(st==='manutencao'){ tabColor='manut'; statusLabel='EM MANUTENÇÃO'; }
  else if(st==='vaga'){ tabColor='slate'; statusLabel='VAGA'; }
  else if(prorataPending){ tabColor='rust'; statusLabel='AJUSTE INICIAL'; }
  else if(st==='pago'){ tabColor='brass'; statusLabel='EM DIA'; }
  else if(st==='atrasado'){ tabColor='rust'; statusLabel='ATRASADO'; }
  else if(st==='fora_contrato'){ tabColor='slate'; statusLabel='PRÓXIMO CICLO'; }
  else { tabColor='slate'; statusLabel='PENDENTE'; }
  if(isOverdue){ tabColor='rust'; statusLabel='ATRASADO'; }
  const atraso = isOverdue ? '1' : '0';
  const searchData = (h.nome+' '+(h.endereco||'')+' '+(t?t.nome:'')).toLowerCase();
  if(isSimpleMode()){
    const simpleValue=isOverdue&&charge?charge.total:total;
    const simpleLabel=isOverdue?'VALOR EM ATRASO':'TOTAL DO MÊS';
    return '<div class="house-card simple-house-card tab-'+tabColor+(isOverdue?' is-overdue':'')+'" data-status="'+h.status+'" data-atraso="'+atraso+'" data-search="'+esc(searchData)+'" onclick="openSimpleHouseSummary(\''+h.id+'\')">'+
      '<div class="house-card-top"><div><div class="house-name">'+esc(h.nome)+'</div><div class="house-address">'+(t?esc(t.nome):(h.status==='vaga'?'Sem inquilino':'—'))+'</div></div><span class="chip chip-'+tabColor+'">'+statusLabel+'</span></div>'+
      '<div class="simple-house-value"><span>'+simpleLabel+'</span><strong class="num">'+fmtMoney(simpleValue)+'</strong></div>'+
      (h.status==='alugada'?'<div class="simple-house-actions" onclick="event.stopPropagation()"><button class="btn btn-primary" onclick="openSimplePayment(\''+h.id+'\')">'+(st==='pago'&&!isOverdue?'Pagamento em dia ✓':'Registrar pagamento')+'</button><button class="btn btn-ghost" onclick="openSimpleHouseSummary(\''+h.id+'\')">Ver histórico</button></div>':'')+
    '</div>';
  }
  return '<div class="house-card house-card-rich tab-'+tabColor+(isOverdue?' is-overdue':'')+'" data-status="'+h.status+'" data-atraso="'+atraso+'" data-search="'+esc(searchData)+'" onclick="openHouse(\''+h.id+'\')">'+
    '<div class="house-card-top"><div>'+
      '<div class="house-name">'+esc(h.nome)+'</div>'+
      '<div class="house-address">'+(h.endereco?esc(h.endereco):'Endereço não informado')+'</div>'+
    '</div><span class="chip chip-'+tabColor+'">'+statusLabel+'</span></div>'+
    '<div class="house-card-tenant"><span>INQUILINO</span><strong>'+(t?esc(t.nome):(h.status==='vaga'?'Sem inquilino':'—'))+'</strong></div>'+
    '<div class="house-card-values"><div><span>Aluguel</span><strong class="num">'+fmtMoney(rent)+'</strong></div>'+
      '<div><span>Energia</span><strong class="num">'+(energy?fmtMoney(energy):'Não lançada')+'</strong></div>'+
      '<div class="house-total"><span>Total</span><strong class="num">'+fmtMoney(total)+'</strong></div></div>'+
    (h.status==='alugada'?'<div class="house-card-actions" onclick="event.stopPropagation()">'+
      '<button class="btn btn-primary btn-sm" onclick="openQuickRentPayment(\''+h.id+'\')">'+(st==='pago'?'Aluguel pago ✓':'Registrar aluguel')+'</button>'+
      '<button class="btn btn-energia btn-sm" onclick="openEnergiaModal(\''+h.id+'\',\''+cur+'\',\''+contractId+'\')">'+(energiaPagaMes(h,cur,contractId)?'Energia paga ✓':'Registrar energia')+'</button></div>':'')+
    '</div>';
}

/* busca + filtro de casas (manipula o DOM para não perder o foco do campo) */
function setCasaBusca(v){ state.casaBusca = v; aplicarFiltroCasas(); }
function setCasaFiltro(f){ state.casaFiltro = f; aplicarFiltroCasas(); }
function aplicarFiltroCasas(){
  const grid = document.getElementById('casaGrid');
  if(!grid) return;
  const q = (state.casaBusca||'').trim().toLowerCase();
  const f = state.casaFiltro||'todas';
  let visiveis = 0;
  grid.querySelectorAll('.house-card').forEach(function(card){
    const status = card.getAttribute('data-status');
    const atraso = card.getAttribute('data-atraso')==='1';
    const search = card.getAttribute('data-search')||'';
    let ok = true;
    if(f==='alugada' && status!=='alugada') ok=false;
    else if(f==='vaga' && status!=='vaga') ok=false;
    else if(f==='manutencao' && status!=='manutencao') ok=false;
    else if(f==='atraso' && !atraso) ok=false;
    if(ok && q && search.indexOf(q)===-1) ok=false;
    card.style.display = ok ? '' : 'none';
    if(ok) visiveis++;
  });
  const empty = document.getElementById('casaEmpty');
  if(empty) empty.style.display = visiveis===0 ? '' : 'none';
  document.querySelectorAll('#casaToolbar .filter-chip').forEach(function(ch){
    ch.classList.toggle('active', ch.getAttribute('data-filtro')===f);
  });
}
function renderCasasView(){
  const header = '<div class="page-header"><div>'+
      '<div class="eyebrow">'+(isSimpleMode()?'MODO SIMPLES':'GERENCIAMENTO')+'</div>'+
      pageTitleWithIcon(houseIconSvg(), isSimpleMode()?'Casas':'Suas '+state.houses.length+' casas')+
      (isSimpleMode()?'<div class="page-sub">Toque em uma casa para consultar o histórico.</div>':'')+
    '</div>'+(!isSimpleMode()?'<button class="btn btn-primary btn-sm" onclick="openAddHouseModal()">+ Nova casa</button>':'')+'</div>';
  if(state.houses.length===0){
    return header + emptyState('Nenhuma casa ainda. Crie em "+ Nova casa" ou importe seu backup pelo menu (⋯).', houseIconSvg());
  }
  const filtros = isSimpleMode()
    ? [['todas','Todas'],['atraso','Em atraso']]
    : [['todas','Todas'],['alugada','Alugadas'],['vaga','Vagas'],['manutencao','Manutenção'],['atraso','Em atraso']];
  const chips = filtros.map(function(f){
    return '<button class="filter-chip'+(state.casaFiltro===f[0]?' active':'')+'" data-filtro="'+f[0]+'" onclick="setCasaFiltro(\''+f[0]+'\')">'+f[1]+'</button>';
  }).join('');
  const toolbar = '<div class="toolbar" id="casaToolbar">'+
      '<div class="search-wrap"><span class="search-ico">'+FICO.search+'</span>'+
        '<input id="casaBuscaInput" class="search-input" placeholder="Buscar casa, endereço ou inquilino…" value="'+esc(state.casaBusca||'')+'" oninput="setCasaBusca(this.value)"></div>'+
      '<div class="filter-chips">'+chips+'</div>'+
    '</div>';
  const grid = '<div class="house-grid" id="casaGrid">'+state.houses.map(renderHouseCard).join('')+'</div>'+
    '<div class="empty-state" id="casaEmpty" style="display:none">Nenhuma casa encontrada com esse filtro.</div>';
  return header + toolbar + grid;
}

function openSimplePayment(houseId){
  const h=state.houses.find(function(x){return x.id===houseId;});
  if(!h) return;
  const charge=computeCobrancaCasa(h);
  if(charge&&charge.tipo==='atraso') openAlertPaymentChooser(houseId);
  else openQuickRentPayment(houseId);
}

function openSimpleHouseSummary(houseId){
  const h=state.houses.find(function(x){return x.id===houseId;});
  if(!h) return;
  const t=tenantOf(h),contract=currentRentContract(h),contractId=contract?contract.id:'';
  const cur=currentMonthStr(),charge=computeCobrancaCasa(h);
  const overdue=!!(charge&&charge.tipo==='atraso');
  const rent=contract?Number(contract.valor)||0:aluguelValorMes(h,cur);
  const energy=energiaValorMes(h,cur,contractId);
  const payments=(h.pagamentos||[]).slice().sort(function(a,b){return (b.mes||'').localeCompare(a.mes||'');}).slice(0,6);
  const history=payments.length?'<div class="simple-history-list">'+payments.map(function(p){
    return '<div><span>'+monthLabel(p.mes)+'</span><strong class="num">'+fmtMoney(p.valorPago)+'</strong><small>'+fmtDateBR(p.dataPagamento)+'</small></div>';
  }).join('')+'</div>':'<div class="empty-state">Nenhum pagamento registrado ainda.</div>';
  openModal('<div class="simple-modal-status'+(overdue?' overdue':'')+'"><span>'+(overdue?'EM ATRASO':paymentStatus(h,cur,contractId)==='pago'?'EM DIA':'PENDENTE')+'</span></div>'+
    '<h3 class="modal-title simple-modal-title">'+esc(h.nome)+'</h3><p class="modal-text">'+(t?esc(t.nome):'Sem inquilino')+'</p>'+
    '<div class="simple-modal-values"><div><span>Aluguel</span><strong class="num">'+fmtMoney(rent)+'</strong></div><div><span>Energia</span><strong class="num">'+(energy?fmtMoney(energy):'—')+'</strong></div><div><span>Total do mês</span><strong class="num">'+fmtMoney(rent+energy)+'</strong></div></div>'+
    '<h4 class="simple-history-title">Últimos pagamentos</h4>'+history+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Fechar</button>'+(h.status==='alugada'?'<button class="btn btn-primary" onclick="closeModal();openSimplePayment(\''+h.id+'\')">Registrar pagamento</button>':'')+'</div>');
}

/* ---------- atrasos no histórico (aba Geral) ---------- */
function countHistoricoAtrasos(h){
  let count=0;
  h.pagamentos.forEach(function(p){
    const parts=p.mes.split('-').map(Number);
    const due=new Date(parts[0],parts[1]-1,h.diaVencimento||5,23,59,59);
    const paid=new Date((p.dataPagamento||todayISO())+'T12:00:00');
    if(paid>due) count++;
  });
  const cur=currentMonthStr();
  const inicio = h.contratoInicio ? h.contratoInicio.slice(0,7) : null;
  for(let i=0;i<24;i++){
    const mes=addMonths(cur,-i);
    if(inicio && mes<inicio) break;
    const jaPago = paymentForMonth(h,mes);
    if(!jaPago && paymentStatus(h,mes)==='atrasado') count++;
  }
  return count;
}

/* ---------- navegação para o detalhe ---------- */
function openHouse(houseId, tab){
  state.activeHouseId = houseId;
  state.activeTab = tab || 'geral';
  state.view = 'houseDetail';
  render();
  window.scrollTo(0,0);
}
function switchTab(key){
  state.activeTab = key;
  render();
  if(key==='fotos' && state.photoCache[state.activeHouseId]===undefined){
    ensurePhotosLoaded(state.activeHouseId);
  }
  if(key==='documentos' && state.documentCache[state.activeHouseId]===undefined){
    ensureDocumentsLoaded(state.activeHouseId);
  }
}

/* helpers de ficha: ícones nas seções e nas linhas */
function svgIco(inner){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">'+inner+'</svg>';
}
var FICO = {
  calendar: svgIco('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4" stroke-linecap="round"/>'),
  money:    svgIco('<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 010 3h-3a1.5 1.5 0 000 3h4" stroke-linecap="round"/>'),
  search:   svgIco('<circle cx="11" cy="11" r="7"/><path d="M16 16l4 4" stroke-linecap="round"/>'),
  alert:    svgIco('<path d="M12 3L2 20h20L12 3z" stroke-linejoin="round"/><path d="M12 10v4M12 17h.01" stroke-linecap="round"/>'),
  check:    svgIco('<path d="M3 12l4 4L21 4" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 12v7a1 1 0 01-1 1H4a1 1 0 01-1-1V5" stroke-linecap="round"/>'),
  arrowIn:  svgIco('<path d="M12 5v14M6 13l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/>'),
  arrowOut: svgIco('<path d="M12 19V5M6 11l6-6 6 6" stroke-linecap="round" stroke-linejoin="round"/>'),
  chart:    svgIco('<path d="M5 19v-7M12 19V6M19 19v-4" stroke-linecap="round"/><path d="M3 21h18" stroke-linecap="round"/>'),
  phone:    svgIco('<path d="M5 4h4l2 5-3 2a12 12 0 005 5l2-3 5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z" stroke-linejoin="round"/>'),
  mail:     svgIco('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M4 7l8 6 8-6" stroke-linecap="round"/>'),
  id:       svgIco('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c0-1.5 1.3-2.5 3-2.5s3 1 3 2.5M15 10h4M15 14h3" stroke-linecap="round"/>'),
  shield:   svgIco('<path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke-linejoin="round"/>'),
  doc:      svgIco('<path d="M7 3h7l4 4v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" stroke-linejoin="round"/><path d="M14 3v4h4M9 13h6M9 17h4" stroke-linecap="round"/>'),
  flag:     svgIco('<path d="M5 21V4M5 5h11l-2 3 2 3H5" stroke-linecap="round" stroke-linejoin="round"/>'),
  clock:    svgIco('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" stroke-linecap="round"/>'),
  okCircle: svgIco('<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6" stroke-linecap="round" stroke-linejoin="round"/>'),
  bell:     svgIco('<path d="M6 16V11a6 6 0 0112 0v5l2 2H4l2-2z" stroke-linejoin="round"/><path d="M10 20a2 2 0 004 0" stroke-linecap="round"/>'),
  tool:     svgIco('<path d="M14 7a4 4 0 01-5 5l-5 5 2 2 5-5a4 4 0 005-5l-2 2-2-2 2-2z" stroke-linejoin="round"/>'),
  brush:    svgIco('<rect x="4" y="3" width="16" height="6" rx="1"/><path d="M12 9v3a2 2 0 01-2 2H9v6h2v-6" stroke-linecap="round" stroke-linejoin="round"/>'),
  building: svgIco('<rect x="6" y="3" width="12" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" stroke-linecap="round"/>'),
  hammer:   svgIco('<path d="M14 4l6 6-2 2-6-6 2-2z" stroke-linejoin="round"/><path d="M12 8l-8 8 2 2 8-8" stroke-linecap="round" stroke-linejoin="round"/>'),
  tag:      svgIco('<path d="M3 12V4h8l9 9-8 8-9-9z" stroke-linejoin="round"/><circle cx="8" cy="8" r="1.4"/>'),
  bolt:     svgIco('<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" stroke-linejoin="round"/>')
};
/* ícone por categoria de despesa */
function catIcon(cat){
  switch(cat){
    case 'Manutenção': return FICO.tool;
    case 'Pintura':    return FICO.brush;
    case 'IPTU':       return FICO.building;
    case 'Condomínio': return FICO.building;
    case 'Reforma':    return FICO.hammer;
    case 'Seguro':     return FICO.shield;
    default:           return FICO.tag;
  }
}
/* ícone + cor por status de pagamento */
function payIcon(st){
  if(st==='pago')     return FICO.okCircle;
  if(st==='atrasado') return FICO.alert;
  return FICO.clock;
}
function payIcoColor(st){
  if(st==='pago')     return 'var(--brass-deep)';
  if(st==='atrasado') return 'var(--rust)';
  return 'var(--ink-faint)';
}
function fieldSection(icon, title){
  return '<div class="field-section"><span class="fs-ico">'+icon+'</span>'+title+'</div>';
}
function fieldLine(label, value, isNum, icon){
  return '<div class="field-line"><span class="fl-label">'+
    (icon ? '<span class="fl-ico">'+icon+'</span>' : '')+label+'</span>'+
    '<span class="fl-value'+(isNum?' num':'')+'">'+value+'</span></div>';
}

/* ---------- abas ---------- */
function renderGeralTab(h){
  const cur = currentMonthStr();
  const contract=currentRentContract(h),contractId=contract?contract.id:'';
  const st = paymentStatus(h, cur,contractId);
  const enerVal = energiaValorMes(h, cur,contractId);
  const enerKwh = energiaKwhMes(h, cur,contractId);
  const enerSt = energiaStatus(h, cur,contractId);
  const rentValue=contract?Number(contract.valor)||0:aluguelValorMes(h,cur);
  const totalMes = rentValue + enerVal;
  const enerChip = enerSt==='pago'?'brass':enerSt==='atrasado'?'rust':enerSt==='pendente'?'warn':'slate';
  const enerLbl = enerSt==='pago'?'PAGA':enerSt==='atrasado'?'ATRASADA':enerSt==='pendente'?'PENDENTE':enerSt==='sem_registro'?'NÃO LANÇADA':'—';
  const totalAno = h.pagamentos.filter(function(p){ return p.mes.slice(0,4)===cur.slice(0,4); }).reduce(function(s,p){ return s+(Number(p.valorPago)||0); },0);
  const despesasAno = h.despesas.filter(function(e){ return e.data && e.data.slice(0,4)===cur.slice(0,4); }).reduce(function(s,e){ return s+(Number(e.valor)||0); },0);
  const atrasosHist = countHistoricoAtrasos(h);
  const t = tenantOf(h);
  const tempo = tempoNaCasa(h);
  const prorataPendente=contract&&contractProrataValue(contract)>0&&!contract.proporcionalPago;
  const payChip = st==='pago'?'brass':st==='atrasado'||prorataPendente?'rust':st==='manutencao'?'manut':'slate';
  const payLbl = prorataPendente?'AJUSTE INICIAL':st==='pago'?'PAGO':st==='atrasado'?'ATRASADO':st==='vaga'?'VAGA':st==='manutencao'?'EM MANUTENÇÃO':st==='fora_contrato'?'PRÓXIMO CICLO':'PENDENTE';
  const statusTxt = h.status==='alugada'?'Alugada':h.status==='manutencao'?'Em manutenção':'Vaga';
  const stColor = h.status==='alugada'?'#D7A94B':h.status==='manutencao'?'#9FC1D6':'#B8C4BD';
  return '<div class="detail-grid general-detail-grid">'+
    '<div class="id-panel property-summary-card">'+
      '<div class="property-summary-head"><div><div class="id-eyebrow">SITUAÇÃO</div><span class="id-chip" style="color:'+stColor+'">'+statusTxt.toUpperCase()+'</span></div>'+
        '<span class="chip chip-'+payChip+'">ALUGUEL '+payLbl+'</span></div>'+
      '<div class="property-money-grid"><div><span>ALUGUEL</span><strong class="num">'+fmtMoney(rentValue)+'</strong></div>'+
        '<div><span>ENERGIA</span><strong class="num">'+(enerVal?fmtMoney(enerVal):'—')+'</strong>'+(enerKwh?'<small>'+enerKwh+' kWh</small>':'')+'</div>'+
        '<div class="property-money-total"><span>TOTAL DO MÊS</span><strong class="num">'+fmtMoney(totalMes)+'</strong></div></div>'+
      '<div class="property-tenant-block"><span>INQUILINO ATUAL</span>'+
        (t?'<strong>'+esc(t.nome)+'</strong>'+(tempo?'<small>na casa há '+tempo+'</small>':''):'<strong>Sem inquilino</strong>')+'</div>'+
      (contract?'<div class="property-contract-line"><span>Contrato desde '+fmtDateBR(contract.inicio)+'</span><span>'+esc(contractModeLabel(contract))+'</span></div>':'')+
    '</div>'+
    '<div>'+
      fieldSection(FICO.calendar, 'Cobrança')+
      '<div class="field-card">'+
        fieldLine('Dia de vencimento', String(h.diaVencimento||5), true, FICO.calendar)+
        '<div class="field-line"><span class="fl-label"><span class="fl-ico">'+FICO.money+'</span>Pagamento do mês</span><span class="chip chip-'+payChip+'">'+payLbl+'</span></div>'+
        (h.status==='alugada' ? '<div class="field-line"><span class="fl-label"><span class="fl-ico">'+FICO.bolt+'</span>Energia do mês</span><span class="chip chip-'+enerChip+'">'+enerLbl+'</span></div>' : '')+
      '</div>'+
      fieldSection(FICO.check, 'Acompanhamento')+
      '<div class="field-card">'+
        fieldLine('Última vistoria', h.ultimaVistoria?fmtDateBR(h.ultimaVistoria):'Nunca registrada', false, FICO.search)+
        fieldLine('Atrasos no histórico', String(atrasosHist), true, FICO.alert)+
      '</div>'+
      fieldSection(FICO.chart, 'Ano de '+cur.slice(0,4))+
      '<div class="field-card">'+
        fieldLine('Recebido', fmtMoney(totalAno), true, FICO.arrowIn)+
        fieldLine('Despesas', fmtMoney(despesasAno), true, FICO.arrowOut)+
      '</div>'+
    '</div>'+
  '</div>'+
  '<div class="quick-actions">'+
    (h.status==='alugada'
      ? (st==='pago'
          ? '<button class="btn btn-ghost btn-sm" onclick="openQuickRentPayment(\''+h.id+'\')">Pagamento do mês ✓</button>'
          : '<button class="btn btn-primary btn-sm" onclick="openQuickRentPayment(\''+h.id+'\')">Marcar como pago</button>')
      : '')+
    (h.status==='alugada'
      ? '<button class="btn btn-sm btn-energia" onclick="openEnergiaModal(\''+h.id+'\',\''+cur+'\',\''+contractId+'\')">'+(enerSt==='pago'?'Energia paga ✓':'Registrar / pagar energia')+'</button>'
      : '')+
    (h.status==='alugada' && (st==='atrasado'||st==='pendente') ? '<button class="btn btn-ghost btn-sm" onclick="cobrarWhatsApp(\''+h.id+'\',\''+cur+'\',\''+contractId+'\')">Cobrar via WhatsApp</button>' : '')+
    '<button class="btn btn-ghost btn-sm" onclick="registrarVistoria(\''+h.id+'\')">Registrar vistoria hoje</button>'+
    '<button class="btn btn-ghost btn-sm" onclick="openAssignTenantModal(\''+h.id+'\')">'+(t?'Trocar inquilino':'Vincular inquilino')+'</button>'+
  '</div>';
}
function renderInquilinoTab(h){
  const t = tenantOf(h);
  const contract=activeContract(h);
  if(!t){
    return '<div class="empty-state">Esta casa não tem inquilino vinculado.</div>'+
      '<div class="quick-actions"><button class="btn btn-primary btn-sm" onclick="openAssignTenantModal(\''+h.id+'\')">Vincular inquilino</button></div>';
  }
  const inicial = (t.nome||'?').trim().charAt(0).toUpperCase() || '?';
  return '<div class="detail-grid">'+
    '<div class="id-panel">'+
      '<div class="id-avatar">'+esc(inicial)+'</div>'+
      '<div class="id-eyebrow">INQUILINO</div>'+
      '<div class="id-name">'+esc(t.nome)+'</div>'+
      '<span class="id-chip" style="color:#D7A94B;margin-top:9px;">MORA AQUI</span>'+
    '</div>'+
    '<div>'+
      fieldSection(FICO.phone, 'Contato')+
      '<div class="field-card">'+
        fieldLine('Telefone', t.telefone?esc(t.telefone):'—', false, FICO.phone)+
        fieldLine('E-mail', t.email?esc(t.email):'—', false, FICO.mail)+
        fieldLine('CPF/RG', t.documento?esc(t.documento):'—', false, FICO.id)+
        fieldLine('Emergência', t.emergenciaNome?esc(t.emergenciaNome):'—', false, FICO.shield)+
      '</div>'+
      fieldSection(FICO.doc, 'Contrato')+
      '<div class="field-card">'+
        fieldLine('Tempo na casa', tempoNaCasa(h)||'—', false, FICO.clock)+
        fieldLine('Início', contract?fmtDateBR(contract.inicio):(h.contratoInicio?fmtDateBR(h.contratoInicio):'—'), false, FICO.calendar)+
        fieldLine('Fim', contract?fmtDateBR(contract.fim):(h.contratoFim?fmtDateBR(h.contratoFim):'—'), false, FICO.flag)+
        (contract?fieldLine('Vencimento',contractModeLabel(contract),false,FICO.money):'')+
      '</div>'+
    '</div>'+
  '</div>'+
  '<div class="quick-actions">'+
    '<button class="btn btn-ghost btn-sm" onclick="openEditTenantModal(\''+t.id+'\')">Editar dados do inquilino</button>'+
    '<button class="btn btn-ghost btn-sm" onclick="openAssignTenantModal(\''+h.id+'\')">Trocar inquilino</button>'+
    '<button class="btn btn-danger btn-sm" onclick="unassignTenant(\''+h.id+'\')">Desvincular</button>'+
  '</div>';
}
function renderPagamentosTab(h){
  const cur = currentMonthStr();
  const totalAno = h.pagamentos.filter(function(p){ return p.mes.slice(0,4)===cur.slice(0,4); }).reduce(function(s,p){ return s+(Number(p.valorPago)||0); },0);
  const contracts=(h.contracts||[]).slice().sort(function(a,b){return String(b.inicio).localeCompare(String(a.inicio));});
  if(!contracts.length) return '<div class="empty-state">Cadastre um contrato para organizar os pagamentos por inquilino.</div>';
  return '<div style="margin-bottom:14px;"><span class="summary-pill"><span class="sp-ico">'+FICO.money+'</span>Recebido em '+cur.slice(0,4)+' <span class="num">'+fmtMoney(totalAno)+'</span></span></div>'+contracts.map(function(c){
    const tenant=contractTenant(c),first=contractFirstFullMonth(c),last=(c.fim&&c.fim.slice(0,7)<cur)?c.fim.slice(0,7):cur;
    const months=[];let m=last;
    while(first&&m>=first&&months.length<36){if(contractCoversMonth(c,m))months.push(m);m=addMonths(m,-1);}
    const prorata=contractProrataValue(c);
    return '<section class="contract-ledger"><div class="contract-ledger-head"><div><strong>'+esc(tenant?tenant.nome:'Inquilino removido')+'</strong><span>'+fmtDateBR(c.inicio)+' — '+(c.fim?fmtDateBR(c.fim):'atual')+'</span></div><span class="chip chip-'+contractStatusTone(c)+'">'+contractStatusLabel(c)+'</span></div>'+
      (prorata?'<button class="ledger-row proportional-row" onclick="openProrataPaymentModal(\''+h.id+'\',\''+c.id+'\')"><span class="row-ico">'+FICO.money+'</span><div class="ledger-row-main">Ajuste inicial<div class="ledger-row-sub">'+contractProrataDays(c)+' dias proporcionais</div></div><span class="chip chip-'+(c.proporcionalPago?'brass':'warn')+'">'+(c.proporcionalPago?'PAGO':'PENDENTE')+'</span><div class="ledger-row-value num">'+fmtMoney(prorata)+'</div></button>':'')+
      '<div class="list-card"><div class="ledger">'+months.map(function(mes){
        const st=paymentStatus(h,mes,c.id),rec=paymentForMonth(h,mes,c.id);
        const chipClass=st==='pago'?'brass':st==='atrasado'?'rust':'slate';
        return '<div class="ledger-row'+(st==='atrasado'?' rust-row':'')+'" onclick="openPaymentModal(\''+h.id+'\',\''+mes+'\',\''+c.id+'\')"><span class="row-ico" style="color:'+payIcoColor(st)+'">'+payIcon(st)+'</span><div class="ledger-row-main">'+monthLabel(mes)+'<div class="ledger-row-sub">vence dia '+dueDayForMonth(mes,contractBillingDay(c))+'</div></div><span class="chip chip-'+chipClass+'">'+(st==='pago'?'PAGO':st==='atrasado'?'ATRASADO':'PENDENTE')+'</span><div class="ledger-row-value num">'+fmtMoney(rec?rec.valorPago:c.valor)+'</div></div>';
      }).join('')+'</div></div></section>';
  }).join('');
}
function renderEnergiaTab(h){
  const cur = currentMonthStr();
  const contract=activeContract(h)||(h.contracts||[]).slice().sort(function(a,b){return String(b.inicio).localeCompare(String(a.inicio));})[0];
  if(!contract) return '<div class="empty-state">Cadastre um contrato para organizar a energia por inquilino.</div>';
  const start = contract.inicio?contract.inicio.slice(0,7):addMonths(cur,-11);
  const months = [];
  let m = contract.fim&&contract.fim.slice(0,7)<cur?contract.fim.slice(0,7):cur;
  while(m >= start && months.length < 24){ if(contractOccupiesMonth(contract,m))months.push(m); m = addMonths(m,-1); }
  const anoAtual = cur.slice(0,4);
  const totalAno = (h.energias||[]).filter(function(e){ return e.mes.slice(0,4)===anoAtual && e.pago; }).reduce(function(s,e){ return s+(Number(e.valor)||0); },0);
  const kwhAno = (h.energias||[]).filter(function(e){ return e.mes.slice(0,4)===anoAtual; }).reduce(function(s,e){ return s+(Number(e.kwh)||0); },0);
  return '<div style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap;">'+
      '<span class="summary-pill"><span class="sp-ico">'+FICO.bolt+'</span>Recebido em '+anoAtual+' <span class="num">'+fmtMoney(totalAno)+'</span></span>'+
      (kwhAno?'<span class="summary-pill"><span class="sp-ico">'+FICO.chart+'</span>'+kwhAno+' kWh no ano</span>':'')+
    '</div>'+
    '<div class="list-card"><div class="ledger">'+months.map(function(mes){
      const stt = energiaStatus(h, mes,contract.id);
      const e = energiaDoMes(h, mes,contract.id);
      const chipClass = stt==='pago'?'brass':stt==='atrasado'?'rust':stt==='pendente'?'warn':'slate';
      const chipLbl = stt==='pago'?'PAGA':stt==='atrasado'?'ATRASADA':stt==='pendente'?'PENDENTE':'NÃO LANÇADA';
      const valorTxt = e ? fmtMoney(e.valor) : '—';
      const sub = e ? (e.kwh?(e.kwh+' kWh'):'sem consumo informado') : 'toque para lançar';
      const icoColor = stt==='pago'?'var(--brass-deep)':stt==='atrasado'?'var(--rust)':'var(--warn-deep)';
      return '<div class="ledger-row'+(stt==='atrasado'?' rust-row':'')+'" onclick="openEnergiaModal(\''+h.id+'\',\''+mes+'\',\''+contract.id+'\')">'+
        '<span class="row-ico" style="color:'+icoColor+'">'+FICO.bolt+'</span>'+
        '<div class="ledger-row-main">'+monthLabel(mes)+'<div class="ledger-row-sub">'+sub+'</div></div>'+
        '<span class="chip chip-'+chipClass+'">'+chipLbl+'</span>'+
        '<div class="ledger-row-value num">'+valorTxt+'</div></div>';
    }).join('')+'</div></div>';
}
function renderDespesasTab(h){
  const total = h.despesas.reduce(function(s,e){ return s+(Number(e.valor)||0); },0);
  const sorted = h.despesas.slice().sort(function(a,b){ return (b.data||'').localeCompare(a.data||''); });
  return '<div class="tab-summary-row"><div>Total de despesas: <strong class="num">'+fmtMoney(total)+'</strong></div>'+
    '<button class="btn btn-primary btn-sm" onclick="openExpenseModal(\''+h.id+'\')">+ Novo registro</button></div>'+
    (sorted.length===0
      ? emptyState('Nenhuma despesa ou chamado registrado ainda.', expenseIconSvg())
      : '<div class="list-card"><div class="ledger">'+sorted.map(function(e){
      const status = e.status || 'Concluído';
      const chipClass = status==='Concluído'?'brass':status==='Aberto'?'rust':'manut';
      return '<div class="ledger-row" onclick="openExpenseModal(\''+h.id+'\',\''+e.id+'\')">'+
        '<span class="row-ico" style="color:var(--ink-faint)">'+catIcon(e.categoria)+'</span>'+
        '<div class="ledger-row-main"><strong>'+esc(e.descricao)+'</strong>'+
          '<div class="ledger-row-sub">'+esc(e.categoria)+(e.prestador?(' · '+esc(e.prestador)):'')+' · '+fmtDateBR(e.data)+'</div></div>'+
        '<span class="chip chip-'+chipClass+'">'+status.toUpperCase()+'</span>'+
        '<div class="ledger-row-value num">'+fmtMoney(e.valor)+'</div></div>';
    }).join('')+'</div></div>');
}
function renderTabContent(h){
  switch(state.activeTab){
    case 'geral': return renderGeralTab(h);
    case 'inquilino': return renderInquilinoTab(h);
    case 'pagamentos': return renderPagamentosTab(h);
    case 'energia': return renderEnergiaTab(h);
    case 'contratos': return renderContractsTab(h);
    case 'reajustes': return renderReajustesTab(h);
    case 'despesas': return renderDespesasTab(h);
    case 'fotos': return renderFotosTab(h);
    case 'documentos': return renderDocumentsTab(h);
    default: return '';
  }
}
function renderHouseDetail(){
  const h = state.houses.find(function(x){ return x.id===state.activeHouseId; });
  if(!h){ state.view='casas'; return renderCasasView(); }
  const tabs = [['geral','Geral'],['inquilino','Inquilino'],['contratos','Contratos'],['pagamentos','Pagamentos'],['energia','Energia'],['reajustes','Reajustes'],['despesas','Despesas'],['fotos','Fotos'],['documentos','Documentos']];
  return '<button class="back-link" onclick="irCasas()">← Casas</button>'+
    '<div class="page-header"><div>'+
      '<div class="eyebrow">CASA</div>'+
      '<h1 class="page-title">'+esc(h.nome)+'</h1>'+
      '<div class="page-sub">'+(h.endereco?esc(h.endereco):'Endereço não informado')+'</div>'+
    '</div><button class="btn btn-ghost btn-sm" onclick="openEditHouseModal(\''+h.id+'\')">Editar dados</button></div>'+
    '<div class="tabs">'+tabs.map(function(t){
      return '<button class="tab'+(state.activeTab===t[0]?' active':'')+'" onclick="switchTab(\''+t[0]+'\')">'+t[1]+'</button>';
    }).join('')+'</div>'+
    '<div class="tab-panel">'+renderTabContent(h)+'</div>';
}

/* ---------- CRUD: casas ---------- */
function openAddHouseModal(){
  openModal(
    '<h3 class="modal-title">Nova casa</h3>'+
    '<label class="field"><span>Nome / apelido</span><input id="f_nome" placeholder="Ex: Casa 11"></label>'+
    '<label class="field"><span>Endereço</span><input id="f_endereco" placeholder="Rua, número, bairro"></label>'+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
    '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary" onclick="addHouse()">Adicionar</button>'+
    '</div></div>'
  );
}
async function addHouse(){
  const nome = document.getElementById('f_nome').value.trim() || ('Casa '+(state.houses.length+1));
  const endereco = document.getElementById('f_endereco').value.trim();
  try{
    const novo = await db.insertHouse({ nome:nome, endereco:endereco, status:'vaga',
      aluguelValor:0, diaVencimento:5, ultimaVistoria:'', tenantId:'', contratoInicio:'', contratoFim:'' });
    state.houses.push(novo);
    closeModal(); render();
  }catch(e){ console.error(e); showToast('Erro ao adicionar a casa.', 'error'); }
}
function openEditHouseModal(houseId){
  const h = state.houses.find(function(x){ return x.id===houseId; });
  openModal(
    '<h3 class="modal-title">Editar casa</h3>'+
    '<label class="field"><span>Nome / apelido</span><input id="f_nome" value="'+esc(h.nome)+'"></label>'+
    '<label class="field"><span>Endereço</span><input id="f_endereco" value="'+esc(h.endereco)+'" placeholder="Rua, número, bairro"></label>'+
    '<div class="field-row">'+
      '<label class="field"><span>Status</span><select id="f_status">'+
        '<option value="alugada"'+(h.status==='alugada'?' selected':'')+'>Alugada</option>'+
        '<option value="vaga"'+(h.status==='vaga'?' selected':'')+'>Vaga</option>'+
        '<option value="manutencao"'+(h.status==='manutencao'?' selected':'')+'>Em manutenção</option>'+
      '</select></label>'+
      '<label class="field"><span>Aluguel mensal (R$)</span><input id="f_aluguel" type="number" step="0.01" value="'+(h.aluguelValor||0)+'"></label>'+
    '</div>'+
    '<div class="field-row">'+
      '<label class="field"><span>Dia de vencimento</span><input id="f_dia" type="number" min="1" max="31" value="'+(h.diaVencimento||5)+'"></label>'+
      '<label class="field"><span>Última vistoria</span><input id="f_vist" type="date" value="'+(h.ultimaVistoria||'')+'"></label>'+
    '</div>'+
    '<div class="modal-actions">'+
      '<button class="btn btn-danger" onclick="confirmDeleteHouse(\''+h.id+'\')">Excluir casa</button>'+
      '<div class="modal-actions-right">'+
        '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
        '<button class="btn btn-primary" onclick="saveHouseEdit(\''+h.id+'\')">Salvar</button>'+
      '</div>'+
    '</div>'
  );
}
async function saveHouseEdit(id){
  const h = state.houses.find(function(x){ return x.id===id; });
  const valorAntigo = h.aluguelValor;
  const statusAntigo=h.status;
  const contratoAtual=activeContract(h);
  h.nome = document.getElementById('f_nome').value.trim() || h.nome;
  h.endereco = document.getElementById('f_endereco').value.trim();
  h.status = document.getElementById('f_status').value;
  h.aluguelValor = parseFloat(document.getElementById('f_aluguel').value)||0;
  h.diaVencimento = Math.min(31, Math.max(1, parseInt(document.getElementById('f_dia').value,10)||5));
  h.ultimaVistoria = document.getElementById('f_vist').value;
  if(h.status==='alugada'&&!h.tenantId&&!contratoAtual){
    h.status=statusAntigo;
    showToast('Para marcar como alugada, vincule um inquilino e crie o contrato.','error');
    return;
  }
  if(h.status!=='alugada' && h.tenantId){ h.tenantId=''; h.contratoInicio=''; h.contratoFim=''; }
  recordStatusChange(h);
  try{
    if(h.status!=='alugada'&&contratoAtual){
      await db.finishContract(h.id,contratoAtual.id,todayISO(),h.status);
      contratoAtual.ativo=false;contratoAtual.fim=todayISO();
    }else{
      await db.updateHouse(h);
      if(contratoAtual){
        contratoAtual.valor=h.aluguelValor;contratoAtual.diaVencimento=h.diaVencimento;
        if(contractMode(contratoAtual)==='entrada'&&contractBillingDay(contratoAtual)!==(Number(contratoAtual.inicio.slice(8,10))||1)) contratoAtual.modalidade='fixo';
        await db.updateContract(contratoAtual);
      }
    }
    await db.replaceStatusHistory(h.id, h.statusHistorico);
    // registra automaticamente o reajuste se o valor mudou
    if(h.aluguelValor !== valorAntigo && h.aluguelValor > 0){
      try{
        if(!h.aluguelHistorico) h.aluguelHistorico = [];
        const hoje = todayISO();
        const existente = h.aluguelHistorico.find(function(r){ return r.dataInicio===hoje; });
        if(existente){ existente.valor = h.aluguelValor; await db.updateReajuste(existente); }
        else { const rj = await db.insertReajuste(h.id, { valor:h.aluguelValor, dataInicio:hoje }); h.aluguelHistorico.push(rj); }
      }catch(err){ console.warn('Não foi possível registrar o reajuste automático:', err); }
    }
    closeModal(); render();
  }catch(e){ console.error(e); showToast('Erro ao salvar.', 'error'); }
}
function confirmDeleteHouse(houseId){
  const h = state.houses.find(function(x){ return x.id===houseId; });
  openModal(
    '<h3 class="modal-title">Excluir '+esc(h.nome)+'?</h3>'+
    '<p class="modal-text">Remove todos os dados dessa casa (pagamentos, despesas e fotos). O inquilino, se houver, continua cadastrado em Inquilinos. Não dá para desfazer.</p>'+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
    '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-danger" onclick="deleteHouse(\''+houseId+'\')">Excluir</button>'+
    '</div></div>'
  );
}
async function deleteHouse(houseId){
  try{
    await db.deleteHouse(houseId);
    state.houses = state.houses.filter(function(x){ return x.id!==houseId; });
    delete state.photoCache[houseId];
    closeModal(); state.view='casas'; render();
  }catch(e){ console.error(e); showToast('Erro ao excluir a casa.', 'error'); }
}

/* ---------- vistoria ---------- */
async function registrarVistoria(houseId){
  const h = state.houses.find(function(x){ return x.id===houseId; });
  h.ultimaVistoria = todayISO();
  try{ await db.updateHouse(h); render(); showToast('Vistoria registrada.', 'success'); }
  catch(e){ showToast('Erro ao registrar vistoria.', 'error'); }
}

/* ---------- pagamentos ---------- */
function openPaymentModal(houseId, mes,contractId){
  const h = state.houses.find(function(x){ return x.id===houseId; });
  const contract=contractForMonth(h,mes,contractId),resolvedId=contract?contract.id:(contractId||'');
  const rec = paymentForMonth(h,mes,resolvedId);
  const st = paymentStatus(h, mes,resolvedId);
  const valorSugerido = rec ? rec.valorPago : (contract?contractExpectedRent(contract,mes):aluguelValorMes(h, mes));
  const tenant=contract?contractTenant(contract):tenantOf(h);
  openModal(
    '<h3 class="modal-title">'+monthLabel(mes)+'</h3>'+
    '<p class="modal-text">'+esc(h.nome)+(tenant?' · '+esc(tenant.nome):'')+(contract?' · vence dia '+contractBillingDay(contract):'')+'</p>'+
    '<label class="field"><span>Valor pago (R$)</span><input id="f_valor" type="number" step="0.01" value="'+valorSugerido+'"></label>'+
    '<label class="field"><span>Data do pagamento</span><input id="f_data" type="date" value="'+(rec?rec.dataPagamento:todayISO())+'"></label>'+
    '<div class="modal-actions">'+
      (rec ? '<button class="btn btn-danger" onclick="removePayment(\''+houseId+'\',\''+mes+'\',\''+resolvedId+'\')">Desfazer pagamento</button>' : '<span></span>')+
      '<div class="modal-actions-right">'+
        (!rec && (st==='atrasado'||st==='pendente') ? '<button class="btn btn-ghost" onclick="cobrarWhatsApp(\''+houseId+'\',\''+mes+'\',\''+resolvedId+'\')">Cobrar via WhatsApp</button>' : '')+
        (rec ? '<button class="btn btn-ghost" onclick="generateReceiptPDF(\''+houseId+'\',\''+mes+'\',\''+resolvedId+'\')">Gerar recibo PDF</button>' : '')+
        '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
        '<button class="btn btn-primary" onclick="savePayment(\''+houseId+'\',\''+mes+'\',\''+resolvedId+'\')">Marcar como pago</button>'+
      '</div>'+
    '</div>'
  );
}
async function savePayment(houseId, mes,contractId){
  const h = state.houses.find(function(x){ return x.id===houseId; });
  const valor = parseFloat(document.getElementById('f_valor').value)||0;
  const data = document.getElementById('f_data').value || todayISO();
  const rec = paymentForMonth(h,mes,contractId);
  try{
    await db.upsertPayment(houseId, { mes:mes,contractId:contractId, valorPago:valor, dataPagamento:data });
    if(rec){ rec.valorPago=valor; rec.dataPagamento=data; }
    else { h.pagamentos.push({ mes:mes,contractId:contractId, valorPago:valor, dataPagamento:data }); }
    closeModal(); render();
  }catch(e){ console.error(e); showToast('Erro ao salvar o pagamento.', 'error'); }
}
async function removePayment(houseId, mes,contractId){
  const h = state.houses.find(function(x){ return x.id===houseId; });
  try{
    await db.deletePayment(houseId, mes,contractId);
    h.pagamentos = h.pagamentos.filter(function(p){ return !(p.mes===mes&&(!contractId||p.contractId===contractId)); });
    closeModal(); render();
  }catch(e){ console.error(e); showToast('Erro ao desfazer o pagamento.', 'error'); }
}

/* ---------- energia solar (registrar valor/kWh e status de pago) ---------- */
function openEnergiaModal(houseId, mes,contractId){
  const h = state.houses.find(function(x){ return x.id===houseId; });
  const contract=contractForEnergyMonth(h,mes,contractId),resolvedId=contract?contract.id:(contractId||'');
  if((h.contracts||[]).length&&!contract){showToast('Nenhum contrato desta casa cobre o mês escolhido.','error');return;}
  const e = energiaDoMes(h, mes,resolvedId);
  const pago = !!(e && e.pago);
  openModal(
    '<h3 class="modal-title">Energia · '+monthLabel(mes)+'</h3>'+
    '<p class="modal-text">'+esc(h.nome)+' — informe o valor cobrado e o consumo do mês.</p>'+
    '<label class="field"><span>Valor cobrado (R$)</span><input id="f_ener_valor" type="number" step="0.01" value="'+(e?e.valor:'')+'" placeholder="Ex.: 184.50"></label>'+
    '<label class="field"><span>Consumo (kWh)</span><input id="f_ener_kwh" type="number" step="1" value="'+(e?e.kwh:'')+'" placeholder="Ex.: 212"></label>'+
    '<label class="field-check"><input type="checkbox" id="f_ener_pago"'+(pago?' checked':'')+'> Já recebi esse pagamento de energia</label>'+
    '<label class="field"><span>Data do pagamento</span><input id="f_ener_data" type="date" value="'+((e&&e.dataPagamento)?e.dataPagamento:todayISO())+'"></label>'+
    '<div class="modal-actions">'+
      (e ? '<button class="btn btn-danger" onclick="removeEnergia(\''+houseId+'\',\''+mes+'\',\''+resolvedId+'\')">Excluir registro</button>' : '<span></span>')+
      '<div class="modal-actions-right">'+
        (e && !pago ? '<button class="btn btn-ghost" onclick="cobrarEnergiaWhatsApp(\''+houseId+'\',\''+mes+'\',\''+resolvedId+'\')">Cobrar via WhatsApp</button>' : '')+
        '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
        '<button class="btn btn-primary" onclick="saveEnergia(\''+houseId+'\',\''+mes+'\',\''+resolvedId+'\')">Salvar registro</button>'+
      '</div>'+
    '</div>'
  );
}
async function saveEnergia(houseId, mes,contractId){
  const h = state.houses.find(function(x){ return x.id===houseId; });
  const valor = parseFloat(String(document.getElementById('f_ener_valor').value).replace(',','.'))||0;
  const kwh = parseFloat(String(document.getElementById('f_ener_kwh').value).replace(',','.'))||0;
  const pago = document.getElementById('f_ener_pago').checked;
  const data = pago ? (document.getElementById('f_ener_data').value || todayISO()) : '';
  const rec = energiaDoMes(h, mes,contractId);
  try{
    await db.upsertEnergia(houseId, { mes:mes,contractId:contractId, valor:valor, kwh:kwh, pago:pago, dataPagamento:data });
    if(rec){ rec.valor=valor; rec.kwh=kwh; rec.pago=pago; rec.dataPagamento=data; }
    else { if(!h.energias) h.energias=[]; h.energias.push({ mes:mes,contractId:contractId, valor:valor, kwh:kwh, pago:pago, dataPagamento:data }); }
    closeModal(); render();
    showToast('Energia registrada.', 'success');
  }catch(err){ console.error(err); showToast('Erro ao salvar a energia.', 'error'); }
}
async function removeEnergia(houseId, mes,contractId){
  const h = state.houses.find(function(x){ return x.id===houseId; });
  try{
    await db.deleteEnergia(houseId, mes,contractId);
    h.energias = (h.energias||[]).filter(function(e){ return !(e.mes===mes&&(!contractId||e.contractId===contractId)); });
    closeModal(); render();
  }catch(err){ console.error(err); showToast('Erro ao excluir o registro.', 'error'); }
}
function cobrarEnergiaWhatsApp(houseId, mes,contractId){
  const h = state.houses.find(function(x){ return x.id===houseId; });
  const contract=contractForMonth(h,mes,contractId);
  const t = contract?contractTenant(contract):tenantOf(h);
  if(!t || !t.telefone){ showToast('Cadastre o telefone do inquilino primeiro.', 'error'); return; }
  const val = energiaValorMes(h, mes,contract&&contract.id);
  let phone = (t.telefone||'').replace(/\D/g,'');
  if(phone && phone.length<=11) phone = '55'+phone;
  const msg = 'Olá'+(t.nome?(' '+t.nome):'')+'! Passando para lembrar da conta de energia de '+(h.endereco||h.nome)+' referente a '+monthLabel(mes)+', no valor de '+fmtMoney(val)+'. Qualquer dúvida me chama por aqui!';
  window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(msg), '_blank');
}

/* ---------- cobrança via WhatsApp ---------- */
function buildWhatsAppUrl(house, mes,contractId){
  const contract=contractForMonth(house,mes,contractId);
  const t = (contract?contractTenant(contract):tenantOf(house)) || {};
  let phone = (t.telefone||'').replace(/\D/g,'');
  if(phone && phone.length<=11) phone = '55'+phone;
  const value=contract?contractExpectedRent(contract,mes):aluguelValorMes(house,mes);
  const dueDay=contract?contractBillingDay(contract):(house.diaVencimento||5);
  const msg = 'Olá'+(t.nome?(' '+t.nome):'')+'! Passando para lembrar do aluguel de '+(house.endereco||house.nome)+' referente a '+monthLabel(mes)+', no valor de '+fmtMoney(value)+' (vencimento dia '+dueDayForMonth(mes,dueDay)+'). Qualquer dúvida me chama por aqui!';
  return 'https://wa.me/'+phone+'?text='+encodeURIComponent(msg);
}
function cobrarWhatsApp(houseId, mes,contractId){
  const h = state.houses.find(function(x){ return x.id===houseId; });
  const contract=contractForMonth(h,mes,contractId);
  const t = contract?contractTenant(contract):tenantOf(h);
  if(!t || !t.telefone){ showToast('Cadastre o telefone do inquilino primeiro.', 'error'); return; }
  window.open(buildWhatsAppUrl(h,mes,contract&&contract.id), '_blank');
}
/* cobrança a partir do alerta: monta a mensagem conforme a situação (próximo / atraso) */
function cobrarAlerta(houseId){
  const h = state.houses.find(function(x){ return x.id===houseId; });
  if(!h) return;
  const contract=activeContract(h);
  const t = contract?contractTenant(contract):tenantOf(h);
  if(!t || !t.telefone){ showToast('Cadastre o telefone do inquilino primeiro.', 'error'); return; }
  const cob = (typeof computeCobrancaCasa==='function') ? computeCobrancaCasa(h) : null;
  if(!cob){ return cobrarWhatsApp(houseId, currentMonthStr()); }
  let phone = (t.telefone||'').replace(/\D/g,'');
  if(phone && phone.length<=11) phone = '55'+phone;
  const nome = t.nome ? (' '+t.nome) : '';
  const local = h.endereco || h.nome;
  const temAluguel = cob.meses.length>0;
  const temEnergia = cob.energiaMeses && cob.energiaMeses.length>0;
  // descreve cada item em aberto (aluguel e/ou energia)
  const itens = [];
  if(cob.proporcional){
    itens.push('o ajuste inicial do contrato ('+fmtMoney(cob.proporcional)+')');
  }
  if(temAluguel){
    itens.push(cob.meses.length===1
      ? ('o aluguel de '+monthLabel(cob.meses[0])+' ('+fmtMoney(contract?contractExpectedRent(contract,cob.meses[0]):aluguelValorMes(h,cob.meses[0]))+')')
      : ('os aluguéis de '+cob.meses.map(monthLabel).join(', ')+' ('+fmtMoney(cob.aluguelTotal)+')'));
  }
  if(temEnergia){
    itens.push(cob.energiaMeses.length===1
      ? ('a energia de '+monthLabel(cob.energiaMeses[0])+' ('+fmtMoney(cob.energiaTotal)+')')
      : ('a energia de '+cob.energiaMeses.map(monthLabel).join(', ')+' ('+fmtMoney(cob.energiaTotal)+')'));
  }
  let msg;
  if(cob.tipo==='proximo'){
    const extra = temEnergia ? (' e a energia ('+fmtMoney(cob.energiaTotal)+')') : '';
    msg = 'Olá'+nome+'! Passando para lembrar que o aluguel de '+local+' referente a '+monthLabel(cob.meses[0])+' ('+fmtMoney(contract?contractExpectedRent(contract,cob.meses[0]):aluguelValorMes(h,cob.meses[0]))+')'+extra+' vence dia '+dueDayForMonth(cob.meses[0],contract?contractBillingDay(contract):(h.diaVencimento||5))+' (em '+cob.dias+' dia(s)). Qualquer dúvida me chama por aqui!';
  } else if(itens.length===1){
    msg = 'Olá'+nome+'! Notei que '+itens[0]+' de '+local+' consta em aberto. Pode dar uma olhada? Qualquer dúvida me chama por aqui!';
  } else {
    msg = 'Olá'+nome+'! Constam em aberto, referentes a '+local+': '+itens.join(' e ')+', somando '+fmtMoney(cob.total)+'. Pode acertar quando possível? Qualquer dúvida me chama por aqui!';
  }
  window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(msg), '_blank');
}

/* ---------- CRUD: despesas ---------- */
function openExpenseModal(houseId, expenseId){
  const h = state.houses.find(function(x){ return x.id===houseId; });
  const e = expenseId ? h.despesas.find(function(x){ return x.id===expenseId; }) : null;
  openModal(
    '<h3 class="modal-title">'+(e?'Editar registro':'Novo registro')+'</h3>'+
    '<label class="field"><span>Descrição</span><input id="f_desc" value="'+(e?esc(e.descricao):'')+'" placeholder="Ex: Conserto da torneira"></label>'+
    '<div class="field-row">'+
      '<label class="field"><span>Categoria</span><select id="f_cat">'+CONFIG.CATEGORIAS.map(function(c){ return '<option'+(e&&e.categoria===c?' selected':'')+'>'+c+'</option>'; }).join('')+'</select></label>'+
      '<label class="field"><span>Status</span><select id="f_status_desp">'+
        CONFIG.DESPESA_STATUS.map(function(s){ return '<option'+((e&&e.status===s)||(!e&&s==='Concluído')?' selected':'')+'>'+s+'</option>'; }).join('')+
      '</select></label>'+
    '</div>'+
    '<div class="field-row">'+
      '<label class="field"><span>Prestador (opcional)</span><input id="f_prest" value="'+(e?esc(e.prestador||''):'')+'" placeholder="Ex: João Encanador"></label>'+
      '<label class="field"><span>Valor (R$)</span><input id="f_valor" type="number" step="0.01" value="'+(e?e.valor:'')+'"></label>'+
    '</div>'+
    '<label class="field"><span>Data</span><input id="f_data" type="date" value="'+(e?e.data:todayISO())+'"></label>'+
    '<div class="modal-actions">'+
      (e ? '<button class="btn btn-danger" onclick="deleteExpense(\''+houseId+'\',\''+e.id+'\')">Excluir</button>' : '<span></span>')+
      '<div class="modal-actions-right">'+
        '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
        '<button class="btn btn-primary" onclick="saveExpense(\''+houseId+'\',\''+(expenseId||'')+'\')">Salvar</button>'+
      '</div>'+
    '</div>'
  );
}
async function saveExpense(houseId, expenseId){
  const h = state.houses.find(function(x){ return x.id===houseId; });
  const desc = document.getElementById('f_desc').value.trim();
  const cat = document.getElementById('f_cat').value;
  const status = document.getElementById('f_status_desp').value;
  const prestador = document.getElementById('f_prest').value.trim();
  const valor = parseFloat(document.getElementById('f_valor').value)||0;
  const data = document.getElementById('f_data').value || todayISO();
  if(!desc){ showToast('Descreva a despesa.', 'error'); return; }
  try{
    if(expenseId){
      const e = h.despesas.find(function(x){ return x.id===expenseId; });
      e.descricao=desc; e.categoria=cat; e.valor=valor; e.data=data; e.prestador=prestador; e.status=status;
      await db.updateExpense(e);
    } else {
      const novoId = await db.insertExpense(houseId, { descricao:desc, categoria:cat, valor:valor, data:data, prestador:prestador, status:status });
      h.despesas.push({ id:novoId, descricao:desc, categoria:cat, valor:valor, data:data, prestador:prestador, status:status });
    }
    closeModal(); render();
  }catch(e){ console.error(e); showToast('Erro ao salvar a despesa.', 'error'); }
}
async function deleteExpense(houseId, expenseId){
  const h = state.houses.find(function(x){ return x.id===houseId; });
  try{
    await db.deleteExpense(expenseId);
    h.despesas = h.despesas.filter(function(x){ return x.id!==expenseId; });
    closeModal(); render();
  }catch(e){ console.error(e); showToast('Erro ao excluir a despesa.', 'error'); }
}

/* ---------- aba Reajustes (histórico do valor do aluguel) ---------- */
function renderReajustesTab(h){
  const hist = (h.aluguelHistorico||[]).slice().sort(function(a,b){ return a.dataInicio.localeCompare(b.dataInicio); });
  let body;
  if(!hist.length){
    body = '<div class="empty-state">Nenhum reajuste registrado ainda.</div>'+
      (h.aluguelValor>0
        ? '<div class="quick-actions"><button class="btn btn-ghost btn-sm" onclick="registrarValorAtual(\''+h.id+'\')">Registrar o valor atual ('+fmtMoney(h.aluguelValor)+') como ponto inicial</button></div>'
        : '');
  } else {
    body = '<div class="list-card"><div class="ledger">'+hist.map(function(rj, i){
      const prox = hist[i+1];
      const vig = prox
        ? ('de '+fmtDateBR(rj.dataInicio)+' a '+fmtDateBR(addDaysISO(prox.dataInicio,-1)))
        : ('desde '+fmtDateBR(rj.dataInicio));
      return '<div class="ledger-row" onclick="openReajusteModal(\''+h.id+'\',\''+rj.id+'\')">'+
        '<div class="ledger-row-main"><strong class="num">'+fmtMoney(rj.valor)+'</strong>'+
          '<div class="ledger-row-sub">'+vig+'</div></div>'+
        (prox ? '' : '<span class="chip chip-brass">ATUAL</span>')+
        '<div class="ledger-row-value"></div></div>';
    }).join('')+'</div></div>';
  }
  return '<div class="tab-summary-row"><div>Aluguel atual: <strong class="num">'+fmtMoney(h.aluguelValor)+'</strong> <span style="color:var(--ink-faint)">(altere em “Editar dados”)</span></div>'+
    '<button class="btn btn-primary btn-sm" onclick="openReajusteModal(\''+h.id+'\')">+ Registrar reajuste</button></div>'+
    body;
}
function openReajusteModal(houseId, reajusteId){
  const h = state.houses.find(function(x){ return x.id===houseId; });
  const rj = reajusteId ? h.aluguelHistorico.find(function(x){ return x.id===reajusteId; }) : null;
  openModal(
    '<h3 class="modal-title">'+(rj?'Editar reajuste':'Novo reajuste')+'</h3>'+
    '<div class="field-row">'+
      '<label class="field"><span>Valor (R$)</span><input id="f_valor" type="number" step="0.01" value="'+(rj?rj.valor:(h.aluguelValor||''))+'"></label>'+
      '<label class="field"><span>A partir de</span><input id="f_data" type="date" value="'+(rj?rj.dataInicio:todayISO())+'"></label>'+
    '</div>'+
    '<p class="modal-text">Registra qual era o valor do aluguel a partir dessa data. Isso não altera o valor atual da casa (esse fica em “Editar dados”).</p>'+
    '<div class="modal-actions">'+
      (rj ? '<button class="btn btn-danger" onclick="deleteReajusteHandler(\''+houseId+'\',\''+rj.id+'\')">Excluir</button>' : '<span></span>')+
      '<div class="modal-actions-right">'+
        '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
        '<button class="btn btn-primary" onclick="saveReajuste(\''+houseId+'\',\''+(reajusteId||'')+'\')">Salvar</button>'+
      '</div>'+
    '</div>'
  );
}
async function saveReajuste(houseId, reajusteId){
  const h = state.houses.find(function(x){ return x.id===houseId; });
  const valor = parseFloat(document.getElementById('f_valor').value)||0;
  const dataInicio = document.getElementById('f_data').value;
  if(!dataInicio){ showToast('Informe a data de início.', 'error'); return; }
  try{
    if(!h.aluguelHistorico) h.aluguelHistorico = [];
    if(reajusteId){
      const rj = h.aluguelHistorico.find(function(x){ return x.id===reajusteId; });
      rj.valor = valor; rj.dataInicio = dataInicio;
      await db.updateReajuste(rj);
    } else {
      const rj = await db.insertReajuste(houseId, { valor:valor, dataInicio:dataInicio });
      h.aluguelHistorico.push(rj);
    }
    closeModal(); render();
  }catch(e){ console.error(e); showToast('Erro ao salvar o reajuste.', 'error'); }
}
async function deleteReajusteHandler(houseId, reajusteId){
  const h = state.houses.find(function(x){ return x.id===houseId; });
  try{
    await db.deleteReajuste(reajusteId);
    h.aluguelHistorico = (h.aluguelHistorico||[]).filter(function(x){ return x.id!==reajusteId; });
    closeModal(); render();
  }catch(e){ console.error(e); showToast('Erro ao excluir o reajuste.', 'error'); }
}
async function registrarValorAtual(houseId){
  const h = state.houses.find(function(x){ return x.id===houseId; });
  const dataIni = h.contratoInicio || todayISO();
  try{
    if(!h.aluguelHistorico) h.aluguelHistorico = [];
    const rj = await db.insertReajuste(houseId, { valor:h.aluguelValor, dataInicio:dataIni });
    h.aluguelHistorico.push(rj);
    render();
    showToast('Valor atual registrado no histórico.', 'success');
  }catch(e){ console.error(e); showToast('Erro ao registrar.', 'error'); }
}
