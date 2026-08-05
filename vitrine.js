/* ============================================================
   vitrine.js — Catálogo público de imóveis de terceiros

   Duas caras no mesmo arquivo:
   1) ÁREA INTERNA  — quem tem o módulo administra anúncios,
      anunciantes, leads e taxas
   2) PÁGINA PÚBLICA — sem login, aberta por ?vitrine=slug

   Estes imóveis NUNCA entram no Financeiro dos aluguéis, não
   contam no limite de casas do plano e não aparecem em nenhum
   relatório. São tabelas próprias, de propósito.
   ============================================================ */

const VITRINE_TIPOS=[
  ['casa','Casa'],['apartamento','Apartamento'],['kitnet','Kitnet'],
  ['sobrado','Sobrado'],['comercial','Comercial'],['terreno','Terreno']
];
/* Terreno não tem quarto nem banheiro: o formulário troca de campos. */
function vitrineEhTerreno(tipo){ return String(tipo||'')==='terreno'; }
const VITRINE_FINALIDADES=[
  ['alugar','Para alugar'],['vender','Para vender'],['ambos','Alugar e vender']
];
const VITRINE_TOPOGRAFIAS=[
  ['','Não informada'],['plano','Plano'],['aclive','Aclive'],
  ['declive','Declive'],['irregular','Irregular']
];
function vitrineFinalidadeLabel(f){
  const x=VITRINE_FINALIDADES.find(function(i){return i[0]===f;});
  return x?x[1]:'Para alugar';
}
function vitrineServeAlugar(i){ return i.finalidade==='alugar'||i.finalidade==='ambos'||!i.finalidade; }
function vitrineServeVender(i){ return i.finalidade==='vender'||i.finalidade==='ambos'; }
/* "vencido" continua na lista por causa dos anúncios que ficaram com esse
   status antes de a expiração ser desligada. Ele não é mais atribuído a
   ninguém: hoje o anúncio só sai do ar por decisão de alguém. */
const VITRINE_STATUS=[
  ['rascunho','Rascunho'],['ativo','No ar'],['vencido','Vencido'],
  ['pausado','Pausado'],['alugado','Alugado'],['vendido','Vendido']
];
/* Quantos cartões a grade pública mostra por vez. */
const VITRINE_PAGINA=12;
const VITRINE_LEAD_STATUS=[
  ['novo','Novo'],['contatado','Contatado'],['visita','Visita marcada'],
  ['fechado','Fechado'],['perdido','Perdido']
];

function vitrineTipoLabel(t){const f=VITRINE_TIPOS.find(function(x){return x[0]===t;});return f?f[1]:'Casa';}
function vitrineStatusLabel(s){const f=VITRINE_STATUS.find(function(x){return x[0]===s;});return f?f[1]:'Rascunho';}
function vitrineLeadStatusLabel(s){const f=VITRINE_LEAD_STATUS.find(function(x){return x[0]===s;});return f?f[1]:'Novo';}
function vitrineStatusTone(s){
  if(s==='ativo')return 'brass';
  if(s==='vencido')return 'rust';
  if(s==='alugado'||s==='vendido')return 'manut';
  if(s==='pausado')return 'warn';
  return 'slate';
}

/* Faixa da taxa conforme o valor do aluguel (tabela em config.js). */
function vitrineTaxaSugerida(aluguel){
  const faixas=CONFIG.VITRINE_TAXAS||[];
  const valor=Number(aluguel)||0;
  return faixas.find(function(f){return valor<=f.ateAluguel;})||faixas[faixas.length-1]||{valor:0,destaque:0,nome:'—'};
}
function vitrineCustoTotal(i){
  return (Number(i.aluguel)||0)+(Number(i.condominio)||0)+(Number(i.iptu)||0);
}
/* ------------------------------------------------------------
   UM CADASTRO DE DONO, NÃO DOIS

   O "anunciante" nasceu com a Vitrine, antes de existir o cadastro de
   proprietários-clientes da gestão. Por um tempo os dois conviveram e a
   mesma pessoa aparecia em duas listas — o dono da casa digitado duas
   vezes, exatamente o que a ponte veio resolver.

   A partir daqui quem manda é `proprietarios_clientes`. A tabela
   `vitrine_anunciantes` continua existindo e continua sendo o alvo da
   chave estrangeira do anúncio — mexer nisso exigiria migrar a FK de uma
   tabela que a página pública consulta —, mas ela virou espelho: cada
   proprietário tem no máximo uma linha lá, criada sozinha quando precisa.
   Ninguém edita anunciante; edita-se o proprietário.
   ------------------------------------------------------------ */
function vitrineAnunciantePorId(id){
  return (state.vitrine.anunciantes||[]).find(function(x){return x.id===id;})||null;
}
/* Qual proprietário está por trás de um anúncio. */
function vitrineDonoDoAnuncio(anuncio){
  if(!anuncio) return '';
  const a=vitrineAnunciantePorId(anuncio.anuncianteId);
  return (a&&a.proprietarioClienteId)||'';
}
function vitrineAnuncianteNome(id){
  const a=vitrineAnunciantePorId(id);
  if(!a) return '—';
  /* O nome vem do proprietário quando há vínculo: é lá que ele é
     atualizado. O espelho pode estar com um nome antigo. */
  if(a.proprietarioClienteId&&typeof ownerClientName==='function'){
    const nome=ownerClientName(a.proprietarioClienteId);
    if(nome) return nome;
  }
  return a.nome||'—';
}
function vitrineImovelPorId(id){
  return (state.vitrine.imoveis||[]).find(function(x){return x.id===id;});
}
/* Código sequencial legível: A-101, A-102... Vai junto na mensagem
   do WhatsApp, para você saber de qual casa a pessoa está falando. */
function vitrineProximoCodigo(){
  const nums=(state.vitrine.imoveis||[]).map(function(i){
    const m=/^A-(\d+)$/.exec(i.codigo||'');return m?parseInt(m[1],10):0;
  });
  return 'A-'+(Math.max(100,...nums,100)+1);
}

/* ------------------------------------------------------------
   CARGA
   ------------------------------------------------------------ */
/* Trava de carga em andamento. A ficha do imóvel pede os dados da Vitrine
   a cada render enquanto eles não chegam; sem esta trava, um punhado de
   renders seguidos dispara um punhado de cargas paralelas do mesmo dado. */
let _vitrineCarregando=false;
async function loadVitrineData(force){
  if(state.vitrine.carregado&&!force) return;
  if(_vitrineCarregando) return;
  _vitrineCarregando=true;
  try{
    /* Não há mais o que expirar: o anúncio fica no ar até ser tirado.
       A rotina continua existindo no banco por compatibilidade, mas
       chamá-la a cada carregamento era uma ida ao servidor à toa. */
    const data=await db.loadVitrine();
    state.vitrine=Object.assign({},data,{carregado:true});
    render();
  }catch(e){
    console.error('Erro ao carregar a Vitrine',e);
    showToast((e&&e.message)||'Não foi possível carregar a Vitrine.','error');
  }finally{
    _vitrineCarregando=false;
  }
}
function setVitrineTab(tab){ state.vitrineTab=tab; render(); }

/* ------------------------------------------------------------
   ÁREA INTERNA
   ------------------------------------------------------------ */
function renderVitrineView(){
  if(!state.vitrine.carregado){
    return '<div class="app-loading">'+logoSvg()+'<span>Carregando a Vitrine…</span></div>';
  }
  const tab=state.vitrineTab||'painel';
  const abas=[['painel','Painel','&#9636;'],['anuncios','Anúncios','&#9638;'],
    ['cidades','Cidades','&#9873;'],
    ['anunciantes','Proprietários','&#9786;'],['leads','Leads','&#9825;'],
    ['taxas','Taxas','R$'],['divulgacao','Divulgação','&#9670;']];
  /* Mesma estrutura das outras abas: navegação primeiro, depois o herói.
     O cabeçalho precisa ser FILHO DIRETO de .rental-app — o estilo dele
     usa o seletor `.rental-app > .page-header`. Envolver em um <section>
     tira o arredondamento, o respiro e o fundo. */
  return '<nav class="rent-tabs vitrine-nav" aria-label="Áreas da Vitrine">'+abas.map(function(a){
      const ativa=tab===a[0];
      return '<button class="rent-tab'+(ativa?' active':'')+'"'+(ativa?' aria-current="page"':'')+
        ' onclick="setVitrineTab(\''+a[0]+'\')">'+
        '<span aria-hidden="true">'+a[2]+'</span><b>'+esc(a[1])+'</b></button>';
    }).join('')+'</nav>'+
    '<div class="page-header vitrine-header"><div>'+
      '<span class="eyebrow">SITE DA CORRETORA</span>'+
      pageTitleWithIcon(vitrineIconSvg(),'Vitrine')+
      '<p class="page-sub">Imóveis e terrenos divulgados por cidade, para alugar e para vender. '+
      'Não entram no Financeiro nem no limite do plano.</p></div>'+
      '<div class="header-actions">'+
        '<button class="btn btn-ghost btn-sm" onclick="copyVitrineLink()">Copiar link</button>'+
        '<button class="btn btn-primary btn-sm" onclick="openVitrineImovelModal()">+ Novo anúncio</button>'+
      '</div></div>'+
    (tab==='anuncios'?renderVitrineAnuncios():
     tab==='cidades'?renderVitrineCidades():
     tab==='anunciantes'?renderVitrineAnunciantes():
     tab==='leads'?renderVitrineLeads():
     tab==='taxas'?renderVitrineTaxas():
     tab==='divulgacao'?renderVitrineDivulgacao():
     renderVitrinePainel());
}

function vitrineIconSvg(){
  return '<svg width="40" height="40" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">'+
    '<path d="M7 18 L11 8 H37 L41 18" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>'+
    '<path d="M9 18 V40 H39 V18" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>'+
    '<path d="M7 18 h34" stroke="currentColor" stroke-width="3"/>'+
    '<rect x="17" y="26" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"/></svg>';
}

function renderVitrinePainel(){
  const imoveis=state.vitrine.imoveis||[];
  const ativos=imoveis.filter(function(i){return i.status==='ativo';});
  const leadsNovos=(state.vitrine.leads||[]).filter(function(l){return l.status==='novo';});
  const mes=currentMonthStr();
  /* O anúncio não vence mais (migracao-vitrine-corretora.sql neutralizou a
     expiração): fica no ar até alguém tirar. Então o painel deixa de falar
     de prazo e passa a mostrar o que a corretora de fato acompanha —
     quantos estão pausados e quantos fecharam negócio no mês. */
  const pausados=imoveis.filter(function(i){return i.status==='pausado'||i.status==='rascunho';});
  const fechados=imoveis.filter(function(i){
    return (i.status==='alugado'||i.status==='vendido')&&
      String(i.updatedAt||'').slice(0,7)===mes;
  });
  const recebido=(state.vitrine.taxas||[]).filter(function(t){
    return t.pago&&String(t.dataPagamento||'').slice(0,7)===mes;
  }).reduce(function(s,t){return s+Number(t.valor||0);},0);
  const views=imoveis.reduce(function(s,i){return s+i.visualizacoes;},0);
  const contatos=imoveis.reduce(function(s,i){return s+i.contatosWhatsapp+i.contatosFormulario;},0);

  return '<div class="vitrine-stats">'+
      vitrineStat(ativos.length,'Anúncios no ar','gold')+
      vitrineStat(pausados.length,'Fora do ar','warn')+
      vitrineStat(fechados.length,'Fechados no mês','gold')+
      vitrineStat(views,'Visualizações','')+
      vitrineStat(contatos,'Contatos','')+
      vitrineStat(fmtMoney(recebido),'Taxas recebidas no mês','gold')+
    '</div>'+
    (leadsNovos.length?'<div class="vitrine-alert lead"><div><strong>'+leadsNovos.length+' contato(s) sem atendimento</strong>'+
      '<span>Lead parado é dinheiro perdido.</span></div>'+
      '<button class="btn btn-primary btn-sm" onclick="setVitrineTab(\'leads\')">Atender</button></div>':'')+
    renderVitrineAnuncios(true);
}
function vitrineStat(value,label,tone){
  return '<div class="vitrine-stat '+(tone||'')+'"><strong>'+(typeof value==='number'?Number(value||0):esc(String(value)))+
    '</strong><span>'+esc(label)+'</span></div>';
}

function renderVitrineAnuncios(resumo){
  const imoveis=(state.vitrine.imoveis||[]);
  if(!imoveis.length){
    return '<div class="vitrine-panel">'+emptyState('Nenhum anúncio cadastrado ainda. Comece cadastrando o anunciante e depois o imóvel.',vitrineIconSvg())+
      '<div class="vitrine-empty-actions"><button class="btn btn-ghost" onclick="openVitrineAnuncianteModal()">+ Anunciante</button>'+
      '<button class="btn btn-primary" onclick="openVitrineImovelModal()">+ Anúncio</button></div></div>';
  }
  const lista=resumo?imoveis.slice(0,6):imoveis;
  return '<div class="vitrine-panel"><div class="vitrine-panel-head"><div><h2>Anúncios</h2>'+
    '<p>O anúncio fica no ar até você tirar. Ao alugar ou vender, marque em “Tirar do ar”.</p></div>'+
    (resumo?'<button class="btn btn-ghost btn-sm" onclick="setVitrineTab(\'anuncios\')">Ver todos</button>':'')+'</div>'+
    '<div class="vitrine-table-wrap"><table class="vitrine-table"><thead><tr>'+
      '<th>Código / Imóvel</th><th>Anunciante</th><th>Preço</th><th>Taxa</th>'+
      '<th>Situação</th><th>Desempenho</th><th></th></tr></thead><tbody>'+
    lista.map(renderVitrineImovelRow).join('')+'</tbody></table></div></div>';
}

function renderVitrineImovelRow(i){
  const taxa=vitrineTaxaSugerida(i.aluguel);
  /* Preço mostrado é o da finalidade do anúncio: num terreno só de venda,
     "aluguel" é sempre zero e a coluna não dizia nada. */
  const soVende=vitrineServeVender(i)&&!vitrineServeAlugar(i);
  const preco=soVende
    ? '<strong>'+fmtMoney(i.precoVenda)+'</strong><span class="cell-sub">à vista</span>'
    : '<strong>'+fmtMoney(i.aluguel)+'</strong><span class="cell-sub">'+fmtMoney(vitrineCustoTotal(i))+' com taxas</span>';
  return '<tr><td><span class="vitrine-code">#'+esc(i.codigo)+'</span>'+
      '<span class="cell-sub">'+esc(i.titulo)+(i.destaque?' ★':'')+'</span></td>'+
    '<td>'+esc(vitrineAnuncianteNome(i.anuncianteId))+'</td>'+
    '<td>'+preco+'</td>'+
    '<td><strong>'+fmtMoney(taxa.valor)+'</strong><span class="cell-sub">'+esc(taxa.nome)+'</span></td>'+
    '<td><span class="chip chip-'+vitrineStatusTone(i.status)+'">'+esc(vitrineStatusLabel(i.status))+'</span></td>'+
    '<td><strong>'+i.visualizacoes+'</strong> visitas<span class="cell-sub">'+
      (i.contatosWhatsapp+i.contatosFormulario)+' contatos</span></td>'+
    '<td><div class="vitrine-row-actions">'+
      (i.status==='ativo'
        ? '<button class="btn btn-ghost btn-sm" onclick="openVitrineRelatorio(\''+i.id+'\')">Relatório</button>'
        : '<button class="btn btn-primary btn-sm" onclick="openVitrinePublicarModal(\''+i.id+'\')">Publicar</button>')+
      '<button class="btn btn-ghost btn-sm" onclick="openVitrineImovelModal(\''+i.id+'\')">Editar</button>'+
    '</div></td></tr>';
}

/* Relatório do proprietário — é o que sustenta a cobrança da renovação. */
function openVitrineRelatorio(id){
  const i=vitrineImovelPorId(id);if(!i)return;
  const contatos=i.contatosWhatsapp+i.contatosFormulario;
  const desde=i.publicadoEm?fmtDateBR(String(i.publicadoEm).slice(0,10)):'';
  const texto='Relatório do imóvel '+i.codigo+' — '+i.titulo+'\n'+
    'Visualizações: '+i.visualizacoes+'\n'+
    'Contatos recebidos: '+contatos+
    ' (WhatsApp: '+i.contatosWhatsapp+' · formulário: '+i.contatosFormulario+')\n'+
    (desde?'No ar desde '+desde+'.':'');
  openModal('<h3 class="modal-title">Desempenho de '+esc(i.codigo)+'</h3>'+
    '<p class="modal-text">Estes números são o seu argumento na hora de renovar a taxa.</p>'+
    '<div class="plan-usage-grid">'+
      '<div><span>Visualizações</span><strong>'+i.visualizacoes+'</strong></div>'+
      '<div><span>Contatos</span><strong>'+contatos+'</strong></div>'+
      '<div><span>Pelo WhatsApp</span><strong>'+i.contatosWhatsapp+'</strong></div>'+
      '<div><span>Pelo formulário</span><strong>'+i.contatosFormulario+'</strong></div>'+
    '</div>'+
    '<label class="field"><span>Texto pronto para mandar ao proprietário</span>'+
    '<textarea id="vit_report" rows="5" readonly>'+esc(texto)+'</textarea></label>'+
    '<div class="modal-actions"><button class="btn btn-danger" onclick="openVitrinePausarModal(\''+i.id+'\')">Tirar do ar</button>'+
    '<div class="modal-actions-right"><button class="btn btn-ghost" onclick="closeModal()">Fechar</button>'+
    '<button class="btn btn-primary" onclick="copyTextValue(document.getElementById(\'vit_report\').value,\'Relatório copiado.\')">Copiar</button></div></div>');
}

function openVitrinePausarModal(id){
  const i=vitrineImovelPorId(id);if(!i)return;
  openModal('<h3 class="modal-title">Tirar '+esc(i.codigo)+' do ar</h3>'+
    '<p class="modal-text">O anúncio sai da vitrine pública. Os dados e as estatísticas ficam guardados.</p>'+
    '<label class="field"><span>Motivo</span><select id="vit_pause_status">'+
      '<option value="alugado">Foi alugado</option>'+
      '<option value="vendido">Foi vendido</option>'+
      '<option value="pausado">O dono pediu para pausar</option></select></label>'+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary" onclick="salvarVitrineStatus(\''+id+'\',document.getElementById(\'vit_pause_status\').value)">Confirmar</button></div>');
}
function openVitrinePublicarModal(id){
  const i=vitrineImovelPorId(id);if(!i)return;
  const taxa=vitrineTaxaSugerida(i.aluguel);
  const dias=Number(CONFIG.VITRINE_DIAS_PADRAO)||60;
  const fim=addDaysISO(todayISO(),dias);
  openModal('<h3 class="modal-title">Publicar '+esc(i.codigo)+'</h3>'+
    '<p class="modal-text">Faixa <strong>'+esc(taxa.nome)+'</strong> — sugestão de <strong>'+fmtMoney(taxa.valor)+
    '</strong> por '+dias+' dias. O anúncio fica no ar até você tirar; a data abaixo é só '+
    'o período cobrado.</p>'+
    '<div class="field-row"><label class="field"><span>Valor da taxa (R$)</span>'+
      '<input id="vit_pub_valor" type="number" min="0" step="0.01" value="'+taxa.valor+'"></label>'+
      '<label class="field"><span>Período cobrado até</span><input id="vit_pub_fim" type="date" value="'+fim+'"></label></div>'+
    '<label class="field"><span>Forma de pagamento</span><input id="vit_pub_forma" placeholder="Ex.: PIX"></label>'+
    '<label class="field-check"><input type="checkbox" id="vit_pub_pago" checked><span>A taxa já foi paga</span></label>'+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary" onclick="publicarVitrineImovel(\''+id+'\')">Publicar agora</button></div>');
}
async function publicarVitrineImovel(id){
  const i=vitrineImovelPorId(id);if(!i)return;
  const fim=(document.getElementById('vit_pub_fim')||{}).value||'';
  const valor=Number((document.getElementById('vit_pub_valor')||{}).value)||0;
  const forma=((document.getElementById('vit_pub_forma')||{}).value||'').trim();
  const pago=!!(document.getElementById('vit_pub_pago')||{}).checked;
  if(!fim){showToast('Informe até quando o anúncio fica no ar.','error');return;}
  try{
    const salvo=await db.setVitrineStatus(id,'ativo',fim);
    Object.assign(i,salvo);
    const taxa=await db.saveVitrineTaxa({imovelId:id,anuncianteId:i.anuncianteId,valor:valor,
      formaPagamento:forma,periodoInicio:todayISO(),periodoFim:fim,pago:pago,
      dataPagamento:pago?todayISO():null});
    state.vitrine.taxas.unshift(taxa);
    closeModal();render();showToast('Anúncio no ar. Taxa cobrada até '+fmtDateBR(fim)+'.','success');
  }catch(e){console.error(e);showToast((e&&e.message)||'Não foi possível publicar.','error');}
}
async function salvarVitrineStatus(id,status){
  try{
    const salvo=await db.setVitrineStatus(id,status);
    Object.assign(vitrineImovelPorId(id)||{},salvo);
    closeModal();render();showToast('Anúncio atualizado.','success');
  }catch(e){console.error(e);showToast('Não foi possível atualizar.','error');}
}

/* ------------------------------------------------------------
   CADASTRO DO ANÚNCIO
   ------------------------------------------------------------ */

/* Pontos de interesse vão e voltam como texto simples — uma linha por
   ponto, "nome | distância". O banco guarda jsonb; a tela guarda o
   formato que a pessoa consegue digitar rápido entre um atendimento e
   outro. O ícone é escolhido pelo nome, sem campo a mais para preencher. */
const VITRINE_POI_ICONES=[
  [/escola|col[eé]gio|creche|ensino/i,'🏫'],
  [/faculdade|universidade|campus/i,'🎓'],
  [/hospital|posto de sa[uú]de|upa|cl[ií]nica|farm[aá]cia/i,'🏥'],
  [/feira|mercado|supermercado|mercadinho/i,'🛒'],
  [/pra[cç]a|parque|academia|quadra|campo/i,'🌳'],
  [/igreja|matriz|capela/i,'⛪'],
  [/banco|lot[eé]rica|caixa/i,'🏦'],
  [/[oô]nibus|rodovi[aá]ria|terminal|ponto/i,'🚌'],
  [/padaria|restaurante|lanchonete|pizzaria/i,'🍞'],
  [/centro|avenida|br-|rodovia/i,'🛣']
];
function vitrinePoiIcone(nome){
  const achado=VITRINE_POI_ICONES.find(function(p){return p[0].test(String(nome||''));});
  return achado?achado[1]:'📍';
}
function vitrinePoiParaTexto(lista){
  return (Array.isArray(lista)?lista:[]).map(function(p){
    const nome=String((p&&p.nome)||'').trim();
    const dist=String((p&&p.distancia)||'').trim();
    return dist?(nome+' | '+dist):nome;
  }).filter(Boolean).join('\n');
}
function vitrinePoiDeTexto(texto){
  return String(texto||'').split('\n').map(function(linha){
    const partes=linha.split('|');
    const nome=String(partes[0]||'').trim();
    if(!nome)return null;
    return {icone:vitrinePoiIcone(nome),nome:nome.slice(0,80),
      distancia:String(partes[1]||'').trim().slice(0,40)};
  }).filter(Boolean).slice(0,12);
}

function vitrineImovelFormHtml(item){
  const i=item||{};
  const donos=(state.owners||[]).slice().sort(function(a,b){
    return a.nome.localeCompare(b.nome,'pt-BR');
  });
  /* Anúncio novo vindo da gestão já traz o proprietário; anúncio existente
     chega pelo espelho. */
  const donoAtual=String(i.proprietarioClienteId||vitrineDonoDoAnuncio(i)||'');
  return '<div class="field-row"><label class="field"><span>Código</span>'+
      '<input id="vit_codigo" value="'+esc(i.codigo||vitrineProximoCodigo())+'" placeholder="A-101"></label>'+
      '<label class="field"><span>Tipo</span><select id="vit_tipo" onchange="atualizarCamposVitrine()">'+VITRINE_TIPOS.map(function(t){
        return '<option value="'+t[0]+'"'+((i.tipo||'casa')===t[0]?' selected':'')+'>'+t[1]+'</option>';}).join('')+
      '</select></label></div>'+
    '<label class="field"><span>Título do anúncio *</span><input id="vit_titulo" value="'+esc(i.titulo||'')+
      '" placeholder="Casa 2 quartos no Jardim América"></label>'+
    /* O select guarda o id do PROPRIETÁRIO. O anunciante correspondente é
       resolvido na hora de salvar — quem opera não precisa saber que
       existe um espelho. */
    '<label class="field"><span>Proprietário (dono do imóvel)</span><select id="vit_anunciante">'+
      '<option value="">— selecione —</option>'+donos.map(function(o){
        return '<option value="'+esc(o.id)+'"'+(donoAtual===o.id?' selected':'')+'>'+esc(o.nome)+'</option>';}).join('')+
      '</select><small>Cadastre em <strong>Proprietários</strong> se ainda não existir.</small></label>'+

    '<div class="form-section-title">Valores</div>'+
    '<div class="field-row"><label class="field"><span>Aluguel (R$) *</span>'+
      '<input id="vit_aluguel" type="number" min="0" step="0.01" value="'+(Number(i.aluguel)||0)+'"></label>'+
      '<label class="field"><span>Condomínio (R$)</span><input id="vit_cond" type="number" min="0" step="0.01" value="'+(Number(i.condominio)||0)+'"></label>'+
      '<label class="field"><span>IPTU mensal (R$)</span><input id="vit_iptu" type="number" min="0" step="0.01" value="'+(Number(i.iptu)||0)+'"></label></div>'+
    /* Finalidade decide em qual aba do site o imóvel aparece. */
    '<div class="field-row"><label class="field"><span>Finalidade *</span>'+
      '<select id="vit_finalidade" onchange="atualizarCamposVitrine()">'+VITRINE_FINALIDADES.map(function(f){
        return '<option value="'+f[0]+'"'+((i.finalidade||'alugar')===f[0]?' selected':'')+'>'+f[1]+'</option>';
      }).join('')+'</select></label>'+
      '<label class="field"><span>Preço de venda (R$)</span>'+
      '<input id="vit_preco_venda" type="number" min="0" step="0.01" value="'+(Number(i.precoVenda)||0)+'"></label></div>'+

    '<div class="form-section-title">O imóvel</div>'+
    '<div id="vit_bloco_construido" class="field-row"'+(vitrineEhTerreno(i.tipo)?' hidden':'')+'>'+
      '<label class="field"><span>Quartos</span><input id="vit_quartos" type="number" min="0" step="1" value="'+(Number(i.quartos)||0)+'"></label>'+
      '<label class="field"><span>Banheiros</span><input id="vit_banheiros" type="number" min="0" step="1" value="'+(Number(i.banheiros)||0)+'"></label>'+
      '<label class="field"><span>Vagas</span><input id="vit_vagas" type="number" min="0" step="1" value="'+(Number(i.vagas)||0)+'"></label>'+
      '<label class="field"><span>Área (m²)</span><input id="vit_area" type="number" min="0" step="0.01" value="'+(Number(i.areaM2)||0)+'"></label></div>'+
    /* Terreno: dimensões e características do lote no lugar dos cômodos. */
    '<div id="vit_bloco_terreno"'+(vitrineEhTerreno(i.tipo)?'':' hidden')+'>'+
      '<div class="field-row">'+
        '<label class="field"><span>Área total (m²)</span><input id="vit_area_terreno" type="number" min="0" step="0.01" value="'+(Number(i.areaM2)||0)+'"></label>'+
        '<label class="field"><span>Frente (m)</span><input id="vit_frente" type="number" min="0" step="0.01" value="'+(i.frenteM==null?'':i.frenteM)+'"></label>'+
        '<label class="field"><span>Fundo (m)</span><input id="vit_fundo" type="number" min="0" step="0.01" value="'+(i.fundoM==null?'':i.fundoM)+'"></label>'+
      '</div>'+
      '<div class="field-row"><label class="field"><span>Topografia</span><select id="vit_topografia">'+
        VITRINE_TOPOGRAFIAS.map(function(t){
          return '<option value="'+t[0]+'"'+((i.topografia||'')===t[0]?' selected':'')+'>'+t[1]+'</option>';
        }).join('')+'</select></label></div>'+
      '<div class="feature-check-grid">'+
        '<label><input id="vit_murado" type="checkbox"'+(i.murado?' checked':'')+'><span>Murado</span></label>'+
        '<label><input id="vit_esquina" type="checkbox"'+(i.esquina?' checked':'')+'><span>Esquina</span></label>'+
      '</div>'+
    '</div>'+
    '<div class="feature-check-grid house-room-checks">'+
      '<label><input id="vit_mobiliado" type="checkbox"'+(i.mobiliado?' checked':'')+'><span>Mobiliado</span></label>'+
      '<label><input id="vit_pet" type="checkbox"'+(i.aceitaPet?' checked':'')+'><span>Aceita pet</span></label>'+
      '<label><input id="vit_quintal" type="checkbox"'+(i.quintal?' checked':'')+'><span>Quintal</span></label>'+
      '<label><input id="vit_servico" type="checkbox"'+(i.areaServico?' checked':'')+'><span>Área de serviço</span></label></div>'+

    '<div class="form-section-title">Endereço</div>'+
    '<div class="field-row"><label class="field"><span>Rua</span><input id="vit_rua" value="'+esc(i.logradouro||'')+'"></label>'+
      '<label class="field"><span>Número</span><input id="vit_numero" value="'+esc(i.numero||'')+'"></label></div>'+
    '<div class="field-row"><label class="field"><span>Bairro</span><input id="vit_bairro" value="'+esc(i.bairro||'')+'"></label>'+
      '<label class="field"><span>Cidade</span><select id="vit_cidade_id">'+
        '<option value="">— Escolha a cidade —</option>'+
        (state.vitrine.cidades||[]).map(function(c){
          return '<option value="'+esc(c.id)+'"'+(String(i.cidadeId||'')===String(c.id)?' selected':'')+'>'+
            esc(c.nome)+' / '+esc(c.uf)+'</option>';
        }).join('')+
      '</select></label>'+
      '<label class="field"><span>UF</span><input id="vit_uf" maxlength="2" value="'+esc(i.uf||'')+'"></label></div>'+
    '<div class="field-row"><label class="field"><span>Latitude</span><input id="vit_lat" value="'+(i.latitude==null?'':i.latitude)+'" placeholder="-19.9142"></label>'+
      '<label class="field"><span>Longitude</span><input id="vit_lng" value="'+(i.longitude==null?'':i.longitude)+'" placeholder="-43.9401"></label></div>'+
    '<p class="modal-hint">A coordenada posiciona o pino no mapa. Pegue no Google Maps: clique com o botão direito sobre o imóvel e copie os números.</p>'+
    '<label class="field-check"><input type="checkbox" id="vit_exato"'+(i.enderecoExatoPublico!==false?' checked':'')+
      '><span><strong>Mostrar o endereço completo ao público</strong><small>O proprietário autorizou a exibição do número. Desmarque para esconder só neste anúncio.</small></span></label>'+

    '<div class="form-section-title">Regras e descrição</div>'+
    '<div class="field-row"><label class="field"><span>Garantia</span><input id="vit_caucao" value="'+esc(i.caucao||'')+'" placeholder="2 aluguéis / fiador"></label>'+
      '<label class="field"><span>Contrato mínimo (meses)</span><input id="vit_contrato" type="number" min="0" step="1" value="'+(Number(i.contratoMinimoMeses)||12)+'"></label></div>'+
    '<label class="field-check"><input type="checkbox" id="vit_fiador"'+(i.exigeFiador?' checked':'')+'><span>Exige fiador</span></label>'+
    '<label class="field"><span>Descrição</span><textarea id="vit_desc" rows="5" placeholder="Como é o imóvel, o que tem de bom, detalhes que a foto não mostra…">'+esc(i.descricao||'')+'</textarea></label>'+
    /* "O que tem por perto" já era mostrado na página pública, mas não
       havia onde preencher. Em cidade pequena isto vende mais que metro
       quadrado: quem procura casa quer saber a distância da escola, da
       feira e do posto. Uma linha por ponto, separada por | . */
    '<label class="field"><span>O que tem por perto</span>'+
      '<textarea id="vit_poi" rows="4" placeholder="Colégio Estadual | 200 m&#10;Feira livre | em frente&#10;Hospital | 1,2 km">'+
      esc(vitrinePoiParaTexto(i.pontosInteresse))+'</textarea>'+
      '<small>Uma por linha, no formato <b>nome | distância</b>. Aparece no anúncio como uma lista.</small></label>'+
    '<label class="field-check"><input type="checkbox" id="vit_destaque"'+(i.destaque?' checked':'')+
      '><span><strong>Destaque</strong><small>Aparece primeiro na vitrine. Cobrado à parte.</small></span></label>';
}

/* ------------------------------------------------------------
   CIDADES — os cards por onde o visitante entra no site
   ------------------------------------------------------------ */
function vitrineCidadePorId(id){
  return (state.vitrine.cidades||[]).find(function(c){return String(c.id)===String(id);})||null;
}
function vitrineContaPorCidade(cidadeId,finalidade){
  return (state.vitrine.imoveis||[]).filter(function(i){
    if(String(i.cidadeId||'')!==String(cidadeId)) return false;
    if(i.status!=='ativo') return false;
    return finalidade==='alugar'?vitrineServeAlugar(i):vitrineServeVender(i);
  }).length;
}
function renderVitrineCidades(){
  const cidades=state.vitrine.cidades||[];
  return '<div class="vitrine-panel"><div class="vitrine-panel-head">'+
    '<div><h2>Cidades</h2><span>São os cards que aparecem na entrada do site. '+
    'O visitante escolhe a cidade e só então vê os imóveis.</span></div>'+
    '<button class="btn btn-primary btn-sm" onclick="openVitrineCidadeModal()">+ Nova cidade</button></div>'+
    (cidades.length
      ? '<div class="vitrine-cidade-admin">'+cidades.map(function(c){
          const alugar=vitrineContaPorCidade(c.id,'alugar');
          const vender=vitrineContaPorCidade(c.id,'vender');
          return '<div class="vitrine-cidade-row'+(c.ativa?'':' is-off')+'">'+
            '<div class="vitrine-cidade-nome"><strong>'+esc(c.nome)+'</strong>'+
              '<small>'+esc(c.uf)+' · /'+esc(c.slug)+(c.ativa?'':' · oculta')+'</small></div>'+
            '<div class="vitrine-cidade-conta">'+
              '<span>'+alugar+' para alugar</span><span>'+vender+' à venda</span></div>'+
            '<button class="btn btn-ghost btn-sm" onclick="openVitrineCidadeModal(\''+c.id+'\')">Editar</button>'+
          '</div>';
        }).join('')+'</div>'
      : '<div class="empty-state">Nenhuma cidade cadastrada. Crie a primeira para o site ter por onde começar.</div>')+
  '</div>';
}
function openVitrineCidadeModal(id){
  const c=id?vitrineCidadePorId(id):null;
  const proxima=(state.vitrine.cidades||[]).length+1;
  openModal('<h3 class="modal-title">'+(c?'Editar cidade':'Nova cidade')+'</h3>'+
    '<p class="modal-text">O nome aparece no card da entrada do site. A ordem define a posição.</p>'+
    '<div class="field-row">'+
      '<label class="field"><span>Nome *</span><input id="vit_cid_nome" value="'+esc(c?c.nome:'')+'" placeholder="Ex.: Lajedo"></label>'+
      '<label class="field"><span>UF</span><input id="vit_cid_uf" maxlength="2" value="'+esc(c?c.uf:'PE')+'"></label>'+
      '<label class="field"><span>Ordem</span><input id="vit_cid_ordem" type="number" min="0" step="1" value="'+(c?c.ordem:proxima)+'"></label>'+
    '</div>'+
    '<label class="field-check"><input type="checkbox" id="vit_cid_ativa"'+((!c||c.ativa)?' checked':'')+
      '><span><strong>Mostrar no site</strong><small>Desmarque para esconder sem apagar. Os imóveis dela continuam guardados.</small></span></label>'+
    '<div class="modal-actions">'+
      (c?'<button class="btn btn-danger" onclick="confirmarExcluirVitrineCidade(\''+c.id+'\')">Excluir</button>':'<span></span>')+
      '<div class="modal-actions-right"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-primary" onclick="salvarVitrineCidade('+(c?'\''+c.id+'\'':'null')+')">Salvar</button></div>'+
    '</div>');
}
async function salvarVitrineCidade(id){
  const nome=((document.getElementById('vit_cid_nome')||{}).value||'').trim();
  if(!nome){showToast('Informe o nome da cidade.','error');return;}
  const dados={
    nome:nome,
    uf:((document.getElementById('vit_cid_uf')||{}).value||'PE').trim(),
    ordem:parseInt((document.getElementById('vit_cid_ordem')||{}).value,10)||0,
    ativa:!!(document.getElementById('vit_cid_ativa')||{}).checked
  };
  try{
    const salvo=await db.saveVitrineCidade(Object.assign({},dados,id?{id:id}:{}));
    if(!Array.isArray(state.vitrine.cidades)) state.vitrine.cidades=[];
    if(id){
      const atual=vitrineCidadePorId(id);
      if(atual) Object.assign(atual,salvo);
    }else{
      state.vitrine.cidades.push(salvo);
    }
    state.vitrine.cidades.sort(function(a,b){
      return (a.ordem-b.ordem)||String(a.nome).localeCompare(String(b.nome),'pt-BR');
    });
    closeModal();render();showToast('Cidade salva.','success');
  }catch(e){
    console.error(e);
    const msg=/duplicate|unique/i.test(String(e&&e.message))
      ? 'Já existe uma cidade com esse nome.'
      : /relation .*vitrine_cidades.* does not exist|schema cache/i.test(String(e&&e.message))
        ? 'Rode a migração migracao-vitrine-corretora.sql para ativar as cidades.'
        : ((e&&e.message)||'Não foi possível salvar.');
    showToast(msg,'error');
  }
}
function confirmarExcluirVitrineCidade(id){
  const c=vitrineCidadePorId(id);if(!c)return;
  const usados=(state.vitrine.imoveis||[]).filter(function(i){return String(i.cidadeId||'')===String(id);}).length;
  openModal('<h3 class="modal-title">Excluir '+esc(c.nome)+'?</h3>'+
    '<p class="modal-text">'+(usados
      ? '<strong>'+usados+' anúncio(s)</strong> estão nesta cidade. Eles não serão apagados, mas ficarão sem cidade e sairão dos cards do site. Se quiser apenas tirá-la do ar, use “Mostrar no site”.'
      : 'A cidade será removida dos cards do site.')+'</p>'+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-danger" onclick="excluirVitrineCidade(\''+id+'\')">Excluir cidade</button></div>');
}
async function excluirVitrineCidade(id){
  try{
    await db.deleteVitrineCidade(id);
    state.vitrine.cidades=(state.vitrine.cidades||[]).filter(function(c){return c.id!==id;});
    (state.vitrine.imoveis||[]).forEach(function(i){ if(String(i.cidadeId||'')===String(id)) i.cidadeId=''; });
    closeModal();render();showToast('Cidade excluída.','success');
  }catch(e){console.error(e);showToast('Não foi possível excluir.','error');}
}

/* Troca os campos conforme o tipo (terreno x construído) e destaca o
   preço que importa conforme a finalidade. */
function atualizarCamposVitrine(){
  const tipo=(document.getElementById('vit_tipo')||{}).value||'casa';
  const terreno=vitrineEhTerreno(tipo);
  const construido=document.getElementById('vit_bloco_construido');
  const loteBloco=document.getElementById('vit_bloco_terreno');
  if(construido) construido.hidden=terreno;
  if(loteBloco) loteBloco.hidden=!terreno;
  const finalidade=(document.getElementById('vit_finalidade')||{}).value||'alugar';
  const venda=document.getElementById('vit_preco_venda');
  const aluguel=document.getElementById('vit_aluguel');
  /* Não escondemos os campos: um anúncio pode mudar de finalidade e o
     valor já digitado não pode sumir. Só marcamos o que não se aplica. */
  if(venda) venda.closest('label').style.opacity=(finalidade==='alugar')?'.5':'1';
  if(aluguel) aluguel.closest('label').style.opacity=(finalidade==='vender')?'.5':'1';
}

function lerVitrineImovelForm(){
  const v=function(id){const e=document.getElementById(id);return e?String(e.value||'').trim():'';};
  const c=function(id){const e=document.getElementById(id);return !!(e&&e.checked);};
  const tipo=v('vit_tipo')||'casa';
  const terreno=vitrineEhTerreno(tipo);
  /* A cidade agora vem do cadastro: guardamos o id e também o nome, que
     é o que a página pública mostra e o que o filtro antigo usava. */
  const cidadeId=v('vit_cidade_id');
  const cidadeSel=(state.vitrine.cidades||[]).find(function(x){return String(x.id)===String(cidadeId);});
  return {
    codigo:v('vit_codigo'),titulo:v('vit_titulo'),tipo:tipo,
    /* O select traz o proprietário; o anunciante é resolvido em
       salvarVitrineImovel, que sabe criar o espelho quando falta. */
    proprietarioClienteId:v('vit_anunciante')||'',
    finalidade:v('vit_finalidade')||'alugar',
    precoVenda:Number(v('vit_preco_venda'))||0,
    aluguel:Number(v('vit_aluguel'))||0,condominio:Number(v('vit_cond'))||0,iptu:Number(v('vit_iptu'))||0,
    quartos:terreno?0:(parseInt(v('vit_quartos'),10)||0),
    banheiros:terreno?0:(parseInt(v('vit_banheiros'),10)||0),
    vagas:terreno?0:(parseInt(v('vit_vagas'),10)||0),
    areaM2:Number(terreno?v('vit_area_terreno'):v('vit_area'))||0,
    frenteM:terreno?(v('vit_frente')||null):null,
    fundoM:terreno?(v('vit_fundo')||null):null,
    murado:terreno&&c('vit_murado'),
    esquina:terreno&&c('vit_esquina'),
    topografia:terreno?v('vit_topografia'):'',
    mobiliado:c('vit_mobiliado'),aceitaPet:c('vit_pet'),quintal:c('vit_quintal'),areaServico:c('vit_servico'),
    logradouro:v('vit_rua'),numero:v('vit_numero'),bairro:v('vit_bairro'),
    cidadeId:cidadeId||null,
    cidade:cidadeSel?cidadeSel.nome:'',
    uf:(cidadeSel?cidadeSel.uf:v('vit_uf')).toUpperCase(),
    latitude:v('vit_lat')||null,longitude:v('vit_lng')||null,
    enderecoExatoPublico:c('vit_exato'),
    autorizacaoEnderecoEm:c('vit_exato')?new Date().toISOString():null,
    caucao:v('vit_caucao'),contratoMinimoMeses:parseInt(v('vit_contrato'),10)||12,
    exigeFiador:c('vit_fiador'),descricao:v('vit_desc'),destaque:c('vit_destaque'),
    pontosInteresse:vitrinePoiDeTexto(v('vit_poi')),
    imovelId:v('vit_imovel_origem')||null
  };
}

/* ------------------------------------------------------------
   PONTE COM A GESTÃO

   As duas tabelas de imóvel continuam separadas de propósito: a corretora
   anuncia casa de terceiro que não administra, e essa casa não pode entrar
   no Financeiro nem no limite do plano. O que muda é que a casa que ELA
   administra deixa de ser digitada duas vezes.

   A cópia é unidirecional e manual — gestão → Vitrine, quando alguém pede.
   Depois disso, título, descrição, destaque e fotos são trabalho editorial
   do anúncio e nunca são sobrescritos: só valor e situação podem ser
   atualizados, por um botão à parte.
   ------------------------------------------------------------ */

/* Os dois cadastros têm domínios de tipo diferentes. */
function vitrineTipoDoImovel(tipo){
  if(tipo==='apartamento') return 'apartamento';
  if(tipo==='comercial') return 'comercial';
  if(tipo==='quarto') return 'kitnet';   /* o mais próximo no catálogo */
  return 'casa';                          /* 'casa' e 'outro' */
}
function vitrineAnuncioDoImovel(imovelId){
  return (state.vitrine.imoveis||[]).find(function(a){
    return String(a.imovelId||'')===String(imovelId);
  })||null;
}

/* O anunciante da Vitrine e o proprietário-cliente da gestão são a mesma
   pessoa em dois cadastros: o primeiro serve ao catálogo (e existe também
   para quem não é cliente da administração), o segundo à prestação de
   contas. A migração ligou os que já existiam; aqui garantimos o vínculo
   para um proprietário cadastrado depois — senão publicar um imóvel dele
   esbarraria em "cadastre o anunciante primeiro", pedindo que a pessoa
   digitasse de novo um nome que o aplicativo já conhece. */
async function garantirAnuncianteDoProprietario(proprietarioClienteId){
  if(!proprietarioClienteId) return null;
  const existente=(state.vitrine.anunciantes||[]).find(function(a){
    return String(a.proprietarioClienteId||'')===String(proprietarioClienteId);
  });
  if(existente) return existente;
  const dono=typeof ownerClientById==='function'?ownerClientById(proprietarioClienteId):null;
  if(!dono) return null;
  const criado=await db.saveVitrineAnunciante({
    nome:dono.nome, telefone:dono.telefone, email:dono.email,
    documento:dono.documento, observacoes:'',
    proprietarioClienteId:proprietarioClienteId
  });
  state.vitrine.anunciantes=(state.vitrine.anunciantes||[]).concat(criado);
  return criado;
}

/* Abre o formulário do anúncio já preenchido a partir da casa. */
async function publicarImovelNaVitrine(imovelId){
  const h=(state.houses||[]).find(function(x){return x.id===imovelId;});
  if(!h){showToast('Imóvel não encontrado.','error');return;}
  const jaTem=vitrineAnuncioDoImovel(imovelId);
  if(jaTem){ openVitrineImovelModal(jaTem.id); return; }
  let anunciante=null;
  try{
    anunciante=await garantirAnuncianteDoProprietario(h.proprietarioClienteId);
  }catch(e){
    /* Falhar aqui não impede publicar: a tela pede o anunciante como
       sempre pediu. */
    console.warn('Anunciante não pôde ser criado a partir do proprietário:',e);
  }
  const endereco=String(h.endereco||'');
  const partes=endereco.split(/\s*[-–—]\s*|\s*,\s*/);
  openVitrineImovelModal(null,{
    imovelId:imovelId,
    anuncianteId:anunciante?anunciante.id:'',
    titulo:h.nome||'',
    tipo:vitrineTipoDoImovel(h.tipo),
    finalidade:'alugar',
    aluguel:Number(h.aluguelValor)||0,
    quartos:Number(h.quartos)||0,
    banheiros:Number(h.banheiros)||0,
    vagas:h.garagem?1:0,
    quintal:!!h.quintal,
    areaServico:!!h.areaServico,
    logradouro:partes[0]||endereco,
    bairro:partes.length>1?partes[1]:'',
    descricao:h.descricaoPublica||''
  });
}

/* Só valor e situação. Título, descrição e fotos são do anúncio. */
async function atualizarAnuncioDoImovel(imovelId){
  const h=(state.houses||[]).find(function(x){return x.id===imovelId;});
  const anuncio=vitrineAnuncioDoImovel(imovelId);
  if(!h||!anuncio)return;
  const novoStatus=h.status==='alugada'?'alugado':(anuncio.status==='alugado'?'ativo':anuncio.status);
  try{
    const salvo=await db.saveVitrineImovel(Object.assign({},anuncio,{
      aluguel:Number(h.aluguelValor)||0,
      status:novoStatus
    }));
    Object.assign(anuncio,salvo);
    render();
    showToast(novoStatus==='alugado'
      ? 'Valor atualizado e anúncio marcado como alugado.'
      : 'Valor do anúncio atualizado.','success');
  }catch(e){
    console.error(e);
    showToast((e&&e.message)||'Não foi possível atualizar o anúncio.','error');
  }
}

/* Bloco que aparece na ficha do imóvel. Só para quem tem o módulo. */
function renderVitrinePublicacaoImovel(h){
  if(typeof temModulo==='function'&&!temModulo('vitrine'))return '';
  if(!state.vitrine||!state.vitrine.carregado){
    /* A Vitrine carrega sozinha ao abrir a aba. Aqui pedimos a carga uma
       vez, sem travar a ficha do imóvel enquanto ela vem. */
    if(typeof loadVitrineData==='function') loadVitrineData();
    return '';
  }
  const anuncio=vitrineAnuncioDoImovel(h.id);
  const podeEditar=typeof canOperateProperties==='function'?canOperateProperties():true;
  if(!anuncio){
    if(!podeEditar)return '';
    return '<div class="field-card"><div class="field-line">'+
      '<span class="fl-label">Vitrine</span>'+
      '<span class="fl-value">Este imóvel ainda não está anunciado</span></div>'+
      '<div class="quick-actions"><button class="btn btn-primary btn-sm" '+
        'onclick="publicarImovelNaVitrine(\''+h.id+'\')">Publicar na Vitrine</button></div></div>';
  }
  const desatualizado=Number(anuncio.aluguel)!==Number(h.aluguelValor||0)
    ||(h.status==='alugada'&&anuncio.status==='ativo');
  return '<div class="field-card"><div class="field-line">'+
      '<span class="fl-label">Vitrine</span>'+
      '<span class="fl-value">Anúncio <b>#'+esc(anuncio.codigo)+'</b> · '+
      esc(vitrineStatusLabel(anuncio.status))+'</span></div>'+
    (desatualizado
      ? '<div class="field-line"><span class="fl-label">Atenção</span>'+
        '<span class="fl-value">O anúncio está com '+fmtMoney(anuncio.aluguel)+
        (h.status==='alugada'&&anuncio.status==='ativo'?' e continua no ar':'')+'</span></div>'
      : '')+
    (podeEditar?'<div class="quick-actions">'+
      '<button class="btn btn-ghost btn-sm" onclick="openVitrineImovelModal(\''+anuncio.id+'\')">Abrir anúncio</button>'+
      (desatualizado?'<button class="btn btn-primary btn-sm" onclick="atualizarAnuncioDoImovel(\''+h.id+'\')">Atualizar valores</button>':'')+
    '</div>':'')+
  '</div>';
}

function openVitrineImovelModal(id,prefill){
  const item=id?vitrineImovelPorId(id):(prefill||null);
  /* Todo anúncio pertence a um dono. O cadastro é o mesmo da gestão, então
     a saída daqui é a tela de Proprietários — não um formulário paralelo. */
  if(!(state.owners||[]).length&&!id){
    openModal('<h3 class="modal-title">Cadastre o proprietário primeiro</h3>'+
      '<p class="modal-text">Todo anúncio pertence a um dono. É o mesmo cadastro da gestão: '+
      'quem você cadastrar aqui aparece também nos imóveis administrados.</p>'+
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-primary" onclick="closeModal();openOwnerModal()">Cadastrar proprietário</button></div>');
    return;
  }
  /* As fotos só aparecem depois que o anúncio existe: elas precisam do
     id para serem gravadas. Em anúncio novo, mostramos o aviso. */
  const blocoFotos=id
    ? '<div class="form-section-title">Fotos do anúncio</div>'+
      '<div id="vitrineFotos" class="vitrine-fotos">'+
      '<div class="vitrine-fotos-carregando">Carregando fotos…</div></div>'
    : '<div class="form-section-title">Fotos do anúncio</div>'+
      '<p class="modal-hint">Salve o anúncio primeiro e ele abre de novo para você adicionar as fotos.</p>';

  /* Anúncio nascido de um imóvel da gestão: a origem viaja escondida no
     formulário e é gravada junto, para os dois nunca se separarem. */
  const origem=(prefill&&prefill.imovelId)||(item&&item.imovelId)||'';
  const veioDaGestao=!!(prefill&&prefill.imovelId);

  openModal('<h3 class="modal-title">'+(id?'Editar anúncio':'Novo anúncio')+'</h3>'+
    '<p class="modal-text">'+(origem
      ? 'Anúncio do seu imóvel administrado. O que você escrever aqui é só do anúncio: mexer no texto não altera a ficha do imóvel.'
      : 'Este imóvel é de terceiro. Ele não entra no Financeiro nem no limite de casas do seu plano.')+'</p>'+
    (veioDaGestao?'<div class="notice-box">Os dados vieram da ficha do imóvel. Confira o endereço e complete o que faltar antes de salvar.</div>':'')+
    '<input type="hidden" id="vit_imovel_origem" value="'+esc(origem)+'">'+
    vitrineImovelFormHtml(item)+blocoFotos+
    '<div class="modal-actions">'+(id?'<button class="btn btn-danger" onclick="confirmarExcluirVitrineImovel(\''+id+'\')">Excluir</button>':'<span></span>')+
    '<div class="modal-actions-right"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary" onclick="salvarVitrineImovel('+(id?'\''+id+'\'':'null')+')">Salvar</button></div></div>');

  if(id) ensureVitrineFotos(id);
}

async function salvarVitrineImovel(id){
  const dados=lerVitrineImovelForm();
  if(!dados.titulo){showToast('Informe o título do anúncio.','error');return;}
  if(!dados.codigo){showToast('Informe o código do anúncio.','error');return;}
  try{
    /* Traduz o proprietário escolhido para o anunciante que o anúncio
       referencia, criando o espelho na primeira vez. */
    const espelho=await garantirAnuncianteDoProprietario(dados.proprietarioClienteId);
    dados.anuncianteId=espelho?espelho.id:null;
    delete dados.proprietarioClienteId;
    const salvo=await db.saveVitrineImovel(Object.assign({},dados,id?{id:id}:{}));
    if(id){
      Object.assign(vitrineImovelPorId(id)||{},salvo);
      closeModal();render();
      showToast('Anúncio atualizado.','success');
    }else{
      state.vitrine.imoveis.unshift(salvo);
      render();
      /* Reabre já no anúncio salvo, para as fotos poderem ser enviadas
         sem o usuário precisar procurar o anúncio de novo na lista. */
      openVitrineImovelModal(salvo.id);
      showToast('Anúncio criado. Agora adicione as fotos.','success');
    }
  }catch(e){
    console.error(e);
    const bruto=String(e&&e.message||'');
    const msg=/vitrine_imoveis_origem_unica/i.test(bruto)
      ? 'Este imóvel já tem um anúncio na Vitrine. Abra o anúncio existente em vez de criar outro.'
      : /duplicate|unique/i.test(bruto)
        ? 'Já existe um anúncio com esse código.'
        : (bruto||'Não foi possível salvar.');
    showToast(msg,'error');
  }
}
function confirmarExcluirVitrineImovel(id){
  const i=vitrineImovelPorId(id);if(!i)return;
  openModal('<h3 class="modal-title">Excluir '+esc(i.codigo)+'?</h3>'+
    '<p class="modal-text">O anúncio, as fotos e as estatísticas serão apagados. Isso não pode ser desfeito.</p>'+
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-danger" onclick="excluirVitrineImovel(\''+id+'\')">Excluir</button></div>');
}
async function excluirVitrineImovel(id){
  try{
    await db.deleteVitrineImovel(id);
    state.vitrine.imoveis=state.vitrine.imoveis.filter(function(x){return x.id!==id;});
    closeModal();render();showToast('Anúncio excluído.','success');
  }catch(e){console.error(e);showToast('Não foi possível excluir.','error');}
}

/* ------------------------------------------------------------
   ANUNCIANTES
   ------------------------------------------------------------ */
/* A aba mostra os proprietários do ponto de vista da Vitrine: quantos
   anúncios e quanto de taxa cada um já pagou. O cadastro em si mora em
   Proprietários, e é para lá que os botões levam. */
function renderVitrineAnunciantes(){
  const donos=(state.owners||[]).slice().sort(function(a,b){
    return a.nome.localeCompare(b.nome,'pt-BR');
  });
  const anuncios=state.vitrine.imoveis||[];
  const taxas=state.vitrine.taxas||[];
  /* Anunciante criado antes da unificação e ainda sem proprietário. */
  const orfaos=(state.vitrine.anunciantes||[]).filter(function(a){
    return !a.proprietarioClienteId&&anuncios.some(function(i){return i.anuncianteId===a.id;});
  });
  return '<div class="vitrine-panel"><div class="vitrine-panel-head"><div><h2>Proprietários</h2>'+
    '<p>Os donos dos imóveis anunciados. O cadastro é o mesmo da gestão — '+
    'quem você cadastra aqui aparece lá, e vice-versa.</p></div>'+
    '<button class="btn btn-primary btn-sm" onclick="openOwnerModal()">+ Proprietário</button></div>'+
    (orfaos.length
      ? '<div class="notice-box">'+orfaos.length+' anunciante(s) antigo(s) ainda sem cadastro de proprietário. '+
        'Abra o anúncio e escolha o proprietário para ligá-los.</div>'
      : '')+
    (donos.length?'<div class="vitrine-table-wrap"><table class="vitrine-table"><thead><tr>'+
      '<th>Nome</th><th>Contato</th><th>Anúncios</th><th>Taxas pagas</th><th></th></tr></thead><tbody>'+
      donos.map(function(o){
        const espelho=(state.vitrine.anunciantes||[]).find(function(a){
          return String(a.proprietarioClienteId||'')===String(o.id);
        });
        const meus=espelho?anuncios.filter(function(i){return i.anuncianteId===espelho.id;}):[];
        const pago=espelho?taxas.filter(function(t){return t.anuncianteId===espelho.id&&t.pago;})
          .reduce(function(s,t){return s+Number(t.valor||0);},0):0;
        return '<tr><td><strong>'+esc(o.nome)+'</strong>'+(o.documento?'<span class="cell-sub">'+esc(o.documento)+'</span>':'')+'</td>'+
          '<td>'+esc(o.telefone||'—')+(o.email?'<span class="cell-sub">'+esc(o.email)+'</span>':'')+'</td>'+
          '<td><strong>'+meus.length+'</strong></td>'+
          '<td><strong>'+fmtMoney(pago)+'</strong></td>'+
          '<td><button class="btn btn-ghost btn-sm" onclick="openOwnerModal(\''+esc(o.id)+'\')">Editar</button></td></tr>';
      }).join('')+'</tbody></table></div>'
      :emptyState('Nenhum proprietário cadastrado. Cadastre o dono antes de criar o anúncio.',tenantIconSvg()))+'</div>';
}
/* Mantida por compatibilidade: qualquer atalho antigo cai no cadastro
   único em vez de abrir um formulário paralelo. */
function openVitrineAnuncianteModal(id){
  const a=id?vitrineAnunciantePorId(id):null;
  if(a&&a.proprietarioClienteId){ openOwnerModal(a.proprietarioClienteId); return; }
  openOwnerModal();
}
/* O formulário de anunciante deixou de existir: o cadastro é o de
   Proprietários. `db.saveVitrineAnunciante` continua no lugar porque é ele
   que cria o espelho em garantirAnuncianteDoProprietario. */

/* ------------------------------------------------------------
   LEADS
   ------------------------------------------------------------ */
function renderVitrineLeads(){
  const leads=state.vitrine.leads||[];
  return '<div class="vitrine-panel"><div class="vitrine-panel-head"><div><h2>Leads</h2>'+
    '<p>Cada contato guarda de qual imóvel veio, por onde chegou e o que a pessoa escreveu.</p></div></div>'+
    (leads.length?'<div class="vitrine-table-wrap"><table class="vitrine-table"><thead><tr>'+
      '<th>Pessoa</th><th>Imóvel</th><th>O que escreveu</th><th>Origem</th><th>Quando</th><th>Situação</th><th></th></tr></thead><tbody>'+
      leads.map(function(l){
        const im=vitrineImovelPorId(l.imovelId);
        /* A mensagem é o que a pessoa realmente disse — "posso visitar
           sábado?", "aceita financiamento?". Ficava gravada no banco e
           nunca chegava à tela. */
        const msg=String(l.mensagem||'').trim();
        return '<tr><td><strong>'+esc(l.nome||'—')+'</strong><span class="cell-sub">'+esc(l.telefone||'')+'</span></td>'+
          '<td>'+(im?'<span class="vitrine-code">#'+esc(im.codigo)+'</span><span class="cell-sub">'+esc(im.titulo)+'</span>':'—')+'</td>'+
          '<td class="vitrine-lead-msg">'+(msg?'<span title="'+esc(msg)+'">'+esc(msg)+'</span>':'<span class="cell-sub">—</span>')+'</td>'+
          '<td><span class="chip '+(l.origem==='whatsapp'?'chip-brass':'chip-slate')+'">'+(l.origem==='whatsapp'?'WhatsApp':'Formulário')+'</span></td>'+
          '<td>'+esc(String(l.createdAt||'').slice(0,10).split('-').reverse().join('/'))+'</td>'+
          '<td><select class="vitrine-lead-select" onchange="atualizarVitrineLead(\''+l.id+'\',this.value)">'+
            VITRINE_LEAD_STATUS.map(function(s){return '<option value="'+s[0]+'"'+(l.status===s[0]?' selected':'')+'>'+s[1]+'</option>';}).join('')+
          '</select></td>'+
          '<td><div class="vitrine-row-actions">'+
            (l.telefone?'<button class="btn btn-ghost btn-sm" onclick="abrirWhatsappLead(\''+l.id+'\')">WhatsApp</button>':'')+
            /* O contato do site e o funil de Interessados eram dois
               cadastros paralelos: quem chegava pelo anúncio nunca entrava
               no casamento com as casas vagas. Este botão fecha a ponte. */
            (l.interessadoId
              ? '<span class="chip chip-brass">No funil</span>'
              : (l.telefone?'<button class="btn btn-primary btn-sm" onclick="converterLeadEmInteressado(\''+l.id+'\')">Virar interessado</button>':''))+
          '</div></td></tr>';
      }).join('')+'</tbody></table></div>'
      :emptyState('Nenhum contato recebido ainda.',tenantIconSvg()))+'</div>';
}
async function atualizarVitrineLead(id,status){
  try{
    await db.setVitrineLeadStatus(id,status);
    const l=(state.vitrine.leads||[]).find(function(x){return x.id===id;});
    if(l)l.status=status;
    showToast('Situação atualizada.','success');
  }catch(e){console.error(e);showToast('Não foi possível atualizar.','error');}
}
/* O contato que chegou pelo site vira um interessado de verdade — com
   preferências, casamento com casas vagas e conversão em contrato. Sem
   isto, quem procurou a corretora pelo anúncio ficava numa lista à parte,
   fora de todo o funil que o aplicativo já tem.

   Não é automático de propósito: a lista de leads inclui quem só clicou no
   WhatsApp, e empurrar todos para dentro do funil encheria a tela de lixo. */
function converterLeadEmInteressado(id){
  if(typeof requirePropertyPermission==='function'&&!requirePropertyPermission())return;
  const l=(state.vitrine.leads||[]).find(function(x){return x.id===id;});
  if(!l)return;
  if(l.interessadoId){showToast('Este contato já está no funil.','error');return;}
  const im=vitrineImovelPorId(l.imovelId);
  const observacoes=[
    'Veio do site'+(im?' — anúncio #'+im.codigo+' ('+im.titulo+')':'')+'.',
    String(l.mensagem||'').trim()
  ].filter(Boolean).join('\n');
  /* O valor do anúncio entra como teto de referência: quem se interessou
     por uma casa de R$ 900 procura algo nessa faixa. */
  openAddInterestModal({
    nome:l.nome==='(clique no WhatsApp)'?'':l.nome,
    telefone:l.telefone||'',
    valorMaximo:im?(Number(im.aluguel)||0):0,
    quartosMin:im?(Number(im.quartos)||0):0,
    observacoes:observacoes
  },id);
}

function abrirWhatsappLead(id){
  const l=(state.vitrine.leads||[]).find(function(x){return x.id===id;});
  if(!l||!l.telefone)return;
  const im=vitrineImovelPorId(l.imovelId);
  let tel=l.telefone.replace(/\D/g,'');if(tel.length<=11)tel='55'+tel;
  /* O nome de quem atende vem do perfil público — é a corretora falando,
     não "a vitrine". */
  const casa=(state.ownerProfile&&state.ownerProfile.nome_publico)||'';
  const msg='Olá '+(l.nome||'')+'! Aqui é '+(casa?'da '+casa:'da corretora')+
    '. Recebi seu contato'+(im?' sobre o imóvel #'+im.codigo+' — '+im.titulo:'')+'.';
  window.open('https://wa.me/'+tel+'?text='+encodeURIComponent(msg),'_blank');
}

/* ------------------------------------------------------------
   TAXAS — o mini-financeiro da vitrine, separado do Financeiro
   ------------------------------------------------------------ */
function renderVitrineTaxas(){
  const taxas=state.vitrine.taxas||[];
  const total=taxas.filter(function(t){return t.pago;}).reduce(function(s,t){return s+Number(t.valor||0);},0);
  const aberto=taxas.filter(function(t){return !t.pago;}).reduce(function(s,t){return s+Number(t.valor||0);},0);
  return '<div class="vitrine-stats">'+
      vitrineStat(fmtMoney(total),'Total recebido','gold')+
      vitrineStat(fmtMoney(aberto),'Em aberto','warn')+
      vitrineStat(taxas.length,'Lançamentos','')+
    '</div>'+
    '<div class="vitrine-panel"><div class="vitrine-panel-head"><div><h2>Taxas de divulgação</h2>'+
    '<p>Receita da Vitrine. Fica fora do Financeiro dos aluguéis de propósito.</p></div></div>'+
    (taxas.length?'<div class="vitrine-table-wrap"><table class="vitrine-table"><thead><tr>'+
      '<th>Imóvel</th><th>Anunciante</th><th>Valor</th><th>Período</th><th>Situação</th></tr></thead><tbody>'+
      taxas.map(function(t){
        const im=vitrineImovelPorId(t.imovelId);
        return '<tr><td>'+(im?'<span class="vitrine-code">#'+esc(im.codigo)+'</span>':'—')+'</td>'+
          '<td>'+esc(vitrineAnuncianteNome(t.anuncianteId))+'</td>'+
          '<td><strong>'+fmtMoney(t.valor)+'</strong></td>'+
          '<td>'+(t.periodoInicio?fmtDateBR(t.periodoInicio):'—')+' a '+(t.periodoFim?fmtDateBR(t.periodoFim):'—')+'</td>'+
          '<td><span class="chip '+(t.pago?'chip-brass':'chip-warn')+'">'+(t.pago?'Paga':'Em aberto')+'</span></td></tr>';
      }).join('')+'</tbody></table></div>'
      :emptyState('Nenhuma taxa registrada. Elas são criadas ao publicar um anúncio.',financeIconSvg()))+'</div>';
}

/* ------------------------------------------------------------
   DIVULGAÇÃO
   ------------------------------------------------------------ */
function vitrineUrl(){
  const slug=(state.ownerProfile&&state.ownerProfile.slug_publico)||'';
  if(!slug)return '';
  const url=new URL(window.location.href);url.search='';url.hash='';
  url.searchParams.set('vitrine',slug);
  return url.toString();
}
/* Link daquele anúncio, não o da vitrine inteira.
   A prévia rica do WhatsApp (foto grande, título e preço) é montada pela
   edge function netlify/edge-functions/vitrine-preview.js, que só sabe
   qual imóvel mostrar se a URL trouxer &imovel=. Sem isso o link chega
   cru no grupo e a mensagem perde metade da força. */
function vitrineUrlImovel(i){
  const base=vitrineUrl();
  if(!base||!i)return base;
  const url=new URL(base);
  if(i.cidadeId) url.searchParams.set('cidade',i.cidadeId);
  /* Anúncio só de venda abre direto na aba Comprar. */
  if(vitrineServeVender(i)&&!vitrineServeAlugar(i)) url.searchParams.set('para','vender');
  url.searchParams.set('imovel',i.id);
  return url.toString();
}
function copyVitrineLink(){
  const url=vitrineUrl();
  if(!url){showToast('Salve primeiro o endereço público nas configurações.','error');return;}
  copyTextValue(url,'Link da Vitrine copiado.');
}
function copiarLinkVitrineImovel(id){
  const i=vitrineImovelPorId(id);if(!i)return;
  const url=vitrineUrlImovel(i);
  if(!url){showToast('Salve primeiro o endereço público nas configurações.','error');return;}
  copyTextValue(url,'Link do anúncio copiado.');
}
function renderVitrineDivulgacao(){
  const url=vitrineUrl();
  const ativos=(state.vitrine.imoveis||[]).filter(function(i){return i.status==='ativo';});
  if(!url){
    return '<div class="vitrine-panel">'+emptyState('Defina o endereço público em Configurações do app para gerar o link da Vitrine.',vitrineIconSvg())+
      '<div class="vitrine-empty-actions"><button class="btn btn-primary" onclick="openConfigModal()">Abrir configurações</button></div></div>';
  }
  return '<div class="vitrine-panel"><div class="vitrine-panel-head"><div><h2>Link da Vitrine</h2>'+
      '<p>Mande no WhatsApp, coloque na bio do Instagram, imprima o QR.</p></div></div>'+
      '<div class="vitrine-link-box"><code>'+esc(url)+'</code>'+
      '<button class="btn btn-primary btn-sm" onclick="copyVitrineLink()">Copiar</button></div></div>'+
    '<div class="vitrine-panel"><div class="vitrine-panel-head"><div><h2>Texto pronto por imóvel</h2>'+
      '<p>Já sai com preço, características e o link <strong>daquele anúncio</strong> — '+
      'colado no WhatsApp, chega com a foto grande e o preço.</p></div></div>'+
      (ativos.length?'<div class="vitrine-share-grid">'+ativos.map(function(i){
        const soVende=vitrineServeVender(i)&&!vitrineServeAlugar(i);
        const resumo=soVende
          ? fmtMoney(i.precoVenda)+' à vista'
          : fmtMoney(i.aluguel)+' / mês';
        const detalhe=vitrineEhTerreno(i.tipo)
          ? (i.areaM2?i.areaM2+' m²':'terreno')
          : i.quartos+' quartos';
        return '<div class="vitrine-share-card"><strong>#'+esc(i.codigo)+' · '+esc(i.titulo)+'</strong>'+
          '<span>'+esc(resumo)+' · '+esc(detalhe)+'</span>'+
          '<div class="vitrine-share-actions">'+
            '<button class="btn btn-ghost btn-sm" onclick="copiarLinkVitrineImovel(\''+i.id+'\')">Copiar link</button>'+
            '<button class="btn btn-primary btn-sm" onclick="copiarTextoVitrine(\''+i.id+'\')">Copiar texto</button>'+
          '</div></div>';
      }).join('')+'</div>':emptyState('Nenhum anúncio no ar para divulgar.',vitrineIconSvg()))+'</div>';
}
function copiarTextoVitrine(id){
  const i=vitrineImovelPorId(id);if(!i)return;
  const url=vitrineUrlImovel(i);
  const soVende=vitrineServeVender(i)&&!vitrineServeAlugar(i);
  /* Terreno não tem quarto nem banheiro: anunciar "0 quartos" é pior que
     não anunciar nada. */
  const linhaPreco=soVende
    ? '💰 '+fmtMoney(i.precoVenda)+' à vista'
    : '💰 '+fmtMoney(i.aluguel)+'/mês'+
      (vitrineCustoTotal(i)!==i.aluguel?' ('+fmtMoney(vitrineCustoTotal(i))+' com taxas)':'')+
      (vitrineServeVender(i)?'\n🏷 Ou '+fmtMoney(i.precoVenda)+' à vista':'');
  const linhaSpecs=vitrineEhTerreno(i.tipo)
    ? '📐 '+(i.areaM2?i.areaM2+'m²':'')+
      ((i.frenteM&&i.fundoM)?' · '+i.frenteM+'×'+i.fundoM+'m':'')+
      (i.murado?' · murado':'')+(i.esquina?' · esquina':'')
    : '🛏 '+i.quartos+' quartos · 🛁 '+i.banheiros+' banheiros'+
      (i.vagas?' · 🚗 '+i.vagas+' vaga(s)':'')+(i.areaM2?' · 📐 '+i.areaM2+'m²':'');
  const texto='🏠 *'+i.titulo+'*\n'+
    '📍 '+[i.bairro,i.cidade].filter(Boolean).join(' · ')+'\n'+
    linhaPreco+'\n'+linhaSpecs+'\n'+
    (i.aceitaPet?'🐾 Aceita pet\n':'')+
    '\nCódigo: '+i.codigo+'\n'+(url?'Ver fotos e mapa: '+url:'');
  copyTextValue(texto,'Texto copiado. É só colar no WhatsApp.');
}

/* ============================================================
   PÁGINA PÚBLICA — sem login, aberta por ?vitrine=slug
   Só enxerga anúncio ativo e dentro do prazo da taxa. Dados do
   anunciante nunca chegam aqui: a função do banco não os devolve.
   ============================================================ */

async function bootVitrinePublica(slug){
  state.vitrinePublicMode=true;
  state.loading=true;
  applyAppTheme('original');   /* a vitrine é a sua marca, não segue tema */
  render();
  try{
    state.vitrinePublic=await db.loadVitrinePublica(slug);
  }catch(e){
    console.error(e);
    state.vitrinePublic={perfil:null,imoveis:[]};
  }
  state.loading=false;
  lerFiltrosDaUrl();
  ligarVoltarDoNavegador();
  render();
  atualizarTituloVitrine();
}

/* Botão Voltar do celular e do navegador. Sem isto, quem abria um imóvel
   e apertava Voltar saía do site inteiro — o jeito mais rápido de perder
   uma pessoa que já estava olhando. */
let _vitrineVoltarLigado=false;
function ligarVoltarDoNavegador(){
  if(_vitrineVoltarLigado||typeof window==='undefined')return;
  _vitrineVoltarLigado=true;
  window.addEventListener('popstate',function(){
    if(!state.vitrinePublicMode)return;
    if(window._vitrineMapa){try{window._vitrineMapa.remove();}catch(e){}window._vitrineMapa=null;}
    fecharVitrineLightbox(true);
    lerFiltrosDaUrl();
    render();
    atualizarTituloVitrine();
    if(state.vitrineDetalheId) setTimeout(function(){desenharMapaVitrine(state.vitrineDetalheId);},60);
  });
}

/* Os filtros vivem no endereço do link. Assim você manda no
   WhatsApp um link já filtrado: "as de 2 quartos até 1.200". */
function lerFiltrosDaUrl(){
  const p=new URLSearchParams(location.search);
  const f=state.vitrineFiltros;
  f.busca=p.get('busca')||'';
  f.tipo=p.get('tipo')||'';
  f.quartos=parseInt(p.get('quartos'),10)||0;
  f.faixa=p.get('faixa')||'';
  f.bairro=p.get('bairro')||'';
  f.ordem=p.get('ordem')||'destaque';
  f.extras=(p.get('extras')||'').split(',').filter(Boolean);
  state.vitrinePubCidade=p.get('cidade')||'';
  state.vitrinePubFinalidade=(p.get('para')==='vender')?'vender':'alugar';
  state.vitrineDetalheId=p.get('imovel')||null;
  /* Abrir um imóvel direto pelo link precisa levar junto a cidade e a
     finalidade dele — senão o "voltar" cai numa lista que não o contém. */
  if(state.vitrineDetalheId){
    const alvo=((state.vitrinePublic||{}).imoveis||[])
      .find(function(x){return String(x.id)===String(state.vitrineDetalheId);});
    if(alvo){
      if(!state.vitrinePubCidade) state.vitrinePubCidade=alvo.cidadeId||'';
      if(!p.get('para')&&!vitrineServeAlugar(alvo)) state.vitrinePubFinalidade='vender';
    }
  }
}
/* `novaEntrada` decide se o endereço vira um passo no histórico.
   Mudar de filtro é ajuste fino e usa replaceState — senão o Voltar do
   navegador teria de desfazer chip por chip. Abrir um imóvel ou escolher
   uma cidade é navegação de verdade e usa pushState, para o Voltar do
   celular fazer o que a pessoa espera em vez de sair do site. */
function gravarFiltrosNaUrl(novaEntrada){
  const f=state.vitrineFiltros;
  const p=new URLSearchParams();
  const slug=new URLSearchParams(location.search).get('vitrine')||'';
  p.set('vitrine',slug);
  if(f.busca)p.set('busca',f.busca);
  if(f.tipo)p.set('tipo',f.tipo);
  if(f.quartos)p.set('quartos',String(f.quartos));
  if(f.faixa)p.set('faixa',f.faixa);
  if(f.bairro)p.set('bairro',f.bairro);
  if(f.ordem&&f.ordem!=='destaque')p.set('ordem',f.ordem);
  if(f.extras.length)p.set('extras',f.extras.join(','));
  /* Cidade e finalidade entram no link: dá para mandar no WhatsApp já
     aberto em "Lajedo · Comprar". */
  if(state.vitrinePubCidade)p.set('cidade',state.vitrinePubCidade);
  if(state.vitrinePubFinalidade==='vender')p.set('para','vender');
  if(state.vitrineDetalheId)p.set('imovel',state.vitrineDetalheId);
  const url='?'+p.toString();
  /* O marcador {vitrine:true} diz que este passo foi criado por nós — é
     o que permite ao "voltar" da página saber se há para onde voltar
     dentro do site ou se ele jogaria a pessoa para fora. */
  if(novaEntrada&&url!==(location.search||'')) history.pushState({vitrine:true},'',url);
  else history.replaceState(history.state||null,'',url);
  atualizarTituloVitrine();
}

/* O robô do WhatsApp e do Google recebem o título certo da edge function,
   no primeiro carregamento. Quem navega dentro da página, não: o título
   ficava congelado no primeiro imóvel aberto, e é ele que nomeia a aba do
   navegador, o favorito e cada passo do histórico. */
function atualizarTituloVitrine(){
  const dados=state.vitrinePublic||{};
  const perfil=dados.perfil;
  if(!perfil)return;
  const casa=perfil.nome||'Imóveis';
  let titulo=casa;
  if(state.vitrineDetalheId){
    const i=(dados.imoveis||[]).find(function(x){return String(x.id)===String(state.vitrineDetalheId);});
    if(i){
      const venda=state.vitrinePubFinalidade==='vender'&&Number(i.precoVenda)>0;
      const valor=venda?fmtMoney(i.precoVenda):fmtMoney(i.aluguel)+'/mês';
      titulo=i.titulo+' — '+valor+' · '+casa;
    }
  }else{
    const cidade=vitrineCidadePublicaPorId(state.vitrinePubCidade);
    const acao=state.vitrinePubFinalidade==='vender'?'à venda':'para alugar';
    titulo=(cidade?'Imóveis '+acao+' em '+cidade.nome:'Imóveis '+acao)+' · '+casa;
  }
  document.title=titulo;
  /* Canonical acompanha: sem ele, cada combinação de filtro parece uma
     página diferente para o buscador. */
  let link=document.querySelector('link[rel="canonical"]');
  if(!link){link=document.createElement('link');link.rel='canonical';document.head.appendChild(link);}
  link.href=location.href;
}
function vitrineCidadePublicaPorId(id){
  if(!id)return null;
  return (((state.vitrinePublic||{}).cidades)||[])
    .find(function(c){return String(c.id)===String(id);})||null;
}
function setVitrineFiltro(campo,valor){
  state.vitrineFiltros[campo]=campo==='quartos'?(parseInt(valor,10)||0):valor;
  /* Ao escolher terreno, o filtro de quartos some da tela — então ele
     não pode continuar filtrando por trás. */
  if(campo==='tipo'&&valor==='terreno') state.vitrineFiltros.quartos=0;
  /* Filtrar é começar de novo: a contagem de cartões visíveis volta ao
     início, senão um filtro que sobra 3 imóveis herdaria "ver mais 12". */
  state.vitrinePubLimite=VITRINE_PAGINA;
  gravarFiltrosNaUrl();render();
}
function toggleVitrineExtra(chave){
  const f=state.vitrineFiltros;
  f.extras=f.extras.includes(chave)?f.extras.filter(function(x){return x!==chave;}):f.extras.concat(chave);
  state.vitrinePubLimite=VITRINE_PAGINA;
  gravarFiltrosNaUrl();render();
}
function limparVitrineFiltros(){
  state.vitrineFiltros={busca:'',tipo:'',quartos:0,faixa:'',bairro:'',ordem:'destaque',extras:[]};
  state.vitrinePubLimite=VITRINE_PAGINA;
  gravarFiltrosNaUrl();render();
}
function abrirVitrineDetalhe(id){
  state.vitrineDetalheId=id;
  gravarFiltrosNaUrl(true);render();
  if(typeof window!=='undefined'&&window.scrollTo) window.scrollTo({top:0,behavior:'auto'});
  db.registrarVitrineVisita(id,'visualizacao');
  setTimeout(function(){desenharMapaVitrine(id);},60);
}
function fecharVitrineDetalhe(){
  /* Sair do detalhe é desfazer um passo: se o histórico tem para onde
     voltar, deixamos o navegador voltar. O popstate recarrega o estado a
     partir da URL, e a página não acumula entradas duplicadas. */
  if(typeof history!=='undefined'&&history.state&&history.state.vitrine){history.back();return;}
  fecharVitrineDetalheAgora();
}
function fecharVitrineDetalheAgora(){
  if(window._vitrineMapa){try{window._vitrineMapa.remove();}catch(e){}window._vitrineMapa=null;}
  state.vitrineDetalheId=null;gravarFiltrosNaUrl();render();
}

/* Preço que vale na aba aberta: aluguel na de alugar, venda na de comprar. */
function vitrinePrecoVigente(i){
  return state.vitrinePubFinalidade==='vender'
    ? (Number(i.precoVenda)||0)
    : (Number(i.aluguel)||0);
}
function vitrineImoveisFiltrados(){
  const f=state.vitrineFiltros;
  const lista=((state.vitrinePublic||{}).imoveis)||[];
  const q=(f.busca||'').trim().toLowerCase();
  const cidade=state.vitrinePubCidade||'';
  const vender=state.vitrinePubFinalidade==='vender';
  let out=lista.filter(function(i){
    /* Cidade escolhida na entrada e finalidade da aba vêm antes de
       qualquer outro filtro: são o caminho que a pessoa escolheu. */
    if(cidade&&String(i.cidadeId||'')!==String(cidade))return false;
    if(vender?!vitrineServeVender(i):!vitrineServeAlugar(i))return false;
    /* A cidade entra na busca: quem digita "Lajedo" espera achar. */
    if(q&&!((i.titulo+' '+i.bairro+' '+(i.logradouro||'')+' '+i.codigo+' '+(i.cidade||''))
      .toLowerCase().includes(q)))return false;
    if(f.tipo&&i.tipo!==f.tipo)return false;
    if(f.quartos&&Number(i.quartos)<f.quartos)return false;
    if(f.bairro&&i.bairro!==f.bairro)return false;
    if(f.faixa){
      const parts=f.faixa.split('-').map(Number);
      const v=vitrinePrecoVigente(i);
      if(v<parts[0]||v>parts[1])return false;
    }
    return f.extras.every(function(x){
      if(x==='garagem')return Number(i.vagas)>0;
      if(x==='mobiliado')return !!i.mobiliado;
      if(x==='pet')return !!i.aceitaPet;
      if(x==='quintal')return !!i.quintal;
      if(x==='semFiador')return !i.exigeFiador;
      return true;
    });
  });
  /* Ordena pelo preço da aba aberta. Ordenar sempre por aluguel deixava a
     aba Comprar em ordem aleatória: num terreno à venda o aluguel é zero. */
  if(f.ordem==='menor')out.sort(function(a,b){return vitrinePrecoVigente(a)-vitrinePrecoVigente(b);});
  else if(f.ordem==='maior')out.sort(function(a,b){return vitrinePrecoVigente(b)-vitrinePrecoVigente(a);});
  else if(f.ordem==='novos')out.sort(function(a,b){return String(b.publicadoEm||'').localeCompare(String(a.publicadoEm||''));});
  else out.sort(function(a,b){return (b.destaque?1:0)-(a.destaque?1:0)||String(b.publicadoEm||'').localeCompare(String(a.publicadoEm||''));});
  return out;
}
function vitrineTotalMes(i){
  return (Number(i.aluguel)||0)+(Number(i.condominio)||0)+(Number(i.iptu)||0);
}

function renderVitrinePublicaPage(){
  if(state.loading){
    return '<div class="app-loading">'+logoSvg()+'<span>Carregando imóveis…</span></div>';
  }
  const dados=state.vitrinePublic||{};
  const perfil=dados.perfil;
  if(!perfil){
    return '<div class="vitrine-public"><div class="vitrine-pub-empty">'+logoSvg()+
      '<h1>Vitrine não encontrada</h1><p>Confira o endereço que você recebeu.</p>'+
      '<a class="btn btn-primary" href="'+esc(location.pathname)+'">Área do proprietário</a></div></div>';
  }
  /* Página de privacidade: o formulário pede consentimento LGPD e até
     agora não havia para onde apontar. Sem ela também não se anuncia no
     Meta Ads nem no Google Ads. */
  if(new URLSearchParams(location.search).get('pagina')==='privacidade'){
    return '<div class="vitrine-public">'+renderVitrineTopoPublico(perfil,dados)+
      renderVitrinePrivacidade(perfil)+renderVitrineRodape(perfil,dados)+'</div>';
  }
  if(state.vitrineDetalheId){
    const item=(dados.imoveis||[]).find(function(x){return x.id===state.vitrineDetalheId;});
    if(item)return '<div class="vitrine-public">'+renderVitrineTopoPublico(perfil,dados)+
      renderVitrineDetalhe(item,perfil)+renderVitrineRodape(perfil,dados)+
      renderVitrineLightbox()+'</div>';
  }
  /* Entrada do site: escolher a cidade primeiro. Quem não cadastrou
     cidade nenhuma cai direto na lista, como era antes. */
  const cidades=dados.cidades||[];
  if(cidades.length && !state.vitrinePubCidade){
    return '<div class="vitrine-public">'+renderVitrineTopoPublico(perfil,dados)+
      renderVitrineCidadesPublicas(dados)+renderVitrineRodape(perfil,dados)+'</div>';
  }
  return '<div class="vitrine-public">'+renderVitrineTopoPublico(perfil,dados)+
    renderVitrineBarraCidade(dados)+renderVitrineFiltros(dados)+renderVitrineGrid()+
    renderVitrineRodape(perfil,dados)+'</div>';
}

/* ---------- rodapé ----------
   Toda página pública precisa dizer quem está falando. Numa corretora,
   isso é obrigação: CRECI, cidade e um contato. */
function renderVitrineRodape(perfil,dados){
  const cidades=(dados&&dados.cidades)||[];
  const nomes=cidades.filter(function(c){return (Number(c.totalAlugar)||0)+(Number(c.totalVender)||0)>0;})
    .map(function(c){return c.nome;});
  const tel=String((perfil&&perfil.contato)||'').replace(/\D/g,'');
  const wa=tel?('https://wa.me/'+(tel.length<=11?'55'+tel:tel)):'';
  const priv=new URL(location.href);
  priv.search='';priv.searchParams.set('vitrine',(perfil&&perfil.slug)||'');
  priv.searchParams.set('pagina','privacidade');
  return '<footer class="vitrine-rodape">'+
    '<div class="vr-marca"><strong>'+esc((perfil&&perfil.nome)||'Imóveis')+'</strong>'+
      (perfil&&perfil.creci?'<span>CRECI '+esc(perfil.creci)+'</span>':'')+'</div>'+
    (nomes.length?'<div class="vr-cidades"><span>Atendemos</span><p>'+esc(nomes.join(' · '))+'</p></div>':'')+
    '<div class="vr-links">'+
      (wa?'<a href="'+esc(wa)+'" target="_blank" rel="noopener">Falar no WhatsApp</a>':'')+
      '<a href="'+esc(priv.toString())+'">Privacidade</a>'+
    '</div></footer>';
}

function renderVitrinePrivacidade(perfil){
  const casa=esc((perfil&&perfil.nome)||'esta corretora');
  return '<main class="vitrine-pub-main vitrine-texto-pagina">'+
    '<h1>Privacidade</h1>'+
    '<p>Quando você preenche o formulário de interesse ou clica para falar no '+
    'WhatsApp, '+casa+' recebe o que você escreveu, seu nome e seu telefone. '+
    'Usamos esses dados para uma coisa só: retornar o seu contato sobre o imóvel '+
    'que você viu.</p>'+
    '<h2>O que guardamos</h2>'+
    '<p>Nome, telefone, a mensagem que você escreveu e qual anúncio gerou o '+
    'contato. Não pedimos CPF, não pedimos endereço e não pedimos dado de '+
    'pagamento nesta página.</p>'+
    '<h2>Com quem dividimos</h2>'+
    '<p>Com o proprietário do imóvel, quando for necessário para agendar a '+
    'visita ou fechar o negócio. Com mais ninguém. Não vendemos e não trocamos '+
    'lista de contatos.</p>'+
    '<h2>Como sair</h2>'+
    '<p>Peça no mesmo WhatsApp em que falamos: apagamos o seu contato e paramos '+
    'de procurar você. Não precisa justificar.</p>'+
    '<h2>Cookies</h2>'+
    '<p>Este site não usa cookie de propaganda nem rastreador de terceiros. '+
    'Contamos apenas quantas vezes cada anúncio foi aberto, sem identificar '+
    'quem abriu.</p>'+
    '<p class="vitrine-texto-volta"><button class="btn btn-ghost" onclick="voltarVitrineDaPrivacidade()">'+
    '← Voltar aos imóveis</button></p>'+
    '</main>';
}
function voltarVitrineDaPrivacidade(){
  const p=new URLSearchParams(location.search);
  p.delete('pagina');
  history.replaceState(history.state||null,'','?'+p.toString());
  render();
}

/* ---------- entrada por cidade ---------- */
function renderVitrineCidadesPublicas(dados){
  const cidades=(dados.cidades||[]).slice().sort(function(a,b){
    return (a.ordem-b.ordem)||String(a.nome).localeCompare(String(b.nome),'pt-BR');
  });
  return '<main class="vitrine-pub-main">'+
    '<div class="vitrine-cidades-intro"><h2>Onde você procura?</h2>'+
      '<p>Escolha a cidade para ver os imóveis e terrenos disponíveis.</p></div>'+
    '<div class="vitrine-cidades-grid">'+cidades.map(function(c){
      const alugar=Number(c.totalAlugar)||0, vender=Number(c.totalVender)||0;
      const vazia=(alugar+vender)===0;
      return '<button class="vitrine-cidade-card'+(vazia?' is-vazia':'')+'" '+
        'onclick="escolherVitrineCidade(\''+esc(c.id)+'\')">'+
        '<span class="vitrine-cidade-inicial" aria-hidden="true">'+esc(String(c.nome||'?').trim().charAt(0).toUpperCase())+'</span>'+
        '<span class="vitrine-cidade-txt"><strong>'+esc(c.nome)+'</strong><small>'+esc(c.uf)+'</small></span>'+
        '<span class="vitrine-cidade-tags">'+
          (alugar?'<i>'+alugar+' para alugar</i>':'')+
          (vender?'<i class="venda">'+vender+' à venda</i>':'')+
          (vazia?'<i class="vazio">em breve</i>':'')+
        '</span></button>';
    }).join('')+'</div></main>';
}
function escolherVitrineCidade(id){
  state.vitrinePubCidade=id||'';
  state.vitrineFiltros.bairro='';
  state.vitrinePubLimite=VITRINE_PAGINA;
  gravarFiltrosNaUrl(true);render();
  if(typeof window!=='undefined'&&window.scrollTo) window.scrollTo({top:0,behavior:'smooth'});
}
function voltarVitrineCidades(){
  state.vitrinePubCidade='';
  gravarFiltrosNaUrl(true);render();
}
function setVitrinePubFinalidade(f){
  state.vitrinePubFinalidade=(f==='vender')?'vender':'alugar';
  /* A faixa de preço de aluguel não faz sentido em venda, e vice-versa. */
  state.vitrineFiltros.faixa='';
  state.vitrinePubLimite=VITRINE_PAGINA;
  gravarFiltrosNaUrl();render();
}
/* Barra fixa da cidade escolhida + as duas abas. */
function renderVitrineBarraCidade(dados){
  const cidades=dados.cidades||[];
  const atual=cidades.find(function(c){return String(c.id)===String(state.vitrinePubCidade);});
  const vender=state.vitrinePubFinalidade==='vender';
  const contaAlugar=atual?(Number(atual.totalAlugar)||0):(dados.imoveis||[]).filter(vitrineServeAlugar).length;
  const contaVender=atual?(Number(atual.totalVender)||0):(dados.imoveis||[]).filter(vitrineServeVender).length;
  return '<div class="vitrine-cidade-barra">'+
    (cidades.length
      ? '<button class="vitrine-voltar" onclick="voltarVitrineCidades()">'+
        '<span aria-hidden="true">‹</span> Trocar cidade</button>'
      : '')+
    (atual?'<strong class="vitrine-cidade-atual">'+esc(atual.nome)+' <small>'+esc(atual.uf)+'</small></strong>':'')+
    '<div class="vitrine-finalidade" role="group" aria-label="O que você procura">'+
      '<button class="'+(vender?'':'on')+'" aria-pressed="'+(!vender)+'" onclick="setVitrinePubFinalidade(\'alugar\')">'+
        'Alugar <i>'+contaAlugar+'</i></button>'+
      '<button class="'+(vender?'on':'')+'" aria-pressed="'+vender+'" onclick="setVitrinePubFinalidade(\'vender\')">'+
        'Comprar <i>'+contaVender+'</i></button>'+
    '</div></div>';
}

function renderVitrineTopoPublico(perfil,dados){
  const total=(dados.imoveis||[]).length;
  return '<header class="vitrine-pub-top"><div class="vitrine-pub-top-in">'+logoSvg()+
    /* Neutro: o mesmo site atende quem aluga e quem compra. */
    '<div><span class="eyebrow">IMÓVEIS E TERRENOS</span>'+
    '<h1>'+esc(perfil.nome||'Imóveis disponíveis')+'</h1></div>'+
    '<span class="vitrine-pub-count">'+total+' imóve'+(total===1?'l':'is')+' disponíve'+(total===1?'l':'is')+'</span>'+
    '</div></header>';
}

/* As faixas acompanham a aba: aluguel é conta de centenas, venda é de
   dezenas de milhares. Uma faixa só serviria mal às duas — era o que
   jogava todo imóvel à venda no mesmo balde "acima de R$ 2.000". */
function vitrineFaixasPreco(){
  if(state.vitrinePubFinalidade==='vender'){
    return [['','Qualquer valor'],
      ['0-50000','Até R$ 50 mil'],
      ['50000-100000','R$ 50 mil a 100 mil'],
      ['100000-200000','R$ 100 mil a 200 mil'],
      ['200000-99999999','Acima de R$ 200 mil']];
  }
  return [['','Qualquer preço'],
    ['0-800','Até R$ 800'],
    ['800-1200','R$ 800 a 1.200'],
    ['1200-2000','R$ 1.200 a 2.000'],
    ['2000-999999','Acima de R$ 2.000']];
}
function renderVitrineFiltros(dados){
  const f=state.vitrineFiltros;
  const bairros=[...new Set((dados.imoveis||[]).map(function(i){return i.bairro;}).filter(Boolean))].sort();
  const extras=[['garagem','🚗 Garagem'],['mobiliado','🛋 Mobiliado'],['pet','🐾 Aceita pet'],
    ['quintal','🌳 Quintal'],['semFiador','📄 Sem fiador']];
  return '<div class="vitrine-filtros"><div class="vitrine-filtros-in">'+
    '<label class="vitrine-busca"><span aria-hidden="true">⌕</span>'+
      '<input value="'+esc(f.busca)+'" placeholder="Bairro, rua, código do imóvel…" '+
      'oninput="setVitrineFiltro(\'busca\',this.value)"></label>'+
    '<select class="vitrine-sel" onchange="setVitrineFiltro(\'tipo\',this.value)">'+
      '<option value="">Todos os tipos</option>'+VITRINE_TIPOS.map(function(t){
        return '<option value="'+t[0]+'"'+(f.tipo===t[0]?' selected':'')+'>'+t[1]+'</option>';}).join('')+'</select>'+
    /* Terreno não tem quarto: o filtro some quando é o tipo escolhido. */
    (f.tipo==='terreno'?'':
      '<select class="vitrine-sel" onchange="setVitrineFiltro(\'quartos\',this.value)">'+
      '<option value="0">Quartos</option>'+[1,2,3,4].map(function(n){
        return '<option value="'+n+'"'+(f.quartos===n?' selected':'')+'>'+n+'+</option>';}).join('')+'</select>')+
    '<select class="vitrine-sel" onchange="setVitrineFiltro(\'faixa\',this.value)">'+
      vitrineFaixasPreco().map(function(o){
        return '<option value="'+o[0]+'"'+(f.faixa===o[0]?' selected':'')+'>'+o[1]+'</option>';}).join('')+'</select>'+
    '<select class="vitrine-sel" onchange="setVitrineFiltro(\'bairro\',this.value)">'+
      '<option value="">Todos os bairros</option>'+bairros.map(function(b){
        return '<option'+(f.bairro===b?' selected':'')+'>'+esc(b)+'</option>';}).join('')+'</select>'+
    '<select class="vitrine-sel" onchange="setVitrineFiltro(\'ordem\',this.value)">'+
      [['destaque','Destaques primeiro'],['novos','Mais recentes'],['menor','Menor preço'],['maior','Maior preço']]
      .map(function(o){return '<option value="'+o[0]+'"'+(f.ordem===o[0]?' selected':'')+'>'+o[1]+'</option>';}).join('')+'</select>'+
    '</div><div class="vitrine-chips">'+extras.map(function(x){
      return '<button class="vitrine-chip'+(f.extras.includes(x[0])?' on':'')+'" onclick="toggleVitrineExtra(\''+x[0]+'\')">'+x[1]+'</button>';
    }).join('')+'</div></div>';
}

function renderVitrineGrid(){
  const lista=vitrineImoveisFiltrados();
  const limite=Number(state.vitrinePubLimite)||VITRINE_PAGINA;
  const visiveis=lista.slice(0,limite);
  const faltam=lista.length-visiveis.length;
  return '<main class="vitrine-pub-main">'+
    '<div class="vitrine-result"><b>'+lista.length+' imóve'+(lista.length===1?'l':'is')+'</b></div>'+
    (lista.length?'<div class="vitrine-grid">'+visiveis.map(renderVitrineCard).join('')+'</div>'+
       /* A lista inteira de uma vez custava uma foto de 1920 px por
          cartão. No 4G do interior isso é a diferença entre a pessoa
          esperar e a pessoa desistir. */
       (faltam>0?'<div class="vitrine-mais"><button class="btn btn-primary" onclick="verMaisVitrine()">'+
         'Ver mais '+Math.min(faltam,VITRINE_PAGINA)+' de '+faltam+'</button></div>':'')
     :'<div class="vitrine-pub-empty"><h2>Nenhum imóvel com esses filtros</h2>'+
       '<p>Tente ampliar a faixa de preço ou trocar o bairro.</p>'+
       '<button class="btn btn-primary" onclick="limparVitrineFiltros()">Limpar filtros</button></div>')+
    '</main>';
}
function verMaisVitrine(){
  state.vitrinePubLimite=(Number(state.vitrinePubLimite)||VITRINE_PAGINA)+VITRINE_PAGINA;
  render();
}

function renderVitrineCard(i){
  /* Miniatura quando existe; a foto grande só é baixada no detalhe. */
  const foto=(i.thumbUrls&&i.thumbUrls[0])||(i.fotoUrls&&i.fotoUrls[0])||'';
  const total=vitrineTotalMes(i);
  const dupla=vitrineServeAlugar(i)&&vitrineServeVender(i);
  const selo=dupla?'ALUGAR OU COMPRAR':(vitrineServeVender(i)?'À VENDA':'PARA ALUGAR');
  /* Botão, não <article onclick>: o cartão precisa ser alcançável por
     Tab e acionável pelo Enter, como qualquer outro controle. */
  return '<button type="button" class="vitrine-card" onclick="abrirVitrineDetalhe(\''+i.id+'\')">'+
    '<div class="vitrine-card-foto">'+
      (foto?'<img src="'+esc(foto)+'" alt="Foto de '+esc(i.titulo)+'" loading="lazy">'
           :'<div class="vitrine-sem-foto">'+houseIconSvg()+'</div>')+
      /* A grade mistura aluguel e venda. Sem dizer qual é qual na foto,
         quem procura casa para alugar abre anúncio de venda e vice-versa. */
      '<span class="vitrine-selo'+(dupla?' dois':'')+'">'+esc(selo)+'</span>'+
      (i.destaque?'<span class="vitrine-badge">★ DESTAQUE</span>':'')+
      ((i.fotoUrls||[]).length>1?'<span class="vitrine-fotos-n">▣ '+i.fotoUrls.length+' fotos</span>':'')+
    '</div>'+
    '<div class="vitrine-card-body">'+
      /* O preço vem primeiro: é o que decide se a pessoa continua lendo. */
      (state.vitrinePubFinalidade==='vender'
        ? '<div class="vitrine-preco">'+fmtMoney(i.precoVenda)+' <small>à vista</small></div>'
        : '<div class="vitrine-preco">'+fmtMoney(i.aluguel)+' <small>/ mês</small>'+
          (total!==i.aluguel?'<span class="vitrine-total">'+fmtMoney(total)+' com condomínio e IPTU</span>':'')+'</div>')+
      '<h3>'+esc(i.titulo)+'</h3>'+
      '<p class="vitrine-endereco"><span>'+
        esc([i.logradouro,i.bairro].filter(Boolean).join(' · ')||'Consulte a localização')+'</span>'+
        '<span class="vitrine-code">#'+esc(i.codigo)+'</span></p>'+
      /* Terreno não tem quarto nem banheiro: mostra o que existe nele. */
      (vitrineEhTerreno(i.tipo)
        ? '<div class="vitrine-specs">'+(i.areaM2?'<span><b>'+i.areaM2+'</b> m²</span>':'')+
            ((i.frenteM&&i.fundoM)?'<span><b>'+i.frenteM+'×'+i.fundoM+'</b> m</span>':'')+
            (i.murado?'<span>Murado</span>':'')+(i.esquina?'<span>Esquina</span>':'')+'</div>'
        : '<div class="vitrine-specs"><span><b>'+i.quartos+'</b> quartos</span>'+
          '<span><b>'+i.banheiros+'</b> banh.</span>'+
          '<span><b>'+(i.vagas||'—')+'</b> vaga'+(Number(i.vagas)===1?'':'s')+'</span>'+
          (i.areaM2?'<span><b>'+i.areaM2+'</b> m²</span>':'')+'</div>')+
    '</div></button>';
}

function vitrineWhatsappUrl(perfil,i){
  let tel=String((perfil&&perfil.contato)||'').replace(/\D/g,'');
  if(!tel)return '';
  if(tel.length<=11)tel='55'+tel;
  /* O código vai na mensagem: com 20 conversas por dia, você sabe
     na hora de qual imóvel a pessoa está falando. */
  const venda=state.vitrinePubFinalidade==='vender'&&Number(i.precoVenda)>0;
  const valor=venda?(fmtMoney(i.precoVenda)):(fmtMoney(i.aluguel)+'/mês');
  const msg='Olá! Vi o imóvel #'+i.codigo+' — '+i.titulo+' ('+valor+') no seu site e tenho interesse'+
    (venda?' em comprar.':' em alugar.');
  return 'https://wa.me/'+tel+'?text='+encodeURIComponent(msg);
}
function abrirVitrineWhatsapp(id){
  const dados=state.vitrinePublic||{};
  const i=(dados.imoveis||[]).find(function(x){return x.id===id;});
  if(!i)return;
  const url=vitrineWhatsappUrl(dados.perfil,i);
  if(!url){showToast('Contato não disponível no momento.','error');return;}
  /* Além de contar, registra o contato na lista de leads. Antes, quem
     clicava no WhatsApp virava só um número no contador e sumia — metade
     de quem procurou a corretora não aparecia em lugar nenhum. */
  db.registrarVitrineCliqueWhatsapp(id,vitrineMensagemComContexto(id,''));
  window.open(url,'_blank');
}

/* ------------------------------------------------------------
   COMPARTILHAR E GALERIA EM TELA CHEIA
   ------------------------------------------------------------ */

function vitrineLinkAtual(){
  return (typeof location!=='undefined')?location.href:'';
}
async function compartilharVitrineImovel(id){
  const dados=state.vitrinePublic||{};
  const i=(dados.imoveis||[]).find(function(x){return String(x.id)===String(id);});
  const url=vitrineLinkAtual();
  const titulo=i?(i.titulo+' — '+((state.vitrinePubFinalidade==='vender'&&Number(i.precoVenda)>0)
    ?fmtMoney(i.precoVenda):fmtMoney(i.aluguel)+'/mês')):'Imóvel';
  /* No celular abre a folha nativa (WhatsApp, Instagram, e-mail). No
     computador não existe folha nativa: cai em copiar o link, que é o que
     a pessoa faria de qualquer jeito. */
  if(typeof navigator!=='undefined'&&navigator.share){
    try{ await navigator.share({title:titulo,text:titulo,url:url}); return; }
    catch(e){ if(e&&e.name==='AbortError')return; }
  }
  copyTextValue(url,'Link copiado. É só colar no WhatsApp.');
}

function vitrineFotosDoDetalhe(){
  const dados=state.vitrinePublic||{};
  const i=(dados.imoveis||[]).find(function(x){return String(x.id)===String(state.vitrineDetalheId);});
  return (i&&i.fotoUrls)||[];
}
function abrirVitrineLightbox(indice){
  const fotos=vitrineFotosDoDetalhe();
  if(!fotos.length)return;
  state.vitrineLightbox=Math.max(0,Math.min(Number(indice)||0,fotos.length-1));
  render();
  ligarTeclasLightbox();
}
function fecharVitrineLightbox(semRender){
  if(state.vitrineLightbox===null||state.vitrineLightbox===undefined)return;
  state.vitrineLightbox=null;
  if(!semRender)render();
}
function passarVitrineFoto(passo){
  const fotos=vitrineFotosDoDetalhe();
  if(!fotos.length||state.vitrineLightbox===null)return;
  const total=fotos.length;
  state.vitrineLightbox=((state.vitrineLightbox+passo)%total+total)%total;
  render();
}
let _vitrineTeclasLigadas=false;
function ligarTeclasLightbox(){
  if(_vitrineTeclasLigadas||typeof window==='undefined')return;
  _vitrineTeclasLigadas=true;
  window.addEventListener('keydown',function(ev){
    if(state.vitrineLightbox===null||state.vitrineLightbox===undefined)return;
    if(ev.key==='Escape'){fecharVitrineLightbox();}
    else if(ev.key==='ArrowRight'){passarVitrineFoto(1);}
    else if(ev.key==='ArrowLeft'){passarVitrineFoto(-1);}
  });
}
/* Swipe. Só conta gesto claramente horizontal: rolar a página com o dedo
   um pouco torto não pode trocar de foto. */
let _vitrineToqueX=0,_vitrineToqueY=0;
function vitrineToqueInicio(ev){
  const t=ev.changedTouches&&ev.changedTouches[0];if(!t)return;
  _vitrineToqueX=t.clientX;_vitrineToqueY=t.clientY;
}
function vitrineToqueFim(ev){
  const t=ev.changedTouches&&ev.changedTouches[0];if(!t)return;
  const dx=t.clientX-_vitrineToqueX, dy=t.clientY-_vitrineToqueY;
  if(Math.abs(dx)<40||Math.abs(dx)<Math.abs(dy))return;
  passarVitrineFoto(dx<0?1:-1);
}
function renderVitrineLightbox(){
  const n=state.vitrineLightbox;
  if(n===null||n===undefined)return '';
  const fotos=vitrineFotosDoDetalhe();
  if(!fotos.length)return '';
  const legendas=vitrineLegendasDoDetalhe();
  const legenda=legendas[n]||'';
  return '<div class="vitrine-lightbox" role="dialog" aria-modal="true" aria-label="Fotos do imóvel" '+
    'ontouchstart="vitrineToqueInicio(event)" ontouchend="vitrineToqueFim(event)">'+
    '<button class="vlb-fechar" onclick="fecharVitrineLightbox()" aria-label="Fechar">✕</button>'+
    (fotos.length>1?'<button class="vlb-nav vlb-ant" onclick="passarVitrineFoto(-1)" aria-label="Foto anterior">‹</button>':'')+
    '<figure class="vlb-palco"><img src="'+esc(fotos[n])+'" alt="Foto '+(n+1)+' de '+fotos.length+'">'+
      (legenda?'<figcaption>'+esc(legenda)+'</figcaption>':'')+'</figure>'+
    (fotos.length>1?'<button class="vlb-nav vlb-prox" onclick="passarVitrineFoto(1)" aria-label="Próxima foto">›</button>':'')+
    '<div class="vlb-conta">'+(n+1)+' / '+fotos.length+'</div></div>';
}
function vitrineLegendasDoDetalhe(){
  const dados=state.vitrinePublic||{};
  const i=(dados.imoveis||[]).find(function(x){return String(x.id)===String(state.vitrineDetalheId);});
  return (i&&Array.isArray(i.legendas))?i.legendas:[];
}

function renderVitrineDetalhe(i,perfil){
  const total=vitrineTotalMes(i);
  const fotos=i.fotoUrls||[];
  const wa=vitrineWhatsappUrl(perfil,i);
  const endereco=[i.logradouro,i.numero].filter(Boolean).join(', ');
  return '<div class="vitrine-detalhe">'+
    '<div class="vitrine-detalhe-topo">'+
      '<button class="vitrine-voltar" onclick="fecharVitrineDetalhe()">← Voltar para a lista</button>'+
      /* Quem está no celular vendo o anúncio quer mandar para o marido,
         para o pai, para o grupo. Antes não havia por onde. */
      '<button class="vitrine-share" onclick="compartilharVitrineImovel(\''+i.id+'\')">'+
        '<span aria-hidden="true">↗</span> Compartilhar</button>'+
    '</div>'+

    /* A galeria abre em tela cheia. O "+N fotos" era um rótulo morto: o
       clique mais óbvio da página não fazia nada. */
    '<div class="vitrine-galeria">'+
      (fotos.length?'<button type="button" class="vg-principal" onclick="abrirVitrineLightbox(0)" '+
        'aria-label="Ver as fotos em tela cheia"><img src="'+esc(fotos[0])+'" alt="Foto de '+esc(i.titulo)+'">'+
        '<span class="vg-conta">1 / '+fotos.length+'</span></button>'+
        (fotos.length>1?'<div class="vg-lado">'+fotos.slice(1,3).map(function(f,n){
          const resto=fotos.length-3;
          return '<button type="button" onclick="abrirVitrineLightbox('+(n+1)+')" '+
            'aria-label="Ver foto '+(n+2)+' em tela cheia">'+
            '<img src="'+esc(f)+'" alt="Foto '+(n+2)+'">'+
            (n===1&&resto>0?'<span class="vg-mais">+ '+resto+' fotos</span>':'')+'</button>';
        }).join('')+'</div>':'')
       :'<div class="vg-principal vitrine-sem-foto">'+houseIconSvg()+'</div>')+
    '</div>'+

    '<div class="vitrine-detalhe-cols"><div>'+

      '<div class="vitrine-bloco">'+
        '<div class="vitrine-tags"><span class="chip chip-brass">DISPONÍVEL</span>'+
          /* Diz logo a que veio: alugar, vender ou os dois. */
          '<span class="chip chip-manut">'+esc(
            (vitrineServeAlugar(i)&&vitrineServeVender(i))?'ALUGAR OU COMPRAR'
              :vitrineServeVender(i)?'À VENDA':'PARA ALUGAR')+'</span>'+
          '<span class="vitrine-code">#'+esc(i.codigo)+'</span>'+
          '<span class="chip chip-slate">'+esc(vitrineTipoLabel(i.tipo).toUpperCase())+'</span>'+
          (i.destaque?'<span class="chip chip-warn">★ DESTAQUE</span>':'')+'</div>'+
        '<h2>'+esc(i.titulo)+'</h2>'+
        '<p class="vitrine-sub">'+esc([endereco,i.bairro,i.cidade].filter(Boolean).join(' · '))+'</p></div>'+

      /* Terreno não tem cômodo: mostra o que existe num lote. */
      (vitrineEhTerreno(i.tipo)
        ? '<div class="vitrine-bloco"><h2>O que o terreno tem</h2>'+
          '<div class="vitrine-feats">'+
            (i.areaM2?vitrineFeat('📐',i.areaM2,'m² de área'):'')+
            ((i.frenteM&&i.fundoM)?vitrineFeat('📏',i.frenteM+'×'+i.fundoM,'metros'):'')+
            (i.frenteM&&!i.fundoM?vitrineFeat('📏',i.frenteM,'m de frente'):'')+
            (i.topografia?vitrineFeat('⛰',vitrineTopografiaLabel(i.topografia),'topografia'):'')+
            vitrineFeat('🧱',i.murado?'Sim':'Não','murado')+
            vitrineFeat('📍',i.esquina?'Sim':'Não','esquina')+
          '</div></div>'
        : '<div class="vitrine-bloco"><h2>O que o imóvel tem</h2>'+
          '<div class="vitrine-feats">'+
            vitrineFeat('🛏',i.quartos,'quartos')+vitrineFeat('🛁',i.banheiros,'banheiros')+
            vitrineFeat('🚗',i.vagas||'—','vagas')+(i.areaM2?vitrineFeat('📐',i.areaM2,'m² úteis'):'')+
            vitrineFeat('🛋',i.mobiliado?'Sim':'Não','mobiliado')+
            vitrineFeat('🐾',i.aceitaPet?'Sim':'Não','aceita pet')+
            vitrineFeat('🌳',i.quintal?'Sim':'Não','quintal')+
            vitrineFeat('🧺',i.areaServico?'Sim':'Não','área de serviço')+
          '</div></div>')+

      /* O custo mensal só existe para quem aluga. Num anúncio só de
         venda, este bloco mostrava R$ 0,00 em tudo. */
      (vitrineServeAlugar(i)
        ? '<div class="vitrine-bloco"><h2>Quanto custa por mês</h2>'+
          '<p class="vitrine-sub">Estimativa completa — a pergunta que mais aparece no WhatsApp, já respondida.</p>'+
          '<div class="vitrine-custo"><span>Aluguel</span><b>'+fmtMoney(i.aluguel)+'</b></div>'+
          '<div class="vitrine-custo"><span>Condomínio</span><b>'+(Number(i.condominio)?fmtMoney(i.condominio):'não há')+'</b></div>'+
          '<div class="vitrine-custo"><span>IPTU</span><b>'+(Number(i.iptu)?fmtMoney(i.iptu):'não há')+'</b></div>'+
          '<div class="vitrine-custo-total"><span>Total estimado por mês</span><b>'+fmtMoney(total)+'</b></div></div>'
        : '')+

      (i.descricao?'<div class="vitrine-bloco"><h2>Sobre o imóvel</h2>'+
        '<p class="vitrine-texto">'+esc(i.descricao)+'</p></div>':'')+
      renderVitrineParecidos(i)+

      ((i.latitude&&i.longitude)?'<div class="vitrine-bloco"><h2>Onde fica</h2>'+
        '<p class="vitrine-sub">'+esc([endereco,i.bairro].filter(Boolean).join(' · '))+'</p>'+
        '<div id="vitrineMapa"></div></div>':'')+

      ((i.pontosInteresse||[]).length?'<div class="vitrine-bloco"><h2>O que tem por perto</h2>'+
        '<div class="vitrine-poi">'+(i.pontosInteresse||[]).map(function(p){
          return '<div class="vitrine-poi-item"><i>'+esc(p.icone||'📍')+'</i><div>'+
            '<b>'+esc(p.nome||'')+'</b><span>'+esc(p.distancia||'')+'</span></div></div>';
        }).join('')+'</div></div>':'')+

      /* Garantia e contrato mínimo são regras de locação: não aparecem
         num anúncio que é só de venda. */
      (vitrineServeAlugar(i)
        ? '<div class="vitrine-bloco"><h2>Regras da locação</h2>'+
          '<div class="vitrine-regra"><i>📄</i><span>Garantia: <b>'+esc(i.caucao||(i.exigeFiador?'fiador':'a combinar'))+'</b></span></div>'+
          '<div class="vitrine-regra"><i>📅</i><span>Contrato mínimo: <b>'+Number(i.contratoMinimoMeses||12)+' meses</b></span></div>'+
          (vitrineEhTerreno(i.tipo)?''
            :'<div class="vitrine-regra"><i>🐾</i><span>Animais: <b>'+(i.aceitaPet?'permitidos':'não permitidos')+'</b></span></div>')+
        '</div>'
        : '')+

    '</div><div><div class="vitrine-sticky"><div class="vitrine-contato">'+
      '<div class="vitrine-contato-topo">'+renderVitrinePrecoCta(i,total)+'</div>'+
      '<div class="vitrine-contato-corpo">'+
        (wa?'<button class="btn btn-wa btn-block" onclick="abrirVitrineWhatsapp(\''+i.id+'\')">💬 Falar no WhatsApp</button>':'')+
        '<div class="vitrine-ou">OU DEIXE SEU CONTATO</div>'+
        '<label class="field"><span>Seu nome</span><input id="vit_lead_nome" placeholder="Como podemos te chamar"></label>'+
        '<label class="field"><span>WhatsApp</span><input id="vit_lead_tel" placeholder="(00) 0 0000-0000"></label>'+
        '<label class="field"><span>Mensagem (opcional)</span>'+
          '<textarea id="vit_lead_msg" rows="3" placeholder="Quando você gostaria de visitar?"></textarea></label>'+
        '<label class="vitrine-consent"><input type="checkbox" id="vit_lead_ok">'+
          '<span>Autorizo o contato sobre este imóvel. Meus dados serão usados só para isso.</span></label>'+
        '<button class="btn btn-primary btn-block" id="vit_lead_btn" onclick="enviarVitrineLead(\''+i.id+'\')">Quero mais informações</button>'+
        '<div class="vitrine-rodape-anuncio">Anúncio #'+esc(i.codigo)+'</div>'+
      '</div></div></div></div></div>'+
    /* No celular a coluna de contato fica no fim de uma página longa.
       Esta barra põe o preço e o WhatsApp onde o polegar já está. */
    renderVitrineBarraMovel(i,total,wa)+
    '</div>';
}
function renderVitrineBarraMovel(i,total,wa){
  const venda=state.vitrinePubFinalidade==='vender'&&Number(i.precoVenda)>0;
  const valor=venda?fmtMoney(i.precoVenda):fmtMoney(i.aluguel);
  const nota=venda?'à vista'
    :(total!==Number(i.aluguel)?fmtMoney(total)+' com taxas':'por mês');
  return '<div class="vitrine-barra-movel">'+
    '<div class="vbm-preco">'+valor+'<small>'+esc(nota)+'</small></div>'+
    (wa
      ? '<button class="btn btn-wa" onclick="abrirVitrineWhatsapp(\''+i.id+'\')">💬 WhatsApp</button>'
      : '<button class="btn btn-primary" onclick="document.getElementById(\'vit_lead_nome\').scrollIntoView({behavior:\'smooth\',block:\'center\'})">Tenho interesse</button>')+
  '</div>';
}
function vitrineFeat(ico,val,label){
  return '<div class="vitrine-feat"><i>'+ico+'</i><div><b>'+esc(String(val))+'</b><span>'+esc(label)+'</span></div></div>';
}
/* Imóveis parecidos: mesma cidade e mesma finalidade, priorizando o
   mesmo tipo e o preço mais próximo. Sem isto, cada anúncio é um beco
   sem saída — quem não gostou daquele fecha a página. */
function vitrineParecidos(i,limite){
  const dados=state.vitrinePublic||{};
  const vender=state.vitrinePubFinalidade==='vender';
  const preco=function(x){return vender?(Number(x.precoVenda)||0):(Number(x.aluguel)||0);};
  const base=preco(i);
  return (dados.imoveis||[])
    .filter(function(x){
      if(String(x.id)===String(i.id)) return false;
      if(String(x.cidadeId||'')!==String(i.cidadeId||'')) return false;
      return vender?vitrineServeVender(x):vitrineServeAlugar(x);
    })
    .sort(function(a,b){
      /* mesmo tipo primeiro, depois o preço mais parecido */
      const ta=(a.tipo===i.tipo)?0:1, tb=(b.tipo===i.tipo)?0:1;
      if(ta!==tb) return ta-tb;
      return Math.abs(preco(a)-base)-Math.abs(preco(b)-base);
    })
    .slice(0,limite||3);
}
function renderVitrineParecidos(i){
  const lista=vitrineParecidos(i,3);
  if(!lista.length) return '';
  const vender=state.vitrinePubFinalidade==='vender';
  return '<div class="vitrine-bloco vitrine-parecidos"><h2>Parecidos nesta cidade</h2>'+
    '<div class="vitrine-parecidos-lista">'+lista.map(function(x){
      const foto=(x.fotoUrls&&x.fotoUrls[0])||'';
      const valor=vender?fmtMoney(x.precoVenda):(fmtMoney(x.aluguel)+' / mês');
      return '<button type="button" class="vitrine-parecido" onclick="abrirVitrineDetalhe(\''+esc(x.id)+'\')">'+
        (foto?'<img src="'+esc(foto)+'" alt="" loading="lazy">':'<span class="vitrine-parecido-sf" aria-hidden="true"></span>')+
        '<span class="vitrine-parecido-txt"><strong>'+esc(x.titulo)+'</strong>'+
          '<small>'+esc([x.bairro,vitrineTipoLabel(x.tipo)].filter(Boolean).join(' · '))+'</small>'+
          '<b>'+valor+'</b></span></button>';
    }).join('')+'</div></div>';
}
function vitrineTopografiaLabel(v){
  const f=VITRINE_TOPOGRAFIAS.find(function(x){return x[0]===v;});
  return f?f[1]:'Não informada';
}
/* O preço em destaque no topo do contato. Um imóvel que serve aos dois
   fins mostra os dois valores: esconder um deles obrigaria a pessoa a
   perguntar no WhatsApp justamente o que o anúncio deveria responder. */
function renderVitrinePrecoCta(i,total){
  const aluga=vitrineServeAlugar(i), vende=vitrineServeVender(i)&&Number(i.precoVenda)>0;
  const blocoAluguel='<span class="eyebrow">VALOR DO ALUGUEL</span>'+
    '<div class="vitrine-preco-grande">'+fmtMoney(i.aluguel)+' <small>/ mês</small></div>'+
    (total!==Number(i.aluguel)?'<div class="vitrine-total-topo">'+fmtMoney(total)+' com condomínio e IPTU</div>':'');
  const blocoVenda='<span class="eyebrow">VALOR DE VENDA</span>'+
    '<div class="vitrine-preco-grande">'+fmtMoney(i.precoVenda)+' <small>à vista</small></div>';
  if(aluga&&vende){
    /* Mostra primeiro o da aba em que a pessoa está. */
    const vendaPrimeiro=state.vitrinePubFinalidade==='vender';
    return '<div class="vitrine-preco-duplo">'+
      '<div class="vitrine-preco-parte'+(vendaPrimeiro?'':' is-principal')+'">'+
        (vendaPrimeiro?blocoVenda:blocoAluguel)+'</div>'+
      '<div class="vitrine-preco-parte'+(vendaPrimeiro?' is-principal':'')+'">'+
        (vendaPrimeiro?blocoAluguel:blocoVenda)+'</div>'+
    '</div>';
  }
  if(vende&&!aluga) return blocoVenda;
  return blocoAluguel;
}

/* O contato chega dizendo de onde veio. Sem isto, o lead cai na lista
   sem informar se a pessoa queria alugar ou comprar — e é a primeira
   coisa que você precisa saber antes de retornar a ligação. */
function vitrineMensagemComContexto(id,mensagem){
  const dados=state.vitrinePublic||{};
  const i=(dados.imoveis||[]).find(function(x){return String(x.id)===String(id);});
  const partes=[];
  partes.push(state.vitrinePubFinalidade==='vender'?'Quer comprar':'Quer alugar');
  if(i&&i.cidade) partes.push(i.cidade);
  if(i&&i.codigo) partes.push('#'+i.codigo);
  const cabecalho='['+partes.join(' · ')+']';
  const texto=String(mensagem||'').trim();
  return texto?(cabecalho+' '+texto):cabecalho;
}

async function enviarVitrineLead(id){
  const v=function(x){const e=document.getElementById(x);return e?String(e.value||'').trim():'';};
  const ok=(document.getElementById('vit_lead_ok')||{}).checked;
  const btn=document.getElementById('vit_lead_btn');
  if(!ok){showToast('Marque a autorização de contato para continuar.','error');return;}
  if(v('vit_lead_nome').length<2){showToast('Informe seu nome.','error');return;}
  if(v('vit_lead_tel').replace(/\D/g,'').length<10){showToast('Informe um telefone válido com DDD.','error');return;}
  if(btn){btn.disabled=true;btn.textContent='Enviando…';}
  try{
    await db.registrarVitrineLead({imovelId:id,nome:v('vit_lead_nome'),telefone:v('vit_lead_tel'),
      mensagem:vitrineMensagemComContexto(id,v('vit_lead_msg')),consentimento:true});
    if(btn){btn.textContent='Recebemos seu contato ✓';}
    showToast('Contato enviado. Retornaremos em breve.','success');
  }catch(e){
    console.error(e);
    showToast((e&&e.message)||'Não foi possível enviar. Tente novamente.','error');
    if(btn){btn.disabled=false;btn.textContent='Quero mais informações';}
  }
}

/* Mapa: pino no endereço exato (decisão 3). O Leaflet é carregado
   junto com o app, não de CDN, para não afrouxar a política de
   segurança do _headers. Se ele não estiver presente, a página
   continua funcionando sem o mapa. */
function desenharMapaVitrine(id){
  const el=document.getElementById('vitrineMapa');
  if(!el)return;
  const dados=state.vitrinePublic||{};
  const i=(dados.imoveis||[]).find(function(x){return x.id===id;});
  if(!i||!i.latitude||!i.longitude)return;
  if(typeof L==='undefined'){
    el.innerHTML='<div class="vitrine-mapa-off">Mapa indisponível no momento.</div>';
    return;
  }
  if(window._vitrineMapa){try{window._vitrineMapa.remove();}catch(e){}}
  const mapa=L.map('vitrineMapa',{scrollWheelZoom:false}).setView([i.latitude,i.longitude],16);
  window._vitrineMapa=mapa;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,attribution:'© OpenStreetMap'
  }).addTo(mapa);
  L.marker([i.latitude,i.longitude]).addTo(mapa)
    .bindPopup('<b>'+esc(i.titulo)+'</b><br>'+esc([i.logradouro,i.numero].filter(Boolean).join(', ')))
    .openPopup();
  setTimeout(function(){mapa.invalidateSize();},120);
}

/* ============================================================
   FOTOS DO ANÚNCIO
   Reaproveita compressImage() e safePhotoSrc() do photos.js.
   Máximo de 10 fotos: a vitrine vende pela imagem, então cabe
   mais do que as 6 do cadastro interno de casas.
   ============================================================ */
const VITRINE_MAX_FOTOS=10;

async function ensureVitrineFotos(imovelId){
  if(state.vitrineFotos[imovelId]!==undefined) return;
  state.vitrineFotos[imovelId]=[];
  try{
    state.vitrineFotos[imovelId]=await db.getVitrineFotos(imovelId);
  }catch(e){
    console.error('Erro ao carregar fotos do anúncio',e);
  }
  const painel=document.getElementById('vitrineFotos');
  if(painel) painel.innerHTML=renderVitrineFotosPainel(imovelId);
}

function triggerVitrineFotoUpload(imovelId){
  const input=document.getElementById('vitrineFotoInput');
  if(!input)return;
  input.dataset.imovelId=imovelId;
  input.click();
}

async function handleVitrineFotoFiles(imovelId,fileList){
  const atuais=state.vitrineFotos[imovelId]||[];
  if(atuais.length>=VITRINE_MAX_FOTOS){
    showToast('Máximo de '+VITRINE_MAX_FOTOS+' fotos por anúncio.','error');return;
  }
  const painel=document.getElementById('vitrineFotos');
  if(painel) painel.innerHTML='<div class="vitrine-fotos-carregando">Enviando fotos…</div>';
  try{
    const comprimidas=[];
    for(const f of Array.from(fileList)){
      if(atuais.length+comprimidas.length>=VITRINE_MAX_FOTOS) break;
      if(!/^image\/(jpeg|png|webp)$/i.test(f.type||'')||f.size>15*1024*1024){
        throw new Error('Formato ou tamanho de foto não permitido.');
      }
      /* Um pouco maior que as fotos internas: aqui a foto é a vitrine. */
      const blob=await compressImage(f,1920,0.82);
      /* Segunda versão, pequena, só para a grade. Se falhar, o anúncio
         entra sem miniatura — a grade cai na foto grande. */
      const thumb=await compressImage(f,640,0.72).catch(function(){return null;});
      comprimidas.push({blob:blob,thumb:thumb,
        nome:(f.name||'foto').replace(/\.[^.]+$/,'')+'.jpg',mime:'image/jpeg'});
    }
    const novas=await db.addVitrineFotos(imovelId,comprimidas,atuais.length);
    state.vitrineFotos[imovelId]=atuais.concat(novas);
    showToast(novas.length===1?'Foto adicionada.':novas.length+' fotos adicionadas.','success');
  }catch(e){
    console.error(e);
    showToast((e&&e.message)||'Erro ao enviar as fotos.','error');
  }
  const alvo=document.getElementById('vitrineFotos');
  if(alvo) alvo.innerHTML=renderVitrineFotosPainel(imovelId);
}

async function excluirVitrineFoto(imovelId,fotoId){
  try{
    await db.deleteVitrineFoto(fotoId);
    state.vitrineFotos[imovelId]=(state.vitrineFotos[imovelId]||[])
      .filter(function(f){return f.id!==fotoId;});
    const painel=document.getElementById('vitrineFotos');
    if(painel) painel.innerHTML=renderVitrineFotosPainel(imovelId);
    showToast('Foto removida.','success');
  }catch(e){console.error(e);showToast('Não foi possível remover a foto.','error');}
}

async function salvarLegendaVitrine(imovelId,fotoId,texto){
  try{
    await db.setVitrineFotoLegenda(fotoId,texto);
    const f=(state.vitrineFotos[imovelId]||[]).find(function(x){return x.id===fotoId;});
    if(f) f.legenda=String(texto||'').slice(0,140);
    showToast('Legenda salva.','success');
  }catch(e){console.error(e);showToast('Não foi possível salvar a legenda.','error');}
}

/* A primeira foto é a capa: é ela que aparece no card e é ela que vai
   na prévia do link no WhatsApp. Por isso "usar como capa" existe. */
async function definirCapaVitrine(imovelId,fotoId){
  const fotos=state.vitrineFotos[imovelId]||[];
  const escolhida=fotos.find(function(f){return f.id===fotoId;});
  if(!escolhida)return;
  const resto=fotos.filter(function(f){return f.id!==fotoId;});
  const nova=[escolhida].concat(resto);
  try{
    await db.reorderVitrineFotos(nova.map(function(f,i){return {id:f.id,ordem:i};}));
    nova.forEach(function(f,i){f.ordem=i;});
    state.vitrineFotos[imovelId]=nova;
    const painel=document.getElementById('vitrineFotos');
    if(painel) painel.innerHTML=renderVitrineFotosPainel(imovelId);
    showToast('Capa definida.','success');
  }catch(e){console.error(e);showToast('Não foi possível reordenar.','error');}
}

function renderVitrineFotosPainel(imovelId){
  const fotos=state.vitrineFotos[imovelId];
  if(fotos===undefined) return '<div class="vitrine-fotos-carregando">Carregando fotos…</div>';
  const validas=fotos.filter(function(f){return !!safePhotoSrc(f.url);});
  return '<div class="vitrine-fotos-topo">'+
      '<span>'+validas.length+' de '+VITRINE_MAX_FOTOS+' fotos</span>'+
      '<button type="button" class="btn btn-primary btn-sm"'+
        (validas.length>=VITRINE_MAX_FOTOS?' disabled':'')+
        ' onclick="triggerVitrineFotoUpload(\''+imovelId+'\')">+ Adicionar fotos</button>'+
    '</div>'+
    (validas.length
      ? '<div class="vitrine-fotos-grid">'+validas.map(function(f,i){
          return '<div class="vitrine-foto'+(i===0?' capa':'')+'">'+
            '<img src="'+esc(safePhotoSrc(f.url))+'" alt="Foto do anúncio">'+
            (i===0?'<span class="vitrine-foto-capa">CAPA</span>'
                  :'<button type="button" class="vitrine-foto-acao" title="Usar como capa" aria-label="Usar como capa" '+
                   'onclick="definirCapaVitrine(\''+imovelId+'\',\''+f.id+'\')">★</button>')+
            '<button type="button" class="vitrine-foto-remover" aria-label="Remover foto" '+
              'onclick="excluirVitrineFoto(\''+imovelId+'\',\''+f.id+'\')">×</button>'+
            /* Legenda: aparece na galeria em tela cheia. É onde se diz
               "sala vista da entrada" ou "quintal com poço". */
            '<input class="vitrine-foto-legenda" maxlength="140" placeholder="Legenda (opcional)" '+
              'value="'+esc(f.legenda||'')+'" '+
              'onchange="salvarLegendaVitrine(\''+imovelId+'\',\''+f.id+'\',this.value)">'+
          '</div>';
        }).join('')+'</div>'+
        '<p class="vitrine-fotos-dica">A primeira foto é a capa: é ela que aparece no card e na prévia do link.</p>'
      : '<div class="vitrine-fotos-vazio">'+photoIconSvg()+
        '<span>Nenhuma foto ainda. Anúncio sem foto quase não recebe contato.</span></div>');
}
