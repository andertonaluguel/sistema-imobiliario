# Design System — Aluguel

Documento normativo. Se algo aqui conflita com o que está no CSS, o
documento está certo e o CSS é que precisa mudar.

Última revisão: 2026-07-27 (Fase 1 e Fase 3 concluídas).

---

## Por que este documento existe

O app cresceu em camadas e acumulou quatro conjuntos de estilo
concorrentes: `style.css` (`.btn`, `.panel`, `.tabs`), `aluguel-ui.css`
(`.rent-*`), `minha-casa.css` (`.mh-*`) e `vitrine.css` (`.vitrine-*`).

O sintoma prático não era feiura. Era que **não dava para saber qual
componente reaproveitar**, então cada tela nova nascia com o visual
ajustado na mão — e o mesmo defeito reaparecia em lugares diferentes.

Medição antes da Fase 1:

| Sintoma | Antes |
|---|---|
| Declarações de `border-radius` | 276 |
| Valores distintos de raio | 34 (de 2px a 999px) |
| Blocos `:root` concorrentes | 3, em 2 arquivos |
| Literais de cor crus | 653 |
| Texto abaixo de 12px | 171 declarações |

---

## Regra única

> Valor de raio, espaço, tipo ou cor de marca **nasce em `tokens.css`**.
> Nenhum outro arquivo declara `:root`, `[data-theme]`, ou solta um
> valor literal onde existe token.

`tests/run-tests.mjs` reprova quem furar. Não é conselho, é trava.

---

## Ordem de carga

`tokens.css` **precisa ser o primeiro CSS**. Ele está em três lugares e
os três são verificados pela trava:

- `index.html` — primeira tag `<link>` de estilo
- `build.mjs` — lista fechada de publicação (senão o deploy sai sem tokens)
- `service-worker.js` — lista `ASSETS` (senão o modo offline sai sem estilo)

Ao criar qualquer CSS novo, ele entra nos três.

---

## Escala de raio

Cinco degraus mais duas formas. Fechada: adicionar degrau exige mudar a
trava, e isso é de propósito.

| Token | Valor | Quando usar |
|---|---|---|
| `--r-xs` | 4px | detalhe minúsculo: ponto de legenda, barra de gráfico, indicador |
| `--r-sm` | 8px | chip, badge, ícone, campo pequeno |
| `--r-md` | 12px | botão, input, cartão de lista |
| `--r-lg` | 16px | painel, cartão grande, bloco de conteúdo |
| `--r-xl` | 22px | modal, folha, superfície que flutua |
| `--r-circle` | 50% | elemento quadrado que vira círculo — só isso |
| `--r-full` | 999px | pílula, onde a altura define o arredondamento |

Na dúvida entre dois degraus, **use o menor**. É mais fácil arredondar
depois do que descobrir que tudo ficou redondo demais.

`--radius` sobrevive como apelido de `--r-lg` só para não quebrar código
antigo. Não usar em código novo.

### Por que `--r-lg` é 16px e não 18px

A proposta original era `8/12/18/22`. Os dados pediram outra coisa: os
valores em uso formavam um aglomerado em 14–17px (40 declarações) e
outro em 18–20px (24). Com `--r-lg:16px` o desvio máximo da migração
caiu para 3px em 2 declarações; com 18px, dezenas ficariam a 3px.

---

## Escala de espaço

| Token | Valor |
|---|---|
| `--s-1` | 4px |
| `--s-2` | 8px |
| `--s-3` | 12px |
| `--s-4` | 17px |
| `--s-5` | 24px |
| `--s-6` | 32px |

O 17px destoa da escala de 4 de propósito: é um valor que o produto já
usa muito e forçá-lo para 16 ou 20 mexeria em layout sem ganho. Os
`padding` e `margin` do CSS existente **ainda não foram migrados** —
isso é Fase 2. Em código novo, use os tokens.

---

## Escala de tipo

| Token | Valor | Uso |
|---|---|---|
| `--t-xs` | 12px | **piso de conteúdo** |
| `--t-sm` | 13px | apoio, legenda |
| `--t-md` | 14px | corpo |
| `--t-lg` | 17px | destaque |
| `--t-xl` | 22px | título |

Nada abaixo de `--t-xs` em texto que carrega informação. Existem hoje
171 declarações abaixo de 12px, algumas em 8px — são dívida, estão sob
catraca e não podem aumentar.

---

## Cores e temas

São quatro temas: `original` (padrão), `aurora`, `oceano`, `citrico`.
Todos vivem em `tokens.css`, e os blocos `[data-theme]` vêm **depois**
do `:root` de cores.

Essa ordem não é estética. `:root` e `[data-theme="x"]` têm a mesma
especificidade, então quem vier por último vence. Com um `:root` no fim
do arquivo, todos os temas viram o tema padrão — foi exatamente o bug
que existia (ver histórico abaixo). A trava verifica a ordem.

Use sempre os tokens semânticos: `--paper`, `--card`, `--ink`,
`--ink-soft`, `--line`, `--brass`, `--cover`, `--shadow`. Um hex cru
não troca de cor quando o usuário troca de tema — é assim que uma tela
fica "quase certa" em aurora e ninguém entende por quê.

---

## Como a trava funciona

`tests/lint-design-system.mjs`, chamado por `tests/run-tests.mjs`.
Dois tipos de regra:

**Regra dura** — a área já está 100% limpa, então qualquer violação nova
reprova na hora:

- `border-radius` que não seja `var(--r-*)`, `0` ou `inherit`
- token `--r-*` fora da escala fechada
- `:root` ou `[data-theme]` fora de `tokens.css`
- `tokens.css` ausente ou fora de ordem no index / build / service worker
- `[data-theme]` antes do `:root` em `tokens.css`
- **componente-base novo fora da lista fechada** — qualquer
  `.algo-panel{`, `.algo-btn{`, `.algo-tabs{`, `.algo-tab{` ou
  `.algo-empty{` que não esteja em `COMPONENTES_PERMITIDOS`. É a regra
  que impede a Fase 2 de desandar: sem ela, o próximo produto cria
  `.portal-panel` e a contagem volta a subir.
- **token definido fora de `tokens.css`**, mesmo escondido num
  seletor de módulo. Era o caso das paletas `--mh-*` e `--rent-*`.
- **contraste abaixo de 4,5** em qualquer token de texto, em
  qualquer tema.

**Catraca** — a dívida ainda existe; o teto é o número medido hoje. Pode
cair à vontade, não pode subir:

| O que | Teto atual |
|---|---|
| Literais de cor fora de `tokens.css` | 372 |
| `font-size` abaixo de 12px | 31 |

**Ao limpar um trecho, abaixe o teto em `lint-design-system.mjs`.** É
assim que a catraca aperta. Deixar o teto velho é permitir que a dívida
volte na mesma medida.

Para conferir que a trava ainda pega o que deveria:
`node tmp/ds-provar-trava.mjs` — injeta 11 violações e confirma que
todas reprovam.

---

## Componentes — qual usar

Quatro padrões, quatro componentes. Os nomes `.mh-*`, `.rent-*`,
`.vitrine-*` e `.commercial-*` continuam funcionando como **apelidos**,
mas não use em código novo.

### Botão — `.btn`

Variantes: `.btn-primary` `.btn-ghost` `.btn-danger` `.btn-sm`.
Base compartilhada com `.mh-btn`, que sobrevive só pelas variantes de
cor da Minha Casa.

Tem `min-height:40px` e `border:1px solid transparent`. Nenhum dos dois
é decorativo: sem a altura mínima, botões de textos diferentes
desalinham; sem a borda transparente, `.btn-ghost` e `.btn-danger`
(que têm borda de verdade) ficam 2px maiores que os outros.

### Painel — `.panel`

Variantes: `.panel-flush` (sem respiro próprio, para painel com faixa
de cabeçalho colada nas bordas) e `.panel-dark` (fundo escuro).
Apelidos: `.mh-panel` `.vitrine-panel` `.commercial-panel` `.id-panel`.

### Aba — `.tabs` ou `.tabs-pill`

Duas formas, para situações diferentes:

- `.tabs` + `.tab` — sublinhado. Rola na horizontal, aguenta muitas abas
  e nomes longos. Use na tela de detalhe.
- `.tabs-pill` + `.tab-pill` — pílula em caixa. Divide o espaço em
  colunas iguais e dá alvo de toque grande. Boa até ~5 abas curtas; com
  mais que isso o texto espreme. Use na navegação de módulo.
  Apelidos: `.rent-tabs` `.mh-tabs`.

### Estado vazio — `.empty-state`

Variante: `.empty-state-page` (página inteira, centralizado, largura
máxima de 520px). Apelidos: `.mh-empty` `.commercial-empty`
`.public-empty` `.vitrine-pub-empty`.

---

## Acessibilidade

Regras que a trava verifica automaticamente:

- **Contraste.** Todo token de texto (`--ink`, `--ink-soft`,
  `--ink-faint`) passa 4,5 contra `--card` e `--paper`, nos 4 temas.
  O teste calcula pela fórmula do WCAG, não por estimativa.
- **Piso de texto.** Conteúdo nunca abaixo de `--t-xs` (12px).
  Restam 31 exceções, todas rótulo em caixa alta ou selo de caixa
  fixa — estão sob catraca.

Regras que dependem de você seguir:

- **Alvo de toque.** Em aparelho de toque (`@media (pointer:coarse)`),
  tudo que se clica mede pelo menos `--toque` (44px). Ícone
  decorativo, selo e avatar ficam de fora — ninguém toca neles.
- **Rótulo acessível.** Botão só de ícone precisa de `aria-label`.
  Botão com texto visível já está rotulado; não precisa de nada.
- **Onde estou.** Navegação usa `aria-current="page"`, aba usa
  `aria-current="true"` (ou `role="tab"` + `aria-selected`, como a
  Minha Casa).
- **Foco.** Nunca `outline:none` sem pôr outro indicador. Se usar
  sombra como anel, deixe `outline:2px solid transparent` — no modo
  de alto contraste do Windows a sombra some.
- **Teclado.** Seta, Home e End navegam entre abas em qualquer barra
  (`.tabs`, `.tabs-pill`, `.rent-tabs`, `.mh-tabs`, `.house-edit-tabs`).
  Está em `app.js`, no fim do arquivo.
- **Mudança de tela.** `render()` chama `anunciarTela()`, que escreve
  o título numa região viva. Sem isso, quem usa leitor de tela clica
  e não recebe confirmação de que algo mudou.
- **Nada de esconder informação.** Se não cabe no celular, empilhe.
  `display:none` numa coluna de tabela apaga o dado sem avisar — foi
  o que acontecia no Financeiro e na Energia.

---

## O que falta

1. **Modo escuro.** A base está pronta: todo token vive em
   `tokens.css`, incluindo as paletas de módulo. Falta converter as
   372 cores cruas restantes (~192 quebram no escuro) e escrever o
   bloco de tokens do tema.
2. **Resolver os seletores declarados duas vezes.** `style.css` ainda
   define várias classes em dois blocos — `.chip`, `.topbar`,
   `.stat-value`, `.ledger-row`, `.house-grid` e outras — porque a
   seção "INTERFACE 2026" no fim do arquivo sobrescreve a de cima. É o
   mesmo padrão de sobrescrita silenciosa do bug do `:root`.
   `.page-header` está declarada **três** vezes.
3. **Espaçamentos fora da escala.** 639 declarações ainda usam px
   solto (13, 14, 15, 18, 20, 22px...). Encaixá-las mexe em layout,
   então precisa ser feito com alguém olhando a tela.
4. Trocar os apelidos pelos nomes canônicos no HTML gerado pelos `.js`
   e apagar os apelidos de `COMPONENTES_PERMITIDOS`.

Um item por vez, rodando os testes entre cada um.

---

## Ao criar uma tela nova

1. Antes de escrever CSS, procure a classe que já existe. Se `.panel`
   serve, use `.panel`.
2. Precisou de um visual que não existe? Estenda o componente canônico
   com um modificador (`.panel.panel-destaque`), não crie um sistema
   paralelo com prefixo novo.
3. Nunca escreva valor literal de raio, e evite hex cru.
4. Cuidado com seletor de filho direto. `.rental-app > .page-header`
   quebra se você envolver o conteúdo num `<section>` — foi assim que o
   cabeçalho da Vitrine perdeu o arredondamento.
5. Rode `node tests/run-tests.mjs` antes de dar por pronto.

---

## Histórico

### 2026-07-27 — Fase 1 e Fase 3

**Bug corrigido: os temas estavam parcialmente mortos.**
`style.css` tinha dois blocos `:root` (linhas 6 e 482). O segundo vinha
*depois* dos blocos `[data-theme]` e, com a mesma especificidade,
vencia em todos eles. Resultado: `--paper`, `--line`, `--shadow` e
`--shadow-hover` eram idênticos nos quatro temas. Aurora, oceano e
citrico declaravam seu próprio papel e sombra, e nada disso aparecia.
Com os blocos fundidos em `tokens.css`, **os três temas alternativos
voltaram a ter papel e sombra próprios** — é uma mudança visível para
quem usa esses temas, e é o comportamento que sempre foi pretendido.

**Raios migrados:** 273 de 276 declarações (as 3 restantes são
`inherit` e `0`, legítimas). 34 valores distintos viraram 7 tokens.
Desvio: 115 declarações idênticas, 88 a 1px, 68 a 2px, 2 a 3px.
Os dois de 3px estão em `aluguel-ui.css` (linhas 88 e 319).

**Trava instalada** com 11 casos de violação verificados.

**Ferramentas** em `tmp/` (descartáveis, não vão para produção):
`ds-scan.mjs` mede o estado atual, `ds-migrate-radius.mjs` migra raios,
`ds-provar-trava.mjs` testa a trava.

### 2026-07-27 — Fase 2 (componentes)

Quatro padrões unificados. Decisões tomadas com o dono do produto:

| Padrão | Antes | Depois | Escolha |
|---|---|---|---|
| Botão | 4 sistemas | `.btn` | forma mista: nome e texto de 13px do `.btn`, altura mínima e raio do `.mh-btn` |
| Painel | 5 sistemas | `.panel` + 2 variantes | raio 16px, sombra difusa em 2 camadas, respiro 22px |
| Aba | 4 sistemas | `.tabs` e `.tabs-pill` | dois padrões mantidos porque servem a situações diferentes |
| Estado vazio | 6 sistemas | `.empty-state` + 1 variante | consolidação; `.public-empty` e `.vitrine-pub-empty` eram idênticos |

**Correção do estudo original.** Ele recomendava adotar `.rent-*` como
base, por ser "o mais maduro". A contagem de uso real no HTML gerado
pelos `.js` mostrou o contrário: `.btn` tinha 273 usos contra 12 do
`.mh-btn`; `.panel` tinha 73 e `.rent-panel` **não existia**. Adotar
`.rent-*` custaria reescrever ~300 pontos de chamada, contra ~40
mantendo os nomes originais. Ficaram os nomes originais e o acabamento
visual do `.rent-*`.

**Cores unificadas.** Os botões da Minha Casa eram roxos fixos
(`#26204D`) e não acompanhavam troca de tema. Agora usam `--cover`.
Ficaram com cor própria só `.mh-btn-accept` e `.mh-btn-activate`, que
carregam significado (confirmação e chamada principal), não decoração.

**Código morto removido:** `.id-btn`, definido mas com zero usos.

**Trava nova:** lista fechada de componentes-base. Criar
`.portal-panel` ou `.energia-btn` agora reprova nos testes. É o que
impede a bagunça de voltar pelo mesmo caminho que ela veio.

### 2026-07-27 — Acessibilidade, primeira rodada

**Contraste corrigido.** `--ink-faint` era `#93A099`: razão 2,72
sobre cartão, contra o mínimo de 4,5. Some na tela do celular no sol.
Escurecido nos 4 temas mantendo a matiz. A trava agora calcula o
contraste de todos os tokens de texto e reprova quem cair abaixo.

**Texto de conteúdo a 12px.** De 169 declarações abaixo do piso para
31, e as 31 são rótulo em caixa alta ou selo de caixa fixa. Valores,
nomes, datas e descrições subiram.

**Barra do celular.** "Inquilinos" virou "Pessoas" e "Financeiro"
virou "Dinheiro". Não é preferência de escrita: a barra tem 5 colunas
e num telefone de 320px cada uma fica com ~63px. Os nomes antigos não
cabem em 12px, e era isso que forçava o texto de 9px.

**Alvo de toque.** 44px para o que é clicável, só em aparelho de
toque (`@media (pointer:coarse)`). No computador segue em 40px, mais
denso.

**Teclado e leitor de tela.** Link "pular para o conteúdo";
navegação por seta nas barras de aba; anúncio de troca de tela;
`.sr-only` global (existia só dentro da Minha Casa); `aria-current`
onde faltava.

**Correções ao número da auditoria.** Ela reportava 39 de 366 botões
com `aria-label` e concluía 11% de cobertura. Medindo: 21 com
`aria-label`, mas **318 com texto visível**, que já é rótulo
acessível. Faltavam **3** de fato — as setas de mês do Financeiro e
um botão de foto da Vitrine. O `energy.js` já fazia certo; o
`finance.js` é que tinha ficado para trás.

**Problemas que a auditoria não pegou:**

- As abas da Minha Casa declaravam `role="tablist"` e `role="tab"`
  sem nenhuma navegação por seta. O leitor de tela anuncia "aba 1 de
  5" e o usuário aperta a seta esperando resposta — marcar como aba e
  não dar teclado é pior do que não marcar.
- `.sr-only` estava definido só dentro de `.minha-casa`. Qualquer
  texto para leitor de tela fora daquele módulo aparecia na tela.
- Dois campos usavam `outline:none` trocando o anel de foco por
  sombra. No modo de alto contraste do Windows a sombra some e o
  campo focado fica sem marca nenhuma.
- A marca inteira sumia em telas ≤430px, não só o texto. Agora só o
  nome some; o símbolo fica e continua clicável.
- O `--warn` (#D99A0E) tem contraste 2,45 sobre branco, pior que o
  `--ink-faint`. Não é problema: ele só é usado como fundo, nunca
  como cor de texto. Vale saber antes de alguém usá-lo como texto.

**Financeiro e Energia no celular.** As linhas viraram cartão
empilhado de 2 colunas. Antes, `display:none` apagava a 4ª e 5ª
coluna do Financeiro e sobrava só "Previsto" — o número menos útil
sozinho. Nenhum dado some mais.

**Base do modo escuro.** As paletas `--mh-*` e `--rent-*` (50 tokens
de tema claro) moravam dentro dos arquivos dos módulos, e o
`.mh-modal` tinha uma **cópia parcial** de 11 deles — dessincronizaria
na primeira mudança de cor. Tudo em `tokens.css` agora, e uma regra
nova impede que volte. 111 brancos cravados viraram `--card` e
`--cover-text`, sem mudar um pixel: os dois já valem `#FFFFFF`.
