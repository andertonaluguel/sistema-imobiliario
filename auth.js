/* ============================================================
   auth.js — Autenticação (Supabase Auth)
   Telas: entrar, criar conta, recuperar senha.
   Nenhum dado é acessível sem login (o app.js faz o gate).
   ============================================================ */

let authView = 'login'; // 'login' | 'signup' | 'reset' | 'confirm'
let lastSignupEmail = '';
let authAccessType = loadAuthAccessType(); // 'admin' | 'tenant' | null

function loadAuthAccessType(){
  try{
    const saved=sessionStorage.getItem('aluguel_access_type');
    return saved==='admin'||saved==='tenant'?saved:null;
  }catch(e){ return null; }
}
function saveAuthAccessType(type){
  authAccessType=type==='admin'||type==='tenant'?type:null;
  try{
    if(authAccessType)sessionStorage.setItem('aluguel_access_type',authAccessType);
    else sessionStorage.removeItem('aluguel_access_type');
  }catch(e){}
}
function chooseAuthAccess(type){ saveAuthAccessType(type);authView='login';render(); }
function changeAuthAccess(){ saveAuthAccessType(null);authView='login';render(); }
function setAuthView(v){ authView = v; render(); }
function authAccessLabel(){ return authAccessType==='tenant'?'Inquilino':'Administrador'; }
function authAccessMatchesProfile(profile){
  if(!authAccessType||!profile)return true;
  if(authAccessType==='tenant')return profile.role==='tenant'||profile.role==='pending';
  return profile.role==='owner';
}
function authAccessMismatchMessage(){
  return authAccessType==='tenant'
    ? 'Este e-mail pertence a um acesso de administrador. Volte e escolha Administrador.'
    : 'Este e-mail pertence a um inquilino. Volte e escolha Inquilino.';
}

function authShell(inner){
  return '<div class="auth-wrap"><div class="auth-card">'+
    '<div class="auth-brand">'+logoSvg()+'<span>Aluguel</span></div>'+ 
    inner+
  '</div>'+
  '<a class="auth-marketing-link" href="marketing/landing-page/">Conheça o produto antes de entrar</a>'+ 
  '<p class="auth-foot">Gestão de aluguéis · seus dados ficam protegidos por conta · '+esc(CONFIG.APP_VERSION)+'</p></div>';
}

function renderAuthScreen(){
  if(!authAccessType){
    return authShell(
      '<div class="auth-access-intro"><span class="auth-kicker">TIPO DE ACESSO</span>'+
      '<h1 class="auth-title">Como você quer entrar?</h1>'+
      '<p class="auth-sub">Escolha a área correta antes de informar seu e-mail e sua senha.</p></div>'+
      '<div class="auth-access-grid">'+
        '<button class="auth-access-card" onclick="chooseAuthAccess(\'admin\')">'+
          '<span class="auth-access-tag">GESTÃO</span><strong>Administrador</strong>'+
          '<small>Para Mestre, proprietários e equipe administrativa.</small><b>Continuar</b></button>'+
        '<button class="auth-access-card tenant" onclick="chooseAuthAccess(\'tenant\')">'+
          '<span class="auth-access-tag">PORTAL</span><strong>Inquilino</strong>'+
          '<small>Somente informações do aluguel vinculadas ao seu cadastro.</small><b>Continuar</b></button>'+
      '</div>'
    );
  }
  if(authView==='signup'){
    const tenant=authAccessType==='tenant';
    return authShell(
      '<div class="auth-role-line"><span class="auth-role-badge '+(tenant?'tenant':'admin')+'">'+authAccessLabel()+'</span><button onclick="changeAuthAccess()">Trocar acesso</button></div>'+
      '<h1 class="auth-title">'+(tenant?'Criar acesso de inquilino':'Criar conta de administrador')+'</h1>'+ 
      '<p class="auth-sub">'+(tenant?'Use exatamente o e-mail informado ao administrador do imóvel. Esta conta não possui plano de casas.':'Comece com o plano Gratuito de 1 casa. Se recebeu um convite comercial, use exatamente o e-mail liberado.')+'</p>'+ 
      '<label class="field"><span>E-mail</span><input id="au_email" type="email" autocomplete="email" placeholder="voce@email.com" onkeydown="authEnter(event)"></label>'+ 
      '<label class="field"><span>Senha</span><input id="au_pass" type="password" autocomplete="new-password" placeholder="mínimo 8 caracteres, com letra e número" onkeydown="authEnter(event)"></label>'+ 
      '<label class="auth-consent"><input id="au_terms" type="checkbox"><span>Li e concordo com os <button type="button" onclick="openPublicTerms()">Termos de Uso e Aviso de Privacidade</button>.</span></label>'+ 
      '<button class="btn btn-primary auth-btn" onclick="doSignUp()">'+(tenant?'Criar acesso de inquilino':'Criar conta')+'</button>'+ 
      '<button class="auth-link" onclick="setAuthView(\'login\')">Já tenho conta — Entrar</button>'
    );
  }
  if(authView==='confirm'){
    return authShell('<div class="auth-role-line"><span class="auth-role-badge '+authAccessType+'">'+authAccessLabel()+'</span><button onclick="changeAuthAccess()">Trocar acesso</button></div>'+
      '<h1 class="auth-title">Confirme seu e-mail</h1><p class="auth-sub">Enviamos o link para <strong>'+esc(lastSignupEmail)+'</strong>. Abra a mensagem para ativar a conta.</p>'+ 
      '<button class="btn btn-primary auth-btn" onclick="resendSignupConfirmation()">Reenviar confirmação</button>'+ 
      '<button class="auth-link" onclick="setAuthView(\'login\')">Voltar para o login</button>');
  }
  if(authView==='reset'){
    return authShell(
      '<div class="auth-role-line"><span class="auth-role-badge '+authAccessType+'">'+authAccessLabel()+'</span><button onclick="changeAuthAccess()">Trocar acesso</button></div>'+
      '<h1 class="auth-title">Recuperar senha</h1>'+
      '<p class="auth-sub">Enviamos um link de redefinição para o seu e-mail.</p>'+
      '<label class="field"><span>E-mail</span><input id="au_email" type="email" autocomplete="email" placeholder="voce@email.com" onkeydown="authEnter(event)"></label>'+
      '<button class="btn btn-primary auth-btn" onclick="doSendReset()">Enviar link</button>'+
      '<button class="auth-link" onclick="setAuthView(\'login\')">Voltar para o login</button>'
    );
  }
  return authShell(
    '<div class="auth-role-line"><span class="auth-role-badge '+authAccessType+'">'+authAccessLabel()+'</span><button onclick="changeAuthAccess()">Trocar acesso</button></div>'+
    '<h1 class="auth-title">Entrar como '+authAccessLabel()+'</h1>'+
    '<p class="auth-sub">'+(authAccessType==='tenant'?'Acesse somente seus dados de contrato, pagamentos, energia e arquivos liberados.':'Acesse a gestão de imóveis. A conta Mestre é reconhecida automaticamente.')+'</p>'+
    '<label class="field"><span>E-mail</span><input id="au_email" type="email" autocomplete="email" placeholder="voce@email.com" onkeydown="authEnter(event)"></label>'+
    '<label class="field"><span>Senha</span><input id="au_pass" type="password" autocomplete="current-password" placeholder="sua senha" onkeydown="authEnter(event)"></label>'+
    '<button class="btn btn-primary auth-btn" onclick="doSignIn()">Entrar</button>'+
    '<div class="auth-links">'+
      '<button class="auth-link" onclick="setAuthView(\'reset\')">Esqueci minha senha</button>'+
      '<button class="auth-link" onclick="setAuthView(\'signup\')">'+(authAccessType==='tenant'?'Criar acesso':'Criar conta')+'</button>'+
    '</div>'
  );
}

function _authInputs(){
  const email = (document.getElementById('au_email')||{}).value || '';
  const pass = (document.getElementById('au_pass')||{}).value || '';
  return { email:email.trim(), pass:pass };
}

/* Enter envia a tela em que a pessoa está. As telas de acesso são montadas
   sem <form>, então o envio nativo do Enter não existe: sem isto o botão
   "Ir" do teclado do celular não faz nada e no computador é preciso
   alcançar o botão com o mouse. A tela de nova senha vem pelo link do
   e-mail e não passa por authView — por isso é reconhecida pelo campo. */
function authEnter(ev){
  if(ev.key!=='Enter') return;
  ev.preventDefault();
  if(document.getElementById('rec_pass')){ doUpdatePassword(); return; }
  if(authView==='signup'){ doSignUp(); return; }
  if(authView==='reset'){ doSendReset(); return; }
  doSignIn();
}

async function doSignIn(){
  if(!authAccessType){ changeAuthAccess();return; }
  const { email, pass } = _authInputs();
  if(!email || !pass){ showToast('Informe e-mail e senha.', 'error'); return; }
  const { error } = await sb.auth.signInWithPassword({ email, password:pass });
  if(error){
    if(String(error.message||'').toLowerCase().includes('email not confirmed')){lastSignupEmail=email.trim().toLowerCase();authView='confirm';render();}
    showToast(traduzAuthErro(error.message), 'error'); return;
  }
  boot(); // recarrega com sessão
}

async function doSignUp(){
  if(!authAccessType){ changeAuthAccess();return; }
  const { email, pass } = _authInputs();
  if(!email || !pass){ showToast('Informe e-mail e senha.', 'error'); return; }
  if(pass.length < 8 || !/[A-Za-zÀ-ÿ]/.test(pass) || !/\d/.test(pass)){ showToast('Use ao menos 8 caracteres, com uma letra e um número.', 'error'); return; }
  const terms=document.getElementById('au_terms');
  if(!terms||!terms.checked){showToast('Leia e aceite os termos para continuar.','error');return;}
  const { data, error } = await sb.auth.signUp({ email, password:pass, options:{emailRedirectTo:window.location.origin,data:{terms_version:'1.0',account_type:authAccessType}} });
  if(error){ showToast(traduzAuthErro(error.message), 'error'); return; }
  if(data.session){
    showToast('Conta criada!', 'success');
    boot();
  } else {
    // projeto com confirmação de e-mail ativada
    lastSignupEmail=email.trim().toLowerCase();
    showToast('Conta criada. Confirme pelo link enviado ao seu e-mail.', 'success');
    setAuthView('confirm');
  }
}

async function resendSignupConfirmation(){
  if(!lastSignupEmail){setAuthView('signup');return;}
  const {error}=await sb.auth.resend({type:'signup',email:lastSignupEmail,options:{emailRedirectTo:window.location.origin}});
  if(error){showToast(traduzAuthErro(error.message),'error');return;}
  showToast('Novo e-mail de confirmação enviado.','success');
}

async function doSendReset(){
  const { email } = _authInputs();
  if(!email){ showToast('Informe o e-mail.', 'error'); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  if(error){ showToast(traduzAuthErro(error.message), 'error'); return; }
  showToast('Se o e-mail existir, o link de redefinição foi enviado.', 'success');
  setAuthView('login');
}

async function doSignOut(){
  const uid=state.session&&state.session.user?state.session.user.id:'';
  if(uid&&typeof offlineCache!=='undefined') await offlineCache.remove(uid).catch(function(){});
  await sb.auth.signOut();
  if(typeof resetMinhaCasaUI==='function') resetMinhaCasaUI();
  saveAuthAccessType(null);
  authView = 'login';
  state.loaded = false;
  boot();
}

/* ---------- redefinição de senha (volta pelo link do e-mail) ---------- */
function renderRecoveryScreen(){
  return authShell(
    '<h1 class="auth-title">Definir nova senha</h1>'+
    '<p class="auth-sub">Escolha uma nova senha para a sua conta.</p>'+
    '<label class="field"><span>Nova senha</span><input id="rec_pass" type="password" autocomplete="new-password" placeholder="mínimo 8 caracteres, com letra e número" onkeydown="authEnter(event)"></label>'+ 
    '<label class="field"><span>Repita a nova senha</span><input id="rec_pass2" type="password" autocomplete="new-password" placeholder="repita a senha" onkeydown="authEnter(event)"></label>'+
    '<button class="btn btn-primary auth-btn" onclick="doUpdatePassword()">Salvar nova senha</button>'+
    '<button class="auth-link" onclick="cancelRecovery()">Cancelar</button>'
  );
}
async function doUpdatePassword(){
  const p1 = (document.getElementById('rec_pass')||{}).value || '';
  const p2 = (document.getElementById('rec_pass2')||{}).value || '';
  if(p1.length < 8 || !/[A-Za-zÀ-ÿ]/.test(p1) || !/\d/.test(p1)){ showToast('Use ao menos 8 caracteres, com uma letra e um número.', 'error'); return; }
  if(p1 !== p2){ showToast('As senhas não conferem.', 'error'); return; }
  const { error } = await sb.auth.updateUser({ password: p1 });
  if(error){ showToast(traduzAuthErro(error.message), 'error'); return; }
  state.recovery = false;
  showToast('Senha alterada com sucesso.', 'success');
  state.loaded = false;
  boot();
}
function cancelRecovery(){
  state.recovery = false;
  if(state.session && !state.loaded){ boot(); } else { render(); }
}

/* mensagens de erro do Supabase em português */
function traduzAuthErro(msg){
  msg = (msg||'').toLowerCase();
  if(msg.includes('invalid login')) return 'E-mail ou senha incorretos.';
  if(msg.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if(msg.includes('already registered') || msg.includes('already been registered')) return 'Esse e-mail já tem conta. Tente entrar.';
  if(msg.includes('rate limit') || msg.includes('too many')) return 'Muitas tentativas. Aguarde um pouco.';
  if(msg.includes('password')) return 'Senha inválida. Use ao menos 8 caracteres, com letra e número.';
  return 'Não foi possível concluir. Tente novamente.';
}
