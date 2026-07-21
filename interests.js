/* ============================================================
   interests.js — Clientes quentes, preferências e combinações.
   O interessado não fica preso a uma casa; as combinações são
   recalculadas sempre que a casa ou as preferências mudam.
   ============================================================ */

const INTEREST_STATUSES = [
  ['novo','Novo contato'],
  ['conversando','Conversando'],
  ['visita','Visita marcada'],
  ['quente','Muito interessado'],
  ['fechado','Fechado'],
  ['desistiu','Desistiu']
];

function interestStatusLabel(status){
  const found=INTEREST_STATUSES.find(function(x){return x[0]===status;});
  return found?found[1]:'Novo contato';
}
function interestStatusTone(status){
  if(status==='quente'||status==='fechado') return 'brass';
  if(status==='desistiu') return 'slate';
  if(status==='visita') return 'warn';
  return 'neutral';
}
function activeInterest(item){ return item.status!=='fechado'&&item.status!=='desistiu'; }

function interestMatchesHouse(item,house){
  if(!item||!house||house.status!=='vaga') return false;
  if(Number(item.valorMaximo)>0&&Number(house.aluguelValor)>Number(item.valorMaximo)) return false;
  if(Number(house.quartos)<Number(item.quartosMin||0)) return false;
  if(Number(house.banheiros)<Number(item.banheirosMin||0)) return false;
  if(item.precisaGaragem&&!house.garagem) return false;
  if(item.precisaQuintal&&!house.quintal) return false;
  if(item.interessaPoco&&!house.pocoAgua) return false;
  return true;
}
function matchingHousesForInterest(item){
  return state.houses.filter(function(h){return interestMatchesHouse(item,h);});
}
function matchingInterestsForHouse(house){
  const priority={quente:0,visita:1,conversando:2,novo:3};
  return state.interests.filter(function(i){return activeInterest(i)&&interestMatchesHouse(i,house);})
    .sort(function(a,b){return (priority[a.status]||9)-(priority[b.status]||9)||a.nome.localeCompare(b.nome);});
}

function renderHouseLeadMatches(house){
  if(house.status!=='vaga') return '';
  const matches=matchingInterestsForHouse(house);
  return '<button class="house-lead-match'+(matches.length?' has-matches':'')+'" onclick="event.stopPropagation();openHouseMatches(\''+house.id+'\')">'+
    '<span>'+(matches.length?'♥':'○')+'</span><strong>'+matches.length+'</strong> cliente'+(matches.length===1?'':'s')+' compatível'+(matches.length===1?'':'eis')+
  '</button>';
}

function openHouseMatches(houseId){
  const h=state.houses.find(function(x){return x.id===houseId;});
  if(!h) return;
  const matches=matchingInterestsForHouse(h);
  openModal('<h3 class="modal-title">Clientes para '+esc(h.nome)+'</h3>'+renderHouseFeatures(h)+
    '<p class="modal-text">Combinações pelas características e pelo valor máximo informados.</p>'+ 
    (matches.length?'<div class="match-list">'+matches.map(function(i){
      return '<button class="match-row" onclick="closeModal();openEditInterestModal(\''+i.id+'\')"><span><strong>'+esc(i.nome)+'</strong><small>'+esc(interestStatusLabel(i.status))+(i.telefone?' · '+esc(i.telefone):'')+'</small></span><b>'+fmtMoney(i.valorMaximo)+'</b></button>';
    }).join('')+'</div>':'<div class="empty-state">Nenhum cliente combina com esta casa no momento.</div>')+
    '<div class="modal-actions"><span></span><div class="modal-actions-right"><button class="btn btn-primary" onclick="closeModal()">Concluir</button></div></div>');
}

function setInterestSearch(value){state.interestSearch=value;render();}
function setInterestFilter(value){state.interestFilter=value;render();}

function interestPreferenceLabels(item){
  const labels=[];
  if(Number(item.valorMaximo)>0) labels.push('Até '+fmtMoney(item.valorMaximo));
  if(Number(item.quartosMin)>0) labels.push(item.quartosMin+'+ quarto'+(Number(item.quartosMin)===1?'':'s'));
  if(Number(item.banheirosMin)>0) labels.push(item.banheirosMin+'+ banheiro'+(Number(item.banheirosMin)===1?'':'s'));
  if(item.precisaGaragem) labels.push('Precisa de garagem');
  if(item.precisaQuintal) labels.push('Precisa de quintal');
  if(item.interessaPoco) labels.push('Interesse em poço');
  return labels;
}

function renderInterestCard(item){
  const matches=matchingHousesForInterest(item),prefs=interestPreferenceLabels(item);
  return '<article class="interest-card status-'+esc(item.status)+'">'+
    '<div class="interest-card-head"><div><span class="chip chip-'+interestStatusTone(item.status)+'">'+esc(interestStatusLabel(item.status))+'</span><h3>'+esc(item.nome)+'</h3>'+(item.telefone?'<a href="javascript:void(0)" onclick="openInterestWhatsapp(\''+item.id+'\')">'+esc(item.telefone)+'</a>':'<span class="muted">Telefone não informado</span>')+'</div>'+ 
      '<button class="icon-action" onclick="openEditInterestModal(\''+item.id+'\')" aria-label="Editar">Editar</button></div>'+ 
    '<div class="interest-preferences">'+(prefs.length?prefs.map(function(x){return '<span>'+esc(x)+'</span>';}).join(''):'<span class="feature-empty">Sem preferências informadas</span>')+'</div>'+ 
    (item.observacoes?'<p class="interest-notes">'+esc(item.observacoes)+'</p>':'')+
    '<div class="interest-matches"><span>CASAS VAGAS COMPATÍVEIS</span><strong>'+matches.length+'</strong></div>'+ 
    (matches.length?'<div class="interest-house-list">'+matches.map(function(h){return '<button onclick="openHouse(\''+h.id+'\')">'+esc(h.nome)+' <b>'+fmtMoney(h.aluguelValor)+'</b></button>';}).join('')+'</div>':'<p class="muted">Nenhuma combinação no momento.</p>')+
    '<div class="interest-actions">'+(item.telefone?'<button class="btn btn-ghost btn-sm" onclick="openInterestWhatsapp(\''+item.id+'\')">WhatsApp</button>':'')+
      (activeInterest(item)?'<button class="btn btn-primary btn-sm" onclick="openConvertInterestModal(\''+item.id+'\')">Transformar em inquilino</button>':'')+'</div>'+ 
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
  return '<div class="page-header"><div><div class="eyebrow">RELACIONAMENTO</div>'+pageTitleWithIcon(tenantIconSvg(),'Clientes quentes')+
      '<p class="page-sub">Guarde contatos e encontre rapidamente as casas vagas que combinam com cada pessoa.</p></div>'+ 
      '<button class="btn btn-primary btn-sm" onclick="openAddInterestModal()">+ Novo cliente</button></div>'+ 
    '<div class="interest-summary"><strong>'+activeCount+'</strong><span>cliente'+(activeCount===1?'':'s')+' em acompanhamento</span></div>'+ 
    '<div class="toolbar"><div class="search-wrap"><span class="search-ico">'+FICO.search+'</span><input class="search-input" placeholder="Buscar nome, telefone ou observação…" value="'+esc(state.interestSearch||'')+'" onchange="setInterestSearch(this.value)"></div>'+ 
      '<div class="filter-chips"><button class="filter-chip'+(filter==='ativos'?' active':'')+'" onclick="setInterestFilter(\'ativos\')">Em andamento</button>'+INTEREST_STATUSES.map(function(s){return '<button class="filter-chip'+(filter===s[0]?' active':'')+'" onclick="setInterestFilter(\''+s[0]+'\')">'+esc(s[1])+'</button>';}).join('')+'<button class="filter-chip'+(filter==='todos'?' active':'')+'" onclick="setInterestFilter(\'todos\')">Todos</button></div></div>'+ 
    (filtered.length?'<div class="interest-grid">'+filtered.map(renderInterestCard).join('')+'</div>':emptyState('Nenhum cliente encontrado.',tenantIconSvg()));
}

function interestFormHtml(item){
  const i=item||{};
  return '<label class="field"><span>Nome *</span><input id="f_interest_name" value="'+esc(i.nome||'')+'" placeholder="Nome do interessado"></label>'+ 
    '<div class="field-row"><label class="field"><span>Telefone/WhatsApp</span><input id="f_interest_phone" value="'+esc(i.telefone||'')+'"></label>'+ 
      '<label class="field"><span>Situação</span><select id="f_interest_status">'+INTEREST_STATUSES.map(function(s){return '<option value="'+s[0]+'"'+((i.status||'novo')===s[0]?' selected':'')+'>'+esc(s[1])+'</option>';}).join('')+'</select></label></div>'+ 
    '<div class="form-section-title">O que essa pessoa procura</div>'+ 
    '<div class="field-row"><label class="field"><span>Valor máximo (R$)</span><input id="f_interest_value" type="number" min="0" step="0.01" value="'+(Number(i.valorMaximo)||0)+'"></label>'+ 
      '<label class="field"><span>Mínimo de quartos</span><input id="f_interest_rooms" type="number" min="0" step="1" value="'+(Number(i.quartosMin)||0)+'"></label>'+ 
      '<label class="field"><span>Mínimo de banheiros</span><input id="f_interest_baths" type="number" min="0" step="1" value="'+(Number(i.banheirosMin)||0)+'"></label></div>'+ 
    '<div class="feature-check-grid"><label><input id="f_interest_garage" type="checkbox"'+(i.precisaGaragem?' checked':'')+'> Precisa de garagem</label>'+ 
      '<label><input id="f_interest_yard" type="checkbox"'+(i.precisaQuintal?' checked':'')+'> Precisa de quintal</label>'+ 
      '<label><input id="f_interest_well" type="checkbox"'+(i.interessaPoco?' checked':'')+'> Interesse em poço com água</label></div>'+ 
    '<label class="field"><span>Observações</span><textarea id="f_interest_notes" rows="4" placeholder="Preferências, perfil, detalhes da conversa…">'+esc(i.observacoes||'')+'</textarea></label>';
}
function readInterestForm(){
  return {nome:document.getElementById('f_interest_name').value.trim(),telefone:document.getElementById('f_interest_phone').value.trim(),
    status:document.getElementById('f_interest_status').value,valorMaximo:Number(document.getElementById('f_interest_value').value)||0,
    quartosMin:Math.max(0,parseInt(document.getElementById('f_interest_rooms').value,10)||0),banheirosMin:Math.max(0,parseInt(document.getElementById('f_interest_baths').value,10)||0),
    precisaGaragem:document.getElementById('f_interest_garage').checked,precisaQuintal:document.getElementById('f_interest_yard').checked,
    interessaPoco:document.getElementById('f_interest_well').checked,observacoes:document.getElementById('f_interest_notes').value.trim()};
}
function openAddInterestModal(){
  openModal('<h3 class="modal-title">Novo cliente quente</h3><p class="modal-text">A casa de interesse não é fixa. O app mostrará as combinações automaticamente.</p>'+interestFormHtml({status:'novo'})+
    '<div class="modal-actions"><span></span><div class="modal-actions-right"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveNewInterest()">Cadastrar</button></div></div>');
}
async function saveNewInterest(){
  const item=readInterestForm(); if(!item.nome){showToast('Informe o nome do cliente.','error');return;}
  try{const saved=await db.insertInterest(item);state.interests.unshift(saved);closeModal();render();showToast('Cliente cadastrado.','success');}
  catch(e){console.error(e);showToast('Não foi possível cadastrar o cliente.','error');}
}
function openEditInterestModal(id){
  const item=state.interests.find(function(x){return x.id===id;});if(!item)return;
  openModal('<h3 class="modal-title">Editar cliente</h3>'+interestFormHtml(item)+
    '<div class="modal-actions"><button class="btn btn-danger" onclick="confirmDeleteInterest(\''+id+'\')">Excluir</button><div class="modal-actions-right"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveInterestEdit(\''+id+'\')">Salvar</button></div></div>');
}
async function saveInterestEdit(id){
  const original=state.interests.find(function(x){return x.id===id;}),next=Object.assign({},original,readInterestForm());
  if(!next.nome){showToast('Informe o nome do cliente.','error');return;}
  try{await db.updateInterest(next);Object.assign(original,next);closeModal();render();showToast('Cliente atualizado.','success');}
  catch(e){console.error(e);showToast('Não foi possível salvar.','error');}
}
function confirmDeleteInterest(id){
  const item=state.interests.find(function(x){return x.id===id;});if(!item)return;
  openModal('<h3 class="modal-title">Excluir '+esc(item.nome)+'?</h3><p class="modal-text">O cadastro e as observações serão removidos. Isso não pode ser desfeito.</p><div class="modal-actions"><span></span><div class="modal-actions-right"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-danger" onclick="deleteInterest(\''+id+'\')">Excluir</button></div></div>');
}
async function deleteInterest(id){
  try{await db.deleteInterest(id);state.interests=state.interests.filter(function(x){return x.id!==id;});closeModal();render();showToast('Cliente excluído.','success');}
  catch(e){console.error(e);showToast('Não foi possível excluir.','error');}
}
function openInterestWhatsapp(id){
  const item=state.interests.find(function(x){return x.id===id;});if(!item||!item.telefone)return;
  let phone=item.telefone.replace(/\D/g,'');if(phone.length<=11)phone='55'+phone;
  window.open('https://wa.me/'+phone,'_blank');
}

function openConvertInterestModal(id){
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
  const select=document.getElementById('f_interest_house'),h=select&&state.houses.find(function(x){return x.id===select.value;});if(!h)return;
  document.getElementById('f_contract_valor').value=Number(h.aluguelValor)||0;
  document.getElementById('f_contract_dia').value=h.diaVencimento||5;updateContractFormPreview();
}
async function saveConvertInterest(id){
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
    closeModal();render();showToast('Cliente transformado em inquilino.','success');
  }catch(e){
    console.error(e);
    if(tenant&&!assigned){try{await db.deleteTenant(tenant.id);state.tenants=state.tenants.filter(function(t){return t.id!==tenant.id;});}catch(ignore){}}
    if(assigned){closeModal();render();showToast('O inquilino e o contrato foram criados, mas revise o status do cliente.','error');}
    else showToast(e&&e.message?e.message:'Não foi possível concluir.','error');
  }
}
