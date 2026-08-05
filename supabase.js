/* ============================================================
   supabase.js — Cliente Supabase + camada de acesso a dados
   Substitui completamente o antigo window.storage.
   Estratégia: o banco é normalizado (tabelas separadas), mas em
   memória montamos o MESMO formato que a interface já usava
   (casa com pagamentos[]/despesas[]/statusHistorico[] embutidos),
   pra reaproveitar toda a lógica de renderização existente.
   ============================================================ */

const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
const FILE_BUCKET = 'imoveis-arquivos';
let _actingOwnerId = null;

/* ---- Vitrine: banco (snake_case) <-> memória (camelCase) ---- */
function rowToVitrineAnunciante(r){
  return {id:r.id,nome:r.nome||'',telefone:r.telefone||'',email:r.email||'',
    documento:r.documento||'',observacoes:r.observacoes||'',
    /* Ponte com o cadastro de proprietários-clientes da gestão. O
       anunciante continua existindo por si — a Vitrine anuncia imóvel de
       gente que não é cliente da administração. */
    proprietarioClienteId:r.proprietario_cliente_id||'',
    createdAt:r.created_at||''};
}
/* Endereço da cidade na URL pública: sem acento, sem espaço. */
function vitrineCidadeSlug(valor){
  return String(valor||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,60);
}
function rowToVitrineCidade(r){
  return {
    id:r.id,nome:r.nome||'',uf:r.uf||'PE',slug:r.slug||'',
    fotoPath:r.foto_path||'',ordem:Number(r.ordem)||0,ativa:r.ativa!==false
  };
}
function rowToVitrineImovel(r){
  return {
    id:r.id,anuncianteId:r.anunciante_id||'',codigo:r.codigo||'',titulo:r.titulo||'',
    tipo:r.tipo||'casa',
    /* Site da corretora: finalidade, venda, cidade e terreno. */
    finalidade:r.finalidade||'alugar',
    precoVenda:Number(r.preco_venda)||0,
    cidadeId:r.cidade_id||'',
    frenteM:(r.frente_m==null?null:Number(r.frente_m)),
    fundoM:(r.fundo_m==null?null:Number(r.fundo_m)),
    murado:!!r.murado,esquina:!!r.esquina,topografia:r.topografia||'',
    aluguel:Number(r.aluguel)||0,condominio:Number(r.condominio)||0,iptu:Number(r.iptu)||0,
    quartos:Number(r.quartos)||0,banheiros:Number(r.banheiros)||0,vagas:Number(r.vagas)||0,
    areaM2:Number(r.area_m2)||0,
    mobiliado:!!r.mobiliado,aceitaPet:!!r.aceita_pet,quintal:!!r.quintal,areaServico:!!r.area_servico,
    exigeFiador:!!r.exige_fiador,caucao:r.caucao||'',
    contratoMinimoMeses:Number(r.contrato_minimo_meses)||12,descricao:r.descricao||'',
    cep:r.cep||'',logradouro:r.logradouro||'',numero:r.numero||'',bairro:r.bairro||'',
    cidade:r.cidade||'',uf:r.uf||'',
    latitude:r.latitude==null?null:Number(r.latitude),
    longitude:r.longitude==null?null:Number(r.longitude),
    enderecoExatoPublico:r.endereco_exato_publico!==false,
    autorizacaoEnderecoEm:r.autorizacao_endereco_em||'',
    pontosInteresse:Array.isArray(r.pontos_interesse)?r.pontos_interesse:[],
    imovelId:r.imovel_id||'',
    status:r.status||'rascunho',destaque:!!r.destaque,
    publicadoEm:r.publicado_em||'',expiraEm:r.expira_em||'',
    visualizacoes:Number(r.visualizacoes)||0,
    contatosWhatsapp:Number(r.contatos_whatsapp)||0,
    contatosFormulario:Number(r.contatos_formulario)||0,
    createdAt:r.created_at||'',
    /* Quando o anúncio mudou de situação pela última vez. É o que permite
       contar quantos saíram do ar por terem sido alugados ou vendidos no
       mês — o número que a corretora acompanha. */
    updatedAt:r.updated_at||''
  };
}
function vitrineImovelToRow(i){
  return {
    anunciante_id:i.anuncianteId||null,codigo:i.codigo,titulo:i.titulo,tipo:i.tipo||'casa',
    finalidade:['alugar','vender','ambos'].includes(i.finalidade)?i.finalidade:'alugar',
    preco_venda:Number(i.precoVenda)||0,
    cidade_id:i.cidadeId||null,
    frente_m:(i.frenteM===''||i.frenteM==null)?null:Number(i.frenteM),
    fundo_m:(i.fundoM===''||i.fundoM==null)?null:Number(i.fundoM),
    murado:!!i.murado,esquina:!!i.esquina,
    topografia:['','plano','aclive','declive','irregular'].includes(i.topografia)?i.topografia:'',
    aluguel:Number(i.aluguel)||0,condominio:Number(i.condominio)||0,iptu:Number(i.iptu)||0,
    quartos:Number(i.quartos)||0,banheiros:Number(i.banheiros)||0,vagas:Number(i.vagas)||0,
    area_m2:Number(i.areaM2)||0,
    mobiliado:!!i.mobiliado,aceita_pet:!!i.aceitaPet,quintal:!!i.quintal,area_servico:!!i.areaServico,
    exige_fiador:!!i.exigeFiador,caucao:i.caucao||'',
    contrato_minimo_meses:Number(i.contratoMinimoMeses)||12,descricao:i.descricao||'',
    cep:i.cep||'',logradouro:i.logradouro||'',numero:i.numero||'',bairro:i.bairro||'',
    cidade:i.cidade||'',uf:i.uf||'',
    latitude:i.latitude==null||i.latitude===''?null:Number(i.latitude),
    longitude:i.longitude==null||i.longitude===''?null:Number(i.longitude),
    endereco_exato_publico:i.enderecoExatoPublico!==false,
    autorizacao_endereco_em:i.autorizacaoEnderecoEm||null,
    pontos_interesse:Array.isArray(i.pontosInteresse)?i.pontosInteresse:[],
    destaque:!!i.destaque,
    /* Qual imóvel da gestão gerou este anúncio. Vazio no anúncio de
       terceiro, que é o caso mais comum numa corretora. */
    imovel_id:i.imovelId||null,
    updated_at:new Date().toISOString()
  };
}
function rowToVitrineLead(r){
  return {id:r.id,imovelId:r.imovel_id||'',nome:r.nome||'',telefone:r.telefone||'',
    mensagem:r.mensagem||'',origem:r.origem||'formulario',status:r.status||'novo',
    interessadoId:r.interessado_id||'',
    createdAt:r.created_at||''};
}
function rowToVitrineTaxa(r){
  return {id:r.id,imovelId:r.imovel_id||'',anuncianteId:r.anunciante_id||'',
    valor:Number(r.valor)||0,formaPagamento:r.forma_pagamento||'',
    periodoInicio:r.periodo_inicio||'',periodoFim:r.periodo_fim||'',
    pago:!!r.pago,dataPagamento:r.data_pagamento||'',observacao:r.observacao||''};
}

/* ---- mapeamentos banco (snake_case) <-> memória (camelCase) ---- */
function rowToHouse(r){
  return {
    id: r.id,
    nome: r.nome,
    tipo: r.tipo || 'casa',
    endereco: r.endereco || '',
    status: r.status || 'vaga',
    /* De quem é a casa. Vazio quando é do próprio dono da conta — o caso
       do proprietário que administra o que é dele. */
    proprietarioClienteId: r.proprietario_cliente_id || '',
    aluguelValor: Number(r.aluguel_valor) || 0,
    diaVencimento: r.dia_vencimento || 5,
    ultimaVistoria: r.ultima_vistoria || '',
    tenantId: r.tenant_id || '',
    contratoInicio: r.contrato_inicio || '',
    contratoFim: r.contrato_fim || '',
    quartos: Number(r.quartos)||0,
    banheiros: Number(r.banheiros)||0,
    cozinha: !!r.cozinha,
    sala: !!r.sala,
    garagem: !!r.garagem,
    quintal: !!r.quintal,
    areaServico: !!r.area_servico,
    publicado: !!r.publicado,
    descricaoPublica: r.descricao_publica || '',
    energiaAtiva: r.energia_ativa!==false,
    energiaDiaVencimento: r.energia_dia_vencimento||5,
    createdAt: r.created_at || '',
    arquivadoEm: r.arquivado_em || '',
    motivoArquivamento: r.motivo_arquivamento || '',
    statusHistorico: [],
    contracts: [],
    pagamentos: [],
    cobrancas: [],
    recebimentos: [],
    despesas: [],
    chamados: [],
    aluguelHistorico: [],
    energias: []
  };
}
/* "tipo" do imóvel é campo novo. Se a coluna ainda não existe (migração
   migracao-imovel-tipo.sql não aplicada), a 1ª gravação falha, marcamos e
   reenviamos sem o campo — o cadastro nunca quebra por causa disso. */
let _imovelTipoOff=false;
function _isMissingTipoError(err){ return /tipo/i.test(String(err&&err.message||'')); }
/* Mesmo padrão para o RG do inquilino (campo novo, migracao-inquilino-rg.sql). */
let _inquilinoRgOff=false;
/* Idem para as preferências de forma de pagamento da Minha Casa. */
let _myHomePayPrefsOff=false;
function _isMissingRgError(err){ return /\brg\b/i.test(String(err&&err.message||'')); }
/* Idem para o vínculo com o proprietário-cliente
   (migracao-proprietario-cliente.sql). Enquanto a migração não roda, o
   imóvel salva sem o vínculo em vez de a gravação falhar. */
let _imovelDonoOff=false;
function _isMissingDonoError(err){
  return /proprietario_cliente_id/i.test(String(err&&err.message||''));
}
function houseToRow(h){
  const row = {
    nome: h.nome,
    endereco: h.endereco || '',
    status: h.status || 'vaga',
    aluguel_valor: Number(h.aluguelValor) || 0,
    dia_vencimento: h.diaVencimento || 5,
    ultima_vistoria: h.ultimaVistoria || null,
    tenant_id: h.tenantId || null,
    contrato_inicio: h.contratoInicio || null,
    contrato_fim: h.contratoFim || null,
    quartos: Math.max(0,parseInt(h.quartos,10)||0),
    banheiros: Math.max(0,parseInt(h.banheiros,10)||0),
    cozinha: !!h.cozinha,
    sala: !!h.sala,
    garagem: !!h.garagem,
    quintal: !!h.quintal,
    area_servico: !!h.areaServico,
    publicado: !!h.publicado,
    descricao_publica: String(h.descricaoPublica||'').slice(0,3000),
    energia_ativa: h.energiaAtiva!==false,
    energia_dia_vencimento: Math.min(31,Math.max(1,parseInt(h.energiaDiaVencimento,10)||5)),
    updated_at: new Date().toISOString()
  };
  if(!_imovelTipoOff) row.tipo = normalizeImovelTipo(h.tipo);
  if(!_imovelDonoOff) row.proprietario_cliente_id = h.proprietarioClienteId || null;
  return row;
}
function rowToConfig(r){
  r=r||{};
  return {locadorNome:r.locador_nome||'',locadorDocumento:r.locador_documento||'',energiaAtiva:r.energia_ativa!==false,
    tema:normalizeAppTheme(r.tema),onboardingConcluido:!!r.onboarding_concluido,ultimoBackupExterno:r.ultimo_backup_externo||'',
    pixChave:r.pix_chave||'',pixNome:r.pix_nome||'',pixCidade:r.pix_cidade||''};
}
/* Proprietário-cliente: o dono do imóvel que a corretora administra.
   Não confundir com `proprietarios`, que é a conta do próprio cliente da
   plataforma. */
function rowToOwnerClient(r){
  return {
    id:r.id, nome:r.nome||'',
    telefone:r.telefone||'', email:r.email||'', documento:r.documento||'',
    pixChave:r.pix_chave||'', banco:r.banco||'',
    agencia:r.agencia||'', conta:r.conta||'',
    taxaAdministracao:Number(r.taxa_administracao)||0,
    observacoes:r.observacoes||'',
    arquivadoEm:r.arquivado_em||'', motivoArquivamento:r.motivo_arquivamento||''
  };
}
function ownerClientToRow(o){
  return {
    nome:String(o.nome||'').trim().slice(0,160),
    telefone:String(o.telefone||'').trim().slice(0,40),
    email:String(o.email||'').trim().slice(0,180),
    documento:String(o.documento||'').trim().slice(0,80),
    pix_chave:String(o.pixChave||'').trim().slice(0,180),
    banco:String(o.banco||'').trim().slice(0,80),
    agencia:String(o.agencia||'').trim().slice(0,20),
    conta:String(o.conta||'').trim().slice(0,30),
    taxa_administracao:Math.min(100,Math.max(0,Number(o.taxaAdministracao)||0)),
    observacoes:String(o.observacoes||'').trim().slice(0,2000),
    updated_at:new Date().toISOString()
  };
}

function rowToTenant(r){
  return {
    id: r.id, nome: r.nome,
    telefone: r.telefone || '', email: r.email || '',
    documento: r.documento || '', rg: r.rg || '', emergenciaNome: r.emergencia_nome || '',
    arquivadoEm:r.arquivado_em||'',motivoArquivamento:r.motivo_arquivamento||''
  };
}

function rowToInterest(r){
  return {
    id:r.id,nome:r.nome||'',telefone:r.telefone||'',valorMaximo:Number(r.valor_maximo)||0,
    quartosMin:Number(r.quartos_min)||0,banheirosMin:Number(r.banheiros_min)||0,
    precisaGaragem:!!r.precisa_garagem,precisaQuintal:!!r.precisa_quintal,
    precisaCozinha:!!r.precisa_cozinha,precisaSala:!!r.precisa_sala,
    precisaAreaServico:!!r.precisa_area_servico,observacoes:r.observacoes||'',status:r.status||'novo',
    tenantId:r.inquilino_id||'',createdAt:r.created_at||''
  };
}

function rowToMaintenanceCall(r){
  return {
    id:r.id,houseId:r.imovel_id||'',tenantId:r.inquilino_id||'',
    titulo:r.titulo||'',descricao:r.descricao||'',
    categoria:r.categoria||'outro',prioridade:r.prioridade||'normal',
    status:r.status||'aberto',abertoPor:r.aberto_por||'proprietario',
    resposta:r.resposta||'',despesaId:r.despesa_id||'',
    resolvidoEm:r.resolvido_em||'',createdAt:r.created_at||'',
    updatedAt:r.updated_at||'',
    /* Campos da gestão completa. Ausentes enquanto a migração não roda. */
    prazo:r.prazo||'',responsavel:r.responsavel||'',fornecedor:r.fornecedor||'',
    orcamento:(r.orcamento===null||r.orcamento===undefined)?null:Number(r.orcamento),
    custoFinal:(r.custo_final===null||r.custo_final===undefined)?null:Number(r.custo_final),
    quemPaga:r.quem_paga||'proprietario',observacoes:r.observacoes||'',
    motivoEncerramento:r.motivo_encerramento||'',encerradoEm:r.encerrado_em||'',
    arquivadoEm:r.arquivado_em||'',
    historico:Array.isArray(r.historico)?r.historico:[]
  };
}

function rowToExpense(r){
  return {
    id:r.id,
    descricao:r.descricao||'',
    categoria:r.categoria||'Outro',
    valor:Number(r.valor)||0,
    data:r.data||'',
    prestador:r.prestador||'',
    status:r.status||'Concluído',
    arquivadoEm:r.arquivado_em||'',
    motivoArquivamento:r.motivo_arquivamento||''
  };
}

/* Campos da gestão completa (migracao-manutencoes.sql). Se a migração
   ainda não foi aplicada, a primeira gravação falha, marcamos e
   reenviamos só com as colunas antigas — o chamado nunca deixa de ser
   salvo por causa disso. */
let _manutencaoCamposOff=false;
function _isMissingManutencaoError(err){
  return /prazo|responsavel|fornecedor|orcamento|custo_final|quem_paga|observacoes|motivo_encerramento|encerrado_em|arquivado_em|historico|aguardando_orcamento|aprovado/i
    .test(String(err&&err.message||''));
}
const MANUTENCAO_CAMPOS_NOVOS=['prazo','responsavel','fornecedor','orcamento','custo_final',
  'quem_paga','observacoes','motivo_encerramento','encerrado_em','arquivado_em','historico'];
function _semCamposNovosManutencao(row){
  const copia=Object.assign({},row);
  MANUTENCAO_CAMPOS_NOVOS.forEach(function(c){ delete copia[c]; });
  /* As situações novas também dependem da migração: sem ela, o banco só
     aceita as cinco antigas. */
  if(copia.status==='aguardando_orcamento'||copia.status==='aprovado') copia.status='aberto';
  return copia;
}
function maintenanceCallToRow(item,houseId){
  const categories=['hidraulica','eletrica','estrutura','eletrodomestico','pintura','outro'];
  const priorities=['urgente','alta','normal','baixa'];
  const statuses=['aberto','aguardando_orcamento','aprovado','em_andamento',
    'aguardando_peca','resolvido','cancelado'];
  const pagadores=['proprietario','inquilino','dividido','outro'];
  const status=statuses.includes(item.status)?item.status:'aberto';
  const numero=function(v){
    if(v===''||v===null||v===undefined) return null;
    const n=Number(v);
    return isFinite(n)&&n>=0?n:null;
  };
  const extras=_manutencaoCamposOff?{}:{
    prazo:item.prazo||null,
    responsavel:String(item.responsavel||'').trim().slice(0,180),
    fornecedor:String(item.fornecedor||'').trim().slice(0,180),
    orcamento:numero(item.orcamento),
    custo_final:numero(item.custoFinal),
    quem_paga:pagadores.includes(item.quemPaga)?item.quemPaga:'proprietario',
    observacoes:String(item.observacoes||'').trim().slice(0,4000),
    motivo_encerramento:String(item.motivoEncerramento||'').trim().slice(0,600),
    encerrado_em:(status==='resolvido'||status==='cancelado')
      ? (item.encerradoEm||new Date().toISOString()) : null,
    arquivado_em:item.arquivadoEm||null,
    historico:Array.isArray(item.historico)?item.historico.slice(-100):[]
  };
  return Object.assign(extras,{
    imovel_id:houseId||item.houseId,
    inquilino_id:item.tenantId||null,
    titulo:String(item.titulo||'').trim(),
    descricao:String(item.descricao||'').trim(),
    categoria:categories.includes(item.categoria)?item.categoria:'outro',
    prioridade:priorities.includes(item.prioridade)?item.prioridade:'normal',
    status:status,
    aberto_por:item.abertoPor==='inquilino'?'inquilino':'proprietario',
    resposta:String(item.resposta||'').trim(),
    despesa_id:item.despesaId||null,
    resolvido_em:status==='resolvido'
      ? (item.resolvidoEm||new Date().toISOString())
      : null,
    updated_at:new Date().toISOString()
  });
}

function rowToEnergy(r){
  return {
    id:r.id,mes:r.mes,contractId:r.contrato_id||'',valor:Number(r.valor)||0,kwh:Number(r.kwh)||0,
    leituraAnterior:Number(r.leitura_anterior)||0,leituraAtual:Number(r.leitura_atual)||0,
    tarifaKwh:Number(r.tarifa_kwh)||0,acrescimos:Number(r.acrescimos)||0,
    descontos:Number(r.descontos)||0,ajusteDescricao:r.ajuste_descricao||'',
    valorCalculado:Number(r.valor_calculado)||0,valorManual:!!r.valor_manual,
    vencimento:r.vencimento||'',fotoPath:r.foto_path||'',pago:!!r.pago,
    dataPagamento:r.data_pagamento||'',
    arquivadoEm:r.arquivado_em||'',
    motivoArquivamento:r.motivo_arquivamento||''
  };
}

function rowToContract(r){
  return {
    id:r.id, houseId:r.imovel_id||'', tenantId:r.tenant_id||'',
    inicio:r.inicio||'', fim:r.fim||'', valor:Number(r.valor)||0,
    valorInicial:Number(r.valor_inicial==null?r.valor:r.valor_inicial)||0,
    valorInicialRevisar:!!r.valor_inicial_revisar,
    valorInicialOrigem:r.valor_inicial_origem||'',
    diaVencimento:r.dia_vencimento||5,
    modalidade:r.modalidade_vencimento==='entrada'?'entrada':'fixo',
    ativo:!!r.ativo,
    reajustes:[],
    proporcionalDias:Number(r.proporcional_dias)||0,
    proporcionalValor:Number(r.proporcional_valor)||0,
    proporcionalPago:!!r.proporcional_pago,
    proporcionalDataPagamento:r.proporcional_data_pagamento||'',
    arquivadoEm:r.arquivado_em||'',motivoArquivamento:r.motivo_arquivamento||''
  };
}

function rowToCharge(r){
  return {
    id:r.id,houseId:r.imovel_id||'',contractId:r.contrato_id||'',
    tenantId:r.inquilino_id||'',mes:r.mes||r.competencia||'',
    competencia:r.competencia||r.mes||'',tipo:r.tipo||'outro',
    descricao:r.descricao||'',valorPrevisto:Number(r.valor_previsto)||0,
    vencimento:r.vencimento||'',toleranciaDias:Number(r.tolerancia_dias)||0,
    status:r.status||'a_vencer',totalRecebido:Number(r.total_recebido)||0,
    saldoAberto:Number(r.saldo_aberto)||0,creditoAFavor:Number(r.credito_a_favor)||0,
    primeiroPagamento:r.primeiro_pagamento||'',ultimoPagamento:r.ultimo_pagamento||'',
    origemTipo:r.origem_tipo||'manual',origemId:r.origem_id||'',
    observacao:r.observacao||'',arquivadoEm:r.arquivado_em||'',
    motivoArquivamento:r.motivo_arquivamento||''
  };
}

function chargeToRow(item,houseId){
  return {
    imovel_id:houseId||item.houseId,
    contrato_id:item.contractId||null,
    inquilino_id:item.tenantId||null,
    competencia:item.competencia||item.mes,
    tipo:['aluguel','energia','ajuste','outro'].includes(item.tipo)?item.tipo:'outro',
    descricao:item.descricao||'',
    valor_previsto:Number(item.valorPrevisto)||0,
    vencimento:item.vencimento,
    tolerancia_dias:item.toleranciaDias==null?5:Math.max(0,Math.min(60,Number(item.toleranciaDias)||0)),
    origem_tipo:item.origemTipo||'manual',
    origem_id:item.origemId||null,
    observacao:item.observacao||'',
    updated_at:new Date().toISOString()
  };
}

function rowToReceipt(r){
  return {
    id:r.id,cobrancaId:r.cobranca_id||'',valor:Number(r.valor)||0,
    dataPagamento:r.data_pagamento||'',competenciaCaixa:r.competencia_caixa||'',
    forma:r.forma||'',observacao:r.observacao||'',
    origemTipo:r.origem_tipo||'manual',origemId:r.origem_id||'',
    arquivadoEm:r.arquivado_em||'',motivoArquivamento:r.motivo_arquivamento||''
  };
}

function receiptToRow(item){
  const paidAt=item.dataPagamento||todayISO();
  const originType=item.origemTipo||'manual';
  let originId=item.origemId||null;
  if(originType==='manual'&&!originId){
    originId=newOperationId();
    item.origemId=originId;
  }
  return {
    cobranca_id:item.cobrancaId,
    valor:Number(item.valor)||0,
    data_pagamento:paidAt,
    competencia_caixa:item.competenciaCaixa||paidAt.slice(0,7),
    forma:item.forma||'',
    observacao:item.observacao||'',
    origem_tipo:originType,
    origem_id:originId,
    updated_at:new Date().toISOString()
  };
}

function rowToDocument(r){
  return {
    id:r.id, houseId:r.imovel_id||'', tenantId:r.inquilino_id||'',
    tipo:r.tipo||'outro', nome:r.nome||'Arquivo', mime:r.mime||'',
    tamanho:Number(r.tamanho)||0, storagePath:r.storage_path||'',
    visivelInquilino:!!r.visivel_inquilino, restrito:!!r.restrito,
    dados:r.dados||'', url:''
  };
}

function safeStorageName(name){
  return String(name||'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').slice(-120) || 'arquivo';
}

async function signedStorageUrl(path){
  if(!path) return '';
  const { data, error } = await sb.storage.from(FILE_BUCKET).createSignedUrl(path, 3600);
  if(error) throw error;
  return data && data.signedUrl ? data.signedUrl : '';
}

function blobToDataUrl(blob){
  return new Promise(function(resolve,reject){
    const reader=new FileReader(); reader.onload=function(){resolve(reader.result);};
    reader.onerror=reject; reader.readAsDataURL(blob);
  });
}
function dataUrlToBlob(value){
  const match=String(value||'').match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/i);
  if(!match)throw new Error('Arquivo incorporado inválido.');
  const binary=atob(match[2]);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i+=1)bytes[i]=binary.charCodeAt(i);
  return new Blob([bytes],{type:match[1]});
}

async function removeStoragePaths(paths){
  const unique=Array.from(new Set((paths||[]).filter(Boolean)));
  for(let i=0;i<unique.length;i+=100){
    const result=await sb.storage.from(FILE_BUCKET).remove(unique.slice(i,i+100));
    if(result.error) throw result.error;
  }
}

async function fetchAllRows(table,orderColumn,ascending,activeOnly){
  const all=[];let from=0;const pageSize=1000;
  while(true){
    let query=sb.from(table).select('*').range(from,from+pageSize-1);
    if(activeOnly) query=query.is('arquivado_em',null);
    query=query.order(orderColumn||'id',{ascending:ascending!==false});
    let result=await query;
    if(activeOnly && result.error
      && ['42703','PGRST204'].includes(result.error.code)
      && /arquivado_em/i.test(result.error.message||'')){
      result=await sb.from(table).select('*').range(from,from+pageSize-1)
        .order(orderColumn||'id',{ascending:ascending!==false});
    }
    if(result.error)return {data:null,error:result.error};
    const page=result.data||[];all.push.apply(all,page);
    if(page.length<pageSize)break;
    from+=pageSize;
  }
  return {data:all,error:null};
}

function missingOptionalRelation(error){
  if(!error) return false;
  return ['42P01','PGRST200','PGRST204','PGRST205'].includes(error.code)
    || /relation .* does not exist|schema cache/i.test(error.message||'');
}

function missingOptionalRpc(error){
  if(!error) return false;
  return ['42883','PGRST202'].includes(error.code)
    || /function .* does not exist|schema cache/i.test(error.message||'');
}

/* Perfil do proprietário. O CRECI só existe depois de
   migracao-vitrine-fotos.sql; sem ele, lê o mesmo conjunto de antes em
   vez de derrubar o login inteiro por uma coluna de rodapé. */
const CAMPOS_PROPRIETARIO='user_id,nome,email,slug_publico,nome_publico,contato_publico';
let _creciOff=false;
async function selectProprietario(userId){
  if(!_creciOff){
    const res=await sb.from('proprietarios')
      .select(CAMPOS_PROPRIETARIO+',creci').eq('user_id',userId).maybeSingle();
    if(!res.error) return res;
    if(!missingOptionalRelation(res.error)&&!/creci/i.test(res.error.message||'')) return res;
    _creciOff=true;
  }
  return sb.from('proprietarios')
    .select(CAMPOS_PROPRIETARIO).eq('user_id',userId).maybeSingle();
}

async function fetchOptionalRows(table,orderColumn,ascending,activeOnly){
  const result=await fetchAllRows(table,orderColumn,ascending,activeOnly);
  if(result.error && missingOptionalRelation(result.error)){
    return {data:[],error:null};
  }
  return result;
}

async function fetchAllRpc(name){
  const all=[];let from=0;const pageSize=1000;
  while(true){
    const result=await sb.rpc(name).range(from,from+pageSize-1);
    if(result.error)return result;
    const page=result.data||[];all.push.apply(all,page);
    if(page.length<pageSize)break;
    from+=pageSize;
  }
  return {data:all,error:null};
}

/* ---------- validação e normalização de backups ---------- */
function _backupText(value, max, fallback){
  const text = String(value==null ? (fallback||'') : value).trim();
  return text.slice(0, max||500);
}
function _backupDecimal(value, label, scale){
  if(value==null || value==='') return 0;
  const n = Number(value);
  if(!Number.isFinite(n) || n < 0) throw new Error((label||'Valor')+' inválido no backup.');
  const factor=Math.pow(10,Math.max(0,Math.min(8,Number(scale)||0)));
  return Math.round(n*factor)/factor;
}
function _backupNumber(value, label){
  return _backupDecimal(value,label,2);
}
function _backupDate(value, label){
  if(value==null || value==='') return null;
  const s = String(value);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) throw new Error((label||'Data')+' inválida no backup.');
  const d = new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
  if(d.getFullYear()!==Number(m[1]) || d.getMonth()!==Number(m[2])-1 || d.getDate()!==Number(m[3])){
    throw new Error((label||'Data')+' inválida no backup.');
  }
  return s;
}
function _backupTimestamp(value,label){
  if(value==null||value==='') return null;
  const date=new Date(String(value));
  if(Number.isNaN(date.getTime())){
    throw new Error((label||'Data e hora')+' inválida no backup.');
  }
  return date.toISOString();
}
function _backupArchiveFields(item){
  const source=item||{};
  const archivedAt=_backupTimestamp(
    source.arquivadoEm||source.arquivado_em,
    'Data de arquivamento'
  );
  return {
    arquivado_em:archivedAt,
    arquivado_por:null,
    motivo_arquivamento:archivedAt
      ?_backupText(source.motivoArquivamento||source.motivo_arquivamento,500)
      :''
  };
}
function _backupMonth(value){
  const s = String(value||'');
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) throw new Error('Mês inválido no backup.');
  return s;
}
function _backupId(value, label){
  const s = _backupText(value, 160);
  if(!s) throw new Error((label||'ID')+' ausente no backup.');
  return s;
}
function _newImportId(){ return (crypto.randomUUID && crypto.randomUUID()) || _uuid(); }
function _backupDataUrlBytes(value){
  const encoded=String(value||'').split(',')[1]||'';
  const padding=(encoded.match(/=+$/)||[''])[0].length;
  return Math.max(0,Math.floor((encoded.length*3)/4)-padding);
}
function backupPayloadStorageBytes(payload){
  const energyFiles=(payload&&payload.energy||[]).filter(function(item){
    return !!(item&&item.foto_dados);
  }).map(function(item){return {tamanho:item.foto_tamanho};});
  const rows=[].concat(payload&&payload.photos||[],payload&&payload.documents||[],energyFiles);
  return rows.reduce(function(total,item){
    const size=Math.max(0,Number(item&&item.tamanho)||0);
    const next=total+size;
    if(!Number.isSafeInteger(next)) throw new Error('O backup ultrapassa o limite seguro de armazenamento.');
    return next;
  },0);
}
function _backupBytesLabel(value){
  const bytes=Math.max(0,Number(value)||0),units=['B','KB','MB','GB'];
  let amount=bytes,index=0;
  while(amount>=1024&&index<units.length-1){amount/=1024;index++;}
  return amount.toLocaleString('pt-BR',{maximumFractionDigits:index?1:0})+' '+units[index];
}
function _backupAccessNumber(access,camel,snake){
  const source=access||{};
  const raw=source[camel]!==undefined?source[camel]:source[snake];
  const value=Number(raw);
  return Number.isFinite(value)&&value>=0?value:null;
}
async function assertBackupStorageAvailable(payload,replace){
  const incoming=backupPayloadStorageBytes(payload);
  if(incoming<=0)return;
  /* Consulta novamente o servidor: o valor mantido na tela pode estar
     desatualizado por outra aba. O trigger do banco continua sendo a
     autoridade final caso haja uma corrida entre esta checagem e a gravação. */
  const result=await sb.rpc('acesso_comercial_atual');
  if(result.error)throw result.error;
  const access=result.data||{};
  const limit=_backupAccessNumber(access,'limiteArmazenamento','limite_armazenamento');
  const used=_backupAccessNumber(access,'armazenamentoUsado','armazenamento_usado');
  if(limit==null||limit<=0||(!replace&&used==null)){
    throw new Error('Não foi possível confirmar o armazenamento disponível desta conta.');
  }
  const available=replace?limit:Math.max(0,limit-used);
  if(incoming>available){
    throw new Error('O backup precisa de '+_backupBytesLabel(incoming)+
      ', mas há '+_backupBytesLabel(available)+' disponíveis no armazenamento atual.');
  }
}

function normalizeBackupForImport(data){
  if(!data || typeof data!=='object' || !Array.isArray(data.houses)){
    throw new Error('Esse arquivo não parece ser um backup do Aluguel.');
  }
  const version=data.version==null?1:Number(data.version);
  if(!Number.isInteger(version)||version<1){
    throw new Error('A versão informada no backup é inválida.');
  }
  if(version>7){
    throw new Error('Este backup foi criado por uma versão mais nova do aplicativo.');
  }
  const housesIn = data.houses;
  const tenantsIn = Array.isArray(data.tenants) ? data.tenants : [];
  const interestsIn = Array.isArray(data.interests) ? data.interests : [];
  const eventsIn = Array.isArray(data.eventos) ? data.eventos : [];
  if(housesIn.length>500 || tenantsIn.length>2000 || interestsIn.length>5000 || eventsIn.length>10000){
    throw new Error('O backup ultrapassa o limite seguro de registros.');
  }

  const tenantIdMap = {};
  const embeddedTenantByHouse = {};
  const seenTenantIds = {};
  const seenHouseIds = {};
  const tenantRows = [];

  /* Proprietários-clientes. Backup antigo não tem a seção: a lista fica
     vazia, os imóveis ficam sem dono vinculado e nada quebra. */
  const ownersIn = Array.isArray(data.owners) ? data.owners : [];
  if(ownersIn.length>2000) throw new Error('O backup ultrapassa o limite seguro de registros.');
  const ownerIdMap = {};
  const seenOwnerIds = {};
  const ownerRows = [];
  ownersIn.forEach(function(o){
    const oldId=_backupId(o&&o.id,'ID do proprietário');
    if(seenOwnerIds[oldId]) throw new Error('Há proprietários duplicados no backup.');
    seenOwnerIds[oldId]=true;
    const id=_newImportId(); ownerIdMap[oldId]=id;
    ownerRows.push(Object.assign({ id:id,
      nome:_backupText(o.nome,160,'(sem nome)')||'(sem nome)',
      telefone:_backupText(o.telefone,40), email:_backupText(o.email,180),
      documento:_backupText(o.documento,80),
      pix_chave:_backupText(o.pixChave,180), banco:_backupText(o.banco,80),
      agencia:_backupText(o.agencia,20), conta:_backupText(o.conta,30),
      taxa_administracao:Math.min(100,Math.max(0,Number(o.taxaAdministracao)||0)),
      observacoes:_backupText(o.observacoes,2000) },
      _backupArchiveFields(o)));
  });

  tenantsIn.forEach(function(t){
    const oldId = _backupId(t && t.id, 'ID do inquilino');
    if(seenTenantIds[oldId]) throw new Error('Há inquilinos duplicados no backup.');
    seenTenantIds[oldId] = true;
    const id = _newImportId(); tenantIdMap[oldId] = id;
    tenantRows.push(Object.assign({ id:id, nome:_backupText(t.nome,160,'(sem nome)')||'(sem nome)',
      telefone:_backupText(t.telefone,40), email:_backupText(t.email,180),
      documento:_backupText(t.documento,80), rg:_backupText(t.rg,40),
      emergencia_nome:_backupText(t.emergenciaNome,220) },
      _backupArchiveFields(t)));
  });

  housesIn.forEach(function(h){
    const oldHouseId = _backupId(h && h.id, 'ID da casa');
    if(seenHouseIds[oldHouseId]) throw new Error('Há casas duplicadas no backup.');
    seenHouseIds[oldHouseId] = true;
    if(!h.tenantId && h.inquilino && h.inquilino.nome){
      const id = _newImportId(); embeddedTenantByHouse[oldHouseId] = id;
      tenantRows.push({ id:id, nome:_backupText(h.inquilino.nome,160,'(sem nome)')||'(sem nome)',
        telefone:_backupText(h.inquilino.telefone,40), email:_backupText(h.inquilino.email,180),
        documento:_backupText(h.inquilino.documento,80), emergencia_nome:_backupText(h.inquilino.emergenciaNome,220) });
    }
  });

  const houseIdMap = {};
  const houseRows=[],contractRows=[],pagRows=[],despRows=[],histRows=[],
    fotoRows=[],documentoRows=[],reajRows=[],enerRows=[],chargeRows=[],
    receiptRows=[],maintenanceRows=[],interestRows=[];
  const contractIdMap={},paymentIdMap={},energyIdMap={},expenseIdMap={},
    chargeIdMap={},contractsByHouse={};
  const allowedHouseStatus = ['alugada','vaga','manutencao'];
  const allowedExpenseStatus = CONFIG.DESPESA_STATUS;
  const allowedCategories = CONFIG.CATEGORIAS;

  housesIn.forEach(function(h){
    const oldId = _backupId(h.id, 'ID da casa');
    const id = _newImportId(); houseIdMap[oldId] = id;
    const status = allowedHouseStatus.includes(h.status) ? h.status : 'vaga';
    const dueDay = Number(h.diaVencimento==null ? 5 : h.diaVencimento);
    if(!Number.isInteger(dueDay) || dueDay<1 || dueDay>31) throw new Error('Dia de vencimento fora do intervalo de 1 a 31.');
    const oldTenantId = h.tenantId ? _backupId(h.tenantId, 'ID do inquilino vinculado') : '';
    const tenantId = oldTenantId ? tenantIdMap[oldTenantId] : embeddedTenantByHouse[oldId];
    if(oldTenantId && !tenantId) throw new Error('Uma casa aponta para um inquilino inexistente.');
    const contratoInicio = _backupDate(h.contratoInicio, 'Início do contrato');
    const contratoFim = _backupDate(h.contratoFim, 'Fim do contrato');
    if(contratoInicio && contratoFim && contratoFim<contratoInicio) throw new Error('Há contrato terminando antes da data de início.');
    /* tipo e rg passam a viajar no backup normalizado. Sem eles aqui, a
       exportação carrega o campo e a restauração o descarta — a coluna
       existe nos dois lados e some no meio do caminho. */
    const tipoImovel=normalizeImovelTipo(h.tipo);
    /* Um imóvel que aponta para um proprietário inexistente entra sem
       vínculo, em vez de derrubar a importação inteira: o dono é
       informação de gestão, não de integridade do imóvel. */
    const donoOrigem=h.proprietarioClienteId
      ? _backupId(h.proprietarioClienteId,'ID do proprietário do imóvel') : '';
    houseRows.push(Object.assign({ id:id, nome:_backupText(h.nome,160,'Casa')||'Casa', endereco:_backupText(h.endereco,400),
      status:status, tipo:tipoImovel,
      proprietario_cliente_id:(donoOrigem&&ownerIdMap[donoOrigem])||null,
      aluguel_valor:_backupNumber(h.aluguelValor,'Aluguel'), dia_vencimento:dueDay,
      ultima_vistoria:_backupDate(h.ultimaVistoria,'Última vistoria'), tenant_id:tenantId||null,
      contrato_inicio:contratoInicio, contrato_fim:contratoFim,
      quartos:Math.max(0,parseInt(h.quartos,10)||0),banheiros:Math.max(0,parseInt(h.banheiros,10)||0),
      cozinha:!!h.cozinha,sala:!!h.sala,garagem:!!h.garagem,quintal:!!h.quintal,
      area_servico:!!h.areaServico,
      energia_ativa:h.energiaAtiva!==false,
      energia_dia_vencimento:Math.min(31,Math.max(1,parseInt(h.energiaDiaVencimento,10)||5)),
      publicado:!!h.publicado,descricao_publica:_backupText(h.descricaoPublica,3000) },
      _backupArchiveFields(h)));

    let sourceContracts=Array.isArray(h.contracts)?h.contracts.slice():[];
    if(!sourceContracts.length&&tenantId&&contratoInicio){
      sourceContracts=[{id:'legacy-'+oldId,tenantId:oldTenantId,inicio:contratoInicio,fim:contratoFim,
        valor:h.aluguelValor,diaVencimento:dueDay,modalidade:'fixo',ativo:status==='alugada',
        proporcionalDias:0,proporcionalValor:0,proporcionalPago:true}];
    }
    contractsByHouse[oldId]=[];
    sourceContracts.forEach(function(c,index){
      const oldContractId=_backupText(c.id,160,'contract-'+index)||('contract-'+index);
      const newContractId=_newImportId();contractIdMap[oldContractId]=newContractId;
      const oldContractTenant=c.tenantId?_backupId(c.tenantId,'ID do inquilino do contrato'):oldTenantId;
      const newContractTenant=oldContractTenant?tenantIdMap[oldContractTenant]:tenantId;
      if(!newContractTenant) throw new Error('Um contrato aponta para um inquilino inexistente.');
      const cInicio=_backupDate(c.inicio,'Início do contrato')||contratoInicio||todayISO();
      const cFim=_backupDate(c.fim,'Fim do contrato');
      if(cFim&&cFim<cInicio) throw new Error('Há contrato terminando antes da data de início.');
      const cDia=Math.min(31,Math.max(1,Number(c.diaVencimento)||dueDay));
      const modalidade=c.modalidade==='entrada'?'entrada':'fixo';
      const contractInitialValue=_backupNumber(c.valorInicial==null
        ? (c.valor==null?h.aluguelValor:c.valor)
        : c.valorInicial,'Valor inicial do contrato');
      const contractCurrentValue=_backupNumber(
        c.valor==null?contractInitialValue:c.valor,
        'Valor atual do contrato'
      );
      const cRow=Object.assign({id:newContractId,imovel_id:id,tenant_id:newContractTenant,inicio:cInicio,fim:cFim,
        valor:contractCurrentValue,valor_inicial:contractInitialValue,dia_vencimento:cDia,
        valor_inicial_revisar:!!c.valorInicialRevisar,
        valor_inicial_origem:_backupText(
          c.valorInicialOrigem,80,
          c.valorInicialRevisar?'migracao_valor_atual':'cadastro_contrato'
        ),
        modalidade_vencimento:modalidade,ativo:!!c.ativo,
        proporcional_dias:Math.max(0,Number(c.proporcionalDias)||0),
        proporcional_valor:_backupNumber(c.proporcionalValor,'Ajuste inicial'),
        proporcional_pago:!!c.proporcionalPago,
        proporcional_data_pagamento:c.proporcionalPago?_backupDate(c.proporcionalDataPagamento,'Pagamento do ajuste inicial'):null},
        _backupArchiveFields(c));
      contractRows.push(cRow);contractsByHouse[oldId].push({
        oldId:oldContractId,newId:newContractId,tenantId:newContractTenant,
        inicio:cInicio,fim:cFim,diaVencimento:cDia
      });
    });

    function importedContractForMovement(rec){
      if(rec&&rec.contractId&&contractIdMap[String(rec.contractId)]) return contractIdMap[String(rec.contractId)];
      const mes=String(rec&&(rec.mes||rec.competencia||(rec.dataInicio||'').slice(0,7))||'');
      const candidates=(contractsByHouse[oldId]||[]).filter(function(c){return mes>=c.inicio.slice(0,7)&&(!c.fim||mes<=c.fim.slice(0,7));})
        .sort(function(a,b){return b.inicio.localeCompare(a.inicio);});
      return candidates.length?candidates[0].newId:null;
    }

    const seenMonths = {};
    (Array.isArray(h.pagamentos)?h.pagamentos:[]).forEach(function(p,index){
      const mes = _backupMonth(p.mes);
      const movementContract=importedContractForMovement(p),key=(movementContract||'legacy')+'-'+mes;
      if(seenMonths[key]) throw new Error('Há pagamentos duplicados para o mesmo contrato e mês.');
      seenMonths[key] = true;
      const fallbackPaymentId=oldId+'-payment-'+index;
      const oldPaymentId=_backupText(p&&p.id,160,fallbackPaymentId)||fallbackPaymentId;
      const newPaymentId=_newImportId();
      paymentIdMap[oldPaymentId]=newPaymentId;
      pagRows.push(Object.assign({
        id:newPaymentId,imovel_id:id,contrato_id:movementContract,mes:mes,
        valor_pago:_backupNumber(p.valorPago,'Pagamento'),
        data_pagamento:_backupDate(p.dataPagamento,'Data do pagamento')
      },_backupArchiveFields(p)));
    });
    (Array.isArray(h.despesas)?h.despesas:[]).forEach(function(e,index){
      const categoria = allowedCategories.includes(e.categoria) ? e.categoria : 'Outro';
      const despStatus = allowedExpenseStatus.includes(e.status) ? e.status : 'Concluído';
      const fallbackExpenseId=oldId+'-expense-'+index;
      const oldExpenseId=_backupText(e&&e.id,160,fallbackExpenseId)||fallbackExpenseId;
      const newExpenseId=_newImportId();
      expenseIdMap[oldExpenseId]=newExpenseId;
      despRows.push(Object.assign({ id:newExpenseId,imovel_id:id, descricao:_backupText(e.descricao,300,'Despesa')||'Despesa',
        categoria:categoria, valor:_backupNumber(e.valor,'Despesa'), data:_backupDate(e.data,'Data da despesa'),
        prestador:_backupText(e.prestador,180), status:despStatus },
        _backupArchiveFields(e)));
    });
    (Array.isArray(h.statusHistorico)?h.statusHistorico:[]).forEach(function(s){
      const histStatus = allowedHouseStatus.includes(s.status) ? s.status : 'vaga';
      const oldHistTenant = s.tenantId ? _backupId(s.tenantId,'ID do inquilino no histórico') : '';
      const histTenant = oldHistTenant ? tenantIdMap[oldHistTenant] : null;
      if(oldHistTenant && !histTenant) throw new Error('O histórico aponta para um inquilino inexistente.');
      histRows.push({ imovel_id:id, data:_backupDate(s.data,'Data do histórico')||todayISO(),
        status:histStatus, tenant_id:histTenant });
    });
    (Array.isArray(h.aluguelHistorico)?h.aluguelHistorico:[]).forEach(function(rj){
      const confirmedBy=_backupText(
        rj.confirmadoPor||rj.confirmado_por,160
      );
      reajRows.push(Object.assign({
        id:_newImportId(),imovel_id:id,
        contrato_id:importedContractForMovement(rj),
        valor:_backupNumber(rj.valor,'Reajuste'),
        data_inicio:_backupDate(rj.dataInicio,'Data do reajuste')||todayISO(),
        motivo:_backupText(rj.motivo,500),
        confirmado_em:_backupTimestamp(
          rj.confirmadoEm||rj.confirmado_em,
          'Confirmação do reajuste'
        ),
        confirmado_por:confirmedBy||null
      },_backupArchiveFields(rj)));
    });
    const seenEnergyMonths = {};
    (Array.isArray(h.energias)?h.energias:[]).forEach(function(en,index){
      const mes = _backupMonth(en.mes);
      const movementContract=importedContractForMovement(en),key=(movementContract||'legacy')+'-'+mes;
      if(seenEnergyMonths[key]) throw new Error('Há registros de energia duplicados para o mesmo contrato e mês.');
      seenEnergyMonths[key] = true;
      const fallbackEnergyId=oldId+'-energy-'+index;
      const oldEnergyId=_backupText(en&&en.id,160,fallbackEnergyId)||fallbackEnergyId;
      const newEnergyId=_newImportId();
      energyIdMap[oldEnergyId]=newEnergyId;
      const photoBackup=en&&en.fotoBackup&&typeof en.fotoBackup==='object'?en.fotoBackup:null;
      const photoData=String(photoBackup&&photoBackup.dados||'');
      let photoSize=0,photoMime='';
      if(photoData){
        if(photoData.length>22000000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(photoData)){
          throw new Error('O backup contém uma foto de energia inválida ou grande demais.');
        }
        photoSize=_backupDataUrlBytes(photoData);
        photoMime=(photoData.match(/^data:([^;]+)/i)||[])[1]||'image/jpeg';
      }
      enerRows.push(Object.assign({ id:newEnergyId,imovel_id:id,contrato_id:movementContract, mes:mes, valor:_backupNumber(en.valor,'Energia'),
        kwh:_backupNumber(en.kwh,'Consumo de energia'),
        leitura_anterior:_backupNumber(en.leituraAnterior,'Leitura anterior'),leitura_atual:_backupNumber(en.leituraAtual,'Leitura atual'),
        tarifa_kwh:_backupDecimal(en.tarifaKwh,'Tarifa de energia',4),acrescimos:_backupNumber(en.acrescimos,'Acréscimos de energia'),
        descontos:_backupNumber(en.descontos,'Descontos de energia'),ajuste_descricao:_backupText(en.ajusteDescricao,300),
        valor_calculado:_backupNumber(en.valorCalculado,'Valor calculado de energia'),valor_manual:!!en.valorManual,
        vencimento:_backupDate(en.vencimento,'Vencimento da energia'),pago:!!en.pago,
        data_pagamento:en.pago?_backupDate(en.dataPagamento,'Data do pagamento da energia'):null,
        foto_dados:photoData||null,foto_mime:photoMime||null,foto_tamanho:photoSize },
        _backupArchiveFields(en)));
    });

    const sourceCharges=Array.isArray(h.cobrancas)?h.cobrancas:[];
    const chargeByOldId={};
    const seenChargeKeys={};
    sourceCharges.forEach(function(charge,index){
      const fallbackChargeId=oldId+'-charge-'+index;
      const oldChargeId=_backupText(charge&&charge.id,160,fallbackChargeId)||fallbackChargeId;
      const newChargeId=_newImportId();
      chargeIdMap[oldChargeId]=newChargeId;
      chargeByOldId[oldChargeId]=charge;
      const competencia=_backupMonth(charge.competencia||charge.mes);
      const tipo=['aluguel','energia','ajuste','outro'].includes(charge.tipo)
        ?charge.tipo:'outro';
      const contractId=importedContractForMovement(charge);
      const contractMeta=(contractsByHouse[oldId]||[]).find(function(item){
        return item.newId===contractId;
      });
      const oldChargeTenant=charge.tenantId
        ?_backupId(charge.tenantId,'Inquilino da cobrança'):'';
      const tenantId=oldChargeTenant
        ?tenantIdMap[oldChargeTenant]
        :(contractMeta?contractMeta.tenantId:null);
      if(oldChargeTenant&&!tenantId){
        throw new Error('Uma cobrança aponta para um inquilino inexistente.');
      }

      let originType=_backupText(charge.origemTipo,80,'manual')||'manual';
      const oldOrigin=_backupText(charge.origemId,160);
      let originId=null;
      if(oldOrigin){
        if(originType==='pagamento_legado') originId=paymentIdMap[oldOrigin]||null;
        else if(originType==='energia') originId=energyIdMap[oldOrigin]||null;
        else if(originType==='contrato_ajuste') originId=contractIdMap[oldOrigin]||contractId||null;
        if(!originId){
          originType='backup';
          originId=newChargeId;
        }
      }
      const dueDay=contractMeta?contractMeta.diaVencimento:5;
      const fallbackDue=competencia+'-'+String(
        dueDateForMonth(competencia,dueDay).getDate()
      ).padStart(2,'0');
      const key=(contractId||'legacy')+'|'+competencia+'|'+tipo;
      const archiveFields=_backupArchiveFields(charge);
      if((tipo==='aluguel'||tipo==='energia')&&!archiveFields.arquivado_em){
        if(seenChargeKeys[key]){
          throw new Error('Há cobranças mensais ativas duplicadas no backup.');
        }
        seenChargeKeys[key]=true;
      }
      chargeRows.push(Object.assign({
        id:newChargeId,imovel_id:id,contrato_id:contractId,
        inquilino_id:tenantId,competencia:competencia,tipo:tipo,
        descricao:_backupText(charge.descricao,300),
        valor_previsto:_backupNumber(charge.valorPrevisto,'Valor previsto'),
        vencimento:_backupDate(charge.vencimento,'Vencimento da cobrança')||fallbackDue,
        tolerancia_dias:Math.min(60,Math.max(0,charge.toleranciaDias==null
          ?5:Math.trunc(Number(charge.toleranciaDias)||0))),
        origem_tipo:originType,origem_id:originId,
        observacao:_backupText(charge.observacao,1000)
      },archiveFields));
    });

    (Array.isArray(h.recebimentos)?h.recebimentos:[]).forEach(function(receipt,index){
      const oldChargeId=_backupText(receipt&&receipt.cobrancaId,160);
      const originalCharge=chargeByOldId[oldChargeId];
      const mappedChargeId=chargeIdMap[oldChargeId];
      if(!oldChargeId||!originalCharge||!mappedChargeId){
        throw new Error('Um recebimento aponta para uma cobrança inexistente.');
      }
      const newReceiptId=_newImportId();
      const paidAt=_backupDate(receipt.dataPagamento,'Data do recebimento')||todayISO();
      const value=_backupNumber(receipt.valor,'Recebimento');
      if(value<=0) throw new Error('O backup contém um recebimento sem valor.');
      let originType=_backupText(receipt.origemTipo,80,'manual')||'manual';
      const oldOrigin=_backupText(receipt.origemId,160);
      let originId=null;
      if(oldOrigin){
        if(originType==='pagamento_legado') originId=paymentIdMap[oldOrigin]||null;
        else if(originType==='energia_legado') originId=energyIdMap[oldOrigin]||null;
        else if(originType==='ajuste_legado') originId=contractIdMap[oldOrigin]||null;
        if(!originId){
          originType='backup';
          originId=newReceiptId;
        }
      }
      receiptRows.push(Object.assign({
        id:newReceiptId,cobranca_id:mappedChargeId,valor:value,
        data_pagamento:paidAt,
        competencia_caixa:_backupMonth(receipt.competenciaCaixa||paidAt.slice(0,7)),
        forma:_backupText(receipt.forma,80),
        observacao:_backupText(receipt.observacao,1000),
        origem_tipo:originType,origem_id:originId,
        cobranca_origem_tipo:_backupText(originalCharge.origemTipo,80,'manual')||'manual',
        cobranca_origem_id:(function(){
          const raw=_backupText(originalCharge.origemId,160);
          if(!raw) return null;
          if(originalCharge.origemTipo==='pagamento_legado') return paymentIdMap[raw]||null;
          if(originalCharge.origemTipo==='energia') return energyIdMap[raw]||null;
          if(originalCharge.origemTipo==='contrato_ajuste') return contractIdMap[raw]||null;
          return null;
        })(),
        imovel_id:id,contrato_id:importedContractForMovement(originalCharge),
        competencia:_backupMonth(originalCharge.competencia||originalCharge.mes),
        tipo:['aluguel','energia','ajuste','outro'].includes(originalCharge.tipo)
          ?originalCharge.tipo:'outro'
      },_backupArchiveFields(receipt)));
    });

    const maintenanceCategories=['hidraulica','eletrica','estrutura','eletrodomestico','pintura','outro'];
    const maintenancePriorities=['urgente','alta','normal','baixa'];
    const maintenanceStatuses=['aberto','em_andamento','aguardando_peca','resolvido','cancelado'];
    (Array.isArray(h.chamados)?h.chamados:[]).forEach(function(call){
      const oldCallTenant=call.tenantId?_backupId(call.tenantId,'Inquilino do chamado'):'';
      const oldExpenseId=_backupText(call.despesaId,160);
      const status=maintenanceStatuses.includes(call.status)?call.status:'aberto';
      const callTenantId=oldCallTenant?(tenantIdMap[oldCallTenant]||null):null;
      if(oldCallTenant&&!callTenantId){
        throw new Error('Um chamado aponta para um inquilino inexistente.');
      }
      maintenanceRows.push({
        id:_newImportId(),imovel_id:id,
        inquilino_id:callTenantId,
        titulo:_backupText(call.titulo,220,'Chamado')||'Chamado',
        descricao:_backupText(call.descricao,3000),
        categoria:maintenanceCategories.includes(call.categoria)?call.categoria:'outro',
        prioridade:maintenancePriorities.includes(call.prioridade)?call.prioridade:'normal',
        status:status,
        aberto_por:call.abertoPor==='inquilino'?'inquilino':'proprietario',
        resposta:_backupText(call.resposta,3000),
        despesa_id:oldExpenseId?(expenseIdMap[oldExpenseId]||null):null,
        resolvido_em:status==='resolvido'
          ?(_backupTimestamp(call.resolvidoEm,'Conclusão do chamado')||new Date().toISOString())
          :null,
        created_at:_backupTimestamp(call.createdAt,'Abertura do chamado')||new Date().toISOString()
      });
    });
  });

  if(pagRows.length>50000 || despRows.length>50000 || histRows.length>50000
    || reajRows.length>50000 || enerRows.length>50000
    || chargeRows.length>50000 || receiptRows.length>100000
    || maintenanceRows.length>50000){
    throw new Error('O backup ultrapassa o limite seguro de movimentações.');
  }

  const photos = data.photos && typeof data.photos==='object' ? data.photos : {};
  Object.keys(photos).forEach(function(oldHouseId){
    const houseId = houseIdMap[String(oldHouseId)];
    if(!houseId) return;
    const list = Array.isArray(photos[oldHouseId]) ? photos[oldHouseId] : [];
    list.forEach(function(dataUrl, i){
      const safe = String(dataUrl||'');
      if(safe.length>2500000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(safe)){
        throw new Error('O backup contém uma foto inválida ou grande demais.');
      }
      fotoRows.push({ imovel_id:houseId, dados:safe, ordem:i,nome:'foto-'+(i+1)+'.jpg',
        mime:(safe.match(/^data:([^;]+)/i)||[])[1]||'image/jpeg',tamanho:_backupDataUrlBytes(safe) });
    });
  });

  const documents = data.documents && typeof data.documents==='object' ? data.documents : {};
  Object.keys(documents).forEach(function(oldHouseId){
    const houseId=houseIdMap[String(oldHouseId)]; if(!houseId)return;
    const list=Array.isArray(documents[oldHouseId])?documents[oldHouseId]:[];
    list.forEach(function(doc){
      const content=String(doc&&doc.dados||'');
      if(content.length>22000000 || !/^data:(application\/pdf|image\/(jpeg|png|webp));base64,[A-Za-z0-9+/=]+$/i.test(content)){
        throw new Error('O backup contém um documento inválido ou grande demais.');
      }
      const actualSize=_backupDataUrlBytes(content);
      const oldTenant=doc.tenantId?_backupId(doc.tenantId,'Inquilino do documento'):'';
      documentoRows.push({imovel_id:houseId,inquilino_id:oldTenant?(tenantIdMap[oldTenant]||null):null,
        tipo:_backupText(doc.tipo,40,'outro')||'outro',nome:_backupText(doc.nome,240,'Arquivo')||'Arquivo',
        mime:_backupText(doc.mime,100),tamanho:actualSize,
        visivel_inquilino:!!doc.visivelInquilino,dados:content});
    });
  });
  if(fotoRows.length>50000||documentoRows.length>5000){
    throw new Error('O backup ultrapassa o limite seguro de arquivos.');
  }

  const eventRows = eventsIn.map(function(ev){
    return { data:_backupDate(ev.data,'Data do lembrete')||todayISO(), texto:_backupText(ev.texto,500) };
  });
  const allowedInterestStatus=['novo','conversando','visita','quente','fechado','desistiu'];
  interestsIn.forEach(function(item){
    if(!item||!item.nome) throw new Error('Há um interessado sem nome no backup.');
    const oldTenant=item.tenantId?_backupId(item.tenantId,'Inquilino convertido'):'';
    interestRows.push({id:_newImportId(),nome:_backupText(item.nome,160),telefone:_backupText(item.telefone,40),
      valor_maximo:_backupNumber(item.valorMaximo,'Valor máximo'),quartos_min:Math.max(0,parseInt(item.quartosMin,10)||0),
      banheiros_min:Math.max(0,parseInt(item.banheirosMin,10)||0),precisa_garagem:!!item.precisaGaragem,
      precisa_quintal:!!item.precisaQuintal,precisa_cozinha:!!item.precisaCozinha,
      precisa_sala:!!item.precisaSala,precisa_area_servico:!!item.precisaAreaServico,
      observacoes:_backupText(item.observacoes,2000),status:allowedInterestStatus.includes(item.status)?item.status:'novo',
      inquilino_id:oldTenant?(tenantIdMap[oldTenant]||null):null});
  });
  const cfg = data.config && typeof data.config==='object' ? {
    locador_nome:_backupText(data.config.locadorNome,180),
    locador_documento:_backupText(data.config.locadorDocumento,80),
    energia_ativa:data.config.energiaAtiva!==false,
    tema:normalizeAppTheme(data.config.tema),
    onboarding_concluido:!!data.config.onboardingConcluido,
    ultimo_backup_externo:data.config.ultimoBackupExterno||null,
    pix_chave:_backupText(data.config.pixChave,180),pix_nome:_backupText(data.config.pixNome,25),
    pix_cidade:_backupText(data.config.pixCidade,15)
  } : null;

  return {
    owners:ownerRows,
    tenants:tenantRows,houses:houseRows,contracts:contractRows,
    adjustments:reajRows,charges:chargeRows,payments:pagRows,energy:enerRows,
    receipts:receiptRows,expenses:despRows,maintenance:maintenanceRows,
    history:histRows,photos:fotoRows,documents:documentoRows,
    interests:interestRows,events:eventRows,config:cfg,
    /* Identificador da exportação, para o banco recusar o mesmo arquivo
       duas vezes no modo "adicionar". Arquivos baixados antes desta versão
       não têm o campo e continuam sendo aceitos — só não ficam protegidos
       contra repetição. */
    export_id:_backupExportId(data.exportId),
    exported_at:_backupExportedAt(data.exportedAt)
  };
}

/* Data da exportação, só informativa. Vai validada porque ela é gravada no
   FIM da restauração: uma data torta ali derrubaria a transação inteira
   depois de tudo já ter sido inserido — o pior momento possível para
   falhar. Qualquer coisa que não seja uma data reconhecível vira null. */
function _backupExportedAt(value){
  const texto=String(value==null?'':value).trim();
  if(!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(texto)) return null;
  const quando=new Date(texto);
  return Number.isNaN(quando.getTime()) ? null : quando.toISOString();
}

/* Aceita apenas UUID. Um arquivo antigo (sem o campo) devolve null, e o
   banco entende null como "não dá para saber se já veio". */
function _backupExportId(value){
  const texto=String(value==null?'':value).trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(texto)
    ? texto : null;
}

/* Sincronização de tema por usuário. Se a tabela (migracao-tema-usuario)
   ainda não existir no Supabase, a primeira tentativa falha e desligamos
   o servidor pelo resto da sessão — a preferência segue valendo por
   localStorage (por aparelho). Sem barulho no console. */
let _userThemeServerOff=false;
const db = {
  /* Descobre o perfil antes de carregar qualquer dado da interface. */
  async loadRole(){
    const uid=await _authUserId();
    _actingOwnerId=null;
    // As identidades Mestre são reconhecidas diretamente pelo banco e não
    // dependem de um cadastro de funcionário que possa ser desativado.
    const commercialResult=await sb.rpc('acesso_comercial_atual');
    if(commercialResult.error) throw commercialResult.error;
    const commercial=commercialResult.data||{};
    if(commercial.administradorPlataforma){
      const workingOwnerId=commercial.proprietarioId||uid;
      const ownerResult=await selectProprietario(workingOwnerId);
      if(ownerResult.error) throw ownerResult.error;
      _actingOwnerId=workingOwnerId;
      return {
        role:'owner',
        owner:ownerResult.data||{},
        staff:workingOwnerId!==uid
          ? {user_id:uid,proprietario_id:workingOwnerId,nome:'Mestre de segurança',ativo:true}
          : null,
        commercial:commercial
      };
    }
    // Resolve todos os papéis em conjunto. Qualquer perfil duplo falha fechado:
    // nunca escolhemos silenciosamente proprietário e nunca mostramos plano
    // para uma conta que também esteja ligada a um inquilino.
    const roleResults=await Promise.all([
      sb.from('acessos_inquilino').select('*').eq('user_id',uid).maybeSingle(),
      sb.from('acessos_colaborador').select('*').eq('user_id',uid).maybeSingle(),
      selectProprietario(uid)
    ]);
    const accessResult=roleResults[0],staffResult=roleResults[1],ownerResultSelf=roleResults[2];
    const roleError=accessResult.error||staffResult.error||ownerResultSelf.error;
    if(roleError) throw roleError;
    const access=accessResult.data,staff=staffResult.data,owner=ownerResultSelf.data;
    const assignedRoles=(access?1:0)+(staff?1:0)+(owner?1:0);
    if(assignedRoles>1){
      const conflict=new Error('Esta conta possui perfis conflitantes. O acesso foi bloqueado para proteger os dados.');
      conflict.code='ROLE_CONFLICT';
      throw conflict;
    }
    if(access) return access.ativo ? { role:'tenant', access:access } : { role:'pending', access:access };
    if(staff){
      if(!staff.ativo) return {role:'pending',staff:staff,commercial:commercial};
      _actingOwnerId=staff.proprietario_id;
      const ownerResult=await selectProprietario(staff.proprietario_id);
      if(ownerResult.error) throw ownerResult.error;
      return {role:'owner',owner:ownerResult.data||{},staff:staff,commercial:commercial};
    }
    if(owner){
      _actingOwnerId=uid;
      return { role:'owner', owner:owner, commercial:commercial };
    }
    return { role:'pending' };
  },

  /* Licenças de módulo. A tabela pode ainda não existir (migracao-modulos.sql
     não rodou), e nesse caso devolvemos lista vazia em vez de derrubar a
     área Comercial inteira. */
  async listModuleLicenses(){
    const {data,error}=await sb.rpc('listar_licencas_modulo');
    if(error){ console.warn('Licenças de módulo indisponíveis:',error.message); return []; }
    return (data||[]).map(function(l){return {
      userId:l.userId||'',modulo:l.modulo||'',status:l.status||'',
      expiraEm:l.expiraEm||'',valorPago:Number(l.valorPago)||0,
      origem:l.origem||'',ativadaEm:l.ativadaEm||''
    };});
  },

  async setModuleLicense(userId,modulo,status,expiraEm,valor,origem){
    const {data,error}=await sb.rpc('definir_licenca_modulo',{
      p_user_id:userId,p_modulo:modulo,p_status:status||'ativa',
      p_expira_em:expiraEm||null,p_valor:Number(valor)||0,p_origem:origem||'venda'
    });
    if(error) throw error;
    return data||{};
  },

  async loadCommercialDashboard(){
    const results=await Promise.all([
      fetchAllRpc('listar_clientes_comerciais'),
      fetchAllRpc('listar_vendas_comerciais'),
      fetchAllRpc('listar_administradores_plataforma'),
      fetchAllRpc('listar_auditoria_comercial')
    ]);
    const accountsResult=results[0],invitesResult=results[1],adminsResult=results[2],auditResult=results[3];
    if(accountsResult.error) throw accountsResult.error;
    if(invitesResult.error) throw invitesResult.error;
    if(adminsResult.error) throw adminsResult.error;
    if(auditResult.error) throw auditResult.error;
    const admins=adminsResult.data||[];
    const adminIds=new Set(admins.map(function(a){return a.user_id;}));
    return {
      accounts:(accountsResult.data||[]).map(function(a){return {
        userId:a.user_id,nome:a.nome||'',email:a.email||'',telefone:a.telefone||'',documento:a.documento||'',
        empresa:a.empresa||'',plano:a.plano||'gratuito',status:a.status||'suspensa',
        valorPago:Number(a.valor_pago)||0,formaPagamento:a.forma_pagamento||'',
        referenciaPagamento:a.referencia_pagamento||'',observacoes:a.observacoes||'',
        quantidadeImoveis:Number(a.quantidade_imoveis)||0,limiteImoveis:Number(a.limite_imoveis)||1,
        armazenamentoUsado:Number(a.armazenamento_usado)||0,limiteArmazenamento:Number(a.limite_armazenamento)||0,
        criadoEm:a.criado_em||'',isPlatformAdmin:adminIds.has(a.user_id)
      };}),
      invites:(invitesResult.data||[]).map(function(i){return {
        id:i.id,nome:i.nome||'',email:i.email||'',telefone:i.telefone||'',documento:i.documento||'',
        empresa:i.empresa||'',plano:i.plano||'gratuito',status:i.status||'aguardando_pagamento',
        pagamentoStatus:i.pagamento_status||'pendente',valorPago:Number(i.valor_pago)||0,
        formaPagamento:i.forma_pagamento||'',referenciaPagamento:i.referencia_pagamento||'',
        observacoes:i.observacoes||'',expiraEm:i.expira_em||'',aceitoEm:i.aceito_em||'',createdAt:i.created_at||''
      };}),
      admins:admins.map(function(a){return {userId:a.user_id,email:a.email||'',createdAt:a.created_at||''};}),
      audit:(auditResult.data||[]).map(function(a){return {acao:a.acao||'',detalhes:a.detalhes||{},
        administradorEmail:a.administrador_email||'',clienteEmail:a.cliente_email||'',createdAt:a.created_at||''};}),
      licenses:await this.listModuleLicenses()
    };
  },

  async createCommercialSale(sale){
    const {data,error}=await sb.rpc('criar_venda_cliente',{
      p_nome:sale.nome,p_email:sale.email,p_telefone:sale.telefone||'',p_documento:sale.documento||'',
      p_empresa:sale.empresa||'',p_plano:sale.plano,p_valor_pago:Number(sale.valorPago)||0,
      p_forma_pagamento:sale.formaPagamento||'',p_referencia_pagamento:sale.referenciaPagamento||'',
      p_observacoes:sale.observacoes||''
    });
    if(error) throw error;
    return data;
  },

  async confirmCommercialPayment(inviteId){
    const {error}=await sb.rpc('confirmar_pagamento_venda',{p_convite_id:inviteId});
    if(error) throw error;
  },

  async updateCommercialAccount(userId,account){
    const {error}=await sb.rpc('atualizar_cliente_comercial',{
      p_user_id:userId,p_plano:account.plano,p_status:account.status,p_telefone:account.telefone||'',
      p_documento:account.documento||'',p_empresa:account.empresa||'',p_valor_pago:Number(account.valorPago)||0,
      p_forma_pagamento:account.formaPagamento||'',p_referencia_pagamento:account.referenciaPagamento||'',
      p_observacoes:account.observacoes||''
    });
    if(error) throw error;
  },

  async cancelCommercialInvite(inviteId){
    const {error}=await sb.rpc('cancelar_convite_proprietario',{p_convite_id:inviteId});
    if(error) throw error;
  },

  async addPlatformAdmin(email){
    const {error}=await sb.rpc('adicionar_administrador_plataforma',{p_email:email});
    if(error) throw error;
  },

  async removePlatformAdmin(userId){
    const {error}=await sb.rpc('remover_administrador_plataforma',{p_user_id:userId});
    if(error) throw error;
  },

  async acceptTerms(){
    const {error}=await sb.rpc('aceitar_termos_atuais');
    if(error) throw error;
  },

  async loadTenantPortal(access){
    const [imoveis, inquilinos, contratos, pagamentos, energia, cfg, documentos, portalFinance] = await Promise.all([
      sb.from('imoveis').select('*').order('created_at',{ascending:true}),
      sb.rpc('listar_inquilinos_aluguel',{p_incluir_arquivados:false}),
      sb.from('contratos').select('*').eq('tenant_id',access.inquilino_id).order('inicio',{ascending:false}),
      sb.from('pagamentos').select('*').order('mes',{ascending:false}),
      sb.from('energia').select('*').order('mes',{ascending:false}),
      sb.from('configuracoes').select('*').eq('user_id',access.proprietario_id).maybeSingle(),
      sb.rpc('listar_documentos_portal'),
      sb.rpc('carregar_financeiro_portal')
    ]);
    const err=imoveis.error||inquilinos.error||contratos.error||pagamentos.error||energia.error||cfg.error||documentos.error
      ||portalFinance.error;
    if(err) throw err;
    const houses=(imoveis.data||[]).map(rowToHouse), byId={};
    houses.forEach(function(h){ byId[h.id]=h; });
    (contratos.data||[]).forEach(function(c){ if(byId[c.imovel_id]) byId[c.imovel_id].contracts.push(rowToContract(c)); });
    (pagamentos.data||[]).forEach(function(p){
      if(byId[p.imovel_id]) byId[p.imovel_id].pagamentos.push({ id:p.id,mes:p.mes,contractId:p.contrato_id||'',valorPago:Number(p.valor_pago)||0,dataPagamento:p.data_pagamento||'' });
    });
    (energia.data||[]).forEach(function(e){
      if(byId[e.imovel_id]) byId[e.imovel_id].energias.push(rowToEnergy(e));
    });
    const financeData=portalFinance.data||{};
    (financeData.adjustments||[]).forEach(function(r){
      const h=byId[r.imovel_id];if(!h)return;
      const item={
        id:r.id,valor:Number(r.valor)||0,dataInicio:r.data_inicio,
        contractId:r.contrato_id||'',motivo:r.motivo||'',
        confirmadoEm:r.confirmado_em||'',confirmadoPor:r.confirmado_por||''
      };
      h.aluguelHistorico.push(item);
      const contract=(h.contracts||[]).find(function(c){return c.id===item.contractId;});
      if(contract)contract.reajustes.push(item);
    });
    const chargeHouse={};
    (financeData.charges||[]).forEach(function(row){
      const h=byId[row.imovel_id];if(!h)return;
      const charge=rowToCharge(row);
      h.cobrancas.push(charge);
      chargeHouse[charge.id]=h;
    });
    (financeData.receipts||[]).forEach(function(row){
      const h=chargeHouse[row.cobranca_id];if(h)h.recebimentos.push(rowToReceipt(row));
    });
    const docs=(documentos.data||[]).map(rowToDocument);
    await Promise.all(docs.map(async function(d){ if(d.storagePath) d.url=await signedStorageUrl(d.storagePath); }));
    return {
      houses:houses,
      tenants:(inquilinos.data||[]).map(rowToTenant),
      config:rowToConfig(cfg.data),
      documents:docs
    };
  },

  async listTenantAccess(){
    const { data, error } = await sb.rpc('listar_acessos_inquilino');
    if(error) throw error;
    return data||[];
  },

  async configureTenantAccess(tenantId,email,active){
    const { data, error } = await sb.rpc('configurar_acesso_inquilino',{
      p_inquilino_id:tenantId,p_email:email,p_ativo:active!==false
    });
    if(error) throw error;
    return data||{};
  },

  async listTeam(){
    let result=await sb.rpc('listar_colaboradores_com_papel');
    if(result.error && missingOptionalRpc(result.error)){
      result=await sb.rpc('listar_colaboradores');
    }
    const {data,error}=result;
    if(error) throw error;
    return (data||[]).map(function(item){return {conviteId:item.convite_id||'',userId:item.user_id||'',
      nome:item.nome||'',email:item.email||'',ativo:!!item.ativo,aceito:!!item.aceito,status:item.status||'pendente',
      papel:item.papel||'administrador',createdAt:item.created_at||''};});
  },

  async inviteTeamMember(nome,email,papel){
    let result=await sb.rpc('criar_convite_colaborador_com_papel',{
      p_nome:nome,p_email:email,p_papel:papel||'operacional'
    });
    if(result.error && missingOptionalRpc(result.error)){
      result=await sb.rpc('criar_convite_colaborador',{p_nome:nome,p_email:email});
    }
    const {data,error}=result;
    if(error) throw error;
    return data||{};
  },

  async updateTeamMember(userId,active,papel){
    let result;
    if(papel){
      result=await sb.rpc('atualizar_colaborador_com_papel',{
        p_user_id:userId,p_ativo:!!active,p_papel:papel
      });
      if(result.error && missingOptionalRpc(result.error)){
        result=await sb.rpc('atualizar_colaborador',{p_user_id:userId,p_ativo:!!active});
      }
    }else{
      result=await sb.rpc('atualizar_colaborador',{p_user_id:userId,p_ativo:!!active});
    }
    const {error}=result;
    if(error) throw error;
  },

  async cancelTeamInvite(inviteId){
    const {error}=await sb.rpc('cancelar_convite_colaborador',{p_convite_id:inviteId});
    if(error) throw error;
  },

  async savePublicProfile(profile){
    const base={p_slug:profile.slug||'',p_nome:profile.nome||'',p_contato:profile.contato||''};
    /* A versão com CRECI só existe depois de migracao-vitrine-fotos.sql.
       Mesmo padrão dos papéis de colaborador: tenta a nova, cai na antiga
       e o resto do formulário salva do mesmo jeito. */
    let res=await sb.rpc('salvar_perfil_publico',
      Object.assign({p_creci:profile.creci||''},base));
    if(res.error&&missingOptionalRpc(res.error)){
      res=await sb.rpc('salvar_perfil_publico',base);
    }
    if(res.error) throw res.error;
  },

  async loadPublicListings(slug){
    const {data,error}=await sb.rpc('listar_imoveis_publicos',{p_slug:slug});
    if(error) throw error;
    const result=data||{perfil:null,imoveis:[]};
    await Promise.all((result.imoveis||[]).map(async function(h){if(h.fotoPath)h.fotoUrl=await signedStorageUrl(h.fotoPath);}));
    return result;
  },

  /* ---------- Vitrine ----------
     Tabelas próprias, separadas de public.imoveis de propósito: um imóvel
     de terceiro nunca pode entrar no Financeiro nem no limite do plano. */
  async loadVitrine(){
    const [anunciantes,imoveis,leads,taxas,cidades]=await Promise.all([
      sb.from('vitrine_anunciantes').select('*').order('nome'),
      sb.from('vitrine_imoveis').select('*').order('created_at',{ascending:false}),
      sb.from('vitrine_leads').select('*').order('created_at',{ascending:false}).limit(300),
      sb.from('vitrine_taxas').select('*').order('periodo_fim',{ascending:false}),
      /* Cidades só existem depois de migracao-vitrine-corretora.sql.
         Sem ela, a Vitrine segue funcionando como antes. */
      sb.from('vitrine_cidades').select('*').order('ordem').order('nome')
    ]);
    if(anunciantes.error) throw anunciantes.error;
    if(imoveis.error) throw imoveis.error;
    if(leads.error) throw leads.error;
    if(taxas.error) throw taxas.error;
    return {
      anunciantes:(anunciantes.data||[]).map(rowToVitrineAnunciante),
      imoveis:(imoveis.data||[]).map(rowToVitrineImovel),
      leads:(leads.data||[]).map(rowToVitrineLead),
      taxas:(taxas.data||[]).map(rowToVitrineTaxa),
      cidades:cidades.error?[]:(cidades.data||[]).map(rowToVitrineCidade)
    };
  },

  /* ---------- cidades (os cards da entrada do site) ---------- */
  async saveVitrineCidade(item){
    const payload={
      nome:String(item.nome||'').trim().slice(0,120),
      uf:String(item.uf||'PE').trim().toUpperCase().slice(0,2),
      slug:vitrineCidadeSlug(item.slug||item.nome),
      ordem:Number(item.ordem)||0,
      ativa:item.ativa!==false,
      updated_at:new Date().toISOString()
    };
    /* O user_id é sempre o do PROPRIETÁRIO, nunca o de quem está logado.
       Sem isto, o colaborador grava com o próprio uid e a linha é rejeitada
       pela policy (que compara com usuario_proprietario_id) — ou, no caso das
       cidades, some para o dono da conta. No update não se mexe: a linha já
       pertence a quem tem de pertencer. */
    if(!item.id) payload.user_id=await _userId();
    const query=item.id
      ? sb.from('vitrine_cidades').update(payload).eq('id',item.id).select().single()
      : sb.from('vitrine_cidades').insert(payload).select().single();
    const {data,error}=await query;
    if(error) throw error;
    return rowToVitrineCidade(data);
  },
  async deleteVitrineCidade(id){
    const {error}=await sb.from('vitrine_cidades').delete().eq('id',id);
    if(error) throw error;
  },

  async saveVitrineAnunciante(item){
    const payload={nome:item.nome,telefone:item.telefone||'',email:item.email||'',
      documento:item.documento||'',observacoes:item.observacoes||'',updated_at:new Date().toISOString()};
    if(item.proprietarioClienteId) payload.proprietario_cliente_id=item.proprietarioClienteId;
    if(!item.id) payload.user_id=await _userId();
    const query=item.id
      ? sb.from('vitrine_anunciantes').update(payload).eq('id',item.id).select().single()
      : sb.from('vitrine_anunciantes').insert(payload).select().single();
    const {data,error}=await query;
    if(error) throw error;
    return rowToVitrineAnunciante(data);
  },
  async deleteVitrineAnunciante(id){
    const {error}=await sb.from('vitrine_anunciantes').delete().eq('id',id);
    if(error) throw error;
  },

  async saveVitrineImovel(item){
    const payload=vitrineImovelToRow(item);
    if(!item.id) payload.user_id=await _userId();
    const gravar=function(){
      return item.id
        ? sb.from('vitrine_imoveis').update(payload).eq('id',item.id).select().single()
        : sb.from('vitrine_imoveis').insert(payload).select().single();
    };
    let res=await gravar();
    /* A coluna que liga o anúncio ao imóvel da gestão só existe depois de
       migracao-proprietario-cliente.sql. Sem ela o anúncio salva do mesmo
       jeito — só não fica vinculado. */
    if(res.error&&('imovel_id' in payload)&&/imovel_id/i.test(String(res.error.message||''))){
      delete payload.imovel_id;
      res=await gravar();
    }
    if(res.error) throw res.error;
    return rowToVitrineImovel(res.data);
  },
  async deleteVitrineImovel(id){
    const {error}=await sb.from('vitrine_imoveis').delete().eq('id',id);
    if(error) throw error;
  },
  async setVitrineStatus(id,status,expiraEm){
    const payload={status:status,updated_at:new Date().toISOString()};
    if(status==='ativo'){
      payload.publicado_em=new Date().toISOString();
      if(expiraEm) payload.expira_em=expiraEm;
    }
    const {data,error}=await sb.from('vitrine_imoveis').update(payload).eq('id',id).select().single();
    if(error) throw error;
    return rowToVitrineImovel(data);
  },

  async saveVitrineTaxa(item){
    const payload={imovel_id:item.imovelId||null,anunciante_id:item.anuncianteId||null,
      valor:Number(item.valor)||0,forma_pagamento:item.formaPagamento||'',
      periodo_inicio:item.periodoInicio||null,periodo_fim:item.periodoFim||null,
      pago:!!item.pago,data_pagamento:item.dataPagamento||null,observacao:item.observacao||''};
    if(!item.id) payload.user_id=await _userId();
    const query=item.id
      ? sb.from('vitrine_taxas').update(payload).eq('id',item.id).select().single()
      : sb.from('vitrine_taxas').insert(payload).select().single();
    const {data,error}=await query;
    if(error) throw error;
    return rowToVitrineTaxa(data);
  },

  /* Fotos do anúncio. Mesmo bucket e mesmo padrão das fotos das casas,
     mas em pasta separada (vitrine/) e ligadas a vitrine_fotos. A leitura
     pública só libera o arquivo enquanto o anúncio estiver no ar — quem
     garante isso é a policy arquivo_vitrine_publico no banco. */
  async getVitrineFotos(imovelId){
    const {data,error}=await sb.from('vitrine_fotos').select('*')
      .eq('imovel_id',imovelId).order('ordem').order('created_at');
    if(error) throw error;
    const fotos=(data||[]).map(function(f){return {id:f.id,storagePath:f.storage_path,
      thumbPath:f.thumb_path||'',
      ordem:Number(f.ordem)||0,legenda:f.legenda||'',url:''};});
    await Promise.all(fotos.map(async function(f){
      if(f.storagePath) f.url=await signedStorageUrl(f.storagePath).catch(function(){return '';});
    }));
    return fotos;
  },
  async addVitrineFotos(imovelId,files,startOrder){
    const uid=await _userId();
    const added=[];
    for(let i=0;i<files.length;i++){
      const file=files[i];
      const nome=safeStorageName(file.nome||'foto.jpg');
      const base=uid+'/vitrine/'+imovelId+'/'+_uuid()+'-';
      const path=base+nome;
      const up=await sb.storage.from(FILE_BUCKET).upload(path,file.blob,
        {contentType:file.mime||'image/jpeg',upsert:false});
      if(up.error) throw up.error;
      /* Miniatura de 640 px para a grade. Se o navegador não conseguir
         gerar (canvas bloqueado, memória), o anúncio entra sem ela e a
         grade usa a foto grande. Nunca é motivo para falhar o upload. */
      let thumbPath='';
      if(file.thumb){
        thumbPath=base+'thumb-'+nome;
        const upThumb=await sb.storage.from(FILE_BUCKET).upload(thumbPath,file.thumb,
          {contentType:'image/jpeg',upsert:false});
        if(upThumb.error) thumbPath='';
      }
      const row={user_id:uid,imovel_id:imovelId,storage_path:path,
        ordem:(startOrder||0)+i,legenda:'',bytes:(file.blob.size||0)+((file.thumb&&file.thumb.size)||0)};
      if(thumbPath) row.thumb_path=thumbPath;
      let ins=await sb.from('vitrine_fotos').insert(row).select().single();
      /* Banco ainda sem a coluna: grava sem ela em vez de barrar a foto. */
      if(ins.error&&thumbPath&&/thumb_path/i.test(ins.error.message||'')){
        delete row.thumb_path;
        await sb.storage.from(FILE_BUCKET).remove([thumbPath]);
        thumbPath='';
        ins=await sb.from('vitrine_fotos').insert(row).select().single();
      }
      if(ins.error){
        await sb.storage.from(FILE_BUCKET).remove(thumbPath?[path,thumbPath]:[path]);
        throw ins.error;
      }
      added.push({id:ins.data.id,storagePath:path,thumbPath:thumbPath,
        ordem:ins.data.ordem,legenda:'',url:await signedStorageUrl(path)});
    }
    return added;
  },
  /* Legenda da foto. A coluna existia desde o começo e nunca teve tela:
     é ela que explica "sala vista da entrada" quando a foto sozinha não
     diz o que a pessoa está vendo. */
  async setVitrineFotoLegenda(fotoId,legenda){
    const {error}=await sb.from('vitrine_fotos')
      .update({legenda:String(legenda||'').slice(0,140)}).eq('id',fotoId);
    if(error) throw error;
  },
  async deleteVitrineFoto(fotoId){
    const found=await sb.from('vitrine_fotos').select('*').eq('id',fotoId).maybeSingle();
    if(found.error) throw found.error;
    if(found.data&&found.data.storage_path){
      /* A miniatura vai junto: deixá-la para trás ocuparia armazenamento
         do plano para sempre, sem nada que a referencie. */
      const alvos=[found.data.storage_path];
      if(found.data.thumb_path) alvos.push(found.data.thumb_path);
      const rem=await sb.storage.from(FILE_BUCKET).remove(alvos);
      if(rem.error) throw rem.error;
    }
    const {error}=await sb.from('vitrine_fotos').delete().eq('id',fotoId);
    if(error) throw error;
  },
  async reorderVitrineFotos(ordens){
    for(const item of ordens){
      const {error}=await sb.from('vitrine_fotos').update({ordem:item.ordem}).eq('id',item.id);
      if(error) throw error;
    }
  },

  /* Liga o contato do site ao interessado criado a partir dele. Só existe
     depois de migracao-proprietario-cliente.sql; sem a coluna, o cadastro
     do interessado continua valendo — só não fica marcado como convertido. */
  async setVitrineLeadInteressado(leadId,interessadoId){
    const {error}=await sb.from('vitrine_leads')
      .update({interessado_id:interessadoId,status:'contatado'}).eq('id',leadId);
    if(error) throw error;
  },
  async setVitrineLeadStatus(id,status){
    const {error}=await sb.from('vitrine_leads').update({status:status}).eq('id',id);
    if(error) throw error;
  },
  async deleteVitrineLead(id){
    const {error}=await sb.from('vitrine_leads').delete().eq('id',id);
    if(error) throw error;
  },

  async expireVitrine(){
    const {data,error}=await sb.rpc('vitrine_expirar_vencidos');
    if(error) throw error;
    return Number(data)||0;
  },

  /* Página pública: sem login. Só devolve anúncio no ar. */
  async loadVitrinePublica(slug){
    const {data,error}=await sb.rpc('listar_vitrine_publica',{p_slug:slug});
    if(error) throw error;
    const result=data||{perfil:null,imoveis:[]};
    await Promise.all((result.imoveis||[]).map(async function(i){
      const paths=Array.isArray(i.fotos)?i.fotos:[];
      /* `thumbs` só existe depois de migracao-vitrine-fotos.sql. Sem ela,
         a grade continua usando a foto grande — mais pesada, mas nada
         quebra. */
      const thumbs=Array.isArray(i.thumbs)&&i.thumbs.length?i.thumbs:paths;
      i.legendas=Array.isArray(i.legendas)?i.legendas:[];
      const assinadas=await Promise.all([
        Promise.all(paths.map(function(p){return signedStorageUrl(p).catch(function(){return '';});})),
        Promise.all(thumbs.map(function(p){return signedStorageUrl(p).catch(function(){return '';});}))
      ]);
      i.fotoUrls=assinadas[0].filter(Boolean);
      i.thumbUrls=assinadas[1].filter(Boolean);
    }));
    return result;
  },
  async registrarVitrineVisita(imovelId,tipo){
    try{ await sb.rpc('vitrine_registrar_visita',{p_imovel_id:imovelId,p_tipo:tipo||'visualizacao'}); }
    catch(e){ console.warn('Contador não registrado:',e&&e.message); }
  },
  /* Clique no botão do WhatsApp: conta e registra o lead. Se a migração
     migracao-vitrine-equipe.sql ainda não rodou, cai no contador antigo —
     o visitante nunca vê erro por causa disto. */
  async registrarVitrineCliqueWhatsapp(imovelId,contexto){
    try{
      const {error}=await sb.rpc('vitrine_registrar_clique_whatsapp',
        {p_imovel_id:imovelId,p_contexto:contexto||''});
      if(error) throw error;
    }catch(e){
      console.warn('Contato do WhatsApp não registrado:',e&&e.message);
      await this.registrarVitrineVisita(imovelId,'whatsapp');
    }
  },
  async registrarVitrineLead(lead){
    const {data,error}=await sb.rpc('vitrine_registrar_lead',{
      p_imovel_id:lead.imovelId,p_nome:lead.nome,p_telefone:lead.telefone,
      p_mensagem:lead.mensagem||'',p_consentimento:!!lead.consentimento
    });
    if(error) throw error;
    return data||{};
  },

  /* Minha Casa: financeiro familiar compartilhado somente pelas contas Mestre. */
  async loadMyHome(){
    const baseResult=await sb.rpc('minha_casa_carregar',{
      p_mes:currentMonthStr(),p_status_sugestoes:'pendente'
    });
    if(baseResult.error) throw baseResult.error;
    const home=baseResult.data||{};
    const transactions=[];
    let offset=0,total=0;
    do{
      const pageResult=await sb.rpc('minha_casa_listar_lancamentos',{
        p_data_inicio:null,p_data_fim:null,p_tipo:null,p_membro_id:null,p_categoria_id:null,
        p_busca:null,p_limite:500,p_offset:offset
      });
      if(pageResult.error) throw pageResult.error;
      const page=pageResult.data||{},items=page.items||[];
      transactions.push.apply(transactions,items);
      total=Number(page.total)||0;
      offset+=items.length;
      if(!items.length) break;
    }while(offset<total);
    home.transactions=transactions;
    home.suggestions=(home.suggestions||[]).map(function(item){
      const source=item.sourceData||item.source_data||{};
      return Object.assign({},item,{
        houseName:item.houseName||source.casa||'',
        referenceMonth:item.referenceMonth||item.month||source.competencia||'',
        sourceId:item.sourceId||item.sourceKey||''
      });
    });
    return home;
  },

  async activateMyHome(){
    const {data,error}=await sb.rpc('minha_casa_inicializar',{p_ativar:true});
    if(error) throw error;
    return data||{};
  },

  async createMyHomeTransaction(item){
    const {data,error}=await sb.rpc('minha_casa_salvar_lancamento',{
      p_tipo:item.type,p_valor:Number(item.amount)||0,p_categoria_id:item.categoryId,
      p_membro_id:item.memberId,p_data:item.date||todayISO(),p_descricao:item.description||'',p_id:null,
      p_forma_pagamento:item.paymentMethod||'dinheiro',p_parcelas:Number(item.installments)||1
    });
    if(error) throw error;
    return data||{};
  },

  async updateMyHomeTransaction(id,item){
    const {data,error}=await sb.rpc('minha_casa_salvar_lancamento',{
      p_tipo:item.type,p_valor:Number(item.amount)||0,p_categoria_id:item.categoryId,
      p_membro_id:item.memberId,p_data:item.date||todayISO(),p_descricao:item.description||'',p_id:id,
      p_forma_pagamento:item.paymentMethod||'dinheiro',p_parcelas:1
    });
    if(error) throw error;
    return data||{};
  },

  /* Apagar uma parcela sozinha deixaria a compra pela metade. */
  async deleteMyHomePurchase(purchaseId){
    const {data,error}=await sb.rpc('minha_casa_excluir_compra',{p_compra_id:purchaseId});
    if(error) throw error;
    return data||{};
  },

  async deleteMyHomeTransaction(id){
    const {data,error}=await sb.rpc('minha_casa_excluir_lancamento',{p_id:id});
    if(error) throw error;
    return data||{};
  },

  /* Formas de pagamento disponíveis nos NOVOS lançamentos (escopo da
     família). Enquanto migracao-minha-casa-formas-pagamento.sql não for
     aplicada, as funções não existem: seguimos com todas ativas, sem
     erro na tela e sem barulho no console. */
  async loadMyHomePaymentPrefs(){
    if(_myHomePayPrefsOff) return null;
    try{
      const {data,error}=await sb.rpc('minha_casa_formas_pagamento');
      if(error){ _myHomePayPrefsOff=true; return null; }
      return Array.isArray(data)?data:[];
    }catch(e){ _myHomePayPrefsOff=true; return null; }
  },
  async saveMyHomePaymentPrefs(inativas){
    const {data,error}=await sb.rpc('minha_casa_salvar_formas_pagamento',{
      p_inativas:Array.isArray(inativas)?inativas:[]
    });
    if(error) throw error;
    return Array.isArray(data)?data:[];
  },

  async saveMyHomeMember(item){
    const {data,error}=await sb.rpc('minha_casa_salvar_membro',{
      p_nome:item.name,p_emoji:item.emoji||'👤',p_cor:item.color||'#64748B',
      p_ativo:item.active!==false,p_id:item.id||null
    });
    if(error) throw error;
    return data||{};
  },

  async deleteMyHomeMember(id){
    const {data,error}=await sb.rpc('minha_casa_excluir_membro',{p_id:id});
    if(error) throw error;
    return data||{};
  },

  async saveMyHomeCategory(item){
    const {data,error}=await sb.rpc('minha_casa_salvar_categoria',{
      p_nome:item.name,p_tipo:item.type,p_emoji:item.emoji||'📌',p_cor:item.color||'#64748B',
      p_ativo:item.active!==false,p_id:item.id||null
    });
    if(error) throw error;
    return data||{};
  },

  async deleteMyHomeCategory(id){
    const {data,error}=await sb.rpc('minha_casa_excluir_categoria',{p_id:id});
    if(error) throw error;
    return data||{};
  },

  async saveMyHomeRecurring(item){
    const {data,error}=await sb.rpc('minha_casa_salvar_conta_fixa',{
      p_nome:item.name,p_valor:Number(item.amount)||0,p_categoria_id:item.categoryId,
      p_membro_id:item.memberId,p_dia_mes:Number(item.dayOfMonth)||1,
      p_inicio:item.startDate||null,p_fim:item.endDate||null,p_descricao:item.description||'',
      p_ativa:item.active!==false,p_id:item.id||null
    });
    if(error) throw error;
    return data||{};
  },

  async deleteMyHomeRecurring(id){
    const {data,error}=await sb.rpc('minha_casa_excluir_conta_fixa',{p_id:id});
    if(error) throw error;
    return data||{};
  },

  async acceptMyHomeSuggestion(id,overrides){
    const args={p_sugestao_id:id};
    if(overrides){
      args.p_valor=Number(overrides.amount)||0;
      args.p_data=overrides.date||null;
      args.p_categoria_id=overrides.categoryId||null;
      args.p_membro_id=overrides.memberId||null;
      args.p_descricao=overrides.description==null?null:overrides.description;
    }
    const {data,error}=await sb.rpc('minha_casa_aceitar_sugestao',args);
    if(error) throw error;
    return data||{};
  },

  async ignoreMyHomeSuggestion(id){
    const {data,error}=await sb.rpc('minha_casa_ignorar_sugestao',{p_sugestao_id:id});
    if(error) throw error;
    return data||{};
  },

  /* Carrega tudo do usuário logado e monta o estado em memória. */
  async loadAll(options){
    const includeArchived=!!(options&&options.includeArchived);
    const activeOnly=!includeArchived;
    const chargeSource=includeArchived
      ?'financeiro_cobrancas'
      :'financeiro_cobrancas_resumo';
    const [imoveis, inquilinos, contratos, pagamentos, despesas, historico, cfg, eventos, reajustes, energia, interesses, cobrancas, recebimentos, chamados, donos] = await Promise.all([
      fetchAllRows('imoveis','created_at',true,activeOnly),
      sb.rpc('listar_inquilinos_aluguel',{p_incluir_arquivados:includeArchived}),
      fetchAllRows('contratos','inicio',true,activeOnly),
      fetchAllRows('pagamentos','id',true,activeOnly),
      fetchAllRows('despesas','id',true,activeOnly),
      fetchAllRows('historico_status','data',true),
      sb.from('configuracoes').select('*').maybeSingle(),
      fetchAllRows('eventos','data',true),
      fetchAllRows('aluguel_historico','data_inicio',true,activeOnly),
      fetchAllRows('energia','id',true,activeOnly),
      fetchAllRows('interessados','created_at',false),
      fetchOptionalRows(chargeSource,'competencia',false,false),
      fetchOptionalRows('financeiro_recebimentos','data_pagamento',false,activeOnly),
      fetchOptionalRows('chamados','created_at',false,false),
      /* Proprietários-clientes. Opcional: a conta que ainda não recebeu
         migracao-proprietario-cliente.sql segue funcionando sem eles. */
      fetchOptionalRows('proprietarios_clientes','nome',true,activeOnly)
    ]);
    const firstErr = imoveis.error||inquilinos.error||contratos.error||pagamentos.error||despesas.error||historico.error||cfg.error||eventos.error||reajustes.error||energia.error||interesses.error||cobrancas.error||recebimentos.error||chamados.error;
    if(firstErr) throw firstErr;

    const houses = (imoveis.data||[]).map(rowToHouse);
    const byId = {};
    houses.forEach(function(h){ byId[h.id]=h; });

    (contratos.data||[]).forEach(function(c){
      const h=byId[c.imovel_id]; if(h) h.contracts.push(rowToContract(c));
    });

    (pagamentos.data||[]).forEach(function(p){
      const h = byId[p.imovel_id]; if(!h) return;
      h.pagamentos.push({
        id:p.id,mes:p.mes,contractId:p.contrato_id||'',
        valorPago:Number(p.valor_pago)||0,dataPagamento:p.data_pagamento||'',
        arquivadoEm:p.arquivado_em||'',
        motivoArquivamento:p.motivo_arquivamento||''
      });
    });
    (despesas.data||[]).forEach(function(e){
      const h = byId[e.imovel_id]; if(!h) return;
      h.despesas.push({
        id:e.id,descricao:e.descricao,categoria:e.categoria,
        valor:Number(e.valor)||0,data:e.data||'',prestador:e.prestador||'',
        status:e.status||'Concluído',arquivadoEm:e.arquivado_em||'',
        motivoArquivamento:e.motivo_arquivamento||''
      });
    });
    (historico.data||[]).forEach(function(s){
      const h = byId[s.imovel_id]; if(!h) return;
      h.statusHistorico.push({ data:s.data, status:s.status, tenantId:s.tenant_id||'' });
    });
    (reajustes.data||[]).forEach(function(r){
      const h = byId[r.imovel_id]; if(!h) return;
      const item={
        id:r.id,valor:Number(r.valor)||0,dataInicio:r.data_inicio,
        contractId:r.contrato_id||'',motivo:r.motivo||'',
        confirmadoEm:r.confirmado_em||'',confirmadoPor:r.confirmado_por||'',
        arquivadoEm:r.arquivado_em||'',
        motivoArquivamento:r.motivo_arquivamento||''
      };
      h.aluguelHistorico.push(item);
      if(item.contractId){
        const contract=(h.contracts||[]).find(function(c){return c.id===item.contractId;});
        if(contract) contract.reajustes.push(item);
      }
    });
    (energia.data||[]).forEach(function(en){
      const h = byId[en.imovel_id]; if(!h) return;
      h.energias.push(rowToEnergy(en));
    });
    const chargeHouse={};
    (cobrancas.data||[]).forEach(function(row){
      const h=byId[row.imovel_id]; if(!h) return;
      const charge=rowToCharge(row);
      h.cobrancas.push(charge);
      chargeHouse[charge.id]=h;
    });
    (recebimentos.data||[]).forEach(function(row){
      const h=chargeHouse[row.cobranca_id]; if(!h) return;
      h.recebimentos.push(rowToReceipt(row));
    });
    (chamados.data||[]).forEach(function(row){
      const h=byId[row.imovel_id]; if(!h) return;
      h.chamados.push(rowToMaintenanceCall(row));
    });
    // garante pelo menos um ponto de histórico
    houses.forEach(function(h){
      if(!h.statusHistorico.length){
        h.statusHistorico = [{ data:h.contratoInicio||todayISO(), status:h.status, tenantId:h.tenantId||'' }];
      }
    });

    const tenants = (inquilinos.data||[]).map(rowToTenant);
    const config = rowToConfig(cfg.data);
    const evs = (eventos.data||[]).map(function(e){ return { id:e.id, data:e.data, texto:e.texto||'' }; });

    return { houses, tenants, interests:(interesses.data||[]).map(rowToInterest), config, eventos: evs,
      owners:(donos.data||[]).map(rowToOwnerClient) };
  },

  /* Fotos de uma casa (carregadas sob demanda). */
  async getPhotos(imovelId){
    const { data, error } = await sb.from('fotos').select('*')
      .eq('imovel_id', imovelId).order('ordem', {ascending:true});
    if(error) throw error;
    const photos=(data||[]).map(function(r){ return { id:r.id, dados:r.dados||'', storagePath:r.storage_path||'',
      nome:r.nome||'',tamanho:Number(r.tamanho)||0,
      /* Foto sem chamado segue sendo foto do imóvel, como sempre foi. */
      chamadoId:r.chamado_id||'',momento:r.momento||'' }; });
    await Promise.all(photos.map(async function(p){ if(p.storagePath) p.dados=await signedStorageUrl(p.storagePath); }));
    return photos;
  },

  async getDocuments(imovelId){
    const { data, error } = await sb.rpc('listar_documentos_imovel',{
      p_imovel_id:imovelId
    });
    if(error) throw error;
    const docs=(data||[]).map(rowToDocument);
    await Promise.all(docs.map(async function(d){
      if(d.storagePath) d.url=await signedStorageUrl(d.storagePath);
      else d.url=d.dados||'';
    }));
    return docs;
  },

  /* Salva configurações do locador (upsert por user_id). */
  async saveConfig(cfg){
    const uid = await _userId();
    const { error } = await sb.from('configuracoes').upsert({
      user_id: uid,
      locador_nome: cfg.locadorNome || '',
      locador_documento: cfg.locadorDocumento || '',
      energia_ativa: cfg.energiaAtiva!==false,
      tema: normalizeAppTheme(cfg.tema),
      onboarding_concluido: !!cfg.onboardingConcluido,
      ultimo_backup_externo: cfg.ultimoBackupExterno||null,
      pix_chave: String(cfg.pixChave||'').slice(0,180),
      pix_nome: String(cfg.pixNome||'').slice(0,25),
      pix_cidade: String(cfg.pixCidade||'').slice(0,15),
      updated_at: new Date().toISOString()
    });
    if(error) throw error;
  },

  /* Preferência de TEMA POR USUÁRIO (cada colaborador a sua). Silenciosa:
     se a tabela ainda não existe, não quebra nem polui o console. */
  async loadUserTheme(){
    if(_userThemeServerOff) return null;
    try{
      const uid=await _authUserId();
      if(!uid) return null;
      const { data, error } = await sb.from('preferencias_usuario').select('tema').eq('user_id',uid).maybeSingle();
      if(error){ _userThemeServerOff=true; return null; }
      return (data&&data.tema)||null;
    }catch(e){ _userThemeServerOff=true; return null; }
  },
  async saveUserTheme(tema){
    if(_userThemeServerOff) return;
    try{
      const uid=await _authUserId();
      if(!uid) return;
      const { error } = await sb.from('preferencias_usuario').upsert(
        { user_id:uid, tema:normalizeUserTheme(tema), atualizado_em:new Date().toISOString() },
        { onConflict:'user_id' });
      if(error){ _userThemeServerOff=true; }
    }catch(e){ _userThemeServerOff=true; }
  },

  /* Exporta os dados suportados pelo formato V7, incluindo fotos, documentos
     privados e comprovantes de leitura de energia. */
  async exportAll(){
    const base = await this.loadAll({includeArchived:true});
    const results=await Promise.all([
      fetchAllRows('fotos','ordem',true),
      sb.rpc('listar_documentos_backup')
    ]);
    if(results[0].error) throw results[0].error;
    if(results[1].error) throw results[1].error;
    const fotos=results[0].data||[],documentos=results[1].data||[];
    const photos = {};
    for(const f of fotos){
      let content=f.dados||'';
      if(!content && f.storage_path){
        const downloaded=await sb.storage.from(FILE_BUCKET).download(f.storage_path);
        if(downloaded.error) throw downloaded.error;
        content=await blobToDataUrl(downloaded.data);
      }
      if(content) (photos[f.imovel_id] = photos[f.imovel_id] || []).push(content);
    }
    const documents={};
    for(const d of documentos){
      let content=d.dados||'';
      if(!content&&d.storage_path){
        const downloaded=await sb.storage.from(FILE_BUCKET).download(d.storage_path);
        if(downloaded.error) throw downloaded.error;
        content=await blobToDataUrl(downloaded.data);
      }
      if(content)(documents[d.imovel_id]=documents[d.imovel_id]||[]).push({tenantId:d.inquilino_id||'',
        tipo:d.tipo||'outro',nome:d.nome||'Arquivo',mime:d.mime||'',tamanho:Number(d.tamanho)||0,
        visivelInquilino:!!d.visivel_inquilino,dados:content});
    }
    for(const h of base.houses){
      for(const en of (h.energias||[])){
        if(!en.fotoPath)continue;
        const downloaded=await sb.storage.from(FILE_BUCKET).download(en.fotoPath);
        if(downloaded.error)throw downloaded.error;
        const content=await blobToDataUrl(downloaded.data);
        en.fotoBackup={
          dados:content,
          mime:downloaded.data.type||'image/jpeg',
          tamanho:downloaded.data.size||_backupDataUrlBytes(content)
        };
      }
    }
    /* O exportId identifica ESTE arquivo. É o que permite ao banco recusar
       a mesma exportação importada duas vezes — antes, importar o mesmo
       arquivo de novo simplesmente duplicava a carteira inteira, e a única
       proteção era uma frase na tela pedindo para não fazer isso. */
    return { version:7, exportId:_uuid(), exportedAt:new Date().toISOString(),
             owners:base.owners||[],
             houses:base.houses, tenants:base.tenants, interests:base.interests||[], photos:photos,
             documents:documents,config:base.config, eventos:base.eventos||[] };
  },

  /* Importa tudo em uma única transação no PostgreSQL. Se qualquer etapa
     falhar, nenhuma linha é gravada e uma restauração não apaga o estado atual. */
  async importBackup(data, options){
    const payload = normalizeBackupForImport(data);
    await assertBackupStorageAvailable(payload,!!(options&&options.replace));
    let oldPaths=[],uploadedPaths=[];
    if(options&&options.replace){
      const protectedRows=await Promise.all([
        sb.from('vistorias').select('id').limit(1),
        sb.from('vistoria_fotos').select('id').limit(1),
        sb.from('chamado_fotos').select('id').limit(1),
        sb.from('acessos_inquilino').select('user_id').limit(1),
        sb.from('convites_inquilino').select('id').limit(1)
      ]);
      const protectedError=protectedRows.find(function(result){return result.error;});
      if(protectedError)throw protectedError.error;
      if(protectedRows.some(function(result){return (result.data||[]).length>0;})){
        throw new Error('A restauração foi bloqueada porque existem vistorias, fotos de chamados, convites ou acessos do Portal que este formato ainda não substitui com segurança.');
      }
      const current=await Promise.all([
        sb.from('fotos').select('storage_path'),sb.rpc('listar_documentos_backup'),sb.from('energia').select('foto_path')
      ]);
      const currentError=current.find(function(r){return r.error;});if(currentError)throw currentError.error;
      oldPaths=[].concat(current[0].data||[],current[1].data||[]).map(function(r){return r.storage_path;})
        .concat((current[2].data||[]).map(function(r){return r.foto_path;}));
    }
    try{
      const uid=await _userId();
      for(const entry of (payload.energy||[])){
        if(!entry.foto_dados)continue;
        const blob=dataUrlToBlob(entry.foto_dados);
        const extension=blob.type==='image/png'?'png':blob.type==='image/webp'?'webp':'jpg';
        const path=uid+'/'+entry.imovel_id+'/energia/import-'+entry.id+'-'+_uuid()+'.'+extension;
        const uploaded=await sb.storage.from(FILE_BUCKET).upload(path,blob,{
          contentType:blob.type||'image/jpeg',upsert:false
        });
        if(uploaded.error)throw uploaded.error;
        uploadedPaths.push(path);
        entry.foto_path=path;
        delete entry.foto_dados;
        delete entry.foto_mime;
        delete entry.foto_tamanho;
      }
      const { error } = await sb.rpc('importar_backup_atomico_v7', {
        p_payload: payload,
        p_substituir: !!(options && options.replace)
      });
      if(error) throw error;
    }catch(error){
      if(uploadedPaths.length){
        try{await removeStoragePaths(uploadedPaths);}
        catch(cleanupError){console.warn('Arquivos temporários do backup precisam de limpeza posterior.',cleanupError);}
      }
      throw error;
    }
    if(oldPaths.length){
      try{await removeStoragePaths(oldPaths);}
      catch(cleanupError){
        console.warn('Dados restaurados; alguns arquivos antigos não puderam ser removidos agora.',cleanupError);
      }
    }
  },

  async markExternalBackup(){
    const uid=await _userId(),stamp=new Date().toISOString();
    const {error}=await sb.from('configuracoes').upsert({user_id:uid,ultimo_backup_externo:stamp,updated_at:stamp});
    if(error) throw error;
    return stamp;
  },

  /* ---------------- ESCRITAS ---------------- */

  /* Proprietários-clientes — os donos dos imóveis administrados */
  async saveOwnerClient(item){
    const payload=ownerClientToRow(item);
    /* Como em toda tabela desta base, o user_id do INSERT é o do
       proprietário da conta, nunca o de quem está logado. */
    if(!item.id) payload.user_id=await _userId();
    const query=item.id
      ? sb.from('proprietarios_clientes').update(payload).eq('id',item.id).select().single()
      : sb.from('proprietarios_clientes').insert(payload).select().single();
    const {data,error}=await query;
    if(error) throw error;
    return rowToOwnerClient(data);
  },
  async deleteOwnerClient(id){
    const {error}=await sb.from('proprietarios_clientes').delete().eq('id',id);
    if(error) throw error;
  },

  /* Casas */
  async insertHouse(h){
    const uid = await _userId();
    const row = houseToRow(h); row.user_id = uid;
    let res = await sb.from('imoveis').insert(row).select().single();
    if(res.error && !_imovelTipoOff && ('tipo' in row) && _isMissingTipoError(res.error)){
      _imovelTipoOff=true; delete row.tipo;
      res = await sb.from('imoveis').insert(row).select().single();
    }
    if(res.error && !_imovelDonoOff && ('proprietario_cliente_id' in row) && _isMissingDonoError(res.error)){
      _imovelDonoOff=true; delete row.proprietario_cliente_id;
      res = await sb.from('imoveis').insert(row).select().single();
    }
    if(res.error) throw res.error;
    const novo = rowToHouse(res.data);
    const ini = { data: novo.contratoInicio||todayISO(), status:novo.status, tenantId:novo.tenantId||'' };
    novo.statusHistorico = [ini];
    await sb.from('historico_status').insert({ user_id:uid, imovel_id:novo.id,
      data:ini.data, status:ini.status, tenant_id:ini.tenantId||null });
    return novo;
  },
  async updateHouse(h){
    const row = houseToRow(h);
    let res = await sb.from('imoveis').update(row).eq('id', h.id);
    if(res.error && !_imovelTipoOff && ('tipo' in row) && _isMissingTipoError(res.error)){
      _imovelTipoOff=true; delete row.tipo;
      res = await sb.from('imoveis').update(row).eq('id', h.id);
    }
    if(res.error && !_imovelDonoOff && ('proprietario_cliente_id' in row) && _isMissingDonoError(res.error)){
      _imovelDonoOff=true; delete row.proprietario_cliente_id;
      res = await sb.from('imoveis').update(row).eq('id', h.id);
    }
    if(res.error) throw res.error;
  },
  async registerBasicInspection(imovelId,date){
    const {data,error}=await sb.rpc('registrar_vistoria_basica',{
      p_imovel_id:imovelId,
      p_data:date||todayISO()
    });
    if(error) throw error;
    const row=data||{};
    return {
      id:row.id||'',
      houseId:row.imovel_id||imovelId,
      contractId:row.contrato_id||'',
      data:row.data||date||todayISO(),
      tipo:row.tipo||'periodica',
      estado:row.estado||'bom',
      observacoes:row.observacoes||'',
      createdBy:row.criado_por||''
    };
  },
  async deleteHouse(id){
    return this.archiveHouse(id,'Arquivado pela gestao de imoveis.');
  },

  /* Histórico de status: substitui o conjunto do imóvel (espelha a memória) */
  async replaceStatusHistory(imovelId, arr){
    const uid = await _userId();
    const del = await sb.from('historico_status').delete().eq('imovel_id', imovelId);
    if(del.error) throw del.error;
    if(arr && arr.length){
      const rows = arr.map(function(s){ return { user_id:uid, imovel_id:imovelId,
        data:s.data, status:s.status, tenant_id:s.tenantId||null }; });
      const { error } = await sb.from('historico_status').insert(rows);
      if(error) throw error;
    }
  },

  /* Contratos: cada período preserva casa, inquilino e regra de cobrança. */
  async startContract(imovelId,tenantId,c){
    const {data,error}=await sb.rpc('iniciar_contrato_gestao',{
      p_imovel_id:imovelId,p_inquilino_id:tenantId,p_inicio:c.inicio,p_fim:c.fim||null,
      p_valor:Number(c.valor)||0,p_dia_vencimento:contractBillingDay(c),
      p_modalidade:contractMode(c),p_proporcional_dias:Number(c.proporcionalDias)||0,
      p_proporcional_valor:Number(c.proporcionalValor)||0
    });
    if(error) throw error;
    const row=Array.isArray(data)?data[0]:data;
    return rowToContract(row);
  },
  async finishContract(imovelId,contractId,endDate,nextStatus){
    const {error}=await sb.rpc('encerrar_contrato_gestao',{
      p_imovel_id:imovelId,p_contrato_id:contractId,p_fim:endDate||todayISO(),
      p_novo_status:nextStatus||'vaga'
    });
    if(error) throw error;
  },
  async previewContractRemoval(contractId){
    const {data,error}=await sb.rpc('prever_exclusao_contrato',{p_contrato_id:contractId});
    if(error) throw error;
    return data||{};
  },
  async deleteContractMistake(contractId,confirmation){
    const {data,error}=await sb.rpc('excluir_contrato_por_engano',{
      p_contrato_id:contractId,p_confirmacao:confirmation
    });
    if(error) throw error;
    const result=data||{};
    try{await removeStoragePaths(result.energyPhotoPaths||result.energy_photo_paths||[]);}
    catch(storageError){console.warn('Contrato excluído; uma foto antiga não pôde ser removida do armazenamento.',storageError);}
    return result;
  },
  async insertContract(imovelId,tenantId,c){
    const uid=await _userId();
    const row={user_id:uid,imovel_id:imovelId,tenant_id:tenantId,
      inicio:c.inicio,fim:c.fim||null,valor:Number(c.valor)||0,
      dia_vencimento:contractBillingDay(c),modalidade_vencimento:contractMode(c),
      ativo:c.ativo!==false,proporcional_dias:Number(c.proporcionalDias)||0,
      proporcional_valor:Number(c.proporcionalValor)||0,
      proporcional_pago:!!c.proporcionalPago,
      proporcional_data_pagamento:c.proporcionalDataPagamento||null};
    const {data,error}=await sb.from('contratos').insert(row).select().single();
    if(error) throw error;
    return rowToContract(data);
  },
  async updateContract(c){
    const row={tenant_id:c.tenantId,inicio:c.inicio,fim:c.fim||null,
      valor:Number(c.valor)||0,dia_vencimento:contractBillingDay(c),
      modalidade_vencimento:contractMode(c),ativo:!!c.ativo,
      proporcional_dias:Number(c.proporcionalDias)||0,
      proporcional_valor:Number(c.proporcionalValor)||0,
      proporcional_pago:!!c.proporcionalPago,
      proporcional_data_pagamento:c.proporcionalDataPagamento||null};
    const {error}=await sb.from('contratos').update(row).eq('id',c.id);
    if(error) throw error;
  },
  async confirmContractInitialValue(contractId,value){
    const {data,error}=await sb.rpc('confirmar_valor_inicial_contrato',{
      p_contrato_id:contractId,
      p_valor:Number(value)||0
    });
    if(error)throw error;
    return data||{};
  },
  async closeContract(id,endDate){
    const {error}=await sb.from('contratos').update({fim:endDate,ativo:false}).eq('id',id);
    if(error) throw error;
  },
  async saveContractProrata(id,paid,date){
    const {error}=await sb.from('contratos').update({proporcional_pago:!!paid,
      proporcional_data_pagamento:paid?(date||todayISO()):null}).eq('id',id);
    if(error) throw error;
  },

  /* Pagamentos (um por casa/mês) */
  async upsertPayment(imovelId, p){
    const uid = await _userId();
    const row = { user_id:uid, imovel_id:imovelId, mes:p.mes,
      contrato_id:p.contractId||null,valor_pago:Number(p.valorPago)||0, data_pagamento:p.dataPagamento||null,
      arquivado_em:null,arquivado_por:null,motivo_arquivamento:'' };
    const { error } = await sb.from('pagamentos').upsert(row, { onConflict:'contrato_id,mes' });
    if(error) throw error;
  },
  async deletePayment(imovelId, mes,contractId){
    let q=sb.from('pagamentos').select('id').eq('imovel_id', imovelId).eq('mes', mes);
    if(contractId) q=q.eq('contrato_id',contractId);
    const {data,error}=await q.limit(1).maybeSingle();
    if(error) throw error;
    if(data) await this.archiveEntity('pagamento',data.id,'Pagamento desmarcado.');
  },

  /* Energia (um registro por casa/mês; leituras, cálculo e recebimento). */
  /* Financeiro V2: competencia e caixa em registros separados. */
  async upsertCharge(imovelId,item){
    const uid=await _userId();
    const row=chargeToRow(item,imovelId);
    row.user_id=uid;
    let result;
    if(item.id){
      result=await sb.from('financeiro_cobrancas').update(row)
        .eq('id',item.id).select().single();
    }else if(item.origemId){
      result=await sb.from('financeiro_cobrancas').upsert(row,{
        onConflict:'user_id,origem_tipo,origem_id'
      }).select().single();
    }else{
      result=await sb.from('financeiro_cobrancas').insert(row).select().single();
    }
    if(result.error) throw result.error;
    const refreshed=await sb.from('financeiro_cobrancas_resumo')
      .select('*').eq('id',result.data.id).single();
    if(refreshed.error) throw refreshed.error;
    return rowToCharge(refreshed.data);
  },

  async generateMonthlyCharges(competencia){
    const {data,error}=await sb.rpc('gerar_cobrancas_aluguel_mes',{
      p_competencia:competencia
    });
    if(error) throw error;
    return Number(data)||0;
  },

  async getChargeByOrigin(originType,originId){
    if(!originId)return null;
    const {data,error}=await sb.from('financeiro_cobrancas_resumo').select('*')
      .eq('origem_tipo',originType)
      .eq('origem_id',originId)
      .maybeSingle();
    if(error)throw error;
    return data?rowToCharge(data):null;
  },

  async insertReceipt(item){
    const uid=await _userId();
    const row=receiptToRow(item); row.user_id=uid;
    const {data,error}=await sb.from('financeiro_recebimentos')
      .insert(row).select().single();
    if(error){
      /* O identificador nasce quando o formulário é aberto. Se a resposta
         da rede se perder e o usuário tentar novamente, devolvemos o mesmo
         recebimento em vez de criar uma segunda parcela. */
      if(String(error.code||'')==='23505'&&row.origem_id){
        const existing=await sb.from('financeiro_recebimentos').select('*')
          .eq('user_id',uid)
          .eq('origem_tipo',row.origem_tipo)
          .eq('origem_id',row.origem_id)
          .maybeSingle();
        if(!existing.error&&existing.data) return rowToReceipt(existing.data);
      }
      throw error;
    }
    return rowToReceipt(data);
  },

  async updateReceipt(item){
    const row=receiptToRow(item);
    delete row.cobranca_id;
    delete row.origem_tipo;
    delete row.origem_id;
    const {data,error}=await sb.from('financeiro_recebimentos')
      .update(row).eq('id',item.id).select().single();
    if(error) throw error;
    return rowToReceipt(data);
  },

  async archiveCharge(id,reason){
    return this.archiveEntity('cobranca',id,reason);
  },

  async restoreCharge(id){
    return this.restoreEntity('cobranca',id);
  },

  async archiveReceipt(id,reason){
    return this.archiveEntity('recebimento',id,reason);
  },

  async restoreReceipt(id){
    return this.restoreEntity('recebimento',id);
  },

  async archiveHouse(id,reason){ return this.archiveEntity('imovel',id,reason); },
  async restoreHouse(id){ return this.restoreEntity('imovel',id); },
  async archiveTenant(id,reason){ return this.archiveEntity('inquilino',id,reason); },
  async restoreTenant(id){ return this.restoreEntity('inquilino',id); },
  async archiveContract(id,reason){ return this.archiveEntity('contrato',id,reason); },
  async restoreContract(id){ return this.restoreEntity('contrato',id); },

  async archiveEntity(entity,id,reason){
    const {data,error}=await sb.rpc('alterar_arquivamento_aluguel',{
      p_entidade:entity,p_id:id,p_arquivar:true,p_motivo:reason||''
    });
    if(error) throw error;
    return data||{};
  },

  async restoreEntity(entity,id){
    const {data,error}=await sb.rpc('alterar_arquivamento_aluguel',{
      p_entidade:entity,p_id:id,p_arquivar:false,p_motivo:''
    });
    if(error) throw error;
    return data||{};
  },

  async listArchived(){
    const {data,error}=await sb.rpc('listar_arquivados_aluguel');
    if(error) throw error;
    return (data||[]).map(function(item){return {
      entidade:item.entidade||'',id:item.id,titulo:item.titulo||'',
      arquivadoEm:item.arquivado_em||'',motivo:item.motivo||''
    };});
  },

  async listFinancialAudit(limit){
    const maxRows=Math.min(500,Math.max(1,Number(limit)||100));
    const {data,error}=await sb.from('financeiro_auditoria').select('*')
      .order('created_at',{ascending:false}).limit(maxRows);
    if(error) throw error;
    return (data||[]).map(function(item){return {
      id:item.id,atorId:item.ator_id||'',atorPapel:item.ator_papel||'',
      entidade:item.entidade||'',registroId:item.registro_id||'',
      acao:item.acao||'',antes:item.dados_anteriores||null,
      depois:item.dados_posteriores||null,createdAt:item.created_at||''
    };});
  },

  async upsertEnergia(imovelId, en){
    const uid = await _userId();
    const row = { user_id:uid, imovel_id:imovelId, mes:en.mes,
      contrato_id:en.contractId||null,
      valor:Number(en.valor)||0, kwh:Number(en.kwh)||0,
      leitura_anterior:Number(en.leituraAnterior)||0,leitura_atual:Number(en.leituraAtual)||0,
      tarifa_kwh:Number(en.tarifaKwh)||0,acrescimos:Number(en.acrescimos)||0,
      descontos:Number(en.descontos)||0,ajuste_descricao:en.ajusteDescricao||'',
      valor_calculado:Number(en.valorCalculado)||0,valor_manual:!!en.valorManual,
      vencimento:en.vencimento||null,foto_path:en.fotoPath||null,
      pago:!!en.pago, data_pagamento:en.dataPagamento||null,
      arquivado_em:null,arquivado_por:null,motivo_arquivamento:'' };
    const { data,error } = await sb.from('energia').upsert(row, { onConflict:'contrato_id,mes' })
      .select().single();
    if(error) throw error;
    return rowToEnergy(data);
  },
  async deleteEnergia(imovelId, mes,contractId){
    let find=sb.from('energia').select('id').eq('imovel_id',imovelId).eq('mes',mes);
    if(contractId) find=find.eq('contrato_id',contractId);
    const found=await find.maybeSingle(); if(found.error) throw found.error;
    if(found.data) await this.archiveEntity('energia',found.data.id,'Leitura de energia arquivada.');
  },
  async uploadEnergyPhoto(imovelId,mes,blob){
    const uid=await _userId();
    const path=uid+'/'+imovelId+'/energia/'+mes+'-'+_uuid()+'.jpg';
    const up=await sb.storage.from(FILE_BUCKET).upload(path,blob,{contentType:'image/jpeg',upsert:false});
    if(up.error) throw up.error;
    return path;
  },
  async deleteStoragePath(path){
    if(!path) return;
    const result=await sb.storage.from(FILE_BUCKET).remove([path]);
    if(result.error) throw result.error;
  },
  async energyPhotoUrl(path){ return path?signedStorageUrl(path):''; },

  /* Interessados em alugar. */
  async insertInterest(item){
    const uid=await _userId();
    const row={user_id:uid,nome:item.nome,telefone:item.telefone||'',valor_maximo:Number(item.valorMaximo)||0,
      quartos_min:Number(item.quartosMin)||0,banheiros_min:Number(item.banheirosMin)||0,
      precisa_garagem:!!item.precisaGaragem,precisa_quintal:!!item.precisaQuintal,
      precisa_cozinha:!!item.precisaCozinha,precisa_sala:!!item.precisaSala,
      precisa_area_servico:!!item.precisaAreaServico,observacoes:item.observacoes||'',status:item.status||'novo',
      inquilino_id:item.tenantId||null,updated_at:new Date().toISOString()};
    const {data,error}=await sb.from('interessados').insert(row).select().single();
    if(error) throw error; return rowToInterest(data);
  },
  async updateInterest(item){
    const row={nome:item.nome,telefone:item.telefone||'',valor_maximo:Number(item.valorMaximo)||0,
      quartos_min:Number(item.quartosMin)||0,banheiros_min:Number(item.banheirosMin)||0,
      precisa_garagem:!!item.precisaGaragem,precisa_quintal:!!item.precisaQuintal,
      precisa_cozinha:!!item.precisaCozinha,precisa_sala:!!item.precisaSala,
      precisa_area_servico:!!item.precisaAreaServico,observacoes:item.observacoes||'',status:item.status||'novo',
      inquilino_id:item.tenantId||null,updated_at:new Date().toISOString()};
    const {error}=await sb.from('interessados').update(row).eq('id',item.id); if(error) throw error;
  },
  async deleteInterest(id){
    const {error}=await sb.from('interessados').delete().eq('id',id); if(error) throw error;
  },

  /* Despesas */
  async insertExpense(imovelId, e){
    const uid = await _userId();
    const row = { user_id:uid, imovel_id:imovelId, descricao:e.descricao, categoria:e.categoria,
      valor:Number(e.valor)||0, data:e.data||null, prestador:e.prestador||'', status:e.status||'Concluído' };
    const { data, error } = await sb.from('despesas').insert(row).select().single();
    if(error) throw error;
    return data.id;
  },
  async updateExpense(e){
    const { error } = await sb.from('despesas').update({ descricao:e.descricao, categoria:e.categoria,
      valor:Number(e.valor)||0, data:e.data||null, prestador:e.prestador||'', status:e.status||'Concluído' })
      .eq('id', e.id);
    if(error) throw error;
  },
  async deleteExpense(id){
    return this.archiveEntity('despesa',id,'Despesa arquivada.');
  },

  /* Chamados acompanham o serviço; uma despesa é vinculada apenas
     quando a resolução realmente tiver custo. Cancelar preserva o
     histórico pelo status e nunca apaga o chamado. */
  async insertMaintenanceCall(imovelId,item){
    const uid=await _userId();
    const row=maintenanceCallToRow(item,imovelId);
    if(item.id) row.id=item.id;
    row.user_id=uid;
    let res=await sb.from('chamados').insert(row).select().single();
    if(res.error && !_manutencaoCamposOff && _isMissingManutencaoError(res.error)){
      _manutencaoCamposOff=true;
      res=await sb.from('chamados').insert(_semCamposNovosManutencao(row)).select().single();
    }
    if(res.error) throw res.error;
    return rowToMaintenanceCall(res.data);
  },
  async updateMaintenanceCall(item){
    const mapped=maintenanceCallToRow(item,item.houseId);
    const row=Object.assign({},mapped);
    /* imóvel, inquilino e quem abriu não mudam numa edição. */
    delete row.imovel_id; delete row.inquilino_id; delete row.aberto_por;
    let res=await sb.from('chamados').update(row).eq('id',item.id).select().single();
    if(res.error && !_manutencaoCamposOff && _isMissingManutencaoError(res.error)){
      _manutencaoCamposOff=true;
      res=await sb.from('chamados').update(_semCamposNovosManutencao(row))
        .eq('id',item.id).select().single();
    }
    if(res.error) throw res.error;
    return rowToMaintenanceCall(res.data);
  },

  async getMaintenanceCall(id){
    const {data,error}=await sb.from('chamados').select('*')
      .eq('id',id).maybeSingle();
    if(error) throw error;
    return data?rowToMaintenanceCall(data):null;
  },

  async resolveMaintenanceCallWithExpense(item,expense){
    const {data,error}=await sb.rpc('resolver_chamado_com_despesa',{
      p_chamado_id:item.id,
      p_resposta:item.resposta||'',
      p_criar_despesa:!!expense,
      p_valor:expense?Number(expense.valor)||0:null,
      p_data:expense?(expense.data||todayISO()):todayISO(),
      p_prestador:expense?(expense.prestador||''):'',
      p_categoria_despesa:expense?(expense.categoria||'Manutenção'):'Manutenção'
    });
    if(error) throw error;
    const result=data||{};
    const [loaded,loadedExpense]=await Promise.all([
      sb.from('chamados').select('*').eq('id',item.id).maybeSingle(),
      result.despesa_id
        ?sb.from('despesas').select('*').eq('id',result.despesa_id).maybeSingle()
        :Promise.resolve({data:null,error:null})
    ]);
    if(loaded.error){
      console.warn('O chamado foi resolvido, mas será recarregado depois.',loaded.error);
    }
    if(loadedExpense.error){
      console.warn('A despesa vinculada será recarregada depois.',loadedExpense.error);
    }
    return {
      call:loaded.data?rowToMaintenanceCall(loaded.data):Object.assign({},item,{
        status:'resolvido',
        despesaId:result.despesa_id||'',
        resolvidoEm:result.resolvido_em||new Date().toISOString()
      }),
      expenseId:result.despesa_id||'',
      expense:loadedExpense.data?rowToExpense(loadedExpense.data):null
    };
  },

  /* Inquilinos */
  async insertTenant(t){
    const uid = await _userId();
    const row = { id:_uuid(),user_id:uid, nome:t.nome, telefone:t.telefone||'', email:t.email||'',
      documento:t.documento||'', emergencia_nome:t.emergenciaNome||'' };
    if(!_inquilinoRgOff) row.rg = String(t.rg||'').slice(0,40);
    let res = await sb.from('inquilinos').insert(row);
    if(res.error && !_inquilinoRgOff && ('rg' in row) && _isMissingRgError(res.error)){
      _inquilinoRgOff=true; delete row.rg;
      res = await sb.from('inquilinos').insert(row);
    }
    if(res.error) throw res.error;
    return rowToTenant(row);
  },
  async updateTenant(t){
    const row = { nome:t.nome, telefone:t.telefone||'',
      email:t.email||'', documento:t.documento||'', emergencia_nome:t.emergenciaNome||'' };
    if(!_inquilinoRgOff) row.rg = String(t.rg||'').slice(0,40);
    let res = await sb.from('inquilinos').update(row).eq('id', t.id);
    if(res.error && !_inquilinoRgOff && ('rg' in row) && _isMissingRgError(res.error)){
      _inquilinoRgOff=true; delete row.rg;
      res = await sb.from('inquilinos').update(row).eq('id', t.id);
    }
    if(res.error) throw res.error;
  },
  async deleteTenant(id){
    return this.archiveTenant(id,'Inquilino arquivado.');
  },
  async previewTenantRemoval(tenantId){
    const {data,error}=await sb.rpc('prever_exclusao_inquilino',{p_inquilino_id:tenantId});
    if(error) throw error;
    return data||{};
  },
  async deleteTenantMistake(tenantId,confirmation){
    const {data,error}=await sb.rpc('excluir_inquilino_por_engano',{
      p_inquilino_id:tenantId,p_confirmacao:confirmation
    });
    if(error) throw error;
    const result=data||{};
    const paths=[].concat(result.documentStoragePaths||result.document_storage_paths||[])
      .concat(result.energyPhotoPaths||result.energy_photo_paths||[]);
    try{await removeStoragePaths(paths);}
    catch(storageError){console.warn('Inquilino excluído; um arquivo antigo não pôde ser removido do armazenamento.',storageError);}
    return result;
  },

  /* Fotos em bucket privado. */
  async addPhotos(imovelId, files, startOrder, vinculo){
    const uid = await _userId();
    const prepared=[],insertedIds=[];
    let rowsInserted=false;
    try{
      for(let i=0;i<files.length;i++){
        const file=files[i];
        const path=uid+'/'+imovelId+'/fotos/'+_uuid()+'-'+safeStorageName(file.nome||'foto.jpg');
        const up=await sb.storage.from(FILE_BUCKET).upload(path,file.blob,{
          contentType:file.mime||'image/jpeg',upsert:false
        });
        if(up.error)throw up.error;
        prepared.push({path:path,file:file,order:(startOrder||0)+i});
      }
      const vinculoChamado=(vinculo&&vinculo.chamadoId&&!_manutencaoCamposOff)
        ? {chamado_id:vinculo.chamadoId,momento:vinculo.momento==='depois'?'depois':'antes'}
        : null;
      const rows=prepared.map(function(item){return Object.assign({
        user_id:uid,imovel_id:imovelId,dados:null,storage_path:item.path,
        nome:item.file.nome||'foto.jpg',mime:item.file.mime||'image/jpeg',
        tamanho:item.file.blob.size||0,ordem:item.order
      },vinculoChamado||{});});
      let ins=await sb.from('fotos').insert(rows).select();
      /* Sem a migração de manutenções, a coluna do chamado não existe:
         a foto entra como foto do imóvel em vez de falhar. */
      if(ins.error&&vinculoChamado&&/chamado_id|momento/i.test(String(ins.error.message||''))){
        _manutencaoCamposOff=true;
        ins=await sb.from('fotos').insert(prepared.map(function(item){return {
          user_id:uid,imovel_id:imovelId,dados:null,storage_path:item.path,
          nome:item.file.nome||'foto.jpg',mime:item.file.mime||'image/jpeg',
          tamanho:item.file.blob.size||0,ordem:item.order
        };})).select();
      }
      if(ins.error)throw ins.error;
      rowsInserted=true;
      (ins.data||[]).forEach(function(row){if(row&&row.id)insertedIds.push(row.id);});
      if(insertedIds.length!==prepared.length){
        throw new Error('O envio das fotos não foi concluído pelo servidor.');
      }
      const byPath={};
      (ins.data||[]).forEach(function(row){byPath[row.storage_path]=row;});
      return await Promise.all(prepared.map(async function(item){
        const row=byPath[item.path];
        if(!row)throw new Error('Uma foto enviada não foi confirmada pelo servidor.');
        return {id:row.id,dados:await signedStorageUrl(item.path),storagePath:item.path,
          nome:row.nome||item.file.nome||'foto.jpg',tamanho:Number(row.tamanho)||item.file.blob.size||0};
      }));
    }catch(error){
      let mayRemoveFiles=!rowsInserted,cleanupError=null;
      if(rowsInserted&&prepared.length){
        const rollback=await sb.from('fotos').delete().eq('imovel_id',imovelId)
          .in('storage_path',prepared.map(function(item){return item.path;}));
        if(rollback.error)cleanupError=rollback.error;
        else mayRemoveFiles=true;
      }
      if(mayRemoveFiles&&prepared.length){
        try{await removeStoragePaths(prepared.map(function(item){return item.path;}));}
        catch(storageError){cleanupError=cleanupError||storageError;}
      }
      if(cleanupError){
        console.error('Falha ao desfazer envio parcial de fotos:',cleanupError);
        const combined=new Error((error&&error.message?error.message:'Não foi possível enviar as fotos.')+
          ' A limpeza automática não foi concluída; atualize a tela antes de tentar novamente.');
        combined.cause=error;
        throw combined;
      }
      throw error;
    }
  },
  async deletePhoto(fotoId){
    const found=await sb.from('fotos').select('storage_path').eq('id',fotoId).maybeSingle();
    if(found.error) throw found.error;
    if(found.data && found.data.storage_path){
      const rem=await sb.storage.from(FILE_BUCKET).remove([found.data.storage_path]);
      if(rem.error) throw rem.error;
    }
    const { error } = await sb.from('fotos').delete().eq('id', fotoId);
    if(error) throw error;
  },

  async addDocument(imovelId,tenantId,file,tipo,visible){
    const uid=await _userId();
    const path=uid+'/'+imovelId+'/documentos/'+_uuid()+'-'+safeStorageName(file.name);
    const up=await sb.storage.from(FILE_BUCKET).upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});
    if(up.error) throw up.error;
    const row={id:_uuid(),user_id:uid,imovel_id:imovelId,
      inquilino_id:tenantId||null,tipo:tipo||'outro',nome:file.name,mime:file.type||'',dados:null,
      storage_path:path,tamanho:file.size||0,visivel_inquilino:!!visible};
    const ins=await sb.from('documentos').insert(row);
    if(ins.error){ await sb.storage.from(FILE_BUCKET).remove([path]); throw ins.error; }
    const doc=rowToDocument(row); doc.url=await signedStorageUrl(path); return doc;
  },
  async updateDocumentVisibility(id,visible){
    const { error }=await sb.from('documentos').update({visivel_inquilino:!!visible}).eq('id',id);
    if(error) throw error;
  },
  async deleteDocument(id){
    const found=await sb.rpc('obter_caminho_documento_operacional',{
      p_documento_id:id
    });
    if(found.error) throw found.error;
    if(found.data){
      const rem=await sb.storage.from(FILE_BUCKET).remove([found.data]);
      if(rem.error) throw rem.error;
    }
    const del=await sb.from('documentos').delete().eq('id',id); if(del.error) throw del.error;
  },

  /* Eventos do calendário (lembretes manuais por dia) */
  async insertEvent(ev){
    const uid = await _userId();
    const { data, error } = await sb.from('eventos').insert({ user_id:uid, data:ev.data, texto:ev.texto||'' }).select().single();
    if(error) throw error;
    return { id:data.id, data:data.data, texto:data.texto||'' };
  },
  async updateEvent(ev){
    const { error } = await sb.from('eventos').update({ data:ev.data, texto:ev.texto||'' }).eq('id', ev.id);
    if(error) throw error;
  },
  async deleteEvent(id){
    const { error } = await sb.from('eventos').delete().eq('id', id);
    if(error) throw error;
  },

  /* Reajustes (histórico do valor do aluguel) */
  async insertReajuste(imovelId, rj){
    const uid = await _userId();
    const firstDay=String(rj.dataInicio||todayISO()).slice(0,7)+'-01';
    const { data, error } = await sb.from('aluguel_historico')
      .insert({
        user_id:uid,imovel_id:imovelId,contrato_id:rj.contractId||null,
        valor:Number(rj.valor)||0,data_inicio:firstDay,
        motivo:String(rj.motivo||'').trim()
      })
      .select().single();
    if(error) throw error;
    return {
      id:data.id,valor:Number(data.valor)||0,dataInicio:data.data_inicio,
      contractId:data.contrato_id||'',motivo:data.motivo||'',
      confirmadoEm:data.confirmado_em||'',confirmadoPor:data.confirmado_por||''
    };
  },
  async updateReajuste(rj){
    const { error } = await sb.from('aluguel_historico')
      .update({
        valor:Number(rj.valor)||0,
        data_inicio:String(rj.dataInicio||todayISO()).slice(0,7)+'-01',
        contrato_id:rj.contractId||null,
        motivo:String(rj.motivo||'').trim()
      }).eq('id', rj.id);
    if(error) throw error;
  },
  async deleteReajuste(id){
    return this.archiveEntity('reajuste',id,'Reajuste arquivado para correção.');
  },

  /* Backups automáticos (retrato dos dados, sem fotos para ficar leve) */
  async makeSnapshot(){
    const uid = await _userId();
    const base = await this.loadAll({includeArchived:true});
    const payload = { version:7, exportId:_uuid(), exportedAt:new Date().toISOString(),
      owners:base.owners||[],
      houses:base.houses, tenants:base.tenants, interests:base.interests||[], config:base.config,
      eventos:base.eventos, photos:{},documents:{} };
    const ins = await sb.from('backups').upsert({ user_id:uid, dados:payload, dia:todayISO(), criado_em:new Date().toISOString() },
      { onConflict:'user_id,dia' });
    if(ins.error) throw ins.error;
    // mantém o histórico do último mês; arquivos ficam no backup baixado.
    const { data } = await sb.from('backups').select('id,criado_em').order('criado_em', {ascending:false});
    if(data && data.length > 30){
      const excedentes = data.slice(30).map(function(b){ return b.id; });
      await sb.from('backups').delete().in('id', excedentes);
    }
  },
  async lastSnapshotDay(){
    const { data } = await sb.from('backups').select('dia').order('dia', {ascending:false}).limit(1);
    return (data && data[0]) ? data[0].dia : null;
  },
  async getBackups(){
    const { data, error } = await sb.from('backups').select('id,criado_em').order('criado_em', {ascending:false});
    if(error) throw error;
    return data || [];
  },
  async getBackup(id){
    const { data, error } = await sb.from('backups').select('dados').eq('id', id).single();
    if(error) throw error;
    return data.dados;
  },

  /* Apaga TODOS os dados do usuário (mantém a conta e o config). */
  async wipeAll(){
    const uid = await _userId();
    const files=await Promise.all([
      sb.from('fotos').select('storage_path').eq('user_id',uid),
      sb.rpc('listar_documentos_backup'),
      sb.from('energia').select('foto_path').eq('user_id',uid)
    ]);
    const fileError=files.find(function(r){return r.error;}); if(fileError)throw fileError.error;
    await removeStoragePaths([].concat(files[0].data||[],files[1].data||[]).map(function(r){return r.storage_path;})
      .concat((files[2].data||[]).map(function(r){return r.foto_path;})));
    // filtro explícito por user_id, além do RLS (segurança dupla)
    // ordem respeita as FKs (filhos antes dos pais)
    for(const t of ['fotos','pagamentos','energia','despesas','historico_status','documentos','contratos','eventos','interessados','imoveis','inquilinos']){
      const { error } = await sb.from(t).delete().eq('user_id', uid);
      if(error) throw error;
    }
  }
};

/* Login real e conta proprietária em que o usuário está trabalhando. */
async function _authUserId(){
  const { data:{ session } } = await sb.auth.getSession();
  return session ? session.user.id : null;
}
async function _userId(){
  return _actingOwnerId || await _authUserId();
}

/* fallback de UUID caso crypto.randomUUID não exista */
function _uuid(){
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){
    const r = Math.random()*16|0, v = c==='x'?r:(r&0x3|0x8); return v.toString(16);
  });
}
