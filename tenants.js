/* ============================================================
   tenants.js — Inquilinos (cadastro central reutilizável)
   O mesmo inquilino pode mudar de casa ao longo do tempo.
   Ao vincular a uma nova casa, a casa anterior fica vaga.
   ============================================================ */

function houseOf(tenantId){ return state.houses.find(function(h){ return h.tenantId===tenantId; }); }
function housesOf(tenantId){ return state.houses.filter(function(h){ return h.tenantId===tenantId; }); }
function tenantAccessOf(tenantId){ return (state.tenantAccess||[]).find(function(a){return a.inquilino_id===tenantId;})||null; }

function renderTenantAccessBlock(t){
  const access=tenantAccessOf(t.id);
  const stateText=!access?'Não liberado':access.aceito?(access.ativo?'Ativo':'Suspenso'):'Aguardando cadastro';
  const tone=access&&access.aceito&&access.ativo?'chip-brass':access?'chip-warn':'chip-slate';
  return '<div class="portal-access-box"><div><span class="field-kicker">PORTAL DO INQUILINO</span><strong>Acesso somente aos próprios dados</strong>'+
    '<small>'+esc(t.email||'Cadastre um e-mail para liberar o portal.')+'</small></div><span class="chip '+tone+'">'+stateText.toUpperCase()+'</span>'+
    (canOperateProperties()
      ?'<button class="btn btn-ghost btn-sm" onclick="openTenantPortalAccess(\''+t.id+'\')">'+(!access?'Liberar portal':'Gerenciar portal')+'</button>'
      :'<span class="tag">Somente consulta</span>')+'</div>';
}

/* ---------- listagem ---------- */
function normalizeTenantSearch(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}
function tenantContractRecords(tenantId){
  const records=[];
  (state.houses||[]).forEach(function(h){
    (h.contracts||[]).forEach(function(c){
      if(c.tenantId===tenantId) records.push({house:h,contract:c});
    });
  });
  return records;
}
function tenantMatchesSearch(t,query){
  const q=normalizeTenantSearch(query);
  if(!q) return true;
  const current=housesOf(t.id);
  const records=tenantContractRecords(t.id);
  const allHouses=current.concat(records.map(function(item){return item.house;}))
    .filter(function(h,index,list){return list.findIndex(function(item){return item.id===h.id;})===index;});
  const contractText=records.map(function(item){
    const c=item.contract;
    return [c.id,c.inicio,c.fim,c.valor,c.ativo?'ativo':'encerrado'].join(' ');
  }).join(' ');
  const general=normalizeTenantSearch([
    t.nome,t.telefone,t.email,
    allHouses.map(function(h){return [h.nome,h.endereco].join(' ');}).join(' '),
    contractText
  ].join(' '));
  if(general.indexOf(q)!==-1) return true;

  /* CPF e RG não ficam no índice amplo do cartão. Somente administrador e
     operacional podem pesquisar documento, sempre pelo número completo. */
  if(!canViewSensitiveTenantData()) return false;
  const queryDigits=String(query||'').replace(/\D/g,'');
  const documentDigits=String(t.documento||'').replace(/\D/g,'');
  return queryDigits.length>=8&&documentDigits.length>=8&&documentDigits===queryDigits;
}
function openTenantWhatsApp(tenantId){
  if(!requirePropertyPermission())return;
  const t=state.tenants.find(function(item){return item.id===tenantId;});
  if(!t||!t.telefone){
    showToast('Cadastre o telefone do inquilino primeiro.','error');
    return;
  }
  let phone=String(t.telefone).replace(/\D/g,'');
  if(phone.length<=11) phone='55'+phone;
  const text='Olá, '+t.nome+'.';
  window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(text),'_blank');
}

function renderTenantCard(t){
  const casas = housesOf(t.id);
  const n = casas.length;
  const overdueHouses=casas.filter(function(h){return houseAttentionSignals(h).overdue;});
  const isOverdue=overdueHouses.length>0;
  const nomes = casas.map(function(h){ return h.nome; });
  const status = n>0 ? 'com' : 'sem';
  const searchData = normalizeTenantSearch(t.nome+' '+(t.telefone||'')+' '+(t.email||'')+' '+nomes.join(' '));
  const chipTxt = isOverdue ? 'EM ATRASO' : (n===0 ? 'SEM CASA' : (n===1 ? '1 IMÓVEL' : n+' IMÓVEIS'));
  const bottom = isOverdue ? (overdueHouses.length===1?'Atraso em '+esc(overdueHouses[0].nome):overdueHouses.length+' imóveis com atraso') : n===0 ? 'Disponível para vincular'
    : (n===1 ? ('Mora em '+esc(nomes[0])) : ('Imóveis: '+nomes.map(esc).join(', ')));
  const tone=isOverdue?'rust':(n>0?'brass':'slate');
  const access=tenantAccessOf(t.id);
  const portalText=!access?'Portal não liberado':access.aceito?(access.ativo?'Portal ativo':'Portal suspenso'):'Aguardando acesso';
  const initial=String(t.nome||'?').trim().charAt(0).toUpperCase();
  return '<article class="house-card rent-tenant-card tab-'+tone+(isOverdue?' is-overdue':'')+'" data-tenant-id="'+esc(t.id)+'" data-status="'+status+'" data-atraso="'+(isOverdue?'1':'0')+'" data-search="'+esc(searchData)+'">'+
    '<div class="rent-tenant-head"><span class="rent-tenant-avatar">'+esc(initial)+'</span><div>'+
      '<div class="house-name">'+esc(t.nome)+'</div>'+
      '<div class="house-address">'+(t.telefone?esc(t.telefone):'Sem telefone cadastrado')+'</div>'+
    '</div><span class="chip chip-'+tone+'">'+chipTxt+'</span></div>'+
    '<div class="rent-tenant-home">'+bottom+'</div>'+
    '<div class="rent-tenant-portal"><span>'+portalText+'<small> · Acesso individual</small></span>'+
      (canOperateProperties()&&t.telefone?'<button class="btn btn-ghost btn-sm" onclick="openTenantWhatsApp(\''+t.id+'\')">WhatsApp</button>':'')+
      '<button class="btn '+(canOperateProperties()?'btn-primary':'btn-ghost')+' btn-sm" onclick="openEditTenantModal(\''+t.id+'\')">'+
        (canOperateProperties()?'Gerenciar':'Ver')+'</button></div>'+
  '</article>';
}

/* busca + filtro de inquilinos */
function setInqBusca(v){ state.inqBusca = v; aplicarFiltroInq(); }
function setInqFiltro(f){ state.inqFiltro = f; aplicarFiltroInq(); }
/* Cartão ou lista, igual a Imóveis. Com nove pessoas o cartão já pede
   rolagem; com trinta, comparar quem está sem casa vira caça ao tesouro.
   Só troca a classe do contêiner — o HTML de cada inquilino é o mesmo,
   então nada re-renderiza e a busca não perde o foco. */
function setInqVisao(v){
  state.inqVisao = v;
  const grid = document.getElementById('inqGrid');
  if(grid) grid.classList.toggle('house-grid-list', v==='lista');
  document.querySelectorAll('#inqToolbar .casa-visao-opcao').forEach(function(b){
    const ativo = b.getAttribute('data-visao')===v;
    b.classList.toggle('active', ativo);
    b.setAttribute('aria-pressed', ativo ? 'true' : 'false');
  });
}
function aplicarFiltroInq(){
  const grid = document.getElementById('inqGrid');
  if(!grid) return;
  const q = (state.inqBusca||'').trim().toLowerCase();
  const f = state.inqFiltro||'todos';
  let visiveis = 0;
  grid.querySelectorAll('.house-card').forEach(function(card){
    const status = card.getAttribute('data-status');
    const search = card.getAttribute('data-search')||'';
    const tenant=state.tenants.find(function(item){return item.id===card.getAttribute('data-tenant-id');});
    let ok = true;
    if(f==='com' && status!=='com') ok=false;
    else if(f==='sem' && status!=='sem') ok=false;
    if(ok && q && !(tenant?tenantMatchesSearch(tenant,q):search.indexOf(normalizeTenantSearch(q))!==-1)) ok=false;
    card.style.display = ok ? '' : 'none';
    if(ok) visiveis++;
  });
  const empty = document.getElementById('inqEmpty');
  if(empty) empty.style.display = visiveis===0 ? '' : 'none';
  document.querySelectorAll('#inqToolbar .filter-chip').forEach(function(ch){
    ch.classList.toggle('active', ch.getAttribute('data-filtro')===f);
  });
}
function renderInquilinosView(){
  const header = '<div class="page-header"><div>'+
      '<div class="eyebrow">MORADORES DOS IMÓVEIS</div>'+
      pageTitleWithIcon(tenantIconSvg(), 'Inquilinos')+
      '<div class="page-sub">'+state.tenants.length+' pessoa(s) cadastrada(s) · dados pessoais e vínculos organizados separadamente.</div>'+
    '</div>'+(canOperateProperties()?'<button class="btn btn-primary btn-sm" onclick="openAddTenantModal()">+ Novo inquilino</button>':'')+'</div>';
  if(state.tenants.length===0){
    return header + emptyState('Nenhum inquilino cadastrado ainda. Cadastre aqui, ou diretamente ao vincular um inquilino a uma casa.', tenantIconSvg());
  }
  const filtros = [['todos','Todos'],['com','Com casa'],['sem','Sem casa']];
  const chips = filtros.map(function(f){
    return '<button class="filter-chip'+(state.inqFiltro===f[0]?' active':'')+'" data-filtro="'+f[0]+'" onclick="setInqFiltro(\''+f[0]+'\')">'+f[1]+'</button>';
  }).join('');
  const toolbar = '<div class="toolbar" id="inqToolbar">'+
      '<div class="search-wrap"><span class="search-ico">'+FICO.search+'</span>'+
        '<input id="inqBuscaInput" class="search-input" placeholder="'+
          (canViewSensitiveTenantData()?'Nome, contato, CPF completo, imóvel ou contrato…':'Nome, contato, imóvel ou contrato…')+
          '" value="'+esc(state.inqBusca||'')+'" oninput="setInqBusca(this.value)"></div>'+
      '<div class="filter-chips">'+chips+'</div>'+
      '<div class="casa-visao" role="group" aria-label="Forma de exibir os inquilinos">'+
        '<button class="btn btn-ghost casa-visao-opcao'+(state.inqVisao!=='lista'?' active':'')+'" data-visao="cartoes" '+
          'aria-pressed="'+(state.inqVisao!=='lista')+'" aria-label="Ver em cartões" title="Cartões" '+
          'onclick="setInqVisao(\'cartoes\')"><span aria-hidden="true">▦</span></button>'+
        '<button class="btn btn-ghost casa-visao-opcao'+(state.inqVisao==='lista'?' active':'')+'" data-visao="lista" '+
          'aria-pressed="'+(state.inqVisao==='lista')+'" aria-label="Ver em lista" title="Lista" '+
          'onclick="setInqVisao(\'lista\')"><span aria-hidden="true">☰</span></button>'+
      '</div>'+
    '</div>';
  const grid = '<div class="house-grid'+(state.inqVisao==='lista'?' house-grid-list':'')+'" id="inqGrid">'+
      state.tenants.map(renderTenantCard).join('')+'</div>'+
    '<div class="empty-state" id="inqEmpty" style="display:none">Nenhum inquilino encontrado com esse filtro.</div>';
  return header + toolbar + grid;
}

/* ---------- cadastro independente ---------- */
function openAddTenantModal(){
  if(!requirePropertyPermission())return;
  openModal(
    '<h3 class="modal-title">Novo inquilino</h3>'+
    '<p class="modal-text">Cadastre a pessoa. Vincular a um imóvel (e o contrato) é um passo à parte, feito depois.</p>'+
    '<label class="field"><span>Nome completo *</span><input id="f_nome" placeholder="Nome e sobrenome" autocomplete="name"></label>'+
    '<div class="field-row">'+
      '<label class="field"><span>Telefone / WhatsApp</span><input id="f_tel" inputmode="tel" placeholder="(DDD) 90000-0000"></label>'+
      '<label class="field"><span>E-mail</span><input id="f_email" type="email" placeholder="para liberar o Portal depois"></label>'+
    '</div>'+
    '<details class="more-info"><summary>Mais informações (opcional)</summary>'+
      '<div class="field-row">'+
        '<label class="field"><span>CPF</span><input id="f_doc" inputmode="numeric" placeholder="Somente números"></label>'+
        '<label class="field"><span>RG</span><input id="f_rg" placeholder="Opcional"></label>'+
      '</div>'+
      '<label class="field"><span>Contato de emergência</span><input id="f_emerg" placeholder="Nome e telefone"></label>'+
    '</details>'+
    '<div class="modal-actions sticky-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button id="btn_save_tenant" class="btn btn-primary" onclick="saveNewTenant()">Cadastrar</button>'+
    '</div></div>'
  );
  setTimeout(function(){const el=document.getElementById('f_nome');if(el)el.focus();},20);
}
async function saveNewTenant(){
  if(!requirePropertyPermission())return;
  const nome = document.getElementById('f_nome').value.trim();
  if(!nome){ showToast('Informe o nome do inquilino.', 'error'); const el=document.getElementById('f_nome'); if(el) el.focus(); return; }
  const emailEl=document.getElementById('f_email');
  if(!emailValido(emailEl?emailEl.value:'')){
    showToast('E-mail inválido. Confira ou deixe em branco.', 'error'); if(emailEl) emailEl.focus(); return;
  }
  const rgEl=document.getElementById('f_rg');
  /* Trava de duplo toque, no mesmo formato dos fluxos de dinheiro: dois
     toques antes da rede responder criavam dois inquilinos iguais. */
  const submitButton=document.getElementById('btn_save_tenant');
  if(submitButton&&submitButton.disabled)return;
  if(submitButton){submitButton.disabled=true;submitButton.textContent='Cadastrando…';}
  try{
    const novo = await db.insertTenant({
      nome:nome,
      telefone: document.getElementById('f_tel').value.trim(),
      email: document.getElementById('f_email').value.trim(),
      documento: document.getElementById('f_doc').value.trim(),
      rg: rgEl?rgEl.value.trim():'',
      emergenciaNome: document.getElementById('f_emerg').value.trim()
    });
    state.tenants.push(novo);
    render();
    offerLinkNewTenant(novo.id, novo.nome);
  }catch(e){
    console.error(e); showToast('Erro ao cadastrar.', 'error');
    if(submitButton){submitButton.disabled=false;submitButton.textContent='Cadastrar';}
  }
}
/* Cadastro e vínculo são passos separados: depois de cadastrar, oferece
   vincular a um imóvel (sem misturar contrato no cadastro da pessoa). */
function offerLinkNewTenant(tenantId,nome){
  openModal('<h3 class="modal-title">Inquilino cadastrado</h3>'+
    '<p class="modal-text"><strong>'+esc(nome)+'</strong> está no cadastro. Quer vinculá-lo a um imóvel agora? O contrato é definido no vínculo.</p>'+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="closeModal();showToast(\'Inquilino cadastrado.\',\'success\')">Agora não</button>'+
      '<button class="btn btn-primary" onclick="openAssignHouseModal(\''+tenantId+'\')">Vincular a um imóvel</button>'+
    '</div></div>');
}
function openEditTenantModal(tenantId){
  const t = state.tenants.find(function(x){ return x.id===tenantId; });
  if(!t)return;
  const casas = housesOf(tenantId);
  const editable=canOperateProperties();
  const readOnly=editable?'':' readonly aria-readonly="true"';
  const canSeeDoc=canViewSensitiveTenantData();
  const documentValue=canSeeDoc?t.documento:maskSensitiveDocument(t.documento);
  const rgValue=canSeeDoc?(t.rg||''):maskSensitiveDocument(t.rg);
  const moraTxt = casas.length===0
    ? 'Sem imóvel vinculado no momento.'
    : (casas.length===1
        ? ('Atualmente em <strong>'+esc(casas[0].nome)+'</strong>.')
        : ('Atualmente em <strong>'+casas.length+' imóveis</strong>: '+casas.map(function(h){ return esc(h.nome); }).join(', ')+'.'));
  openModal(
    '<h3 class="modal-title">'+(editable?'Gerenciar':'Consultar')+' inquilino</h3><p class="modal-text">'+
      (editable?'Edite os dados pessoais; o histórico de vínculos, contratos e recebimentos é preservado.':'Sua função permite somente consultar este cadastro. Documentos ficam protegidos.')+'</p>'+
    '<div class="form-section-title">Dados pessoais</div>'+
    '<label class="field"><span>Nome completo</span><input id="f_nome" value="'+esc(t.nome)+'"'+readOnly+'></label>'+
    '<div class="field-row">'+
      '<label class="field"><span>Telefone / WhatsApp</span><input id="f_tel" value="'+esc(t.telefone)+'"'+readOnly+'></label>'+
      '<label class="field"><span>E-mail</span><input id="f_email" type="email" value="'+esc(t.email)+'"'+readOnly+'></label>'+
    '</div>'+
    '<div class="field-row">'+
      '<label class="field"><span>CPF</span><input id="f_doc" value="'+esc(documentValue)+'"'+readOnly+'></label>'+
      '<label class="field"><span>RG</span><input id="f_rg" value="'+esc(rgValue)+'"'+readOnly+'></label>'+
    '</div>'+
    '<label class="field"><span>Contato de emergência</span><input id="f_emerg" value="'+esc(t.emergenciaNome)+'"'+readOnly+'></label>'+
    '<div class="form-section-title">Vínculos com imóveis</div>'+
    '<div class="notice-box"><span>'+moraTxt+' Contratos e recebimentos permanecem no histórico.</span>'+
      (editable?'<div class="quick-actions"><button class="btn btn-ghost btn-sm" onclick="openAssignHouseModal(\''+tenantId+'\')">'+(casas.length?'Vincular a outro imóvel':'Vincular a um imóvel')+'</button></div>':'')+
    '</div>'+
    '<div class="form-section-title">Acesso ao Portal do Inquilino</div>'+
    renderTenantAccessBlock(t)+
    (editable
      ?'<div class="form-section-title">Zona de risco</div>'+
       '<div class="notice-box notice-danger"><span>Encerrar o vínculo registra a saída e libera o imóvel; arquivar retira das listas ativas. Ambos preservam todo o histórico.</span>'+
         '<div class="quick-actions"><button class="btn btn-danger btn-sm" onclick="openTenantRemovalChoice(\''+tenantId+'\')">Encerrar vínculo / arquivar</button></div>'+
       '</div>'+
       '<div class="modal-actions sticky-actions"><span></span><div class="modal-actions-right">'+
         '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
         '<button class="btn btn-primary" onclick="saveTenantEdit(\''+tenantId+'\')">Salvar alterações</button>'+
       '</div></div>'
      :'<div class="modal-actions sticky-actions"><span></span><button class="btn btn-primary" onclick="closeModal()">Fechar</button></div>')
  );
}

function openTenantPortalAccess(tenantId){
  if(!requirePropertyPermission())return;
  const t=state.tenants.find(function(x){return x.id===tenantId;});
  const access=tenantAccessOf(tenantId);
  if(!t)return;
  if(!t.email){ showToast('Cadastre o e-mail do inquilino e salve antes de liberar.','error'); return; }
  openModal('<h3 class="modal-title">Portal de '+esc(t.nome)+'</h3>'+
    '<p class="modal-text">O acesso será vinculado a <strong>'+esc(t.email)+'</strong>. No portal, ele verá somente contrato, pagamentos, recibos, energia e documentos liberados.</p>'+
    (!access?'<div class="notice-box">Depois de liberar, peça ao inquilino para abrir o app, escolher <strong>Inquilino</strong>, clicar em <strong>Criar acesso</strong> e usar exatamente este e-mail.</div>':
      '<div class="notice-box">Situação atual: <strong>'+(access.aceito?(access.ativo?'acesso ativo':'acesso suspenso'):'aguardando o inquilino criar a conta')+'</strong>.</div>')+
    '<div class="modal-actions">'+(access&&access.aceito&&access.ativo?'<button class="btn btn-danger" onclick="configureTenantPortal(\''+tenantId+'\',false)">Suspender acesso</button>':'<span></span>')+
      '<div class="modal-actions-right"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-primary" onclick="configureTenantPortal(\''+tenantId+'\',true)">'+(access?'Ativar / reenviar':'Liberar portal')+'</button></div></div>');
}

async function configureTenantPortal(tenantId,active){
  if(!requirePropertyPermission())return;
  const t=state.tenants.find(function(x){return x.id===tenantId;});
  if(!t)return;
  try{
    const result=await db.configureTenantAccess(tenantId,t.email,active);
    state.tenantAccess=await db.listTenantAccess();
    closeModal(); render();
    if(active && !result.aceito){
      openModal('<h3 class="modal-title">Acesso preparado</h3><p class="modal-text">Agora peça a '+esc(t.nome)+' para acessar <strong>'+esc(window.location.origin)+'</strong>, escolher <strong>Inquilino</strong>, clicar em <strong>Criar acesso</strong> e usar o e-mail <strong>'+esc(t.email)+'</strong>.</p>'+
        '<div class="modal-actions"><span></span><div class="modal-actions-right"><button class="btn btn-ghost" onclick="copyPortalLink()">Copiar endereço</button><button class="btn btn-primary" onclick="closeModal()">Concluir</button></div></div>');
    }else showToast(active?'Portal do inquilino ativo.':'Acesso suspenso.','success');
  }catch(e){console.error(e);showToast((e&&e.message)||'Não foi possível configurar o portal.','error');}
}
function copyPortalLink(){
  if(navigator.clipboard) navigator.clipboard.writeText(window.location.origin).then(function(){showToast('Endereço copiado.','success');});
}
async function saveTenantEdit(tenantId){
  if(!requirePropertyPermission())return;
  const original = state.tenants.find(function(x){ return x.id===tenantId; });
  if(!original)return;
  const emailEl=document.getElementById('f_email');
  if(!emailValido(emailEl?emailEl.value:'')){
    showToast('E-mail inválido. Confira ou deixe em branco.', 'error'); if(emailEl) emailEl.focus(); return;
  }
  const next=Object.assign({},original,{
    nome:document.getElementById('f_nome').value.trim()||original.nome,
    telefone:document.getElementById('f_tel').value.trim(),
    email:document.getElementById('f_email').value.trim(),
    documento:document.getElementById('f_doc').value.trim(),
    rg:(document.getElementById('f_rg')?document.getElementById('f_rg').value.trim():(original.rg||'')),
    emergenciaNome:document.getElementById('f_emerg').value.trim()
  });
  try{ await db.updateTenant(next); Object.assign(original,next); closeModal(); render(); }
  catch(e){ console.error(e); showToast('Erro ao salvar.', 'error'); }
}

/* ---------- saída real x arquivamento recuperável ---------- */
function activeTenantLinks(tenantId){
  return state.houses.filter(function(h){
    return h.tenantId===tenantId||(h.contracts||[]).some(function(c){
      return c.tenantId===tenantId&&c.ativo;
    });
  });
}
function openTenantRemovalChoice(tenantId){
  if(!requirePropertyPermission())return;
  const t=state.tenants.find(function(x){return x.id===tenantId;});
  const activeLinks=activeTenantLinks(tenantId);
  const houses=activeLinks;
  if(!t) return;
  openModal(
    '<h3 class="modal-title">O que aconteceu com '+esc(t.nome)+'?</h3>'+
    '<p class="modal-text">Escolha com cuidado. Uma saída real nunca deve apagar nem esconder o histórico financeiro.</p>'+
    '<div class="notice-box"><strong>Encerrar vínculo</strong><br>Registra a saída, libera a casa e preserva contratos, pagamentos, energia, recibos e histórico.<div class="quick-actions">'+
      '<button class="btn btn-primary btn-sm" '+(houses.length?'onclick="openTenantExitModal(\''+tenantId+'\')"':'disabled')+'>'+(houses.length?'Escolher esta opção':'Nenhuma casa vinculada')+'</button></div></div>'+
    '<div class="notice-box"><strong>Arquivar cadastro</strong><br>Retira o inquilino das listas ativas, sem apagar seus dados. Ele poderá ser restaurado em Backup → Itens arquivados.'+
      (activeLinks.length?'<br><strong>Encerre primeiro o vínculo ativo.</strong>':'')+
      '<div class="quick-actions"><button class="btn btn-danger btn-sm" '+(activeLinks.length?'disabled':'onclick="openArchiveTenantModal(\''+tenantId+'\')"')+'>'+
      (activeLinks.length?'Contrato ativo impede arquivamento':'Arquivar inquilino')+'</button></div></div>'+
    '<div class="modal-actions"><span></span><div class="modal-actions-right"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button></div></div>'
  );
}

/* Compatibilidade com botões antigos que ainda possam estar em uma tela aberta. */
function confirmDeleteTenant(tenantId){ openTenantRemovalChoice(tenantId); }

function openTenantExitModal(tenantId){
  if(!requirePropertyPermission())return;
  const t=state.tenants.find(function(x){return x.id===tenantId;});
  const houses=activeTenantLinks(tenantId);
  if(!t||!houses.length){
    showToast('Este inquilino não está vinculado a uma casa.','error');
    return;
  }
  if(houses.length===1){
    openTenantHouseExit(houses[0].id);
    return;
  }
  const options=houses.map(function(h){return '<option value="'+h.id+'">'+esc(h.nome)+'</option>';}).join('');
  openModal(
    '<h3 class="modal-title">De qual casa ele saiu?</h3>'+
    '<p class="modal-text">'+esc(t.nome)+' está ligado a mais de um imóvel. Apenas a casa escolhida será liberada.</p>'+
    '<label class="field"><span>Casa</span><select id="f_tenant_exit_house">'+options+'</select></label>'+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="openTenantRemovalChoice(\''+tenantId+'\')">Voltar</button>'+
      '<button class="btn btn-primary" onclick="continueTenantExit()">Continuar</button>'+
    '</div></div>'
  );
}

function continueTenantExit(){
  if(!requirePropertyPermission())return;
  const select=document.getElementById('f_tenant_exit_house');
  if(select) openTenantHouseExit(select.value);
}

function openTenantHouseExit(houseId){
  if(!requirePropertyPermission())return;
  const h=state.houses.find(function(x){return x.id===houseId;});
  const current=h&&activeContract(h);
  if(!h) return;
  if(current){
    openFinishContractModal(houseId,current.id);
    return;
  }
  openModal(
    '<h3 class="modal-title">Registrar saída</h3>'+
    '<p class="modal-text"><strong>'+esc(h.nome)+'</strong> não possui um contrato ativo no cadastro antigo. A casa será liberada sem apagar nenhum registro.</p>'+
    '<label class="field"><span>Data de saída</span><input id="f_legacy_exit_date" type="date" max="'+todayISO()+'" value="'+todayISO()+'"></label>'+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-primary" onclick="finishLegacyTenantStay(\''+houseId+'\')">Liberar casa</button>'+
    '</div></div>'
  );
}

async function finishLegacyTenantStay(houseId){
  if(!requirePropertyPermission())return;
  const h=state.houses.find(function(x){return x.id===houseId;});
  const input=document.getElementById('f_legacy_exit_date');
  const endDate=(input&&input.value)||todayISO();
  if(!h) return;
  if(endDate>todayISO()){
    showToast('Para liberar a casa agora, informe hoje ou uma data anterior.','error');
    return;
  }
  const previous={tenantId:h.tenantId,status:h.status,contratoInicio:h.contratoInicio,
    contratoFim:h.contratoFim,statusHistorico:(h.statusHistorico||[]).slice()};
  h.tenantId='';h.status='vaga';h.contratoInicio='';h.contratoFim='';
  appendVacancyStatusState(h,endDate);
  try{
    await db.updateHouse(h);
    await db.replaceStatusHistory(h.id,h.statusHistorico);
    closeModal();
    render();
    showToast('Casa liberada. O histórico foi preservado.','success');
  }catch(e){
    h.tenantId=previous.tenantId;h.status=previous.status;
    h.contratoInicio=previous.contratoInicio;h.contratoFim=previous.contratoFim;
    h.statusHistorico=previous.statusHistorico;
    console.error(e);
    showToast((e&&e.message)||'Não foi possível liberar a casa.','error');
  }
}

function openArchiveTenantModal(tenantId){
  if(!requirePropertyPermission())return;
  const t=state.tenants.find(function(x){return x.id===tenantId;});
  if(!t) return;
  const activeLinks=activeTenantLinks(tenantId);
  if(activeLinks.length){
    openModal(
      '<h3 class="modal-title">Encerre o vínculo primeiro</h3>'+
      '<p class="modal-text"><strong>'+esc(t.nome)+'</strong> ainda possui contrato ou vínculo ativo com '+activeLinks.map(function(h){return esc(h.nome);}).join(', ')+'.</p>'+
      '<div class="notice-box">Registrar a saída preserva contratos e recebimentos. Depois, o cadastro do inquilino poderá ser arquivado.</div>'+
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="openTenantRemovalChoice(\''+tenantId+'\')">Voltar</button>'+
        '<button class="btn btn-primary" onclick="openTenantExitModal(\''+tenantId+'\')">Registrar saída</button></div>'
    );
    return;
  }
  openModal(
    '<h3 class="modal-title">Arquivar '+esc(t.nome)+'?</h3>'+
    '<p class="modal-text">O inquilino sairá das listas ativas, mas seus dados e vínculos encerrados continuarão guardados.</p>'+
    '<div class="notice-box"><strong>Ação recuperável.</strong><br>Você poderá restaurar este cadastro em Backup → Itens arquivados.</div>'+
    '<label class="field"><span>Motivo do arquivamento</span><input id="f_archive_reason" maxlength="300" placeholder="Ex.: cadastro duplicado"></label>'+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="openTenantRemovalChoice(\''+tenantId+'\')">Voltar</button>'+
      '<button class="btn btn-danger" onclick="archiveTenant(\''+tenantId+'\')">Arquivar inquilino</button></div>'
  );
}

async function archiveTenant(tenantId){
  if(!requirePropertyPermission())return;
  const t=state.tenants.find(function(x){return x.id===tenantId;});
  if(!t)return;
  if(activeTenantLinks(tenantId).length){
    showToast('Encerre o contrato ativo antes de arquivar o inquilino.','error');
    return;
  }
  try{
    const reason=((document.getElementById('f_archive_reason')||{}).value||'').trim();
    await db.archiveEntity('inquilino',tenantId,reason);
    state.tenantAccess=(state.tenantAccess||[]).filter(function(item){return item.inquilino_id!==tenantId;});
    state.tenants=state.tenants.filter(function(item){return item.id!==tenantId;});
    closeModal();
    render();
    showToast('Inquilino arquivado. Você pode restaurá-lo pelo Backup.','success');
  }catch(e){
    console.error(e);
    showToast((e&&e.message)||'Não foi possível arquivar o inquilino.','error');
  }
}

/* Compatibilidade com ações de uma tela antiga: não há mais exclusão
   destrutiva de inquilino pela interface. */
function openTenantMistakePreview(tenantId){openArchiveTenantModal(tenantId);}
function toggleTenantMistakeButton(){}
async function deleteTenantMistake(tenantId){return archiveTenant(tenantId);}

/* ---------- vínculo casa <-> inquilino ---------- */
async function assignTenantToHouse(tenantId, houseId, contratoInicio, contratoFim,contractDraft){
  if(!requirePropertyPermission())return null;
  // um inquilino pode ter vários imóveis ao mesmo tempo: vincular a esta casa
  // NÃO desvincula as outras casas do mesmo inquilino.
  const target = state.houses.find(function(h){ return h.id===houseId; });
  const previous=activeContract(target);
  const draft=Object.assign({inicio:contratoInicio||todayISO(),fim:contratoFim||'',
    valor:target.aluguelValor||0,diaVencimento:target.diaVencimento||5,modalidade:'fixo'},contractDraft||{});
  const validation=validateContractDraft(target,draft,previous&&previous.id);
  if(validation) throw new Error(validation);
  if(draft.inicio>todayISO()) throw new Error('Para vincular o inquilino agora, o início não pode estar no futuro.');
  if(draft.fim&&draft.fim<todayISO()) throw new Error('Para vincular o inquilino agora, o fim do contrato não pode estar no passado.');
  if(previous&&draft.inicio<=previous.inicio) throw new Error('O novo contrato deve começar depois do contrato atual. Edite o contrato atual para corrigir sua data.');
  const novoContrato=await db.startContract(houseId,tenantId,draft);
  if(previous){previous.ativo=false;previous.fim=addDaysISO(draft.inicio,-1);}
  if(!target.contracts) target.contracts=[];
  target.contracts.push(novoContrato);
  target.tenantId = tenantId;
  target.status = 'alugada';
  target.contratoInicio = draft.inicio;
  target.contratoFim = draft.fim||'';
  target.aluguelValor=draft.valor;
  target.diaVencimento=contractBillingDay(draft);
  recordStatusChange(target, draft.inicio);
  await db.replaceStatusHistory(target.id, target.statusHistorico);
  showToast('Inquilino vinculado a '+target.nome+'.', 'success');
}
function unassignTenant(houseId){
  if(!requirePropertyPermission())return;
  const h = state.houses.find(function(x){ return x.id===houseId; });
  if(h) openTenantHouseExit(houseId);
}
function openAssignTenantModal(houseId){
  if(!requirePropertyPermission())return;
  const options = state.tenants.map(function(t){ return '<option value="'+t.id+'">'+esc(t.nome)+(t.telefone?(' — '+esc(t.telefone)):'')+'</option>'; }).join('');
  openModal(
    '<h3 class="modal-title">Vincular inquilino</h3>'+
    '<label class="field"><span>Selecionar inquilino existente</span><select id="f_tenant_select">'+
      '<option value="">— Cadastrar novo inquilino —</option>'+options+
    '</select></label>'+
    '<div id="newTenantFields">'+
      '<label class="field"><span>Nome</span><input id="f_nome" placeholder="Nome do novo inquilino"></label>'+
      '<div class="field-row">'+
        '<label class="field"><span>Telefone/WhatsApp</span><input id="f_tel"></label>'+
        '<label class="field"><span>E-mail</span><input id="f_email" type="email"></label>'+
      '</div>'+
      '<div class="field-row">'+
        '<label class="field"><span>CPF</span><input id="f_doc"></label>'+
        '<label class="field"><span>RG</span><input id="f_rg"></label>'+
      '</div>'+
      '<label class="field"><span>Contato de emergência</span><input id="f_emerg" placeholder="Nome e telefone"></label>'+
    '</div>'+
    contractFormFieldsHtml({inicio:todayISO(),valor:(state.houses.find(function(h){return h.id===houseId;})||{}).aluguelValor||0,
      diaVencimento:(state.houses.find(function(h){return h.id===houseId;})||{}).diaVencimento||5,modalidade:'fixo'})+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-primary" onclick="saveAssignTenant(\''+houseId+'\')">Vincular</button>'+
    '</div></div>'
  );
  const sel = document.getElementById('f_tenant_select');
  const fields = document.getElementById('newTenantFields');
  if(sel && fields){
    sel.addEventListener('change', function(){ fields.style.display = this.value ? 'none' : 'block'; });
  }
  updateContractFormPreview();
}
async function saveAssignTenant(houseId){
  if(!requirePropertyPermission())return;
  const selectedId = document.getElementById('f_tenant_select').value;
  const draft=readContractForm();
  const ini=draft.inicio,fim=draft.fim;
  let tenantId = selectedId;
  try{
    if(!tenantId){
      const nome = document.getElementById('f_nome').value.trim();
      if(!nome){ showToast('Informe o nome do inquilino ou selecione um existente.', 'error'); return; }
      const emailEl=document.getElementById('f_email');
      if(!emailValido(emailEl?emailEl.value:'')){
        showToast('E-mail inválido. Confira ou deixe em branco.', 'error'); if(emailEl) emailEl.focus(); return;
      }
      const novo = await db.insertTenant({
        nome:nome,
        telefone: document.getElementById('f_tel').value.trim(),
        email: document.getElementById('f_email').value.trim(),
        documento: document.getElementById('f_doc').value.trim(),
        rg: (document.getElementById('f_rg')||{value:''}).value.trim(),
        emergenciaNome: document.getElementById('f_emerg').value.trim()
      });
      state.tenants.push(novo);
      tenantId = novo.id;
    }
    await assignTenantToHouse(tenantId, houseId, ini, fim,draft);
    closeModal(); render();
  }catch(e){ console.error(e); showToast(e&&e.message?e.message:'Erro ao vincular.', 'error'); }
}
function openAssignHouseModal(tenantId){
  if(!requirePropertyPermission())return;
  const t = state.tenants.find(function(x){ return x.id===tenantId; });
  if(!state.houses.length){
    openModal('<h3 class="modal-title">Sem casas</h3><p class="modal-text">Cadastre uma casa antes de vincular um inquilino.</p>'+
      '<div class="modal-actions"><span></span><div class="modal-actions-right"><button class="btn btn-primary" onclick="closeModal()">Ok</button></div></div>');
    return;
  }
  const jaDele = housesOf(tenantId).map(function(h){ return h.id; });
  // candidatas: casas vagas que ainda não são deste inquilino
  const disponiveis = state.houses.filter(function(h){ return !h.tenantId && jaDele.indexOf(h.id)<0; });
  if(!disponiveis.length){
    openModal('<h3 class="modal-title">Sem casas disponíveis</h3><p class="modal-text">Todas as casas já estão ocupadas. Para colocar '+esc(t.nome)+' numa casa ocupada, abra o imóvel e registre primeiro a saída do vínculo atual.</p>'+
      '<div class="modal-actions"><span></span><div class="modal-actions-right"><button class="btn btn-primary" onclick="closeModal()">Ok</button></div></div>');
    return;
  }
  const options = disponiveis.map(function(h){ return '<option value="'+h.id+'">'+esc(h.nome)+(h.endereco?(' — '+esc(h.endereco)):'')+'</option>'; }).join('');
  openModal(
    '<h3 class="modal-title">Vincular '+esc(t.nome)+' a uma casa</h3>'+
    '<label class="field"><span>Casa (somente vagas)</span><select id="f_house_select" onchange="syncAssignHouseContractDefaults()">'+options+'</select></label>'+
    contractFormFieldsHtml({inicio:todayISO(),valor:(disponiveis[0]&&disponiveis[0].aluguelValor)||0,
      diaVencimento:(disponiveis[0]&&disponiveis[0].diaVencimento)||5,modalidade:'fixo'})+
    '<p class="modal-text">As outras casas deste inquilino continuam vinculadas — ele pode ter vários imóveis ao mesmo tempo.</p>'+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-primary" onclick="saveAssignHouse(\''+tenantId+'\')">Vincular</button>'+
    '</div></div>'
  );
  updateContractFormPreview();
}
function syncAssignHouseContractDefaults(){
  if(!requirePropertyPermission())return;
  const select=document.getElementById('f_house_select');
  const h=select&&state.houses.find(function(x){return x.id===select.value;});
  const value=document.getElementById('f_contract_valor'),due=document.getElementById('f_contract_dia');
  if(!h) return;
  if(value) value.value=String(Number(h.aluguelValor)||0);
  if(due) due.value=String(h.diaVencimento||5);
  updateContractFormPreview();
}
async function saveAssignHouse(tenantId){
  if(!requirePropertyPermission())return;
  const houseId = document.getElementById('f_house_select').value;
  const draft=readContractForm();
  const ini=draft.inicio,fim=draft.fim;
  try{
    await assignTenantToHouse(tenantId, houseId, ini, fim,draft);
    closeModal(); render();
  }catch(e){ console.error(e); showToast(e&&e.message?e.message:'Erro ao vincular.', 'error'); }
}
