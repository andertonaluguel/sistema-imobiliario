/* ============================================================
   commercial.js — vendas, planos e administração da plataforma
   ============================================================ */

function commercialPlan(plan){ return (CONFIG.PLANOS&&CONFIG.PLANOS[plan])||CONFIG.PLANOS.gratuito; }
function valueOf(id){const el=document.getElementById(id);return el?String(el.value||''):'';}
function commercialPlanLabel(plan){ return commercialPlan(plan).nome; }
function commercialStatusLabel(status){
  return ({ativa:'Ativa',suspensa:'Suspensa',cancelada:'Cancelada',aguardando_pagamento:'Aguardando pagamento',
    pendente:'Aguardando cadastro',aceito:'Ativado',cancelado:'Cancelado',expirado:'Expirado'})[status]||status||'—';
}
function commercialStatusTone(status){
  if(status==='ativa'||status==='aceito')return 'ok';
  if(status==='aguardando_pagamento'||status==='pendente')return 'warn';
  return 'danger';
}
function commercialAccessAllowed(access){return !!(access&&(access.administradorPlataforma||access.podeAcessar));}
function commercialDate(value){return value?fmtDateBR(String(value).slice(0,10)):'—';}
function commercialBytes(value){
  value=Number(value)||0;if(value<1024*1024)return Math.max(0,Math.round(value/1024))+' KB';
  if(value<1024*1024*1024)return (value/(1024*1024)).toFixed(value<10*1024*1024?1:0)+' MB';
  return (value/(1024*1024*1024)).toFixed(1)+' GB';
}
function commercialPlanOptions(selected){
  return ['gratuito','basico','premium'].map(function(p){const plan=commercialPlan(p);return '<option value="'+p+'"'+(selected===p?' selected':'')+'>'+plan.nome+' — '+plan.casas+' casa(s)</option>';}).join('');
}

function renderCommercialBlocked(){
  const access=state.commercialAccess||{};
  return '<div class="commercial-gate"><div class="commercial-gate-card">'+logoSvg()+
    '<span class="eyebrow">ACESSO DA CONTA</span><h1>'+esc(commercialStatusLabel(access.status))+'</h1><p>'+
    (access.status==='suspensa'?'Esta conta está temporariamente suspensa. Os dados continuam preservados.':
      'Esta conta não está ativa. Entre em contato com o suporte para verificar o acesso.')+'</p>'+supportContactButton('Falar com o suporte')+
    '<button class="btn btn-ghost" onclick="doSignOut()">Sair da conta</button></div></div>';
}

function renderCommercialView(){
  if(!state.isPlatformAdmin)return renderDashboard();
  const accounts=state.commercialAccounts||[],sales=state.commercialInvites||[];
  const clients=accounts.filter(function(a){return !a.isPlatformAdmin;});
  return '<section class="commercial-page"><div class="commercial-hero"><div><span class="eyebrow">ÁREA COMERCIAL EXCLUSIVA</span>'+pageTitleWithIcon(dashIconSvg(),'Clientes proprietários')+
    '<p class="page-sub">Clientes são proprietários que usam o aplicativo para administrar imóveis.</p></div><div class="commercial-hero-actions">'+ 
    '<button class="btn btn-ghost" onclick="exportCommercialClients()">Exportar clientes</button><button class="btn btn-primary" onclick="openNewCommercialAdminModal()">+ Nova venda</button></div></div>'+ 
    '<div class="commercial-role-note"><span aria-hidden="true">i</span><div><strong>Clientes proprietários e inquilinos são cadastros diferentes</strong><p>Somente proprietários compradores aparecem aqui e possuem plano. Moradores ficam na aba Inquilinos e nunca recebem plano.</p></div><button class="btn btn-ghost btn-small" onclick="irInquilinos()">Abrir Inquilinos</button></div>'+
    '<div class="commercial-stats">'+renderCommercialStat(clients.filter(function(a){return a.status==='ativa';}).length,'Proprietários ativos','accent')+
    renderCommercialStat(clients.filter(function(a){return a.plano==='gratuito';}).length,'Plano gratuito','')+
    renderCommercialStat(clients.filter(function(a){return a.plano==='basico';}).length,'Básicos','')+
    renderCommercialStat(clients.filter(function(a){return a.plano==='premium';}).length,'Premium','')+
    renderCommercialStat(sales.filter(function(s){return s.status==='aguardando_pagamento';}).length,'Pagamentos pendentes','warn')+'</div>'+ 
    renderCommercialSnapshot()+renderCommercialValoresClientes()+
    renderCommercialAccounts(clients)+renderCommercialSales(sales)+renderCommercialAudit()+'</section>';
}

function renderCommercialStat(value,label,tone){return '<div class="commercial-stat '+(tone||'')+'"><strong>'+Number(value||0)+'</strong><span>'+esc(label)+'</span></div>';}
/* variante para dinheiro: o valor já vem formatado */
function renderCommercialStatMoney(value,label,tone,nota){
  return '<div class="commercial-stat '+(tone||'')+'"><strong class="num">'+value+'</strong>'+
    '<span>'+esc(label)+'</span>'+(nota?'<small>'+esc(nota)+'</small>':'')+'</div>';
}

/* ------------------------------------------------------------------
   Retrato comercial honesto.

   valorPago é apenas o valor informado no cadastro/venda inicial.
   Como ainda não existe periodicidade nem livro de cobranças, ele não
   pode ser chamado de MRR, faturamento acumulado ou receita do mês.
   Esta tela mostra somente fatos que o banco realmente guarda.
   ------------------------------------------------------------------ */
function computeCommercialSnapshot(){
  const contas=(state.commercialAccounts||[]).filter(function(a){return !a.isPlatformAdmin;});
  const vendas=state.commercialInvites||[];

  const pagantes=contas.filter(function(a){
    return a.status==='ativa' && a.plano && a.plano!=='gratuito' && (Number(a.valorPago)||0)>0;
  });
  /* Distribuição de clientes, não distribuição de receita. */
  const porPlano={};
  pagantes.forEach(function(a){
    porPlano[a.plano]=porPlano[a.plano]||{n:0};
    porPlano[a.plano].n++;
  });

  /* Convites/vendas iniciais com confirmação explícita de pagamento. */
  const confirmadas=vendas.filter(function(v){
    return v.pagamentoStatus==='confirmado';
  });
  const valorInicialConfirmado=confirmadas.reduce(function(s,v){
    return s+(Number(v.valorPago)||0);
  },0);

  const aguardando=vendas.filter(function(v){return v.status==='aguardando_pagamento';});
  const valorAguardando=aguardando.reduce(function(s,v){
    return s+(Number(v.valorPago)||0);
  },0);

  return {
    pagantes:pagantes.length,
    gratuitos: contas.filter(function(a){return a.plano==='gratuito';}).length,
    porPlano:porPlano,
    vendasConfirmadas:confirmadas.length,
    valorInicialConfirmado:valorInicialConfirmado,
    aguardando:aguardando.length,
    valorAguardando:valorAguardando,
    contas:contas
  };
}

function renderCommercialSnapshot(){
  const r=computeCommercialSnapshot();

  const linhasPlano=Object.keys(r.porPlano).sort(function(a,b){
    return r.porPlano[b].n-r.porPlano[a].n;
  }).map(function(p){
    const d=r.porPlano[p];
    const fatia=r.pagantes?Math.round((d.n/r.pagantes)*100):0;
    return '<div class="receita-linha">'+
      '<span class="receita-plano">'+esc(commercialPlanLabel(p))+'</span>'+
      '<span class="receita-barra"><span style="width:'+fatia+'%"></span></span>'+
      '<span class="receita-valor num">'+d.n+'</span>'+
      '<span class="receita-n">cliente'+(d.n===1?'':'s')+' · '+fatia+'%</span>'+
    '</div>';
  }).join('');

  return '<div class="commercial-panel"><div class="commercial-panel-head">'+
      '<div><h2>Retrato comercial</h2><p>Contagens reais e valores das vendas iniciais. Receita recorrente depende de cadastrar periodicidade e cobranças.</p></div></div>'+
    '<div class="commercial-stats receita-stats">'+
      renderCommercialStat(r.pagantes,'Clientes pagos ativos','accent')+
      renderCommercialStat(r.gratuitos,'Clientes no gratuito','')+
      renderCommercialStatMoney(fmtMoney(r.valorInicialConfirmado),'Vendas iniciais confirmadas','',r.vendasConfirmadas+' registro(s)')+
      (r.aguardando?renderCommercialStatMoney(fmtMoney(r.valorAguardando),'Aguardando confirmação','warn',r.aguardando+' venda(s) em aberto'):'')+
    '</div>'+
    (linhasPlano?'<div class="receita-planos">'+linhasPlano+'</div>':
      '<div class="empty-state">Nenhum cliente pagante ainda.</div>')+
  '</div>';
}

/* Valor de referência informado em cada cadastro. Não é histórico de
   faturamento e não entra no cálculo de receita recorrente. */
function renderCommercialValoresClientes(){
  const r=computeCommercialSnapshot();
  const linhas=r.contas.filter(function(a){return (Number(a.valorPago)||0)>0;})
    .sort(function(a,b){ return (Number(b.valorPago)||0)-(Number(a.valorPago)||0); });
  if(!linhas.length) return '';

  return '<div class="commercial-panel"><div class="commercial-panel-head">'+
      '<div><h2>Valor cadastrado por cliente</h2><p>Referência da venda inicial. Não representa mensalidade nem faturamento acumulado.</p></div></div>'+
    '<div class="commercial-table-wrap"><table class="commercial-table">'+
      '<thead><tr><th>Cliente</th><th>Plano</th><th>Situação</th><th>Valor informado</th><th>Cliente desde</th></tr></thead><tbody>'+
      linhas.map(function(a){
        const v=Number(a.valorPago)||0;
        return '<tr><td><strong>'+esc(a.empresa||a.nome)+'</strong><span>'+esc(a.email)+'</span></td>'+
          '<td><span class="plan-pill '+esc(a.plano)+'">'+esc(commercialPlanLabel(a.plano))+'</span></td>'+
          '<td><span class="commercial-status '+commercialStatusTone(a.status)+'">'+esc(commercialStatusLabel(a.status))+'</span></td>'+
          '<td class="num">'+fmtMoney(v)+'</td>'+
          '<td class="num">'+(a.criadoEm?fmtDateBR(a.criadoEm.slice(0,10)):'—')+'</td></tr>';
      }).join('')+
    '</tbody></table></div></div>';
}

function renderCommercialAccounts(clients){
  return '<div class="commercial-panel"><div class="commercial-panel-head"><div><h2>Contas de proprietários</h2><p>O plano e o uso pertencem ao proprietário comprador, nunca ao inquilino.</p></div><button class="btn btn-ghost btn-small" onclick="refreshCommercialDashboard()">Atualizar</button></div>'+ 
    (clients.length?'<div class="commercial-table-wrap"><table class="commercial-table"><thead><tr><th>Proprietário cliente</th><th>Módulos</th><th>Plano</th><th>Situação</th><th>Casas</th><th>Armazenamento</th><th></th></tr></thead><tbody>'+clients.map(renderCommercialAccountRow).join('')+'</tbody></table></div>':
      '<div class="commercial-empty"><strong>Nenhum proprietário cliente ativado</strong><span>Registre uma venda para começar.</span></div>')+'</div>';
}

function renderCommercialAccountRow(account){
  const siglas={alugueis:'A',minha_casa:'MC',vitrine:'V'};
  const modulos=(CONFIG.MODULOS||[]).map(function(mod){
    const on=clienteTemModulo(account.userId,mod.chave);
    return '<span class="chip '+(on?'chip-brass':'chip-slate')+'" title="'+esc(mod.nome)+(on?' — liberado':' — não contratado')+'">'+
      siglas[mod.chave]+'</span>';
  }).join(' ');
  return '<tr><td><strong>'+esc(account.empresa||account.nome||'Cliente')+'</strong><span>'+esc(account.email||'')+'</span></td>'+
    '<td>'+modulos+'</td>'+
    '<td><span class="plan-pill '+account.plano+'">'+commercialPlanLabel(account.plano)+'</span></td>'+
    '<td><span class="commercial-status '+commercialStatusTone(account.status)+'">'+commercialStatusLabel(account.status)+'</span></td>'+ 
    '<td><strong>'+Number(account.quantidadeImoveis||0)+' / '+Number(account.limiteImoveis||1)+'</strong></td>'+ 
    '<td>'+commercialBytes(account.armazenamentoUsado)+' / '+commercialBytes(account.limiteArmazenamento)+'</td>'+ 
    '<td><button class="btn btn-ghost btn-small" onclick="openEditCommercialAccountModal(\''+account.userId+'\')">Gerenciar</button></td></tr>';
}

function renderCommercialSales(sales){
  const open=sales.filter(function(s){return s.status==='aguardando_pagamento'||s.status==='pendente';});
  return '<div class="commercial-panel"><div class="commercial-panel-head"><div><h2>Vendas e convites</h2><p>O convite só é liberado depois da confirmação do pagamento.</p></div></div>'+ 
    (open.length?'<div class="invite-grid">'+open.map(function(s){
      const awaiting=s.status==='aguardando_pagamento';
      return '<article class="invite-card"><div><span class="commercial-status '+commercialStatusTone(s.status)+'">'+commercialStatusLabel(s.status)+'</span><span class="plan-pill '+s.plano+'">'+commercialPlanLabel(s.plano)+'</span></div>'+ 
        '<h3>'+esc(s.empresa||s.nome)+'</h3><p>'+esc(s.email)+'</p><small>'+fmtMoney(s.valorPago)+(s.formaPagamento?' · '+esc(s.formaPagamento):'')+'</small>'+ 
        '<div class="invite-actions">'+(awaiting?'<button class="btn btn-primary btn-small" onclick="confirmCommercialPayment(\''+s.id+'\')">Confirmar pagamento</button>':
          '<button class="btn btn-ghost btn-small" onclick="copyCommercialInvite(\''+s.id+'\')">Copiar instruções</button>')+
        '<button class="btn btn-danger btn-small" onclick="cancelCommercialInvite(\''+s.id+'\')">Cancelar</button></div></article>';
    }).join('')+'</div>':'<div class="commercial-empty compact"><span>Nenhuma venda pendente.</span></div>')+'</div>';
}

function renderPlatformAdmins(){
  const admins=state.platformAdmins||[];
  return '<div class="commercial-panel"><div class="commercial-panel-head"><div><h2>Administradores de emergência</h2><p>Mantenha uma segunda conta para recuperação da área Comercial.</p></div><button class="btn btn-ghost btn-small" onclick="openAddPlatformAdminModal()">+ Adicionar</button></div>'+ 
    '<div class="admin-list">'+admins.map(function(a){return '<div class="admin-row"><span><strong>'+esc(a.email||'Administrador')+'</strong><small>Administrador da plataforma</small></span>'+ 
      ((state.session&&state.session.user&&state.session.user.id)!==a.userId?'<button class="btn btn-danger btn-small" onclick="removePlatformAdmin(\''+a.userId+'\')">Remover</button>':'<span class="commercial-status ok">Você</span>')+'</div>';}).join('')+'</div></div>';
}

function renderCommercialAudit(){
  const items=(state.commercialAudit||[]).slice(0,20);
  const labels={venda_criada:'Venda registrada',pagamento_confirmado:'Pagamento confirmado',cliente_ativado:'Cliente ativado',
    cliente_atualizado:'Cliente atualizado',venda_cancelada:'Venda cancelada',administrador_adicionado:'Administrador adicionado',administrador_removido:'Administrador removido'};
  return '<div class="commercial-panel"><div class="commercial-panel-head"><div><h2>Histórico comercial</h2><p>Últimas alterações realizadas pela conta Mestre.</p></div></div>'+ 
    (items.length?'<div class="audit-list">'+items.map(function(a){return '<div class="audit-row"><span><strong>'+esc(labels[a.acao]||a.acao)+'</strong><small>'+esc(a.clienteEmail||a.administradorEmail||'Plataforma')+'</small></span><time>'+commercialDate(a.createdAt)+'</time></div>';}).join('')+'</div>':'<div class="commercial-empty compact"><span>Nenhuma alteração registrada.</span></div>')+'</div>';
}

function openNewCommercialAdminModal(){
  openModal('<h3 class="modal-title">Registrar venda para proprietário</h3><p class="modal-text">Use esta área somente para quem comprará o aplicativo para administrar casas. Inquilinos são cadastrados na aba Inquilinos.</p>'+ 
    '<div class="field-row"><label class="field"><span>Nome do proprietário</span><input id="com_name" maxlength="160"></label><label class="field"><span>Empresa (opcional)</span><input id="com_company" maxlength="160"></label></div>'+ 
    '<div class="field-row"><label class="field"><span>E-mail</span><input id="com_email" type="email"></label><label class="field"><span>Telefone/WhatsApp</span><input id="com_phone" maxlength="40"></label></div>'+ 
    '<div class="field-row"><label class="field"><span>CPF/CNPJ</span><input id="com_document" maxlength="80"></label><label class="field"><span>Plano</span><select id="com_plan">'+commercialPlanOptions('basico')+'</select></label></div>'+ 
    '<div class="field-row"><label class="field"><span>Valor pago (R$)</span><input id="com_value" type="number" min="0" step="0.01"></label><label class="field"><span>Forma de pagamento</span><input id="com_payment" placeholder="Ex.: PIX"></label></div>'+ 
    '<label class="field"><span>Referência do comprovante</span><input id="com_reference" maxlength="180"></label>'+ 
    '<label class="field"><span>Observações</span><textarea id="com_notes" maxlength="2000"></textarea></label>'+ 
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="com_save" onclick="saveCommercialInvite()">Registrar venda</button></div>');
}

async function saveCommercialInvite(){
  const sale={nome:valueOf('com_name').trim(),empresa:valueOf('com_company').trim(),email:valueOf('com_email').trim().toLowerCase(),
    telefone:valueOf('com_phone').trim(),documento:valueOf('com_document').trim(),plano:valueOf('com_plan')||'basico',
    valorPago:Number(valueOf('com_value'))||0,formaPagamento:valueOf('com_payment').trim(),referenciaPagamento:valueOf('com_reference').trim(),observacoes:valueOf('com_notes').trim()};
  if(!sale.nome){showToast('Informe o nome do proprietário.','error');return;}
  if(!sale.email||!emailValido(sale.email)){showToast('Informe um e-mail válido.','error');return;}
  const button=document.getElementById('com_save');if(button){button.disabled=true;button.textContent='Salvando…';}
  try{await db.createCommercialSale(sale);closeModal();await refreshCommercialDashboard();showToast(sale.plano==='gratuito'?'Acesso gratuito registrado.':'Venda registrada. Confirme o pagamento para liberar o convite.','success');}
  catch(e){console.error(e);showToast((e&&e.message)||'Não foi possível registrar a venda.','error');if(button){button.disabled=false;button.textContent='Registrar venda';}}
}

async function confirmCommercialPayment(id){
  if(!confirm('Confirmar que o pagamento foi recebido e liberar este acesso?'))return;
  try{await db.confirmCommercialPayment(id);await refreshCommercialDashboard();showToast('Pagamento confirmado. O acesso já pode ser criado.','success');}
  catch(e){console.error(e);showToast((e&&e.message)||'Não foi possível confirmar.','error');}
}

/* ---------- módulos vendidos ----------
   O módulo diz O QUE o cliente acessa; o plano diz QUANTO ele usa.
   São eixos independentes: dá para ter Vitrine no plano Básico. */
function licencasDoCliente(userId){
  return (state.commercialLicenses||[]).filter(function(l){return l.userId===userId;});
}
function clienteTemModulo(userId,chave){
  return licencasDoCliente(userId).some(function(l){
    return l.modulo===chave && (l.status==='ativa'||l.status==='avaliacao') &&
      (!l.expiraEm || l.expiraEm>=todayISO());
  });
}
function renderModulosCliente(userId){
  return '<div class="form-section-title">Módulos — o que este cliente acessa</div>'+
    '<p class="modal-text">A área Comercial nunca é vendida: ela é o seu balcão.</p>'+
    (CONFIG.MODULOS||[]).map(function(mod){
      const ativo=clienteTemModulo(userId,mod.chave);
      return '<label class="field-check module-toggle"><input type="checkbox" id="com_mod_'+mod.chave+'"'+(ativo?' checked':'')+'>'+
        '<span><strong>'+esc(mod.nome)+'</strong><small>'+esc(mod.descricao)+'</small></span></label>';
    }).join('')+
    '<label class="field"><span>Vencimento dos módulos (vazio = não expira)</span>'+
    '<input id="com_mod_expira" type="date"></label>';
}
async function salvarModulosCliente(userId){
  const alvos=(CONFIG.MODULOS||[]);
  const expira=(document.getElementById('com_mod_expira')||{}).value||null;
  for(const mod of alvos){
    const campo=document.getElementById('com_mod_'+mod.chave);
    if(!campo) continue;
    const querAtivo=!!campo.checked, jaAtivo=clienteTemModulo(userId,mod.chave);
    if(querAtivo===jaAtivo) continue;
    await db.setModuleLicense(userId,mod.chave,querAtivo?'ativa':'cancelada',querAtivo?expira:null);
  }
}

function openEditCommercialAccountModal(userId){
  const a=(state.commercialAccounts||[]).find(function(x){return x.userId===userId;});if(!a)return;
  openModal('<div class="commercial-owner-summary"><span>CLIENTE PROPRIETÁRIO</span><h3 class="modal-title">Gerenciar proprietário</h3><p><strong>'+esc(a.nome)+'</strong><br>'+esc(a.email)+'</p><small>Este cadastro compra e utiliza o aplicativo. Não é um inquilino.</small></div>'+
    renderModulosCliente(userId)+
    '<div class="form-section-title">Plano — quanto ele pode usar</div>'+
    '<div class="field-row"><label class="field"><span>Plano</span><select id="com_edit_plan">'+commercialPlanOptions(a.plano)+'</select></label>'+ 
    '<label class="field"><span>Situação</span><select id="com_edit_status">'+['ativa','suspensa','cancelada'].map(function(s){return '<option value="'+s+'"'+(a.status===s?' selected':'')+'>'+commercialStatusLabel(s)+'</option>';}).join('')+'</select></label></div>'+ 
    '<div class="form-section-title">Dados comerciais</div>'+
    '<div class="field-row"><label class="field"><span>Telefone/WhatsApp</span><input id="com_edit_phone" value="'+esc(a.telefone)+'"></label><label class="field"><span>CPF/CNPJ</span><input id="com_edit_document" value="'+esc(a.documento)+'"></label></div>'+ 
    '<label class="field"><span>Empresa</span><input id="com_edit_company" value="'+esc(a.empresa)+'"></label>'+ 
    '<div class="field-row"><label class="field"><span>Valor pago (R$)</span><input id="com_edit_value" type="number" min="0" step="0.01" value="'+Number(a.valorPago||0)+'"></label><label class="field"><span>Forma de pagamento</span><input id="com_edit_payment" value="'+esc(a.formaPagamento)+'"></label></div>'+ 
    '<label class="field"><span>Referência do comprovante</span><input id="com_edit_reference" value="'+esc(a.referenciaPagamento)+'"></label>'+ 
    '<label class="field"><span>Observações</span><textarea id="com_edit_notes">'+esc(a.observacoes)+'</textarea></label>'+ 
    '<p class="modal-hint">Reduzir o plano só é permitido quando a quantidade atual de casas couber no novo limite.</p>'+ 
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="com_edit_save" onclick="saveCommercialAccount(\''+userId+'\')">Salvar alterações</button></div>');
}

async function saveCommercialAccount(userId){
  const account={plano:valueOf('com_edit_plan'),status:valueOf('com_edit_status'),telefone:valueOf('com_edit_phone').trim(),
    documento:valueOf('com_edit_document').trim(),empresa:valueOf('com_edit_company').trim(),valorPago:Number(valueOf('com_edit_value'))||0,
    formaPagamento:valueOf('com_edit_payment').trim(),referenciaPagamento:valueOf('com_edit_reference').trim(),observacoes:valueOf('com_edit_notes').trim()};
  const button=document.getElementById('com_edit_save');if(button){button.disabled=true;button.textContent='Salvando…';}
  try{
    await salvarModulosCliente(userId);
    await db.updateCommercialAccount(userId,account);
    closeModal();await refreshCommercialDashboard();showToast('Proprietário atualizado.','success');
  }
  catch(e){console.error(e);showToast((e&&e.message)||'Não foi possível atualizar.','error');if(button){button.disabled=false;button.textContent='Salvar alterações';}}
}

async function refreshCommercialDashboard(){
  if(!state.isPlatformAdmin)return;
  try{const data=await db.loadCommercialDashboard();state.commercialAccounts=data.accounts;state.commercialInvites=data.invites;state.platformAdmins=data.admins||[];state.commercialAudit=data.audit||[];render();}
  catch(e){console.error(e);showToast('Não foi possível atualizar os proprietários.','error');}
}
async function cancelCommercialInvite(id){if(!confirm('Cancelar esta venda ou convite?'))return;try{await db.cancelCommercialInvite(id);await refreshCommercialDashboard();showToast('Registro cancelado.','success');}catch(e){console.error(e);showToast('Não foi possível cancelar.','error');}}
async function copyCommercialInvite(id){
  const invite=(state.commercialInvites||[]).find(function(i){return i.id===id;});if(!invite)return;
  const message='Olá, '+invite.nome+'! Seu acesso ao '+CONFIG.APP_NAME+' foi liberado no plano '+commercialPlanLabel(invite.plano)+'. Abra '+window.location.origin+', escolha “Administrador”, clique em “Criar conta” e use exatamente o e-mail '+invite.email+'. Depois de confirmar o e-mail, você poderá cadastrar até '+commercialPlan(invite.plano).casas+' casa(s).';
  try{await navigator.clipboard.writeText(message);showToast('Instruções copiadas.','success');}catch(e){openModal('<h3 class="modal-title">Instruções</h3><textarea class="commercial-copy-text" readonly>'+esc(message)+'</textarea><div class="modal-actions"><button class="btn btn-primary" onclick="closeModal()">Fechar</button></div>');}
}

function openAddPlatformAdminModal(){openModal('<h3 class="modal-title">Adicionar administrador</h3><p class="modal-text">A pessoa precisa criar uma conta gratuita primeiro. Depois, informe o e-mail aqui.</p><label class="field"><span>E-mail</span><input id="platform_admin_email" type="email"></label><div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="addPlatformAdmin()">Adicionar</button></div>');}
async function addPlatformAdmin(){const email=valueOf('platform_admin_email').trim().toLowerCase();if(!email){showToast('Informe o e-mail.','error');return;}if(!emailValido(email)){showToast('E-mail inválido.','error');return;}try{await db.addPlatformAdmin(email);closeModal();await refreshCommercialDashboard();showToast('Administrador adicionado.','success');}catch(e){console.error(e);showToast((e&&e.message)||'Não foi possível adicionar.','error');}}
async function removePlatformAdmin(userId){if(!confirm('Remover este administrador da plataforma?'))return;try{await db.removePlatformAdmin(userId);await refreshCommercialDashboard();showToast('Administrador removido.','success');}catch(e){console.error(e);showToast((e&&e.message)||'Não foi possível remover.','error');}}

function exportCommercialClients(){
  const rows=[['Cliente','Empresa','E-mail','Telefone','CPF/CNPJ','Plano','Situação','Casas','Limite','Valor pago','Forma de pagamento']];
  (state.commercialAccounts||[]).filter(function(a){return !a.isPlatformAdmin;}).forEach(function(a){rows.push([a.nome,a.empresa,a.email,a.telefone,a.documento,commercialPlanLabel(a.plano),commercialStatusLabel(a.status),a.quantidadeImoveis,a.limiteImoveis,a.valorPago,a.formaPagamento]);});
  const csv=rows.map(function(row){return row.map(function(value){return '"'+String(value==null?'':value).replace(/"/g,'""')+'"';}).join(';');}).join('\r\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='clientes-proprietarios-'+todayISO()+'.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  showToast('Lista de proprietários exportada.','success');
}
