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
    '<button class="btn btn-ghost btn-sm" onclick="openTenantPortalAccess(\''+t.id+'\')">'+(!access?'Liberar acesso':'Gerenciar')+'</button></div>';
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
  return '<div class="house-card tab-'+tone+(isOverdue?' is-overdue':'')+'" data-status="'+status+'" data-atraso="'+(isOverdue?'1':'0')+'" data-search="'+esc(searchData)+'" onclick="openEditTenantModal(\''+t.id+'\')">'+
    '<div class="house-card-top"><div>'+
      '<div class="house-name">'+esc(t.nome)+'</div>'+
      '<div class="house-address">'+(t.telefone?esc(t.telefone):'Sem telefone cadastrado')+'</div>'+
    '</div><span class="chip chip-'+tone+'">'+chipTxt+'</span></div>'+
    '<div class="house-card-bottom"><div class="house-tenant">'+bottom+'</div></div>'+
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
      '<div class="eyebrow">INQUILINOS</div>'+
      pageTitleWithIcon(tenantIconSvg(), state.tenants.length+' inquilino(s) cadastrado(s)')+
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
    '<h3 class="modal-title">Editar inquilino</h3>'+
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
      '<button class="btn btn-danger" onclick="confirmDeleteTenant(\''+tenantId+'\')">Excluir inquilino</button>'+
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
    '<p class="modal-text">O acesso será vinculado a <strong>'+esc(t.email)+'</strong>. No portal, ele verá somente contrato, pagamentos, recibos, energia e documentos liberados.</p>'+
    (!access?'<div class="notice-box">Depois de liberar, peça ao inquilino para abrir o app, clicar em <strong>Criar conta</strong> e usar exatamente este e-mail.</div>':
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
    if(active && !result.vinculado){
      openModal('<h3 class="modal-title">Acesso preparado</h3><p class="modal-text">Agora peça a '+esc(t.nome)+' para acessar <strong>'+esc(window.location.origin)+'</strong>, clicar em <strong>Criar conta</strong> e usar o e-mail <strong>'+esc(t.email)+'</strong>.</p>'+
        '<div class="modal-actions"><span></span><div class="modal-actions-right"><button class="btn btn-ghost" onclick="copyPortalLink()">Copiar endereço</button><button class="btn btn-primary" onclick="closeModal()">Concluir</button></div></div>');
    }else showToast(active?'Portal do inquilino ativo.':'Acesso suspenso.','success');
  }catch(e){console.error(e);showToast('Não foi possível configurar o portal.','error');}
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
function confirmDeleteTenant(tenantId){
  const t = state.tenants.find(function(x){ return x.id===tenantId; });
  const casas = housesOf(tenantId);
  const txt = casas.length===0 ? ''
    : (casas.length===1
        ? ('A casa '+esc(casas[0].nome)+' ficará marcada como vaga. ')
        : ('As casas '+casas.map(function(h){ return esc(h.nome); }).join(', ')+' ficarão marcadas como vagas. '));
  openModal(
    '<h3 class="modal-title">Excluir '+esc(t.nome)+'?</h3>'+
    '<p class="modal-text">'+txt+'Essa ação não pode ser desfeita.</p>'+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
    '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-danger" onclick="deleteTenant(\''+tenantId+'\')">Excluir</button>'+
    '</div></div>'
  );
}
async function deleteTenant(tenantId){
  try{
    // casas que apontavam para ele ficam vagas (com histórico)
    const afetadas = state.houses.filter(function(h){ return h.tenantId===tenantId; });
    for(const h of afetadas){
      const current=activeContract(h);
      h.tenantId=''; h.status='vaga'; h.contratoInicio=''; h.contratoFim='';
      recordStatusChange(h);
      if(current){await db.finishContract(h.id,current.id,todayISO(),'vaga');current.ativo=false;current.fim=todayISO();}
      else await db.updateHouse(h);
      await db.replaceStatusHistory(h.id, h.statusHistorico);
    }
    await db.deleteTenant(tenantId);
    state.tenants = state.tenants.filter(function(x){ return x.id!==tenantId; });
    closeModal(); render();
  }catch(e){ console.error(e); showToast('Erro ao excluir o inquilino.', 'error'); }
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
async function unassignTenant(houseId){
  const h = state.houses.find(function(x){ return x.id===houseId; });
  const current=activeContract(h);
  h.tenantId=''; h.contratoInicio=''; h.contratoFim=''; h.status='vaga';
  recordStatusChange(h);
  try{
    if(current){await db.finishContract(h.id,current.id,todayISO(),'vaga');current.ativo=false;current.fim=todayISO();}
    else await db.updateHouse(h);
    await db.replaceStatusHistory(h.id, h.statusHistorico);
    render();
    showToast('Inquilino desvinculado. Casa marcada como vaga.', 'success');
  }catch(e){ console.error(e); showToast('Erro ao desvincular.', 'error'); }
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
