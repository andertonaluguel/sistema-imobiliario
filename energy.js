/* ============================================================
   energy.js — visão central de energia de todos os imóveis.
   ============================================================ */

function setEnergyMonth(value){ state.energiaMes=value||currentMonthStr(); render(); }
function moveEnergyMonth(delta){ state.energiaMes=addMonths(state.energiaMes||currentMonthStr(),delta); render(); }
function setEnergyFilter(value){ state.energyFilter=value||'todos'; render(); }
function setEnergySearch(value){ state.energySearch=String(value||''); render(); }

function energyChargeForMonth(h,mes,entry,contract){
  return (h.cobrancas||[]).find(function(charge){
    if(charge.arquivadoEm||charge.arquivado_em) return false;
    if(charge.tipo!=='energia'||charge.mes!==mes) return false;
    if(entry&&charge.origemId) return charge.origemId===entry.id;
    if(contract&&charge.contractId) return charge.contractId===contract.id;
    return true;
  })||null;
}
function energyReceiptsForCharge(h,charge){
  if(!charge) return [];
  return (h.recebimentos||[]).filter(function(receipt){
    return receipt.cobrancaId===charge.id && !(receipt.arquivadoEm||receipt.arquivado_em);
  });
}
function energyStageInfo(row){
  if(!row.contract&&!row.entry) return {id:'nao_aplica',label:'Não se aplica',tone:'neutral',rank:6};
  if(!row.entry) return {id:'leitura_pendente',label:'Leitura pendente',tone:'rust',rank:0};
  if(row.recebido>0&&row.recebido+0.005<row.valorCobrado){
    const due=(row.charge&&row.charge.vencimento)||(row.entry&&row.entry.vencimento);
    const grace=row.charge&&row.charge.toleranciaDias!=null
      ?row.charge.toleranciaDias:DEFAULT_PAYMENT_GRACE_DAYS;
    if(openChargeTimeStatus(due,grace)==='atrasado'){
      return {id:'pagamento_parcial_em_atraso',label:'Pagamento parcial em atraso',tone:'rust',rank:0};
    }
    return {id:'pagamento_parcial',label:'Pagamento parcial',tone:'warn',rank:1};
  }
  if(row.valorCobrado>0&&row.recebido+0.005>=row.valorCobrado){
    return {id:'valor_recebido',label:'Valor recebido',tone:'pago',rank:5};
  }
  if(row.charge || !Array.isArray(row.house.cobrancas)){
    return {id:'cobranca_gerada',label:'Cobrança gerada',tone:'pendente',rank:2};
  }
  if(Number(row.entry.valorCalculado)>0||Number(row.entry.valor)>0){
    return {id:'valor_calculado',label:'Valor calculado',tone:'warn',rank:3};
  }
  return {id:'leitura_registrada',label:'Leitura registrada',tone:'neutral',rank:4};
}

function computeEnergyMonth(mes){
  const rows=state.houses.filter(houseEnergyEnabled).map(function(h){
    const contract=contractForEnergyMonth(h,mes);
    const e=energiaDoMes(h,mes,contract&&contract.id);
    const charge=energyChargeForMonth(h,mes,e,contract);
    const receipts=energyReceiptsForCharge(h,charge);
    const valor=e?Number(e.valor)||0:0;
    const valorCobrado=charge?Number(charge.valorPrevisto)||0:valor;
    const recebido=charge
      ? receipts.reduce(function(sum,item){return sum+(Number(item.valor)||0);},0)
      : e&&e.pago?valor:0;
    const row={house:h,contract:contract,entry:e,charge:charge,receipts:receipts,
      valor:valor,kwh:e?Number(e.kwh)||0:0,valorCobrado:valorCobrado,
      recebido:recebido,pago:valorCobrado>0&&recebido+0.005>=valorCobrado};
    row.stage=energyStageInfo(row);
    return row;
  });
  return {
    rows:rows,
    lancado:rows.reduce(function(s,r){return s+r.valorCobrado;},0),
    recebido:rows.reduce(function(s,r){return s+r.recebido;},0),
    kwh:rows.reduce(function(s,r){return s+r.kwh;},0),
    leiturasPendentes:rows.filter(function(r){return r.stage.id==='leitura_pendente';}).length,
    pagamentosPendentes:rows.filter(function(r){
      return r.stage.id==='cobranca_gerada'
        ||r.stage.id==='pagamento_parcial'
        ||r.stage.id==='pagamento_parcial_em_atraso';
    }).length
  };
}

/* ------------------------------------------------------------------
   Consumo fora do padrão — o uso mais prático do módulo.

   Vazamento e ligação clandestina aparecem como salto no consumo
   de UMA casa. Comparar com a média das outras não serve: casa de
   dois cômodos e casa de cinco gastam diferente por natureza. O
   que denuncia é a casa fugir do próprio histórico.

   Regras, por ordem de gravidade:
     alta   consumo 60% acima da média dos meses anteriores
     alta   consumo caiu mais de 70% (medidor parado, leitura errada
            ou casa desocupada sem ninguém avisar)
     media  consumo 30% acima da média

   Exige pelo menos 3 meses de histórico: com menos, "média" é
   chute e o alerta viraria ruído.
   ------------------------------------------------------------------ */
const ENERGIA_MIN_HISTORICO = 3;

function computeEnergyAnomalias(mes){
  const achados = [];

  state.houses.filter(houseEnergyEnabled).forEach(function(h){
    const atual = energiaDoMes(h, mes);
    const kwhAtual = atual ? Number(atual.kwh)||0 : 0;
    if(!atual || !kwhAtual) return;   /* sem lançamento não há o que comparar */
    const contractId=atual.contractId||'';
    /* Registro legado sem contrato não pode ser comparado com segurança
       quando a casa já teve mais de um morador. Isso evita transformar
       uma troca de inquilino em falso alerta de vazamento. */
    if(!contractId && (h.contracts||[]).length>1) return;

    /* histórico: até 6 meses antes do mês analisado, só os que têm
       leitura de verdade e pertencem ao mesmo contrato/morador */
    const historico = [];
    for(let i=1;i<=6;i++){
      const m = addMonths(mes,-i);
      const e = (h.energias||[]).find(function(item){
        if(item.mes!==m) return false;
        return contractId ? item.contractId===contractId : !item.contractId;
      });
      const k = e ? Number(e.kwh)||0 : 0;
      if(k>0) historico.push(k);
    }
    if(historico.length < ENERGIA_MIN_HISTORICO) return;

    const media = historico.reduce(function(s,k){ return s+k; },0) / historico.length;
    if(media <= 0) return;
    const variacao = ((kwhAtual - media) / media) * 100;

    let nivel = null, texto = '';
    if(variacao >= 60){
      nivel='alta';
      texto='Consumo '+Math.round(variacao)+'% acima da média desta casa. Vale checar vazamento ou ligação irregular.';
    } else if(variacao <= -70){
      nivel='alta';
      texto='Consumo '+Math.round(Math.abs(variacao))+'% abaixo da média. Pode ser medidor parado, leitura trocada ou casa vazia.';
    } else if(variacao >= 30){
      nivel='media';
      texto='Consumo '+Math.round(variacao)+'% acima da média desta casa.';
    }
    if(!nivel) return;

    achados.push({
      house:h, nivel:nivel, texto:texto,
      kwh:kwhAtual, media:Math.round(media),
      meses:historico.length, variacao:variacao
    });
  });

  /* mais grave primeiro; dentro do mesmo nível, maior desvio */
  achados.sort(function(a,b){
    if(a.nivel!==b.nivel) return a.nivel==='alta' ? -1 : 1;
    return Math.abs(b.variacao) - Math.abs(a.variacao);
  });
  return achados;
}

function renderEnergyAnomalias(mes){
  const lista = computeEnergyAnomalias(mes);
  if(!lista.length) return '';
  return '<div class="panel energy-anomalias">'+
    '<div class="panel-title-inline">Consumo fora do padrão'+
      '<span class="alert-badge">'+lista.length+'</span></div>'+
    '<div class="anomalia-list">'+lista.map(function(a){
      return '<button class="anomalia-row anomalia-'+a.nivel+'" '+
        'onclick="openEnergiaModalFromView(\''+a.house.id+'\',\''+mes+'\')">'+
        '<span class="anomalia-ico" aria-hidden="true">'+(a.nivel==='alta'?'!':'~')+'</span>'+
        '<span class="anomalia-corpo">'+
          '<strong>'+esc(a.house.nome)+'</strong>'+
          '<span>'+esc(a.texto)+'</span>'+
          '<small>'+a.kwh.toLocaleString('pt-BR')+' kWh neste mês · média de '+
            a.media.toLocaleString('pt-BR')+' kWh nos últimos '+a.meses+' meses</small>'+
        '</span></button>';
    }).join('')+'</div></div>';
}

function renderEnergyTrend(){
  const months=[];
  for(let i=11;i>=0;i--){
    const mes=addMonths(state.energiaMes||currentMonthStr(),-i), info=computeEnergyMonth(mes);
    months.push({mes:mes,kwh:info.kwh,valor:info.lancado});
  }
  const max=Math.max(1,...months.map(function(x){return x.kwh;}));
  if(!months.some(function(x){return x.kwh>0;})){
    return '<div class="empty-state"><strong>Ainda não há leituras suficientes para formar o histórico.</strong>'+
      '<span>Registre a primeira leitura para começar a acompanhar o consumo.</span>'+
      (canOperateProperties()
        ? '<button class="btn btn-primary btn-sm" onclick="openFirstEnergyModal()">Registrar primeira leitura</button>'
        : '')+'</div>';
  }
  return '<div class="energy-chart">'+months.map(function(x){
    const pct=Math.max(3,Math.round(x.kwh/max*100));
    return '<button class="energy-column" onclick="setEnergyMonth(\''+x.mes+'\')" title="'+monthLabel(x.mes)+': '+x.kwh+' kWh"><span class="energy-bar" style="height:'+pct+'%"></span><small>'+monthLabel(x.mes).split('/')[0].slice(0,3)+'</small></button>';
  }).join('')+'</div>';
}

function renderEnergiaView(){
  if(!energyModuleEnabled()) return '<div class="empty-state">O módulo Energia está desativado. Você pode ativá-lo em Menu → Meus dados.</div>';
  const mes=state.energiaMes||currentMonthStr(), info=computeEnergyMonth(mes);
  const query=String(state.energySearch||'').trim().toLowerCase();
  const filter=state.energyFilter||'todos';
  const active=info.rows.filter(function(r){return r.contract||r.entry;}).filter(function(r){
    const tenant=r.contract?contractTenant(r.contract):tenantOf(r.house);
    const matchesSearch=!query||(r.house.nome+' '+(r.house.endereco||'')+' '+(tenant?tenant.nome:'')).toLowerCase().includes(query);
    const matchesFilter=filter==='todos'||r.stage.id===filter;
    return matchesSearch&&matchesFilter;
  }).sort(function(a,b){
    if(a.stage.rank!==b.stage.rank) return a.stage.rank-b.stage.rank;
    return String(a.house.nome||'').localeCompare(String(b.house.nome||''),'pt-BR');
  });
  const filters=[
    ['todos','Todos'],
    ['leitura_pendente','Leitura pendente'],
    ['valor_calculado','Valor calculado'],
    ['cobranca_gerada','Aguardando pagamento'],
    ['pagamento_parcial','Pagamento parcial'],
    ['pagamento_parcial_em_atraso','Parcial em atraso'],
    ['valor_recebido','Concluídos']
  ];
  return '<div class="page-header"><div><div class="eyebrow">ENERGIA</div>'+pageTitleWithIcon(financeIconSvg(),'Energia dos imóveis')+
      '<p class="page-sub">Leituras, cálculos, cobranças e recebimentos em etapas claras.</p></div>'+
      '<div class="month-switcher"><button onclick="moveEnergyMonth(-1)" aria-label="Mês anterior">←</button>'+
        '<input type="month" value="'+esc(mes)+'" onchange="setEnergyMonth(this.value)"><button onclick="moveEnergyMonth(1)" aria-label="Próximo mês">→</button></div></div>'+
    '<div class="stat-grid energy-stats">'+
      statCard('Cobrado',fmtMoney(info.lancado),monthLabel(mes),'warn')+
      statCard('Recebido',fmtMoney(info.recebido),info.lancado?Math.round(info.recebido/info.lancado*100)+'% do cobrado':'sem cobranças','brass')+
      statCard('Consumo',info.kwh.toLocaleString('pt-BR')+' kWh','todos os imóveis',null)+
      statCard('Leituras pendentes',String(info.leiturasPendentes),plural(info.pagamentosPendentes,'pagamento','pagamentos')+' em aberto',info.leiturasPendentes?'rust':null)+
    '</div>'+
    renderEnergyAnomalias(mes)+
    '<div class="panel"><div class="panel-title">Consumo nos últimos 12 meses</div>'+renderEnergyTrend()+'</div>'+
    '<div class="section-header"><div><h2 class="section-title">Imóveis em '+monthLabel(mes)+'</h2><p class="page-sub">Pendências aparecem primeiro.</p></div>'+
      (canOperateProperties()?'<button class="btn btn-primary btn-sm" onclick="openFirstEnergyModal()">Registrar leitura</button>':'')+'</div>'+
    '<div class="toolbar energy-toolbar"><div class="search-wrap"><span class="search-ico">⌕</span>'+
      '<input class="search-input" placeholder="Buscar imóvel, inquilino ou endereço…" value="'+esc(state.energySearch||'')+'" oninput="setEnergySearch(this.value)"></div>'+
      '<div class="filter-chips">'+filters.map(function(item){
        return '<button class="filter-chip'+(filter===item[0]?' active':'')+'" onclick="setEnergyFilter(\''+item[0]+'\')">'+item[1]+'</button>';
      }).join('')+'</div></div>'+
    '<div class="panel energy-table">'+(active.length?active.map(function(r){
      const t=r.contract?contractTenant(r.contract):tenantOf(r.house);
      const previous=r.entry?Number(r.entry.leituraAnterior)||0:null;
      const current=r.entry?Number(r.entry.leituraAtual)||0:null;
      const canReceive=canManageFinance()&&r.entry&&r.valorCobrado>0;
      const readingButton=r.entry
        ? '<button class="btn btn-ghost btn-sm" onclick="openEnergiaModalFromView(\''+r.house.id+'\',\''+mes+'\')">'+
            (canOperateProperties()?'Editar leitura':'Ver leitura')+'</button>'
        : (canOperateProperties()
            ? '<button class="btn btn-ghost btn-sm" onclick="openEnergiaModalFromView(\''+r.house.id+'\',\''+mes+'\')">Registrar leitura</button>'
            : '');
      const receiveLabel=r.stage.id==='pagamento_parcial'||r.stage.id==='pagamento_parcial_em_atraso'
        ?'Registrar outra parcela':
        r.stage.id==='valor_recebido'?'Ver recebimentos':'Registrar recebimento';
      return '<div class="energy-row energy-row-operational">'+
        '<div class="energy-house"><strong>'+esc(r.house.nome)+'</strong><span>'+esc(t?t.nome:(r.house.status==='vaga'?'Casa vaga':'Sem inquilino'))+'</span></div>'+
        '<div><span class="table-label">Leitura</span><strong class="num">'+(r.entry?current.toLocaleString('pt-BR'):'—')+'</strong>'+
          (r.entry?'<small>'+previous.toLocaleString('pt-BR')+' → '+current.toLocaleString('pt-BR')+'</small>':'<small>Pendente</small>')+'</div>'+
        '<div><span class="table-label">Consumo</span><strong class="num">'+(r.entry?r.kwh.toLocaleString('pt-BR')+' kWh':'—')+'</strong></div>'+
        '<div><span class="table-label">Cobrança</span><strong class="num">'+(r.valorCobrado?fmtMoney(r.valorCobrado):'—')+'</strong>'+
          (r.recebido?'<small>Recebido '+fmtMoney(r.recebido)+'</small>':'')+'</div>'+
        '<span class="status-dot '+r.stage.tone+'">'+r.stage.label+'</span>'+
        '<div class="header-actions">'+
          (canReceive?'<button class="btn '+(r.stage.id==='valor_recebido'?'btn-ghost':'btn-primary')+' btn-sm" onclick="openEnergyReceiptModal(\''+r.house.id+'\',\''+mes+'\',\''+(r.contract?r.contract.id:'')+'\')">'+receiveLabel+'</button>':'')+
          readingButton+
        '</div>'+
      '</div>';
    }).join(''):emptyState(query||filter!=='todos'?'Nenhum imóvel corresponde aos filtros.':'Nenhum imóvel para exibir neste mês.',financeIconSvg()))+'</div>';
}

function openEnergiaModalFromView(houseId,mes){ openEnergiaModal(houseId,mes); }
function openFirstEnergyModal(){
  if(!requirePropertyPermission())return;
  const houses=state.houses.filter(function(h){return h.status==='alugada'&&activeContract(h)&&houseEnergyEnabled(h);});
  if(!houses.length){showToast('Cadastre um contrato ativo antes de lançar energia.','error');return;}
  const options=houses.map(function(h){const t=tenantOf(h);return '<option value="'+h.id+'">'+esc(h.nome)+(t?' — '+esc(t.nome):'')+'</option>';}).join('');
  openModal('<h3 class="modal-title">Registrar leitura de energia</h3><p class="modal-text">Escolha o imóvel e o mês da leitura.</p>'+
    '<label class="field"><span>Casa</span><select id="f_energy_house">'+options+'</select></label>'+
    '<label class="field"><span>Mês</span><input id="f_energy_month" type="month" value="'+esc(state.energiaMes||currentMonthStr())+'"></label>'+
    '<div class="modal-actions"><span></span><div class="modal-actions-right"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-primary" onclick="openSelectedEnergyModal()">Continuar</button></div></div>');
}

function openSelectedEnergyModal(){
  if(!requirePropertyPermission())return;
  const houseId=document.getElementById('f_energy_house').value;
  const mes=document.getElementById('f_energy_month').value||currentMonthStr();
  const h=state.houses.find(function(x){return x.id===houseId;});
  const contract=contractForEnergyMonth(h,mes);
  if(!contract){showToast('Nenhum contrato desta casa cobre o mês escolhido.','error');return;}
  openEnergiaModal(houseId,mes,contract?contract.id:'');
}
