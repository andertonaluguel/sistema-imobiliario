/* ============================================================
   crm.js — Etapa 7 (CRM operacional) e painel da Etapa 8.
   Interessado continua sendo a pessoa central. Lead, visita, tarefa,
   proposta e imóvel são registros ligados a ela, não cadastros paralelos.
   ============================================================ */

const CRM_ETAPAS=[
  ['novo','Novo'],['qualificacao','Em qualificação'],['contatado','Contatado'],
  ['visita_agendada','Visita agendada'],['visita_realizada','Visita realizada'],
  ['proposta','Proposta'],['fechado','Fechado'],['perdido','Perdido']
];
const CRM_ORIGENS={manual:'Manual',formulario:'Formulário',whatsapp:'WhatsApp',visita:'Visita',
  busca_salva:'Busca salva',indicacao:'Indicação',portal:'Portal',outro:'Outro'};

function crmEtapaLabel(status){const found=CRM_ETAPAS.find(function(x){return x[0]===status;});return found?found[1]:status;}
function crmResponsavelNome(id){
  if(!id)return 'Sem responsável';
  if(state.ownerProfile&&state.ownerProfile.user_id===id)return state.ownerProfile.nome||'Responsável principal';
  const membro=(state.team||[]).find(function(m){return m.userId===id;});
  return membro?(membro.nome||membro.email||'Equipe'):'Responsável atual';
}
function crmPrazoEstado(valor){
  if(!valor)return 'sem-prazo';const t=new Date(valor).getTime();if(!Number.isFinite(t))return 'sem-prazo';
  if(t<Date.now())return 'atrasada';if(t<Date.now()+86400000)return 'hoje';return 'futura';
}
function crmDataHora(valor){if(!valor)return '—';const d=new Date(valor);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});}
function crmFiltrados(){
  const busca=String(state.crmBusca||'').trim().toLowerCase(),resp=state.crmResponsavel||'',origem=state.crmOrigem||'';
  return (state.interests||[]).filter(function(i){
    if(resp==='sem'&&i.responsavelId)return false;if(resp&&resp!=='sem'&&i.responsavelId!==resp)return false;
    if(origem&&i.origem!==origem)return false;
    return !busca||[i.nome,i.telefone,i.email,i.campanha,i.proximaAcao].join(' ').toLowerCase().includes(busca);
  });
}
function setCrmFiltro(campo,valor){state[campo]=valor;render();}

function crmCard(i){
  const tarefas=(state.vitrine.crmTarefas||[]).filter(function(t){return t.interessadoId===i.id&&t.status==='pendente';})
    .sort(function(a,b){return String(a.prazo).localeCompare(String(b.prazo));});
  const proxima=tarefas[0],prazo=proxima?proxima.prazo:i.proximaAcaoEm,acao=proxima?proxima.titulo:i.proximaAcao;
  const propostas=(state.vitrine.crmPropostas||[]).filter(function(p){return p.interessadoId===i.id&&!['recusada','cancelada'].includes(p.status);});
  return '<article class="crm-card" data-stage="'+esc(i.status)+'"><header><div><span class="chip chip-'+interestStatusTone(i.status)+'">'+esc(crmEtapaLabel(i.status))+'</span><h3>'+esc(i.nome)+'</h3></div>'+ 
    '<button class="btn btn-ghost btn-sm" onclick="abrirCrmDetalhe(\''+i.id+'\')">Abrir</button></header>'+ 
    '<p class="crm-contact">'+esc(i.telefone||i.email||'Contato não informado')+'</p>'+ 
    '<div class="crm-meta"><span>'+esc(CRM_ORIGENS[i.origem]||i.origem||'Manual')+'</span><span>'+esc(crmResponsavelNome(i.responsavelId))+'</span></div>'+ 
    (acao?'<div class="crm-next is-'+crmPrazoEstado(prazo)+'"><strong>'+esc(acao)+'</strong><span>'+esc(crmDataHora(prazo))+'</span></div>':'<div class="crm-next is-sem-prazo"><strong>Sem próxima ação</strong><span>Defina o retorno</span></div>')+ 
    (propostas.length?'<small>'+propostas.length+' proposta'+(propostas.length===1?'':'s')+' ativa'+(propostas.length===1?'':'s')+'</small>':'')+ 
    (canOperateProperties()?'<label class="crm-stage-select"><span class="sr-only">Alterar etapa de '+esc(i.nome)+'</span><select onchange="mudarCrmEtapa(\''+i.id+'\',this.value)">'+CRM_ETAPAS.map(function(e){return '<option value="'+e[0]+'"'+(i.status===e[0]?' selected':'')+'>'+e[1]+'</option>';}).join('')+'</select></label>':'')+ 
  '</article>';
}

function renderVitrineCrm(){
  const todos=state.interests||[],ativos=todos.filter(activeInterest),tarefas=state.vitrine.crmTarefas||[],propostas=state.vitrine.crmPropostas||[];
  const semResp=ativos.filter(function(i){return !i.responsavelId;}).length;
  const semAcao=ativos.filter(function(i){return !i.proximaAcaoEm&&!tarefas.some(function(t){return t.interessadoId===i.id&&t.status==='pendente';});}).length;
  const atrasadas=tarefas.filter(function(t){return t.status==='pendente'&&crmPrazoEstado(t.prazo)==='atrasada';}).length;
  const visitas=(state.vitrine.visitas||[]).filter(function(v){return ['confirmada','realizada','reagendada'].includes(v.status);}).length;
  const fechados=todos.filter(function(i){return i.status==='fechado';}).length;
  const lista=crmFiltrados();
  return '<div class="vitrine-stats">'+vitrineStat(ativos.length,'Em acompanhamento','gold')+vitrineStat(semResp,'Sem responsável','warn')+
      vitrineStat(semAcao,'Sem próxima ação','warn')+vitrineStat(atrasadas,'Tarefas atrasadas','warn')+vitrineStat(visitas,'Visitas ativas','')+
      vitrineStat(propostas.filter(function(p){return !['recusada','cancelada'].includes(p.status);}).length,'Propostas ativas','')+vitrineStat(fechados,'Fechados','gold')+'</div>'+ 
    '<div class="panel crm-toolbar"><div><h2>CRM operacional</h2><p>Todo contato com responsável, prazo, histórico e próxima ação.</p></div>'+ 
      '<div class="crm-filters"><label><span class="sr-only">Buscar no CRM</span><input placeholder="Buscar pessoa, contato ou campanha…" value="'+esc(state.crmBusca||'')+'" onchange="setCrmFiltro(\'crmBusca\',this.value)"></label>'+ 
      '<label><span class="sr-only">Filtrar responsável</span><select onchange="setCrmFiltro(\'crmResponsavel\',this.value)"><option value="">Todos os responsáveis</option><option value="sem"'+(state.crmResponsavel==='sem'?' selected':'')+'>Sem responsável</option>'+interestResponsibleOptions(state.crmResponsavel).join('')+'</select></label>'+ 
      '<label><span class="sr-only">Filtrar origem</span><select onchange="setCrmFiltro(\'crmOrigem\',this.value)"><option value="">Todas as origens</option>'+Object.keys(CRM_ORIGENS).map(function(k){return '<option value="'+k+'"'+(state.crmOrigem===k?' selected':'')+'>'+CRM_ORIGENS[k]+'</option>';}).join('')+'</select></label>'+ 
      (canOperateProperties()?'<button class="btn btn-primary btn-sm" onclick="openAddInterestModal()">+ Interessado</button>':'')+'</div></div>'+ 
    '<div class="crm-pipeline" aria-label="Funil comercial">'+CRM_ETAPAS.map(function(etapa){
      const itens=lista.filter(function(i){return i.status===etapa[0];});
      return '<section class="crm-column"><header><h2>'+etapa[1]+'</h2><span>'+itens.length+'</span></header><div>'+ 
        (itens.length?itens.map(crmCard).join(''):'<p class="crm-column-empty">Nenhum contato</p>')+'</div></section>';
    }).join('')+'</div>';
}

async function mudarCrmEtapa(id,status){
  if(!requirePropertyPermission())return;const i=(state.interests||[]).find(function(x){return x.id===id;});if(!i)return;
  const anterior=i.status,next=Object.assign({},i,{status:status});
  if(status==='perdido'&&!next.motivoPerda){abrirCrmDetalhe(id);showToast('Informe o motivo da perda antes de concluir.','error');return;}
  const etapasAtivas=['qualificacao','contatado','visita_agendada','visita_realizada','proposta'];
  const tarefaPendente=(state.vitrine.crmTarefas||[]).some(function(t){return t.interessadoId===id&&t.status==='pendente';});
  if(etapasAtivas.includes(status)&&(!next.responsavelId||((!next.proximaAcao||!next.proximaAcaoEm)&&!tarefaPendente))){
    abrirCrmDetalhe(id);showToast('Defina responsável e próxima ação antes de avançar no funil.','error');return;
  }
  try{const saved=await db.updateInterest(next);Object.assign(i,saved||next);await loadVitrineData(true);render();showToast('Etapa atualizada de '+crmEtapaLabel(anterior)+' para '+crmEtapaLabel(status)+'.','success');}
  catch(e){console.error(e);showToast((e&&e.message)||'Não foi possível alterar a etapa.','error');render();}
}

function crmImovelNome(link){
  if(link.vitrineImovelId){const i=(state.vitrine.imoveis||[]).find(function(x){return x.id===link.vitrineImovelId;});return i?('#'+i.codigo+' · '+i.titulo):'Anúncio removido';}
  const h=(state.houses||[]).find(function(x){return x.id===link.imovelId;});return h?h.nome:'Imóvel removido';
}
function crmPropostaImovel(p){return crmImovelNome({vitrineImovelId:p.vitrineImovelId,imovelId:p.imovelId});}
function abrirCrmDetalhe(id){
  const i=(state.interests||[]).find(function(x){return x.id===id;});if(!i)return;state.crmDetalheId=id;
  const eventos=(state.vitrine.crmEventos||[]).filter(function(x){return x.interessadoId===id;});
  const tarefas=(state.vitrine.crmTarefas||[]).filter(function(x){return x.interessadoId===id;}).sort(function(a,b){return String(a.prazo).localeCompare(String(b.prazo));});
  const propostas=(state.vitrine.crmPropostas||[]).filter(function(x){return x.interessadoId===id;});
  const links=(state.vitrine.crmImoveis||[]).filter(function(x){return x.interessadoId===id;});
  const leadIds=(state.vitrine.leads||[]).filter(function(l){return l.interessadoId===id;}).map(function(l){return l.id;});
  const visitas=(state.vitrine.visitas||[]).filter(function(v){return leadIds.includes(v.leadId);});
  openModal('<div class="crm-detail"><div class="crm-detail-head"><div><span class="eyebrow">CRM · '+esc(CRM_ORIGENS[i.origem]||i.origem)+'</span><h3 class="modal-title">'+esc(i.nome)+'</h3><p>'+esc(i.telefone||'')+(i.email?' · '+esc(i.email):'')+'</p></div><span class="chip chip-'+interestStatusTone(i.status)+'">'+esc(crmEtapaLabel(i.status))+'</span></div>'+ 
    '<div class="crm-detail-summary"><div><span>Responsável</span><strong>'+esc(crmResponsavelNome(i.responsavelId))+'</strong></div><div><span>Primeira resposta</span><strong>'+esc(crmDataHora(i.primeiraRespostaEm))+'</strong></div><div><span>Próxima ação</span><strong>'+esc(i.proximaAcao||'Não definida')+'</strong><small>'+esc(crmDataHora(i.proximaAcaoEm))+'</small></div><div><span>Campanha</span><strong>'+esc(i.campanha||'Sem campanha')+'</strong></div></div>'+ 
    (canOperateProperties()?'<div class="crm-detail-actions"><button class="btn btn-ghost btn-sm" onclick="openEditInterestModal(\''+id+'\')">Editar cadastro</button>'+(!i.primeiraRespostaEm?'<button class="btn btn-primary btn-sm" onclick="marcarCrmPrimeiraResposta(\''+id+'\')">Registrar primeira resposta</button>':'')+(i.telefone?'<button class="btn btn-ghost btn-sm" onclick="openInterestWhatsapp(\''+id+'\')">WhatsApp</button>':'')+'</div>':'')+ 
    '<section class="crm-detail-section"><header><h4>Imóveis relacionados</h4>'+(canOperateProperties()?'<button class="btn btn-ghost btn-sm" onclick="abrirCrmVinculoModal(\''+id+'\')">+ Imóvel</button>':'')+'</header>'+(links.length?'<div class="crm-records">'+links.map(function(l){return '<article><strong>'+esc(crmImovelNome(l))+'</strong><span>'+esc(l.origem)+'</span>'+(canOperateProperties()?'<button aria-label="Remover vínculo" onclick="removerCrmVinculo(\''+l.id+'\',\''+id+'\')">×</button>':'')+'</article>';}).join('')+'</div>':'<p class="crm-muted">Nenhum imóvel relacionado.</p>')+'</section>'+ 
    '<section class="crm-detail-section"><header><h4>Tarefas</h4>'+(canOperateProperties()?'<button class="btn btn-primary btn-sm" onclick="abrirCrmTarefaModal(\''+id+'\')">+ Tarefa</button>':'')+'</header>'+(tarefas.length?'<div class="crm-records">'+tarefas.map(function(t){return '<article class="is-'+crmPrazoEstado(t.prazo)+'"><div><strong>'+esc(t.titulo)+'</strong><span>'+esc(crmDataHora(t.prazo))+' · '+esc(crmResponsavelNome(t.responsavelId))+'</span></div><span class="chip chip-slate">'+esc(t.status)+'</span>'+(canOperateProperties()&&t.status==='pendente'?'<button class="btn btn-ghost btn-sm" onclick="concluirCrmTarefa(\''+t.id+'\',\''+id+'\')">Concluir</button>':'')+'</article>';}).join('')+'</div>':'<p class="crm-muted">Nenhuma tarefa registrada.</p>')+'</section>'+ 
    '<section class="crm-detail-section"><header><h4>Visitas e propostas</h4>'+(canOperateProperties()?'<button class="btn btn-primary btn-sm" onclick="abrirCrmPropostaModal(\''+id+'\')">+ Proposta</button>':'')+'</header>'+ 
      (visitas.length?'<div class="crm-records">'+visitas.map(function(v){return '<article><strong>Visita · '+esc(vitrineFormatDate(v.data))+' · '+esc(vitrineFaixaLabel(v.faixa))+'</strong><span>'+esc(vitrineStatusVisitaLabel(v.status))+'</span></article>';}).join('')+'</div>':'')+
      (propostas.length?'<div class="crm-records">'+propostas.map(function(p){return '<article><div><strong>'+esc(crmPropostaImovel(p))+' · '+fmtMoney(p.valor)+'</strong><span>'+(p.validade?'Válida até '+esc(vitrineFormatDate(p.validade)):'Sem validade definida')+'</span></div>'+(canOperateProperties()?'<select aria-label="Situação da proposta" onchange="alterarCrmProposta(\''+p.id+'\',this.value,\''+id+'\')">'+['rascunho','enviada','negociacao','aceita','recusada','cancelada'].map(function(s){return '<option value="'+s+'"'+(p.status===s?' selected':'')+'>'+s.replace('_',' ')+'</option>';}).join('')+'</select>':'<span>'+esc(p.status)+'</span>')+'</article>';}).join('')+'</div>':'<p class="crm-muted">Nenhuma proposta registrada.</p>')+'</section>'+ 
    '<section class="crm-detail-section"><header><h4>Histórico</h4></header>'+(eventos.length?'<div class="crm-timeline">'+eventos.map(function(e){return '<article><i></i><div><strong>'+esc(e.titulo)+'</strong><span>'+esc(crmDataHora(e.createdAt))+(e.atorPapel?' · '+esc(teamRoleLabel(e.atorPapel)):'')+'</span></div></article>';}).join('')+'</div>':'<p class="crm-muted">O histórico começa na próxima alteração.</p>')+'</section>'+ 
    '<div class="modal-actions"><span></span><button class="btn btn-primary" onclick="closeModal()">Fechar</button></div></div>');
}

async function marcarCrmPrimeiraResposta(id){
  if(!requirePropertyPermission())return;const i=state.interests.find(function(x){return x.id===id;});if(!i)return;
  const next=Object.assign({},i,{primeiraRespostaEm:new Date().toISOString()});
  try{const saved=await db.updateInterest(next);Object.assign(i,saved||next);await loadVitrineData(true);abrirCrmDetalhe(id);showToast('Primeira resposta registrada.','success');}catch(e){showToast((e&&e.message)||'Não foi possível registrar.','error');}
}
function abrirCrmTarefaModal(id){
  const i=state.interests.find(function(x){return x.id===id;});if(!i)return;const d=new Date(Date.now()+86400000),local=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
  openModal('<h3 class="modal-title">Nova tarefa · '+esc(i.nome)+'</h3><label class="field"><span>Tarefa</span><input id="crm_task_title" placeholder="Ex.: confirmar documentos"></label><div class="field-row"><label class="field"><span>Tipo</span><select id="crm_task_type"><option value="retorno">Retorno</option><option value="ligacao">Ligação</option><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="visita">Visita</option><option value="proposta">Proposta</option><option value="outro">Outro</option></select></label><label class="field"><span>Prazo</span><input id="crm_task_due" type="datetime-local" value="'+local+'"></label></div><label class="field"><span>Responsável</span><select id="crm_task_owner"><option value="">Sem responsável</option>'+interestResponsibleOptions(i.responsavelId).join('')+'</select></label><div class="modal-actions"><button class="btn btn-ghost" onclick="abrirCrmDetalhe(\''+id+'\')">Voltar</button><button class="btn btn-primary" onclick="salvarCrmTarefa(\''+id+'\')">Salvar tarefa</button></div>');
}
async function salvarCrmTarefa(id){
  if(!requirePropertyPermission())return;const titulo=document.getElementById('crm_task_title').value.trim(),prazo=document.getElementById('crm_task_due').value;
  if(!titulo||!prazo){showToast('Informe a tarefa e o prazo.','error');return;}
  try{const task=await db.insertCrmTask({interessadoId:id,titulo:titulo,prazo:prazo,tipo:document.getElementById('crm_task_type').value,responsavelId:document.getElementById('crm_task_owner').value});state.vitrine.crmTarefas.unshift(task);const i=state.interests.find(function(x){return x.id===id;});if(i){const saved=await db.updateInterest(Object.assign({},i,{proximaAcao:titulo,proximaAcaoEm:prazo,responsavelId:task.responsavelId||i.responsavelId}));Object.assign(i,saved||{});}await loadVitrineData(true);abrirCrmDetalhe(id);showToast('Tarefa criada.','success');}catch(e){showToast((e&&e.message)||'Não foi possível criar a tarefa.','error');}
}
async function concluirCrmTarefa(taskId,interestId){
  if(!requirePropertyPermission())return;const t=state.vitrine.crmTarefas.find(function(x){return x.id===taskId;});if(!t)return;
  try{const saved=await db.updateCrmTask(Object.assign({},t,{status:'concluida',concluidaEm:new Date().toISOString()}));Object.assign(t,saved);await db.registerCrmEvent(interestId,'tarefa','Tarefa concluída',{observacao:t.titulo});await loadVitrineData(true);abrirCrmDetalhe(interestId);showToast('Tarefa concluída.','success');}catch(e){showToast((e&&e.message)||'Não foi possível concluir.','error');}
}
function abrirCrmVinculoModal(id){
  const options=(state.vitrine.imoveis||[]).map(function(i){return '<option value="v:'+i.id+'">Vitrine #'+esc(i.codigo)+' · '+esc(i.titulo)+'</option>';}).concat((state.houses||[]).map(function(h){return '<option value="h:'+h.id+'">Gestão · '+esc(h.nome)+'</option>';}));
  if(!options.length){showToast('Nenhum imóvel disponível para relacionar.','error');return;}
  openModal('<h3 class="modal-title">Relacionar imóvel</h3><label class="field"><span>Imóvel</span><select id="crm_link_property">'+options.join('')+'</select></label><div class="modal-actions"><button class="btn btn-ghost" onclick="abrirCrmDetalhe(\''+id+'\')">Voltar</button><button class="btn btn-primary" onclick="salvarCrmVinculo(\''+id+'\')">Relacionar</button></div>');
}
async function salvarCrmVinculo(id){const value=document.getElementById('crm_link_property').value,p=value.slice(2);try{const link=await db.linkCrmProperty({interessadoId:id,vitrineImovelId:value.startsWith('v:')?p:'',imovelId:value.startsWith('h:')?p:'',origem:'manual'});if(!state.vitrine.crmImoveis.some(function(x){return x.id===link.id;}))state.vitrine.crmImoveis.unshift(link);abrirCrmDetalhe(id);showToast('Imóvel relacionado.','success');}catch(e){showToast((e&&e.message)||'Não foi possível relacionar.','error');}}
async function removerCrmVinculo(linkId,id){try{await db.unlinkCrmProperty(linkId);state.vitrine.crmImoveis=state.vitrine.crmImoveis.filter(function(x){return x.id!==linkId;});abrirCrmDetalhe(id);}catch(e){showToast((e&&e.message)||'Não foi possível remover.','error');}}

function abrirCrmPropostaModal(id){
  const links=(state.vitrine.crmImoveis||[]).filter(function(x){return x.interessadoId===id;});
  if(!links.length){showToast('Relacione um imóvel antes de criar a proposta.','error');return;}
  const validade=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  openModal('<h3 class="modal-title">Nova proposta</h3><p class="modal-text">Proposta registra negociação; não é contrato.</p><label class="field"><span>Imóvel</span><select id="crm_proposal_property">'+links.map(function(l){return '<option value="'+(l.vitrineImovelId?'v:':'h:')+(l.vitrineImovelId||l.imovelId)+'">'+esc(crmImovelNome(l))+'</option>';}).join('')+'</select></label><div class="field-row"><label class="field"><span>Valor</span><input id="crm_proposal_value" type="number" min="0.01" step="0.01"></label><label class="field"><span>Validade</span><input id="crm_proposal_valid" type="date" value="'+validade+'"></label></div><label class="field"><span>Condições</span><textarea id="crm_proposal_terms" rows="4" placeholder="Garantia, prazo, entrada ou observações"></textarea></label><div class="modal-actions"><button class="btn btn-ghost" onclick="abrirCrmDetalhe(\''+id+'\')">Voltar</button><button class="btn btn-primary" onclick="salvarCrmProposta(\''+id+'\')">Criar proposta</button></div>');
}
async function salvarCrmProposta(id){
  const property=document.getElementById('crm_proposal_property').value,valor=Number(document.getElementById('crm_proposal_value').value)||0;if(valor<=0){showToast('Informe o valor da proposta.','error');return;}
  try{const p=property.slice(2),proposal=await db.insertCrmProposal({interessadoId:id,vitrineImovelId:property.startsWith('v:')?p:'',imovelId:property.startsWith('h:')?p:'',finalidade:(state.interests.find(function(x){return x.id===id;})||{}).finalidade||'alugar',valor:valor,validade:document.getElementById('crm_proposal_valid').value,condicoes:document.getElementById('crm_proposal_terms').value,status:'rascunho'});state.vitrine.crmPropostas.unshift(proposal);const i=state.interests.find(function(x){return x.id===id;});if(i){const prazo=new Date(Date.now()+2*86400000).toISOString();const saved=await db.updateInterest(Object.assign({},i,{status:'proposta',proximaAcao:'Acompanhar proposta',proximaAcaoEm:prazo}));Object.assign(i,saved||{});}await db.registerCrmEvent(id,'proposta','Proposta criada',{observacao:fmtMoney(valor)});await loadVitrineData(true);abrirCrmDetalhe(id);showToast('Proposta criada.','success');}catch(e){showToast((e&&e.message)||'Não foi possível criar a proposta.','error');}
}
async function alterarCrmProposta(id,status,interestId){const p=state.vitrine.crmPropostas.find(function(x){return x.id===id;});if(!p)return;try{const saved=await db.updateCrmProposal(Object.assign({},p,{status:status}));Object.assign(p,saved);await db.registerCrmEvent(interestId,'proposta','Proposta '+status.replace('_',' '),{observacao:fmtMoney(p.valor)});if(status==='aceita'){const i=state.interests.find(function(x){return x.id===interestId;});if(i){const updated=await db.updateInterest(Object.assign({},i,{status:'fechado',proximaAcao:'Formalizar contrato',proximaAcaoEm:new Date(Date.now()+86400000).toISOString()}));Object.assign(i,updated||{});}}await loadVitrineData(true);abrirCrmDetalhe(interestId);showToast('Proposta atualizada.','success');}catch(e){showToast((e&&e.message)||'Não foi possível atualizar.','error');}}

function crmPercentil(valores,p){if(!valores.length)return 0;const a=valores.slice().sort(function(x,y){return x-y;});return a[Math.min(a.length-1,Math.max(0,Math.ceil(a.length*p)-1))];}
function renderVitrineQualidade(){
  const dias=Math.max(1,Number(state.crmQualidadePeriodo)||7),desde=Date.now()-dias*86400000;
  const metricas=(state.vitrine.observabilidade||[]).filter(function(m){return new Date(m.createdAt).getTime()>=desde;});
  const cargas=metricas.filter(function(m){return m.tipo==='carga_publica';}),erros=metricas.filter(function(m){return /^erro_/.test(m.tipo);});
  const leads=metricas.filter(function(m){return m.tipo==='lead_enviado';}),p95=crmPercentil(cargas.map(function(m){return m.duracaoMs;}),.95);
  return '<div class="vitrine-stats">'+vitrineStat(metricas.length,'Eventos técnicos','')+vitrineStat(cargas.length,'Cargas públicas','gold')+
    vitrineStat(p95?p95+' ms':'—','P95 de carregamento','')+vitrineStat(erros.length,'Falhas registradas',erros.length?'warn':'gold')+vitrineStat(leads.length,'Leads enviados','gold')+'</div>'+ 
    '<div class="panel crm-quality-head"><div><h2>Qualidade transversal</h2><p>Métricas técnicas sem nome, telefone, e-mail, mensagem ou token.</p></div><label><span>Período</span><select onchange="state.crmQualidadePeriodo=Number(this.value);render()"><option value="7"'+(dias===7?' selected':'')+'>7 dias</option><option value="30"'+(dias===30?' selected':'')+'>30 dias</option></select></label></div>'+ 
    '<div class="crm-quality-grid"><section class="panel"><h3>Proteções ativas</h3><ul><li>Grade paginada em blocos de 12 imóveis</li><li>Miniaturas responsivas e carregamento tardio</li><li>Mapa carregado somente quando solicitado</li><li>Movimento reduzido respeitado</li><li>Modais com foco, Escape e ciclo por Tab</li><li>Contexto técnico filtrado no servidor</li></ul></section>'+ 
    '<section class="panel"><h3>Eventos recentes</h3>'+(metricas.length?'<div class="crm-quality-list">'+metricas.slice(0,25).map(function(m){return '<article><strong>'+esc(m.tipo.replaceAll('_',' '))+'</strong><span>'+esc(crmDataHora(m.createdAt))+(m.duracaoMs?' · '+m.duracaoMs+' ms':'')+'</span></article>';}).join('')+'</div>':'<p class="crm-muted">As métricas começam após a publicação desta etapa.</p>')+'</section></div>';
}
