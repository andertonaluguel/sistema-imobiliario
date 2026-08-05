/* Recursos comerciais que funcionam sem servico pago adicional:
   equipe, catalogo publico, PIX Copia e Cola e atalhos do WhatsApp. */

function copyTextValue(value,successMessage){
  value=String(value||'');
  if(navigator.clipboard&&window.isSecureContext){
    return navigator.clipboard.writeText(value).then(function(){showToast(successMessage||'Copiado.','success');});
  }
  const area=document.createElement('textarea');area.value=value;area.style.position='fixed';area.style.opacity='0';
  document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();
  showToast(successMessage||'Copiado.','success');
  return Promise.resolve();
}

/* ---------- equipe ----------
   A tela de equipe mora em app.js:760-836, com os quatro papéis
   (administrador, financeiro, operacional, leitura).

   Aqui existia uma segunda versão dela, anterior aos papéis: convidava
   funcionário sem função nenhuma. Ela só não valia porque o app.js é
   carregado depois no index.html e sobrescrevia cada função — ou seja, o
   controle de permissão da equipe dependia da ORDEM DAS TAGS DE SCRIPT.
   Trocar duas linhas do HTML, ou um dia empacotar os arquivos, faria o
   app voltar em silêncio para a versão sem papéis.

   O banco continuaria protegendo (o papel é validado por gatilho no
   PostgreSQL), mas a tela mentiria. Removida em 31/07/2026. */

/* ---------- PIX Copia e Cola (BR Code estatico) ---------- */
function pixField(id,value){value=String(value==null?'':value);return id+String(value.length).padStart(2,'0')+value;}
function pixAscii(value,max){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9 .-]/g,'').trim().slice(0,max);}
function pixCrc16(value){
  let crc=0xFFFF;
  for(let i=0;i<value.length;i++){crc^=value.charCodeAt(i)<<8;for(let bit=0;bit<8;bit++)crc=(crc&0x8000)?((crc<<1)^0x1021):(crc<<1);crc&=0xFFFF;}
  return crc.toString(16).toUpperCase().padStart(4,'0');
}
function generatePixPayload(value){
  const cfg=state.config||{},key=String(cfg.pixChave||'').trim();
  if(!key)throw new Error('Cadastre a chave PIX nas configurações.');
  const merchant=pixField('00','BR.GOV.BCB.PIX')+pixField('01',key);
  let payload=pixField('00','01')+pixField('26',merchant)+pixField('52','0000')+pixField('53','986');
  const amount=Number(value)||0;if(amount>0)payload+=pixField('54',amount.toFixed(2));
  payload+=pixField('58','BR')+pixField('59',pixAscii(cfg.pixNome||cfg.locadorNome||'LOCADOR',25)||'LOCADOR')+
    pixField('60',pixAscii(cfg.pixCidade||'CIDADE',15)||'CIDADE')+pixField('62',pixField('05','***'))+'6304';
  return payload+pixCrc16(payload);
}
function pixChargeText(value){try{return generatePixPayload(value);}catch(e){return '';}}
function appendPixToMessage(message,value){
  const code=pixChargeText(value);return code?message+'\n\nPIX Copia e Cola:\n'+code:message;
}
function openPixCharge(houseId,mes,contractId,energy){
  const h=state.houses.find(function(item){return item.id===houseId;});if(!h)return;
  let value=0;
  if(energy)value=energiaValorMes(h,mes,contractId);
  else {const contract=contractForMonth(h,mes,contractId);value=contract?contractExpectedRent(contract,mes):aluguelValorMes(h,mes);}
  try{
    const code=generatePixPayload(value);
    openModal('<h3 class="modal-title">PIX Copia e Cola</h3><p class="modal-text">Valor: <strong>'+fmtMoney(value)+'</strong>. A confirmação do pagamento continua manual.</p>'+ 
      '<label class="field"><span>Código PIX</span><textarea id="pix_code" rows="7" readonly>'+esc(code)+'</textarea></label>'+ 
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Fechar</button><button class="btn btn-primary" onclick="copyTextValue(document.getElementById(\'pix_code\').value,\'PIX copiado.\')">Copiar PIX</button></div>');
  }catch(e){showToast(e.message,'error');}
}

/* ---------- catalogo publico ---------- */
function publicListingsUrl(slug){
  const url=new URL(window.location.href);url.search='';url.hash='';url.searchParams.set('anuncios',slug);return url.toString();
}
function copyPublicLink(){
  const slug=state.ownerProfile&&state.ownerProfile.slug_publico;if(!slug){showToast('Salve primeiro o endereço público nas configurações.','error');return;}
  copyTextValue(publicListingsUrl(slug),'Link dos anúncios copiado.');
}
function publicFeatureBadges(h){
  const items=[(Number(h.quartos)||0)+' quarto(s)',(Number(h.banheiros)||0)+' banheiro(s)'];
  if(h.sala)items.push('Sala');if(h.cozinha)items.push('Cozinha');if(h.garagem)items.push('Garagem');
  if(h.quintal)items.push('Quintal');if(h.areaServico)items.push('Área de serviço');
  return items.map(function(item){return '<span>'+esc(item)+'</span>';}).join('');
}
function publicWhatsAppUrl(profile,house){
  let phone=String(profile&&profile.contato||'').replace(/\D/g,'');if(phone&&phone.length<=11)phone='55'+phone;
  const message='Olá! Tenho interesse no imóvel '+(house.nome||'')+(house.endereco?' — '+house.endereco:'')+'.';
  return phone?'https://wa.me/'+phone+'?text='+encodeURIComponent(message):'';
}
function renderPublicListingsPage(){
  const data=state.publicListings||{},profile=data.perfil,houses=data.imoveis||[];
  if(state.loading)return '<div class="app-loading">'+logoSvg()+'<span>Carregando imóveis…</span></div>';
  if(!profile)return '<div class="public-page"><div class="public-empty">'+logoSvg()+'<h1>Catálogo não encontrado</h1><p>Confira o endereço recebido.</p><a class="btn btn-primary" href="'+esc(location.pathname)+'">Área do proprietário</a></div></div>';
  return '<div class="public-page"><header class="public-header">'+logoSvg()+'<div><span>IMÓVEIS DISPONÍVEIS</span><h1>'+esc(profile.nome||'Imóveis para alugar')+'</h1></div><a href="'+esc(location.pathname)+'">Área do proprietário</a></header>'+ 
    '<main class="public-main">'+(houses.length?'<div class="public-grid">'+houses.map(function(h){const contact=publicWhatsAppUrl(profile,h);return '<article class="public-card">'+ 
      (h.fotoUrl?'<img src="'+esc(h.fotoUrl)+'" alt="Foto de '+esc(h.nome)+'">':'<div class="public-photo-empty">'+houseIconSvg()+'</div>')+
      '<div class="public-card-body"><span class="eyebrow">DISPONÍVEL</span><h2>'+esc(h.nome||'Casa')+'</h2><p class="public-address">'+esc(h.endereco||'Consulte o endereço')+'</p>'+ 
      '<strong class="public-price">'+fmtMoney(Number(h.aluguelValor)||0)+' <small>/ mês</small></strong><div class="public-features">'+publicFeatureBadges(h)+'</div>'+ 
      (h.descricao?'<p>'+esc(h.descricao)+'</p>':'')+(contact?'<a class="btn btn-primary" target="_blank" rel="noopener" href="'+esc(contact)+'">Tenho interesse</a>':'')+'</div></article>';}).join('')+'</div>':
      '<div class="public-empty">'+houseIconSvg()+'<h2>Nenhuma casa disponível agora</h2><p>Volte em breve para conferir novas opções.</p></div>')+'</main></div>';
}
