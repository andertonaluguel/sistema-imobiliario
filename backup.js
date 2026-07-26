/* ============================================================
   backup.js — Exportar / Importar backup (JSON)
   É a ponte de migração: exporte do app antigo e importe aqui.
   ============================================================ */

async function doExportBackup(){
  try{
    const payload = await db.exportAll();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'aluguel-backup-'+todayISO()+'.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    const stamp=await db.markExternalBackup();
    if(state.config) state.config.ultimoBackupExterno=stamp;
    render();
    showToast('Backup exportado.', 'success');
  }catch(e){
    console.error(e);
    showToast('Erro ao exportar backup.', 'error');
  }
}

function triggerImport(){ document.getElementById('importInput').click(); }

function handleImportFile(file){
  if(file.size > 200*1024*1024){
    showToast('O backup é grande demais para importar com segurança.', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e){
    let data;
    try{ data = JSON.parse(e.target.result); }
    catch(err){ showToast('Arquivo inválido.', 'error'); return; }
    try{ normalizeBackupForImport(data); }
    catch(err){ showToast(err.message || 'Backup inválido.', 'error'); return; }
    confirmImport(data);
  };
  reader.onerror = function(){ showToast('Erro ao ler o arquivo.', 'error'); };
  reader.readAsText(file);
}

function confirmImport(data){
  window.__pendingImport = data;
  const nCasas = data.houses.length;
  const nInq = (data.tenants||[]).length;
  const limit=Number((state.commercialAccess||{}).limiteCasas)||1;
  if(state.houses.length+nCasas>limit){
    openModal('<h3 class="modal-title">Backup acima do seu plano</h3><p class="modal-text">A importação deixaria sua conta com '+(state.houses.length+nCasas)+' casas, mas seu plano permite '+limit+'. Exclua casas do arquivo/conta ou solicite outro plano.</p><div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Fechar</button>'+supportContactButton('Solicitar mudança de plano')+'</div>');
    return;
  }
  openModal(
    '<h3 class="modal-title">Importar backup?</h3>'+
    '<p class="modal-text">O arquivo tem <strong>'+nCasas+' casa(s)</strong> e <strong>'+nInq+' inquilino(s)</strong>. '+
    'Eles serão <strong>adicionados</strong> à sua conta. Se você já importou antes, pode acabar duplicando — use "Apagar todos os dados" antes se quiser começar limpo.</p>'+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-primary" onclick="applyImport()">Importar</button>'+
    '</div></div>'
  );
}

async function applyImport(){
  const data = window.__pendingImport;
  if(!data) return;
  closeModal();
  showToast('Importando…', 'success');
  try{
    await db.importBackup(data, { replace:false });
    window.__pendingImport = null;
    await loadData();
    state.view = 'casas';
    render();
    showToast('Backup importado com sucesso.', 'success');
  }catch(e){
    console.error(e);
    showToast('Erro ao importar. Seus dados anteriores foram preservados.', 'error');
  }
}

/* ============================================================
   Backup automático (snapshot diário no Supabase) + restauração
   ============================================================ */

/* Cria um retrato dos dados no máximo 1x por dia (chamado ao abrir o app). */
async function ensureDailySnapshot(){
  try{
    const last = await db.lastSnapshotDay();
    const hoje = todayISO();
    if(!last || String(last) !== hoje){
      await db.makeSnapshot();
    }
  }catch(e){ console.warn('Snapshot diário não foi criado agora:', e); }
}

async function openBackupsModal(){
  openModal('<h3 class="modal-title">Backups automáticos</h3><p class="modal-text">Carregando…</p>');
  let lista;
  try{ lista = await db.getBackups(); }
  catch(e){
    openModal('<h3 class="modal-title">Backups automáticos</h3><p class="modal-text">Não foi possível carregar os backups agora.</p>'+
      '<div class="modal-actions"><span></span><div class="modal-actions-right"><button class="btn btn-ghost" onclick="closeModal()">Fechar</button></div></div>');
    return;
  }
  const rows = lista.length ? lista.map(function(b){
    const dt = new Date(b.criado_em);
    const quando = fmtDateBR(String(b.criado_em).slice(0,10))+' '+String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0');
    return '<div class="ledger-row"><div class="ledger-row-main">'+quando+'</div>'+
      '<button class="btn btn-ghost btn-sm" onclick="confirmRestore(\''+b.id+'\',\''+quando+'\')">Restaurar</button></div>';
  }).join('') : '<div class="empty-state">Ainda não há backups. Eles são criados automaticamente, uma vez por dia, quando você abre o app.</div>';
  openModal(
    '<h3 class="modal-title">Backups automáticos</h3>'+
    '<p class="modal-text">Guardamos os últimos 30 dias. Restaurar substitui os dados atuais pelos do backup escolhido. Fotos e documentos não entram no backup automático; use “Exportar backup” para baixar uma cópia completa.</p>'+ 
    '<div class="ledger">'+rows+'</div>'+
    '<div class="modal-actions"><span></span><div class="modal-actions-right"><button class="btn btn-ghost" onclick="closeModal()">Fechar</button></div></div>'
  );
}

function confirmRestore(id, quando){
  window.__restoreId = id;
  openModal(
    '<h3 class="modal-title">Restaurar backup de '+quando+'?</h3>'+
    '<p class="modal-text">Isso <strong>substitui seus dados atuais</strong> pelos dados desse backup. Fotos e documentos atuais serão removidos porque o backup automático não contém arquivos. Não dá para desfazer.</p>'+ 
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="openBackupsModal()">Voltar</button>'+
      '<button class="btn btn-danger" onclick="doRestore()">Restaurar</button>'+
    '</div></div>'
  );
}
async function doRestore(){
  const id = window.__restoreId;
  if(!id) return;
  closeModal();
  showToast('Restaurando…', 'success');
  try{
    const payload = await db.getBackup(id);
    normalizeBackupForImport(payload);
    await db.importBackup(payload, { replace:true });
    window.__restoreId = null;
    await loadData();
    state.view = 'casas';
    render();
    showToast('Backup restaurado.', 'success');
  }catch(e){ console.error(e); showToast('Erro ao restaurar o backup.', 'error'); }
}
