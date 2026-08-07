/* ============================================================
   owners.js — Proprietários-clientes

   O dono do imóvel que a corretora administra. Não confundir com:
     · `proprietarios`  — a conta de quem usa o aplicativo;
     · `inquilinos`     — quem mora na casa;
     · `vitrine_anunciantes` — o mesmo papel, mas só para o catálogo
       público, e por isso preso ao módulo Vitrine.

   É o cadastro que sustenta a prestação de contas: sem saber de quem é
   cada casa, não há como dizer a ninguém quanto entrou do que é dele.
   ============================================================ */

function irProprietarios(){ state.view='proprietarios'; render(); }

function ownerClientById(id){
  if(!id) return null;
  return (state.owners||[]).find(function(o){return String(o.id)===String(id);})||null;
}
function ownerClientName(id){
  const o=ownerClientById(id);
  return o?o.nome:'';
}
/* Imóveis desta pessoa. É a base do extrato e do que a tela mostra. */
function housesOfOwnerClient(id){
  if(!id) return [];
  return (state.houses||[]).filter(function(h){
    return String(h.proprietarioClienteId||'')===String(id);
  });
}
/* Quantas casas ainda não têm dono declarado. Numa carteira própria isso
   é o normal; numa carteira administrada, é trabalho pendente. */
function housesWithoutOwnerClient(){
  return (state.houses||[]).filter(function(h){return !h.proprietarioClienteId;});
}

function setOwnerSearch(value){ state.ownerSearch=value; render(); }

function ownersFiltered(){
  const q=String(state.ownerSearch||'').trim().toLowerCase();
  return (state.owners||[]).filter(function(o){
    if(!q) return true;
    return (o.nome+' '+o.telefone+' '+o.email+' '+o.documento).toLowerCase().includes(q);
  }).slice().sort(function(a,b){return a.nome.localeCompare(b.nome,'pt-BR');});
}

function renderOwnerCard(o){
  const casas=housesOfOwnerClient(o.id);
  const alugadas=casas.filter(function(h){return h.status==='alugada';});
  /* O que ele recebe por mês, hoje: soma do aluguel das casas ocupadas,
     menos a taxa de administração. É o número que ele quer saber. */
  const bruto=alugadas.reduce(function(s,h){return s+(Number(h.aluguelValor)||0);},0);
  const taxa=bruto*(Number(o.taxaAdministracao)||0)/100;
  const canEdit=canOperateProperties();
  return '<article class="owner-card">'+
    '<div class="owner-card-head"><div>'+
      '<h3>'+esc(o.nome)+'</h3>'+
      '<span>'+esc([o.telefone,o.email].filter(Boolean).join(' · ')||'Sem contato informado')+'</span>'+
    '</div>'+
    '<button class="icon-action" onclick="openOwnerModal(\''+o.id+'\')">'+(canEdit?'Editar':'Ver')+'</button>'+
    '</div>'+
    '<div class="owner-numbers">'+
      '<div><span>Imóveis</span><strong>'+casas.length+'</strong></div>'+
      '<div><span>Alugados</span><strong>'+alugadas.length+'</strong></div>'+
      '<div><span>Aluguel no mês</span><strong>'+fmtMoney(bruto)+'</strong></div>'+
      (Number(o.taxaAdministracao)>0
        ? '<div><span>Repasse estimado</span><strong>'+fmtMoney(bruto-taxa)+'</strong></div>'
        : '')+
    '</div>'+
    (casas.length
      /* Ordenado por nome e com o valor alinhado à direita: dez imóveis
         numa nuvem de etiquetas soltas não se compara, só se lê um a um.
         Em colunas, o olho desce pela coluna do dinheiro. */
      ? '<div class="owner-house-list">'+casas.slice().sort(function(a,b){
          return String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR');
        }).map(function(h){
          const vago=h.status!=='alugada';
          return '<button class="'+(vago?'is-vago':'')+'" onclick="openHouse(\''+h.id+'\')" '+
            'title="'+esc(h.nome)+(vago?' · sem inquilino':'')+'">'+
            '<span>'+esc(h.nome)+'</span>'+
            '<b>'+fmtMoney(h.aluguelValor)+'</b></button>';
        }).join('')+'</div>'
      : '<p class="muted">Nenhum imóvel vinculado. Abra a casa e escolha o proprietário na ficha.</p>')+
    (o.observacoes?'<p class="owner-notes">'+esc(o.observacoes)+'</p>':'')+
    (casas.length?'<div class="owner-actions">'+
      '<button class="btn btn-primary btn-sm" onclick="openOwnerStatementModal(\''+o.id+'\')">Extrato</button>'+
      (o.telefone?'<button class="btn btn-ghost btn-sm" onclick="openOwnerWhatsapp(\''+o.id+'\')">WhatsApp</button>':'')+
    '</div>':'')+
  '</article>';
}

/* A carteira inteira em quatro números, antes dos cartões.
   Com um proprietário só, a tela ficava com um cartão à esquerda e o
   resto vazio; e mesmo com vinte, a soma da carteira não existia em
   lugar nenhum — era preciso abrir um a um e fazer conta de cabeça. */
function renderCarteiraResumo(lista){
  if(!lista.length) return '';
  let imoveis=0,alugados=0,bruto=0,taxa=0;
  lista.forEach(function(o){
    const casas=housesOfOwnerClient(o.id);
    const ocupadas=casas.filter(function(h){return h.status==='alugada';});
    const b=ocupadas.reduce(function(s,h){return s+(Number(h.aluguelValor)||0);},0);
    imoveis+=casas.length; alugados+=ocupadas.length; bruto+=b;
    taxa+=b*(Number(o.taxaAdministracao)||0)/100;
  });
  const item=function(rot,val,destaque){
    return '<div'+(destaque?' class="destaque"':'')+'><span>'+rot+'</span><strong>'+val+'</strong></div>';
  };
  return '<div class="carteira-resumo">'+
    item('Proprietários',String(lista.length))+
    item('Imóveis',imoveis+(alugados<imoveis?' <i>'+alugados+' alugados</i>':''))+
    item('Aluguel no mês',fmtMoney(bruto))+
    /* Só aparece quando alguém cobra taxa: numa carteira própria o
       número seria sempre zero e viraria ruído. */
    (taxa>0?item('Sua taxa',fmtMoney(taxa),true):'')+
  '</div>';
}
function renderProprietariosView(){
  const lista=ownersFiltered();
  const semDono=housesWithoutOwnerClient();
  const canEdit=canOperateProperties();
  return '<div class="page-header"><div>'+
      '<span class="eyebrow">CARTEIRA ADMINISTRADA</span>'+
      pageTitleWithIcon(ownerIconSvg(),'Proprietários')+
      '<p class="page-sub">Os donos dos imóveis que você administra. É daqui que sai a '+
      'prestação de contas de cada um.</p></div>'+
      (canEdit?'<div class="header-actions">'+
        '<button class="btn btn-primary btn-sm" onclick="openOwnerModal()">+ Novo proprietário</button>'+
      '</div>':'')+
    '</div>'+
    (state.owners&&state.owners.length
      ? '<div class="list-toolbar">'+
          '<input class="search-input" placeholder="Buscar por nome, telefone ou documento" '+
            'value="'+esc(state.ownerSearch||'')+'" oninput="setOwnerSearch(this.value)">'+
        '</div>'
      : '')+
    (semDono.length&&state.owners&&state.owners.length
      ? '<div class="notice-box">'+semDono.length+' imóvel(is) ainda sem proprietário definido. '+
        'Enquanto estiverem assim, não entram em nenhum extrato.</div>'
      : '')+
    renderCarteiraResumo(lista)+
    (lista.length
      ? '<div class="owner-grid">'+lista.map(renderOwnerCard).join('')+'</div>'
      : emptyState(
          (state.owners&&state.owners.length)
            ? 'Nenhum proprietário encontrado com esse termo.'
            : 'Nenhum proprietário cadastrado. Cadastre o dono de cada imóvel que você administra para poder prestar contas a ele.',
          ownerIconSvg()));
}

function ownerIconSvg(){
  return '<svg width="40" height="40" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">'+
    '<path d="M24 8 L38 19 V40 H10 V19 Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>'+
    '<circle cx="24" cy="27" r="4.5" stroke="currentColor" stroke-width="2.5"/>'+
    '<path d="M17 37c0-3.6 3.1-6 7-6s7 2.4 7 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
}

/* ------------------------------------------------------------
   CADASTRO
   ------------------------------------------------------------ */
function openOwnerModal(id){
  const o=id?ownerClientById(id):null;
  const canEdit=canOperateProperties();
  if(!canEdit&&!o) return;
  const i=o||{};
  openModal('<h3 class="modal-title">'+(o?'Proprietário':'Novo proprietário')+'</h3>'+
    '<p class="modal-text">Os dados de repasse aparecem no extrato que você manda para ele. '+
    'O aplicativo não movimenta dinheiro: ele só mostra para onde transferir.</p>'+
    '<label class="field"><span>Nome *</span><input id="own_nome" value="'+esc(i.nome||'')+'" placeholder="Nome completo"></label>'+
    '<div class="field-row">'+
      '<label class="field"><span>WhatsApp</span><input id="own_tel" value="'+esc(i.telefone||'')+'" placeholder="(00) 0 0000-0000"></label>'+
      '<label class="field"><span>E-mail</span><input id="own_email" type="email" value="'+esc(i.email||'')+'"></label>'+
    '</div>'+
    '<div class="field-row">'+
      '<label class="field"><span>CPF/CNPJ</span><input id="own_doc" value="'+esc(i.documento||'')+'"></label>'+
      '<label class="field"><span>Taxa de administração (%)</span>'+
        '<input id="own_taxa" type="number" min="0" max="100" step="0.5" value="'+(Number(i.taxaAdministracao)||0)+'">'+
        '<small>Quanto fica com você a cada aluguel recebido.</small></label>'+
    '</div>'+
    '<div class="form-section-title">Para onde vai o repasse</div>'+
    '<label class="field"><span>Chave PIX</span><input id="own_pix" value="'+esc(i.pixChave||'')+'" placeholder="CPF, telefone, e-mail ou chave aleatória"></label>'+
    '<div class="field-row">'+
      '<label class="field"><span>Banco</span><input id="own_banco" value="'+esc(i.banco||'')+'"></label>'+
      '<label class="field"><span>Agência</span><input id="own_ag" value="'+esc(i.agencia||'')+'"></label>'+
      '<label class="field"><span>Conta</span><input id="own_conta" value="'+esc(i.conta||'')+'"></label>'+
    '</div>'+
    '<label class="field"><span>Observações</span><textarea id="own_obs" rows="3" placeholder="Combinações, preferências, o que for útil lembrar">'+esc(i.observacoes||'')+'</textarea></label>'+
    '<div class="modal-actions">'+
      (o&&canEdit?'<button class="btn btn-danger" onclick="confirmDeleteOwner(\''+o.id+'\')">Excluir</button>':'<span></span>')+
      '<div class="modal-actions-right"><button class="btn btn-ghost" onclick="closeModal()">Fechar</button>'+
      (canEdit?'<button class="btn btn-primary" onclick="saveOwner('+(o?'\''+o.id+'\'':'')+')">Salvar</button>':'')+
    '</div></div>');
}

function readOwnerForm(){
  const v=function(id){const e=document.getElementById(id);return e?String(e.value||'').trim():'';};
  return {
    nome:v('own_nome'), telefone:v('own_tel'), email:v('own_email'),
    documento:v('own_doc'),
    taxaAdministracao:Number(v('own_taxa'))||0,
    pixChave:v('own_pix'), banco:v('own_banco'),
    agencia:v('own_ag'), conta:v('own_conta'),
    observacoes:v('own_obs')
  };
}

async function saveOwner(id){
  if(!requirePropertyPermission())return;
  const item=readOwnerForm();
  if(item.nome.length<2){showToast('Informe o nome do proprietário.','error');return;}
  if(!emailValido(item.email)){showToast('E-mail inválido. Confira ou deixe em branco.','error');return;}
  if(item.taxaAdministracao<0||item.taxaAdministracao>100){
    showToast('A taxa de administração vai de 0 a 100%.','error');return;
  }
  if(id) item.id=id;
  try{
    const salvo=await db.saveOwnerClient(item);
    state.owners=state.owners||[];
    const pos=state.owners.findIndex(function(x){return x.id===salvo.id;});
    if(pos>=0) state.owners[pos]=salvo; else state.owners.push(salvo);
    closeModal();render();
    showToast(id?'Proprietário atualizado.':'Proprietário cadastrado.','success');
  }catch(e){
    console.error(e);
    showToast((e&&e.message)||'Não foi possível salvar.','error');
  }
}

function confirmDeleteOwner(id){
  if(!requirePropertyPermission())return;
  const o=ownerClientById(id);if(!o)return;
  const casas=housesOfOwnerClient(id);
  openModal('<h3 class="modal-title">Excluir '+esc(o.nome)+'?</h3>'+
    '<p class="modal-text">O cadastro sai da lista. '+
    (casas.length
      ? '<strong>'+casas.length+' imóvel(is)</strong> ficam sem proprietário definido — eles não são apagados, só deixam de ter dono declarado e saem dos extratos.'
      : 'Nenhum imóvel está vinculado a ele.')+'</p>'+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="openOwnerModal(\''+id+'\')">Cancelar</button>'+
      '<button class="btn btn-danger" onclick="deleteOwner(\''+id+'\')">Excluir</button>'+
    '</div></div>');
}

async function deleteOwner(id){
  if(!requirePropertyPermission())return;
  try{
    await db.deleteOwnerClient(id);
    state.owners=(state.owners||[]).filter(function(x){return x.id!==id;});
    /* O banco já desfez o vínculo (on delete set null); a memória
       acompanha para a tela não mostrar um dono que não existe mais. */
    (state.houses||[]).forEach(function(h){
      if(String(h.proprietarioClienteId||'')===String(id)) h.proprietarioClienteId='';
    });
    closeModal();render();showToast('Proprietário excluído.','success');
  }catch(e){
    console.error(e);
    showToast((e&&e.message)||'Não foi possível excluir.','error');
  }
}

/* ------------------------------------------------------------
   EXTRATO — a prestação de contas

   Reaproveita `computeMonthlyFinance`, que já sabe cruzar cobranças,
   recebimentos e despesas de cada mês. Aqui só recortamos por dono e
   somamos o período.

   O que o extrato diz é o que o app sabe: valores informados por quem
   opera. Não é conciliação bancária e o texto na tela diz isso.
   ------------------------------------------------------------ */
function computeOwnerStatement(ownerId,mesInicio,mesFim){
  const casas=housesOfOwnerClient(ownerId);
  const owner=ownerClientById(ownerId)||{};
  const idsDoDono={};
  casas.forEach(function(h){idsDoDono[h.id]=true;});

  const meses=[];
  let cursor=mesInicio;
  /* Teto de 24 meses: um período aberto por engano não pode varrer a
     carteira inteira de anos. */
  for(let i=0;i<24&&cursor<=mesFim;i++){
    meses.push(cursor);
    cursor=addMonths(cursor,1);
  }

  const porCasa={};
  casas.forEach(function(h){
    porCasa[h.id]={house:h,previsto:0,recebido:0,pendente:0,despesas:0};
  });
  meses.forEach(function(mes){
    const info=computeMonthlyFinance(mes);
    info.rows.forEach(function(r){
      if(!idsDoDono[r.house.id])return;
      const alvo=porCasa[r.house.id];
      alvo.previsto+=r.expected;
      alvo.recebido+=r.receivedCompetence;
      alvo.pendente+=r.pending;
      alvo.despesas+=r.expenses;
    });
  });

  const linhas=Object.keys(porCasa).map(function(k){return porCasa[k];});
  const previsto=linhas.reduce(function(s,l){return s+l.previsto;},0);
  const recebido=linhas.reduce(function(s,l){return s+l.recebido;},0);
  const pendente=linhas.reduce(function(s,l){return s+l.pendente;},0);
  const despesas=linhas.reduce(function(s,l){return s+l.despesas;},0);
  /* A taxa incide sobre o que ENTROU, não sobre o previsto: cobrar
     administração de aluguel que não foi pago seria cobrar por serviço
     que não gerou receita para ninguém. */
  const taxa=recebido*(Number(owner.taxaAdministracao)||0)/100;
  return {
    owner:owner, meses:meses, linhas:linhas,
    previsto:previsto, recebido:recebido, pendente:pendente,
    despesas:despesas, taxa:taxa,
    repasse:Math.max(0,recebido-taxa-despesas)
  };
}

function ownerStatementPeriodLabel(ext){
  if(!ext.meses.length) return '—';
  const primeiro=monthLabel(ext.meses[0]);
  const ultimo=monthLabel(ext.meses[ext.meses.length-1]);
  return primeiro===ultimo?primeiro:(primeiro+' a '+ultimo);
}

function openOwnerStatementModal(id,mesInicio,mesFim){
  const o=ownerClientById(id);if(!o)return;
  const fim=mesFim||currentMonthStr();
  const inicio=mesInicio||fim;
  const ext=computeOwnerStatement(id,inicio,fim);
  openModal('<h3 class="modal-title">Extrato de '+esc(o.nome)+'</h3>'+
    '<p class="modal-text">Valores registrados no aplicativo no período. '+
    'A taxa de administração incide sobre o que foi recebido, não sobre o previsto.</p>'+
    '<div class="field-row">'+
      '<label class="field"><span>De</span><input id="ext_ini" type="month" value="'+esc(inicio)+'" '+
        'onchange="openOwnerStatementModal(\''+id+'\',this.value,document.getElementById(\'ext_fim\').value)"></label>'+
      '<label class="field"><span>Até</span><input id="ext_fim" type="month" value="'+esc(fim)+'" '+
        'onchange="openOwnerStatementModal(\''+id+'\',document.getElementById(\'ext_ini\').value,this.value)"></label>'+
    '</div>'+
    '<div class="plan-usage-grid">'+
      '<div><span>Previsto</span><strong>'+fmtMoney(ext.previsto)+'</strong></div>'+
      '<div><span>Recebido</span><strong>'+fmtMoney(ext.recebido)+'</strong></div>'+
      '<div><span>Em aberto</span><strong>'+fmtMoney(ext.pendente)+'</strong></div>'+
      '<div><span>Despesas</span><strong>'+fmtMoney(ext.despesas)+'</strong></div>'+
    '</div>'+
    (ext.linhas.length
      ? '<div class="ledger">'+ext.linhas.map(function(l){
          return '<div class="ledger-row"><div class="ledger-row-main">'+esc(l.house.nome)+
            '<div class="ledger-row-sub">recebido '+fmtMoney(l.recebido)+
            (l.pendente>0?' · em aberto '+fmtMoney(l.pendente):'')+
            (l.despesas>0?' · despesas '+fmtMoney(l.despesas):'')+'</div></div>'+
            '<strong class="ledger-row-value num">'+fmtMoney(l.recebido-l.despesas)+'</strong></div>';
        }).join('')+'</div>'
      : '<div class="empty-state compact"><span>Nenhum imóvel vinculado a este proprietário.</span></div>')+
    '<div class="vitrine-custo"><span>Recebido</span><b>'+fmtMoney(ext.recebido)+'</b></div>'+
    (ext.taxa>0?'<div class="vitrine-custo"><span>Taxa de administração ('+
      (Number(o.taxaAdministracao)||0)+'%)</span><b>− '+fmtMoney(ext.taxa)+'</b></div>':'')+
    (ext.despesas>0?'<div class="vitrine-custo"><span>Despesas</span><b>− '+fmtMoney(ext.despesas)+'</b></div>':'')+
    '<div class="vitrine-custo-total"><span>Repasse do período</span><b>'+fmtMoney(ext.repasse)+'</b></div>'+
    (o.pixChave?'<p class="modal-hint">PIX do proprietário: <strong>'+esc(o.pixChave)+'</strong></p>':'')+
    '<div class="modal-actions">'+
      '<button class="btn btn-ghost" onclick="closeModal()">Fechar</button>'+
      '<div class="modal-actions-right">'+
        (o.telefone?'<button class="btn btn-ghost" onclick="copiarExtratoProprietario(\''+id+'\',\''+esc(inicio)+'\',\''+esc(fim)+'\')">Copiar resumo</button>':'')+
        '<button class="btn btn-primary" onclick="generateOwnerStatementPDF(\''+id+'\',\''+esc(inicio)+'\',\''+esc(fim)+'\')">Baixar PDF</button>'+
      '</div>'+
    '</div>');
}

/* Texto curto para mandar no WhatsApp. Numa corretora do interior, é isto
   que o proprietário lê — o PDF vai anexado quando ele pede. */
function copiarExtratoProprietario(id,inicio,fim){
  const ext=computeOwnerStatement(id,inicio,fim);
  const linhas=['*Extrato — '+ext.owner.nome+'*','Período: '+ownerStatementPeriodLabel(ext),''];
  ext.linhas.forEach(function(l){
    linhas.push('• '+l.house.nome+': recebido '+fmtMoney(l.recebido)+
      (l.pendente>0?' (em aberto '+fmtMoney(l.pendente)+')':''));
  });
  linhas.push('');
  linhas.push('Recebido: '+fmtMoney(ext.recebido));
  if(ext.taxa>0) linhas.push('Taxa de administração: -'+fmtMoney(ext.taxa));
  if(ext.despesas>0) linhas.push('Despesas: -'+fmtMoney(ext.despesas));
  linhas.push('*Repasse: '+fmtMoney(ext.repasse)+'*');
  copyTextValue(linhas.join('\n'),'Resumo copiado. É só colar no WhatsApp.');
}

function openOwnerWhatsapp(id){
  const o=ownerClientById(id);
  if(!o||!o.telefone)return;
  let tel=o.telefone.replace(/\D/g,'');
  if(tel.length<=11)tel='55'+tel;
  const casa=(state.config&&state.config.locadorNome)||'';
  const msg='Olá '+o.nome+'! Aqui é '+(casa?'da '+casa:'da administração')+
    ' sobre os seus imóveis.';
  window.open('https://wa.me/'+tel+'?text='+encodeURIComponent(msg),'_blank');
}
