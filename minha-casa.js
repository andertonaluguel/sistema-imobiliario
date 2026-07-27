/* ============================================================
   minha-casa.js — Gestão financeira familiar
   Módulo isolado de interface. A integração de rota, acesso Mestre
   e persistência é feita pelo núcleo do app e pela camada `db`.
   ============================================================ */
(function(){
  'use strict';

  var PRIVACY_KEY = 'aluguel-minha-casa-privacy-v1';
  var VALID_TABS = ['dashboard','history','pending','recurring','organize'];
  var moneyFormatter = typeof Intl!=='undefined'
    ? new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})
    : null;
  var dateFormatter = typeof Intl!=='undefined'
    ? new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric'})
    : null;
  var monthFormatter = typeof Intl!=='undefined'
    ? new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'})
    : null;

  var homeState = {
    loaded:false,
    loading:false,
    busy:false,
    error:'',
    tab:'dashboard',
    month:currentMonth(),
    privateValues:loadPrivacy(),
    modalContext:null,
    data:emptyData(),
    history:{
      query:'',
      type:'all',
      categoryId:'all',
      memberId:'all',
      month:''
    }
  };

  function emptyData(){
    return {
      active:false,
      activationDate:'',
      transactions:[],
      suggestions:[],
      recurring:[],
      members:[],
      categories:[]
    };
  }

  function currentMonth(){
    var d=new Date();
    return d.getFullYear()+'-'+pad2(d.getMonth()+1);
  }

  function today(){
    var d=new Date();
    return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
  }

  function pad2(value){ return String(value).padStart(2,'0'); }

  function addMonths(month,delta){
    var bits=String(month||currentMonth()).split('-');
    var d=new Date(Number(bits[0])||new Date().getFullYear(),(Number(bits[1])||1)-1+Number(delta||0),1);
    return d.getFullYear()+'-'+pad2(d.getMonth()+1);
  }

  function loadPrivacy(){
    try{ return localStorage.getItem(PRIVACY_KEY)==='hidden'; }
    catch(e){ return false; }
  }

  function savePrivacy(){
    try{ localStorage.setItem(PRIVACY_KEY,homeState.privateValues?'hidden':'visible'); }
    catch(e){}
  }

  function pick(object,names,fallback){
    if(!object || typeof object!=='object') return fallback;
    for(var i=0;i<names.length;i++){
      if(Object.prototype.hasOwnProperty.call(object,names[i]) && object[names[i]]!==null && object[names[i]]!==undefined){
        return object[names[i]];
      }
    }
    return fallback;
  }

  function toBoolean(value,fallback){
    if(value===undefined || value===null || value==='') return !!fallback;
    if(typeof value==='string') return !/^(false|0|nao|não|off)$/i.test(value);
    return !!value;
  }

  function toNumber(value){
    if(typeof value==='string'){
      var cleaned=value.trim().replace(/\s/g,'');
      if(cleaned.indexOf(',')>=0){
        cleaned=cleaned.replace(/\./g,'').replace(',','.');
      }
      value=cleaned;
    }
    var number=Number(value);
    return Number.isFinite(number)?number:0;
  }

  function normalizeType(value,fallback){
    var type=String(value||fallback||'saida').toLowerCase();
    if(type==='entrada'||type==='income'||type==='receita'||type==='credit'||type==='credito') return 'entrada';
    if(type==='both'||type==='ambos'||type==='todas'||type==='todos') return 'ambos';
    return 'saida';
  }

  function normalizeStatus(value){
    var status=String(value||'pending').toLowerCase();
    if(status==='accepted'||status==='aceita'||status==='aceito'||status==='confirmada'||status==='confirmado') return 'accepted';
    if(status==='ignored'||status==='ignorada'||status==='ignorado'||status==='descartada'||status==='descartado') return 'ignored';
    return 'pending';
  }

  function normalizeColor(value,fallback){
    var color=String(value||'');
    return /^#[0-9a-f]{6}$/i.test(color)?color:(fallback||'#6D5BD0');
  }

  function normalizeMember(row,index){
    return {
      id:String(pick(row,['id','memberId','membroId','membro_id'],'member-'+index)),
      name:String(pick(row,['name','nome'],'Pessoa')),
      emoji:String(pick(row,['emoji','icon','icone'],'👤')),
      color:normalizeColor(pick(row,['color','cor'],'#6D5BD0'),'#6D5BD0'),
      active:toBoolean(pick(row,['active','ativo'],true),true),
      createdAt:String(pick(row,['createdAt','created_at'],''))
    };
  }

  function normalizeCategory(row,index){
    return {
      id:String(pick(row,['id','categoryId','categoriaId','categoria_id'],'category-'+index)),
      name:String(pick(row,['name','nome'],'Categoria')),
      emoji:String(pick(row,['emoji','icon','icone'],'🏷️')),
      color:normalizeColor(pick(row,['color','cor'],'#D69E2E'),'#D69E2E'),
      type:normalizeType(pick(row,['type','tipo'],'ambos'),'ambos'),
      active:toBoolean(pick(row,['active','ativo'],true),true),
      createdAt:String(pick(row,['createdAt','created_at'],''))
    };
  }

  /* ---------- formas de pagamento ----------
     Parcelamento só existe no crédito: nas outras formas o dinheiro
     sai de uma vez, então o lançamento também é único. */
  var PAYMENT_METHODS=[
    {id:'dinheiro',      label:'Dinheiro',    emoji:'💵'},
    {id:'pix',           label:'PIX',         emoji:'⚡'},
    {id:'debito',        label:'Débito',      emoji:'💳'},
    {id:'credito',       label:'Crédito',     emoji:'🪙', parcelavel:true},
    {id:'boleto',        label:'Boleto',      emoji:'🧾'},
    {id:'transferencia', label:'Transferência', emoji:'🏦'}
  ];
  function normalizePaymentMethod(value){
    var v=String(value||'').toLowerCase().trim();
    return PAYMENT_METHODS.some(function(m){return m.id===v;})?v:'dinheiro';
  }
  function paymentMethodInfo(id){
    var v=normalizePaymentMethod(id);
    return PAYMENT_METHODS.find(function(m){return m.id===v;})||PAYMENT_METHODS[0];
  }
  function isInstallmentPurchase(item){
    return !!(item && item.purchaseId && Number(item.installments)>1);
  }

  function normalizeTransaction(row,index){
    var category=pick(row,['category','categoria'],null);
    var member=pick(row,['member','membro','person','pessoa'],null);
    var date=String(pick(row,['date','data','transactionDate','dataMovimentacao','data_movimentacao'],''));
    if(!date){
      var created=String(pick(row,['createdAt','created_at'],''));
      date=created?created.slice(0,10):today();
    }
    return {
      id:String(pick(row,['id','transactionId','movimentacaoId','movimentacao_id'],'transaction-'+index)),
      type:normalizeType(pick(row,['type','tipo'],'saida'),'saida'),
      amount:toNumber(pick(row,['amount','value','valor'],0)),
      date:date.slice(0,10),
      description:String(pick(row,['description','descricao','note','observacao'],'')||''),
      categoryId:String(pick(row,['categoryId','categoriaId','category_id','categoria_id'],pick(category,['id'],'')||'')),
      categoryName:String(pick(row,['categoryName','categoriaNome','category_name','categoria_nome'],pick(category,['name','nome'],'')||'')),
      memberId:String(pick(row,['memberId','membroId','personId','pessoaId','member_id','membro_id','pessoa_id'],pick(member,['id'],'')||'')),
      memberName:String(pick(row,['memberName','membroNome','personName','pessoaNome','member_name','membro_nome','pessoa_nome'],pick(member,['name','nome'],'')||'')),
      paymentMethod:normalizePaymentMethod(pick(row,['paymentMethod','formaPagamento','forma_pagamento'],'dinheiro')),
      purchaseId:String(pick(row,['purchaseId','compraId','compra_id'],'')||''),
      installment:Math.max(1,parseInt(pick(row,['installment','parcelaNumero','parcela_numero'],1),10)||1),
      installments:Math.max(1,parseInt(pick(row,['installments','parcelaTotal','parcela_total'],1),10)||1),
      sourceType:String(pick(row,['sourceType','originType','tipoOrigem','source_type','tipo_origem'],'manual')||'manual'),
      sourceLabel:String(pick(row,['sourceLabel','originLabel','origem','source_label'],'')||''),
      sourceId:String(pick(row,['sourceId','originId','origemId','source_id','origem_id'],'')||''),
      createdAt:String(pick(row,['createdAt','created_at'],'')||''),
      updatedAt:String(pick(row,['updatedAt','updated_at'],'')||'')
    };
  }

  function normalizeSuggestion(row,index){
    var base=normalizeTransaction(row,index);
    return {
      id:String(pick(row,['id','suggestionId','sugestaoId','sugestao_id'],'suggestion-'+index)),
      type:base.type,
      amount:toNumber(pick(row,['suggestedAmount','valorSugerido','suggested_amount','valor_sugerido'],base.amount)),
      date:String(pick(row,['suggestedDate','dataSugerida','suggested_date','data_sugerida'],base.date)||base.date).slice(0,10),
      description:String(pick(row,['suggestedDescription','descricaoSugerida','suggested_description','descricao_sugerida'],base.description)||''),
      categoryId:base.categoryId,
      categoryName:base.categoryName,
      memberId:base.memberId,
      memberName:base.memberName,
      sourceType:String(pick(row,['sourceType','originType','tipoOrigem','source_type','tipo_origem'],'other')||'other'),
      sourceLabel:String(pick(row,['sourceLabel','originLabel','origem','source_label'],base.sourceLabel)||''),
      houseName:String(pick(row,['houseName','imovelNome','casaNome','house_name','imovel_nome'],'')||''),
      referenceMonth:String(pick(row,['referenceMonth','mesReferencia','reference_month','mes_referencia'],'')||''),
      status:normalizeStatus(pick(row,['status'],'pending')),
      createdAt:String(pick(row,['createdAt','created_at'],'')||'')
    };
  }

  function normalizeRecurring(row,index){
    var category=pick(row,['category','categoria'],null);
    var member=pick(row,['member','membro','person','pessoa'],null);
    return {
      id:String(pick(row,['id','recurringId','recorrenciaId','recorrencia_id'],'recurring-'+index)),
      name:String(pick(row,['name','nome','title','titulo'],'Conta fixa')),
      type:normalizeType(pick(row,['type','tipo'],'saida'),'saida'),
      amount:toNumber(pick(row,['amount','value','valor'],0)),
      dayOfMonth:Math.min(28,Math.max(1,parseInt(pick(row,['dayOfMonth','day','dia','diaMes','day_of_month','dia_mes'],1),10)||1)),
      categoryId:String(pick(row,['categoryId','categoriaId','category_id','categoria_id'],pick(category,['id'],'')||'')),
      categoryName:String(pick(row,['categoryName','categoriaNome','category_name','categoria_nome'],pick(category,['name','nome'],'')||'')),
      memberId:String(pick(row,['memberId','membroId','personId','pessoaId','member_id','membro_id','pessoa_id'],pick(member,['id'],'')||'')),
      memberName:String(pick(row,['memberName','membroNome','personName','pessoaNome','member_name','membro_nome','pessoa_nome'],pick(member,['name','nome'],'')||'')),
      description:String(pick(row,['description','descricao','note','observacao'],'')||''),
      active:toBoolean(pick(row,['active','ativo','ativa'],true),true),
      nextDate:String(pick(row,['nextDate','proximaData','next_date','proxima_data'],'')||''),
      createdAt:String(pick(row,['createdAt','created_at'],'')||'')
    };
  }

  function normalizePayload(raw){
    raw=raw||{};
    var root=pick(raw,['myHome','minhaCasa','data'],raw);
    if(!root || typeof root!=='object') root={};
    var transactionRows=pick(root,['transactions','movimentacoes','entries','lancamentos'],[]);
    var suggestionRows=pick(root,['suggestions','sugestoes','pendingSuggestions','aConfirmar'],[]);
    var recurringRows=pick(root,['recurring','recorrencias','fixedBills','contasFixas'],[]);
    var memberRows=pick(root,['members','membros','people','pessoas'],[]);
    var categoryRows=pick(root,['categories','categorias'],[]);
    var hasContent=['transactions','movimentacoes','members','membros','categories','categorias']
      .some(function(key){return Object.prototype.hasOwnProperty.call(root,key);});
    var activeValue=pick(root,['active','ativo','activated','ativado','isActive','estaAtivo'],undefined);
    return {
      active:activeValue===undefined?hasContent:toBoolean(activeValue,false),
      activationDate:String(pick(root,['activationDate','activatedAt','dataAtivacao','activation_date','activated_at','data_ativacao'],'')||''),
      transactions:(Array.isArray(transactionRows)?transactionRows:[]).map(normalizeTransaction)
        .sort(sortNewest),
      suggestions:(Array.isArray(suggestionRows)?suggestionRows:[]).map(normalizeSuggestion)
        .filter(function(item){return item.status==='pending';}).sort(sortNewest),
      recurring:(Array.isArray(recurringRows)?recurringRows:[]).map(normalizeRecurring)
        .sort(function(a,b){return a.dayOfMonth-b.dayOfMonth||a.name.localeCompare(b.name,'pt-BR');}),
      members:(Array.isArray(memberRows)?memberRows:[]).map(normalizeMember)
        .sort(sortActiveThenName),
      categories:(Array.isArray(categoryRows)?categoryRows:[]).map(normalizeCategory)
        .sort(sortActiveThenName)
    };
  }

  function sortNewest(a,b){
    return String(b.date||b.createdAt||'').localeCompare(String(a.date||a.createdAt||''));
  }

  function sortActiveThenName(a,b){
    if(a.active!==b.active) return a.active?-1:1;
    return a.name.localeCompare(b.name,'pt-BR');
  }

  function getApi(){
    if(typeof db!=='undefined') return db;
    if(typeof window!=='undefined' && window.db) return window.db;
    return null;
  }

  function requireApi(method){
    var api=getApi();
    if(!api || typeof api[method]!=='function'){
      throw new Error('A atualização do banco de dados da Minha Casa ainda não foi conectada.');
    }
    return api;
  }

  function requestRender(){
    if(typeof render==='function'){
      render();
      return;
    }
    if(typeof window!=='undefined' && typeof window.render==='function') window.render();
  }

  function toast(message,type){
    if(typeof showToast==='function') showToast(message,type);
    else if(typeof console!=='undefined') console[type==='error'?'error':'log'](message);
  }

  function dialog(html){
    if(typeof openModal==='function') openModal('<div class="mh-modal">'+html+'</div>');
    else throw new Error('A janela do aplicativo não está disponível.');
  }

  function closeDialog(){
    if(typeof closeModal==='function') closeModal();
  }

  function readableError(error){
    if(error && error.message) return error.message;
    return 'Não foi possível concluir. Tente novamente.';
  }

  function esc(value){
    return String(value===undefined||value===null?'':value)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function formatMoney(value){
    if(homeState.privateValues) return 'R$ ••••';
    var number=toNumber(value);
    return moneyFormatter?moneyFormatter.format(number):('R$ '+number.toFixed(2).replace('.',','));
  }

  function formatDate(value){
    if(!value) return 'Data não informada';
    var bits=String(value).slice(0,10).split('-');
    var d=new Date(Number(bits[0]),(Number(bits[1])||1)-1,Number(bits[2])||1);
    if(Number.isNaN(d.getTime())) return String(value);
    return dateFormatter?dateFormatter.format(d):pad2(d.getDate())+'/'+pad2(d.getMonth()+1)+'/'+d.getFullYear();
  }

  function formatMonth(value){
    var bits=String(value||currentMonth()).split('-');
    var d=new Date(Number(bits[0]),(Number(bits[1])||1)-1,1);
    if(Number.isNaN(d.getTime())) return value;
    var label=monthFormatter?monthFormatter.format(d):(pad2(d.getMonth()+1)+'/'+d.getFullYear());
    return label.charAt(0).toUpperCase()+label.slice(1);
  }

  function categoryById(id){
    return homeState.data.categories.find(function(item){return String(item.id)===String(id);})||null;
  }

  function memberById(id){
    return homeState.data.members.find(function(item){return String(item.id)===String(id);})||null;
  }

  function transactionCategory(item){
    return categoryById(item.categoryId)||{
      id:item.categoryId||'',
      name:item.categoryName||'Sem categoria',
      emoji:'🏷️',
      color:'#77718A'
    };
  }

  function transactionMember(item){
    return memberById(item.memberId)||{
      id:item.memberId||'',
      name:item.memberName||'Não informado',
      emoji:'👤',
      color:'#77718A'
    };
  }

  function sourceInfo(sourceType,sourceLabel){
    var type=String(sourceType||'manual').toLowerCase();
    var map={
      rent:['Aluguel','🏠'],
      aluguel:['Aluguel','🏠'],
      tenant_energy:['Energia do inquilino','⚡'],
      energia_inquilino:['Energia do inquilino','⚡'],
      energy:['Energia','⚡'],
      energia:['Energia','⚡'],
      recurring:['Conta fixa','🔁'],
      recorrencia:['Conta fixa','🔁'],
      conta_fixa:['Conta fixa','🔁'],
      initial:['Valor inicial','◎'],
      valor_inicial:['Valor inicial','◎'],
      manual:['Manual','✎']
    };
    var info=map[type]||['Importado','↗'];
    return {label:sourceLabel||info[0],icon:info[1]};
  }

  function activeMembers(){
    return homeState.data.members.filter(function(item){return item.active;});
  }

  function activeCategories(){
    return homeState.data.categories.filter(function(item){return item.active;});
  }

  function monthTransactions(month){
    return homeState.data.transactions.filter(function(item){
      return item.date && item.date.slice(0,7)===month;
    });
  }

  function summarize(items){
    var income=0,expense=0;
    items.forEach(function(item){
      if(item.type==='entrada') income+=item.amount;
      else expense+=item.amount;
    });
    return {income:income,expense:expense,balance:income-expense};
  }

  function groupExpenses(items,keyResolver,labelResolver){
    var groups={};
    items.filter(function(item){return item.type==='saida';}).forEach(function(item){
      var key=keyResolver(item)||'unknown';
      if(!groups[key]) groups[key]={key:key,label:labelResolver(item),value:0};
      groups[key].value+=item.amount;
    });
    return Object.keys(groups).map(function(key){return groups[key];})
      .sort(function(a,b){return b.value-a.value;});
  }

  function ensureLoad(){
    if(homeState.loaded || homeState.loading) return;
    homeState.loading=true;
    setTimeout(function(){ loadData(false); },0);
  }

  async function loadData(showLoading){
    if(homeState.loading && showLoading) return;
    if(showLoading!==false) homeState.loading=true;
    homeState.error='';
    requestRender();
    try{
      var api=requireApi('loadMyHome');
      var raw=await api.loadMyHome();
      homeState.data=normalizePayload(raw);
      homeState.loaded=true;
      homeState.error='';
    }catch(error){
      console.error('Minha Casa: erro ao carregar',error);
      homeState.error=readableError(error);
    }finally{
      homeState.loading=false;
      requestRender();
    }
  }

  async function runMutation(method,args,successMessage,options){
    if(homeState.busy) return false;
    homeState.busy=true;
    options=options||{};
    try{
      var api=requireApi(method);
      await api[method].apply(api,args||[]);
      if(options.close!==false) closeDialog();
      await loadData(false);
      if(successMessage) toast(successMessage,'success');
      return true;
    }catch(error){
      console.error('Minha Casa: erro em '+method,error);
      toast(readableError(error),'error');
      return false;
    }finally{
      homeState.busy=false;
    }
  }

  function renderLoading(){
    return '<div class="minha-casa">'+
      '<section class="mh-hero mh-hero-loading">'+
        '<div><span class="mh-kicker">ESPAÇO PARTICULAR</span><h1>Minha Casa</h1>'+
        '<p>Preparando seu controle familiar…</p></div>'+
        '<div class="mh-skeleton mh-skeleton-round"></div>'+
      '</section>'+
      '<div class="mh-skeleton-grid"><span></span><span></span><span></span></div>'+
    '</div>';
  }

  function renderError(){
    return '<div class="minha-casa">'+renderHero()+
      '<section class="mh-state-card mh-state-error" role="alert">'+
        '<span class="mh-state-icon">!</span><h2>Não foi possível abrir Minha Casa</h2>'+
        '<p>'+esc(homeState.error||'O módulo não respondeu.')+'</p>'+
        '<button class="mh-btn mh-btn-primary" onclick="MinhaCasaUI.refresh()">Tentar novamente</button>'+
      '</section></div>';
  }

  function renderHero(){
    var pending=homeState.data.suggestions.length;
    return '<section class="mh-hero">'+
      '<div class="mh-hero-copy">'+
        '<span class="mh-kicker">ESPAÇO PARTICULAR · CONTAS MESTRE</span>'+
        '<h1><span aria-hidden="true">⌂</span> Minha Casa</h1>'+
        '<p>O dinheiro da família, organizado de um jeito simples e só seu.</p>'+
      '</div>'+
      '<div class="mh-hero-actions">'+
        (homeState.data.active?'<button class="mh-privacy" onclick="MinhaCasaUI.togglePrivacy()" aria-pressed="'+(homeState.privateValues?'true':'false')+'" aria-label="'+(homeState.privateValues?'Mostrar valores':'Ocultar valores')+'">'+
          '<span aria-hidden="true">'+(homeState.privateValues?'◉':'◌')+'</span><b>'+(homeState.privateValues?'Mostrar valores':'Ocultar valores')+'</b></button>':'')+
        (pending?'<button class="mh-pending-shortcut" onclick="MinhaCasaUI.selectTab(\'pending\')"><strong>'+pending+'</strong><span>a confirmar</span></button>':'')+
      '</div>'+
    '</section>';
  }

  function renderActivation(){
    return '<div class="minha-casa">'+renderHero()+
      '<section class="mh-activation">'+
        '<div class="mh-activation-mark" aria-hidden="true">0</div>'+
        '<div class="mh-activation-copy">'+
          '<span class="mh-kicker">COMEÇO LIMPO</span>'+
          '<h2>Seu controle começa zerado</h2>'+
          '<p>Nenhum aluguel ou valor antigo será trazido. Depois da ativação, novos aluguéis recebidos, energias dos inquilinos e contas fixas aparecerão primeiro em <strong>A confirmar</strong>.</p>'+
          '<ul><li>Anderton, Marinalva, Paula e Casa/Todos podem ser os primeiros membros.</li>'+
          '<li>Você poderá criar outras pessoas e categorias quando quiser.</li>'+
          '<li>Nada entra no seu financeiro sem a sua aprovação.</li></ul>'+
          '<button class="mh-btn mh-btn-activate" onclick="MinhaCasaUI.activate()"'+(homeState.busy?' disabled':'')+'>Ativar Minha Casa</button>'+
        '</div>'+
      '</section>'+
    '</div>';
  }

  function renderTabs(){
    var pending=homeState.data.suggestions.length;
    var tabs=[
      ['dashboard','Resumo','◫'],
      ['history','Histórico','≡'],
      ['pending','A confirmar','✓'],
      ['recurring','Contas fixas','↻'],
      ['organize','Organizar','⚙']
    ];
    return '<nav class="mh-tabs" aria-label="Áreas da Minha Casa" role="tablist">'+
      tabs.map(function(item){
        var active=homeState.tab===item[0];
        var badge=item[0]==='pending'&&pending?'<span class="mh-tab-badge">'+pending+'</span>':'';
        return '<button class="mh-tab'+(active?' active':'')+'" role="tab" aria-selected="'+active+'" onclick="MinhaCasaUI.selectTab(\''+item[0]+'\')">'+
          '<span aria-hidden="true">'+item[2]+'</span><b>'+item[1]+'</b>'+badge+'</button>';
      }).join('')+
    '</nav>';
  }

  function renderView(){
    ensureLoad();
    if(homeState.loading && !homeState.loaded) return renderLoading();
    if(homeState.error && !homeState.loaded) return renderError();
    if(!homeState.data.active) return renderActivation();
    var content=homeState.tab==='history'?renderHistory()
      :homeState.tab==='pending'?renderPending()
      :homeState.tab==='recurring'?renderRecurring()
      :homeState.tab==='organize'?renderOrganize()
      :renderDashboard();
    return '<div class="minha-casa'+(homeState.privateValues?' mh-values-private':'')+'">'+
      renderHero()+renderTabs()+
      (homeState.error?'<div class="mh-inline-error" role="alert">'+esc(homeState.error)+'</div>':'')+
      '<div class="mh-content">'+content+'</div>'+
      '<button class="mh-floating-add" onclick="MinhaCasaUI.openTransaction(\'saida\')" aria-label="Adicionar movimentação"><span>+</span><b>Novo</b></button>'+
    '</div>';
  }

  function renderMonthSwitcher(){
    return '<div class="mh-month-switcher">'+
      '<button onclick="MinhaCasaUI.changeMonth(-1)" aria-label="Mês anterior">←</button>'+
      '<label><span class="sr-only">Mês do resumo</span><input type="month" value="'+esc(homeState.month)+'" onchange="MinhaCasaUI.setMonth(this.value)">'+
      '<b>'+esc(formatMonth(homeState.month))+'</b></label>'+
      '<button onclick="MinhaCasaUI.changeMonth(1)" aria-label="Próximo mês">→</button>'+
    '</div>';
  }

  function renderDashboard(){
    var rows=monthTransactions(homeState.month);
    var summary=summarize(rows);
    var categories=groupExpenses(rows,function(item){return item.categoryId||item.categoryName;},function(item){
      var category=transactionCategory(item);
      return {name:category.name,emoji:category.emoji,color:category.color};
    });
    var members=groupExpenses(rows,function(item){return item.memberId||item.memberName;},function(item){
      var member=transactionMember(item);
      return {name:member.name,emoji:member.emoji,color:member.color};
    });
    return '<section class="mh-dashboard" aria-labelledby="mh-summary-title">'+
      '<div class="mh-section-heading mh-month-heading"><div><span class="mh-kicker">RESUMO MENSAL</span>'+
        '<h2 id="mh-summary-title">Como está a casa</h2></div>'+renderMonthSwitcher()+'</div>'+
      '<div class="mh-summary-grid">'+
        summaryCard('Saldo do mês',summary.balance,'saldo',summary.balance<0?'negative':'balance','Entradas menos saídas')+
        summaryCard('Entradas',summary.income,'entrada','income',rows.filter(function(item){return item.type==='entrada';}).length+' lançamento(s)')+
        summaryCard('Saídas',summary.expense,'saida','expense',rows.filter(function(item){return item.type==='saida';}).length+' lançamento(s)')+
      '</div>'+
      '<div class="mh-quick-actions" aria-label="Registro rápido">'+
        '<button class="mh-quick mh-quick-expense" onclick="MinhaCasaUI.openTransaction(\'saida\')"><span>−</span><b>Registrar saída</b><small>valor, categoria e pessoa</small></button>'+
        '<button class="mh-quick mh-quick-income" onclick="MinhaCasaUI.openTransaction(\'entrada\')"><span>+</span><b>Registrar entrada</b><small>dinheiro recebido</small></button>'+
      '</div>'+
      (homeState.data.suggestions.length?renderPendingBanner():'')+
      '<div class="mh-dashboard-grid">'+
        renderBreakdown('Onde o dinheiro foi gasto','Por categoria',categories,summary.expense,'category')+
        renderBreakdown('Quem fez os gastos','Por pessoa',members,summary.expense,'member')+
      '</div>'+
      '<div class="mh-dashboard-grid mh-dashboard-grid-wide">'+
        renderRecent(rows.slice().sort(sortNewest).slice(0,6))+
        renderSixMonths()+
      '</div>'+
    '</section>';
  }

  function summaryCard(label,value,kind,tone,sub){
    var prefix=kind==='entrada'?'+ ':kind==='saida'?'− ':value<0?'− ':'';
    return '<article class="mh-summary-card mh-summary-'+tone+'">'+
      '<span>'+esc(label)+'</span>'+
      '<strong class="mh-money" aria-label="'+(homeState.privateValues?'Valor oculto':esc(formatMoney(value)))+'">'+prefix+esc(formatMoney(Math.abs(value)))+'</strong>'+
      '<small>'+esc(sub)+'</small>'+
    '</article>';
  }

  function renderPendingBanner(){
    var count=homeState.data.suggestions.length;
    return '<button class="mh-pending-banner" onclick="MinhaCasaUI.selectTab(\'pending\')">'+
      '<span class="mh-pending-icon" aria-hidden="true">✓</span>'+
      '<span><strong>'+count+' valor'+(count===1?'':'es')+' aguardando você</strong>'+
      '<small>Revise antes de entrar no controle familiar.</small></span>'+
      '<b>Conferir agora →</b>'+
    '</button>';
  }

  function renderBreakdown(title,subtitle,groups,total,kind){
    var shown=groups.slice(0,6);
    return '<section class="mh-panel">'+
      '<div class="mh-panel-heading"><div><h3>'+esc(title)+'</h3><span>'+esc(subtitle)+'</span></div>'+
      '<span class="mh-panel-total mh-money">'+esc(formatMoney(total))+'</span></div>'+
      (shown.length?'<div class="mh-bars">'+shown.map(function(group){
        var percent=total>0?Math.max(3,Math.round(group.value/total*100)):0;
        var label=group.label||{};
        return '<div class="mh-bar-row">'+
          '<div class="mh-bar-meta"><span><i style="--mh-dot:'+normalizeColor(label.color,'#6D5BD0')+'">'+esc(label.emoji||'•')+'</i>'+esc(label.name||'Sem informação')+'</span>'+
          '<b class="mh-money">'+esc(formatMoney(group.value))+'</b></div>'+
          '<div class="mh-bar-track" role="img" aria-label="'+esc((label.name||'Item')+': '+percent+'% dos gastos')+'"><span class="mh-bar-fill mh-bar-'+kind+'" style="width:'+percent+'%;--mh-bar:'+normalizeColor(label.color,'#6D5BD0')+'"></span></div>'+
        '</div>';
      }).join('')+'</div>':emptyBlock('Ainda não há saídas neste mês.','Comece pelo botão Registrar saída.'))+
    '</section>';
  }

  function renderRecent(items){
    return '<section class="mh-panel mh-recent-panel">'+
      '<div class="mh-panel-heading"><div><h3>Últimos lançamentos</h3><span>'+esc(formatMonth(homeState.month))+'</span></div>'+
      (items.length?'<button class="mh-text-btn" onclick="MinhaCasaUI.selectTab(\'history\')">Ver histórico</button>':'')+'</div>'+
      (items.length?'<div class="mh-transaction-list">'+items.map(renderTransactionRow).join('')+'</div>'
        :emptyBlock('Nenhuma movimentação no mês.','Suas entradas e saídas aparecerão aqui.'))+
    '</section>';
  }

  function renderSixMonths(){
    var months=[];
    for(var i=5;i>=0;i--) months.push(addMonths(homeState.month,-i));
    var points=months.map(function(month){
      var summary=summarize(monthTransactions(month));
      return {month:month,income:summary.income,expense:summary.expense};
    });
    var maximum=Math.max.apply(null,[1].concat(points.map(function(point){return Math.max(point.income,point.expense);})));
    return '<section class="mh-panel mh-chart-panel">'+
      '<div class="mh-panel-heading"><div><h3>Últimos 6 meses</h3><span>Entradas e saídas</span></div>'+
      '<div class="mh-chart-legend"><i></i>Entradas <i></i>Saídas</div></div>'+
      '<div class="mh-month-chart" role="img" aria-label="Comparativo de entradas e saídas nos últimos seis meses">'+
        points.map(function(point){
          var incomeHeight=Math.round(point.income/maximum*100);
          var expenseHeight=Math.round(point.expense/maximum*100);
          return '<div class="mh-chart-column" title="'+esc(formatMonth(point.month))+': entradas '+esc(formatMoney(point.income))+', saídas '+esc(formatMoney(point.expense))+'">'+
            '<div class="mh-chart-bars"><span class="income" style="height:'+incomeHeight+'%"></span><span class="expense" style="height:'+expenseHeight+'%"></span></div>'+
            '<b>'+esc(formatMonth(point.month).split(' ')[0].slice(0,3))+'</b>'+
          '</div>';
        }).join('')+
      '</div>'+
    '</section>';
  }

  function emptyBlock(title,sub){
    return '<div class="mh-empty"><span aria-hidden="true">○</span><strong>'+esc(title)+'</strong>'+(sub?'<small>'+esc(sub)+'</small>':'')+'</div>';
  }

  function renderTransactionRow(item){
    var category=transactionCategory(item);
    var member=transactionMember(item);
    var source=sourceInfo(item.sourceType,item.sourceLabel);
    var isIncome=item.type==='entrada';
    return '<article class="mh-transaction">'+
      '<span class="mh-transaction-icon" style="--mh-item-color:'+normalizeColor(category.color,'#6D5BD0')+'">'+esc(category.emoji)+'</span>'+
      '<div class="mh-transaction-main"><strong>'+esc(item.description||category.name)+
        (isInstallmentPurchase(item)?'<em class="mh-parcela">'+item.installment+'/'+item.installments+'</em>':'')+'</strong>'+
        '<span>'+esc(category.name)+' · '+esc(member.emoji+' '+member.name)+' · '+esc(formatDate(item.date))+'</span>'+
        (item.paymentMethod&&item.paymentMethod!=='dinheiro'
          ?'<small class="mh-pay-tag">'+esc(paymentMethodInfo(item.paymentMethod).emoji+' '+paymentMethodInfo(item.paymentMethod).label)+'</small>':'')+
        (item.sourceType&&item.sourceType!=='manual'?'<small>'+esc(source.icon+' '+source.label)+'</small>':'')+
      '</div>'+
      '<strong class="mh-transaction-value mh-money '+(isIncome?'income':'expense')+'">'+(isIncome?'+':'−')+' '+esc(formatMoney(item.amount))+'</strong>'+
      '<button class="mh-row-menu" data-id="'+esc(item.id)+'" onclick="MinhaCasaUI.openTransactionMenu(this.dataset.id)" aria-label="Editar ou excluir movimentação">•••</button>'+
    '</article>';
  }

  function renderHistory(){
    return '<section class="mh-history" aria-labelledby="mh-history-title">'+
      '<div class="mh-section-heading"><div><span class="mh-kicker">TODOS OS REGISTROS</span><h2 id="mh-history-title">Histórico</h2>'+
      '<p>Encontre, edite ou exclua qualquer movimentação.</p></div>'+
      '<button class="mh-btn mh-btn-primary" onclick="MinhaCasaUI.openTransaction(\'saida\')">+ Novo lançamento</button></div>'+
      '<div class="mh-filter-card">'+
        '<label class="mh-search"><span aria-hidden="true">⌕</span><input id="mh_history_query" type="search" value="'+esc(homeState.history.query)+'" placeholder="Buscar descrição, categoria, pessoa ou valor" oninput="MinhaCasaUI.filterHistoryFromScreen()"></label>'+
        '<label><span>Tipo</span><select id="mh_history_type" onchange="MinhaCasaUI.filterHistoryFromScreen()">'+
          option('all','Todos',homeState.history.type)+option('entrada','Entradas',homeState.history.type)+option('saida','Saídas',homeState.history.type)+'</select></label>'+
        '<label><span>Pessoa</span><select id="mh_history_member" onchange="MinhaCasaUI.filterHistoryFromScreen()">'+
          option('all','Todas',homeState.history.memberId)+activeMembers().map(function(item){return option(item.id,item.emoji+' '+item.name,homeState.history.memberId);}).join('')+'</select></label>'+
        '<label><span>Categoria</span><select id="mh_history_category" onchange="MinhaCasaUI.filterHistoryFromScreen()">'+
          option('all','Todas',homeState.history.categoryId)+activeCategories().map(function(item){return option(item.id,item.emoji+' '+item.name,homeState.history.categoryId);}).join('')+'</select></label>'+
        '<label><span>Mês</span><input id="mh_history_month" type="month" value="'+esc(homeState.history.month)+'" onchange="MinhaCasaUI.filterHistoryFromScreen()"></label>'+
      '</div>'+
      '<div id="mh-history-results">'+renderHistoryResults()+'</div>'+
    '</section>';
  }

  function normalizedSearch(value){
    return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  }

  function historyFilteredItems(){
    var filters=homeState.history;
    var query=normalizedSearch(filters.query);
    return homeState.data.transactions.filter(function(item){
      if(filters.type!=='all' && item.type!==filters.type) return false;
      if(filters.memberId!=='all' && String(item.memberId)!==String(filters.memberId)) return false;
      if(filters.categoryId!=='all' && String(item.categoryId)!==String(filters.categoryId)) return false;
      if(filters.month && (!item.date || item.date.slice(0,7)!==filters.month)) return false;
      if(query){
        var category=transactionCategory(item),member=transactionMember(item);
        var haystack=normalizedSearch([item.description,category.name,member.name,item.amount,item.sourceLabel].join(' '));
        if(haystack.indexOf(query)===-1) return false;
      }
      return true;
    }).sort(sortNewest);
  }

  function renderHistoryResults(){
    var items=historyFilteredItems();
    if(!items.length) return emptyBlock('Nenhum lançamento encontrado.','Ajuste os filtros ou registre uma nova movimentação.');
    var groups={};
    items.forEach(function(item){
      var month=item.date?item.date.slice(0,7):'sem-data';
      if(!groups[month]) groups[month]=[];
      groups[month].push(item);
    });
    var months=Object.keys(groups).sort().reverse();
    return '<div class="mh-history-count">'+items.length+' movimentaç'+(items.length===1?'ão':'ões')+' encontrada'+(items.length===1?'':'s')+'</div>'+
      months.map(function(month){
        var total=summarize(groups[month]);
        return '<section class="mh-history-group">'+
          '<div class="mh-history-month"><h3>'+esc(month==='sem-data'?'Sem data':formatMonth(month))+'</h3>'+
          '<span>Entradas <b class="income mh-money">'+esc(formatMoney(total.income))+'</b> · Saídas <b class="expense mh-money">'+esc(formatMoney(total.expense))+'</b></span></div>'+
          '<div class="mh-panel mh-transaction-list">'+groups[month].map(renderTransactionRow).join('')+'</div>'+
        '</section>';
      }).join('');
  }

  function renderPending(){
    var suggestions=homeState.data.suggestions;
    return '<section class="mh-pending-page" aria-labelledby="mh-pending-title">'+
      '<div class="mh-section-heading"><div><span class="mh-kicker">VOCÊ DECIDE</span><h2 id="mh-pending-title">A confirmar</h2>'+
      '<p>Esses valores ainda não fazem parte do seu saldo.</p></div>'+
      (suggestions.length?'<span class="mh-count-pill">'+suggestions.length+' pendente'+(suggestions.length===1?'':'s')+'</span>':'')+'</div>'+
      '<div class="mh-confidence-note"><span aria-hidden="true">🔒</span><p><strong>Nada entra sozinho.</strong> Aceite, ajuste antes de aceitar ou ignore cada sugestão.</p></div>'+
      (suggestions.length?'<div class="mh-suggestion-list">'+suggestions.map(renderSuggestion).join('')+'</div>'
        :emptyBlock('Tudo conferido por aqui.','Novos aluguéis, energias e contas fixas aparecerão nesta área.'))+
    '</section>';
  }

  function renderSuggestion(item){
    var source=sourceInfo(item.sourceType,item.sourceLabel);
    var category=transactionCategory(item);
    var member=transactionMember(item);
    var hasCategory=!!item.categoryId;
    var hasMember=!!item.memberId;
    var isIncome=item.type==='entrada';
    return '<article class="mh-suggestion">'+
      '<div class="mh-suggestion-source"><span aria-hidden="true">'+esc(source.icon)+'</span>'+
        '<div><b>'+esc(source.label)+'</b><small>'+esc(item.houseName||item.referenceMonth||formatDate(item.date))+'</small></div>'+
        '<strong class="mh-money '+(isIncome?'income':'expense')+'">'+(isIncome?'+':'−')+' '+esc(formatMoney(item.amount))+'</strong></div>'+
      '<div class="mh-suggestion-details">'+
        '<span><b>Data</b>'+esc(formatDate(item.date))+'</span>'+
        '<span><b>Categoria</b>'+esc(hasCategory?(category.emoji+' '+category.name):'Definir antes de aceitar')+'</span>'+
        '<span><b>Pessoa</b>'+esc(hasMember?(member.emoji+' '+member.name):'Definir antes de aceitar')+'</span>'+
      '</div>'+
      (item.description?'<p class="mh-suggestion-description">'+esc(item.description)+'</p>':'')+
      '<div class="mh-suggestion-actions">'+
        '<button class="mh-btn mh-btn-accept" data-id="'+esc(item.id)+'" onclick="MinhaCasaUI.acceptSuggestion(this.dataset.id)">✓ Aceitar</button>'+
        '<button class="mh-btn mh-btn-outline" data-id="'+esc(item.id)+'" onclick="MinhaCasaUI.editSuggestion(this.dataset.id)">Editar e aceitar</button>'+
        '<button class="mh-btn mh-btn-quiet" data-id="'+esc(item.id)+'" onclick="MinhaCasaUI.askIgnoreSuggestion(this.dataset.id)">Ignorar</button>'+
      '</div>'+
    '</article>';
  }

  function renderRecurring(){
    var rows=homeState.data.recurring;
    return '<section class="mh-recurring-page" aria-labelledby="mh-recurring-title">'+
      '<div class="mh-section-heading"><div><span class="mh-kicker">LEMBRETES MENSAIS</span><h2 id="mh-recurring-title">Contas fixas</h2>'+
      '<p>No dia programado, cada conta aparece em A confirmar.</p></div>'+
      '<button class="mh-btn mh-btn-primary" onclick="MinhaCasaUI.openRecurring()">+ Nova conta fixa</button></div>'+
      '<div class="mh-confidence-note"><span aria-hidden="true">↻</span><p>Uma conta fixa <strong>não altera seu saldo automaticamente</strong> e não será sugerida duas vezes no mesmo mês.</p></div>'+
      (rows.length?'<div class="mh-recurring-grid">'+rows.map(renderRecurringCard).join('')+'</div>'
        :emptyBlock('Nenhuma conta fixa cadastrada.','Cadastre internet, gás, energia da residência, celular ou outra despesa recorrente.'))+
    '</section>';
  }

  function renderRecurringCard(item){
    var category=categoryById(item.categoryId)||{name:item.categoryName||'Sem categoria',emoji:'🏷️',color:'#77718A'};
    var member=memberById(item.memberId)||{name:item.memberName||'Não informado',emoji:'👤'};
    return '<article class="mh-recurring-card'+(item.active?'':' is-paused')+'">'+
      '<div class="mh-recurring-top"><span style="--mh-item-color:'+normalizeColor(category.color,'#6D5BD0')+'">'+esc(category.emoji)+'</span>'+
      '<div><h3>'+esc(item.name)+'</h3><small>'+esc(category.name)+' · '+esc(member.emoji+' '+member.name)+'</small></div>'+
      '<button class="mh-row-menu" data-id="'+esc(item.id)+'" onclick="MinhaCasaUI.openRecurringMenu(this.dataset.id)" aria-label="Editar ou excluir conta fixa">•••</button></div>'+
      '<strong class="mh-recurring-value mh-money">'+esc(formatMoney(item.amount))+'</strong>'+
      '<div class="mh-recurring-foot"><span>Todo dia <b>'+item.dayOfMonth+'</b></span>'+
      '<span class="mh-status '+(item.active?'active':'paused')+'">'+(item.active?'Ativa':'Pausada')+'</span></div>'+
    '</article>';
  }

  function renderOrganize(){
    var members=homeState.data.members;
    var categories=homeState.data.categories;
    return '<section class="mh-organize" aria-labelledby="mh-organize-title">'+
      '<div class="mh-section-heading"><div><span class="mh-kicker">DO SEU JEITO</span><h2 id="mh-organize-title">Organizar</h2>'+
      '<p>Crie livremente as pessoas e categorias usadas pela família.</p></div></div>'+
      '<div class="mh-organize-grid">'+
        '<section class="mh-panel"><div class="mh-panel-heading"><div><h3>Membros da família</h3><span>Quem gastou ou recebeu</span></div>'+
        '<button class="mh-small-add" onclick="MinhaCasaUI.openMember()">+ Pessoa</button></div>'+
        (members.length?'<div class="mh-setup-list">'+members.map(renderMemberRow).join('')+'</div>':emptyBlock('Nenhuma pessoa cadastrada.','Adicione a primeira pessoa da casa.'))+'</section>'+
        '<section class="mh-panel"><div class="mh-panel-heading"><div><h3>Categorias</h3><span>Como o dinheiro é organizado</span></div>'+
        '<button class="mh-small-add" onclick="MinhaCasaUI.openCategory()">+ Categoria</button></div>'+
        (categories.length?'<div class="mh-setup-list">'+categories.map(renderCategoryRow).join('')+'</div>':emptyBlock('Nenhuma categoria cadastrada.','Adicione categorias para entradas e saídas.'))+'</section>'+
      '</div>'+
      '<section class="mh-panel mh-start-note"><div><span aria-hidden="true">◎</span><div><h3>Quer informar o que já possui?</h3>'+
      '<p>Registre uma entrada com a categoria “Valor inicial”. O controle continua sendo apenas de entradas e saídas, sem contas bancárias.</p></div></div>'+
      '<button class="mh-btn mh-btn-outline" onclick="MinhaCasaUI.openTransaction(\'entrada\')">Adicionar valor inicial</button></section>'+
    '</section>';
  }

  function renderMemberRow(item){
    return '<div class="mh-setup-row'+(item.active?'':' is-inactive')+'">'+
      '<span class="mh-avatar" style="--mh-item-color:'+normalizeColor(item.color,'#6D5BD0')+'">'+esc(item.emoji)+'</span>'+
      '<div><strong>'+esc(item.name)+'</strong><small>'+(item.active?'Disponível nos lançamentos':'Inativo')+'</small></div>'+
      '<button class="mh-row-menu" data-id="'+esc(item.id)+'" onclick="MinhaCasaUI.openMemberMenu(this.dataset.id)" aria-label="Editar ou excluir membro">•••</button>'+
    '</div>';
  }

  function renderCategoryRow(item){
    var typeLabel=item.type==='entrada'?'Entrada':item.type==='saida'?'Saída':'Entrada e saída';
    return '<div class="mh-setup-row'+(item.active?'':' is-inactive')+'">'+
      '<span class="mh-avatar" style="--mh-item-color:'+normalizeColor(item.color,'#D69E2E')+'">'+esc(item.emoji)+'</span>'+
      '<div><strong>'+esc(item.name)+'</strong><small>'+esc(typeLabel)+(item.active?'':' · Inativa')+'</small></div>'+
      '<button class="mh-row-menu" data-id="'+esc(item.id)+'" onclick="MinhaCasaUI.openCategoryMenu(this.dataset.id)" aria-label="Editar ou excluir categoria">•••</button>'+
    '</div>';
  }

  function option(value,label,selected){
    return '<option value="'+esc(value)+'"'+(String(value)===String(selected)?' selected':'')+'>'+esc(label)+'</option>';
  }

  function categoryOptions(selected,type){
    return '<option value="">Escolha uma categoria</option>'+availableCategories(selected,type).map(function(item){
      return option(item.id,item.emoji+' '+item.name,selected);
    }).join('');
  }

  function availableCategories(selected,type){
    return homeState.data.categories.filter(function(item){
      var available=item.active || String(item.id)===String(selected);
      return available && (!type || item.type==='ambos' || item.type===type || String(item.id)===String(selected));
    });
  }

  function memberOptions(selected){
    return '<option value="">Escolha uma pessoa</option>'+availableMembers(selected).map(function(item){
      return option(item.id,item.emoji+' '+item.name,selected);
    }).join('');
  }

  function availableMembers(selected){
    return homeState.data.members.filter(function(item){
      return item.active || String(item.id)===String(selected);
    });
  }

  function categoryChoices(selected,type){
    var categories=availableCategories(selected,type);
    if(!categories.length) return '<p class="mh-choice-empty">Crie uma categoria em Organizar.</p>';
    return categories.map(function(item){
      return '<label class="mh-choice"><input type="radio" name="mh_tx_category" value="'+esc(item.id)+'"'+(String(item.id)===String(selected)?' checked':'')+'>'+
        '<span style="--mh-choice-color:'+normalizeColor(item.color,'#D69E2E')+'"><i>'+esc(item.emoji)+'</i><b>'+esc(item.name)+'</b></span></label>';
    }).join('');
  }

  function memberChoices(selected){
    var members=availableMembers(selected);
    if(!members.length) return '<p class="mh-choice-empty">Crie uma pessoa em Organizar.</p>';
    return members.map(function(item){
      return '<label class="mh-choice mh-choice-member"><input type="radio" name="mh_tx_member" value="'+esc(item.id)+'"'+(String(item.id)===String(selected)?' checked':'')+'>'+
        '<span style="--mh-choice-color:'+normalizeColor(item.color,'#6D5BD0')+'"><i>'+esc(item.emoji)+'</i><b>'+esc(item.name)+'</b></span></label>';
    }).join('');
  }

  function openTransaction(type,id){
    var item=id?homeState.data.transactions.find(function(row){return String(row.id)===String(id);}):null;
    var initial=item||{
      type:normalizeType(type||'saida','saida'),
      amount:0,
      date:today(),
      description:'',
      categoryId:'',
      memberId:''
    };
    homeState.modalContext={kind:'transaction',id:item?item.id:'',mode:item?'edit':'create'};
    dialog(transactionFormHtml(initial,item?'Editar movimentação':'Novo lançamento',item?'Salvar alterações':'Salvar lançamento'));
  }

  function transactionFormHtml(item,title,buttonLabel,sourceText){
    var isIncome=item.type==='entrada';
    return '<h3 class="modal-title">'+esc(title)+'</h3>'+
      (sourceText?'<p class="mh-modal-source">'+esc(sourceText)+'</p>':'')+
      '<div class="mh-kind-selector" role="radiogroup" aria-label="Tipo da movimentação">'+
        '<label class="mh-kind-income"><input type="radio" name="mh_tx_type" value="entrada"'+(isIncome?' checked':'')+' onchange="MinhaCasaUI.updateModalCategoryOptions()"><span><b>+ Entrada</b><small>dinheiro recebido</small></span></label>'+
        '<label class="mh-kind-expense"><input type="radio" name="mh_tx_type" value="saida"'+(!isIncome?' checked':'')+' onchange="MinhaCasaUI.updateModalCategoryOptions()"><span><b>− Saída</b><small>dinheiro gasto</small></span></label>'+
      '</div>'+
      '<label class="mh-field mh-amount-field"><span>Valor</span><div><b>R$</b><input id="mh_tx_amount" inputmode="decimal" autocomplete="off" placeholder="0,00" value="'+esc(item.amount?item.amount.toFixed(2).replace('.',','):'')+'"></div></label>'+
      '<div class="mh-choice-block"><span>Categoria</span><div id="mh_tx_category_choices" class="mh-choice-grid">'+categoryChoices(item.categoryId,item.type)+'</div></div>'+
      '<div class="mh-choice-block"><span>Quem gastou ou recebeu</span><div class="mh-choice-grid mh-member-choice-grid">'+memberChoices(item.memberId)+'</div>'+
      '</div>'+
      paymentBlockHtml(item)+
      ((!activeCategories().length||!activeMembers().length)?'<p class="mh-form-warning">Crie pelo menos uma categoria e uma pessoa em Organizar antes de salvar.</p>':'')+
      '<details class="mh-more"'+(item.description?' open':'')+'><summary>Mais detalhes <span>opcional</span></summary>'+
        '<div class="mh-form-grid"><label class="mh-field"><span>Data</span><input id="mh_tx_date" type="date" value="'+esc(item.date||today())+'"></label>'+
        '<label class="mh-field"><span>Descrição</span><input id="mh_tx_description" maxlength="180" value="'+esc(item.description||'')+'" placeholder="Ex.: compra da semana"></label></div>'+
      '</details>'+
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
        '<button class="mh-btn mh-btn-primary" onclick="MinhaCasaUI.submitTransaction()"'+(homeState.busy?' disabled':'')+'>'+esc(buttonLabel)+'</button></div>';
  }

  /* Bloco de pagamento. Ao editar uma parcela, o parcelamento fica
     travado: mudar de 10x para 4x no meio bagunçaria as parcelas já
     lançadas. Para isso, exclua a compra e lance de novo. */
  function paymentBlockHtml(item){
    var atual=normalizePaymentMethod(item.paymentMethod);
    var editandoParcela=isInstallmentPurchase(item);
    var parcelas=Math.max(1,Number(item.installments)||1);
    return '<div class="mh-choice-block"><span>Forma de pagamento</span>'+
      '<div class="mh-choice-grid mh-pay-grid">'+PAYMENT_METHODS.map(function(m){
        return '<label class="mh-choice'+(m.id===atual?' is-selected':'')+'">'+
          '<input type="radio" name="mh_tx_payment" value="'+m.id+'"'+(m.id===atual?' checked':'')+
          ' onchange="MinhaCasaUI.updatePaymentOptions()">'+
          '<span><i aria-hidden="true">'+m.emoji+'</i><b>'+esc(m.label)+'</b></span></label>';
      }).join('')+'</div></div>'+
      '<div id="mh_tx_installment_block" class="mh-installments"'+
        (atual==='credito'?'':' hidden')+'>'+
        (editandoParcela
          ? '<p class="mh-installment-lock">Parcela '+item.installment+' de '+parcelas+
            '. Para mudar o parcelamento, exclua a compra inteira e lance de novo.</p>'+
            '<input type="hidden" id="mh_tx_installments" value="1">'
          : '<label class="mh-field"><span>Parcelas</span>'+
            '<select id="mh_tx_installments" onchange="MinhaCasaUI.updatePaymentOptions()">'+
            installmentOptions(parcelas)+'</select></label>'+
            '<p class="mh-installment-hint" id="mh_tx_installment_hint"></p>')+
      '</div>';
  }
  function installmentOptions(selected){
    var out='';
    for(var n=1;n<=24;n++){
      out+='<option value="'+n+'"'+(n===selected?' selected':'')+'>'+
        (n===1?'À vista (1x)':n+'x')+'</option>';
    }
    return out;
  }
  /* Mostra a conta feita: "10x de R$ 120,00 — a última em mar/2027".
     É a informação que evita o susto de lançar errado. */
  function updatePaymentOptions(){
    var bloco=document.getElementById('mh_tx_installment_block');
    if(!bloco) return;
    var forma=selectedPaymentMethod();
    if(forma==='credito') bloco.removeAttribute('hidden');
    else bloco.setAttribute('hidden','');
    var dica=document.getElementById('mh_tx_installment_hint');
    if(!dica) return;
    var n=Math.max(1,parseInt((document.getElementById('mh_tx_installments')||{}).value,10)||1);
    var total=toNumber((document.getElementById('mh_tx_amount')||{}).value);
    if(forma!=='credito'||n<2||total<=0){ dica.textContent=''; return; }
    var parcela=Math.trunc((total/n)*100)/100;
    var primeira=Math.round((total-parcela*(n-1))*100)/100;
    var base=(document.getElementById('mh_tx_date')||{}).value||today();
    var partes=base.split('-');
    var ultima=new Date(Number(partes[0]),Number(partes[1])-1+(n-1),1);
    var mes=String(ultima.getMonth()+1).padStart(2,'0')+'/'+ultima.getFullYear();
    dica.textContent=n+'x de '+formatMoney(parcela)+
      (primeira!==parcela?' (primeira de '+formatMoney(primeira)+')':'')+
      ' · última em '+mes;
  }
  function selectedPaymentMethod(){
    var field=document.querySelector('input[name="mh_tx_payment"]:checked');
    return field?normalizePaymentMethod(field.value):'dinheiro';
  }

  function selectedTransactionType(){
    var field=document.querySelector('input[name="mh_tx_type"]:checked');
    return field?normalizeType(field.value,'saida'):'saida';
  }

  function updateModalCategoryOptions(){
    var root=document.getElementById('mh_tx_category_choices');
    if(!root) return;
    var checked=document.querySelector('input[name="mh_tx_category"]:checked');
    var selected=checked?checked.value:'';
    var selectedType=selectedTransactionType();
    var current=categoryById(selected);
    if(current && current.type!=='ambos' && current.type!==selectedType) selected='';
    root.innerHTML=categoryChoices(selected,selectedType);
  }

  function readTransactionForm(){
    var amount=toNumber((document.getElementById('mh_tx_amount')||{}).value);
    var categoryField=document.querySelector('input[name="mh_tx_category"]:checked');
    var memberField=document.querySelector('input[name="mh_tx_member"]:checked');
    var categoryId=categoryField?categoryField.value:'';
    var memberId=memberField?memberField.value:'';
    var date=(document.getElementById('mh_tx_date')||{}).value||today();
    var description=((document.getElementById('mh_tx_description')||{}).value||'').trim();
    if(amount<=0) throw new Error('Informe um valor maior que zero.');
    if(!categoryId) throw new Error('Escolha uma categoria.');
    if(!memberId) throw new Error('Escolha quem gastou ou recebeu.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Informe uma data válida.');
    var paymentMethod=selectedPaymentMethod();
    var installments=Math.max(1,parseInt((document.getElementById('mh_tx_installments')||{}).value,10)||1);
    if(paymentMethod!=='credito') installments=1;
    if(installments>24) throw new Error('No máximo 24 parcelas.');
    return {
      type:selectedTransactionType(),
      amount:amount,
      categoryId:categoryId,
      memberId:memberId,
      date:date,
      description:description,
      paymentMethod:paymentMethod,
      installments:installments
    };
  }

  async function submitTransaction(){
    var payload;
    try{ payload=readTransactionForm(); }
    catch(error){toast(error.message,'error');return;}
    var context=homeState.modalContext||{};
    if(context.kind==='suggestion'){
      await runMutation('acceptMyHomeSuggestion',[context.id,payload],'Valor ajustado e aceito.');
      return;
    }
    if(context.mode==='edit'){
      payload.id=context.id;
      await runMutation('updateMyHomeTransaction',[context.id,payload],'Movimentação atualizada.');
      return;
    }
    var aviso = payload.installments>1
      ? payload.installments+'x lançadas, uma por mês.'
      : 'Movimentação registrada.';
    await runMutation('createMyHomeTransaction',[payload],aviso);
  }

  function openTransactionMenu(id){
    var item=homeState.data.transactions.find(function(row){return String(row.id)===String(id);});
    if(!item) return;
    dialog('<h3 class="modal-title">O que deseja fazer?</h3>'+
      '<p class="modal-text">'+esc(item.description||transactionCategory(item).name)+' · '+esc(formatMoney(item.amount))+'</p>'+
      '<div class="mh-action-menu">'+
        '<button data-id="'+esc(item.id)+'" onclick="closeModal();MinhaCasaUI.openTransaction(null,this.dataset.id)"><span>✎</span><b>Editar '+(isInstallmentPurchase(item)?'esta parcela':'movimentação')+'</b></button>'+
        (isInstallmentPurchase(item)
          ? '<button class="danger" data-id="'+esc(item.purchaseId)+'" onclick="MinhaCasaUI.askDeletePurchase(this.dataset.id)"><span>×</span><b>Excluir a compra inteira ('+item.installments+'x)</b></button>'
          : '<button class="danger" data-id="'+esc(item.id)+'" onclick="MinhaCasaUI.askDeleteTransaction(this.dataset.id)"><span>×</span><b>Excluir movimentação</b></button>')+
      '</div>');
  }

  function askDeletePurchase(purchaseId){
    var parcelas=homeState.data.transactions.filter(function(row){
      return String(row.purchaseId)===String(purchaseId);
    });
    if(!parcelas.length) return;
    var total=parcelas.reduce(function(soma,row){return soma+toNumber(row.amount);},0);
    var nome=parcelas[0].description||transactionCategory(parcelas[0]).name;
    dialog('<h3 class="modal-title">Excluir a compra inteira?</h3>'+
      '<p class="modal-text"><strong>'+esc(nome)+'</strong> — '+parcelas[0].installments+
      ' parcelas, somando <strong>'+esc(formatMoney(total))+'</strong>. '+
      'Todas as parcelas serão removidas, inclusive as dos próximos meses.</p>'+
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-danger" data-id="'+esc(purchaseId)+'" onclick="MinhaCasaUI.deletePurchase(this.dataset.id)">Excluir tudo</button></div>');
  }
  async function deletePurchase(purchaseId){
    await runMutation('deleteMyHomePurchase',[purchaseId],'Compra excluída com todas as parcelas.');
  }

  function askDeleteTransaction(id){
    var item=homeState.data.transactions.find(function(row){return String(row.id)===String(id);});
    if(!item) return;
    dialog('<h3 class="modal-title">Excluir movimentação?</h3>'+
      '<p class="modal-text">O lançamento <strong>'+esc(item.description||transactionCategory(item).name)+'</strong>, no valor de <strong>'+esc(formatMoney(item.amount))+'</strong>, será removido do histórico e do saldo.</p>'+
      (item.sourceType&&item.sourceType!=='manual'?'<p class="mh-form-warning">A origem continuará identificada no sistema dos imóveis, mas esta confirmação da Minha Casa será removida.</p>':'')+
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-danger" data-id="'+esc(item.id)+'" onclick="MinhaCasaUI.deleteTransaction(this.dataset.id)">Excluir</button></div>');
  }

  async function deleteTransaction(id){
    await runMutation('deleteMyHomeTransaction',[id],'Movimentação excluída.');
  }

  async function acceptSuggestion(id){
    var item=homeState.data.suggestions.find(function(row){return String(row.id)===String(id);});
    if(!item) return;
    if(!item.categoryId || !item.memberId){
      toast('Defina categoria e pessoa antes de aceitar.','error');
      editSuggestion(id);
      return;
    }
    await runMutation('acceptMyHomeSuggestion',[id],'Valor aceito e incluído no saldo.',{close:false});
  }

  function editSuggestion(id){
    var item=homeState.data.suggestions.find(function(row){return String(row.id)===String(id);});
    if(!item) return;
    homeState.modalContext={kind:'suggestion',id:item.id,mode:'accept'};
    var source=sourceInfo(item.sourceType,item.sourceLabel);
    dialog(transactionFormHtml(item,'Editar e aceitar','Salvar e aceitar',source.icon+' '+source.label+(item.houseName?' · '+item.houseName:'')));
  }

  function askIgnoreSuggestion(id){
    var item=homeState.data.suggestions.find(function(row){return String(row.id)===String(id);});
    if(!item) return;
    var source=sourceInfo(item.sourceType,item.sourceLabel);
    dialog('<h3 class="modal-title">Ignorar esta sugestão?</h3>'+
      '<p class="modal-text"><strong>'+esc(source.label)+'</strong> de <strong>'+esc(formatMoney(item.amount))+'</strong> não entrará no financeiro da família.</p>'+
      '<p class="mh-form-warning">O valor não será sugerido novamente para esta mesma origem.</p>'+
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Voltar</button>'+
      '<button class="btn btn-danger" data-id="'+esc(item.id)+'" onclick="MinhaCasaUI.ignoreSuggestion(this.dataset.id)">Ignorar valor</button></div>');
  }

  async function ignoreSuggestion(id){
    await runMutation('ignoreMyHomeSuggestion',[id],'Sugestão ignorada.');
  }

  function openRecurring(id){
    var item=id?homeState.data.recurring.find(function(row){return String(row.id)===String(id);}):null;
    var initial=item||{id:'',name:'',amount:0,dayOfMonth:5,categoryId:'',memberId:'',description:'',active:true,type:'saida'};
    homeState.modalContext={kind:'recurring',id:item?item.id:'',mode:item?'edit':'create'};
    dialog('<h3 class="modal-title">'+(item?'Editar conta fixa':'Nova conta fixa')+'</h3>'+
      '<p class="modal-text">No dia escolhido, ela aparecerá em A confirmar. Nenhum valor entra automaticamente.</p>'+
      '<label class="mh-field"><span>Nome da conta</span><input id="mh_rec_name" maxlength="80" value="'+esc(initial.name)+'" placeholder="Ex.: Internet"></label>'+
      '<div class="mh-form-grid"><label class="mh-field"><span>Valor previsto</span><input id="mh_rec_amount" inputmode="decimal" value="'+esc(initial.amount?initial.amount.toFixed(2).replace('.',','):'')+'" placeholder="0,00"></label>'+
      '<label class="mh-field"><span>Dia do mês (1 a 28)</span><input id="mh_rec_day" type="number" min="1" max="28" value="'+initial.dayOfMonth+'"></label></div>'+
      '<div class="mh-form-grid"><label class="mh-field"><span>Categoria de saída</span><select id="mh_rec_category">'+categoryOptions(initial.categoryId,'saida')+'</select></label>'+
      '<label class="mh-field"><span>Quem costuma gastar</span><select id="mh_rec_member">'+memberOptions(initial.memberId)+'</select></label></div>'+
      '<label class="mh-field"><span>Descrição <small>(opcional)</small></span><input id="mh_rec_description" maxlength="180" value="'+esc(initial.description)+'" placeholder="Observação para a confirmação"></label>'+
      '<label class="mh-toggle"><input id="mh_rec_active" type="checkbox"'+(initial.active?' checked':'')+'><span></span><b>Conta fixa ativa</b></label>'+
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="mh-btn mh-btn-primary" onclick="MinhaCasaUI.saveRecurring()">Salvar conta fixa</button></div>');
  }

  function readRecurringForm(){
    var name=((document.getElementById('mh_rec_name')||{}).value||'').trim();
    var amount=toNumber((document.getElementById('mh_rec_amount')||{}).value);
    var day=parseInt((document.getElementById('mh_rec_day')||{}).value,10);
    var categoryId=(document.getElementById('mh_rec_category')||{}).value||'';
    var memberId=(document.getElementById('mh_rec_member')||{}).value||'';
    if(!name) throw new Error('Informe o nome da conta fixa.');
    if(amount<=0) throw new Error('Informe um valor maior que zero.');
    if(!Number.isFinite(day)||day<1||day>28) throw new Error('Escolha um dia entre 1 e 28, para funcionar em todos os meses.');
    if(!categoryId) throw new Error('Escolha uma categoria.');
    if(!memberId) throw new Error('Escolha uma pessoa.');
    return {
      name:name,
      type:'saida',
      amount:amount,
      dayOfMonth:day,
      categoryId:categoryId,
      memberId:memberId,
      description:((document.getElementById('mh_rec_description')||{}).value||'').trim(),
      active:!!((document.getElementById('mh_rec_active')||{}).checked)
    };
  }

  async function saveRecurring(){
    var payload;
    try{payload=readRecurringForm();}
    catch(error){toast(error.message,'error');return;}
    var context=homeState.modalContext||{};
    if(context.id) payload.id=context.id;
    await runMutation('saveMyHomeRecurring',[payload],'Conta fixa salva.');
  }

  function openRecurringMenu(id){
    var item=homeState.data.recurring.find(function(row){return String(row.id)===String(id);});
    if(!item) return;
    dialog('<h3 class="modal-title">'+esc(item.name)+'</h3><p class="modal-text">Todo dia '+item.dayOfMonth+' · '+esc(formatMoney(item.amount))+'</p>'+
      '<div class="mh-action-menu">'+
      '<button data-id="'+esc(item.id)+'" onclick="closeModal();MinhaCasaUI.openRecurring(this.dataset.id)"><span>✎</span><b>Editar conta fixa</b></button>'+
      '<button class="danger" data-id="'+esc(item.id)+'" onclick="MinhaCasaUI.askDeleteRecurring(this.dataset.id)"><span>×</span><b>Excluir conta fixa</b></button></div>');
  }

  function askDeleteRecurring(id){
    var item=homeState.data.recurring.find(function(row){return String(row.id)===String(id);});
    if(!item) return;
    dialog('<h3 class="modal-title">Excluir conta fixa?</h3><p class="modal-text"><strong>'+esc(item.name)+'</strong> deixará de gerar sugestões mensais. Movimentações já aceitas serão mantidas.</p>'+
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-danger" data-id="'+esc(item.id)+'" onclick="MinhaCasaUI.deleteRecurring(this.dataset.id)">Excluir</button></div>');
  }

  async function deleteRecurring(id){
    await runMutation('deleteMyHomeRecurring',[id],'Conta fixa excluída.');
  }

  function openMember(id){
    var item=id?homeState.data.members.find(function(row){return String(row.id)===String(id);}):null;
    var initial=item||{id:'',name:'',emoji:'👤',color:'#6D5BD0',active:true};
    homeState.modalContext={kind:'member',id:item?item.id:'',mode:item?'edit':'create'};
    dialog('<h3 class="modal-title">'+(item?'Editar pessoa':'Nova pessoa')+'</h3>'+
      '<div class="mh-form-grid mh-form-grid-small"><label class="mh-field"><span>Emoji</span><input id="mh_member_emoji" maxlength="8" value="'+esc(initial.emoji)+'" aria-label="Emoji da pessoa"></label>'+
      '<label class="mh-field"><span>Cor</span><input id="mh_member_color" type="color" value="'+normalizeColor(initial.color,'#6D5BD0')+'"></label></div>'+
      '<label class="mh-field"><span>Nome</span><input id="mh_member_name" maxlength="80" value="'+esc(initial.name)+'" placeholder="Ex.: Anderton"></label>'+
      '<label class="mh-toggle"><input id="mh_member_active" type="checkbox"'+(initial.active?' checked':'')+'><span></span><b>Disponível nos novos lançamentos</b></label>'+
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="mh-btn mh-btn-primary" onclick="MinhaCasaUI.saveMember()">Salvar pessoa</button></div>');
  }

  async function saveMember(){
    var name=((document.getElementById('mh_member_name')||{}).value||'').trim();
    if(!name){toast('Informe o nome da pessoa.','error');return;}
    var context=homeState.modalContext||{};
    var payload={
      name:name,
      emoji:((document.getElementById('mh_member_emoji')||{}).value||'👤').trim().slice(0,8)||'👤',
      color:normalizeColor((document.getElementById('mh_member_color')||{}).value,'#6D5BD0'),
      active:!!((document.getElementById('mh_member_active')||{}).checked)
    };
    if(context.id) payload.id=context.id;
    await runMutation('saveMyHomeMember',[payload],'Pessoa salva.');
  }

  function openMemberMenu(id){
    var item=homeState.data.members.find(function(row){return String(row.id)===String(id);});
    if(!item) return;
    dialog('<h3 class="modal-title">'+esc(item.emoji+' '+item.name)+'</h3>'+
      '<div class="mh-action-menu"><button data-id="'+esc(item.id)+'" onclick="closeModal();MinhaCasaUI.openMember(this.dataset.id)"><span>✎</span><b>Editar pessoa</b></button>'+
      '<button class="danger" data-id="'+esc(item.id)+'" onclick="MinhaCasaUI.askDeleteMember(this.dataset.id)"><span>×</span><b>Excluir pessoa</b></button></div>');
  }

  function askDeleteMember(id){
    var item=homeState.data.members.find(function(row){return String(row.id)===String(id);});
    if(!item) return;
    dialog('<h3 class="modal-title">Excluir '+esc(item.name)+'?</h3>'+
      '<p class="modal-text">A exclusão só será permitida se essa pessoa não estiver sendo usada em movimentações, sugestões ou contas fixas. Se já houver uso, deixe-a inativa.</p>'+
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-danger" data-id="'+esc(item.id)+'" onclick="MinhaCasaUI.deleteMember(this.dataset.id)">Excluir pessoa</button></div>');
  }

  async function deleteMember(id){
    await runMutation('deleteMyHomeMember',[id],'Pessoa excluída.');
  }

  function openCategory(id){
    var item=id?homeState.data.categories.find(function(row){return String(row.id)===String(id);}):null;
    var initial=item||{id:'',name:'',emoji:'🏷️',color:'#D69E2E',type:'saida',active:true};
    homeState.modalContext={kind:'category',id:item?item.id:'',mode:item?'edit':'create'};
    dialog('<h3 class="modal-title">'+(item?'Editar categoria':'Nova categoria')+'</h3>'+
      '<div class="mh-form-grid mh-form-grid-small"><label class="mh-field"><span>Emoji</span><input id="mh_category_emoji" maxlength="8" value="'+esc(initial.emoji)+'" aria-label="Emoji da categoria"></label>'+
      '<label class="mh-field"><span>Cor</span><input id="mh_category_color" type="color" value="'+normalizeColor(initial.color,'#D69E2E')+'"></label></div>'+
      '<label class="mh-field"><span>Nome</span><input id="mh_category_name" maxlength="80" value="'+esc(initial.name)+'" placeholder="Ex.: Mercado"></label>'+
      '<label class="mh-field"><span>Usada em</span><select id="mh_category_type">'+
        option('saida','Saídas',initial.type)+option('entrada','Entradas',initial.type)+option('ambos','Entradas e saídas',initial.type)+'</select></label>'+
      '<label class="mh-toggle"><input id="mh_category_active" type="checkbox"'+(initial.active?' checked':'')+'><span></span><b>Disponível nos novos lançamentos</b></label>'+
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="mh-btn mh-btn-primary" onclick="MinhaCasaUI.saveCategory()">Salvar categoria</button></div>');
  }

  async function saveCategory(){
    var name=((document.getElementById('mh_category_name')||{}).value||'').trim();
    if(!name){toast('Informe o nome da categoria.','error');return;}
    var context=homeState.modalContext||{};
    var payload={
      name:name,
      emoji:((document.getElementById('mh_category_emoji')||{}).value||'🏷️').trim().slice(0,8)||'🏷️',
      color:normalizeColor((document.getElementById('mh_category_color')||{}).value,'#D69E2E'),
      type:normalizeType((document.getElementById('mh_category_type')||{}).value,'saida'),
      active:!!((document.getElementById('mh_category_active')||{}).checked)
    };
    if(context.id) payload.id=context.id;
    await runMutation('saveMyHomeCategory',[payload],'Categoria salva.');
  }

  function openCategoryMenu(id){
    var item=homeState.data.categories.find(function(row){return String(row.id)===String(id);});
    if(!item) return;
    dialog('<h3 class="modal-title">'+esc(item.emoji+' '+item.name)+'</h3>'+
      '<div class="mh-action-menu"><button data-id="'+esc(item.id)+'" onclick="closeModal();MinhaCasaUI.openCategory(this.dataset.id)"><span>✎</span><b>Editar categoria</b></button>'+
      '<button class="danger" data-id="'+esc(item.id)+'" onclick="MinhaCasaUI.askDeleteCategory(this.dataset.id)"><span>×</span><b>Excluir categoria</b></button></div>');
  }

  function askDeleteCategory(id){
    var item=homeState.data.categories.find(function(row){return String(row.id)===String(id);});
    if(!item) return;
    dialog('<h3 class="modal-title">Excluir '+esc(item.name)+'?</h3>'+
      '<p class="modal-text">A exclusão só será permitida se a categoria não estiver sendo usada. Se já houver movimentações, mova-as para outra categoria ou deixe esta inativa.</p>'+
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-danger" data-id="'+esc(item.id)+'" onclick="MinhaCasaUI.deleteCategory(this.dataset.id)">Excluir categoria</button></div>');
  }

  async function deleteCategory(id){
    await runMutation('deleteMyHomeCategory',[id],'Categoria excluída.');
  }

  function filterHistoryFromScreen(){
    var query=document.getElementById('mh_history_query');
    var type=document.getElementById('mh_history_type');
    var member=document.getElementById('mh_history_member');
    var category=document.getElementById('mh_history_category');
    var month=document.getElementById('mh_history_month');
    homeState.history.query=query?query.value:'';
    homeState.history.type=type?type.value:'all';
    homeState.history.memberId=member?member.value:'all';
    homeState.history.categoryId=category?category.value:'all';
    homeState.history.month=month?month.value:'';
    var root=document.getElementById('mh-history-results');
    if(root) root.innerHTML=renderHistoryResults();
  }

  function selectTab(tab){
    homeState.tab=VALID_TABS.indexOf(tab)>=0?tab:'dashboard';
    requestRender();
    if(typeof window!=='undefined' && typeof window.scrollTo==='function'){
      setTimeout(function(){
        var root=document.querySelector('.minha-casa');
        if(root) root.scrollIntoView({behavior:'smooth',block:'start'});
      },0);
    }
  }

  function changeMonth(delta){
    homeState.month=addMonths(homeState.month,delta);
    requestRender();
  }

  function setMonth(value){
    if(/^\d{4}-\d{2}$/.test(String(value||''))) homeState.month=value;
    requestRender();
  }

  function togglePrivacy(){
    homeState.privateValues=!homeState.privateValues;
    savePrivacy();
    requestRender();
  }

  async function activate(){
    await runMutation('activateMyHome',[],'Minha Casa foi ativada. Seu saldo começa em zero.',{close:false});
  }

  function enter(){
    ensureLoad();
    return renderView();
  }

  function reset(){
    homeState.loaded=false;
    homeState.loading=false;
    homeState.busy=false;
    homeState.error='';
    homeState.tab='dashboard';
    homeState.month=currentMonth();
    homeState.modalContext=null;
    homeState.data=emptyData();
    homeState.history={query:'',type:'all',categoryId:'all',memberId:'all',month:''};
  }

  var apiPublic={
    render:renderView,
    enter:enter,
    refresh:function(){return loadData(true);},
    reset:reset,
    activate:activate,
    selectTab:selectTab,
    changeMonth:changeMonth,
    setMonth:setMonth,
    togglePrivacy:togglePrivacy,
    filterHistoryFromScreen:filterHistoryFromScreen,
    openTransaction:openTransaction,
    updateModalCategoryOptions:updateModalCategoryOptions,
    submitTransaction:submitTransaction,
    openTransactionMenu:openTransactionMenu,
    askDeleteTransaction:askDeleteTransaction,
    deleteTransaction:deleteTransaction,
    updatePaymentOptions:updatePaymentOptions,
    askDeletePurchase:askDeletePurchase,
    deletePurchase:deletePurchase,
    acceptSuggestion:acceptSuggestion,
    editSuggestion:editSuggestion,
    askIgnoreSuggestion:askIgnoreSuggestion,
    ignoreSuggestion:ignoreSuggestion,
    openRecurring:openRecurring,
    saveRecurring:saveRecurring,
    openRecurringMenu:openRecurringMenu,
    askDeleteRecurring:askDeleteRecurring,
    deleteRecurring:deleteRecurring,
    openMember:openMember,
    saveMember:saveMember,
    openMemberMenu:openMemberMenu,
    askDeleteMember:askDeleteMember,
    deleteMember:deleteMember,
    openCategory:openCategory,
    saveCategory:saveCategory,
    openCategoryMenu:openCategoryMenu,
    askDeleteCategory:askDeleteCategory,
    deleteCategory:deleteCategory,
    _normalizePayload:normalizePayload,
    _state:homeState
  };

  window.MinhaCasaUI=apiPublic;
  window.renderMinhaCasaView=renderView;
  window.loadMinhaCasaData=function(){return loadData(true);};
  window.resetMinhaCasaUI=reset;
})();
