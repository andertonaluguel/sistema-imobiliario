/* ============================================================
   app.js — Núcleo da aplicação
   - Estado em memória
   - Gate de autenticação (nada renderiza sem login)
   - Roteamento e renderização (despacha para os módulos)
   ============================================================ */

const UI_MODE_KEY = 'aluguel-ui-mode-v1';

function loadUiMode(){
  try{ return localStorage.getItem(UI_MODE_KEY)==='simple' ? 'simple' : 'advanced'; }
  catch(e){ return 'advanced'; }
}
function isSimpleMode(){ return state.uiMode==='simple'; }

const state = {
  session: null,
  role: null,
  access: null,
  commercialAccess: null,
  isPlatformAdmin: false,
  isPrimaryOwner: true,
  ownerProfile: null,
  staffProfile: null,
  team: [],
  commercialAccounts: [],
  commercialInvites: [],
  platformAdmins: [],
  commercialAudit: [],
  commercialLicenses: [],
  recovery: false,
  loaded: false,
  loading: true,
  publicMode: false,
  publicListings: null,
  publicLoaded: false,
  vitrinePublicMode: false,
  vitrinePublic: null,
  vitrineDetalheId: null,
  vitrineFiltros: {busca:'',tipo:'',quartos:0,faixa:'',bairro:'',ordem:'destaque',extras:[]},
  vitrine: {anunciantes:[],imoveis:[],leads:[],taxas:[],carregado:false},
  vitrineTab: 'painel',
  offlineMode: false,
  offlineSavedAt: '',
  uiMode: loadUiMode(),
  houses: [],
  tenants: [],
  interests: [],
  eventos: [],
  config: { locadorNome:'', locadorDocumento:'', energiaAtiva:true, tema:'original', onboardingConcluido:false, ultimoBackupExterno:'',pixChave:'',pixNome:'',pixCidade:'' },
  view: 'dashboard',          // inclui a área Mestre isolada em 'minhaCasa'
  activeHouseId: null,
  activeTab: 'geral',
  photoCache: {},
  documentCache: {},
  portalDocuments: [],
  tenantAccess: [],
  portalTab: 'inicio',
  alertsExpanded: false,
  movsExpanded: false,
  reportListExpanded: true,
  relatorioAno: new Date().getFullYear(),
  financeMonth: currentMonthStr(),
  energiaMes: currentMonthStr(),
  expandedReportHouseId: null,
  calMes: currentMonthStr(),
  casaBusca: '', casaFiltro: 'todas',
  inqBusca: '', inqFiltro: 'todos',
  interestSearch: '', interestFilter: 'ativos'
};

/* ---------- ícones / marca ---------- */
function logoSvg(){
  return '<svg class="brand-mark" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">'+
    '<polygon points="16,5 27,15 5,15" fill="currentColor"/>'+
    '<rect x="8" y="14" width="16" height="13" rx="1" fill="currentColor"/>'+
    '<rect x="21.5" y="8" width="3.5" height="7" fill="currentColor"/>'+
    '<rect x="11.5" y="18.5" width="3.5" height="3.5" fill="var(--cover)"/>'+
    '<rect x="17" y="18.5" width="3.5" height="3.5" fill="var(--cover)"/></svg>';
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

function supportContactButton(label){
  return '<a class="btn btn-primary" href="mailto:'+esc(CONFIG.SUPPORT_EMAIL)+'?subject='+encodeURIComponent('Suporte '+CONFIG.APP_NAME)+'">'+esc(label||'Falar com o suporte')+'</a>';
}
function termsContent(){
  return '<div class="legal-copy"><h4>Termos de Uso</h4><p>O '+esc(CONFIG.APP_NAME)+' auxilia na organização de imóveis, contratos, cobranças e arquivos. O proprietário é responsável pela veracidade das informações cadastradas e por possuir autorização para tratar os dados de inquilinos e interessados.</p>'+ 
    '<p>O plano Gratuito permite 1 casa, o Básico permite 3 casas e o Premium permite 100 casas. Fotos e documentos também respeitam o limite de armazenamento do plano.</p>'+ 
    '<p>Contas podem ser suspensas em caso de fraude, uso abusivo ou violação destes termos. Antes de encerrar o uso, o cliente pode exportar seus dados pelo menu de backup.</p>'+ 
    '<h4>Aviso de Privacidade</h4><p>São armazenados os dados que o usuário inserir, como contatos, documentos, contratos, pagamentos e arquivos. Eles são usados somente para oferecer as funções da plataforma, suporte, segurança e recuperação.</p>'+ 
    '<p>Cada proprietário atua como responsável pelos dados das pessoas que cadastrar. Solicitações de acesso, correção, exportação ou exclusão podem ser enviadas para <a href="mailto:'+esc(CONFIG.SUPPORT_EMAIL)+'">'+esc(CONFIG.SUPPORT_EMAIL)+'</a>.</p>'+ 
    '<p><strong>Versão dos termos: 1.0.</strong> Recomenda-se revisão jurídica antes do início das vendas.</p></div>';
}
function openPublicTerms(){openModal('<h3 class="modal-title">Termos e Privacidade</h3>'+termsContent()+'<div class="modal-actions"><button class="btn btn-primary" onclick="closeModal()">Fechar</button></div>');}
function renderTermsGate(){
  return '<div class="commercial-gate"><div class="commercial-gate-card legal-gate">'+logoSvg()+'<span class="eyebrow">PRIMEIRO ACESSO</span><h1>Termos e Privacidade</h1>'+termsContent()+
    '<label class="auth-consent"><input id="terms_accept" type="checkbox"><span>Li e concordo com os Termos de Uso e o Aviso de Privacidade.</span></label>'+ 
    '<button class="btn btn-primary" onclick="acceptCurrentTerms()">Aceitar e continuar</button><button class="btn btn-ghost" onclick="doSignOut()">Sair</button></div></div>';
}
async function acceptCurrentTerms(){
  const check=document.getElementById('terms_accept');if(!check||!check.checked){showToast('Marque a confirmação para continuar.','error');return;}
  try{await db.acceptTerms();state.commercialAccess.termosAceitos=true;state.loaded=false;await loadData();showToast('Termos aceitos.','success');}
  catch(e){console.error(e);showToast('Não foi possível registrar o aceite.','error');}
}

function openHelpModal(){
  const plan=state.commercialAccess?commercialPlanLabel(state.commercialAccess.plano):'';
  openModal('<h3 class="modal-title">Ajuda e suporte</h3><p class="modal-text">Plano atual: <strong>'+esc(plan||'—')+'</strong>. Versão '+esc(CONFIG.APP_VERSION)+'.</p>'+ 
    '<div class="help-steps"><strong>Primeiros passos</strong><span>1. Preencha seus dados em Configurações.</span><span>2. Cadastre a primeira casa.</span><span>3. Cadastre o inquilino e inicie o contrato.</span><span>4. Registre pagamentos e exporte um backup.</span></div>'+termsContent()+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Fechar</button>'+supportContactButton('Enviar e-mail ao suporte')+'</div>');
}

function openAccountModal(){
  const email=state.session&&state.session.user?state.session.user.email:'';
  const fixedMaster=Array.isArray(CONFIG.MASTER_EMAILS)&&CONFIG.MASTER_EMAILS.includes(String(email||'').toLowerCase());
  if(fixedMaster){
    openModal('<h3 class="modal-title">Minha conta Mestre</h3>'+
      '<div class="notice-box"><strong>E-mail protegido</strong><br>Esta conta Mestre usa o e-mail <strong>'+esc(email)+'</strong> como identidade de segurança. Ele não pode ser alterado pelo aplicativo.</div>'+
      '<p class="modal-text">Você ainda pode trocar sua senha normalmente.</p>'+
      '<button class="btn btn-ghost" onclick="openLoggedPasswordModal()">Alterar minha senha</button>'+
      '<div class="modal-actions"><span></span><button class="btn btn-primary" onclick="closeModal()">Fechar</button></div>');
    return;
  }
  openModal('<h3 class="modal-title">Minha conta</h3><p class="modal-text">Ao trocar o e-mail, você receberá uma confirmação no endereço novo.</p>'+ 
    '<label class="field"><span>Novo e-mail</span><input id="account_email" type="email" value="'+esc(email)+'"></label>'+ 
    '<button class="btn btn-ghost" onclick="openLoggedPasswordModal()">Alterar minha senha</button>'+ 
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveAccountEmail()">Alterar e-mail</button></div>');
}
async function saveAccountEmail(){
  const currentEmail=state.session&&state.session.user?String(state.session.user.email||'').toLowerCase():'';
  if(Array.isArray(CONFIG.MASTER_EMAILS)&&CONFIG.MASTER_EMAILS.includes(currentEmail)){
    showToast('O e-mail da conta Mestre é protegido e não pode ser alterado.','error');
    return;
  }
  const email=((document.getElementById('account_email')||{}).value||'').trim().toLowerCase();
  if(!email||email.indexOf('@')<1){showToast('Informe um e-mail válido.','error');return;}
  const result=await sb.auth.updateUser({email:email},{emailRedirectTo:window.location.origin});
  if(result.error){showToast(traduzAuthErro(result.error.message),'error');return;}
  closeModal();showToast('Confirme a troca pelo link enviado ao novo e-mail.','success');
}
function openLoggedPasswordModal(){
  openModal('<h3 class="modal-title">Alterar senha</h3><label class="field"><span>Nova senha</span><input id="account_password" type="password" autocomplete="new-password" placeholder="mínimo 8 caracteres, com letra e número"></label>'+ 
    '<label class="field"><span>Repita a nova senha</span><input id="account_password_confirm" type="password" autocomplete="new-password"></label>'+ 
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="openAccountModal()">Voltar</button><button class="btn btn-primary" onclick="saveLoggedPassword()">Salvar senha</button></div>');
}
async function saveLoggedPassword(){
  const password=((document.getElementById('account_password')||{}).value||''),confirmPassword=((document.getElementById('account_password_confirm')||{}).value||'');
  if(password.length<8||!/[A-Za-zÀ-ÿ]/.test(password)||!(/\d/.test(password))){showToast('Use ao menos 8 caracteres, com letra e número.','error');return;}
  if(password!==confirmPassword){showToast('As senhas não conferem.','error');return;}
  const result=await sb.auth.updateUser({password:password});if(result.error){showToast(traduzAuthErro(result.error.message),'error');return;}
  closeModal();showToast('Senha alterada.','success');
}

/* ---------- helper de domínio compartilhado ---------- */
function tenantOf(h){ return h.tenantId ? state.tenants.find(function(x){ return x.id===h.tenantId; }) : null; }

/* ---------- módulos vendáveis ----------
   O módulo diz O QUE a conta acessa. O plano diz QUANTO ela usa.

   IMPORTANTE — retrocompatibilidade: se o banco ainda não devolve a
   chave "modulos" (migracao-modulos.sql não rodou), o app volta ao
   comportamento antigo e libera tudo. Isso evita que alguém fique
   trancado para fora se o site for publicado antes da migração. */
function modulosDaConta(){
  const acesso = state.commercialAccess || {};
  const mods = acesso.modulos;
  if(!mods || typeof mods !== 'object'){
    /* Banco sem a migração ainda: comporta-se exatamente como antes.
       A Vitrine fica escondida porque as tabelas dela não existem —
       mostrar a aba só daria erro ao abrir. */
    return { alugueis:true,
             minhaCasa:!!state.isPlatformAdmin,
             vitrine:false,
             legado:true };
  }
  if(state.isPlatformAdmin){
    return { alugueis:true, minhaCasa:true, vitrine:true };
  }
  return { alugueis:!!mods.alugueis, minhaCasa:!!mods.minhaCasa, vitrine:!!mods.vitrine };
}
function temModulo(nome){ return !!modulosDaConta()[nome]; }
function nenhumModulo(){
  const m = modulosDaConta();
  return !m.alugueis && !m.minhaCasa && !m.vitrine && !state.isPlatformAdmin;
}
/* Onde a pessoa cai ao entrar: o primeiro módulo que ela tem.
   Sem isso, quem comprou só Minha Casa abriria um painel vazio. */
function viewInicial(){
  const m = modulosDaConta();
  if(m.alugueis) return 'dashboard';
  if(m.minhaCasa) return 'minhaCasa';
  if(m.vitrine) return 'vitrine';
  return 'semModulo';
}

/* ---------- navegação ---------- */
function irHome(){ state.view='dashboard'; render(); }
function irCasas(){ state.view='casas'; render(); }
function irInquilinos(){ state.view='inquilinos'; render(); }
function irInteressados(){ state.view='interessados'; render(); }
function irFinanceiro(){ state.view='financeiro'; render(); }
function irClientes(){ if(!state.isPlatformAdmin)return; state.view='commercial'; render(); }
function irMinhaCasa(){
  if(!temModulo('minhaCasa')){ showToast('Esta conta não possui o módulo Minha Casa.','error'); return; }
  state.view='minhaCasa';
  render();
  if(typeof loadMinhaCasaData==='function') loadMinhaCasaData();
}
function irVitrine(){
  if(!temModulo('vitrine')){ showToast('Esta conta não possui o módulo Vitrine.','error'); return; }
  state.view='vitrine';
  render();
  if(typeof loadVitrineData==='function') loadVitrineData();
}
function irEnergia(){ if(!energyModuleEnabled()){showToast('Ative o módulo Energia nas configurações.','error');return;} state.view='energia'; render(); }
function irCalendario(){ if(!state.calMes) state.calMes=currentMonthStr(); state.view='calendario'; render(); }
function toggleAlerts(){ state.alertsExpanded = !state.alertsExpanded; render(); }
function toggleMovs(){ state.movsExpanded = !state.movsExpanded; render(); }
function toggleReportList(){ state.reportListExpanded = !state.reportListExpanded; render(); }
function setUiMode(mode){
  state.uiMode = mode==='simple' ? 'simple' : 'advanced';
  try{ localStorage.setItem(UI_MODE_KEY, state.uiMode); }catch(e){}
  if(isSimpleMode() && state.view!=='dashboard' && state.view!=='casas') state.view='dashboard';
  closeModal();
  render();
  showToast(isSimpleMode()?'Modo simples ativado neste aparelho.':'Modo avançado ativado neste aparelho.','success');
}

/* ---------- topo + menu ---------- */
function rentalNavItems(){
  if(isSimpleMode()){
    return [
      ['dashboard','Resumo','irHome()','&#8962;'],
      ['casas','Casas','irCasas()','&#9638;']
    ];
  }
  return [
    ['dashboard','Resumo','irHome()','&#8962;'],
    ['casas','Casas','irCasas()','&#9638;'],
    ['inquilinos','Inquilinos','irInquilinos()','&#9786;'],
    ['interessados','Interessados','irInteressados()','&#9825;']
  ].concat(energyModuleEnabled()?[['energia','Energia','irEnergia()','&#9889;']]:[])
    .concat([
      ['financeiro','Financeiro','irFinanceiro()','R$'],
      ['calendario','Agenda','irCalendario()','&#9633;']
    ]);
}
function rentalNavActive(view){
  return state.view===view||(view==='casas'&&state.view==='houseDetail');
}
function renderRentalNavigation(){
  if(state.view==='minhaCasa'||state.view==='commercial'||state.view==='vitrine')return '';
  if(!temModulo('alugueis'))return '';
  return '<nav class="rent-tabs" aria-label="Áreas da gestão de aluguéis">'+rentalNavItems().map(function(item){
    const active=rentalNavActive(item[0]);
    return '<button class="rent-tab'+(active?' active':'')+'"'+(active?' aria-current="page"':'')+' onclick="'+item[2]+'">'+
      '<span aria-hidden="true">'+item[3]+'</span><b>'+esc(item[1])+'</b></button>';
  }).join('')+'</nav>';
}
function renderTopBar(){
  const access=state.commercialAccess||{};
  const mods=modulosDaConta();
  const isMyHome=state.view==='minhaCasa', isVitrine=state.view==='vitrine';
  const rentalActive=!isMyHome&&!isVitrine&&state.view!=='commercial';
  const accountLimit=Number(access.limiteCasas||1);
  const accountUsage=Number(state.houses.length);
  /* O medidor de casas só faz sentido dentro dos Aluguéis. */
  const planControl=(isMyHome||isVitrine||!mods.alugueis)?'':(
    state.staffProfile
      ? '<span class="plan-top-pill is-passive" title="O plano pertence ao proprietário">Limites da conta · '+accountUsage+'/'+accountLimit+'</span>'
      : '<button class="plan-top-pill" onclick="openPlanModal()">Plano '+esc(commercialPlanLabel(access.plano||'gratuito'))+' · '+accountUsage+'/'+accountLimit+'</button>'
  );
  /* O topo é montado a partir dos módulos da conta. Comercial não é
     módulo: é o balcão de vendas e continua preso à conta Mestre. */
  const abas=[
    mods.alugueis  && ['rent-product-switch',rentalActive,'irHome()','&#9638;','Aluguéis'],
    mods.minhaCasa && ['my-home-launch',isMyHome,'irMinhaCasa()','⌂','Minha Casa'],
    mods.vitrine   && ['rent-product-switch vitrine',isVitrine,'irVitrine()','&#9788;','Vitrine'],
    state.isPlatformAdmin && ['rent-product-switch commercial',state.view==='commercial','irClientes()','&#9670;','Comercial']
  ].filter(Boolean);
  return '<header class="topbar">'+
    '<button class="topbar-brand" onclick="irHome()">'+logoSvg()+'<span class="brand-name">Aluguel</span></button>'+
    '<div class="rent-product-switcher">'+abas.map(function(a){
      return '<button class="'+a[0]+(a[1]?' active':'')+'"'+(a[1]?' aria-current="page"':'')+
        ' onclick="'+a[2]+'"><span aria-hidden="true">'+a[3]+'</span><b>'+esc(a[4])+'</b></button>';
    }).join('')+'</div>'+
    (isSimpleMode()&&mods.alugueis?'<span class="mode-label">MODO SIMPLES</span>':'')+
    planControl+
    (mods.alugueis?'<button class="top-search-btn" onclick="openGlobalSearch()" aria-label="Buscar">Buscar</button>':'')+
    '<button class="menu-btn" onclick="openMenuModal()" aria-label="Menu">⋯</button>'+
  '</header>';
}

/* Conta ativa que ainda não teve nenhum módulo liberado. Sem esta
   tela, a pessoa veria um aplicativo vazio e concluiria que quebrou. */
function renderSemModulo(){
  return '<div class="commercial-gate"><div class="commercial-gate-card">'+logoSvg()+
    '<span class="eyebrow">ACESSO DA CONTA</span><h1>Nenhum módulo liberado</h1>'+
    '<p>Sua conta está ativa, mas ainda não tem nenhum módulo habilitado. '+
    'Fale com o suporte para liberar Aluguéis, Minha Casa ou Vitrine.</p>'+
    supportContactButton('Falar com o suporte')+
    '<button class="btn btn-ghost" onclick="doSignOut()">Sair da conta</button></div></div>';
}
function renderMobileNav(){
  if(!temModulo('alugueis'))return '';
  const items=isSimpleMode()
    ? [['dashboard','Resumo','irHome()','&#8962;'],['casas','Casas','irCasas()','&#9638;']]
    : [
      ['dashboard','Resumo','irHome()','&#8962;'],
      ['casas','Casas','irCasas()','&#9638;'],
      ['inquilinos','Inquilinos','irInquilinos()','&#9786;'],
      ['financeiro','Financeiro','irFinanceiro()','R$'],
      ['mais','Mais','openMoreAreasMenu()','&#8943;']
    ];
  return '<nav class="mobile-nav'+(isSimpleMode()?' simple-mobile-nav':'')+'" style="--mobile-items:'+items.length+'">'+items.map(function(i){
    const active=i[0]==='mais'
      ? ['interessados','energia','calendario','commercial'].includes(state.view)
      : rentalNavActive(i[0]);
    return '<button class="mobile-nav-item'+(active?' active':'')+'"'+(active?' aria-current="page"':'')+' onclick="'+i[2]+'"><i aria-hidden="true">'+i[3]+'</i><span>'+esc(i[1])+'</span></button>';
  }).join('')+'</nav>';
}
function openMoreAreasMenu(){
  const items=[
    ['Interessados em alugar','Acompanhar pessoas procurando imóvel','closeModal();irInteressados()','&#9825;']
  ].concat(energyModuleEnabled()?[['Energia dos imóveis','Consumo, cobranças e recebimentos','closeModal();irEnergia()','&#9889;']]:[])
    .concat([
      ['Agenda','Vencimentos e lembretes','closeModal();irCalendario()','&#9633;'],
      ['Busca geral','Encontrar casa, inquilino ou interessado','closeModal();openGlobalSearch()','&#8981;']
    ])
    .concat(temModulo('vitrine')?[
      ['Vitrine','Catálogo público de imóveis de terceiros','closeModal();irVitrine()','&#9788;']
    ]:[])
    .concat(temModulo('minhaCasa')?[
      ['Minha Casa','Controle financeiro familiar','closeModal();irMinhaCasa()','⌂']
    ]:[])
    .concat(state.isPlatformAdmin?[
      ['Clientes proprietários','Área Comercial da plataforma','closeModal();irClientes()','&#9670;']
    ]:[]);
  openModal('<h3 class="modal-title">Mais áreas</h3><p class="modal-text">Escolha o que você deseja administrar.</p>'+
    '<div class="rent-more-grid">'+items.map(function(item){
      return '<button onclick="'+item[2]+'"><span aria-hidden="true">'+item[3]+'</span><strong>'+item[0]+'</strong><small>'+item[1]+'</small></button>';
    }).join('')+'</div>');
}

function openGlobalSearch(){
  openModal('<h3 class="modal-title">Busca rápida</h3><label class="field"><span>Casa, endereço, inquilino, interessado ou telefone</span>'+
    '<input id="globalSearchInput" autofocus placeholder="Digite para buscar…" oninput="renderGlobalSearchResults(this.value)"></label>'+
    '<div id="globalSearchResults" class="global-results"><p class="modal-text">Comece a digitar para ver resultados.</p></div>');
  setTimeout(function(){const i=document.getElementById('globalSearchInput');if(i)i.focus();},20);
}
function renderGlobalSearchResults(value){
  const root=document.getElementById('globalSearchResults'),q=String(value||'').trim().toLowerCase(); if(!root)return;
  if(q.length<2){root.innerHTML='<p class="modal-text">Digite pelo menos duas letras.</p>';return;}
  const houses=state.houses.filter(function(h){const t=tenantOf(h);return (h.nome+' '+h.endereco+' '+(t?t.nome:'')).toLowerCase().includes(q);}).slice(0,6);
  const tenants=isSimpleMode()?[]:state.tenants.filter(function(t){return (t.nome+' '+t.telefone+' '+t.email).toLowerCase().includes(q);}).slice(0,6);
  const interests=isSimpleMode()?[]:state.interests.filter(function(i){return (i.nome+' '+i.telefone+' '+i.observacoes).toLowerCase().includes(q);}).slice(0,6);
  const html=houses.map(function(h){return '<button class="global-result" onclick="closeModal();'+(isSimpleMode()?'openSimpleHouseSummary(\''+h.id+'\')':'openHouse(\''+h.id+'\')')+'"><strong>'+esc(h.nome)+'</strong><span>'+esc(h.endereco||'Casa')+'</span></button>';}).join('')+
    tenants.map(function(t){return '<button class="global-result" onclick="closeModal();openEditTenantModal(\''+t.id+'\')"><strong>'+esc(t.nome)+'</strong><span>'+esc(t.telefone||t.email||'Inquilino')+'</span></button>';}).join('')+
    interests.map(function(i){return '<button class="global-result" onclick="closeModal();irInteressados();openEditInterestModal(\''+i.id+'\')"><strong>'+esc(i.nome)+'</strong><span>Interessado · '+esc(i.telefone||interestStatusLabel(i.status))+'</span></button>';}).join('');
  root.innerHTML=html||'<p class="modal-text">Nenhum resultado encontrado.</p>';
}
function openMenuModal(){
  const email = state.session && state.session.user ? esc(state.session.user.email) : '';
  const accountType=state.isPlatformAdmin?'Mestre':(state.staffProfile?'Administrador da equipe':'Administrador');
  const modeSwitch='<div class="mode-switch-wrap"><span class="field-kicker">MODO DE USO NESTE APARELHO</span><div class="mode-switch">'+
    '<button class="'+(isSimpleMode()?'active':'')+'" onclick="setUiMode(\'simple\')"><strong>Simples</strong><small>Ver e registrar pagamentos</small></button>'+
    '<button class="'+(!isSimpleMode()?'active':'')+'" onclick="setUiMode(\'advanced\')"><strong>Avançado</strong><small>Todos os recursos</small></button></div></div>';
  openModal(
    '<h3 class="modal-title">Menu</h3>'+
    (email?'<p class="modal-text">Conectado como <strong>'+email+'</strong> · '+accountType+'</p>':'')+
    modeSwitch+
    '<div class="menu-list">'+
      '<button class="btn btn-ghost" onclick="closeModal();openPlanModal()">Meu plano</button>'+ 
      '<button class="btn btn-ghost" onclick="closeModal();openAccountModal()">Minha conta</button>'+ 
      (state.isPrimaryOwner&&!isSimpleMode()?'<button class="btn btn-ghost" onclick="closeModal();openTeamModal()">Funcionários</button>':'')+
      (state.isPrimaryOwner&&state.ownerProfile&&state.ownerProfile.slug_publico?'<button class="btn btn-ghost" onclick="copyPublicLink()">Copiar link dos anúncios</button>':'')+
      (temModulo('vitrine')&&state.ownerProfile&&state.ownerProfile.slug_publico?'<button class="btn btn-ghost" onclick="copyVitrineLink()">Copiar link da Vitrine</button>':'')+
      (!isSimpleMode()?'<button class="btn btn-ghost" onclick="closeModal();openConfigModal()">Configurações do app</button>'+
      (temModulo('alugueis')?'<button class="btn btn-ghost" onclick="closeModal();doExportBackup()">Exportar backup (JSON)</button>'+
      '<button class="btn btn-ghost" onclick="closeModal();triggerImport()">Importar backup</button>'+
      '<button class="btn btn-ghost" onclick="closeModal();openBackupsModal()">Backups automáticos</button>'+
      (state.isPrimaryOwner?'<button class="btn btn-danger" onclick="closeModal();confirmResetAll()">Apagar todos os dados</button>':''):''):'')+
      '<button class="btn btn-ghost" onclick="closeModal();openHelpModal()">Ajuda, termos e suporte</button>'+ 
      '<button class="btn btn-ghost" onclick="closeModal();doSignOut()">Sair</button>'+ 
    '</div><p class="menu-version">'+esc(CONFIG.APP_NAME)+' · '+esc(CONFIG.APP_VERSION)+'</p>'
  );
}

/* Lista dos módulos da conta, para a tela "Meu plano". Deixa claro o
   que a pessoa comprou — e, por tabela, o que ela ainda não tem. */
function renderModulosDaConta(){
  const m=modulosDaConta();
  return '<div class="form-section-title">Módulos da sua conta</div>'+
    '<p class="modal-text">O módulo define o que você acessa. O plano abaixo define quanto você pode usar.</p>'+
    '<div class="plan-comparison">'+(CONFIG.MODULOS||[]).map(function(mod){
      const ativo=!!m[mod.id];
      return '<div class="plan-compare-card'+(ativo?' active':'')+'"><strong>'+esc(mod.nome)+'</strong>'+
        '<span>'+(ativo?'Liberado':'Não contratado')+'</span>'+
        '<small>'+esc(mod.descricao)+'</small></div>';
    }).join('')+'</div>';
}
function openPlanModal(){
  const a=state.commercialAccess||{},plan=commercialPlan(a.plano||'gratuito');
  const used=Number(a.armazenamentoUsado)||0,storageLimit=Number(a.limiteArmazenamento)||plan.armazenamentoBytes;
  openModal('<h3 class="modal-title">Seu plano '+esc(plan.nome)+'</h3>'+renderModulosDaConta()+
    '<div class="form-section-title">Limites de uso</div>'+
    '<div class="plan-usage-grid"><div><span>Casas</span><strong>'+Number(state.houses.length)+' / '+Number(a.limiteCasas||plan.casas)+'</strong></div>'+
    '<div><span>Armazenamento</span><strong>'+commercialBytes(used)+' / '+commercialBytes(storageLimit)+'</strong></div></div>'+ 
    '<div class="plan-comparison">'+['gratuito','basico','premium'].map(function(id){const p=commercialPlan(id);return '<div class="plan-compare-card'+(id===a.plano?' active':'')+'"><strong>'+esc(p.nome)+'</strong><span>Até '+p.casas+' casa(s)</span><small>'+commercialBytes(p.armazenamentoBytes)+' de arquivos</small></div>';}).join('')+'</div>'+ 
    (a.plano==='premium'?'<p class="modal-hint">Você já possui o maior plano.</p>':'<p class="modal-hint">Para mudar de plano, entre em contato com o suporte.</p>'+supportContactButton('Solicitar mudança'))+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Fechar</button></div>');
}

function onboardingSteps(){
  return [
    {ok:!!(state.config&&state.config.locadorNome),label:'Preencher os dados do locador',action:'openConfigModal()'},
    {ok:state.houses.length>0,label:'Cadastrar a primeira casa',action:'openAddHouseModal()'},
    {ok:state.tenants.length>0,label:'Cadastrar um inquilino',action:'openAddTenantModal()'},
    {ok:state.houses.some(function(h){return (h.contracts||[]).length>0;}),label:'Criar o primeiro contrato',action:'irCasas()'},
    {ok:!!(state.config&&state.config.ultimoBackupExterno),label:'Baixar o primeiro backup',action:'doExportBackup()'}
  ];
}
function renderOnboardingBanner(){
  if(state.config&&state.config.onboardingConcluido)return '';
  const steps=onboardingSteps(),done=steps.filter(function(s){return s.ok;}).length;
  return '<section class="onboarding-card"><div><span class="eyebrow">PRIMEIROS PASSOS</span><h2>Prepare sua conta</h2><p>'+done+' de '+steps.length+' etapas concluídas</p></div><div class="onboarding-steps">'+steps.map(function(s){return '<button class="onboarding-step'+(s.ok?' done':'')+'" onclick="'+s.action+'"><span>'+(s.ok?'✓':'○')+'</span>'+esc(s.label)+'</button>';}).join('')+'</div>'+ 
    (done===steps.length?'<button class="btn btn-primary btn-small" onclick="finishOnboarding()">Concluir orientação</button>':'<button class="btn btn-ghost btn-small" onclick="finishOnboarding()">Ocultar por enquanto</button>')+'</section>';
}
async function finishOnboarding(){
  const cfg=Object.assign({},state.config,{onboardingConcluido:true});
  try{await db.saveConfig(cfg);state.config=cfg;render();showToast('Orientação concluída.','success');}catch(e){showToast('Não foi possível salvar.','error');}
}
function renderExternalBackupReminder(){
  const last=state.config&&state.config.ultimoBackupExterno;
  const age=last?(Date.now()-new Date(last).getTime())/(86400000):Infinity;
  if(age<30||!(state.config&&state.config.onboardingConcluido))return '';
  return '<div class="backup-reminder"><span><strong>Faça uma cópia externa</strong><small>Seu último backup completo '+(last?'tem mais de 30 dias':'ainda não foi baixado')+'.</small></span><button class="btn btn-ghost btn-small" onclick="doExportBackup()">Baixar backup</button></div>';
}

/* ---------- meus dados (locador) ---------- */
function renderThemeSelector(selected){
  selected=normalizeAppTheme(selected);
  return '<div class="form-section-title">Cores do aplicativo</div><p class="theme-help">O tema também será usado no portal dos seus inquilinos.</p><div class="theme-grid">'+APP_THEME_OPTIONS.map(function(theme){
    return '<label class="theme-option"><input type="radio" name="app_theme" value="'+theme.id+'"'+(theme.id===selected?' checked':'')+' onchange="previewAppTheme(\''+theme.id+'\')"><span class="theme-option-card"><span class="theme-swatches">'+theme.cores.map(function(cor){return '<i style="background:'+cor+'"></i>';}).join('')+'</span><strong>'+esc(theme.nome)+'</strong><small>'+esc(theme.descricao)+'</small></span></label>';
  }).join('')+'</div>';
}
function selectedAppTheme(){
  const selected=document.querySelector('input[name="app_theme"]:checked');
  return normalizeAppTheme(selected?selected.value:'original');
}
function previewAppTheme(theme){ return normalizeAppTheme(theme); }
function cancelConfigModal(){ applyAppTheme((state.config||{}).tema); closeModal(); }
function openConfigModal(){
  const cfg = state.config||{};
  const owner=state.ownerProfile||{};
  const commercialFields=state.isPrimaryOwner?'<div class="form-section-title">Recebimento por PIX</div><p class="modal-text">Gera PIX Copia e Cola sem mensalidade. A confirmação do pagamento é manual.</p>'+ 
    '<label class="field"><span>Chave PIX</span><input id="f_pix_key" value="'+esc(cfg.pixChave||'')+'" placeholder="CPF, telefone, e-mail ou chave aleatória"></label>'+ 
    '<div class="field-row"><label class="field"><span>Nome do recebedor</span><input id="f_pix_name" maxlength="25" value="'+esc(cfg.pixNome||cfg.locadorNome||'')+'"></label>'+ 
    '<label class="field"><span>Cidade</span><input id="f_pix_city" maxlength="15" value="'+esc(cfg.pixCidade||'')+'"></label></div>'+ 
    '<div class="form-section-title">Anúncios públicos</div><p class="modal-text">Somente casas vagas que você marcar como publicadas aparecem no link. Dados de inquilinos nunca são exibidos.</p>'+ 
    '<label class="field"><span>Endereço público</span><div class="slug-input"><span>?anuncios=</span><input id="f_public_slug" value="'+esc(owner.slug_publico||'')+'" placeholder="imoveis-do-anderton"></div></label>'+ 
    '<div class="field-row"><label class="field"><span>Nome exibido</span><input id="f_public_name" value="'+esc(owner.nome_publico||cfg.locadorNome||'')+'"></label>'+ 
    '<label class="field"><span>WhatsApp público</span><input id="f_public_contact" value="'+esc(owner.contato_publico||'')+'" placeholder="(00) 00000-0000"></label></div>'+ 
    (owner.slug_publico?'<button class="btn btn-ghost" onclick="copyPublicLink()">Copiar link dos anúncios</button>':''):'';
  openModal(
    '<h3 class="modal-title">Configurações</h3>'+
    '<p class="modal-text">Personalize o aplicativo e os dados usados nos recibos.</p>'+
    '<label class="field"><span>Seu nome (locador)</span><input id="f_nome" value="'+esc(cfg.locadorNome)+'"></label>'+
    '<label class="field"><span>CPF/CNPJ (opcional)</span><input id="f_doc" value="'+esc(cfg.locadorDocumento)+'"></label>'+
    '<label class="field-check module-toggle"><input type="checkbox" id="f_energy_enabled"'+(cfg.energiaAtiva!==false?' checked':'')+'><span><strong>Ativar o módulo Energia</strong><small>Ao desativar, os lançamentos ficam preservados e a categoria é escondida.</small></span></label>'+ 
    commercialFields+renderThemeSelector(cfg.tema)+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="cancelConfigModal()">Cancelar</button>'+
      '<button class="btn btn-primary" onclick="saveConfig()">Salvar</button>'+
    '</div></div>'
  );
}
async function saveConfig(){
  const cfg = {
    locadorNome: document.getElementById('f_nome').value.trim(),
    locadorDocumento: document.getElementById('f_doc').value.trim(),
    energiaAtiva: document.getElementById('f_energy_enabled').checked,
    tema: selectedAppTheme(),
    onboardingConcluido:!!state.config.onboardingConcluido,
    ultimoBackupExterno:state.config.ultimoBackupExterno||'',
    pixChave:state.isPrimaryOwner?document.getElementById('f_pix_key').value.trim():(state.config.pixChave||''),
    pixNome:state.isPrimaryOwner?document.getElementById('f_pix_name').value.trim():(state.config.pixNome||''),
    pixCidade:state.isPrimaryOwner?document.getElementById('f_pix_city').value.trim():(state.config.pixCidade||'')
  };
  try{
    await db.saveConfig(cfg);
    if(state.isPrimaryOwner){
      const profile={slug:document.getElementById('f_public_slug').value.trim().toLowerCase(),
        nome:document.getElementById('f_public_name').value.trim(),contato:document.getElementById('f_public_contact').value.trim()};
      await db.savePublicProfile(profile);
      state.ownerProfile.slug_publico=profile.slug;state.ownerProfile.nome_publico=profile.nome;
      state.ownerProfile.contato_publico=profile.contato.replace(/\D/g,'');
    }
    state.config = cfg;
    applyAppTheme(cfg.tema);
    if(!cfg.energiaAtiva&&state.view==='energia') state.view='dashboard';
    closeModal();
    render();
    showToast('Dados salvos.', 'success');
  }catch(e){ console.error(e); showToast((e&&e.message)||'Erro ao salvar. Tente novamente.', 'error'); }
}

/* ---------- apagar tudo ---------- */
function confirmResetAll(){
  openModal(
    '<h3 class="modal-title">Apagar todos os dados?</h3>'+ 
    '<p class="modal-text">Isso remove casas, inquilinos, pagamentos, despesas, fotos e documentos. Sua conta continua ativa. Exporte um backup antes.</p>'+ 
    '<label class="field"><span>Digite APAGAR para confirmar</span><input id="reset_phrase" autocomplete="off"></label>'+ 
    '<label class="field"><span>Confirme sua senha</span><input id="reset_password" type="password" autocomplete="current-password"></label>'+ 
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-danger" onclick="resetAll()">Apagar tudo</button>'+
    '</div></div>'
  );
}
async function resetAll(){
  try{
    const phrase=((document.getElementById('reset_phrase')||{}).value||'').trim().toUpperCase();
    const password=(document.getElementById('reset_password')||{}).value||'';
    if(phrase!=='APAGAR'||!password){showToast('Digite APAGAR e confirme sua senha.','error');return;}
    const email=state.session&&state.session.user?state.session.user.email:'';
    const auth=await sb.auth.signInWithPassword({email:email,password:password});
    if(auth.error){showToast('Senha incorreta. Os dados não foram apagados.','error');return;}
    await db.wipeAll();
    state.houses=[]; state.tenants=[]; state.interests=[]; state.eventos=[]; state.photoCache={}; state.documentCache={}; state.tenantAccess=[];
    closeModal();
    state.view='dashboard';
    render();
    showToast('Dados apagados.', 'success');
  }catch(e){ console.error(e); showToast('Erro ao apagar. Tente novamente.', 'error'); }
}

/* ---------- render principal ---------- */
function render(){
  const app = document.getElementById('app');
  if(state.vitrinePublicMode){app.innerHTML=renderVitrinePublicaPage();return;}
  if(state.publicMode){app.innerHTML=renderPublicListingsPage();return;}
  if(state.recovery){ app.innerHTML = renderRecoveryScreen(); return; }
  if(!state.session){ app.innerHTML = renderAuthScreen(); return; }
  if(state.loading){ app.innerHTML='<div class="app-loading">'+logoSvg()+'<span>Carregando seus dados…</span></div>'; return; }
  if(state.role==='tenant'){ app.innerHTML=renderTenantPortal(); return; }
  if(state.role==='pending'){ app.innerHTML=renderPendingAccess(); return; }
  if(state.role==='owner' && !commercialAccessAllowed(state.commercialAccess)){
    app.innerHTML=renderCommercialBlocked(); return;
  }
  if(state.role==='owner' && state.commercialAccess && !state.commercialAccess.termosAceitos){
    app.innerHTML=renderTermsGate();return;
  }
  if(nenhumModulo()){ app.innerHTML=renderSemModulo(); return; }
  /* Se a pessoa está numa área de um módulo que ela não tem
     (link antigo, favorito, troca de plano), volta para o dela. */
  const areaAlugueis=['dashboard','casas','inquilinos','interessados','energia',
    'financeiro','calendario','houseDetail'].includes(state.view);
  if(areaAlugueis && !temModulo('alugueis')) state.view=viewInicial();
  if(state.view==='minhaCasa' && !temModulo('minhaCasa')) state.view=viewInicial();
  if(state.view==='vitrine' && !temModulo('vitrine')) state.view=viewInicial();

  const isMyHome=state.view==='minhaCasa';
  const isVitrine=state.view==='vitrine';
  const viewHtml=(state.view==='casas' ? renderCasasView() :
    state.view==='inquilinos' ? renderInquilinosView() :
    state.view==='interessados' ? renderInterestsView() :
    state.view==='energia' ? renderEnergiaView() :
    state.view==='financeiro' ? renderFinanceiroView() :
    state.view==='calendario' ? renderCalendario() :
    state.view==='commercial' ? renderCommercialView() :
    state.view==='minhaCasa' ? MinhaCasaUI.enter() :
    state.view==='vitrine' ? (typeof renderVitrineView==='function'?renderVitrineView():'') :
    state.view==='houseDetail' ? renderHouseDetail() :
    renderDashboard());
  app.innerHTML =
    '<div class="app-shell rental-shell '+(isSimpleMode()?'mode-simple':'mode-advanced')+(state.offlineMode?' is-offline':'')+'">'+
      renderTopBar()+
      '<main class="main'+(isMyHome?' minha-casa-main':'')+'">'+
        (isMyHome
          ? renderOfflineBanner()+viewHtml
          : '<div class="rental-app">'+renderOfflineBanner()+renderRentalNavigation()+
            (isVitrine?'':renderOnboardingBanner()+renderExternalBackupReminder())+viewHtml+'</div>')+
      '</main>'+
      (isMyHome?'':renderMobileNav())+
    '</div>';
  if(!state.loading && state.session){
    if(state.view==='casas' && typeof aplicarFiltroCasas==='function') aplicarFiltroCasas();
    if(state.view==='inquilinos' && typeof aplicarFiltroInq==='function') aplicarFiltroInq();
    if(typeof fitStatValues==='function') fitStatValues();
  }
}

/* ---------- boot / sessão ---------- */
async function boot(){
  const params=new URLSearchParams(location.search);
  /* Vitrine pública: sem login, sem sessão, sem carregar nada do app. */
  const vitrineSlug=(params.get('vitrine')||'').trim();
  if(vitrineSlug && typeof bootVitrinePublica==='function'){
    await bootVitrinePublica(vitrineSlug);
    return;
  }
  const publicSlug=(params.get('anuncios')||'').trim();
  if(publicSlug){
    state.publicMode=true;
    if(!state.publicLoaded){
      state.loading=true;render();
      try{state.publicListings=await db.loadPublicListings(publicSlug);state.publicLoaded=true;
        if(state.publicListings&&state.publicListings.perfil)applyAppTheme(state.publicListings.perfil.tema);}
      catch(e){console.error(e);state.publicListings={perfil:null,imoveis:[]};}
      state.loading=false;
    }
    render();return;
  }
  const { data:{ session } } = await sb.auth.getSession();
  state.session = session;
  if(!session){ state.loaded=false; applyAppTheme('original'); render(); return; }
  if(!state.loaded){ await loadData(); }
  else { render(); }
}
async function loadData(){
  state.loading = true; render();
  try{
    const profile=await db.loadRole();
    if(!authAccessType){
      const metadataType=state.session&&state.session.user&&state.session.user.user_metadata
        ? state.session.user.user_metadata.account_type : '';
      saveAuthAccessType(profile.role==='tenant'?'tenant':profile.role==='owner'?'admin':metadataType);
    }
    if(!authAccessMatchesProfile(profile)){
      const mismatchMessage=authAccessMismatchMessage();
      await sb.auth.signOut();
      state.session=null;state.loaded=false;state.loading=false;state.role=null;
      render();showToast(mismatchMessage,'error');return;
    }
    state.role=profile.role; state.access=profile.access||null;
    state.ownerProfile=profile.owner||null;state.staffProfile=profile.staff||null;
    state.commercialAccess=profile.commercial||null;
    state.isPlatformAdmin=!!(profile.commercial&&profile.commercial.administradorPlataforma);
    state.isPrimaryOwner=profile.role==='owner'&&!profile.staff;
    state.offlineMode=false;state.offlineSavedAt='';
    if(profile.role!=='owner'){
      const nonOwnerUid=await _authUserId();
      offlineCache.remove(nonOwnerUid).catch(function(){});
    }
    if(profile.role==='owner'){
      if(commercialAccessAllowed(state.commercialAccess)&&state.commercialAccess.termosAceitos){
        const requests=[db.loadAll(),db.listTenantAccess()];
        let teamIndex=-1,commercialIndex=-1;
        if(state.isPrimaryOwner){teamIndex=requests.length;requests.push(db.listTeam());}
        if(state.isPlatformAdmin){
          commercialIndex=requests.length;
          requests.push(db.loadCommercialDashboard().catch(function(error){
            // A área comercial é auxiliar. Uma falha nela nunca pode esconder
            // casas, inquilinos e pagamentos que já foram carregados.
            console.error('Erro ao carregar área comercial',error);
            return null;
          }));
        }
        const loaded=await Promise.all(requests);
        const data=loaded[0];
        state.houses=data.houses; state.tenants=data.tenants; state.interests=data.interests||[]; state.config=data.config;
        applyAppTheme(state.config.tema);
        state.eventos=data.eventos||[]; state.tenantAccess=loaded[1]||[];
        state.team=teamIndex>=0?(loaded[teamIndex]||[]):[];
        if(commercialIndex>=0 && loaded[commercialIndex]){
          state.commercialAccounts=loaded[commercialIndex].accounts||[];
          state.commercialInvites=loaded[commercialIndex].invites||[];
          state.platformAdmins=loaded[commercialIndex].admins||[];
          state.commercialAudit=loaded[commercialIndex].audit||[];
          state.commercialLicenses=loaded[commercialIndex].licenses||[];
        }
        state.photoCache={}; state.documentCache={};
        const authUid=await _authUserId();
        offlineCache.save(authUid,{profile:profile,data:data,tenantAccess:state.tenantAccess,team:state.team}).catch(function(err){console.warn('Cache offline não foi salvo:',err);});
      }else{
        state.houses=[];state.tenants=[];state.interests=[];state.eventos=[];state.tenantAccess=[];state.team=[];
      }
    }else if(profile.role==='tenant'){
      const portal=await db.loadTenantPortal(profile.access);
      state.houses=portal.houses; state.tenants=portal.tenants; state.config=portal.config;
      applyAppTheme(state.config.tema);
      state.portalDocuments=portal.documents||[];
    }else{
      state.houses=[]; state.tenants=[]; state.interests=[]; state.portalDocuments=[];
    }
    state.loaded = true;
  }catch(e){
    console.error('Erro ao carregar', e);
    try{
      const authUid=await _authUserId(),cached=await offlineCache.load(authUid);
      const networkFailure=(typeof navigator!=='undefined'&&navigator.onLine===false)||
        /fetch|network|conex[aã]o|offline/i.test(String(e&&e.message||''));
      if((e&&e.code==='ROLE_CONFLICT')||!networkFailure){
        await offlineCache.remove(authUid).catch(function(){});
        state.role='pending';state.access=null;state.loaded=true;
        showToast((e&&e.message)||'O acesso foi bloqueado para proteger seus dados.', 'error');
        state.loading=false;render();return;
      }
      const metadataType=state.session&&state.session.user&&state.session.user.user_metadata
        ? String(state.session.user.user_metadata.account_type||'').toLowerCase() : '';
      if(metadataType==='tenant'){
        await offlineCache.remove(authUid).catch(function(){});
        state.role='pending';state.access=null;state.loaded=true;
        showToast('NÃ£o foi possÃ­vel abrir o portal sem confirmar seu acesso pela internet.', 'error');
      }else if(cached&&cached.payload&&cached.payload.profile&&cached.payload.profile.role==='owner'){
        const payload=cached.payload,profile=payload.profile,data=payload.data||{};
        state.role='owner';state.access=null;state.ownerProfile=profile.owner||null;state.staffProfile=profile.staff||null;
        state.commercialAccess=profile.commercial||null;state.isPlatformAdmin=false;state.isPrimaryOwner=!profile.staff;
        state.houses=data.houses||[];state.tenants=data.tenants||[];state.interests=data.interests||[];state.eventos=data.eventos||[];
        state.config=data.config||state.config;state.tenantAccess=payload.tenantAccess||[];state.team=payload.team||[];
        state.offlineMode=true;state.offlineSavedAt=cached.savedAt||'';state.loaded=true;applyAppTheme(state.config.tema);
        showToast('Sem internet. Abrimos a última cópia salva para consulta.','success');
      }else showToast('Não foi possível carregar seus dados. Verifique a conexão.', 'error');
    }catch(cacheError){console.warn(cacheError);showToast('Não foi possível carregar seus dados. Verifique a conexão.', 'error');}
  }
  state.loading = false;
  /* Quem não comprou Aluguéis não pode cair no painel de aluguéis. */
  if(state.role==='owner' && state.loaded && state.view==='dashboard'){
    state.view = viewInicial();
  }
  render();
  if(state.view==='minhaCasa' && typeof loadMinhaCasaData==='function') loadMinhaCasaData();
  if(state.view==='vitrine' && typeof loadVitrineData==='function') loadVitrineData();
  // cria o backup automático do dia, sem travar a interface
  if(state.loaded && !state.offlineMode && state.role==='owner' && temModulo('alugueis') && commercialAccessAllowed(state.commercialAccess)){ ensureDailySnapshot(); }
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
  else if(!session && had){
    state.loaded=false;_actingOwnerId=null;saveAuthAccessType(null);authView='login';
    if(typeof resetMinhaCasaUI==='function') resetMinhaCasaUI();
    render();
  }
});

window.addEventListener('online',function(){if(state.offlineMode){state.loaded=false;loadData();}});

boot();
