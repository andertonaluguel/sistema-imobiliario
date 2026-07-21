/* ============================================================
   energy.js — visão central de energia de todos os imóveis.
   ============================================================ */

function setEnergyMonth(value){ state.energiaMes=value||currentMonthStr(); render(); }
function moveEnergyMonth(delta){ state.energiaMes=addMonths(state.energiaMes||currentMonthStr(),delta); render(); }

function computeEnergyMonth(mes){
  const rows=state.houses.map(function(h){
    const e=energiaDoMes(h,mes);
    return {house:h,entry:e,valor:e?Number(e.valor)||0:0,kwh:e?Number(e.kwh)||0:0,pago:!!(e&&e.pago)};
  });
  return {
    rows:rows,
    lancado:rows.reduce(function(s,r){return s+r.valor;},0),
    recebido:rows.reduce(function(s,r){return s+(r.pago?r.valor:0);},0),
    kwh:rows.reduce(function(s,r){return s+r.kwh;},0),
    pendentes:rows.filter(function(r){return r.entry&&!r.pago;}).length
  };
}

function renderEnergyTrend(){
  const months=[];
  for(let i=11;i>=0;i--){
    const mes=addMonths(state.energiaMes||currentMonthStr(),-i), info=computeEnergyMonth(mes);
    months.push({mes:mes,kwh:info.kwh,valor:info.lancado});
  }
  const max=Math.max(1,...months.map(function(x){return x.kwh;}));
  return '<div class="energy-chart">'+months.map(function(x){
    const pct=Math.max(3,Math.round(x.kwh/max*100));
    return '<button class="energy-column" onclick="setEnergyMonth(\''+x.mes+'\')" title="'+monthLabel(x.mes)+': '+x.kwh+' kWh"><span class="energy-bar" style="height:'+pct+'%"></span><small>'+monthLabel(x.mes).split('/')[0].slice(0,3)+'</small></button>';
  }).join('')+'</div>';
}

function renderEnergiaView(){
  const mes=state.energiaMes||currentMonthStr(), info=computeEnergyMonth(mes);
  const active=info.rows.filter(function(r){return r.house.status==='alugada'||r.entry;});
  return '<div class="page-header"><div><div class="eyebrow">ENERGIA</div>'+pageTitleWithIcon(financeIconSvg(),'Energia dos imóveis')+
      '<p class="page-sub">Lançamentos, consumo e recebimentos em uma visão separada.</p></div>'+ 
      '<div class="month-switcher"><button onclick="moveEnergyMonth(-1)" aria-label="Mês anterior">←</button>'+ 
        '<input type="month" value="'+esc(mes)+'" onchange="setEnergyMonth(this.value)"><button onclick="moveEnergyMonth(1)" aria-label="Próximo mês">→</button></div></div>'+ 
    '<div class="stat-grid energy-stats">'+ 
      statCard('Lançado',fmtMoney(info.lancado),monthLabel(mes),'warn')+ 
      statCard('Recebido',fmtMoney(info.recebido),info.lancado?Math.round(info.recebido/info.lancado*100)+'% do lançado':'sem lançamentos','brass')+ 
      statCard('Consumo',info.kwh.toLocaleString('pt-BR')+' kWh','todos os imóveis',null)+ 
      statCard('Pendências',String(info.pendentes),info.pendentes===1?'casa em aberto':'casas em aberto',info.pendentes?'rust':null)+ 
    '</div>'+ 
    '<div class="panel"><div class="panel-title">Consumo nos últimos 12 meses</div>'+renderEnergyTrend()+'</div>'+ 
    '<div class="section-header"><div><h2 class="section-title">Imóveis em '+monthLabel(mes)+'</h2><p class="page-sub">Clique em uma linha para lançar ou editar.</p></div>'+ 
      '<button class="btn btn-primary btn-sm" onclick="openFirstEnergyModal()">+ Novo lançamento</button></div>'+ 
    '<div class="panel energy-table">'+(active.length?active.map(function(r){
      const t=tenantOf(r.house);
      return '<button class="energy-row" onclick="openEnergiaModalFromView(\''+r.house.id+'\',\''+mes+'\')">'+ 
        '<div class="energy-house"><strong>'+esc(r.house.nome)+'</strong><span>'+esc(t?t.nome:(r.house.status==='vaga'?'Casa vaga':'Sem inquilino'))+'</span></div>'+ 
        '<div><span class="table-label">Consumo</span><strong class="num">'+(r.entry?r.kwh.toLocaleString('pt-BR')+' kWh':'—')+'</strong></div>'+ 
        '<div><span class="table-label">Valor</span><strong class="num">'+(r.entry?fmtMoney(r.valor):'Não lançado')+'</strong></div>'+ 
        '<span class="status-dot '+(!r.entry?'neutral':r.pago?'pago':'pendente')+'">'+(!r.entry?'Sem lançamento':r.pago?'Pago':'Em aberto')+'</span>'+ 
      '</button>';
    }).join(''):emptyState('Nenhum imóvel para exibir neste mês.',financeIconSvg()))+'</div>';
}

function openEnergiaModalFromView(houseId,mes){ openEnergiaModal(houseId,mes); }
function openFirstEnergyModal(){
  const h=state.houses.find(function(x){return x.status==='alugada';})||state.houses[0];
  if(!h){showToast('Cadastre uma casa primeiro.','error');return;}
  openEnergiaModal(h.id,state.energiaMes||currentMonthStr());
}

