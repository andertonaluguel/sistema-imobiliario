/* ============================================================
   maintenance.js — chamados de manutenção do módulo Aluguéis

   Chamado acompanha problema, prioridade e solução.
   Despesa é um registro financeiro separado e só é criada, de
   forma opcional, quando a resolução tiver custo.
   ============================================================ */

var MAINTENANCE_CATEGORIES = [
  ['hidraulica','Hidráulica'],
  ['eletrica','Elétrica'],
  ['estrutura','Estrutura'],
  ['eletrodomestico','Eletrodoméstico'],
  ['pintura','Pintura'],
  ['outro','Outro']
];
var MAINTENANCE_PRIORITIES = [
  ['urgente','Urgente'],
  ['alta','Alta'],
  ['normal','Normal'],
  ['baixa','Baixa']
];
/* As seis situações da gestão completa. Os valores gravados continuam
   os mesmos de antes ('resolvido'/'cancelado'), então nenhum chamado
   antigo precisou ser reescrito — mudou só como eles se chamam. */
var MAINTENANCE_STATUSES = [
  ['aberto','Aberta'],
  ['aguardando_orcamento','Aguardando orçamento'],
  ['aprovado','Aprovada'],
  ['em_andamento','Em andamento'],
  ['resolvido','Concluída'],
  ['cancelado','Cancelada']
];
/* Situação legada: existe em registros antigos e continua sendo exibida,
   mas não é mais oferecida ao criar ou editar. */
var MAINTENANCE_STATUSES_LEGADO = [['aguardando_peca','Aguardando peça']];
var MAINTENANCE_STATUSES_TODOS = MAINTENANCE_STATUSES.concat(MAINTENANCE_STATUSES_LEGADO);
/* Quem arca com o custo. Não altera o financeiro sozinho: é informação
   do chamado, usada na hora de oferecer a despesa. */
var MAINTENANCE_PAGADORES = [
  ['proprietario','Proprietário'],
  ['inquilino','Inquilino'],
  ['dividido','Dividido'],
  ['outro','Outro']
];
/* Situações que ainda pedem ação — as que aparecem em Pendências. */
var MAINTENANCE_STATUS_ABERTOS = ['aberto','aguardando_orcamento','aprovado','em_andamento','aguardando_peca'];
function maintenanceIsOpen(status){ return MAINTENANCE_STATUS_ABERTOS.indexOf(String(status||'aberto'))>=0; }
function maintenancePagadorLabel(value){
  return maintenanceOptionLabel(MAINTENANCE_PAGADORES,value,'Proprietário');
}

function maintenanceOptionLabel(options,value,fallback){
  const found=options.find(function(option){return option[0]===value;});
  return found?found[1]:fallback;
}
function maintenanceCategoryLabel(value){
  return maintenanceOptionLabel(MAINTENANCE_CATEGORIES,value,'Outro');
}
function maintenancePriorityLabel(value){
  return maintenanceOptionLabel(MAINTENANCE_PRIORITIES,value,'Normal');
}
function maintenanceStatusLabel(value){
  return maintenanceOptionLabel(MAINTENANCE_STATUSES_TODOS,value,'Aberta');
}
function maintenanceStatusTone(value){
  if(value==='resolvido') return 'brass';
  if(value==='cancelado') return 'slate';
  if(value==='aguardando_peca'||value==='aguardando_orcamento') return 'warn';
  if(value==='em_andamento'||value==='aprovado') return 'manut';
  return 'rust';
}
function maintenancePriorityRank(value){
  return value==='urgente'?0:value==='alta'?1:value==='normal'?2:3;
}
function maintenanceStatusRank(value){
  return value==='aberto'?0:value==='aguardando_orcamento'?1:value==='aprovado'?2:
    value==='em_andamento'?3:value==='aguardando_peca'?4:value==='resolvido'?5:6;
}
function maintenanceCalls(h){
  return Array.isArray(h&&h.chamados)?h.chamados:[];
}
function maintenanceExpense(h,call){
  if(!call||!call.despesaId) return null;
  return (Array.isArray(h.despesas)?h.despesas:[]).find(function(expense){
    return expense.id===call.despesaId;
  })||null;
}
function maintenanceOptions(options,selected){
  return options.map(function(option){
    return '<option value="'+option[0]+'"'+(option[0]===selected?' selected':'')+'>'+
      esc(option[1])+'</option>';
  }).join('');
}

function renderMaintenanceTab(h){
  const mayOperate=canOperateProperties();
  const calls=maintenanceCalls(h).slice().sort(function(a,b){
    const statusDiff=maintenanceStatusRank(a.status)-maintenanceStatusRank(b.status);
    if(statusDiff) return statusDiff;
    const priorityDiff=maintenancePriorityRank(a.prioridade)-maintenancePriorityRank(b.prioridade);
    if(priorityDiff) return priorityDiff;
    return String(b.createdAt||'').localeCompare(String(a.createdAt||''));
  });
  const active=calls.filter(function(call){
    return !['resolvido','cancelado'].includes(call.status);
  }).length;
  const resolved=calls.filter(function(call){return call.status==='resolvido';}).length;

  return '<div class="tab-summary-row">'+
    '<div>'+active+' em acompanhamento · '+resolved+' resolvido(s)</div>'+
    (mayOperate?'<button class="btn btn-primary btn-sm" onclick="openMaintenanceModal(\''+h.id+'\')">+ Novo chamado</button>':'')+
  '</div>'+
  (calls.length===0
    ? '<div class="empty-state">Nenhum chamado de manutenção registrado.</div>'
    : '<div class="list-card"><div class="ledger">'+calls.map(function(call){
        const expense=maintenanceExpense(h,call);
        const date=call.createdAt?String(call.createdAt).slice(0,10):'';
        const detail=[
          maintenanceCategoryLabel(call.categoria),
          maintenancePriorityLabel(call.prioridade),
          date?fmtDateBR(date):''
        ].filter(Boolean).join(' · ');
        const expenseText=call.despesaId
          ? (expense?'Despesa vinculada: '+fmtMoney(expense.valor):'Despesa vinculada')
          : '';
        return '<button type="button" class="ledger-row" onclick="openMaintenanceModal(\''+
          h.id+'\',\''+call.id+'\')">'+
          '<span class="row-ico" aria-hidden="true">'+FICO.tool+'</span>'+
          '<span class="ledger-row-main"><strong>'+esc(call.titulo)+'</strong>'+
            '<span class="ledger-row-sub">'+esc(detail)+
              (expenseText?' · '+esc(expenseText):'')+'</span></span>'+
          '<span class="chip chip-'+maintenanceStatusTone(call.status)+'">'+
            esc(maintenanceStatusLabel(call.status).toUpperCase())+'</span>'+
          '<span class="ledger-row-value">'+esc(maintenancePriorityLabel(call.prioridade))+'</span>'+
        '</button>';
      }).join('')+'</div></div>');
}

/* ============================================================
   Página de Manutenções (§14)
   Reaproveita os mesmos chamados da aba do imóvel: é a mesma lista,
   vista pela carteira inteira em vez de um imóvel por vez.
   ============================================================ */
function maintenanceFilters(){
  if(!state.manutFiltros){
    state.manutFiltros={imovel:'',status:'',prioridade:'',busca:'',ordem:'situacao',arquivadas:false};
  }
  return state.manutFiltros;
}
function setManutFiltro(campo,valor){
  const f=maintenanceFilters();
  f[campo]=(campo==='arquivadas')?!!valor:(valor||'');
  render();
}
function setManutBusca(valor){
  maintenanceFilters().busca=String(valor||'');
  /* Filtra sem re-renderizar a tela toda: o campo não perde o foco. */
  const lista=document.getElementById('manutLista');
  if(lista) lista.innerHTML=renderMaintenanceRows();
}
function limparManutFiltros(){
  state.manutFiltros={imovel:'',status:'',prioridade:'',busca:'',ordem:'situacao',arquivadas:false};
  render();
}
/* Todos os chamados da carteira, já com o imóvel a que pertencem. */
function allMaintenanceCalls(){
  const out=[];
  (state.houses||[]).forEach(function(h){
    maintenanceCalls(h).forEach(function(call){
      out.push({call:call,house:h});
    });
  });
  return out;
}
function maintenanceMatchesFilters(entry){
  const f=maintenanceFilters();
  const c=entry.call;
  const arquivada=!!c.arquivadoEm;
  if(f.arquivadas!==arquivada) return false;
  if(f.imovel && entry.house.id!==f.imovel) return false;
  if(f.status && String(c.status||'aberto')!==f.status) return false;
  if(f.prioridade && String(c.prioridade||'normal')!==f.prioridade) return false;
  const termo=String(f.busca||'').trim().toLowerCase();
  if(termo){
    const alvo=[c.titulo,c.descricao,c.fornecedor,c.responsavel,entry.house.nome]
      .map(function(v){return String(v||'').toLowerCase();}).join(' ');
    if(alvo.indexOf(termo)<0) return false;
  }
  return true;
}
function sortedMaintenance(list){
  const ordem=maintenanceFilters().ordem;
  return list.slice().sort(function(a,b){
    if(ordem==='prioridade'){
      const p=maintenancePriorityRank(a.call.prioridade)-maintenancePriorityRank(b.call.prioridade);
      if(p) return p;
    } else if(ordem==='prazo'){
      const pa=String(a.call.prazo||'9999-12-31'),pb=String(b.call.prazo||'9999-12-31');
      if(pa!==pb) return pa.localeCompare(pb);
    } else if(ordem==='imovel'){
      const n=String(a.house.nome||'').localeCompare(String(b.house.nome||''),'pt-BR');
      if(n) return n;
    } else {
      const s=maintenanceStatusRank(a.call.status)-maintenanceStatusRank(b.call.status);
      if(s) return s;
      const p=maintenancePriorityRank(a.call.prioridade)-maintenancePriorityRank(b.call.prioridade);
      if(p) return p;
    }
    return String(b.call.createdAt||'').localeCompare(String(a.call.createdAt||''));
  });
}
function maintenanceIsLate(call){
  const prazo=String(call.prazo||'').slice(0,10);
  if(!prazo||!maintenanceIsOpen(call.status)) return false;
  return prazo<todayISO();
}
function renderMaintenanceRows(){
  const lista=sortedMaintenance(allMaintenanceCalls().filter(maintenanceMatchesFilters));
  if(!lista.length){
    return '<div class="empty-state">'+(maintenanceFilters().arquivadas
      ? 'Nenhuma manutenção arquivada.'
      : 'Nenhuma manutenção com estes filtros.')+'</div>';
  }
  return lista.map(function(entry){
    const c=entry.call,h=entry.house;
    const atrasada=maintenanceIsLate(c);
    const custo=(c.custoFinal!=null)?c.custoFinal:(c.orcamento!=null?c.orcamento:null);
    return '<button type="button" class="manut-row'+(atrasada?' is-late':'')+
      '" onclick="openMaintenanceModal(\''+h.id+'\',\''+c.id+'\')">'+
      '<span class="chip chip-'+maintenanceStatusTone(c.status)+'">'+
        esc(maintenanceStatusLabel(c.status).toUpperCase())+'</span>'+
      '<span class="manut-row-main"><strong>'+esc(c.titulo||'Manutenção')+'</strong>'+
        '<small>'+esc(h.nome)+' · '+esc(maintenanceCategoryLabel(c.categoria))+
        ' · '+esc(maintenancePriorityLabel(c.prioridade))+
        (c.fornecedor?' · '+esc(c.fornecedor):'')+'</small></span>'+
      '<span class="manut-row-side">'+
        (custo!=null?'<strong class="num">'+fmtMoney(custo)+'</strong>':'')+
        (c.prazo?'<small'+(atrasada?' class="rust"':'')+'>'+
          (atrasada?'venceu ':'prazo ')+fmtDateBR(String(c.prazo).slice(0,10))+'</small>':'')+
      '</span>'+
    '</button>';
  }).join('');
}
function renderManutencoesView(){
  const f=maintenanceFilters();
  const mayOperate=canOperateProperties();
  const todas=allMaintenanceCalls();
  const ativas=todas.filter(function(e){return !e.call.arquivadoEm;});
  const conta=function(status){
    return ativas.filter(function(e){return String(e.call.status||'aberto')===status;}).length;
  };
  const atrasadas=ativas.filter(function(e){return maintenanceIsLate(e.call);}).length;
  const sel=function(campo,label,valor,opcoes){
    return '<label class="field"><span>'+label+'</span>'+
      '<select onchange="setManutFiltro(\''+campo+'\',this.value)">'+
      '<option value="">Todas</option>'+opcoes.map(function(o){
        return '<option value="'+esc(o[0])+'"'+(String(o[0])===String(valor)?' selected':'')+'>'+esc(o[1])+'</option>';
      }).join('')+'</select></label>';
  };
  const resumo=MAINTENANCE_STATUSES.map(function(s){
    return '<button class="manut-stat'+(f.status===s[0]?' is-active':'')+
      '" onclick="setManutFiltro(\'status\',\''+(f.status===s[0]?'':s[0])+'\')">'+
      '<strong class="num">'+conta(s[0])+'</strong><span>'+esc(s[1])+'</span></button>';
  }).join('');
  return (typeof pageTitleWithIcon==='function'
      ? '<div class="page-header">'+pageTitleWithIcon(typeof expenseIconSvg==='function'?expenseIconSvg():'','Manutenções')+
        '<p class="page-sub">Todos os serviços dos imóveis, do pedido à conclusão.</p>'+
        (mayOperate?'<button class="btn btn-primary" onclick="openNewMaintenanceChooser()">+ Nova manutenção</button>':'')+
        '</div>'
      : '<h1 class="page-title">Manutenções</h1>')+
    (atrasadas?'<div class="notice-box notice-danger"><span><strong>'+atrasadas+
      ' manutenção(ões) com prazo vencido.</strong> Elas também aparecem na Central de Pendências.</span></div>':'')+
    '<div class="manut-summary">'+resumo+'</div>'+
    '<div class="panel manut-filtros">'+
      '<label class="field"><span>Buscar</span><input id="manutBusca" type="search" value="'+esc(f.busca||'')+
        '" placeholder="Título, imóvel, fornecedor…" oninput="setManutBusca(this.value)"></label>'+
      '<div class="field-row">'+
        sel('imovel','Imóvel',f.imovel,(state.houses||[]).map(function(h){return [h.id,h.nome];}))+
        sel('prioridade','Prioridade',f.prioridade,MAINTENANCE_PRIORITIES)+
      '</div>'+
      '<div class="field-row">'+
        '<label class="field"><span>Ordenar por</span><select onchange="setManutFiltro(\'ordem\',this.value)">'+
          [['situacao','Situação'],['prioridade','Prioridade'],['prazo','Prazo'],['imovel','Imóvel']].map(function(o){
            return '<option value="'+o[0]+'"'+(f.ordem===o[0]?' selected':'')+'>'+o[1]+'</option>';
          }).join('')+'</select></label>'+
        '<label class="field"><span>Mostrar</span><select onchange="setManutFiltro(\'arquivadas\',this.value===\'1\')">'+
          '<option value="0"'+(f.arquivadas?'':' selected')+'>Ativas</option>'+
          '<option value="1"'+(f.arquivadas?' selected':'')+'>Arquivadas</option>'+
        '</select></label>'+
      '</div>'+
      ((f.imovel||f.status||f.prioridade||f.busca||f.arquivadas)
        ?'<button class="btn btn-ghost btn-sm" onclick="limparManutFiltros()">Limpar filtros</button>':'')+
    '</div>'+
    '<div id="manutLista" class="manut-list">'+renderMaintenanceRows()+'</div>';
}
/* Criar a partir da página: primeiro escolhe o imóvel, depois abre o
   mesmo formulário usado dentro do imóvel. */
function openNewMaintenanceChooser(){
  if(!requirePropertyPermission())return;
  const houses=(state.houses||[]).filter(function(h){return !h.arquivadoEm;});
  if(!houses.length){ showToast('Cadastre um imóvel antes de abrir uma manutenção.','error'); return; }
  if(houses.length===1){ openMaintenanceModal(houses[0].id); return; }
  openModal('<h3 class="modal-title">Nova manutenção</h3>'+
    '<p class="modal-text">Em qual imóvel?</p>'+
    '<label class="field"><span>Imóvel</span><select id="manutNovoImovel">'+
      houses.map(function(h){return '<option value="'+esc(h.id)+'">'+esc(h.nome)+'</option>';}).join('')+
    '</select></label>'+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-primary" onclick="openMaintenanceModal(document.getElementById(\'manutNovoImovel\').value)">Continuar</button>'+
    '</div></div>');
}
/* Arquivamento recuperável: nada é apagado, o chamado sai das listas
   ativas e volta inteiro ao ser restaurado. */
async function archiveMaintenanceCall(houseId,callId,restaurar){
  if(!requirePropertyPermission())return;
  const h=state.houses.find(function(house){return house.id===houseId;});
  const call=h?maintenanceCalls(h).find(function(item){return item.id===callId;}):null;
  if(!h||!call) return;
  try{
    const historico=(Array.isArray(call.historico)?call.historico:[]).concat([{
      em:new Date().toISOString(),
      texto:restaurar?'Manutenção restaurada':'Manutenção arquivada'
    }]);
    const salvo=await db.updateMaintenanceCall(Object.assign({},call,{
      houseId:houseId,
      arquivadoEm:restaurar?'':new Date().toISOString(),
      historico:historico
    }));
    const index=h.chamados.findIndex(function(item){return item.id===callId;});
    if(index>=0) h.chamados[index]=salvo;
    closeModal(); render();
    showToast(restaurar?'Manutenção restaurada.':'Manutenção arquivada.','success');
  }catch(e){
    console.error(e);
    showToast('Não foi possível arquivar. Tente novamente.','error');
  }
}

/* Só as seis situações são oferecidas. A legada aparece apenas quando o
   chamado já está nela — para não trocar o valor sem a pessoa mandar. */
function maintenanceStatusOptionsFor(status){
  const legado=MAINTENANCE_STATUSES_LEGADO.filter(function(o){return o[0]===status;});
  return MAINTENANCE_STATUSES.concat(legado);
}
function maintenanceCallPhotos(h,callId,momento){
  const cache=(state.photoCache||{})[h.id];
  if(!Array.isArray(cache)) return [];
  return cache.filter(function(p){
    return String(p.chamadoId||'')===String(callId)&&String(p.momento||'')===momento;
  });
}
function maintenancePhotosBlock(h,call,mayOperate){
  const cache=(state.photoCache||{})[h.id];
  if(!Array.isArray(cache)){
    return '<div class="form-section-title">Fotos</div>'+
      '<p class="modal-hint">Abra a aba Fotos do imóvel uma vez para carregá-las.</p>';
  }
  function grupo(momento,titulo){
    const fotos=maintenanceCallPhotos(h,call.id,momento);
    return '<div class="maint-photo-group"><div class="maint-photo-head"><strong>'+titulo+'</strong>'+
      (mayOperate?'<button type="button" class="btn btn-ghost btn-sm" onclick="triggerPhotoUpload(\''+
        h.id+'\',\''+call.id+'\',\''+momento+'\')">+ Adicionar</button>':'')+'</div>'+
      (fotos.length
        ? '<div class="maint-photo-row">'+fotos.map(function(p){
            const src=(typeof safePhotoSrc==='function')?safePhotoSrc(p.dados):'';
            return src?'<img src="'+esc(src)+'" alt="Foto '+esc(titulo.toLowerCase())+' do chamado">':'';
          }).join('')+'</div>'
        : '<p class="modal-hint">Nenhuma foto ainda.</p>')+
    '</div>';
  }
  return '<div class="form-section-title">Fotos antes e depois</div>'+
    '<div class="maint-photos">'+grupo('antes','Antes')+grupo('depois','Depois')+'</div>';
}
function maintenanceHistoryBlock(call){
  const hist=Array.isArray(call.historico)?call.historico:[];
  if(!hist.length) return '';
  return '<div class="form-section-title">Histórico de alterações</div>'+
    '<div class="maint-history">'+hist.slice().reverse().map(function(item){
      const quando=item.em?String(item.em).slice(0,10):'';
      return '<div class="maint-history-row"><span>'+(quando?fmtDateBR(quando):'')+'</span>'+
        '<small>'+esc(item.texto||'')+'</small></div>';
    }).join('')+'</div>';
}
/* Compara o antes e o depois e descreve, em texto, o que mudou. É o que
   alimenta o histórico sem exigir nenhuma tabela nova. */
function maintenanceDiffText(before,after){
  if(!before) return 'Chamado criado';
  const partes=[];
  if(before.status!==after.status){
    partes.push('situação: '+maintenanceStatusLabel(before.status)+' → '+maintenanceStatusLabel(after.status));
  }
  if(before.prioridade!==after.prioridade){
    partes.push('prioridade: '+maintenancePriorityLabel(before.prioridade)+' → '+maintenancePriorityLabel(after.prioridade));
  }
  if(String(before.prazo||'')!==String(after.prazo||'')) partes.push('prazo alterado');
  if(String(before.responsavel||'')!==String(after.responsavel||'')) partes.push('responsável alterado');
  if(String(before.fornecedor||'')!==String(after.fornecedor||'')) partes.push('fornecedor alterado');
  if(Number(before.orcamento||0)!==Number(after.orcamento||0)) partes.push('orçamento alterado');
  if(Number(before.custoFinal||0)!==Number(after.custoFinal||0)) partes.push('custo final alterado');
  if(String(before.quemPaga||'')!==String(after.quemPaga||'')) partes.push('quem paga alterado');
  if(String(before.titulo||'')!==String(after.titulo||'')) partes.push('título alterado');
  if(String(before.descricao||'')!==String(after.descricao||'')) partes.push('descrição alterada');
  return partes.length?partes.join(' · '):'Registro atualizado';
}

function openMaintenanceModal(houseId,callId){
  const h=state.houses.find(function(house){return house.id===houseId;});
  if(!h) return;
  const call=callId
    ? maintenanceCalls(h).find(function(item){return item.id===callId;})
    : null;
  if(callId&&!call) return;
  const linkedExpense=call?maintenanceExpense(h,call):null;
  const status=call?call.status:'aberto';
  const mayOperate=canOperateProperties();
  const mayCreateExpense=mayOperate&&canAdministerAccount();
  const disabled=mayOperate?'':' disabled';
  const expenseCategories=(CONFIG.CATEGORIAS||['Manutenção']).map(function(category){
    return '<option'+(category==='Manutenção'?' selected':'')+'>'+esc(category)+'</option>';
  }).join('');

  openModal(
    '<h3 class="modal-title">'+(call?(mayOperate?'Editar chamado':'Chamado de manutenção'):'Novo chamado de manutenção')+'</h3>'+
    '<p class="modal-text">'+(mayCreateExpense
      ? 'O chamado acompanha o serviço. Ao resolver, o administrador pode optar por registrar também uma despesa.'
      : mayOperate
        ? 'O chamado acompanha o serviço. Você pode resolvê-lo sem criar lançamentos financeiros.'
        : 'Consulta do problema, andamento e solução registrada.')+'</p>'+
    '<label class="field"><span>Título</span><input id="maintenanceTitle" maxlength="180" value="'+
      (call?esc(call.titulo):'')+'" placeholder="Ex: Vazamento na pia"'+disabled+'></label>'+
    '<label class="field"><span>Descrição</span><textarea id="maintenanceDescription" rows="4" placeholder="Descreva o problema e onde ele ocorre"'+disabled+'>'+
      (call?esc(call.descricao):'')+'</textarea></label>'+
    '<div class="field-row">'+
      '<label class="field"><span>Categoria</span><select id="maintenanceCategory"'+disabled+'>'+
        maintenanceOptions(MAINTENANCE_CATEGORIES,call?call.categoria:'outro')+'</select></label>'+
      '<label class="field"><span>Prioridade</span><select id="maintenancePriority"'+disabled+'>'+
        maintenanceOptions(MAINTENANCE_PRIORITIES,call?call.prioridade:'normal')+'</select></label>'+
    '</div>'+
    '<label class="field"><span>Situação</span><select id="maintenanceStatus" onchange="toggleMaintenanceExpenseFields()"'+disabled+'>'+
      maintenanceOptions(maintenanceStatusOptionsFor(status),status)+'</select></label>'+
    '<div class="field-row">'+
      '<label class="field"><span>Prazo</span><input id="maintenancePrazo" type="date" value="'+
        (call&&call.prazo?esc(String(call.prazo).slice(0,10)):'')+'"'+disabled+'></label>'+
      '<label class="field"><span>Responsável</span><input id="maintenanceResponsavel" maxlength="180" value="'+
        (call?esc(call.responsavel||''):'')+'" placeholder="Quem acompanha"'+disabled+'></label>'+
    '</div>'+
    '<div class="field-row">'+
      '<label class="field"><span>Fornecedor ou prestador</span><input id="maintenanceFornecedor" maxlength="180" value="'+
        (call?esc(call.fornecedor||''):'')+'" placeholder="Nome de quem executa"'+disabled+'></label>'+
      '<label class="field"><span>Quem pagará</span><select id="maintenanceQuemPaga"'+disabled+'>'+
        maintenanceOptions(MAINTENANCE_PAGADORES,call?(call.quemPaga||'proprietario'):'proprietario')+'</select></label>'+
    '</div>'+
    '<div class="field-row">'+
      '<label class="field"><span>Orçamento (R$)</span><input id="maintenanceOrcamento" type="number" min="0" step="0.01" value="'+
        (call&&call.orcamento!=null?esc(String(call.orcamento)):'')+'" placeholder="opcional"'+disabled+'></label>'+
      '<label class="field"><span>Custo final (R$)</span><input id="maintenanceCustoFinal" type="number" min="0" step="0.01" value="'+
        (call&&call.custoFinal!=null?esc(String(call.custoFinal)):'')+'" placeholder="opcional" onchange="toggleMaintenanceExpenseFields()"'+disabled+'></label>'+
    '</div>'+
    '<label class="field"><span>Resposta ou solução</span><textarea id="maintenanceResponse" rows="3" placeholder="Ex: Reparo realizado e testado"'+disabled+'>'+
      (call?esc(call.resposta):'')+'</textarea></label>'+
    '<label class="field"><span>Observações</span><textarea id="maintenanceObservacoes" rows="2" placeholder="Anotações internas"'+disabled+'>'+
      (call?esc(call.observacoes||''):'')+'</textarea></label>'+
    '<label class="field" id="maintenanceMotivoField"'+
      ((status==='resolvido'||status==='cancelado')?'':' hidden')+'>'+
      '<span>Motivo da conclusão ou cancelamento</span>'+
      '<input id="maintenanceMotivo" maxlength="600" value="'+(call?esc(call.motivoEncerramento||''):'')+
      '" placeholder="Por que foi concluída ou cancelada"'+disabled+'></label>'+
    (call?maintenancePhotosBlock(h,call,mayOperate):'')+
    (call?maintenanceHistoryBlock(call):'')+
    '<div id="maintenanceLinkedExpense">'+
      (call&&call.despesaId
        ? '<div class="field-card"><div class="field-line"><span class="fl-label">Despesa vinculada</span>'+
            '<span class="fl-value">'+(linkedExpense?fmtMoney(linkedExpense.valor):'Registro financeiro')+'</span></div></div>'
        : '')+
    '</div>'+
    (mayCreateExpense
      ? '<section id="maintenanceExpenseSection"'+
          (status==='resolvido'&&!(call&&call.despesaId)?'':' hidden')+'>'+
          '<label class="field"><span><input id="maintenanceCreateExpense" type="checkbox" onchange="toggleMaintenanceExpenseFields()"> Registrar também uma despesa</span></label>'+
          '<div id="maintenanceExpenseFields" hidden>'+
            '<div class="field-row">'+
              '<label class="field"><span>Valor (R$)</span><input id="maintenanceExpenseValue" type="number" min="0.01" step="0.01"></label>'+
              '<label class="field"><span>Data</span><input id="maintenanceExpenseDate" type="date" value="'+todayISO()+'"></label>'+
            '</div>'+
            '<div class="field-row">'+
              '<label class="field"><span>Prestador (opcional)</span><input id="maintenanceExpenseProvider" maxlength="180" placeholder="Nome do prestador"></label>'+
              '<label class="field"><span>Categoria da despesa</span><select id="maintenanceExpenseCategory">'+expenseCategories+'</select></label>'+
            '</div>'+
          '</div>'+
        '</section>'
      : '')+
    (mayOperate
      ? '<p class="modal-text">'+
          (call&&call.despesaId
            ? 'Este chamado possui despesa vinculada e deve permanecer como “Resolvido” para preservar a rastreabilidade financeira.'
            : 'Para interromper um chamado, altere a situação para “Cancelada”. O histórico será preservado.')+
        '</p>'
      : '')+
    '<div class="modal-actions">'+
      /* Arquivar é ação de risco: fica separada do rodapé principal. */
      ((mayOperate&&call)
        ? (call.arquivadoEm
            ? '<button class="btn btn-ghost" onclick="archiveMaintenanceCall(\''+houseId+'\',\''+call.id+'\',true)">Restaurar</button>'
            : '<button class="btn btn-danger" onclick="archiveMaintenanceCall(\''+houseId+'\',\''+call.id+'\',false)">Arquivar</button>')
        : '<span></span>')+
      '<div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="closeModal()">'+(mayOperate?'Voltar':'Fechar')+'</button>'+
      (mayOperate?'<button id="maintenanceSaveButton" class="btn btn-primary" onclick="saveMaintenanceCall(\''+
        houseId+'\',\''+(callId||'')+'\')">Salvar chamado</button>':'')+
    '</div></div>'
  );
  toggleMaintenanceExpenseFields();
}

function toggleMaintenanceExpenseFields(){
  const status=document.getElementById('maintenanceStatus');
  const section=document.getElementById('maintenanceExpenseSection');
  const checkbox=document.getElementById('maintenanceCreateExpense');
  const fields=document.getElementById('maintenanceExpenseFields');
  /* Motivo só faz sentido ao encerrar (concluir ou cancelar). */
  const motivo=document.getElementById('maintenanceMotivoField');
  if(status&&motivo){
    motivo.hidden=!(status.value==='resolvido'||status.value==='cancelado');
  }
  if(!status||!section) return;
  const mayCreate=canAdministerAccount()&&status.value==='resolvido'&&!!checkbox;
  section.hidden=!mayCreate;
  if(!mayCreate&&checkbox) checkbox.checked=false;
  if(fields) fields.hidden=!mayCreate||!checkbox.checked;
  /* O custo final já digitado vira a sugestão do valor da despesa —
     sem nunca lançar nada sozinho. */
  const custo=document.getElementById('maintenanceCustoFinal');
  const valor=document.getElementById('maintenanceExpenseValue');
  if(custo&&valor&&!valor.value&&custo.value) valor.value=custo.value;
  const fornecedor=document.getElementById('maintenanceFornecedor');
  const prestador=document.getElementById('maintenanceExpenseProvider');
  if(fornecedor&&prestador&&!prestador.value&&fornecedor.value) prestador.value=fornecedor.value;
}

/* Guarda o que foi digitado enquanto a confirmação da despesa está na
   tela: sem isso, o formulário sumiria junto com o modal. */
var _maintenanceFormBuffer=null;
function readMaintenanceForm(){
  const valorOpcional=function(id){
    const el=document.getElementById(id);
    if(!el||el.value==='') return null;
    const n=Number(el.value);
    return isFinite(n)&&n>=0?n:null;
  };
  const texto=function(id){
    const el=document.getElementById(id);
    return el?String(el.value||'').trim():'';
  };
  return {
    title:texto('maintenanceTitle'),
    description:texto('maintenanceDescription'),
    category:(document.getElementById('maintenanceCategory')||{}).value||'outro',
    priority:(document.getElementById('maintenancePriority')||{}).value||'normal',
    status:(document.getElementById('maintenanceStatus')||{}).value||'aberto',
    response:texto('maintenanceResponse'),
    prazo:texto('maintenancePrazo'),
    responsavel:texto('maintenanceResponsavel'),
    fornecedor:texto('maintenanceFornecedor'),
    quemPaga:(document.getElementById('maintenanceQuemPaga')||{}).value||'proprietario',
    orcamento:valorOpcional('maintenanceOrcamento'),
    custoFinal:valorOpcional('maintenanceCustoFinal'),
    observacoes:texto('maintenanceObservacoes'),
    motivo:texto('maintenanceMotivo'),
    criarDespesa:!!(document.getElementById('maintenanceCreateExpense')||{}).checked,
    despesaValor:Number((document.getElementById('maintenanceExpenseValue')||{}).value)||0,
    despesaData:(document.getElementById('maintenanceExpenseDate')||{}).value||'',
    despesaCategoria:(document.getElementById('maintenanceExpenseCategory')||{}).value||'Manutenção',
    despesaPrestador:texto('maintenanceExpenseProvider')
  };
}
/* Nada é lançado no financeiro sem que a pessoa veja exatamente o que
   será criado e confirme. */
function confirmMaintenanceExpense(houseId,callId){
  const f=_maintenanceFormBuffer;
  if(!f) return;
  const h=state.houses.find(function(house){return house.id===houseId;});
  openModal('<h3 class="modal-title">Registrar esta despesa?</h3>'+
    '<p class="modal-text">A manutenção será concluída e <strong>uma despesa será criada</strong> e vinculada a este chamado e ao imóvel. Nada é lançado sem esta confirmação.</p>'+
    '<div class="field-card">'+
      '<div class="field-line"><span class="fl-label">Imóvel</span><span class="fl-value">'+esc(h?h.nome:'')+'</span></div>'+
      '<div class="field-line"><span class="fl-label">Descrição</span><span class="fl-value">'+esc('Manutenção: '+f.title)+'</span></div>'+
      '<div class="field-line"><span class="fl-label">Categoria</span><span class="fl-value">'+esc(f.despesaCategoria)+'</span></div>'+
      '<div class="field-line"><span class="fl-label">Valor</span><span class="fl-value num">'+fmtMoney(f.despesaValor)+'</span></div>'+
      '<div class="field-line"><span class="fl-label">Data</span><span class="fl-value">'+fmtDateBR(f.despesaData||todayISO())+'</span></div>'+
      (f.despesaPrestador?'<div class="field-line"><span class="fl-label">Prestador</span><span class="fl-value">'+esc(f.despesaPrestador)+'</span></div>':'')+
      '<div class="field-line"><span class="fl-label">Quem paga</span><span class="fl-value">'+esc(maintenancePagadorLabel(f.quemPaga))+'</span></div>'+
    '</div>'+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
    '<div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="saveMaintenanceCall(\''+houseId+'\',\''+(callId||'')+'\',\'semDespesa\')">Concluir sem despesa</button>'+
      '<button class="btn btn-primary" onclick="saveMaintenanceCall(\''+houseId+'\',\''+(callId||'')+'\',\'confirmado\')">Concluir e lançar</button>'+
    '</div></div>');
}

async function saveMaintenanceCall(houseId,callId,confirmacao){
  if(!requirePropertyPermission())return;
  const h=state.houses.find(function(house){return house.id===houseId;});
  if(!h) return;
  const existing=callId
    ? maintenanceCalls(h).find(function(call){return call.id===callId;})
    : null;
  /* Na volta da confirmação o formulário já não está na tela: usamos o
     que foi capturado antes de abri-la. */
  const form=(confirmacao&&_maintenanceFormBuffer)?_maintenanceFormBuffer:readMaintenanceForm();
  if(!form) return;
  const title=form.title;
  const description=form.description;
  const category=form.category;
  const priority=form.priority;
  const status=form.status;
  const response=form.response;
  if(!title){
    showToast('Informe um título para o chamado.','error');
    return;
  }
  if(existing&&existing.despesaId&&status!=='resolvido'){
    showToast(
      'Chamados com despesa vinculada precisam permanecer como resolvidos.',
      'error'
    );
    return;
  }

  const alreadyLinked=!!(existing&&existing.despesaId);
  /* Duplicidade: um chamado nunca gera uma segunda despesa. */
  const shouldCreateExpense=canAdministerAccount()&&status==='resolvido'&&
    !alreadyLinked&&form.criarDespesa&&confirmacao!=='semDespesa';
  let expenseData=null;
  if(shouldCreateExpense){
    const value=Number(form.despesaValor)||0;
    if(value<=0){
      showToast('Informe o valor da despesa.','error');
      return;
    }
    if(confirmacao!=='confirmado'){
      _maintenanceFormBuffer=form;
      confirmMaintenanceExpense(houseId,callId);
      return;
    }
    expenseData={
      descricao:'Manutenção: '+title,
      categoria:form.despesaCategoria,
      valor:value,
      data:form.despesaData||todayISO(),
      prestador:form.despesaPrestador,
      status:'Concluído'
    };
  }
  _maintenanceFormBuffer=null;

  const button=document.getElementById('maintenanceSaveButton');
  if(button){button.disabled=true;button.textContent='Salvando…';}
  let createdExpenseId='',persistedCall=null,resolvedExpense=null,retryCall=null;
  try{
    const item={
      id:existing?existing.id:(expenseData?newOperationId():''),
      houseId:houseId,
      tenantId:existing?existing.tenantId:(h.tenantId||''),
      titulo:title,descricao:description,categoria:category,
      prioridade:priority,status:status,
      abertoPor:existing?existing.abertoPor:'proprietario',
      resposta:response,
      despesaId:alreadyLinked?existing.despesaId:(createdExpenseId||''),
      resolvidoEm:status==='resolvido'&&existing?existing.resolvidoEm:'',
      prazo:form.prazo||'',
      responsavel:form.responsavel||'',
      fornecedor:form.fornecedor||'',
      orcamento:form.orcamento,
      custoFinal:form.custoFinal,
      quemPaga:form.quemPaga,
      observacoes:form.observacoes||'',
      motivoEncerramento:form.motivo||'',
      encerradoEm:(status==='resolvido'||status==='cancelado')
        ? ((existing&&existing.encerradoEm)||new Date().toISOString()) : '',
      arquivadoEm:existing?(existing.arquivadoEm||''):'',
      historico:[]
    };
    /* Histórico append-only: registra o que mudou, sem tabela nova. */
    const historicoAnterior=(existing&&Array.isArray(existing.historico))?existing.historico:[];
    item.historico=historicoAnterior.concat([{
      em:new Date().toISOString(),
      texto:maintenanceDiffText(existing,item)
    }]);
    if(expenseData&&!existing){
      retryCall=Object.assign({},item,{
        status:'aberto',resposta:'',despesaId:'',resolvidoEm:''
      });
      if(button){
        /* O identificador nasce antes da primeira requisição. Mesmo se a
           resposta do INSERT se perder, a próxima tentativa consulta e
           reutiliza exatamente este chamado. */
        /* A confirmação da despesa já foi dada: a nova tentativa não
           pergunta de novo, só refaz a gravação. */
        button.onclick=function(){ return saveMaintenanceCall(houseId,item.id,'confirmado'); };
      }
    }
    let saved;
    if(expenseData){
      /* Primeiro persiste apenas os dados descritivos. A RPC resolve o
         chamado, cria a despesa e faz o vínculo em uma única transação. */
      let currentCall=existing;
      if(existing){
        /* Uma tentativa anterior pode ter sido confirmada no banco mesmo
           quando a resposta da rede não chegou ao navegador. Consultar o
           registro evita tentar reabrir ou desvincular esse histórico. */
        currentCall=await db.getMaintenanceCall(existing.id);
      }
      if(currentCall&&currentCall.despesaId){
        persistedCall=currentCall;
      }else{
        const pendingItem=Object.assign({},item,{
          status:currentCall?currentCall.status:'aberto',
          resposta:currentCall?(currentCall.resposta||''):'',
          despesaId:'',
          resolvidoEm:currentCall?(currentCall.resolvidoEm||''):''
        });
        persistedCall=currentCall
          ?await db.updateMaintenanceCall(pendingItem)
          :await db.insertMaintenanceCall(houseId,pendingItem);
      }
      const resolution=await db.resolveMaintenanceCallWithExpense(
        Object.assign({},persistedCall,{resposta:response}),
        expenseData
      );
      saved=resolution.call;
      createdExpenseId=resolution.expenseId;
      resolvedExpense=resolution.expense||null;
    }else{
      saved=existing
        ? await db.updateMaintenanceCall(item)
        : await db.insertMaintenanceCall(houseId,item);
      persistedCall=saved;
    }
    if(!Array.isArray(h.chamados)) h.chamados=[];
    if(existing){
      const index=h.chamados.findIndex(function(call){return call.id===existing.id;});
      if(index>=0) h.chamados[index]=saved;
    }else{
      h.chamados.push(saved);
    }
    if(createdExpenseId&&resolvedExpense){
      if(!Array.isArray(h.despesas)) h.despesas=[];
      const expenseIndex=h.despesas.findIndex(function(expense){
        return expense.id===createdExpenseId;
      });
      if(expenseIndex>=0)h.despesas[expenseIndex]=resolvedExpense;
      else h.despesas.push(resolvedExpense);
    }
    closeModal();
    render();
    showToast(existing?'Chamado atualizado.':'Chamado registrado.','success');
  }catch(error){
    const uncertainInsert=!persistedCall&&!!retryCall;
    if(uncertainInsert) persistedCall=retryCall;
    if(persistedCall){
      if(!Array.isArray(h.chamados))h.chamados=[];
      const index=h.chamados.findIndex(function(call){return call.id===persistedCall.id;});
      if(index>=0)h.chamados[index]=persistedCall;
      else h.chamados.push(persistedCall);
    }
    console.error(error);
    showToast(
      uncertainInsert
        ?'Não foi possível confirmar se o chamado foi salvo. Tente novamente para continuar com segurança.'
        :persistedCall
        ?'O chamado foi salvo, mas a resolução não foi confirmada. Recarregue e tente novamente.'
        :'Não foi possível salvar o chamado.',
      'error'
    );
    if(button){button.disabled=false;button.textContent='Salvar chamado';}
  }
}
