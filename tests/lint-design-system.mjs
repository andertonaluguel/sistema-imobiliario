/* ============================================================
   lint-design-system.mjs — a trava (Fase 3)
   ------------------------------------------------------------
   Impede que a bagunça de quatro design systems volte.
   Chamado por run-tests.mjs. Ver DESIGN-SYSTEM.md.

   Duas naturezas de regra aqui:

   REGRA DURA  — já está 100% limpa, então qualquer violação
                 nova reprova na hora. É o caso dos raios e dos
                 blocos de token.

   CATRACA     — a dívida ainda existe (cores cruas, texto
                 miúdo). O teto abaixo é o número medido hoje.
                 Pode diminuir à vontade; se aumentar, reprova.
                 Ao limpar um trecho, ABAIXE o teto: é assim que
                 a catraca aperta e a dívida não volta.
   ============================================================ */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/* Arquivos que consomem tokens. tokens.css não entra: é a fonte. */
const CONSUMER_CSS = ['style.css', 'minha-casa.css', 'aluguel-ui.css', 'vitrine.css', 'motion.css'];

/* A escala fechada. Mexer aqui = mexer no design system: é para
   ser difícil e consciente. Adicionar degrau exige justificativa. */
const RADIUS_TOKENS = ['--r-xs', '--r-sm', '--r-md', '--r-lg', '--r-xl', '--r-circle', '--r-full'];
const SPACE_TOKENS = ['--s-1', '--s-2', '--s-3', '--s-4', '--s-5', '--s-6'];
const TYPE_TOKENS = ['--t-xs', '--t-sm', '--t-md', '--t-lg', '--t-xl'];

/* --- CATRACA: tetos. Só podem cair, nunca subir. ---
   2026-07-27  545 / 171  medição inicial
   2026-07-27  537 / 170  Fase 2: botões unificados
   2026-07-27  530 / 169  Fase 2: painéis, abas, estados vazios
   2026-07-27  530 /  31  Acessibilidade: texto de conteúdo a 12px
   2026-07-27  419 /  31  Branco cravado virou --card/--cover-text
   2026-07-27  372 /  31  Paletas de módulo levadas ao tokens.css
   2026-07-31  278 /  27  Vitrine pública redesenhada no padrão novo:
                          cores cruas viraram tokens globais (a página
                          pública não fica dentro de .rental-shell, então
                          os --rent-* nem valiam lá) e o texto miúdo subiu
                          para o piso. Os 2 que restam no vitrine.css são
                          rótulo em caixa alta e selo de caixa fixa. */
export const TETO_CORES_CRUAS = 278;
export const TETO_TEXTO_MIUDO = 27;

/* --- Lista fechada de componentes-base ---------------------------
   Foi a raiz do problema: cada produto novo criava .rent-tabs,
   .mh-panel, .vitrine-panel... e ninguém sabia qual reaproveitar.

   Um seletor-base é ".algo-panel{", ".algo-btn{", ".algo-tabs{",
   ".algo-tab{" ou ".algo-empty{". Se aparecer um que não está
   nesta lista, o teste reprova — porque criar sistema paralelo é
   exatamente o que não pode voltar a acontecer.

   Os CANÔNICOS são .btn, .panel, .tabs, .tab e .empty-state.
   Os demais são apelidos que ainda existem e devem MINGUAR:
   ao apagar um, tire-o daqui também.

   Precisa mesmo de um componente novo? Adicione aqui de propósito,
   com uma linha dizendo por que não deu para reaproveitar.     */
const COMPONENTES_PERMITIDOS = new Set([
  /* canônicos */
  '.btn', '.panel', '.tabs', '.tab', '.empty-state',
  /* apelidos herdados — Fase 2 os reduz com o tempo */
  '.mh-btn', '.mh-panel', '.mh-tabs', '.mh-tab', '.mh-empty',
  '.rent-tabs', '.rent-tab',
  '.vitrine-panel', '.vitrine-pub-empty',
  '.commercial-panel', '.commercial-empty',
  '.public-empty', '.id-panel', '.house-edit-tabs',
  '.simple-panel', '.mh-choice-empty', '.public-photo-empty',
  /* componentes próprios, não são sistema paralelo de botão:
     cada um é um controle específico com forma própria */
  '.auth-btn', '.menu-btn', '.top-search-btn', '.cal-today-btn', '.mh-text-btn'
]);

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

/* Contraste WCAG 2.1. Fórmula da especificação, sem aproximação:
   luminância relativa de cada cor, e a razão entre a mais clara e a
   mais escura. 4,5 é o mínimo para texto normal (nível AA). */
function luminancia(hex) {
  const c = hex.replace('#', '');
  const canais = [0, 2, 4].map((i) => {
    const x = parseInt(c.substr(i, 2), 16) / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
}
function contraste(a, b) {
  const l1 = luminancia(a), l2 = luminancia(b);
  const [claro, escuro] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (claro + 0.05) / (escuro + 0.05);
}

const RE_RADIUS = /(?:-webkit-|-moz-)?border(?:-(?:top|bottom)-(?:left|right))?-radius\s*:\s*([^;{}!]+)/g;
const RE_COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g;
const RE_SMALL_TEXT = /font-size\s*:\s*(\d+)px/g;

export async function lintDesignSystem(root) {
  const tokens = stripComments(await readFile(join(root, 'tokens.css'), 'utf8'));
  const sources = new Map();
  for (const f of CONSUMER_CSS) {
    sources.set(f, stripComments(await readFile(join(root, f), 'utf8')));
  }

  /* ---------- 1. tokens.css define a escala completa ---------- */
  for (const t of [...RADIUS_TOKENS, ...SPACE_TOKENS, ...TYPE_TOKENS]) {
    assert.ok(
      new RegExp(`${t}\\s*:`).test(tokens),
      `tokens.css não define ${t}. A escala é fechada — ver DESIGN-SYSTEM.md.`
    );
  }

  /* Nenhum token de raio fora da escala (impede --r-13, --r-alt...) */
  const raiosDeclarados = [...tokens.matchAll(/(--r-[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
  for (const r of raiosDeclarados) {
    assert.ok(
      RADIUS_TOKENS.includes(r),
      `tokens.css declara ${r}, fora da escala fechada. ` +
      `Permitidos: ${RADIUS_TOKENS.join(', ')}. Reaproveite um degrau em vez de criar outro.`
    );
  }

  /* ---------- 2. um único lugar define tokens ---------- */
  for (const [file, src] of sources) {
    const rootBlocks = [...src.matchAll(/(^|[\s};]):root\s*(,|\{)/g)].length;
    assert.equal(
      rootBlocks, 0,
      `${file} declara :root. Todo token vive em tokens.css. ` +
      `Dois blocos :root em arquivos diferentes se sobrescrevem em silêncio — ` +
      `foi exatamente o que apagou as cores dos temas antes.`
    );
    const themeBlocks = [...src.matchAll(/\[data-theme\s*=/g)].length;
    assert.equal(
      themeBlocks, 0,
      `${file} declara [data-theme]. Os 4 temas vivem só em tokens.css.`
    );

    /* Nenhuma DEFINIÇÃO de token fora do tokens.css, nem escondida
       num seletor de módulo. Era o caso das paletas --mh-* e
       --rent-*: 50 tokens de tema claro cravados dentro do arquivo
       do módulo, invisíveis para quem lesse só o tokens.css.
       Exceção: variável passada pelo JS via atributo style. */
    const PASSADAS_PELO_JS = ['--mobile-items', '--portal-items', '--mh-dot',
      '--mh-bar', '--mh-item-color', '--mh-choice-color'];
    const definidos = [...src.matchAll(/(--[a-z0-9-]+)\s*:/g)]
      .map((m) => m[1])
      .filter((t) => !PASSADAS_PELO_JS.includes(t));
    assert.equal(
      definidos.length, 0,
      `${file} define ${definidos.length} token(s): ${[...new Set(definidos)].slice(0, 8).join(', ')}` +
      `${definidos.length > 8 ? '…' : ''}\nTodo token nasce em tokens.css. ` +
      `Token escondido dentro do arquivo de um módulo não aparece para quem ` +
      `procura no lugar certo, e impede o modo escuro de trocá-lo.`
    );
  }

  /* tokens.css tem UM :root de primitivas + UM de cores, e os 3 temas */
  for (const tema of ['aurora', 'oceano', 'citrico']) {
    assert.ok(
      new RegExp(`\\[data-theme="${tema}"\\]`).test(tokens),
      `tokens.css perdeu o tema ${tema}.`
    );
  }
  /* Os [data-theme] têm de vir DEPOIS do :root de cores, senão o
     padrão vence e os temas somem — o bug de antes. */
  const ultimoRoot = tokens.lastIndexOf(':root');
  const primeiroTema = tokens.indexOf('[data-theme');
  assert.ok(
    primeiroTema > ultimoRoot,
    'Em tokens.css os blocos [data-theme] precisam vir depois do último :root. ' +
    'Mesma especificidade: o que vem por último vence. Com :root no fim, ' +
    'todos os temas viram o tema padrão.'
  );

  /* ---------- 3. REGRA DURA: raio sempre por token ---------- */
  const raiosSoltos = [];
  for (const [file, src] of sources) {
    src.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(RE_RADIUS)) {
        const partes = m[1].trim().split(/\s+/);
        const ok = partes.every(
          (p) => p === '0' || p === 'inherit' || /^var\(--r-[a-z]+\)$/.test(p)
        );
        if (!ok) raiosSoltos.push(`${file}:${i + 1}  border-radius:${m[1].trim()}`);
      }
    });
  }
  assert.equal(
    raiosSoltos.length, 0,
    `Raio fora da escala em ${raiosSoltos.length} lugar(es):\n  ` +
    raiosSoltos.join('\n  ') +
    `\nUse var(--r-xs|sm|md|lg|xl|circle|full). Ver DESIGN-SYSTEM.md.`
  );

  /* ---------- 4. CATRACA: cor crua ---------- */
  let cores = 0;
  const coresPorArquivo = {};
  for (const [file, src] of sources) {
    const n = [...src.matchAll(RE_COLOR)].length;
    coresPorArquivo[file] = n;
    cores += n;
  }
  assert.ok(
    cores <= TETO_CORES_CRUAS,
    `Cores cruas subiram para ${cores} (teto ${TETO_CORES_CRUAS}).\n  ` +
    Object.entries(coresPorArquivo).map(([f, n]) => `${f}: ${n}`).join('\n  ') +
    `\nUse um token de cor de tokens.css. Se a cor não existe lá, ` +
    `crie o token lá — não solte o hex aqui.`
  );

  /* ---------- 5. CATRACA: texto abaixo de 12px ---------- */
  let miudo = 0;
  for (const [, src] of sources) {
    for (const m of src.matchAll(RE_SMALL_TEXT)) if (Number(m[1]) < 12) miudo++;
  }
  assert.ok(
    miudo <= TETO_TEXTO_MIUDO,
    `Texto abaixo de 12px subiu para ${miudo} (teto ${TETO_TEXTO_MIUDO}). ` +
    `O piso de conteúdo é var(--t-xs)=12px.`
  );

  /* ---------- 6. nenhum sistema de componente novo ---------- */
  const RE_REGRA = /(^|[},])\s*((?:\.[a-z][a-z0-9-]*\s*,\s*)*\.[a-z][a-z0-9-]*)\s*\{/g;
  const RE_BASE = /^\.([a-z0-9-]*-)?(panel|btn|tabs|tab|empty)$/;
  const intrusos = [];
  for (const [file, src] of sources) {
    for (const m of src.matchAll(RE_REGRA)) {
      for (const sel of m[2].split(',').map((s) => s.trim())) {
        if (RE_BASE.test(sel) && !COMPONENTES_PERMITIDOS.has(sel)) {
          intrusos.push(`${file}  ${sel}`);
        }
      }
    }
  }
  assert.equal(
    intrusos.length, 0,
    `Componente-base novo fora da lista fechada:\n  ` +
    [...new Set(intrusos)].join('\n  ') +
    `\n\nAntes de criar um sistema paralelo, veja se .btn, .panel, .tabs ` +
    `ou .empty-state resolvem — normalmente resolvem, com um modificador. ` +
    `Foi assim que o app acabou com 4 sistemas de aba e 5 de painel. ` +
    `Se for mesmo necessário, inclua o nome em COMPONENTES_PERMITIDOS ` +
    `(tests/lint-design-system.mjs) explicando o porquê.`
  );

  /* ---------- 7. contraste de texto (WCAG AA) ---------- */
  /* Um token de cor de texto tem de passar 4,5 contra os dois
     fundos onde de fato aparece: cartão e papel. Vale para os
     4 temas. Foi assim que o --ink-faint passou anos ilegível
     no sol sem ninguém medir. */
  const blocos = [...tokens.matchAll(/(:root|\[data-theme="(\w+)"\])\s*\{([^}]*)\}/g)];
  const tema = {};
  for (const b of blocos) {
    const nome = b[2] || 'original';
    tema[nome] = tema[nome] || {};
    for (const d of b[3].matchAll(/(--[a-z-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) tema[nome][d[1]] = d[2];
  }
  /* cada tema herda do :root o que não redeclara */
  for (const nome of Object.keys(tema)) {
    if (nome !== 'original') tema[nome] = { ...tema.original, ...tema[nome] };
  }

  const TEXTOS = ['--ink', '--ink-soft', '--ink-faint'];
  const FUNDOS = ['--card', '--paper'];
  const reprovados = [];
  for (const [nome, t] of Object.entries(tema)) {
    for (const fg of TEXTOS) {
      for (const bg of FUNDOS) {
        if (!t[fg] || !t[bg]) continue;
        const r = contraste(t[fg], t[bg]);
        if (r < 4.5) reprovados.push(`${nome}: ${fg} (${t[fg]}) sobre ${bg} (${t[bg]}) = ${r.toFixed(2)}`);
      }
    }
  }
  assert.equal(
    reprovados.length, 0,
    `Contraste abaixo do mínimo WCAG AA (4,5) em ${reprovados.length} caso(s):\n  ` +
    reprovados.join('\n  ') +
    `\nEscureça o token em tokens.css. Texto que só passa em monitor ` +
    `de escritório some na tela do celular no sol.`
  );

  /* ---------- 8. tokens.css está ligado em todo lugar ---------- */
  const index = await readFile(join(root, 'index.html'), 'utf8');
  const build = await readFile(join(root, 'build.mjs'), 'utf8');
  const sw = await readFile(join(root, 'service-worker.js'), 'utf8');

  assert.match(index, /href="tokens\.css"/, 'index.html não carrega tokens.css.');
  assert.match(build, /'tokens\.css'/, 'build.mjs não publica tokens.css — o deploy sairia sem tokens.');
  assert.match(sw, /\.\/tokens\.css/, 'service-worker.js não faz cache de tokens.css — o modo offline sairia sem estilo.');

  /* tokens.css precisa ser o PRIMEIRO css do index */
  const ordem = [...index.matchAll(/href="([a-z-]+\.css)"/g)].map((m) => m[1]);
  assert.equal(
    ordem[0], 'tokens.css',
    `tokens.css tem de ser o primeiro CSS do index.html (hoje: ${ordem[0]}). ` +
    `Se vier depois, os arquivos que consomem os tokens carregam sem eles.`
  );

  return { cores, miudo, raios: raiosSoltos.length };
}
