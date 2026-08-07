/* ============================================================
   interests.js — Interessados em alugar, preferências e combinações.
   O interessado não fica preso a uma casa; as combinações são
   recalculadas sempre que a casa ou as preferências mudam.
   ============================================================ */

const INTEREST_STATUSES = [
  ['novo','Novo contato'],
  ['qualificacao','Em qualificação'],
  ['contatado','Contatado'],
  ['visita_agendada','Visita agendada'],
  ['visita_realizada','Visita realizada'],
  ['proposta','Proposta'],
  ['fechado','Fechado'],
  ['perdido','Perdido']
];

function interestStatusLabel(status){
  const found=INTEREST_STATUSES.find(function(x){return x[0]===status;});
  return found?found[1]:'Novo contato';
}
function interestStatusTone(status){
  if(status==='proposta'||status==='fechado') return 'brass';
  if(status==='perdido') return 'slate';
  if(status==='visita_agendada'||status==='visita_realizada') return 'warn';
  return 'neutral';
}
function activeInterest(item){ return item.status!=='fechado'&&item.status!=='perdido'; }

function interestMatchesHouse(item,house){
  if(!item||!house||house.status!=='vaga') return false;
  if(Number(item.valorMaximo)>0&&Number(house.aluguelValor)>Number(item.valorMaximo)) return false;
  if(Number(house.quartos)<Number(item.quartosMin||0)) return false;
  if(Number(house.banheiros)<Number(item.banheirosMin||0)) return false;
  if(item.precisaSala&&!house.sala) return false;
  if(item.precisaCozinha&&!house.cozinha) return false;
  if(item.precisaGaragem&&!house.garagem) return false;
  if(item.precisaQuintal&&!house.quintal) return false;
  if(item.precisaAreaServico&&!house.areaServico) return false;
  return true;
}
function matchingHousesForInterest(item){
  return state.houses.filter(function(h){return interestMatchesHouse(item,h);});
}
function matchingInterestsForHouse(house){
  const priority={proposta:0,visita_realizada:1,visita_agendada:2,contatado:3,qualificacao:4,novo:5};
  return state.interests.filter(function(i){return activeInterest(i)&&interestMatchesHouse(i,house);})
    .sort(function(a,b){
      const pa=priority[a.status]===undefined?9:priority[a.status];
      const pb=priority[b.status]===undefined?9:priority[b.status];
      return pa-pb||a.nome.localeCompare(b.nome);
    });
}

function renderHouseLeadMatches(house){
  if(house.status!=='vaga') return '';
  const matches=matchingInterestsForHouse(house);
  return '<button class="house-lead-match'+(matches.length?' has-matches':'')+'" onclick="event.stopPropagation();openHouseMatches(\''+house.id+'\')">'+
    '<span>'+(matches.length?'♥':'○')+'</span><strong>'+matches.length+'</strong> interessado'+(matches.length===1?'':'s')+' compatível'+(matches.length===1?'':'eis')+
  '</button>';
}

function openHouseMatches(houseId){
  const h=state.houses.find(function(x){return x.id===houseId;});
  if(!h) return;
  const matches=matchingInterestsForHouse(h);
  openModal('<h3 class="modal-title">Interessados para '+esc(h.nome)+'</h3>'+renderHouseFeatures(h)+
    '<p class="modal-text">Combinações pelas características e pelo valor máximo informados.</p>'+ 
    (matches.length?'<div class="match-list">'+matches.map(function(i){
      return '<button class="match-row" onclick="closeModal();openEditInterestModal(\''+i.id+'\')"><span><strong>'+esc(i.nome)+'</strong><small>'+esc(interestStatusLabel(i.status))+(i.telefone?' · '+esc(i.telefone):'')+'</small></span><b>'+fmtMoney(i.valorMaximo)+'</b></button>';
    }).join('')+'</div>':'<div class="empty-state">Nenhum interessado combina com esta casa no momento.</div>')+
    '<div class="modal-actions"><span></span><div class="modal-actions-right"><button class="btn btn-primary" onclick="closeModal()">Concluir</button></div></div>');
}

function setInterestSearch(value){state.interestSearch=value;render();}
function setInterestFilter(value){state.interestFilter=value;render();}

function interestPreferenceLabels(item){
  const labels=[];
  if(Number(item.valorMaximo)>0) labels.push({icon:FICO.money,label:'Até '+fmtMoney(item.valorMaximo)});
  if(Number(item.quartosMin)>0) labels.push({icon:FICO.bed,label:item.quartosMin+'+ quarto'+(Number(item.quartosMin)===1?'':'s')});
  if(Number(item.banheirosMin)>0) labels.push({icon:FICO.bath,label:item.banheirosMin+'+ banheiro'+(Number(item.banheirosMin)===1?'':'s')});
  if(item.precisaSala) labels.push({icon:FICO.sofa,label:'Precisa de sala'});
  if(item.precisaCozinha) labels.push({icon:FICO.kitchen,label:'Precisa de cozinha'});
  if(item.precisaGaragem) labels.push({icon:FICO.garage,label:'Precisa de garagem'});
  if(item.precisaQuintal) labels.push({icon:FICO.yard,label:'Precisa de quintal'});
  if(item.precisaAreaServico) labels.push({icon:FICO.laundry,label:'Precisa de área de serviço'});
  return labels;
}

function renderInterestCard(item){
  const matches=matchingHousesForInterest(item),prefs=interestPreferenceLabels(item);
  const canEdit=canOperateProperties();
  return '<article class="interest-card status-'+esc(item.status)+'">'+
    '<div class="interest-card-head"><div><span class="chip chip-'+interestStatusTone(item.status)+'">'+esc(interestStatusLabel(item.status))+'</span><h3>'+esc(item.nome)+'</h3>'+(item.telefone?'<span>'+esc(item.telefone)+'</span>':'<span class="muted">Telefone não informado</span>')+'</div>'+
      '<button class="icon-action" onclick="openEditInterestModal(\''+item.id+'\')" aria-label="'+(canEdit?'Editar':'Ver')+'">'+(canEdit?'Editar':'Ver')+'</button></div>'+
    '<div class="interest-preferences">'+(prefs.length?prefs.map(function(x){return '<span><i class="feature-icon">'+x.icon+'</i>'+esc(x.label)+'</span>';}).join(''):'<span class="feature-empty">Sem preferências informadas</span>')+'</div>'+ 
    (item.observacoes?'<p class="interest-notes">'+esc(item.observacoes)+'</p>':'')+
    '<div class="interest-matches"><span>CASAS VAGAS COMPATÍVEIS</span><strong>'+matches.length+'</strong></div>'+ 
    (matches.length?'<div class="interest-house-list">'+matches.map(function(h){return '<button onclick="openHouse(\''+h.id+'\')">'+esc(h.nome)+' <b>'+fmtMoney(h.aluguelValor)+'</b></button>';}).join('')+'</div>':'<p class="muted">Nenhuma combinação no momento.</p>')+
    (canEdit?'<div class="interest-actions">'+(item.telefone?'<button class="btn btn-ghost btn-sm" onclick="openInterestWhatsapp(\''+item.id+'\')">WhatsApp</button>':'')+
      (activeInterest(item)?'<button class="btn btn-primary btn-sm" onclick="openConvertInterestModal(\''+item.id+'\')">Transformar em inquilino</button>':'')+'</div>':'')+
  '</article>';
}

function renderInterestsView(){
  const q=(state.interestSearch||'').trim().toLowerCase(),filter=state.interestFilter||'ativos';
  const filtered=state.interests.filter(function(item){
    if(filter==='ativos'&&!activeInterest(item)) return false;
    if(filter!=='todos'&&filter!=='ativos'&&item.status!==filter) return false;
    return !q||(item.nome+' '+item.telefone+' '+item.observacoes).toLowerCase().includes(q);
  });
  const activeCount=state.interests.filter(activeInterest).length;
  return '<div class="page-header"><div><div class="eyebrow">FUTUROS INQUILINOS</div>'+pageTitleWithIcon(tenantIconSvg(),'Interessados em alugar')+
      '<p class="page-sub">Guarde contatos e encontre rapidamente as casas vagas que combinam com cada pessoa.</p></div>'+ 
      (canOperateProperties()?'<button class="btn btn-primary btn-sm" onclick="openAddInterestModal()">+ Novo interessado</button>':'')+'</div>'+
    '<div class="interest-summary"><strong>'+activeCount+'</strong><span>interessado'+(activeCount===1?'':'s')+' em acompanhamento</span></div>'+ 
    '<div class="toolbar"><div class="search-wrap"><span class="search-ico">'+FICO.search+'</span><input class="search-input" placeholder="Buscar nome, telefone ou observação…" value="'+esc(state.interestSearch||'')+'" onchange="setInterestSearch(this.value)"></div>'+ 
      '<div class="filter-chips"><button class="filter-chip'+(filter==='ativos'?' active':'')+'" onclick="setInterestFilter(\'ativos\')">Em andamento</button>'+INTEREST_STATUSES.map(function(s){return '<button class="filter-chip'+(filter===s[0]?' active':'')+'" onclick="setInterestFilter(\''+s[0]+'\')">'+esc(s[1])+'</button>';}).join('')+'<button class="filter-chip'+(filter==='todos'?' active':'')+'" onclick="setInterestFilter(\'todos\')">Todos</button></div></div>'+ 
    (filtered.length?'<div class="interest-grid">'+filtered.map(renderInterestCard).join('')+'</div>':emptyState('Nenhum interessado encontrado.',tenantIconSvg()));
}

function interestFormHtml(item){
  const i=item||{};
  return '<label class="field"><span>Nome *</span><input id="f_interest_name" value="'+esc(i.nome||'')+'" placeholder="Nome do interessado"></label>'+ 
    '<div class="field-row"><label class="field"><span>Telefone/WhatsApp</span><input id="f_interest_phone" value="'+esc(i.telefone||'')+'"></label>'+ 
      '<label class="field"><span>E-mail</span><input id="f_interest_email" type="email" value="'+esc(i.email||'')+'"></label></div>'+ 
    '<div class="field-row"><label class="field"><span>Etapa do funil</span><select id="f_interest_status">'+INTEREST_STATUSES.map(function(s){return '<option value="'+s[0]+'"'+((i.status||'novo')===s[0]?' selected':'')+'>'+esc(s[1])+'</option>';}).join('')+'</select></label>'+ 
      '<label class="field"><span>Finalidade</span><select id="f_interest_finalidade"><option value="alugar"'+((i.finalidade||'alugar')==='alugar'?' selected':'')+'>Alugar</option><option value="vender"'+(i.finalidade==='vender'?' selected':'')+'>Comprar</option></select></label></div>'+ 
    '<div class="field-row"><label class="field"><span>Origem</span><select id="f_interest_origem">'+[['manual','Cadastro manual'],['formulario','Formulário'],['whatsapp','WhatsApp'],['visita','Visita'],['busca_salva','Busca salva'],['indicacao','Indicação'],['portal','Portal'],['outro','Outro']].map(function(o){return '<option value="'+o[0]+'"'+((i.origem||'manual')===o[0]?' selected':'')+'>'+o[1]+'</option>';}).join('')+'</select></label>'+ 
      '<label class="field"><span>Campanha</span><input id="f_interest_campaign" value="'+esc(i.campanha||'')+'" placeholder="Ex.: Instagram agosto"></label></div>'+ 
    '<div class="field-row"><label class="field"><span>Responsável</span><select id="f_interest_responsavel"><option value="">Sem responsável</option>'+interestResponsibleOptions(i.responsavelId).join('')+'</select></label>'+ 
      '<label class="field"><span>Primeira resposta</span><input id="f_interest_first_response" type="datetime-local" value="'+esc(interestDateTimeLocal(i.primeiraRespostaEm))+'"></label></div>'+ 
    '<div class="field-row"><label class="field"><span>Próxima ação</span><input id="f_interest_next_action" value="'+esc(i.proximaAcao||'')+'" placeholder="Ex.: confirmar renda"></label>'+ 
      '<label class="field"><span>Prazo</span><input id="f_interest_next_at" type="datetime-local" value="'+esc(interestDateTimeLocal(i.proximaAcaoEm))+'"></label></div>'+ 
    '<label class="field"><span>Motivo de perda</span><input id="f_interest_loss" value="'+esc(i.motivoPerda||'')+'" placeholder="Preencha somente ao marcar como perdido"></label>'+ 
    '<div class="form-section-title">O que essa pessoa procura</div>'+ 
    '<div class="field-row"><label class="field"><span>Valor máximo (R$)</span><input id="f_interest_value" type="number" min="0" step="0.01" value="'+(Number(i.valorMaximo)||0)+'"></label>'+ 
      '<label class="field"><span>Mínimo de quartos</span><input id="f_interest_rooms" type="number" min="0" step="1" value="'+(Number(i.quartosMin)||0)+'"></label>'+ 
      '<label class="field"><span>Mínimo de banheiros</span><input id="f_interest_baths" type="number" min="0" step="1" value="'+(Number(i.banheirosMin)||0)+'"></label></div>'+ 
    '<div class="feature-check-grid house-room-checks">'+
      '<label><input id="f_interest_living" type="checkbox"'+(i.precisaSala?' checked':'')+'><span class="room-check-icon">'+FICO.sofa+'</span><span>Sala</span></label>'+ 
      '<label><input id="f_interest_kitchen" type="checkbox"'+(i.precisaCozinha?' checked':'')+'><span class="room-check-icon">'+FICO.kitchen+'</span><span>Cozinha</span></label>'+ 
      '<label><input id="f_interest_yard" type="checkbox"'+(i.precisaQuintal?' checked':'')+'><span class="room-check-icon">'+FICO.yard+'</span><span>Quintal</span></label>'+ 
      '<label><input id="f_interest_laundry" type="checkbox"'+(i.precisaAreaServico?' checked':'')+'><span class="room-check-icon">'+FICO.laundry+'</span><span>Área de serviço</span></label>'+ 
      '<label><input id="f_interest_garage" type="checkbox"'+(i.precisaGaragem?' checked':'')+'><span class="room-check-icon">'+FICO.garage+'</span><span>Garagem</span></label></div>'+ 
    '<label class="field"><span>Observações</span><textarea id="f_interest_notes" rows="4" placeholder="Preferências, perfil, detalhes da conversa…">'+esc(i.observacoes||'')+'</textarea></label>';
}
function interestDateTimeLocal(value){if(!value)return '';const d=new Date(value);if(Number.isNaN(d.getTime()))return '';const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);return local.toISOString().slice(0,16);}
function interestResponsibleOptions(current){
  const ownerId=(state.ownerProfile&&state.ownerProfile.user_id)||'',seen=new Set(),out=[];
  if(ownerId){seen.add(ownerId);out.push('<option value="'+esc(ownerId)+'"'+(current===ownerId?' selected':'')+'>Responsável principal</option>');}
  (state.team||[]).filter(function(m){return m.ativo!==false&&!seen.has(m.userId);}).forEach(function(m){seen.add(m.userId);out.push('<option value="'+esc(m.userId)+'"'+(current===m.userId?' selected':'')+'>'+esc(m.nome||m.email||'Equipe')+'</option>');});
  if(current&&!seen.has(current))out.push('<option value="'+esc(current)+'" selected>Responsável atual</option>');
  return out;
}
function readInterestForm(){
  return {nome:document.getElementById('f_interest_name').value.trim(),telefone:document.getElementById('f_interest_phone').value.trim(),
    email:document.getElementById('f_interest_email').value.trim(),status:document.getElementById('f_interest_status').value,
    finalidade:document.getElementById('f_interest_finalidade').value,origem:document.getElementById('f_interest_origem').value,
    campanha:document.getElementById('f_interest_campaign').value.trim(),responsavelId:document.getElementById('f_interest_responsavel').value,
    primeiraRespostaEm:document.getElementById('f_interest_first_response').value||'',proximaAcao:document.getElementById('f_interest_next_action').value.trim(),
    proximaAcaoEm:document.getElementById('f_interest_next_at').value||'',motivoPerda:document.getElementById('f_interest_loss').value.trim(),
    valorMaximo:Number(document.getElementById('f_interest_value').value)||0,
    quartosMin:Math.max(0,parseInt(document.getElementById('f_interest_rooms').value,10)||0),banheirosMin:Math.max(0,parseInt(document.getElementById('f_interest_baths').value,10)||0),
    precisaSala:document.getElementById('f_interest_living').checked,precisaCozinha:document.getElementById('f_interest_kitchen').checked,
    precisaGaragem:document.getElementById('f_interest_garage').checked,precisaQuintal:document.getElementById('f_interest_yard').checked,
    precisaAreaServico:document.getElementById('f_interest_laundry').checked,observacoes:document.getElementById('f_interest_notes').value.trim()};
}
/* `prefill` chega preenchido quando o cadastro nasce de um contato do site
   (ver converterLeadEmInteressado, em vitrine.js). `origemLeadId` liga os
   dois depois de salvar, para o mesmo contato não ser cadastrado de novo. */
function openAddInterestModal(prefill,origemLeadId){
  if(!requirePropertyPermission())return;
  const base=Object.assign({status:'novo'},prefill||{});
  const veioDoSite=!!origemLeadId;
  openModal('<h3 class="modal-title">Novo interessado</h3>'+
    '<p class="modal-text">'+(veioDoSite
      ? 'Contato recebido pelo site. Complete o que essa pessoa procura para o aplicativo mostrar as casas compatíveis.'
      : 'Cadastre o que essa pessoa procura. O aplicativo mostrará as casas compatíveis automaticamente.')+'</p>'+
    interestFormHtml(base)+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-primary" onclick="saveNewInterest('+
        (veioDoSite?'\''+origemLeadId+'\'':'')+')">Cadastrar</button>'+
    '</div></div>');
}
async function saveNewInterest(origemLeadId){
  if(!requirePropertyPermission())return;
  const item=readInterestForm(); if(!item.nome){showToast('Informe o nome do interessado.','error');return;}
  if(!emailValido(item.email)){showToast('E-mail inválido. Confira ou deixe em branco.','error');return;}
  try{
    const saved=await db.insertInterest(item,origemLeadId||null);
    const existente=state.interests.find(function(x){return x.id===saved.id;});
    if(existente)Object.assign(existente,saved);else state.interests.unshift(saved);
    /* O vínculo com o lead é acessório: se ele falhar, o interessado já
       está cadastrado e não se perde nada. Por isso não derruba o fluxo. */
    if(origemLeadId){
      try{
        await db.setVitrineLeadInteressado(origemLeadId,saved.id);
        const lead=(state.vitrine.leads||[]).find(function(x){return x.id===origemLeadId;});
        if(lead){ lead.interessadoId=saved.id; if(lead.status==='novo') lead.status='contatado'; }
      }catch(vinculo){ console.warn('Lead não pôde ser marcado como convertido:',vinculo); }
    }
    if(state.view==='vitrine'&&typeof loadVitrineData==='function')await loadVitrineData(true);
    closeModal();render();showToast('Interessado cadastrado.','success');
  }
  catch(e){console.error(e);showToast((e&&e.message)||'Não foi possível cadastrar o interessado.','error');}
}
function openEditInterestModal(id){
  const canEdit=canOperateProperties();
  const item=state.interests.find(function(x){return x.id===id;});if(!item)return;
  if(!canEdit){
    const matches=matchingHousesForInterest(item);
    openModal('<h3 class="modal-title">Consultar interessado</h3>'+
      '<p class="modal-text">Sua função permite somente consultar este cadastro.</p>'+
      '<div class="notice-box"><strong>'+esc(item.nome)+'</strong><br>'+esc(item.telefone||'Telefone não informado')+
      '<br>'+esc(interestStatusLabel(item.status))+(item.observacoes?'<br>'+esc(item.observacoes):'')+'</div>'+
      '<p class="modal-text">'+plural(matches.length,'casa vaga compatível','casas vagas compatíveis')+'.</p>'+
      '<div class="modal-actions"><span></span><button class="btn btn-primary" onclick="closeModal()">Fechar</button></div>');
    return;
  }
  openModal('<h3 class="modal-title">Editar interessado</h3>'+interestFormHtml(item)+
    '<div class="modal-actions"><button class="btn btn-danger" onclick="confirmDeleteInterest(\''+id+'\')">Excluir</button><div class="modal-actions-right"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveInterestEdit(\''+id+'\')">Salvar</button></div></div>');
}
async function saveInterestEdit(id){
  if(!requirePropertyPermission())return;
  const original=state.interests.find(function(x){return x.id===id;}),next=Object.assign({},original,readInterestForm());
  if(!next.nome){showToast('Informe o nome do interessado.','error');return;}
  if(!emailValido(next.email)){showToast('E-mail inválido. Confira ou deixe em branco.','error');return;}
  try{const saved=await db.updateInterest(next);Object.assign(original,saved||next);if(state.view==='vitrine'&&typeof loadVitrineData==='function')await loadVitrineData(true);closeModal();render();showToast('Interessado atualizado.','success');}
  catch(e){console.error(e);showToast((e&&e.message)||'Não foi possível salvar.','error');}
}
function confirmDeleteInterest(id){
  if(!requirePropertyPermission())return;
  const item=state.interests.find(function(x){return x.id===id;});if(!item)return;
  openModal('<h3 class="modal-title">Excluir '+esc(item.nome)+'?</h3><p class="modal-text">O cadastro e as observações serão removidos. Isso não pode ser desfeito.</p><div class="modal-actions"><span></span><div class="modal-actions-right"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-danger" onclick="deleteInterest(\''+id+'\')">Excluir</button></div></div>');
}
async function deleteInterest(id){
  if(!requirePropertyPermission())return;
  try{await db.deleteInterest(id);state.interests=state.interests.filter(function(x){return x.id!==id;});if(state.view==='vitrine'&&typeof loadVitrineData==='function')await loadVitrineData(true);closeModal();render();showToast('Interessado excluído.','success');}
  catch(e){console.error(e);showToast('Não foi possível excluir.','error');}
}
function openInterestWhatsapp(id){
  if(!requirePropertyPermission())return;
  const item=state.interests.find(function(x){return x.id===id;});if(!item||!item.telefone)return;
  let phone=item.telefone.replace(/\D/g,'');if(phone.length<=11)phone='55'+phone;
  window.open('https://wa.me/'+phone,'_blank');
}

function openConvertInterestModal(id){
  if(!requirePropertyPermission())return;
  const item=state.interests.find(function(x){return x.id===id;}),vacant=state.houses.filter(function(h){return h.status==='vaga';});
  if(!item)return;
  if(!vacant.length){showToast('Não há casa vaga para iniciar o contrato.','error');return;}
  const sorted=vacant.slice().sort(function(a,b){return Number(interestMatchesHouse(item,b))-Number(interestMatchesHouse(item,a));});
  const first=sorted[0];
  openModal('<h3 class="modal-title">Transformar em inquilino</h3><p class="modal-text">O cadastro de <strong>'+esc(item.nome)+'</strong> será aproveitado e um contrato será iniciado.</p>'+ 
    '<label class="field"><span>Casa vaga</span><select id="f_interest_house" onchange="syncInterestContractDefaults()">'+sorted.map(function(h){return '<option value="'+h.id+'">'+(interestMatchesHouse(item,h)?'★ ':'')+esc(h.nome)+' — '+fmtMoney(h.aluguelValor)+'</option>';}).join('')+'</select><small>★ combina com as preferências</small></label>'+ 
    contractFormFieldsHtml({inicio:todayISO(),valor:first.aluguelValor||0,diaVencimento:first.diaVencimento||5,modalidade:'fixo'})+
    '<div class="modal-actions"><span></span><div class="modal-actions-right"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveConvertInterest(\''+id+'\')">Criar inquilino e contrato</button></div></div>');
  updateContractFormPreview();
}
function syncInterestContractDefaults(){
  if(!requirePropertyPermission())return;
  const select=document.getElementById('f_interest_house'),h=select&&state.houses.find(function(x){return x.id===select.value;});if(!h)return;
  document.getElementById('f_contract_valor').value=Number(h.aluguelValor)||0;
  document.getElementById('f_contract_dia').value=h.diaVencimento||5;updateContractFormPreview();
}
async function saveConvertInterest(id){
  if(!requirePropertyPermission())return;
  const item=state.interests.find(function(x){return x.id===id;}),houseId=document.getElementById('f_interest_house').value,draft=readContractForm();
  if(!item)return;
  const validation=validateContractDraft(state.houses.find(function(h){return h.id===houseId;}),draft,'');
  if(validation){showToast(validation,'error');return;}
  let tenant=null,assigned=false;
  try{
    tenant=await db.insertTenant({nome:item.nome,telefone:item.telefone,email:'',documento:'',emergenciaNome:''});
    state.tenants.push(tenant);
    await assignTenantToHouse(tenant.id,houseId,draft.inicio,draft.fim,draft);
    assigned=true;
    item.status='fechado';item.tenantId=tenant.id;await db.updateInterest(item);
    closeModal();render();showToast('Interessado transformado em inquilino.','success');
  }catch(e){
    console.error(e);
    if(tenant&&!assigned){try{await db.deleteTenant(tenant.id);state.tenants=state.tenants.filter(function(t){return t.id!==tenant.id;});}catch(ignore){}}
    if(assigned){closeModal();render();showToast('O inquilino e o contrato foram criados, mas revise o status do interessado.','error');}
    else showToast(e&&e.message?e.message:'Não foi possível concluir.','error');
  }
}
