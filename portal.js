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
      const p=(h.pagamentos||[]).find(function(x){return x.mes===cur;});
      const e=energiaDoMes(h,cur);
      return '<section class="portal-house-card">'+portalHouseTitle(h)+ 
        '<div class="portal-summary-grid">'+ 
          '<div class="portal-summary"><span>Aluguel</span><strong>'+fmtMoney(aluguelValorMes(h,cur))+'</strong><small>vence dia '+dueDayForMonth(cur,h.diaVencimento)+'</small></div>'+ 
          '<div class="portal-summary"><span>'+monthLabel(cur)+'</span><strong class="'+(p?'ok':'')+'">'+(p?'Pago':'Em aberto')+'</strong><small>'+(p?fmtDateBR(p.dataPagamento):'consulte o vencimento')+'</small></div>'+ 
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
      return '<section class="portal-house-card">'+portalHouseTitle(h)+ 
        '<div class="detail-grid">'+ 
          '<div class="detail-item"><span>Início</span><strong>'+fmtDateBR(h.contratoInicio)+'</strong></div>'+ 
          '<div class="detail-item"><span>Fim</span><strong>'+fmtDateBR(h.contratoFim)+'</strong></div>'+ 
          '<div class="detail-item"><span>Valor atual</span><strong class="num">'+fmtMoney(h.aluguelValor)+'</strong></div>'+ 
          '<div class="detail-item"><span>Vencimento</span><strong>Dia '+h.diaVencimento+'</strong></div>'+ 
        '</div>'+ 
      '</section>';
    }).join('');
}

function renderPortalPagamentos(){
  return '<div class="page-header"><div><div class="eyebrow">PAGAMENTOS E RECIBOS</div><h1 class="page-title">Histórico do aluguel</h1></div></div>'+ 
    state.houses.map(function(h){
      const months=[]; for(let i=0;i<12;i++) months.push(addMonths(currentMonthStr(),-i));
      return '<section class="portal-house-card">'+portalHouseTitle(h)+'<div class="ledger">'+months.map(function(mes){
        const p=(h.pagamentos||[]).find(function(x){return x.mes===mes;});
        const st=paymentStatus(h,mes);
        return '<div class="ledger-row"><div class="ledger-row-main">'+monthLabel(mes)+'<div class="ledger-row-sub">'+(p?'Pago em '+fmtDateBR(p.dataPagamento):(st==='futuro'?'Ainda não venceu':'Pagamento não registrado'))+'</div></div>'+ 
          '<div class="ledger-row-value num">'+fmtMoney(p?p.valorPago:aluguelValorMes(h,mes))+'</div>'+ 
          (p?'<button class="btn btn-ghost btn-sm" onclick="generateReceiptPDF(\''+h.id+'\',\''+mes+'\')">Recibo</button>':'<span class="status-dot '+esc(st)+'">'+(st==='atrasado'?'Atrasado':st==='futuro'?'Futuro':'Em aberto')+'</span>')+ 
        '</div>';
      }).join('')+'</div></section>';
    }).join('');
}

function renderPortalEnergia(){
  return '<div class="page-header"><div><div class="eyebrow">ENERGIA</div><h1 class="page-title">Consumo e pagamentos</h1></div></div>'+ 
    state.houses.map(function(h){
      const rows=(h.energias||[]).slice().sort(function(a,b){return b.mes.localeCompare(a.mes);});
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

