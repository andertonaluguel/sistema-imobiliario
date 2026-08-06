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
  ['sobrado','Sobrado'],['comercial','Comercial'],['terreno','Terreno'],
  /* Chácara é tipo próprio, não "terreno rural": ela tem casa, poço e
     pomar para descrever, e o anúncio de terreno esconde esses campos.
     Terreno segue podendo ser urbano — lote na cidade para construir. */
  ['chacara','Chácara']
];
/* ------------------------------------------------------------
   CATEGORIAS DE BUSCA

   Seis tipos são demais para escolher de primeira: quem entra no site
   sabe se quer morar, montar negócio ou comprar área — não se quer
   kitnet ou sobrado. As três categorias são a primeira pergunta; o
   filtro de tipo, na lateral, continua para quem quer afunilar.

   Agrupar na BUSCA e separar no CADASTRO: quem procura área olha
   terreno e chácara juntos, mas quem anuncia precisa dizer qual é.
   ------------------------------------------------------------ */
const VITRINE_CATEGORIAS=[
  {id:'residencial',rotulo:'Residencial',icone:'⌂',tipos:['casa','apartamento','kitnet','sobrado']},
  {id:'comercial',  rotulo:'Comercial',  icone:'▤',tipos:['comercial']},
  {id:'terreno',    rotulo:'Terreno e chácara',icone:'◱',tipos:['terreno','chacara']}
];
function vitrineTiposDaCategoria(id){
  const c=VITRINE_CATEGORIAS.find(function(x){return x.id===id;});
  return c?c.tipos:[];
}
/* Terreno não tem quarto nem banheiro: o formulário troca de campos. */
function vitrineEhTerreno(tipo){ return String(tipo||'')==='terreno'; }
const VITRINE_FINALIDADES=[
  ['alugar','Para alugar'],['vender','Para vender'],['ambos','Alugar e vender']
];
const VITRINE_TOPOGRAFIAS=[
  ['','Não informada'],['plano','Plano'],['aclive','Aclive'],
  ['declive','Declive'],['irregular','Irregular']
];
/* Estado de conservação. Lista curta de propósito: o portal grande usa
   nove opções, e nove opções para o mesmo imóvel viram nove respostas
   diferentes de quem cadastra. Estas seis dão conta. */
const VITRINE_CONSERVACOES=[
  ['','Não informado'],['na_planta','Na planta'],['novo','Novo'],
  ['semi_novo','Semi-novo'],['reformado','Reformado'],
  ['bom_estado','Bom estado'],['precisa_reforma','Precisa de reforma']
];
const VITRINE_GARANTIAS=[
  ['fiador','Fiador'],['caucao','Caução'],['seguro_fianca','Seguro-fiança'],
  ['titulo_capitalizacao','Título de capitalização'],['sem_garantia','Sem garantia']
];
const VITRINE_CUSTOS_INCLUSOS=[
  ['condominio','Condomínio'],['iptu','IPTU'],['agua','Água'],
  ['energia','Energia'],['internet','Internet']
];
const VITRINE_APTIDOES_TERRENO=[
  ['residencial','Residencial'],['comercial','Comercial'],
  ['industrial','Industrial'],['rural','Rural']
];
const VITRINE_DOCUMENTOS=[
  ['matricula','Matrícula'],['escritura','Escritura'],['habite_se','Habite-se'],
  ['iptu','IPTU'],['condominio','Condomínio regular'],
  ['financiamento','Apto a financiamento'],['onus','Livre de ônus'],
  ['inventario','Inventário concluído'],['usucapiao','Usucapião regularizado']
];
function vitrineCheckList(prefix,opcoes,selecionados){
  const atuais=new Set(Array.isArray(selecionados)?selecionados:[]);
  return '<div class="feature-check-grid">'+opcoes.map(function(o){
    return '<label><input type="checkbox" id="'+prefix+o[0]+'"'+(atuais.has(o[0])?' checked':'')+'><span>'+esc(o[1])+'</span></label>';
  }).join('')+'</div>';
}
function vitrineTriSelect(id,label,valor){
  const atual=valor==null?'':(valor?'sim':'nao');
  return '<label class="field"><span>'+esc(label)+'</span><select id="'+id+'">'+
    '<option value=""'+(atual===''?' selected':'')+'>Não informado</option>'+
    '<option value="sim"'+(atual==='sim'?' selected':'')+'>Sim</option>'+
    '<option value="nao"'+(atual==='nao'?' selected':'')+'>Não</option></select></label>';
}
function vitrineConservacaoLabel(v){
  const f=VITRINE_CONSERVACOES.find(function(x){return x[0]===v;});
  return f?f[1]:'Não informado';
}
/* Andar só existe em prédio. Numa casa o campo confunde quem cadastra. */
function vitrineTemAndar(tipo){ return ['apartamento','kitnet'].includes(String(tipo||'')); }
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
/* O provedor fica isolado em duas constantes para poder ser trocado quando
   o volume crescer, sem reescrever os dois mapas da Vitrine. O servidor
   publico do OSM so e chamado depois que o visitante pede o mapa. */
const VITRINE_MAPA_TILES='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const VITRINE_MAPA_ATRIBUICAO='&copy; OpenStreetMap contributors';
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
function setVitrineTab(tab){ state.vitrineTab=tab; render(); window.scrollTo(0,0); }
/* As áreas da Vitrine no formato que a barra lateral do app espera:
   [chave, rótulo, ação, ícone, ativa, selo]. Doze itens não cabiam em
   abas horizontais — quebravam em duas linhas. Aqui cabem, e o selo
   mostra o que está esperando resposta sem você precisar entrar. */
function vitrineNavItems(){
  const tab=state.vitrineTab||'painel';
  const v=state.vitrine||{};
  const novosLeads=(v.leads||[]).filter(function(l){return l.status==='novo';}).length;
  const novosParceiros=(v.parceiros||[]).filter(function(p){return p.status==='novo';}).length;
  const visitasAbertas=(v.visitas||[]).filter(function(x){
    return x.status==='solicitada'||x.status==='reagendada';
  }).length;
  return [
    ['painel','Painel','setVitrineTab(\'painel\')','&#9636;'],
    ['anuncios','Anúncios','setVitrineTab(\'anuncios\')','&#9638;'],
    ['cidades','Cidades','setVitrineTab(\'cidades\')','&#9873;'],
    ['anunciantes','Proprietários','setVitrineTab(\'anunciantes\')','&#9786;'],
    ['leads','Leads','setVitrineTab(\'leads\')','&#9825;',false,novosLeads||''],
    ['parceiros','Anunciar','setVitrineTab(\'parceiros\')','&#128227;',false,novosParceiros||''],
    ['crm','CRM','setVitrineTab(\'crm\')','&#8644;'],
    ['retencao','Alertas','setVitrineTab(\'retencao\')','&#128276;'],
    ['visitas','Visitas','setVitrineTab(\'visitas\')','&#128197;',false,visitasAbertas||''],
    ['qualidade','Qualidade','setVitrineTab(\'qualidade\')','&#10003;'],
    ['taxas','Taxas','setVitrineTab(\'taxas\')','R$'],
    ['divulgacao','Divulgação','setVitrineTab(\'divulgacao\')','&#9670;']
  ].map(function(it){ return [it[0],it[1],it[2],it[3],tab===it[0],it[5]||'']; });
}

/* ------------------------------------------------------------
   ÁREA INTERNA
   ------------------------------------------------------------ */
function renderVitrineView(){
  if(!state.vitrine.carregado){
    return '<div class="app-loading">'+logoSvg()+'<span>Carregando a Vitrine…</span></div>';
  }
  const tab=state.vitrineTab||'painel';
  /* O cabeçalho precisa ser FILHO DIRETO de .rental-app — o estilo dele
     usa o seletor `.rental-app > .page-header`. Envolver em um <section>
     tira o arredondamento, o respiro e o fundo. */
  return '<div class="page-header vitrine-header"><div>'+
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
     tab==='parceiros'?renderVitrineParceiros():
     tab==='crm'&&typeof renderVitrineCrm==='function'?renderVitrineCrm():
     tab==='retencao'?renderVitrineRetencao():
     tab==='visitas'?renderVitrineVisitas():
     tab==='qualidade'&&typeof renderVitrineQualidade==='function'?renderVitrineQualidade():
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
  /* O formulario e longo por natureza — sao 40+ campos. Em vez de
     encurtar (o que tiraria informacao do anuncio), ele passa a viver
     em abas: a pessoa preenche o basico e salva; o resto espera.
     Os campos sao exatamente os mesmos, so mudam de gaveta. */
  const donos=(state.owners||[]).slice().sort(function(a,b){
    return a.nome.localeCompare(b.nome,'pt-BR');
  });
  /* Anúncio novo vindo da gestão já traz o proprietário; anúncio existente
     chega pelo espelho. */
  const donoAtual=String(i.proprietarioClienteId||vitrineDonoDoAnuncio(i)||'');
  /* O catálogo inteiro fica no HTML: trocar o tipo durante o cadastro não
     pode fazer opções desaparecerem até o modal ser reaberto. A indicação
     de tipos aplicáveis continua no banco para filtros e evolução da UI. */
  const comodidades=(state.vitrine.comodidades||[]).filter(function(c){return c.ativo!==false;});
  const comodidadesPorGrupo={};
  comodidades.forEach(function(c){
    if(!comodidadesPorGrupo[c.grupo])comodidadesPorGrupo[c.grupo]=[];
    comodidadesPorGrupo[c.grupo].push([c.codigo,c.rotulo]);
  });
  const gruposRotulo={imovel:'No imóvel',condominio:'No condomínio',regiao:'Na região',
    terreno:'No terreno',acessibilidade:'Acessibilidade',sustentabilidade:'Sustentabilidade'};
  const comodidadesHtml=Object.keys(comodidadesPorGrupo).map(function(grupo){
    return '<div class="form-section-title">'+esc(gruposRotulo[grupo]||grupo)+'</div>'+
      vitrineCheckList('vit_comod_',comodidadesPorGrupo[grupo],i.comodidadeCodigos);
  }).join('');
  const docsAtuais={};
  (Array.isArray(i.documentacao)?i.documentacao:[]).forEach(function(d){docsAtuais[d.tipo]=d;});
  const documentosHtml=VITRINE_DOCUMENTOS.map(function(d){
    const atual=docsAtuais[d[0]]||{};
    return '<div class="field-row"><label class="field"><span>'+esc(d[1])+'</span><select id="vit_doc_'+d[0]+'">'+
      '<option value="nao_informado"'+((atual.estado||'nao_informado')==='nao_informado'?' selected':'')+'>Não informado</option>'+
      '<option value="sim"'+(atual.estado==='sim'?' selected':'')+'>Sim</option>'+
      '<option value="nao"'+(atual.estado==='nao'?' selected':'')+'>Não</option></select></label>'+
      '<label class="field"><span>Nota interna</span><input id="vit_doc_obs_'+d[0]+'" value="'+esc(atual.observacaoPrivada||'')+'" placeholder="Nunca aparece no site"></label></div>';
  }).join('');
  return '<nav class="vif-abas" role="tablist">'+
      VITRINE_FORM_ABAS.map(function(t,n){
        return '<button type="button" role="tab" class="'+(n===0?'on':'')+'" data-alvo="'+t[0]+'" '+
          'aria-selected="'+(n===0)+'" onclick="trocarAbaAnuncio(\''+t[0]+'\')">'+esc(t[1])+'</button>';
      }).join('')+'</nav>'+
    '<div class="vif-aba" data-aba="basico">'+
    '<div class="field-row"><label class="field"><span>Código</span>'+
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

    '</div><div class="vif-aba" data-aba="valores" hidden>'+
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

    '</div><div class="vif-aba" data-aba="imovel" hidden>'+
    '<div class="form-section-title">O imóvel</div>'+
    '<div id="vit_bloco_construido"'+(vitrineEhTerreno(i.tipo)?' hidden':'')+'>'+
      '<div class="field-row">'+
      '<label class="field"><span>Quartos</span><input id="vit_quartos" type="number" min="0" step="1" value="'+(Number(i.quartos)||0)+'"></label>'+
      /* Suíte é um quarto que já foi contado: o banco recusa suíte a mais
         que quarto, e o aviso aqui evita que a pessoa descubra isso só na
         hora de salvar. */
      '<label class="field"><span>Suítes</span><input id="vit_suites" type="number" min="0" step="1" value="'+(Number(i.suites)||0)+
        '"><small>Já contadas nos quartos.</small></label>'+
      '<label class="field"><span>Banheiros</span><input id="vit_banheiros" type="number" min="0" step="1" value="'+(Number(i.banheiros)||0)+'"></label>'+
      '<label class="field"><span>Vagas</span><input id="vit_vagas" type="number" min="0" step="1" value="'+(Number(i.vagas)||0)+'"></label></div>'+
      '<div class="field-row">'+
      '<label class="field"><span>Área útil (m²)</span><input id="vit_area" type="number" min="0" step="0.01" value="'+
        (i.areaUtilM2==null?(Number(i.areaM2)||''):i.areaUtilM2)+'" placeholder="não informada"></label>'+
      '<label class="field"><span>Área total (m²)</span><input id="vit_area_total" type="number" min="0" step="0.01" value="'+
        (i.areaTotalM2==null?'':i.areaTotalM2)+'" placeholder="opcional"></label>'+
      /* Andar só existe em prédio; numa casa o campo é ruído. Fica no
         HTML e só é escondido, como os blocos de terreno — assim trocar
         o tipo no meio do cadastro faz o campo aparecer na hora. */
      '<label class="field" id="vit_andar_wrap"'+(vitrineTemAndar(i.tipo)?'':' hidden')+'>'+
        '<span>Andar</span><input id="vit_andar" type="number" min="0" step="1" value="'+(Number(i.andar)||0)+'"></label>'+
      '<label class="field"><span>Total de andares</span><input id="vit_total_andares" type="number" min="1" max="300" step="1" value="'+
        (i.totalAndares==null?'':i.totalAndares)+'" placeholder="opcional"></label>'+
      '<label class="field"><span>Ano de construção</span><input id="vit_ano_construcao" type="number" min="1700" max="2200" step="1" value="'+
        (i.anoConstrucao==null?'':i.anoConstrucao)+'" placeholder="opcional"></label>'+
      '<label class="field"><span>Idade (anos)</span><input id="vit_idade" type="number" min="0" max="200" step="1" value="'+
        (i.idadeAnos==null?'':i.idadeAnos)+'" placeholder="opcional"></label>'+
      '<label class="field"><span>Conservação</span><select id="vit_conservacao">'+
        VITRINE_CONSERVACOES.map(function(c){
          return '<option value="'+c[0]+'"'+((i.conservacao||'')===c[0]?' selected':'')+'>'+c[1]+'</option>';
        }).join('')+'</select></label></div></div>'+
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
      '<div class="field-row">'+vitrineTriSelect('vit_pavimentacao','Rua pavimentada',i.pavimentacao)+
        vitrineTriSelect('vit_agua','Água disponível',i.aguaDisponivel)+
        vitrineTriSelect('vit_energia','Energia disponível',i.energiaDisponivel)+
        vitrineTriSelect('vit_esgoto','Esgoto disponível',i.esgotoDisponivel)+'</div>'+
      '<div class="form-section-title">Aptidão do terreno</div>'+
      vitrineCheckList('vit_aptidao_',VITRINE_APTIDOES_TERRENO,i.aptidoesTerreno)+
    '</div>'+
    '<div class="feature-check-grid house-room-checks">'+
      '<label><input id="vit_mobiliado" type="checkbox"'+(i.mobiliado?' checked':'')+'><span>Mobiliado</span></label>'+
      '<label><input id="vit_pet" type="checkbox"'+(i.aceitaPet?' checked':'')+'><span>Aceita pet</span></label>'+
      '<label><input id="vit_quintal" type="checkbox"'+(i.quintal?' checked':'')+'><span>Quintal</span></label>'+
      '<label><input id="vit_servico" type="checkbox"'+(i.areaServico?' checked':'')+'><span>Área de serviço</span></label></div>'+

    '</div><div class="vif-aba" data-aba="endereco" hidden>'+
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
    '<p class="modal-hint">A coordenada interna posiciona o imóvel. A política abaixo decide o que o visitante recebe.</p>'+
    '<div class="field-row"><label class="field"><span>Endereço público</span><select id="vit_endereco_modo">'+
      [['oculto','Oculto'],['aproximado','Aproximado'],['exato','Exato — autorizado']].map(function(m){
        const atual=i.enderecoPublicoModo||(i.id?(i.enderecoExatoPublico===false?'aproximado':'exato'):'aproximado');
        return '<option value="'+m[0]+'"'+(atual===m[0]?' selected':'')+'>'+m[1]+'</option>';
      }).join('')+'</select><small>Use “exato” somente com autorização do proprietário.</small></label>'+
      '<label class="field"><span>Latitude pública aproximada</span><input id="vit_lat_publica" value="'+(i.latitudePublica==null?'':i.latitudePublica)+'" placeholder="opcional"></label>'+
      '<label class="field"><span>Longitude pública aproximada</span><input id="vit_lng_publica" value="'+(i.longitudePublica==null?'':i.longitudePublica)+'" placeholder="opcional"></label></div>'+

    '</div><div class="vif-aba" data-aba="regras" hidden>'+
    '<div class="form-section-title">Regras</div>'+
    '<div class="field-row"><label class="field"><span>Garantia</span><input id="vit_caucao" value="'+esc(i.caucao||'')+'" placeholder="2 aluguéis / fiador"></label>'+
      '<label class="field"><span>Contrato mínimo (meses)</span><input id="vit_contrato" type="number" min="0" step="1" value="'+(Number(i.contratoMinimoMeses)||12)+'"></label>'+
      '<label class="field"><span>Disponível em</span><input id="vit_disponivel_em" type="date" value="'+esc(i.disponivelEm||'')+'"></label>'+
      '<label class="field"><span>Índice de reajuste</span><input id="vit_indice_reajuste" value="'+esc(i.indiceReajuste||'')+'" placeholder="Ex.: IPCA"></label></div>'+
    '<label class="field-check"><input type="checkbox" id="vit_fiador"'+(i.exigeFiador?' checked':'')+'><span>Exige fiador</span></label>'+
    '<details class="form-details"><summary>Condições comerciais completas</summary>'+
      '<div class="form-section-title">Garantias aceitas</div>'+vitrineCheckList('vit_garantia_',VITRINE_GARANTIAS,i.garantiasAceitas)+
      '<div class="form-section-title">Custos incluídos</div>'+vitrineCheckList('vit_custo_',VITRINE_CUSTOS_INCLUSOS,i.custosInclusos)+
      '<div class="field-row">'+vitrineTriSelect('vit_estudante','Aceita estudante',i.aceitaEstudante)+
        vitrineTriSelect('vit_pj','Aceita pessoa jurídica',i.aceitaPessoaJuridica)+
        vitrineTriSelect('vit_crianca','Aceita criança',i.aceitaCrianca)+
        vitrineTriSelect('vit_sublocacao','Permite sublocação',i.permiteSublocacao)+'</div>'+
      '<div class="field-row">'+vitrineTriSelect('vit_financiamento','Aceita financiamento',i.aceitaFinanciamento)+
        vitrineTriSelect('vit_permuta','Aceita permuta',i.aceitaPermuta)+
        '<label class="field"><span>Situação de ocupação</span><select id="vit_ocupacao">'+
          [['','Não informada'],['vago','Vago'],['ocupado_proprietario','Ocupado pelo proprietário'],['ocupado_inquilino','Ocupado por inquilino'],['em_obras','Em obras']].map(function(o){
            return '<option value="'+o[0]+'"'+((i.situacaoOcupacao||'')===o[0]?' selected':'')+'>'+o[1]+'</option>';
          }).join('')+'</select></label></div></details>'+
    (comodidadesHtml?'<details class="form-details"><summary>Comodidades estruturadas</summary>'+comodidadesHtml+'</details>':'')+
    '<details class="form-details"><summary>Documentação do imóvel</summary>'+documentosHtml+'</details>'+
    '<label class="field"><span>Observação privada do anúncio</span><textarea id="vit_obs_privada" rows="3" placeholder="Uso interno; nunca aparece no site">'+esc(i.observacaoPrivada||'')+'</textarea></label>'+
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
      '><span><strong>Destaque</strong><small>Aparece primeiro na vitrine. Cobrado à parte.</small></span></label>'+
    '</div>';
}
/* As abas do formulário de anúncio. A ordem é a de quem preenche: o
   que identifica o imóvel, quanto custa, como ele é, onde fica, o que
   vale no contrato e por último as fotos — que só existem depois de
   salvar. */
const VITRINE_FORM_ABAS=[
  ['basico','Básico'],['valores','Valores'],['imovel','O imóvel'],
  ['endereco','Endereço'],['regras','Regras'],['fotos','Fotos']
];
function trocarAbaAnuncio(alvo){
  document.querySelectorAll('.vif-aba').forEach(function(p){
    p.hidden = p.getAttribute('data-aba')!==alvo;
  });
  document.querySelectorAll('.vif-abas button').forEach(function(b){
    const on=b.getAttribute('data-alvo')===alvo;
    b.classList.toggle('on',on);
    b.setAttribute('aria-selected',on?'true':'false');
  });
  /* Volta ao topo do painel: trocar de aba com a janela rolada deixava
     a pessoa olhando para o meio da aba nova. */
  const cx=document.querySelector('.modal-box');
  if(cx)cx.scrollTop=0;
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
  /* Andar só em prédio: quem troca casa por apartamento no meio do
     cadastro vê o campo aparecer sem precisar reabrir o formulário. */
  const andarWrap=document.getElementById('vit_andar_wrap');
  if(andarWrap) andarWrap.hidden=!vitrineTemAndar(tipo);
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
  const tri=function(id){const valor=v(id);return valor===''?null:valor==='sim';};
  const marcados=function(prefix,opcoes){
    return opcoes.filter(function(o){return c(prefix+o[0]);}).map(function(o){return o[0];});
  };
  const tipo=v('vit_tipo')||'casa';
  const terreno=vitrineEhTerreno(tipo);
  /* A cidade agora vem do cadastro: guardamos o id e também o nome, que
     é o que a página pública mostra e o que o filtro antigo usava. */
  const cidadeId=v('vit_cidade_id');
  const cidadeSel=(state.vitrine.cidades||[]).find(function(x){return String(x.id)===String(cidadeId);});
  const areaInformada=v(terreno?'vit_area_terreno':'vit_area');
  const enderecoModo=v('vit_endereco_modo')||'aproximado';
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
    areaM2:Number(areaInformada)||0,
    areaUtilM2:terreno?null:(areaInformada===''?null:Number(areaInformada)),
    /* Terreno não tem cômodo nem andar: zerar aqui impede que um anúncio
       que mudou de tipo carregue os números do tipo antigo. */
    suites:terreno?0:(parseInt(v('vit_suites'),10)||0),
    andar:(terreno||!vitrineTemAndar(tipo))?0:(parseInt(v('vit_andar'),10)||0),
    totalAndares:terreno||v('vit_total_andares')===''?null:parseInt(v('vit_total_andares'),10),
    anoConstrucao:terreno||v('vit_ano_construcao')===''?null:parseInt(v('vit_ano_construcao'),10),
    idadeAnos:terreno?null:(v('vit_idade')===''?null:(parseInt(v('vit_idade'),10)||0)),
    areaTotalM2:terreno?null:(v('vit_area_total')===''?null:(Number(v('vit_area_total'))||0)),
    conservacao:terreno?'':v('vit_conservacao'),
    frenteM:terreno?(v('vit_frente')||null):null,
    fundoM:terreno?(v('vit_fundo')||null):null,
    murado:terreno&&c('vit_murado'),
    esquina:terreno&&c('vit_esquina'),
    topografia:terreno?v('vit_topografia'):'',
    pavimentacao:terreno?tri('vit_pavimentacao'):null,
    aguaDisponivel:terreno?tri('vit_agua'):null,
    energiaDisponivel:terreno?tri('vit_energia'):null,
    esgotoDisponivel:terreno?tri('vit_esgoto'):null,
    aptidoesTerreno:terreno?marcados('vit_aptidao_',VITRINE_APTIDOES_TERRENO):[],
    mobiliado:c('vit_mobiliado'),aceitaPet:c('vit_pet'),quintal:c('vit_quintal'),areaServico:c('vit_servico'),
    logradouro:v('vit_rua'),numero:v('vit_numero'),bairro:v('vit_bairro'),
    cidadeId:cidadeId||null,
    cidade:cidadeSel?cidadeSel.nome:'',
    uf:(cidadeSel?cidadeSel.uf:v('vit_uf')).toUpperCase(),
    latitude:v('vit_lat')||null,longitude:v('vit_lng')||null,
    enderecoPublicoModo:enderecoModo,
    latitudePublica:v('vit_lat_publica')||null,longitudePublica:v('vit_lng_publica')||null,
    enderecoExatoPublico:enderecoModo==='exato',
    autorizacaoEnderecoEm:enderecoModo==='exato'?new Date().toISOString():null,
    caucao:v('vit_caucao'),contratoMinimoMeses:parseInt(v('vit_contrato'),10)||12,
    disponivelEm:v('vit_disponivel_em')||'',indiceReajuste:v('vit_indice_reajuste'),
    garantiasAceitas:marcados('vit_garantia_',VITRINE_GARANTIAS),
    custosInclusos:marcados('vit_custo_',VITRINE_CUSTOS_INCLUSOS),
    aceitaEstudante:tri('vit_estudante'),aceitaPessoaJuridica:tri('vit_pj'),
    aceitaCrianca:tri('vit_crianca'),permiteSublocacao:tri('vit_sublocacao'),
    aceitaFinanciamento:tri('vit_financiamento'),aceitaPermuta:tri('vit_permuta'),
    situacaoOcupacao:v('vit_ocupacao'),observacaoPrivada:v('vit_obs_privada'),
    comodidadeCodigos:marcados('vit_comod_',(state.vitrine.comodidades||[]).map(function(x){return [x.codigo,x.rotulo];})),
    documentacao:VITRINE_DOCUMENTOS.map(function(d){return {tipo:d[0],estado:v('vit_doc_'+d[0])||'nao_informado',
      observacaoPrivada:v('vit_doc_obs_'+d[0])};}),
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
  const blocoFotos='<div class="vif-aba" data-aba="fotos" hidden>'+
    '<div class="form-section-title">Fotos do anúncio</div>'+
    (id
      ? '<div id="vitrineFotos" class="vitrine-fotos">'+
        '<div class="vitrine-fotos-carregando">Carregando fotos…</div></div>'
      : '<p class="modal-hint">Salve o anúncio primeiro e ele abre de novo para você adicionar as fotos.</p>')+
    '</div>';

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
  /* Suíte é um quarto com banheiro dentro — já está contada nos quartos.
     O banco recusa a gravação; avisar aqui explica o porquê em vez de
     devolver um erro de restrição. */
  if(Number(dados.suites)>Number(dados.quartos)){
    showToast('Suítes não pode passar de quartos: a suíte já é um dos quartos.','error');return;
  }
  if(dados.totalAndares!=null&&Number(dados.andar)>Number(dados.totalAndares)){
    showToast('O andar do imóvel não pode passar do total de andares.','error');return;
  }
  const temLatPublica=dados.latitudePublica!=null&&dados.latitudePublica!=='';
  const temLngPublica=dados.longitudePublica!=null&&dados.longitudePublica!=='';
  if(temLatPublica!==temLngPublica){
    showToast('Informe latitude e longitude públicas juntas.','error');return;
  }
  if((temLatPublica&&Math.abs(Number(dados.latitudePublica))>90)
    ||(temLngPublica&&Math.abs(Number(dados.longitudePublica))>180)){
    showToast('Confira as coordenadas públicas aproximadas.','error');return;
  }
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
      '<th>Nome</th><th>Como aparece no site</th><th>Contato</th><th>Anúncios</th><th>Taxas pagas</th><th></th></tr></thead><tbody>'+
      donos.map(function(o){
        const espelho=(state.vitrine.anunciantes||[]).find(function(a){
          return String(a.proprietarioClienteId||'')===String(o.id);
        });
        const meus=espelho?anuncios.filter(function(i){return i.anuncianteId===espelho.id;}):[];
        const pago=espelho?taxas.filter(function(t){return t.anuncianteId===espelho.id&&t.pago;})
          .reduce(function(s,t){return s+Number(t.valor||0);},0):0;
        return '<tr><td><strong>'+esc(o.nome)+'</strong>'+(o.documento?'<span class="cell-sub">'+esc(o.documento)+'</span>':'')+'</td>'+
          '<td>'+vitrineResponsavelCelula(espelho)+'</td>'+
          '<td>'+esc(o.telefone||'—')+(o.email?'<span class="cell-sub">'+esc(o.email)+'</span>':'')+'</td>'+
          '<td><strong>'+meus.length+'</strong></td>'+
          '<td><strong>'+fmtMoney(pago)+'</strong></td>'+
          '<td><button class="btn btn-ghost btn-sm" onclick="openOwnerModal(\''+esc(o.id)+'\')">Editar</button></td></tr>';
      }).join('')+'</tbody></table></div>'
      :emptyState('Nenhum proprietário cadastrado. Cadastre o dono antes de criar o anúncio.',tenantIconSvg()))+'</div>';
}
/* ------------------------------------------------------------
   COMO O PROPRIETÁRIO APARECE NO SITE

   `tipo`, `registro` e `verificado` são da Vitrine, não da gestão: um
   mesmo cadastro pode ser imobiliária aqui e continuar sendo só um
   nome no extrato de repasse. Por isso ficam nesta tela, ao lado do
   espelho, e não no formulário de Proprietário.
   ------------------------------------------------------------ */
const VITRINE_TIPO_ROTULO={imobiliaria:'Imobiliária',corretor:'Corretor',proprietario:'Proprietário'};
function vitrineResponsavelCelula(a){
  if(!a) return '<span class="cell-sub">Ainda sem anúncio</span>';
  const tipo=VITRINE_TIPO_ROTULO[a.tipo||'proprietario']||'Proprietário';
  return '<button class="vitrine-resp-editar" onclick="openVitrineResponsavelModal(\''+esc(a.id)+'\')">'+
    '<span class="chip chip-slate">'+esc(tipo.toUpperCase())+'</span>'+
    (a.verificado?'<b class="vitrine-visto" title="Visto de validação ativo">✓</b>':'')+
    (a.registro?'<span class="cell-sub">'+esc(a.registro)+'</span>':'')+'</button>';
}
function openVitrineResponsavelModal(id){
  const a=vitrineAnunciantePorId(id);
  if(!a){showToast('Responsável não encontrado.','error');return;}
  const admin=!!state.isPlatformAdmin;
  const notas=(state.vitrine.avaliacoes||[]).filter(function(x){return String(x.anuncianteId)===String(a.id);});
  const media=notas.length?(notas.reduce(function(s,x){return s+x.nota;},0)/notas.length):0;
  openModal('<h3 class="modal-title">Como '+esc(a.nome)+' aparece no site</h3>'+
    '<p class="modal-text">A etiqueta e o registro saem na página de cada imóvel deste responsável.</p>'+
    '<label class="field"><span>Etiqueta</span><select id="resp_tipo">'+
      ['proprietario','corretor','imobiliaria'].map(function(t){
        return '<option value="'+t+'"'+((a.tipo||'proprietario')===t?' selected':'')+'>'+VITRINE_TIPO_ROTULO[t]+'</option>';
      }).join('')+'</select></label>'+
    /* A foto vai no topo porque é o que a pessoa reconhece antes do
       nome — e porque, ao contrário dos outros campos, ela grava na
       hora: sobe o arquivo e já está valendo, sem passar pelo Salvar. */
    '<div class="resp-foto">'+
      (a.fotoPath
        ? '<img src="'+esc(location.origin+'/og-foto?p='+encodeURIComponent(a.fotoPath))+'" alt="">'
        : '<span>'+esc(vitrineIniciais(a.nome))+'</span>')+
      '<div><strong>Foto ou logo</strong>'+
        '<small>Aparece no anúncio, no lugar das iniciais. Quadrada fica melhor.</small>'+
        '<div class="resp-foto-acoes">'+
          '<input type="file" id="resp_foto_arq" accept="image/*" hidden '+
            'onchange="enviarFotoResponsavel(\''+esc(a.id)+'\',this)">'+
          '<button type="button" class="btn btn-ghost btn-sm" '+
            'onclick="document.getElementById(\'resp_foto_arq\').click()">'+
            (a.fotoPath?'Trocar':'Enviar')+'</button>'+
          (a.fotoPath?'<button type="button" class="btn btn-ghost btn-sm" '+
            'onclick="removerFotoResponsavel(\''+esc(a.id)+'\')">Remover</button>':'')+
        '</div>'+
      '</div>'+
    '</div>'+
    '<label class="field"><span>CRECI ou CNPJ</span>'+
      '<input id="resp_registro" value="'+esc(a.registro||'')+'" placeholder="CRECI 12345-F ou 00.000.000/0001-00">'+
      '<small>Aparece abaixo do nome. É o que a plataforma confere antes de liberar o visto.</small></label>'+
    /* A nota é só leitura para o gestor — de propósito. Ver o cabeçalho
       de migracao-vitrine-responsavel.sql. */
    '<div class="form-section-title">Avaliações recebidas</div>'+
    (notas.length
      ? '<p class="modal-text"><strong>'+media.toFixed(1).replace('.',',')+'</strong> de 5, em '+notas.length+
        ' avaliaç'+(notas.length===1?'ão':'ões')+' de inquilinos. Você não altera notas — só pode remover uma ofensa.</p>'
      : '<p class="modal-text">Nenhuma avaliação ainda. Só quem tem contrato num imóvel deste responsável consegue avaliar.</p>')+
    (admin
      ? '<div class="form-section-title">Visto de validação</div>'+
        '<div class="notice-box">Confira o documento acima antes de acender. O visto diz ao inquilino que a '+
        'plataforma verificou quem está anunciando — se ninguém verificou, ele é propaganda enganosa.</div>'+
        '<label class="field"><span>Válido até</span><input id="resp_visto_ate" type="date" value="'+esc(a.verificadoAte||'')+'">'+
          '<small>Vencido, o selo some do site sozinho.</small></label>'+
        '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
          (a.verificado?'<button class="btn btn-danger" onclick="definirVistoResponsavel(\''+esc(a.id)+'\',false)">Retirar visto</button>':'')+
          '<button class="btn btn-primary" onclick="definirVistoResponsavel(\''+esc(a.id)+'\',true)">'+
            (a.verificado?'Renovar visto':'Acender visto')+'</button></div></div>'
      /* Quem não é administrador vê a situação, não o interruptor. */
      : '<div class="form-section-title">Visto de validação</div>'+
        '<p class="modal-text">'+(a.verificado
          ? 'Ativo'+(a.verificadoAte?' até '+esc(vitrineFormatDate(a.verificadoAte)):'')+'.'
          : 'Não contratado. Fale com a plataforma para verificar este responsável.')+'</p>')+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="closeModal()">Fechar</button>'+
      '<button class="btn btn-primary" onclick="salvarVitrineResponsavel(\''+esc(a.id)+'\')">Salvar</button>'+
    '</div></div>');
}
async function enviarFotoResponsavel(id,input){
  const file=input&&input.files&&input.files[0];
  if(!file)return;
  const a=vitrineAnunciantePorId(id);
  if(!a)return;
  /* 4 MB é folgado para uma logo e barra o retrato de 12 MP que o
     celular manda sem pensar. */
  if(file.size>4*1024*1024){showToast('Imagem muito grande. Use até 4 MB.','error');input.value='';return;}
  try{
    showToast('Enviando…');
    const caminho=await db.saveVitrineResponsavelFoto(id,file,a.fotoPath||'');
    state.vitrine.anunciantes=(state.vitrine.anunciantes||[]).map(function(x){
      return String(x.id)===String(id)?Object.assign({},x,{fotoPath:caminho}):x;
    });
    showToast('Foto atualizada.');
    openVitrineResponsavelModal(id);
  }catch(e){ console.error(e);showToast((e&&e.message)||'Não foi possível enviar a foto.','error'); }
  finally{ if(input)input.value=''; }
}
async function removerFotoResponsavel(id){
  const a=vitrineAnunciantePorId(id);
  if(!a)return;
  try{
    await db.removeVitrineResponsavelFoto(id,a.fotoPath||'');
    state.vitrine.anunciantes=(state.vitrine.anunciantes||[]).map(function(x){
      return String(x.id)===String(id)?Object.assign({},x,{fotoPath:''}):x;
    });
    showToast('Foto removida.');
    openVitrineResponsavelModal(id);
  }catch(e){ console.error(e);showToast((e&&e.message)||'Não foi possível remover.','error'); }
}
async function salvarVitrineResponsavel(id){
  const a=vitrineAnunciantePorId(id);
  if(!a)return;
  const tipo=document.getElementById('resp_tipo').value;
  const registro=document.getElementById('resp_registro').value.trim();
  try{
    const salvo=await db.saveVitrineAnunciante(Object.assign({},a,{tipo:tipo,registro:registro}));
    state.vitrine.anunciantes=(state.vitrine.anunciantes||[]).map(function(x){
      return String(x.id)===String(id)?salvo:x;
    });
    closeModal();showToast('Responsável atualizado.');render();
  }catch(e){ console.error(e);showToast((e&&e.message)||'Não foi possível salvar.','error'); }
}
async function definirVistoResponsavel(id,ativo){
  const campo=document.getElementById('resp_visto_ate');
  const ate=ativo?((campo&&campo.value)||''):'';
  try{
    await db.definirVistoResponsavel(id,ativo,ate);
    state.vitrine.anunciantes=(state.vitrine.anunciantes||[]).map(function(x){
      return String(x.id)===String(id)?Object.assign({},x,{verificado:!!ativo,verificadoAte:ate}):x;
    });
    closeModal();showToast(ativo?'Visto aceso.':'Visto retirado.');render();
  }catch(e){ console.error(e);showToast((e&&e.message)||'Não foi possível alterar o visto.','error'); }
}

/* ------------------------------------------------------------
   QUEM CHEGOU PELA PÁGINA ANUNCIAR

   Lista separada dos Leads de propósito: aqui é gente com imóvel para
   colocar, não gente atrás de imóvel para alugar. Misturar os dois
   estragaria a taxa de conversão dos anúncios e faria você responder
   as duas conversas do mesmo lugar.
   ------------------------------------------------------------ */
const VITRINE_PARCEIRO_CAMINHO={divulgar:'Anunciar comigo',plataforma:'Plataforma própria'};
const VITRINE_PARCEIRO_STATUS=[['novo','Novo'],['conversando','Conversando'],
  ['proposta','Proposta enviada'],['fechado','Fechado'],['perdido','Perdido']];
function renderVitrineParceiros(){
  const lista=(state.vitrine.parceiros||[]);
  const abertos=lista.filter(function(p){return p.status==='novo'||p.status==='conversando';});
  const link=new URL(vitrineCaminhoPublico({pagina:'anunciar'}),location.origin).toString();
  return '<div class="vitrine-panel"><div class="vitrine-panel-head"><div><h2>Anunciar</h2>'+
    '<p>Quem preencheu o formulário da página pública de anunciar. '+
    'São contatos comerciais — não se misturam com os leads dos imóveis.</p></div>'+
    '<button class="btn btn-ghost btn-sm" onclick="copyTextValue(\''+esc(link)+'\',\'Link da página copiado.\')">Copiar link da página</button></div>'+
    (abertos.length?'<div class="notice-box">'+abertos.length+' contato(s) esperando resposta.</div>':'')+
    (lista.length
      ? '<div class="vitrine-table-wrap"><table class="vitrine-table"><thead><tr>'+
        '<th>Quem</th><th>Quer</th><th>Cidade</th><th>Imóveis</th><th>Situação</th><th></th></tr></thead><tbody>'+
        lista.map(function(p){
          const tel=String(p.telefone||'').replace(/\D/g,'');
          const wa=tel?'https://wa.me/'+(tel.length<=11?'55'+tel:tel):'';
          return '<tr><td><strong>'+esc(p.nome)+'</strong>'+
              '<span class="cell-sub">'+esc(p.telefone||'')+' · '+esc(vitrineFormatDate(p.createdAt))+'</span>'+
              (p.mensagem?'<span class="cell-sub">'+esc(p.mensagem)+'</span>':'')+'</td>'+
            '<td><span class="chip chip-'+(p.caminho==='plataforma'?'manut':'brass')+'">'+
              esc((VITRINE_PARCEIRO_CAMINHO[p.caminho]||p.caminho).toUpperCase())+'</span></td>'+
            '<td>'+esc(p.cidade||'—')+'</td>'+
            '<td>'+esc(p.quantidade||'—')+'</td>'+
            '<td><select onchange="atualizarParceiroVitrine(\''+esc(p.id)+'\',this.value)">'+
              VITRINE_PARCEIRO_STATUS.map(function(s){
                return '<option value="'+s[0]+'"'+(p.status===s[0]?' selected':'')+'>'+s[1]+'</option>';
              }).join('')+'</select></td>'+
            '<td>'+(wa?'<a class="btn btn-ghost btn-sm" href="'+esc(wa)+'" target="_blank" rel="noopener">WhatsApp</a>':'')+'</td></tr>';
        }).join('')+'</tbody></table></div>'
      : emptyState('Ninguém preencheu a página ainda. Divulgue o link acima — ele já está no topo e no rodapé do seu site.',tenantIconSvg()))+'</div>';
}
async function atualizarParceiroVitrine(id,status){
  try{
    await db.atualizarParceiroVitrine(id,{status:status});
    state.vitrine.parceiros=(state.vitrine.parceiros||[]).map(function(p){
      return String(p.id)===String(id)?Object.assign({},p,{status:status}):p;
    });
    showToast('Situação atualizada.');
  }catch(e){ console.error(e);showToast((e&&e.message)||'Não foi possível atualizar.','error'); }
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
    origem:l.origem||'formulario',
    campanha:l.campanha||l.utmSource||'',
    finalidade:im&&im.finalidade==='vender'?'vender':'alugar',
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
  const url=new URL(window.location.origin);
  url.pathname='/vitrine/'+encodeURIComponent(slug)+'/';
  return url.toString();
}

function renderVitrineRetencao(){
  const buscas=state.vitrine.buscasSalvas||[],alertas=state.vitrine.alertasPreco||[];
  const imoveis=new Map((state.vitrine.imoveis||[]).map(function(i){return [i.id,i];}));
  return '<div class="vitrine-panel"><div class="vitrine-panel-head"><div><h2>Retenção e alertas</h2><p>Pedidos autorizados pelos visitantes. Use o canal informado apenas para o acompanhamento solicitado.</p></div></div>'+ 
    '<div class="vitrine-retencao-resumo">'+vitrineStat(buscas.filter(function(x){return x.ativo;}).length,'Buscas acompanhadas','gold')+vitrineStat(alertas.filter(function(x){return x.ativo;}).length,'Alertas de preço','gold')+'</div>'+ 
    '<div class="vitrine-panel-head"><div><h2>Buscas acompanhadas</h2><p>Preferência e frequência escolhidas pelo visitante.</p></div></div>'+ 
    (buscas.length?'<div class="vitrine-table-wrap"><table class="vitrine-table"><thead><tr><th>Busca</th><th>Frequência</th><th>Contato autorizado</th><th>Situação</th></tr></thead><tbody>'+buscas.map(function(b){return '<tr><td><strong>'+esc(b.nome||'Busca')+'</strong><small>'+esc(b.resumo)+'</small></td><td>'+esc(b.frequencia)+'</td><td>'+esc(b.canal)+'<small>'+esc(b.destino)+'</small></td><td>'+(b.ativo?'Ativa':'Cancelada')+'</td></tr>';}).join('')+'</tbody></table></div>':'<div class="vitrine-agenda-vazia">Nenhuma busca com acompanhamento.</div>')+ 
    '<div class="vitrine-panel-head vitrine-visitas-titulo"><div><h2>Alertas de preço</h2><p>O preço de referência evita contato sem alteração real.</p></div></div>'+ 
    (alertas.length?'<div class="vitrine-table-wrap"><table class="vitrine-table"><thead><tr><th>Imóvel</th><th>Preço de referência</th><th>Preço atual</th><th>Contato autorizado</th><th>Situação</th></tr></thead><tbody>'+alertas.map(function(a){const i=imoveis.get(a.imovelId)||{},atual=a.finalidade==='vender'?Number(i.precoVenda)||0:Number(i.aluguel)||0,mudou=atual>0&&atual!==Number(a.precoReferencia);return '<tr><td><strong>'+esc(i.codigo||'Anúncio removido')+'</strong></td><td>'+fmtMoney(a.precoReferencia)+'</td><td>'+ (atual?fmtMoney(atual):'Indisponível')+(mudou?'<small>Preço alterado — fazer contato</small>':'')+'</td><td>'+esc(a.canal)+'<small>'+esc(a.destino)+'</small></td><td>'+(a.ativo?'Ativo':'Cancelado')+'</td></tr>';}).join('')+'</tbody></table></div>':'<div class="vitrine-agenda-vazia">Nenhum alerta de preço.</div>')+'</div>';
}

const VITRINE_DIAS=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const VITRINE_FAIXAS={manha:['Manhã','08:00','12:00'],tarde:['Tarde','13:00','18:00'],noite:['Noite','18:00','21:00']};
function vitrineFaixaLabel(f){return (VITRINE_FAIXAS[f]||[f])[0];}
function vitrineFormatDate(valor){
  const texto=String(valor||'');
  const partes=/^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if(partes)return partes[3]+'/'+partes[2]+'/'+partes[1];
  const data=new Date(texto);
  return Number.isNaN(data.getTime())?'—':data.toLocaleDateString('pt-BR');
}
function vitrineStatusVisitaLabel(s){
  return ({solicitada:'Solicitada',confirmada:'Confirmada',reagendada:'Reagendada',cancelada:'Cancelada',
    realizada:'Realizada',nao_compareceu:'Não compareceu'})[s]||s;
}
function renderVitrineVisitas(){
  const cfg=state.vitrine.agendaConfig||{confirmacaoAutomatica:false,antecedenciaHoras:24,horizonteDias:30};
  const ativos=new Set((state.vitrine.disponibilidade||[]).filter(function(h){return h.ativo;})
    .map(function(h){return h.diaSemana+':'+h.faixa;}));
  const visitas=(state.vitrine.visitas||[]).slice().sort(function(a,b){return String(a.data).localeCompare(String(b.data));});
  const imoveis=new Map((state.vitrine.imoveis||[]).map(function(i){return [i.id,i];}));
  const equipe=(state.team||[]).filter(function(m){return m.ativo!==false;});
  return '<div class="vitrine-panel"><div class="vitrine-panel-head"><div><h2>Agenda de visitas</h2>'+ 
    '<p>A disponibilidade publicada é real. Uma solicitação só vira confirmação conforme a regra abaixo.</p></div></div>'+ 
    '<div class="vitrine-agenda-config"><div class="vitrine-agenda-opcoes">'+
      '<label class="field"><span>Confirmação</span><select id="vit_ag_auto"><option value="0"'+(!cfg.confirmacaoAutomatica?' selected':'')+'>Manual — revisar antes</option><option value="1"'+(cfg.confirmacaoAutomatica?' selected':'')+'>Automática</option></select></label>'+ 
      '<label class="field"><span>Antecedência mínima</span><input id="vit_ag_ant" type="number" min="1" max="168" value="'+cfg.antecedenciaHoras+'"></label>'+ 
      '<label class="field"><span>Janela da agenda</span><input id="vit_ag_hor" type="number" min="7" max="90" value="'+cfg.horizonteDias+'"></label></div>'+ 
    '<div class="vitrine-agenda-grade">'+VITRINE_DIAS.map(function(dia,n){return '<fieldset><legend>'+dia+'</legend>'+ 
      Object.keys(VITRINE_FAIXAS).map(function(f){const k=n+':'+f;return '<label><input type="checkbox" data-vit-hor="'+k+'"'+(ativos.has(k)?' checked':'')+'> '+vitrineFaixaLabel(f)+'</label>';}).join('')+'</fieldset>';}).join('')+'</div>'+ 
    '<button class="btn btn-primary" id="vit_ag_salvar" onclick="salvarVitrineAgenda()">Salvar disponibilidade</button></div>'+ 
    '<div class="vitrine-panel-head vitrine-visitas-titulo"><div><h2>Solicitações e visitas</h2><p>'+visitas.length+' registro'+(visitas.length===1?'':'s')+'.</p></div></div>'+ 
    (visitas.length?'<div class="vitrine-table-wrap"><table class="vitrine-table"><thead><tr><th>Data</th><th>Cliente / imóvel</th><th>Situação</th><th>Responsável</th></tr></thead><tbody>'+visitas.map(function(v){
      const i=imoveis.get(v.imovelId)||{};
      const lembretePendente=['solicitada','confirmada','reagendada'].includes(v.status)&&v.lembreteEm&&new Date(v.lembreteEm).getTime()<=Date.now();
      return '<tr><td><strong>'+vitrineFormatDate(v.data)+'</strong><small>'+vitrineFaixaLabel(v.faixa)+'</small></td>'+ 
        '<td><strong>'+esc(v.nome)+'</strong><small>'+esc(v.telefone)+' · '+esc(i.codigo||'anúncio')+'</small></td>'+ 
        '<td><select onchange="atualizarVitrineVisita(\''+v.id+'\',\'status\',this.value)">'+['solicitada','confirmada','reagendada','realizada','nao_compareceu','cancelada'].map(function(s){return '<option value="'+s+'"'+(v.status===s?' selected':'')+'>'+vitrineStatusVisitaLabel(s)+'</option>';}).join('')+'</select>'+(lembretePendente?'<small>Lembrete pendente — confirmar com o cliente.</small>':'')+'</td>'+ 
        '<td><select onchange="atualizarVitrineVisita(\''+v.id+'\',\'responsavelId\',this.value)"><option value="">Sem responsável</option>'+equipe.map(function(m){return '<option value="'+esc(m.userId)+'"'+(v.responsavelId===m.userId?' selected':'')+'>'+esc(m.nome||m.email)+'</option>';}).join('')+'</select></td></tr>';
    }).join('')+'</tbody></table></div>':'<div class="vitrine-agenda-vazia">Nenhuma visita solicitada ainda.</div>')+'</div>';
}
async function salvarVitrineAgenda(){
  const btn=document.getElementById('vit_ag_salvar');if(btn)btn.disabled=true;
  const horarios=[];
  document.querySelectorAll('[data-vit-hor]:checked').forEach(function(el){
    const p=el.dataset.vitHor.split(':'),base=VITRINE_FAIXAS[p[1]];
    horarios.push({diaSemana:Number(p[0]),faixa:p[1],inicio:base[1],fim:base[2],ativo:true});
  });
  try{
    await db.saveVitrineAgenda({confirmacaoAutomatica:document.getElementById('vit_ag_auto').value==='1',
      antecedenciaHoras:Number(document.getElementById('vit_ag_ant').value)||24,
      horizonteDias:Number(document.getElementById('vit_ag_hor').value)||30},horarios);
    await loadVitrineData(true);showToast('Agenda publicada com a disponibilidade selecionada.','success');
  }catch(e){showToast((e&&e.message)||'Não foi possível salvar a agenda.','error');if(btn)btn.disabled=false;}
}
async function atualizarVitrineVisita(id,campo,valor){
  try{
    const visita=(state.vitrine.visitas||[]).find(function(v){return v.id===id;});
    const p={};p[campo]=valor;await db.updateVitrineVisita(id,p);
    if(visita&&campo==='status'&&['confirmada','reagendada','realizada'].includes(valor)){
      const lead=(state.vitrine.leads||[]).find(function(l){return l.id===visita.leadId;});
      const interessado=lead&&(state.interests||[]).find(function(i){return i.id===lead.interessadoId;});
      if(interessado){
        const realizada=valor==='realizada',prazo=new Date(Date.now()+(realizada?86400000:43200000)).toISOString();
        const responsavel=visita.responsavelId||interessado.responsavelId||(state.ownerProfile&&state.ownerProfile.user_id)||'';
        const next=Object.assign({},interessado,{status:realizada?'visita_realizada':'visita_agendada',responsavelId:responsavel,
          proximaAcao:realizada?'Preparar proposta ou registrar perda':'Confirmar presença na visita',proximaAcaoEm:prazo});
        const saved=await db.updateInterest(next);Object.assign(interessado,saved||next);
        if(db.registerCrmEvent)await db.registerCrmEvent({interessadoId:interessado.id,tipo:'visita',titulo:'Visita '+vitrineStatusVisitaLabel(valor),dados:{visitaId:id,status:valor}});
      }
    }
    await loadVitrineData(true);showToast('Visita atualizada.','success');
  }
  catch(e){showToast((e&&e.message)||'Não foi possível atualizar a visita.','error');}
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
  url.pathname='/vitrine/'+encodeURIComponent((state.ownerProfile&&state.ownerProfile.slug_publico)||'')+
    '/imovel/'+encodeURIComponent(i.id)+'/'+vitrineSlugTexto(i.titulo||i.codigo||'imovel')+'/';
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

/* Rotas legíveis da Etapa 2. Os links antigos com ?vitrine= continuam
   válidos e são normalizados com replaceState depois que os dados carregam. */
function vitrineSlugTexto(valor){
  return String(valor||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90);
}
function vitrineRotaPublica(){
  const partes=String(location.pathname||'/').split('/').filter(Boolean).map(function(p){
    try{return decodeURIComponent(p);}catch(e){return p;}
  });
  const rota={slug:'',cidadeSlug:'',finalidade:'',tipo:'',imovelId:'',pagina:''};
  if(partes[0]!=='vitrine'||!partes[1])return rota;
  rota.slug=partes[1];
  if(partes[2]==='privacidade'){rota.pagina='privacidade';return rota;}
  if(partes[2]==='anunciar'){rota.pagina='anunciar';return rota;}
  if(partes[2]==='imovel'&&partes[3]){rota.imovelId=partes[3];return rota;}
  if(partes[2])rota.cidadeSlug=partes[2];
  if(partes[3]==='comprar'||partes[3]==='alugar')rota.finalidade=partes[3];
  if(partes[4])rota.tipo=partes[4];
  return rota;
}
function vitrineSlugDaUrlPublica(){
  const rota=vitrineRotaPublica();
  return rota.slug||(new URLSearchParams(location.search).get('vitrine')||'').trim();
}
function vitrinePerfilSlug(){
  return ((state.vitrinePublic&&state.vitrinePublic.perfil&&state.vitrinePublic.perfil.slug)||
    vitrineSlugDaUrlPublica()||'').trim();
}
function vitrineCidadePublicaPorSlug(slug){
  if(!slug)return null;
  return (((state.vitrinePublic||{}).cidades)||[]).find(function(c){
    return vitrineSlugTexto(c.slug||c.nome)===vitrineSlugTexto(slug);
  })||null;
}
function vitrineCaminhoPublico(opcoes){
  const o=opcoes||{};
  const slug=encodeURIComponent(vitrinePerfilSlug());
  if(!slug)return '/';
  if(o.pagina==='privacidade')return '/vitrine/'+slug+'/privacidade/';
  if(o.pagina==='anunciar')return '/vitrine/'+slug+'/anunciar/';
  const item=o.imovel||null;
  if(item)return '/vitrine/'+slug+'/imovel/'+encodeURIComponent(item.id)+'/'+vitrineSlugTexto(item.titulo||item.codigo||'imovel')+'/';
  const cidade=o.cidade||vitrineCidadePublicaPorId(state.vitrinePubCidade);
  if(!cidade)return '/vitrine/'+slug+'/';
  const finalidade=(o.finalidade||state.vitrinePubFinalidade)==='vender'?'comprar':'alugar';
  const tipo=o.tipo===undefined?state.vitrineFiltros.tipo:o.tipo;
  return '/vitrine/'+slug+'/'+encodeURIComponent(vitrineSlugTexto(cidade.slug||cidade.nome))+'/'+finalidade+'/'+
    (tipo?encodeURIComponent(vitrineSlugTexto(tipo))+'/':'');
}

async function bootVitrinePublica(slug){
  const inicioCarga=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
  state.vitrinePublicMode=true;
  state.loading=true;
  applyAppTheme('original');   /* a vitrine é a sua marca, não segue tema */
  render();
  try{
    state.vitrinePublic=await db.loadVitrinePublica(slug);
    aplicarMarcaVitrine(state.vitrinePublic&&state.vitrinePublic.perfil);
    db.registrarVitrineObservabilidade(slug,'carga_publica',((typeof performance!=='undefined'&&performance.now)?performance.now():Date.now())-inicioCarga,
      {rota:location.pathname,quantidade:(state.vitrinePublic.imoveis||[]).length});
  }catch(e){
    console.error(e);
    db.registrarVitrineObservabilidade(slug,'erro_carga',((typeof performance!=='undefined'&&performance.now)?performance.now():Date.now())-inicioCarga,
      {rota:location.pathname,codigoErro:(e&&e.code)||'carga'});
    state.vitrinePublic={perfil:null,imoveis:[]};
  }
  state.loading=false;
  carregarPreferenciasVitrine();
  lerFiltrosDaUrl();
  if(state.vitrineDetalheId){
    state.vitrineRecentes=[String(state.vitrineDetalheId)].concat((state.vitrineRecentes||[])
      .filter(function(x){return String(x)!==String(state.vitrineDetalheId);})).slice(0,12);
    salvarPreferenciaVitrine('recentes',state.vitrineRecentes);
  }
  normalizarRotaVitrinePublica();
  ligarVoltarDoNavegador();
  render();
  atualizarSeoVitrine();
}

/* Botão Voltar do celular e do navegador. Sem isto, quem abria um imóvel
   e apertava Voltar saía do site inteiro — o jeito mais rápido de perder
   uma pessoa que já estava olhando. */
let _vitrineVoltarLigado=false;
function ligarVoltarDoNavegador(){
  if(_vitrineVoltarLigado||typeof window==='undefined')return;
  _vitrineVoltarLigado=true;
  window.addEventListener('popstate',function(ev){
    if(!state.vitrinePublicMode)return;
    if(window._vitrineMapa){try{window._vitrineMapa.remove();}catch(e){}window._vitrineMapa=null;}
    if(window._vitrineMapaResultados){try{window._vitrineMapaResultados.remove();}catch(e){}window._vitrineMapaResultados=null;}
    fecharVitrineLightbox(true);
    lerFiltrosDaUrl();
    state.vitrineMapaAtivo=false;
    render();
    atualizarSeoVitrine();
    if(!state.vitrineDetalheId)setTimeout(function(){
      const y=Number(ev&&ev.state&&ev.state.vitrineScroll);
      if(window.scrollTo)window.scrollTo({top:Number.isFinite(y)?y:(Number(state.vitrineScrollLista)||0),behavior:'auto'});
    },0);
  });
  window.addEventListener('keydown',function(ev){
    if(!state.vitrinePublicMode)return;
    if(ev.key==='Tab'){
      const dialog=document.querySelector('.vitrine-public [role="dialog"]');if(!dialog)return;
      const els=Array.from(dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')).filter(function(el){return el.offsetParent!==null;});
      if(!els.length)return;const first=els[0],last=els[els.length-1];
      if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last.focus();}
      else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first.focus();}
      return;
    }
    if(ev.key!=='Escape')return;
    let fechou=false;
    if(state.vitrineParceiroModal){state.vitrineParceiroModal=null;fechou=true;}
    else if(state.vitrineVisitaModal){state.vitrineVisitaModal=null;fechou=true;}
    else if(state.vitrineAlertaModal){state.vitrineAlertaModal=null;fechou=true;}
    else if(state.vitrineBuscaModal){state.vitrineBuscaModal=false;fechou=true;}
    else if(state.vitrineComparacaoAberta){state.vitrineComparacaoAberta=false;fechou=true;}
    else if(state.vitrineFiltrosMobile){state.vitrineFiltrosMobile=false;fechou=true;}
    if(fechou){render();restaurarFocoVitrinePublica();}
  });
}
let _vitrineFocoAnterior=null;
function lembrarFocoVitrinePublica(){
  const el=document.activeElement;if(!el||el===document.body)return;
  _vitrineFocoAnterior={id:el.id||'',aria:el.getAttribute&&el.getAttribute('aria-label')||'',texto:String(el.textContent||'').trim().slice(0,100)};
}
function restaurarFocoVitrinePublica(){
  const salvo=_vitrineFocoAnterior;_vitrineFocoAnterior=null;if(!salvo)return;
  setTimeout(function(){
    let alvo=salvo.id?document.getElementById(salvo.id):null;
    if(!alvo&&salvo.aria)alvo=Array.from(document.querySelectorAll('[aria-label]')).find(function(el){return el.getAttribute('aria-label')===salvo.aria;});
    if(!alvo&&salvo.texto)alvo=Array.from(document.querySelectorAll('button,a[href]')).find(function(el){return String(el.textContent||'').trim().slice(0,100)===salvo.texto;});
    if(alvo&&alvo.focus)alvo.focus();
  },0);
}
function prepararModalVitrinePublica(){
  const dialog=document.querySelector('.vitrine-public [role="dialog"]');if(!dialog||dialog.contains(document.activeElement))return;
  const alvo=dialog.querySelector('input:not([type="hidden"]),select,textarea,button:not([disabled])');
  if(alvo)alvo.focus();else{dialog.setAttribute('tabindex','-1');dialog.focus();}
}

/* Os filtros vivem no endereço do link. Assim você manda no
   WhatsApp um link já filtrado: "as de 2 quartos até 1.200". */
function lerFiltrosDaUrl(){
  const p=new URLSearchParams(location.search);
  const rota=vitrineRotaPublica();
  const f=state.vitrineFiltros;
  f.busca=p.get('busca')||'';
  f.tipo=rota.tipo||p.get('tipo')||'';
  f.quartos=parseInt(p.get('quartos'),10)||0;
  f.banheiros=parseInt(p.get('banheiros'),10)||0;
  f.suites=parseInt(p.get('suites'),10)||0;
  f.conservacao=p.get('conservacao')||'';
  f.vagas=parseInt(p.get('vagas'),10)||0;
  f.faixa=p.get('faixa')||'';
  f.precoMin=vitrineSoDigitos(p.get('precomin'));
  f.precoMax=vitrineSoDigitos(p.get('precomax'));
  f.areaMin=vitrineSoDigitos(p.get('areamin'));
  f.areaMax=vitrineSoDigitos(p.get('areamax'));
  f.bairro=p.get('bairro')||'';
  f.responsavelId=p.get('responsavel')||'';
  f.categoria=p.get('categoria')||'';
  f.ordem=p.get('ordem')||'destaque';
  f.extras=(p.get('extras')||'').split(',').filter(Boolean);
  state.vitrinePubModo=['cards','lista','mapa'].includes(p.get('visual'))?p.get('visual'):'cards';
  const cidadeRota=vitrineCidadePublicaPorSlug(rota.cidadeSlug);
  state.vitrinePubCidade=(cidadeRota&&cidadeRota.id)||p.get('cidade')||'';
  state.vitrinePubFinalidade=(rota.finalidade==='comprar'||p.get('para')==='vender')?'vender':'alugar';
  state.vitrineDetalheId=rota.imovelId||p.get('imovel')||null;
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
function normalizarRotaVitrinePublica(){
  if(typeof history==='undefined')return;
  const p=new URLSearchParams(location.search);
  const legado=p.has('vitrine')||p.has('cidade')||p.has('para')||p.has('tipo')||p.has('imovel')||p.has('pagina');
  if(!legado&&vitrineRotaPublica().slug)return;
  ['vitrine','cidade','para','tipo','imovel','pagina'].forEach(function(k){p.delete(k);});
  const item=state.vitrineDetalheId?((state.vitrinePublic||{}).imoveis||[])
    .find(function(i){return String(i.id)===String(state.vitrineDetalheId);}):null;
  const pagina=(new URLSearchParams(location.search).get('pagina')==='privacidade')?'privacidade':'';
  const caminho=vitrineCaminhoPublico({imovel:item,pagina:pagina});
  const destino=caminho+(p.toString()?'?'+p.toString():'');
  history.replaceState(history.state||null,'',destino);
}
/* `novaEntrada` decide se o endereço vira um passo no histórico.
   Mudar de filtro é ajuste fino e usa replaceState — senão o Voltar do
   navegador teria de desfazer chip por chip. Abrir um imóvel ou escolher
   uma cidade é navegação de verdade e usa pushState, para o Voltar do
   celular fazer o que a pessoa espera em vez de sair do site. */
function gravarFiltrosNaUrl(novaEntrada){
  const f=state.vitrineFiltros;
  const p=new URLSearchParams();
  if(f.busca)p.set('busca',f.busca);
  if(f.quartos)p.set('quartos',String(f.quartos));
  if(f.banheiros)p.set('banheiros',String(f.banheiros));
  if(f.suites)p.set('suites',String(f.suites));
  if(f.conservacao)p.set('conservacao',f.conservacao);
  if(f.vagas)p.set('vagas',String(f.vagas));
  if(f.faixa)p.set('faixa',f.faixa);
  if(f.precoMin)p.set('precomin',f.precoMin);
  if(f.precoMax)p.set('precomax',f.precoMax);
  if(f.areaMin)p.set('areamin',f.areaMin);
  if(f.areaMax)p.set('areamax',f.areaMax);
  if(f.bairro)p.set('bairro',f.bairro);
  if(f.responsavelId)p.set('responsavel',f.responsavelId);
  if(f.categoria)p.set('categoria',f.categoria);
  if(f.ordem&&f.ordem!=='destaque')p.set('ordem',f.ordem);
  if(f.extras.length)p.set('extras',f.extras.join(','));
  if(state.vitrinePubModo&&state.vitrinePubModo!=='cards')p.set('visual',state.vitrinePubModo);
  const item=state.vitrineDetalheId?((state.vitrinePublic||{}).imoveis||[])
    .find(function(i){return String(i.id)===String(state.vitrineDetalheId);}):null;
  const caminho=vitrineCaminhoPublico({imovel:item});
  const url=caminho+(p.toString()?'?'+p.toString():'');
  /* O marcador {vitrine:true} diz que este passo foi criado por nós — é
     o que permite ao "voltar" da página saber se há para onde voltar
     dentro do site ou se ele jogaria a pessoa para fora. */
  if(novaEntrada&&url!==(location.pathname+location.search)) history.pushState({vitrine:true},'',url);
  else history.replaceState(history.state||null,'',url);
  atualizarSeoVitrine();
}

/* O robô do WhatsApp e do Google recebem o título certo da edge function,
   no primeiro carregamento. Quem navega dentro da página, não: o título
   ficava congelado no primeiro imóvel aberto, e é ele que nomeia a aba do
   navegador, o favorito e cada passo do histórico. */
function atualizarSeoVitrine(){
  const dados=state.vitrinePublic||{};
  const perfil=dados.perfil;
  if(!perfil)return;
  const casa=perfil.nome||'Imóveis';
  let titulo=casa;
  if(vitrineRotaPublica().pagina==='privacidade'){
    titulo='Privacidade · '+casa;
  }else if(state.vitrineDetalheId){
    const i=(dados.imoveis||[]).find(function(x){return String(x.id)===String(state.vitrineDetalheId);});
    if(i){
      const venda=state.vitrinePubFinalidade==='vender'&&Number(i.precoVenda)>0;
      const bruto=venda?Number(i.precoVenda):Number(i.aluguel);
      const valor=bruto>0?(fmtMoney(bruto)+(venda?'':'/mês')):'Consulte o valor';
      titulo=i.titulo+' — '+valor+' · '+casa;
    }
  }else{
    const cidade=vitrineCidadePublicaPorId(state.vitrinePubCidade);
    const acao=state.vitrinePubFinalidade==='vender'?'à venda':'para alugar';
    titulo=(cidade?'Imóveis '+acao+' em '+cidade.nome:'Imóveis '+acao)+' · '+casa;
  }
  document.title=titulo;
  const pagina=vitrineRotaPublica().pagina;
  const item=state.vitrineDetalheId?(dados.imoveis||[]).find(function(i){return String(i.id)===String(state.vitrineDetalheId);}):null;
  const canonicalPath=vitrineCaminhoPublico({imovel:item,pagina:pagina});
  const canonical=new URL(canonicalPath,location.origin).toString();
  /* Busca livre, preço, área, ordenação e extras nunca alteram o canonical:
     são combinações cosméticas e não devem criar milhares de páginas. */
  let link=document.querySelector('link[rel="canonical"]');
  if(!link){link=document.createElement('link');link.rel='canonical';document.head.appendChild(link);}
  link.href=canonical;
  let descricao=perfil.descricao||'';
  if(item){
    const partes=[item.tipo,item.bairro,item.cidade].filter(Boolean);
    descricao=(partes.join(' em ')+' — '+String(item.descricao||'')).trim().slice(0,160);
  }else{
    const cidade=vitrineCidadePublicaPorId(state.vitrinePubCidade);
    descricao=(descricao||('Imóveis e terrenos'+(cidade?' em '+cidade.nome:'')+' para alugar e comprar.')).slice(0,160);
  }
  vitrineMeta('description',descricao);
  vitrineMeta('robots',(state.vitrineFiltros.busca?'noindex,follow':'index,follow'));
  vitrineJsonLd(perfil,item,canonical,descricao);
}
function vitrineMeta(nome,conteudo){
  let meta=document.querySelector('meta[name="'+nome+'"]');
  if(!meta){meta=document.createElement('meta');meta.name=nome;document.head.appendChild(meta);}
  meta.content=conteudo||'';
}
function vitrineJsonLd(perfil,item,canonical,descricao){
  let script=document.getElementById('vitrine-jsonld');
  if(!script){script=document.createElement('script');script.type='application/ld+json';script.id='vitrine-jsonld';document.head.appendChild(script);}
  const organizacao={
    '@type':'RealEstateAgent',name:perfil.nome||'Imóveis',url:new URL('/vitrine/'+encodeURIComponent(perfil.slug||'')+'/',location.origin).toString(),
    telephone:perfil.contato||undefined,description:perfil.descricao||undefined,
    address:(perfil.cidadeSede?{'@type':'PostalAddress',addressLocality:perfil.cidadeSede,addressRegion:perfil.ufSede||undefined,addressCountry:'BR'}:undefined),
    logo:perfil.logoUrl||undefined
  };
  const grafo=[organizacao];
  if(item){
    const venda=state.vitrinePubFinalidade==='vender';
    const preco=venda?Number(item.precoVenda)||0:Number(item.aluguel)||0;
    grafo.push({'@type':'Offer',url:canonical,priceCurrency:'BRL',price:preco||undefined,
      availability:'https://schema.org/InStock',itemOffered:{'@type':'Accommodation',name:item.titulo,description:descricao,
        floorSize:(Number(item.areaM2)>0?{'@type':'QuantitativeValue',value:Number(item.areaM2),unitCode:'MTK'}:undefined),
        numberOfRooms:Number(item.quartos)||undefined,address:{'@type':'PostalAddress',addressLocality:item.cidade||undefined,
          addressRegion:item.uf||undefined,addressCountry:'BR'}}});
    grafo.push({'@type':'BreadcrumbList',itemListElement:[
      {'@type':'ListItem',position:1,name:perfil.nome||'Imóveis',item:organizacao.url},
      {'@type':'ListItem',position:2,name:item.titulo,item:canonical}
    ]});
  }
  script.textContent=JSON.stringify({'@context':'https://schema.org','@graph':grafo});
}
function aplicarMarcaVitrine(perfil){
  if(typeof document==='undefined')return;
  const paletas={
    floresta:['#14322A','#1F4339','#E2BE78','#F4F6F3','#1C2620','#5C6B63','#D9E1DC'],
    oceano:['#123B57','#1E5875','#77D1D8','#F4F8FA','#18313E','#526C78','#D8E5EA'],
    terracota:['#6E2F25','#914839','#F0BD78','#FBF5EF','#38231F','#765D56','#E8D9D1'],
    grafite:['#252A2D','#3C4448','#D7B977','#F7F7F5','#24282A','#626A6E','#DEE1E2']
  };
  const tema=perfil&&paletas[perfil.marcaTema]?perfil.marcaTema:'floresta';
  const p=paletas[tema];
  ['--cover','--cover-light','--accent-on-cover','--paper','--ink','--ink-soft','--line']
    .forEach(function(nome,idx){document.documentElement.style.setProperty(nome,p[idx]);});
  document.documentElement.setAttribute('data-vitrine-brand',tema);
}
function vitrineCidadePublicaPorId(id){
  if(!id)return null;
  return (((state.vitrinePublic||{}).cidades)||[])
    .find(function(c){return String(c.id)===String(id);})||null;
}
/* Campo de valor: guarda só dígito. Não é `type=number` de propósito —
   o spinner suja a barra de filtros, e ler o cursor de um input numérico
   dá erro em alguns navegadores, o que quebraria a volta do foco. */
function vitrineSoDigitos(v){ return String(v==null?'':v).replace(/\D/g,''); }

/* Favoritos e comparacao sao deliberadamente locais nesta etapa: funcionam
   sem login e sem guardar dado pessoal. A chave leva o slug para que duas
   vitrines abertas no mesmo navegador nunca misturem seus imoveis. */
function vitrinePreferenciaKey(tipo){return 'vitrine:'+vitrinePerfilSlug()+':'+tipo;}
function vitrineIdsValidos(ids,limite){
  const existentes=new Set((((state.vitrinePublic||{}).imoveis)||[]).map(function(i){return String(i.id);}));
  return (Array.isArray(ids)?ids:[]).map(String).filter(function(id,n,a){
    return existentes.has(id)&&a.indexOf(id)===n;
  }).slice(0,limite);
}
function carregarPreferenciasVitrine(){
  if(typeof localStorage==='undefined')return;
  try{
    state.vitrineFavoritos=vitrineIdsValidos(JSON.parse(localStorage.getItem(vitrinePreferenciaKey('favoritos'))||'[]'),200);
    state.vitrineComparacao=vitrineIdsValidos(JSON.parse(localStorage.getItem(vitrinePreferenciaKey('comparacao'))||'[]'),4);
    state.vitrineBuscasSalvas=JSON.parse(localStorage.getItem(vitrinePreferenciaKey('buscas'))||'[]').slice(0,20);
    state.vitrineRecentes=vitrineIdsValidos(JSON.parse(localStorage.getItem(vitrinePreferenciaKey('recentes'))||'[]'),12);
    state.vitrineAlertasLocais=JSON.parse(localStorage.getItem(vitrinePreferenciaKey('alertas'))||'[]').slice(0,20);
    state.vitrineVisitasLocais=JSON.parse(localStorage.getItem(vitrinePreferenciaKey('visitas'))||'[]').slice(0,20);
  }catch(e){state.vitrineFavoritos=[];state.vitrineComparacao=[];state.vitrineBuscasSalvas=[];
    state.vitrineRecentes=[];state.vitrineAlertasLocais=[];state.vitrineVisitasLocais=[];}
}
function salvarPreferenciaVitrine(tipo,ids){
  if(typeof localStorage==='undefined')return;
  try{localStorage.setItem(vitrinePreferenciaKey(tipo),JSON.stringify(ids));}catch(e){}
}
function toggleVitrineFavorito(ev,id){
  if(ev&&ev.stopPropagation)ev.stopPropagation();
  const atual=state.vitrineFavoritos||[],chave=String(id);
  state.vitrineFavoritos=atual.includes(chave)?atual.filter(function(x){return x!==chave;}):atual.concat(chave);
  salvarPreferenciaVitrine('favoritos',state.vitrineFavoritos);render();
}
function toggleVitrineComparacao(ev,id){
  if(ev&&ev.stopPropagation)ev.stopPropagation();
  const atual=state.vitrineComparacao||[],chave=String(id);
  if(!atual.includes(chave)&&atual.length>=4){showToast('Compare no maximo 4 imoveis por vez.','error');return;}
  state.vitrineComparacao=atual.includes(chave)?atual.filter(function(x){return x!==chave;}):atual.concat(chave);
  if(state.vitrineComparacao.length<2)state.vitrineComparacaoAberta=false;
  salvarPreferenciaVitrine('comparacao',state.vitrineComparacao);render();
}
function limparComparacaoVitrine(){
  state.vitrineComparacao=[];state.vitrineComparacaoAberta=false;
  salvarPreferenciaVitrine('comparacao',[]);render();
}
function abrirComparacaoVitrine(){
  if((state.vitrineComparacao||[]).length<2){showToast('Escolha pelo menos 2 imoveis para comparar.','error');return;}
  lembrarFocoVitrinePublica();state.vitrineComparacaoAberta=true;render();
}
function fecharComparacaoVitrine(){state.vitrineComparacaoAberta=false;render();restaurarFocoVitrinePublica();}

/* `render()` troca a página inteira, e com isso destrói o campo em que a
   pessoa está digitando: sem isto, o filtro de busca perdia o foco a cada
   letra. Guarda quem estava em foco e onde estava o cursor, e devolve. */
function renderVitrineMantendoFoco(){
  const ativo=(typeof document!=='undefined')?document.activeElement:null;
  const id=ativo&&ativo.id;
  let ini=null,fim=null;
  if(id){ try{ ini=ativo.selectionStart; fim=ativo.selectionEnd; }catch(e){} }
  render();
  if(!id) return;
  const novo=document.getElementById(id);
  if(!novo||typeof novo.focus!=='function') return;
  novo.focus();
  if(ini!=null&&novo.setSelectionRange){ try{ novo.setSelectionRange(ini,fim); }catch(e){} }
}

const VITRINE_FILTROS_INTEIROS=['quartos','banheiros','vagas','suites'];
const VITRINE_FILTROS_VALOR=['precoMin','precoMax','areaMin','areaMax'];
function setVitrineFiltro(campo,valor){
  const f=state.vitrineFiltros;
  if(VITRINE_FILTROS_INTEIROS.includes(campo)) f[campo]=parseInt(valor,10)||0;
  else if(VITRINE_FILTROS_VALOR.includes(campo)) f[campo]=vitrineSoDigitos(valor);
  else f[campo]=valor;
  /* Ao escolher terreno, quartos, banheiros e vagas somem da tela — então
     não podem continuar filtrando por trás. */
  if(campo==='tipo'&&valor==='terreno'){ f.quartos=0;f.banheiros=0;f.vagas=0;f.suites=0;f.conservacao=''; }
  /* Faixa pronta e valor digitado dizem a mesma coisa de dois jeitos.
     Deixar os dois ligados faria a busca obedecer a um filtro invisível,
     então o último que a pessoa mexeu desliga o outro. */
  if(campo==='faixa'&&valor){ f.precoMin='';f.precoMax=''; }
  if((campo==='precoMin'||campo==='precoMax')&&valor) f.faixa='';
  /* Filtrar é começar de novo: a contagem de cartões visíveis volta ao
     início, senão um filtro que sobra 3 imóveis herdaria "ver mais 12". */
  state.vitrinePubLimite=VITRINE_PAGINA;
  gravarFiltrosNaUrl();renderVitrineMantendoFoco();
}
function toggleVitrineExtra(chave){
  const f=state.vitrineFiltros;
  f.extras=f.extras.includes(chave)?f.extras.filter(function(x){return x!==chave;}):f.extras.concat(chave);
  state.vitrinePubLimite=VITRINE_PAGINA;
  gravarFiltrosNaUrl();render();
}
/* Os filtros finos ficam guardados: seis controles a mais na barra
   afogariam os seis que resolvem a maioria das buscas. */
function toggleVitrineMaisFiltros(){
  state.vitrineMaisFiltros=!vitrineMaisFiltrosAberto();
  render();
}
function vitrineFiltrosFinosAtivos(){
  const f=state.vitrineFiltros;
  return [f.banheiros,f.suites,f.vagas,f.conservacao,f.precoMin,f.precoMax,f.areaMin,f.areaMax]
    .filter(function(v){return v!==0&&v!=='';}).length;
}
/* Aberto por escolha, ou porque o link que a pessoa recebeu já vinha com
   um filtro fino — escondê-lo faria a lista filtrar sem dizer por quê. */
function vitrineMaisFiltrosAberto(){
  if(state.vitrineMaisFiltros!==undefined&&state.vitrineMaisFiltros!==null) return !!state.vitrineMaisFiltros;
  return vitrineFiltrosFinosAtivos()>0;
}
function limparVitrineFiltros(){
  state.vitrineFiltros={busca:'',tipo:'',quartos:0,banheiros:0,suites:0,vagas:0,conservacao:'',
    faixa:'',precoMin:'',precoMax:'',areaMin:'',areaMax:'',bairro:'',responsavelId:'',categoria:'',ordem:'destaque',extras:[]};
  state.vitrineMaisFiltros=null;
  state.vitrinePubLimite=VITRINE_PAGINA;
  gravarFiltrosNaUrl();render();
}
function abrirVitrineDetalhe(id){
  /* O estado da lista precisa existir na entrada anterior do historico. Ao
     voltar do detalhe, o navegador entrega exatamente este scroll. */
  if(typeof history!=='undefined'){
    state.vitrineScrollLista=(typeof window!=='undefined'&&Number(window.scrollY))||0;
    history.replaceState(Object.assign({},history.state||{},{vitrine:true,vitrineScroll:state.vitrineScrollLista}),'',location.href);
  }
  state.vitrineComparacaoAberta=false;
  if(window._vitrineMapaResultados){try{window._vitrineMapaResultados.remove();}catch(e){}window._vitrineMapaResultados=null;}
  state.vitrineDetalheId=id;
  state.vitrineMapaAtivo=false;
  state.vitrineRecentes=[String(id)].concat((state.vitrineRecentes||[]).filter(function(x){return String(x)!==String(id);})).slice(0,12);
  salvarPreferenciaVitrine('recentes',state.vitrineRecentes);
  gravarFiltrosNaUrl(true);render();
  if(typeof window!=='undefined'&&window.scrollTo) window.scrollTo({top:0,behavior:'auto'});
  db.registrarVitrineVisita(id,'visualizacao');
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
  state.vitrineDetalheId=null;state.vitrineMapaAtivo=false;gravarFiltrosNaUrl();render();
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
    if(vitrinePrecoVigente(i)<=0)return false;
    /* A cidade entra na busca: quem digita "Lajedo" espera achar. */
    if(q&&!((i.titulo+' '+i.bairro+' '+(i.logradouro||'')+' '+i.codigo+' '+(i.cidade||''))
      .toLowerCase().includes(q)))return false;
    /* Categoria e tipo convivem: a categoria é a pergunta ampla do topo,
       o tipo é o afunilamento da lateral. Quem escolhe "Residencial" e
       depois "Kitnet" quer as duas coisas ao mesmo tempo. */
    if(f.categoria&&vitrineTiposDaCategoria(f.categoria).indexOf(i.tipo)===-1)return false;
    if(f.tipo&&i.tipo!==f.tipo)return false;
    if(f.quartos&&Number(i.quartos)<f.quartos)return false;
    if(f.banheiros&&Number(i.banheiros)<f.banheiros)return false;
    if(f.suites&&Number(i.suites)<f.suites)return false;
    if(f.conservacao&&i.conservacao!==f.conservacao)return false;
    if(f.vagas&&Number(i.vagas)<f.vagas)return false;
    if(f.bairro&&i.bairro!==f.bairro)return false;
    /* "Ver anúncios deste responsável", vindo do card da página do
       imóvel. Fica junto dos outros filtros para entrar na URL e no
       resumo de filtros ativos como qualquer outro. */
    if(f.responsavelId&&String(i.responsavelId||'')!==String(f.responsavelId))return false;
    if(f.faixa){
      const parts=f.faixa.split('-').map(Number);
      const v=vitrinePrecoVigente(i);
      if(v<parts[0]||v>parts[1])return false;
    }
    /* Valor digitado. Só entra quando a faixa pronta está desligada — os
       dois nunca ficam ligados ao mesmo tempo (ver setVitrineFiltro). */
    if(f.precoMin&&vitrinePrecoVigente(i)<Number(f.precoMin))return false;
    if(f.precoMax&&vitrinePrecoVigente(i)>Number(f.precoMax))return false;
    /* Quem pede área está pedindo um número. Anúncio sem área cadastrada
       fica de fora: mostrá-lo seria responder a pergunta com um talvez. */
    if(f.areaMin||f.areaMax){
      const area=Number(i.areaM2)||0;
      if(!area)return false;
      if(f.areaMin&&area<Number(f.areaMin))return false;
      if(f.areaMax&&area>Number(f.areaMax))return false;
    }
    return f.extras.every(function(x){
      if(x==='garagem')return Number(i.vagas)>0;
      if(x==='mobiliado')return !!i.mobiliado;
      if(x==='pet')return !!i.aceitaPet;
      if(x==='quintal')return !!i.quintal;
      if(x==='semFiador')return !i.exigeFiador;
      if(x.indexOf('comodidade:')===0){
        const codigo=x.slice(11);
        return (i.comodidades||[]).some(function(c){return c&&c.codigo===codigo;});
      }
      return true;
    });
  });
  /* Ordena pelo preço da aba aberta. Ordenar sempre por aluguel deixava a
     aba Comprar em ordem aleatória: num terreno à venda o aluguel é zero. */
  if(f.ordem==='menor')out.sort(function(a,b){return vitrinePrecoVigente(a)-vitrinePrecoVigente(b);});
  else if(f.ordem==='maior')out.sort(function(a,b){return vitrinePrecoVigente(b)-vitrinePrecoVigente(a);});
  else if(f.ordem==='area')out.sort(function(a,b){return (Number(b.areaM2)||0)-(Number(a.areaM2)||0);});
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
      '<a class="btn btn-primary" href="/">Área do proprietário</a></div></div>';
  }
  /* Página de privacidade: o formulário pede consentimento LGPD e até
     agora não havia para onde apontar. Sem ela também não se anuncia no
     Meta Ads nem no Google Ads. */
  if(vitrineRotaPublica().pagina==='privacidade'||new URLSearchParams(location.search).get('pagina')==='privacidade'){
    return '<div class="vitrine-public">'+renderVitrineTopoPublico(perfil,dados)+
      renderVitrinePrivacidade(perfil)+renderVitrineRodape(perfil,dados)+'</div>';
  }
  /* Anunciar: a página que transforma quem chegou para olhar imóvel em
     quem tem imóvel para colocar. Vem antes do detalhe porque é rota
     própria — não é um imóvel aberto. */
  if(vitrineRotaPublica().pagina==='anunciar'||new URLSearchParams(location.search).get('pagina')==='anunciar'){
    return '<div class="vitrine-public">'+renderVitrineTopoPublico(perfil,dados)+
      renderVitrineAnunciar(perfil)+renderVitrineRodape(perfil,dados)+
      renderVitrineParceiroModal(perfil)+'</div>';
  }
  if(state.vitrineDetalheId){
    const item=(dados.imoveis||[]).find(function(x){return x.id===state.vitrineDetalheId;});
    if(item)return '<div class="vitrine-public">'+renderVitrineTopoPublico(perfil,dados)+
      renderVitrineDetalhe(item,perfil)+renderVitrineRodape(perfil,dados)+
      renderVitrineLightbox()+renderVitrineAlertaModal()+renderVitrineVisitaModal()+'</div>';
  }
  /* Entrada do site: escolher a cidade primeiro. Quem não cadastrou
     cidade nenhuma cai direto na lista, como era antes. */
  const cidades=dados.cidades||[];
  if(cidades.length && !state.vitrinePubCidade){
    return '<div class="vitrine-public">'+renderVitrineTopoPublico(perfil,dados)+
      renderVitrineCidadesPublicas(dados)+renderVitrineRodape(perfil,dados)+'</div>';
  }
  return '<div class="vitrine-public vitrine-public-resultados">'+renderVitrineTopoPublico(perfil,dados)+
    renderVitrineBarraCidade(dados)+renderVitrineResultados(dados)+
    renderVitrineRodape(perfil,dados)+renderVitrineComparacaoBar()+renderVitrineComparacao()+
    renderVitrineBuscaModal()+'</div>';
}

/* ============================================================
   ANUNCIAR

   Quem já está no site olhando imóvel é o público mais barato que
   existe para captar quem TEM imóvel: chegou sozinho e já viu como o
   anúncio fica. A página existe para não desperdiçar isso.

   Os dois caminhos são os dois negócios, não os dois perfis. Um
   corretor pode querer qualquer um dos dois — e o que muda entre eles
   não é quem a pessoa é, é o que ela compra:

     divulgar  → usa seu público, seus imóveis aparecem na sua vitrine
     plataforma → tem o próprio portal e administra o próprio estoque

   Sem preço na tela, de propósito. O modelo de cobrança ainda não está
   fechado (por anúncio, mensalidade, % do aluguel), e número no ar é
   difícil de tirar depois. Quando fechar, entra em VITRINE_ANUNCIAR
   sem mexer no resto.
   ============================================================ */
const VITRINE_ANUNCIAR=[
  {id:'divulgar',
   olho:'PARA PROPRIETÁRIOS, CORRETORES E IMOBILIÁRIAS',
   titulo:'Anuncie na minha vitrine',
   sub:'Seu imóvel aparece para quem já está procurando aqui, com fotos, mapa e agendamento de visita.',
   marcas:['Sem mexer em site','Lead direto no WhatsApp','Agenda de visitas'],
   acao:'Quero anunciar meu imóvel'},
  {id:'plataforma',
   olho:'PARA CORRETORAS E IMOBILIÁRIAS',
   titulo:'Tenha sua própria plataforma',
   sub:'Seu portal, com sua marca e seu endereço. Você administra contratos, cobranças e inquilinos no mesmo lugar.',
   marcas:['Portal com sua marca','Gestão de contratos','Equipe com acessos'],
   acao:'Quero minha plataforma'}
];
function abrirVitrineParceiro(caminho){
  lembrarFocoVitrinePublica();
  state.vitrineParceiroModal={caminho:caminho,enviado:false};
  render();
}
function fecharVitrineParceiro(){
  state.vitrineParceiroModal=null;render();restaurarFocoVitrinePublica();
}
/* Os passos e os diferenciais ficam em dados, não em HTML solto: é o
   que muda quando você aprender, nas primeiras conversas, o que
   convence de verdade. Trocar texto aqui não mexe no desenho. */
const VITRINE_ANUNCIAR_PASSOS=[
  {n:'1',t:'Você conta o que tem',d:'Um formulário curto ou uma conversa no WhatsApp. Quantos imóveis, em que cidade, para alugar ou vender.'},
  {n:'2',t:'Eu monto o anúncio',d:'Fotos, valor, características, mapa e a ficha completa. Você não mexe em site, não cria conta, não aprende ferramenta.'},
  {n:'3',t:'O interessado fala com você',d:'Cada contato chega identificado, com o código do imóvel. Nada de e-mail perdido nem lead frio de portal.'}
];
const VITRINE_ANUNCIAR_DIFS=[
  {i:'🎯',t:'Seu imóvel não some no meio de mil',
   d:'Em portal grande você disputa a mesma tela com centenas de anúncios e paga para subir. Aqui a vitrine é pequena de propósito: quem entra vê o seu.'},
  {i:'💬',t:'Quem responde é gente daqui',
   d:'Sem central de atendimento, sem robô. O contato cai direto no WhatsApp de quem conhece o imóvel e a rua.'},
  {i:'📅',t:'A visita se marca sozinha',
   d:'O interessado escolhe dia e horário na própria página. Você recebe pronto, sem a ida e volta de mensagem para combinar.'},
  {i:'🔎',t:'Anúncio que responde antes de perguntarem',
   d:'Valor total com taxas, garantia aceita, o que está incluso, o que a região tem. Menos pergunta repetida, menos visita perdida.'},
  {i:'🤝',t:'Não acaba quando alugar',
   d:'Se quiser, o contrato, a cobrança e o inquilino continuam organizados aqui — não viram planilha e caderno depois da assinatura.'},
  {i:'📄',t:'Transparência de quem responde',
   d:'Toda página diz quem administra o imóvel, com etiqueta e avaliação de quem já alugou. Confiança é o que fecha locação.'}
];
const VITRINE_ANUNCIAR_RECEBE={
  divulgar:['Página própria do imóvel, com endereço fixo para compartilhar','Fotos em tamanho grande e mapa da região',
    'Cálculo do custo mensal já somado (aluguel, condomínio, IPTU)','Agenda de visitas e contato direto no WhatsApp',
    'Texto pronto para colar em grupo e rede social'],
  plataforma:['Portal com sua marca, seu nome e seu endereço','Contratos, cobranças e recibos no mesmo lugar',
    'Portal do inquilino: ele consulta pagamento e documento sozinho','Acessos separados para sua equipe, com o que cada um pode ver',
    'Leitura de energia, manutenção, vistoria e backup dos seus dados']
};
function renderVitrineAnunciar(perfil){
  const casa=esc((perfil&&perfil.nome)||'nossa vitrine');
  const cartoes='<div class="va-cartoes">'+VITRINE_ANUNCIAR.map(function(c){
    return '<article class="va-cartao va-'+c.id+'">'+
      '<span class="va-olho">'+esc(c.olho)+'</span>'+
      '<h2>'+esc(c.titulo)+'</h2>'+
      '<p>'+esc(c.sub)+'</p>'+
      '<ul class="va-marcas">'+c.marcas.map(function(m){
        return '<li><span aria-hidden="true">✓</span>'+esc(m)+'</li>';
      }).join('')+'</ul>'+
      '<button type="button" class="va-acao" onclick="abrirVitrineParceiro(\''+c.id+'\')">'+
        esc(c.acao)+' <span aria-hidden="true">→</span></button>'+
    '</article>';
  }).join('')+'</div>';

  return '<div class="va-pagina">'+
    '<section class="vitrine-anunciar">'+
      '<header class="va-topo">'+
        '<span class="eyebrow">ANUNCIAR</span>'+
        '<h1>Coloque seu imóvel na '+casa+'</h1>'+
        '<p>Escolha por onde começar. Nos dois casos quem responde é gente, não formulário: '+
          'a gente conversa antes de qualquer proposta.</p>'+
      '</header>'+
      cartoes+
      /* Diz que preço se conversa, em vez de deixar a pergunta no ar. Quem
         chega até aqui vai perguntar de qualquer jeito. */
      '<p class="va-nota">Ainda não há tabela pública: o valor depende de quantos imóveis você tem e de '+
        'como prefere pagar. Conte sua situação no formulário e eu respondo com uma proposta.</p>'+
    '</section>'+

    '<section class="va-secao va-como">'+
      '<div class="va-secao-in">'+
        '<span class="eyebrow">COMO FUNCIONA</span>'+
        '<h2>Três passos, e o trabalho é meu</h2>'+
        '<div class="va-passos">'+VITRINE_ANUNCIAR_PASSOS.map(function(p){
          return '<div class="va-passo"><b>'+p.n+'</b><div><strong>'+esc(p.t)+'</strong>'+
            '<span>'+esc(p.d)+'</span></div></div>';
        }).join('')+'</div>'+
      '</div>'+
    '</section>'+

    '<section class="va-secao va-difs-secao">'+
      '<div class="va-secao-in">'+
        '<span class="eyebrow">POR QUE AQUI</span>'+
        '<h2>O que você não encontra num portal grande</h2>'+
        '<div class="va-difs">'+VITRINE_ANUNCIAR_DIFS.map(function(d){
          return '<article class="va-dif"><i aria-hidden="true">'+d.i+'</i>'+
            '<strong>'+esc(d.t)+'</strong><p>'+esc(d.d)+'</p></article>';
        }).join('')+'</div>'+
      '</div>'+
    '</section>'+

    '<section class="va-secao va-recebe-secao">'+
      '<div class="va-secao-in">'+
        '<span class="eyebrow">O QUE VOCÊ RECEBE</span>'+
        '<h2>Preto no branco, por caminho</h2>'+
        '<div class="va-recebe">'+VITRINE_ANUNCIAR.map(function(c){
          return '<div class="va-recebe-col va-recebe-'+c.id+'">'+
            '<h3>'+esc(c.titulo)+'</h3>'+
            '<ul>'+VITRINE_ANUNCIAR_RECEBE[c.id].map(function(x){
              return '<li><span aria-hidden="true">✓</span>'+esc(x)+'</li>';
            }).join('')+'</ul>'+
            '<button type="button" class="va-acao" onclick="abrirVitrineParceiro(\''+c.id+'\')">'+
              esc(c.acao)+' <span aria-hidden="true">→</span></button>'+
          '</div>';
        }).join('')+'</div>'+
      '</div>'+
    '</section>'+

    /* Fechamento: quem rolou até aqui está convencido e não deveria ter
       de subir de volta para achar o botão. */
    '<section class="va-fechamento">'+
      '<h2>Vamos conversar?</h2>'+
      '<p>Sem compromisso e sem cadastro. Me conte sua situação e eu digo o que dá para fazer.</p>'+
      '<div class="va-fechamento-acoes">'+VITRINE_ANUNCIAR.map(function(c){
        return '<button type="button" class="va-acao va-acao-'+c.id+'" onclick="abrirVitrineParceiro(\''+c.id+'\')">'+
          esc(c.acao)+' <span aria-hidden="true">→</span></button>';
      }).join('')+'</div>'+
    '</section>'+
  '</div>';
}
function renderVitrineParceiroModal(perfil){
  const m=state.vitrineParceiroModal;
  if(!m)return '';
  const cfg=VITRINE_ANUNCIAR.find(function(c){return c.id===m.caminho;})||VITRINE_ANUNCIAR[0];
  const tel=String((perfil&&perfil.contato)||'').replace(/\D/g,'');
  const wa=tel?('https://wa.me/'+(tel.length<=11?'55'+tel:tel)+'?text='+
    encodeURIComponent('Olá! Vi a página de anunciar e tenho interesse: '+cfg.titulo+'.')):'';
  if(m.enviado){
    return '<div class="vitrine-modal-publico" role="dialog" aria-modal="true">'+
      '<button type="button" class="vitrine-modal-fundo" aria-label="Fechar" onclick="fecharVitrineParceiro()"></button>'+
      '<section class="va-form va-form-ok"><h2>Recebido</h2>'+
      '<p>Vou olhar e responder no WhatsApp que você deixou. Se preferir adiantar, chama direto.</p>'+
      (wa?'<a class="va-enviar" href="'+esc(wa)+'" target="_blank" rel="noopener">Chamar no WhatsApp</a>':'')+
      '<button type="button" class="va-fechar" onclick="fecharVitrineParceiro()">Fechar</button></section></div>';
  }
  return '<div class="vitrine-modal-publico" role="dialog" aria-modal="true" aria-labelledby="vaFormTitulo">'+
    '<button type="button" class="vitrine-modal-fundo" aria-label="Fechar" onclick="fecharVitrineParceiro()"></button>'+
    '<section class="va-form">'+
      '<span class="eyebrow">'+esc(cfg.olho)+'</span>'+
      '<h2 id="vaFormTitulo">'+esc(cfg.titulo)+'</h2>'+
      /* Quatro campos. Cada campo a mais aqui é gente que desiste no
         meio — o resto se pergunta na conversa. */
      '<label class="field"><span>Seu nome *</span><input id="va_nome" autocomplete="name"></label>'+
      '<label class="field"><span>WhatsApp *</span><input id="va_tel" inputmode="tel" autocomplete="tel" placeholder="(00) 0 0000-0000"></label>'+
      '<div class="field-row">'+
        '<label class="field"><span>Cidade</span><input id="va_cidade" autocomplete="address-level2"></label>'+
        '<label class="field"><span>Quantos imóveis</span><select id="va_qtd">'+
          ['1','2 a 5','6 a 20','mais de 20'].map(function(o){return '<option>'+o+'</option>';}).join('')+
        '</select></label>'+
      '</div>'+
      '<label class="field"><span>Algo que eu deva saber</span>'+
        '<textarea id="va_msg" rows="2" maxlength="600" placeholder="Opcional"></textarea></label>'+
      '<label class="va-consent"><input type="checkbox" id="va_ok">'+
        '<span>Autorizo o contato pelo WhatsApp informado.</span></label>'+
      '<div class="va-form-acoes">'+
        '<button type="button" class="va-fechar" onclick="fecharVitrineParceiro()">Cancelar</button>'+
        '<button type="button" class="va-enviar" onclick="enviarVitrineParceiro()">Enviar</button>'+
      '</div>'+
      (wa?'<a class="va-atalho" href="'+esc(wa)+'" target="_blank" rel="noopener">ou chamar direto no WhatsApp</a>':'')+
    '</section></div>';
}
async function enviarVitrineParceiro(){
  const v=function(id){const e=document.getElementById(id);return e?e.value.trim():'';};
  const nome=v('va_nome'),telefone=v('va_tel');
  if(nome.length<2){showToast('Escreva seu nome.','error');return;}
  if(telefone.replace(/\D/g,'').length<10){showToast('Confira o WhatsApp.','error');return;}
  if(!document.getElementById('va_ok').checked){showToast('Marque a autorização de contato.','error');return;}
  try{
    await db.registrarParceiroVitrine({
      slug:vitrinePerfilSlug(),
      caminho:(state.vitrineParceiroModal||{}).caminho||'divulgar',
      nome:nome,telefone:telefone,cidade:v('va_cidade'),
      quantidade:v('va_qtd'),mensagem:v('va_msg')
    });
    state.vitrineParceiroModal={caminho:(state.vitrineParceiroModal||{}).caminho,enviado:true};
    render();
  }catch(e){ console.error(e);showToast((e&&e.message)||'Não foi possível enviar agora.','error'); }
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
  const priv=new URL(vitrineCaminhoPublico({pagina:'privacidade'}),location.origin);
  return '<footer class="vitrine-rodape">'+
    '<div class="vr-marca"><strong>'+esc((perfil&&perfil.nome)||'Imóveis')+'</strong>'+
      (perfil&&perfil.creci?'<span>CRECI '+esc(perfil.creci)+'</span>':'')+'</div>'+
    (nomes.length?'<div class="vr-cidades"><span>Atendemos</span><p>'+esc(nomes.join(' · '))+'</p></div>':'')+
    '<div class="vr-links">'+
      (wa?'<a href="'+esc(wa)+'" target="_blank" rel="noopener">Falar no WhatsApp</a>':'')+
      '<a href="'+esc(new URL(vitrineCaminhoPublico({pagina:'anunciar'}),location.origin).toString())+'">Anunciar imóvel</a>'+
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
  history.replaceState(history.state||null,'',vitrineCaminhoPublico());
  state.vitrineDetalheId=null;state.vitrinePubCidade='';
  atualizarSeoVitrine();
  render();
}
function toggleVitrineFiltrosMobile(aberto){const novo=aberto===undefined?!state.vitrineFiltrosMobile:!!aberto;if(novo)lembrarFocoVitrinePublica();state.vitrineFiltrosMobile=novo;render();if(!novo)restaurarFocoVitrinePublica();}

/* ---------- entrada por cidade ---------- */
/* ------------------------------------------------------------
   ARTE DO HERÓI

   Um mapa de cidade desenhado em SVG, quase fundido no verde da marca.
   Feito à mão em vez de foto por três razões: não pesa no carregamento
   (é texto), não envelhece quando o imóvel da foto aluga, e não depende
   de ninguém subir imagem.

   A opacidade é baixa de propósito — é textura, não ilustração. Se der
   para "ver o mapa" à primeira vista, está forte demais e rouba o
   título.
   ------------------------------------------------------------ */
function vitrineArteCidade(){
  /* O monumento de Lajedo, em traço, no verde da marca — arte enviada
     pelo próprio dono do site.

     Vai como <img> e não inline: são 330 KB de path, que dentro do
     vitrine.js viriam junto em toda navegação. Como arquivo, o
     navegador guarda em cache uma vez e pronto.

     `alt` vazio e aria-hidden: é decoração. Quem usa leitor de tela
     não ganha nada ouvindo "monumento" antes do título. */
  return '<img class="vh-arte" src="/vitrine-lajedo.svg" alt="" aria-hidden="true" '+
    'loading="lazy" decoding="async">';
}
const VITRINE_HERO_TIPOS=[
  ['casa','Casas','⌂'],['apartamento','Apartamentos','▤'],
  ['comercial','Pontos comerciais','▥'],['terreno','Terrenos','◱'],['chacara','Chácaras','✦']
];
/* A cidade que o herói representa: a primeira com imóvel. Enquanto
   houver uma só, é sempre ela. */
function vitrineCidadesComImovel(){
  return (((state.vitrinePublic||{}).cidades)||[]).filter(function(c){
    return (Number(c.totalAlugar)||0)+(Number(c.totalVender)||0)>0;
  });
}
function vitrineCidadePrincipal(){
  const cidades=((state.vitrinePublic||{}).cidades)||[];
  return cidades.find(function(c){
    return (Number(c.totalAlugar)||0)+(Number(c.totalVender)||0)>0;
  })||cidades[0]||null;
}
function marcarFinalidadeHero(btn){
  const grupo=btn.parentNode;
  grupo.querySelectorAll('button').forEach(function(b){b.classList.toggle('on',b===btn);});
}
function vitrineIrParaLista(extra){
  const c=vitrineCidadePrincipal();
  if(c) state.vitrinePubCidade=String(c.id);
  state.vitrineDetalheId=null;
  state.vitrinePubLimite=VITRINE_PAGINA;
  Object.assign(state.vitrineFiltros,extra||{});
  gravarFiltrosNaUrl(true);render();
  window.scrollTo({top:0,behavior:'auto'});
}
function buscarNaVitrine(ev){
  if(ev&&ev.preventDefault)ev.preventDefault();
  const termo=(document.getElementById('vh_termo')||{}).value||'';
  const fim=document.querySelector('.vh-busca-fim button.on');
  state.vitrinePubFinalidade=(fim&&fim.getAttribute('data-fim')==='vender')?'vender':'alugar';
  vitrineIrParaLista({busca:termo.trim(),tipo:'',categoria:''});
}
function buscarTipoNaVitrine(tipo){
  vitrineIrParaLista({tipo:tipo,categoria:'',busca:''});
}
function renderVitrineCidadesPublicas(dados){
  const cidades=(dados.cidades||[]).slice().sort(function(a,b){
    return (a.ordem-b.ordem)||String(a.nome).localeCompare(String(b.nome),'pt-BR');
  });
  const imoveis=dados.imoveis||[],perfil=dados.perfil||{};
  const total=imoveis.length;
  const contato=String(perfil.contato||'').replace(/\D/g,'');
  const wa=contato?'https://wa.me/'+(contato.length<=11?'55'+contato:contato):'';
  /* A cidade principal é o assunto da tela. Enquanto houver uma só,
     perguntar "qual cidade?" é obstáculo: a pessoa escolhe entre uma
     opção. O herói fala de Lajedo e a busca leva direto à lista. */
  const principal=cidades.find(function(c){
    return (Number(c.totalAlugar)||0)+(Number(c.totalVender)||0)>0;
  })||cidades[0]||null;
  const nomeCidade=principal?principal.nome:(perfil.cidadeSede||'');
  return '<main class="vitrine-cidades-page">'+
    '<section class="vitrine-hero" aria-labelledby="vitrineHeroTitulo">'+
      vitrineArteCidade()+
      '<div class="vh-conteudo">'+
        '<span class="eyebrow">'+(nomeCidade?esc(nomeCidade.toUpperCase())+(principal&&principal.uf?' · '+esc(principal.uf):''):'IMÓVEIS E TERRENOS')+'</span>'+
        '<h2 id="vitrineHeroTitulo">Imóveis para alugar e comprar'+(nomeCidade?' em '+esc(nomeCidade):'')+'.</h2>'+
        '<p>'+esc(perfil.descricao||'Casas, apartamentos, pontos comerciais, terrenos e chácaras — com informações claras e atendimento de perto.')+'</p>'+
        '<form class="vh-busca" onsubmit="buscarNaVitrine(event)">'+
          '<div class="vh-busca-campo">'+
            '<i aria-hidden="true">⌕</i>'+
            '<input id="vh_termo" placeholder="Bairro, rua ou código do imóvel" aria-label="Buscar por bairro, rua ou código">'+
          '</div>'+
          '<div class="vh-busca-fim" role="group" aria-label="O que você procura">'+
            '<button type="button" class="on" data-fim="alugar" onclick="marcarFinalidadeHero(this)">Alugar</button>'+
            '<button type="button" data-fim="vender" onclick="marcarFinalidadeHero(this)">Comprar</button>'+
          '</div>'+
          '<button type="submit" class="vh-busca-enviar">Ver imóveis</button>'+
        '</form>'+
        '<div class="vh-tipos">'+VITRINE_HERO_TIPOS.map(function(t){
          return '<button type="button" onclick="buscarTipoNaVitrine(\''+t[0]+'\')">'+
            '<span aria-hidden="true">'+t[2]+'</span>'+esc(t[1])+'</button>';
        }).join('')+'</div>'+
        '<div class="vh-selos"><span>Atendimento local</span><span>Informações transparentes</span><span>Contato direto</span>'+
          (wa?'<a href="'+esc(wa)+'" target="_blank" rel="noopener">Falar no WhatsApp</a>':'')+'</div>'+
      '</div>'+
    '</section>'+
    /* Cidade vazia na lista é promessa que o site não cumpre. Enquanto
       houver uma só com imóvel, a escolha de cidade não aparece: o
       herói já disse qual é. */
    (vitrineCidadesComImovel().length>1
      ? '<section class="vitrine-cidades-escolha" id="cidadesAtendidas" aria-labelledby="vitrineCidadesTitulo">'+
    '<div class="vitrine-cidades-intro"><span class="eyebrow">ONDE VOCÊ QUER MORAR OU INVESTIR?</span><h2 id="vitrineCidadesTitulo">Escolha uma cidade</h2>'+
      '<p>Veja apenas os imóveis da região que interessa a você.</p></div>'+
    '<div class="vitrine-cidades-grid">'+cidades.map(function(c){
      const alugar=Number(c.totalAlugar)||0, vender=Number(c.totalVender)||0;
      const vazia=(alugar+vender)===0;
      const imovelCidade=imoveis.find(function(i){return String(i.cidadeId||'')===String(c.id);});
      const foto=imovelCidade?vitrineCardFotos(imovelCidade)[0]||'':'';
      return '<button class="vitrine-cidade-card'+(vazia?' is-vazia':'')+'" '+
        (vazia?'disabled aria-disabled="true"':'onclick="escolherVitrineCidade(\''+esc(c.id)+'\')"')+'>'+
        '<span class="vitrine-cidade-foto">'+(foto?'<img src="'+esc(foto)+'" alt="" loading="lazy" decoding="async">':'<span class="vitrine-cidade-inicial" aria-hidden="true">'+esc(String(c.nome||'?').trim().charAt(0).toUpperCase())+'</span>')+'</span>'+
        '<span class="vitrine-cidade-conteudo"><span class="vitrine-cidade-txt"><strong>'+esc(c.nome)+'</strong><small>'+esc(c.uf)+'</small></span>'+
        '<span class="vitrine-cidade-tags">'+
          (alugar?'<i>'+alugar+' para alugar</i>':'')+
          (vender?'<i class="venda">'+vender+' à venda</i>':'')+
          (vazia?'<i class="vazio">em breve</i>':'')+
        '</span><span class="vitrine-cidade-abrir">Ver imóveis <b aria-hidden="true">→</b></span></span></button>';
    }).join('')+'</div></section>'
      : '')+ 
    '<section class="vitrine-cidades-ajuda"><div><span class="eyebrow">ATENDIMENTO HUMANO</span><h2>Não encontrou o que procura?</h2><p>Conte para a gente o tipo de imóvel, a faixa de valor e a região. Avisamos quando aparecer uma opção compatível.</p></div>'+
      (wa?'<a class="btn btn-primary" href="'+esc(wa)+'" target="_blank" rel="noopener">Conversar no WhatsApp</a>':'')+
    '</section></main>';
}
function escolherVitrineCidade(id){
  state.vitrinePubCidade=id||'';
  state.vitrineFiltros.bairro='';
  state.vitrinePubLimite=VITRINE_PAGINA;
  gravarFiltrosNaUrl(true);render();
  if(typeof window!=='undefined'&&window.scrollTo) window.scrollTo({top:0,behavior:'smooth'});
}
/* ------------------------------------------------------------
   "IMÓVEIS" DO TOPO

   Antes eram dois itens — "Cidades" e "Encontrar imóvel" — que faziam
   quase a mesma coisa, e o segundo era um link de fragmento (#ancora).
   Com <base href="/"> no index.html, um href só-fragmento resolve
   contra a BASE e não contra a página: `#cidadesAtendidas` virava
   `/#cidadesAtendidas`, apagava `/vitrine/slug/...` da URL e o boot,
   sem slug, caía na tela de login. Quem clicava para ver imóveis
   recebia "Como você quer entrar?".

   A <base> tem de ficar: sem ela, app.js e style.css quebram nas URLs
   profundas (/vitrine/slug/imovel/id/titulo/). Então o caminho é não
   usar link de fragmento — este botão navega por estado, como o resto
   da vitrine já faz.

   Um item só, honesto: leva ao catálogo de onde você estiver, e rola
   até ele quando você já está lá. Trocar de cidade continua na barra
   de cidade da própria lista.
   ------------------------------------------------------------ */
function irParaImoveisVitrine(){
  const rota=vitrineRotaPublica();
  const foraDoCatalogo=!!state.vitrineDetalheId||rota.pagina==='anunciar'||rota.pagina==='privacidade';
  if(foraDoCatalogo){
    if(window._vitrineMapa){try{window._vitrineMapa.remove();}catch(e){}window._vitrineMapa=null;}
    state.vitrineDetalheId=null;state.vitrineMapaAtivo=false;
    gravarFiltrosNaUrl(true);render();
    window.scrollTo({top:0,behavior:'auto'});
    return;
  }
  /* Já no catálogo: rola até o que interessa — a lista quando há cidade
     escolhida, o seletor de cidade quando ainda não há. */
  const alvo=document.getElementById('imoveisDisponiveis')||document.getElementById('cidadesAtendidas');
  if(alvo)alvo.scrollIntoView({behavior:'smooth'});
  else window.scrollTo({top:0,behavior:'smooth'});
}
function voltarVitrineCidades(){
  if(window._vitrineMapa){try{window._vitrineMapa.remove();}catch(e){}window._vitrineMapa=null;}
  if(window._vitrineMapaResultados){try{window._vitrineMapaResultados.remove();}catch(e){}window._vitrineMapaResultados=null;}
  state.vitrineDetalheId=null;state.vitrineMapaAtivo=false;state.vitrineFiltrosMobile=false;
  state.vitrinePubCidade='';
  gravarFiltrosNaUrl(true);render();
}
function setVitrinePubFinalidade(f){
  state.vitrinePubFinalidade=(f==='vender')?'vender':'alugar';
  /* A faixa de preço de aluguel não faz sentido em venda, e vice-versa. */
  state.vitrineFiltros.faixa='';
  /* A tabela nunca mistura aluguel e venda. Trocar de finalidade limpa a
     selecao, mas preserva os favoritos do visitante. */
  state.vitrineComparacao=[];state.vitrineComparacaoAberta=false;
  salvarPreferenciaVitrine('comparacao',[]);
  state.vitrinePubLimite=VITRINE_PAGINA;
  gravarFiltrosNaUrl();render();
}
function setVitrinePubModo(modo){
  const novo=['cards','lista','mapa'].includes(modo)?modo:'cards';
  if(novo===state.vitrinePubModo)return;
  if(window._vitrineMapaResultados){try{window._vitrineMapaResultados.remove();}catch(e){}window._vitrineMapaResultados=null;}
  state.vitrinePubModo=novo;
  gravarFiltrosNaUrl();render();
}
function setVitrineCategoria(id){
  state.vitrineFiltros.categoria=(state.vitrineFiltros.categoria===id)?'':id;
  /* Trocar de categoria com um tipo escolhido na lateral daria zero
     resultado sem explicar por quê — "Comercial" + tipo "Kitnet" não
     existe. O tipo sai junto. */
  if(state.vitrineFiltros.categoria) state.vitrineFiltros.tipo='';
  state.vitrinePubLimite=VITRINE_PAGINA;
  gravarFiltrosNaUrl();render();
}
/* O "Trocar" da lateral de filtros abria a tela de cidades e a pessoa
   perdia filtro e rolagem. Agora ele abre a mesma lista suspensa do
   topo — uma escolha só, um jeito só de fazê-la. */
function escolherCidadeVitrine(id){
  if(window._vitrineMapaResultados){try{window._vitrineMapaResultados.remove();}catch(e){}window._vitrineMapaResultados=null;}
  state.vitrinePubCidade=String(id||'');
  state.vitrineDetalheId=null;
  state.vitrinePubLimite=VITRINE_PAGINA;
  gravarFiltrosNaUrl(true);render();
  window.scrollTo({top:0,behavior:'auto'});
}
/* Barra fixa da cidade escolhida + as duas abas. */
function renderVitrineBarraCidade(dados){
  const cidades=dados.cidades||[];
  const atual=cidades.find(function(c){return String(c.id)===String(state.vitrinePubCidade);});
  const vender=state.vitrinePubFinalidade==='vender';
  const contaAlugar=atual?(Number(atual.totalAlugar)||0):(dados.imoveis||[]).filter(vitrineServeAlugar).length;
  const contaVender=atual?(Number(atual.totalVender)||0):(dados.imoveis||[]).filter(vitrineServeVender).length;
  const cat=state.vitrineFiltros.categoria||'';
  /* Contagem por categoria dentro da finalidade aberta: mostrar
     "Comercial 0" evita o clique que leva a uma tela vazia. */
  const base=(dados.imoveis||[]).filter(function(i){
    if(atual&&String(i.cidadeId||'')!==String(atual.id))return false;
    return vender?vitrineServeVender(i):vitrineServeAlugar(i);
  });
  const contaCat=function(id){
    const tipos=vitrineTiposDaCategoria(id);
    return base.filter(function(i){return tipos.indexOf(i.tipo)!==-1;}).length;
  };
  return '<section class="vitrine-cidade-barra"><div class="vitrine-cidade-barra-in"><div class="vitrine-cidade-contexto">'+
    /* A troca de cidade vive na lateral de filtros, junto de Bairro:
       era a mesma escolha em dois lugares, e este roubava o espaço da
       esquerda que o título agora ocupa. */
    '<div><span class="eyebrow">BUSCAR IMÓVEIS</span>'+
      (atual?'<h1 class="vitrine-cidade-atual">'+esc(atual.nome)+' <small>'+esc(atual.uf)+'</small></h1>':'<h1 class="vitrine-cidade-atual">Imóveis disponíveis</h1>')+
    '</div></div>'+
    /* Uma barra só para as duas decisões: o que fazer com o imóvel
       (alugar/comprar) e que tipo de imóvel (residencial/comercial/
       terreno). São a primeira pergunta de quem chega. */
    '<div class="vitrine-busca-modos">'+
      '<div class="vitrine-finalidade" role="group" aria-label="O que você procura">'+
        '<button class="'+(vender?'':'on')+'" aria-pressed="'+(!vender)+'" onclick="setVitrinePubFinalidade(\'alugar\')">'+
          'Alugar <i>'+contaAlugar+'</i></button>'+
        '<button class="'+(vender?'on':'')+'" aria-pressed="'+vender+'" onclick="setVitrinePubFinalidade(\'vender\')">'+
          'Comprar <i>'+contaVender+'</i></button>'+
      '</div>'+
      '<div class="vitrine-categorias" role="group" aria-label="Categoria de imóvel">'+
        '<button class="'+(cat?'':'on')+'" aria-pressed="'+(!cat)+'" onclick="setVitrineCategoria(\'\')">Todos</button>'+
        VITRINE_CATEGORIAS.map(function(c){
          const n=contaCat(c.id);
          return '<button class="'+(cat===c.id?'on':'')+'" aria-pressed="'+(cat===c.id)+'"'+
            (n?'':' disabled title="Nenhum imóvel nesta categoria agora"')+
            ' onclick="setVitrineCategoria(\''+c.id+'\')">'+
            '<span aria-hidden="true">'+c.icone+'</span>'+esc(c.rotulo)+' <i>'+n+'</i></button>';
        }).join('')+
      '</div>'+
    '</div></div></section>';
}

function renderVitrineTopoPublico(perfil,dados){
  const total=(dados.imoveis||[]).length;
  const marca=perfil.logoUrl
    ?'<img class="vitrine-brand-logo-img" src="'+esc(perfil.logoUrl)+'" alt="Logo de '+esc(perfil.nome||'imobiliária')+'">'
    :logoSvg();
  const tel=String(perfil.contato||'').replace(/\D/g,'');
  const wa=tel?'https://wa.me/'+(tel.length<=11?'55'+tel:tel):'';
  return '<header class="vitrine-pub-top"><div class="vitrine-pub-top-in">'+
    '<button class="vitrine-brand-publica" onclick="voltarVitrineCidades()" aria-label="Ir para o início">'+marca+
      '<span><small>IMÓVEIS E TERRENOS</small><strong>'+esc(perfil.nome||'Imóveis disponíveis')+'</strong>'+
      (perfil.cidadeSede?'<i>'+esc(perfil.cidadeSede)+(perfil.ufSede?' · '+esc(perfil.ufSede):'')+'</i>':'')+'</span></button>'+ 
    '<nav class="vitrine-pub-nav" aria-label="Navegação principal">'+
      /* O rótulo diz para onde leva, não o nome da seção. Na entrada do
         site a escolha é a cidade; imóvel só existe depois dela. Chamar
         de "Imóveis" ali prometia uma lista que ainda não há. */
      /* "Cidades" só faz sentido quando há mais de uma. Com uma só,
         escolher cidade é escolher entre uma opção — e o rótulo
         prometia uma tela que não vale a viagem. */
      '<button onclick="irParaImoveisVitrine()">'+
        ((!state.vitrinePubCidade&&vitrineCidadesComImovel().length>1)?'Cidades':'Imóveis')+'</button>'+
      /* Quem tem imóvel para colocar está no meio de quem procura imóvel.
         O link fica no topo, marcado, porque é a única coisa aqui que
         fala com o outro lado do balcão. */
      '<a class="vitrine-pub-anunciar" href="'+esc(vitrineCaminhoPublico({pagina:'anunciar'}))+'">'+
        '<span aria-hidden="true">●</span>Anunciar</a>'+
      (wa?'<a class="vitrine-pub-contato" href="'+esc(wa)+'" target="_blank" rel="noopener">Falar conosco</a>':'')+
    '</nav><span class="vitrine-pub-count">'+total+' disponíve'+(total===1?'l':'is')+'</span>'+ 
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
function vitrineExtrasDisponiveis(dados){
  const base=[['garagem','Garagem','especiais'],['mobiliado','Mobiliado','especiais'],
    ['pet','Aceita pet','especiais'],['quintal','Quintal','especiais'],
    ['semFiador','Sem fiador','especiais']];
  const catalogo=new Map();
  (dados.imoveis||[]).forEach(function(i){
    (i.comodidades||[]).forEach(function(c){
      if(c&&c.codigo&&!catalogo.has(c.codigo))catalogo.set(c.codigo,[
        'comodidade:'+c.codigo,c.rotulo||c.codigo,String(c.grupo||'imovel')
      ]);
    });
  });
  return base.concat(Array.from(catalogo.values()).sort(function(a,b){
    return a[2].localeCompare(b[2],'pt-BR')||a[1].localeCompare(b[1],'pt-BR');
  }));
}
function vitrineFiltrosAtivos(){
  const f=state.vitrineFiltros,ativos=[];
  const add=function(key,label){if(label)ativos.push({key:key,label:label});};
  if(f.busca)add('busca','Busca: '+f.busca);
  if(f.categoria){const c=VITRINE_CATEGORIAS.find(function(x){return x.id===f.categoria;});add('categoria',c&&c.rotulo);}
  if(f.tipo)add('tipo',vitrineTipoLabel(f.tipo));
  if(f.quartos)add('quartos',f.quartos+'+ quartos');
  if(f.banheiros)add('banheiros',f.banheiros+'+ banheiros');
  if(f.suites)add('suites',f.suites+'+ suítes');
  if(f.vagas)add('vagas',f.vagas+'+ vagas');
  if(f.conservacao)add('conservacao',vitrineConservacaoLabel(f.conservacao));
  if(f.faixa){const faixa=vitrineFaixasPreco().find(function(x){return x[0]===f.faixa;});add('faixa',faixa&&faixa[1]);}
  if(f.precoMin)add('precoMin','A partir de '+fmtMoney(Number(f.precoMin)));
  if(f.precoMax)add('precoMax','Até '+fmtMoney(Number(f.precoMax)));
  if(f.areaMin)add('areaMin','Área desde '+f.areaMin+' m²');
  if(f.areaMax)add('areaMax','Área até '+f.areaMax+' m²');
  if(f.bairro)add('bairro',f.bairro);
  if(f.responsavelId){
    const r=((state.vitrinePublic||{}).responsaveis||{})[String(f.responsavelId)];
    add('responsavelId','Anúncios de '+((r&&r.nome)||'um responsável'));
  }
  const rotulos=new Map(vitrineExtrasDisponiveis(state.vitrinePublic||{}));
  (f.extras||[]).forEach(function(x){add('extra:'+x,rotulos.get(x)||x.replace('comodidade:',''));});
  return ativos;
}
function removerVitrineFiltro(chave){
  if(chave.indexOf('extra:')===0){
    const extra=chave.slice(6);
    state.vitrineFiltros.extras=(state.vitrineFiltros.extras||[]).filter(function(x){return x!==extra;});
  }else if(VITRINE_FILTROS_INTEIROS.includes(chave))state.vitrineFiltros[chave]=0;
  else state.vitrineFiltros[chave]='';
  state.vitrinePubLimite=VITRINE_PAGINA;gravarFiltrosNaUrl();render();
}
function renderVitrineFiltrosAtivos(){
  const ativos=vitrineFiltrosAtivos();if(!ativos.length)return '';
  return '<div class="vitrine-filtros-ativos" aria-label="Filtros ativos"><span>Filtros ativos</span>'+ativos.map(function(x){
    return '<button type="button" onclick="removerVitrineFiltro(\''+esc(x.key)+'\')" aria-label="Remover '+esc(x.label)+'">'+
      esc(x.label)+' <b aria-hidden="true">×</b></button>';
  }).join('')+'<button type="button" class="vitrine-limpar-todos" onclick="limparVitrineFiltros()">Limpar tudo</button></div>';
}
function renderVitrineResultados(dados){
  return '<div class="vitrine-resultados" id="imoveisDisponiveis">'+
    renderVitrineFiltros(dados)+renderVitrineGrid()+'</div>';
}
function vitrineOpcoesContagem(campo,rotulo){
  const f=state.vitrineFiltros;
  return '<div class="vitrine-filtro-contagem"><span>'+esc(rotulo)+'</span><div class="vitrine-contagem-opcoes" role="group" aria-label="'+esc(rotulo)+'">'+
    [0,1,2,3,4].map(function(n){
      const on=f[campo]===n;
      return '<button type="button" class="'+(on?'on':'')+'" aria-pressed="'+on+'" aria-label="'+esc(rotulo)+': '+(n?n+' ou mais':'qualquer quantidade')+'" onclick="setVitrineFiltro(\''+campo+'\','+n+')">'+(n?n+'+':'−')+'</button>';
    }).join('')+'</div></div>';
}
function vitrineCampoValor(campo,rotulo,dica){
  const f=state.vitrineFiltros;
  return '<label class="vitrine-filtro-campo"><span>'+esc(rotulo)+'</span><input id="vitf_'+campo+'" type="text" inputmode="numeric" value="'+esc(f[campo])+'" placeholder="'+esc(dica)+'" oninput="setVitrineFiltro(\''+campo+'\',this.value)"></label>';
}
function vitrineOpcoesExtras(lista){
  const f=state.vitrineFiltros;
  return '<div class="vitrine-filtro-opcoes">'+lista.map(function(x){
    const on=f.extras.includes(x[0]);
    return '<button type="button" class="vitrine-filtro-opcao'+(on?' on':'')+'" aria-pressed="'+on+'" onclick="toggleVitrineExtra(\''+esc(x[0])+'\')"><span aria-hidden="true">'+(on?'✓':'')+'</span>'+esc(x[1])+'</button>';
  }).join('')+'</div>';
}
function renderVitrineFiltros(dados){
  const f=state.vitrineFiltros;
  const bairros=[...new Set((dados.imoveis||[]).map(function(i){return i.bairro;}).filter(Boolean))].sort();
  const extras=vitrineExtrasDisponiveis(dados);
  const especiais=extras.filter(function(x){return x[2]==='especiais';});
  const comodidades=extras.filter(function(x){return x[2]!=='especiais';});
  const ativos=vitrineFiltrosAtivos().length;
  const resultados=vitrineImoveisFiltrados().length;
  const atual=vitrineCidadePublicaPorId(state.vitrinePubCidade);
  const cidades=dados.cidades||[];
  /* O par Alugar/Comprar saiu daqui — já existe na barra do topo, maior.
     Mas a finalidade continua definindo o exemplo do campo de valor:
     aluguel é conta de centenas, venda é de dezenas de milhares. */
  const vender=state.vitrinePubFinalidade==='vender';
  return '<div class="vitrine-filtros-mobile-bar"><button type="button" onclick="toggleVitrineFiltrosMobile(true)">'+
      '<span aria-hidden="true">☷</span> Filtros'+(ativos?' <b>'+ativos+'</b>':'')+'</button>'+
      '<span>'+resultados+' resultado'+(resultados===1?'':'s')+'</span></div>'+
    '<aside class="vitrine-filtros'+(state.vitrineFiltrosMobile?' is-open':'')+'"'+
      (state.vitrineFiltrosMobile?' role="dialog" aria-modal="true" aria-label="Filtros"':' aria-label="Filtros de imóveis"')+'>'+
      '<button type="button" class="vitrine-filtros-backdrop" aria-label="Fechar filtros" onclick="toggleVitrineFiltrosMobile(false)"></button>'+ 
      '<div class="vitrine-filtros-painel"><div class="vitrine-filtros-mobile-head"><strong>Filtrar imóveis</strong><button type="button" aria-label="Fechar filtros" onclick="toggleVitrineFiltrosMobile(false)">×</button></div>'+ 
      '<header class="vitrine-filtros-cab"><div><span>REFINE SUA BUSCA</span><h2>Filtros</h2></div>'+ 
        '<button type="button" onclick="limparVitrineFiltros()"><span aria-hidden="true">×</span> Limpar</button></header>'+ 
      '<div class="vitrine-filtros-scroll">'+
      '<details class="vitrine-filtro-grupo" open><summary><span>⌖</span>Localização</summary><div class="vitrine-filtro-conteudo">'+
        '<label class="vitrine-busca"><span aria-hidden="true">⌕</span><input id="vitf_busca" value="'+esc(f.busca)+'" placeholder="Bairro, rua ou código…" oninput="setVitrineFiltro(\'busca\',this.value)"></label>'+ 
        /* Cidade no mesmo formato do Bairro: uma lista, um gesto. O
           botão "Trocar" abria a lista suspensa do topo — eram dois
           lugares para a mesma escolha, e o de cima saiu. */
        (cidades.length?'<label class="vitrine-filtro-campo"><span>Cidade</span>'+
          '<select class="vitrine-sel" onchange="escolherCidadeVitrine(this.value)">'+
          cidades.map(function(c){
            const n=(Number(c.totalAlugar)||0)+(Number(c.totalVender)||0);
            return '<option value="'+esc(c.id)+'"'+(atual&&String(c.id)===String(atual.id)?' selected':'')+'>'+
              esc(c.nome)+' · '+esc(c.uf)+' ('+n+')</option>';
          }).join('')+'</select></label>':'')+
        '<label class="vitrine-filtro-campo"><span>Bairro</span><select class="vitrine-sel" onchange="setVitrineFiltro(\'bairro\',this.value)"><option value="">Todos os bairros</option>'+bairros.map(function(b){return '<option'+(f.bairro===b?' selected':'')+'>'+esc(b)+'</option>';}).join('')+'</select></label>'+ 
      '</div></details>'+ 
      '<details class="vitrine-filtro-grupo" open><summary><span>R$</span>Tipo e preço</summary><div class="vitrine-filtro-conteudo">'+
        '<label class="vitrine-filtro-campo"><span>Tipo de imóvel</span><select class="vitrine-sel" onchange="setVitrineFiltro(\'tipo\',this.value)"><option value="">Todos os tipos</option>'+VITRINE_TIPOS.map(function(t){return '<option value="'+t[0]+'"'+(f.tipo===t[0]?' selected':'')+'>'+t[1]+'</option>';}).join('')+'</select></label>'+ 
        '<label class="vitrine-filtro-campo"><span>Faixa de valor</span><select class="vitrine-sel" onchange="setVitrineFiltro(\'faixa\',this.value)">'+vitrineFaixasPreco().map(function(o){return '<option value="'+o[0]+'"'+(f.faixa===o[0]?' selected':'')+'>'+o[1]+'</option>';}).join('')+'</select></label>'+ 
        '<div class="vitrine-filtro-par">'+vitrineCampoValor('precoMin','Valor mínimo',vender?'80.000':'600')+vitrineCampoValor('precoMax','Valor máximo',vender?'250.000':'1.800')+'</div>'+ 
      '</div></details>'+ 
      '<details class="vitrine-filtro-grupo"><summary><span>⌂</span>Características</summary><div class="vitrine-filtro-conteudo">'+
        (f.tipo==='terreno'?'':vitrineOpcoesContagem('quartos','Quartos')+vitrineOpcoesContagem('banheiros','Banheiros')+vitrineOpcoesContagem('suites','Suítes')+vitrineOpcoesContagem('vagas','Vagas'))+
        /* Garagem, mobiliado, quintal e companhia moravam num grupo
           chamado "Filtros especiais", que não dizia nada: são
           características do imóvel como quarto e banheiro, e estavam
           a dois cliques de distância deles sem motivo. */
        (especiais.length?vitrineOpcoesExtras(especiais):'')+
        '<div class="vitrine-filtro-par">'+vitrineCampoValor('areaMin','Área mínima (m²)','50')+vitrineCampoValor('areaMax','Área máxima (m²)','300')+'</div>'+ 
        (f.tipo==='terreno'?'':'<label class="vitrine-filtro-campo"><span>Conservação</span><select class="vitrine-sel" onchange="setVitrineFiltro(\'conservacao\',this.value)">'+VITRINE_CONSERVACOES.map(function(c){return '<option value="'+c[0]+'"'+(f.conservacao===c[0]?' selected':'')+'>'+(c[0]?c[1]:'Qualquer')+'</option>';}).join('')+'</select></label>')+
      '</div></details>'+ 
      (comodidades.length?'<details class="vitrine-filtro-grupo"><summary><span>✦</span>Comodidades <i>'+comodidades.length+'</i></summary><div class="vitrine-filtro-conteudo">'+vitrineOpcoesExtras(comodidades)+'</div></details>':'')+
      '</div><div class="vitrine-filtros-desktop-foot"><button type="button" onclick="document.getElementById(\'vitrineResultadosConteudo\').scrollIntoView({behavior:\'smooth\',block:\'start\'})"><span aria-hidden="true">⌕</span> Ver '+resultados+' imóve'+(resultados===1?'l':'is')+'</button></div>'+ 
      '<div class="vitrine-filtros-mobile-foot"><button type="button" class="btn btn-ghost" onclick="limparVitrineFiltros()">Limpar</button><button type="button" class="btn btn-primary" onclick="toggleVitrineFiltrosMobile(false)">Ver '+resultados+' imóve'+(resultados===1?'l':'is')+'</button></div>'+ 
    '</div></aside>';
}

function renderVitrineBotaoMaisFiltros(){
  const aberto=vitrineMaisFiltrosAberto();
  const n=vitrineFiltrosFinosAtivos();
  return '<button class="vitrine-chip vitrine-chip-mais'+(n?' on':'')+'" '+
    'aria-expanded="'+aberto+'" aria-controls="vitrineFiltrosFinos" '+
    'onclick="toggleVitrineMaisFiltros()">'+
    '<span aria-hidden="true">'+(aberto?'▴':'▾')+'</span> Mais filtros'+
    (n?'<i class="vitrine-chip-conta">'+n+'</i>':'')+'</button>';
}

/* Banheiros, vagas, área e valor exato. Ficam recolhidos porque a maioria
   das buscas termina nos seis controles de cima — mas quem procura ponto
   comercial ou terreno começa por aqui. */
function renderVitrineFiltrosFinos(){
  const f=state.vitrineFiltros;
  if(!vitrineMaisFiltrosAberto()) return '';
  const terreno=f.tipo==='terreno';
  const num=function(campo,rotulo,dica){
    return '<label class="vitrine-num"><span>'+esc(rotulo)+'</span>'+
      '<input id="vitf_'+campo+'" type="text" inputmode="numeric" value="'+esc(f[campo])+'" '+
      'placeholder="'+esc(dica)+'" oninput="setVitrineFiltro(\''+campo+'\',this.value)"></label>';
  };
  const contagem=function(campo,rotulo){
    return '<label class="vitrine-num"><span>'+esc(rotulo)+'</span>'+
      '<select class="vitrine-sel" onchange="setVitrineFiltro(\''+campo+'\',this.value)">'+
      '<option value="0">Qualquer</option>'+[1,2,3,4].map(function(n){
        return '<option value="'+n+'"'+(f[campo]===n?' selected':'')+'>'+n+'+</option>';
      }).join('')+'</select></label>';
  };
  /* A dica do valor acompanha a aba: em venda, "800" como piso de aluguel
     não quer dizer nada. */
  const vender=state.vitrinePubFinalidade==='vender';
  return '<div class="vitrine-filtros-finos" id="vitrineFiltrosFinos">'+
    (terreno?'':contagem('banheiros','Banheiros')+contagem('suites','Suítes')+contagem('vagas','Vagas'))+
    (terreno?'':'<label class="vitrine-num"><span>Conservação</span>'+
      '<select class="vitrine-sel" onchange="setVitrineFiltro(\'conservacao\',this.value)">'+
      VITRINE_CONSERVACOES.map(function(c){
        return '<option value="'+c[0]+'"'+(f.conservacao===c[0]?' selected':'')+'>'+
          (c[0]===''?'Qualquer':c[1])+'</option>';
      }).join('')+'</select></label>')+
    '<div class="vitrine-par"><span class="vitrine-par-tit">Área (m²)</span>'+
      '<div>'+num('areaMin','mínima','50')+num('areaMax','máxima','300')+'</div></div>'+
    '<div class="vitrine-par"><span class="vitrine-par-tit">Valor exato (R$)</span>'+
      '<div>'+num('precoMin','de',vender?'80000':'600')+
             num('precoMax','até',vender?'250000':'1800')+'</div></div>'+
    (vitrineFiltrosFinosAtivos()
      ? '<button class="vitrine-limpar-finos" onclick="limparVitrineFiltrosFinos()">Limpar estes</button>'
      : '')+
  '</div>';
}
function limparVitrineFiltrosFinos(){
  const f=state.vitrineFiltros;
  f.banheiros=0;f.suites=0;f.vagas=0;f.conservacao='';
  f.precoMin='';f.precoMax='';f.areaMin='';f.areaMax='';
  state.vitrinePubLimite=VITRINE_PAGINA;
  gravarFiltrosNaUrl();render();
}

function renderVitrineGrid(){
  const lista=vitrineImoveisFiltrados();
  const limite=Number(state.vitrinePubLimite)||VITRINE_PAGINA;
  const visiveis=lista.slice(0,limite);
  const faltam=lista.length-visiveis.length;
  const modo=['cards','lista','mapa'].includes(state.vitrinePubModo)?state.vitrinePubModo:'cards';
  const cidade=vitrineCidadePublicaPorId(state.vitrinePubCidade);
  const acao=state.vitrinePubFinalidade==='vender'?'à venda':'para alugar';
  return '<main class="vitrine-pub-main vitrine-resultados-main" id="vitrineResultadosConteudo">'+
    '<header class="vitrine-resultados-topo"><div><span class="eyebrow">'+lista.length+' RESULTADO'+(lista.length===1?'':'S')+'</span><h2>Imóveis '+acao+(cidade?' em '+esc(cidade.nome):'')+'</h2></div>'+ 
      '<div class="vitrine-resultados-acoes"><label class="vitrine-ordem"><span class="sr-only">Ordenar por</span><select onchange="setVitrineFiltro(\'ordem\',this.value)">'+
        [['destaque','Relevância'],['novos','Mais recentes'],['menor','Menor preço'],['maior','Maior preço'],['area','Maior área']].map(function(o){return '<option value="'+o[0]+'"'+(state.vitrineFiltros.ordem===o[0]?' selected':'')+'>'+o[1]+'</option>';}).join('')+'</select></label>'+ 
        renderVitrineModos()+
        '<button type="button" class="vitrine-salvar-busca" onclick="abrirVitrineBuscaModal(false)"><span aria-hidden="true">♡</span> Salvar busca</button>'+ 
      '</div></header>'+renderVitrineFiltrosAtivos()+
    (lista.length?(modo==='mapa'?renderVitrineMapaResultados(lista):'<div class="vitrine-grid is-'+modo+'">'+visiveis.map(function(i,n){return renderVitrineCard(i,n);}).join('')+'</div>'+ 
       /* A lista inteira de uma vez custava uma foto de 1920 px por
          cartão. No 4G do interior isso é a diferença entre a pessoa
          esperar e a pessoa desistir. */
       (faltam>0?'<div class="vitrine-mais"><button class="btn btn-primary" onclick="verMaisVitrine()">'+
         'Ver mais '+Math.min(faltam,VITRINE_PAGINA)+' de '+faltam+'</button></div>':''))
     :'<div class="vitrine-pub-empty"><h2>Nenhum imóvel com esses filtros</h2>'+
       '<p>Tente ampliar a faixa de preço, remover o bairro ou ver todos os tipos.</p>'+
       '<div class="vitrine-empty-alternativas">'+
         ((state.vitrineFiltros.faixa||state.vitrineFiltros.precoMin||state.vitrineFiltros.precoMax)
           ?'<button class="btn btn-ghost" onclick="limparVitrinePrecos()">Remover limite de preço</button>':'')+
         (state.vitrineFiltros.tipo?'<button class="btn btn-ghost" onclick="removerVitrineFiltro(\'tipo\')">Ver todos os tipos</button>':'')+
         '<button class="btn btn-primary" onclick="limparVitrineFiltros()">Limpar todos os filtros</button></div></div>')+
    (modo==='mapa'?'':renderVitrineRecentes())+'</main>';
}

function renderVitrineModos(){
  const modo=state.vitrinePubModo||'cards';
  const opcoes=[['lista','☷','Lista'],['cards','▦','Cards'],['mapa','⌖','Mapa']];
  return '<div class="vitrine-modos" role="group" aria-label="Forma de visualizar">'+opcoes.map(function(o){
    const on=modo===o[0];
    return '<button type="button" class="'+(on?'on':'')+'" aria-pressed="'+on+'" onclick="setVitrinePubModo(\''+o[0]+'\')"><span aria-hidden="true">'+o[1]+'</span>'+o[2]+'</button>';
  }).join('')+'</div>';
}

function renderVitrineMapaResultadoCard(i){
  const foto=vitrineCardFotos(i)[0]||'';
  const preco=vitrinePrecoVigente(i);
  return '<button type="button" class="vitrine-mapa-card" onclick="abrirVitrineDetalhe(\''+esc(i.id)+'\')">'+
    (foto?'<img src="'+esc(foto)+'" alt="" loading="lazy" decoding="async">':'<span class="vitrine-mapa-card-sem-foto">'+houseIconSvg()+'</span>')+
    '<span><small>'+esc(vitrineTipoLabel(i.tipo))+' · '+esc(i.bairro||i.cidade||'Localização sob consulta')+'</small><strong>'+esc(i.titulo)+'</strong><b>'+fmtMoney(preco)+(state.vitrinePubFinalidade==='vender'?'':' / mês')+'</b></span></button>';
}
function renderVitrineMapaResultados(lista){
  const localizados=lista.filter(function(i){return Number.isFinite(Number(i.latitude))&&Number.isFinite(Number(i.longitude))&&Number(i.latitude)!==0&&Number(i.longitude)!==0;});
  return '<div class="vitrine-mapa-resultados">'+
    '<section class="vitrine-mapa-lista" aria-label="Imóveis mostrados no mapa"><header><div><strong>'+lista.length+' imóve'+(lista.length===1?'l':'is')+'</strong><span>'+localizados.length+' no mapa</span></div>'+
      (lista.length!==localizados.length?'<p>Alguns anúncios protegem a localização e aparecem somente na lista.</p>':'')+'</header><div>'+lista.map(renderVitrineMapaResultadoCard).join('')+'</div></section>'+
    '<section class="vitrine-mapa-canvas-wrap" aria-label="Mapa dos imóveis">'+
      '<div id="vitrineMapaResultados" class="vitrine-mapa-canvas"></div>'+ 
      (localizados.length?'':'<div class="vitrine-mapa-sem-pinos"><span aria-hidden="true">⌖</span><strong>Localização protegida</strong><p>Estes imóveis não divulgam um ponto no mapa. Abra o anúncio para consultar a região.</p></div>')+
      '<div class="vitrine-mapa-legenda"><span></span> Clique no valor para ver o imóvel</div>'+ 
    '</section></div>';
}

function vitrineResumoBusca(){
  const cidade=vitrineCidadePublicaPorId(state.vitrinePubCidade),itens=[];
  itens.push(state.vitrinePubFinalidade==='vender'?'Comprar':'Alugar');
  if(cidade)itens.push(cidade.nome);
  vitrineFiltrosAtivos().forEach(function(x){itens.push(x.label);});
  return itens.join(' · ');
}
function vitrineAssinaturaBusca(){
  const f=Object.assign({},state.vitrineFiltros,{extras:(state.vitrineFiltros.extras||[]).slice().sort()});
  delete f.ordem;
  return JSON.stringify({finalidade:state.vitrinePubFinalidade,cidadeId:state.vitrinePubCidade||'',filtros:f});
}
function abrirVitrineBuscaModal(gerenciar){lembrarFocoVitrinePublica();state.vitrineBuscaModal={gerenciar:!!gerenciar};render();}
function fecharVitrineBuscaModal(){state.vitrineBuscaModal=false;render();restaurarFocoVitrinePublica();}
function renderVitrineBuscaModal(){
  if(!state.vitrineBuscaModal)return '';
  const salvas=state.vitrineBuscasSalvas||[],gerenciar=state.vitrineBuscaModal.gerenciar;
  return '<div class="vitrine-modal-publico" role="dialog" aria-modal="true" aria-labelledby="vitrineBuscaTitulo"><button class="vitrine-modal-fundo" aria-label="Fechar" onclick="fecharVitrineBuscaModal()"></button><section><header><div><span class="eyebrow">PREFERÊNCIAS LOCAIS</span><h2 id="vitrineBuscaTitulo">'+(gerenciar?'Minhas buscas':'Salvar esta busca')+'</h2></div><button aria-label="Fechar" onclick="fecharVitrineBuscaModal()">×</button></header>'+ 
    (gerenciar?'<div class="vitrine-salvos">'+(salvas.length?salvas.map(function(b,n){return '<article><div><strong>'+esc(b.nome||'Busca salva')+'</strong><span>'+esc(b.resumo||'')+'</span>'+(b.token?'<small>Alerta '+esc(b.frequencia)+' ativo</small>':'<small>Salva somente neste aparelho</small>')+'</div><button class="btn btn-ghost" onclick="aplicarVitrineBusca('+n+')">Aplicar</button><button class="btn btn-danger" onclick="removerVitrineBusca('+n+')">Excluir</button></article>';}).join(''):'<p>Nenhuma busca salva neste aparelho.</p>')+'</div>':
      '<p class="vitrine-modal-resumo">'+esc(vitrineResumoBusca())+'</p>'+ 
      '<label class="field"><span>Nome da busca</span><input id="vit_busca_nome" maxlength="80" value="Minha busca"></label>'+ 
      '<label class="field"><span>Acompanhamento (opcional)</span><select id="vit_busca_freq" onchange="alternarVitrineBuscaContato(this.value)"><option value="">Só salvar neste aparelho</option><option value="diaria">Pedir acompanhamento diário</option><option value="semanal">Pedir acompanhamento semanal</option></select></label>'+ 
      '<div id="vit_busca_contato" hidden><label class="field"><span>Canal</span><select id="vit_busca_canal"><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option></select></label><label class="field"><span>Telefone ou e-mail</span><input id="vit_busca_destino"></label><label class="vitrine-consent"><input type="checkbox" id="vit_busca_ok"><span>Autorizo receber alertas desta busca. Posso cancelar quando quiser.</span></label></div>'+ 
      '<button class="btn btn-primary btn-block" id="vit_busca_salvar" onclick="salvarVitrineBusca()">Salvar busca</button>')+'</section></div>';
}
function alternarVitrineBuscaContato(v){const e=document.getElementById('vit_busca_contato');if(e)e.hidden=!v;}
async function salvarVitrineBusca(){
  const get=function(id){const e=document.getElementById(id);return e?String(e.value||'').trim():'';};
  const freq=get('vit_busca_freq'),assinatura=vitrineAssinaturaBusca();
  if((state.vitrineBuscasSalvas||[]).some(function(b){return b.assinatura===assinatura;})){showToast('Esta busca já está salva.','error');return;}
  const item={id:'local-'+Date.now(),nome:get('vit_busca_nome')||'Minha busca',resumo:vitrineResumoBusca(),assinatura:assinatura,
    finalidade:state.vitrinePubFinalidade,cidadeId:state.vitrinePubCidade||'',filtros:JSON.parse(JSON.stringify(state.vitrineFiltros)),frequencia:freq,createdAt:new Date().toISOString()};
  try{
    if(freq){
      if(!(document.getElementById('vit_busca_ok')||{}).checked)throw new Error('Autorize o envio do alerta para continuar.');
      const destino=get('vit_busca_destino'),canal=get('vit_busca_canal');if(destino.length<6)throw new Error('Informe um contato válido.');
      const remoto=await db.salvarVitrineBuscaPublica(Object.assign({},item,{slug:vitrinePerfilSlug(),canal:canal,destino:destino,consentimento:true}));
      item.token=remoto.token;item.canal=canal;
    }
    state.vitrineBuscasSalvas=[item].concat(state.vitrineBuscasSalvas||[]).slice(0,20);salvarPreferenciaVitrine('buscas',state.vitrineBuscasSalvas);
    fecharVitrineBuscaModal();showToast(freq?'Busca salva e acompanhamento solicitado.':'Busca salva neste aparelho.','success');
  }catch(e){showToast((e&&e.message)||'Não foi possível salvar a busca.','error');}
}
function aplicarVitrineBusca(n){const b=(state.vitrineBuscasSalvas||[])[n];if(!b)return;state.vitrinePubFinalidade=b.finalidade;state.vitrinePubCidade=b.cidadeId;state.vitrineFiltros=JSON.parse(JSON.stringify(b.filtros));state.vitrineBuscaModal=false;gravarFiltrosNaUrl(true);render();}
async function removerVitrineBusca(n){
  const b=(state.vitrineBuscasSalvas||[])[n];if(!b)return;
  try{if(b.token)await db.cancelarVitrineBuscaPublica(b.token);state.vitrineBuscasSalvas.splice(n,1);salvarPreferenciaVitrine('buscas',state.vitrineBuscasSalvas);render();showToast('Busca removida.','success');}
  catch(e){showToast((e&&e.message)||'Não foi possível cancelar o alerta.','error');}
}
function renderVitrineRecentes(){
  const ids=state.vitrineRecentes||[],dados=state.vitrinePublic||{};
  const itens=ids.map(function(id){return (dados.imoveis||[]).find(function(i){return String(i.id)===String(id);});}).filter(Boolean).slice(0,4);
  if(!itens.length)return '';
  return '<section class="vitrine-recentes"><header><h2>Vistos recentemente</h2><button onclick="limparVitrineRecentes()">Limpar histórico</button></header><div>'+itens.map(function(i){return '<button onclick="abrirVitrineDetalhe(\''+i.id+'\')"><strong>'+esc(i.titulo)+'</strong><span>'+esc(i.bairro||i.cidade||'')+' · '+(vitrinePrecoVigente(i)>0?fmtMoney(vitrinePrecoVigente(i)):'Consulte')+'</span></button>';}).join('')+'</div></section>';
}
function limparVitrineRecentes(){state.vitrineRecentes=[];salvarPreferenciaVitrine('recentes',[]);render();}
function limparVitrinePrecos(){
  const f=state.vitrineFiltros;f.faixa='';f.precoMin='';f.precoMax='';
  state.vitrinePubLimite=VITRINE_PAGINA;gravarFiltrosNaUrl();render();
}
function verMaisVitrine(){
  state.vitrinePubLimite=(Number(state.vitrinePubLimite)||VITRINE_PAGINA)+VITRINE_PAGINA;
  render();
}

/* Fotos que a grade usa: miniatura quando existe, foto grande como
   reserva. A grande só é baixada no detalhe — no 4G do interior isso é a
   diferença entre a pessoa esperar e a pessoa desistir. */
function vitrineCardFotos(i){
  const mini=(i&&i.thumbUrls)||[], grandes=(i&&i.fotoUrls)||[];
  const quantas=Math.max(mini.length,grandes.length);
  const out=[];
  for(let n=0;n<quantas;n++){ const u=mini[n]||grandes[n]; if(u) out.push(u); }
  return out;
}
/* Em que foto cada cartão está. Fica fora do state de propósito: é
   posição de olhar, não dado do imóvel — mas sobrevive ao render(), senão
   trocar um filtro voltaria todo mundo para a capa. */
const _vitrineCardFoto={};
function vitrineCardIndice(id,total){
  const n=Number(_vitrineCardFoto[id])||0;
  return (n>=0&&n<total)?n:0;
}
/* Passa a foto sem re-renderizar a página: troca o src da imagem que já
   está na tela. Uma <img> só por cartão — as outras fotos só são baixadas
   quando alguém pede para ver. */
function passarVitrineCardFoto(ev,id,passo){
  if(ev&&ev.stopPropagation) ev.stopPropagation();
  const dados=state.vitrinePublic||{};
  const i=(dados.imoveis||[]).find(function(x){return String(x.id)===String(id);});
  if(!i) return;
  const fotos=vitrineCardFotos(i);
  if(fotos.length<2) return;
  const total=fotos.length;
  const n=((vitrineCardIndice(id,total)+passo)%total+total)%total;
  _vitrineCardFoto[id]=n;
  const img=document.getElementById('vcimg_'+id);
  const conta=document.getElementById('vcn_'+id);
  if(img){
    img.src=fotos[n];
    img.srcset=fotos[n]+' 640w';
    img.alt='Foto '+(n+1)+' de '+total+' — '+i.titulo;
  }
  if(conta) conta.textContent=(n+1)+' / '+total;
}
/* Deslizar o dedo. Mesma regra do lightbox: só conta gesto claramente
   horizontal, senão rolar a lista com o dedo torto troca de foto. */
let _vcToqueX=0,_vcToqueY=0;
function vitrineCardToqueInicio(ev){
  const t=ev.changedTouches&&ev.changedTouches[0];if(!t)return;
  _vcToqueX=t.clientX;_vcToqueY=t.clientY;
}
function vitrineCardToqueFim(ev,id){
  const t=ev.changedTouches&&ev.changedTouches[0];if(!t)return;
  const dx=t.clientX-_vcToqueX, dy=t.clientY-_vcToqueY;
  if(Math.abs(dx)<40||Math.abs(dx)<Math.abs(dy))return;
  /* Sem isto o fim do gesto vira clique e abre o anúncio no meio do folhear. */
  if(ev.preventDefault) ev.preventDefault();
  passarVitrineCardFoto(ev,id,dx<0?1:-1);
}

function renderVitrineCard(i,indice){
  const fotos=vitrineCardFotos(i);
  const varias=fotos.length>1;
  const atual=vitrineCardIndice(i.id,fotos.length||1);
  const foto=fotos[atual]||'';
  const total=vitrineTotalMes(i);
  const dupla=vitrineServeAlugar(i)&&vitrineServeVender(i);
  const favorito=(state.vitrineFavoritos||[]).includes(String(i.id));
  const comparando=(state.vitrineComparacao||[]).includes(String(i.id));
  const specs=[];
  if(Number(i.quartos)>0)specs.push('<span><b>'+i.quartos+'</b> quartos</span>');
  if(Number(i.banheiros)>0)specs.push('<span><b>'+i.banheiros+'</b> banh.</span>');
  if(Number(i.vagas)>0)specs.push('<span><b>'+i.vagas+'</b> vaga'+(Number(i.vagas)===1?'':'s')+'</span>');
  if(Number(i.areaM2)>0)specs.push('<span><b>'+i.areaM2+'</b> m²</span>');
  const selo=dupla?'ALUGAR OU COMPRAR':(vitrineServeVender(i)?'À VENDA':'PARA ALUGAR');
  /* O cartão virou <article> para caber o folhear das fotos: seta dentro
     de botão é HTML inválido e o clique na seta abria o anúncio. O acesso
     por teclado não se perdeu — quem dá Tab cai no botão do corpo, que é
     o que abre, e depois nas setas. */
  return '<article class="vitrine-card">'+
    '<div class="vitrine-card-foto"'+
      (varias?' ontouchstart="vitrineCardToqueInicio(event)" ontouchend="vitrineCardToqueFim(event,\''+i.id+'\')"':'')+'>'+
      /* A foto abre o anúncio no clique, mas não é parada de Tab: o botão
         do corpo já faz isso, e duas paradas para a mesma ação atrapalham
         quem navega por teclado. */
      '<button type="button" class="vitrine-card-capa" tabindex="-1" aria-hidden="true" '+
        'onclick="abrirVitrineDetalhe(\''+i.id+'\')">'+
        (foto?'<img id="vcimg_'+esc(i.id)+'" src="'+esc(foto)+'" srcset="'+esc(foto)+' 640w" onerror="vitrineImagemFalhou(this,\''+esc(i.id)+'\')" '+
              'sizes="(max-width:720px) calc(100vw - 40px), (max-width:1180px) 33vw, 360px" width="640" height="426" '+
              'alt="Foto de '+esc(i.titulo)+'" loading="lazy" decoding="async" fetchpriority="'+(indice===0?'high':'low')+'">'
             :'<span class="vitrine-sem-foto">'+houseIconSvg()+'</span>')+
      '</button>'+
      '<div class="vitrine-card-acoes">'+
        '<button type="button" class="vitrine-card-acao'+(favorito?' on':'')+'" aria-pressed="'+favorito+'" '+
          'aria-label="'+(favorito?'Remover dos favoritos':'Salvar nos favoritos')+'" title="Favoritar" '+
          'onclick="toggleVitrineFavorito(event,\''+i.id+'\')">♥</button>'+
        '<button type="button" class="vitrine-card-acao'+(comparando?' on':'')+'" aria-pressed="'+comparando+'" '+
          'aria-label="'+(comparando?'Remover da comparação':'Adicionar à comparação')+'" title="Comparar" '+
          'onclick="toggleVitrineComparacao(event,\''+i.id+'\')">⇄</button></div>'+
      /* A grade mistura aluguel e venda. Sem dizer qual é qual na foto,
         quem procura casa para alugar abre anúncio de venda e vice-versa. */
      '<span class="vitrine-selo'+(dupla?' dois':'')+'">'+esc(selo)+'</span>'+
      (i.destaque?'<span class="vitrine-badge">★ DESTAQUE</span>':'')+
      (varias
        ? '<button type="button" class="vc-nav vc-ant" aria-label="Foto anterior de '+esc(i.titulo)+'" '+
            'onclick="passarVitrineCardFoto(event,\''+i.id+'\',-1)">‹</button>'+
          '<button type="button" class="vc-nav vc-prox" aria-label="Próxima foto de '+esc(i.titulo)+'" '+
            'onclick="passarVitrineCardFoto(event,\''+i.id+'\',1)">›</button>'+
          '<span class="vitrine-fotos-n" id="vcn_'+esc(i.id)+'" aria-hidden="true">'+
            (atual+1)+' / '+fotos.length+'</span>'
        : '')+
    '</div>'+
    '<button type="button" class="vitrine-card-abrir vitrine-card-body" '+
      'onclick="abrirVitrineDetalhe(\''+i.id+'\')">'+
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
        : '<div class="vitrine-specs">'+(specs.join('')||'<span>Consulte as características</span>')+'</div>')+
    '</button></article>';
}

function vitrineComparacaoItens(){
  const ids=state.vitrineComparacao||[],dados=state.vitrinePublic||{};
  return ids.map(function(id){return (dados.imoveis||[]).find(function(i){return String(i.id)===String(id);});})
    .filter(function(i){return i&&(state.vitrinePubFinalidade==='vender'?vitrineServeVender(i):vitrineServeAlugar(i));});
}
function renderVitrineComparacaoBar(){
  const itens=vitrineComparacaoItens();if(!itens.length)return '';
  return '<aside class="vitrine-comparacao-bar" aria-label="Imóveis para comparar"><span><b>'+itens.length+'</b> selecionado'+(itens.length===1?'':'s')+'</span>'+
    '<button type="button" class="btn btn-ghost" onclick="limparComparacaoVitrine()">Limpar</button>'+
    '<button type="button" class="btn btn-primary" '+(itens.length<2?'disabled':'onclick="abrirComparacaoVitrine()"')+'>Comparar</button></aside>';
}
function renderVitrineComparacao(){
  if(!state.vitrineComparacaoAberta)return '';
  const itens=vitrineComparacaoItens();
  const valor=function(i){return state.vitrinePubFinalidade==='vender'?fmtMoney(i.precoVenda):fmtMoney(i.aluguel)+'/mês';};
  const celulas=function(fn){return itens.map(function(i){return '<td>'+fn(i)+'</td>';}).join('');};
  const textoComodidades=function(i){return (i.comodidades||[]).map(function(c){return c.rotulo;}).slice(0,8).join(', ')||'—';};
  const linhas=[
    ['Valor',function(i){return '<strong>'+valor(i)+'</strong>';}],
    ...(state.vitrinePubFinalidade==='alugar'?[['Total mensal',function(i){return fmtMoney(vitrineTotalMes(i));}]]:[]),
    ['Tipo',function(i){return esc(vitrineTipoLabel(i.tipo));}],
    ['Localização',function(i){return esc([i.bairro,i.cidade].filter(Boolean).join(' · ')||'Consulte');}],
    ['Área',function(i){return i.areaM2?esc(i.areaM2)+' m²':'—';}],
    ['Quartos',function(i){return vitrineEhTerreno(i.tipo)?'—':esc(i.quartos||0);}],
    ['Suítes',function(i){return vitrineEhTerreno(i.tipo)?'—':esc(i.suites||0);}],
    ['Banheiros',function(i){return vitrineEhTerreno(i.tipo)?'—':esc(i.banheiros||0);}],
    ['Vagas',function(i){return vitrineEhTerreno(i.tipo)?'—':esc(i.vagas||0);}],
    /* Estes quatro saíram da página do imóvel quando são "Não" — lá a
       ausência é ruído. Aqui é o contrário: é justamente o "Não" ao
       lado do "Sim" do vizinho que decide a escolha, e é o que faz o
       filtro "apenas diferenças" acima ter serventia. */
    ['Quintal',function(i){return vitrineEhTerreno(i.tipo)?'—':(i.quintal?'Sim':'Não');}],
    ['Mobiliado',function(i){return vitrineEhTerreno(i.tipo)?'—':(i.mobiliado?'Sim':'Não');}],
    ['Aceita pet',function(i){return vitrineEhTerreno(i.tipo)?'—':(i.aceitaPet?'Sim':'Não');}],
    ['Área de serviço',function(i){return vitrineEhTerreno(i.tipo)?'—':(i.areaServico?'Sim':'Não');}],
    ...(state.vitrinePubFinalidade==='alugar'?[['Garantias',function(i){return esc((i.garantiasAceitas||[]).join(', ')||i.caucao||'A combinar');}],['Contrato mínimo',function(i){return esc(i.contratoMinimoMeses||12)+' meses';}]]:[]),
    ['Comodidades',function(i){return esc(textoComodidades(i));}]
  ];
  const visiveis=state.vitrineComparacaoSoDiferencas?linhas.filter(function(l){const vals=itens.map(function(i){return l[1](i);});return vals.some(function(v){return v!==vals[0];});}):linhas;
  return '<div class="vitrine-comparacao-modal" role="dialog" aria-modal="true" aria-labelledby="vitrineComparacaoTitulo">'+
    '<button type="button" class="vitrine-comparacao-backdrop" aria-label="Fechar comparação" onclick="fecharComparacaoVitrine()"></button>'+
    '<section><header><div><span class="eyebrow">LADO A LADO</span><h2 id="vitrineComparacaoTitulo">Comparar imóveis</h2></div>'+
      '<button type="button" aria-label="Fechar comparação" onclick="fecharComparacaoVitrine()">×</button></header>'+
    '<label class="vitrine-comparacao-diferencas"><input type="checkbox" '+(state.vitrineComparacaoSoDiferencas?'checked':'')+' onchange="state.vitrineComparacaoSoDiferencas=this.checked;render()"> Mostrar apenas diferenças</label>'+ 
    '<div class="vitrine-comparacao-scroll"><table><thead><tr><th>Característica</th>'+itens.map(function(i){
      return '<th><span>'+esc(i.titulo)+'</span><button type="button" onclick="toggleVitrineComparacao(event,\''+i.id+'\')">Remover</button></th>';
    }).join('')+'</tr></thead><tbody>'+visiveis.map(function(l){return '<tr><th>'+esc(l[0])+'</th>'+celulas(l[1])+'</tr>';}).join('')+
      '<tr><th>Ação</th>'+celulas(function(i){return '<button type="button" class="btn btn-primary" onclick="abrirVitrineDetalhe(\''+i.id+'\')">Ver imóvel</button>';})+'</tr>'+
    '</tbody></table></div></section></div>';
}

function vitrineWhatsappUrl(perfil,i){
  let tel=String((perfil&&perfil.contato)||'').replace(/\D/g,'');
  if(!tel)return '';
  if(tel.length<=11)tel='55'+tel;
  /* O código vai na mensagem: com 20 conversas por dia, você sabe
     na hora de qual imóvel a pessoa está falando. */
  const venda=state.vitrinePubFinalidade==='vender'&&Number(i.precoVenda)>0;
  const bruto=venda?Number(i.precoVenda):Number(i.aluguel);
  const valor=bruto>0?(fmtMoney(bruto)+(venda?'':'/mês')):'valor sob consulta';
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
  const preco=i?vitrinePrecoVigente(i):0;
  const titulo=i?(i.titulo+' — '+(preco>0?fmtMoney(preco)+(state.vitrinePubFinalidade==='vender'?'':'/mês'):'consulte o valor')):'Imóvel';
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
  lembrarFocoVitrinePublica();
  state.vitrineLightbox=Math.max(0,Math.min(Number(indice)||0,fotos.length-1));
  render();
  ligarTeclasLightbox();
}
function fecharVitrineLightbox(semRender){
  if(state.vitrineLightbox===null||state.vitrineLightbox===undefined)return;
  state.vitrineLightbox=null;
  if(!semRender){render();restaurarFocoVitrinePublica();}
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

function vitrineTempoRelativo(valor){
  if(!valor)return '';
  const d=new Date(valor);if(Number.isNaN(d.getTime()))return '';
  const dias=Math.max(0,Math.floor((Date.now()-d.getTime())/86400000));
  if(dias===0)return 'Atualizado hoje';if(dias===1)return 'Atualizado ontem';
  if(dias<30)return 'Atualizado há '+dias+' dias';
  const meses=Math.floor(dias/30);return 'Atualizado há '+meses+' '+(meses===1?'mês':'meses');
}
function copiarVitrineReferencia(codigo){copyTextValue('#'+codigo,'Referência #'+codigo+' copiada.');}
function renderVitrineAcoesDetalhe(i){
  const favorito=(state.vitrineFavoritos||[]).includes(String(i.id));
  const comparando=(state.vitrineComparacao||[]).includes(String(i.id));
  return '<div class="vitrine-detalhe-acoes">'+
    '<button aria-pressed="'+favorito+'" onclick="toggleVitrineFavorito(event,\''+i.id+'\')">'+(favorito?'♥ Salvo':'♡ Favoritar')+'</button>'+ 
    '<button aria-pressed="'+comparando+'" onclick="toggleVitrineComparacao(event,\''+i.id+'\')">⇄ '+(comparando?'Comparando':'Comparar')+'</button>'+ 
    '<button onclick="compartilharVitrineImovel(\''+i.id+'\')">↗ Compartilhar</button>'+ 
    (vitrinePrecoVigente(i)>0?'<button onclick="abrirVitrineAlerta(\''+i.id+'\')">↓ Alerta de preço</button>':'')+'</div>';
}
function renderVitrineComodidadesDetalhe(i){
  const grupos={imovel:'No imóvel',condominio:'No condomínio',regiao:'Na região',acessibilidade:'Acessibilidade',sustentabilidade:'Sustentabilidade',terreno:'No terreno'};
  const lista=Array.isArray(i.comodidades)?i.comodidades:[];if(!lista.length)return '';
  const ordem=Object.keys(grupos),html=ordem.map(function(g){const itens=lista.filter(function(c){return c.grupo===g;});if(!itens.length)return '';return '<section><h3>'+grupos[g]+'</h3><ul>'+itens.map(function(c){return '<li><span aria-hidden="true">✓</span>'+esc(c.rotulo)+'</li>';}).join('')+'</ul></section>';}).join('');
  return html?'<div class="vitrine-bloco"><h2>Comodidades e diferenciais</h2><div class="vitrine-comodidades-detalhe">'+html+'</div></div>':'';
}
function renderVitrineDocumentacaoDetalhe(i){
  const nomes={matricula:'Matrícula',iptu:'IPTU',escritura:'Escritura',habitese:'Habite-se',condominio:'Condomínio',energia:'Ligação de energia',agua:'Ligação de água'};
  const docs=(i.documentacao||[]).filter(function(d){return d.estado&&d.estado!=='nao_informado';});if(!docs.length)return '';
  return '<div class="vitrine-bloco"><h2>Documentação informada</h2><div class="vitrine-documentos">'+docs.map(function(d){return '<div class="is-'+esc(d.estado)+'"><span>'+esc(nomes[d.tipo]||d.tipo)+'</span><strong>'+(d.estado==='sim'?'Disponível':'Pendente')+'</strong></div>';}).join('')+'</div><p class="vitrine-sub">Situação declarada pelo anunciante; confirme os documentos antes de contratar.</p></div>';
}
function renderVitrineCondicoesDetalhe(i){
  const linhas=[];
  if((i.garantiasAceitas||[]).length)linhas.push(['Garantias aceitas',i.garantiasAceitas.join(', ')]);
  else if(i.caucao)linhas.push(['Garantia',i.caucao]);
  if(i.indiceReajuste)linhas.push(['Reajuste',i.indiceReajuste]);
  if((i.custosInclusos||[]).length)linhas.push(['Custos incluídos',i.custosInclusos.join(', ')]);
  if(i.disponivelEm)linhas.push(['Disponível em',vitrineFormatDate(i.disponivelEm)]);
  [['Estudante','aceitaEstudante'],['Pessoa jurídica','aceitaPessoaJuridica'],['Crianças','aceitaCrianca'],['Sublocação','permiteSublocacao']].forEach(function(x){if(i[x[1]]!==null&&i[x[1]]!==undefined)linhas.push([x[0],i[x[1]]?'Aceito':'Não aceito']);});
  if(!linhas.length)return '';
  return '<div class="vitrine-bloco"><h2>Condições importantes</h2><dl class="vitrine-condicoes">'+linhas.map(function(x){return '<div><dt>'+esc(x[0])+'</dt><dd>'+esc(String(x[1]))+'</dd></div>';}).join('')+'</dl></div>';
}
/* ------------------------------------------------------------
   RESPONSÁVEL PELO IMÓVEL

   Antes este bloco mostrava o perfil DA CONTA, igual em todo anúncio.
   Numa corretora que anuncia imóvel de terceiro isso é impreciso: quem
   responde por aquele imóvel já estava gravado em `anuncianteId`, e a
   página pública nunca recebeu o dado. A v4 da RPC passou a mandar.

   Enquanto a migração não roda, `responsaveis` não vem e o bloco cai no
   comportamento antigo — o site não quebra por falta de banco novo.
   ------------------------------------------------------------ */
const VITRINE_RESP_TIPOS={
  imobiliaria:{rotulo:'IMOBILIÁRIA',icone:'🏢'},
  corretor:{rotulo:'CORRETOR',icone:'🧑‍💼'},
  proprietario:{rotulo:'PROPRIETÁRIO',icone:'🔑'}
};
function vitrineResponsavelDoImovel(i){
  const mapa=(state.vitrinePublic||{}).responsaveis||{};
  return mapa[String(i&&i.responsavelId||'')]||null;
}
/* Iniciais em vez de logo: subir e servir imagem de terceiro é outro
   problema (armazenamento, moderação, direito de uso). A inicial
   identifica sem prometer o que ainda não existe. */
function vitrineIniciais(nome){
  const partes=String(nome||'').trim().split(/\s+/).filter(Boolean);
  if(!partes.length)return '?';
  return (partes[0][0]+(partes.length>1?partes[partes.length-1][0]:'')).toUpperCase();
}
/* Meia estrela importa: 4,5 mostrado como 4 tira meio ponto de quem
   levou meses para conquistar. */
function vitrineEstrelas(media){
  const n=Number(media)||0,cheias=Math.floor(n),meia=(n-cheias)>=0.25&&(n-cheias)<0.75,extra=(n-cheias)>=0.75;
  let out='';
  for(let k=0;k<5;k++){
    out+= k<cheias+(extra?1:0) ? '<i class="on">★</i>' : (k===cheias&&meia?'<i class="meia">★</i>':'<i>★</i>');
  }
  return '<span class="vitrine-estrelas" role="img" aria-label="'+esc(n.toFixed(1))+' de 5 estrelas">'+out+'</span>';
}
function verAnunciosDoResponsavel(id){
  state.vitrineFiltros.responsavelId=String(id||'');
  state.vitrineDetalheId='';
  gravarFiltrosNaUrl(true);
  render();
  window.scrollTo(0,0);
}
function renderVitrineResponsavel(perfil,i){
  const r=vitrineResponsavelDoImovel(i);
  const nome=(r&&r.nome)||(perfil&&perfil.nome)||'Responsável pelo anúncio';
  const tipo=VITRINE_RESP_TIPOS[(r&&r.tipo)||'']||null;
  const registro=(r&&r.registro)||(perfil&&perfil.creci?'CRECI '+perfil.creci:'');
  const notas=Number(r&&r.totalNotas)||0;
  const media=Number(r&&r.notaMedia)||0;
  return '<div class="vitrine-bloco vitrine-responsavel">'+
    '<h2>Responsável pelo imóvel</h2>'+
    (tipo?'<span class="vitrine-resp-tipo"><i aria-hidden="true">'+tipo.icone+'</i>'+tipo.rotulo+'</span>':'')+
    '<div class="vitrine-resp-id">'+
      /* Quem enviou marca aparece com ela; o resto segue com as
         iniciais. Se a imagem falhar, volta para as iniciais em vez de
         deixar um quadrado quebrado no anúncio. */
      ((r&&r.fotoPath)
        ? '<img class="vitrine-resp-avatar is-foto" alt="" src="'+
          esc(location.origin+'/og-foto?p='+encodeURIComponent(r.fotoPath))+'" '+
          'onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),'+
          '{className:\'vitrine-resp-avatar\',textContent:'+JSON.stringify(vitrineIniciais(nome))+'}))">'
        : '<span class="vitrine-resp-avatar" aria-hidden="true">'+esc(vitrineIniciais(nome))+'</span>')+
      '<div><strong>'+esc(nome)+
        /* O visto vem do banco já conferido: a v4 só manda `true` se
           estiver pago, validado e dentro da validade. */
        (r&&r.verificado?'<b class="vitrine-visto" title="Responsável com documento verificado pela plataforma" '+
          'aria-label="Verificado pela plataforma">✓</b>':'')+'</strong>'+
        (registro?'<span class="vitrine-resp-registro">'+esc(registro)+'</span>':'')+
      '</div>'+
    '</div>'+
    (notas
      ? '<div class="vitrine-resp-nota">'+vitrineEstrelas(media)+
        '<b>'+esc(media.toFixed(1).replace('.',','))+'</b>'+
        '<span>'+notas+' avaliaç'+(notas===1?'ão':'ões')+' de quem alugou</span></div>'
      /* Sem nota não inventa média nem mostra cinco estrelas vazias:
         diz o que é. E só diz quando há de fato um responsável — antes
         da migração o dado inteiro não existe, e anunciar "sem
         avaliações" aí seria afirmar o que não se sabe. */
      : r?'<div class="vitrine-resp-nota vazia"><span>Ainda sem avaliações de inquilinos</span></div>':'')+
    (r&&Number(r.totalImoveis)>0
      ? '<div class="vitrine-resp-imoveis"><b>'+r.totalImoveis+'</b> '+
          (Number(r.totalImoveis)===1?'imóvel anunciado':'imóveis anunciados')+'</div>'+
        (Number(r.totalImoveis)>1
          ? '<button type="button" class="vitrine-resp-ver" onclick="verAnunciosDoResponsavel(\''+esc(r.id)+'\')">'+
            'Ver anúncios deste responsável →</button>'
          : '')
      : '')+
    '<p>Atendimento, informações e visitas são tratados diretamente com a imobiliária.</p></div>';
}
/* O aviso de segurança saiu de dentro do bloco do responsável quando
   ele foi para a coluna da direita: ali em cima ele viraria letra
   miúda ao lado do preço. Fica na coluna de conteúdo, no fim — que é
   onde a pessoa já leu tudo e está decidindo. */
function renderVitrineSeguranca(i){
  return '<div class="vitrine-bloco vitrine-legal"><h2>Segurança</h2>'+
    '<p>Não faça pagamento antecipado antes de confirmar a identidade do responsável, '+
    'visitar o imóvel e conferir a documentação.</p>'+
    '<button onclick="reportarVitrineAnuncio(\''+i.id+'\')">Reportar informação incorreta</button></div>';
}
function reportarVitrineAnuncio(id){
  const dados=state.vitrinePublic||{},i=(dados.imoveis||[]).find(function(x){return String(x.id)===String(id);});if(!i)return;
  const url=vitrineWhatsappUrl(dados.perfil,i);if(!url){showToast('Contato não disponível.','error');return;}
  window.open(url.split('?')[0]+'?text='+encodeURIComponent('Quero reportar uma informação incorreta no anúncio #'+i.codigo+'.'),'_blank');
}

function abrirVitrineAlerta(id){lembrarFocoVitrinePublica();state.vitrineAlertaModal={imovelId:id};render();}
function fecharVitrineAlerta(){state.vitrineAlertaModal=null;render();restaurarFocoVitrinePublica();}
function renderVitrineAlertaModal(){
  const m=state.vitrineAlertaModal;if(!m)return '';
  const i=((state.vitrinePublic||{}).imoveis||[]).find(function(x){return String(x.id)===String(m.imovelId);});if(!i)return '';
  return '<div class="vitrine-modal-publico" role="dialog" aria-modal="true"><button class="vitrine-modal-fundo" aria-label="Fechar" onclick="fecharVitrineAlerta()"></button><section><header><div><span class="eyebrow">AVISO DE ALTERAÇÃO</span><h2>Alerta de preço</h2></div><button aria-label="Fechar" onclick="fecharVitrineAlerta()">×</button></header><p>A imobiliária recebe o pedido e usa seu contato somente se o preço de <strong>'+esc(i.titulo)+'</strong> mudar.</p><label class="field"><span>Canal</span><select id="vit_alerta_canal"><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option></select></label><label class="field"><span>Telefone ou e-mail</span><input id="vit_alerta_destino"></label><label class="vitrine-consent"><input type="checkbox" id="vit_alerta_ok"><span>Autorizo este alerta. Posso cancelar quando quiser neste aparelho.</span></label><button class="btn btn-primary btn-block" onclick="salvarVitrineAlerta(\''+i.id+'\')">Criar alerta</button>'+renderVitrineAlertasAtivos(i.id)+'</section></div>';
}
function renderVitrineAlertasAtivos(id){const itens=(state.vitrineAlertasLocais||[]).filter(function(a){return String(a.imovelId)===String(id);});if(!itens.length)return '';return '<div class="vitrine-gestoes-locais"><strong>Alertas ativos neste aparelho</strong>'+itens.map(function(a,n){const idx=(state.vitrineAlertasLocais||[]).indexOf(a);return '<div><span>'+esc(a.canal)+' · '+esc(a.destinoOculto||'contato cadastrado')+'</span><button onclick="cancelarVitrineAlerta('+idx+')">Cancelar</button></div>';}).join('')+'</div>';}
async function salvarVitrineAlerta(id){
  const canal=document.getElementById('vit_alerta_canal').value,destino=String(document.getElementById('vit_alerta_destino').value||'').trim();
  if(!(document.getElementById('vit_alerta_ok')||{}).checked){showToast('Autorize o alerta para continuar.','error');return;}if(destino.length<6){showToast('Informe um contato válido.','error');return;}
  try{const r=await db.salvarVitrineAlertaPrecoPublico({imovelId:id,finalidade:state.vitrinePubFinalidade,canal:canal,destino:destino,consentimento:true});
    const oculto=canal==='email'?destino.replace(/(^.).*(@.*$)/,'$1•••$2'):('final '+destino.replace(/\D/g,'').slice(-4));
    state.vitrineAlertasLocais=[{id:r.id,token:r.token,imovelId:id,canal:canal,destinoOculto:oculto}].concat(state.vitrineAlertasLocais||[]).slice(0,20);salvarPreferenciaVitrine('alertas',state.vitrineAlertasLocais);showToast('Alerta de preço ativado.','success');render();
  }catch(e){showToast((e&&e.message)||'Não foi possível criar o alerta.','error');}
}
async function cancelarVitrineAlerta(n){const a=(state.vitrineAlertasLocais||[])[n];if(!a)return;try{await db.cancelarVitrineAlertaPrecoPublico(a.token);state.vitrineAlertasLocais.splice(n,1);salvarPreferenciaVitrine('alertas',state.vitrineAlertasLocais);render();showToast('Alerta cancelado.','success');}catch(e){showToast((e&&e.message)||'Não foi possível cancelar.','error');}}

function vitrineDatasDisponiveis(){
  const agenda=(state.vitrinePublic||{}).agenda||{},horarios=agenda.horarios||[],out=[],hoje=new Date();hoje.setHours(12,0,0,0);
  const minimo=Date.now()+(Number(agenda.antecedenciaHoras)||24)*3600000;
  for(let n=0;n<=Number(agenda.horizonteDias||30)&&out.length<18;n++){const d=new Date(hoje);d.setDate(d.getDate()+n);horarios.filter(function(h){return Number(h.diaSemana)===d.getDay();}).forEach(function(h){const p=String(h.inicio||'08:00').split(':');const inicio=new Date(d);inicio.setHours(Number(p[0])||0,Number(p[1])||0,0,0);if(inicio.getTime()>minimo)out.push({data:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),faixa:h.faixa,inicio:h.inicio,fim:h.fim});});}
  return out;
}
function abrirVitrineVisita(id,token){
  lembrarFocoVitrinePublica();
  try{
    const slots=vitrineDatasDisponiveis();
    state.vitrineVisitaModal={imovelId:id,token:token||'',data:slots[0]?slots[0].data:'',faixa:slots[0]?slots[0].faixa:''};
    render();
  }catch(e){
    console.error('Falha ao abrir agenda da Vitrine:',e);
    showToast((e&&e.message)||'Não foi possível abrir a agenda.','error');
  }
}
function fecharVitrineVisita(){state.vitrineVisitaModal=null;render();restaurarFocoVitrinePublica();}
function selecionarVitrineHorario(data,faixa){state.vitrineVisitaModal.data=data;state.vitrineVisitaModal.faixa=faixa;render();}
function renderVitrineVisitaModal(){
  const m=state.vitrineVisitaModal;if(!m)return '';const slots=vitrineDatasDisponiveis();
  return '<div class="vitrine-modal-publico" role="dialog" aria-modal="true"><button class="vitrine-modal-fundo" aria-label="Fechar" onclick="fecharVitrineVisita()"></button><section class="vitrine-modal-visita"><header><div><span class="eyebrow">AGENDA REAL</span><h2>'+(m.token?'Reagendar visita':'Solicitar visita')+'</h2></div><button aria-label="Fechar" onclick="fecharVitrineVisita()">×</button></header><p>Escolha uma opção disponível. <strong>Solicitação não é confirmação</strong>: você verá a situação ao concluir.</p>'+ 
    (slots.length?'<div class="vitrine-horarios">'+slots.map(function(s){const on=s.data===m.data&&s.faixa===m.faixa;return '<button class="'+(on?'on':'')+'" onclick="selecionarVitrineHorario(\''+s.data+'\',\''+s.faixa+'\')"><strong>'+vitrineFormatDate(s.data)+'</strong><span>'+vitrineFaixaLabel(s.faixa)+' · '+s.inicio+'–'+s.fim+'</span></button>';}).join('')+'</div>':'<p>Nenhum horário disponível no momento.</p>')+ 
    (m.token?'':'<label class="field"><span>Seu nome</span><input id="vit_vis_nome"></label><label class="field"><span>WhatsApp</span><input id="vit_vis_tel"></label><label class="field"><span>Mensagem (opcional)</span><textarea id="vit_vis_msg" rows="3"></textarea></label><label class="vitrine-consent"><input type="checkbox" id="vit_vis_ok"><span>Autorizo o contato necessário para organizar esta visita.</span></label>')+ 
    (slots.length?'<button class="btn btn-primary btn-block" onclick="enviarVitrineVisita()">'+(m.token?'Confirmar novo horário':'Enviar solicitação')+'</button>':'')+'</section></div>';
}
async function enviarVitrineVisita(){
  const m=state.vitrineVisitaModal;if(!m||!m.data)return;
  try{
    if(m.token){await db.reagendarVitrineVisitaPublica(m.token,m.data,m.faixa);const v=(state.vitrineVisitasLocais||[]).find(function(x){return x.token===m.token;});if(v){v.data=m.data;v.faixa=m.faixa;v.status='reagendada';}}
    else{const nome=String(document.getElementById('vit_vis_nome').value||'').trim(),tel=String(document.getElementById('vit_vis_tel').value||'').trim();if(!(document.getElementById('vit_vis_ok')||{}).checked)throw new Error('Autorize o contato para continuar.');
      const r=await db.solicitarVitrineVisita({imovelId:m.imovelId,nome:nome,telefone:tel,data:m.data,faixa:m.faixa,mensagem:document.getElementById('vit_vis_msg').value,consentimento:true});state.vitrineVisitasLocais=[{id:r.id,token:r.token,imovelId:m.imovelId,data:m.data,faixa:m.faixa,status:r.status}].concat(state.vitrineVisitasLocais||[]).slice(0,20);}
    salvarPreferenciaVitrine('visitas',state.vitrineVisitasLocais);state.vitrineVisitaModal=null;render();showToast(m.token?'Visita reagendada.':'Solicitação registrada. Confira a situação abaixo.','success');
  }catch(e){showToast((e&&e.message)||'Não foi possível solicitar a visita.','error');}
}
async function cancelarVitrineVisitaLocal(token){try{await db.cancelarVitrineVisitaPublica(token);const v=(state.vitrineVisitasLocais||[]).find(function(x){return x.token===token;});if(v)v.status='cancelada';salvarPreferenciaVitrine('visitas',state.vitrineVisitasLocais);render();showToast('Visita cancelada.','success');}catch(e){showToast((e&&e.message)||'Não foi possível cancelar.','error');}}
function renderVitrineVisitasLocais(id){const vs=(state.vitrineVisitasLocais||[]).filter(function(v){return String(v.imovelId)===String(id);});if(!vs.length)return '';return '<div class="vitrine-bloco"><h2>Minhas visitas neste aparelho</h2><div class="vitrine-visitas-locais">'+vs.map(function(v){const ativa=!['cancelada','realizada','nao_compareceu'].includes(v.status);return '<article><div><strong>'+vitrineFormatDate(v.data)+' · '+vitrineFaixaLabel(v.faixa)+'</strong><span class="is-'+esc(v.status)+'">'+vitrineStatusVisitaLabel(v.status)+'</span></div><p>'+(v.status==='solicitada'?'A imobiliária ainda precisa confirmar.':v.status==='confirmada'?'Horário confirmado.':'Situação atualizada no aparelho.')+'</p>'+(ativa?'<button onclick="abrirVitrineVisita(\''+id+'\',\''+v.token+'\')">Reagendar</button><button onclick="cancelarVitrineVisitaLocal(\''+v.token+'\')">Cancelar</button>':'')+'</article>';}).join('')+'</div></div>';}

function renderVitrineDetalhe(i,perfil){
  const total=vitrineTotalMes(i);
  const fotos=i.fotoUrls||[];
  const wa=vitrineWhatsappUrl(perfil,i);
  const endereco=[i.logradouro,i.numero].filter(Boolean).join(', ');
  return '<div class="vitrine-detalhe">'+
    '<nav class="vitrine-breadcrumb" aria-label="Navegação"><button onclick="fecharVitrineDetalhe()">Imóveis</button><span>›</span><span>'+esc(i.cidade||'Cidade')+'</span><span>›</span><strong>'+esc(i.codigo)+'</strong></nav>'+ 
    '<div class="vitrine-detalhe-topo">'+
      '<button class="vitrine-voltar" onclick="fecharVitrineDetalhe()">← Voltar para a lista</button>'+
      /* Quem está no celular vendo o anúncio quer mandar para o marido,
         para o pai, para o grupo. Antes não havia por onde. */
      '<span class="vitrine-atualizado">'+esc(vitrineTempoRelativo(i.updatedAt||i.atualizadoEm||i.publicadoEm))+'</span>'+
    '</div>'+

    /* A galeria abre em tela cheia. O "+N fotos" era um rótulo morto: o
       clique mais óbvio da página não fazia nada. */
    '<div class="vitrine-galeria">'+
      (fotos.length?'<button type="button" class="vg-principal" onclick="abrirVitrineLightbox(0)" '+
        'aria-label="Ver as fotos em tela cheia"><img src="'+esc(fotos[0])+'" onerror="vitrineImagemFalhou(this,\''+esc(i.id)+'\')" alt="Foto de '+esc(i.titulo)+'">'+
        '<span class="vg-conta">1 / '+fotos.length+'</span></button>'+
        (fotos.length>1?'<div class="vg-lado">'+fotos.slice(1,3).map(function(f,n){
          const resto=fotos.length-3;
          return '<button type="button" onclick="abrirVitrineLightbox('+(n+1)+')" '+
            'aria-label="Ver foto '+(n+2)+' em tela cheia">'+
            '<img src="'+esc(f)+'" onerror="vitrineImagemFalhou(this,\''+esc(i.id)+'\')" alt="Foto '+(n+2)+'">'+
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
          '<button class="vitrine-code vitrine-code-copiar" onclick="copiarVitrineReferencia(\''+esc(i.codigo)+'\')">#'+esc(i.codigo)+' · copiar</button>'+
          '<span class="chip chip-slate">'+esc(vitrineTipoLabel(i.tipo).toUpperCase())+'</span>'+
          (i.destaque?'<span class="chip chip-warn">★ DESTAQUE</span>':'')+'</div>'+
        '<h2>'+esc(i.titulo)+'</h2>'+
        '<p class="vitrine-sub">'+esc([endereco,i.bairro,i.cidade].filter(Boolean).join(' · ')||'Localização sob consulta')+'</p>'+renderVitrineAcoesDetalhe(i)+'</div>'+

      renderVitrineFeatsDetalhe(i)+

      /* O custo mensal só existe para quem aluga. Num anúncio só de
         venda, este bloco mostrava R$ 0,00 em tudo. */
      (vitrineServeAlugar(i)&&Number(i.aluguel)>0
        ? '<div class="vitrine-bloco"><h2>Quanto custa por mês</h2>'+
          '<p class="vitrine-sub">Estimativa completa — a pergunta que mais aparece no WhatsApp, já respondida.</p>'+
          '<div class="vitrine-custo"><span>Aluguel</span><b>'+fmtMoney(i.aluguel)+'</b></div>'+
          '<div class="vitrine-custo"><span>Condomínio</span><b>'+(Number(i.condominio)?fmtMoney(i.condominio):'não há')+'</b></div>'+
          '<div class="vitrine-custo"><span>IPTU</span><b>'+(Number(i.iptu)?fmtMoney(i.iptu):'não há')+'</b></div>'+
          '<div class="vitrine-custo-total"><span>Total estimado por mês</span><b>'+fmtMoney(total)+'</b></div></div>'
        : '')+

      (i.descricao?'<div class="vitrine-bloco"><h2>Sobre o imóvel</h2>'+
        '<p class="vitrine-texto">'+esc(i.descricao)+'</p></div>':'')+
      renderVitrineComodidadesDetalhe(i)+renderVitrineCondicoesDetalhe(i)+renderVitrineDocumentacaoDetalhe(i)+

      ((i.latitude&&i.longitude)?'<div class="vitrine-bloco"><h2>Onde fica</h2>'+
        '<p class="vitrine-sub">'+esc([endereco,i.bairro].filter(Boolean).join(' · '))+'</p>'+
        (state.vitrineMapaAtivo?'<div id="vitrineMapa"></div>':'<button class="vitrine-mapa-pedido" onclick="abrirMapaVitrine(\''+i.id+'\')"><strong>Carregar mapa</strong><span>O mapa só usa dados quando você pedir.</span></button>')+'</div>':'')+

      ((i.pontosInteresse||[]).length?'<div class="vitrine-bloco"><h2>O que tem por perto</h2>'+
        '<div class="vitrine-poi">'+(i.pontosInteresse||[]).map(function(p){
          return '<div class="vitrine-poi-item"><i>'+esc(p.icone||'📍')+'</i><div>'+
            '<b>'+esc(p.nome||'')+'</b><span>'+esc(p.distancia||'')+'</span></div></div>';
        }).join('')+'</div></div>':'')+

      /* Garantia e contrato mínimo são regras de locação: não aparecem
         num anúncio que é só de venda. */
      (vitrineServeAlugar(i)&&Number(i.aluguel)>0
        ? '<div class="vitrine-bloco"><h2>Regras da locação</h2>'+
          '<div class="vitrine-regra"><i>📄</i><span>Garantia: <b>'+esc(i.caucao||(i.exigeFiador?'fiador':'a combinar'))+'</b></span></div>'+
          '<div class="vitrine-regra"><i>📅</i><span>Contrato mínimo: <b>'+Number(i.contratoMinimoMeses||12)+' meses</b></span></div>'+
          (vitrineEhTerreno(i.tipo)?''
            :'<div class="vitrine-regra"><i>🐾</i><span>Animais: <b>'+(i.aceitaPet?'permitidos':'não permitidos')+'</b></span></div>')+
        '</div>'
        : '')+

      renderVitrineVisitasLocais(i.id)+renderVitrineParecidos(i)+

    /* Quem responde pelo imóvel fica na coluna da direita, embaixo do
       preço e do contato: é ali que a pessoa decide se fala com você, e
       é ali que saber com quem vai tratar pesa. No meio do texto ele
       era só mais um bloco entre a descrição e os imóveis parecidos. */
    '</div><div><div class="vitrine-sticky"><div class="vitrine-contato">'+
      '<div class="vitrine-contato-topo">'+renderVitrinePrecoCta(i,total)+'</div>'+
      '<div class="vitrine-contato-corpo">'+
        (((state.vitrinePublic||{}).agenda||{}).ativa?'<button class="btn btn-primary btn-block" onclick="abrirVitrineVisita(\''+i.id+'\')">Solicitar visita</button><p class="vitrine-agenda-nota">Escolha um horário real. A solicitação poderá precisar de confirmação.</p>':'')+
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
      '</div></div>'+renderVitrineResponsavel(perfil,i)+'</div></div></div>'+
    /* No celular a coluna de contato fica no fim de uma página longa.
       Esta barra põe o preço e o WhatsApp onde o polegar já está. */
    renderVitrineBarraMovel(i,total,wa)+
    '</div>';
}
function renderVitrineBarraMovel(i,total,wa){
  const venda=state.vitrinePubFinalidade==='vender'&&Number(i.precoVenda)>0;
  const bruto=venda?Number(i.precoVenda):Number(i.aluguel);
  const valor=bruto>0?fmtMoney(bruto):'Consulte';
  const nota=venda?'à vista'
    :(total!==Number(i.aluguel)?fmtMoney(total)+' com taxas':'por mês');
  return '<div class="vitrine-barra-movel">'+
    '<div class="vbm-preco">'+valor+'<small>'+esc(nota)+'</small></div>'+
    (((state.vitrinePublic||{}).agenda||{}).ativa
      ? '<button class="btn btn-primary" onclick="abrirVitrineVisita(\''+i.id+'\')">Solicitar visita</button>'
      : wa
      ? '<button class="btn btn-wa" onclick="abrirVitrineWhatsapp(\''+i.id+'\')">💬 WhatsApp</button>'
      : '<button class="btn btn-primary" onclick="document.getElementById(\'vit_lead_nome\').scrollIntoView({behavior:\'smooth\',block:\'center\'})">Tenho interesse</button>')+
  '</div>';
}
function vitrineFeat(ico,val,label){
  return '<div class="vitrine-feat"><i>'+ico+'</i><div><b>'+esc(String(val))+'</b><span>'+esc(label)+'</span></div></div>';
}
/* O que o imóvel tem — e só o que ele tem.
   Quartos, suítes e vagas já seguiam essa regra; mobiliado, aceita pet,
   quintal e área de serviço não, e apareciam com "Não". Numa casa
   simples, que é a maior parte do estoque, isso enchia metade do bloco
   de ausências e empurrava para baixo o que o imóvel realmente oferece.

   A ausência só informa quando existe com o que comparar — e é lá, na
   tabela lado a lado, que ela aparece. No anúncio sozinho, "não tem
   quintal" não ajuda ninguém a decidir. Vale igual para o terreno
   (murado, esquina). */
function renderVitrineFeatsDetalhe(i){
  const terreno=vitrineEhTerreno(i.tipo);
  const feats=terreno
    ? [
      i.areaM2?vitrineFeat('📐',i.areaM2,'m² de área'):'',
      (i.frenteM&&i.fundoM)?vitrineFeat('📏',i.frenteM+'×'+i.fundoM,'metros'):'',
      (i.frenteM&&!i.fundoM)?vitrineFeat('📏',i.frenteM,'m de frente'):'',
      i.topografia?vitrineFeat('⛰',vitrineTopografiaLabel(i.topografia),'topografia'):'',
      i.murado?vitrineFeat('🧱','Sim','murado'):'',
      i.esquina?vitrineFeat('📍','Sim','esquina'):''
    ]
    : [
      Number(i.quartos)>0?vitrineFeat('🛏',i.quartos,'quartos'):'',
      /* Só aparece quando existe: "0 suítes" é ruído numa casa
         simples, que é a maioria do estoque. */
      Number(i.suites)?vitrineFeat('🛁',i.suites,Number(i.suites)===1?'suíte':'suítes'):'',
      Number(i.banheiros)>0?vitrineFeat('🚿',i.banheiros,'banheiros'):'',
      Number(i.vagas)>0?vitrineFeat('🚗',i.vagas,Number(i.vagas)===1?'vaga':'vagas'):'',
      i.areaM2?vitrineFeat('📐',i.areaM2,'m² úteis'):'',
      Number(i.areaTotalM2)?vitrineFeat('📏',i.areaTotalM2,'m² totais'):'',
      Number(i.andar)?vitrineFeat('🏢',i.andar+'º','andar'):'',
      i.idadeAnos!=null?vitrineFeat('📅',
        Number(i.idadeAnos)===0?'Novo':i.idadeAnos+(Number(i.idadeAnos)===1?' ano':' anos'),
        'de construção'):'',
      i.conservacao?vitrineFeat('🔧',vitrineConservacaoLabel(i.conservacao),'conservação'):'',
      i.mobiliado?vitrineFeat('🛋','Sim','mobiliado'):'',
      i.aceitaPet?vitrineFeat('🐾','Sim','aceita pet'):'',
      i.quintal?vitrineFeat('🌳','Sim','quintal'):'',
      i.areaServico?vitrineFeat('🧺','Sim','área de serviço'):''
    ];
  const html=feats.join('');
  /* Cadastro ainda em branco: sem isto o bloco virava um título
     seguido de uma caixa vazia. */
  if(!html)return '';
  return '<div class="vitrine-bloco"><h2>O que o '+(terreno?'terreno':'imóvel')+' tem</h2>'+
    '<div class="vitrine-feats">'+html+'</div></div>';
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
      return (vender?vitrineServeVender(x):vitrineServeAlugar(x))&&preco(x)>0;
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
      const foto=(x.thumbUrls&&x.thumbUrls[0])||(x.fotoUrls&&x.fotoUrls[0])||'';
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
  const aluga=vitrineServeAlugar(i)&&Number(i.aluguel)>0, vende=vitrineServeVender(i)&&Number(i.precoVenda)>0;
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
  return aluga?blocoAluguel:'<div class="vitrine-preco-grande">Consulte o valor</div>';
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
    const query=new URLSearchParams(location.search),campanha=query.get('utm_campaign')||query.get('campanha')||'';
    await db.registrarVitrineLead({imovelId:id,nome:v('vit_lead_nome'),telefone:v('vit_lead_tel'),
      mensagem:vitrineMensagemComContexto(id,v('vit_lead_msg')),consentimento:true,
      campanha:campanha,utmSource:query.get('utm_source')||''});
    db.registrarVitrineObservabilidade(vitrinePerfilSlug(),'lead_enviado',0,{rota:location.pathname});
    if(btn){btn.textContent='Recebemos seu contato ✓';}
    showToast('Contato enviado. Retornaremos em breve.','success');
  }catch(e){
    console.error(e);
    db.registrarVitrineObservabilidade(vitrinePerfilSlug(),'erro_lead',0,{rota:location.pathname,codigoErro:(e&&e.code)||'lead'});
    showToast((e&&e.message)||'Não foi possível enviar. Tente novamente.','error');
    if(btn){btn.disabled=false;btn.textContent='Quero mais informações';}
  }
}

/* Mapa da busca: os pinos usam as coordenadas que a funcao publica ja
   protege (exata, aproximada ou oculta conforme o cadastro do anuncio).
   Marcadores proximos viram um grupo e se separam conforme o zoom. */
function prepararVitrinePublicaAposRender(){
  document.body.style.overflow=state.vitrineFiltrosMobile?'hidden':'';
  if(state.vitrineDetalheId||state.vitrinePubModo!=='mapa'){
    if(window._vitrineMapaResultados){try{window._vitrineMapaResultados.remove();}catch(e){}window._vitrineMapaResultados=null;}
    return;
  }
  if(!document.getElementById('vitrineMapaResultados')){
    if(window._vitrineMapaResultados){try{window._vitrineMapaResultados.remove();}catch(e){}window._vitrineMapaResultados=null;}
    return;
  }
  desenharMapaResultados();
}
function vitrineMapaPrecoCurto(i){
  const valor=vitrinePrecoVigente(i);
  if(valor>=1000000)return 'R$ '+(valor/1000000).toFixed(valor>=10000000?0:1).replace('.',',')+' mi';
  if(valor>=1000)return 'R$ '+Math.round(valor/1000)+' mil';
  return 'R$ '+Math.round(valor);
}
function vitrineMapaPassoAgrupamento(zoom){
  if(zoom<9)return .7;
  if(zoom<11)return .2;
  if(zoom<13)return .05;
  if(zoom<15)return .012;
  if(zoom<17)return .003;
  return 0;
}
function vitrineMapaAgrupar(itens,zoom){
  const passo=vitrineMapaPassoAgrupamento(zoom);
  if(!passo)return itens.map(function(i){return {lat:Number(i.latitude),lng:Number(i.longitude),itens:[i]};});
  const grupos=new Map();
  itens.forEach(function(i){
    const lat=Number(i.latitude),lng=Number(i.longitude);
    const chave=Math.round(lat/passo)+':'+Math.round(lng/passo);
    if(!grupos.has(chave))grupos.set(chave,[]);
    grupos.get(chave).push(i);
  });
  return Array.from(grupos.values()).map(function(lista){
    return {lat:lista.reduce(function(s,i){return s+Number(i.latitude);},0)/lista.length,
      lng:lista.reduce(function(s,i){return s+Number(i.longitude);},0)/lista.length,itens:lista};
  });
}
function vitrineMapaPopup(i){
  const local=[i.bairro,i.cidade].filter(Boolean).join(' · ');
  return '<div class="vitrine-mapa-popup"><small>'+esc(local||'Localização sob consulta')+'</small><strong>'+esc(i.titulo)+'</strong><b>'+esc(vitrineMapaPrecoCurto(i))+(state.vitrinePubFinalidade==='vender'?'':' / mês')+'</b><button type="button" onclick="abrirVitrineDetalhe(\''+esc(i.id)+'\')">Ver imóvel</button></div>';
}
function desenharMapaResultados(){
  const el=document.getElementById('vitrineMapaResultados');
  if(!el)return;
  const itens=vitrineImoveisFiltrados().filter(function(i){
    return Number.isFinite(Number(i.latitude))&&Number.isFinite(Number(i.longitude))&&Number(i.latitude)!==0&&Number(i.longitude)!==0;
  });
  if(!itens.length)return;
  if(typeof L==='undefined'){
    el.innerHTML='<div class="vitrine-mapa-off">Mapa indisponível no momento.</div>';
    return;
  }
  if(window._vitrineMapaResultados){try{window._vitrineMapaResultados.remove();}catch(e){}}
  const mapa=L.map('vitrineMapaResultados',{scrollWheelZoom:false,zoomControl:true});
  window._vitrineMapaResultados=mapa;
  L.tileLayer(VITRINE_MAPA_TILES,{maxZoom:19,attribution:VITRINE_MAPA_ATRIBUICAO}).addTo(mapa);
  const bounds=L.latLngBounds(itens.map(function(i){return [Number(i.latitude),Number(i.longitude)];}));
  if(itens.length===1)mapa.setView(bounds.getCenter(),15);
  else mapa.fitBounds(bounds.pad(.18),{maxZoom:16});
  let camada=L.layerGroup().addTo(mapa);
  const desenhar=function(){
    camada.clearLayers();
    vitrineMapaAgrupar(itens,mapa.getZoom()).forEach(function(g){
      if(g.itens.length>1){
        const icone=L.divIcon({className:'vitrine-mapa-marker-wrap',html:'<span class="vitrine-mapa-cluster"><b>'+g.itens.length+'</b><small>imóveis</small></span>',iconSize:[62,62],iconAnchor:[31,31]});
        const marcador=L.marker([g.lat,g.lng],{icon:icone,title:g.itens.length+' imóveis nesta região'}).addTo(camada);
        marcador.on('click',function(){mapa.setView([g.lat,g.lng],Math.min(18,mapa.getZoom()+2));});
        return;
      }
      const i=g.itens[0],texto=vitrineMapaPrecoCurto(i);
      const largura=Math.max(72,Math.min(118,48+texto.length*5));
      const icone=L.divIcon({className:'vitrine-mapa-marker-wrap',html:'<span class="vitrine-mapa-preco">'+esc(texto)+'</span>',iconSize:[largura,42],iconAnchor:[largura/2,40],popupAnchor:[0,-36]});
      L.marker([g.lat,g.lng],{icon:icone,title:texto+' · '+i.titulo}).addTo(camada).bindPopup(vitrineMapaPopup(i),{maxWidth:260});
    });
  };
  mapa.on('zoomend',desenhar);desenhar();
  setTimeout(function(){mapa.invalidateSize();},120);
  db.registrarVitrineObservabilidade(vitrinePerfilSlug(),'mapa_busca_aberto',0,{rota:location.pathname,quantidade:itens.length});
}

/* Mapa da ficha. Se o anuncio estiver como aproximado, `i.latitude` e
   `i.longitude` ja chegam aproximados da funcao publica do banco. */
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
  L.tileLayer(VITRINE_MAPA_TILES,{
    maxZoom:19,attribution:VITRINE_MAPA_ATRIBUICAO
  }).addTo(mapa);
  L.marker([i.latitude,i.longitude]).addTo(mapa)
    .bindPopup('<b>'+esc(i.titulo)+'</b><br>'+esc([i.logradouro,i.numero].filter(Boolean).join(', ')))
    .openPopup();
  setTimeout(function(){mapa.invalidateSize();},120);
}
function abrirMapaVitrine(id){
  state.vitrineMapaAtivo=true;render();
  db.registrarVitrineObservabilidade(vitrinePerfilSlug(),'mapa_aberto',0,{rota:location.pathname});
  setTimeout(function(){desenharMapaVitrine(id);},60);
}
function vitrineImagemFalhou(img,id){
  if(!img||img.dataset.erroRegistrado)return;img.dataset.erroRegistrado='1';
  db.registrarVitrineObservabilidade(vitrinePerfilSlug(),'erro_imagem',0,{rota:location.pathname,recurso:'anuncio-'+String(id||'').slice(0,8)});
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
