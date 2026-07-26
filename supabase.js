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
    documento:r.documento||'',observacoes:r.observacoes||'',createdAt:r.created_at||''};
}
function rowToVitrineImovel(r){
  return {
    id:r.id,anuncianteId:r.anunciante_id||'',codigo:r.codigo||'',titulo:r.titulo||'',
    tipo:r.tipo||'casa',
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
    status:r.status||'rascunho',destaque:!!r.destaque,
    publicadoEm:r.publicado_em||'',expiraEm:r.expira_em||'',
    visualizacoes:Number(r.visualizacoes)||0,
    contatosWhatsapp:Number(r.contatos_whatsapp)||0,
    contatosFormulario:Number(r.contatos_formulario)||0,
    createdAt:r.created_at||''
  };
}
function vitrineImovelToRow(i){
  return {
    anunciante_id:i.anuncianteId||null,codigo:i.codigo,titulo:i.titulo,tipo:i.tipo||'casa',
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
    updated_at:new Date().toISOString()
  };
}
function rowToVitrineLead(r){
  return {id:r.id,imovelId:r.imovel_id||'',nome:r.nome||'',telefone:r.telefone||'',
    mensagem:r.mensagem||'',origem:r.origem||'formulario',status:r.status||'novo',
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
    endereco: r.endereco || '',
    status: r.status || 'vaga',
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
    statusHistorico: [],
    contracts: [],
    pagamentos: [],
    despesas: [],
    aluguelHistorico: [],
    energias: []
  };
}
function houseToRow(h){
  return {
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
}
function rowToConfig(r){
  r=r||{};
  return {locadorNome:r.locador_nome||'',locadorDocumento:r.locador_documento||'',energiaAtiva:r.energia_ativa!==false,
    tema:normalizeAppTheme(r.tema),onboardingConcluido:!!r.onboarding_concluido,ultimoBackupExterno:r.ultimo_backup_externo||'',
    pixChave:r.pix_chave||'',pixNome:r.pix_nome||'',pixCidade:r.pix_cidade||''};
}
function rowToTenant(r){
  return {
    id: r.id, nome: r.nome,
    telefone: r.telefone || '', email: r.email || '',
    documento: r.documento || '', emergenciaNome: r.emergencia_nome || ''
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

function rowToEnergy(r){
  return {
    id:r.id,mes:r.mes,contractId:r.contrato_id||'',valor:Number(r.valor)||0,kwh:Number(r.kwh)||0,
    leituraAnterior:Number(r.leitura_anterior)||0,leituraAtual:Number(r.leitura_atual)||0,
    tarifaKwh:Number(r.tarifa_kwh)||0,acrescimos:Number(r.acrescimos)||0,
    descontos:Number(r.descontos)||0,ajusteDescricao:r.ajuste_descricao||'',
    valorCalculado:Number(r.valor_calculado)||0,valorManual:!!r.valor_manual,
    vencimento:r.vencimento||'',fotoPath:r.foto_path||'',pago:!!r.pago,
    dataPagamento:r.data_pagamento||''
  };
}

function rowToContract(r){
  return {
    id:r.id, houseId:r.imovel_id||'', tenantId:r.tenant_id||'',
    inicio:r.inicio||'', fim:r.fim||'', valor:Number(r.valor)||0,
    diaVencimento:r.dia_vencimento||5,
    modalidade:r.modalidade_vencimento==='entrada'?'entrada':'fixo',
    ativo:!!r.ativo,
    proporcionalDias:Number(r.proporcional_dias)||0,
    proporcionalValor:Number(r.proporcional_valor)||0,
    proporcionalPago:!!r.proporcional_pago,
    proporcionalDataPagamento:r.proporcional_data_pagamento||''
  };
}

function rowToDocument(r){
  return {
    id:r.id, houseId:r.imovel_id||'', tenantId:r.inquilino_id||'',
    tipo:r.tipo||'outro', nome:r.nome||'Arquivo', mime:r.mime||'',
    tamanho:Number(r.tamanho)||0, storagePath:r.storage_path||'',
    visivelInquilino:!!r.visivel_inquilino, dados:r.dados||'', url:''
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

async function removeStoragePaths(paths){
  const unique=Array.from(new Set((paths||[]).filter(Boolean)));
  for(let i=0;i<unique.length;i+=100){
    const result=await sb.storage.from(FILE_BUCKET).remove(unique.slice(i,i+100));
    if(result.error) throw result.error;
  }
}

async function fetchAllRows(table,orderColumn,ascending){
  const all=[];let from=0;const pageSize=1000;
  while(true){
    let query=sb.from(table).select('*').range(from,from+pageSize-1);
    query=query.order(orderColumn||'id',{ascending:ascending!==false});
    const result=await query;
    if(result.error)return {data:null,error:result.error};
    const page=result.data||[];all.push.apply(all,page);
    if(page.length<pageSize)break;
    from+=pageSize;
  }
  return {data:all,error:null};
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
function _backupNumber(value, label){
  if(value==null || value==='') return 0;
  const n = Number(value);
  if(!Number.isFinite(n) || n < 0) throw new Error((label||'Valor')+' inválido no backup.');
  return Math.round(n*100)/100;
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

function normalizeBackupForImport(data){
  if(!data || typeof data!=='object' || !Array.isArray(data.houses)){
    throw new Error('Esse arquivo não parece ser um backup do Aluguel.');
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

  tenantsIn.forEach(function(t){
    const oldId = _backupId(t && t.id, 'ID do inquilino');
    if(seenTenantIds[oldId]) throw new Error('Há inquilinos duplicados no backup.');
    seenTenantIds[oldId] = true;
    const id = _newImportId(); tenantIdMap[oldId] = id;
    tenantRows.push({ id:id, nome:_backupText(t.nome,160,'(sem nome)')||'(sem nome)',
      telefone:_backupText(t.telefone,40), email:_backupText(t.email,180),
      documento:_backupText(t.documento,80), emergencia_nome:_backupText(t.emergenciaNome,220) });
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
  const houseRows=[], contractRows=[], pagRows=[], despRows=[], histRows=[], fotoRows=[], documentoRows=[], reajRows=[], enerRows=[],interestRows=[];
  const contractIdMap={},contractsByHouse={};
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
    houseRows.push({ id:id, nome:_backupText(h.nome,160,'Casa')||'Casa', endereco:_backupText(h.endereco,400),
      status:status, aluguel_valor:_backupNumber(h.aluguelValor,'Aluguel'), dia_vencimento:dueDay,
      ultima_vistoria:_backupDate(h.ultimaVistoria,'Última vistoria'), tenant_id:tenantId||null,
      contrato_inicio:contratoInicio, contrato_fim:contratoFim,
      quartos:Math.max(0,parseInt(h.quartos,10)||0),banheiros:Math.max(0,parseInt(h.banheiros,10)||0),
      cozinha:!!h.cozinha,sala:!!h.sala,garagem:!!h.garagem,quintal:!!h.quintal,
      area_servico:!!h.areaServico,
      energia_ativa:h.energiaAtiva!==false,
      energia_dia_vencimento:Math.min(31,Math.max(1,parseInt(h.energiaDiaVencimento,10)||5)),
      publicado:!!h.publicado,descricao_publica:_backupText(h.descricaoPublica,3000) });

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
      const cRow={id:newContractId,imovel_id:id,tenant_id:newContractTenant,inicio:cInicio,fim:cFim,
        valor:_backupNumber(c.valor==null?h.aluguelValor:c.valor,'Valor do contrato'),dia_vencimento:cDia,
        modalidade_vencimento:modalidade,ativo:!!c.ativo,
        proporcional_dias:Math.max(0,Number(c.proporcionalDias)||0),
        proporcional_valor:_backupNumber(c.proporcionalValor,'Ajuste inicial'),
        proporcional_pago:!!c.proporcionalPago,
        proporcional_data_pagamento:c.proporcionalPago?_backupDate(c.proporcionalDataPagamento,'Pagamento do ajuste inicial'):null};
      contractRows.push(cRow);contractsByHouse[oldId].push({oldId:oldContractId,newId:newContractId,inicio:cInicio,fim:cFim});
    });

    function importedContractForMovement(rec){
      if(rec&&rec.contractId&&contractIdMap[String(rec.contractId)]) return contractIdMap[String(rec.contractId)];
      const mes=String(rec&&rec.mes||'');
      const candidates=(contractsByHouse[oldId]||[]).filter(function(c){return mes>=c.inicio.slice(0,7)&&(!c.fim||mes<=c.fim.slice(0,7));})
        .sort(function(a,b){return b.inicio.localeCompare(a.inicio);});
      return candidates.length?candidates[0].newId:null;
    }

    const seenMonths = {};
    (Array.isArray(h.pagamentos)?h.pagamentos:[]).forEach(function(p){
      const mes = _backupMonth(p.mes);
      const movementContract=importedContractForMovement(p),key=(movementContract||'legacy')+'-'+mes;
      if(seenMonths[key]) throw new Error('Há pagamentos duplicados para o mesmo contrato e mês.');
      seenMonths[key] = true;
      pagRows.push({ imovel_id:id,contrato_id:movementContract,mes:mes, valor_pago:_backupNumber(p.valorPago,'Pagamento'),
        data_pagamento:_backupDate(p.dataPagamento,'Data do pagamento') });
    });
    (Array.isArray(h.despesas)?h.despesas:[]).forEach(function(e){
      const categoria = allowedCategories.includes(e.categoria) ? e.categoria : 'Outro';
      const despStatus = allowedExpenseStatus.includes(e.status) ? e.status : 'Concluído';
      despRows.push({ imovel_id:id, descricao:_backupText(e.descricao,300,'Despesa')||'Despesa',
        categoria:categoria, valor:_backupNumber(e.valor,'Despesa'), data:_backupDate(e.data,'Data da despesa'),
        prestador:_backupText(e.prestador,180), status:despStatus });
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
      reajRows.push({ imovel_id:id, valor:_backupNumber(rj.valor,'Reajuste'),
        data_inicio:_backupDate(rj.dataInicio,'Data do reajuste')||todayISO() });
    });
    const seenEnergyMonths = {};
    (Array.isArray(h.energias)?h.energias:[]).forEach(function(en){
      const mes = _backupMonth(en.mes);
      const movementContract=importedContractForMovement(en),key=(movementContract||'legacy')+'-'+mes;
      if(seenEnergyMonths[key]) throw new Error('Há registros de energia duplicados para o mesmo contrato e mês.');
      seenEnergyMonths[key] = true;
      enerRows.push({ imovel_id:id,contrato_id:movementContract, mes:mes, valor:_backupNumber(en.valor,'Energia'),
        kwh:_backupNumber(en.kwh,'Consumo de energia'),
        leitura_anterior:_backupNumber(en.leituraAnterior,'Leitura anterior'),leitura_atual:_backupNumber(en.leituraAtual,'Leitura atual'),
        tarifa_kwh:_backupNumber(en.tarifaKwh,'Tarifa de energia'),acrescimos:_backupNumber(en.acrescimos,'Acréscimos de energia'),
        descontos:_backupNumber(en.descontos,'Descontos de energia'),ajuste_descricao:_backupText(en.ajusteDescricao,300),
        valor_calculado:_backupNumber(en.valorCalculado,'Valor calculado de energia'),valor_manual:!!en.valorManual,
        vencimento:_backupDate(en.vencimento,'Vencimento da energia'),pago:!!en.pago,
        data_pagamento:en.pago?_backupDate(en.dataPagamento,'Data do pagamento da energia'):null });
    });
  });

  if(pagRows.length>50000 || despRows.length>50000 || histRows.length>50000 || reajRows.length>50000 || enerRows.length>50000){
    throw new Error('O backup ultrapassa o limite seguro de movimentações.');
  }

  const photos = data.photos && typeof data.photos==='object' ? data.photos : {};
  Object.keys(photos).forEach(function(oldHouseId){
    const houseId = houseIdMap[String(oldHouseId)];
    if(!houseId) return;
    const list = Array.isArray(photos[oldHouseId]) ? photos[oldHouseId].slice(0,6) : [];
    list.forEach(function(dataUrl, i){
      const safe = String(dataUrl||'');
      if(safe.length>2500000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(safe)){
        throw new Error('O backup contém uma foto inválida ou grande demais.');
      }
      const encoded=safe.split(',')[1]||'';
      fotoRows.push({ imovel_id:houseId, dados:safe, ordem:i,nome:'foto-'+(i+1)+'.jpg',
        mime:(safe.match(/^data:([^;]+)/i)||[])[1]||'image/jpeg',tamanho:Math.floor(encoded.length*3/4) });
    });
  });

  const documents = data.documents && typeof data.documents==='object' ? data.documents : {};
  Object.keys(documents).forEach(function(oldHouseId){
    const houseId=houseIdMap[String(oldHouseId)]; if(!houseId)return;
    const list=Array.isArray(documents[oldHouseId])?documents[oldHouseId].slice(0,100):[];
    list.forEach(function(doc){
      const content=String(doc&&doc.dados||'');
      if(content.length>22000000 || !/^data:(application\/pdf|image\/(jpeg|png|webp));base64,[A-Za-z0-9+/=]+$/i.test(content)){
        throw new Error('O backup contém um documento inválido ou grande demais.');
      }
      const encoded=content.split(',')[1]||'',actualSize=Math.floor(encoded.length*3/4);
      const oldTenant=doc.tenantId?_backupId(doc.tenantId,'Inquilino do documento'):'';
      documentoRows.push({imovel_id:houseId,inquilino_id:oldTenant?(tenantIdMap[oldTenant]||null):null,
        tipo:_backupText(doc.tipo,40,'outro')||'outro',nome:_backupText(doc.nome,240,'Arquivo')||'Arquivo',
        mime:_backupText(doc.mime,100),tamanho:actualSize,
        visivel_inquilino:!!doc.visivelInquilino,dados:content});
    });
  });

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

  return { tenants:tenantRows, houses:houseRows, contracts:contractRows, payments:pagRows, expenses:despRows,
    history:histRows, photos:fotoRows, documents:documentoRows, adjustments:reajRows, energy:enerRows,
    interests:interestRows,events:eventRows, config:cfg };
}

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
      const ownerResult=await sb.from('proprietarios')
        .select('user_id,nome,email,slug_publico,nome_publico,contato_publico')
        .eq('user_id',workingOwnerId).maybeSingle();
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
      sb.from('proprietarios')
        .select('user_id,nome,email,slug_publico,nome_publico,contato_publico').eq('user_id',uid).maybeSingle()
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
      const ownerResult=await sb.from('proprietarios')
        .select('user_id,nome,email,slug_publico,nome_publico,contato_publico').eq('user_id',staff.proprietario_id).maybeSingle();
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
    const [imoveis, inquilinos, contratos, pagamentos, energia, cfg, documentos] = await Promise.all([
      sb.from('imoveis').select('*').order('created_at',{ascending:true}),
      sb.from('inquilinos').select('*').eq('id',access.inquilino_id),
      sb.from('contratos').select('*').eq('tenant_id',access.inquilino_id).order('inicio',{ascending:false}),
      sb.from('pagamentos').select('*').order('mes',{ascending:false}),
      sb.from('energia').select('*').order('mes',{ascending:false}),
      sb.from('configuracoes').select('*').eq('user_id',access.proprietario_id).maybeSingle(),
      sb.from('documentos').select('*').eq('visivel_inquilino',true).order('created_at',{ascending:false})
    ]);
    const err=imoveis.error||inquilinos.error||contratos.error||pagamentos.error||energia.error||cfg.error||documentos.error;
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
    const {data,error}=await sb.rpc('listar_colaboradores');
    if(error) throw error;
    return (data||[]).map(function(item){return {conviteId:item.convite_id||'',userId:item.user_id||'',
      nome:item.nome||'',email:item.email||'',ativo:!!item.ativo,aceito:!!item.aceito,status:item.status||'pendente',
      createdAt:item.created_at||''};});
  },

  async inviteTeamMember(nome,email){
    const {data,error}=await sb.rpc('criar_convite_colaborador',{p_nome:nome,p_email:email});
    if(error) throw error;
    return data||{};
  },

  async updateTeamMember(userId,active){
    const {error}=await sb.rpc('atualizar_colaborador',{p_user_id:userId,p_ativo:!!active});
    if(error) throw error;
  },

  async cancelTeamInvite(inviteId){
    const {error}=await sb.rpc('cancelar_convite_colaborador',{p_convite_id:inviteId});
    if(error) throw error;
  },

  async savePublicProfile(profile){
    const {error}=await sb.rpc('salvar_perfil_publico',{p_slug:profile.slug||'',p_nome:profile.nome||'',p_contato:profile.contato||''});
    if(error) throw error;
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
    const [anunciantes,imoveis,leads,taxas]=await Promise.all([
      sb.from('vitrine_anunciantes').select('*').order('nome'),
      sb.from('vitrine_imoveis').select('*').order('created_at',{ascending:false}),
      sb.from('vitrine_leads').select('*').order('created_at',{ascending:false}).limit(300),
      sb.from('vitrine_taxas').select('*').order('periodo_fim',{ascending:false})
    ]);
    if(anunciantes.error) throw anunciantes.error;
    if(imoveis.error) throw imoveis.error;
    if(leads.error) throw leads.error;
    if(taxas.error) throw taxas.error;
    return {
      anunciantes:(anunciantes.data||[]).map(rowToVitrineAnunciante),
      imoveis:(imoveis.data||[]).map(rowToVitrineImovel),
      leads:(leads.data||[]).map(rowToVitrineLead),
      taxas:(taxas.data||[]).map(rowToVitrineTaxa)
    };
  },

  async saveVitrineAnunciante(item){
    const payload={nome:item.nome,telefone:item.telefone||'',email:item.email||'',
      documento:item.documento||'',observacoes:item.observacoes||'',updated_at:new Date().toISOString()};
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
    const query=item.id
      ? sb.from('vitrine_imoveis').update(payload).eq('id',item.id).select().single()
      : sb.from('vitrine_imoveis').insert(payload).select().single();
    const {data,error}=await query;
    if(error) throw error;
    return rowToVitrineImovel(data);
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
      const path=uid+'/vitrine/'+imovelId+'/'+_uuid()+'-'+safeStorageName(file.nome||'foto.jpg');
      const up=await sb.storage.from(FILE_BUCKET).upload(path,file.blob,
        {contentType:file.mime||'image/jpeg',upsert:false});
      if(up.error) throw up.error;
      const ins=await sb.from('vitrine_fotos').insert({imovel_id:imovelId,storage_path:path,
        ordem:(startOrder||0)+i,legenda:'',bytes:file.blob.size||0}).select().single();
      if(ins.error){ await sb.storage.from(FILE_BUCKET).remove([path]); throw ins.error; }
      added.push({id:ins.data.id,storagePath:path,ordem:ins.data.ordem,legenda:'',
        url:await signedStorageUrl(path)});
    }
    return added;
  },
  async deleteVitrineFoto(fotoId){
    const found=await sb.from('vitrine_fotos').select('storage_path').eq('id',fotoId).maybeSingle();
    if(found.error) throw found.error;
    if(found.data&&found.data.storage_path){
      const rem=await sb.storage.from(FILE_BUCKET).remove([found.data.storage_path]);
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
      i.fotoUrls=(await Promise.all(paths.map(function(p){
        return signedStorageUrl(p).catch(function(){return '';});
      }))).filter(Boolean);
    }));
    return result;
  },
  async registrarVitrineVisita(imovelId,tipo){
    try{ await sb.rpc('vitrine_registrar_visita',{p_imovel_id:imovelId,p_tipo:tipo||'visualizacao'}); }
    catch(e){ console.warn('Contador não registrado:',e&&e.message); }
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
      p_membro_id:item.memberId,p_data:item.date||todayISO(),p_descricao:item.description||'',p_id:null
    });
    if(error) throw error;
    return data||{};
  },

  async updateMyHomeTransaction(id,item){
    const {data,error}=await sb.rpc('minha_casa_salvar_lancamento',{
      p_tipo:item.type,p_valor:Number(item.amount)||0,p_categoria_id:item.categoryId,
      p_membro_id:item.memberId,p_data:item.date||todayISO(),p_descricao:item.description||'',p_id:id
    });
    if(error) throw error;
    return data||{};
  },

  async deleteMyHomeTransaction(id){
    const {data,error}=await sb.rpc('minha_casa_excluir_lancamento',{p_id:id});
    if(error) throw error;
    return data||{};
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
  async loadAll(){
    const [imoveis, inquilinos, contratos, pagamentos, despesas, historico, cfg, eventos, reajustes, energia, interesses] = await Promise.all([
      fetchAllRows('imoveis','created_at',true),
      fetchAllRows('inquilinos','created_at',true),
      fetchAllRows('contratos','inicio',true),
      fetchAllRows('pagamentos'),
      fetchAllRows('despesas'),
      fetchAllRows('historico_status','data',true),
      sb.from('configuracoes').select('*').maybeSingle(),
      fetchAllRows('eventos','data',true),
      fetchAllRows('aluguel_historico','data_inicio',true),
      fetchAllRows('energia'),
      fetchAllRows('interessados','created_at',false)
    ]);
    const firstErr = imoveis.error||inquilinos.error||contratos.error||pagamentos.error||despesas.error||historico.error||cfg.error||eventos.error||reajustes.error||energia.error||interesses.error;
    if(firstErr) throw firstErr;

    const houses = (imoveis.data||[]).map(rowToHouse);
    const byId = {};
    houses.forEach(function(h){ byId[h.id]=h; });

    (contratos.data||[]).forEach(function(c){
      const h=byId[c.imovel_id]; if(h) h.contracts.push(rowToContract(c));
    });

    (pagamentos.data||[]).forEach(function(p){
      const h = byId[p.imovel_id]; if(!h) return;
      h.pagamentos.push({ id:p.id, mes:p.mes, contractId:p.contrato_id||'', valorPago:Number(p.valor_pago)||0, dataPagamento:p.data_pagamento||'' });
    });
    (despesas.data||[]).forEach(function(e){
      const h = byId[e.imovel_id]; if(!h) return;
      h.despesas.push({ id:e.id, descricao:e.descricao, categoria:e.categoria, valor:Number(e.valor)||0,
                        data:e.data||'', prestador:e.prestador||'', status:e.status||'Concluído' });
    });
    (historico.data||[]).forEach(function(s){
      const h = byId[s.imovel_id]; if(!h) return;
      h.statusHistorico.push({ data:s.data, status:s.status, tenantId:s.tenant_id||'' });
    });
    (reajustes.data||[]).forEach(function(r){
      const h = byId[r.imovel_id]; if(!h) return;
      h.aluguelHistorico.push({ id:r.id, valor:Number(r.valor)||0, dataInicio:r.data_inicio });
    });
    (energia.data||[]).forEach(function(en){
      const h = byId[en.imovel_id]; if(!h) return;
      h.energias.push(rowToEnergy(en));
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

    return { houses, tenants, interests:(interesses.data||[]).map(rowToInterest), config, eventos: evs };
  },

  /* Fotos de uma casa (carregadas sob demanda). */
  async getPhotos(imovelId){
    const { data, error } = await sb.from('fotos').select('*')
      .eq('imovel_id', imovelId).order('ordem', {ascending:true});
    if(error) throw error;
    const photos=(data||[]).map(function(r){ return { id:r.id, dados:r.dados||'', storagePath:r.storage_path||'', nome:r.nome||'' }; });
    await Promise.all(photos.map(async function(p){ if(p.storagePath) p.dados=await signedStorageUrl(p.storagePath); }));
    return photos;
  },

  async getDocuments(imovelId){
    const { data, error } = await sb.from('documentos').select('*')
      .eq('imovel_id',imovelId).order('created_at',{ascending:false});
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

  /* Exporta tudo, incluindo fotos e documentos privados. */
  async exportAll(){
    const base = await this.loadAll();
    const results=await Promise.all([
      fetchAllRows('fotos','ordem',true),
      fetchAllRows('documentos','created_at',true)
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
    return { version:6, exportedAt:new Date().toISOString(),
             houses:base.houses, tenants:base.tenants, interests:base.interests||[], photos:photos,
             documents:documents,config:base.config, eventos:base.eventos||[] };
  },

  /* Importa tudo em uma única transação no PostgreSQL. Se qualquer etapa
     falhar, nenhuma linha é gravada e uma restauração não apaga o estado atual. */
  async importBackup(data, options){
    const payload = normalizeBackupForImport(data);
    let oldPaths=[];
    if(options&&options.replace){
      const current=await Promise.all([
        sb.from('fotos').select('storage_path'),sb.from('documentos').select('storage_path'),sb.from('energia').select('foto_path')
      ]);
      const currentError=current.find(function(r){return r.error;});if(currentError)throw currentError.error;
      oldPaths=[].concat(current[0].data||[],current[1].data||[]).map(function(r){return r.storage_path;})
        .concat((current[2].data||[]).map(function(r){return r.foto_path;}));
    }
    const { error } = await sb.rpc('importar_backup_atomico_v6', {
      p_payload: payload,
      p_substituir: !!(options && options.replace)
    });
    if(error) throw error;
    if(oldPaths.length) await removeStoragePaths(oldPaths);
  },

  async markExternalBackup(){
    const uid=await _userId(),stamp=new Date().toISOString();
    const {error}=await sb.from('configuracoes').upsert({user_id:uid,ultimo_backup_externo:stamp,updated_at:stamp});
    if(error) throw error;
    return stamp;
  },

  /* ---------------- ESCRITAS ---------------- */

  /* Casas */
  async insertHouse(h){
    const uid = await _userId();
    const row = houseToRow(h); row.user_id = uid;
    const { data, error } = await sb.from('imoveis').insert(row).select().single();
    if(error) throw error;
    const novo = rowToHouse(data);
    const ini = { data: novo.contratoInicio||todayISO(), status:novo.status, tenantId:novo.tenantId||'' };
    novo.statusHistorico = [ini];
    await sb.from('historico_status').insert({ user_id:uid, imovel_id:novo.id,
      data:ini.data, status:ini.status, tenant_id:ini.tenantId||null });
    return novo;
  },
  async updateHouse(h){
    const { error } = await sb.from('imoveis').update(houseToRow(h)).eq('id', h.id);
    if(error) throw error;
  },
  async deleteHouse(id){
    const files=await Promise.all([
      sb.from('fotos').select('storage_path').eq('imovel_id',id),
      sb.from('documentos').select('storage_path').eq('imovel_id',id),
      sb.from('energia').select('foto_path').eq('imovel_id',id)
    ]);
    const fileError=files.find(function(r){return r.error;}); if(fileError)throw fileError.error;
    await removeStoragePaths([].concat(files[0].data||[],files[1].data||[]).map(function(r){return r.storage_path;})
      .concat((files[2].data||[]).map(function(r){return r.foto_path;})));
    const { error } = await sb.from('imoveis').delete().eq('id', id); // cascata apaga filhos
    if(error) throw error;
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
      contrato_id:p.contractId||null,valor_pago:Number(p.valorPago)||0, data_pagamento:p.dataPagamento||null };
    const { error } = await sb.from('pagamentos').upsert(row, { onConflict:'contrato_id,mes' });
    if(error) throw error;
  },
  async deletePayment(imovelId, mes,contractId){
    let q=sb.from('pagamentos').delete().eq('imovel_id', imovelId).eq('mes', mes);
    if(contractId) q=q.eq('contrato_id',contractId);
    const { error } = await q;
    if(error) throw error;
  },

  /* Energia (um registro por casa/mês; leituras, cálculo e recebimento). */
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
      pago:!!en.pago, data_pagamento:en.dataPagamento||null };
    const { error } = await sb.from('energia').upsert(row, { onConflict:'contrato_id,mes' });
    if(error) throw error;
  },
  async deleteEnergia(imovelId, mes,contractId){
    let find=sb.from('energia').select('foto_path').eq('imovel_id',imovelId).eq('mes',mes);
    if(contractId) find=find.eq('contrato_id',contractId);
    const found=await find.maybeSingle(); if(found.error) throw found.error;
    let q=sb.from('energia').delete().eq('imovel_id', imovelId).eq('mes', mes);
    if(contractId) q=q.eq('contrato_id',contractId);
    const { error } = await q;
    if(error) throw error;
    if(found.data&&found.data.foto_path) await sb.storage.from(FILE_BUCKET).remove([found.data.foto_path]);
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
    const { error } = await sb.from('despesas').delete().eq('id', id);
    if(error) throw error;
  },

  /* Inquilinos */
  async insertTenant(t){
    const uid = await _userId();
    const row = { user_id:uid, nome:t.nome, telefone:t.telefone||'', email:t.email||'',
      documento:t.documento||'', emergencia_nome:t.emergenciaNome||'' };
    const { data, error } = await sb.from('inquilinos').insert(row).select().single();
    if(error) throw error;
    return rowToTenant(data);
  },
  async updateTenant(t){
    const { error } = await sb.from('inquilinos').update({ nome:t.nome, telefone:t.telefone||'',
      email:t.email||'', documento:t.documento||'', emergencia_nome:t.emergenciaNome||'' }).eq('id', t.id);
    if(error) throw error;
  },
  async deleteTenant(id){
    const { error } = await sb.from('inquilinos').delete().eq('id', id);
    if(error) throw error;
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
  async addPhotos(imovelId, files, startOrder){
    const uid = await _userId();
    const added=[];
    for(let i=0;i<files.length;i++){
      const file=files[i];
      const path=uid+'/'+imovelId+'/fotos/'+_uuid()+'-'+safeStorageName(file.nome||'foto.jpg');
      const up=await sb.storage.from(FILE_BUCKET).upload(path,file.blob,{contentType:file.mime||'image/jpeg',upsert:false});
      if(up.error) throw up.error;
      const ins=await sb.from('fotos').insert({user_id:uid,imovel_id:imovelId,dados:null,
        storage_path:path,nome:file.nome||'foto.jpg',mime:file.mime||'image/jpeg',tamanho:file.blob.size||0,
        ordem:(startOrder||0)+i}).select().single();
      if(ins.error){ await sb.storage.from(FILE_BUCKET).remove([path]); throw ins.error; }
      added.push({id:ins.data.id,dados:await signedStorageUrl(path),storagePath:path,nome:file.nome||'foto.jpg'});
    }
    return added;
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
    const ins=await sb.from('documentos').insert({user_id:uid,imovel_id:imovelId,
      inquilino_id:tenantId||null,tipo:tipo||'outro',nome:file.name,mime:file.type||'',dados:null,
      storage_path:path,tamanho:file.size||0,visivel_inquilino:!!visible}).select().single();
    if(ins.error){ await sb.storage.from(FILE_BUCKET).remove([path]); throw ins.error; }
    const doc=rowToDocument(ins.data); doc.url=await signedStorageUrl(path); return doc;
  },
  async updateDocumentVisibility(id,visible){
    const { error }=await sb.from('documentos').update({visivel_inquilino:!!visible}).eq('id',id);
    if(error) throw error;
  },
  async deleteDocument(id){
    const found=await sb.from('documentos').select('storage_path').eq('id',id).maybeSingle();
    if(found.error) throw found.error;
    if(found.data && found.data.storage_path){
      const rem=await sb.storage.from(FILE_BUCKET).remove([found.data.storage_path]);
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
    const { data, error } = await sb.from('aluguel_historico')
      .insert({ user_id:uid, imovel_id:imovelId, valor:Number(rj.valor)||0, data_inicio:rj.dataInicio })
      .select().single();
    if(error) throw error;
    return { id:data.id, valor:Number(data.valor)||0, dataInicio:data.data_inicio };
  },
  async updateReajuste(rj){
    const { error } = await sb.from('aluguel_historico')
      .update({ valor:Number(rj.valor)||0, data_inicio:rj.dataInicio }).eq('id', rj.id);
    if(error) throw error;
  },
  async deleteReajuste(id){
    const { error } = await sb.from('aluguel_historico').delete().eq('id', id);
    if(error) throw error;
  },

  /* Backups automáticos (retrato dos dados, sem fotos para ficar leve) */
  async makeSnapshot(){
    const uid = await _userId();
    const base = await this.loadAll();
    const payload = { version:6, exportedAt:new Date().toISOString(),
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
      sb.from('documentos').select('storage_path').eq('user_id',uid),
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
