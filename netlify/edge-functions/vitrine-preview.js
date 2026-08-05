/* ============================================================
   vitrine-preview.js — Edge Function do Netlify

   POR QUE ISTO EXISTE
   O WhatsApp, o Facebook e o Google NÃO executam JavaScript: eles
   baixam o HTML e leem as meta tags. Como a Vitrine é montada no
   navegador, um link colado no WhatsApp chegava sem título, sem
   descrição e sem foto — "sem cara".

   Esta função roda ANTES da página chegar ao visitante. Quando o
   endereço tem ?vitrine=slug, ela busca os dados no Supabase e
   injeta as tags no HTML. O visitante comum não percebe nada; o
   robô do WhatsApp encontra tudo pronto.

   Falha aqui nunca derruba o site: qualquer erro devolve a página
   original, sem tags.
   ============================================================ */

const ESCAPES = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
function esc(v){
  return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return ESCAPES[c]; });
}
function moeda(v){
  const n = Number(v) || 0;
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* A URL e a chave pública já vivem no config.js, que é servido para
   qualquer visitante. Lemos de lá para não exigir configuração extra
   no painel do Netlify — e nunca de uma chave secreta. */
async function credenciais(origin){
  const resposta = await fetch(origin + '/config.js');
  if(!resposta.ok) return null;
  const texto = await resposta.text();
  const url = /SUPABASE_URL:\s*'([^']+)'/.exec(texto);
  const key = /SUPABASE_ANON_KEY:\s*'([^']+)'/.exec(texto);
  return (url && key) ? { url: url[1], key: key[1] } : null;
}

const BUCKET = 'imoveis-arquivos';

/* A foto do anúncio mora num bucket privado: só abre com a chave no
   cabeçalho, e og:image não manda cabeçalho. Por isso servimos a
   imagem pelo nosso próprio domínio. Uma URL assinada resolveria,
   mas expira — e o WhatsApp guarda a pré-visualização por muito
   tempo, então o link antigo apareceria quebrado depois. */
async function servirFoto(endereco){
  const caminho = endereco.searchParams.get('p') || '';
  if(!caminho) return new Response('sem foto', { status: 400 });
  const cred = await credenciais(endereco.origin);
  if(!cred) return new Response('indisponivel', { status: 502 });

  /* O banco decide se esta foto é pública: a mesma checagem que a
     política do storage usa. Sem isto, qualquer caminho vazaria. */
  const permitido = await fetch(cred.url + '/rest/v1/rpc/arquivo_vitrine_publico', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: cred.key,
      Authorization: 'Bearer ' + cred.key
    },
    body: JSON.stringify({ p_path: caminho })
  });
  if(!permitido.ok || (await permitido.json()) !== true){
    return new Response('nao encontrado', { status: 404 });
  }

  const arquivo = await fetch(
    cred.url + '/storage/v1/object/' + BUCKET + '/' + caminho.split('/').map(encodeURIComponent).join('/'),
    { headers: { apikey: cred.key, Authorization: 'Bearer ' + cred.key } }
  );
  if(!arquivo.ok) return new Response('nao encontrado', { status: 404 });

  return new Response(arquivo.body, {
    status: 200,
    headers: {
      'content-type': arquivo.headers.get('content-type') || 'image/jpeg',
      'cache-control': 'public, max-age=86400'
    }
  });
}

export default async function handler(request, context){
  try{
    const endereco = new URL(request.url);

    /* Rota da imagem da pré-visualização. */
    if(endereco.pathname === '/og-foto') return await servirFoto(endereco);

    const slug = (endereco.searchParams.get('vitrine') || '').trim();
    /* Só as páginas públicas da Vitrine ganham tags. O app interno
       (com login) não deve ser indexado nem pré-visualizado. */
    if(!slug) return;

    const resposta = await context.next();
    const tipoConteudo = resposta.headers.get('content-type') || '';
    if(!tipoConteudo.includes('text/html')) return resposta;

    const cred = await credenciais(endereco.origin);
    if(!cred) return resposta;

    const dadosResposta = await fetch(cred.url + '/rest/v1/rpc/listar_vitrine_publica', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cred.key,
        Authorization: 'Bearer ' + cred.key
      },
      body: JSON.stringify({ p_slug: slug })
    });
    if(!dadosResposta.ok) return resposta;
    const dados = await dadosResposta.json();
    if(!dados || !dados.perfil) return resposta;

    const nomeCorretora = dados.perfil.nome || 'Imóveis disponíveis';
    const imoveis = Array.isArray(dados.imoveis) ? dados.imoveis : [];
    const imovelId = (endereco.searchParams.get('imovel') || '').trim();
    const item = imovelId ? imoveis.find(function(x){ return String(x.id) === imovelId; }) : null;

    let titulo, descricao, imagem = '';

    if(item){
      /* Um anúncio específico: título, preço e a primeira foto. */
      const vende = (item.finalidade === 'vender' || item.finalidade === 'ambos')
        && Number(item.precoVenda) > 0;
      const querVender = endereco.searchParams.get('para') === 'vender';
      const valor = (querVender && vende)
        ? moeda(item.precoVenda)
        : (item.finalidade === 'vender' && vende ? moeda(item.precoVenda) : moeda(item.aluguel) + '/mês');
      titulo = item.titulo + ' — ' + valor + ' · ' + nomeCorretora;
      const partes = [];
      if(item.tipo !== 'terreno'){
        partes.push(item.quartos + ' quartos', item.banheiros + ' banheiros');
      }
      if(Number(item.areaM2)) partes.push(item.areaM2 + ' m²');
      if(item.bairro) partes.push(item.bairro);
      if(item.cidade) partes.push(item.cidade);
      descricao = partes.join(' · ') + (item.descricao ? ' — ' + item.descricao.slice(0, 120) : '');
      const foto = (item.fotos && item.fotos[0]) || '';
      /* Servida pelo nosso domínio (ver servirFoto), porque o bucket é
         privado e og:image não consegue enviar a chave. */
      if(foto) imagem = endereco.origin + '/og-foto?p=' + encodeURIComponent(foto);
    } else {
      const cidades = Array.isArray(dados.cidades) ? dados.cidades : [];
      const nomes = cidades.map(function(c){ return c.nome; }).filter(Boolean);
      titulo = nomeCorretora + ' — imóveis e terrenos para alugar e comprar';
      descricao = imoveis.length
        ? imoveis.length + ' imóveis disponíveis' + (nomes.length ? ' em ' + nomes.join(', ') : '') + '.'
        : 'Confira os imóveis e terrenos disponíveis.';
    }

    const tags = [
      '<title>' + esc(titulo) + '</title>',
      '<meta name="description" content="' + esc(descricao) + '">',
      '<meta property="og:type" content="website">',
      '<meta property="og:site_name" content="' + esc(nomeCorretora) + '">',
      '<meta property="og:title" content="' + esc(titulo) + '">',
      '<meta property="og:description" content="' + esc(descricao) + '">',
      '<meta property="og:url" content="' + esc(endereco.href) + '">',
      imagem ? '<meta property="og:image" content="' + esc(imagem) + '">' : '',
      '<meta name="twitter:card" content="' + (imagem ? 'summary_large_image' : 'summary') + '">',
      '<meta name="twitter:title" content="' + esc(titulo) + '">',
      '<meta name="twitter:description" content="' + esc(descricao) + '">'
    ].filter(Boolean).join('\n');

    let html = await resposta.text();
    /* Troca o <title> fixo do app pelas tags novas. Se por algum
       motivo ele não estiver lá, injeta antes do </head>. */
    if(/<title>[\s\S]*?<\/title>/i.test(html)){
      html = html.replace(/<title>[\s\S]*?<\/title>/i, tags);
    } else {
      html = html.replace(/<\/head>/i, tags + '\n</head>');
    }

    return new Response(html, {
      status: resposta.status,
      headers: resposta.headers
    });
  }catch(erro){
    /* Nunca derrubar o site por causa de uma pré-visualização. */
    console.error('vitrine-preview', erro);
    return;
  }
}

export const config = { path: '/*' };
