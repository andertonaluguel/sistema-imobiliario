/* ============================================================
   pending.js — Central de Pendências (Aluguéis)

   Regra central: NADA aqui é armazenado. Toda pendência é
   CALCULADA a partir dos dados que já existem (cobranças,
   recebimentos, contratos, energia e chamados de manutenção).

   A consequência é a que o produto precisa: quando a causa real
   é resolvida — o pagamento entra, o contrato é renovado, a
   leitura é lançada, a manutenção é concluída — a pendência
   desaparece sozinha, sem ninguém precisar "dar baixa".

   Sem sino de notificações, sem multa, sem juros, sem cobrança
   automática. Só o que exige ação, com o caminho para resolver.
   ============================================================ */

var PENDENCIA_TIPOS = [
  ['pagamento','Pagamento'],
  ['parcial','Pagamento parcial'],
  ['contrato','Contrato'],
  ['energia','Energia'],
  ['manutencao','Manutenção'],
  ['imovel','Imóvel']
];
var PENDENCIA_PRIORIDADES = [['alta','Alta'],['media','Média'],['baixa','Baixa']];
var PENDENCIA_SITUACOES = [['atrasado','Atrasada'],['atencao','Atenção'],['aberto','Aberta']];

/* Dias que uma manutenção pode ficar aberta antes de ser tratada como
   atrasada, quando ela ainda não tem prazo definido. */
var PENDENCIA_MANUTENCAO_LIMITE_DIAS = 30;

function pendenciaTipoLabel(v){
  const f=PENDENCIA_TIPOS.find(function(t){return t[0]===v;});
  return f?f[1]:'Pendência';
}
function pendenciaPrioridadeLabel(v){
  const f=PENDENCIA_PRIORIDADES.find(function(t){return t[0]===v;});
  return f?f[1]:'Média';
}
function pendenciaSituacaoLabel(v){
  const f=PENDENCIA_SITUACOES.find(function(t){return t[0]===v;});
  return f?f[1]:'Aberta';
}
function pendenciaPrioridadeRank(v){ return v==='alta'?0:v==='media'?1:2; }

function pendenciaDiasDesde(iso){
  if(!iso) return 0;
  const d=new Date(String(iso).slice(0,10)+'T00:00:00');
  if(isNaN(d.getTime())) return 0;
  const hoje=new Date(); hoje.setHours(0,0,0,0);
  return Math.floor((hoje-d)/86400000);
}

/* ------------------------------------------------------------
   Cálculo
   ------------------------------------------------------------ */
function computePendencias(){
  const itens=[];
  if(typeof temModulo==='function' && !temModulo('alugueis')) return itens;
  const overview=(typeof computeOverview==='function')?computeOverview():{cobrancas:[],contratosVencendo:[],manutList:[]};
  const mayFinance=(typeof canManageFinance==='function')?canManageFinance():false;
  const mayOperate=(typeof canOperateProperties==='function')?canOperateProperties():false;
  const cur=currentMonthStr();

  /* 1 e 2. Cobranças em aberto. Uma pendência por imóvel: se já houve
     pagamento parcial, ela vira "pagamento parcial" e mostra o saldo —
     em vez de repetir o imóvel em duas linhas. */
  (overview.cobrancas||[]).forEach(function(g){
    const h=state.houses.find(function(x){return x.id===g.houseId;});
    if(!h) return;
    const t=(typeof tenantOf==='function')?tenantOf(h):null;
    let recebido=0;
    (g.meses||[]).forEach(function(mes){
      const charge=(typeof chargeForMonth==='function')?chargeForMonth(h,mes,'aluguel',g.contractId):null;
      if(charge && typeof chargeReceivedTotal==='function') recebido+=chargeReceivedTotal(h,charge)||0;
    });
    const parcial=recebido>0;
    const partes=[];
    if((g.meses||[]).length) partes.push(g.meses.length===1?('aluguel de '+monthLabel(g.meses[0])):(g.meses.length+' meses de aluguel'));
    if((g.energiaMeses||[]).length) partes.push(g.energiaMeses.length===1?('energia de '+monthLabel(g.energiaMeses[0])):(g.energiaMeses.length+' meses de energia'));
    if(g.proporcional) partes.push('ajuste inicial do contrato');
    const motivo=g.tipo==='atraso'
      ? partes.join(' + ')+' — atrasado há '+plural(g.dias,'dia','dias')
      : g.tipo==='tolerancia'
        ? partes.join(' + ')+' — venceu há '+plural(g.dias,'dia','dias')+', dentro da tolerância de '+plural(g.toleranciaDias||5,'dia','dias')
        : partes.join(' + ')+' — vence em '+plural(g.dias,'dia','dias');
    itens.push({
      id:'pag-'+g.houseId,
      tipo:parcial?'parcial':'pagamento',
      prioridade:g.tipo==='atraso'?'alta':g.tipo==='tolerancia'?'media':'baixa',
      situacao:g.tipo==='atraso'?'atrasado':g.tipo==='tolerancia'?'atencao':'aberto',
      titulo:parcial?'Saldo em aberto':(g.tipo==='proximo'?'Cobrança a vencer':'Cobrança em aberto'),
      motivo:parcial?(motivo+' · já recebido '+fmtMoney(recebido)):motivo,
      houseId:h.id, imovel:h.nome, pessoa:t?t.nome:'',
      data:'', valor:g.total,
      acaoLabel:mayFinance?'Registrar pagamento':'Ver imóvel',
      acaoJs:mayFinance
        ? "openAlertPaymentChooser('"+h.id+"')"
        : "openHouse('"+h.id+"','pagamentos')"
    });
  });

  /* 3. Contratos próximos do vencimento (ou já vencidos). */
  (overview.contratosVencendo||[]).forEach(function(c){
    const h=state.houses.find(function(x){return x.id===c.houseId;});
    if(!h) return;
    const t=(typeof tenantOf==='function')?tenantOf(h):null;
    const vencido=c.dias<0;
    itens.push({
      id:'contrato-'+c.houseId,
      tipo:'contrato',
      prioridade:(vencido||c.nivel==='urgente')?'alta':'media',
      situacao:vencido?'atrasado':'atencao',
      titulo:vencido?'Contrato vencido':'Contrato a vencer',
      motivo:vencido?('venceu há '+plural(Math.abs(c.dias),'dia','dias'))
        :c.dias===0?'vence hoje':('vence em '+plural(c.dias,'dia','dias')),
      houseId:h.id, imovel:h.nome, pessoa:t?t.nome:'',
      data:h.contratoFim||'', valor:0,
      acaoLabel:mayOperate?'Abrir contrato':'Ver contrato',
      acaoJs:"openHouse('"+h.id+"','contratos')"
    });
  });

  /* 4. Energia do mês ainda não registrada. Só para imóvel alugado,
     com energia ativa e com contrato vigente. */
  if(typeof energyModuleEnabled==='function' && energyModuleEnabled()){
    state.houses.forEach(function(h){
      if(h.status!=='alugada') return;
      if(typeof houseEnergyEnabled==='function' && !houseEnergyEnabled(h)) return;
      const contract=(typeof activeContract==='function')?activeContract(h):null;
      if(!contract) return;
      const lancada=(typeof energiaDoMes==='function')?energiaDoMes(h,cur,contract.id):null;
      if(lancada) return;
      const t=(typeof tenantOf==='function')?tenantOf(h):null;
      itens.push({
        id:'energia-'+h.id+'-'+cur,
        tipo:'energia',
        prioridade:'media',
        situacao:'aberto',
        titulo:'Energia não registrada',
        motivo:'a leitura de '+monthLabel(cur)+' ainda não foi lançada',
        houseId:h.id, imovel:h.nome, pessoa:t?t.nome:'',
        data:'', valor:0,
        acaoLabel:mayOperate?'Lançar energia':'Ver energia',
        acaoJs:"openHouse('"+h.id+"','energia')"
      });
    });
  }

  /* 5. Manutenções abertas ou atrasadas. Usa o prazo quando existir;
     sem prazo, uma manutenção aberta há muito tempo conta como
     atrasada — senão ela nunca cobraria ação. */
  state.houses.forEach(function(h){
    const calls=(typeof maintenanceCalls==='function')?maintenanceCalls(h):[];
    calls.forEach(function(call){
      const status=String(call.status||'aberto');
      /* Só as situações que ainda pedem ação. Concluída e cancelada
         saem daqui sozinhas — é a mesma regra das outras pendências. */
      if(typeof maintenanceIsOpen==='function'){ if(!maintenanceIsOpen(status)) return; }
      else if(status==='resolvido'||status==='cancelado') return;
      if(call.arquivadoEm) return;
      const aberturaISO=String(call.createdAt||call.abertoEm||'').slice(0,10);
      const dias=pendenciaDiasDesde(aberturaISO);
      const prazo=String(call.prazo||'').slice(0,10);
      const prazoVencido=prazo?(pendenciaDiasDesde(prazo)>0):false;
      const atrasada=prazoVencido||(!prazo&&dias>PENDENCIA_MANUTENCAO_LIMITE_DIAS);
      const prioridadeCall=String(call.prioridade||'normal');
      itens.push({
        id:'manut-'+(call.id||h.id),
        tipo:'manutencao',
        prioridade:(prioridadeCall==='urgente'||prioridadeCall==='alta'||atrasada)?'alta'
          :prioridadeCall==='baixa'?'baixa':'media',
        situacao:atrasada?'atrasado':'aberto',
        titulo:call.titulo||'Manutenção',
        motivo:(typeof maintenanceStatusLabel==='function'?maintenanceStatusLabel(status):status)+
          (prazo?(prazoVencido?' · prazo venceu em '+fmtDateBR(prazo):' · prazo '+fmtDateBR(prazo))
                :(dias>0?' · aberta há '+plural(dias,'dia','dias'):' · aberta hoje')),
        houseId:h.id, imovel:h.nome, pessoa:'',
        data:aberturaISO, valor:0,
        acaoLabel:mayOperate?'Abrir manutenção':'Ver manutenção',
        /* Leva direto ao registro de origem, não só à aba do imóvel. */
        acaoJs:"openMaintenanceModal('"+h.id+"','"+(call.id||'')+"')"
      });
    });
  });

  /* 6. Imóvel parado em manutenção: não é chamado, é situação do imóvel. */
  (overview.manutList||[]).forEach(function(h){
    itens.push({
      id:'imovel-manut-'+h.id,
      tipo:'imovel',
      prioridade:'baixa',
      situacao:'aberto',
      titulo:'Imóvel em manutenção',
      motivo:'está marcado como em manutenção e não gera aluguel',
      houseId:h.id, imovel:h.nome, pessoa:'',
      data:'', valor:0,
      acaoLabel:'Abrir imóvel',
      acaoJs:"openHouse('"+h.id+"','geral')"
    });
  });

  itens.sort(function(a,b){
    const sit={atrasado:0,atencao:1,aberto:2};
    if(sit[a.situacao]!==sit[b.situacao]) return sit[a.situacao]-sit[b.situacao];
    const p=pendenciaPrioridadeRank(a.prioridade)-pendenciaPrioridadeRank(b.prioridade);
    if(p) return p;
    return String(a.imovel||'').localeCompare(String(b.imovel||''),'pt-BR');
  });
  return itens;
}

function pendenciasFiltradas(){
  const f=state.pendFiltros||{};
  return computePendencias().filter(function(p){
    if(f.tipo && p.tipo!==f.tipo) return false;
    if(f.prioridade && p.prioridade!==f.prioridade) return false;
    if(f.imovel && p.houseId!==f.imovel) return false;
    if(f.situacao && p.situacao!==f.situacao) return false;
    return true;
  });
}
function setPendFiltro(campo,valor){
  if(!state.pendFiltros) state.pendFiltros={tipo:'',prioridade:'',imovel:'',situacao:''};
  state.pendFiltros[campo]=valor||'';
  render();
}
function limparPendFiltros(){
  state.pendFiltros={tipo:'',prioridade:'',imovel:'',situacao:''};
  render();
}

/* ------------------------------------------------------------
   Tela
   ------------------------------------------------------------ */
function renderPendenciaRow(p){
  const tom=p.situacao==='atrasado'?'chip-rust':p.situacao==='atencao'?'chip-warn':'';
  return '<div class="pend-row pend-'+esc(p.situacao)+'">'+
    '<div class="pend-row-head">'+
      '<span class="chip '+tom+'">'+esc(pendenciaSituacaoLabel(p.situacao)).toUpperCase()+'</span>'+
      '<span class="pend-tipo">'+esc(pendenciaTipoLabel(p.tipo))+'</span>'+
      '<span class="pend-prio pend-prio-'+esc(p.prioridade)+'">'+esc(pendenciaPrioridadeLabel(p.prioridade))+'</span>'+
    '</div>'+
    '<div class="pend-row-main">'+
      '<strong>'+esc(p.titulo)+'</strong>'+
      '<span class="pend-alvo">'+esc(p.imovel||'')+(p.pessoa?' · '+esc(p.pessoa):'')+'</span>'+
      '<small>'+esc(p.motivo)+'</small>'+
    '</div>'+
    '<div class="pend-row-side">'+
      (p.valor?'<strong class="num">'+fmtMoney(p.valor)+'</strong>':'')+
      (p.data?'<small>'+fmtDateBR(p.data)+'</small>':'')+
    '</div>'+
    '<button class="btn btn-ghost btn-sm pend-acao" onclick="'+p.acaoJs+'">'+esc(p.acaoLabel)+'</button>'+
  '</div>';
}

function renderPendenciasView(){
  if(!state.pendFiltros) state.pendFiltros={tipo:'',prioridade:'',imovel:'',situacao:''};
  const f=state.pendFiltros;
  const todas=computePendencias();
  const lista=pendenciasFiltradas();
  const conta=function(sit){return todas.filter(function(p){return p.situacao===sit;}).length;};
  const filtrando=!!(f.tipo||f.prioridade||f.imovel||f.situacao);
  const sel=function(id,label,valor,opcoes){
    return '<label class="field"><span>'+label+'</span><select onchange="setPendFiltro(\''+id+'\',this.value)">'+
      '<option value="">Todos</option>'+
      opcoes.map(function(o){
        return '<option value="'+esc(o[0])+'"'+(String(o[0])===String(valor)?' selected':'')+'>'+esc(o[1])+'</option>';
      }).join('')+'</select></label>';
  };
  const imoveis=state.houses.map(function(h){return [h.id,h.nome];});
  return (typeof pageTitleWithIcon==='function'
      ? '<div class="page-header">'+pageTitleWithIcon(typeof expenseIconSvg==='function'?expenseIconSvg():'','Pendências')+
        '<p class="page-sub">O que exige ação agora. Cada item some sozinho quando a causa é resolvida.</p></div>'
      : '<h1 class="page-title">Pendências</h1>')+
    '<div class="pend-summary">'+
      '<button class="pend-stat'+(f.situacao==='atrasado'?' is-active':'')+'" onclick="setPendFiltro(\'situacao\',\''+(f.situacao==='atrasado'?'':'atrasado')+'\')">'+
        '<strong class="num">'+conta('atrasado')+'</strong><span>Atrasadas</span></button>'+
      '<button class="pend-stat'+(f.situacao==='atencao'?' is-active':'')+'" onclick="setPendFiltro(\'situacao\',\''+(f.situacao==='atencao'?'':'atencao')+'\')">'+
        '<strong class="num">'+conta('atencao')+'</strong><span>Atenção</span></button>'+
      '<button class="pend-stat'+(f.situacao==='aberto'?' is-active':'')+'" onclick="setPendFiltro(\'situacao\',\''+(f.situacao==='aberto'?'':'aberto')+'\')">'+
        '<strong class="num">'+conta('aberto')+'</strong><span>Abertas</span></button>'+
    '</div>'+
    '<div class="panel pend-filtros">'+
      '<div class="field-row">'+
        sel('tipo','Tipo',f.tipo,PENDENCIA_TIPOS)+
        sel('prioridade','Prioridade',f.prioridade,PENDENCIA_PRIORIDADES)+
      '</div>'+
      '<div class="field-row">'+
        sel('imovel','Imóvel',f.imovel,imoveis)+
        sel('situacao','Situação',f.situacao,PENDENCIA_SITUACOES)+
      '</div>'+
      (filtrando?'<button class="btn btn-ghost btn-sm" onclick="limparPendFiltros()">Limpar filtros</button>':'')+
    '</div>'+
    (lista.length
      ? '<div class="pend-list">'+lista.map(renderPendenciaRow).join('')+'</div>'
      : (typeof emptyState==='function'
          ? emptyState(todas.length
              ? 'Nenhuma pendência com estes filtros.'
              : 'Tudo em dia — nenhuma pendência no momento.',
            typeof houseIconSvg==='function'?houseIconSvg():'')
          : '<div class="empty-state">Tudo em dia.</div>'));
}

/* Resumo compacto do painel inicial: conta e leva para a página. */
function renderPendenciasResumo(){
  if(typeof temModulo==='function' && !temModulo('alugueis')) return '';
  const todas=computePendencias();
  if(!todas.length) return '';
  const atrasadas=todas.filter(function(p){return p.situacao==='atrasado';}).length;
  const atencao=todas.filter(function(p){return p.situacao==='atencao';}).length;
  return '<button class="pend-resumo" onclick="irPendencias()">'+
    '<span class="pend-resumo-num num">'+todas.length+'</span>'+
    '<span class="pend-resumo-copy"><strong>Pendências</strong>'+
      '<small>'+(atrasadas?plural(atrasadas,'atrasada','atrasadas'):'nenhuma atrasada')+
      (atencao?' · '+atencao+' em atenção':'')+'</small></span>'+
    '<span class="pend-resumo-go" aria-hidden="true">›</span>'+
  '</button>';
}
