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
  ['sobrado','Sobrado'],['comercial','Comercial']
];
const VITRINE_STATUS=[
  ['rascunho','Rascunho'],['ativo','No ar'],['vencido','Vencido'],
  ['pausado','Pausado'],['alugado','Alugado']
];
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
  if(s==='alugado')return 'manut';
  if(s==='pausado')return 'warn';
  return 'slate';
}

/* Faixa da taxa conforme o valor do aluguel (tabela em config.js). */
function vitrineTaxaSugerida(aluguel){
  const faixas=CONFIG.VITRINE_TAXAS||[];
  const valor=Number(aluguel)||0;
  return faixas.find(function(f){return valor<=f.ateAluguel;})||faixas[faixas.length-1]||{valor:0,destaque:0,nome:'—'};
}
/* Dias que faltam para a taxa vencer. Negativo = já venceu. */
function vitrineDiasRestantes(item){
  if(!item.expiraEm) return null;
  return Math.round((new Date(item.expiraEm+'T12:00:00')-new Date())/86400000);
}
function vitrineCustoTotal(i){
  return (Number(i.aluguel)||0)+(Number(i.condominio)||0)+(Number(i.iptu)||0);
}
function vitrineAnuncianteNome(id){
  const a=(state.vitrine.anunciantes||[]).find(function(x){return x.id===id;});
  return a?a.nome:'—';
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
async function loadVitrineData(force){
  if(state.vitrine.carregado&&!force) return;
  try{
    await db.expireVitrine().catch(function(){});
    const data=await db.loadVitrine();
    state.vitrine=Object.assign({},data,{carregado:true});
    render();
  }catch(e){
    console.error('Erro ao carregar a Vitrine',e);
    showToast((e&&e.message)||'Não foi possível carregar a Vitrine.','error');
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
    ['anunciantes','Anunciantes','&#9786;'],['leads','Leads','&#9825;'],
    ['taxas','Taxas','R$'],['divulgacao','Divulgação','&#9670;']];
  /* Mesma estrutura das outras abas: navegação primeiro, depois o herói.
     O cabeçalho precisa ser FILHO DIRETO de .rental-app — o estilo dele
     usa o seletor `.rental-app > .page-header`. Envolver em um <section>
     tira o arredondamento, o respiro e o fundo. */
  return '<nav class="rent-tabs" aria-label="Áreas da Vitrine">'+abas.map(function(a){
      const ativa=tab===a[0];
      return '<button class="rent-tab'+(ativa?' active':'')+'"'+(ativa?' aria-current="page"':'')+
        ' onclick="setVitrineTab(\''+a[0]+'\')">'+
        '<span aria-hidden="true">'+a[2]+'</span><b>'+esc(a[1])+'</b></button>';
    }).join('')+'</nav>'+
    '<div class="page-header vitrine-header"><div>'+
      '<span class="eyebrow">CATÁLOGO PÚBLICO DE TERCEIROS</span>'+
      pageTitleWithIcon(vitrineIconSvg(),'Vitrine')+
      '<p class="page-sub">Imóveis de terceiros que pagam para serem divulgados. '+
      'Não entram no Financeiro nem no limite do plano.</p></div>'+
      '<div class="header-actions">'+
        '<button class="btn btn-ghost btn-sm" onclick="copyVitrineLink()">Copiar link</button>'+
        '<button class="btn btn-primary btn-sm" onclick="openVitrineImovelModal()">+ Novo anúncio</button>'+
      '</div></div>'+
    (tab==='anuncios'?renderVitrineAnuncios():
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
  const aVencer=ativos.filter(function(i){const d=vitrineDiasRestantes(i);return d!==null&&d<=7;});
  const vencidos=imoveis.filter(function(i){return i.status==='vencido';});
  const leadsNovos=(state.vitrine.leads||[]).filter(function(l){return l.status==='novo';});
  const mes=currentMonthStr();
  const recebido=(state.vitrine.taxas||[]).filter(function(t){
    return t.pago&&String(t.dataPagamento||'').slice(0,7)===mes;
  }).reduce(function(s,t){return s+Number(t.valor||0);},0);
  const views=imoveis.reduce(function(s,i){return s+i.visualizacoes;},0);
  const contatos=imoveis.reduce(function(s,i){return s+i.contatosWhatsapp+i.contatosFormulario;},0);

  return '<div class="vitrine-stats">'+
      vitrineStat(ativos.length,'Anúncios no ar','gold')+
      vitrineStat(aVencer.length,'Taxa a vencer (7 dias)','warn')+
      vitrineStat(vencidos.length,'Fora do ar por vencimento','danger')+
      vitrineStat(views,'Visualizações','')+
      vitrineStat(contatos,'Contatos','')+
      vitrineStat(fmtMoney(recebido),'Taxas recebidas no mês','gold')+
    '</div>'+
    (aVencer.length?'<div class="vitrine-alert"><div><strong>'+aVencer.length+' anúncio(s) com taxa vencendo</strong>'+
      '<span>Quando a taxa vence, o anúncio sai do ar sozinho. Cobre a renovação mostrando o desempenho.</span></div>'+
      '<button class="btn btn-primary btn-sm" onclick="setVitrineTab(\'anuncios\')">Ver anúncios</button></div>':'')+
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
    '<p>O anúncio sai do ar sozinho quando a taxa vence. Renovar não exige recadastrar nada.</p></div>'+
    (resumo?'<button class="btn btn-ghost btn-sm" onclick="setVitrineTab(\'anuncios\')">Ver todos</button>':'')+'</div>'+
    '<div class="vitrine-table-wrap"><table class="vitrine-table"><thead><tr>'+
      '<th>Código / Imóvel</th><th>Anunciante</th><th>Aluguel</th><th>Taxa</th>'+
      '<th>Situação</th><th>Desempenho</th><th></th></tr></thead><tbody>'+
    lista.map(renderVitrineImovelRow).join('')+'</tbody></table></div></div>';
}

function renderVitrineImovelRow(i){
  const dias=vitrineDiasRestantes(i);
  const venc=dias===null?'sem prazo':(dias<0?'venceu há '+Math.abs(dias)+' dia(s)':'vence em '+dias+' dia(s)');
  const taxa=vitrineTaxaSugerida(i.aluguel);
  return '<tr><td><span class="vitrine-code">#'+esc(i.codigo)+'</span>'+
      '<span class="cell-sub">'+esc(i.titulo)+(i.destaque?' ★':'')+'</span></td>'+
    '<td>'+esc(vitrineAnuncianteNome(i.anuncianteId))+'</td>'+
    '<td><strong>'+fmtMoney(i.aluguel)+'</strong><span class="cell-sub">'+fmtMoney(vitrineCustoTotal(i))+' com taxas</span></td>'+
    '<td><strong>'+fmtMoney(taxa.valor)+'</strong><span class="cell-sub">'+esc(venc)+'</span></td>'+
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
  const dias=vitrineDiasRestantes(i);
  const contatos=i.contatosWhatsapp+i.contatosFormulario;
  const texto='Relatório do imóvel '+i.codigo+' — '+i.titulo+'\n'+
    'Visualizações: '+i.visualizacoes+'\n'+
    'Contatos recebidos: '+contatos+'\n'+
    (dias!==null?(dias<0?'Anúncio vencido há '+Math.abs(dias)+' dias.':'Faltam '+dias+' dias de divulgação.'):'');
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
      '<option value="alugado">Foi alugado</option><option value="pausado">O dono pediu para pausar</option>'+
      '<option value="vencido">A taxa venceu</option></select></label>'+
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
    '</strong> por '+dias+' dias. Ao vencer, o anúncio sai do ar sozinho.</p>'+
    '<div class="field-row"><label class="field"><span>Valor da taxa (R$)</span>'+
      '<input id="vit_pub_valor" type="number" min="0" step="0.01" value="'+taxa.valor+'"></label>'+
      '<label class="field"><span>No ar até</span><input id="vit_pub_fim" type="date" value="'+fim+'"></label></div>'+
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
    closeModal();render();showToast('Anúncio no ar até '+fmtDateBR(fim)+'.','success');
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
function vitrineImovelFormHtml(item){
  const i=item||{};
  const anunciantes=state.vitrine.anunciantes||[];
  return '<div class="field-row"><label class="field"><span>Código</span>'+
      '<input id="vit_codigo" value="'+esc(i.codigo||vitrineProximoCodigo())+'" placeholder="A-101"></label>'+
      '<label class="field"><span>Tipo</span><select id="vit_tipo">'+VITRINE_TIPOS.map(function(t){
        return '<option value="'+t[0]+'"'+((i.tipo||'casa')===t[0]?' selected':'')+'>'+t[1]+'</option>';}).join('')+
      '</select></label></div>'+
    '<label class="field"><span>Título do anúncio *</span><input id="vit_titulo" value="'+esc(i.titulo||'')+
      '" placeholder="Casa 2 quartos no Jardim América"></label>'+
    '<label class="field"><span>Anunciante (dono do imóvel)</span><select id="vit_anunciante">'+
      '<option value="">— selecione —</option>'+anunciantes.map(function(a){
        return '<option value="'+a.id+'"'+(i.anuncianteId===a.id?' selected':'')+'>'+esc(a.nome)+'</option>';}).join('')+
      '</select><small>Cadastre em Anunciantes se ainda não existir.</small></label>'+

    '<div class="form-section-title">Valores</div>'+
    '<div class="field-row"><label class="field"><span>Aluguel (R$) *</span>'+
      '<input id="vit_aluguel" type="number" min="0" step="0.01" value="'+(Number(i.aluguel)||0)+'"></label>'+
      '<label class="field"><span>Condomínio (R$)</span><input id="vit_cond" type="number" min="0" step="0.01" value="'+(Number(i.condominio)||0)+'"></label>'+
      '<label class="field"><span>IPTU mensal (R$)</span><input id="vit_iptu" type="number" min="0" step="0.01" value="'+(Number(i.iptu)||0)+'"></label></div>'+

    '<div class="form-section-title">O imóvel</div>'+
    '<div class="field-row"><label class="field"><span>Quartos</span><input id="vit_quartos" type="number" min="0" step="1" value="'+(Number(i.quartos)||0)+'"></label>'+
      '<label class="field"><span>Banheiros</span><input id="vit_banheiros" type="number" min="0" step="1" value="'+(Number(i.banheiros)||0)+'"></label>'+
      '<label class="field"><span>Vagas</span><input id="vit_vagas" type="number" min="0" step="1" value="'+(Number(i.vagas)||0)+'"></label>'+
      '<label class="field"><span>Área (m²)</span><input id="vit_area" type="number" min="0" step="0.01" value="'+(Number(i.areaM2)||0)+'"></label></div>'+
    '<div class="feature-check-grid house-room-checks">'+
      '<label><input id="vit_mobiliado" type="checkbox"'+(i.mobiliado?' checked':'')+'><span>Mobiliado</span></label>'+
      '<label><input id="vit_pet" type="checkbox"'+(i.aceitaPet?' checked':'')+'><span>Aceita pet</span></label>'+
      '<label><input id="vit_quintal" type="checkbox"'+(i.quintal?' checked':'')+'><span>Quintal</span></label>'+
      '<label><input id="vit_servico" type="checkbox"'+(i.areaServico?' checked':'')+'><span>Área de serviço</span></label></div>'+

    '<div class="form-section-title">Endereço</div>'+
    '<div class="field-row"><label class="field"><span>Rua</span><input id="vit_rua" value="'+esc(i.logradouro||'')+'"></label>'+
      '<label class="field"><span>Número</span><input id="vit_numero" value="'+esc(i.numero||'')+'"></label></div>'+
    '<div class="field-row"><label class="field"><span>Bairro</span><input id="vit_bairro" value="'+esc(i.bairro||'')+'"></label>'+
      '<label class="field"><span>Cidade</span><input id="vit_cidade" value="'+esc(i.cidade||'')+'"></label>'+
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
    '<label class="field-check"><input type="checkbox" id="vit_destaque"'+(i.destaque?' checked':'')+
      '><span><strong>Destaque</strong><small>Aparece primeiro na vitrine. Cobrado à parte.</small></span></label>';
}

function lerVitrineImovelForm(){
  const v=function(id){const e=document.getElementById(id);return e?String(e.value||'').trim():'';};
  const c=function(id){const e=document.getElementById(id);return !!(e&&e.checked);};
  return {
    codigo:v('vit_codigo'),titulo:v('vit_titulo'),tipo:v('vit_tipo')||'casa',
    anuncianteId:v('vit_anunciante')||null,
    aluguel:Number(v('vit_aluguel'))||0,condominio:Number(v('vit_cond'))||0,iptu:Number(v('vit_iptu'))||0,
    quartos:parseInt(v('vit_quartos'),10)||0,banheiros:parseInt(v('vit_banheiros'),10)||0,
    vagas:parseInt(v('vit_vagas'),10)||0,areaM2:Number(v('vit_area'))||0,
    mobiliado:c('vit_mobiliado'),aceitaPet:c('vit_pet'),quintal:c('vit_quintal'),areaServico:c('vit_servico'),
    logradouro:v('vit_rua'),numero:v('vit_numero'),bairro:v('vit_bairro'),
    cidade:v('vit_cidade'),uf:v('vit_uf').toUpperCase(),
    latitude:v('vit_lat')||null,longitude:v('vit_lng')||null,
    enderecoExatoPublico:c('vit_exato'),
    autorizacaoEnderecoEm:c('vit_exato')?new Date().toISOString():null,
    caucao:v('vit_caucao'),contratoMinimoMeses:parseInt(v('vit_contrato'),10)||12,
    exigeFiador:c('vit_fiador'),descricao:v('vit_desc'),destaque:c('vit_destaque')
  };
}

function openVitrineImovelModal(id){
  const item=id?vitrineImovelPorId(id):null;
  if(!(state.vitrine.anunciantes||[]).length&&!item){
    openModal('<h3 class="modal-title">Cadastre o anunciante primeiro</h3>'+
      '<p class="modal-text">Todo anúncio pertence a um proprietário. Cadastre quem paga a taxa antes de criar o imóvel.</p>'+
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-primary" onclick="closeModal();openVitrineAnuncianteModal()">Cadastrar anunciante</button></div>');
    return;
  }
  /* As fotos só aparecem depois que o anúncio existe: elas precisam do
     id para serem gravadas. Em anúncio novo, mostramos o aviso. */
  const blocoFotos=item
    ? '<div class="form-section-title">Fotos do anúncio</div>'+
      '<div id="vitrineFotos" class="vitrine-fotos">'+
      '<div class="vitrine-fotos-carregando">Carregando fotos…</div></div>'
    : '<div class="form-section-title">Fotos do anúncio</div>'+
      '<p class="modal-hint">Salve o anúncio primeiro e ele abre de novo para você adicionar as fotos.</p>';

  openModal('<h3 class="modal-title">'+(item?'Editar anúncio':'Novo anúncio')+'</h3>'+
    '<p class="modal-text">Este imóvel é de terceiro. Ele não entra no Financeiro nem no limite de casas do seu plano.</p>'+
    vitrineImovelFormHtml(item)+blocoFotos+
    '<div class="modal-actions">'+(item?'<button class="btn btn-danger" onclick="confirmarExcluirVitrineImovel(\''+id+'\')">Excluir</button>':'<span></span>')+
    '<div class="modal-actions-right"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary" onclick="salvarVitrineImovel('+(item?'\''+id+'\'':'null')+')">Salvar</button></div></div>');

  if(item) ensureVitrineFotos(id);
}

async function salvarVitrineImovel(id){
  const dados=lerVitrineImovelForm();
  if(!dados.titulo){showToast('Informe o título do anúncio.','error');return;}
  if(!dados.codigo){showToast('Informe o código do anúncio.','error');return;}
  try{
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
    const msg=/duplicate|unique/i.test(String(e&&e.message))
      ? 'Já existe um anúncio com esse código.' : ((e&&e.message)||'Não foi possível salvar.');
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
function renderVitrineAnunciantes(){
  const lista=state.vitrine.anunciantes||[];
  return '<div class="vitrine-panel"><div class="vitrine-panel-head"><div><h2>Anunciantes</h2>'+
    '<p>Os donos dos imóveis. Não têm login: são cadastros seus.</p></div>'+
    '<button class="btn btn-primary btn-sm" onclick="openVitrineAnuncianteModal()">+ Anunciante</button></div>'+
    (lista.length?'<div class="vitrine-table-wrap"><table class="vitrine-table"><thead><tr>'+
      '<th>Nome</th><th>Contato</th><th>Anúncios</th><th>Taxas pagas</th><th></th></tr></thead><tbody>'+
      lista.map(function(a){
        const imoveis=(state.vitrine.imoveis||[]).filter(function(i){return i.anuncianteId===a.id;});
        const pago=(state.vitrine.taxas||[]).filter(function(t){return t.anuncianteId===a.id&&t.pago;})
          .reduce(function(s,t){return s+Number(t.valor||0);},0);
        return '<tr><td><strong>'+esc(a.nome)+'</strong>'+(a.documento?'<span class="cell-sub">'+esc(a.documento)+'</span>':'')+'</td>'+
          '<td>'+esc(a.telefone||'—')+(a.email?'<span class="cell-sub">'+esc(a.email)+'</span>':'')+'</td>'+
          '<td><strong>'+imoveis.length+'</strong></td>'+
          '<td><strong>'+fmtMoney(pago)+'</strong></td>'+
          '<td><button class="btn btn-ghost btn-sm" onclick="openVitrineAnuncianteModal(\''+a.id+'\')">Editar</button></td></tr>';
      }).join('')+'</tbody></table></div>'
      :emptyState('Nenhum anunciante cadastrado.',tenantIconSvg()))+'</div>';
}
function openVitrineAnuncianteModal(id){
  const a=id?(state.vitrine.anunciantes||[]).find(function(x){return x.id===id;}):null;
  const i=a||{};
  openModal('<h3 class="modal-title">'+(a?'Editar anunciante':'Novo anunciante')+'</h3>'+
    '<p class="modal-text">Quem paga a taxa para divulgar o imóvel. Estes dados nunca aparecem na vitrine pública.</p>'+
    '<label class="field"><span>Nome *</span><input id="vit_an_nome" value="'+esc(i.nome||'')+'"></label>'+
    '<div class="field-row"><label class="field"><span>Telefone/WhatsApp</span><input id="vit_an_tel" value="'+esc(i.telefone||'')+'"></label>'+
      '<label class="field"><span>E-mail</span><input id="vit_an_email" type="email" value="'+esc(i.email||'')+'"></label></div>'+
    '<label class="field"><span>CPF/CNPJ</span><input id="vit_an_doc" value="'+esc(i.documento||'')+'"></label>'+
    '<label class="field"><span>Observações</span><textarea id="vit_an_obs" rows="3">'+esc(i.observacoes||'')+'</textarea></label>'+
    '<div class="modal-actions">'+(a?'<button class="btn btn-danger" onclick="excluirVitrineAnunciante(\''+id+'\')">Excluir</button>':'<span></span>')+
    '<div class="modal-actions-right"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary" onclick="salvarVitrineAnunciante('+(a?'\''+id+'\'':'null')+')">Salvar</button></div></div>');
}
async function salvarVitrineAnunciante(id){
  const v=function(x){const e=document.getElementById(x);return e?String(e.value||'').trim():'';};
  const item={nome:v('vit_an_nome'),telefone:v('vit_an_tel'),email:v('vit_an_email'),
    documento:v('vit_an_doc'),observacoes:v('vit_an_obs')};
  if(!item.nome){showToast('Informe o nome do anunciante.','error');return;}
  if(id)item.id=id;
  try{
    const salvo=await db.saveVitrineAnunciante(item);
    if(id)Object.assign((state.vitrine.anunciantes||[]).find(function(x){return x.id===id;})||{},salvo);
    else state.vitrine.anunciantes.push(salvo);
    closeModal();render();showToast('Anunciante salvo.','success');
  }catch(e){console.error(e);showToast((e&&e.message)||'Não foi possível salvar.','error');}
}
async function excluirVitrineAnunciante(id){
  try{
    await db.deleteVitrineAnunciante(id);
    state.vitrine.anunciantes=state.vitrine.anunciantes.filter(function(x){return x.id!==id;});
    closeModal();render();showToast('Anunciante excluído.','success');
  }catch(e){console.error(e);showToast('Não foi possível excluir.','error');}
}

/* ------------------------------------------------------------
   LEADS
   ------------------------------------------------------------ */
function renderVitrineLeads(){
  const leads=state.vitrine.leads||[];
  return '<div class="vitrine-panel"><div class="vitrine-panel-head"><div><h2>Leads</h2>'+
    '<p>Cada contato guarda de qual imóvel veio e por onde chegou.</p></div></div>'+
    (leads.length?'<div class="vitrine-table-wrap"><table class="vitrine-table"><thead><tr>'+
      '<th>Pessoa</th><th>Imóvel</th><th>Origem</th><th>Quando</th><th>Situação</th><th></th></tr></thead><tbody>'+
      leads.map(function(l){
        const im=vitrineImovelPorId(l.imovelId);
        return '<tr><td><strong>'+esc(l.nome||'—')+'</strong><span class="cell-sub">'+esc(l.telefone||'')+'</span></td>'+
          '<td>'+(im?'<span class="vitrine-code">#'+esc(im.codigo)+'</span><span class="cell-sub">'+esc(im.titulo)+'</span>':'—')+'</td>'+
          '<td><span class="chip '+(l.origem==='whatsapp'?'chip-brass':'chip-slate')+'">'+(l.origem==='whatsapp'?'WhatsApp':'Formulário')+'</span></td>'+
          '<td>'+esc(String(l.createdAt||'').slice(0,10).split('-').reverse().join('/'))+'</td>'+
          '<td><select class="vitrine-lead-select" onchange="atualizarVitrineLead(\''+l.id+'\',this.value)">'+
            VITRINE_LEAD_STATUS.map(function(s){return '<option value="'+s[0]+'"'+(l.status===s[0]?' selected':'')+'>'+s[1]+'</option>';}).join('')+
          '</select></td>'+
          '<td>'+(l.telefone?'<button class="btn btn-ghost btn-sm" onclick="abrirWhatsappLead(\''+l.id+'\')">WhatsApp</button>':'')+'</td></tr>';
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
function abrirWhatsappLead(id){
  const l=(state.vitrine.leads||[]).find(function(x){return x.id===id;});
  if(!l||!l.telefone)return;
  const im=vitrineImovelPorId(l.imovelId);
  let tel=l.telefone.replace(/\D/g,'');if(tel.length<=11)tel='55'+tel;
  const msg='Olá '+(l.nome||'')+'! Sou da vitrine de imóveis. Vi que você se interessou'+
    (im?' pelo imóvel #'+im.codigo+' — '+im.titulo:'')+'.';
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
function copyVitrineLink(){
  const url=vitrineUrl();
  if(!url){showToast('Salve primeiro o endereço público nas configurações.','error');return;}
  copyTextValue(url,'Link da Vitrine copiado.');
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
      '<p>Já sai com preço, características e o link daquele anúncio.</p></div></div>'+
      (ativos.length?'<div class="vitrine-share-grid">'+ativos.map(function(i){
        return '<div class="vitrine-share-card"><strong>#'+esc(i.codigo)+' · '+esc(i.titulo)+'</strong>'+
          '<span>'+fmtMoney(i.aluguel)+' / mês · '+i.quartos+' quartos</span>'+
          '<button class="btn btn-ghost btn-sm" onclick="copiarTextoVitrine(\''+i.id+'\')">Copiar texto</button></div>';
      }).join('')+'</div>':emptyState('Nenhum anúncio no ar para divulgar.',vitrineIconSvg()))+'</div>';
}
function copiarTextoVitrine(id){
  const i=vitrineImovelPorId(id);if(!i)return;
  const url=vitrineUrl();
  const texto='🏠 *'+i.titulo+'*\n'+
    '📍 '+[i.bairro,i.cidade].filter(Boolean).join(' · ')+'\n'+
    '💰 '+fmtMoney(i.aluguel)+'/mês'+(vitrineCustoTotal(i)!==i.aluguel?' ('+fmtMoney(vitrineCustoTotal(i))+' com taxas)':'')+'\n'+
    '🛏 '+i.quartos+' quartos · 🛁 '+i.banheiros+' banheiros'+(i.vagas?' · 🚗 '+i.vagas+' vaga(s)':'')+
    (i.areaM2?' · 📐 '+i.areaM2+'m²':'')+'\n'+
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
  render();
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
  state.vitrineDetalheId=p.get('imovel')||null;
}
function gravarFiltrosNaUrl(){
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
  if(state.vitrineDetalheId)p.set('imovel',state.vitrineDetalheId);
  history.replaceState(null,'','?'+p.toString());
}
function setVitrineFiltro(campo,valor){
  state.vitrineFiltros[campo]=campo==='quartos'?(parseInt(valor,10)||0):valor;
  gravarFiltrosNaUrl();render();
}
function toggleVitrineExtra(chave){
  const f=state.vitrineFiltros;
  f.extras=f.extras.includes(chave)?f.extras.filter(function(x){return x!==chave;}):f.extras.concat(chave);
  gravarFiltrosNaUrl();render();
}
function limparVitrineFiltros(){
  state.vitrineFiltros={busca:'',tipo:'',quartos:0,faixa:'',bairro:'',ordem:'destaque',extras:[]};
  gravarFiltrosNaUrl();render();
}
function abrirVitrineDetalhe(id){
  state.vitrineDetalheId=id;
  gravarFiltrosNaUrl();render();
  db.registrarVitrineVisita(id,'visualizacao');
  setTimeout(function(){desenharMapaVitrine(id);},60);
}
function fecharVitrineDetalhe(){
  if(window._vitrineMapa){try{window._vitrineMapa.remove();}catch(e){}window._vitrineMapa=null;}
  state.vitrineDetalheId=null;gravarFiltrosNaUrl();render();
}

function vitrineImoveisFiltrados(){
  const f=state.vitrineFiltros;
  const lista=((state.vitrinePublic||{}).imoveis)||[];
  const q=(f.busca||'').trim().toLowerCase();
  let out=lista.filter(function(i){
    if(q&&!((i.titulo+' '+i.bairro+' '+(i.logradouro||'')+' '+i.codigo).toLowerCase().includes(q)))return false;
    if(f.tipo&&i.tipo!==f.tipo)return false;
    if(f.quartos&&Number(i.quartos)<f.quartos)return false;
    if(f.bairro&&i.bairro!==f.bairro)return false;
    if(f.faixa){
      const parts=f.faixa.split('-').map(Number);
      const v=Number(i.aluguel)||0;
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
  if(f.ordem==='menor')out.sort(function(a,b){return a.aluguel-b.aluguel;});
  else if(f.ordem==='maior')out.sort(function(a,b){return b.aluguel-a.aluguel;});
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
  if(state.vitrineDetalheId){
    const item=(dados.imoveis||[]).find(function(x){return x.id===state.vitrineDetalheId;});
    if(item)return '<div class="vitrine-public">'+renderVitrineTopoPublico(perfil,dados)+
      renderVitrineDetalhe(item,perfil)+'</div>';
  }
  return '<div class="vitrine-public">'+renderVitrineTopoPublico(perfil,dados)+
    renderVitrineFiltros(dados)+renderVitrineGrid()+'</div>';
}

function renderVitrineTopoPublico(perfil,dados){
  const total=(dados.imoveis||[]).length;
  return '<header class="vitrine-pub-top"><div class="vitrine-pub-top-in">'+logoSvg()+
    '<div><span class="eyebrow">IMÓVEIS PARA ALUGAR</span>'+
    '<h1>'+esc(perfil.nome||'Imóveis disponíveis')+'</h1></div>'+
    '<span class="vitrine-pub-count">'+total+' imóve'+(total===1?'l':'is')+' disponíve'+(total===1?'l':'is')+'</span>'+
    '</div></header>';
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
    '<select class="vitrine-sel" onchange="setVitrineFiltro(\'quartos\',this.value)">'+
      '<option value="0">Quartos</option>'+[1,2,3,4].map(function(n){
        return '<option value="'+n+'"'+(f.quartos===n?' selected':'')+'>'+n+'+</option>';}).join('')+'</select>'+
    '<select class="vitrine-sel" onchange="setVitrineFiltro(\'faixa\',this.value)">'+
      ['','0-800','800-1200','1200-2000','2000-999999'].map(function(v){
        const rot=v===''?'Qualquer preço':v==='0-800'?'Até R$ 800':v==='800-1200'?'R$ 800 a 1.200':
          v==='1200-2000'?'R$ 1.200 a 2.000':'Acima de R$ 2.000';
        return '<option value="'+v+'"'+(f.faixa===v?' selected':'')+'>'+rot+'</option>';}).join('')+'</select>'+
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
  return '<main class="vitrine-pub-main">'+
    '<div class="vitrine-result"><b>'+lista.length+' imóve'+(lista.length===1?'l':'is')+'</b></div>'+
    (lista.length?'<div class="vitrine-grid">'+lista.map(renderVitrineCard).join('')+'</div>'
     :'<div class="vitrine-pub-empty"><h2>Nenhum imóvel com esses filtros</h2>'+
       '<p>Tente ampliar a faixa de preço ou trocar o bairro.</p>'+
       '<button class="btn btn-primary" onclick="limparVitrineFiltros()">Limpar filtros</button></div>')+
    '</main>';
}

function renderVitrineCard(i){
  const foto=(i.fotoUrls&&i.fotoUrls[0])||'';
  const total=vitrineTotalMes(i);
  return '<article class="vitrine-card" onclick="abrirVitrineDetalhe(\''+i.id+'\')">'+
    '<div class="vitrine-card-foto">'+
      (foto?'<img src="'+esc(foto)+'" alt="Foto de '+esc(i.titulo)+'" loading="lazy">'
           :'<div class="vitrine-sem-foto">'+houseIconSvg()+'</div>')+
      (i.destaque?'<span class="vitrine-badge">★ DESTAQUE</span>':'')+
      ((i.fotoUrls||[]).length>1?'<span class="vitrine-fotos-n">▣ '+i.fotoUrls.length+' fotos</span>':'')+
    '</div>'+
    '<div class="vitrine-card-body">'+
      '<div class="vitrine-card-top"><span class="chip chip-brass">DISPONÍVEL</span>'+
        '<span class="vitrine-code">#'+esc(i.codigo)+'</span></div>'+
      '<h3>'+esc(i.titulo)+'</h3>'+
      '<p class="vitrine-endereco">'+esc([i.logradouro,i.bairro].filter(Boolean).join(' · ')||'Consulte a localização')+'</p>'+
      '<div class="vitrine-preco">'+fmtMoney(i.aluguel)+' <small>/ mês</small>'+
        (total!==i.aluguel?'<span class="vitrine-total">'+fmtMoney(total)+' com condomínio e IPTU</span>':'')+'</div>'+
      '<div class="vitrine-specs"><span><b>'+i.quartos+'</b> quartos</span>'+
        '<span><b>'+i.banheiros+'</b> banh.</span>'+
        '<span><b>'+(i.vagas||'—')+'</b> vaga'+(Number(i.vagas)===1?'':'s')+'</span>'+
        (i.areaM2?'<span><b>'+i.areaM2+'</b> m²</span>':'')+'</div>'+
    '</div></article>';
}

function vitrineWhatsappUrl(perfil,i){
  let tel=String((perfil&&perfil.contato)||'').replace(/\D/g,'');
  if(!tel)return '';
  if(tel.length<=11)tel='55'+tel;
  /* O código vai na mensagem: com 20 conversas por dia, você sabe
     na hora de qual imóvel a pessoa está falando. */
  const msg='Olá! Vi o imóvel #'+i.codigo+' — '+i.titulo+' ('+fmtMoney(i.aluguel)+'/mês) na sua vitrine e tenho interesse.';
  return 'https://wa.me/'+tel+'?text='+encodeURIComponent(msg);
}
function abrirVitrineWhatsapp(id){
  const dados=state.vitrinePublic||{};
  const i=(dados.imoveis||[]).find(function(x){return x.id===id;});
  if(!i)return;
  const url=vitrineWhatsappUrl(dados.perfil,i);
  if(!url){showToast('Contato não disponível no momento.','error');return;}
  db.registrarVitrineVisita(id,'whatsapp');
  window.open(url,'_blank');
}

function renderVitrineDetalhe(i,perfil){
  const total=vitrineTotalMes(i);
  const fotos=i.fotoUrls||[];
  const wa=vitrineWhatsappUrl(perfil,i);
  const endereco=[i.logradouro,i.numero].filter(Boolean).join(', ');
  return '<div class="vitrine-detalhe">'+
    '<button class="vitrine-voltar" onclick="fecharVitrineDetalhe()">← Voltar para a lista</button>'+

    '<div class="vitrine-galeria">'+
      (fotos.length?'<div class="vg-principal"><img src="'+esc(fotos[0])+'" alt="Foto de '+esc(i.titulo)+'"></div>'+
        (fotos.length>1?'<div class="vg-lado">'+fotos.slice(1,3).map(function(f,n){
          const resto=fotos.length-3;
          return '<div><img src="'+esc(f)+'" alt="Foto '+(n+2)+'">'+
            (n===1&&resto>0?'<span class="vg-mais">+ '+resto+' fotos</span>':'')+'</div>';
        }).join('')+'</div>':'')
       :'<div class="vg-principal vitrine-sem-foto">'+houseIconSvg()+'</div>')+
    '</div>'+

    '<div class="vitrine-detalhe-cols"><div>'+

      '<div class="vitrine-bloco">'+
        '<div class="vitrine-tags"><span class="chip chip-brass">DISPONÍVEL</span>'+
          '<span class="vitrine-code">#'+esc(i.codigo)+'</span>'+
          '<span class="chip chip-slate">'+esc(vitrineTipoLabel(i.tipo).toUpperCase())+'</span>'+
          (i.destaque?'<span class="chip chip-warn">★ DESTAQUE</span>':'')+'</div>'+
        '<h2>'+esc(i.titulo)+'</h2>'+
        '<p class="vitrine-sub">'+esc([endereco,i.bairro,i.cidade].filter(Boolean).join(' · '))+'</p></div>'+

      '<div class="vitrine-bloco"><h2>O que o imóvel tem</h2>'+
        '<div class="vitrine-feats">'+
          vitrineFeat('🛏',i.quartos,'quartos')+vitrineFeat('🛁',i.banheiros,'banheiros')+
          vitrineFeat('🚗',i.vagas||'—','vagas')+(i.areaM2?vitrineFeat('📐',i.areaM2,'m² úteis'):'')+
          vitrineFeat('🛋',i.mobiliado?'Sim':'Não','mobiliado')+
          vitrineFeat('🐾',i.aceitaPet?'Sim':'Não','aceita pet')+
          vitrineFeat('🌳',i.quintal?'Sim':'Não','quintal')+
          vitrineFeat('🧺',i.areaServico?'Sim':'Não','área de serviço')+
        '</div></div>'+

      '<div class="vitrine-bloco"><h2>Quanto custa por mês</h2>'+
        '<p class="vitrine-sub">Estimativa completa — a pergunta que mais aparece no WhatsApp, já respondida.</p>'+
        '<div class="vitrine-custo"><span>Aluguel</span><b>'+fmtMoney(i.aluguel)+'</b></div>'+
        '<div class="vitrine-custo"><span>Condomínio</span><b>'+(Number(i.condominio)?fmtMoney(i.condominio):'não há')+'</b></div>'+
        '<div class="vitrine-custo"><span>IPTU</span><b>'+(Number(i.iptu)?fmtMoney(i.iptu):'não há')+'</b></div>'+
        '<div class="vitrine-custo-total"><span>Total estimado por mês</span><b>'+fmtMoney(total)+'</b></div></div>'+

      (i.descricao?'<div class="vitrine-bloco"><h2>Sobre o imóvel</h2>'+
        '<p class="vitrine-texto">'+esc(i.descricao)+'</p></div>':'')+

      ((i.latitude&&i.longitude)?'<div class="vitrine-bloco"><h2>Onde fica</h2>'+
        '<p class="vitrine-sub">'+esc([endereco,i.bairro].filter(Boolean).join(' · '))+'</p>'+
        '<div id="vitrineMapa"></div></div>':'')+

      ((i.pontosInteresse||[]).length?'<div class="vitrine-bloco"><h2>O que tem por perto</h2>'+
        '<div class="vitrine-poi">'+(i.pontosInteresse||[]).map(function(p){
          return '<div class="vitrine-poi-item"><i>'+esc(p.icone||'📍')+'</i><div>'+
            '<b>'+esc(p.nome||'')+'</b><span>'+esc(p.distancia||'')+'</span></div></div>';
        }).join('')+'</div></div>':'')+

      '<div class="vitrine-bloco"><h2>Regras da locação</h2>'+
        '<div class="vitrine-regra"><i>📄</i><span>Garantia: <b>'+esc(i.caucao||(i.exigeFiador?'fiador':'a combinar'))+'</b></span></div>'+
        '<div class="vitrine-regra"><i>📅</i><span>Contrato mínimo: <b>'+Number(i.contratoMinimoMeses||12)+' meses</b></span></div>'+
        '<div class="vitrine-regra"><i>🐾</i><span>Animais: <b>'+(i.aceitaPet?'permitidos':'não permitidos')+'</b></span></div>'+
      '</div>'+

    '</div><div><div class="vitrine-sticky"><div class="vitrine-contato">'+
      '<div class="vitrine-contato-topo"><span class="eyebrow">VALOR DO ALUGUEL</span>'+
        '<div class="vitrine-preco-grande">'+fmtMoney(i.aluguel)+' <small>/ mês</small></div>'+
        (total!==i.aluguel?'<div class="vitrine-total-topo">'+fmtMoney(total)+' com condomínio e IPTU</div>':'')+'</div>'+
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
      '</div></div></div></div></div></div>';
}
function vitrineFeat(ico,val,label){
  return '<div class="vitrine-feat"><i>'+ico+'</i><div><b>'+esc(String(val))+'</b><span>'+esc(label)+'</span></div></div>';
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
      mensagem:v('vit_lead_msg'),consentimento:true});
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
      comprimidas.push({blob:blob,nome:(f.name||'foto').replace(/\.[^.]+$/,'')+'.jpg',mime:'image/jpeg'});
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
                  :'<button type="button" class="vitrine-foto-acao" title="Usar como capa" '+
                   'onclick="definirCapaVitrine(\''+imovelId+'\',\''+f.id+'\')">★</button>')+
            '<button type="button" class="vitrine-foto-remover" aria-label="Remover foto" '+
              'onclick="excluirVitrineFoto(\''+imovelId+'\',\''+f.id+'\')">×</button>'+
          '</div>';
        }).join('')+'</div>'+
        '<p class="vitrine-fotos-dica">A primeira foto é a capa: é ela que aparece no card e na prévia do link.</p>'
      : '<div class="vitrine-fotos-vazio">'+photoIconSvg()+
        '<span>Nenhuma foto ainda. Anúncio sem foto quase não recebe contato.</span></div>');
}
