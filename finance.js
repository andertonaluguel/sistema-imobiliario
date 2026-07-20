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
    else if(p.status==='alugada'){
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
  const despesasAno = h.despesas.filter(function(e){ return e.data && e.data.slice(0,4)===String(year); });
  const despesasPorCategoria = {};
  despesasAno.forEach(function(e){ despesasPorCategoria[e.categoria] = (despesasPorCategoria[e.categoria]||0) + (Number(e.valor)||0); });
  const recebidoAno = h.pagamentos.filter(function(p){ return p.mes.slice(0,4)===String(year); }).reduce(function(s,p){ return s+(Number(p.valorPago)||0); },0);
  const energiaAno = (h.energias||[]).filter(function(e){ return e.pago && e.mes.slice(0,4)===String(year); }).reduce(function(s,e){ return s+(Number(e.valor)||0); },0);
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
    '<div class="ledger-row"><div class="ledger-row-main">Energia solar</div><div class="ledger-row-value num" style="color:var(--warn-deep)">'+fmtMoney(r.energiaAno)+'</div></div>'+
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
      '<div class="report-row-stat"><span class="report-label">Energia</span><span class="num" style="color:var(--warn-deep)">'+fmtMoney(r.energiaAno)+'</span></div>'+
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

function renderFinanceiroView(){
  const o = computeOverview();
  const chart = computeChartData12();
  const maxVal = Math.max(1, ...chart.map(function(c){ return c.recebido; }));
  const receitaAnual = o.receitaMensal*12;
  const tot = computeAnnualTotals(state.relatorioAno);
  return '<div class="page-header"><div>'+
      '<div class="eyebrow">FINANCEIRO</div>'+
      pageTitleWithIcon(financeIconSvg(), 'Receita das suas casas')+
      '<div class="page-sub">Resumo de '+monthLabel(currentMonthStr())+'</div>'+
    '</div></div>'+
    '<div class="stat-grid">'+
      '<div class="stat-card stat-brass"><div class="stat-label">Vou arrecadar este mês</div><div class="stat-value num">'+fmtMoney(o.receitaMensal)+'</div><div class="stat-sub">recebido até agora: '+fmtMoney(o.recebidoMes)+'</div></div>'+
      '<div class="stat-card"><div class="stat-label">Vou arrecadar este ano</div><div class="stat-value num">'+fmtMoney(receitaAnual)+'</div><div class="stat-sub">projeção com base no aluguel atual</div></div>'+
    '</div>'+
    '<div class="panel"><div class="panel-title">Recebido por mês (últimos 12 meses)</div>'+renderChartSimple(chart, maxVal)+'</div>'+
    '<div class="section-header">'+
      '<div class="page-title" style="font-size:18px;">Relatório anual por casa</div>'+
      '<div class="year-switcher"><button onclick="mudarAnoRelatorio(-1)" aria-label="Ano anterior">←</button><span class="num">'+state.relatorioAno+'</span><button onclick="mudarAnoRelatorio(1)" aria-label="Próximo ano">→</button></div>'+
    '</div>'+
    '<div class="stat-grid">'+
      statCard('Aluguel em '+state.relatorioAno, fmtMoney(tot.recebido), 'todas as casas', 'brass')+
      statCard('Energia em '+state.relatorioAno, fmtMoney(tot.energia), 'todas as casas', 'warn')+
      statCard('Despesas em '+state.relatorioAno, fmtMoney(tot.despesas), 'todas as casas', tot.despesas>0?'rust':null)+
      statCard('Saldo em '+state.relatorioAno, fmtMoney(tot.saldo), 'aluguel + energia − despesas', tot.saldo<0?'rust':'brass')+
    '</div>'+
    '<div class="panel panel-collapsible">'+
      '<button class="panel-toggle" onclick="toggleReportList()">'+
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
