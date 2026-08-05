/* ============================================================
   houses.js — Casas: grade, detalhe (abas), CRUD, pagamentos
   Reaproveita o estado em memória; grava no banco via db.*
   ============================================================ */

/* ---------- card e grade ---------- */
function houseFeatureLabels(h){
  const labels=[];
  if(Number(h.quartos)>0) labels.push({icon:FICO.bed,label:h.quartos+' quarto'+(Number(h.quartos)===1?'':'s')});
  if(Number(h.banheiros)>0) labels.push({icon:FICO.bath,label:h.banheiros+' banheiro'+(Number(h.banheiros)===1?'':'s')});
  if(h.sala) labels.push({icon:FICO.sofa,label:'Sala'});
  if(h.cozinha) labels.push({icon:FICO.kitchen,label:'Cozinha'});
  if(h.quintal) labels.push({icon:FICO.yard,label:'Quintal'});
  if(h.areaServico) labels.push({icon:FICO.laundry,label:'Área de serviço'});
  if(h.garagem) labels.push({icon:FICO.garage,label:'Garagem'});
  return labels;
}
function renderHouseFeatures(h){
  const labels=houseFeatureLabels(h);
  return '<div class="house-features">'+(labels.length?labels.map(function(item){return '<span><i class="feature-icon">'+item.icon+'</i>'+esc(item.label)+'</span>';}).join(''):'<span class="feature-empty">Características não informadas</span>')+'</div>';
}

/* ---------- prioridade operacional da lista ----------
   Uma casa pode ter mais de um ponto de atenção ao mesmo tempo. A lista
   guarda todos eles para os filtros, mas destaca somente a próxima ação
   mais importante. Isso evita misturar "situação" com "o que fazer". */
function houseDaysUntil(dateStr){
  if(!dateStr||!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  return diffDaysInclusive(todayISO(),dateStr)-1;
}
function houseHasRealOverdue(h,charge,contract){
  if(!charge||charge.tipo!=='atraso') return false;
  const contractId=contract&&contract.id;
  const proportionalDays=contract&&contract.inicio
    ? diffDaysInclusive(contract.inicio,todayISO())-1
    : 0;
  const proportionalOverdue=Number(charge.proporcional)>0&&proportionalDays>5;
  const rentOverdue=(charge.meses||[]).some(function(mes){
    return paymentStatus(h,mes,contractId)==='atrasado';
  });
  const energyOverdue=(charge.energiaMeses||[]).some(function(mes){
    return energiaStatus(h,mes,contractId)==='atrasado';
  });
  return proportionalOverdue||rentOverdue||energyOverdue;
}
function houseAttentionSignals(h,knownCharge){
  const cur=currentMonthStr();
  const contract=activeContract(h)||(h.status==='alugada'?currentRentContract(h):null);
  const charge=knownCharge===undefined?computeCobrancaCasa(h):knownCharge;
  const overdue=houseHasRealOverdue(h,charge,contract);
  const contractDays=contract&&contract.fim?houseDaysUntil(contract.fim):null;
  const contractEnding=!!(contract&&contract.ativo&&h.status==='alugada'&&contractDays!==null&&contractDays<=60);
  const energyState=h.status==='alugada'&&contract&&houseEnergyEnabled(h)
    ? energiaStatus(h,cur,contract.id)
    : 'fora_contrato';
  const energyPending=energyState==='pendente'||energyState==='sem_registro';
  const maintenance=h.status==='manutencao'||(h.chamados||[]).some(function(item){
    return item.status!=='resolvido'&&item.status!=='cancelado';
  });
  const vacancy=h.status==='vaga';
  const upcoming=!!(charge&&charge.tipo==='proximo');

  let rank=6,label='Nenhuma pendência imediata',tab='geral',days=9999;
  if(overdue){
    rank=0;label='Registrar pagamento em atraso';tab='pagamentos';days=-(Number(charge.dias)||0);
  }else if(contractEnding){
    rank=1;tab='contratos';days=contractDays;
    label=contractDays<0?'Regularizar contrato vencido':
      contractDays===0?'Revisar contrato que vence hoje':
      'Revisar contrato: vence em '+contractDays+' dia'+(contractDays===1?'':'s');
  }else if(energyPending){
    rank=2;tab='energia';days=0;
    label=energyState==='sem_registro'?'Lançar energia do mês':'Conferir recebimento da energia';
  }else if(maintenance){
    rank=3;label='Acompanhar manutenção';tab='manutencao';days=0;
  }else if(vacancy){
    rank=4;label='Vincular um inquilino';tab='inquilino';days=0;
  }else if(upcoming){
    rank=5;label='Acompanhar próximo vencimento';tab='pagamentos';days=Number(charge.dias)||0;
  }
  return {
    rank:rank,label:label,tab:tab,days:days,
    overdue:overdue,contract:contractEnding,energy:energyPending,
    maintenance:maintenance,vacancy:vacancy,upcoming:upcoming
  };
}
function openHouseAttention(houseId){
  const h=state.houses.find(function(item){return item.id===houseId;});
  if(!h) return;
  const attention=houseAttentionSignals(h);
  if(attention.vacancy&&attention.rank===4){
    if(canOperateProperties()) openAssignTenantModal(houseId);
    else openHouse(houseId,'inquilino');
    return;
  }
  openHouse(houseId,attention.tab);
}
function houseSituationLabel(h){
  return h.status==='alugada'?'Alugada':
    h.status==='manutencao'?'Em manutenção':'Vaga';
}
function sortedHousesForView(list){
  const ordem=state.casaOrdem||'atencao';
  return (list||[]).slice().sort(function(a,b){
    const nameCompare=String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR');
    if(ordem==='nome') return nameCompare;
    if(ordem==='valor'){
      const ca=currentRentContract(a),cb=currentRentContract(b);
      const va=(ca?contractExpectedRent(ca,currentMonthStr()):Number(a.aluguelValor)||0)+energiaValorMes(a,currentMonthStr(),ca&&ca.id);
      const vb=(cb?contractExpectedRent(cb,currentMonthStr()):Number(b.aluguelValor)||0)+energiaValorMes(b,currentMonthStr(),cb&&cb.id);
      return vb-va||nameCompare;
    }
    const chargeA=computeCobrancaCasa(a),chargeB=computeCobrancaCasa(b);
    if(ordem==='vencimento'){
      if(!chargeA||!chargeB){
        if(!!chargeA!==!!chargeB) return chargeA?-1:1;
      }else{
        const da=chargeA.tipo==='atraso'?-(Number(chargeA.dias)||0):Number(chargeA.dias)||0;
        const db=chargeB.tipo==='atraso'?-(Number(chargeB.dias)||0):Number(chargeB.dias)||0;
        if(da!==db) return da-db;
      }
      return nameCompare;
    }
    const aa=houseAttentionSignals(a,chargeA),ab=houseAttentionSignals(b,chargeB);
    if(aa.rank!==ab.rank) return aa.rank-ab.rank;
    if(aa.days!==ab.days) return aa.days-ab.days;
    return nameCompare;
  });
}

function renderHouseCard(h){
  const cur = currentMonthStr();
  const contract=currentRentContract(h);
  const contractId=contract?contract.id:'';
  const st = paymentStatus(h, cur,contractId);
  const t = tenantOf(h);
  const rent=contract?contractExpectedRent(contract,cur):aluguelValorMes(h,cur);
  const hasEnergy=houseEnergyEnabled(h);
  const energy=hasEnergy?energiaValorMes(h,cur,contractId):0;
  const hasEnergyEntry=hasEnergy&&!!energiaDoMes(h,cur,contractId);
  const total=rent+energy;
  const prorataState=contract?contractProrataFinancialSnapshot(h,contract):{expected:0,remaining:0};
  const prorataPending=prorataState.expected>0&&prorataState.remaining>0;
  const charge=computeCobrancaCasa(h);
  const attention=houseAttentionSignals(h,charge);
  const isOverdue=attention.overdue;
  let tabColor, statusLabel;
  if(st==='manutencao'){ tabColor='manut'; statusLabel='EM MANUTENÇÃO'; }
  else if(st==='vaga'){ tabColor='slate'; statusLabel='VAGA'; }
  else if(prorataPending){ tabColor='rust'; statusLabel='AJUSTE INICIAL'; }
  else if(st==='pago'){ tabColor='brass'; statusLabel='EM DIA'; }
  else if(st==='pago_atraso'){ tabColor='warn'; statusLabel='PAGO COM ATRASO'; }
  else if(st==='credito'){ tabColor='brass'; statusLabel='CRÉDITO A FAVOR'; }
  else if(st==='parcial'){ tabColor='warn'; statusLabel='PAGAMENTO PARCIAL'; }
  else if(st==='atrasado'){ tabColor='rust'; statusLabel='ATRASADO'; }
  else if(st==='tolerancia'){ tabColor='slate'; statusLabel='EM TOLERÂNCIA'; }
  else if(st==='fora_contrato'){ tabColor='slate'; statusLabel='PRÓXIMO CICLO'; }
  else { tabColor='slate'; statusLabel='PENDENTE'; }
  if(isOverdue){ tabColor='rust'; statusLabel='ATRASADO'; }
  const atraso = isOverdue ? '1' : '0';
  const searchData = (h.nome+' '+(h.endereco||'')+' '+(t?t.nome:'')).toLowerCase();
  const mayManageFinance=canManageFinance();
  const mayOperate=canOperateProperties();

  /* Dados de ordenação, lidos direto do DOM por ordenarCasas().
     Ficam aqui porque é onde os números já foram calculados —
     recalcular na hora de ordenar seria refazer trabalho. */
  const pesoSituacao = attention.rank;
  /* dias até vencer: negativo = já venceu (quanto menor, mais
     atrasado). Vazio quando não há nada a cobrar. */
  const diasVenc = charge
    ? (charge.tipo==='atraso' ? -charge.dias : charge.dias)
    : '';
  const ordAttrs = ' data-nome="'+esc(h.nome)+'"'+
    ' data-valor="'+total+'"'+
    ' data-peso="'+pesoSituacao+'"'+
    ' data-dias-venc="'+diasVenc+'"'+
    ' data-atencao-dias="'+attention.days+'"'+
    ' data-atencao="'+(attention.rank<6?'1':'0')+'"'+
    ' data-contrato="'+(attention.contract?'1':'0')+'"'+
    ' data-energia="'+(attention.energy?'1':'0')+'"'+
    ' data-manutencao="'+(attention.maintenance?'1':'0')+'"'+
    ' data-vaga="'+(attention.vacancy?'1':'0')+'"'+
    ' data-proximo="'+(attention.upcoming?'1':'0')+'"';
  if(isSimpleMode()){
    const simpleValue=isOverdue&&charge?charge.total:total;
    const simpleLabel=isOverdue?'VALOR EM ATRASO':'TOTAL DO MÊS';
    return '<div class="house-card simple-house-card tab-'+tabColor+(isOverdue?' is-overdue':'')+'" data-status="'+h.status+'" data-atraso="'+atraso+'" data-search="'+esc(searchData)+'"'+ordAttrs+' onclick="openSimpleHouseSummary(\''+h.id+'\')">'+
      '<div class="house-card-top"><div><div class="house-name">'+esc(h.nome)+'</div><div class="house-address">'+(t?esc(t.nome):(h.status==='vaga'?'Sem inquilino':'—'))+'</div></div><span class="chip chip-'+tabColor+'">'+statusLabel+'</span></div>'+
      renderHouseFeatures(h)+
      (typeof renderHouseLeadMatches==='function'?renderHouseLeadMatches(h):'')+
      '<div class="rent-tenant-home"><strong>Próxima ação:</strong> '+esc(attention.label)+'</div>'+
      '<div class="simple-house-value"><span>'+simpleLabel+'</span><strong class="num">'+fmtMoney(simpleValue)+'</strong></div>'+
      (h.status==='alugada'?'<div class="simple-house-actions" onclick="event.stopPropagation()">'+
          (mayManageFinance?'<button class="btn btn-primary" onclick="openSimplePayment(\''+h.id+'\')">'+((st==='pago'||st==='pago_atraso')&&!isOverdue?'Ver recebimentos':st==='tolerancia'?'Registrar pagamento':'Registrar pagamento')+'</button>':'')+
          '<button class="btn btn-ghost" onclick="openSimpleHouseSummary(\''+h.id+'\')">Ver histórico</button></div>':
        h.status==='vaga'?'<div class="simple-house-actions" onclick="event.stopPropagation()">'+
          (mayOperate?'<button class="btn btn-primary" onclick="openAssignTenantModal(\''+h.id+'\')">Vincular inquilino</button>':'')+
          '<button class="btn btn-ghost" onclick="openHouse(\''+h.id+'\')">Ver imóvel</button></div>':'')+
    '</div>';
  }
  return '<div class="house-card house-card-rich tab-'+tabColor+(isOverdue?' is-overdue':'')+'" data-status="'+h.status+'" data-atraso="'+atraso+'" data-search="'+esc(searchData)+'"'+ordAttrs+' onclick="openHouse(\''+h.id+'\')">'+
    '<div class="house-card-top"><div>'+
      '<div class="house-name">'+esc(h.nome)+'</div>'+
      '<div class="house-address">'+(h.endereco?esc(h.endereco):'Endereço não informado')+'</div>'+
    '</div><span class="chip chip-'+tabColor+'">'+statusLabel+'</span></div>'+
    '<div class="house-card-tenant"><span>INQUILINO</span><strong>'+(t?esc(t.nome):(h.status==='vaga'?'Sem inquilino':'—'))+'</strong></div>'+
    renderHouseFeatures(h)+
    (typeof renderHouseLeadMatches==='function'?renderHouseLeadMatches(h):'')+
    '<div class="rent-tenant-home"><strong>Próxima ação:</strong> '+esc(attention.label)+'</div>'+
    (h.status==='vaga'
      ? '<div class="simple-house-value"><span>ALUGUEL CADASTRADO</span><strong class="num">'+fmtMoney(h.aluguelValor||0)+'</strong></div>'
      : '<div class="house-card-values'+(!hasEnergy?' no-energy':'')+'"><div><span>Aluguel</span><strong class="num">'+fmtMoney(rent)+'</strong></div>'+
        (hasEnergy?'<div><span>Energia</span><strong class="num">'+(energy?fmtMoney(energy):'Não lançada')+'</strong></div>':'')+
        '<div class="house-total"><span>Total</span><strong class="num">'+fmtMoney(total)+'</strong></div></div>')+
    (h.status==='alugada'&&(mayManageFinance||mayOperate)?'<div class="house-card-actions" onclick="event.stopPropagation()">'+
      (mayManageFinance?'<button class="btn btn-primary btn-sm" onclick="openQuickRentPayment(\''+h.id+'\')">'+
        (st==='pago'||st==='pago_atraso'||st==='credito'?'Ver recebimentos':st==='parcial'?'Registrar outra parcela':st==='tolerancia'?'Registrar aluguel · tolerância':'Registrar aluguel')+'</button>'+
      '':'')+
      (hasEnergy&&(mayOperate||hasEnergyEntry)?'<button class="btn btn-energia btn-sm" onclick="openEnergiaModal(\''+h.id+'\',\''+cur+'\',\''+contractId+'\')">'+
        (mayOperate?(energiaPagaMes(h,cur,contractId)?'Energia paga ✓':'Registrar energia'):'Ver energia')+'</button>':'')+'</div>':'')+
    (h.status==='vaga'?'<div class="house-card-actions" onclick="event.stopPropagation()">'+
      (mayOperate?'<button class="btn btn-primary btn-sm" onclick="openAssignTenantModal(\''+h.id+'\')">Vincular inquilino</button>':'')+
      '<button class="btn btn-ghost btn-sm" onclick="openHouse(\''+h.id+'\',\'geral\')">Ver imóvel</button></div>':'')+
    '</div>';
}

/* busca + filtro de casas (manipula o DOM para não perder o foco do campo) */
function setCasaBusca(v){ state.casaBusca = v; aplicarFiltroCasas(); }
function setCasaFiltro(f){ state.casaFiltro = f; aplicarFiltroCasas(); }
function setCasaOrdem(o){ state.casaOrdem = o; aplicarFiltroCasas(); }

/* Cartão ou lista. Com 10 casas o cartão já cansa; com 30, some a
   visão de conjunto. A lista mostra as mesmas informações em uma
   linha por casa — quem escolhe é quem usa.
   Só troca a classe do contêiner: o HTML de cada casa é o mesmo,
   então nada re-renderiza e a busca não perde o foco. */
function setCasaVisao(v){
  state.casaVisao = v;
  const grid = document.getElementById('casaGrid');
  if(grid) grid.classList.toggle('house-grid-list', v==='lista');
  document.querySelectorAll('#casaToolbar .casa-visao-opcao').forEach(function(b){
    const ativo = b.getAttribute('data-visao')===v;
    b.classList.toggle('active', ativo);
    b.setAttribute('aria-pressed', ativo ? 'true' : 'false');
  });
}

/* Ordena reposicionando os cartões que já estão na tela, em vez de
   redesenhar tudo. Mantém o foco do campo de busca. */
function ordenarCasas(grid){
  const ordem = state.casaOrdem || 'atencao';
  const cards = Array.prototype.slice.call(grid.querySelectorAll('.house-card'));
  const num = function(card, attr){ return Number(card.getAttribute(attr)) || 0; };

  cards.sort(function(a,b){
    if(ordem==='atencao'){
      const pa=num(a,'data-peso'),pb=num(b,'data-peso');
      if(pa!==pb) return pa-pb;
      const da=num(a,'data-atencao-dias'),db=num(b,'data-atencao-dias');
      if(da!==db) return da-db;
    }else if(ordem==='vencimento'){
      /* quem vence antes primeiro; casa sem cobrança vai para o fim */
      const da = num(a,'data-dias-venc'), db = num(b,'data-dias-venc');
      const semA = a.getAttribute('data-dias-venc')==='' , semB = b.getAttribute('data-dias-venc')==='';
      if(semA !== semB) return semA ? 1 : -1;
      if(da !== db) return da - db;
    } else if(ordem==='valor'){
      /* maior valor primeiro: é o que se quer ver ao ordenar por dinheiro */
      const va = num(a,'data-valor'), vb = num(b,'data-valor');
      if(va !== vb) return vb - va;
    } else if(ordem==='situacao'){
      /* atrasado, pendente, em dia, vaga, manutenção — o que pede
         ação primeiro */
      const pa = num(a,'data-peso'), pb = num(b,'data-peso');
      if(pa !== pb) return pa - pb;
    }
    /* desempate sempre pelo nome, para a ordem ser estável */
    return (a.getAttribute('data-nome')||'').localeCompare(b.getAttribute('data-nome')||'','pt-BR');
  });

  cards.forEach(function(c){ grid.appendChild(c); });
}

function aplicarFiltroCasas(){
  const grid = document.getElementById('casaGrid');
  if(!grid) return;
  ordenarCasas(grid);
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
    else if(f==='manutencao' && card.getAttribute('data-manutencao')!=='1') ok=false;
    else if(f==='atraso' && !atraso) ok=false;
    else if(f==='atencao' && card.getAttribute('data-atencao')!=='1') ok=false;
    else if(f==='contrato' && card.getAttribute('data-contrato')!=='1') ok=false;
    else if(f==='energia' && card.getAttribute('data-energia')!=='1') ok=false;
    else if(f==='proximo' && card.getAttribute('data-proximo')!=='1') ok=false;
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
    '</div>'+(!isSimpleMode()&&canOperateProperties()?'<button class="btn btn-primary btn-sm" onclick="openAddHouseModal()">+ Novo imóvel</button>':'')+'</div>';
  if(state.houses.length===0){
    return header + emptyState('Nenhum imóvel ainda. Crie em "+ Novo imóvel" ou importe seu backup pelo menu (⋯).', houseIconSvg());
  }
  const counts=state.houses.reduce(function(total,h){
    const attention=houseAttentionSignals(h);
    total.todas++;
    if(h.status==='alugada') total.alugada++;
    if(attention.rank<6) total.atencao++;
    if(attention.overdue) total.atraso++;
    if(attention.contract) total.contrato++;
    if(attention.energy) total.energia++;
    if(attention.maintenance) total.manutencao++;
    if(attention.vacancy) total.vaga++;
    if(attention.upcoming) total.proximo++;
    return total;
  },{todas:0,alugada:0,atencao:0,atraso:0,contrato:0,energia:0,manutencao:0,vaga:0,proximo:0});
  const filtros = isSimpleMode()
    ? [['todas','Todas'],['atencao','Precisam de atenção'],['atraso','Em atraso']]
    : [['todas','Todas'],['atencao','Precisam de atenção'],['atraso','Em atraso'],
      ['contrato','Contratos vencendo'],['energia','Energia pendente'],
      ['manutencao','Manutenção'],['vaga','Vagas'],['proximo','Próximos vencimentos'],
      ['alugada','Alugadas']];
  const chips = filtros.map(function(f){
    return '<button class="filter-chip'+((state.casaFiltro||'todas')===f[0]?' active':'')+'" data-filtro="'+f[0]+'" onclick="setCasaFiltro(\''+f[0]+'\')">'+f[1]+' · '+counts[f[0]]+'</button>';
  }).join('');
  /* Ordenação e forma de exibir. Escondidas no modo simples, que
     existe justamente para tirar controle da frente. */
  const ordens = [['atencao','Prioridade'],['nome','Nome'],['vencimento','Vencimento'],['valor','Valor'],['situacao','Situação']];
  const seletorOrdem = isSimpleMode() ? '' :
    '<label class="casa-ordem"><span class="sr-only">Ordenar casas por</span>'+
      '<select onchange="setCasaOrdem(this.value)">'+
        ordens.map(function(o){
          return '<option value="'+o[0]+'"'+((state.casaOrdem||'atencao')===o[0]?' selected':'')+'>'+o[1]+'</option>';
        }).join('')+
      '</select></label>';

  const seletorVisao = isSimpleMode() ? '' :
    '<div class="casa-visao" role="group" aria-label="Forma de exibir as casas">'+
      '<button class="btn btn-ghost casa-visao-opcao'+(state.casaVisao!=='lista'?' active':'')+'" data-visao="cartoes" '+
        'aria-pressed="'+(state.casaVisao!=='lista')+'" aria-label="Ver em cartões" title="Cartões" '+
        'onclick="setCasaVisao(\'cartoes\')"><span aria-hidden="true">▦</span></button>'+
      '<button class="btn btn-ghost casa-visao-opcao'+(state.casaVisao==='lista'?' active':'')+'" data-visao="lista" '+
        'aria-pressed="'+(state.casaVisao==='lista')+'" aria-label="Ver em lista" title="Lista" '+
        'onclick="setCasaVisao(\'lista\')"><span aria-hidden="true">☰</span></button>'+
    '</div>';

  const toolbar = '<div class="toolbar" id="casaToolbar">'+
      '<div class="search-wrap"><span class="search-ico">'+FICO.search+'</span>'+
        '<input id="casaBuscaInput" class="search-input" placeholder="Buscar casa, endereço ou inquilino…" value="'+esc(state.casaBusca||'')+'" oninput="setCasaBusca(this.value)"></div>'+
      '<div class="filter-chips">'+chips+'</div>'+
      seletorOrdem + seletorVisao +
    '</div>';
  const grid = '<div class="house-grid'+(state.casaVisao==='lista'?' house-grid-list':'')+'" id="casaGrid">'+
      sortedHousesForView(state.houses).map(renderHouseCard).join('')+'</div>'+
    '<div class="empty-state" id="casaEmpty" style="display:none">Nenhuma casa encontrada com esse filtro.</div>';
  return header + toolbar + grid;
}

function openSimplePayment(houseId){
  if(!requireFinancePermission())return;
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
  const rent=contract?contractExpectedRent(contract,cur):aluguelValorMes(h,cur);
  const energy=energiaValorMes(h,cur,contractId);
  const currentStatus=paymentStatus(h,cur,contractId);
  const v2Payments=activeMoneyRecords(h.cobrancas).reduce(function(rows,charge){
    receiptsForCharge(h,charge).forEach(function(receipt){
      rows.push({mes:charge.competencia||charge.mes,valorPago:Number(receipt.valor)||0,dataPagamento:receipt.dataPagamento});
    });
    return rows;
  },[]);
  const payments=(v2Payments.length?v2Payments:(h.pagamentos||[])).slice()
    .sort(function(a,b){return String(b.dataPagamento||b.mes||'').localeCompare(String(a.dataPagamento||a.mes||''));}).slice(0,6);
  const history=payments.length?'<div class="simple-history-list">'+payments.map(function(p){
    return '<div><span>'+monthLabel(p.mes)+'</span><strong class="num">'+fmtMoney(p.valorPago)+'</strong><small>'+fmtDateBR(p.dataPagamento)+'</small></div>';
  }).join('')+'</div>':'<div class="empty-state">Nenhum pagamento registrado ainda.</div>';
  openModal('<div class="simple-modal-status'+(overdue?' overdue':'')+'"><span>'+(overdue?'EM ATRASO':
    currentStatus==='pago'?'EM DIA':currentStatus==='pago_atraso'?'PAGO COM ATRASO':currentStatus==='credito'?'CRÉDITO A FAVOR':
    currentStatus==='parcial'?'PAGAMENTO PARCIAL':currentStatus==='tolerancia'?'EM TOLERÂNCIA':'PENDENTE')+'</span></div>'+
    '<h3 class="modal-title simple-modal-title">'+esc(h.nome)+'</h3><p class="modal-text">'+(t?esc(t.nome):'Sem inquilino')+'</p>'+
    '<div class="simple-modal-values"><div><span>Aluguel</span><strong class="num">'+fmtMoney(rent)+'</strong></div><div><span>Energia</span><strong class="num">'+(energy?fmtMoney(energy):'—')+'</strong></div><div><span>Total do mês</span><strong class="num">'+fmtMoney(rent+energy)+'</strong></div></div>'+
    '<h4 class="simple-history-title">Últimos pagamentos</h4>'+history+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Fechar</button>'+(h.status==='alugada'&&canManageFinance()?'<button class="btn btn-primary" onclick="closeModal();openSimplePayment(\''+h.id+'\')">Registrar pagamento</button>':'')+'</div>');
}

/* ---------- atrasos no histórico (aba Geral) ---------- */
function countHistoricoAtrasos(h){
  let count=0;
  const charges=activeMoneyRecords(h.cobrancas);
  if(charges.length){
    charges.filter(function(charge){return charge.tipo==='aluguel';}).forEach(function(charge){
      const latest=receiptsForCharge(h,charge).map(function(receipt){return receipt.dataPagamento||'';}).sort().pop();
      const graceEnd=dueDateWithGrace(charge.vencimento,paymentGraceDays(null,charge));
      if(latest&&graceEnd&&new Date(latest+'T12:00:00')>graceEnd) count++;
    });
  }else{
    h.pagamentos.forEach(function(p){
      const parts=p.mes.split('-').map(Number);
      const due=dueDateWithGrace(new Date(parts[0],parts[1]-1,h.diaVencimento||5,23,59,59),DEFAULT_PAYMENT_GRACE_DAYS);
      const paid=new Date((p.dataPagamento||todayISO())+'T12:00:00');
      if(paid>due) count++;
    });
  }
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
  bolt:     svgIco('<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" stroke-linejoin="round"/>'),
  bed:      svgIco('<path d="M3 17V8M21 17v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5M3 14h18M5 10V8a2 2 0 012-2h2a2 2 0 012 2v2M3 19v-2h18v2" stroke-linecap="round" stroke-linejoin="round"/>'),
  bath:     svgIco('<path d="M4 12h16v3a4 4 0 01-4 4H8a4 4 0 01-4-4v-3zM7 12V6a3 3 0 016 0M7 19l-1 2M17 19l1 2" stroke-linecap="round" stroke-linejoin="round"/>'),
  sofa:     svgIco('<path d="M6 11V8a3 3 0 013-3h6a3 3 0 013 3v3M5 10a2 2 0 00-2 2v5h18v-5a2 2 0 00-2-2M6 17v2M18 17v2" stroke-linecap="round" stroke-linejoin="round"/>'),
  kitchen:  svgIco('<path d="M4 5h16v15H4zM4 11h16M9 11v9M7 8h.01M11 8h.01M15 8h2" stroke-linecap="round" stroke-linejoin="round"/>'),
  yard:     svgIco('<path d="M12 21V9M12 14c-4 0-7-2-7-6 4 0 7 2 7 6zM12 11c3 0 6-2 6-6-3 0-6 2-6 6z" stroke-linecap="round" stroke-linejoin="round"/>'),
  laundry:  svgIco('<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="13" r="5"/><path d="M8 7h.01M12 7h3" stroke-linecap="round"/>'),
  garage:   svgIco('<path d="M3 10l9-6 9 6v11H3V10zM7 21v-8h10v8M7 16h10" stroke-linecap="round" stroke-linejoin="round"/>')
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
  if(st==='pago'||st==='pago_atraso'||st==='credito') return FICO.okCircle;
  if(st==='atrasado') return FICO.alert;
  return FICO.clock;
}
function payIcoColor(st){
  if(st==='pago'||st==='credito') return 'var(--brass-deep)';
  if(st==='pago_atraso') return 'var(--warn-deep)';
  if(st==='atrasado') return 'var(--rust)';
  if(st==='parcial'||st==='tolerancia') return 'var(--warn-deep)';
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
  const hasEnergy=houseEnergyEnabled(h);
  const energyEntry=hasEnergy?energiaDoMes(h,cur,contractId):null;
  const enerVal = hasEnergy?energiaValorMes(h, cur,contractId):0;
  const enerKwh = hasEnergy?energiaKwhMes(h, cur,contractId):0;
  const enerSt = hasEnergy?energiaStatus(h, cur,contractId):'desativada';
  const rentValue=contract?contractExpectedRent(contract,cur):aluguelValorMes(h,cur);
  const totalMes = rentValue + enerVal;
  const enerChip = enerSt==='pago'||enerSt==='credito'?'brass':enerSt==='pago_atraso'?'warn':enerSt==='atrasado'?'rust':enerSt==='pendente'||enerSt==='parcial'||enerSt==='tolerancia'?'warn':'slate';
  const enerLbl = enerSt==='pago'?'PAGA':enerSt==='pago_atraso'?'PAGA COM ATRASO':enerSt==='credito'?'CRÉDITO':enerSt==='parcial'?'PARCIAL':enerSt==='atrasado'?'ATRASADA':enerSt==='tolerancia'?'EM TOLERÂNCIA':enerSt==='pendente'?'PENDENTE':enerSt==='sem_registro'?'NÃO LANÇADA':'—';
  const totalAno = receivedForCompetenceYear(h,cur.slice(0,4),'aluguel');
  const despesasAno = h.despesas.filter(function(e){ return e.data && e.data.slice(0,4)===cur.slice(0,4); }).reduce(function(s,e){ return s+(Number(e.valor)||0); },0);
  const atrasosHist = countHistoricoAtrasos(h);
  const t = tenantOf(h);
  const tempo = tempoNaCasa(h);
  const prorataState=contract?contractProrataFinancialSnapshot(h,contract):{expected:0,remaining:0};
  const prorataPendente=prorataState.expected>0&&prorataState.remaining>0;
  const payChip = st==='pago'||st==='credito'?'brass':st==='pago_atraso'?'warn':st==='atrasado'||prorataPendente?'rust':st==='parcial'||st==='tolerancia'?'warn':st==='manutencao'?'manut':'slate';
  const payLbl = prorataPendente?'AJUSTE INICIAL':st==='pago'?'PAGO':st==='pago_atraso'?'PAGO COM ATRASO':st==='credito'?'CRÉDITO A FAVOR':st==='parcial'?'PAGAMENTO PARCIAL':st==='atrasado'?'ATRASADO':st==='tolerancia'?'EM TOLERÂNCIA':st==='vaga'?'VAGA':st==='manutencao'?'EM MANUTENÇÃO':st==='fora_contrato'?'PRÓXIMO CICLO':'PENDENTE';
  const statusTxt = h.status==='alugada'?'Alugada':h.status==='manutencao'?'Em manutenção':'Vaga';
  const stColor = h.status==='alugada'?'#D7A94B':h.status==='manutencao'?'#9FC1D6':'#B8C4BD';
  return '<div class="detail-grid general-detail-grid">'+
    '<div class="id-panel property-summary-card">'+
      '<div class="property-summary-head"><div><div class="id-eyebrow">SITUAÇÃO</div><span class="id-chip" style="color:'+stColor+'">'+statusTxt.toUpperCase()+'</span></div>'+
        '<span class="chip chip-'+payChip+'">ALUGUEL '+payLbl+'</span></div>'+
      '<div class="property-money-grid'+(!hasEnergy?' no-energy':'')+'"><div><span>ALUGUEL</span><strong class="num">'+fmtMoney(rentValue)+'</strong></div>'+
        (hasEnergy?'<div><span>ENERGIA</span><strong class="num">'+(enerVal?fmtMoney(enerVal):'—')+'</strong>'+(enerKwh?'<small>'+enerKwh+' kWh</small>':'')+'</div>':'')+
        '<div class="property-money-total"><span>TOTAL DO MÊS</span><strong class="num">'+fmtMoney(totalMes)+'</strong></div></div>'+
      '<div class="property-features">'+renderHouseFeatures(h)+'</div>'+
      '<div class="property-tenant-block"><span>INQUILINO ATUAL</span>'+
        (t?'<strong>'+esc(t.nome)+'</strong>'+(tempo?'<small>na casa há '+tempo+'</small>':''):'<strong>Sem inquilino</strong>')+'</div>'+
      (contract?'<div class="property-contract-line"><span>Contrato desde '+fmtDateBR(contract.inicio)+'</span><span>'+esc(contractModeLabel(contract))+'</span></div>':'')+
    '</div>'+
    '<div>'+
      fieldSection(FICO.calendar, 'Cobrança')+
      '<div class="field-card">'+
        fieldLine('Dia de vencimento', String(h.diaVencimento||5), true, FICO.calendar)+
        '<div class="field-line"><span class="fl-label"><span class="fl-ico">'+FICO.money+'</span>Pagamento do mês</span><span class="chip chip-'+payChip+'">'+payLbl+'</span></div>'+
        (h.status==='alugada'&&hasEnergy ? '<div class="field-line"><span class="fl-label"><span class="fl-ico">'+FICO.bolt+'</span>Energia do mês</span><span class="chip chip-'+enerChip+'">'+enerLbl+'</span></div>' : '')+
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
    (canManageFinance()&&h.status==='alugada'
      ? (st==='pago'||st==='pago_atraso'||st==='credito'
          ? '<button class="btn btn-ghost btn-sm" onclick="openQuickRentPayment(\''+h.id+'\')">Pagamento do mês ✓</button>'
          : '<button class="btn btn-primary btn-sm" onclick="openQuickRentPayment(\''+h.id+'\')">'+(st==='parcial'?'Registrar outra parcela':'Registrar pagamento')+'</button>')
      : '')+
    ((canOperateProperties()||(canManageFinance()&&energyEntry))&&h.status==='alugada'&&hasEnergy
      ? '<button class="btn btn-sm btn-energia" onclick="openEnergiaModal(\''+h.id+'\',\''+cur+'\',\''+contractId+'\')">'+
          (canOperateProperties()
            ? (enerSt==='pago'||enerSt==='pago_atraso'||enerSt==='credito'?'Energia paga ✓':enerSt==='parcial'?'Conferir energia':'Registrar energia')
            : 'Ver energia')+'</button>'
      : '')+
    (canManageFinance()&&h.status==='alugada' && (st==='atrasado'||st==='pendente'||st==='tolerancia'||st==='parcial') ? '<button class="btn btn-ghost btn-sm" onclick="cobrarWhatsApp(\''+h.id+'\',\''+cur+'\',\''+contractId+'\')">Cobrar via WhatsApp</button>' : '')+
    (canManageFinance()&&h.status==='alugada' && (st==='atrasado'||st==='pendente'||st==='tolerancia'||st==='parcial') && state.config.pixChave ? '<button class="btn btn-ghost btn-sm" onclick="openPixCharge(\''+h.id+'\',\''+cur+'\',\''+contractId+'\',false)">Copiar PIX</button>' : '')+
    (canOperateProperties()?'<button class="btn btn-ghost btn-sm" onclick="registrarVistoria(\''+h.id+'\')">Registrar vistoria hoje</button>':'')+
    (canOperateProperties()?'<button class="btn btn-ghost btn-sm" onclick="openAssignTenantModal(\''+h.id+'\')">'+(t?'Trocar inquilino':'Vincular inquilino')+'</button>':'')+
  '</div>';
}
function renderInquilinoTab(h){
  const t = tenantOf(h);
  const contract=activeContract(h);
  if(!t){
    return '<div class="empty-state">Este imóvel não tem inquilino vinculado.</div>'+
      (canOperateProperties()?'<div class="quick-actions"><button class="btn btn-primary btn-sm" onclick="openAssignTenantModal(\''+h.id+'\')">Vincular inquilino</button></div>':'');
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
      fieldSection(FICO.phone, 'Dados pessoais e contato')+
      '<div class="field-card">'+
        fieldLine('Telefone', t.telefone?esc(t.telefone):'—', false, FICO.phone)+
        fieldLine('E-mail', t.email?esc(t.email):'—', false, FICO.mail)+
        fieldLine('CPF/RG', esc(maskSensitiveDocument(t.documento)), false, FICO.id)+
        fieldLine('Emergência', t.emergenciaNome?esc(t.emergenciaNome):'—', false, FICO.shield)+
      '</div>'+
      fieldSection(FICO.doc, 'Vínculo com este imóvel')+
      '<div class="field-card">'+
        fieldLine('Tempo na casa', tempoNaCasa(h)||'—', false, FICO.clock)+
        fieldLine('Início', contract?fmtDateBR(contract.inicio):(h.contratoInicio?fmtDateBR(h.contratoInicio):'—'), false, FICO.calendar)+
        fieldLine('Fim', contract?fmtDateBR(contract.fim):(h.contratoFim?fmtDateBR(h.contratoFim):'—'), false, FICO.flag)+
        (contract?fieldLine('Vencimento',contractModeLabel(contract),false,FICO.money):'')+
      '</div>'+
    '</div>'+
  '</div>'+
  (canOperateProperties()?'<div class="quick-actions">'+
    '<button class="btn btn-ghost btn-sm" onclick="openEditTenantModal(\''+t.id+'\')">Editar dados do inquilino</button>'+
    '<button class="btn btn-ghost btn-sm" onclick="openAssignTenantModal(\''+h.id+'\')">Trocar inquilino</button>'+
    '<button class="btn btn-danger btn-sm" onclick="unassignTenant(\''+h.id+'\')">Encerrar vínculo</button>'+
  '</div>':'');
}
function renderPagamentosTab(h){
  const cur = currentMonthStr();
  const totalAno = receivedForCompetenceYear(h,cur.slice(0,4),'aluguel');
  const contracts=(h.contracts||[]).slice().sort(function(a,b){return String(b.inicio).localeCompare(String(a.inicio));});
  if(!contracts.length) return '<div class="empty-state">Cadastre um contrato para organizar os pagamentos por inquilino.</div>';
  return '<div style="margin-bottom:14px;"><span class="summary-pill"><span class="sp-ico">'+FICO.money+'</span>Recebido em '+cur.slice(0,4)+' <span class="num">'+fmtMoney(totalAno)+'</span></span></div>'+contracts.map(function(c){
    const tenant=contractTenant(c),first=contractFirstFullMonth(c),last=(c.fim&&c.fim.slice(0,7)<cur)?c.fim.slice(0,7):cur;
    const months=[];let m=last;
    while(first&&m>=first&&months.length<36){if(contractCoversMonth(c,m))months.push(m);m=addMonths(m,-1);}
    const prorata=contractProrataValue(c);
    const prorataState=contractProrataFinancialSnapshot(h,c);
    const prorataStatus=prorataState.remaining<=0
      ?'PAGO'
      :prorataState.received>0?'PARCIAL':'PENDENTE';
    const prorataTone=prorataState.remaining<=0?'brass':'warn';
    const prorataContent='<span class="row-ico">'+FICO.money+'</span><div class="ledger-row-main">Ajuste inicial<div class="ledger-row-sub">'+
      contractProrataDays(c)+' dias proporcionais'+
      (prorataState.received>0&&prorataState.remaining>0?' · recebido '+fmtMoney(prorataState.received):'')+
      '</div></div><span class="chip chip-'+prorataTone+'">'+prorataStatus+'</span><div class="ledger-row-value"><strong class="num">'+fmtMoney(prorataState.expected)+'</strong>'+
      (prorataState.remaining>0?'<small> saldo '+fmtMoney(prorataState.remaining)+'</small>':'')+'</div>';
    return '<section class="contract-ledger"><div class="contract-ledger-head"><div><strong>'+esc(tenant?tenant.nome:'Inquilino removido')+'</strong><span>'+fmtDateBR(c.inicio)+' — '+(c.fim?fmtDateBR(c.fim):'atual')+'</span></div><span class="chip chip-'+contractStatusTone(c)+'">'+contractStatusLabel(c)+'</span></div>'+
      (prorata?(canManageFinance()
        ?'<button class="ledger-row proportional-row" onclick="openProrataPaymentModal(\''+h.id+'\',\''+c.id+'\')">'+prorataContent+'</button>'
        :'<div class="ledger-row proportional-row">'+prorataContent+'</div>'):'')+
      '<div class="list-card"><div class="ledger">'+months.map(function(mes){
        const st=paymentStatus(h,mes,c.id),rec=paymentForMonth(h,mes,c.id);
        const chipClass=st==='pago'||st==='credito'?'brass':st==='pago_atraso'?'warn':st==='atrasado'?'rust':st==='tolerancia'||st==='parcial'?'warn':'slate';
        const statusText=st==='pago'?'PAGO':st==='pago_atraso'?'PAGO COM ATRASO':st==='credito'?'CRÉDITO':st==='parcial'?'PAGAMENTO PARCIAL':st==='atrasado'?'ATRASADO':st==='tolerancia'?'EM TOLERÂNCIA':'A VENCER';
        const expected=chargeForMonth(h,mes,'aluguel',c.id);
        const expectedValue=expected?(Number(expected.valorPrevisto)||0):contractExpectedRent(c,mes);
        return '<div class="ledger-row'+(st==='atrasado'?' rust-row':'')+'" onclick="openPaymentModal(\''+h.id+'\',\''+mes+'\',\''+c.id+'\')"><span class="row-ico" style="color:'+payIcoColor(st)+'">'+payIcon(st)+'</span><div class="ledger-row-main">'+monthLabel(mes)+'<div class="ledger-row-sub">vence dia '+dueDayForMonth(mes,contractBillingDay(c))+'</div></div><span class="chip chip-'+chipClass+'">'+statusText+'</span><div class="ledger-row-value"><strong class="num">'+fmtMoney(rec?rec.valorPago:0)+'</strong><small> de '+fmtMoney(expectedValue)+'</small></div></div>';
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
  const totalAno = receivedForCompetenceYear(h,anoAtual,'energia');
  const kwhAno = (h.energias||[]).filter(function(e){ return e.mes.slice(0,4)===anoAtual; }).reduce(function(s,e){ return s+(Number(e.kwh)||0); },0);
  return '<div style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap;">'+
      '<span class="summary-pill"><span class="sp-ico">'+FICO.bolt+'</span>Recebido em '+anoAtual+' <span class="num">'+fmtMoney(totalAno)+'</span></span>'+
      (kwhAno?'<span class="summary-pill"><span class="sp-ico">'+FICO.chart+'</span>'+kwhAno+' kWh no ano</span>':'')+
    '</div>'+
    '<div class="list-card"><div class="ledger">'+months.map(function(mes){
      const stt = energiaStatus(h, mes,contract.id);
      const e = energiaDoMes(h, mes,contract.id);
      const chipClass = stt==='pago'||stt==='credito'?'brass':stt==='pago_atraso'?'warn':stt==='atrasado'?'rust':stt==='pendente'||stt==='tolerancia'||stt==='parcial'?'warn':'slate';
      const chipLbl = stt==='pago'?'PAGA':stt==='pago_atraso'?'PAGA COM ATRASO':stt==='credito'?'CRÉDITO':stt==='parcial'?'PARCIAL':stt==='atrasado'?'ATRASADA':stt==='tolerancia'?'EM TOLERÂNCIA':stt==='pendente'?'PENDENTE':'NÃO LANÇADA';
      const valorTxt = e ? fmtMoney(e.valor) : '—';
      const sub = e ? (e.kwh?(e.kwh+' kWh'):'sem consumo informado') : 'toque para lançar';
      const icoColor = stt==='pago'||stt==='credito'?'var(--brass-deep)':stt==='atrasado'?'var(--rust)':'var(--warn-deep)';
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
    (canManageFinance()?'<button class="btn btn-primary btn-sm" onclick="openExpenseModal(\''+h.id+'\')">+ Nova despesa</button>':'')+'</div>'+
    (sorted.length===0
      ? emptyState('Nenhuma despesa financeira registrada ainda.', expenseIconSvg())
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
    case 'manutencao': return renderMaintenanceTab(h);
    case 'despesas': return renderDespesasTab(h);
    case 'fotos': return renderFotosTab(h);
    case 'documentos': return renderDocumentsTab(h);
    default: return '';
  }
}
function renderHouseDetail(){
  const h = state.houses.find(function(x){ return x.id===state.activeHouseId; });
  if(!h){ state.view='casas'; return renderCasasView(); }
  const tabs = [['geral','Geral'],['inquilino','Inquilino'],['contratos','Contratos'],['pagamentos','Pagamentos']]
    .concat(houseEnergyEnabled(h)?[['energia','Energia']]:[])
    .concat([['reajustes','Reajustes'],['manutencao','Manutenção'],['despesas','Despesas'],['fotos','Fotos'],['documentos','Documentos']]);
  if(state.activeTab==='energia'&&!houseEnergyEnabled(h)) state.activeTab='geral';
  const attention=houseAttentionSignals(h);
  const statusTone=h.status==='alugada'?'brass':h.status==='manutencao'?'manut':'slate';
  const statusAndAction='<div class="field-card">'+
    '<div class="field-line"><span class="fl-label">Situação do imóvel</span><span class="chip chip-'+statusTone+'">'+houseSituationLabel(h).toUpperCase()+'</span></div>'+
    '<div class="field-line"><span class="fl-label">Próxima ação</span><span class="fl-value">'+esc(attention.label)+'</span></div>'+
    (attention.rank<6&&(!attention.vacancy||canOperateProperties())?'<div class="quick-actions"><button class="btn btn-primary btn-sm" onclick="openHouseAttention(\''+h.id+'\')">'+esc(attention.label)+'</button></div>':'')+
  '</div>'+
  /* Ponte com a Vitrine: publicar este imóvel no site sem redigitá-lo.
     Só aparece para quem tem o módulo. */
  (typeof renderVitrinePublicacaoImovel==='function'?renderVitrinePublicacaoImovel(h):'');
  return '<button class="back-link" onclick="irCasas()">← Casas</button>'+
    '<div class="page-header"><div>'+
      '<div class="eyebrow">IMÓVEL</div>'+
      '<h1 class="page-title">'+esc(h.nome)+'</h1>'+
      '<div class="page-sub">'+(h.endereco?esc(h.endereco):'Endereço não informado')+'</div>'+
    '</div>'+(canOperateProperties()?'<button class="btn btn-ghost btn-sm" onclick="openEditHouseModal(\''+h.id+'\')">Editar imóvel</button>':'')+'</div>'+
    statusAndAction+
    '<div class="tabs">'+tabs.map(function(t){
      const atual=state.activeTab===t[0];
      return '<button class="tab'+(atual?' active':'')+'"'+(atual?' aria-current="true"':'')+' onclick="switchTab(\''+t[0]+'\')">'+t[1]+'</button>';
    }).join('')+'</div>'+
    '<div class="tab-panel">'+renderTabContent(h)+'</div>';
}

/* ---------- CRUD: casas ---------- */
function houseDescriptionFields(h){
  h=h||{};
  return '<div class="house-description-intro"><strong>Quais ambientes este imóvel possui?</strong><span>Essas informações aparecem nos cartões e ajudam a encontrar interessados compatíveis.</span></div>'+
    '<div class="field-row"><label class="field"><span>Quartos</span><input id="f_quartos" type="number" min="0" step="1" value="'+(h.quartos||0)+'"></label>'+
    '<label class="field"><span>Banheiros</span><input id="f_banheiros" type="number" min="0" step="1" value="'+(h.banheiros||0)+'"></label></div>'+
    '<div class="feature-check-grid house-room-checks">'+
      '<label class="field-check"><input type="checkbox" id="f_sala"'+(h.sala?' checked':'')+'><span class="room-check-icon">'+FICO.sofa+'</span><span>Sala</span></label>'+
      '<label class="field-check"><input type="checkbox" id="f_cozinha"'+(h.cozinha?' checked':'')+'><span class="room-check-icon">'+FICO.kitchen+'</span><span>Cozinha</span></label>'+
      '<label class="field-check"><input type="checkbox" id="f_quintal"'+(h.quintal?' checked':'')+'><span class="room-check-icon">'+FICO.yard+'</span><span>Quintal</span></label>'+
      '<label class="field-check"><input type="checkbox" id="f_area_servico"'+(h.areaServico?' checked':'')+'><span class="room-check-icon">'+FICO.laundry+'</span><span>Área de serviço</span></label>'+
      '<label class="field-check"><input type="checkbox" id="f_garagem"'+(h.garagem?' checked':'')+'><span class="room-check-icon">'+FICO.garage+'</span><span>Garagem</span></label></div>'+ 
    '<div class="house-public-settings"><label class="field-check"><input type="checkbox" id="f_publicado"'+(h.publicado?' checked':'')+'><span><strong>Publicar este imóvel no catálogo</strong><small>Ele só aparecerá enquanto estiver com status Vaga.</small></span></label>'+
    '<label class="field"><span>Descrição para o anúncio</span><textarea id="f_descricao_publica" maxlength="3000" rows="4" placeholder="Conte os principais diferenciais do imóvel…">'+esc(h.descricaoPublica||'')+'</textarea></label></div>';
}
function houseEnergyFields(h){
  h=h||{};
  return energyModuleEnabled()?'<div class="house-energy-settings"><label class="field-check"><input type="checkbox" id="f_house_energy"'+(h.energiaAtiva!==false?' checked':'')+' onchange="syncHouseEnergyFields()"><span><strong>Este imóvel utiliza Energia</strong><small>Permite leituras e cobranças separadas.</small></span></label>'+
    '<label class="field"><span>Dia padrão do vencimento da energia</span><input id="f_energy_due" type="number" min="1" max="31" value="'+(h.energiaDiaVencimento||5)+'"></label></div>':'';
}
function houseCharacteristicsFields(h){
  return '<div class="form-section-title">Características do imóvel</div>'+houseDescriptionFields(h)+houseEnergyFields(h);
}
function syncHouseEnergyFields(){
  const check=document.getElementById('f_house_energy'),due=document.getElementById('f_energy_due');
  if(due) due.disabled=!!(check&&!check.checked);
}
function readHouseCharacteristics(h){
  const energyCheck=document.getElementById('f_house_energy'),energyDue=document.getElementById('f_energy_due');
  h.quartos=Math.max(0,parseInt(document.getElementById('f_quartos').value,10)||0);
  h.banheiros=Math.max(0,parseInt(document.getElementById('f_banheiros').value,10)||0);
  h.sala=document.getElementById('f_sala').checked;
  h.cozinha=document.getElementById('f_cozinha').checked;
  h.garagem=document.getElementById('f_garagem').checked;
  h.quintal=document.getElementById('f_quintal').checked;
  h.areaServico=document.getElementById('f_area_servico').checked;
  const published=document.getElementById('f_publicado'),description=document.getElementById('f_descricao_publica');
  h.publicado=!!(published&&published.checked);h.descricaoPublica=description?description.value.trim():(h.descricaoPublica||'');
  if(energyCheck) h.energiaAtiva=energyCheck.checked;
  else if(h.energiaAtiva==null) h.energiaAtiva=true;
  if(energyDue) h.energiaDiaVencimento=Math.min(31,Math.max(1,parseInt(energyDue.value,10)||5));
  else if(!h.energiaDiaVencimento) h.energiaDiaVencimento=5;
  return h;
}

function houseTipoField(h){
  h=h||{};
  const sel=normalizeImovelTipo(h.tipo);
  return '<label class="field"><span>Tipo do imóvel</span><select id="f_tipo">'+
    IMOVEL_TIPOS.map(function(t){return '<option value="'+t.id+'"'+(t.id===sel?' selected':'')+'>'+esc(t.nome)+'</option>';}).join('')+
    '</select></label>';
}

/* De quem é o imóvel. O campo só aparece quando há proprietários
   cadastrados: numa carteira própria ele seria uma pergunta sem sentido,
   e um campo a mais em toda casa. */
function houseOwnerField(h){
  h=h||{};
  if(!(state.owners&&state.owners.length)) return '';
  const sel=String(h.proprietarioClienteId||'');
  return '<label class="field"><span>Proprietário</span><select id="f_dono">'+
    '<option value="">— meu (não é de terceiro) —</option>'+
    (state.owners||[]).slice().sort(function(a,b){return a.nome.localeCompare(b.nome,'pt-BR');})
      .map(function(o){
        return '<option value="'+esc(o.id)+'"'+(String(o.id)===sel?' selected':'')+'>'+esc(o.nome)+'</option>';
      }).join('')+
    '</select><small>Define de quem é este imóvel no extrato de prestação de contas.</small></label>';
}
/* Lê o campo quando ele existe; quando não existe, preserva o que já
   estava gravado em vez de apagar o vínculo. */
function readHouseOwner(h){
  const el=document.getElementById('f_dono');
  if(!el) return (h&&h.proprietarioClienteId)||'';
  return el.value||'';
}
/* Etapa 2 (ambientes), sem a publicação — que vai para a Etapa 3. Os ids
   são os mesmos lidos por readHouseCharacteristics. */
function houseRoomFields(h){
  h=h||{};
  return '<div class="house-description-intro"><strong>Quais ambientes este imóvel possui?</strong><span>Essas informações aparecem nos cartões e ajudam a encontrar interessados compatíveis.</span></div>'+
    '<div class="field-row"><label class="field"><span>Quartos</span><input id="f_quartos" type="number" min="0" step="1" value="'+(h.quartos||0)+'"></label>'+
    '<label class="field"><span>Banheiros</span><input id="f_banheiros" type="number" min="0" step="1" value="'+(h.banheiros||0)+'"></label></div>'+
    '<div class="feature-check-grid house-room-checks">'+
      '<label class="field-check"><input type="checkbox" id="f_sala"'+(h.sala?' checked':'')+'><span class="room-check-icon">'+FICO.sofa+'</span><span>Sala</span></label>'+
      '<label class="field-check"><input type="checkbox" id="f_cozinha"'+(h.cozinha?' checked':'')+'><span class="room-check-icon">'+FICO.kitchen+'</span><span>Cozinha</span></label>'+
      '<label class="field-check"><input type="checkbox" id="f_quintal"'+(h.quintal?' checked':'')+'><span class="room-check-icon">'+FICO.yard+'</span><span>Quintal</span></label>'+
      '<label class="field-check"><input type="checkbox" id="f_area_servico"'+(h.areaServico?' checked':'')+'><span class="room-check-icon">'+FICO.laundry+'</span><span>Área de serviço</span></label>'+
      '<label class="field-check"><input type="checkbox" id="f_garagem"'+(h.garagem?' checked':'')+'><span class="room-check-icon">'+FICO.garage+'</span><span>Garagem</span></label></div>';
}
/* Etapa 3 (publicação no catálogo + descrição do anúncio). */
function housePublishFields(h){
  h=h||{};
  return '<div class="house-public-settings"><label class="field-check"><input type="checkbox" id="f_publicado"'+(h.publicado?' checked':'')+'><span><strong>Publicar este imóvel no catálogo</strong><small>Ele só aparecerá enquanto estiver com status Vaga.</small></span></label>'+
    '<label class="field"><span>Descrição para o anúncio</span><textarea id="f_descricao_publica" maxlength="3000" rows="4" placeholder="Conte os principais diferenciais do imóvel…">'+esc(h.descricaoPublica||'')+'</textarea></label></div>';
}
/* ---------- Cadastro de imóvel em 3 etapas (wizard) ----------
   Os três painéis ficam no DOM (só o ativo é visível), então os valores
   não se perdem ao navegar entre etapas e readHouseCharacteristics lê
   tudo de uma vez no fim. */
let _houseWizardStep=1;
function goHouseStep(n){
  n=Math.max(1,Math.min(3,n));
  _houseWizardStep=n;
  const wiz=document.querySelector('.house-wizard'); if(!wiz)return;
  wiz.setAttribute('data-step',String(n));
  wiz.querySelectorAll('.wizard-step').forEach(function(p){p.classList.toggle('active',Number(p.getAttribute('data-step'))===n);});
  wiz.querySelectorAll('.wizard-dot').forEach(function(d){
    const dn=Number(d.getAttribute('data-dot'));
    d.classList.toggle('active',dn===n); d.classList.toggle('done',dn<n);
    d.setAttribute('aria-current',dn===n?'step':'false');
  });
  const first=wiz.querySelector('.wizard-step.active input,.wizard-step.active select,.wizard-step.active textarea');
  if(first) first.focus();
}
function houseWizardBack(){ goHouseStep(_houseWizardStep-1); }
function houseWizardNext(){
  /* Validação por etapa: só a Identificação tem obrigatório (nome). */
  if(_houseWizardStep===1){
    const el=document.getElementById('f_nome');
    if(el && !el.value.trim()){ showToast('Dê um nome ou apelido ao imóvel.','error'); el.focus(); return; }
  }
  goHouseStep(_houseWizardStep+1);
}
function openAddHouseModal(){
  if(!requirePropertyPermission())return;
  const access=state.commercialAccess||{},limit=Number(access.limiteCasas)||1;
  if(state.houses.length>=limit){
    openModal('<h3 class="modal-title">Limite do plano atingido</h3><p class="modal-text">O plano '+esc(commercialPlanLabel(access.plano||'gratuito'))+' permite até <strong>'+limit+' imóvel(is)</strong>. Você já cadastrou '+state.houses.length+'.</p>'+ 
      '<p class="modal-hint">Consulte “Meu plano” para revisar o uso e os limites atuais da conta.</p>'+
      '<div class="modal-actions"><button class="btn btn-primary" onclick="closeModal()">Fechar</button></div>');
    return;
  }
  _houseWizardStep=1;
  const h={energiaAtiva:true,energiaDiaVencimento:5,tipo:'casa'};
  openModal(
    '<h3 class="modal-title">Novo imóvel</h3>'+
    '<div class="house-wizard" data-step="1">'+
      '<div class="wizard-steps">'+
        '<span class="wizard-dot active" data-dot="1" aria-current="step"><b>1</b><span>Identificação</span></span>'+
        '<span class="wizard-dot" data-dot="2" aria-current="false"><b>2</b><span>Características</span></span>'+
        '<span class="wizard-dot" data-dot="3" aria-current="false"><b>3</b><span>Serviços e divulgação</span></span>'+
      '</div>'+
      '<section class="wizard-step active" data-step="1" aria-label="Identificação">'+
        '<label class="field"><span>Nome / apelido</span><input id="f_nome" placeholder="Ex: Casa 11"></label>'+
        houseTipoField(h)+
        '<label class="field"><span>Endereço</span><input id="f_endereco" placeholder="Rua, número, bairro"></label>'+
        houseOwnerField(h)+
      '</section>'+
      '<section class="wizard-step" data-step="2" aria-label="Características">'+houseRoomFields(h)+'</section>'+
      '<section class="wizard-step" data-step="3" aria-label="Serviços e divulgação">'+houseEnergyFields(h)+housePublishFields(h)+'</section>'+
      '<div class="wizard-footer modal-actions">'+
        '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
        '<div class="modal-actions-right">'+
          '<button class="btn btn-ghost wizard-back" onclick="houseWizardBack()">Voltar</button>'+
          '<button class="btn btn-primary wizard-next" onclick="houseWizardNext()">Continuar</button>'+
          '<button class="btn btn-primary wizard-submit" onclick="addHouse()">Cadastrar imóvel</button>'+
        '</div>'+
      '</div>'+
    '</div>'
  );
}
async function addHouse(){
  if(!requirePropertyPermission())return;
  const nome = document.getElementById('f_nome').value.trim() || ('Imóvel '+(state.houses.length+1));
  const endereco = document.getElementById('f_endereco').value.trim();
  const tipoEl = document.getElementById('f_tipo');
  const tipo = normalizeImovelTipo(tipoEl?tipoEl.value:'casa');
  try{
    const draft=readHouseCharacteristics({ nome:nome, endereco:endereco, tipo:tipo, status:'vaga',
      proprietarioClienteId:readHouseOwner(null),
      aluguelValor:0, diaVencimento:5, ultimaVistoria:'', tenantId:'', contratoInicio:'', contratoFim:'' });
    const novo = await db.insertHouse(draft);
    state.houses.push(novo);
    if(state.commercialAccess)state.commercialAccess.quantidadeCasas=state.houses.length;
    closeModal(); render();
  }catch(e){ console.error(e); showToast(e&&e.message&&e.message.toLowerCase().includes('limite')?e.message:'Erro ao adicionar o imóvel.', 'error'); }
}
function openEditHouseModal(houseId){
  if(!requirePropertyPermission())return;
  const h = state.houses.find(function(x){ return x.id===houseId; });
  const current=activeContract(h);
  const rentValue=current
    ?contractExpectedRent(current,currentMonthStr())
    :(Number(h.aluguelValor)||0);
  const contractLock=current
    ?'<p class="modal-hint">Valor e vencimento pertencem ao contrato atual. Para mudar o valor sem reescrever o histórico, use a aba <strong>Reajustes</strong>.</p>'
    :'';
  openModal(
    '<h3 class="modal-title">Editar imóvel</h3>'+
    '<div class="house-edit-tabs"><button class="active" aria-current="true" data-edit-section="dados" onclick="switchHouseEditSection(\'dados\')">Dados</button><button data-edit-section="descricao" onclick="switchHouseEditSection(\'descricao\')">Descrição</button></div>'+
    '<div class="house-edit-section active" data-edit-panel="dados">'+
      '<label class="field"><span>Nome / apelido</span><input id="f_nome" value="'+esc(h.nome)+'"></label>'+
      '<label class="field"><span>Endereço</span><input id="f_endereco" value="'+esc(h.endereco)+'" placeholder="Rua, número, bairro"></label>'+
      houseOwnerField(h)+
      '<div class="field-row">'+
        '<label class="field"><span>Status</span><select id="f_status">'+
          '<option value="alugada"'+(h.status==='alugada'?' selected':'')+'>Alugada</option>'+
          '<option value="vaga"'+(h.status==='vaga'?' selected':'')+'>Vaga</option>'+
          '<option value="manutencao"'+(h.status==='manutencao'?' selected':'')+'>Em manutenção</option>'+
        '</select></label>'+
        '<label class="field"><span>'+(current?'Aluguel vigente (R$)':'Aluguel padrão para o próximo contrato (R$)')+'</span><input id="f_aluguel" type="number" step="0.01" value="'+rentValue+'"'+(current?' disabled':'')+'></label>'+
      '</div>'+
      '<div class="field-row">'+
        '<label class="field"><span>Dia de vencimento</span><input id="f_dia" type="number" min="1" max="31" value="'+(current?contractBillingDay(current):(h.diaVencimento||5))+'"'+(current?' disabled':'')+'></label>'+
        '<label class="field"><span>Última vistoria</span><input id="f_vist" type="date" value="'+(h.ultimaVistoria||'')+'"></label>'+
      '</div>'+contractLock+houseEnergyFields(h)+
    '</div>'+
    '<div class="house-edit-section" data-edit-panel="descricao">'+houseDescriptionFields(h)+'</div>'+
    '<div class="modal-actions">'+
      '<button class="btn btn-danger" onclick="openArchiveHouseModal(\''+h.id+'\')">Arquivar imóvel</button>'+
      '<div class="modal-actions-right">'+
        '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
        '<button class="btn btn-primary" onclick="saveHouseEdit(\''+h.id+'\')">Salvar</button>'+
      '</div>'+
    '</div>'
  );
}
function switchHouseEditSection(section){
  document.querySelectorAll('[data-edit-section]').forEach(function(button){
    const atual=button.getAttribute('data-edit-section')===section;
    button.classList.toggle('active',atual);
    /* o leitor de tela precisa saber qual aba está aberta, e a
       classe CSS sozinha não conta essa história */
    if(atual) button.setAttribute('aria-current','true'); else button.removeAttribute('aria-current');
  });
  document.querySelectorAll('[data-edit-panel]').forEach(function(panel){panel.classList.toggle('active',panel.getAttribute('data-edit-panel')===section);});
}
async function saveHouseEdit(id){
  if(!requirePropertyPermission())return;
  const h = state.houses.find(function(x){ return x.id===id; });
  const contratoAtual=activeContract(h);
  const draft=Object.assign({},h,{
    statusHistorico:(h.statusHistorico||[]).map(function(item){
      return Object.assign({},item);
    })
  });
  draft.nome = document.getElementById('f_nome').value.trim() || h.nome;
  draft.endereco = document.getElementById('f_endereco').value.trim();
  draft.status = document.getElementById('f_status').value;
  draft.aluguelValor = contratoAtual
    ?h.aluguelValor
    :(parseFloat(document.getElementById('f_aluguel').value)||0);
  draft.diaVencimento = contratoAtual
    ?h.diaVencimento
    :Math.min(31,Math.max(1,parseInt(document.getElementById('f_dia').value,10)||5));
  draft.ultimaVistoria = document.getElementById('f_vist').value;
  draft.proprietarioClienteId = readHouseOwner(h);
  readHouseCharacteristics(draft);
  if(draft.status==='alugada'&&!draft.tenantId&&!contratoAtual){
    showToast('Para marcar como alugada, vincule um inquilino e crie o contrato.','error');
    return;
  }
  if(draft.status!=='alugada'&&draft.tenantId){
    draft.tenantId='';
    draft.contratoInicio='';
    draft.contratoFim='';
  }
  recordStatusChange(draft);
  try{
    if(draft.status!=='alugada'&&contratoAtual){
      await db.finishContract(h.id,contratoAtual.id,todayISO(),draft.status);
    }
    await db.updateHouse(draft);
    await db.replaceStatusHistory(h.id,draft.statusHistorico);
    Object.assign(h,draft);
    if(contratoAtual&&draft.status!=='alugada'){
      contratoAtual.ativo=false;
      contratoAtual.fim=todayISO();
    }
    closeModal();
    render();
    showToast('Dados do imóvel salvos.','success');
  }catch(e){
    console.error(e);
    showToast((e&&e.message)||'Erro ao salvar.','error');
  }
}
function openArchiveHouseModal(houseId){
  if(!requirePropertyPermission())return;
  const h = state.houses.find(function(x){ return x.id===houseId; });
  if(!h)return;
  const current=activeContract(h);
  const hasLegacyLink=!current&&!!(h.tenantId||h.status==='alugada');
  if(current||hasLegacyLink){
    openModal(
      '<h3 class="modal-title">Este imóvel possui vínculo ativo</h3>'+
      '<p class="modal-text"><strong>'+esc(h.nome)+'</strong> não pode ser arquivado enquanto houver uma locação em andamento.</p>'+
      '<div class="notice-box"><strong>Histórico protegido.</strong><br>Registre primeiro a saída do inquilino. Depois disso, o imóvel poderá ser arquivado sem apagar contratos, recebimentos, despesas, energia, fotos ou documentos.</div>'+
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="openEditHouseModal(\''+houseId+'\')">Voltar</button>'+
        '<button class="btn btn-primary" onclick="'+(current
          ?'openFinishContractModal(\''+houseId+'\',\''+current.id+'\')'
          :'openTenantHouseExit(\''+houseId+'\')')+'">Registrar saída</button></div>'
    );
    return;
  }
  openModal(
    '<h3 class="modal-title">Arquivar '+esc(h.nome)+'?</h3>'+
    '<p class="modal-text">O imóvel sairá das listas de trabalho, mas seus dados continuarão guardados e poderão ser restaurados em <strong>Backup → Itens arquivados</strong>.</p>'+
    '<div class="notice-box"><strong>Nada será apagado.</strong><br>Contratos encerrados, recebimentos, despesas, energia, fotos e documentos permanecem preservados.</div>'+
    '<label class="field"><span>Motivo do arquivamento</span><input id="f_archive_reason" maxlength="300" placeholder="Ex.: imóvel vendido ou cadastro duplicado"></label>'+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
    '<button class="btn btn-ghost" onclick="openEditHouseModal(\''+houseId+'\')">Cancelar</button>'+
    '<button class="btn btn-danger" onclick="archiveHouse(\''+houseId+'\')">Arquivar imóvel</button>'+
    '</div></div>'
  );
}
async function archiveHouse(houseId){
  if(!requirePropertyPermission())return;
  const h=state.houses.find(function(item){return item.id===houseId;});
  if(!h)return;
  if(activeContract(h)||h.tenantId||h.status==='alugada'){
    showToast('Encerre o contrato ativo antes de arquivar o imóvel.','error');
    return;
  }
  const reason=((document.getElementById('f_archive_reason')||{}).value||'').trim();
  try{
    await db.archiveEntity('imovel',houseId,reason);
    state.houses = state.houses.filter(function(x){ return x.id!==houseId; });
    delete state.photoCache[houseId];
    delete state.documentCache[houseId];
    closeModal(); state.view='casas'; render();
    showToast('Imóvel arquivado. Você pode restaurá-lo pelo Backup.','success');
  }catch(e){ console.error(e); showToast((e&&e.message)||'Não foi possível arquivar o imóvel.', 'error'); }
}

/* Compatibilidade com botões de uma tela que já estivesse aberta antes da
   atualização. As ações antigas agora seguem o fluxo recuperável. */
function confirmDeleteHouse(houseId){ openArchiveHouseModal(houseId); }
async function deleteHouse(houseId){ return archiveHouse(houseId); }

/* ---------- vistoria ---------- */
async function registrarVistoria(houseId){
  if(!requirePropertyPermission())return;
  const h = state.houses.find(function(x){ return x.id===houseId; });
  if(!h)return;
  const date=todayISO();
  try{
    await db.registerBasicInspection(houseId,date);
    h.ultimaVistoria=date;
    render();
    showToast('Vistoria registrada no histórico.','success');
  }catch(e){
    console.error(e);
    showToast((e&&e.message)||'Erro ao registrar vistoria.','error');
  }
}

/* ---------- pagamentos ---------- */
function rentPaymentStatusLabel(status){
  const labels={
    pago:'Pago',pago_atraso:'Pago com atraso',parcial:'Pagamento parcial',pendente:'A vencer',
    tolerancia:'Em tolerância',atrasado:'Em atraso',credito:'Crédito a favor',
    sem_cobranca:'Sem cobrança'
  };
  return labels[status]||'A vencer';
}
function rentChargeDueIso(mes,contract){
  return mes+'-'+String(dueDayForMonth(mes,contract?contractBillingDay(contract):5)).padStart(2,'0');
}
function financeV2Unavailable(error){
  const code=String(error&&error.code||'');
  const message=String(error&&error.message||'');
  return ['42P01','42883','PGRST202','PGRST204','PGRST205'].includes(code)
    ||/financeiro_cobrancas|financeiro_recebimentos|alterar_arquivamento_aluguel/i.test(message);
}
function openPaymentModal(houseId, mes,contractId){
  const h = state.houses.find(function(x){ return x.id===houseId; });
  const contract=contractForMonth(h,mes,contractId),resolvedId=contract?contract.id:(contractId||'');
  const charge=chargeForMonth(h,mes,'aluguel',resolvedId);
  const receipts=charge?receiptsForCharge(h,charge):[];
  const rec = paymentForMonth(h,mes,resolvedId);
  const st = paymentStatus(h, mes,resolvedId);
  const expected=charge?(Number(charge.valorPrevisto)||0):(contract?contractExpectedRent(contract,mes):aluguelValorMes(h, mes));
  const received=charge?chargeReceivedTotal(h,charge):(rec?Number(rec.valorPago)||0:0);
  const remaining=Math.max(0,expected-received),credit=Math.max(0,received-expected);
  const valorSugerido=remaining||'';
  const receiptOperationId=newOperationId();
  const tenant=contract?contractTenant(contract):tenantOf(h);
  const mayManage=canManageFinance();
  openModal(
    '<h3 class="modal-title">Recebimento de aluguel · '+monthLabel(mes)+'</h3>'+
    '<p class="modal-text">'+esc(h.nome)+(tenant?' · '+esc(tenant.nome):'')+(contract?' · vence dia '+contractBillingDay(contract):'')+'</p>'+
    '<span class="simple-modal-status '+(st==='atrasado'?'overdue':'')+'">'+rentPaymentStatusLabel(st).toUpperCase()+'</span>'+
    '<div class="simple-modal-values"><div><span>Previsto</span><strong class="num">'+fmtMoney(expected)+'</strong></div>'+
      '<div><span>Recebido</span><strong class="num">'+fmtMoney(received)+'</strong></div>'+
      '<div><span>'+(credit?'Crédito':'A receber')+'</span><strong class="num">'+fmtMoney(credit||remaining)+'</strong></div></div>'+
    (st==='tolerancia'?'<p class="modal-hint">Está dentro dos 5 dias de tolerância. Nenhuma multa ou juros será acrescentado.</p>':'')+
    (mayManage
      ? '<input id="f_payment_origin" type="hidden" value="'+receiptOperationId+'">'+
        '<label class="field"><span>Valor desta parcela (R$)</span><input id="f_valor" type="number" min="0.01" step="0.01" value="'+valorSugerido+'" placeholder="0,00"></label>'+
        '<div class="field-row"><label class="field"><span>Data do recebimento</span><input id="f_data" type="date" value="'+todayISO()+'"></label>'+
          '<label class="field"><span>Forma (opcional)</span><select id="f_payment_method"><option value="">Não informar</option>'+
            ['PIX','Dinheiro','Transferência','Cartão','Outro'].map(function(method){return '<option>'+method+'</option>';}).join('')+
          '</select></label></div>'+
        '<label class="field"><span>Observação (opcional)</span><input id="f_payment_note" maxlength="500" placeholder="Ex.: 1ª parcela"></label>'
      : '<p class="modal-hint">Sua função permite consultar o histórico, sem alterar recebimentos.</p>')+
    (receipts.length?'<div class="form-section-title">Recebimentos já registrados</div><div class="list-card"><div class="ledger">'+
      receipts.slice().sort(function(a,b){return String(b.dataPagamento||'').localeCompare(String(a.dataPagamento||''));}).map(function(receipt){
        return '<div class="ledger-row"><div class="ledger-row-main">'+fmtDateBR(receipt.dataPagamento)+
          '<div class="ledger-row-sub">'+esc(receipt.forma||'Forma não informada')+(receipt.observacao?' · '+esc(receipt.observacao):'')+'</div></div>'+
          '<strong class="ledger-row-value num">'+fmtMoney(receipt.valor)+'</strong>'+
          '<button class="btn btn-ghost btn-sm" onclick="generateReceiptPDF(\''+houseId+'\',\''+mes+'\',\''+resolvedId+'\',\''+receipt.id+'\')">Recibo</button>'+
          (mayManage?'<button class="btn btn-ghost btn-sm" onclick="openArchiveReceiptModal(\''+houseId+'\',\''+mes+'\',\''+resolvedId+'\',\''+receipt.id+'\')">Arquivar</button>':'')+'</div>';
      }).join('')+'</div></div>':'')+
    '<div class="modal-actions">'+
      '<span></span>'+
      '<div class="modal-actions-right">'+
        (mayManage&&remaining>0 && (st==='atrasado'||st==='pendente'||st==='tolerancia'||st==='parcial') ? '<button class="btn btn-ghost" onclick="cobrarWhatsApp(\''+houseId+'\',\''+mes+'\',\''+resolvedId+'\')">Cobrar via WhatsApp</button>' : '')+
        (mayManage&&remaining>0 && state.config.pixChave ? '<button class="btn btn-ghost" onclick="openPixCharge(\''+houseId+'\',\''+mes+'\',\''+resolvedId+'\',false)">Copiar PIX</button>' : '')+
        (rec ? '<button class="btn btn-ghost" onclick="generateReceiptPDF(\''+houseId+'\',\''+mes+'\',\''+resolvedId+'\')">Recibos PDF</button>' : '')+
        '<button class="btn btn-ghost" onclick="closeModal()">'+(mayManage?'Cancelar':'Fechar')+'</button>'+
        (mayManage?'<button id="btn_save_payment" class="btn btn-primary" onclick="savePayment(\''+houseId+'\',\''+mes+'\',\''+resolvedId+'\')">Registrar parcela</button>':'')+
      '</div>'+
    '</div>'
  );
}
async function savePayment(houseId, mes,contractId){
  if(!requireFinancePermission())return;
  const h = state.houses.find(function(x){ return x.id===houseId; });
  const contract=contractForMonth(h,mes,contractId);
  const valor = parseFloat(document.getElementById('f_valor').value)||0;
  const data = document.getElementById('f_data').value || todayISO();
  const method=(document.getElementById('f_payment_method')||{}).value||'';
  const note=(document.getElementById('f_payment_note')||{}).value||'';
  const originId=(document.getElementById('f_payment_origin')||{}).value||newOperationId();
  if(valor<=0){showToast('Informe o valor recebido nesta parcela.','error');return;}
  const submitButton=document.getElementById('btn_save_payment');
  if(submitButton&&submitButton.disabled)return;
  if(submitButton){submitButton.disabled=true;submitButton.textContent='Registrando…';}
  try{
    const existing=chargeForMonth(h,mes,'aluguel',contractId);
    const charge=existing||await db.upsertCharge(houseId,{
        houseId:houseId,
        contractId:contractId||'',
        tenantId:contract?contract.tenantId:(h.tenantId||''),
        mes:mes,
        competencia:mes,
        tipo:'aluguel',
        descricao:'Aluguel '+monthLabel(mes),
        valorPrevisto:contract?contractExpectedRent(contract,mes):aluguelValorMes(h,mes),
        vencimento:rentChargeDueIso(mes,contract),
        toleranciaDias:DEFAULT_PAYMENT_GRACE_DAYS,
        origemTipo:'manual',
        observacao:''
      });
    const receipt=await db.insertReceipt({
      cobrancaId:charge.id,
      valor:valor,
      dataPagamento:data,
      competenciaCaixa:data.slice(0,7),
      forma:method,
      observacao:note,
      origemTipo:'manual',
      origemId:originId
    });
    h.cobrancas=h.cobrancas||[];
    const chargeIndex=h.cobrancas.findIndex(function(item){return item.id===charge.id;});
    if(chargeIndex>=0) h.cobrancas[chargeIndex]=charge; else h.cobrancas.push(charge);
    h.recebimentos=h.recebimentos||[];
    h.recebimentos.push(receipt);
    closeModal(); render();
    showToast('Parcela registrada.', 'success');
  }catch(e){
    if(submitButton){submitButton.disabled=false;submitButton.textContent='Registrar parcela';}
    console.error(e);
    showToast(financeV2Unavailable(e)
      ?'Aplique a migração Financeiro V2 antes de registrar parcelas.'
      :'Erro ao salvar o recebimento.', 'error');
  }
}
function openArchiveReceiptModal(houseId,mes,contractId,receiptId){
  if(!requireFinancePermission())return;
  openModal('<h3 class="modal-title">Arquivar este recebimento?</h3>'+
    '<p class="modal-text">Ele deixará de entrar nos totais, mas poderá ser restaurado depois em Backup e itens arquivados.</p>'+
    '<label class="field"><span>Motivo (opcional)</span><input id="f_archive_reason" maxlength="300" placeholder="Ex.: lançamento duplicado"></label>'+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="openPaymentModal(\''+houseId+'\',\''+mes+'\',\''+contractId+'\')">Voltar</button>'+
      '<button class="btn btn-danger" onclick="archivePaymentReceipt(\''+houseId+'\',\''+mes+'\',\''+contractId+'\',\''+receiptId+'\')">Arquivar recebimento</button></div>');
}
async function archivePaymentReceipt(houseId,mes,contractId,receiptId){
  if(!requireFinancePermission())return;
  const h=state.houses.find(function(item){return item.id===houseId;});
  const receipt=h&&(h.recebimentos||[]).find(function(item){return item.id===receiptId;});
  if(!receipt) return;
  const reason=((document.getElementById('f_archive_reason')||{}).value||'').trim();
  try{
    await db.archiveReceipt(receiptId,reason);
    receipt.arquivadoEm=new Date().toISOString();
    openPaymentModal(houseId,mes,contractId);
    showToast('Recebimento arquivado.','success');
  }catch(error){console.error(error);showToast('Não foi possível arquivar o recebimento.','error');}
}
async function removePayment(houseId, mes,contractId){
  if(!requireFinancePermission())return;
  const h = state.houses.find(function(x){ return x.id===houseId; });
  try{
    await db.deletePayment(houseId, mes,contractId);
    h.pagamentos = h.pagamentos.filter(function(p){ return !(p.mes===mes&&(!contractId||p.contractId===contractId)); });
    closeModal(); render();
  }catch(e){ console.error(e); showToast('Erro ao desfazer o pagamento.', 'error'); }
}

/* ---------- energia (leituras, cálculo, vencimento, foto e pagamento) ---------- */
function openEnergiaModal(houseId, mes,contractId){
  const h = state.houses.find(function(x){ return x.id===houseId; });
  if(!houseEnergyEnabled(h)){showToast('A Energia está desativada para esta casa.','error');return;}
  const contract=contractForEnergyMonth(h,mes,contractId),resolvedId=contract?contract.id:(contractId||'');
  if((h.contracts||[]).length&&!contract){showToast('Nenhum contrato desta casa cobre o mês escolhido.','error');return;}
  const e = energiaDoMes(h, mes,resolvedId);
  const charge=chargeForMonth(h,mes,'energia',resolvedId);
  const readingReceipts=charge?receiptsForCharge(h,charge):[];
  const received=charge?chargeReceivedTotal(h,charge):(e&&e.pago?Number(e.valor)||0:0);
  const expected=charge?(Number(charge.valorPrevisto)||0):(e?Number(e.valor)||0:0);
  const remaining=Math.max(0,expected-received),credit=Math.max(0,received-expected);
  const previousEntries=(h.energias||[]).filter(function(item){return item.mes<mes;}).sort(function(a,b){return b.mes.localeCompare(a.mes);});
  const autoPrevious=previousEnergyReading(h,mes);
  const previousValue=e?e.leituraAnterior:(autoPrevious==null?'':autoPrevious);
  const tariff=e?e.tarifaKwh:(previousEntries[0]?previousEntries[0].tarifaKwh:'');
  const due=e&&e.vencimento?e.vencimento:(mes+'-'+String(dueDayForMonth(mes,h.energiaDiaVencimento||5)).padStart(2,'0'));
  const mayOperate=canOperateProperties();
  const mayManageFinance=canManageFinance();
  const financiallyLocked=readingReceipts.length>0;
  const mayEditReading=mayOperate&&!financiallyLocked;
  const disabled=mayEditReading?'':' disabled';
  openModal(
    '<h3 class="modal-title">Energia · '+monthLabel(mes)+'</h3>'+
    '<p class="modal-text">'+esc(h.nome)+' — a leitura anterior é trazida automaticamente do último lançamento.</p>'+
    (!mayOperate?'<p class="modal-hint">Sua função permite consultar a leitura, sem alterá-la.</p>':'')+
    (financiallyLocked?'<div class="notice-box"><strong>Leitura protegida.</strong> Já existe recebimento ligado a esta cobrança. Para corrigir valores, arquive primeiro as parcelas recebidas; o histórico continuará recuperável.</div>':'')+
    '<div class="field-row"><label class="field"><span>Leitura anterior</span><input id="f_ener_anterior" type="number" min="0" step="0.01" value="'+previousValue+'" oninput="recalculateEnergyForm()" placeholder="Digite no primeiro mês"'+disabled+'></label>'+
    '<label class="field"><span>Leitura atual</span><input id="f_ener_atual" type="number" min="0" step="0.01" value="'+(e?e.leituraAtual:'')+'" oninput="recalculateEnergyForm()" placeholder="Leitura do medidor"'+disabled+'></label></div>'+
    '<div class="energy-calculation-grid"><div><span>Consumo calculado</span><strong id="energy_kwh_preview" class="num">'+(e?e.kwh:0)+' kWh</strong></div>'+
    '<label class="field"><span>Tarifa por kWh (R$)</span><input id="f_ener_tarifa" type="number" min="0" step="0.0001" value="'+(tariff||'')+'" oninput="recalculateEnergyForm()"'+disabled+'></label></div>'+
    '<div class="field-row"><label class="field"><span>Acréscimos (R$)</span><input id="f_ener_acrescimos" type="number" min="0" step="0.01" value="'+(e?e.acrescimos:0)+'" oninput="recalculateEnergyForm()"'+disabled+'></label>'+
    '<label class="field"><span>Descontos (R$)</span><input id="f_ener_descontos" type="number" min="0" step="0.01" value="'+(e?e.descontos:0)+'" oninput="recalculateEnergyForm()"'+disabled+'></label></div>'+
    '<label class="field"><span>Descrição das taxas ou descontos</span><input id="f_ener_ajuste" value="'+(e?esc(e.ajusteDescricao):'')+'" placeholder="Ex.: iluminação pública e bandeira"'+disabled+'></label>'+
    '<div class="energy-total-box"><div><span>Valor calculado</span><strong id="energy_calculated_preview" class="num">'+fmtMoney(e?e.valorCalculado:0)+'</strong></div>'+
    '<label class="field"><span>Valor final cobrado'+(mayOperate?' (pode ser alterado)':'')+'</span><input id="f_ener_valor" data-manual="'+(e&&e.valorManual?'1':'0')+'" type="number" min="0" step="0.01" value="'+(e?e.valor:'')+'" oninput="markEnergyManual()"'+disabled+'></label>'+
    (mayEditReading?'<button class="btn btn-ghost btn-sm" type="button" onclick="useCalculatedEnergyValue()">Usar valor calculado</button>':'')+'</div>'+
    '<label class="field"><span>Vencimento da energia</span><input id="f_ener_vencimento" type="date" value="'+due+'"'+disabled+'></label>'+
    (mayEditReading?'<label class="field"><span>Foto do medidor ou da conta (opcional)</span><input id="f_ener_foto" type="file" accept="image/jpeg,image/png,image/webp"></label>':'')+
    (e&&e.fotoPath?'<div class="energy-photo-existing"><span>Foto já anexada</span><button class="btn btn-ghost btn-sm" onclick="viewEnergyPhoto(\''+houseId+'\',\''+mes+'\',\''+resolvedId+'\')">Ver foto</button>'+
      (mayEditReading?'<label><input id="f_ener_remove_photo" type="checkbox"> Remover ao salvar</label>':'')+'</div>':'')+
    (e?'<div class="simple-modal-values"><div><span>Cobrado</span><strong class="num">'+fmtMoney(expected)+'</strong></div>'+
      '<div><span>Recebido</span><strong class="num">'+fmtMoney(received)+'</strong></div>'+
      '<div><span>'+(credit?'Crédito':'A receber')+'</span><strong class="num">'+fmtMoney(credit||remaining)+'</strong></div></div>':'')+
    '<div class="modal-actions">'+
      (e?'<div class="modal-actions-right">'+
        (mayManageFinance&&expected>0?'<button class="btn btn-ghost" onclick="openEnergyReceiptModal(\''+houseId+'\',\''+mes+'\',\''+resolvedId+'\')">Registrar recebimento</button>':'')+
        (mayOperate?'<button class="btn btn-danger" onclick="openArchiveEnergyModal(\''+houseId+'\',\''+mes+'\',\''+resolvedId+'\')">Arquivar leitura</button>':'')+'</div>':'<span></span>')+
      '<div class="modal-actions-right">'+
        (mayManageFinance&&e&&remaining>0 ? '<button class="btn btn-ghost" onclick="cobrarEnergiaWhatsApp(\''+houseId+'\',\''+mes+'\',\''+resolvedId+'\')">Cobrar via WhatsApp</button>' : '')+
        (mayManageFinance&&e&&remaining>0&&state.config.pixChave ? '<button class="btn btn-ghost" onclick="openPixCharge(\''+houseId+'\',\''+mes+'\',\''+resolvedId+'\',true)">Copiar PIX</button>' : '')+
        '<button class="btn btn-ghost" onclick="closeModal()">'+(mayOperate?'Cancelar':'Fechar')+'</button>'+
        (mayEditReading?'<button class="btn btn-primary" onclick="saveEnergia(\''+houseId+'\',\''+mes+'\',\''+resolvedId+'\')">Salvar leitura e cobrança</button>':'')+
      '</div>'+
    '</div>'
  );
  recalculateEnergyForm(!e);
}
function energyFormNumber(id){
  const el=document.getElementById(id);return Math.max(0,parseFloat(String(el&&el.value||'').replace(',','.'))||0);
}
function recalculateEnergyForm(forceFinal){
  const previous=energyFormNumber('f_ener_anterior'),current=energyFormNumber('f_ener_atual');
  const kwh=Math.max(0,current-previous),tariff=energyFormNumber('f_ener_tarifa');
  const calculated=Math.max(0,(kwh*tariff)+energyFormNumber('f_ener_acrescimos')-energyFormNumber('f_ener_descontos'));
  const kwhPreview=document.getElementById('energy_kwh_preview'),calcPreview=document.getElementById('energy_calculated_preview'),finalInput=document.getElementById('f_ener_valor');
  if(kwhPreview) kwhPreview.textContent=kwh.toLocaleString('pt-BR',{maximumFractionDigits:2})+' kWh';
  if(calcPreview) calcPreview.textContent=fmtMoney(calculated);
  if(finalInput&&(forceFinal||finalInput.dataset.manual!=='1')) finalInput.value=calculated.toFixed(2);
}
function markEnergyManual(){const el=document.getElementById('f_ener_valor');if(el)el.dataset.manual='1';}
function useCalculatedEnergyValue(){const el=document.getElementById('f_ener_valor');if(el){el.dataset.manual='0';recalculateEnergyForm(true);}}
async function saveEnergia(houseId, mes,contractId){
  if(!requirePropertyPermission())return;
  const h = state.houses.find(function(x){ return x.id===houseId; });
  const currentCharge=chargeForMonth(h,mes,'energia',contractId);
  if(currentCharge&&receiptsForCharge(h,currentCharge).length){
    showToast('Arquive primeiro os recebimentos desta energia antes de corrigir a leitura.','error');
    return;
  }
  const leituraAnterior=energyFormNumber('f_ener_anterior'),leituraAtual=energyFormNumber('f_ener_atual');
  if(leituraAtual<leituraAnterior){showToast('A leitura atual não pode ser menor que a anterior.','error');return;}
  const kwh=Math.max(0,leituraAtual-leituraAnterior),tarifaKwh=energyFormNumber('f_ener_tarifa');
  const acrescimos=energyFormNumber('f_ener_acrescimos'),descontos=energyFormNumber('f_ener_descontos');
  const valorCalculado=Math.max(0,(kwh*tarifaKwh)+acrescimos-descontos);
  const finalInput=document.getElementById('f_ener_valor');
  const valor=energyFormNumber('f_ener_valor'),valorManual=!!(finalInput&&finalInput.dataset.manual==='1');
  const vencimento=document.getElementById('f_ener_vencimento').value;
  if(!vencimento){showToast('Informe o vencimento da energia.','error');return;}
  const rec = energiaDoMes(h, mes,contractId);
  const fileInput=document.getElementById('f_ener_foto'),file=fileInput&&fileInput.files&&fileInput.files[0];
  const removePhoto=!!(document.getElementById('f_ener_remove_photo')&&document.getElementById('f_ener_remove_photo').checked);
  let newPath='',fotoPath=rec&&rec.fotoPath&&!removePhoto?rec.fotoPath:'';
  let energyPersisted=false,financeSyncWarning='';
  try{
    if(file){
      if(!/^image\/(jpeg|png|webp)$/i.test(file.type||'')||file.size>15*1024*1024) throw new Error('Use uma foto JPG, PNG ou WebP de até 15 MB.');
      const compressed=await compressImage(file,1600,.8);newPath=await db.uploadEnergyPhoto(houseId,mes,compressed);fotoPath=newPath;
    }
    const entry={mes:mes,contractId:contractId,valor:valor,kwh:kwh,leituraAnterior:leituraAnterior,
      leituraAtual:leituraAtual,tarifaKwh:tarifaKwh,acrescimos:acrescimos,descontos:descontos,
      ajusteDescricao:document.getElementById('f_ener_ajuste').value.trim(),valorCalculado:valorCalculado,
      valorManual:valorManual,vencimento:vencimento,fotoPath:fotoPath,
      /* Recebimentos pertencem ao Financeiro V2. Os campos antigos ficam
         desligados para uma edição da leitura nunca recriar uma quitação. */
      pago:false,dataPagamento:''};
    const savedEntry=await db.upsertEnergia(houseId,entry);
    energyPersisted=true;
    Object.assign(entry,savedEntry);
    let savedCharge=null;
    try{
      savedCharge=await db.getChargeByOrigin('energia',savedEntry.id);
    }catch(financeError){
      console.warn('A leitura foi salva, mas a cobrança será recarregada depois.',financeError);
      financeSyncWarning=' A cobrança será atualizada ao recarregar a página.';
    }
    if(rec&&rec.fotoPath&&rec.fotoPath!==fotoPath){
      try{await db.deleteStoragePath(rec.fotoPath);}
      catch(cleanupError){console.warn('A foto antiga ficou pendente de limpeza.',cleanupError);}
    }
    if(rec) Object.assign(rec,entry);
    else { if(!h.energias) h.energias=[]; h.energias.push(entry); }
    if(savedCharge){
      h.cobrancas=h.cobrancas||[];
      const chargeIndex=h.cobrancas.findIndex(function(item){return item.id===savedCharge.id;});
      if(chargeIndex>=0) h.cobrancas[chargeIndex]=savedCharge; else h.cobrancas.push(savedCharge);
    }
    closeModal(); render();
    showToast('Leitura de energia registrada.'+financeSyncWarning,financeSyncWarning?'warn':'success');
  }catch(err){
    if(newPath&&!energyPersisted) try{await db.deleteStoragePath(newPath);}catch(cleanupError){}
    console.error(err); showToast(err&&err.message?err.message:'Erro ao salvar a energia.', 'error');
  }
}
function openEnergyReceiptModal(houseId,mes,contractId){
  if(!requireFinancePermission())return;
  const h=state.houses.find(function(item){return item.id===houseId;});
  const entry=h&&energiaDoMes(h,mes,contractId);
  if(!h||!entry){showToast('Salve a leitura de energia antes do recebimento.','error');return;}
  const charge=chargeForMonth(h,mes,'energia',contractId);
  const receipts=charge?receiptsForCharge(h,charge):[];
  const expected=charge?(Number(charge.valorPrevisto)||0):(Number(entry.valor)||0);
  const received=charge?chargeReceivedTotal(h,charge):(entry.pago?Number(entry.valor)||0:0);
  const remaining=Math.max(0,expected-received),credit=Math.max(0,received-expected);
  const receiptOperationId=newOperationId();
  openModal('<h3 class="modal-title">Recebimento de energia · '+monthLabel(mes)+'</h3>'+
    '<p class="modal-text">'+esc(h.nome)+' · cada parcela será registrada separadamente.</p>'+
    '<div class="simple-modal-values"><div><span>Cobrado</span><strong class="num">'+fmtMoney(expected)+'</strong></div>'+
      '<div><span>Recebido</span><strong class="num">'+fmtMoney(received)+'</strong></div>'+
      '<div><span>'+(credit?'Crédito':'A receber')+'</span><strong class="num">'+fmtMoney(credit||remaining)+'</strong></div></div>'+
    '<input id="f_energy_receipt_origin" type="hidden" value="'+receiptOperationId+'">'+
    '<label class="field"><span>Valor desta parcela (R$)</span><input id="f_energy_receipt_value" type="number" min="0.01" step="0.01" value="'+(remaining||'')+'"></label>'+
    '<div class="field-row"><label class="field"><span>Data do recebimento</span><input id="f_energy_receipt_date" type="date" value="'+todayISO()+'"></label>'+
      '<label class="field"><span>Forma (opcional)</span><select id="f_energy_receipt_method"><option value="">Não informar</option>'+
        ['PIX','Dinheiro','Transferência','Cartão','Outro'].map(function(method){return '<option>'+method+'</option>';}).join('')+
      '</select></label></div>'+
    '<label class="field"><span>Observação (opcional)</span><input id="f_energy_receipt_note" maxlength="500" placeholder="Ex.: parcela da conta de energia"></label>'+
    (receipts.length?'<div class="form-section-title">Recebimentos registrados</div><div class="list-card"><div class="ledger">'+
      receipts.slice().sort(function(a,b){return String(b.dataPagamento||'').localeCompare(String(a.dataPagamento||''));}).map(function(receipt){
        return '<div class="ledger-row"><div class="ledger-row-main">'+fmtDateBR(receipt.dataPagamento)+
          '<div class="ledger-row-sub">'+esc(receipt.forma||'Forma não informada')+(receipt.observacao?' · '+esc(receipt.observacao):'')+'</div></div>'+
          '<strong class="ledger-row-value num">'+fmtMoney(receipt.valor)+'</strong>'+
          '<button class="btn btn-ghost btn-sm" onclick="openArchiveEnergyReceiptModal(\''+houseId+'\',\''+mes+'\',\''+contractId+'\',\''+receipt.id+'\')">Arquivar</button></div>';
      }).join('')+'</div></div>':'')+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="openEnergiaModal(\''+houseId+'\',\''+mes+'\',\''+contractId+'\')">Voltar à leitura</button>'+
      '<button id="btn_save_energy_receipt" class="btn btn-primary" onclick="saveEnergyReceipt(\''+houseId+'\',\''+mes+'\',\''+contractId+'\')">Registrar parcela</button></div>');
}
async function saveEnergyReceipt(houseId,mes,contractId){
  if(!requireFinancePermission())return;
  const h=state.houses.find(function(item){return item.id===houseId;});
  const entry=h&&energiaDoMes(h,mes,contractId);
  const value=parseFloat(((document.getElementById('f_energy_receipt_value')||{}).value)||'')||0;
  const date=((document.getElementById('f_energy_receipt_date')||{}).value)||todayISO();
  if(!entry||value<=0){showToast('Informe o valor recebido.','error');return;}
  const originId=((document.getElementById('f_energy_receipt_origin')||{}).value)||newOperationId();
  const submitButton=document.getElementById('btn_save_energy_receipt');
  if(submitButton&&submitButton.disabled)return;
  if(submitButton){submitButton.disabled=true;submitButton.textContent='Registrando…';}
  try{
    let charge=chargeForMonth(h,mes,'energia',contractId);
    charge=charge||await db.upsertCharge(houseId,{
        houseId:houseId,contractId:contractId||'',
        tenantId:(contractForEnergyMonth(h,mes,contractId)||{}).tenantId||h.tenantId||'',
        mes:mes,competencia:mes,tipo:'energia',descricao:'Energia '+monthLabel(mes),
        valorPrevisto:Number(entry.valor)||0,
        vencimento:entry.vencimento||rentChargeDueIso(mes,contractForEnergyMonth(h,mes,contractId)),
        toleranciaDias:DEFAULT_PAYMENT_GRACE_DAYS,
        origemTipo:'energia',origemId:entry.id||'',observacao:entry.ajusteDescricao||''
      });
    const receipt=await db.insertReceipt({
      cobrancaId:charge.id,valor:value,dataPagamento:date,competenciaCaixa:date.slice(0,7),
      forma:((document.getElementById('f_energy_receipt_method')||{}).value)||'',
      observacao:((document.getElementById('f_energy_receipt_note')||{}).value)||'',
      origemTipo:'manual',origemId:originId
    });
    h.cobrancas=h.cobrancas||[];
    const chargeIndex=h.cobrancas.findIndex(function(item){return item.id===charge.id;});
    if(chargeIndex>=0) h.cobrancas[chargeIndex]=charge; else h.cobrancas.push(charge);
    h.recebimentos=h.recebimentos||[];h.recebimentos.push(receipt);
    openEnergyReceiptModal(houseId,mes,contractId);
    showToast('Parcela de energia registrada.','success');
  }catch(error){
    if(submitButton){submitButton.disabled=false;submitButton.textContent='Registrar parcela';}
    console.error(error);showToast('Não foi possível registrar o recebimento de energia.','error');
  }
}
function openArchiveEnergyReceiptModal(houseId,mes,contractId,receiptId){
  if(!requireFinancePermission())return;
  openModal('<h3 class="modal-title">Arquivar este recebimento?</h3>'+
    '<p class="modal-text">Ele sairá dos totais, mas continuará disponível para restauração.</p>'+
    '<label class="field"><span>Motivo (opcional)</span><input id="f_archive_reason" maxlength="300"></label>'+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="openEnergyReceiptModal(\''+houseId+'\',\''+mes+'\',\''+contractId+'\')">Voltar</button>'+
      '<button class="btn btn-danger" onclick="archiveEnergyReceipt(\''+houseId+'\',\''+mes+'\',\''+contractId+'\',\''+receiptId+'\')">Arquivar</button></div>');
}
async function archiveEnergyReceipt(houseId,mes,contractId,receiptId){
  if(!requireFinancePermission())return;
  const h=state.houses.find(function(item){return item.id===houseId;});
  const receipt=h&&(h.recebimentos||[]).find(function(item){return item.id===receiptId;});
  if(!receipt) return;
  try{
    await db.archiveReceipt(receiptId,((document.getElementById('f_archive_reason')||{}).value||'').trim());
    receipt.arquivadoEm=new Date().toISOString();
    openEnergyReceiptModal(houseId,mes,contractId);
    showToast('Recebimento arquivado.','success');
  }catch(error){console.error(error);showToast('Não foi possível arquivar.','error');}
}
async function viewEnergyPhoto(houseId,mes,contractId){
  const h=state.houses.find(function(x){return x.id===houseId;}),e=h&&energiaDoMes(h,mes,contractId);
  if(!e||!e.fotoPath) return;
  try{const url=await db.energyPhotoUrl(e.fotoPath);if(url)window.open(url,'_blank');}
  catch(err){showToast('Não foi possível abrir a foto.','error');}
}
function openArchiveEnergyModal(houseId,mes,contractId){
  if(!requirePropertyPermission())return;
  const h = state.houses.find(function(x){ return x.id===houseId; });
  const entry=h&&energiaDoMes(h,mes,contractId);
  if(!entry){showToast('Esta leitura não está mais disponível.','error');return;}
  openModal('<h3 class="modal-title">Arquivar leitura de energia?</h3>'+
    '<p class="modal-text">'+esc(h.nome)+' · '+esc(monthLabel(mes))+'</p>'+
    '<div class="notice-box"><strong>O registro poderá ser restaurado.</strong><br>A leitura sairá das telas ativas. Cobranças e recebimentos já registrados continuam preservados no histórico financeiro.</div>'+
    '<label class="field"><span>Motivo do arquivamento</span><input id="f_archive_reason" maxlength="300" placeholder="Ex.: leitura duplicada"></label>'+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="openEnergiaModal(\''+houseId+'\',\''+mes+'\',\''+contractId+'\')">Voltar</button>'+
      '<button class="btn btn-danger" onclick="archiveEnergyEntry(\''+houseId+'\',\''+mes+'\',\''+contractId+'\')">Arquivar leitura</button></div>');
}
async function archiveEnergyEntry(houseId,mes,contractId){
  if(!requirePropertyPermission())return;
  const h=state.houses.find(function(x){return x.id===houseId;});
  const entry=h&&energiaDoMes(h,mes,contractId);
  if(!entry)return;
  try{
    const reason=((document.getElementById('f_archive_reason')||{}).value||'').trim();
    let persistedId=entry.id||'';
    /* Um lançamento recém-criado pelo adaptador antigo só recebe o UUID
       depois de uma leitura do banco. Resolve esse caso sem apagar nada. */
    if(!persistedId){
      const fresh=await db.loadAll();
      const freshHouse=(fresh.houses||[]).find(function(item){return item.id===houseId;});
      const freshEntry=freshHouse&&energiaDoMes(freshHouse,mes,contractId);
      persistedId=freshEntry&&freshEntry.id||'';
    }
    if(!persistedId)throw new Error('Não foi possível localizar esta leitura para arquivá-la.');
    await db.archiveEntity('energia',persistedId,reason);
    h.energias = (h.energias||[]).filter(function(e){ return !(e.mes===mes&&(!contractId||e.contractId===contractId)); });
    closeModal(); render();
    showToast('Leitura de energia arquivada.','success');
  }catch(err){ console.error(err); showToast((err&&err.message)||'Não foi possível arquivar a leitura.', 'error'); }
}
function removeEnergia(houseId,mes,contractId){openArchiveEnergyModal(houseId,mes,contractId);}
function cobrarEnergiaWhatsApp(houseId, mes,contractId){
  if(!requireFinancePermission())return;
  const h = state.houses.find(function(x){ return x.id===houseId; });
  const contract=contractForMonth(h,mes,contractId);
  const t = contract?contractTenant(contract):tenantOf(h);
  if(!t || !t.telefone){ showToast('Cadastre o telefone do inquilino primeiro.', 'error'); return; }
  const val = energiaValorMes(h, mes,contract&&contract.id);
  let phone = (t.telefone||'').replace(/\D/g,'');
  if(phone && phone.length<=11) phone = '55'+phone;
  const msg = appendPixToMessage('Olá'+(t.nome?(' '+t.nome):'')+'! Passando para lembrar da conta de energia de '+(h.endereco||h.nome)+' referente a '+monthLabel(mes)+', no valor de '+fmtMoney(val)+'. Qualquer dúvida me chama por aqui!',val);
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
  const msg = appendPixToMessage('Olá'+(t.nome?(' '+t.nome):'')+'! Passando para lembrar do aluguel de '+(house.endereco||house.nome)+' referente a '+monthLabel(mes)+', no valor de '+fmtMoney(value)+' (vencimento dia '+dueDayForMonth(mes,dueDay)+'). Qualquer dúvida me chama por aqui!',value);
  return 'https://wa.me/'+phone+'?text='+encodeURIComponent(msg);
}
function cobrarWhatsApp(houseId, mes,contractId){
  if(!requireFinancePermission())return;
  const h = state.houses.find(function(x){ return x.id===houseId; });
  const contract=contractForMonth(h,mes,contractId);
  const t = contract?contractTenant(contract):tenantOf(h);
  if(!t || !t.telefone){ showToast('Cadastre o telefone do inquilino primeiro.', 'error'); return; }
  window.open(buildWhatsAppUrl(h,mes,contract&&contract.id), '_blank');
}
/* cobrança a partir do alerta: monta a mensagem conforme a situação (próximo / atraso) */
function cobrarAlerta(houseId){
  if(!requireFinancePermission())return;
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
  msg=appendPixToMessage(msg,cob.total);
  window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(msg), '_blank');
}

/* ---------- CRUD: despesas ---------- */
function openExpenseModal(houseId, expenseId){
  if(!expenseId&&!requireFinancePermission())return;
  const h = state.houses.find(function(x){ return x.id===houseId; });
  const e = expenseId ? h.despesas.find(function(x){ return x.id===expenseId; }) : null;
  const mayManage=canManageFinance();
  const disabled=mayManage?'':' disabled';
  openModal(
    '<h3 class="modal-title">'+(e?(mayManage?'Editar registro':'Despesa'):'Novo registro')+'</h3>'+
    (!mayManage?'<p class="modal-hint">Sua função permite consultar esta despesa, sem alterá-la.</p>':'')+
    '<label class="field"><span>Descrição</span><input id="f_desc" value="'+(e?esc(e.descricao):'')+'" placeholder="Ex: Conserto da torneira"'+disabled+'></label>'+
    '<div class="field-row">'+
      '<label class="field"><span>Categoria</span><select id="f_cat"'+disabled+'>'+CONFIG.CATEGORIAS.map(function(c){ return '<option'+(e&&e.categoria===c?' selected':'')+'>'+c+'</option>'; }).join('')+'</select></label>'+
      '<label class="field"><span>Status</span><select id="f_status_desp"'+disabled+'>'+
        CONFIG.DESPESA_STATUS.map(function(s){ return '<option'+((e&&e.status===s)||(!e&&s==='Concluído')?' selected':'')+'>'+s+'</option>'; }).join('')+
      '</select></label>'+
    '</div>'+
    '<div class="field-row">'+
      '<label class="field"><span>Prestador (opcional)</span><input id="f_prest" value="'+(e?esc(e.prestador||''):'')+'" placeholder="Ex: João Encanador"'+disabled+'></label>'+
      '<label class="field"><span>Valor (R$)</span><input id="f_valor" type="number" step="0.01" value="'+(e?e.valor:'')+'"'+disabled+'></label>'+
    '</div>'+
    '<label class="field"><span>Data</span><input id="f_data" type="date" value="'+(e?e.data:todayISO())+'"'+disabled+'></label>'+
    '<div class="modal-actions">'+
      (mayManage&&e ? '<button class="btn btn-danger" onclick="openArchiveExpenseModal(\''+houseId+'\',\''+e.id+'\')">Arquivar despesa</button>' : '<span></span>')+
      '<div class="modal-actions-right">'+
        '<button class="btn btn-ghost" onclick="closeModal()">'+(mayManage?'Cancelar':'Fechar')+'</button>'+
        (mayManage?'<button class="btn btn-primary" onclick="saveExpense(\''+houseId+'\',\''+(expenseId||'')+'\')">Salvar</button>':'')+
      '</div>'+
    '</div>'
  );
}
async function saveExpense(houseId, expenseId){
  if(!requireFinancePermission())return;
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
function openArchiveExpenseModal(houseId,expenseId){
  if(!requireFinancePermission())return;
  const h = state.houses.find(function(x){ return x.id===houseId; });
  const expense=h&&(h.despesas||[]).find(function(item){return item.id===expenseId;});
  if(!expense){showToast('Esta despesa não está mais disponível.','error');return;}
  openModal('<h3 class="modal-title">Arquivar despesa?</h3>'+
    '<p class="modal-text"><strong>'+esc(expense.descricao||'Despesa')+'</strong> sairá dos totais e das listas ativas, sem ser apagada.</p>'+
    '<div class="notice-box">A despesa poderá ser restaurada depois em <strong>Backup → Itens arquivados</strong>.</div>'+
    '<label class="field"><span>Motivo do arquivamento</span><input id="f_archive_reason" maxlength="300" placeholder="Ex.: lançamento duplicado"></label>'+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="openExpenseModal(\''+houseId+'\',\''+expenseId+'\')">Voltar</button>'+
      '<button class="btn btn-danger" onclick="archiveExpense(\''+houseId+'\',\''+expenseId+'\')">Arquivar despesa</button></div>');
}
async function archiveExpense(houseId,expenseId){
  if(!requireFinancePermission())return;
  const h=state.houses.find(function(x){return x.id===houseId;});
  if(!h)return;
  try{
    const reason=((document.getElementById('f_archive_reason')||{}).value||'').trim();
    await db.archiveEntity('despesa',expenseId,reason);
    h.despesas = h.despesas.filter(function(x){ return x.id!==expenseId; });
    closeModal(); render();
    showToast('Despesa arquivada.','success');
  }catch(e){ console.error(e); showToast((e&&e.message)||'Não foi possível arquivar a despesa.', 'error'); }
}
function deleteExpense(houseId,expenseId){openArchiveExpenseModal(houseId,expenseId);}

/* ---------- aba Reajustes (histórico imutável do contrato) ---------- */
var pendingReajusteProposal=null;

function reajusteContractLabel(h,rj){
  const contract=(h.contracts||[]).find(function(item){return item.id===rj.contractId;});
  if(!contract) return rj.contractId?'Contrato não disponível':'Registro antigo sem contrato confirmado';
  const tenant=(state.tenants||[]).find(function(item){return item.id===contract.tenantId;});
  return tenant&&tenant.nome ? tenant.nome : 'Contrato de '+fmtDateBR(contract.inicio);
}
function renderReajustesTab(h){
  const hist=(h.aluguelHistorico||[]).slice().sort(function(a,b){
    return String(b.dataInicio||'').localeCompare(String(a.dataInicio||''));
  });
  const contract=activeContract(h);
  const currentValue=contract?contractExpectedRent(contract,currentMonthStr()):0;
  const warning=contract&&contract.valorInicialRevisar
    ? '<div class="notice-box"><strong>Valor inicial herdado:</strong> confira o valor-base do contrato antes de usar percentuais como referência. O novo valor continuará sendo confirmado em reais.</div>'
    : '';
  const body=hist.length
    ? '<div class="list-card"><div class="ledger">'+hist.map(function(rj){
        const isCurrent=contract&&rj.contractId===contract.id
          && Math.abs((Number(rj.valor)||0)-currentValue)<0.005
          && String(rj.dataInicio||'').slice(0,7)<=currentMonthStr();
        return '<button type="button" class="ledger-row" onclick="openReajusteModal(\''+h.id+'\',\''+rj.id+'\')">'+
          '<div class="ledger-row-main"><strong class="num">'+fmtMoney(rj.valor)+'</strong>'+
            '<div class="ledger-row-sub">Desde '+monthLabel(String(rj.dataInicio||'').slice(0,7))+
              ' · '+esc(reajusteContractLabel(h,rj))+
              (rj.motivo?' · '+esc(rj.motivo):'')+'</div></div>'+
          (isCurrent?'<span class="chip chip-brass">ATUAL</span>':'')+
          '<div class="ledger-row-value">Ver registro</div></button>';
      }).join('')+'</div></div>'
    : '<div class="empty-state">Nenhum reajuste confirmado. O valor inicial pertence ao contrato e não precisa ser repetido aqui.</div>';
  return '<div class="tab-summary-row"><div>Aluguel vigente: <strong class="num">'+
      (contract?fmtMoney(currentValue):'—')+'</strong>'+
      (contract?'<div class="ledger-row-sub">Contrato ativo · '+esc(reajusteContractLabel(h,{contractId:contract.id}))+'</div>':'<div class="ledger-row-sub">Nenhum contrato ativo</div>')+
    '</div>'+
    (canAdministerAccount()&&contract
      ?'<button class="btn btn-primary btn-sm" onclick="openReajusteModal(\''+h.id+'\')">Propor reajuste</button>'
      :'')+'</div>'+warning+body;
}
function openReajusteModal(houseId,reajusteId){
  const h=state.houses.find(function(item){return item.id===houseId;});
  if(!h){showToast('Imóvel não encontrado.','error');return;}
  const rj=reajusteId
    ?(h.aluguelHistorico||[]).find(function(item){return item.id===reajusteId;})
    :null;
  if(reajusteId){
    if(!rj){showToast('Este reajuste não está mais disponível.','error');return;}
    openModal(
      '<h3 class="modal-title">Reajuste confirmado</h3>'+
      '<div class="field-card">'+
        '<div class="field-line"><span class="fl-label">Novo aluguel</span><strong class="fl-value num">'+fmtMoney(rj.valor)+'</strong></div>'+
        '<div class="field-line"><span class="fl-label">Vigência</span><span class="fl-value">'+esc(monthLabel(String(rj.dataInicio||'').slice(0,7)))+'</span></div>'+
        '<div class="field-line"><span class="fl-label">Contrato</span><span class="fl-value">'+esc(reajusteContractLabel(h,rj))+'</span></div>'+
        '<div class="field-line"><span class="fl-label">Motivo</span><span class="fl-value">'+esc(rj.motivo||'Não informado')+'</span></div>'+
      '</div>'+
      '<div class="notice-box">Este registro não pode ser editado. Arquivá-lo não altera cobranças que já foram geradas.</div>'+
      '<div class="modal-actions">'+
        (canAdministerAccount()?'<button class="btn btn-danger" onclick="openArchiveReajusteModal(\''+houseId+'\',\''+rj.id+'\')">Arquivar</button>':'<span></span>')+
        '<button class="btn btn-ghost" onclick="closeModal()">Fechar</button>'+
      '</div>'
    );
    return;
  }
  if(!requireAccountPermission(canAdministerAccount(),'Somente administradores podem confirmar reajustes.'))return;
  const contract=activeContract(h);
  if(!contract){showToast('É necessário ter um contrato ativo para reajustar o aluguel.','error');return;}
  const firstContractMonth=contractFirstFullMonth(contract)||String(contract.inicio||todayISO()).slice(0,7);
  const minimumMonth=firstContractMonth>currentMonthStr()?firstContractMonth:currentMonthStr();
  const currentValue=contractExpectedRent(contract,minimumMonth);
  pendingReajusteProposal=null;
  openModal(
    '<h3 class="modal-title">Propor reajuste</h3>'+
    '<p class="modal-text">O sistema calcula a comparação, mas só registra o novo aluguel depois da sua confirmação.</p>'+
    '<div class="field-row">'+
      '<label class="field"><span>Novo aluguel (R$)</span><input id="f_reajuste_valor" type="number" min="0.01" step="0.01" value="'+(currentValue||'')+'" oninput="updateReajustePreview(\''+houseId+'\')"></label>'+
      '<label class="field"><span>A partir do mês</span><input id="f_reajuste_mes" type="month" min="'+minimumMonth+'" value="'+minimumMonth+'" onchange="updateReajustePreview(\''+houseId+'\')"></label>'+
    '</div>'+
    '<label class="field"><span>Motivo ou referência</span><input id="f_reajuste_motivo" maxlength="300" placeholder="Ex.: acordo de renovação"></label>'+
    '<div id="reajuste_preview" class="notice-box"></div>'+
    (contract.valorInicialRevisar
      ?'<div class="notice-box"><strong>Atenção:</strong> o valor-base deste contrato veio da versão antiga e está marcado para conferência. Confirme principalmente os valores em reais.</div>'
      :'')+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-primary" onclick="saveReajuste(\''+houseId+'\')">Revisar e confirmar</button>'+
    '</div></div>'
  );
  updateReajustePreview(houseId);
}
function updateReajustePreview(houseId){
  const h=state.houses.find(function(item){return item.id===houseId;});
  const contract=h&&activeContract(h);
  const target=document.getElementById('reajuste_preview');
  const monthInput=document.getElementById('f_reajuste_mes');
  const valueInput=document.getElementById('f_reajuste_valor');
  if(!contract||!target||!monthInput||!valueInput)return;
  const month=monthInput.value||currentMonthStr();
  const before=contractExpectedRent(contract,month);
  const after=parseFloat(valueInput.value)||0;
  const variation=before>0?((after-before)/before)*100:null;
  target.innerHTML='<strong>Prévia:</strong> '+fmtMoney(before)+' → '+fmtMoney(after)+
    (variation==null?'':' ('+(variation>=0?'+':'')+variation.toFixed(2).replace('.',',')+'%)')+
    '<br>Vigência: '+esc(monthLabel(month))+'. Cobranças já geradas permanecem com o valor confirmado anteriormente.';
}
function saveReajuste(houseId,reajusteId){
  if(reajusteId){
    showToast('Reajustes confirmados não podem ser editados.','error');
    return;
  }
  if(!requireAccountPermission(canAdministerAccount(),'Somente administradores podem confirmar reajustes.'))return;
  const h=state.houses.find(function(item){return item.id===houseId;});
  const contract=h&&activeContract(h);
  if(!contract){showToast('O contrato ativo não está mais disponível.','error');return;}
  const value=parseFloat((document.getElementById('f_reajuste_valor')||{}).value)||0;
  const month=((document.getElementById('f_reajuste_mes')||{}).value||'').slice(0,7);
  const reason=((document.getElementById('f_reajuste_motivo')||{}).value||'').trim();
  if(value<=0){showToast('Informe um novo aluguel maior que zero.','error');return;}
  if(!month){showToast('Informe o mês de início.','error');return;}
  if(month<currentMonthStr()){showToast('Use o mês atual ou um mês futuro.','error');return;}
  if(!contractCoversMonth(contract,month)){
    showToast('O mês informado não pertence ao período faturável deste contrato.','error');return;
  }
  if(reason.length<3){showToast('Informe o motivo ou a referência do reajuste.','error');return;}
  const duplicate=(h.aluguelHistorico||[]).some(function(item){
    return item.contractId===contract.id&&String(item.dataInicio||'').slice(0,7)===month;
  });
  if(duplicate){showToast('Este contrato já possui um reajuste nesse mês.','error');return;}
  const before=contractExpectedRent(contract,month);
  const variation=before>0?((value-before)/before)*100:null;
  pendingReajusteProposal={
    houseId:houseId,contractId:contract.id,valor:value,
    dataInicio:month+'-01',motivo:reason,valorAnterior:before
  };
  openModal(
    '<h3 class="modal-title">Confirmar novo aluguel?</h3>'+
    '<div class="field-card">'+
      '<div class="field-line"><span class="fl-label">Valor anterior</span><span class="fl-value num">'+fmtMoney(before)+'</span></div>'+
      '<div class="field-line"><span class="fl-label">Novo valor</span><strong class="fl-value num">'+fmtMoney(value)+'</strong></div>'+
      '<div class="field-line"><span class="fl-label">Vigência</span><span class="fl-value">'+esc(monthLabel(month))+'</span></div>'+
      (variation==null?'':'<div class="field-line"><span class="fl-label">Variação</span><span class="fl-value">'+(variation>=0?'+':'')+variation.toFixed(2).replace('.',',')+'%</span></div>')+
      '<div class="field-line"><span class="fl-label">Motivo</span><span class="fl-value">'+esc(reason)+'</span></div>'+
    '</div>'+
    '<div class="notice-box">Ao confirmar, o registro passa a fazer parte do histórico e não poderá ser editado. Se houver erro, ele poderá ser arquivado e um novo registro deverá ser criado.</div>'+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="openReajusteModal(\''+houseId+'\')">Voltar</button>'+
      '<button id="btn_confirm_reajuste" class="btn btn-primary" onclick="confirmReajuste()">Confirmar reajuste</button></div>'
  );
}
async function confirmReajuste(){
  const proposal=pendingReajusteProposal;
  if(!proposal||!requireAccountPermission(canAdministerAccount(),'Somente administradores podem confirmar reajustes.'))return;
  const h=state.houses.find(function(item){return item.id===proposal.houseId;});
  const contract=h&&(h.contracts||[]).find(function(item){return item.id===proposal.contractId;});
  if(!h||!contract){showToast('O imóvel ou contrato não está mais disponível.','error');return;}
  const button=document.getElementById('btn_confirm_reajuste');
  if(button){button.disabled=true;button.textContent='Confirmando…';}
  try{
    const created=await db.insertReajuste(proposal.houseId,{
      contractId:proposal.contractId,valor:proposal.valor,
      dataInicio:proposal.dataInicio,motivo:proposal.motivo
    });
    if(!h.aluguelHistorico)h.aluguelHistorico=[];
    if(!contract.reajustes)contract.reajustes=[];
    h.aluguelHistorico.push(created);
    contract.reajustes.push(created);
    pendingReajusteProposal=null;
    closeModal();render();
    showToast('Reajuste confirmado para '+monthLabel(created.dataInicio.slice(0,7))+'.','success');
  }catch(e){
    console.error(e);
    if(button){button.disabled=false;button.textContent='Confirmar reajuste';}
    showToast((e&&e.message)||'Não foi possível confirmar o reajuste.','error');
  }
}
function openArchiveReajusteModal(houseId,reajusteId){
  if(!requireAccountPermission(canAdministerAccount(),'Somente administradores podem arquivar reajustes.'))return;
  const h=state.houses.find(function(item){return item.id===houseId;});
  const rj=h&&(h.aluguelHistorico||[]).find(function(item){return item.id===reajusteId;});
  if(!rj){showToast('Este reajuste não está mais disponível.','error');return;}
  openModal(
    '<h3 class="modal-title">Arquivar reajuste?</h3>'+
    '<p class="modal-text"><strong>'+fmtMoney(rj.valor)+'</strong>, vigente desde '+esc(monthLabel(rj.dataInicio.slice(0,7)))+', sairá do cálculo futuro.</p>'+
    '<div class="notice-box">Cobranças já geradas não serão reescritas. O registro poderá ser restaurado em <strong>Backup → Itens arquivados</strong>.</div>'+
    '<label class="field"><span>Motivo do arquivamento</span><input id="f_archive_reajuste_reason" maxlength="300" placeholder="Ex.: mês informado incorretamente"></label>'+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="openReajusteModal(\''+houseId+'\',\''+reajusteId+'\')">Voltar</button>'+
      '<button class="btn btn-danger" onclick="deleteReajusteHandler(\''+houseId+'\',\''+reajusteId+'\')">Arquivar reajuste</button></div>'
  );
}
async function deleteReajusteHandler(houseId,reajusteId){
  if(!requireAccountPermission(canAdministerAccount(),'Somente administradores podem arquivar reajustes.'))return;
  const h=state.houses.find(function(item){return item.id===houseId;});
  if(!h)return;
  const reason=((document.getElementById('f_archive_reajuste_reason')||{}).value||'').trim();
  if(reason.length<3){showToast('Informe o motivo do arquivamento.','error');return;}
  try{
    await db.archiveEntity('reajuste',reajusteId,reason);
    h.aluguelHistorico=(h.aluguelHistorico||[]).filter(function(item){return item.id!==reajusteId;});
    (h.contracts||[]).forEach(function(contract){
      contract.reajustes=(contract.reajustes||[]).filter(function(item){return item.id!==reajusteId;});
    });
    closeModal();render();
    showToast('Reajuste arquivado.','success');
  }catch(e){console.error(e);showToast((e&&e.message)||'Não foi possível arquivar o reajuste.','error');}
}
function registrarValorAtual(houseId){
  openReajusteModal(houseId);
}
