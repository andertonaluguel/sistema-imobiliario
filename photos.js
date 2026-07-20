/* ============================================================
   photos.js — Fotos da casa (base64 no banco)
   Comprime no cliente antes de salvar. Máximo de 6 por casa.
   photoCache[houseId] = [{id, dados}] | undefined (ainda não carregado)
   ============================================================ */

function compressImage(file, maxWidth, quality){
  return new Promise(function(resolve, reject){
    const reader = new FileReader();
    reader.onload = function(e){
      const img = new Image();
      img.onload = function(){
        let w=img.width, h=img.height;
        if(w>maxWidth){ h=Math.round(h*(maxWidth/w)); w=maxWidth; }
        const canvas = document.createElement('canvas');
        canvas.width=w; canvas.height=h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function ensurePhotosLoaded(houseId){
  if(state.photoCache[houseId] !== undefined) return;
  try{
    state.photoCache[houseId] = await db.getPhotos(houseId);
  }catch(e){
    console.error(e);
    state.photoCache[houseId] = [];
  }
  render();
}

async function handlePhotoFiles(houseId, fileList){
  const current = state.photoCache[houseId] || [];
  if(current.length >= 6){ showToast('Máximo de 6 fotos por casa.', 'error'); return; }
  const files = Array.from(fileList);
  try{
    const compressed = [];
    for(const f of files){
      if(current.length + compressed.length >= 6) break;
      compressed.push(await compressImage(f, 480, 0.6));
    }
    const novas = await db.addPhotos(houseId, compressed, current.length);
    state.photoCache[houseId] = current.concat(novas);
    showToast('Fotos adicionadas.', 'success');
    render();
  }catch(e){
    console.error(e);
    showToast('Erro ao processar as fotos.', 'error');
  }
}

async function deletePhoto(houseId, fotoId){
  try{
    await db.deletePhoto(fotoId);
    state.photoCache[houseId] = (state.photoCache[houseId]||[]).filter(function(p){ return p.id!==fotoId; });
    render();
  }catch(e){ console.error(e); showToast('Erro ao remover foto.', 'error'); }
}

function triggerPhotoUpload(houseId){
  const input = document.getElementById('photoInput');
  input.dataset.houseId = houseId;
  input.click();
}

function renderFotosTab(h){
  const photos = state.photoCache[h.id];
  if(photos===undefined) return '<div class="empty-state">Carregando fotos…</div>';
  return '<div class="tab-summary-row"><div>'+photos.length+' de 6 fotos</div>'+
    '<button class="btn btn-primary btn-sm" '+(photos.length>=6?'disabled':'')+' onclick="triggerPhotoUpload(\''+h.id+'\')">+ Adicionar fotos</button></div>'+
    '<div class="photo-grid">'+(photos.length===0?emptyState('Nenhuma foto adicionada ainda.', photoIconSvg()):photos.map(function(p){
      return '<div class="photo-thumb"><img src="'+p.dados+'" alt="Foto da casa '+esc(h.nome)+'">'+
        '<button class="photo-delete" onclick="deletePhoto(\''+h.id+'\',\''+p.id+'\')" aria-label="Remover foto">×</button></div>';
    }).join(''))+'</div>';
}
