/* ============================================================
   app.js — Núcleo da aplicação
   - Estado em memória
   - Gate de autenticação (nada renderiza sem login)
   - Roteamento e renderização (despacha para os módulos)
   ============================================================ */

const state = {
  session: null,
  recovery: false,
  loaded: false,
  loading: true,
  houses: [],
  tenants: [],
  eventos: [],
  config: { locadorNome:'', locadorDocumento:'' },
  view: 'dashboard',          // 'dashboard' | 'casas' | 'inquilinos' | 'financeiro' | 'houseDetail'
  activeHouseId: null,
  activeTab: 'geral',
  photoCache: {},
  alertsExpanded: false,
  movsExpanded: true,
  reportListExpanded: true,
  relatorioAno: new Date().getFullYear(),
  expandedReportHouseId: null,
  calMes: currentMonthStr(),
  casaBusca: '', casaFiltro: 'todas',
  inqBusca: '', inqFiltro: 'todos'
};

/* ---------- ícones / marca ---------- */
function logoSvg(){
  return '<svg class="brand-mark" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">'+
    '<polygon points="16,5 27,15 5,15" fill="#B8863C"/>'+
    '<rect x="8" y="14" width="16" height="13" rx="1" fill="#B8863C"/>'+
    '<rect x="21.5" y="8" width="3.5" height="7" fill="#B8863C"/>'+
    '<rect x="11.5" y="18.5" width="3.5" height="3.5" fill="#14322A"/>'+
    '<rect x="17" y="18.5" width="3.5" height="3.5" fill="#14322A"/></svg>';
}
function houseIconSvg(){
  return '<svg width="40" height="40" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">'+
    '<path d="M6 22 L24 8 L42 22" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'+
    '<path d="M11 19 V40 H37 V19" stroke="currentColor" stroke-width="3" fill="none" stroke-linejoin="round"/>'+
    '<rect x="20" y="28" width="8" height="12" stroke="currentColor" stroke-width="2.5" fill="none"/></svg>';
}
function tenantIconSvg(){
  return '<svg width="40" height="40" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">'+
    '<circle cx="24" cy="16" r="8" stroke="currentColor" stroke-width="3"/>'+
    '<path d="M8 40c0-8 7-14 16-14s16 6 16 14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
}
function financeIconSvg(){
  return '<svg width="40" height="40" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">'+
    '<path d="M6 38 L6 28 L16 28 L16 38" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>'+
    '<path d="M18 38 L18 18 L28 18 L28 38" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>'+
    '<path d="M30 38 L30 8 L40 8 L40 38" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>';
}
function calendarIconSvg(){
  return '<svg width="40" height="40" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">'+
    '<rect x="7" y="11" width="34" height="30" rx="3" stroke="currentColor" stroke-width="3"/>'+
    '<path d="M7 19 H41" stroke="currentColor" stroke-width="3"/>'+
    '<path d="M16 6 V13 M32 6 V13" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
}
function dashIconSvg(){
  return '<svg width="40" height="40" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">'+
    '<rect x="7" y="7" width="15" height="14" rx="2" stroke="currentColor" stroke-width="3"/>'+
    '<rect x="26" y="7" width="15" height="9" rx="2" stroke="currentColor" stroke-width="3"/>'+
    '<rect x="7" y="27" width="15" height="14" rx="2" stroke="currentColor" stroke-width="3"/>'+
    '<rect x="26" y="22" width="15" height="19" rx="2" stroke="currentColor" stroke-width="3"/></svg>';
}
function photoIconSvg(){
  return '<svg width="40" height="40" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">'+
    '<rect x="7" y="11" width="34" height="26" rx="3" stroke="currentColor" stroke-width="3"/>'+
    '<circle cx="17" cy="20" r="3" stroke="currentColor" stroke-width="2.5"/>'+
    '<path d="M11 36 L21 25 L29 32 L34 28 L41 35" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>';
}
function expenseIconSvg(){
  return '<svg width="40" height="40" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">'+
    '<path d="M12 7 H36 V41 L31 37 L26 41 L21 37 L16 41 L12 37 Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>'+
    '<path d="M19 18 H29 M19 25 H29" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
}

/* monta o cabeçalho de uma página com ícone ao lado do título */
function pageTitleWithIcon(icon, title){
  return '<div class="page-title-row"><span class="page-ico">'+icon+'</span>'+
    '<h1 class="page-title">'+title+'</h1></div>';
}
/* estado vazio acolhedor: ícone em círculo + texto */
function emptyState(text, icon){
  return '<div class="empty-state">'+(icon?'<span class="empty-ico">'+icon+'</span>':'')+
    '<span>'+text+'</span></div>';
}

/* ---------- helper de domínio compartilhado ---------- */
function tenantOf(h){ return h.tenantId ? state.tenants.find(function(x){ return x.id===h.tenantId; }) : null; }

/* ---------- navegação ---------- */
function irHome(){ state.view='dashboard'; render(); }
function irCasas(){ state.view='casas'; render(); }
function irInquilinos(){ state.view='inquilinos'; render(); }
function irFinanceiro(){ state.view='financeiro'; render(); }
function irCalendario(){ if(!state.calMes) state.calMes=currentMonthStr(); state.view='calendario'; render(); }
function toggleAlerts(){ state.alertsExpanded = !state.alertsExpanded; render(); }
function toggleMovs(){ state.movsExpanded = !state.movsExpanded; render(); }
function toggleReportList(){ state.reportListExpanded = !state.reportListExpanded; render(); }

/* ---------- topo + menu ---------- */
function renderTopBar(){
  const casasActive = (state.view==='casas' || state.view==='houseDetail');
  return '<header class="topbar">'+
    '<button class="topbar-brand" onclick="irHome()">'+logoSvg()+'<span class="brand-name">Aluguel</span></button>'+
    '<nav class="topbar-nav">'+
      '<button class="topbar-link'+(state.view==='dashboard'?' active':'')+'" onclick="irHome()">Painel</button>'+
      '<button class="topbar-link'+(casasActive?' active':'')+'" onclick="irCasas()">Casas</button>'+
      '<button class="topbar-link'+(state.view==='inquilinos'?' active':'')+'" onclick="irInquilinos()">Inquilinos</button>'+
      '<button class="topbar-link'+(state.view==='financeiro'?' active':'')+'" onclick="irFinanceiro()">Financeiro</button>'+
      '<button class="topbar-link'+(state.view==='calendario'?' active':'')+'" onclick="irCalendario()">Calendário</button>'+
    '</nav>'+
    '<button class="menu-btn" onclick="openMenuModal()" aria-label="Menu">⋯</button>'+
  '</header>';
}
function openMenuModal(){
  const email = state.session && state.session.user ? esc(state.session.user.email) : '';
  openModal(
    '<h3 class="modal-title">Menu</h3>'+
    (email?'<p class="modal-text">Conectado como <strong>'+email+'</strong></p>':'')+
    '<div class="menu-list">'+
      '<button class="btn btn-ghost" onclick="closeModal();openConfigModal()">Meus dados (recibos)</button>'+
      '<button class="btn btn-ghost" onclick="closeModal();doExportBackup()">Exportar backup (JSON)</button>'+
      '<button class="btn btn-ghost" onclick="closeModal();triggerImport()">Importar backup</button>'+
      '<button class="btn btn-ghost" onclick="closeModal();openBackupsModal()">Backups automáticos</button>'+
      '<button class="btn btn-danger" onclick="closeModal();confirmResetAll()">Apagar todos os dados</button>'+
      '<button class="btn btn-ghost" onclick="closeModal();doSignOut()">Sair</button>'+
    '</div>'
  );
}

/* ---------- meus dados (locador) ---------- */
function openConfigModal(){
  const cfg = state.config||{};
  openModal(
    '<h3 class="modal-title">Meus dados</h3>'+
    '<p class="modal-text">Usado para preencher os recibos em PDF.</p>'+
    '<label class="field"><span>Seu nome (locador)</span><input id="f_nome" value="'+esc(cfg.locadorNome)+'"></label>'+
    '<label class="field"><span>CPF/CNPJ (opcional)</span><input id="f_doc" value="'+esc(cfg.locadorDocumento)+'"></label>'+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-primary" onclick="saveConfig()">Salvar</button>'+
    '</div></div>'
  );
}
async function saveConfig(){
  const cfg = {
    locadorNome: document.getElementById('f_nome').value.trim(),
    locadorDocumento: document.getElementById('f_doc').value.trim()
  };
  try{
    await db.saveConfig(cfg);
    state.config = cfg;
    closeModal();
    showToast('Dados salvos.', 'success');
  }catch(e){ console.error(e); showToast('Erro ao salvar. Tente novamente.', 'error'); }
}

/* ---------- apagar tudo ---------- */
function confirmResetAll(){
  openModal(
    '<h3 class="modal-title">Apagar todos os dados?</h3>'+
    '<p class="modal-text">Isso remove casas, inquilinos, pagamentos, despesas e fotos da sua conta. Sua conta de acesso continua. Não dá para desfazer — exporte um backup antes, se quiser.</p>'+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-danger" onclick="resetAll()">Apagar tudo</button>'+
    '</div></div>'
  );
}
async function resetAll(){
  try{
    await db.wipeAll();
    state.houses=[]; state.tenants=[]; state.eventos=[]; state.photoCache={};
    closeModal();
    state.view='dashboard';
    render();
    showToast('Dados apagados.', 'success');
  }catch(e){ console.error(e); showToast('Erro ao apagar. Tente novamente.', 'error'); }
}

/* ---------- render principal ---------- */
function render(){
  const app = document.getElementById('app');
  if(state.recovery){ app.innerHTML = renderRecoveryScreen(); return; }
  if(!state.session){ app.innerHTML = renderAuthScreen(); return; }
  app.innerHTML =
    '<div class="app-shell">'+
      renderTopBar()+
      '<main class="main">'+
        (state.loading ? '<div class="empty-state">Carregando seus dados…</div>' :
          state.view==='casas' ? renderCasasView() :
          state.view==='inquilinos' ? renderInquilinosView() :
          state.view==='financeiro' ? renderFinanceiroView() :
          state.view==='calendario' ? renderCalendario() :
          state.view==='houseDetail' ? renderHouseDetail() :
          renderDashboard())+
      '</main>'+
    '</div>';
  if(!state.loading && state.session){
    if(state.view==='casas' && typeof aplicarFiltroCasas==='function') aplicarFiltroCasas();
    if(state.view==='inquilinos' && typeof aplicarFiltroInq==='function') aplicarFiltroInq();
    if(typeof fitStatValues==='function') fitStatValues();
  }
}

/* ---------- boot / sessão ---------- */
async function boot(){
  const { data:{ session } } = await sb.auth.getSession();
  state.session = session;
  if(!session){ state.loaded=false; render(); return; }
  if(!state.loaded){ await loadData(); }
  else { render(); }
}
async function loadData(){
  state.loading = true; render();
  try{
    const data = await db.loadAll();
    state.houses = data.houses;
    state.tenants = data.tenants;
    state.config = data.config;
    state.eventos = data.eventos || [];
    state.photoCache = {};
    state.loaded = true;
  }catch(e){
    console.error('Erro ao carregar', e);
    showToast('Não foi possível carregar seus dados. Verifique a conexão.', 'error');
  }
  state.loading = false;
  render();
  // cria o backup automático do dia, sem travar a interface
  if(state.loaded){ ensureDailySnapshot(); }
}

/* reage a login/logout em outras abas ou via link de e-mail */
sb.auth.onAuthStateChange(function(event, session){
  if(event === 'PASSWORD_RECOVERY'){
    state.session = session;
    state.recovery = true;
    render();
    return;
  }
  const had = !!state.session;
  state.session = session;
  if(session && !had){ state.loaded=false; boot(); }
  else if(!session && had){ state.loaded=false; render(); }
});

boot();
