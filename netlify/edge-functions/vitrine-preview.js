/* ============================================================
   vitrine-preview.js — HTML social, canonical, JSON-LD e sitemap

   Robôs de busca e WhatsApp não executam o JavaScript da SPA. Esta função
   entrega os sinais públicos no primeiro HTML e nunca usa chave secreta.
   Qualquer falha de enriquecimento devolve a página normal.
   ============================================================ */

const ESCAPES={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return ESCAPES[c];});}
function xml(v){return esc(v);}
function moeda(v){return 'R$ '+(Number(v)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}
/* Cópia local do helper de utils.js: esta função roda isolada no edge, sem
   acesso aos scripts do app. Mesma regra — zero vai para o plural. */
function plural(n,singular,pluralForma){const v=Number(n)||0;return v+' '+(Math.abs(v)===1?singular:pluralForma);}
function slugTexto(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90);}
function jsonSeguro(v){return JSON.stringify(v).replace(/</g,'\\u003c');}

async function credenciais(origin){
  const resposta=await fetch(origin+'/config.js');
  if(!resposta.ok)return null;
  const texto=await resposta.text();
  const url=/SUPABASE_URL:\s*'([^']+)'/.exec(texto);
  const key=/SUPABASE_ANON_KEY:\s*'([^']+)'/.exec(texto);
  return url&&key?{url:url[1],key:key[1]}:null;
}
async function rpc(cred,nome,payload){
  return fetch(cred.url+'/rest/v1/rpc/'+nome,{
    method:'POST',headers:{'Content-Type':'application/json',apikey:cred.key,Authorization:'Bearer '+cred.key},
    body:JSON.stringify(payload||{})
  });
}

const BUCKET='imoveis-arquivos';
async function servirArquivo(endereco){
  const caminho=endereco.searchParams.get('p')||'';
  if(!caminho)return new Response('sem arquivo',{status:400});
  const cred=await credenciais(endereco.origin);
  if(!cred)return new Response('indisponivel',{status:502});
  const permitido=await rpc(cred,'arquivo_vitrine_publico',{p_path:caminho});
  if(!permitido.ok||(await permitido.json())!==true)return new Response('nao encontrado',{status:404});
  const arquivo=await fetch(cred.url+'/storage/v1/object/'+BUCKET+'/'+caminho.split('/').map(encodeURIComponent).join('/'),
    {headers:{apikey:cred.key,Authorization:'Bearer '+cred.key}});
  if(!arquivo.ok)return new Response('nao encontrado',{status:404});
  const tipo=arquivo.headers.get('content-type')||'image/jpeg';
  const cabecalhos={
    'content-type':tipo,
    'cache-control':'public, max-age=86400, stale-while-revalidate=604800',
    'x-content-type-options':'nosniff'
  };
  /* SVG servido do proprio dominio executa script se alguem abrir a URL
     direto — dentro de <img> nao executa, mas a URL e publica. O
     sandbox tira essa capacidade sem impedir a imagem de aparecer.
     Hoje so o dono sobe a propria logo, entao o risco e dele mesmo;
     ainda assim custa uma linha fechar a porta. */
  if(/svg/i.test(tipo)) cabecalhos['content-security-policy']='sandbox; default-src \'none\'';
  return new Response(arquivo.body,{status:200,headers:cabecalhos});
}

function lerRota(endereco){
  const partes=endereco.pathname.split('/').filter(Boolean).map(function(p){try{return decodeURIComponent(p);}catch(e){return p;}});
  const rota={slug:'',cidadeSlug:'',finalidade:'',tipo:'',imovelId:'',pagina:''};
  if(partes[0]==='vitrine'&&partes[1]){
    rota.slug=partes[1];
    if(partes[2]==='privacidade')rota.pagina='privacidade';
    /* Sem esta linha, /anunciar/ seria lido como nome de cidade: o
       canonical viraria /anunciar/alugar/ e o compartilhamento anunciaria
       uma cidade que não existe. */
    else if(partes[2]==='anunciar')rota.pagina='anunciar';
    else if(partes[2]==='imovel'&&partes[3])rota.imovelId=partes[3];
    else{
      rota.cidadeSlug=partes[2]||'';
      rota.finalidade=partes[3]==='comprar'?'vender':partes[3]==='alugar'?'alugar':'';
      rota.tipo=partes[4]||'';
    }
  }
  rota.slug=rota.slug||(endereco.searchParams.get('vitrine')||'').trim();
  rota.imovelId=rota.imovelId||(endereco.searchParams.get('imovel')||'').trim();
  rota.finalidade=rota.finalidade||(endereco.searchParams.get('para')==='vender'?'vender':'alugar');
  rota.tipo=rota.tipo||(endereco.searchParams.get('tipo')||'');
  rota.pagina=rota.pagina||(endereco.searchParams.get('pagina')||'');
  return rota;
}
function caminhoCanonical(rota,dados,item){
  const base='/vitrine/'+encodeURIComponent(rota.slug)+'/';
  if(rota.pagina==='privacidade')return base+'privacidade/';
  if(rota.pagina==='anunciar')return base+'anunciar/';
  if(item)return base+'imovel/'+encodeURIComponent(item.id)+'/'+slugTexto(item.titulo||item.codigo||'imovel')+'/';
  let cidade=rota.cidadeSlug;
  if(!cidade)return base;
  return base+encodeURIComponent(slugTexto(cidade))+'/'+(rota.finalidade==='vender'?'comprar':'alugar')+'/'+
    (rota.tipo?encodeURIComponent(slugTexto(rota.tipo))+'/':'');
}

function fotoPublica(origin,path){return path?origin+'/og-foto?p='+encodeURIComponent(path):'';}
function dadosSeo(endereco,rota,dados){
  const perfil=dados.perfil||{};
  const nome=perfil.nome||'Imóveis disponíveis';
  const imoveis=Array.isArray(dados.imoveis)?dados.imoveis:[];
  const item=rota.imovelId?imoveis.find(function(x){return String(x.id)===String(rota.imovelId);}):null;
  let titulo,descricao,imagem='';
  if(rota.pagina==='anunciar'){
    titulo='Anuncie seu imóvel · '+nome;
    descricao='Coloque seu imóvel na vitrine de '+nome+', ou monte a sua própria plataforma de locação.';
  }else if(rota.pagina==='privacidade'){
    titulo='Privacidade · '+nome;descricao='Como '+nome+' usa os dados enviados na Vitrine.';
  }else if(item){
    const vende=(item.finalidade==='vender'||item.finalidade==='ambos')&&Number(item.precoVenda)>0;
    const venda=rota.finalidade==='vender'&&vende;
    const valor=venda?moeda(item.precoVenda):moeda(item.aluguel)+'/mês';
    titulo=item.titulo+' — '+valor+' · '+nome;
    const partes=[];
    /* Só entra o que o imóvel realmente tem. Antes bastava não ser terreno
       para anunciar "0 quartos · 0 banheiros" — num ponto comercial isso
       aparecia no WhatsApp de quem recebe o link. */
    if(item.tipo!=='terreno'){
      if(Number(item.quartos)>0)partes.push(plural(item.quartos,'quarto','quartos'));
      if(Number(item.banheiros)>0)partes.push(plural(item.banheiros,'banheiro','banheiros'));
    }
    if(Number(item.areaM2))partes.push(item.areaM2+' m²');
    if(item.bairro)partes.push(item.bairro);
    if(item.cidade)partes.push(item.cidade);
    descricao=(partes.join(' · ')+(item.descricao?' — '+item.descricao.slice(0,120):'')).slice(0,160);
    imagem=fotoPublica(endereco.origin,(item.fotos&&item.fotos[0])||'');
  }else{
    const cidades=Array.isArray(dados.cidades)?dados.cidades:[];
    const cidadeId=endereco.searchParams.get('cidade')||'';
    const cidade=rota.cidadeSlug
      ?cidades.find(function(c){return slugTexto(c.slug||c.nome)===slugTexto(rota.cidadeSlug);})
      :cidades.find(function(c){return String(c.id)===String(cidadeId);});
    if(cidade&&!rota.cidadeSlug)rota.cidadeSlug=slugTexto(cidade.slug||cidade.nome);
    const acao=rota.finalidade==='vender'?'à venda':'para alugar';
    titulo=(cidade?'Imóveis '+acao+' em '+cidade.nome:nome+' — imóveis e terrenos para alugar e comprar');
    const nomes=cidades.map(function(c){return c.nome;}).filter(Boolean);
    descricao=(perfil.descricao||((imoveis.length?plural(imoveis.length,'imóvel disponível','imóveis disponíveis'):'Confira os imóveis disponíveis')+
      (cidade?' em '+cidade.nome:nomes.length?' em '+nomes.join(', '):'.'))).slice(0,160);
    imagem=fotoPublica(endereco.origin,perfil.logoPath||'');
  }
  const canonical=endereco.origin+caminhoCanonical(rota,dados,item);
  return {perfil:perfil,item:item,titulo:titulo,descricao:descricao,imagem:imagem,canonical:canonical};
}

function jsonLdSeo(seo,rota){
  const p=seo.perfil||{};
  const home=new URL('/vitrine/'+encodeURIComponent(rota.slug)+'/',seo.canonical).toString();
  const org={'@type':'RealEstateAgent',name:p.nome||'Imóveis',url:home,
    telephone:p.contato||undefined,description:p.descricao||undefined,
    logo:p.logoPath?fotoPublica(new URL(seo.canonical).origin,p.logoPath):undefined,
    address:p.cidadeSede?{'@type':'PostalAddress',addressLocality:p.cidadeSede,addressRegion:p.ufSede||undefined,addressCountry:'BR'}:undefined};
  const grafo=[org];
  if(seo.item){
    const i=seo.item;const venda=rota.finalidade==='vender';
    grafo.push({'@type':'Offer',url:seo.canonical,priceCurrency:'BRL',price:venda?Number(i.precoVenda)||undefined:Number(i.aluguel)||undefined,
      availability:'https://schema.org/InStock',itemOffered:{'@type':'Accommodation',name:i.titulo,description:seo.descricao,
        floorSize:Number(i.areaM2)>0?{'@type':'QuantitativeValue',value:Number(i.areaM2),unitCode:'MTK'}:undefined,
        numberOfRooms:Number(i.quartos)||undefined,address:{'@type':'PostalAddress',addressLocality:i.cidade||undefined,addressRegion:i.uf||undefined,addressCountry:'BR'}}});
    grafo.push({'@type':'BreadcrumbList',itemListElement:[
      {'@type':'ListItem',position:1,name:p.nome||'Imóveis',item:home},
      {'@type':'ListItem',position:2,name:i.titulo,item:seo.canonical}
    ]});
  }
  return {'@context':'https://schema.org','@graph':grafo};
}

function tagsSeo(seo,rota,endereco){
  const busca=endereco.searchParams.get('busca');
  return [
    '<title>'+esc(seo.titulo)+'</title>',
    '<meta name="description" content="'+esc(seo.descricao)+'">',
    '<meta name="robots" content="'+(busca?'noindex,follow':'index,follow')+'">',
    '<link rel="canonical" href="'+esc(seo.canonical)+'">',
    '<meta property="og:type" content="'+(seo.item?'product':'website')+'">',
    '<meta property="og:site_name" content="'+esc((seo.perfil&&seo.perfil.nome)||'Imóveis')+'">',
    '<meta property="og:title" content="'+esc(seo.titulo)+'">',
    '<meta property="og:description" content="'+esc(seo.descricao)+'">',
    '<meta property="og:url" content="'+esc(seo.canonical)+'">',
    seo.imagem?'<meta property="og:image" content="'+esc(seo.imagem)+'">':'',
    seo.imagem?'<meta property="og:image:alt" content="'+esc(seo.item?'Foto de '+seo.item.titulo:'Logo de '+seo.perfil.nome)+'">':'',
    '<meta name="twitter:card" content="'+(seo.imagem?'summary_large_image':'summary')+'">',
    '<meta name="twitter:title" content="'+esc(seo.titulo)+'">',
    '<meta name="twitter:description" content="'+esc(seo.descricao)+'">',
    '<script type="application/ld+json" id="vitrine-jsonld">'+jsonSeguro(jsonLdSeo(seo,rota))+'</script>'
  ].filter(Boolean).join('\n');
}

async function dadosPublicos(cred,slug){
  let resposta=await rpc(cred,'listar_vitrine_publica_v2',{p_slug:slug});
  if(!resposta.ok)resposta=await rpc(cred,'listar_vitrine_publica',{p_slug:slug});
  if(!resposta.ok)return null;
  return resposta.json();
}

function sitemapXml(origin,lista){
  const urls=new Map();
  function add(path,lastmod){
    const loc=origin+path;
    const data=lastmod?new Date(lastmod):null;
    urls.set(loc,{loc:loc,lastmod:data&&!Number.isNaN(data.getTime())?data.toISOString().slice(0,10):''});
  }
  (Array.isArray(lista)?lista:[]).forEach(function(v){
    const base='/vitrine/'+encodeURIComponent(v.slug)+'/';add(base,v.atualizadoEm);
    const combos=new Map();
    (v.imoveis||[]).forEach(function(i){
      const caminho=base+'imovel/'+encodeURIComponent(i.id)+'/'+slugTexto(i.titulo||'imovel')+'/';add(caminho,i.atualizadoEm);
      if(!i.cidadeSlug)return;
      const finalidades=i.finalidade==='ambos'?['alugar','comprar']:[i.finalidade==='vender'?'comprar':'alugar'];
      finalidades.forEach(function(f){
        const raiz=base+encodeURIComponent(slugTexto(i.cidadeSlug))+'/'+f+'/';
        combos.set(raiz,i.atualizadoEm);combos.set(raiz+encodeURIComponent(slugTexto(i.tipo))+'/',i.atualizadoEm);
      });
    });
    combos.forEach(function(data,path){add(path,data);});
  });
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+
    Array.from(urls.values()).map(function(u){return '  <url><loc>'+xml(u.loc)+'</loc>'+(u.lastmod?'<lastmod>'+u.lastmod+'</lastmod>':'')+'</url>';}).join('\n')+
    '\n</urlset>';
}

async function servirSitemap(endereco){
  const cred=await credenciais(endereco.origin);
  if(!cred)return new Response(sitemapXml(endereco.origin,[]),{status:200,headers:{'content-type':'application/xml; charset=utf-8'}});
  const resposta=await rpc(cred,'listar_vitrine_sitemap_publico',{});
  const lista=resposta.ok?await resposta.json():[];
  return new Response(sitemapXml(endereco.origin,lista),{status:200,headers:{
    'content-type':'application/xml; charset=utf-8','cache-control':'public, max-age=900'
  }});
}

export default async function handler(request,context){
  try{
    const endereco=new URL(request.url);
    if(endereco.pathname==='/og-foto')return await servirArquivo(endereco);
    if(endereco.pathname==='/sitemap.xml')return await servirSitemap(endereco);
    if(endereco.pathname==='/robots.txt')return new Response(
      'User-agent: *\nAllow: /vitrine/\nDisallow: /?busca=\nSitemap: '+endereco.origin+'/sitemap.xml\n',
      {status:200,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'public, max-age=3600'}});

    const rota=lerRota(endereco);
    if(!rota.slug)return;
    const resposta=await context.next();
    if(!(resposta.headers.get('content-type')||'').includes('text/html'))return resposta;
    const cred=await credenciais(endereco.origin);if(!cred)return resposta;
    const dados=await dadosPublicos(cred,rota.slug);if(!dados||!dados.perfil)return resposta;
    const seo=dadosSeo(endereco,rota,dados);
    const tags=tagsSeo(seo,rota,endereco);
    let html=await resposta.text();
    html=html.replace(/<meta\s+name=["'](?:description|robots)["'][^>]*>\s*/gi,'')
      .replace(/<link\s+rel=["']canonical["'][^>]*>\s*/gi,'')
      .replace(/<script[^>]+id=["']vitrine-jsonld["'][^>]*>[\s\S]*?<\/script>\s*/gi,'');
    html=html.replace(/<title>[\s\S]*?<\/title>/i,tags);
    if(!/<meta property="og:title"/i.test(html))html=html.replace(/<\/head>/i,tags+'\n</head>');
    return new Response(html,{status:resposta.status,headers:resposta.headers});
  }catch(erro){
    console.error('vitrine-preview',erro);
    return;
  }
}

export const config={path:'/*'};
