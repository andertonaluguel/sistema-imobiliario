/* ============================================================
   app.js — Núcleo da aplicação
   - Estado em memória
   - Gate de autenticação (nada renderiza sem login)
   - Roteamento e renderização (despacha para os módulos)
   ============================================================ */

const UI_MODE_KEY = 'aluguel-ui-mode-v1';
const RENTAL_SIDEBAR_KEY = 'aluguel-sidebar-collapsed-v1';

function loadUiMode(){
  try{ return localStorage.getItem(UI_MODE_KEY)==='simple' ? 'simple' : 'advanced'; }
  catch(e){ return 'advanced'; }
}
function isSimpleMode(){ return state.uiMode==='simple'; }
function loadRentalSidebarCollapsed(){
  try{
    const v=localStorage.getItem(RENTAL_SIDEBAR_KEY);
    /* Sem preferência salva neste aparelho: em telas intermediárias
       (tablet / notebook estreito) a barra começa recolhida para dar
       espaço ao conteúdo; acima disso, começa expandida. No celular ela
       nem aparece. A escolha do usuário, uma vez feita, sempre vence. */
    if(v===null) return (typeof window!=='undefined' && window.innerWidth>0 && window.innerWidth<=1100);
    return v==='true';
  }
  catch(e){ return false; }
}
/* Assinatura da casca. Enquanto ela não muda (mesmo app, mesmo modo,
   mesma barra), a navegação troca só o conteúdo central — a barra
   lateral e o cabeçalho não são recriados. É isso que elimina o piscar
   ao navegar entre páginas. */
let _shellSignature=null;

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
  /* null = ainda não perguntamos ao banco; [] = perguntamos e não há
     ninguém para este inquilino avaliar. A diferença importa: sem ela o
     portal repetiria a consulta a cada render. */
  portalResponsaveis: null,
  portalNotaRascunho: {},
  /* Formulário da página Anunciar: {caminho, enviado}. */
  vitrineParceiroModal: null,
  vitrineFiltros: {busca:'',tipo:'',quartos:0,banheiros:0,suites:0,vagas:0,conservacao:'',
    faixa:'',precoMin:'',precoMax:'',areaMin:'',areaMax:'',bairro:'',responsavelId:'',categoria:'',ordem:'destaque',extras:[]},
  vitrine: {anunciantes:[],imoveis:[],leads:[],taxas:[],cidades:[],carregado:false},
  /* Página pública da Vitrine: cidade escolhida e aba alugar/vender. */
  vitrinePubCidade: '',
  vitrinePubFinalidade: 'alugar',
  /* Quantos cartões estão na tela e qual foto está aberta em tela cheia.
     A lista inteira de uma vez pesava dezenas de MB no 4G do interior. */
  vitrinePubLimite: 12,
  /* Visualizacao da busca publica. O mapa continua sob demanda: escolher
     Cards ou Lista nao baixa nenhum ladrilho nem inicia o Leaflet. */
  vitrinePubModo: 'cards',
  /* Preferencias locais da busca publica. Favoritos e comparacao ficam no
     aparelho do visitante ate a etapa de conta/CRM; a gaveta e a tabela sao
     apenas estado de interface. */
  vitrineFavoritos: [],
  vitrineComparacao: [],
  vitrineComparacaoAberta: false,
  vitrineComparacaoSoDiferencas: false,
  vitrineFiltrosMobile: false,
  vitrineScrollLista: 0,
  vitrineBuscaModal: false,
  vitrineBuscasSalvas: [],
  vitrineRecentes: [],
  vitrineAlertaModal: null,
  vitrineVisitaModal: null,
  vitrineVisitasLocais: [],
  vitrineLightbox: null,
  vitrineMapaAtivo: false,
  vitrineFotos: {},
  vitrineTab: 'painel',
  crmBusca: '',
  crmResponsavel: '',
  crmOrigem: '',
  crmDetalheId: '',
  crmQualidadePeriodo: 7,
  offlineMode: false,
  offlineSavedAt: '',
  uiMode: loadUiMode(),
  houses: [],
  tenants: [],
  interests: [],
  /* Donos dos imóveis administrados. Vazio numa carteira própria. */
  owners: [],
  ownerSearch: '',
  /* Histórico de alterações: carregado sob demanda, não no login. */
  auditLog: null,
  auditFilter: '',
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
  alertsExpanded: true,
  movsExpanded: true,
  /* Preferência local: cada computador mantém sua própria largura
     de navegação, sem alterar a conta nem a experiência no celular. */
  rentalSidebarCollapsed: loadRentalSidebarCollapsed(),
  reportListExpanded: true,
  relatorioAno: new Date().getFullYear(),
  financeMonth: currentMonthStr(),
  energiaMes: currentMonthStr(),
  expandedReportHouseId: null,
  calMes: currentMonthStr(),
  casaBusca: '', casaFiltro: 'todas',
  /* ordem: 'nome' | 'vencimento' | 'valor' | 'situacao'
     visao:  'cartoes' | 'lista'  — com 30 casas o cartão inviabiliza */
  casaOrdem: 'atencao', casaVisao: 'cartoes', inqVisao: 'cartoes',
  inqBusca: '', inqFiltro: 'todos',
  /* Central de Pendências: os filtros são de tela, não de banco —
     a lista inteira é calculada a cada render. */
  pendFiltros: {tipo:'',prioridade:'',imovel:'',situacao:''},
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

function configuredSupportEmail(){
  const email=String((typeof CONFIG!=='undefined'&&CONFIG.SUPPORT_EMAIL)||'').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:'';
}
function supportContactButton(label){
  const email=configuredSupportEmail();
  return email?'<a class="btn btn-primary" href="mailto:'+esc(email)+'?subject='+encodeURIComponent('Suporte '+CONFIG.APP_NAME)+'">'+esc(label||'Falar com o suporte')+'</a>':'';
}
function termsContent(){
  const supportEmail=configuredSupportEmail();
  const privacyContact=supportEmail
    ? 'Solicitações de acesso, correção, exportação ou exclusão podem ser enviadas para <a href="mailto:'+esc(supportEmail)+'">'+esc(supportEmail)+'</a>.'
    : 'Solicitações de acesso, correção, exportação ou exclusão devem ser feitas pelo canal de contato oficialmente disponibilizado pelo responsável da plataforma.';
  return '<div class="legal-copy"><h4>Termos de Uso</h4><p>O '+esc(CONFIG.APP_NAME)+' auxilia na organização de imóveis, contratos, cobranças e arquivos. O proprietário é responsável pela veracidade das informações cadastradas e por possuir autorização para tratar os dados de inquilinos e interessados.</p>'+ 
    '<p>O plano Gratuito permite 1 casa, o Básico permite 3 casas e o Premium permite 100 casas. Fotos e documentos também respeitam o limite de armazenamento do plano.</p>'+ 
    '<p>Contas podem ser suspensas em caso de fraude, uso abusivo ou violação destes termos. Antes de encerrar o uso, o cliente pode exportar seus dados pelo menu de backup.</p>'+ 
    '<h4>Aviso de Privacidade</h4><p>São armazenados os dados que o usuário inserir, como contatos, documentos, contratos, pagamentos e arquivos. Eles são usados somente para oferecer as funções da plataforma, suporte, segurança e recuperação.</p>'+ 
    '<p>Cada proprietário atua como responsável pelos dados das pessoas que cadastrar. '+privacyContact+'</p>'+
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
  const hasSupport=!!configuredSupportEmail();
  openModal('<h3 class="modal-title">'+(hasSupport?'Ajuda, termos e suporte':'Ajuda e termos')+'</h3><p class="modal-text">Plano atual: <strong>'+esc(plan||'—')+'</strong>. Versão '+esc(CONFIG.APP_VERSION)+'.</p>'+
    '<div class="help-steps"><strong>Primeiros passos</strong><span>1. Preencha seus dados em Configurações.</span><span>2. Cadastre a primeira casa.</span><span>3. Cadastre o inquilino e inicie o contrato.</span><span>4. Registre pagamentos e exporte um backup.</span></div>'+termsContent()+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="openMenuModal()">Voltar ao menu</button><div class="modal-actions-right"><button class="btn btn-ghost" onclick="closeModal()">Fechar</button>'+supportContactButton('Enviar e-mail ao suporte')+'</div></div>');
}

function openAccountModal(){
  const email=state.session&&state.session.user?state.session.user.email:'';
  const fixedMaster=Array.isArray(CONFIG.MASTER_EMAILS)&&CONFIG.MASTER_EMAILS.includes(String(email||'').toLowerCase());
  if(fixedMaster){
    openModal('<h3 class="modal-title">Minha conta Mestre</h3>'+
      '<div class="notice-box"><strong>E-mail protegido</strong><br>Esta conta Mestre usa o e-mail <strong>'+esc(email)+'</strong> como identidade de segurança. Ele não pode ser alterado pelo aplicativo.</div>'+
      '<p class="modal-text">Você ainda pode trocar sua senha normalmente.</p>'+
      '<button class="btn btn-ghost" onclick="openLoggedPasswordModal()">Alterar minha senha</button>'+
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="openMenuModal()">Voltar ao menu</button><button class="btn btn-primary" onclick="closeModal()">Fechar</button></div>');
    return;
  }
  openModal('<h3 class="modal-title">Minha conta</h3><p class="modal-text">Ao trocar o e-mail, você receberá uma confirmação no endereço novo.</p>'+ 
    '<label class="field"><span>Novo e-mail</span><input id="account_email" type="email" value="'+esc(email)+'"></label>'+ 
    '<button class="btn btn-ghost" onclick="openLoggedPasswordModal()">Alterar minha senha</button>'+ 
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="openMenuModal()">Voltar ao menu</button><div class="modal-actions-right"><button class="btn btn-ghost" onclick="closeModal()">Fechar</button><button class="btn btn-primary" onclick="saveAccountEmail()">Alterar e-mail</button></div></div>');
}
async function saveAccountEmail(){
  const currentEmail=state.session&&state.session.user?String(state.session.user.email||'').toLowerCase():'';
  if(Array.isArray(CONFIG.MASTER_EMAILS)&&CONFIG.MASTER_EMAILS.includes(currentEmail)){
    showToast('O e-mail da conta Mestre é protegido e não pode ser alterado.','error');
    return;
  }
  const email=((document.getElementById('account_email')||{}).value||'').trim().toLowerCase();
  if(!email||!emailValido(email)){showToast('Informe um e-mail válido.','error');return;}
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
function irPendencias(){ state.view='pendencias'; render(); }
function irManutencoes(){ state.view='manutencoes'; render(); }
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
      ['casas','Imóveis','irCasas()','&#9638;']
    ];
  }
  return [
    ['dashboard','Resumo','irHome()','&#8962;'],
    ['pendencias','Pendências','irPendencias()','&#9873;'],
    ['casas','Imóveis','irCasas()','&#9638;'],
    ['proprietarios','Proprietários','irProprietarios()','&#8962;'],
    ['inquilinos','Inquilinos','irInquilinos()','&#9786;'],
    ['interessados','Interessados','irInteressados()','&#9825;'],
    ['manutencoes','Manutenções','irManutencoes()','&#9874;']
  ].concat(energyModuleEnabled()?[['energia','Energia','irEnergia()','&#9889;']]:[])
    .concat([
      ['financeiro','Financeiro','irFinanceiro()','R$'],
      ['calendario','Agenda','irCalendario()','&#9633;']
    ]);
}
function rentalNavActive(view){
  return state.view===view||(view==='casas'&&state.view==='houseDetail');
}
function rentalViewActive(){
  return ['dashboard','pendencias','manutencoes','casas','inquilinos','interessados','energia',
    'financeiro','calendario','houseDetail'].includes(state.view);
}
function rentalNavOccupancy(){
  const total=state.houses.length;
  const ocupadas=state.houses.filter(function(h){ return h.status==='alugada'; }).length;
  return {total:total,ocupadas:ocupadas,pct:total?Math.round((ocupadas/total)*100):0};
}
function toggleRentalSidebar(){
  state.rentalSidebarCollapsed=!state.rentalSidebarCollapsed;
  try{ localStorage.setItem(RENTAL_SIDEBAR_KEY,String(state.rentalSidebarCollapsed)); }catch(e){}
  /* Recolhe/expande no lugar, com transição de largura (sem recriar a
     barra). Só cai no render completo se a barra ainda não existe. */
  const bar=document.querySelector('.app-sidebar');
  if(bar){
    bar.classList.toggle('is-collapsed',state.rentalSidebarCollapsed);
    const tg=bar.querySelector('.app-sidebar-toggle');
    if(tg){
      tg.setAttribute('aria-expanded',state.rentalSidebarCollapsed?'false':'true');
      tg.setAttribute('aria-label',state.rentalSidebarCollapsed?'Expandir menu lateral':'Recolher menu lateral');
      tg.setAttribute('title',state.rentalSidebarCollapsed?'Expandir menu':'Recolher menu');
      tg.focus();
    }
    _shellSignature=shellSignature();
  } else {
    render();
  }
}
/* ============================================================
   Casca estrutural.
   - Barra lateral fixa, altura total: grupo "Aplicativos", páginas do
     app ativo, ocupação (só Aluguéis) e perfil no rodapé.
   - Cabeçalho enxuto, só com a busca geral.
   A barra é montada uma vez; ao navegar, só o conteúdo central muda.
   ============================================================ */
function currentAppKey(){
  if(state.view==='minhaCasa') return 'minhaCasa';
  if(state.view==='vitrine')   return 'vitrine';
  if(state.view==='commercial')return 'comercial';
  return 'alugueis';
}
function appDisplayName(key){
  return key==='minhaCasa'?'Minha Casa'
    :key==='vitrine'?'Vitrine'
    :key==='comercial'?'Comercial'
    :'Aluguéis';
}
/* Só os aplicativos que a conta pode acessar. Comercial é o balcão da
   plataforma e só aparece para o administrador. */
function sidebarAppItems(){
  const m=modulosDaConta();
  const items=[];
  if(m.alugueis)  items.push(['alugueis','Aluguéis','irHome()','&#9638;']);
  if(m.minhaCasa) items.push(['minhaCasa','Minha Casa','irMinhaCasa()','⌂']);
  if(m.vitrine)   items.push(['vitrine','Vitrine','irVitrine()','&#9788;']);
  if(state.isPlatformAdmin) items.push(['comercial','Comercial','irClientes()','&#9670;']);
  return items;
}
/* Páginas do app ativo. Só páginas reais (Pendências e Manutenções
   entrarão quando suas telas existirem, na Parte 3). */
function sidebarPageGroup(appKey){
  if(appKey==='alugueis'){
    return { label:'Aluguéis', items:rentalNavItems().map(function(it){
      return [it[0],it[1],it[2],it[3],rentalNavActive(it[0])];
    }) };
  }
  if(appKey==='minhaCasa'){
    const tab=(window.MinhaCasaUI&&MinhaCasaUI.currentTab)?MinhaCasaUI.currentTab():'dashboard';
    const pend=(window.MinhaCasaUI&&MinhaCasaUI.pendingCount)?MinhaCasaUI.pendingCount():0;
    return { label:'Minha Casa', items:[
      ['dashboard','Resumo',"MinhaCasaUI.selectTab('dashboard')",'◫',tab==='dashboard'],
      ['history','Histórico',"MinhaCasaUI.selectTab('history')",'≡',tab==='history'],
      ['pending','A confirmar',"MinhaCasaUI.selectTab('pending')",'✓',tab==='pending',pend||''],
      ['recurring','Contas fixas',"MinhaCasaUI.selectTab('recurring')",'↻',tab==='recurring'],
      ['organize','Organizar',"MinhaCasaUI.selectTab('organize')",'⚙',tab==='organize']
    ] };
  }
  if(appKey==='comercial'){
    return { label:'Comercial', items:[
      ['commercial','Visão Comercial','irClientes()','&#9670;',true]
    ] };
  }
  /* A Vitrine tem doze áreas. Em abas horizontais elas quebravam em
     duas linhas e empurravam o conteúdo para baixo; na barra lateral
     cabem inteiras, com o mesmo desenho das outras áreas do app. */
  if(appKey==='vitrine'&&typeof vitrineNavItems==='function'){
    return { label:'Vitrine', items:vitrineNavItems() };
  }
  return { label:appDisplayName(appKey), items:[] };
}
function sidebarNavButton(item,active,kind){
  const label=item[1];
  const badge=item[5]?'<span class="app-nav-badge">'+esc(String(item[5]))+'</span>':'';
  return '<button class="app-nav-item'+(kind==='app'?' is-app':'')+(active?' active':'')+'"'+(active?' aria-current="page"':'')+
    ' onclick="'+item[2]+'" data-label="'+esc(label)+'" title="'+esc(label)+'">'+
    '<span class="app-nav-ico" aria-hidden="true">'+item[3]+'</span>'+
    '<b class="app-nav-label">'+esc(label)+'</b>'+badge+'</button>';
}
function profileInitials(name){
  const parts=String(name||'').trim().split(/\s+/).filter(Boolean);
  if(!parts.length) return '·';
  if(parts.length===1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0].charAt(0)+parts[parts.length-1].charAt(0)).toUpperCase();
}
function renderSidebarProfile(){
  const email=state.session&&state.session.user?state.session.user.email:'';
  const name=(state.staffProfile&&state.staffProfile.nome)||(state.ownerProfile&&state.ownerProfile.nome)||
    (state.config&&state.config.locadorNome)||email||'Conta';
  /* A marca que a conta já enviou para a Vitrine vira o avatar aqui.
     Quem subiu a logo fez isso para ser reconhecido — mostrar as
     iniciais ao lado do próprio nome, tendo a marca guardada, é
     desperdiçar o que ele já deu. Sem logo, seguem as iniciais. */
  const caminho=(state.ownerProfile&&state.ownerProfile.logo_path)||'';
  /* Mesma rota que a vitrine pública usa para servir a logo: o arquivo
     mora num bucket privado e sai pela função og-foto. */
  const marca=caminho?location.origin+'/og-foto?p='+encodeURIComponent(caminho):'';
  return '<button class="app-sidebar-profile" onclick="openMenuModal()" aria-label="Perfil e opções da conta" title="Perfil e opções da conta">'+
    (marca
      ? '<img class="app-sidebar-avatar is-marca" src="'+esc(marca)+'" alt="" '+
        'onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),'+
        '{className:\'app-sidebar-avatar\',textContent:'+JSON.stringify(profileInitials(name))+'}))">'
      : '<span class="app-sidebar-avatar" aria-hidden="true">'+esc(profileInitials(name))+'</span>')+
    '<span class="app-sidebar-profile-copy"><strong>'+esc(name)+'</strong><small>'+esc(currentAccountTypeLabel())+'</small></span>'+
  '</button>';
}
function renderSidebarOccupancy(){
  const o=rentalNavOccupancy();
  if(!o.total) return '';
  return '<div class="rental-sidebar-occupancy" role="status" aria-label="Ocupação atual: '+o.ocupadas+
    ' de '+o.total+' imóveis, '+o.pct+' por cento">'+
    '<span class="rental-sidebar-occupancy-ring" style="--occupancy:'+o.pct+'%"><b>'+o.pct+'%</b></span>'+
    '<span class="rental-sidebar-occupancy-copy"><strong>Ocupação agora</strong><small>'+
      o.ocupadas+' de '+o.total+' imóveis</small></span>'+
  '</div>';
}
function renderAppSidebar(){
  const collapsed=!!state.rentalSidebarCollapsed;
  const appKey=currentAppKey();
  const apps=sidebarAppItems();
  const pages=sidebarPageGroup(appKey);
  const appsGroup=apps.length?'<div class="app-nav-group is-apps"><span class="app-nav-kicker">Aplicativos</span>'+
    apps.map(function(a){return sidebarNavButton(a,appKey===a[0],'app');}).join('')+'</div>':'';
  const pagesGroup=pages.items.length?'<div class="app-nav-group"><span class="app-nav-kicker">'+esc(pages.label)+'</span>'+
    pages.items.map(function(it){return sidebarNavButton(it,!!it[4],'page');}).join('')+'</div>':'';
  return '<aside class="app-sidebar'+(collapsed?' is-collapsed':'')+'" aria-label="Navegação principal">'+
    '<button class="app-sidebar-logo" onclick="irHome()" aria-label="Início">'+logoSvg()+
      '<b class="app-sidebar-logoname">'+esc((typeof CONFIG!=='undefined'&&CONFIG.APP_NAME)||'Aluguel')+'</b></button>'+
    '<div class="app-sidebar-scroll">'+appsGroup+pagesGroup+'</div>'+
    '<div class="app-sidebar-foot">'+
      (appKey==='alugueis'?renderSidebarOccupancy():'')+
      renderSidebarProfile()+
      '<button class="app-sidebar-toggle" onclick="toggleRentalSidebar()" aria-expanded="'+(collapsed?'false':'true')+
        '" aria-label="'+(collapsed?'Expandir menu lateral':'Recolher menu lateral')+'" title="'+(collapsed?'Expandir menu':'Recolher menu')+'">'+
        '<span class="app-sidebar-chev" aria-hidden="true">‹</span><b>Recolher</b></button>'+
    '</div>'+
  '</aside>';
}
function renderTopbarClean(){
  const appKey=currentAppKey();
  const search=(temModulo('alugueis')&&appKey==='alugueis')
    ? '<button class="top-search-btn" onclick="openGlobalSearch()" aria-label="Busca geral">Buscar</button>'
    : '';
  /* No celular não há barra lateral; um atalho para os aplicativos e
     demais áreas fica no cabeçalho dos apps que não têm barra inferior. */
  const apps=appKey!=='alugueis'
    ? '<button class="topbar-apps" onclick="openMoreAreasMenu()" aria-label="Aplicativos e mais áreas">Aplicativos</button>'
    : '';
  return '<header class="topbar app-topbar">'+
    '<span class="topbar-gap" aria-hidden="true"></span>'+
    search+apps+
  '</header>';
}
/* Atualiza o destaque da navegação e a ocupação no lugar, sem recriar a
   barra — usado quando só o conteúdo central muda. */
function updateSidebarChrome(){
  const bar=document.querySelector('.app-sidebar');
  if(!bar) return;
  const appKey=currentAppKey();
  const wanted=sidebarAppItems().map(function(a){return appKey===a[0];})
    .concat(sidebarPageGroup(appKey).items.map(function(it){return !!it[4];}));
  const btns=bar.querySelectorAll('.app-nav-item');
  btns.forEach(function(btn,i){
    const on=!!wanted[i];
    btn.classList.toggle('active',on);
    if(on) btn.setAttribute('aria-current','page'); else btn.removeAttribute('aria-current');
  });
  const foot=bar.querySelector('.app-sidebar-foot');
  if(foot){
    const current=foot.querySelector('.rental-sidebar-occupancy');
    const html=appKey==='alugueis'?renderSidebarOccupancy():'';
    if(current) current.outerHTML=html;
    else if(html) foot.insertAdjacentHTML('afterbegin',html);
  }
}

/* A barra do celular é montada dentro da casca. Quando a casca é
   reaproveitada — que é o caso de toda navegação entre páginas do mesmo
   app — ela não é recriada, e o destaque ficava congelado na aba em que a
   casca nasceu: no celular o marcador não saía de "Resumo".
   O updateSidebarChrome acima resolve isso para a barra lateral; esta faz
   o mesmo pela do celular. Reaproveita o próprio renderMobileNav em vez de
   repetir a regra de "qual item está ativo", que também decide quando a
   barra deve sumir (ela não aparece em Proprietários, por exemplo). */
function updateMobileNavChrome(){
  const shell=document.querySelector('.app-shell.main-shell');
  if(!shell) return;
  const atual=shell.querySelector('.mobile-nav');
  const html=renderMobileNav();
  if(atual){
    if(html) atual.outerHTML=html; else atual.remove();
  } else if(html){
    shell.insertAdjacentHTML('beforeend',html);
  }
}

/* Barra de abas que rola na horizontal (detalhe do imóvel, Minha Casa).
   Ao trocar de aba o conteúdo é re-renderizado e a barra nasce de novo com
   scrollLeft zerado: quem tinha rolado até "Documentos" tocava nela, a
   faixa voltava para o começo e a aba escolhida sumia de vista — parecia
   que o toque não tinha funcionado. Aqui a aba ativa volta para o campo de
   visão, centralizada, mexendo só na rolagem da faixa e nunca na da página. */
function manterAbaAtivaVisivel(){
  document.querySelectorAll('.tabs,.house-edit-tabs,.rent-tabs,.tabs-pill').forEach(function(barra){
    if(barra.scrollWidth<=barra.clientWidth+2) return;
    const ativa=barra.querySelector('.active');
    if(!ativa) return;
    barra.scrollLeft=Math.max(0,ativa.offsetLeft-(barra.clientWidth-ativa.offsetWidth)/2);
  });
}

/* Conta ativa que ainda não teve nenhum módulo liberado. Sem esta
   tela, a pessoa veria um aplicativo vazio e concluiria que quebrou. */
function renderSemModulo(){
  const hasSupport=!!configuredSupportEmail();
  return '<div class="commercial-gate"><div class="commercial-gate-card">'+logoSvg()+
    '<span class="eyebrow">ACESSO DA CONTA</span><h1>Nenhum módulo liberado</h1>'+
    '<p>Sua conta está ativa, mas ainda não tem nenhum módulo habilitado. '+
    (hasSupport
      ? 'Fale com o suporte para liberar Aluguéis, Minha Casa ou Vitrine.'
      : 'Peça ao administrador responsável pela plataforma para liberar um módulo.')+'</p>'+
    supportContactButton('Falar com o suporte')+
    '<button class="btn btn-ghost" onclick="doSignOut()">Sair da conta</button></div></div>';
}
function renderMobileNav(){
  if(!temModulo('alugueis')||
    !['dashboard','pendencias','manutencoes','casas','inquilinos','interessados','energia',
      'financeiro','calendario','houseDetail'].includes(state.view))return '';
  const items=isSimpleMode()
    ? [['dashboard','Resumo','irHome()','&#8962;'],['casas','Imóveis','irCasas()','&#9638;']]
    : [
      /* Rótulos curtos de propósito: a barra tem 5 colunas e num
         telefone de 320px cada uma fica com ~63px. "Inquilinos" e
         "Financeiro" não cabem no tamanho de texto legível (12px),
         e encolher a fonte é o que tornava a barra ilegível no sol.
         As telas de destino seguem com os nomes completos. */
      ['dashboard','Resumo','irHome()','&#8962;'],
      ['casas','Imóveis','irCasas()','&#9638;'],
      ['inquilinos','Pessoas','irInquilinos()','&#9786;'],
      ['financeiro','Dinheiro','irFinanceiro()','R$'],
      ['mais','Mais','openMoreAreasMenu()','&#8943;']
    ];
  return '<nav class="mobile-nav'+(isSimpleMode()?' simple-mobile-nav':'')+
    '" aria-label="Navegação dos aluguéis no celular" style="--mobile-items:'+items.length+'">'+items.map(function(i){
    const active=i[0]==='mais'
      ? ['interessados','energia','calendario','commercial','proprietarios'].includes(state.view)
      : rentalNavActive(i[0]);
    return '<button class="mobile-nav-item'+(active?' active':'')+'"'+(active?' aria-current="page"':'')+' onclick="'+i[2]+'"><i aria-hidden="true">'+i[3]+'</i><span>'+esc(i[1])+'</span></button>';
  }).join('')+'</nav>';
}
function openMoreAreasMenu(){
  const appKey=currentAppKey();
  /* No celular este menu é também onde se troca de aplicativo. */
  const apps=[]
    .concat(temModulo('alugueis')?[['Aluguéis','Imóveis, contratos e cobranças','closeModal();irHome()','&#9638;']]:[])
    .concat(temModulo('minhaCasa')?[['Minha Casa','Controle financeiro familiar','closeModal();irMinhaCasa()','⌂']]:[])
    .concat(temModulo('vitrine')?[['Vitrine','Catálogo público de imóveis de terceiros','closeModal();irVitrine()','&#9788;']]:[])
    .concat(state.isPlatformAdmin?[['Comercial','Área Comercial da plataforma','closeModal();irClientes()','&#9670;']]:[]);
  /* As áreas de Aluguéis só aparecem quando o app ativo é o de Aluguéis. */
  const areas=appKey!=='alugueis'?[]:[
    ['Pendências','O que exige ação agora','closeModal();irPendencias()','&#9873;'],
    ['Proprietários','Donos dos imóveis administrados','closeModal();irProprietarios()','&#8962;'],
    ['Manutenções','Serviços dos imóveis, do pedido à conclusão','closeModal();irManutencoes()','&#9874;'],
    ['Interessados em alugar','Acompanhar pessoas procurando imóvel','closeModal();irInteressados()','&#9825;']
  ].concat(energyModuleEnabled()?[['Energia dos imóveis','Consumo, cobranças e recebimentos','closeModal();irEnergia()','&#9889;']]:[])
    .concat([
      ['Agenda','Vencimentos e lembretes','closeModal();irCalendario()','&#9633;'],
      ['Busca geral','Encontrar imóvel, inquilino ou interessado','closeModal();openGlobalSearch()','&#8981;']
    ]);
  function grid(list){
    return '<div class="rent-more-grid">'+list.map(function(item){
      return '<button onclick="'+item[2]+'"><span aria-hidden="true">'+item[3]+'</span><strong>'+item[0]+'</strong><small>'+item[1]+'</small></button>';
    }).join('')+'</div>';
  }
  openModal('<h3 class="modal-title">Mais áreas</h3>'+
    (apps.length>1?'<div class="form-section-title">Aplicativos</div>'+grid(apps):'')+
    (areas.length?'<div class="form-section-title">Áreas de Aluguéis</div>'+grid(areas):'')+
    (apps.length<=1&&!areas.length?'<p class="modal-text">Nenhuma área adicional disponível.</p>':''));
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
function teamRoleLabel(role){
  const labels={administrador:'Administrador',financeiro:'Financeiro',operacional:'Operacional',leitura:'Somente leitura'};
  return labels[String(role||'').toLowerCase()]||'Somente leitura';
}
function teamRoleDescription(role){
  const descriptions={
    administrador:'Gerencia a operação, as configurações e os backups. A equipe é exclusiva do proprietário principal.',
    financeiro:'Gerencia cobranças, recebimentos, despesas e relatórios.',
    operacional:'Gerencia imóveis, inquilinos, contratos e leituras, sem confirmar dinheiro.',
    leitura:'Consulta os dados, sem fazer alterações.'
  };
  return descriptions[String(role||'').toLowerCase()]||descriptions.leitura;
}
function currentAccountRoleKey(){
  if(state.isPlatformAdmin||state.isPrimaryOwner) return 'administrador';
  const staffRole=state.staffProfile&&String(state.staffProfile.papel||'').toLowerCase();
  if(['administrador','financeiro','operacional','leitura'].includes(staffRole)) return staffRole;
  /* Um papel ausente ou desconhecido falha fechado. O proprietário primário
     já foi reconhecido acima; qualquer outro perfil fica somente em consulta. */
  return state.role==='owner'&&!state.staffProfile?'administrador':'leitura';
}
function currentAccountTypeLabel(){
  if(state.isPlatformAdmin)return 'Mestre';
  if(state.staffProfile)return teamRoleLabel(currentAccountRoleKey());
  return 'Administrador';
}
function canAdministerAccount(){
  return currentAccountRoleKey()==='administrador';
}
function canManageFinance(){
  return ['administrador','financeiro'].includes(currentAccountRoleKey());
}
function canOperateProperties(){
  return ['administrador','operacional'].includes(currentAccountRoleKey());
}
function canViewSensitiveTenantData(){
  return canOperateProperties();
}
function maskSensitiveDocument(value){
  const raw=String(value||'').trim();
  if(!raw) return '';
  const digits=raw.replace(/\D/g,'');
  if(digits.length>=4) return '•••••••'+digits.slice(-4);
  return 'Documento protegido';
}
function requireAccountPermission(allowed,message){
  /* No modo de consulta offline não existe gravação — não há fila de
     sincronização. O banner avisa, mas os botões continuavam vivos: a
     pessoa tocava, esperava a chamada falhar e recebia um erro genérico
     ("Erro ao adicionar o imóvel") que não diz que o problema é a internet.
     Como todo require*Permission passa por aqui, um aviso claro neste ponto
     cobre as 132 guardas de ação do app. */
  if(state.offlineMode){
    showToast('Sem internet — modo de consulta. Esta ação precisa de conexão.','error');
    return false;
  }
  if(allowed) return true;
  showToast(message||'Sua função permite somente consultar estes dados.','error');
  return false;
}
function requireFinancePermission(){
  return requireAccountPermission(
    canManageFinance(),
    'Sua função não permite registrar ou alterar cobranças, recebimentos ou despesas.'
  );
}
function requirePropertyPermission(){
  return requireAccountPermission(
    canOperateProperties(),
    'Sua função não permite alterar imóveis, inquilinos, contratos, leituras ou manutenções.'
  );
}
function requirePrimaryOwnerPermission(message){
  return requireAccountPermission(
    !!state.isPrimaryOwner,
    message||'Somente o proprietário principal pode administrar a equipe.'
  );
}
function canRestoreArchivedEntity(entity){
  const normalized=String(entity||'').toLowerCase();
  if(normalized==='reajuste') return canAdministerAccount();
  if(['imovel','inquilino','contrato','energia'].includes(normalized)){
    return canOperateProperties();
  }
  if(['cobranca','recebimento','pagamento','despesa'].includes(normalized)){
    return canManageFinance();
  }
  return false;
}
function openMenuModal(){
  const email = state.session && state.session.user ? esc(state.session.user.email) : '';
  const accountType=currentAccountTypeLabel();
  const publicLinks=(state.isPrimaryOwner&&state.ownerProfile&&state.ownerProfile.slug_publico
      ?'<button class="btn btn-ghost" onclick="copyPublicLink()">Copiar link dos anúncios</button>':'')+
    (temModulo('vitrine')&&state.ownerProfile&&state.ownerProfile.slug_publico
      ?'<button class="btn btn-ghost" onclick="copyVitrineLink()">Copiar link da Vitrine</button>':'');
  const appDataButtons=canAdministerAccount()
    ?'<button class="btn btn-ghost" onclick="openConfigModal()">Configurações do app</button>'+
      (temModulo('alugueis')?'<button class="btn btn-ghost" onclick="openBackupCenterModal()">Backup</button>':'')+
      /* "Quem alterou isto?" é pergunta semanal quando há equipe. O
         registro já existia no banco, com autor e papel; faltava a tela. */
      (temModulo('alugueis')?'<button class="btn btn-ghost" onclick="openAuditModal()">Histórico de alterações</button>':'')
    :'';
  const archivedItemsButton=!canAdministerAccount()&&(canOperateProperties()||canManageFinance())&&temModulo('alugueis')
    ?'<button class="btn btn-ghost" onclick="openArchivedItemsModal()">Itens arquivados</button>'
    :'';
  const dataButtons=appDataButtons+archivedItemsButton;
  const advancedOptions=!isSimpleMode()&&dataButtons
    ?'<div class="form-section-title">Aplicativo e dados</div><div class="menu-list">'+dataButtons+'</div>'
    :'';
  const helpLabel=configuredSupportEmail()?'Ajuda, termos e suporte':'Ajuda e termos';
  const simpleModeDescription=canManageFinance()?'Ver e registrar pagamentos':'Consulta compacta dos imóveis';
  const modeSwitch='<div class="mode-switch-wrap"><span class="field-kicker">MODO DE USO NESTE APARELHO</span><div class="mode-switch">'+
    '<button class="'+(isSimpleMode()?'active':'')+'" onclick="setUiMode(\'simple\')"><strong>Simples</strong><small>'+simpleModeDescription+'</small></button>'+
    '<button class="'+(!isSimpleMode()?'active':'')+'" onclick="setUiMode(\'advanced\')"><strong>Avançado</strong><small>Todos os recursos</small></button></div></div>';
  openModal(
    '<h3 class="modal-title">Menu</h3>'+
    (email?'<p class="modal-text">Conectado como <strong>'+email+'</strong> · '+accountType+'</p>':'')+
    modeSwitch+
    '<div class="form-section-title">Tema de cores</div>'+renderUserThemeSwitch()+
    '<div class="form-section-title">Conta e acesso</div>'+
    '<div class="menu-list">'+
      '<button class="btn btn-ghost" onclick="openPlanModal()">Meu plano</button>'+
      '<button class="btn btn-ghost" onclick="openAccountModal()">Minha conta</button>'+
      (state.isPrimaryOwner&&!isSimpleMode()?'<button class="btn btn-ghost" onclick="openTeamModal()">Equipe</button>':'')+
    '</div>'+advancedOptions+
    (publicLinks?'<div class="form-section-title">Divulgação</div><div class="menu-list">'+publicLinks+'</div>':'')+
    '<div class="form-section-title">Ajuda e sessão</div><div class="menu-list">'+
      '<button class="btn btn-ghost" onclick="openHelpModal()">'+helpLabel+'</button>'+
      '<button class="btn btn-ghost" onclick="closeModal();doSignOut()">Sair da conta</button>'+
    '</div><p class="menu-version">'+esc(CONFIG.APP_NAME)+' · '+esc(CONFIG.APP_VERSION)+'</p>'
  );
}

/* Lista somente os módulos ativos da conta. Recursos indisponíveis não
   aparecem como uma comparação nem sugerem uma troca inexistente. */
function renderModulosDaConta(){
  const m=modulosDaConta(),active=(CONFIG.MODULOS||[]).filter(function(mod){return !!m[mod.id];});
  return '<div class="form-section-title">Módulos ativos</div>'+
    '<p class="modal-text">Estes são os recursos liberados nesta conta.</p>'+
    (active.length?'<div class="plan-usage-grid">'+active.map(function(mod){
      return '<div><span>Ativo</span><strong>'+esc(mod.nome)+'</strong><small>'+esc(mod.descricao)+'</small></div>';
    }).join('')+'</div>':'<div class="empty-state compact"><span>Nenhum módulo está ativo nesta conta.</span></div>');
}
function openPlanModal(){
  const a=state.commercialAccess||{},plan=commercialPlan(a.plano||'gratuito');
  const used=Number(a.armazenamentoUsado)||0,storageLimit=Number(a.limiteArmazenamento)||plan.armazenamentoBytes;
  openModal('<h3 class="modal-title">Meu plano</h3><p class="modal-text">Plano atual: <strong>'+esc(plan.nome)+'</strong>.</p>'+renderModulosDaConta()+
    '<div class="form-section-title">Uso e limites</div>'+
    '<div class="plan-usage-grid"><div><span>Casas</span><strong>'+Number(state.houses.length)+' / '+Number(a.limiteCasas||plan.casas)+'</strong></div>'+
    '<div><span>Armazenamento</span><strong>'+commercialBytes(used)+' / '+commercialBytes(storageLimit)+'</strong></div></div>'+ 
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="openMenuModal()">Voltar ao menu</button><button class="btn btn-primary" onclick="closeModal()">Fechar</button></div>');
}

/* ---------- equipe ----------
   O papel limita as ações, mas nunca cria uma seleção imóvel por imóvel:
   todo integrante trabalha sobre a mesma carteira desta conta. */
function teamRoleOptions(selected){
  const roles=['administrador','financeiro','operacional','leitura'];
  selected=String(selected||'administrador').toLowerCase();
  return roles.map(function(role){
    return '<option value="'+role+'"'+(role===selected?' selected':'')+'>'+teamRoleLabel(role)+'</option>';
  }).join('');
}
function renderTeamRows(){
  if(!state.team.length)return '<div class="empty-state compact"><span>Nenhum integrante cadastrado.</span></div>';
  return '<div class="team-list">'+state.team.map(function(member){
    const role=member.papel||'administrador';
    const status=member.aceito?(member.ativo?'Acesso ativo':'Acesso bloqueado'):'Convite pendente';
    const roleControl=member.aceito
      ?'<select aria-label="Função de '+esc(member.nome)+'" title="'+esc(teamRoleDescription(role))+'" onchange="changeTeamMemberRole(\''+member.userId+'\',this.value)">'+teamRoleOptions(role)+'</select>'
      :'<span class="tag">'+teamRoleLabel(role)+'</span>';
    return '<div class="team-row"><div><strong>'+esc(member.nome)+'</strong><span>'+esc(member.email)+'</span><span>'+status+'</span></div>'+
      roleControl+
      (member.aceito
        ?'<button class="btn btn-ghost btn-sm" onclick="toggleTeamMember(\''+member.userId+'\','+(!member.ativo)+')">'+(member.ativo?'Bloquear':'Reativar')+'</button>'
        :'<button class="btn btn-ghost btn-sm" onclick="cancelTeamInvite(\''+member.conviteId+'\')">Cancelar convite</button>')+'</div>';
  }).join('')+'</div>';
}
function openTeamModal(){
  if(!requirePrimaryOwnerPermission())return;
  openModal('<h3 class="modal-title">Equipe</h3>'+
    '<p class="modal-text">Cada integrante acessa <strong>todos os imóveis desta conta</strong>. A função escolhida define o que a pessoa pode consultar ou alterar; não há liberação imóvel por imóvel.</p>'+
    '<div class="field-row"><label class="field"><span>Nome</span><input id="team_name" placeholder="Nome do integrante"></label>'+
    '<label class="field"><span>E-mail</span><input id="team_email" type="email" placeholder="pessoa@email.com"></label></div>'+
    '<label class="field"><span>Função</span><select id="team_role">'+teamRoleOptions('operacional')+'</select><small id="team_role_help">A função limita as ações em toda a carteira de imóveis.</small></label>'+
    '<div class="help-steps"><strong>O que cada função faz</strong><span><b>Administrador:</b> operação, configurações e backups. Somente o proprietário principal administra a equipe.</span><span><b>Financeiro:</b> cobranças, recebimentos, despesas e relatórios.</span><span><b>Operacional:</b> imóveis, pessoas, contratos e leituras, sem confirmar dinheiro.</span><span><b>Somente leitura:</b> consulta sem alterações.</span></div>'+
    '<button class="btn btn-primary" onclick="inviteTeamMember()">Adicionar à equipe</button>'+renderTeamRows()+
    '<div class="team-instructions"><strong>Como a pessoa entra</strong><span>1. Cadastre o e-mail e escolha a função.</span><span>2. Envie o endereço do aplicativo.</span><span>3. A pessoa escolhe “Administrador” na entrada e cria a conta usando exatamente o mesmo e-mail.</span></div>'+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="openMenuModal()">Voltar ao menu</button><div class="modal-actions-right"><button class="btn btn-ghost" onclick="closeModal()">Fechar</button><button class="btn btn-ghost" onclick="copyTextValue(location.origin+location.pathname,\'Link do app copiado.\')">Copiar link do app</button></div></div>');
}
async function inviteTeamMember(){
  if(!requirePrimaryOwnerPermission())return;
  const nome=((document.getElementById('team_name')||{}).value||'').trim();
  const email=((document.getElementById('team_email')||{}).value||'').trim().toLowerCase();
  const papel=((document.getElementById('team_role')||{}).value||'operacional');
  if(!nome||!email||!emailValido(email)){showToast('Informe nome e e-mail válidos.','error');return;}
  try{
    await db.inviteTeamMember(nome,email,papel);
    state.team=await db.listTeam();
    openTeamModal();
    showToast('Convite preparado. Envie o link do aplicativo.','success');
  }catch(e){console.error(e);showToast((e&&e.message)||'Não foi possível adicionar.','error');}
}
async function changeTeamMemberRole(userId,papel){
  if(!requirePrimaryOwnerPermission())return;
  const member=state.team.find(function(item){return item.userId===userId;});
  if(!member)return;
  try{
    await db.updateTeamMember(userId,member.ativo!==false,papel);
    state.team=await db.listTeam();
    openTeamModal();
    showToast('Função atualizada para '+teamRoleLabel(papel)+'.','success');
  }catch(e){console.error(e);showToast('Não foi possível alterar a função.','error');openTeamModal();}
}
async function toggleTeamMember(userId,active){
  if(!requirePrimaryOwnerPermission())return;
  const member=state.team.find(function(item){return item.userId===userId;});
  try{
    await db.updateTeamMember(userId,active,member&&member.papel);
    state.team=await db.listTeam();
    openTeamModal();
    showToast(active?'Acesso reativado.':'Acesso bloqueado.','success');
  }catch(e){console.error(e);showToast('Não foi possível alterar o acesso.','error');}
}
async function cancelTeamInvite(inviteId){
  if(!requirePrimaryOwnerPermission())return;
  try{
    await db.cancelTeamInvite(inviteId);
    state.team=await db.listTeam();
    openTeamModal();
    showToast('Convite cancelado.','success');
  }catch(e){console.error(e);showToast('Não foi possível cancelar o convite.','error');}
}

function onboardingSteps(){
  return [
    {ok:!!(state.config&&state.config.locadorNome),label:'Preencher os dados do locador',action:'openConfigModal()'},
    {ok:state.houses.length>0,label:'Cadastrar a primeira casa',action:'openAddHouseModal()'},
    {ok:state.tenants.length>0,label:'Cadastrar um inquilino',action:'openAddTenantModal()'},
    {ok:state.houses.some(function(h){return (h.contracts||[]).length>0;}),label:'Criar o primeiro contrato',action:'irCasas()'},
    {ok:!!(state.config&&state.config.ultimoBackupExterno),label:'Baixar a primeira exportação externa',action:'doExportBackup()'}
  ];
}
function renderOnboardingBanner(){
  if(!canAdministerAccount())return '';
  if(state.config&&state.config.onboardingConcluido)return '';
  const steps=onboardingSteps(),done=steps.filter(function(s){return s.ok;}).length;
  return '<section class="onboarding-card"><div><span class="eyebrow">PRIMEIROS PASSOS</span><h2>Prepare sua conta</h2><p>'+done+' de '+steps.length+' etapas concluídas</p></div><div class="onboarding-steps">'+steps.map(function(s){return '<button class="onboarding-step'+(s.ok?' done':'')+'" onclick="'+s.action+'"><span>'+(s.ok?'✓':'○')+'</span>'+esc(s.label)+'</button>';}).join('')+'</div>'+ 
    (done===steps.length?'<button class="btn btn-primary btn-small" onclick="finishOnboarding()">Concluir orientação</button>':'<button class="btn btn-ghost btn-small" onclick="finishOnboarding()">Ocultar por enquanto</button>')+'</section>';
}
async function finishOnboarding(){
  if(!requireAccountPermission(canAdministerAccount(),'Sua função não permite alterar as configurações do app.'))return;
  const cfg=Object.assign({},state.config,{onboardingConcluido:true});
  try{await db.saveConfig(cfg);state.config=cfg;render();showToast('Orientação concluída.','success');}catch(e){showToast('Não foi possível salvar.','error');}
}
function renderExternalBackupReminder(){
  if(!canAdministerAccount())return '';
  const last=state.config&&state.config.ultimoBackupExterno;
  const age=last?(Date.now()-new Date(last).getTime())/(86400000):Infinity;
  if(age<30||!(state.config&&state.config.onboardingConcluido))return '';
  return '<div class="backup-reminder"><span><strong>Faça uma exportação externa</strong><small>Sua última exportação '+(last?'tem mais de 30 dias':'ainda não foi baixada')+'.</small></span><button class="btn btn-ghost btn-small" onclick="doExportBackup()">Baixar exportação</button></div>';
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
/* ---------- tema por usuário (Parte 2) ----------
   O tema do app é POR USUÁRIO (cada colaborador o seu). Guardado neste
   aparelho em localStorage (aplica na hora) e, quando a migração estiver
   no Supabase, sincronizado entre aparelhos. O tema da conta
   (config.tema) segue servindo ao Portal do Inquilino. */
function userThemeStorageKey(){
  const uid=state.session&&state.session.user&&state.session.user.id;
  return 'aluguel-user-theme-v1'+(uid?(':'+uid):'');
}
function loadLocalUserTheme(){
  try{ return normalizeUserTheme(localStorage.getItem(userThemeStorageKey())); }
  catch(e){ return 'original'; }
}
function applyOwnerAppTheme(){
  const local=loadLocalUserTheme();
  applyAppTheme(local);
  /* Puxa a preferência do servidor (outros aparelhos) sem travar a tela.
     Enquanto a migração não for aplicada, retorna nulo e nada muda. */
  if(typeof db!=='undefined' && db.loadUserTheme){
    db.loadUserTheme().then(function(remote){
      if(remote && normalizeUserTheme(remote)!==local){
        try{ localStorage.setItem(userThemeStorageKey(),normalizeUserTheme(remote)); }catch(e){}
        applyAppTheme(remote); render();
      }
    }).catch(function(){});
  }
}
function setUserAppTheme(theme){
  const t=normalizeUserTheme(theme);
  try{ localStorage.setItem(userThemeStorageKey(),t); }catch(e){}
  applyAppTheme(t);
  if(typeof db!=='undefined' && db.saveUserTheme) db.saveUserTheme(t).catch(function(){});
  /* Troca instantânea e salva sozinho, sem botão "Salvar": só atualiza o
     destaque no menu aberto. */
  if(document.querySelector('.menu-theme-switch')) openMenuModal();
}
function renderUserThemeSwitch(){
  const current=loadLocalUserTheme();
  return '<div class="menu-theme-switch" role="group" aria-label="Tema de cores">'+
    USER_THEME_CHOICES.map(function(t){
      const active=current===t.id;
      return '<button class="menu-theme-opt'+(active?' active':'')+'" aria-pressed="'+(active?'true':'false')+
        '" onclick="setUserAppTheme(\''+t.id+'\')">'+
        '<span class="menu-theme-swatch" aria-hidden="true">'+t.cores.map(function(c){return '<i style="background:'+c+'"></i>';}).join('')+'</span>'+
        '<b>'+esc(t.nome)+'</b></button>';
    }).join('')+
  '</div>';
}
function cancelConfigModal(){ applyAppTheme(loadLocalUserTheme()); closeModal(); }
function returnFromConfigToMenu(){ applyAppTheme(loadLocalUserTheme()); openMenuModal(); }
const VITRINE_MARCA_TEMAS=[
  {id:'floresta',nome:'Floresta',cores:['#14322A','#C39A5A','#F7F6F2']},
  {id:'oceano',nome:'Oceano',cores:['#123B57','#2F7D8C','#F4F8FA']},
  {id:'terracota',nome:'Terracota',cores:['#6E2F25','#C97954','#FBF5EF']},
  {id:'grafite',nome:'Grafite',cores:['#252A2D','#737B80','#F7F7F5']}
];
function renderVitrineMarcaTemas(selected){
  const atual=selected||'floresta';
  return '<div class="vitrine-brand-options" role="radiogroup" aria-label="Paleta da Vitrine">'+
    VITRINE_MARCA_TEMAS.map(function(t){
      return '<label class="vitrine-brand-option"><input type="radio" name="f_public_brand" value="'+t.id+'"'+
        (t.id===atual?' checked':'')+'><span><i aria-hidden="true">'+
        t.cores.map(function(c){return '<b style="background:'+c+'"></b>';}).join('')+
        '</i><strong>'+esc(t.nome)+'</strong></span></label>';
    }).join('')+'</div>';
}
function openConfigModal(){
  if(!canAdministerAccount()){showToast('Sua função não permite alterar as configurações do app.','error');return;}
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
    /* O CRECI aparece no rodapé do site público. Sem ele a página não
       diz quem está falando — e sem isso não se anuncia em plataforma
       de publicidade nenhuma. */
    '<label class="field"><span>CRECI (opcional)</span><input id="f_public_creci" maxlength="30" value="'+esc(owner.creci||'')+'" placeholder="CRECI-PE 00000-F"></label>'+
    '<label class="field"><span>Descrição pública</span><textarea id="f_public_description" maxlength="320" rows="3" placeholder="O que diferencia sua imobiliária e sua região de atendimento">'+esc(owner.descricao_publica||'')+'</textarea></label>'+
    '<div class="field-row"><label class="field"><span>Cidade-sede</span><input id="f_public_city" maxlength="120" value="'+esc(owner.cidade_sede||'')+'"></label>'+
    '<label class="field"><span>UF</span><input id="f_public_uf" maxlength="2" value="'+esc(owner.uf_sede||'')+'" placeholder="PE"></label></div>'+
    '<div class="field"><span>Identidade visual</span>'+renderVitrineMarcaTemas(owner.marca_tema||'floresta')+'</div>'+
    '<div class="vitrine-brand-logo"><div><strong>Logo da Vitrine</strong><small>'+(owner.logo_path?'Logo personalizada enviada.':'Usando o símbolo padrão do aplicativo.')+'</small></div>'+
      '<div><button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById(\'vitrineLogoInput\').click()">'+(owner.logo_path?'Trocar logo':'Enviar logo')+'</button>'+
      (owner.logo_path?'<button type="button" class="btn btn-ghost btn-sm" onclick="removerVitrineLogo()">Remover</button>':'')+'</div></div>'+
    (owner.slug_publico?'<button class="btn btn-ghost" onclick="copyPublicLink()">Copiar link dos anúncios</button>':''):'';
  openModal(
    '<h3 class="modal-title">Configurações do app</h3>'+
    '<p class="modal-text">Personalize o aplicativo e os dados usados nos recibos.</p>'+
    '<label class="field"><span>Seu nome (locador)</span><input id="f_nome" value="'+esc(cfg.locadorNome)+'"></label>'+
    '<label class="field"><span>CPF/CNPJ (opcional)</span><input id="f_doc" value="'+esc(cfg.locadorDocumento)+'"></label>'+
    '<label class="field-check module-toggle"><input type="checkbox" id="f_energy_enabled"'+(cfg.energiaAtiva!==false?' checked':'')+'><span><strong>Ativar o módulo Energia</strong><small>Ao desativar, os lançamentos ficam preservados e a categoria é escondida.</small></span></label>'+ 
    commercialFields+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="returnFromConfigToMenu()">Voltar ao menu</button><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="cancelConfigModal()">Fechar</button>'+
      '<button class="btn btn-primary" onclick="saveConfig()">Salvar</button>'+
    '</div></div>'
  );
}
async function saveConfig(){
  if(!requireAccountPermission(canAdministerAccount(),'Sua função não permite alterar as configurações do app.'))return;
  const cfg = {
    locadorNome: document.getElementById('f_nome').value.trim(),
    locadorDocumento: document.getElementById('f_doc').value.trim(),
    energiaAtiva: document.getElementById('f_energy_enabled').checked,
    tema: (state.config&&state.config.tema)||'original',
    onboardingConcluido:!!state.config.onboardingConcluido,
    ultimoBackupExterno:state.config.ultimoBackupExterno||'',
    pixChave:state.isPrimaryOwner?document.getElementById('f_pix_key').value.trim():(state.config.pixChave||''),
    pixNome:state.isPrimaryOwner?document.getElementById('f_pix_name').value.trim():(state.config.pixNome||''),
    pixCidade:state.isPrimaryOwner?document.getElementById('f_pix_city').value.trim():(state.config.pixCidade||'')
  };
  try{
    await db.saveConfig(cfg);
    if(state.isPrimaryOwner){
      const creciEl=document.getElementById('f_public_creci');
      const profile={slug:document.getElementById('f_public_slug').value.trim().toLowerCase(),
        nome:document.getElementById('f_public_name').value.trim(),
        contato:document.getElementById('f_public_contact').value.trim(),
        creci:creciEl?creciEl.value.trim():'',
        descricao:document.getElementById('f_public_description').value.trim(),
        cidadeSede:document.getElementById('f_public_city').value.trim(),
        ufSede:document.getElementById('f_public_uf').value.trim().toUpperCase(),
        marcaTema:(document.querySelector('input[name="f_public_brand"]:checked')||{}).value||'floresta'};
      if(profile.ufSede&&!/^[A-Z]{2}$/.test(profile.ufSede))throw new Error('Informe a UF com duas letras, por exemplo PE.');
      await db.savePublicProfile(profile);
      state.ownerProfile.slug_publico=profile.slug;state.ownerProfile.nome_publico=profile.nome;
      state.ownerProfile.contato_publico=profile.contato.replace(/\D/g,'');
      state.ownerProfile.creci=profile.creci;
      state.ownerProfile.descricao_publica=profile.descricao;
      state.ownerProfile.cidade_sede=profile.cidadeSede;
      state.ownerProfile.uf_sede=profile.ufSede;
      state.ownerProfile.marca_tema=profile.marcaTema;
    }
    state.config = cfg;
    applyAppTheme(loadLocalUserTheme());
    if(!cfg.energiaAtiva&&state.view==='energia') state.view='dashboard';
    closeModal();
    render();
    showToast('Dados salvos.', 'success');
  }catch(e){ console.error(e); showToast((e&&e.message)||'Erro ao salvar. Tente novamente.', 'error'); }
}

async function handleVitrineLogoFile(file){
  if(!state.isPrimaryOwner){showToast('Somente o proprietário principal pode alterar a marca.','error');return;}
  try{
    if(!/^image\/(jpeg|png|webp|svg\+xml)$/i.test(file.type||'')||file.size>8*1024*1024){
      throw new Error('Use uma imagem SVG, PNG, JPG ou WebP de até 8 MB.');
    }
    /* SVG e PNG mantêm o fundo transparente; ver prepararLogo. */
    const blob=await prepararLogo(file,640);
    const result=await db.saveVitrineLogoFile(blob,(state.ownerProfile&&state.ownerProfile.logo_path)||'');
    state.ownerProfile.logo_path=result.path;
    state.ownerProfile.logo_url=result.url;
    openConfigModal();
    showToast('Logo da Vitrine atualizada.','success');
  }catch(e){console.error(e);showToast((e&&e.message)||'Não foi possível enviar a logo.','error');}
}
async function removerVitrineLogo(){
  if(!state.isPrimaryOwner)return;
  try{
    await db.removeVitrineLogo((state.ownerProfile&&state.ownerProfile.logo_path)||'');
    state.ownerProfile.logo_path='';state.ownerProfile.logo_url='';
    openConfigModal();showToast('Logo removida.','success');
  }catch(e){console.error(e);showToast((e&&e.message)||'Não foi possível remover a logo.','error');}
}

/* ---------- backup e zona de risco ---------- */
function openBackupCenterModal(){
  if(!canAdministerAccount()){showToast('Sua função não permite administrar backups.','error');return;}
  const last=state.config&&state.config.ultimoBackupExterno;
  const lastLabel=last?fmtDateBR(String(last).slice(0,10)):'Nenhuma exportação externa baixada';
  const canManage=canAdministerAccount();
  openModal('<h3 class="modal-title">Backup</h3>'+
    '<p class="modal-text">'+(canManage?'Exporte, importe e restaure seus dados em um só lugar.':'Baixe uma cópia dos dados ou consulte o histórico. Sua função não permite importar nem restaurar.')+'</p>'+
    '<div class="form-section-title">Exportação externa no seu aparelho</div>'+
    '<p class="modal-text">Inclui os dados da área de aluguéis e a fundação da Vitrine: cidades, proprietários, anúncios, condições, comodidades e documentação estruturada. Também inclui fotos de imóveis, documentos e fotos de energia disponíveis. Ainda não inclui fotos, leads e taxas da Vitrine, vistorias, fotos de chamados, convites nem acessos do Portal; uma substituição incompatível é bloqueada antes de apagar dados. A importação pelo navegador aceita arquivos de até 200 MB. Última exportação: <strong>'+esc(lastLabel)+'</strong>.</p>'+
    '<div class="menu-list"><button class="btn btn-primary" onclick="doExportBackup()">Baixar exportação externa</button>'+
    (canManage?'<button class="btn btn-ghost" onclick="triggerImport()">Importar arquivo de backup</button>':'')+'</div>'+
    '<div class="form-section-title">Backups automáticos</div>'+
    '<p class="modal-text">O aplicativo cria um retrato diário dos dados da área de aluguéis. Fotos de imóveis, documentos e fotos de energia não entram nesse retrato. Estruturas ainda não representadas impedem uma substituição insegura.</p>'+
    '<div class="menu-list"><button class="btn btn-ghost" onclick="openBackupsModal()">Ver backups automáticos</button></div>'+
    '<div class="form-section-title">Itens arquivados</div>'+
    '<p class="modal-text">Cadastros e lançamentos arquivados saem das listas de trabalho, mas continuam guardados e podem ser restaurados.</p>'+
    '<div class="menu-list"><button class="btn btn-ghost" onclick="openArchivedItemsModal()">Ver itens arquivados</button></div>'+
    (state.isPrimaryOwner?'<div class="form-section-title">Zona de risco</div><p class="modal-text">A exclusão total fica separada das rotinas de backup para evitar ações acidentais.</p><button class="btn btn-ghost" onclick="openRiskZoneModal()">Abrir zona de risco</button>':'')+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="openMenuModal()">Voltar ao menu</button><button class="btn btn-primary" onclick="closeModal()">Fechar</button></div>');
}
async function openBackupsModal(){
  if(!requireAccountPermission(canAdministerAccount(),'Sua função não permite administrar backups.'))return;
  openModal('<h3 class="modal-title">Backups automáticos</h3><p class="modal-text">Carregando…</p>'+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="openBackupCenterModal()">Voltar ao Backup</button><button class="btn btn-ghost" onclick="closeModal()">Fechar</button></div>');
  let lista;
  try{lista=await db.getBackups();}
  catch(e){
    openModal('<h3 class="modal-title">Backups automáticos</h3><p class="modal-text">Não foi possível carregar os backups agora.</p>'+
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="openBackupCenterModal()">Voltar ao Backup</button><button class="btn btn-ghost" onclick="closeModal()">Fechar</button></div>');
    return;
  }
  const canRestore=canAdministerAccount();
  const rows=lista.length?lista.map(function(b){
    const dt=new Date(b.criado_em);
    const quando=fmtDateBR(String(b.criado_em).slice(0,10))+' '+String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0');
    return '<div class="ledger-row"><div class="ledger-row-main">'+quando+'</div>'+
      (canRestore?'<button class="btn btn-ghost btn-sm" onclick="confirmRestore(\''+b.id+'\',\''+quando+'\')">Restaurar</button>':'<span class="tag">Somente consulta</span>')+'</div>';
  }).join(''):'<div class="empty-state">Ainda não há backups. Eles são criados automaticamente, uma vez por dia, quando você abre o app.</div>';
  openModal('<h3 class="modal-title">Backups automáticos</h3>'+
    '<p class="modal-text">Guardamos os últimos 30 dias. Restaurar substitui os dados atuais da área de aluguéis pelo retrato escolhido. Fotos de imóveis, documentos e fotos de energia não entram no backup automático. A exportação externa inclui esses arquivos, mas ainda não inclui vistorias, fotos de chamados, convites nem acessos do Portal; uma operação incompatível é bloqueada antes de apagar qualquer dado.</p>'+
    '<div class="ledger">'+rows+'</div>'+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="openBackupCenterModal()">Voltar ao Backup</button><button class="btn btn-primary" onclick="closeModal()">Fechar</button></div>');
}

/* O servidor devolve somente registros da conta atual. A lista local é
   mantida apenas enquanto o modal está aberto, para não misturar itens
   arquivados com as coleções usadas pelo restante do aplicativo. */
let archivedItemsCache=[];
const ARCHIVED_ENTITY_LABELS={
  imovel:'Imóvel',
  inquilino:'Inquilino',
  contrato:'Contrato',
  cobranca:'Cobrança',
  recebimento:'Recebimento',
  pagamento:'Pagamento antigo',
  despesa:'Despesa',
  energia:'Energia',
  reajuste:'Reajuste'
};
function archivedEntityName(entity){
  return ARCHIVED_ENTITY_LABELS[String(entity||'').toLowerCase()]||'Item';
}
function archivedEntityId(entity){
  const normalized=String(entity||'').toLowerCase();
  return Object.prototype.hasOwnProperty.call(ARCHIVED_ENTITY_LABELS,normalized)?normalized:'';
}
function archivedDateLabel(value){
  if(!value)return 'Data não informada';
  const dt=new Date(value);
  if(Number.isNaN(dt.getTime()))return fmtDateBR(String(value).slice(0,10));
  return fmtDateBR(String(value).slice(0,10))+' às '+
    String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0');
}
function archivedRestoreHint(entity){
  const hints={
    contrato:'Se o imóvel ou o inquilino também estiver arquivado, restaure esses dois primeiro.',
    cobranca:'Se o imóvel estiver arquivado, restaure o imóvel primeiro.',
    recebimento:'Se a cobrança estiver arquivada, restaure a cobrança primeiro.',
    pagamento:'Se o contrato ou o imóvel estiver arquivado, restaure os cadastros principais primeiro.',
    despesa:'Se o imóvel estiver arquivado, restaure o imóvel primeiro.',
    energia:'Se o imóvel ou o contrato estiver arquivado, restaure os cadastros principais primeiro.',
    reajuste:'Se o imóvel ou o contrato estiver arquivado, restaure os cadastros principais primeiro.'
  };
  return hints[entity]||'O item voltará às listas ativas da conta.';
}
function archivedRestoreErrorMessage(error){
  const message=String(error&&error.message||'');
  if(/imovel e o inquilino/i.test(message))return 'Restaure primeiro o imóvel e o inquilino ligados a este contrato.';
  if(/imovel desta cobranca/i.test(message))return 'Restaure primeiro o imóvel ligado a esta cobrança.';
  if(/cobranca deste recebimento/i.test(message))return 'Restaure primeiro a cobrança ligada a este recebimento.';
  if(/contrato deste reajuste/i.test(message))return 'Restaure primeiro o imóvel e o contrato ligados a este reajuste.';
  if(/contrato ativo.*imovel/i.test(message))return 'Encerre o contrato ativo antes de arquivar o imóvel.';
  if(/contrato ativo.*inquilino/i.test(message))return 'Encerre o contrato ativo antes de arquivar o inquilino.';
  return message||'Não foi possível restaurar este item.';
}
/* ------------------------------------------------------------
   HISTÓRICO DE ALTERAÇÕES

   O banco registra quem alterou o quê desde a migração do Financeiro v2 —
   autor, papel, antes e depois, em dez tabelas, com documento e chave PIX
   expurgados do log. Nunca houve tela: o registro existia e ninguém
   conseguia lê-lo. Isto é só o fio ligado na ponta.
   ------------------------------------------------------------ */
const AUDIT_ENTIDADES={
  imoveis:'Imóvel', inquilinos:'Inquilino', contratos:'Contrato',
  pagamentos:'Pagamento', energia:'Energia', despesas:'Despesa',
  aluguel_historico:'Reajuste', financeiro_cobrancas:'Cobrança',
  financeiro_recebimentos:'Recebimento', chamados:'Chamado'
};
const AUDIT_ACOES={
  inserir:'criou', alterar:'alterou', arquivar:'arquivou',
  restaurar:'restaurou', excluir:'excluiu'
};
function auditEntidadeLabel(v){ return AUDIT_ENTIDADES[v]||v||'Registro'; }
function auditAcaoLabel(v){ return AUDIT_ACOES[v]||v||'mexeu em'; }
function auditAcaoTom(v){
  if(v==='excluir')return 'rust';
  if(v==='inserir')return 'brass';
  if(v==='arquivar')return 'warn';
  return 'slate';
}
/* Nome de quem fez, quando dá para saber.

   O log guarda o id de quem alterou; os nomes estão em `state.team`. Só
   que a lista da equipe é carregada — e a RPC só a devolve — para o
   PROPRIETÁRIO PRIMÁRIO. Um colaborador com papel administrador abre esta
   tela e não tem lista nenhuma.

   Por isso a resposta muda conforme o que dá para saber: com a lista em
   mãos, um id ausente é mesmo alguém que saiu; sem a lista, dizer isso
   seria inventar. Aí mostramos a função que a pessoa tinha, que é o que o
   próprio registro garante. */
function auditAtorNome(atorId,papel){
  if(!atorId) return 'Sistema';
  if(state.session&&state.session.user&&state.session.user.id===atorId) return 'Você';
  if(state.ownerProfile&&state.ownerProfile.user_id===atorId){
    return state.ownerProfile.nome||'Proprietário da conta';
  }
  const membro=(state.team||[]).find(function(m){return m.userId===atorId;});
  if(membro) return membro.nome||membro.email||'Equipe';
  if(!(state.team||[]).length){
    return papel?('Alguém da equipe · '+teamRoleLabel(papel)):'Alguém da equipe';
  }
  return 'Alguém que saiu da equipe';
}
function setAuditFilter(value){
  state.auditFilter=value||'';
  openAuditModal(true);
}
function auditRowsFiltered(){
  const f=state.auditFilter||'';
  return (state.auditLog||[]).filter(function(item){
    return !f||item.entidade===f;
  });
}
async function openAuditModal(semRecarregar){
  if(!canAdministerAccount()){
    showToast('Somente o administrador da conta vê o histórico de alterações.','error');
    return;
  }
  if(!semRecarregar){
    openModal('<h3 class="modal-title">Histórico de alterações</h3>'+
      '<p class="modal-text">Carregando…</p>');
    try{
      state.auditLog=await db.listFinancialAudit(300);
    }catch(e){
      console.error(e);
      openModal('<h3 class="modal-title">Histórico de alterações</h3>'+
        '<p class="modal-text">Não foi possível carregar o histórico. '+
        'Se este banco ainda não recebeu a migração do Financeiro v2, o registro ainda não existe.</p>'+
        '<div class="modal-actions"><span></span><button class="btn btn-ghost" onclick="openMenuModal()">Voltar ao menu</button></div>');
      return;
    }
  }
  const linhas=auditRowsFiltered();
  const entidadesPresentes=Object.keys(AUDIT_ENTIDADES).filter(function(k){
    return (state.auditLog||[]).some(function(x){return x.entidade===k;});
  });
  openModal('<h3 class="modal-title">Histórico de alterações</h3>'+
    '<p class="modal-text">Quem alterou o quê nesta conta, com a função que a pessoa tinha na hora. '+
    'Documentos e chave PIX não entram no registro. Mostra as 300 alterações mais recentes.</p>'+
    (entidadesPresentes.length>1
      ? '<label class="field"><span>Mostrar</span><select onchange="setAuditFilter(this.value)">'+
        '<option value="">Tudo</option>'+
        entidadesPresentes.map(function(k){
          return '<option value="'+k+'"'+(state.auditFilter===k?' selected':'')+'>'+
            esc(auditEntidadeLabel(k))+'</option>';
        }).join('')+'</select></label>'
      : '')+
    (linhas.length
      ? '<div class="ledger audit-list">'+linhas.map(function(item){
          const quando=item.createdAt
            ? new Date(item.createdAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})
            : '';
          return '<div class="ledger-row"><div class="ledger-row-main">'+
            esc(auditAtorNome(item.atorId,item.atorPapel))+' '+esc(auditAcaoLabel(item.acao))+' '+
            '<b>'+esc(auditEntidadeLabel(item.entidade).toLowerCase())+'</b>'+
            '<div class="ledger-row-sub">'+esc(quando)+
            (item.atorPapel?' · '+esc(teamRoleLabel(item.atorPapel)):'')+'</div></div>'+
            '<span class="chip chip-'+auditAcaoTom(item.acao)+'">'+esc(auditAcaoLabel(item.acao))+'</span>'+
          '</div>';
        }).join('')+'</div>'
      : '<div class="empty-state compact"><span>'+
        ((state.auditLog||[]).length
          ? 'Nenhuma alteração desse tipo no período carregado.'
          : 'Nenhuma alteração registrada ainda.')+'</span></div>')+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="openMenuModal()">Voltar ao menu</button>'+
    '<div class="modal-actions-right"><button class="btn btn-primary" onclick="openAuditModal()">Atualizar</button></div></div>');
}

async function openArchivedItemsModal(filter){
  if(!canOperateProperties()&&!canManageFinance()){
    showToast('Sua função permite somente consultar os dados ativos.','error');
    return;
  }
  const backAction=canAdministerAccount()?'openBackupCenterModal()':'openMenuModal()';
  const backLabel=canAdministerAccount()?'Voltar ao Backup':'Voltar ao menu';
  const selected=filter==='todos'||!filter?'todos':archivedEntityId(filter);
  openModal('<h3 class="modal-title">Itens arquivados</h3><p class="modal-text">Carregando…</p>'+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="'+backAction+'">'+backLabel+'</button><button class="btn btn-ghost" onclick="closeModal()">Fechar</button></div>');
  try{
    archivedItemsCache=(await db.listArchived()).filter(function(item){
      return !!archivedEntityId(item.entidade)&&!!item.id;
    });
  }catch(error){
    console.error(error);
    archivedItemsCache=[];
    openModal('<h3 class="modal-title">Itens arquivados</h3>'+
      '<p class="modal-text">Não foi possível carregar os itens arquivados agora. Confirme se a atualização financeira da conta já foi aplicada e tente novamente.</p>'+
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="'+backAction+'">'+backLabel+'</button><button class="btn btn-primary" onclick="closeModal()">Fechar</button></div>');
    return;
  }
  const visible=selected==='todos'
    ?archivedItemsCache
    :archivedItemsCache.filter(function(item){return item.entidade===selected;});
  const availableTypes=Object.keys(ARCHIVED_ENTITY_LABELS).filter(function(entity){
    return archivedItemsCache.some(function(item){return item.entidade===entity;});
  });
  const options='<option value="todos">Todos os tipos</option>'+availableTypes.map(function(entity){
    return '<option value="'+entity+'"'+(selected===entity?' selected':'')+'>'+esc(archivedEntityName(entity))+'</option>';
  }).join('');
  const rows=visible.length?visible.map(function(item){
    const entity=archivedEntityId(item.entidade);
    return '<div class="ledger-row"><div class="ledger-row-main"><strong>'+esc(item.titulo||archivedEntityName(entity))+'</strong>'+
      '<div class="ledger-row-sub">'+esc(archivedEntityName(entity))+' · '+esc(archivedDateLabel(item.arquivadoEm))+
      '<br>Motivo: '+esc(item.motivo||'Não informado')+'</div></div>'+
      (canRestoreArchivedEntity(entity)
        ? '<button class="btn btn-ghost btn-sm" onclick="confirmRestoreArchivedItem(\''+entity+'\',\''+item.id+'\')">Restaurar</button>'
        : '<span class="tag">Somente consulta</span>')+'</div>';
  }).join(''):'<div class="empty-state">Nenhum item arquivado'+(selected==='todos'?'.':' deste tipo.')+'</div>';
  openModal('<h3 class="modal-title">Itens arquivados</h3>'+
    '<p class="modal-text">Restaure cadastros principais antes dos registros que dependem deles. Exemplo: imóvel e inquilino antes do contrato.</p>'+
    '<label class="field"><span>Mostrar</span><select onchange="openArchivedItemsModal(this.value)">'+options+'</select></label>'+
    '<div class="ledger">'+rows+'</div>'+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="'+backAction+'">'+backLabel+'</button><button class="btn btn-primary" onclick="closeModal()">Fechar</button></div>');
}
function confirmRestoreArchivedItem(entity,id){
  const normalized=archivedEntityId(entity);
  if(!canRestoreArchivedEntity(normalized)){
    showToast('Sua função não permite restaurar este tipo de item.','error');
    return;
  }
  const item=archivedItemsCache.find(function(entry){
    return entry.id===id&&entry.entidade===normalized;
  });
  if(!normalized||!item){showToast('Este item não está mais disponível na lista.','error');return;}
  openModal('<h3 class="modal-title">Restaurar '+esc(archivedEntityName(normalized).toLowerCase())+'?</h3>'+
    '<p class="modal-text"><strong>'+esc(item.titulo||archivedEntityName(normalized))+'</strong> voltará às listas ativas.</p>'+
    '<div class="notice-box">'+esc(archivedRestoreHint(normalized))+'</div>'+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="openArchivedItemsModal(\''+normalized+'\')">Voltar</button>'+
      '<button class="btn btn-primary" onclick="restoreArchivedItem(\''+normalized+'\',\''+id+'\')">Restaurar item</button></div>');
}
async function restoreArchivedItem(entity,id){
  const normalized=archivedEntityId(entity);
  if(!normalized){showToast('Tipo de item inválido.','error');return;}
  if(!canRestoreArchivedEntity(normalized)){
    showToast('Sua função não permite restaurar este tipo de item.','error');
    return;
  }
  try{
    await db.restoreEntity(normalized,id);
    closeModal();
    state.loaded=false;
    await loadData();
    await openArchivedItemsModal(normalized);
    showToast(archivedEntityName(normalized)+' restaurado com sucesso.','success');
  }catch(error){
    console.error(error);
    const message=archivedRestoreErrorMessage(error);
    openModal('<h3 class="modal-title">Não foi possível restaurar</h3>'+
      '<div class="notice-box"><strong>Confira a ordem dos itens.</strong><br>'+esc(message)+'</div>'+
      '<p class="modal-text">'+esc(archivedRestoreHint(normalized))+'</p>'+
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="openArchivedItemsModal(\''+normalized+'\')">Voltar aos itens</button><button class="btn btn-primary" onclick="closeModal()">Fechar</button></div>');
  }
}
function openRiskZoneModal(){
  if(!requirePrimaryOwnerPermission('Somente o proprietário principal pode abrir a zona de risco.'))return;
  openModal('<h3 class="modal-title">Zona de risco</h3>'+
    '<div class="notice-box"><strong>Exclusão permanente da conta</strong><br>Esta ação apaga todos os dados operacionais desta conta. Ela é diferente do arquivamento recuperável de um imóvel, contrato, inquilino ou lançamento individual.</div>'+
    '<p class="modal-text">Antes de continuar, baixe uma exportação externa e observe as limitações informadas na tela de Backup. A confirmação seguinte exigirá a palavra APAGAR e a senha da conta.</p>'+
    '<button class="btn btn-danger" onclick="confirmResetAll()">Revisar exclusão de todos os dados</button>'+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="openBackupCenterModal()">Voltar ao Backup</button><button class="btn btn-primary" onclick="closeModal()">Fechar</button></div>');
}

/* ---------- apagar tudo ---------- */
function confirmResetAll(){
  if(!requirePrimaryOwnerPermission('Somente o proprietário principal pode apagar todos os dados da conta.'))return;
  openModal(
    '<h3 class="modal-title">Apagar todos os dados?</h3>'+ 
    '<p class="modal-text">Isso remove permanentemente casas, inquilinos, pagamentos, despesas, fotos e documentos. Sua conta continua ativa. Esta ação não é o arquivamento recuperável. Baixe uma exportação externa antes e confira as limitações mostradas em Backup.</p>'+
    '<label class="field"><span>Digite APAGAR para confirmar</span><input id="reset_phrase" autocomplete="off"></label>'+ 
    '<label class="field"><span>Confirme sua senha</span><input id="reset_password" type="password" autocomplete="current-password"></label>'+ 
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="openRiskZoneModal()">Voltar à zona de risco</button><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="closeModal()">Fechar</button>'+
      '<button class="btn btn-danger" onclick="resetAll()">Apagar tudo</button>'+
    '</div></div>'
  );
}
async function resetAll(){
  if(!requirePrimaryOwnerPermission('Somente o proprietário principal pode apagar todos os dados da conta.'))return;
  try{
    const phrase=((document.getElementById('reset_phrase')||{}).value||'').trim().toUpperCase();
    const password=(document.getElementById('reset_password')||{}).value||'';
    if(phrase!=='APAGAR'||!password){showToast('Digite APAGAR e confirme sua senha.','error');return;}
    const email=state.session&&state.session.user?state.session.user.email:'';
    const auth=await sb.auth.signInWithPassword({email:email,password:password});
    if(auth.error){showToast('Senha incorreta. Os dados não foram apagados.','error');return;}
    await db.wipeAll();
    state.houses=[]; state.tenants=[]; state.interests=[]; state.eventos=[];
    state.owners=[]; state.team=[]; state.tenantAccess=[];
    state.photoCache={}; state.documentCache={};
    state.vitrine={anunciantes:[],imoveis:[],leads:[],taxas:[],cidades:[],carregado:false};
    state.vitrineFotos={};
    closeModal();
    state.view='dashboard';
    render();
    showToast('Dados apagados.', 'success');
  }catch(e){
    console.error(e);
    const migrationPending=e&&/correcao segura de Apagar tudo/i.test(e.message||'');
    showToast(migrationPending?e.message:'Erro ao apagar. Tente novamente.', 'error');
  }
}

/* ---------- render principal ---------- */
/* Diz ao leitor de tela qual tela abriu. Chamado no fim do render.
   O atraso curto é necessário: a região viva só é lida se o texto
   mudar DEPOIS de ela estar no DOM. */
let _telaAnunciada = null;
function anunciarTela(){
  const alvo = document.getElementById('anuncioTela');
  if(!alvo) return;
  const titulo = document.querySelector('#app .page-title');
  const nome = titulo ? titulo.textContent.trim() : '';
  if(!nome || nome === _telaAnunciada) return;
  _telaAnunciada = nome;
  setTimeout(function(){ alvo.textContent = nome; }, 60);
}

/* Telas de tela cheia (sem a casca principal). Ao cair em qualquer uma
   delas, zeramos a assinatura para que a casca seja remontada quando o
   app voltar. */
function renderFullScreen(html){ _shellSignature=null; return html; }
function render(){
  const app = document.getElementById('app');
  setTimeout(anunciarTela, 0);
  if(state.vitrinePublicMode){
    app.innerHTML=renderFullScreen(renderVitrinePublicaPage());
    if(typeof prepararModalVitrinePublica==='function')setTimeout(prepararModalVitrinePublica,0);
    if(typeof prepararVitrinePublicaAposRender==='function')setTimeout(prepararVitrinePublicaAposRender,0);
    return;
  }
  if(state.publicMode){app.innerHTML=renderFullScreen(renderPublicListingsPage());return;}
  if(state.recovery){ app.innerHTML=renderFullScreen(renderRecoveryScreen()); return; }
  if(!state.session){ app.innerHTML=renderFullScreen(renderAuthScreen()); return; }
  if(state.loading){ app.innerHTML=renderFullScreen('<div class="app-loading">'+logoSvg()+'<span>Carregando seus dados…</span></div>'); return; }
  if(state.role==='tenant'){ app.innerHTML=renderFullScreen(renderTenantPortal()); return; }
  if(state.role==='pending'){ app.innerHTML=renderFullScreen(renderPendingAccess()); return; }
  if(state.role==='owner' && !commercialAccessAllowed(state.commercialAccess)){
    app.innerHTML=renderFullScreen(renderCommercialBlocked()); return;
  }
  if(state.role==='owner' && state.commercialAccess && !state.commercialAccess.termosAceitos){
    app.innerHTML=renderFullScreen(renderTermsGate());return;
  }
  if(nenhumModulo()){ app.innerHTML=renderFullScreen(renderSemModulo()); return; }
  /* Se a pessoa está numa área de um módulo que ela não tem
     (link antigo, favorito, troca de plano), volta para o dela. */
  const areaAlugueisSolicitada=['dashboard','pendencias','manutencoes','casas','proprietarios','inquilinos','interessados','energia',
    'financeiro','calendario','houseDetail'].includes(state.view);
  if(areaAlugueisSolicitada && !temModulo('alugueis')) state.view=viewInicial();
  if(state.view==='minhaCasa' && !temModulo('minhaCasa')) state.view=viewInicial();
  if(state.view==='vitrine' && !temModulo('vitrine')) state.view=viewInicial();

  const viewHtml=computeViewHtml();
  const sig=shellSignature();
  const existing=app.querySelector('.app-shell.main-shell');
  const viewRoot=existing?existing.querySelector('#viewRoot'):null;
  if(!existing || !viewRoot || sig!==_shellSignature){
    /* Monta (ou remonta) a casca inteira: barra lateral + cabeçalho +
       conteúdo. Só acontece quando o contexto muda (troca de app, de
       modo, de barra), não a cada navegação de página. */
    app.innerHTML=buildMainShell(viewHtml);
    _shellSignature=sig;
  } else {
    /* Mesma casca: troca só o conteúdo central e atualiza o destaque da
       navegação no lugar. Nada de recriar barra/cabeçalho — sem piscar. */
    viewRoot.innerHTML=renderMainContent(viewHtml);
    updateSidebarChrome();
    updateMobileNavChrome();
  }
  if(!state.loading && state.session){
    if(state.view==='casas' && typeof aplicarFiltroCasas==='function') aplicarFiltroCasas();
    if(state.view==='inquilinos' && typeof aplicarFiltroInq==='function') aplicarFiltroInq();
    if(typeof fitStatValues==='function') fitStatValues();
    manterAbaAtivaVisivel();
  }
}
/* Assinatura da casca: enquanto igual, a navegação só troca o conteúdo. */
function shellSignature(){
  return [currentAppKey(), isSimpleMode()?'s':'a', state.rentalSidebarCollapsed?'c':'e',
    state.offlineMode?'off':'', energyModuleEnabled()?'en':'',
    state.isPlatformAdmin?'pa':'', JSON.stringify(modulosDaConta())].join('|');
}
/* HTML da página do momento (só o miolo, sem a casca). */
function computeViewHtml(){
  return (state.view==='pendencias' ? renderPendenciasView() :
    state.view==='manutencoes' ? renderManutencoesView() :
    state.view==='casas' ? renderCasasView() :
    state.view==='proprietarios' ? renderProprietariosView() :
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
}
/* Envolve o conteúdo com os banners e o container próprio de cada app. */
function renderMainContent(viewHtml){
  const appKey=currentAppKey();
  if(appKey==='minhaCasa') return renderOfflineBanner()+viewHtml;
  if(appKey==='alugueis') return '<div class="rental-app">'+renderOfflineBanner()+renderOnboardingBanner()+
    renderExternalBackupReminder()+viewHtml+'</div>';
  return '<div class="rental-app">'+renderOfflineBanner()+
    (appKey==='vitrine'?'':renderOnboardingBanner()+renderExternalBackupReminder())+viewHtml+'</div>';
}
/* Casca principal completa: barra lateral estrutural + corpo. */
function buildMainShell(viewHtml){
  const appKey=currentAppKey();
  return '<div class="app-shell rental-shell main-shell '+(isSimpleMode()?'mode-simple':'mode-advanced')+
      (state.offlineMode?' is-offline':'')+'" data-app="'+appKey+'">'+
      renderAppSidebar()+
      '<div class="app-body">'+
        renderTopbarClean()+
        '<main class="main'+(appKey==='minhaCasa'?' minha-casa-main':'')+(appKey==='alugueis'?' rental-main':'')+'" id="viewRoot">'+
          renderMainContent(viewHtml)+
        '</main>'+
      '</div>'+
      renderMobileNav()+
    '</div>';
}

/* ---------- boot / sessão ---------- */
async function boot(){
  const params=new URLSearchParams(location.search);
  /* Vitrine pública: sem login, sem sessão, sem carregar nada do app. */
  const vitrineSlug=(typeof vitrineSlugDaUrlPublica==='function'
    ?vitrineSlugDaUrlPublica()
    :(params.get('vitrine')||'').trim());
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
        state.owners=data.owners||[];
        applyOwnerAppTheme();
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
        showToast('Não foi possível abrir o portal sem confirmar seu acesso pela internet.', 'error');
      }else if(cached&&cached.payload&&cached.payload.profile&&cached.payload.profile.role==='owner'){
        const payload=cached.payload,profile=payload.profile,data=payload.data||{};
        state.role='owner';state.access=null;state.ownerProfile=profile.owner||null;state.staffProfile=profile.staff||null;
        state.commercialAccess=profile.commercial||null;state.isPlatformAdmin=false;state.isPrimaryOwner=!profile.staff;
        state.houses=data.houses||[];state.tenants=data.tenants||[];state.interests=data.interests||[];state.eventos=data.eventos||[];
        state.owners=data.owners||[];
        state.config=data.config||state.config;state.tenantAccess=payload.tenantAccess||[];state.team=payload.team||[];
        state.offlineMode=true;state.offlineSavedAt=cached.savedAt||'';state.loaded=true;applyOwnerAppTheme();
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
  if(state.loaded&&!state.offlineMode&&state.role==='owner'&&canAdministerAccount()&&temModulo('alugueis')&&commercialAccessAllowed(state.commercialAccess)){ensureDailySnapshot();}
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

/* ------------------------------------------------------------------
   Navegação por seta nas barras de aba.

   As abas da Minha Casa declaram role="tablist"/role="tab". Isso faz
   o leitor de tela anunciar "aba 1 de 5" e o usuário esperar que as
   setas mudem de aba — mas não havia nada escutando, então a promessa
   não se cumpria. Marcar como aba e não dar teclado é pior do que não
   marcar.

   Vale também para as outras barras (.tabs, .rent-tabs, .tabs-pill),
   onde é ganho puro: hoje só dá para chegar nelas com Tab repetido.
   Home e End vão para a primeira e a última.
   ------------------------------------------------------------------ */
document.addEventListener('keydown', function(ev){
  const teclas = ['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','Home','End'];
  if(teclas.indexOf(ev.key) === -1) return;

  const alvo = ev.target;
  if(!alvo || alvo.tagName !== 'BUTTON') return;

  const barra = alvo.closest('.mh-tabs, .rent-tabs, .tabs, .tabs-pill, .house-edit-tabs, .portal-nav');
  if(!barra) return;

  const abas = Array.prototype.filter.call(
    barra.querySelectorAll('button'),
    function(b){ return !b.disabled; }
  );
  const i = abas.indexOf(alvo);
  if(i === -1) return;

  let destino;
  if(ev.key === 'Home') destino = 0;
  else if(ev.key === 'End') destino = abas.length - 1;
  else if(ev.key === 'ArrowRight' || ev.key === 'ArrowDown') destino = (i + 1) % abas.length;
  else destino = (i - 1 + abas.length) % abas.length;

  ev.preventDefault();
  /* No tablist ARIA usamos o modelo de ativação manual: a seta move
     o único ponto de Tab; Enter/Espaço (clique nativo do botão)
     abre a aba. Nas outras barras, apenas movemos o foco. */
  if(barra.getAttribute('role')==='tablist'){
    abas.forEach(function(b,idx){ b.setAttribute('tabindex',idx===destino?'0':'-1'); });
  }
  abas[destino].focus();
});

boot();
