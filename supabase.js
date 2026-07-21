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
    garagem: !!r.garagem,
    quintal: !!r.quintal,
    pocoAgua: !!r.poco_agua,
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
    garagem: !!h.garagem,
    quintal: !!h.quintal,
    poco_agua: !!h.pocoAgua,
    energia_ativa: h.energiaAtiva!==false,
    energia_dia_vencimento: Math.min(31,Math.max(1,parseInt(h.energiaDiaVencimento,10)||5)),
    updated_at: new Date().toISOString()
  };
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
    interessaPoco:!!r.interessa_poco,observacoes:r.observacoes||'',status:r.status||'novo',
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
  const houseRows=[], contractRows=[], pagRows=[], despRows=[], histRows=[], fotoRows=[], reajRows=[], enerRows=[],interestRows=[];
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
      garagem:!!h.garagem,quintal:!!h.quintal,poco_agua:!!h.pocoAgua,
      energia_ativa:h.energiaAtiva!==false,
      energia_dia_vencimento:Math.min(31,Math.max(1,parseInt(h.energiaDiaVencimento,10)||5)) });

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
      fotoRows.push({ imovel_id:houseId, dados:safe, ordem:i });
    });
  });

  const eventRows = eventsIn.map(function(ev){
    return { data:_backupDate(ev.data,'Data do lembrete')||todayISO(), texto:_backupText(ev.texto,500) };
  });
  const allowedInterestStatus=['novo','conversando','visita','quente','fechado','desistiu'];
  interestsIn.forEach(function(item){
    if(!item||!item.nome) throw new Error('Há um cliente quente sem nome no backup.');
    const oldTenant=item.tenantId?_backupId(item.tenantId,'Inquilino convertido'):'';
    interestRows.push({id:_newImportId(),nome:_backupText(item.nome,160),telefone:_backupText(item.telefone,40),
      valor_maximo:_backupNumber(item.valorMaximo,'Valor máximo'),quartos_min:Math.max(0,parseInt(item.quartosMin,10)||0),
      banheiros_min:Math.max(0,parseInt(item.banheirosMin,10)||0),precisa_garagem:!!item.precisaGaragem,
      precisa_quintal:!!item.precisaQuintal,interessa_poco:!!item.interessaPoco,
      observacoes:_backupText(item.observacoes,2000),status:allowedInterestStatus.includes(item.status)?item.status:'novo',
      inquilino_id:oldTenant?(tenantIdMap[oldTenant]||null):null});
  });
  const cfg = data.config && typeof data.config==='object' ? {
    locador_nome:_backupText(data.config.locadorNome,180),
    locador_documento:_backupText(data.config.locadorDocumento,80),
    energia_ativa:data.config.energiaAtiva!==false
  } : null;

  return { tenants:tenantRows, houses:houseRows, contracts:contractRows, payments:pagRows, expenses:despRows,
    history:histRows, photos:fotoRows, adjustments:reajRows, energy:enerRows,
    interests:interestRows,events:eventRows, config:cfg };
}

const db = {
  /* Descobre o perfil antes de carregar qualquer dado da interface. */
  async loadRole(){
    const { data:access, error:accessErr } = await sb.from('acessos_inquilino')
      .select('*').eq('user_id', await _userId()).eq('ativo', true).maybeSingle();
    if(accessErr) throw accessErr;
    if(access) return { role:'tenant', access:access };
    const { data:owner, error:ownerErr } = await sb.from('proprietarios')
      .select('user_id,nome').eq('user_id', await _userId()).maybeSingle();
    if(ownerErr) throw ownerErr;
    return owner ? { role:'owner', owner:owner } : { role:'pending' };
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
      config:cfg.data?{locadorNome:cfg.data.locador_nome||'',locadorDocumento:cfg.data.locador_documento||'',energiaAtiva:cfg.data.energia_ativa!==false}:{locadorNome:'',locadorDocumento:'',energiaAtiva:true},
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

  /* Carrega tudo do usuário logado e monta o estado em memória. */
  async loadAll(){
    const [imoveis, inquilinos, contratos, pagamentos, despesas, historico, cfg, eventos, reajustes, energia, interesses] = await Promise.all([
      sb.from('imoveis').select('*').order('created_at', {ascending:true}),
      sb.from('inquilinos').select('*').order('created_at', {ascending:true}),
      sb.from('contratos').select('*').order('inicio',{ascending:true}),
      sb.from('pagamentos').select('*'),
      sb.from('despesas').select('*'),
      sb.from('historico_status').select('*').order('data', {ascending:true}),
      sb.from('configuracoes').select('*').maybeSingle(),
      sb.from('eventos').select('*').order('data', {ascending:true}),
      sb.from('aluguel_historico').select('*').order('data_inicio', {ascending:true}),
      sb.from('energia').select('*'),
      sb.from('interessados').select('*').order('created_at',{ascending:false})
    ]);
    const firstErr = imoveis.error||inquilinos.error||contratos.error||pagamentos.error||despesas.error||historico.error||eventos.error||reajustes.error||energia.error||interesses.error;
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
    const config = cfg.data
      ? { locadorNome:cfg.data.locador_nome||'', locadorDocumento:cfg.data.locador_documento||'', energiaAtiva:cfg.data.energia_ativa!==false }
      : { locadorNome:'', locadorDocumento:'', energiaAtiva:true };
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
      updated_at: new Date().toISOString()
    });
    if(error) throw error;
  },

  /* Exporta tudo (inclui fotos) para o backup JSON. */
  async exportAll(){
    const base = await this.loadAll();
    const { data: fotos } = await sb.from('fotos').select('*').order('ordem',{ascending:true});
    const photos = {};
    for(const f of (fotos||[])){
      let content=f.dados||'';
      if(!content && f.storage_path){
        const downloaded=await sb.storage.from(FILE_BUCKET).download(f.storage_path);
        if(downloaded.error) throw downloaded.error;
        content=await blobToDataUrl(downloaded.data);
      }
      if(content) (photos[f.imovel_id] = photos[f.imovel_id] || []).push(content);
    }
    return { version:5, exportedAt:new Date().toISOString(),
             houses:base.houses, tenants:base.tenants, interests:base.interests||[], photos:photos,
             config:base.config, eventos:base.eventos||[] };
  },

  /* Importa tudo em uma única transação no PostgreSQL. Se qualquer etapa
     falhar, nenhuma linha é gravada e uma restauração não apaga o estado atual. */
  async importBackup(data, options){
    const payload = normalizeBackupForImport(data);
    const { error } = await sb.rpc('importar_backup_atomico_v5', {
      p_payload: payload,
      p_substituir: !!(options && options.replace)
    });
    if(error) throw error;
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

  /* Clientes quentes / interessados. */
  async insertInterest(item){
    const uid=await _userId();
    const row={user_id:uid,nome:item.nome,telefone:item.telefone||'',valor_maximo:Number(item.valorMaximo)||0,
      quartos_min:Number(item.quartosMin)||0,banheiros_min:Number(item.banheirosMin)||0,
      precisa_garagem:!!item.precisaGaragem,precisa_quintal:!!item.precisaQuintal,
      interessa_poco:!!item.interessaPoco,observacoes:item.observacoes||'',status:item.status||'novo',
      inquilino_id:item.tenantId||null,updated_at:new Date().toISOString()};
    const {data,error}=await sb.from('interessados').insert(row).select().single();
    if(error) throw error; return rowToInterest(data);
  },
  async updateInterest(item){
    const row={nome:item.nome,telefone:item.telefone||'',valor_maximo:Number(item.valorMaximo)||0,
      quartos_min:Number(item.quartosMin)||0,banheiros_min:Number(item.banheirosMin)||0,
      precisa_garagem:!!item.precisaGaragem,precisa_quintal:!!item.precisaQuintal,
      interessa_poco:!!item.interessaPoco,observacoes:item.observacoes||'',status:item.status||'novo',
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
    const payload = { version:5, exportedAt:new Date().toISOString(),
      houses:base.houses, tenants:base.tenants, interests:base.interests||[], config:base.config,
      eventos:base.eventos, photos:{} };
    const ins = await sb.from('backups').upsert({ user_id:uid, dados:payload, dia:todayISO(), criado_em:new Date().toISOString() },
      { onConflict:'user_id,dia' });
    if(ins.error) throw ins.error;
    // mantém apenas os 7 mais recentes
    const { data } = await sb.from('backups').select('id,criado_em').order('criado_em', {ascending:false});
    if(data && data.length > 7){
      const excedentes = data.slice(7).map(function(b){ return b.id; });
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
    // filtro explícito por user_id, além do RLS (segurança dupla)
    // ordem respeita as FKs (filhos antes dos pais)
    for(const t of ['fotos','pagamentos','energia','despesas','historico_status','documentos','contratos','eventos','interessados','imoveis','inquilinos']){
      const { error } = await sb.from(t).delete().eq('user_id', uid);
      if(error) throw error;
    }
  }
};

/* id do usuário logado (getSession é local, não vai à rede) */
async function _userId(){
  const { data:{ session } } = await sb.auth.getSession();
  return session ? session.user.id : null;
}

/* fallback de UUID caso crypto.randomUUID não exista */
function _uuid(){
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){
    const r = Math.random()*16|0, v = c==='x'?r:(r&0x3|0x8); return v.toString(16);
  });
}
