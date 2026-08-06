/* ============================================================
   backup.js — Exportar / Importar backup (JSON)
   É a ponte de migração: exporte do app antigo e importe aqui.
   ============================================================ */

function requireBackupPermission(){
  const allowed=typeof canAdministerAccount==='function'&&canAdministerAccount();
  if(!allowed&&typeof showToast==='function'){
    showToast('Sua função não permite administrar backups.','error');
  }
  return allowed;
}

async function doExportBackup(){
  if(!requireBackupPermission())return;
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
    showToast('Exportação externa baixada.', 'success');
  }catch(e){
    console.error(e);
    showToast('Erro ao exportar backup.', 'error');
  }
}

function triggerImport(){
  if(!requireBackupPermission())return;
  const input=document.getElementById('importInput');
  if(input)input.click();
}

function handleImportFile(file){
  if(!requireBackupPermission())return;
  if(file.size > 200*1024*1024){
    showToast('A importação pelo navegador aceita arquivos de até 200 MB.', 'error');
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
  if(!requireBackupPermission())return;
  window.__pendingImport = data;
  const nCasas = data.houses.length;
  const nInq = (data.tenants||[]).length;
  const nAnuncios = data.vitrine&&Array.isArray(data.vitrine.imoveis)?data.vitrine.imoveis.length:0;
  const access=state.commercialAccess||{};
  const rawLimit=Number(access.limiteCasas);
  const limit=Number.isFinite(rawLimit)&&rawLimit>=0?rawLimit:1;
  const rawCurrent=Number(access.quantidadeCasas);
  const currentCount=Number.isFinite(rawCurrent)&&rawCurrent>=0
    ?rawCurrent:state.houses.length;
  if(currentCount+nCasas>limit){
    openModal('<h3 class="modal-title">Backup acima do limite atual</h3><p class="modal-text">A importação deixaria sua conta com '+(currentCount+nCasas)+' casas, mas o limite atual é '+limit+'. Para continuar, reduza a quantidade de casas no arquivo ou na conta.</p><div class="modal-actions"><span></span><button class="btn btn-ghost" onclick="closeModal()">Fechar</button></div>');
    return;
  }
  /* Exportações feitas a partir de 31/07/2026 carregam um identificador, e
     o banco recusa a mesma exportação duas vezes. Arquivo antigo não tem
     esse campo: continua sendo aceito, mas sem a proteção — e a tela diz
     isso em vez de prometer o que não pode cumprir. */
  const protegido=!!(data && data.exportId);
  const aviso=protegido
    ? '<p class="modal-text">Se este arquivo já tiver sido importado nesta conta, a operação será recusada — não há como duplicar a carteira sem querer.</p>'
    : '<p class="modal-text"><strong>Atenção:</strong> este arquivo foi gerado por uma versão antiga e não tem identificação. '+
      'Se ele já tiver sido importado aqui, importar de novo <strong>duplica</strong> imóveis, pessoas e lançamentos — e nada vai impedir. Confira antes de continuar.</p>';
  openModal(
    '<h3 class="modal-title">Importar backup?</h3>'+
    '<p class="modal-text">O arquivo tem <strong>'+nCasas+' casa(s)</strong>, <strong>'+nInq+' inquilino(s)</strong> e <strong>'+nAnuncios+' anúncio(s) da Vitrine</strong>. '+
    'Imóveis, pessoas e lançamentos financeiros serão <strong>adicionados</strong>; as configurações da área de aluguéis serão atualizadas com as do arquivo. Não apague os dados atuais apenas para preparar uma importação.</p>'+
    aviso+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+
      '<button class="btn btn-primary" onclick="applyImport()">Importar</button>'+
    '</div></div>'
  );
}

async function applyImport(){
  if(!requireBackupPermission())return;
  const data = window.__pendingImport;
  if(!data) return;
  closeModal();
  showToast('Importando…', 'success');
  let imported=false;
  try{
    await db.importBackup(data, { replace:false });
    imported=true;
    window.__pendingImport = null;
    await loadData();
    state.view = 'casas';
    render();
    showToast('Backup importado com sucesso.', 'success');
  }catch(e){
    console.error(e);
    /* A recusa por arquivo repetido não é um erro do sistema: é a
       proteção funcionando. A mensagem do banco já diz quando o arquivo
       entrou, então ela vai inteira para a tela. */
    const repetido=/ja foi importada|já foi importada/i.test((e&&e.message)||'');
    showToast(
      imported
        ?'O backup foi importado, mas a tela não conseguiu recarregar. Atualize a página antes de tentar novamente.'
        :repetido
          ?(e.message)
          :'Erro ao importar. Seus dados anteriores foram preservados.',
      'error'
    );
  }
}

/* ============================================================
   Backup automático (snapshot diário no Supabase) + restauração
   ============================================================ */

/* Cria um retrato dos dados no máximo 1x por dia (chamado ao abrir o app). */
async function ensureDailySnapshot(){
  if(!requireBackupPermission())return;
  try{
    const last = await db.lastSnapshotDay();
    const hoje = todayISO();
    if(!last || String(last) !== hoje){
      await db.makeSnapshot();
    }
  }catch(e){ console.warn('Snapshot diário não foi criado agora:', e); }
}

function confirmRestore(id, quando){
  if(!requireBackupPermission())return;
  window.__restoreId = id;
  openModal(
    '<h3 class="modal-title">Restaurar backup de '+quando+'?</h3>'+
    '<p class="modal-text">Isso <strong>substitui os dados atuais da área de aluguéis</strong> pelos dados desse retrato. Fotos de imóveis, documentos e fotos de energia atuais serão removidos porque o backup automático não contém arquivos. Se houver estruturas que ele ainda não representa, a operação será bloqueada antes de apagar qualquer dado.</p>'+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="openBackupsModal()">Voltar</button>'+
      '<button class="btn btn-danger" onclick="doRestore()">Restaurar</button>'+
    '</div></div>'
  );
}
async function doRestore(){
  if(!requireBackupPermission())return;
  const id = window.__restoreId;
  if(!id) return;
  closeModal();
  showToast('Restaurando…', 'success');
  let restored=false;
  try{
    const payload = await db.getBackup(id);
    normalizeBackupForImport(payload);
    await db.importBackup(payload, { replace:true });
    restored=true;
    window.__restoreId = null;
    await loadData();
    state.view = 'casas';
    render();
    showToast('Backup restaurado.', 'success');
  }catch(e){
    console.error(e);
    showToast(
      restored
        ?'O backup foi restaurado, mas a tela não conseguiu recarregar. Atualize a página antes de tentar novamente.'
        :((e&&e.message)||'Erro ao restaurar o backup.'),
      'error'
    );
  }
}
