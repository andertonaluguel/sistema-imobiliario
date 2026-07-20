/* ============================================================
   dashboard.js — Painel (resumo, gráfico, alertas, movimentações)
   ============================================================ */

/* situação de cobrança de UMA casa alugada:
   - 'atraso': há meses vencidos e não pagos (dívida acumulada desde o contrato)
   - 'proximo': mês corrente não pago, ainda não venceu, mas falta 7 dias ou menos
   - null: nada a cobrar agora */
function computeCobrancaCasa(h){
  if(h.status!=='alugada') return null;
  const cur = currentMonthStr();
  const diaVenc = h.diaVencimento||5;
  const hoje = new Date();
  const hojeDia = hoje.getDate();
  const inicio = h.contratoInicio ? h.contratoInicio.slice(0,7) : null;
  // aluguel: meses vencidos e não pagos (do contrato até agora)
  const mesesAtraso = [];
  for(let i=0;i<24;i++){
    const mes = addMonths(cur, -i);
    if(inicio && mes < inicio) break;
    if(h.pagamentos.find(function(p){ return p.mes===mes; })) continue;
    let vencido;
    if(mes < cur) vencido = true;                 // mês passado: já venceu
    else if(mes===cur) vencido = hojeDia >= diaVenc; // mês atual: vence no dia (chegou o dia => atraso)
    else vencido = false;
    if(vencido) mesesAtraso.push(mes);
  }
  mesesAtraso.sort();
  // energia: meses lançados, vencidos e não pagos (valor variável)
  const energiaMeses = [];
  let energiaTotal = 0;
  for(let i=0;i<24;i++){
    const mes = addMonths(cur, -i);
    if(inicio && mes < inicio) break;
    if(energiaStatus(h, mes)==='atrasado'){ energiaMeses.push(mes); energiaTotal += energiaValorMes(h, mes); }
  }
  energiaMeses.sort();
  const aluguelTotal = (Number(h.aluguelValor)||0)*mesesAtraso.length;

  if(mesesAtraso.length || energiaMeses.length){
    // dias de atraso contados do vencimento mais antigo (entre aluguel e energia)
    const refMes = (mesesAtraso[0] && energiaMeses[0])
      ? (mesesAtraso[0]<energiaMeses[0]?mesesAtraso[0]:energiaMeses[0])
      : (mesesAtraso[0]||energiaMeses[0]);
    const p0 = refMes.split('-').map(Number);
    const due0 = new Date(p0[0], p0[1]-1, diaVenc);
    const dias = Math.max(0, Math.round((hoje - due0)/86400000));
    return { houseId:h.id, tipo:'atraso', meses:mesesAtraso, aluguelTotal:aluguelTotal,
      energiaMeses:energiaMeses, energiaTotal:energiaTotal, total:aluguelTotal+energiaTotal, dias:dias };
  }
  // próximo do vencimento (mês atual ainda no prazo, faltando 7 dias ou menos)
  if(!h.pagamentos.find(function(p){ return p.mes===cur; }) && (!inicio || cur>=inicio)){
    const diasAteVenc = diaVenc - hojeDia;
    if(diasAteVenc>=1 && diasAteVenc<=7){
      const enerPend = energiaStatus(h,cur)==='pendente' ? energiaValorMes(h,cur) : 0;
      return { houseId:h.id, tipo:'proximo', meses:[cur], aluguelTotal:Number(h.aluguelValor)||0,
        energiaMeses:enerPend?[cur]:[], energiaTotal:enerPend, total:(Number(h.aluguelValor)||0)+enerPend, dias:diasAteVenc };
    }
  }
  return null;
}

function computeOverview(){
  const cur = currentMonthStr();
  const today = new Date();
  let receitaMensal=0, recebidoMes=0, energiaMes=0, energiaRecebida=0;
  let alugadas=0, vagas=0, manutencao=0;
  const cobrancas=[], contratosVencendo=[], manutList=[];

  state.houses.forEach(function(h){
    if(h.status==='alugada'){
      alugadas++;
      receitaMensal += Number(h.aluguelValor)||0;
      const recCur = h.pagamentos.find(function(p){ return p.mes===cur; });
      if(recCur) recebidoMes += Number(recCur.valorPago)||0;
      energiaMes += energiaValorMes(h, cur);
      if(energiaPagaMes(h, cur)) energiaRecebida += energiaValorMes(h, cur);
      const cob = computeCobrancaCasa(h);
      if(cob) cobrancas.push(cob);
      if(h.contratoFim){
        const fim = new Date(h.contratoFim+'T00:00:00');
        const dias = Math.round((fim-today)/86400000);
        if(dias<=60) contratosVencendo.push({ houseId:h.id, dias:dias });
      }
    } else if(h.status==='vaga'){ vagas++; }
    else if(h.status==='manutencao'){ manutencao++; manutList.push(h); }
  });
  // atrasados antes (mais dias) e depois os próximos (vence antes primeiro)
  cobrancas.sort(function(a,b){
    if(a.tipo!==b.tipo) return a.tipo==='atraso' ? -1 : 1;
    return a.tipo==='atraso' ? (b.dias-a.dias) : (a.dias-b.dias);
  });

  return {
    receitaMensal, recebidoMes, faltaReceber: Math.max(0, receitaMensal-recebidoMes),
    energiaMes, energiaRecebida, totalMes: receitaMensal+energiaMes,
    alugadas, vagas, manutencao,
    cobrancas,
    nAtraso: cobrancas.filter(function(c){ return c.tipo==='atraso'; }).length,
    nProximo: cobrancas.filter(function(c){ return c.tipo==='proximo'; }).length,
    contratosVencendo, manutList
  };
}

function computeChartData12(){
  const cur = currentMonthStr();
  const months = [];
  for(let i=11;i>=0;i--) months.push(addMonths(cur,-i));
  return months.map(function(mes){
    let recebido=0;
    state.houses.forEach(function(h){
      const rec = h.pagamentos.find(function(p){ return p.mes===mes; });
      if(rec) recebido += Number(rec.valorPago)||0;
    });
    return { mes, recebido };
  });
}

// Últimas movimentações: pagamentos e despesas mais recentes por data
function computeRecentes(limit){
  const movs = [];
  state.houses.forEach(function(h){
    h.pagamentos.forEach(function(p){
      if(p.dataPagamento) movs.push({ tipo:'pag', data:p.dataPagamento, valor:Number(p.valorPago)||0,
        texto:'Aluguel '+monthLabel(p.mes)+' · '+h.nome });
    });
    h.despesas.forEach(function(e){
      if(e.data) movs.push({ tipo:'desp', data:e.data, valor:Number(e.valor)||0,
        texto:e.descricao+' · '+h.nome });
    });
  });
  movs.sort(function(a,b){ return b.data.localeCompare(a.data); });
  return movs.slice(0, limit||6);
}

/* abrevia valor para caber sobre as barras: 500 -> R$500, 4500 -> R$4,5k */
function abbrevBRL(n){
  n = Number(n)||0;
  if(n>=1000){ var v=n/1000; return 'R$'+(v%1===0?String(v):v.toFixed(1).replace('.',','))+'k'; }
  return 'R$'+Math.round(n);
}
function renderChartSimple(chart, maxVal){
  const W=600, H=210, groupW=W/chart.length, barW=Math.min(24, groupW-12), baseY=H-26, topPad=26;
  const curMes = currentMonthStr();
  const gridMid = topPad+(baseY-topPad)/2;
  const grid =
    '<line x1="0" y1="'+baseY+'" x2="'+W+'" y2="'+baseY+'" stroke="var(--line)" stroke-width="1"/>'+
    '<line x1="0" y1="'+gridMid+'" x2="'+W+'" y2="'+gridMid+'" stroke="var(--line)" stroke-width="1" stroke-dasharray="2 5" opacity="0.7"/>';
  const bars = chart.map(function(c,i){
    const gx = i*groupW + groupW/2;
    const temValor = c.recebido>0;
    const hh = temValor ? Math.max(4, Math.round((c.recebido/maxVal)*(baseY-topPad))) : 3;
    const isCur = c.mes===curMes;
    const fill = temValor ? (isCur?'var(--brass-deep)':'var(--brass)') : 'var(--line)';
    const barTop = baseY-hh;
    const valLabel = temValor
      ? '<text x="'+gx+'" y="'+(barTop-5)+'" text-anchor="middle" class="chart-val'+(isCur?' chart-val-cur':'')+'">'+abbrevBRL(c.recebido)+'</text>'
      : '';
    return '<g>'+
      '<rect x="'+(gx-barW/2)+'" y="'+barTop+'" width="'+barW+'" height="'+hh+'" rx="3" style="fill:'+fill+'"/>'+
      valLabel+
      '<text x="'+gx+'" y="'+(H-8)+'" text-anchor="middle" class="chart-label'+(isCur?' chart-label-cur':'')+'">'+monthLabel(c.mes).split('/')[0]+'</text>'+
    '</g>';
  }).join('');
  return '<svg viewBox="0 0 '+W+' '+H+'" class="chart-svg" role="img" aria-label="Recebido por mês nos últimos 12 meses">'+grid+bars+'</svg>'+
    '<div class="chart-legend"><span class="dot"></span>Recebido por mês · <span class="chart-cur-note">mês atual destacado</span></div>';
}

/* reduz a fonte do valor só o necessário para caber no card (qualquer valor) */
function fitStatValues(){
  if(typeof document==='undefined' || !document.querySelectorAll) return;
  const els = document.querySelectorAll('.stat-value');
  for(let i=0;i<els.length;i++){
    const el = els[i];
    el.style.fontSize = '';
    let size = parseFloat((window.getComputedStyle ? window.getComputedStyle(el).fontSize : '')) || 25;
    let guard = 0;
    while(el.scrollWidth > el.clientWidth + 0.5 && size > 12 && guard < 40){
      size -= 1;
      el.style.fontSize = size + 'px';
      guard++;
    }
  }
}
if(typeof window!=='undefined' && window.addEventListener){
  let _fitTimer;
  window.addEventListener('resize', function(){
    clearTimeout(_fitTimer);
    _fitTimer = setTimeout(fitStatValues, 120);
  });
  if(typeof document!=='undefined' && document.fonts && document.fonts.ready && document.fonts.ready.then){
    document.fonts.ready.then(function(){ fitStatValues(); });
  }
}

function statCard(label, value, sub, tone){
  return '<div class="stat-card'+(tone?(' stat-'+tone):'')+'">'+
    '<div class="stat-label">'+label+'</div>'+
    '<div class="stat-value num">'+value+'</div>'+
    (sub?'<div class="stat-sub">'+sub+'</div>':'')+'</div>';
}

function countAlerts(o){
  return o.cobrancas.length;
}
function renderAlerts(o){
  const items = [];
  o.cobrancas.forEach(function(g){
    const h = state.houses.find(function(x){ return x.id===g.houseId; });
    const t = tenantOf(h);
    const btn = (t && t.telefone)
      ? '<button class="btn-cobrar" onclick="event.stopPropagation();cobrarAlerta(\''+g.houseId+'\')" title="Cobrar no WhatsApp">'+FICO.phone+'<span>Cobrar</span></button>'
      : '';
    const temAluguel = g.meses.length>0;
    const temEnergia = g.energiaMeses && g.energiaMeses.length>0;
    if(g.tipo==='atraso'){
      const partes = [];
      if(temAluguel) partes.push(g.meses.length===1 ? ('aluguel de '+monthLabel(g.meses[0])) : (g.meses.length+' meses de aluguel'));
      if(temEnergia) partes.push(g.energiaMeses.length===1 ? ('energia de '+monthLabel(g.energiaMeses[0])) : (g.energiaMeses.length+' de energia'));
      const txt = partes.join(' + ')+' — atrasado há '+g.dias+' dia(s)';
      items.push('<div class="alert-row alert-atraso" onclick="openHouse(\''+g.houseId+'\',\''+(temAluguel?'pagamentos':'energia')+'\')">'+
        '<span class="chip">ATRASADO</span>'+
        '<div class="ledger-row-main">'+esc(h.nome)+' — '+txt+'</div>'+
        btn+
        '<div class="ledger-row-value num rust">'+fmtMoney(g.total)+'</div></div>');
    } else {
      const extra = temEnergia ? ' + energia' : '';
      items.push('<div class="alert-row alert-proximo" onclick="openHouse(\''+g.houseId+'\',\'pagamentos\')">'+
        '<span class="chip">PRÓXIMO</span>'+
        '<div class="ledger-row-main">'+esc(h.nome)+' — aluguel'+extra+' vence em '+g.dias+' dia(s) ('+monthLabel(g.meses[0])+')</div>'+
        btn+
        '<div class="ledger-row-value num warn">'+fmtMoney(g.total)+'</div></div>');
    }
  });
  if(!items.length) return '<div class="empty-state">Tudo certo por aqui — nenhuma cobrança ou pendência no momento.</div>';
  return items.join('');
}

function renderRecentes(){
  const recs = computeRecentes(6);
  if(!recs.length) return '<div class="empty-state">Sem movimentações registradas ainda.</div>';
  return '<div class="ledger">'+recs.map(function(m){
    const cls = m.tipo==='pag' ? 'brass' : 'rust';
    const sign = m.tipo==='pag' ? '+' : '−';
    const chip = m.tipo==='pag' ? '<span class="chip chip-brass">RECEBIDO</span>' : '<span class="chip chip-rust">DESPESA</span>';
    return '<div class="ledger-row">'+chip+
      '<div class="ledger-row-main">'+esc(m.texto)+'<div class="ledger-row-sub">'+fmtDateBR(m.data)+'</div></div>'+
      '<div class="ledger-row-value num '+cls+'">'+sign+' '+fmtMoney(m.valor)+'</div></div>';
  }).join('')+'</div>';
}

function renderDashboard(){
  const o = computeOverview();

  return '<div class="page-header"><div>'+
      '<div class="eyebrow">PAINEL</div>'+
      pageTitleWithIcon(dashIconSvg(), 'Olá!')+
      '<div class="page-sub">Resumo de '+monthLabel(currentMonthStr())+'</div>'+
    '</div><div class="page-date">'+fmtDateBR(todayISO())+'</div></div>'+

    '<div class="stat-grid">'+
      statCard('Aluguel do mês', fmtMoney(o.receitaMensal), 'projeção pelo aluguel atual', 'brass')+
      statCard('Energia do mês', fmtMoney(o.energiaMes), 'lançado neste mês', 'warn')+
      statCard('Total do mês', fmtMoney(o.totalMes), 'aluguel + energia', 'brass')+
      statCard('Recebido', fmtMoney(o.recebidoMes + o.energiaRecebida), 'aluguel + energia até agora', null)+
    '</div>'+

    '<div class="stat-grid stat-grid-mini">'+
      statCard('Falta receber', fmtMoney(o.faltaReceber), o.nAtraso+' em atraso', o.faltaReceber>0?'rust':null)+
      statCard('Alugadas', o.alugadas, '', 'brass')+
      statCard('Vagas', o.vagas, '', 'slate')+
      statCard('Manutenção', o.manutencao, '', 'manut')+
    '</div>'+

    '<div class="panel panel-collapsible">'+
      '<button class="panel-toggle" onclick="toggleAlerts()">'+
        '<span class="panel-title-inline">Alertas'+(countAlerts(o)>0?'<span class="alert-badge">'+countAlerts(o)+'</span>':'')+'</span>'+
        '<span class="panel-chevron">'+(state.alertsExpanded?'▾':'▸')+'</span>'+
      '</button>'+
      (state.alertsExpanded ? '<div class="panel-body">'+renderAlerts(o)+'</div>' : '')+
    '</div>'+

    '<div class="panel panel-collapsible">'+
      '<button class="panel-toggle" onclick="toggleMovs()">'+
        '<span class="panel-title-inline">Últimas movimentações</span>'+
        '<span class="panel-chevron">'+(state.movsExpanded?'▾':'▸')+'</span>'+
      '</button>'+
      (state.movsExpanded ? '<div class="panel-body">'+renderRecentes()+'</div>' : '')+
    '</div>';
}
