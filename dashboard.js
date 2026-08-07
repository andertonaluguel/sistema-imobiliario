/* ============================================================
   dashboard.js — Painel (resumo, gráfico, alertas, movimentações)
   ============================================================ */

/* Situação de cobrança de UMA casa alugada:
   - 'atraso': o vencimento passou há mais de 5 dias corridos;
   - 'tolerancia': venceu há no máximo 5 dias, sem multa nem juros;
   - 'proximo': ainda não venceu, mas faltam 7 dias ou menos;
   - null: nada a cobrar agora */
function computeCobrancaCasa(h){
  if(h.status!=='alugada') return null;
  const contract=activeContract(h);
  if(!contract) return null;
  const cur = currentMonthStr();
  const diaVenc = contractBillingDay(contract);
  const hoje = new Date();
  const hojeDia = hoje.getDate();
  const inicio = contractFirstFullMonth(contract);
  const TOLERANCIA_DIAS=typeof paymentGraceDays==='function'?paymentGraceDays(contract):5;
  const hoje0 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const aluguelPendentePorMes={};
  function diasDepoisDoVencimento(data){
    const venc=new Date(data);
    venc.setHours(0,0,0,0);
    return Math.floor((hoje0-venc)/86400000);
  }
  // Aluguel: separa tolerância de atraso real, inclusive na virada do mês.
  const mesesAtraso = [];
  const mesesTolerancia = [];
  for(let i=0;i<24;i++){
    const mes = addMonths(cur, -i);
    if(inicio && mes < inicio) break;
    if(!contractCoversMonth(contract,mes)) continue;
    const rentStatus=paymentStatus(h,mes,contract.id);
    if(rentStatus==='pago'||rentStatus==='pago_atraso'||rentStatus==='credito'||rentStatus==='sem_cobranca') continue;
    const charge=chargeForMonth(h,mes,'aluguel',contract.id);
    const expected=charge?Math.max(0,Number(charge.valorPrevisto)||0):contractExpectedRent(contract,mes);
    const received=charge?chargeReceivedTotal(h,charge):0;
    aluguelPendentePorMes[mes]=Math.max(0,expected-received);
    if(aluguelPendentePorMes[mes]<=0) continue;
    const diasPassados=diasDepoisDoVencimento(dueDateForMonth(mes,diaVenc));
    if(diasPassados>TOLERANCIA_DIAS) mesesAtraso.push(mes);
    else if(diasPassados>0) mesesTolerancia.push(mes);
  }
  mesesAtraso.sort();
  mesesTolerancia.sort();
  // Energia segue a mesma tolerância visual do aluguel neste painel.
  const energiaAtraso = [];
  const energiaTolerancia = [];
  let energiaTotal = 0;
  if(houseEnergyEnabled(h)){
    for(let i=0;i<24;i++){
      const mes = addMonths(cur, -i);
      if(inicio && mes < inicio) break;
      let statusEnergia=energiaStatus(h,mes,contract.id);
      const energyEntry=energiaDoMes(h,mes,contract.id);
      if(statusEnergia==='parcial'){
        statusEnergia=openChargeTimeStatus(energyDueDate(h,energyEntry,mes),TOLERANCIA_DIAS);
      }
      if(statusEnergia!=='atrasado'&&statusEnergia!=='tolerancia') continue;
      if(statusEnergia==='atrasado') energiaAtraso.push(mes);
      else energiaTolerancia.push(mes);
      energiaTotal+=Math.max(0,energiaValorMes(h,mes,contract.id)-energiaRecebidaMes(h,mes,contract.id));
    }
  }
  energiaAtraso.sort();
  energiaTolerancia.sort();
  const mesesPendentes=mesesAtraso.concat(mesesTolerancia).sort();
  const energiaMeses=energiaAtraso.concat(energiaTolerancia).sort();
  const aluguelTotal = mesesPendentes.reduce(function(total, mes){
    return total + (aluguelPendentePorMes[mes]||contractExpectedRent(contract,mes));
  }, 0);

  const proporcionalState=contractProrataFinancialSnapshot(h,contract);
  const proporcionalPendente=proporcionalState.expected>0&&proporcionalState.remaining>0;
  const proporcionalDias=proporcionalPendente
    ? diasDepoisDoVencimento(new Date(contract.inicio+'T00:00:00'))
    : 0;
  const proporcionalAtrasado=proporcionalPendente&&proporcionalState.status==='atrasado';
  const proporcionalTolerancia=proporcionalPendente&&proporcionalState.status==='tolerancia';

  if(mesesPendentes.length || energiaMeses.length || proporcionalTolerancia || proporcionalAtrasado){
    const temAtraso=mesesAtraso.length||energiaAtraso.length||proporcionalAtrasado;
    // Dias contados do vencimento real mais antigo. Energia pode
    // vencer em um dia diferente do aluguel.
    const dueCandidates=[];
    if(mesesPendentes[0]) dueCandidates.push(dueDateForMonth(mesesPendentes[0],diaVenc));
    if(energiaMeses[0]){
      const energyEntry=energiaDoMes(h,energiaMeses[0],contract.id);
      dueCandidates.push(energyDueDate(h,energyEntry,energiaMeses[0]));
    }
    if(proporcionalPendente) dueCandidates.push(new Date(contract.inicio+'T23:59:59'));
    const due0=new Date(Math.min.apply(null,dueCandidates.map(function(d){return d.getTime();})));
    due0.setHours(0,0,0,0);
    const dias = Math.max(0, Math.round((hoje0 - due0)/86400000));
    return { houseId:h.id, contractId:contract.id,tipo:temAtraso?'atraso':'tolerancia',
      meses:mesesPendentes, mesesAtraso:mesesAtraso, mesesTolerancia:mesesTolerancia,
      aluguelTotal:aluguelTotal, energiaAtraso:energiaAtraso, energiaTolerancia:energiaTolerancia,
      energiaMeses:energiaMeses, energiaTotal:energiaTotal, proporcional:proporcionalPendente?proporcionalState.remaining:0,
      total:aluguelTotal+energiaTotal+(proporcionalPendente?proporcionalState.remaining:0), dias:dias,
      toleranciaDias:TOLERANCIA_DIAS };
  }
  // próximo do vencimento (mês atual ainda no prazo, faltando 7 dias ou menos)
  const currentRentStatus=paymentStatus(h,cur,contract.id);
  if(contractCoversMonth(contract,cur)&&currentRentStatus!=='pago'&&currentRentStatus!=='pago_atraso'&&currentRentStatus!=='credito'){
    const diasAteVenc = dueDayForMonth(cur, diaVenc) - hojeDia;
    if(diasAteVenc>=1 && diasAteVenc<=7){
      const enerPend = energiaStatus(h,cur,contract.id)==='pendente' ? energiaValorMes(h,cur,contract.id) : 0;
      const charge=chargeForMonth(h,cur,'aluguel',contract.id);
      const aluguelMes=charge
        ? Math.max(0,(Number(charge.valorPrevisto)||0)-chargeReceivedTotal(h,charge))
        : contractExpectedRent(contract,cur);
      return { houseId:h.id,contractId:contract.id,tipo:'proximo', meses:[cur], aluguelTotal:aluguelMes,
        energiaMeses:enerPend?[cur]:[], energiaTotal:enerPend, total:aluguelMes+enerPend, dias:diasAteVenc };
    }
  }
  return null;
}

function computeOverview(){
  const cur = currentMonthStr();
  const today = new Date();
  let receitaMensal=0, recebidoMes=0, energiaMes=0, energiaRecebida=0,faltaReceber=0;
  let alugadas=0, vagas=0, manutencao=0;
  const cobrancas=[], contratosVencendo=[], manutList=[];

  state.houses.forEach(function(h){
    if(h.status==='alugada'){
      alugadas++;
      const contract=activeContract(h);
      const mensal=contract?contractExpectedRent(contract,cur):aluguelValorMes(h,cur);
      const proporcionalState=contract&&contract.inicio&&contract.inicio.slice(0,7)===cur
        ?contractProrataFinancialSnapshot(h,contract)
        :{expected:0,received:0,remaining:0};
      const proporcionalMes=proporcionalState.expected;
      receitaMensal+=mensal+proporcionalMes;
      const recCur = contract?paymentForMonth(h,cur,contract.id):null;
      let recebidoAluguelCasa=recCur?(Number(recCur.valorPago)||0):0;
      recebidoAluguelCasa+=proporcionalState.received;
      recebidoMes+=recebidoAluguelCasa;
      let energiaCasa=0,energiaRecebidaCasa=0;
      if(houseEnergyEnabled(h)){
        energiaCasa=energiaValorMes(h,cur,contract&&contract.id);
        energiaRecebidaCasa=energiaRecebidaMes(h,cur,contract&&contract.id);
        energiaMes += energiaCasa;
        energiaRecebida += energiaRecebidaCasa;
      }
      /* Crédito pertence ao imóvel que pagou a mais; ele não pode quitar
         silenciosamente a pendência de outro imóvel. */
      faltaReceber+=Math.max(
        0,
        mensal+proporcionalMes+energiaCasa-recebidoAluguelCasa-energiaRecebidaCasa
      );
      const cob = computeCobrancaCasa(h);
      if(cob) cobrancas.push(cob);
      if(h.contratoFim){
        const fim = new Date(h.contratoFim+'T00:00:00');
        const dias = Math.round((fim-today)/86400000);
        /* Dois níveis, não um só. Contrato a 58 dias e contrato a
           3 dias pedem reações diferentes: um é lembrete, o outro
           é "resolva hoje". Tratar os dois igual faz o aviso de 60
           dias virar ruído que se aprende a ignorar. */
        if(dias<=60){
          const nivel = dias<=30 ? 'urgente' : 'aviso';
          contratosVencendo.push({ houseId:h.id, dias:dias, nivel:nivel });
        }
      }
    } else if(h.status==='vaga'){ vagas++; }
    else if(h.status==='manutencao'){ manutencao++; manutList.push(h); }
  });
  // Atrasos primeiro, depois tolerância e próximos vencimentos.
  cobrancas.sort(function(a,b){
    const prioridade={atraso:0,tolerancia:1,proximo:2};
    if(a.tipo!==b.tipo) return prioridade[a.tipo]-prioridade[b.tipo];
    return a.tipo==='atraso' ? (b.dias-a.dias) : (a.dias-b.dias);
  });

  return {
    receitaMensal, recebidoMes,
    faltaReceber:faltaReceber,
    energiaMes, energiaRecebida, totalMes: receitaMensal+energiaMes,
    alugadas, vagas, manutencao,
    cobrancas,
    nAtraso: cobrancas.filter(function(c){ return c.tipo==='atraso'; }).length,
    nTolerancia: cobrancas.filter(function(c){ return c.tipo==='tolerancia'; }).length,
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
      const currentReceipts=activeMoneyRecords(h.recebimentos).filter(function(receipt){
        const charge=activeMoneyRecords(h.cobrancas).find(function(item){return String(item.id)===String(receipt.cobrancaId);});
        return charge&&(charge.competencia||charge.mes)===mes;
      });
      if(currentReceipts.length||activeMoneyRecords(h.cobrancas).length){
        recebido+=currentReceipts.reduce(function(total,receipt){return total+(Number(receipt.valor)||0);},0);
      }else{
        recebido += h.pagamentos.filter(function(p){ return p.mes===mes; })
          .reduce(function(total,p){ return total+(Number(p.valorPago)||0); },0);
        recebido += (h.contracts||[]).filter(function(c){
          return c.proporcionalPago&&c.inicio&&c.inicio.slice(0,7)===mes;
        }).reduce(function(total,c){ return total+contractProrataValue(c); },0);
      }
    });
    return { mes, recebido };
  });
}

// Últimas movimentações: pagamentos e despesas mais recentes por data
function computeRecentes(limit){
  const movs = [];
  state.houses.forEach(function(h){
    const charges=activeMoneyRecords(h.cobrancas),receipts=activeMoneyRecords(h.recebimentos);
    if(receipts.length||charges.length){
      receipts.forEach(function(receipt){
        const charge=charges.find(function(item){return String(item.id)===String(receipt.cobrancaId);});
        if(!receipt.dataPagamento) return;
        const type=charge&&charge.tipo==='energia'?'Energia':charge&&charge.tipo==='ajuste'?'Ajuste':'Aluguel';
        const competence=charge?(charge.competencia||charge.mes):'';
        movs.push({tipo:'pag',data:receipt.dataPagamento,valor:Number(receipt.valor)||0,
          texto:type+(competence?' '+monthLabel(competence):'')+' · '+h.nome});
      });
    }else{
      h.pagamentos.forEach(function(p){
        if(p.dataPagamento) movs.push({ tipo:'pag', data:p.dataPagamento, valor:Number(p.valorPago)||0,
          texto:'Aluguel '+monthLabel(p.mes)+' · '+h.nome });
      });
    }
    h.despesas.forEach(function(e){
      if(e.data) movs.push({ tipo:'desp', data:e.data, valor:Number(e.valor)||0,
        texto:e.descricao+' · '+h.nome });
    });
  });
  movs.sort(function(a,b){ return b.data.localeCompare(a.data); });
  if(limit===0) return movs;
  return movs.slice(0, typeof limit==='number'?limit:6);
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

/* ------------------------------------------------------------------
   Comparação com o mês anterior.

   "R$ 8.400" não diz se o mês foi bom. "R$ 8.400 · +12%" diz.
   Devolve null quando não dá para comparar honestamente: sem mês
   anterior, ou mês anterior zerado (variação a partir de zero é
   infinita, e "+∞%" não informa nada).
   ------------------------------------------------------------------ */
function computeVariacao(atual, anterior){
  atual = Number(atual)||0;
  anterior = Number(anterior)||0;
  if(anterior === 0) return null;
  const pct = ((atual - anterior) / Math.abs(anterior)) * 100;
  /* abaixo de 0,5% é ruído de arredondamento, não tendência */
  if(Math.abs(pct) < 0.5) return { pct:0, estavel:true, anterior:anterior };
  return { pct:pct, estavel:false, anterior:anterior };
}

/* Previsto de um mês qualquer. Refaz a conta com os contratos que
   valiam NAQUELE mês — não com os de hoje. Casa alugada em março
   não deve inflar o previsto de janeiro. */
function computePrevistoNoMes(mes){
  let total = 0;
  state.houses.forEach(function(h){
    (h.contracts||[]).forEach(function(c){
      if(!contractCoversMonth(c,mes)) return;
      total += contractExpectedRent(c,mes);
      if(c.inicio && c.inicio.slice(0,7)===mes) total += contractProrataValue(c);
    });
    if(houseEnergyEnabled(h)){
      const c = contractForEnergyMonth(h,mes);
      total += energiaValorMes(h,mes,c&&c.id);
    }
  });
  return total;
}

/* Ocupação mês a mês: quantas casas tinham contrato vigente em cada
   um dos últimos 12 meses. Antes o painel só mostrava o estado de
   hoje, que não revela se a carteira está enchendo ou esvaziando. */
function computeOcupacao12(){
  const cur = currentMonthStr();
  const meses = [];
  for(let i=11;i>=0;i--) meses.push(addMonths(cur,-i));
  return meses.map(function(mes){
    const casasExistentes=state.houses.filter(function(h){
      const datas=(h.contracts||[]).map(function(c){return c.inicio||'';})
        .concat([h.createdAt?String(h.createdAt).slice(0,10):''])
        .filter(Boolean).sort();
      /* Backups antigos não têm createdAt. Nesse caso a casa entra
         em todo o período, preservando a compatibilidade. */
      return !datas.length || datas[0].slice(0,7)<=mes;
    });
    const totalCasas = casasExistentes.length;
    let ocupadas = 0;
    casasExistentes.forEach(function(h){
      const temContrato = (h.contracts||[]).some(function(c){ return contractCoversMonth(c,mes); });
      if(temContrato) ocupadas++;
    });
    return { mes:mes, ocupadas:ocupadas, total:totalCasas,
      pct: totalCasas ? Math.round((ocupadas/totalCasas)*100) : 0 };
  });
}

/* Selo de variação. Sobe = verde só quando subir é bom; em "Falta
   receber", subir é ruim, daí o parâmetro subirEhBom. */
function variacaoBadge(v, subirEhBom){
  if(!v) return '';
  if(v.estavel) return '<span class="stat-delta stat-delta-flat" title="Praticamente igual ao mês anterior">estável</span>';
  const sobe = v.pct > 0;
  const bom = subirEhBom===false ? !sobe : sobe;
  const sinal = sobe ? '+' : '−';
  const num = Math.abs(v.pct) >= 100
    ? Math.round(Math.abs(v.pct))
    : Math.abs(v.pct).toFixed(Math.abs(v.pct) < 10 ? 1 : 0).replace('.',',');
  return '<span class="stat-delta '+(bom?'stat-delta-up':'stat-delta-down')+'" '+
    'title="Mês anterior: '+fmtMoney(v.anterior)+'">'+
    '<span aria-hidden="true">'+(sobe?'▲':'▼')+'</span>'+sinal+num+'%</span>';
}

function statCard(label, value, sub, tone, delta){
  return '<div class="stat-card'+(tone?(' stat-'+tone):'')+'">'+
    '<div class="stat-label">'+label+'</div>'+
    '<div class="stat-value-row"><div class="stat-value num">'+value+'</div>'+(delta||'')+'</div>'+
    (sub?'<div class="stat-sub">'+sub+'</div>':'')+'</div>';
}

function countAlerts(o){
  return o.cobrancas.length + o.contratosVencendo.length + o.manutList.length;
}
function renderAlerts(o,limit){
  const items = [];
  const mayManageFinance=canManageFinance();
  const mayOperate=canOperateProperties();
  o.cobrancas.forEach(function(g){
    const h = state.houses.find(function(x){ return x.id===g.houseId; });
    const t = tenantOf(h);
    const btn = (mayManageFinance&&t&&t.telefone)
      ? '<button class="btn-cobrar" onclick="event.stopPropagation();cobrarAlerta(\''+g.houseId+'\')" title="Cobrar no WhatsApp">'+FICO.phone+'<span>Cobrar</span></button>'
      : '';
    const registerBtn=mayManageFinance
      ? '<button class="btn-register-payment" onclick="event.stopPropagation();openAlertPaymentChooser(\''+g.houseId+'\')" title="Registrar pagamento">'+FICO.money+'<span>Registrar</span></button>'
      : '';
    const temAluguel = g.meses.length>0;
    const temEnergia = g.energiaMeses && g.energiaMeses.length>0;
    if(g.tipo==='atraso'){
      const partes = [];
      if(temAluguel) partes.push(g.meses.length===1 ? ('aluguel de '+monthLabel(g.meses[0])) : (g.meses.length+' meses de aluguel'));
      if(temEnergia) partes.push(g.energiaMeses.length===1 ? ('energia de '+monthLabel(g.energiaMeses[0])) : (g.energiaMeses.length+' de energia'));
      if(g.proporcional) partes.push('ajuste inicial do contrato');
      const txt = partes.join(' + ')+' — atrasado há '+plural(g.dias,'dia','dias');
      items.push('<div class="alert-row alert-atraso" onclick="'+(isSimpleMode()?'openSimpleHouseSummary(\''+g.houseId+'\')':'openHouse(\''+g.houseId+'\',\''+(temAluguel?'pagamentos':'energia')+'\')')+'">'+
        '<span class="chip">ATRASADO</span>'+
        '<div class="ledger-row-main">'+esc(h.nome)+' — '+txt+'</div>'+
        '<div class="alert-actions">'+btn+registerBtn+'</div>'+
        '<div class="ledger-row-value num rust">'+fmtMoney(g.total)+'</div></div>');
    } else if(g.tipo==='tolerancia'){
      const partes = [];
      if(temAluguel) partes.push(g.meses.length===1 ? ('aluguel de '+monthLabel(g.meses[0])) : (g.meses.length+' meses de aluguel'));
      if(temEnergia) partes.push(g.energiaMeses.length===1 ? ('energia de '+monthLabel(g.energiaMeses[0])) : (g.energiaMeses.length+' de energia'));
      if(g.proporcional) partes.push('ajuste inicial do contrato');
      items.push('<div class="alert-row alert-tolerancia" onclick="'+(isSimpleMode()?'openSimpleHouseSummary(\''+g.houseId+'\')':'openHouse(\''+g.houseId+'\',\''+(temAluguel?'pagamentos':'energia')+'\')')+'">'+
        '<span class="chip chip-warn">EM TOLERÂNCIA</span>'+
        '<div class="ledger-row-main">'+esc(h.nome)+' — '+partes.join(' + ')+' venceu há '+plural(g.dias,'dia','dias')+
          ', dentro da tolerância de '+plural(g.toleranciaDias,'dia','dias')+', sem multa ou juros</div>'+
        '<div class="alert-actions">'+btn+registerBtn+'</div>'+
        '<div class="ledger-row-value num warn">'+fmtMoney(g.total)+'</div></div>');
    } else {
      const extra = temEnergia ? ' + energia' : '';
      items.push('<div class="alert-row alert-proximo" onclick="'+(isSimpleMode()?'openSimpleHouseSummary(\''+g.houseId+'\')':'openHouse(\''+g.houseId+'\',\'pagamentos\')')+'">'+
        '<span class="chip">PRÓXIMO</span>'+
        '<div class="ledger-row-main">'+esc(h.nome)+' — aluguel'+extra+' vence em '+plural(g.dias,'dia','dias')+' ('+monthLabel(g.meses[0])+')</div>'+
        '<div class="alert-actions">'+btn+registerBtn+'</div>'+
        '<div class="ledger-row-value num warn">'+fmtMoney(g.total)+'</div></div>');
    }
  });
  /* mais perto de vencer primeiro — quem já venceu no topo */
  o.contratosVencendo.slice().sort(function(a,b){ return a.dias-b.dias; }).forEach(function(c){
    const h = state.houses.find(function(x){ return x.id===c.houseId; });
    if(!h) return;
    const situacao = c.dias<0 ? ('vencido há '+plural(Math.abs(c.dias),'dia','dias'))
      : c.dias===0 ? 'vence hoje' : ('vence em '+plural(c.dias,'dia','dias'));
    const selo = c.dias<0 ? 'VENCIDO' : c.nivel==='urgente' ? 'RENOVAR JÁ' : 'CONTRATO';
    const tom = c.dias<0 || c.nivel==='urgente' ? 'tab-rust' : 'tab-manut';
    /* Atalho direto para renovar: o aviso sem ação obriga a
       procurar onde se resolve, e é aí que ele é adiado. */
    const acao = '<button class="btn btn-ghost btn-sm" '+
      'onclick="event.stopPropagation();openHouse(\''+h.id+'\',\'contratos\')" '+
      'aria-label="'+(mayOperate?'Renovar':'Ver')+' contrato de '+esc(h.nome)+'">'+
      (mayOperate?'Renovar':'Ver contrato')+'</button>';
    items.push('<div class="alert-row alert-contrato alert-contrato-'+(c.nivel||'aviso')+'" '+
      'onclick="openHouse(\''+h.id+'\',\'inquilino\')">'+
      '<span class="chip '+tom+'">'+selo+'</span>'+
      '<div class="ledger-row-main">'+esc(h.nome)+' — contrato '+situacao+'</div>'+
      '<div class="ledger-row-value num">'+fmtDateBR(h.contratoFim)+'</div>'+
      acao+'</div>');
  });
  o.manutList.forEach(function(h){
    items.push('<div class="alert-row alert-manut" onclick="openHouse(\''+h.id+'\',\'geral\')">'+
      '<span class="chip">MANUTENÇÃO</span>'+
      '<div class="ledger-row-main">'+esc(h.nome)+' está marcada como em manutenção</div></div>');
  });
  if(!items.length) return '<div class="empty-state">Tudo certo por aqui — nenhuma cobrança ou pendência no momento.</div>';
  return (limit===0?items:items.slice(0,typeof limit==='number'?limit:items.length)).join('');
}

function openAlertPaymentChooser(houseId){
  if(!requireFinancePermission())return;
  const h=state.houses.find(function(x){return x.id===houseId;});
  const charge=h?computeCobrancaCasa(h):null;
  if(!h||!charge){showToast('Não há pagamento pendente nesta casa.','success');return;}
  const contract=activeContract(h),rows=[];
  if(charge.proporcional&&contract){
    rows.push('<button class="payment-choice" onclick="openProrataPaymentModal(\''+h.id+'\',\''+contract.id+'\')"><span>Ajuste inicial do contrato</span><strong class="num">'+fmtMoney(charge.proporcional)+'</strong></button>');
  }
  (charge.meses||[]).forEach(function(mes){
    rows.push('<button class="payment-choice" onclick="openPaymentModal(\''+h.id+'\',\''+mes+'\',\''+(contract?contract.id:'')+'\')"><span>Aluguel · '+monthLabel(mes)+'</span><strong class="num">'+fmtMoney(contract?contractExpectedRent(contract,mes):aluguelValorMes(h,mes))+'</strong></button>');
  });
  (charge.energiaMeses||[]).forEach(function(mes){
    rows.push('<button class="payment-choice" onclick="openEnergyReceiptModal(\''+h.id+'\',\''+mes+'\',\''+(contract?contract.id:'')+'\')"><span>Energia · '+monthLabel(mes)+'</span><strong class="num">'+fmtMoney(energiaValorMes(h,mes,contract&&contract.id))+'</strong></button>');
  });
  openModal('<h3 class="modal-title">Registrar pagamento</h3><p class="modal-text">'+esc(h.nome)+' — escolha o que foi recebido.</p><div class="payment-choice-list">'+rows.join('')+'</div>'+
    '<div class="modal-actions"><span></span><div class="modal-actions-right"><button class="btn btn-ghost" onclick="closeModal()">Fechar</button></div></div>');
}

function renderRecentes(limit){
  const recs = computeRecentes(typeof limit==='number'?limit:6);
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

function openDashboardAllAlerts(){
  const overview=computeOverview();
  openModal('<h3 class="modal-title">Todos os alertas atuais</h3>'+
    '<p class="modal-text">Pendências e avisos em aberto, ordenados por prioridade. Alertas resolvidos não são armazenados como histórico.</p>'+
    '<div class="dashboard-history-list">'+renderAlerts(overview,0)+'</div>'+
    '<div class="modal-actions"><span></span><button class="btn btn-primary" onclick="closeModal()">Fechar</button></div>');
}

function openDashboardMovementsHistory(){
  openModal('<h3 class="modal-title">Histórico de movimentações</h3>'+
    '<p class="modal-text">Pagamentos e despesas registrados, do mais recente para o mais antigo.</p>'+
    '<div class="dashboard-history-list">'+renderRecentes(0)+'</div>'+
    '<div class="modal-actions"><span></span><button class="btn btn-primary" onclick="closeModal()">Fechar</button></div>');
}

function openDashboardQuickAction(kind){
  if(kind==='aluguel'&&!requireFinancePermission())return;
  if(kind==='manutencao'&&!requirePropertyPermission())return;
  if(kind==='energia'&&!canOperateProperties()&&!canManageFinance()){
    requireAccountPermission(false,'Sua função permite somente consultar a energia.');
    return;
  }
  const currentMonth=currentMonthStr();
  if(kind==='energia'&&!energyModuleEnabled()){
    showToast('Ative o controle de energia nas configurações para registrar uma leitura.','error');
    return;
  }
  const financeOnlyEnergy=kind==='energia'&&canManageFinance()&&!canOperateProperties();
  const houses=state.houses.filter(function(h){
    if(kind==='aluguel') return h.status==='alugada'&&!!activeContract(h);
    if(kind==='energia'){
      const contract=activeContract(h);
      if(h.status!=='alugada'||!houseEnergyEnabled(h)||!contract)return false;
      if(!financeOnlyEnergy)return true;
      const entry=energiaDoMes(h,currentMonth,contract.id);
      if(!entry)return false;
      const charge=chargeForMonth(h,currentMonth,'energia',contract.id);
      const expected=charge?Number(charge.valorPrevisto)||0:Number(entry.valor)||0;
      const received=charge?chargeReceivedTotal(h,charge):(entry.pago?expected:0);
      return expected-received>0.005;
    }
    return true;
  });
  const labels={
    aluguel:['Registrar aluguel','Escolha o imóvel que recebeu o pagamento.'],
    energia:financeOnlyEnergy
      ? ['Registrar recebimento de energia','Escolha uma cobrança de energia em aberto.']
      : ['Registrar energia','Escolha o imóvel para lançar ou conferir a energia.'],
    manutencao:['Registrar manutenção','Escolha o imóvel relacionado ao serviço.']
  };
  const copy=labels[kind]||labels.manutencao;
  if(!houses.length){
    showToast(kind==='manutencao'
      ? 'Cadastre um imóvel antes de registrar uma manutenção.'
      : 'Nenhum imóvel apto para este registro.','error');
    return;
  }
  openModal('<h3 class="modal-title">'+copy[0]+'</h3><p class="modal-text">'+copy[1]+'</p>'+
    '<div class="payment-choice-list dashboard-house-chooser">'+houses.map(function(h){
      const contract=activeContract(h);
      const action=kind==='aluguel'
        ? 'closeModal();openQuickRentPayment(\''+h.id+'\')'
        : kind==='energia'
          ? (financeOnlyEnergy
              ? 'closeModal();openEnergyReceiptModal(\''+h.id+'\',\''+currentMonth+'\',\''+(contract?contract.id:'')+'\')'
              : 'closeModal();openEnergiaModal(\''+h.id+'\',\''+currentMonth+'\',\''+(contract?contract.id:'')+'\')')
          : 'openDashboardMaintenanceRecord(\''+h.id+'\')';
      return '<button class="payment-choice" onclick="'+action+'"><span>'+esc(h.nome)+
        '<small>'+esc(h.endereco||'Endereço não informado')+'</small></span><strong aria-hidden="true">›</strong></button>';
    }).join('')+'</div>'+
    '<div class="modal-actions"><span></span><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button></div>');
}

function openDashboardMaintenanceRecord(houseId){
  if(!requirePropertyPermission())return;
  closeModal();
  openMaintenanceModal(houseId);
}

function renderSimpleDashboard(o){
  const paymentOnly={cobrancas:o.cobrancas,contratosVencendo:[],manutList:[]};
  const mayManageFinance=canManageFinance();
  return '<div class="page-header simple-page-header"><div>'+
      '<div class="eyebrow">MODO SIMPLES</div>'+
      pageTitleWithIcon(dashIconSvg(), 'Olá!')+
      '<div class="page-sub">'+(mayManageFinance
        ? 'Acompanhe os aluguéis e registre os pagamentos.'
        : 'Acompanhe os aluguéis em modo de consulta.')+'</div>'+
    '</div><div class="page-date">'+fmtDateBR(todayISO())+'</div></div>'+
    '<div class="simple-dashboard-actions">'+
      '<button class="simple-primary-action" onclick="irCasas()"><span>'+houseIconSvg()+'</span><div><strong>Ver todas as casas</strong><small>'+
        (mayManageFinance?'Consulte e registre pagamentos':'Consulte imóveis e históricos')+'</small></div><b>→</b></button>'+
    '</div>'+
    '<div class="stat-grid simple-stat-grid">'+
      statCard('Recebido no mês', fmtMoney(o.recebidoMes + o.energiaRecebida), energyModuleEnabled()?'aluguéis e energia':'aluguéis', 'brass')+
      statCard('Falta receber', fmtMoney(o.faltaReceber), o.nAtraso?(plural(o.nAtraso,'casa','casas')+' em atraso'):'nenhum atraso', o.faltaReceber>0?'rust':null)+
    '</div>'+
    '<div class="panel simple-panel">'+
      '<div class="simple-panel-heading"><div><span class="panel-title-inline">Pagamentos para conferir'+(o.nAtraso?'<span class="alert-badge">'+o.nAtraso+'</span>':'')+'</span><small>'+
        (mayManageFinance?'Toque em Registrar quando receber.':'Consulta das pendências atuais.')+'</small></div></div>'+
      '<div class="simple-panel-body">'+renderAlerts(paymentOnly,5)+'</div>'+
      '<div class="dashboard-feed-footer"><button class="btn btn-ghost btn-sm" onclick="openDashboardAllAlerts()">Ver todos os alertas</button></div>'+
    '</div>'+
    '<div class="panel panel-collapsible">'+
      '<button class="panel-toggle" aria-expanded="'+(state.movsExpanded?'true':'false')+'" aria-controls="simpleMovementsBody" onclick="toggleMovs()"><span class="panel-title-inline">Histórico recente</span><span class="panel-chevron" aria-hidden="true">'+(state.movsExpanded?'▾':'▸')+'</span></button>'+
      (state.movsExpanded?'<div id="simpleMovementsBody" class="panel-body">'+renderRecentes(5)+'</div>'+
        '<div class="dashboard-feed-footer"><button class="btn btn-ghost btn-sm" onclick="openDashboardMovementsHistory()">Ver histórico completo</button></div>':'')+
    '</div>';
}

function renderOccupancySummary(o){
  const total=state.houses.length;
  const pct=total?Math.round((o.alugadas/total)*100):0;
  const unavailable=o.vagas+o.manutencao;
  const headline=total&&pct===100?'100% das casas estão alugadas':pct+'% das casas estão alugadas';
  const detail=unavailable===0?(o.alugadas+' de '+total+' ocupadas'):
    (plural(unavailable,'desocupada','desocupadas')+' · '+plural(o.vagas,'vaga','vagas')+(o.manutencao?' · '+o.manutencao+' em manutenção':''));
  return '<div class="occupancy-card"><div class="occupancy-copy"><span>OCUPAÇÃO</span><strong>'+headline+'</strong><small>'+detail+'</small></div>'+
    '<div class="occupancy-meter" role="img" aria-label="'+pct+'% das casas alugadas"><span style="width:'+pct+'%"></span></div></div>';
}

/* Faixa de ocupação nos últimos 12 meses. Deliberadamente simples:
   uma barra por mês, alta proporcional à ocupação. Não é gráfico
   de precisão, é para ver se a carteira enche ou esvazia. */
function renderOccupancyTrend(){
  const serie = computeOcupacao12();
  if(!serie.length || !serie[serie.length-1].total) return '';
  /* sem histórico nenhum (todos os meses iguais e cheios) não há o
     que mostrar — poupa a tela de um gráfico que não informa */
  const variou = serie.some(function(p){
    return p.pct !== serie[0].pct || p.total !== serie[0].total;
  });
  if(!variou) return '';

  const atual = serie[serie.length-1];
  const barras = serie.map(function(p){
    const alt = p.total ? Math.max(3, Math.round((p.ocupadas/p.total)*100)) : 3;
    const ehAtual = p.mes === currentMonthStr();
    return '<div class="occ-col" title="'+monthLabel(p.mes)+': '+p.ocupadas+' de '+p.total+' ('+p.pct+'%)">'+
      '<div class="occ-bar'+(ehAtual?' occ-bar-cur':'')+'" style="height:'+alt+'%"></div>'+
      '<span class="occ-mes">'+monthLabel(p.mes).split('/')[0]+'</span>'+
    '</div>';
  }).join('');

  return '<div class="panel">'+
    '<div class="panel-title-inline">Ocupação nos últimos 12 meses</div>'+
    '<div class="occ-chart" role="img" aria-label="Ocupação por mês: '+
      serie.map(function(p){ return monthLabel(p.mes)+' '+p.pct+'%'; }).join(', ')+'">'+barras+'</div>'+
    '<div class="chart-legend">Hoje: <strong>'+atual.ocupadas+' de '+atual.total+'</strong> ocupadas ('+atual.pct+'%)</div>'+
  '</div>';
}

function renderDashboard(){
  const o = computeOverview();

  if(isSimpleMode()) return renderSimpleDashboard(o);

  /* Só o previsto compara meses completos. "Recebido até agora" e
     "falta receber" mudam ao longo do mês e não são comparáveis com
     o fechamento inteiro do mês anterior. */
  const mesAnterior = addMonths(currentMonthStr(), -1);
  const quickActions=[
    canManageFinance()
      ? '<button onclick="openDashboardQuickAction(\'aluguel\')"><span aria-hidden="true">R$</span><strong>Registrar aluguel</strong><small>pagamento recebido</small></button>'
      : '',
    (canOperateProperties()||canManageFinance())&&energyModuleEnabled()
      ? '<button onclick="openDashboardQuickAction(\'energia\')"><span aria-hidden="true">⚡</span><strong>'+
          (canOperateProperties()?'Registrar energia':'Receber energia')+
          '</strong><small>'+(canOperateProperties()
            ? (canManageFinance()?'leitura ou recebimento':'leitura do medidor')
            : 'pagamento recebido')+'</small></button>'
      : '',
    canOperateProperties()
      ? '<button onclick="openDashboardQuickAction(\'manutencao\')"><span aria-hidden="true">⌁</span><strong>Registrar manutenção</strong><small>serviço no imóvel</small></button>'
      : ''
  ].filter(Boolean).join('');
  return '<div class="page-header"><div>'+
      '<div class="eyebrow">GESTÃO DOS ALUGUÉIS</div>'+
      pageTitleWithIcon(dashIconSvg(), 'Visão geral')+
      '<div class="page-sub">Tudo que precisa da sua atenção em '+monthLabel(currentMonthStr())+'.</div>'+
    '</div><div class="page-date">'+fmtDateBR(todayISO())+'</div></div>'+

    /* Cadastros como "Novo interessado" continuam em suas telas.
       No painel ficam somente as três tarefas operacionais recorrentes. */
    (quickActions?'<div class="dashboard-actions dashboard-actions-primary" aria-label="Registros rápidos">'+quickActions+'</div>':'')+

    '<div class="stat-grid rent-dashboard-stats">'+
      statCard('Previsto no mês', fmtMoney(o.totalMes),
        energyModuleEnabled()?'aluguéis + energia':'aluguéis', 'brass',
        variacaoBadge(computeVariacao(o.totalMes, computePrevistoNoMes(mesAnterior)), true))+
      statCard('Recebido', fmtMoney(o.recebidoMes + o.energiaRecebida),
        energyModuleEnabled()?'aluguel + energia até agora':'aluguéis até agora', null)+
      statCard('Falta receber', fmtMoney(o.faltaReceber), o.nAtraso+' em atraso',
        o.faltaReceber>0?'rust':null)+
      (energyModuleEnabled()?statCard('Energia lançada', fmtMoney(o.energiaMes), 'controle separado dos imóveis', 'warn'):'')+
    '</div>'+

    /* Resumo compacto da Central de Pendências. Não repete os alertas:
       conta o que exige ação e leva para a página, onde dá para filtrar. */
    (typeof renderPendenciasResumo==='function'?renderPendenciasResumo():'')+

    '<div class="dashboard-status-row rent-occupancy-row">'+renderOccupancySummary(o)+'</div>'+

    '<div class="dashboard-feed-grid">'+
      '<section class="panel panel-collapsible dashboard-feed-item" aria-labelledby="dashboardAlertsTitle">'+
        '<button class="panel-toggle" aria-expanded="'+(state.alertsExpanded?'true':'false')+
          '" aria-controls="dashboardAlertsBody" onclick="toggleAlerts()">'+
          '<span id="dashboardAlertsTitle" class="panel-title-inline">Alertas'+
            (countAlerts(o)>0?'<span class="alert-badge">'+countAlerts(o)+'</span>':'')+'</span>'+
          '<span class="panel-chevron" aria-hidden="true">'+(state.alertsExpanded?'▾':'▸')+'</span>'+
        '</button>'+
        (state.alertsExpanded
          ? '<div id="dashboardAlertsBody" class="panel-body">'+renderAlerts(o,5)+'</div>'+
            '<div class="dashboard-feed-footer"><button class="btn btn-ghost btn-sm" onclick="openDashboardAllAlerts()">Ver todos os alertas</button></div>'
          : '')+
      '</section>'+

      '<section class="panel panel-collapsible dashboard-feed-item" aria-labelledby="dashboardMovementsTitle">'+
        '<button class="panel-toggle" aria-expanded="'+(state.movsExpanded?'true':'false')+
          '" aria-controls="dashboardMovementsBody" onclick="toggleMovs()">'+
          '<span id="dashboardMovementsTitle" class="panel-title-inline">Últimas movimentações</span>'+
          '<span class="panel-chevron" aria-hidden="true">'+(state.movsExpanded?'▾':'▸')+'</span>'+
        '</button>'+
        (state.movsExpanded
          ? '<div id="dashboardMovementsBody" class="panel-body">'+renderRecentes(5)+'</div>'+
            '<div class="dashboard-feed-footer"><button class="btn btn-ghost btn-sm" onclick="openDashboardMovementsHistory()">Ver histórico completo</button></div>'
          : '')+
      '</section>'+
    '</div>';
}
