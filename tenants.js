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
  return '<div class="portal-access-box"><div><span class="field-kicker">PORTAL DO INQUILINO · SEM PLANO</span><strong>Acesso somente aos próprios dados</strong>'+
    '<small>'+esc(t.email||'Cadastre um e-mail para liberar o portal.')+'</small></div><span class="chip '+tone+'">'+stateText.toUpperCase()+'</span>'+
    '<button class="btn btn-ghost btn-sm" onclick="openTenantPortalAccess(\''+t.id+'\')">'+(!access?'Liberar portal':'Gerenciar portal')+'</button></div>';
}

/* ---------- listagem ---------- */
function renderTenantCard(t){
  const casas = housesOf(t.id);
  const n = casas.length;
  const overdueHouses=casas.filter(function(h){const c=computeCobrancaCasa(h);return c&&c.tipo==='atraso';});
  const isOverdue=overdueHouses.length>0;
  const nomes = casas.map(function(h){ return h.nome; });
  const status = n>0 ? 'com' : 'sem';
  const searchData = (t.nome+' '+(t.telefone||'')+' '+(t.email||'')+' '+nomes.join(' ')).toLowerCase();
  const chipTxt = isOverdue ? 'EM ATRASO' : (n===0 ? 'SEM CASA' : (n===1 ? '1 IMÓVEL' : n+' IMÓVEIS'));
  const bottom = isOverdue ? (overdueHouses.length===1?'Atraso em '+esc(overdueHouses[0].nome):overdueHouses.length+' imóveis com atraso') : n===0 ? 'Disponível para vincular'
    : (n===1 ? ('Mora em '+esc(nomes[0])) : ('Imóveis: '+nomes.map(esc).join(', ')));
  const tone=isOverdue?'rust':(n>0?'brass':'slate');
  const access=tenantAccessOf(t.id);
  const portalText=!access?'Portal não liberado':access.aceito?(access.ativo?'Portal ativo':'Portal suspenso'):'Aguardando acesso';
  const initial=String(t.nome||'?').trim().charAt(0).toUpperCase();
  return '<div class="house-card rent-tenant-card tab-'+tone+(isOverdue?' is-overdue':'')+'" role="button" tabindex="0" aria-label="Gerenciar inquilino '+esc(t.nome)+'" data-status="'+status+'" data-atraso="'+(isOverdue?'1':'0')+'" data-search="'+esc(searchData)+'" onclick="openEditTenantModal(\''+t.id+'\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openEditTenantModal(\''+t.id+'\')}">'+
    '<div class="rent-tenant-head"><span class="rent-tenant-avatar">'+esc(initial)+'</span><div>'+
      '<div class="house-name">'+esc(t.nome)+'</div>'+
      '<div class="house-address">'+(t.telefone?esc(t.telefone):'Sem telefone cadastrado')+'</div>'+
    '</div><span class="chip chip-'+tone+'">'+chipTxt+'</span></div>'+
    '<div class="rent-tenant-home">'+bottom+'</div>'+
    '<div class="rent-tenant-portal"><span>'+portalText+'</span><small>Inquilino · sem plano</small></div>'+
  '</div>';
}

/* busca + filtro de inquilinos */
function setInqBusca(v){ state.inqBusca = v; aplicarFiltroInq(); }
function setInqFiltro(f){ state.inqFiltro = f; aplicarFiltroInq(); }
function aplicarFiltroInq(){
  const grid = document.getElementById('inqGrid');
  if(!grid) return;
  const q = (state.inqBusca||'').trim().toLowerCase();
  const f = state.inqFiltro||'todos';
  let visiveis = 0;
  grid.querySelectorAll('.house-card').forEach(function(card){
    const status = card.getAttribute('data-status');
    const search = card.getAttribute('data-search')||'';
    let ok = true;
    if(f==='com' && status!=='com') ok=false;
    else if(f==='sem' && status!=='sem') ok=false;
    if(ok && q && search.indexOf(q)===-1) ok=false;
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
      '<div class="page-sub">'+state.tenants.length+' pessoa(s) cadastrada(s) · nenhuma possui plano do aplicativo.</div>'+
    '</div><button class="btn btn-primary btn-sm" onclick="openAddTenantModal()">+ Novo inquilino</button></div>';
  if(state.tenants.length===0){
    return header + emptyState('Nenhum inquilino cadastrado ainda. Cadastre aqui, ou diretamente ao vincular um inquilino a uma casa.', tenantIconSvg());
  }
  const filtros = [['todos','Todos'],['com','Com casa'],['sem','Sem casa']];
  const chips = filtros.map(function(f){
    return '<button class="filter-chip'+(state.inqFiltro===f[0]?' active':'')+'" data-filtro="'+f[0]+'" onclick="setInqFiltro(\''+f[0]+'\')">'+f[1]+'</button>';
  }).join('');
  const toolbar = '<div class="toolbar" id="inqToolbar">'+
      '<div class="search-wrap"><span class="search-ico">'+FICO.search+'</span>'+
        '<input id="inqBuscaInput" class="search-input" placeholder="Buscar por nome, telefone ou casa…" value="'+esc(state.inqBusca||'')+'" oninput="setInqBusca(this.value)"></div>'+
      '<div class="filter-chips">'+chips+'</div>'+
    '</div>';
  const grid = '<div class="house-grid" id="inqGrid">'+state.tenants.map(renderTenantCard).join('')+'</div>'+
    '<div class="empty-state" id="inqEmpty" style="display:none">Nenhum inquilino encontrado com esse filtro.</div>';
  return header + toolbar + grid;
}

/* ---------- cadastro independente ---------- */
function openAddTenantModal(){
  openModal(
    '<h3 class="modal-title">Novo inquilino</h3>'+
    '<label class="field"><span>Nome</span><input id="f_nome" placeholder="Nome completo"></label>'+
    '<div class="field-row">'+
      '<label class="field"><span>Telefone/WhatsApp</span><input id="f_tel" placeholder="DDD + número"></label>'+
      '<label class="field"><span>E-mail</span><input id="f_email" type="email"></label>'+
    '</div>'+
    '<div class="field-row">'+
      '<label class="field"><span>CPF/RG</span><input id="f_doc"></label>'+
      '<label class="field"><span>Contato de emergência</span><input id="f_emerg" placeholder="Nome e telefone"></label>'+
    '</div>'+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-primary" onclick="saveNewTenant()">Cadastrar</button>'+
    '</div></div>'
  );
}
async function saveNewTenant(){
  const nome = document.getElementById('f_nome').value.trim();
  if(!nome){ showToast('Informe o nome do inquilino.', 'error'); return; }
  try{
    const novo = await db.insertTenant({
      nome:nome,
      telefone: document.getElementById('f_tel').value.trim(),
      email: document.getElementById('f_email').value.trim(),
      documento: document.getElementById('f_doc').value.trim(),
      emergenciaNome: document.getElementById('f_emerg').value.trim()
    });
    state.tenants.push(novo);
    closeModal(); render();
    showToast('Inquilino cadastrado.', 'success');
  }catch(e){ console.error(e); showToast('Erro ao cadastrar.', 'error'); }
}
function openEditTenantModal(tenantId){
  const t = state.tenants.find(function(x){ return x.id===tenantId; });
  const casas = housesOf(tenantId);
  const moraTxt = casas.length===0
    ? 'Sem casa vinculada no momento.'
    : (casas.length===1
        ? ('Atualmente em <strong>'+esc(casas[0].nome)+'</strong>.')
        : ('Atualmente em <strong>'+casas.length+' imóveis</strong>: '+casas.map(function(h){ return esc(h.nome); }).join(', ')+'.'));
  openModal(
    '<h3 class="modal-title">Gerenciar inquilino</h3><p class="modal-text">Inquilinos são moradores das casas e não possuem plano do aplicativo.</p>'+
    '<label class="field"><span>Nome</span><input id="f_nome" value="'+esc(t.nome)+'"></label>'+
    '<div class="field-row">'+
      '<label class="field"><span>Telefone/WhatsApp</span><input id="f_tel" value="'+esc(t.telefone)+'"></label>'+
      '<label class="field"><span>E-mail</span><input id="f_email" type="email" value="'+esc(t.email)+'"></label>'+
    '</div>'+
    '<div class="field-row">'+
      '<label class="field"><span>CPF/RG</span><input id="f_doc" value="'+esc(t.documento)+'"></label>'+
      '<label class="field"><span>Contato de emergência</span><input id="f_emerg" value="'+esc(t.emergenciaNome)+'"></label>'+
    '</div>'+
    '<p class="modal-text">'+moraTxt+'</p>'+
    renderTenantAccessBlock(t)+
    '<div class="modal-actions">'+
      '<button class="btn btn-danger" onclick="openTenantRemovalChoice(\''+tenantId+'\')">Tirar da casa / excluir</button>'+
      '<div class="modal-actions-right">'+
        '<button class="btn btn-ghost" onclick="openAssignHouseModal(\''+tenantId+'\')">'+(casas.length?'Vincular a outra casa':'Vincular a uma casa')+'</button>'+
        '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
        '<button class="btn btn-primary" onclick="saveTenantEdit(\''+tenantId+'\')">Salvar</button>'+
      '</div>'+
    '</div>'
  );
}

function openTenantPortalAccess(tenantId){
  const t=state.tenants.find(function(x){return x.id===tenantId;});
  const access=tenantAccessOf(tenantId);
  if(!t.email){ showToast('Cadastre o e-mail do inquilino e salve antes de liberar.','error'); return; }
  openModal('<h3 class="modal-title">Portal de '+esc(t.nome)+'</h3>'+
    '<p class="modal-text">O acesso será vinculado a <strong>'+esc(t.email)+'</strong>. No portal, ele verá somente contrato, pagamentos, recibos, energia e documentos liberados. <strong>Este acesso não cria nem utiliza plano.</strong></p>'+
    (!access?'<div class="notice-box">Depois de liberar, peça ao inquilino para abrir o app, escolher <strong>Inquilino</strong>, clicar em <strong>Criar acesso</strong> e usar exatamente este e-mail.</div>':
      '<div class="notice-box">Situação atual: <strong>'+(access.aceito?(access.ativo?'acesso ativo':'acesso suspenso'):'aguardando o inquilino criar a conta')+'</strong>.</div>')+
    '<div class="modal-actions">'+(access&&access.aceito&&access.ativo?'<button class="btn btn-danger" onclick="configureTenantPortal(\''+tenantId+'\',false)">Suspender acesso</button>':'<span></span>')+
      '<div class="modal-actions-right"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-primary" onclick="configureTenantPortal(\''+tenantId+'\',true)">'+(access?'Ativar / reenviar':'Liberar portal')+'</button></div></div>');
}

async function configureTenantPortal(tenantId,active){
  const t=state.tenants.find(function(x){return x.id===tenantId;});
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
  const t = state.tenants.find(function(x){ return x.id===tenantId; });
  t.nome = document.getElementById('f_nome').value.trim() || t.nome;
  t.telefone = document.getElementById('f_tel').value.trim();
  t.email = document.getElementById('f_email').value.trim();
  t.documento = document.getElementById('f_doc').value.trim();
  t.emergenciaNome = document.getElementById('f_emerg').value.trim();
  try{ await db.updateTenant(t); closeModal(); render(); }
  catch(e){ console.error(e); showToast('Erro ao salvar.', 'error'); }
}

/* ---------- saída real x cadastro feito por engano ---------- */
function openTenantRemovalChoice(tenantId){
  const t=state.tenants.find(function(x){return x.id===tenantId;});
  const houses=housesOf(tenantId);
  if(!t) return;
  openModal(
    '<h3 class="modal-title">O que aconteceu com '+esc(t.nome)+'?</h3>'+
    '<p class="modal-text">Escolha com cuidado. Uma saída real nunca deve apagar o histórico financeiro.</p>'+
    '<div class="notice-box"><strong>Ele saiu da casa</strong><br>Encerra o contrato, libera a casa e preserva contratos, pagamentos, energia, recibos e histórico.<div class="quick-actions">'+
      '<button class="btn btn-primary btn-sm" '+(houses.length?'onclick="openTenantExitModal(\''+tenantId+'\')"':'disabled')+'>'+(houses.length?'Escolher esta opção':'Nenhuma casa vinculada')+'</button></div></div>'+
    '<div class="notice-box"><strong>Foi um cadastro errado</strong><br>Mostra primeiro quantos registros estão ligados ao inquilino. Só apaga depois de você digitar o nome dele.<div class="quick-actions">'+
      '<button class="btn btn-danger btn-sm" onclick="openTenantMistakePreview(\''+tenantId+'\')">Conferir antes de excluir</button></div></div>'+
    '<div class="modal-actions"><span></span><div class="modal-actions-right"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button></div></div>'
  );
}

/* Compatibilidade com botões antigos que ainda possam estar em uma tela aberta. */
function confirmDeleteTenant(tenantId){ openTenantRemovalChoice(tenantId); }

function openTenantExitModal(tenantId){
  const t=state.tenants.find(function(x){return x.id===tenantId;});
  const houses=housesOf(tenantId);
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
  const select=document.getElementById('f_tenant_exit_house');
  if(select) openTenantHouseExit(select.value);
}

function openTenantHouseExit(houseId){
  const h=state.houses.find(function(x){return x.id===houseId;});
  const current=h&&activeContract(h);
  if(!h) return;
  if(current){
    openFinishContractModal(houseId,current.id);
    return;
  }
  openModal(
    '<h3 class="modal-title">Ele saiu da casa</h3>'+
    '<p class="modal-text"><strong>'+esc(h.nome)+'</strong> não possui um contrato ativo no cadastro antigo. A casa será liberada sem apagar nenhum registro.</p>'+
    '<label class="field"><span>Data de saída</span><input id="f_legacy_exit_date" type="date" max="'+todayISO()+'" value="'+todayISO()+'"></label>'+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-primary" onclick="finishLegacyTenantStay(\''+houseId+'\')">Liberar casa</button>'+
    '</div></div>'
  );
}

async function finishLegacyTenantStay(houseId){
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

function tenantPreviewNumber(preview,key){
  if(!preview) return 0;
  const aliases={
    activeHousesCount:'active_houses_count',
    contractsCount:'contracts_count',
    paymentsCount:'payments_count',
    energyCount:'energy_count',
    pendingSuggestionsCount:'pending_suggestions_count',
    documentsCount:'documents_count',
    statusHistoryCount:'status_history_count',
    interestLinksCount:'interest_links_count',
    portalLinksCount:'portal_links_count'
  };
  return Number(preview[key]!==undefined?preview[key]:preview[aliases[key]])||0;
}

async function openTenantMistakePreview(tenantId){
  const t=state.tenants.find(function(x){return x.id===tenantId;});
  if(!t) return;
  openModal('<h3 class="modal-title">Verificando o cadastro…</h3><p class="modal-text">Contando os vínculos antes de permitir a exclusão.</p>');
  try{
    const preview=await db.previewTenantRemoval(tenantId);
    const houses=tenantPreviewNumber(preview,'activeHousesCount');
    const contracts=tenantPreviewNumber(preview,'contractsCount');
    const payments=tenantPreviewNumber(preview,'paymentsCount');
    const energy=tenantPreviewNumber(preview,'energyCount');
    const suggestions=tenantPreviewNumber(preview,'pendingSuggestionsCount');
    const documents=tenantPreviewNumber(preview,'documentsCount');
    const history=tenantPreviewNumber(preview,'statusHistoryCount');
    const interests=tenantPreviewNumber(preview,'interestLinksCount');
    const portal=tenantPreviewNumber(preview,'portalLinksCount');
    openModal(
      '<h3 class="modal-title">Foi um cadastro errado</h3>'+
      '<p class="modal-text">Confira a prévia de <strong>'+esc(t.nome)+'</strong>. Esta exclusão não pode ser desfeita.</p>'+
      '<div class="contract-card-grid">'+
        '<div><span>Casas que ficarão vagas</span><strong>'+houses+'</strong></div>'+
        '<div><span>Contratos</span><strong>'+contracts+'</strong></div>'+
        '<div><span>Pagamentos ligados</span><strong>'+payments+'</strong></div>'+
        '<div><span>Energias ligadas</span><strong>'+energy+'</strong></div>'+
        '<div><span>Sugestões pendentes ligadas</span><strong>'+suggestions+'</strong></div>'+
        '<div><span>Documentos do inquilino</span><strong>'+documents+'</strong></div>'+
        '<div><span>Eventos de histórico dele</span><strong>'+history+'</strong></div>'+
        '<div><span>Acessos/convites do portal</span><strong>'+portal+'</strong></div>'+
        '<div><span>Interessados preservados</span><strong>'+interests+'</strong></div>'+
      '</div>'+
      '<div class="notice-box"><strong>Proteção:</strong> casas, outros inquilinos, contratos de outras pessoas e cadastros de interessados não serão apagados. Os interessados apenas perderão o vínculo com este cadastro.</div>'+
      '<label class="field"><span>Digite exatamente '+esc(t.nome)+' para confirmar</span><input id="f_tenant_delete_confirmation" autocomplete="off" oninput="toggleTenantMistakeButton(\''+tenantId+'\')"></label>'+
      '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
        '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
        '<button class="btn btn-danger" id="confirmTenantMistakeButton" disabled onclick="deleteTenantMistake(\''+tenantId+'\')">Excluir cadastro errado</button>'+
      '</div></div>'
    );
  }catch(e){
    console.error(e);
    closeModal();
    showToast((e&&e.message)||'Não foi possível conferir o inquilino.','error');
  }
}

function toggleTenantMistakeButton(tenantId){
  const t=state.tenants.find(function(x){return x.id===tenantId;});
  const input=document.getElementById('f_tenant_delete_confirmation');
  const button=document.getElementById('confirmTenantMistakeButton');
  if(button) button.disabled=!t||!input||input.value.trim().toLocaleLowerCase('pt-BR')!==t.nome.trim().toLocaleLowerCase('pt-BR');
}

async function deleteTenantMistake(tenantId){
  const t=state.tenants.find(function(x){return x.id===tenantId;});
  const input=document.getElementById('f_tenant_delete_confirmation');
  if(!t||!input||input.value.trim().toLocaleLowerCase('pt-BR')!==t.nome.trim().toLocaleLowerCase('pt-BR')){
    showToast('Digite exatamente o nome do inquilino para confirmar.','error');
    return;
  }
  try{
    await db.deleteTenantMistake(tenantId,input.value.trim());
    const removedContractIds=new Set();
    state.houses.forEach(function(h){
      (h.contracts||[]).forEach(function(c){if(c.tenantId===tenantId) removedContractIds.add(c.id);});
    });
    state.houses.forEach(function(h){
      h.pagamentos=(h.pagamentos||[]).filter(function(item){return !removedContractIds.has(item.contractId);});
      h.energias=(h.energias||[]).filter(function(item){return !removedContractIds.has(item.contractId);});
      h.contracts=(h.contracts||[]).filter(function(c){return c.tenantId!==tenantId;});
      h.statusHistorico=(h.statusHistorico||[]).filter(function(item){return item.tenantId!==tenantId;});
      if(h.tenantId===tenantId){
        h.tenantId='';h.status='vaga';h.contratoInicio='';h.contratoFim='';
        appendVacancyStatusState(h,todayISO());
      }
    });
    (state.interests||[]).forEach(function(item){if(item.tenantId===tenantId)item.tenantId='';});
    state.tenantAccess=(state.tenantAccess||[]).filter(function(item){return item.inquilino_id!==tenantId;});
    state.tenants=state.tenants.filter(function(item){return item.id!==tenantId;});
    closeModal();
    render();
    showToast('Cadastro errado e vínculos diretos excluídos com segurança.','success');
  }catch(e){
    console.error(e);
    showToast((e&&e.message)||'Não foi possível excluir o inquilino.','error');
  }
}

/* ---------- vínculo casa <-> inquilino ---------- */
async function assignTenantToHouse(tenantId, houseId, contratoInicio, contratoFim,contractDraft){
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
  const h = state.houses.find(function(x){ return x.id===houseId; });
  if(h) openTenantHouseExit(houseId);
}
function openAssignTenantModal(houseId){
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
        '<label class="field"><span>CPF/RG</span><input id="f_doc"></label>'+
        '<label class="field"><span>Contato de emergência</span><input id="f_emerg" placeholder="Nome e telefone"></label>'+
      '</div>'+
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
  const selectedId = document.getElementById('f_tenant_select').value;
  const draft=readContractForm();
  const ini=draft.inicio,fim=draft.fim;
  let tenantId = selectedId;
  try{
    if(!tenantId){
      const nome = document.getElementById('f_nome').value.trim();
      if(!nome){ showToast('Informe o nome do inquilino ou selecione um existente.', 'error'); return; }
      const novo = await db.insertTenant({
        nome:nome,
        telefone: document.getElementById('f_tel').value.trim(),
        email: document.getElementById('f_email').value.trim(),
        documento: document.getElementById('f_doc').value.trim(),
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
    openModal('<h3 class="modal-title">Sem casas disponíveis</h3><p class="modal-text">Todas as casas já estão ocupadas. Para colocar '+esc(t.nome)+' numa casa que tem outro inquilino, abra a casa e vincule por lá (o inquilino atual dela será desvinculado dessa casa).</p>'+
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
  const select=document.getElementById('f_house_select');
  const h=select&&state.houses.find(function(x){return x.id===select.value;});
  const value=document.getElementById('f_contract_valor'),due=document.getElementById('f_contract_dia');
  if(!h) return;
  if(value) value.value=String(Number(h.aluguelValor)||0);
  if(due) due.value=String(h.diaVencimento||5);
  updateContractFormPreview();
}
async function saveAssignHouse(tenantId){
  const houseId = document.getElementById('f_house_select').value;
  const draft=readContractForm();
  const ini=draft.inicio,fim=draft.fim;
  try{
    await assignTenantToHouse(tenantId, houseId, ini, fim,draft);
    closeModal(); render();
  }catch(e){ console.error(e); showToast(e&&e.message?e.message:'Erro ao vincular.', 'error'); }
}
