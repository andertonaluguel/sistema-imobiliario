/* Cache local criptografado pelo navegador não é garantido; por isso esta
   primeira etapa guarda apenas os dados operacionais, sem fotos/documentos.
   O modo offline atual é de consulta e prepara a futura fila de sincronização. */
const offlineCache=(function(){
  const DB_NAME='aluguel-offline-v1',STORE='accounts';
  function open(){return new Promise(function(resolve,reject){
    if(!window.indexedDB){reject(new Error('IndexedDB indisponível'));return;}
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=function(){if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'uid'});};
    req.onsuccess=function(){resolve(req.result);};req.onerror=function(){reject(req.error);};
  });}
  async function put(uid,payload){
    if(!uid)return;const database=await open();
    return new Promise(function(resolve,reject){const tx=database.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put({uid:uid,savedAt:new Date().toISOString(),payload:payload});
      tx.oncomplete=function(){database.close();resolve();};tx.onerror=function(){database.close();reject(tx.error);};});
  }
  async function get(uid){
    if(!uid)return null;const database=await open();
    return new Promise(function(resolve,reject){const tx=database.transaction(STORE,'readonly'),req=tx.objectStore(STORE).get(uid);
      req.onsuccess=function(){database.close();resolve(req.result||null);};req.onerror=function(){database.close();reject(req.error);};});
  }
  async function remove(uid){
    if(!uid)return;const database=await open();
    return new Promise(function(resolve){const tx=database.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(uid);
      tx.oncomplete=function(){database.close();resolve();};tx.onerror=function(){database.close();resolve();};});
  }
  return {save:put,load:get,remove:remove};
})();

function renderOfflineBanner(){
  if(!state.offlineMode)return '';
  const saved=state.offlineSavedAt?new Date(state.offlineSavedAt).toLocaleString('pt-BR'):'seu aparelho';
  return '<div class="offline-banner"><strong>Sem internet — modo de consulta</strong><span>Você está vendo a cópia salva em '+esc(saved)+'. Alterações serão liberadas quando a conexão voltar.</span><button class="btn btn-ghost btn-sm" onclick="retryOnlineLoad()">Tentar novamente</button></div>';
}
async function retryOnlineLoad(){state.loaded=false;state.offlineMode=false;await loadData();}
