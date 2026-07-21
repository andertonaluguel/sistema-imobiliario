/* ============================================================
   documents.js — documentos privados por imóvel.
   PDF/imagens ficam no Storage; a tabela guarda somente metadados.
   ============================================================ */

function documentTypeLabel(tipo){
  return ({contrato:'Contrato',vistoria:'Vistoria',comprovante:'Comprovante',documento:'Documento pessoal',outro:'Outro'})[tipo]||'Arquivo';
}
function formatFileSize(bytes){
  const n=Number(bytes)||0;
  if(n<1024) return n+' B';
  if(n<1024*1024) return (n/1024).toFixed(1).replace('.',',')+' KB';
  return (n/(1024*1024)).toFixed(1).replace('.',',')+' MB';
}
function safePrivateFileUrl(value){
  const src=String(value||'');
  if(/^data:(application\/pdf|image\/(jpeg|png|webp));base64,/i.test(src)) return src;
  try{
    const expected=new URL(CONFIG.SUPABASE_URL), actual=new URL(src);
    return actual.protocol==='https:' && actual.origin===expected.origin ? src : '';
  }catch(e){ return ''; }
}

async function ensureDocumentsLoaded(houseId){
  if(state.documentCache[houseId]!==undefined) return;
  try{ state.documentCache[houseId]=await db.getDocuments(houseId); }
  catch(e){ console.error(e); state.documentCache[houseId]=[]; showToast('Não foi possível carregar os documentos.','error'); }
  render();
}

function openDocumentUploadModal(houseId){
  const h=state.houses.find(function(x){return x.id===houseId;});
  const t=h?tenantOf(h):null;
  openModal(
    '<h3 class="modal-title">Adicionar documento</h3>'+ 
    '<p class="modal-text">Arquivos privados em PDF, JPG, PNG ou WebP, com até 15 MB.</p>'+ 
    '<label class="field"><span>Arquivo</span><input id="f_documento" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"></label>'+ 
    '<label class="field"><span>Categoria</span><select id="f_doc_tipo">'+
      '<option value="contrato">Contrato</option><option value="vistoria">Vistoria</option>'+ 
      '<option value="comprovante">Comprovante</option><option value="documento">Documento pessoal</option>'+ 
      '<option value="outro">Outro</option></select></label>'+ 
    (t?'<label class="field-check"><input id="f_doc_portal" type="checkbox"> Disponibilizar para '+esc(t.nome)+' no portal</label>':'')+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+ 
      '<button class="btn btn-primary" onclick="saveDocumentUpload(\''+houseId+'\')">Enviar arquivo</button>'+ 
    '</div></div>'
  );
}

async function saveDocumentUpload(houseId){
  const input=document.getElementById('f_documento');
  const file=input&&input.files?input.files[0]:null;
  if(!file){ showToast('Escolha um arquivo.','error'); return; }
  if(!/^(application\/pdf|image\/(jpeg|png|webp))$/i.test(file.type||'') || file.size>15*1024*1024){
    showToast('Use PDF, JPG, PNG ou WebP com até 15 MB.','error'); return;
  }
  const h=state.houses.find(function(x){return x.id===houseId;});
  const tipo=document.getElementById('f_doc_tipo').value;
  const visible=!!(document.getElementById('f_doc_portal')||{}).checked;
  try{
    const doc=await db.addDocument(houseId,h&&h.tenantId,file,tipo,visible);
    state.documentCache[houseId]=(state.documentCache[houseId]||[]);
    state.documentCache[houseId].unshift(doc);
    closeModal(); render(); showToast('Documento enviado com segurança.','success');
  }catch(e){ console.error(e); showToast('Não foi possível enviar o documento.','error'); }
}

async function toggleDocumentPortal(houseId,docId,checked){
  try{
    await db.updateDocumentVisibility(docId,checked);
    const d=(state.documentCache[houseId]||[]).find(function(x){return x.id===docId;});
    if(d) d.visivelInquilino=checked;
    showToast(checked?'Documento liberado no portal.':'Documento removido do portal.','success');
  }catch(e){ console.error(e); render(); showToast('Não foi possível alterar o acesso.','error'); }
}

function confirmDeleteDocument(houseId,docId){
  const d=(state.documentCache[houseId]||[]).find(function(x){return x.id===docId;});
  openModal('<h3 class="modal-title">Excluir documento?</h3><p class="modal-text">'+esc(d?d.nome:'Este arquivo')+' será removido definitivamente.</p>'+ 
    '<div class="modal-actions"><span></span><div class="modal-actions-right"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>'+ 
    '<button class="btn btn-danger" onclick="deleteDocumentHandler(\''+houseId+'\',\''+docId+'\')">Excluir</button></div></div>');
}
async function deleteDocumentHandler(houseId,docId){
  try{
    await db.deleteDocument(docId);
    state.documentCache[houseId]=(state.documentCache[houseId]||[]).filter(function(d){return d.id!==docId;});
    closeModal(); render(); showToast('Documento excluído.','success');
  }catch(e){ console.error(e); showToast('Não foi possível excluir.','error'); }
}

function renderDocumentRows(docs,houseId,ownerMode){
  if(!docs.length) return emptyState('Nenhum documento adicionado ainda.',photoIconSvg());
  return '<div class="document-list">'+docs.map(function(d){
    const url=safePrivateFileUrl(d.url||d.dados);
    return '<div class="document-row"><div class="document-icon">'+(d.mime==='application/pdf'?'PDF':'IMG')+'</div>'+ 
      '<div class="document-main"><strong>'+esc(d.nome)+'</strong><span>'+esc(documentTypeLabel(d.tipo))+' · '+formatFileSize(d.tamanho)+'</span></div>'+ 
      (ownerMode?'<label class="doc-portal-toggle"><input type="checkbox" '+(d.visivelInquilino?'checked':'')+' onchange="toggleDocumentPortal(\''+houseId+'\',\''+d.id+'\',this.checked)"><span>No portal</span></label>':'')+
      (url?'<a class="btn btn-ghost btn-sm" href="'+esc(url)+'" target="_blank" rel="noopener" download>Baixar</a>':'')+
      (ownerMode?'<button class="icon-action danger" onclick="confirmDeleteDocument(\''+houseId+'\',\''+d.id+'\')" aria-label="Excluir">×</button>':'')+
    '</div>';
  }).join('')+'</div>';
}

function renderDocumentsTab(h){
  const docs=state.documentCache[h.id];
  if(docs===undefined) return '<div class="empty-state">Carregando documentos…</div>';
  return '<div class="tab-summary-row"><div><strong>'+docs.length+'</strong> arquivo(s) privado(s)</div>'+ 
    '<button class="btn btn-primary btn-sm" onclick="openDocumentUploadModal(\''+h.id+'\')">+ Adicionar documento</button></div>'+ 
    renderDocumentRows(docs,h.id,true);
}
