/* ============================================================
   portal.js — área somente leitura do inquilino.
   A proteção real é feita no banco; esta tela só apresenta o recorte liberado.
   ============================================================ */

function setPortalTab(tab){ state.portalTab=tab; render(); window.scrollTo(0,0); }

function renderPortalNav(){
  const items=[['inicio','Início'],['contrato','Contrato'],['pagamentos','Pagamentos']]
    .concat(energyModuleEnabled()&&state.houses.some(houseEnergyEnabled)?[['energia','Energia']]:[])
    .concat([['documentos','Arquivos']]);
  return '<nav class="portal-nav" style="--portal-items:'+items.length+'">'+items.map(function(i){
    const atual=state.portalTab===i[0];
    return '<button class="portal-nav-item'+(atual?' active':'')+'"'+(atual?' aria-current="page"':'')+' onclick="setPortalTab(\''+i[0]+'\')">'+esc(i[1])+'</button>';
  }).join('')+'</nav>';
}

function renderPortalHeader(){
  const t=state.tenants[0];
  return '<header class="portal-header"><div class="portal-brand">'+logoSvg()+'<div><strong>Meu aluguel</strong><span>Olá, '+esc(t?t.nome:'inquilino')+'</span></div></div>'+
    '<button class="btn btn-ghost btn-sm" onclick="doSignOut()">Sair</button></header>';
}

function portalHouseTitle(h){
  return '<div class="portal-house-heading"><div><span>IMÓVEL</span><h2>'+esc(h.nome)+'</h2><p>'+esc(h.endereco||'Endereço não informado')+'</p></div>'+
    '<span class="chip chip-'+(h.status==='alugada'?'brass':'slate')+'">'+esc(h.status.toUpperCase())+'</span></div>';
}

function portalMonthlyBalance(h,contract,mes){
  const expected=contract?contractExpectedRent(contract,mes):aluguelValorMes(h,mes);
  const charge=chargeForMonth(h,mes,'aluguel',contract&&contract.id);
  const legacy=paymentForMonth(h,mes,contract&&contract.id);
  const received=charge
    ?chargeReceivedTotal(h,charge)
    :(legacy?Number(legacy.valorPago)||0:0);
  return {
    expected:expected,received:received,
    remaining:Math.max(0,expected-received),
    credit:Math.max(0,received-expected),
    status:paymentStatus(h,mes,contract&&contract.id)
  };
}
function portalEnergyBalance(h,contract,mes){
  const entry=energiaDoMes(h,mes,contract&&contract.id);
  const expected=entry?Number(entry.valor)||0:0;
  const charge=chargeForMonth(h,mes,'energia',contract&&contract.id);
  const received=charge
    ?chargeReceivedTotal(h,charge)
    :(entry&&entry.pago?expected:0);
  return {
    entry:entry,expected:expected,received:received,
    remaining:Math.max(0,expected-received),
    credit:Math.max(0,received-expected),
    status:energiaStatus(h,mes,contract&&contract.id)
  };
}
function portalProrataBalance(h,contract){
  return contractProrataPaymentSnapshot(h,contract);
}

function renderPortalInicio(){
  const cur=currentMonthStr();
  return '<div class="portal-welcome"><div class="eyebrow">VISÃO GERAL</div><h1>Tudo do seu aluguel em um só lugar</h1>'+
    '<p>Consulte contrato, pagamentos, recibos'+(energyModuleEnabled()?', energia':'')+' e arquivos liberados.</p></div>'+
    renderPortalEmAberto()+
    state.houses.map(function(h){
      const contract=activeContract(h)||contractForMonth(h,cur);
      const p=contract?paymentForMonth(h,cur,contract.id):null;
      const hasEnergy=houseEnergyEnabled(h),e=contract&&hasEnergy?energiaDoMes(h,cur,contract.id):null;
      const prorataState=contract?portalProrataBalance(h,contract):{expected:0,received:0,remaining:0};
      const prorataPending=prorataState.expected>0&&prorataState.remaining>0;
      const monthlyState=contract?portalMonthlyBalance(h,contract,cur):null;
      const coversCurrent=contract&&contractCoversMonth(contract,cur);
      const nextFull=contract&&contractFirstFullMonth(contract);
      const shownDueMonth=coversCurrent?cur:(nextFull||cur);
      const cycleLabel=prorataPending?'Ajuste inicial':coversCurrent?monthLabel(cur):'Próximo aluguel';
      const cycleStatus=prorataPending
        ?(prorataState.received>0?'Parcial':'Em aberto')
        :monthlyState&&monthlyState.remaining<=0&&monthlyState.expected>0?'Pago'
        :monthlyState&&monthlyState.received>0?'Parcial'
        :coversCurrent?'Em aberto':'Programado';
      const cycleSub=prorataPending
        ?'saldo '+fmtMoney(prorataState.remaining)
        :monthlyState&&monthlyState.remaining<=0&&p?fmtDateBR(p.dataPagamento)
        :monthlyState&&monthlyState.received>0?'saldo '+fmtMoney(monthlyState.remaining)
        :coversCurrent?'consulte o vencimento':(nextFull?'vence em '+monthLabel(nextFull):'aguarde o contrato');
      return '<section class="portal-house-card">'+portalHouseTitle(h)+
        '<div class="portal-summary-grid'+(!hasEnergy?' no-energy':'')+'">'+
          '<div class="portal-summary"><span>Aluguel</span><strong>'+fmtMoney(contract?contractRentValueAt(contract,shownDueMonth):aluguelValorMes(h,cur))+'</strong><small>vence dia '+dueDayForMonth(shownDueMonth,contract?contractBillingDay(contract):h.diaVencimento)+'</small></div>'+
          '<div class="portal-summary"><span>'+cycleLabel+'</span><strong class="'+(cycleStatus==='Pago'?'ok':'')+'">'+cycleStatus+'</strong><small>'+cycleSub+'</small></div>'+
          (hasEnergy?function(){const energyState=contract?portalEnergyBalance(h,contract,cur):null;return '<div class="portal-summary"><span>Energia</span><strong>'+(e?fmtMoney(e.valor):'Não lançada')+'</strong><small>'+(energyState&&energyState.expected>0?(energyState.remaining<=0?'paga':energyState.received>0?'parcial · saldo '+fmtMoney(energyState.remaining):'em aberto'):'neste mês')+'</small></div>';}():'')+
        '</div>'+
        '<div class="quick-actions"><button class="btn btn-primary btn-sm" onclick="setPortalTab(\'pagamentos\')">Ver pagamentos</button>'+
          (hasEnergy?'<button class="btn btn-ghost btn-sm" onclick="setPortalTab(\'energia\')">Ver energia</button>':'')+'</div>'+
      '</section>';
    }).join('');
}

function renderPortalContrato(){
  return '<div class="page-header"><div><div class="eyebrow">MEU CONTRATO</div><h1 class="page-title">Dados do contrato</h1></div></div>'+
    state.houses.map(function(h){
      const contract=activeContract(h)||(h.contracts||[])[0]||{};
      return '<section class="portal-house-card">'+portalHouseTitle(h)+
        '<div class="detail-grid">'+
          '<div class="detail-item"><span>Início</span><strong>'+fmtDateBR(contract.inicio)+'</strong></div>'+
          '<div class="detail-item"><span>Fim</span><strong>'+fmtDateBR(contract.fim)+'</strong></div>'+
          '<div class="detail-item"><span>Valor atual</span><strong class="num">'+fmtMoney(contractRentValueAt(contract,currentMonthStr()))+'</strong></div>'+
          '<div class="detail-item"><span>Vencimento</span><strong>'+esc(contractModeLabel(contract))+'</strong></div>'+
        '</div>'+
      '</section>';
    }).join('');
}

/* ------------------------------------------------------------------
   Segunda via de PIX pelo próprio portal.

   O código PIX já era gerado, mas só do lado do proprietário — o
   inquilino precisava pedir por telefone ou WhatsApp toda vez.
   Os dados necessários já chegam ao portal: loadTenantPortal carrega
   as configurações do proprietário, chave PIX inclusive.

   A confirmação do pagamento continua manual, feita pelo
   proprietário. Isto aqui só evita o telefonema.
   ------------------------------------------------------------------ */
function portalPodeGerarPix(){
  return !!(state.config && String(state.config.pixChave||'').trim());
}

function computePortalPixCobranca(houseId,mes,contractId,tipo){
  const h=state.houses.find(function(x){return x.id===houseId;});
  if(!h) return null;
  let valor=0, oque='';
  const contract=contractForMonth(h,mes,contractId)||
    (h.contracts||[]).find(function(c){return c.id===contractId;})||null;
  if(tipo==='energia'){
    valor=portalEnergyBalance(h,contract,mes).remaining;
    oque='Energia de '+monthLabel(mes);
  } else if(tipo==='ajuste'){
    valor=portalProrataBalance(h,contract).remaining;
    oque='Ajuste inicial do contrato';
  } else {
    valor=portalMonthlyBalance(h,contract,mes).remaining;
    oque='Aluguel de '+monthLabel(mes);
  }
  return {valor:valor,oque:oque,house:h,contract:contract};
}

function openPortalPix(houseId,mes,contractId,tipo){
  const cobranca=computePortalPixCobranca(houseId,mes,contractId,tipo);
  if(!cobranca) return;
  const valor=cobranca.valor,oque=cobranca.oque;
  if(!(valor>0)){
    showToast('Não há valor em aberto para gerar este PIX.','error');
    return;
  }
  try{
    const code=generatePixPayload(valor);
    openModal('<h3 class="modal-title">Pagar com PIX</h3>'+
      '<p class="modal-text">'+esc(oque)+' · <strong>'+fmtMoney(valor)+'</strong><br>'+
        '<small>Copie o código abaixo e cole no aplicativo do seu banco. '+
        'O proprietário confirma o recebimento depois.</small></p>'+
      '<label class="field"><span>Código PIX Copia e Cola</span>'+
        '<textarea id="portal_pix_code" rows="6" readonly>'+esc(code)+'</textarea></label>'+
      '<div class="modal-actions">'+
        '<button class="btn btn-ghost" onclick="closeModal()">Fechar</button>'+
        '<button class="btn btn-primary" onclick="copyTextValue(document.getElementById(\'portal_pix_code\').value,\'Código PIX copiado.\')">Copiar código</button>'+
      '</div>');
  }catch(e){
    showToast('O proprietário ainda não cadastrou a chave PIX.','error');
  }
}

/* O que está em aberto agora, somado. É a primeira pergunta de quem
   abre o portal, e antes exigia percorrer o histórico inteiro. */
function computePortalEmAberto(){
  const cur=currentMonthStr();
  const itens=[];
  state.houses.forEach(function(h){
    const contract=activeContract(h)||(h.contracts||[])[0];
    if(!contract) return;

    const prorataState=portalProrataBalance(h,contract);
    if(prorataState.expected>0 && prorataState.remaining>0){
      itens.push({ house:h, contract:contract, mes:contract.inicio.slice(0,7),
        tipo:'ajuste', rotulo:'Ajuste inicial', valor:prorataState.remaining,
        atrasado:prorataState.status==='atrasado' });
    }

    const primeiro=contractFirstFullMonth(contract);
    let m=cur;
    for(let i=0;i<24 && primeiro && m>=primeiro;i++){
      if(contractCoversMonth(contract,m)){
        const monthly=portalMonthlyBalance(h,contract,m),st=monthly.status;
        if(monthly.remaining>0&&st!=='futuro'){
          itens.push({ house:h, contract:contract, mes:m, tipo:'aluguel',
            rotulo:'Aluguel de '+monthLabel(m),
            valor:monthly.remaining, atrasado:st==='atrasado' });
        }
      }
      const energyState=houseEnergyEnabled(h)?portalEnergyBalance(h,contract,m):null;
      const statusEnergia=energyState?energyState.status:'desativada';
      if(energyState&&energyState.remaining>0&&['atrasado','pendente','parcial','tolerancia'].includes(statusEnergia)){
        itens.push({ house:h, contract:contract, mes:m, tipo:'energia',
          rotulo:'Energia de '+monthLabel(m), valor:energyState.remaining,
          atrasado:statusEnergia==='atrasado' });
      }
      m=addMonths(m,-1);
    }
  });
  itens.sort(function(a,b){ return a.mes.localeCompare(b.mes); });
  return { itens:itens, total:itens.reduce(function(s,i){ return s+i.valor; },0) };
}

function renderPortalEmAberto(){
  const dados=computePortalEmAberto();
  if(!dados.itens.length){
    return '<section class="panel portal-aberto portal-aberto-ok">'+
      '<div class="panel-title-inline">Nada em aberto</div>'+
      '<p class="portal-aberto-nota">Seus pagamentos estão em dia. Obrigado!</p></section>';
  }
  const temPix=portalPodeGerarPix();
  return '<section class="panel portal-aberto">'+
    '<div class="panel-title-inline">Em aberto agora'+
      '<span class="alert-badge">'+dados.itens.length+'</span></div>'+
    '<div class="portal-aberto-total">'+
      '<span>Total a pagar</span><strong class="num">'+fmtMoney(dados.total)+'</strong></div>'+
    '<div class="ledger">'+dados.itens.map(function(i){
      return '<div class="ledger-row">'+
        '<div class="ledger-row-main">'+esc(i.rotulo)+
          '<div class="ledger-row-sub">'+esc(i.house.nome)+
            (i.atrasado?' · <strong>em atraso</strong>':'')+'</div></div>'+
        '<div class="ledger-row-value num">'+fmtMoney(i.valor)+'</div>'+
        (temPix
          ? '<button class="btn btn-primary btn-sm" onclick="openPortalPix(\''+i.house.id+'\',\''+i.mes+'\',\''+i.contract.id+'\',\''+i.tipo+'\')">PIX</button>'
          : '<span class="status-dot '+(i.atrasado?'atrasado':'pendente')+'">'+(i.atrasado?'Atrasado':'Em aberto')+'</span>')+
      '</div>';
    }).join('')+'</div>'+
    (temPix?'<p class="portal-aberto-nota">O proprietário confirma cada pagamento manualmente. '+
      'Pode levar algumas horas para aparecer como pago aqui.</p>':'')+
  '</section>';
}

function renderPortalPagamentos(){
  return '<div class="page-header"><div><div class="eyebrow">PAGAMENTOS E RECIBOS</div><h1 class="page-title">Histórico do aluguel</h1></div></div>'+
    state.houses.map(function(h){
      const contract=activeContract(h)||(h.contracts||[])[0];
      if(!contract) return '';
      const cur=currentMonthStr(),first=contractFirstFullMonth(contract),last=contract.fim&&contract.fim.slice(0,7)<cur?contract.fim.slice(0,7):cur;
      const months=[];let m=last;while(first&&m>=first&&months.length<24){if(contractCoversMonth(contract,m))months.push(m);m=addMonths(m,-1);}
      const prorata=portalProrataBalance(h,contract);
      return '<section class="portal-house-card">'+portalHouseTitle(h)+(prorata.expected?'<div class="portal-initial-adjustment"><span>Ajuste inicial · '+contractProrataDays(contract)+' dias</span><strong class="num">'+fmtMoney(prorata.expected)+'</strong><span class="status-dot '+(prorata.remaining<=0?'pago':'pendente')+'">'+(prorata.remaining<=0?'Pago':prorata.received>0?'Parcial · saldo '+fmtMoney(prorata.remaining):'Em aberto')+'</span></div>':'')+'<div class="ledger">'+months.map(function(mes){
        const p=paymentForMonth(h,mes,contract.id);
        const st=paymentStatus(h,mes,contract.id);
        const balance=portalMonthlyBalance(h,contract,mes);
        const settled=balance.expected>0&&balance.remaining<=0;
        return '<div class="ledger-row"><div class="ledger-row-main">'+monthLabel(mes)+'<div class="ledger-row-sub">'+(settled?(p?'Pago em '+fmtDateBR(p.dataPagamento):'Pago'):balance.received>0?'Recebido '+fmtMoney(balance.received)+' · saldo '+fmtMoney(balance.remaining):(st==='futuro'?'Ainda não venceu':'Pagamento não registrado'))+'</div></div>'+
          '<div class="ledger-row-value num">'+fmtMoney(balance.expected)+'</div>'+
          (balance.received>0
            ?'<div class="ledger-row-actions"><button class="btn btn-ghost btn-sm" onclick="generateReceiptPDF(\''+h.id+'\',\''+mes+'\',\''+contract.id+'\')">Recibos</button>'+
              (!settled&&st!=='futuro'&&portalPodeGerarPix()
                ?'<button class="btn btn-primary btn-sm" onclick="openPortalPix(\''+h.id+'\',\''+mes+'\',\''+contract.id+'\',\'aluguel\')">PIX do saldo</button>'
                :'')+'</div>'
            :(st!=='futuro'&&portalPodeGerarPix()
              ?'<button class="btn btn-primary btn-sm" onclick="openPortalPix(\''+h.id+'\',\''+mes+'\',\''+contract.id+'\',\'aluguel\')">PIX</button>'
              :'<span class="status-dot '+esc(st)+'">'+(st==='atrasado'?'Atrasado':'Em aberto')+'</span>'))+
        '</div>';
      }).join('')+'</div></section>';
    }).join('');
}

function renderPortalEnergia(){
  return '<div class="page-header"><div><div class="eyebrow">ENERGIA</div><h1 class="page-title">Consumo e pagamentos</h1></div></div>'+
    state.houses.filter(houseEnergyEnabled).map(function(h){
      const contract=activeContract(h)||(h.contracts||[])[0];
      const rows=(h.energias||[]).filter(function(e){return !contract||e.contractId===contract.id;}).slice().sort(function(a,b){return b.mes.localeCompare(a.mes);});
      return '<section class="portal-house-card">'+portalHouseTitle(h)+(rows.length?'<div class="ledger">'+rows.map(function(e){
        const balance=portalEnergyBalance(h,contract,e.mes),settled=balance.expected>0&&balance.remaining<=0;
        return '<div class="ledger-row"><div class="ledger-row-main">'+monthLabel(e.mes)+'<div class="ledger-row-sub">Leituras '+e.leituraAnterior+' → '+e.leituraAtual+' · '+fmtMoney(e.valor)+(e.vencimento?' · vence '+fmtDateBR(e.vencimento):'')+(balance.received>0?' · recebido '+fmtMoney(balance.received):'')+'</div></div>'+
          '<div class="ledger-row-value"><strong class="num">'+(Number(e.kwh)||0).toLocaleString('pt-BR')+' kWh</strong></div>'+
          '<span class="status-dot '+(settled?'pago':'pendente')+'">'+(settled?'Pago':balance.received>0?'Parcial · '+fmtMoney(balance.remaining):'Em aberto')+'</span></div>';
      }).join('')+'</div>':emptyState('Nenhum lançamento de energia disponível.',financeIconSvg()))+'</section>';
    }).join('');
}

function renderPortalDocumentos(){
  const docs=state.portalDocuments||[];
  return '<div class="page-header"><div><div class="eyebrow">ARQUIVOS</div><h1 class="page-title">Documentos disponíveis</h1>'+
    '<p class="page-sub">Somente os arquivos liberados pelo proprietário aparecem aqui.</p></div></div>'+
    state.houses.map(function(h){
      const own=docs.filter(function(d){return d.houseId===h.id;});
      return '<section class="portal-house-card">'+portalHouseTitle(h)+renderDocumentRows(own,h.id,false)+'</section>';
    }).join('');
}

function renderTenantPortal(){
  if(state.portalTab==='energia'&&(!energyModuleEnabled()||!state.houses.some(houseEnergyEnabled))) state.portalTab='inicio';
  const body=state.portalTab==='contrato'?renderPortalContrato():
    state.portalTab==='pagamentos'?renderPortalPagamentos():
    state.portalTab==='energia'?renderPortalEnergia():
    state.portalTab==='documentos'?renderPortalDocumentos():renderPortalInicio();
  return '<div class="portal-shell">'+renderPortalHeader()+renderPortalNav()+'<main class="portal-main">'+body+'</main></div>';
}

function renderPendingAccess(){
  return '<div class="access-pending"><div class="auth-card"><div class="auth-brand">'+logoSvg()+'<span>Meu aluguel</span></div>'+ 
    '<span class="auth-role-badge tenant">Inquilino</span><h1 class="auth-title">Aguardando vínculo do imóvel</h1>'+ 
    '<p class="auth-sub">Seu login está correto, mas o administrador ainda precisa liberar este mesmo e-mail no cadastro do inquilino. Depois da liberação, entre novamente.</p>'+supportContactButton('Falar com o suporte')+
    '<button class="btn btn-ghost auth-btn" onclick="doSignOut()">Sair e usar outro e-mail</button></div></div>';
}
