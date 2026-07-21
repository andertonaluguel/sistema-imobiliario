/* ============================================================
   auth.js — Autenticação (Supabase Auth)
   Telas: entrar, criar conta, recuperar senha.
   Nenhum dado é acessível sem login (o app.js faz o gate).
   ============================================================ */

let authView = 'login'; // 'login' | 'signup' | 'reset'

function setAuthView(v){ authView = v; render(); }

function authShell(inner){
  return '<div class="auth-wrap"><div class="auth-card">'+
    '<div class="auth-brand">'+logoSvg()+'<span>Aluguel</span></div>'+
    inner+
  '</div><p class="auth-foot">Gestão de aluguéis · seus dados ficam protegidos por conta</p></div>';
}

function renderAuthScreen(){
  if(authView==='signup'){
    return authShell(
      '<h1 class="auth-title">Criar conta</h1>'+
      '<p class="auth-sub">Inquilino: use exatamente o e-mail que o proprietário liberou para você.</p>'+
      '<label class="field"><span>E-mail</span><input id="au_email" type="email" autocomplete="email" placeholder="voce@email.com"></label>'+
      '<label class="field"><span>Senha</span><input id="au_pass" type="password" autocomplete="new-password" placeholder="mínimo 6 caracteres"></label>'+
      '<button class="btn btn-primary auth-btn" onclick="doSignUp()">Criar conta</button>'+
      '<button class="auth-link" onclick="setAuthView(\'login\')">Já tenho conta — Entrar</button>'
    );
  }
  if(authView==='reset'){
    return authShell(
      '<h1 class="auth-title">Recuperar senha</h1>'+
      '<p class="auth-sub">Enviamos um link de redefinição para o seu e-mail.</p>'+
      '<label class="field"><span>E-mail</span><input id="au_email" type="email" autocomplete="email" placeholder="voce@email.com"></label>'+
      '<button class="btn btn-primary auth-btn" onclick="doSendReset()">Enviar link</button>'+
      '<button class="auth-link" onclick="setAuthView(\'login\')">Voltar para o login</button>'
    );
  }
  return authShell(
    '<h1 class="auth-title">Entrar</h1>'+
    '<p class="auth-sub">Acesse o painel de gestão ou o seu portal de inquilino.</p>'+
    '<label class="field"><span>E-mail</span><input id="au_email" type="email" autocomplete="email" placeholder="voce@email.com"></label>'+
    '<label class="field"><span>Senha</span><input id="au_pass" type="password" autocomplete="current-password" placeholder="sua senha"></label>'+
    '<button class="btn btn-primary auth-btn" onclick="doSignIn()">Entrar</button>'+
    '<div class="auth-links">'+
      '<button class="auth-link" onclick="setAuthView(\'reset\')">Esqueci minha senha</button>'+
      '<button class="auth-link" onclick="setAuthView(\'signup\')">Criar conta</button>'+
    '</div>'
  );
}

function _authInputs(){
  const email = (document.getElementById('au_email')||{}).value || '';
  const pass = (document.getElementById('au_pass')||{}).value || '';
  return { email:email.trim(), pass:pass };
}

async function doSignIn(){
  const { email, pass } = _authInputs();
  if(!email || !pass){ showToast('Informe e-mail e senha.', 'error'); return; }
  const { error } = await sb.auth.signInWithPassword({ email, password:pass });
  if(error){ showToast(traduzAuthErro(error.message), 'error'); return; }
  boot(); // recarrega com sessão
}

async function doSignUp(){
  const { email, pass } = _authInputs();
  if(!email || !pass){ showToast('Informe e-mail e senha.', 'error'); return; }
  if(pass.length < 6){ showToast('A senha precisa ter ao menos 6 caracteres.', 'error'); return; }
  const { data, error } = await sb.auth.signUp({ email, password:pass });
  if(error){ showToast(traduzAuthErro(error.message), 'error'); return; }
  if(data.session){
    showToast('Conta criada!', 'success');
    boot();
  } else {
    // projeto com confirmação de e-mail ativada
    showToast('Conta criada. Confirme pelo link enviado ao seu e-mail.', 'success');
    setAuthView('login');
  }
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
  await sb.auth.signOut();
  state.loaded = false;
  boot();
}

/* ---------- redefinição de senha (volta pelo link do e-mail) ---------- */
function renderRecoveryScreen(){
  return authShell(
    '<h1 class="auth-title">Definir nova senha</h1>'+
    '<p class="auth-sub">Escolha uma nova senha para a sua conta.</p>'+
    '<label class="field"><span>Nova senha</span><input id="rec_pass" type="password" autocomplete="new-password" placeholder="mínimo 6 caracteres"></label>'+
    '<label class="field"><span>Repita a nova senha</span><input id="rec_pass2" type="password" autocomplete="new-password" placeholder="repita a senha"></label>'+
    '<button class="btn btn-primary auth-btn" onclick="doUpdatePassword()">Salvar nova senha</button>'+
    '<button class="auth-link" onclick="cancelRecovery()">Cancelar</button>'
  );
}
async function doUpdatePassword(){
  const p1 = (document.getElementById('rec_pass')||{}).value || '';
  const p2 = (document.getElementById('rec_pass2')||{}).value || '';
  if(p1.length < 6){ showToast('A senha precisa de ao menos 6 caracteres.', 'error'); return; }
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
  if(msg.includes('password')) return 'Senha inválida (mínimo 6 caracteres).';
  return 'Não foi possível concluir. Tente novamente.';
}
