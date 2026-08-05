/* ============================================================
   photos.js — Fotos da casa (armazenamento privado)
   Comprime no cliente antes de enviar. A quantidade depende somente
   do armazenamento disponível no plano da conta.
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
        canvas.toBlob(function(blob){
          if(blob) resolve(blob); else reject(new Error('Não foi possível comprimir a foto.'));
        },'image/jpeg',quality);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function safePhotoSrc(value){
  const src = String(value||'');
  if(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(src)) return src;
  try{
    const expected=new URL(CONFIG.SUPABASE_URL);
    const actual=new URL(src);
    return actual.protocol==='https:' && actual.origin===expected.origin ? src : '';
  }catch(e){ return ''; }
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

async function handlePhotoFiles(houseId, fileList, vinculo){
  if(!requirePropertyPermission())return;
  const current = state.photoCache[houseId] || [];
  const files = Array.from(fileList);
  try{
    const compressed = [];
    let uploadBytes=0;
    for(const f of files){
      if(!/^image\/(jpeg|png|webp)$/i.test(f.type||'') || f.size>15*1024*1024){
        throw new Error('Formato ou tamanho de foto não permitido.');
      }
      const blob=await compressImage(f, 1600, 0.78);
      uploadBytes+=blob.size||0;
      compressed.push({blob:blob,nome:(f.name||'foto').replace(/\.[^.]+$/,'')+'.jpg',mime:'image/jpeg'});
    }
    const access=state.commercialAccess||{};
    const limit=Number(access.limiteArmazenamento)||0;
    const used=Number(access.armazenamentoUsado)||0;
    if(limit>0&&used+uploadBytes>limit){
      throw new Error('Essas fotos ultrapassam o armazenamento disponível no seu plano.');
    }
    const novas = await db.addPhotos(houseId, compressed, current.length, vinculo);
    state.photoCache[houseId] = current.concat(novas);
    const addedBytes=novas.reduce(function(total,item){
      return total+(Number(item.tamanho)||0);
    },0);
    if(state.commercialAccess) state.commercialAccess.armazenamentoUsado=used+addedBytes;
    showToast('Fotos adicionadas.', 'success');
    render();
  }catch(e){
    console.error(e);
    showToast(e&&e.message?e.message:'Erro ao processar as fotos.', 'error');
  }
}

async function deletePhoto(houseId, fotoId){
  if(!requirePropertyPermission())return;
  try{
    const photo=(state.photoCache[houseId]||[]).find(function(item){return item.id===fotoId;});
    await db.deletePhoto(fotoId);
    state.photoCache[houseId] = (state.photoCache[houseId]||[]).filter(function(p){ return p.id!==fotoId; });
    if(state.commercialAccess&&photo&&photo.tamanho){
      state.commercialAccess.armazenamentoUsado=Math.max(0,
        (Number(state.commercialAccess.armazenamentoUsado)||0)-Number(photo.tamanho));
    }
    render();
  }catch(e){ console.error(e); showToast('Erro ao remover foto.', 'error'); }
}

/* chamadoId/momento são opcionais: quando vêm, a foto fica vinculada ao
   chamado de manutenção (antes/depois) além do imóvel. */
function triggerPhotoUpload(houseId, chamadoId, momento){
  if(!requirePropertyPermission())return;
  const input = document.getElementById('photoInput');
  if(!input)return;
  input.dataset.houseId = houseId;
  if(chamadoId){ input.dataset.chamadoId = chamadoId; input.dataset.momento = momento||'antes'; }
  else { delete input.dataset.chamadoId; delete input.dataset.momento; }
  input.click();
}

function renderFotosTab(h){
  const rawPhotos = state.photoCache[h.id];
  if(rawPhotos===undefined) return '<div class="empty-state">Carregando fotos…</div>';
  const photos = rawPhotos.filter(function(p){ return !!safePhotoSrc(p.dados); });
  const access=state.commercialAccess||{},limit=Number(access.limiteArmazenamento)||0,used=Number(access.armazenamentoUsado)||0;
  const storageText=limit>0?' · '+commercialBytes(used)+' de '+commercialBytes(limit)+' usados':'';
  return '<div class="tab-summary-row"><div>'+photos.length+' foto(s)'+storageText+'</div>'+
    (canOperateProperties()?'<button class="btn btn-primary btn-sm" '+(limit>0&&used>=limit?'disabled':'')+' onclick="triggerPhotoUpload(\''+h.id+'\')">+ Adicionar fotos</button>':'')+'</div>'+
    '<div class="photo-grid">'+(photos.length===0?emptyState('Nenhuma foto adicionada ainda.', photoIconSvg()):photos.map(function(p){
      return '<div class="photo-thumb"><img src="'+esc(safePhotoSrc(p.dados))+'" alt="Foto da casa '+esc(h.nome)+'">'+
        (canOperateProperties()?'<button class="photo-delete" onclick="deletePhoto(\''+h.id+'\',\''+p.id+'\')" aria-label="Remover foto">×</button>':'')+'</div>';
    }).join(''))+'</div>';
}
