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
      const periodCharges=activeFinanceRecords(h.cobrancas).filter(function(charge){
        const competence=charge.competencia||charge.mes;
        return !charge.contractId&&competence>=clipStart.slice(0,7)&&competence<=clipEnd.slice(0,7);
      });
      const recebidoPeriodo=periodCharges.length
        ? periodCharges.reduce(function(sum,charge){return sum+chargeReceivedTotal(h,charge);},0)
        : h.pagamentos.filter(function(pg){
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
    const contractCharges=activeFinanceRecords(h.cobrancas).filter(function(charge){
      const competence=charge.competencia||charge.mes;
      return charge.contractId===c.id&&competence>=clipStart.slice(0,7)&&competence<=clipEnd.slice(0,7);
    });
    const recebido=contractCharges.length
      ? contractCharges.reduce(function(sum,charge){return sum+chargeReceivedTotal(h,charge);},0)
      : h.pagamentos.filter(function(pg){return pg.contractId===c.id&&pg.mes>=clipStart.slice(0,7)&&pg.mes<=clipEnd.slice(0,7);})
          .reduce(function(s,pg){return s+(Number(pg.valorPago)||0);},0)
        +(c.proporcionalPago&&c.inicio.slice(0,4)===String(year)?contractProrataValue(c):0);
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
  let previstoAno=0,recebidoCompetenciaAno=0,pendenteAno=0,atrasosAno=0;
  for(let month=1;month<=12;month++){
    const mes=String(year)+'-'+String(month).padStart(2,'0');
    const financeRow=computeMonthlyFinance(mes).rows.find(function(row){return row.house.id===h.id;});
    if(!financeRow) continue;
    previstoAno+=financeRow.expected;
    recebidoCompetenciaAno+=financeRow.receivedCompetence;
    pendenteAno+=financeRow.pending;
    if(financeRow.status==='atrasado'||financeRow.status==='pago_atraso') atrasosAno++;
  }
  const periodEnd=String(year)===todayISO().slice(0,4)?todayISO():yearEnd;
  const eligibleDays=Math.max(1,diffDaysInclusive(yearStart,periodEnd));
  const occupiedDays=Math.max(0,eligibleDays-diasVago-diasManutencao);
  const taxaOcupacao=Math.max(0,Math.min(100,Math.round(occupiedDays/eligibleDays*100)));
  return {
    house:h, recebidoAno, energiaAno, despesasTotal, despesasPorCategoria,
    saldo: recebidoCompetenciaAno-despesasTotal,
    previstoAno:previstoAno,recebidoCompetenciaAno:recebidoCompetenciaAno,
    pendenteAno:pendenteAno,atrasosAno:atrasosAno,taxaOcupacao:taxaOcupacao,
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
    '<div class="report-detail-title">Composição do ano</div>'+
    '<div class="ledger-row"><div class="ledger-row-main">Receita prevista</div><div class="ledger-row-value num">'+fmtMoney(r.previstoAno)+'</div></div>'+
    '<div class="ledger-row"><div class="ledger-row-main">Receita recebida</div><div class="ledger-row-value num brass">'+fmtMoney(r.recebidoCompetenciaAno)+'</div></div>'+
    '<div class="ledger-row"><div class="ledger-row-main">Valor pendente</div><div class="ledger-row-value num rust">'+fmtMoney(r.pendenteAno)+'</div></div>'+
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
      '<div class="report-row-stat"><span class="report-label">Previsto</span><span class="num">'+fmtMoney(r.previstoAno)+'</span></div>'+
      '<div class="report-row-stat"><span class="report-label">Recebido</span><span class="num brass">'+fmtMoney(r.recebidoCompetenciaAno)+'</span></div>'+
      '<div class="report-row-stat"><span class="report-label">Pendente</span><span class="num rust">'+fmtMoney(r.pendenteAno)+'</span></div>'+
      '<div class="report-row-stat"><span class="report-label">Despesas</span><span class="num rust">'+fmtMoney(r.despesasTotal)+'</span></div>'+
      '<div class="report-row-stat"><span class="report-label">Ocupação</span><span class="num">'+r.taxaOcupacao+'%</span></div>'+
      '<div class="report-row-stat"><span class="report-label">Atrasos</span><span class="num">'+r.atrasosAno+'</span></div>'+
      '<span class="panel-chevron">'+(expanded?'▾':'▸')+'</span>'+
    '</button>'+
    (expanded ? renderAnnualHouseDetail(r) : '')+
  '</div>';
}
/* soma o ano (recebido, despesas, saldo) de todas as casas */
function computeAnnualTotals(year){
  let previsto=0,recebido=0, energia=0, despesas=0,pendente=0;
  state.houses.forEach(function(h){
    const r = computeHouseAnnualReport(h, year);
    previsto += r.previstoAno;
    recebido += r.recebidoCompetenciaAno;
    energia += r.energiaAno;
    despesas += r.despesasTotal;
    pendente += r.pendenteAno;
  });
  return { previsto:previsto,recebido:recebido, energia:energia, despesas:despesas,
    pendente:pendente,saldo:recebido-despesas };
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

function activeFinanceRecords(list){
  return (list||[]).filter(function(item){return !(item.arquivadoEm||item.arquivado_em);});
}
function financeReceiptsForCharge(h,charge){
  if(!charge||!charge.id) return [];
  return activeFinanceRecords(h.recebimentos).filter(function(receipt){
    return receipt.cobrancaId===charge.id;
  });
}
function financeLegacyCharges(h,mes){
  const charges=[];
  const contracts=(h.contracts||[]).filter(function(c){return contractCoversMonth(c,mes);});
  if(contracts.length){
    contracts.forEach(function(contract){
      const rent=contractExpectedRent(contract,mes);
      if(rent>0) charges.push({id:'legacy-rent-'+contract.id+'-'+mes,contractId:contract.id,mes:mes,
        tipo:'aluguel',valorPrevisto:rent,vencimento:contractDueDate(contract,mes),toleranciaDias:DEFAULT_PAYMENT_GRACE_DAYS,
        legacyPayment:paymentForMonth(h,mes,contract.id)});
      if(contract.inicio&&contract.inicio.slice(0,7)===mes&&contractProrataValue(contract)>0){
        charges.push({id:'legacy-adjust-'+contract.id,contractId:contract.id,mes:mes,tipo:'ajuste',
          valorPrevisto:contractProrataValue(contract),vencimento:contract.inicio,
          toleranciaDias:DEFAULT_PAYMENT_GRACE_DAYS,legacyProrata:contract});
      }
    });
  }else if(houseRentedInMonth(h,mes)){
    charges.push({id:'legacy-rent-'+h.id+'-'+mes,contractId:'',mes:mes,tipo:'aluguel',
      valorPrevisto:aluguelValorMes(h,mes),vencimento:dueDateForMonth(mes,h.diaVencimento||5),
      toleranciaDias:DEFAULT_PAYMENT_GRACE_DAYS,legacyPayment:paymentForMonth(h,mes)});
  }
  if(houseEnergyEnabled(h)){
    (h.energias||[]).filter(function(entry){return entry.mes===mes;}).forEach(function(entry){
      charges.push({id:'legacy-energy-'+(entry.id||h.id+'-'+mes),contractId:entry.contractId||'',mes:mes,
        tipo:'energia',valorPrevisto:Number(entry.valor)||0,vencimento:entry.vencimento||energyDueDate(h,entry,mes),
        toleranciaDias:DEFAULT_PAYMENT_GRACE_DAYS,legacyEnergy:entry});
    });
  }
  return charges;
}
function financeChargesForHouse(h,mes){
  const stored=activeFinanceRecords(h.cobrancas).filter(function(charge){return charge.mes===mes;});
  const legacy=financeLegacyCharges(h,mes);
  if(!stored.length) return legacy;
  return stored.concat(legacy.filter(function(candidate){
    return !stored.some(function(charge){
      return charge.tipo===candidate.tipo
        && String(charge.contractId||'')===String(candidate.contractId||'');
    });
  }));
}
function financeChargeExpected(charge){return Math.max(0,Number(charge.valorPrevisto)||0);}
function financeChargeReceipts(h,charge){
  const stored=financeReceiptsForCharge(h,charge);
  if(stored.length) return stored;
  if(charge.legacyPayment&&charge.legacyPayment.dataPagamento){
    return [{id:'legacy-payment-'+charge.id,cobrancaId:charge.id,valor:Number(charge.legacyPayment.valorPago)||0,
      dataPagamento:charge.legacyPayment.dataPagamento,forma:'',observacao:''}];
  }
  if(charge.legacyProrata&&charge.legacyProrata.proporcionalPago){
    return [{id:'legacy-prorata-'+charge.id,cobrancaId:charge.id,valor:contractProrataValue(charge.legacyProrata),
      dataPagamento:charge.legacyProrata.proporcionalDataPagamento||charge.legacyProrata.inicio,forma:'',observacao:''}];
  }
  if(charge.legacyEnergy&&charge.legacyEnergy.pago){
    return [{id:'legacy-energy-payment-'+charge.id,cobrancaId:charge.id,valor:Number(charge.legacyEnergy.valor)||0,
      dataPagamento:charge.legacyEnergy.dataPagamento||charge.mes+'-01',forma:'',observacao:''}];
  }
  return [];
}
function financeStatusMeta(status){
  const map={
    pago:{label:'Pago',tone:'pago',rank:6},
    pagamento_parcial:{label:'Pagamento parcial',tone:'warn',rank:1},
    pagamento_parcial_em_atraso:{label:'Pagamento parcial em atraso',tone:'atrasado',rank:0},
    a_vencer:{label:'A vencer',tone:'neutral',rank:4},
    tolerancia:{label:'Em tolerância',tone:'tolerancia',rank:2},
    em_tolerancia:{label:'Em tolerância',tone:'tolerancia',rank:2},
    atrasado:{label:'Em atraso',tone:'atrasado',rank:0},
    em_atraso:{label:'Em atraso',tone:'atrasado',rank:0},
    pago_atraso:{label:'Pago com atraso',tone:'warn',rank:5},
    pago_com_atraso:{label:'Pago com atraso',tone:'warn',rank:5},
    sem_cobranca:{label:'Sem cobrança',tone:'neutral',rank:7},
    credito:{label:'Crédito a favor',tone:'brass',rank:3},
    credito_a_favor:{label:'Crédito a favor',tone:'brass',rank:3}
  };
  return map[status]||map.sem_cobranca;
}
function financeRowStatus(charges,expected,received){
  if(expected<=0) return 'sem_cobranca';
  if(received>expected+0.005) return 'credito';
  const unresolved=charges.filter(function(charge){return charge.received+0.005<charge.expected;});
  if(!unresolved.length){
    const paidLate=charges.some(function(charge){
      const latest=(charge.receipts||[]).map(function(item){return item.dataPagamento||'';}).sort().pop()||'';
      if(!latest||!charge.due) return false;
      const graceEnd=dueDateWithGrace(charge.due,charge.graceDays);
      return graceEnd&&new Date(latest+'T12:00:00')>graceEnd;
    });
    return paidLate?'pago_atraso':'pago';
  }
  if(received>0){
    const partialLate=unresolved.some(function(charge){
      return openChargeTimeStatus(charge.due,charge.graceDays)==='atrasado';
    });
    return partialLate?'pagamento_parcial_em_atraso':'pagamento_parcial';
  }
  let status='a_vencer';
  unresolved.forEach(function(charge){
    const current=openChargeTimeStatus(charge.due,charge.graceDays);
    if(current==='atrasado') status='atrasado';
    else if(current==='tolerancia'&&status!=='atrasado') status='tolerancia';
  });
  return status;
}
function financeCashReceiptsForHouse(h,mes){
  const stored=activeFinanceRecords(h.recebimentos);
  if(stored.length){
    return stored.filter(function(item){return String(item.dataPagamento||'').slice(0,7)===mes;})
      .reduce(function(sum,item){return sum+(Number(item.valor)||0);},0);
  }
  const rent=(h.pagamentos||[]).filter(function(item){return String(item.dataPagamento||'').slice(0,7)===mes;})
    .reduce(function(sum,item){return sum+(Number(item.valorPago)||0);},0);
  const energy=(h.energias||[]).filter(function(item){
    return item.pago&&String(item.dataPagamento||'').slice(0,7)===mes;
  }).reduce(function(sum,item){return sum+(Number(item.valor)||0);},0);
  const prorata=(h.contracts||[]).filter(function(contract){
    return contract.proporcionalPago&&String(contract.proporcionalDataPagamento||'').slice(0,7)===mes;
  }).reduce(function(sum,contract){return sum+contractProrataValue(contract);},0);
  return rent+energy+prorata;
}

function computeMonthlyFinance(mes){
  const rows=state.houses.map(function(h){
    const rawCharges=financeChargesForHouse(h,mes);
    const charges=rawCharges.map(function(charge){
      const receipts=financeChargeReceipts(h,charge);
      const due=charge.vencimento instanceof Date?charge.vencimento:dateAtEndOfDay(charge.vencimento);
      return Object.assign({},charge,{expected:financeChargeExpected(charge),receipts:receipts,
        received:receipts.reduce(function(sum,item){return sum+(Number(item.valor)||0);},0),
        due:due,graceDays:paymentGraceDays(null,charge)});
    });
    const expected=charges.reduce(function(sum,charge){return sum+charge.expected;},0);
    const receivedCompetence=charges.reduce(function(sum,charge){return sum+charge.received;},0);
    const receivedCash=financeCashReceiptsForHouse(h,mes);
    const expenses=(h.despesas||[]).filter(function(e){return e.data&&e.data.slice(0,7)===mes;})
      .reduce(function(s,e){return s+(Number(e.valor)||0);},0);
    const received=(state.financeMode||'competencia')==='caixa'?receivedCash:receivedCompetence;
    const pending=Math.max(0,expected-receivedCompetence),credit=Math.max(0,receivedCompetence-expected);
    const status=financeRowStatus(charges,expected,receivedCompetence);
    return {house:h,charges:charges,expected:expected,receivedCompetence:receivedCompetence,
      receivedCash:receivedCash,received:received,expenses:expenses,balance:received-expenses,
      pending:pending,credit:credit,status:status,
      receivedRent:charges.filter(function(c){return c.tipo!=='energia';}).reduce(function(s,c){return s+c.received;},0),
      energyBilled:charges.filter(function(c){return c.tipo==='energia';}).reduce(function(s,c){return s+c.expected;},0),
      energyReceived:charges.filter(function(c){return c.tipo==='energia';}).reduce(function(s,c){return s+c.received;},0)};
  });
  return {rows:rows,expected:rows.reduce(function(s,r){return s+r.expected;},0),
    received:rows.reduce(function(s,r){return s+r.received;},0),
    receivedCompetence:rows.reduce(function(s,r){return s+r.receivedCompetence;},0),
    receivedCash:rows.reduce(function(s,r){return s+r.receivedCash;},0),
    expenses:rows.reduce(function(s,r){return s+r.expenses;},0),
    pending:rows.reduce(function(s,r){return s+r.pending;},0)};
}

function computeAgeing(mes,financeInfo){
  const buckets=[
    {id:'a_vencer',label:'A vencer',value:0,count:0,houses:{}},
    {id:'1_30',label:'1–30 dias',value:0,count:0,houses:{}},
    {id:'31_60',label:'31–60 dias',value:0,count:0,houses:{}},
    {id:'60_plus',label:'Mais de 60 dias',value:0,count:0,houses:{}}
  ];
  const info=financeInfo||computeMonthlyFinance(mes||state.financeMonth||currentMonthStr());
  info.rows.forEach(function(row){
    row.charges.forEach(function(charge){
      const missing=Math.max(0,charge.expected-charge.received);
      if(missing<=0) return;
      const due=charge.due||dateAtEndOfDay(charge.vencimento);
      let index=0;
      if(due){
        const graceEnd=dueDateWithGrace(due,charge.graceDays);
        const days=graceEnd?Math.floor((new Date()-graceEnd)/86400000):-1;
        if(days>60) index=3;
        else if(days>30) index=2;
        else if(days>0) index=1;
      }
      buckets[index].value+=missing;
      buckets[index].houses[row.house.id]=true;
    });
  });
  buckets.forEach(function(bucket){bucket.count=Object.keys(bucket.houses).length;delete bucket.houses;});
  return buckets;
}

function moveFinanceMonth(delta){ state.financeMonth=addMonths(state.financeMonth||currentMonthStr(),delta); render(); }
function setFinanceMonth(value){ state.financeMonth=value||currentMonthStr(); render(); }
function setFinanceMode(value){ state.financeMode=value==='caixa'?'caixa':'competencia'; render(); }
function setFinanceSection(value){ state.financeSection=value||'visao'; render(); window.scrollTo(0,0); }
function setFinanceReportSort(value){ state.financeReportSort=value||'nome'; render(); }

function downloadFinanceCsv(){
  const mes=state.financeMonth||currentMonthStr(), info=computeMonthlyFinance(mes);
  const cash=(state.financeMode||'competencia')==='caixa';
  const rows=[cash
    ? ['Imóvel','Entradas no mês','Saídas no mês','Resultado do caixa']
    : ['Imóvel','Previsto','Recebido referente ao mês','A receber','Despesas','Resultado','Situação']];
  info.rows.forEach(function(r){
    rows.push(cash
      ? [r.house.nome,r.receivedCash,r.expenses,r.receivedCash-r.expenses]
      : [r.house.nome,r.expected,r.receivedCompetence,r.pending,r.expenses,
        r.receivedCompetence-r.expenses,financeStatusMeta(r.status).label]);
  });
  rows.push(cash
    ? ['TOTAL',info.receivedCash,info.expenses,info.receivedCash-info.expenses]
    : ['TOTAL',info.expected,info.receivedCompetence,info.pending,info.expenses,
      info.receivedCompetence-info.expenses,'']);
  const csv='\ufeff'+rows.map(function(row){return row.map(function(v){return '"'+String(v).replace(/"/g,'""')+'"';}).join(';');}).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a'); a.href=url; a.download='financeiro-'+mes+'.csv'; a.click(); URL.revokeObjectURL(url);
}

function downloadFinancePdf(){
  const mes=state.financeMonth||currentMonthStr(), info=computeMonthlyFinance(mes);
  const jsPDF=window.jspdf&&window.jspdf.jsPDF; if(!jsPDF){showToast('Gerador de PDF indisponível.','error');return;}
  const cash=(state.financeMode||'competencia')==='caixa';
  const doc=new jsPDF(); let y=22;
  doc.setFontSize(18); doc.text('Resumo financeiro — '+monthLabel(mes),14,y); y+=11;
  doc.setFontSize(10);
  doc.text(cash
    ? 'Entradas: '+fmtMoney(info.receivedCash)+'  |  Saídas: '+fmtMoney(info.expenses)+'  |  Resultado do caixa: '+fmtMoney(info.receivedCash-info.expenses)
    : 'Previsto: '+fmtMoney(info.expected)+'  |  Recebido referente: '+fmtMoney(info.receivedCompetence)+'  |  Despesas: '+fmtMoney(info.expenses),
  14,y); y+=12;
  info.rows.forEach(function(r){
    if(y>275){doc.addPage();y=20;}
    doc.setFontSize(11); doc.text(r.house.nome,14,y); doc.setFontSize(9);
    doc.text(cash
      ? 'Entradas '+fmtMoney(r.receivedCash)+' | Saídas '+fmtMoney(r.expenses)+' | Resultado do caixa '+fmtMoney(r.receivedCash-r.expenses)
      : 'Previsto '+fmtMoney(r.expected)+' | Recebido referente '+fmtMoney(r.receivedCompetence)+' | A receber '+fmtMoney(r.pending)+' | Despesas '+fmtMoney(r.expenses)+' | Resultado '+fmtMoney(r.receivedCompetence-r.expenses),
    14,y+5); y+=13;
  });
  doc.save('financeiro-'+mes+'.pdf');
}
function downloadAnnualFinanceCsv(){
  const year=state.relatorioAno;
  const rows=[['Imóvel','Previsto','Recebido','Pendente','Despesas','Resultado líquido','Ocupação (%)','Atrasos','Dias vagos','Dias em manutenção']];
  state.houses.forEach(function(h){
    const report=computeHouseAnnualReport(h,year);
    rows.push([h.nome,report.previstoAno,report.recebidoCompetenciaAno,report.pendenteAno,
      report.despesasTotal,report.saldo,report.taxaOcupacao,report.atrasosAno,
      report.diasVago,report.diasManutencao]);
  });
  const totals=computeAnnualTotals(year);
  rows.push(['TOTAL',totals.previsto,totals.recebido,totals.pendente,totals.despesas,totals.saldo,'','','','']);
  const csv='\ufeff'+rows.map(function(row){
    return row.map(function(value){return '"'+String(value).replace(/"/g,'""')+'"';}).join(';');
  }).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download='relatorio-anual-'+year+'.csv';
  anchor.click();URL.revokeObjectURL(url);
}
function downloadAnnualFinancePdf(){
  const year=state.relatorioAno,totals=computeAnnualTotals(year);
  const jsPDF=window.jspdf&&window.jspdf.jsPDF;
  if(!jsPDF){showToast('Gerador de PDF indisponível.','error');return;}
  const doc=new jsPDF();let y=22;
  doc.setFontSize(18);doc.text('Relatório financeiro anual — '+year,14,y);y+=11;
  doc.setFontSize(10);doc.text('Previsto: '+fmtMoney(totals.previsto)+'  |  Recebido: '+fmtMoney(totals.recebido)+
    '  |  Pendente: '+fmtMoney(totals.pendente),14,y);y+=6;
  doc.text('Despesas: '+fmtMoney(totals.despesas)+'  |  Resultado líquido: '+fmtMoney(totals.saldo),14,y);y+=12;
  state.houses.forEach(function(h){
    const report=computeHouseAnnualReport(h,year);
    if(y>272){doc.addPage();y=20;}
    doc.setFontSize(11);doc.text(h.nome,14,y);doc.setFontSize(9);
    doc.text('Previsto '+fmtMoney(report.previstoAno)+' | Recebido '+fmtMoney(report.recebidoCompetenciaAno)+
      ' | Pendente '+fmtMoney(report.pendenteAno)+' | Despesas '+fmtMoney(report.despesasTotal),14,y+5);
    doc.text('Resultado '+fmtMoney(report.saldo)+' | Ocupação '+report.taxaOcupacao+'% | Atrasos '+report.atrasosAno,14,y+10);
    y+=17;
  });
  doc.save('relatorio-anual-'+year+'.pdf');
}

function renderMonthlyFinanceTable(info){
  const mode=state.financeMode||'competencia';
  const cashByHouse={};
  if(mode==='caixa'){
    financeReceiptRows(state.financeMonth||currentMonthStr()).forEach(function(item){
      const key=item.house.id;
      if(!cashByHouse[key]) cashByHouse[key]=[];
      cashByHouse[key].push(item.receipt);
    });
  }
  const rows=info.rows.slice().sort(function(a,b){
    if(mode==='caixa') return String(a.house.nome||'').localeCompare(String(b.house.nome||''),'pt-BR');
    const ar=financeStatusMeta(a.status).rank,br=financeStatusMeta(b.status).rank;
    if(ar!==br) return ar-br;
    return String(a.house.nome||'').localeCompare(String(b.house.nome||''),'pt-BR');
  });
  return '<div class="finance-table">'+rows.map(function(r){
    const t=tenantOf(r.house);
    if(mode==='caixa'){
      const activities=cashByHouse[r.house.id]||[];
      const latest=activities.map(function(receipt){return receipt.dataPagamento||'';}).filter(Boolean).sort().pop()||'';
      return '<button class="finance-row finance-row-cash" onclick="openHouse(\''+r.house.id+'\',\'pagamentos\')">'+
        '<div class="finance-house"><strong>'+esc(r.house.nome)+'</strong><span>'+esc(t?t.nome:'Sem inquilino')+'</span></div>'+
        '<div><span>Entradas no mês</span><strong class="num brass">'+fmtMoney(r.receivedCash)+'</strong></div>'+
        '<div><span>Saídas no mês</span><strong class="num rust">'+fmtMoney(r.expenses)+'</strong></div>'+
        '<div><span>Resultado do caixa</span><strong class="num '+(r.receivedCash-r.expenses<0?'rust':'')+'">'+fmtMoney(r.receivedCash-r.expenses)+'</strong></div>'+
        '<div><span>Recebimentos</span><strong class="num">'+activities.length+'</strong></div>'+
        '<div><span>Última entrada</span><strong>'+esc(latest?fmtDateBR(latest):'—')+'</strong></div>'+
        '<span class="status-dot neutral">Fluxo de caixa</span>'+
      '</button>';
    }
    const status=financeStatusMeta(r.status);
    return '<button class="finance-row" onclick="openHouse(\''+r.house.id+'\',\'pagamentos\')">'+
      '<div class="finance-house"><strong>'+esc(r.house.nome)+'</strong><span>'+esc(t?t.nome:'Sem inquilino')+'</span></div>'+
      '<div><span>Previsto</span><strong class="num">'+fmtMoney(r.expected)+'</strong></div>'+
      '<div><span>Recebido</span><strong class="num brass">'+fmtMoney(r.received)+'</strong></div>'+
      '<div><span>A receber</span><strong class="num '+(r.pending?'rust':'')+'">'+fmtMoney(r.pending)+'</strong></div>'+
      '<div><span>Despesas</span><strong class="num rust">'+fmtMoney(r.expenses)+'</strong></div>'+
      '<div><span>Resultado</span><strong class="num '+(r.balance<0?'rust':'')+'">'+fmtMoney(r.balance)+'</strong></div>'+
      '<span class="status-dot '+status.tone+'">'+status.label+'</span>'+
    '</button>';
  }).join('')+'</div>';
}

function renderFinanceModeSwitch(){
  const mode=state.financeMode||'competencia';
  return '<div class="finance-mode-switch" role="group" aria-label="Critério dos valores">'+
    '<button class="'+(mode==='competencia'?'active':'')+'" onclick="setFinanceMode(\'competencia\')">'+
      '<strong>Referente ao mês</strong><small>Cobranças da competência, mesmo recebidas depois</small></button>'+
    '<button class="'+(mode==='caixa'?'active':'')+'" onclick="setFinanceMode(\'caixa\')">'+
      '<strong>Entradas e saídas</strong><small>Dinheiro movimentado dentro do mês</small></button>'+
  '</div>';
}
function renderFinanceMonthSwitcher(mes){
  return '<div class="month-switcher"><button onclick="moveFinanceMonth(-1)" aria-label="Mês anterior">←</button>'+
    '<input type="month" value="'+esc(mes)+'" onchange="setFinanceMonth(this.value)" aria-label="Mês de referência">'+
    '<button onclick="moveFinanceMonth(1)" aria-label="Próximo mês">→</button></div>';
}
function renderFinanceSectionNav(){
  const current=state.financeSection||'visao';
  const items=[['visao','Visão mensal'],['recebimentos','Recebimentos'],['despesas','Despesas'],['relatorios','Relatórios']];
  return '<div class="finance-section-nav" role="tablist">'+items.map(function(item){
    return '<button role="tab" aria-selected="'+(current===item[0]?'true':'false')+'" class="'+(current===item[0]?'active':'')+
      '" onclick="setFinanceSection(\''+item[0]+'\')">'+item[1]+'</button>';
  }).join('')+'</div>';
}
function computeFinanceChart12(){
  const end=state.financeMonth||currentMonthStr(),months=[];
  for(let i=11;i>=0;i--){
    const mes=addMonths(end,-i),info=computeMonthlyFinance(mes);
    months.push({mes:mes,expected:info.expected,received:info.received});
  }
  return months;
}
function renderFinanceCompareChart(chart){
  const max=Math.max(1,...chart.map(function(item){return Math.max(item.expected,item.received);}));
  return '<div class="finance-compare-chart">'+chart.map(function(item){
    const expectedHeight=Math.max(item.expected?4:1,Math.round(item.expected/max*100));
    const receivedHeight=Math.max(item.received?4:1,Math.round(item.received/max*100));
    return '<button class="finance-chart-group" onclick="setFinanceMonth(\''+item.mes+'\')" title="'+monthLabel(item.mes)+
      ' · Previsto '+fmtMoney(item.expected)+' · Recebido '+fmtMoney(item.received)+'">'+
      '<span class="finance-chart-bars"><i class="expected" style="height:'+expectedHeight+'%"></i>'+
      '<i class="received" style="height:'+receivedHeight+'%"></i></span>'+
      '<small>'+monthLabel(item.mes).split('/')[0].slice(0,3)+'</small></button>';
  }).join('')+'</div><div class="finance-chart-legend"><span><i class="expected"></i>Previsto</span>'+
    '<span><i class="received"></i>Recebido</span></div>';
}
function financeChargeTypeLabel(type){
  return type==='energia'?'Energia':type==='ajuste'?'Ajuste inicial':type==='aluguel'?'Aluguel':'Outra cobrança';
}
function financeReceiptRows(mes){
  const mode=state.financeMode||'competencia',rows=[];
  if(mode==='caixa'){
    state.houses.forEach(function(house){
      const storedCharges=activeFinanceRecords(house.cobrancas);
      const storedReceipts=activeFinanceRecords(house.recebimentos).filter(function(receipt){
        return String(receipt.dataPagamento||'').slice(0,7)===mes;
      });
      if(storedCharges.length||storedReceipts.length){
        const byId={};
        storedCharges.forEach(function(charge){byId[String(charge.id)]=charge;});
        storedReceipts.forEach(function(receipt){
          const raw=byId[String(receipt.cobrancaId)]||{
            id:receipt.cobrancaId||'recebimento-sem-cobranca',
            mes:String(receipt.competencia||receipt.dataPagamento||mes).slice(0,7),
            tipo:receipt.tipo||'outro',
            valorPrevisto:Number(receipt.valor)||0
          };
          const allReceipts=activeFinanceRecords(house.recebimentos).filter(function(item){
            return String(item.cobrancaId)===String(raw.id);
          });
          rows.push({house:house,charge:Object.assign({},raw,{
            expected:financeChargeExpected(raw),
            receipts:allReceipts,
            received:allReceipts.reduce(function(sum,item){return sum+(Number(item.valor)||0);},0)
          }),receipt:receipt});
        });
        return;
      }
      (house.pagamentos||[]).filter(function(payment){
        return payment.dataPagamento&&String(payment.dataPagamento).slice(0,7)===mes;
      }).forEach(function(payment){
        rows.push({house:house,charge:{
          id:'legacy-payment-'+(payment.id||payment.mes),
          mes:payment.mes||mes,
          tipo:'aluguel',
          expected:Number(payment.valorPrevisto)||Number(payment.valorPago)||0
        },receipt:{
          id:payment.id||'',
          valor:Number(payment.valorPago)||0,
          dataPagamento:payment.dataPagamento,
          forma:payment.forma||''
        }});
      });
      (house.energias||[]).filter(function(entry){
        return entry.pago&&String(entry.dataPagamento||'').slice(0,7)===mes;
      }).forEach(function(entry){
        rows.push({house:house,charge:{
          id:'legacy-energy-'+(entry.id||entry.mes),
          mes:entry.mes||mes,
          tipo:'energia',
          expected:Number(entry.valor)||0
        },receipt:{
          id:entry.id||'',
          valor:Number(entry.valor)||0,
          dataPagamento:entry.dataPagamento,
          forma:entry.forma||''
        }});
      });
      (house.contracts||[]).filter(function(contract){
        return contract.proporcionalPago&&String(contract.proporcionalDataPagamento||'').slice(0,7)===mes;
      }).forEach(function(contract){
        rows.push({house:house,charge:{
          id:'legacy-prorata-'+contract.id,
          mes:String(contract.inicio||mes).slice(0,7),
          tipo:'ajuste',
          expected:contractProrataValue(contract)
        },receipt:{
          id:'legacy-prorata-receipt-'+contract.id,
          valor:contractProrataValue(contract),
          dataPagamento:contract.proporcionalDataPagamento,
          forma:''
        }});
      });
    });
    rows.sort(function(a,b){return String(b.receipt.dataPagamento||'').localeCompare(String(a.receipt.dataPagamento||''));});
    return rows;
  }
  const info=computeMonthlyFinance(mes);
  info.rows.forEach(function(row){
    row.charges.forEach(function(charge){
      charge.receipts.forEach(function(receipt){
        rows.push({house:row.house,charge:charge,receipt:receipt});
      });
    });
  });
  rows.sort(function(a,b){return String(b.receipt.dataPagamento||'').localeCompare(String(a.receipt.dataPagamento||''));});
  return rows;
}
function openFinanceReceiptChooser(){
  if(!requireFinancePermission())return;
  const mes=state.financeMonth||currentMonthStr();
  const choices=[];
  state.houses.forEach(function(h){
    const charges=activeFinanceRecords(h.cobrancas).slice();
    /* As cobranças persistidas preservam meses anteriores; as sintéticas
       garantem que o mês selecionado continue disponível antes da primeira
       parcela. O id impede que a mesma cobrança apareça duas vezes. */
    financeChargesForHouse(h,mes).forEach(function(candidate){
      if(!charges.some(function(charge){return String(charge.id)===String(candidate.id);})) charges.push(candidate);
    });
    charges.forEach(function(raw){
      const receipts=financeChargeReceipts(h,raw);
      const expected=financeChargeExpected(raw);
      const received=receipts.reduce(function(sum,item){return sum+(Number(item.valor)||0);},0);
      if(expected<=0||received+0.005>=expected) return;
      choices.push({house:h,charge:raw,remaining:expected-received});
    });
  });
  choices.sort(function(a,b){
    return String(a.charge.vencimento||'').localeCompare(String(b.charge.vencimento||''))
      ||String(a.house.nome||'').localeCompare(String(b.house.nome||''),'pt-BR');
  });
  if(!choices.length){showToast('Não há cobranças em aberto.','success');return;}
  openModal('<h3 class="modal-title">Registrar recebimento</h3>'+
    '<p class="modal-text">Escolha a cobrança. Pagamentos parcelados ficam registrados separadamente.</p>'+
    '<div class="payment-choice-list">'+choices.map(function(item){
      const charge=item.charge;
      const action=charge.tipo==='energia'
        ? 'openEnergyReceiptModal(\''+item.house.id+'\',\''+(charge.competencia||charge.mes)+'\',\''+(charge.contractId||'')+'\')'
        : charge.tipo==='ajuste'
          ? 'openProrataPaymentModal(\''+item.house.id+'\',\''+(charge.contractId||'')+'\')'
          : 'openPaymentModal(\''+item.house.id+'\',\''+(charge.competencia||charge.mes)+'\',\''+(charge.contractId||'')+'\')';
      return '<button class="payment-choice" onclick="'+action+'"><span>'+esc(item.house.nome)+
        '<small>'+financeChargeTypeLabel(charge.tipo)+' · '+monthLabel(charge.competencia||charge.mes)+'</small></span>'+
        '<strong class="num">'+fmtMoney(item.remaining)+'</strong></button>';
    }).join('')+'</div><div class="modal-actions"><span></span><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button></div>');
}
function openFinanceExpenseChooser(){
  if(!requireFinancePermission())return;
  if(!state.houses.length){showToast('Cadastre um imóvel antes da despesa.','error');return;}
  openModal('<h3 class="modal-title">Registrar despesa</h3><p class="modal-text">Escolha o imóvel relacionado.</p>'+
    '<div class="payment-choice-list">'+state.houses.map(function(h){
      return '<button class="payment-choice" onclick="closeModal();openExpenseModal(\''+h.id+'\')"><span>'+esc(h.nome)+'</span><strong>Continuar</strong></button>';
    }).join('')+'</div><div class="modal-actions"><span></span><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button></div>');
}
function renderFinanceOverview(mes,month){
  const mode=state.financeMode||'competencia';
  if(mode==='caixa'){
    return '<div class="section-header"><div><h2 class="section-title">Fluxo de caixa mensal</h2>'+
        '<p class="page-sub">Somente dinheiro que entrou e saiu durante '+monthLabel(mes)+'.</p></div>'+
        renderFinanceMonthSwitcher(mes)+'</div>'+
      renderFinanceModeSwitch()+
      '<div class="stat-grid">'+
        statCard('Entradas no mês',fmtMoney(month.receivedCash),'recebimentos pela data do pagamento','brass')+
        statCard('Saídas no mês',fmtMoney(month.expenses),'despesas registradas no mês',month.expenses?'rust':null)+
        statCard('Resultado do caixa',fmtMoney(month.receivedCash-month.expenses),'entradas − saídas',month.receivedCash-month.expenses<0?'rust':'brass')+
      '</div>'+
      '<div class="panel"><div class="panel-title">Fluxo de caixa por imóvel</div>'+renderMonthlyFinanceTable(month)+'</div>';
  }
  const ageing=computeAgeing(mes,month),chart=computeFinanceChart12();
  return '<div class="section-header"><div><h2 class="section-title">Visão mensal</h2>'+
      '<p class="page-sub">Valores vinculados às cobranças de '+monthLabel(mes)+'.</p></div>'+
      renderFinanceMonthSwitcher(mes)+'</div>'+
    renderFinanceModeSwitch()+
    '<div class="stat-grid finance-summary-grid">'+
      statCard('Previsto',fmtMoney(month.expected),energyModuleEnabled()?'aluguel + energia':'aluguéis','brass')+
      statCard('Recebido referente',fmtMoney(month.receivedCompetence),
        month.expected?Math.round(month.received/month.expected*100)+'% do previsto':'sem previsão',null)+
      statCard('A receber',fmtMoney(month.pending),month.pending?'cobranças ainda abertas':'nenhuma pendência',month.pending?'rust':'brass')+
      statCard('Despesas',fmtMoney(month.expenses),'registradas no mês',month.expenses?'rust':null)+
      statCard('Resultado líquido',fmtMoney(month.receivedCompetence-month.expenses),'receitas recebidas − despesas',month.receivedCompetence-month.expenses<0?'rust':'brass')+
    '</div>'+
    '<div class="panel"><div class="panel-title">Resultado por imóvel</div>'+renderMonthlyFinanceTable(month)+'</div>'+
    '<div class="panel"><div class="panel-title">Pendências por vencimento</div><div class="ageing-grid">'+ageing.map(function(bucket){
      return '<div class="ageing-card"><span>'+bucket.label+'</span><strong class="num">'+fmtMoney(bucket.value)+'</strong>'+
        '<small>'+bucket.count+' imóvel(is)</small></div>';
    }).join('')+'</div></div>'+
    '<div class="panel"><div class="panel-title">Previsto × recebido nos últimos 12 meses</div>'+renderFinanceCompareChart(chart)+'</div>';
}
function renderFinanceReceipts(mes,month){
  const mode=state.financeMode||'competencia';
  const rows=financeReceiptRows(mes);
  const pending=mode==='caixa'?[]:month.rows.reduce(function(list,row){
    return list.concat(row.charges.filter(function(charge){return charge.received+0.005<charge.expected;}).map(function(charge){
      return {house:row.house,charge:charge};
    }));
  },[]);
  return '<div class="section-header"><div><h2 class="section-title">Recebimentos</h2>'+
      '<p class="page-sub">Parcelas e recebimentos ficam ligados à cobrança original.</p></div>'+
       '<div class="header-actions">'+renderFinanceMonthSwitcher(mes)+
       (canManageFinance()?'<button class="btn btn-primary btn-sm" onclick="openFinanceReceiptChooser()">Registrar recebimento</button>':'')+'</div></div>'+
    renderFinanceModeSwitch()+
    (mode==='caixa'?'':'<div class="panel"><div class="panel-title">Cobranças em aberto</div>'+
      (pending.length?'<div class="ledger">'+pending.map(function(item){
        const missing=Math.max(0,item.charge.expected-item.charge.received);
        const timeStatus=openChargeTimeStatus(item.charge.due,item.charge.graceDays);
        return '<button class="ledger-row" onclick="openHouse(\''+item.house.id+'\',\'pagamentos\')"><div class="ledger-row-main">'+
          esc(item.house.nome)+' · '+financeChargeTypeLabel(item.charge.tipo)+
          '<div class="ledger-row-sub">'+monthLabel(item.charge.mes)+' · '+financeStatusMeta(item.charge.received>0?'pagamento_parcial':timeStatus==='pendente'?'a_vencer':timeStatus).label+'</div></div>'+
          '<div class="ledger-row-value num rust">'+fmtMoney(missing)+'</div></button>';
      }).join('')+'</div>':'<div class="empty-state">Nenhuma cobrança em aberto neste mês.</div>')+'</div>')+
    '<div class="panel"><div class="panel-title">Recebimentos registrados</div>'+
      (rows.length?'<div class="ledger">'+rows.map(function(item){
        return '<button class="ledger-row" onclick="openHouse(\''+item.house.id+'\',\'pagamentos\')"><div class="ledger-row-main">'+
          esc(item.house.nome)+' · '+financeChargeTypeLabel(item.charge.tipo)+
          '<div class="ledger-row-sub">'+fmtDateBR(item.receipt.dataPagamento)+' · referente a '+monthLabel(item.charge.mes)+
          (item.receipt.forma?' · '+esc(item.receipt.forma):'')+'</div></div>'+
          '<div class="ledger-row-value num brass">'+fmtMoney(item.receipt.valor)+'</div></button>';
      }).join('')+'</div>':'<div class="empty-state">Nenhum recebimento encontrado para este critério.</div>')+'</div>';
}
function renderFinanceExpenses(mes,month){
  const rows=[];
  state.houses.forEach(function(h){
    activeFinanceRecords(h.despesas).filter(function(expense){return String(expense.data||'').slice(0,7)===mes;})
      .forEach(function(expense){rows.push({house:h,expense:expense});});
  });
  rows.sort(function(a,b){return String(b.expense.data||'').localeCompare(String(a.expense.data||''));});
  return '<div class="section-header"><div><h2 class="section-title">Despesas</h2>'+
      '<p class="page-sub">Despesas financeiras separadas dos chamados de manutenção.</p></div>'+
      '<div class="header-actions">'+renderFinanceMonthSwitcher(mes)+
      (canManageFinance()?'<button class="btn btn-primary btn-sm" onclick="openFinanceExpenseChooser()">Registrar despesa</button>':'')+'</div></div>'+
    '<div class="stat-grid">'+statCard('Despesas em '+monthLabel(mes),fmtMoney(month.expenses),
      rows.length+' registro(s)',month.expenses?'rust':null)+'</div>'+
    '<div class="panel">'+(rows.length?'<div class="ledger">'+rows.map(function(item){
      return '<button class="ledger-row" onclick="openExpenseModal(\''+item.house.id+'\',\''+(item.expense.id||'')+'\')"><div class="ledger-row-main">'+
        esc(item.expense.descricao||'Despesa')+' · '+esc(item.house.nome)+
        '<div class="ledger-row-sub">'+fmtDateBR(item.expense.data)+' · '+esc(item.expense.categoria||'Outros')+
        (item.expense.prestador?' · '+esc(item.expense.prestador):'')+'</div></div>'+
        '<div class="ledger-row-value num rust">'+fmtMoney(item.expense.valor)+'</div></button>';
    }).join('')+'</div>':'<div class="empty-state">Nenhuma despesa registrada neste mês.</div>')+'</div>';
}
function renderFinanceReports(){
  const tot=computeAnnualTotals(state.relatorioAno),sort=state.financeReportSort||'nome';
  const houses=state.houses.slice().sort(function(a,b){
    const ar=computeHouseAnnualReport(a,state.relatorioAno),br=computeHouseAnnualReport(b,state.relatorioAno);
    if(sort==='receita') return br.recebidoCompetenciaAno-ar.recebidoCompetenciaAno;
    if(sort==='resultado') return br.saldo-ar.saldo;
    if(sort==='despesa') return br.despesasTotal-ar.despesasTotal;
    if(sort==='vagos') return br.diasVago-ar.diasVago;
    if(sort==='atrasos') return br.atrasosAno-ar.atrasosAno;
    return String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR');
  });
  return '<div class="section-header"><div><h2 class="section-title">Relatório anual</h2>'+
      '<p class="page-sub">Receita potencial, recebimentos, despesas, ocupação e atrasos.</p></div>'+
      '<div class="header-actions"><button class="btn btn-ghost btn-sm" onclick="downloadAnnualFinanceCsv()">Exportar planilha</button>'+
        '<button class="btn btn-ghost btn-sm" onclick="downloadAnnualFinancePdf()">Resumo PDF</button></div></div>'+
    '<div class="report-toolbar"><div class="year-switcher"><button onclick="mudarAnoRelatorio(-1)" aria-label="Ano anterior">←</button>'+
      '<span class="num">'+state.relatorioAno+'</span><button onclick="mudarAnoRelatorio(1)" aria-label="Próximo ano">→</button></div>'+
      '<label class="field-inline"><span>Ordenar por</span><select onchange="setFinanceReportSort(this.value)">'+
        [['nome','Nome'],['receita','Maior receita'],['resultado','Maior resultado'],['despesa','Maior despesa'],['vagos','Mais dias vagos'],['atrasos','Mais atrasos']].map(function(item){
          return '<option value="'+item[0]+'"'+(sort===item[0]?' selected':'')+'>'+item[1]+'</option>';
        }).join('')+'</select></label></div>'+
    '<div class="stat-grid finance-summary-grid">'+
      statCard('Receita prevista',fmtMoney(tot.previsto),'no ano',null)+
      statCard('Receita recebida',fmtMoney(tot.recebido),'referente ao ano','brass')+
      statCard('Valor pendente',fmtMoney(tot.pendente),'cobranças do ano',tot.pendente?'rust':null)+
      statCard('Despesas',fmtMoney(tot.despesas),'no ano',tot.despesas?'rust':null)+
      statCard('Resultado líquido',fmtMoney(tot.saldo),'recebido − despesas',tot.saldo<0?'rust':'brass')+
    '</div>'+
    '<div class="panel panel-collapsible"><button class="panel-toggle" aria-expanded="'+(state.reportListExpanded?'true':'false')+'" onclick="toggleReportList()">'+
      '<span class="panel-title-inline">Detalhe anual por imóvel'+(houses.length?'<span class="alert-badge badge-neutral">'+houses.length+'</span>':'')+'</span>'+
      '<span class="panel-chevron">'+(state.reportListExpanded?'▾':'▸')+'</span></button>'+
      (state.reportListExpanded?'<div class="panel-body">'+(houses.length?'<div class="annual-report">'+houses.map(renderAnnualHouseRow).join('')+
        '</div>':'<div class="empty-state">Nenhum imóvel para relatar.</div>')+'</div>':'')+'</div>';
}
function renderFinanceiroView(){
  const mes=state.financeMonth||currentMonthStr(),month=computeMonthlyFinance(mes),section=state.financeSection||'visao';
  const content=section==='recebimentos'?renderFinanceReceipts(mes,month):
    section==='despesas'?renderFinanceExpenses(mes,month):
    section==='relatorios'?renderFinanceReports():renderFinanceOverview(mes,month);
  return '<div class="page-header"><div><div class="eyebrow">FINANCEIRO</div>'+
      pageTitleWithIcon(financeIconSvg(),'Gestão financeira')+
      '<div class="page-sub">Cobranças, recebimentos, despesas e resultados com critérios claros.</div></div></div>'+
    renderFinanceSectionNav()+content;
}
