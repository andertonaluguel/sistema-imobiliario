/* ============================================================
   supabase.js — Cliente Supabase + camada de acesso a dados
   Substitui completamente o antigo window.storage.
   Estratégia: o banco é normalizado (tabelas separadas), mas em
   memória montamos o MESMO formato que a interface já usava
   (casa com pagamentos[]/despesas[]/statusHistorico[] embutidos),
   pra reaproveitar toda a lógica de renderização existente.
   ============================================================ */

const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

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
    statusHistorico: [],
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

const db = {
  /* Carrega tudo do usuário logado e monta o estado em memória. */
  async loadAll(){
    const [imoveis, inquilinos, pagamentos, despesas, historico, cfg, eventos, reajustes, energia] = await Promise.all([
      sb.from('imoveis').select('*').order('created_at', {ascending:true}),
      sb.from('inquilinos').select('*').order('created_at', {ascending:true}),
      sb.from('pagamentos').select('*'),
      sb.from('despesas').select('*'),
      sb.from('historico_status').select('*').order('data', {ascending:true}),
      sb.from('configuracoes').select('*').maybeSingle(),
      sb.from('eventos').select('*').order('data', {ascending:true}),
      sb.from('aluguel_historico').select('*').order('data_inicio', {ascending:true}),
      sb.from('energia').select('*')
    ]);
    const firstErr = imoveis.error||inquilinos.error||pagamentos.error||despesas.error||historico.error||eventos.error||reajustes.error||energia.error;
    if(firstErr) throw firstErr;

    const houses = (imoveis.data||[]).map(rowToHouse);
    const byId = {};
    houses.forEach(function(h){ byId[h.id]=h; });

    (pagamentos.data||[]).forEach(function(p){
      const h = byId[p.imovel_id]; if(!h) return;
      h.pagamentos.push({ mes:p.mes, valorPago:Number(p.valor_pago)||0, dataPagamento:p.data_pagamento||'' });
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
      h.energias.push({ mes:en.mes, valor:Number(en.valor)||0, kwh:Number(en.kwh)||0,
                        pago:!!en.pago, dataPagamento:en.data_pagamento||'' });
    });
    // garante pelo menos um ponto de histórico
    houses.forEach(function(h){
      if(!h.statusHistorico.length){
        h.statusHistorico = [{ data:h.contratoInicio||todayISO(), status:h.status, tenantId:h.tenantId||'' }];
      }
    });

    const tenants = (inquilinos.data||[]).map(rowToTenant);
    const config = cfg.data
      ? { locadorNome:cfg.data.locador_nome||'', locadorDocumento:cfg.data.locador_documento||'' }
      : { locadorNome:'', locadorDocumento:'' };
    const evs = (eventos.data||[]).map(function(e){ return { id:e.id, data:e.data, texto:e.texto||'' }; });

    return { houses, tenants, config, eventos: evs };
  },

  /* Fotos de uma casa (carregadas sob demanda). */
  async getPhotos(imovelId){
    const { data, error } = await sb.from('fotos').select('*')
      .eq('imovel_id', imovelId).order('ordem', {ascending:true});
    if(error) throw error;
    return (data||[]).map(function(r){ return { id:r.id, dados:r.dados }; });
  },

  /* Salva configurações do locador (upsert por user_id). */
  async saveConfig(cfg){
    const uid = await _userId();
    const { error } = await sb.from('configuracoes').upsert({
      user_id: uid,
      locador_nome: cfg.locadorNome || '',
      locador_documento: cfg.locadorDocumento || '',
      updated_at: new Date().toISOString()
    });
    if(error) throw error;
  },

  /* Exporta tudo (inclui fotos) para o backup JSON. */
  async exportAll(){
    const base = await this.loadAll();
    const { data: fotos } = await sb.from('fotos').select('*').order('ordem',{ascending:true});
    const photos = {};
    (fotos||[]).forEach(function(f){
      (photos[f.imovel_id] = photos[f.imovel_id] || []).push(f.dados);
    });
    return { version:3, exportedAt:new Date().toISOString(),
             houses:base.houses, tenants:base.tenants, photos:photos,
             config:base.config, eventos:base.eventos||[] };
  },

  /* Importa um backup JSON (do app antigo ou novo), reescrevendo os IDs
     antigos como UUIDs e preservando os vínculos casa <-> inquilino.
     Os inquilinos são SEMPRE inseridos antes dos imóveis (respeita a FK). */
  async importBackup(data){
    const uidUser = await _userId();
    const newId = function(){ return (crypto.randomUUID && crypto.randomUUID()) || _uuid(); };

    // 1) monta inquilinos (cadastro central + eventuais embutidos em casas antigas)
    const tenantIdMap = {};           // id antigo de inquilino -> uuid novo
    const embeddedTenantByHouse = {}; // id antigo da casa -> uuid do inquilino criado
    const tenantRows = [];
    (data.tenants||[]).forEach(function(t){
      const id = newId(); tenantIdMap[t.id] = id;
      tenantRows.push({ id:id, user_id:uidUser, nome:t.nome||'(sem nome)', telefone:t.telefone||'',
        email:t.email||'', documento:t.documento||'', emergencia_nome:t.emergenciaNome||'' });
    });
    (data.houses||[]).forEach(function(h){
      if(!h.tenantId && h.inquilino && h.inquilino.nome){
        const id = newId(); embeddedTenantByHouse[h.id] = id;
        tenantRows.push({ id:id, user_id:uidUser, nome:h.inquilino.nome, telefone:h.inquilino.telefone||'',
          email:h.inquilino.email||'', documento:h.inquilino.documento||'', emergencia_nome:h.inquilino.emergenciaNome||'' });
      }
    });
    if(tenantRows.length){ const r=await sb.from('inquilinos').insert(tenantRows); if(r.error) throw r.error; }

    // 2) imóveis + filhos
    const houseIdMap = {};
    const houseRows=[], pagRows=[], despRows=[], histRows=[], fotoRows=[], reajRows=[], enerRows=[];
    (data.houses||[]).forEach(function(h){
      const id = newId(); houseIdMap[h.id] = id;
      const tId = h.tenantId ? (tenantIdMap[h.tenantId]||null) : (embeddedTenantByHouse[h.id]||null);
      houseRows.push({ id:id, user_id:uidUser, nome:h.nome||'Casa',
        endereco:h.endereco||'', status:h.status||'vaga', aluguel_valor:Number(h.aluguelValor)||0,
        dia_vencimento:h.diaVencimento||5, ultima_vistoria:h.ultimaVistoria||null,
        tenant_id:tId, contrato_inicio:h.contratoInicio||null, contrato_fim:h.contratoFim||null });

      (h.pagamentos||[]).forEach(function(p){
        pagRows.push({ user_id:uidUser, imovel_id:id, mes:p.mes,
          valor_pago:Number(p.valorPago)||0, data_pagamento:p.dataPagamento||null });
      });
      (h.despesas||[]).forEach(function(e){
        despRows.push({ user_id:uidUser, imovel_id:id, descricao:e.descricao||'',
          categoria:e.categoria||'Outro', valor:Number(e.valor)||0, data:e.data||null,
          prestador:e.prestador||'', status:e.status||'Concluído' });
      });
      (h.statusHistorico||[]).forEach(function(s){
        histRows.push({ user_id:uidUser, imovel_id:id, data:s.data,
          status:s.status, tenant_id:s.tenantId?(tenantIdMap[s.tenantId]||null):null });
      });
      (h.aluguelHistorico||[]).forEach(function(rj){
        reajRows.push({ user_id:uidUser, imovel_id:id, valor:Number(rj.valor)||0, data_inicio:rj.dataInicio });
      });
      (h.energias||[]).forEach(function(en){
        enerRows.push({ user_id:uidUser, imovel_id:id, mes:en.mes, valor:Number(en.valor)||0,
          kwh:Number(en.kwh)||0, pago:!!en.pago, data_pagamento:en.dataPagamento||null });
      });
    });

    if(houseRows.length){ const r=await sb.from('imoveis').insert(houseRows); if(r.error) throw r.error; }
    if(pagRows.length){ const r=await sb.from('pagamentos').insert(pagRows); if(r.error) throw r.error; }
    if(despRows.length){ const r=await sb.from('despesas').insert(despRows); if(r.error) throw r.error; }
    if(histRows.length){ const r=await sb.from('historico_status').insert(histRows); if(r.error) throw r.error; }
    if(reajRows.length){ const r=await sb.from('aluguel_historico').insert(reajRows); if(r.error) throw r.error; }
    if(enerRows.length){ const r=await sb.from('energia').insert(enerRows); if(r.error) throw r.error; }

    // 3) fotos (mapa: idAntigoDaCasa -> [base64])
    const photos = data.photos || {};
    Object.keys(photos).forEach(function(oldHouseId){
      const nh = houseIdMap[oldHouseId];
      if(!nh) return;
      (photos[oldHouseId]||[]).forEach(function(dataUrl, i){
        fotoRows.push({ user_id:uidUser, imovel_id:nh, dados:dataUrl, ordem:i });
      });
    });
    if(fotoRows.length){ const r=await sb.from('fotos').insert(fotoRows); if(r.error) throw r.error; }

    // 4) config
    if(data.config){
      await this.saveConfig({ locadorNome:data.config.locadorNome||'',
                              locadorDocumento:data.config.locadorDocumento||'' });
    }

    // 5) eventos do calendário (sem FK com imóvel; ids novos gerados pelo banco)
    if(Array.isArray(data.eventos) && data.eventos.length){
      const evRows = data.eventos.map(function(ev){
        return { user_id:uidUser, data:ev.data, texto:ev.texto||'' };
      });
      const r = await sb.from('eventos').insert(evRows); if(r.error) throw r.error;
    }
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

  /* Pagamentos (um por casa/mês) */
  async upsertPayment(imovelId, p){
    const uid = await _userId();
    const row = { user_id:uid, imovel_id:imovelId, mes:p.mes,
      valor_pago:Number(p.valorPago)||0, data_pagamento:p.dataPagamento||null };
    const { error } = await sb.from('pagamentos').upsert(row, { onConflict:'imovel_id,mes' });
    if(error) throw error;
  },
  async deletePayment(imovelId, mes){
    const { error } = await sb.from('pagamentos').delete().eq('imovel_id', imovelId).eq('mes', mes);
    if(error) throw error;
  },

  /* Energia solar (um registro por casa/mês; valor variável) */
  async upsertEnergia(imovelId, en){
    const uid = await _userId();
    const row = { user_id:uid, imovel_id:imovelId, mes:en.mes,
      valor:Number(en.valor)||0, kwh:Number(en.kwh)||0,
      pago:!!en.pago, data_pagamento:en.dataPagamento||null };
    const { error } = await sb.from('energia').upsert(row, { onConflict:'imovel_id,mes' });
    if(error) throw error;
  },
  async deleteEnergia(imovelId, mes){
    const { error } = await sb.from('energia').delete().eq('imovel_id', imovelId).eq('mes', mes);
    if(error) throw error;
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

  /* Fotos (base64) */
  async addPhotos(imovelId, dataUrls, startOrder){
    const uid = await _userId();
    const rows = dataUrls.map(function(d,i){ return { user_id:uid, imovel_id:imovelId,
      dados:d, ordem:(startOrder||0)+i }; });
    const { data, error } = await sb.from('fotos').insert(rows).select();
    if(error) throw error;
    return (data||[]).map(function(r){ return { id:r.id, dados:r.dados }; });
  },
  async deletePhoto(fotoId){
    const { error } = await sb.from('fotos').delete().eq('id', fotoId);
    if(error) throw error;
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
    const payload = { version:3, exportedAt:new Date().toISOString(),
      houses:base.houses, tenants:base.tenants, config:base.config,
      eventos:base.eventos, photos:{} };
    const ins = await sb.from('backups').insert({ user_id:uid, dados:payload });
    if(ins.error) throw ins.error;
    // mantém apenas os 7 mais recentes
    const { data } = await sb.from('backups').select('id,criado_em').order('criado_em', {ascending:false});
    if(data && data.length > 7){
      const excedentes = data.slice(7).map(function(b){ return b.id; });
      await sb.from('backups').delete().in('id', excedentes);
    }
  },
  async lastSnapshotDate(){
    const { data } = await sb.from('backups').select('criado_em').order('criado_em', {ascending:false}).limit(1);
    return (data && data[0]) ? data[0].criado_em : null;
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
    for(const t of ['fotos','pagamentos','despesas','historico_status','documentos','contratos','eventos','imoveis','inquilinos']){
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
