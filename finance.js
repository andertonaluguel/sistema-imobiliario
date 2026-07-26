/* ============================================================
   finance.js — Financeiro (receita, gráfico, relatório anual)
   Somente leitura: deriva tudo do estado em memória.
   ============================================================ */

/* linha do tempo de status do imóvel (vaga/alugada/manutenção) */
function buildStatusTimeline(h){
  const hist = (h.statusHistorico && h.statusHistorico.length)
    ? h.statusHistorico.slice().sort(function(a,b){ return a.data.localeCompare(b.data); })
    : [{ data: h.contratoInicio||todayISO(), status:h.status, tenantId:h.tenantId||'' }];
  const periods = [];
  for(let i=0;i<hist.length;i++){
    periods.push({
      inicio: hist[i].data,
      fim: (i<hist.length-1) ? addDaysISO(hist[i+1].data,-1) : null,
      status: hist[i].status,
      tenantId: hist[i].tenantId||''
    });
  }
  return periods;
}

function computeHouseAnnualReport(h, year){
  const yearStart = year+'-01-01';
  const yearEnd = year+'-12-31';
  const periods = buildStatusTimeline(h);
  let diasVago=0, diasManutencao=0;
  const contratosNoAno = [];
  if(periods.length && periods[0].inicio > yearStart){
    const gapEnd = (periods[0].inicio < yearEnd) ? addDaysISO(periods[0].inicio,-1) : yearEnd;
    if(yearStart <= gapEnd) diasVago += diffDaysInclusive(yearStart, gapEnd);
  }
  periods.forEach(function(p){
    const pEnd = p.fim || todayISO();
    const clipStart = (p.inicio < yearStart) ? yearStart : p.inicio;
    const clipEnd = (pEnd > yearEnd) ? yearEnd : pEnd;
    if(clipStart > clipEnd) return;
    const dias = diffDaysInclusive(clipStart, clipEnd);
    if(p.status==='vaga') diasVago += dias;
    else if(p.status==='manutencao') diasManutencao += dias;
    else if(p.status==='alugada'&&!(h.contracts||[]).length){
      const tenant = p.tenantId ? state.tenants.find(function(t){ return t.id===p.tenantId; }) : null;
      const recebidoPeriodo = h.pagamentos.filter(function(pg){
        return pg.mes >= clipStart.slice(0,7) && pg.mes <= clipEnd.slice(0,7);
      }).reduce(function(s,pg){ return s+(Number(pg.valorPago)||0); },0);
      contratosNoAno.push({
        tenantNome: tenant ? tenant.nome : 'Inquilino removido',
        inicio: clipStart, fim: clipEnd, ongoing: !p.fim,
        recebido: recebidoPeriodo
      });
    }
  });
  (h.contracts||[]).forEach(function(c){
    const cEnd=c.fim||todayISO(),clipStart=c.inicio<yearStart?yearStart:c.inicio,clipEnd=cEnd>yearEnd?yearEnd:cEnd;
    if(!c.inicio||clipStart>clipEnd) return;
    const tenant=contractTenant(c);
    const recebido=h.pagamentos.filter(function(pg){return pg.contractId===c.id&&pg.mes>=clipStart.slice(0,7)&&pg.mes<=clipEnd.slice(0,7);})
      .reduce(function(s,pg){return s+(Number(pg.valorPago)||0);},0)+(c.proporcionalPago&&c.inicio.slice(0,4)===String(year)?contractProrataValue(c):0);
    contratosNoAno.push({tenantNome:tenant?tenant.nome:'Inquilino removido',inicio:clipStart,fim:clipEnd,ongoing:!c.fim,recebido:recebido});
  });
  const despesasAno = h.despesas.filter(function(e){ return e.data && e.data.slice(0,4)===String(year); });
  const despesasPorCategoria = {};
  despesasAno.forEach(function(e){ despesasPorCategoria[e.categoria] = (despesasPorCategoria[e.categoria]||0) + (Number(e.valor)||0); });
  const recebidoAno = h.pagamentos.filter(function(p){ return p.mes.slice(0,4)===String(year); }).reduce(function(s,p){ return s+(Number(p.valorPago)||0); },0)+
    (h.contracts||[]).filter(function(c){return c.proporcionalPago&&c.inicio&&c.inicio.slice(0,4)===String(year);}).reduce(function(s,c){return s+contractProrataValue(c);},0);
  const energiaAno = houseEnergyEnabled(h)
    ? (h.energias||[]).filter(function(e){ return e.pago && e.mes.slice(0,4)===String(year); }).reduce(function(s,e){ return s+(Number(e.valor)||0); },0)
    : 0;
  const despesasTotal = despesasAno.reduce(function(s,e){ return s+(Number(e.valor)||0); },0);
  return {
    house:h, recebidoAno, energiaAno, despesasTotal, despesasPorCategoria,
    saldo: recebidoAno+energiaAno-despesasTotal,
    diasVago, diasManutencao, contratosNoAno
  };
}
function mudarAnoRelatorio(delta){ state.relatorioAno += delta; render(); }
function toggleReportHouse(houseId){
  state.expandedReportHouseId = (state.expandedReportHouseId===houseId) ? null : houseId;
  render();
}

function renderAnnualHouseDetail(r){
  const catKeys = Object.keys(r.despesasPorCategoria);
  const catRows = catKeys.length ? catKeys.map(function(cat){
    return '<div class="ledger-row"><div class="ledger-row-main">'+esc(cat)+'</div><div class="ledger-row-value num rust">'+fmtMoney(r.despesasPorCategoria[cat])+'</div></div>';
  }).join('') : '<div class="empty-state">Nenhuma despesa registrada neste ano.</div>';
  const periodRows = r.contratosNoAno.length ? r.contratosNoAno.map(function(c){
    return '<div class="ledger-row"><div class="ledger-row-main">'+esc(c.tenantNome)+
      '<div class="ledger-row-sub">'+fmtDateBR(c.inicio)+' a '+(c.ongoing?'atual':fmtDateBR(c.fim))+'</div></div>'+
      '<div class="ledger-row-value num brass">'+fmtMoney(c.recebido)+'</div></div>';
  }).join('') : '<div class="empty-state">Nenhum período de contrato neste ano.</div>';
  return '<div class="panel-body report-detail">'+
    '<div class="report-detail-title">Recebido no ano</div>'+
    '<div class="ledger-row"><div class="ledger-row-main">Aluguel</div><div class="ledger-row-value num brass">'+fmtMoney(r.recebidoAno)+'</div></div>'+
    (energyModuleEnabled()?'<div class="ledger-row"><div class="ledger-row-main">Energia</div><div class="ledger-row-value num" style="color:var(--warn-deep)">'+fmtMoney(r.energiaAno)+'</div></div>':'')+
    '<div class="report-detail-title" style="margin-top:14px;">Despesas por categoria</div>'+catRows+
    '<div class="report-detail-title" style="margin-top:14px;">Períodos de contrato no ano</div>'+periodRows+
    '<div class="report-detail-balance">Saldo do ano: <strong class="num '+(r.saldo<0?'rust':'brass')+'">'+fmtMoney(r.saldo)+'</strong></div>'+
  '</div>';
}
function renderAnnualHouseRow(h){
  const r = computeHouseAnnualReport(h, state.relatorioAno);
  const expanded = state.expandedReportHouseId === h.id;
  return '<div class="report-row-wrap">'+
    '<button class="report-row" onclick="toggleReportHouse(\''+h.id+'\')">'+
      '<div class="report-row-name">'+esc(h.nome)+'</div>'+
      '<div class="report-row-stat"><span class="report-label">Aluguel</span><span class="num brass">'+fmtMoney(r.recebidoAno)+'</span></div>'+
      (energyModuleEnabled()?'<div class="report-row-stat"><span class="report-label">Energia</span><span class="num" style="color:var(--warn-deep)">'+fmtMoney(r.energiaAno)+'</span></div>':'')+
      '<div class="report-row-stat"><span class="report-label">Despesas</span><span class="num rust">'+fmtMoney(r.despesasTotal)+'</span></div>'+
      '<div class="report-row-stat"><span class="report-label">Dias vago</span><span class="num">'+r.diasVago+'</span></div>'+
      '<div class="report-row-stat"><span class="report-label">Dias manutenção</span><span class="num">'+r.diasManutencao+'</span></div>'+
      '<span class="panel-chevron">'+(expanded?'▾':'▸')+'</span>'+
    '</button>'+
    (expanded ? renderAnnualHouseDetail(r) : '')+
  '</div>';
}
/* soma o ano (recebido, despesas, saldo) de todas as casas */
function computeAnnualTotals(year){
  let recebido=0, energia=0, despesas=0;
  state.houses.forEach(function(h){
    const r = computeHouseAnnualReport(h, year);
    recebido += r.recebidoAno;
    energia += r.energiaAno;
    despesas += r.despesasTotal;
  });
  return { recebido:recebido, energia:energia, despesas:despesas, saldo:recebido+energia-despesas };
}

function houseRentedInMonth(h,mes){
  if((h.contracts||[]).length) return h.contracts.some(function(c){
    const start=mes+'-01',end=addDaysISO(addMonths(mes,1)+'-01',-1),cEnd=c.fim||'9999-12-31';
    return c.inicio<=end&&cEnd>=start;
  });
  const start=mes+'-01', end=addDaysISO(addMonths(mes,1)+'-01',-1);
  return buildStatusTimeline(h).some(function(p){
    const pEnd=p.fim||todayISO();
    return p.status==='alugada' && p.inicio<=end && pEnd>=start;
  });
}

function computeMonthlyFinance(mes){
  const rows=state.houses.map(function(h){
    const contracts=(h.contracts||[]).filter(function(c){return contractCoversMonth(c,mes);});
    const expectedMonthly=contracts.length?contracts.reduce(function(s,c){return s+contractExpectedRent(c,mes);},0):(houseRentedInMonth(h,mes)?aluguelValorMes(h,mes):0);
    const expectedProrata=(h.contracts||[]).filter(function(c){return c.inicio&&c.inicio.slice(0,7)===mes;}).reduce(function(s,c){return s+contractProrataValue(c);},0);
    const expected=expectedMonthly+expectedProrata;
    const pays=(h.pagamentos||[]).filter(function(p){return p.mes===mes;});
    const energyRows=houseEnergyEnabled(h)?(h.energias||[]).filter(function(e){return e.mes===mes;}):[];
    const expenses=(h.despesas||[]).filter(function(e){return e.data&&e.data.slice(0,7)===mes;})
      .reduce(function(s,e){return s+(Number(e.valor)||0);},0);
    const receivedRent=pays.reduce(function(s,p){return s+(Number(p.valorPago)||0);},0)+(h.contracts||[]).filter(function(c){return c.inicio&&c.inicio.slice(0,7)===mes&&c.proporcionalPago;}).reduce(function(s,c){return s+contractProrataValue(c);},0);
    const energyBilled=energyRows.reduce(function(s,e){return s+(Number(e.valor)||0);},0);
    const energyReceived=energyRows.filter(function(e){return e.pago;}).reduce(function(s,e){return s+(Number(e.valor)||0);},0);
    return {house:h,expected:expected,receivedRent:receivedRent,energyBilled:energyBilled,
      energyReceived:energyReceived,expenses:expenses,
      balance:receivedRent+energyReceived-expenses,
      pending:Math.max(0,expected-receivedRent)+Math.max(0,energyBilled-energyReceived)};
  });
  return {rows:rows,expected:rows.reduce(function(s,r){return s+r.expected+r.energyBilled;},0),
    received:rows.reduce(function(s,r){return s+r.receivedRent+r.energyReceived;},0),
    expenses:rows.reduce(function(s,r){return s+r.expenses;},0),
    pending:rows.reduce(function(s,r){return s+r.pending;},0)};
}

function computeAgeing(){
  const buckets=[{label:'1–30 dias',value:0,count:0},{label:'31–60 dias',value:0,count:0},{label:'Mais de 60 dias',value:0,count:0}];
  state.houses.forEach(function(h){
    const c=computeCobrancaCasa(h); if(!c||c.tipo!=='atraso') return;
    const idx=c.dias<=30?0:c.dias<=60?1:2;
    buckets[idx].value+=c.total; buckets[idx].count++;
  });
  return buckets;
}

function moveFinanceMonth(delta){ state.financeMonth=addMonths(state.financeMonth||currentMonthStr(),delta); render(); }
function setFinanceMonth(value){ state.financeMonth=value||currentMonthStr(); render(); }

function downloadFinanceCsv(){
  const mes=state.financeMonth||currentMonthStr(), info=computeMonthlyFinance(mes);
  const rows=energyModuleEnabled()
    ? [['Imóvel','Aluguel previsto','Aluguel recebido','Energia lançada','Energia recebida','Despesas','Saldo','Pendente']]
    : [['Imóvel','Aluguel previsto','Aluguel recebido','Despesas','Saldo','Pendente']];
  info.rows.forEach(function(r){ rows.push(energyModuleEnabled()
    ? [r.house.nome,r.expected,r.receivedRent,r.energyBilled,r.energyReceived,r.expenses,r.balance,r.pending]
    : [r.house.nome,r.expected,r.receivedRent,r.expenses,r.balance,r.pending]); });
  rows.push(energyModuleEnabled()?['TOTAL',info.expected,info.received,0,0,info.expenses,info.received-info.expenses,info.pending]:['TOTAL',info.expected,info.received,info.expenses,info.received-info.expenses,info.pending]);
  const csv='\ufeff'+rows.map(function(row){return row.map(function(v){return '"'+String(v).replace(/"/g,'""')+'"';}).join(';');}).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a'); a.href=url; a.download='financeiro-'+mes+'.csv'; a.click(); URL.revokeObjectURL(url);
}

function downloadFinancePdf(){
  const mes=state.financeMonth||currentMonthStr(), info=computeMonthlyFinance(mes);
  const jsPDF=window.jspdf&&window.jspdf.jsPDF; if(!jsPDF){showToast('Gerador de PDF indisponível.','error');return;}
  const doc=new jsPDF(); let y=22;
  doc.setFontSize(18); doc.text('Resumo financeiro — '+monthLabel(mes),14,y); y+=11;
  doc.setFontSize(10); doc.text('Previsto: '+fmtMoney(info.expected)+'  |  Recebido: '+fmtMoney(info.received)+'  |  Despesas: '+fmtMoney(info.expenses),14,y); y+=12;
  info.rows.forEach(function(r){
    if(y>275){doc.addPage();y=20;}
    doc.setFontSize(11); doc.text(r.house.nome,14,y); doc.setFontSize(9);
    doc.text('Previsto '+fmtMoney(r.expected+r.energyBilled)+' | Recebido '+fmtMoney(r.receivedRent+r.energyReceived)+' | Despesas '+fmtMoney(r.expenses)+' | Saldo '+fmtMoney(r.balance),14,y+5); y+=13;
  });
  doc.save('financeiro-'+mes+'.pdf');
}

function renderMonthlyFinanceTable(info){
  return '<div class="finance-table">'+info.rows.map(function(r){
    const t=tenantOf(r.house);
    return '<button class="finance-row" onclick="openHouse(\''+r.house.id+'\',\'pagamentos\')">'+
      '<div class="finance-house"><strong>'+esc(r.house.nome)+'</strong><span>'+esc(t?t.nome:'Sem inquilino')+'</span></div>'+
      '<div><span>Previsto</span><strong class="num">'+fmtMoney(r.expected+r.energyBilled)+'</strong></div>'+
      '<div><span>Recebido</span><strong class="num brass">'+fmtMoney(r.receivedRent+r.energyReceived)+'</strong></div>'+
      '<div><span>Despesas</span><strong class="num rust">'+fmtMoney(r.expenses)+'</strong></div>'+
      '<div><span>Saldo</span><strong class="num '+(r.balance<0?'rust':'')+'">'+fmtMoney(r.balance)+'</strong></div>'+
      '<span class="status-dot '+(r.pending?'atrasado':'pago')+'">'+(r.pending?'Falta '+fmtMoney(r.pending):'Em dia')+'</span>'+
    '</button>';
  }).join('')+'</div>';
}

function renderFinanceiroView(){
  const mes=state.financeMonth||currentMonthStr();
  const month=computeMonthlyFinance(mes), ageing=computeAgeing();
  const chart = computeChartData12();
  const maxVal = Math.max(1, ...chart.map(function(c){ return c.recebido; }));
  const tot = computeAnnualTotals(state.relatorioAno);
  return '<div class="page-header"><div>'+
      '<div class="eyebrow">FINANCEIRO</div>'+
      pageTitleWithIcon(financeIconSvg(), 'Gestão financeira')+
      '<div class="page-sub">Receitas, despesas, saldo e inadimplência.</div>'+
    '</div><div class="header-actions"><button class="btn btn-ghost btn-sm" onclick="downloadFinanceCsv()">Exportar planilha</button>'+
      '<button class="btn btn-ghost btn-sm" onclick="downloadFinancePdf()">Resumo PDF</button></div></div>'+
    '<div class="section-header"><div><h2 class="section-title">Fechamento mensal</h2></div>'+
      '<div class="month-switcher"><button onclick="moveFinanceMonth(-1)">←</button><input type="month" value="'+esc(mes)+'" onchange="setFinanceMonth(this.value)"><button onclick="moveFinanceMonth(1)">→</button></div></div>'+
    '<div class="stat-grid">'+
      statCard('Previsto',fmtMoney(month.expected),energyModuleEnabled()?'aluguel + energia':'aluguéis','brass')+
      statCard('Recebido',fmtMoney(month.received),month.expected?Math.round(month.received/month.expected*100)+'% do previsto':'sem previsão',null)+
      statCard('Despesas',fmtMoney(month.expenses),'lançadas no mês',month.expenses?'rust':null)+
      statCard('Saldo líquido',fmtMoney(month.received-month.expenses),'recebido − despesas',month.received-month.expenses<0?'rust':'brass')+
    '</div>'+
    '<div class="panel"><div class="panel-title">Resultado por imóvel</div>'+renderMonthlyFinanceTable(month)+'</div>'+
    '<div class="panel"><div class="panel-title">Pendências por tempo de atraso</div><div class="ageing-grid">'+ageing.map(function(b){return '<div class="ageing-card"><span>'+b.label+'</span><strong class="num">'+fmtMoney(b.value)+'</strong><small>'+b.count+' imóvel(is)</small></div>';}).join('')+'</div></div>'+
    '<div class="panel"><div class="panel-title">Recebido por mês (últimos 12 meses)</div>'+renderChartSimple(chart, maxVal)+'</div>'+
    '<div class="section-header">'+
      '<div class="page-title" style="font-size:18px;">Relatório anual por casa</div>'+
      '<div class="year-switcher"><button onclick="mudarAnoRelatorio(-1)" aria-label="Ano anterior">←</button><span class="num">'+state.relatorioAno+'</span><button onclick="mudarAnoRelatorio(1)" aria-label="Próximo ano">→</button></div>'+
    '</div>'+
    '<div class="stat-grid">'+
      statCard('Aluguel em '+state.relatorioAno, fmtMoney(tot.recebido), 'todas as casas', 'brass')+
      (energyModuleEnabled()?statCard('Energia em '+state.relatorioAno, fmtMoney(tot.energia), 'todas as casas', 'warn'):'')+
      statCard('Despesas em '+state.relatorioAno, fmtMoney(tot.despesas), 'todas as casas', tot.despesas>0?'rust':null)+
      statCard('Saldo em '+state.relatorioAno, fmtMoney(tot.saldo), energyModuleEnabled()?'aluguel + energia − despesas':'aluguel − despesas', tot.saldo<0?'rust':'brass')+
    '</div>'+
    '<div class="panel panel-collapsible">'+
      '<button class="panel-toggle" aria-expanded="'+(state.reportListExpanded?'true':'false')+'" onclick="toggleReportList()">'+
        '<span class="panel-title-inline">Detalhe por casa'+(state.houses.length?'<span class="alert-badge badge-neutral">'+state.houses.length+'</span>':'')+'</span>'+
        '<span class="panel-chevron">'+(state.reportListExpanded?'▾':'▸')+'</span>'+
      '</button>'+
      (state.reportListExpanded
        ? '<div class="panel-body">'+
            '<p class="modal-text" style="margin-bottom:14px;">Clique numa casa para ver despesas por categoria e os períodos de contrato no ano.</p>'+
            (state.houses.length===0
              ? '<div class="empty-state">Nenhuma casa para relatar ainda.</div>'
              : '<div class="annual-report">'+state.houses.map(renderAnnualHouseRow).join('')+'</div>')+
          '</div>'
        : '');
}
