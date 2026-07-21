/* ============================================================
   portal.js — área somente leitura do inquilino.
   A proteção real é feita no banco; esta tela só apresenta o recorte liberado.
   ============================================================ */

function setPortalTab(tab){ state.portalTab=tab; render(); window.scrollTo(0,0); }

function renderPortalNav(){
  const items=[['inicio','Início'],['contrato','Contrato'],['pagamentos','Pagamentos'],['energia','Energia'],['documentos','Arquivos']];
  return '<nav class="portal-nav">'+items.map(function(i){
    return '<button class="portal-nav-item'+(state.portalTab===i[0]?' active':'')+'" onclick="setPortalTab(\''+i[0]+'\')">'+esc(i[1])+'</button>';
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

function renderPortalInicio(){
  const cur=currentMonthStr();
  return '<div class="portal-welcome"><div class="eyebrow">VISÃO GERAL</div><h1>Tudo do seu aluguel em um só lugar</h1>'+
    '<p>Consulte contrato, pagamentos, recibos, energia e arquivos liberados.</p></div>'+
    state.houses.map(function(h){
      const contract=activeContract(h)||contractForMonth(h,cur);
      const p=contract?paymentForMonth(h,cur,contract.id):null;
      const e=contract?energiaDoMes(h,cur,contract.id):null;
      const prorata=contract?contractProrataValue(contract):0;
      const prorataPending=prorata>0&&!contract.proporcionalPago;
      const coversCurrent=contract&&contractCoversMonth(contract,cur);
      const nextFull=contract&&contractFirstFullMonth(contract);
      const shownDueMonth=coversCurrent?cur:(nextFull||cur);
      const cycleLabel=prorataPending?'Ajuste inicial':coversCurrent?monthLabel(cur):'Próximo aluguel';
      const cycleStatus=prorataPending?'Em aberto':p?'Pago':coversCurrent?'Em aberto':'Programado';
      const cycleSub=prorataPending?fmtMoney(prorata):p?fmtDateBR(p.dataPagamento):coversCurrent?'consulte o vencimento':(nextFull?'vence em '+monthLabel(nextFull):'aguarde o contrato');
      return '<section class="portal-house-card">'+portalHouseTitle(h)+
        '<div class="portal-summary-grid">'+
          '<div class="portal-summary"><span>Aluguel</span><strong>'+fmtMoney(contract?contract.valor:aluguelValorMes(h,cur))+'</strong><small>vence dia '+dueDayForMonth(shownDueMonth,contract?contractBillingDay(contract):h.diaVencimento)+'</small></div>'+
          '<div class="portal-summary"><span>'+cycleLabel+'</span><strong class="'+(p&&!prorataPending?'ok':'')+'">'+cycleStatus+'</strong><small>'+cycleSub+'</small></div>'+
          '<div class="portal-summary"><span>Energia</span><strong>'+(e?fmtMoney(e.valor):'Não lançada')+'</strong><small>'+(e?(e.pago?'paga':'em aberto'):'neste mês')+'</small></div>'+
        '</div>'+
        '<div class="quick-actions"><button class="btn btn-primary btn-sm" onclick="setPortalTab(\'pagamentos\')">Ver pagamentos</button>'+
          '<button class="btn btn-ghost btn-sm" onclick="setPortalTab(\'energia\')">Ver energia</button></div>'+
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
          '<div class="detail-item"><span>Valor atual</span><strong class="num">'+fmtMoney(contract.valor)+'</strong></div>'+
          '<div class="detail-item"><span>Vencimento</span><strong>'+esc(contractModeLabel(contract))+'</strong></div>'+
        '</div>'+
      '</section>';
    }).join('');
}

function renderPortalPagamentos(){
  return '<div class="page-header"><div><div class="eyebrow">PAGAMENTOS E RECIBOS</div><h1 class="page-title">Histórico do aluguel</h1></div></div>'+
    state.houses.map(function(h){
      const contract=activeContract(h)||(h.contracts||[])[0];
      if(!contract) return '';
      const cur=currentMonthStr(),first=contractFirstFullMonth(contract),last=contract.fim&&contract.fim.slice(0,7)<cur?contract.fim.slice(0,7):cur;
      const months=[];let m=last;while(first&&m>=first&&months.length<24){if(contractCoversMonth(contract,m))months.push(m);m=addMonths(m,-1);}
      const prorata=contractProrataValue(contract);
      return '<section class="portal-house-card">'+portalHouseTitle(h)+(prorata?'<div class="portal-initial-adjustment"><span>Ajuste inicial · '+contractProrataDays(contract)+' dias</span><strong class="num">'+fmtMoney(prorata)+'</strong><span class="status-dot '+(contract.proporcionalPago?'pago':'pendente')+'">'+(contract.proporcionalPago?'Pago':'Em aberto')+'</span></div>':'')+'<div class="ledger">'+months.map(function(mes){
        const p=paymentForMonth(h,mes,contract.id);
        const st=paymentStatus(h,mes,contract.id);
        return '<div class="ledger-row"><div class="ledger-row-main">'+monthLabel(mes)+'<div class="ledger-row-sub">'+(p?'Pago em '+fmtDateBR(p.dataPagamento):(st==='futuro'?'Ainda não venceu':'Pagamento não registrado'))+'</div></div>'+
          '<div class="ledger-row-value num">'+fmtMoney(p?p.valorPago:contract.valor)+'</div>'+
          (p?'<button class="btn btn-ghost btn-sm" onclick="generateReceiptPDF(\''+h.id+'\',\''+mes+'\',\''+contract.id+'\')">Recibo</button>':'<span class="status-dot '+esc(st)+'">'+(st==='atrasado'?'Atrasado':'Em aberto')+'</span>')+
        '</div>';
      }).join('')+'</div></section>';
    }).join('');
}

function renderPortalEnergia(){
  return '<div class="page-header"><div><div class="eyebrow">ENERGIA</div><h1 class="page-title">Consumo e pagamentos</h1></div></div>'+
    state.houses.map(function(h){
      const contract=activeContract(h)||(h.contracts||[])[0];
      const rows=(h.energias||[]).filter(function(e){return !contract||e.contractId===contract.id;}).slice().sort(function(a,b){return b.mes.localeCompare(a.mes);});
      return '<section class="portal-house-card">'+portalHouseTitle(h)+(rows.length?'<div class="ledger">'+rows.map(function(e){
        return '<div class="ledger-row"><div class="ledger-row-main">'+monthLabel(e.mes)+'<div class="ledger-row-sub">'+fmtMoney(e.valor)+(e.dataPagamento?' · pago em '+fmtDateBR(e.dataPagamento):'')+'</div></div>'+
          '<div class="ledger-row-value"><strong class="num">'+(Number(e.kwh)||0).toLocaleString('pt-BR')+' kWh</strong></div>'+
          '<span class="status-dot '+(e.pago?'pago':'pendente')+'">'+(e.pago?'Pago':'Em aberto')+'</span></div>';
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
  const body=state.portalTab==='contrato'?renderPortalContrato():
    state.portalTab==='pagamentos'?renderPortalPagamentos():
    state.portalTab==='energia'?renderPortalEnergia():
    state.portalTab==='documentos'?renderPortalDocumentos():renderPortalInicio();
  return '<div class="portal-shell">'+renderPortalHeader()+renderPortalNav()+'<main class="portal-main">'+body+'</main></div>';
}

function renderPendingAccess(){
  return '<div class="access-pending"><div class="auth-card"><div class="auth-brand">'+logoSvg()+'<span>Meu aluguel</span></div>'+
    '<h1 class="auth-title">Acesso ainda não liberado</h1>'+
    '<p class="auth-sub">Entre com o mesmo e-mail cadastrado pelo proprietário. Se esta é a primeira vez, peça a ele para liberar seu portal.</p>'+
    '<button class="btn btn-ghost auth-btn" onclick="doSignOut()">Sair e usar outro e-mail</button></div></div>';
}
