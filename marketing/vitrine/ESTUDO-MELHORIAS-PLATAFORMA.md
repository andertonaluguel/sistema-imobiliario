# Estudo de melhorias da plataforma

> Auditoria do código real em julho/2026. Cada afirmação abaixo veio de medição,
> não de impressão — os números estão junto para você conferir.

---

## O tamanho do que existe hoje

| | Linhas |
|---|---|
| JavaScript | 9.675 |
| CSS | 2.164 |
| SQL (migrações) | 10.354 |
| **Total** | **~22.200** |

Cinco áreas de produto (Aluguéis, Minha Casa, Vitrine, Comercial, Portal do inquilino),
23 arquivos JS, 5 folhas de estilo, 14 migrações. Para um app feito por uma pessoa,
é muita coisa entregue — e é justamente esse tamanho que começa a cobrar organização.

---

## 1. O problema central: quatro design systems disputando

Esta é a descoberta mais importante do estudo, e ela explica quase todo defeito
visual que você já viu (inclusive os dois que consertamos hoje).

O app não tem **um** sistema visual. Tem quatro, criados em camadas ao longo do tempo:

| Camada | Arquivo | Prefixo | Usada em |
|---|---|---|---|
| Original | `style.css` | `.btn`, `.panel`, `.tabs` | Base de tudo |
| Produto Aluguéis | `aluguel-ui.css` | `.rent-*`, `.rental-*` | Aluguéis |
| Minha Casa | `minha-casa.css` | `.mh-*` | Minha Casa |
| Vitrine | `vitrine.css` | `.vitrine-*` | Vitrine |

**O que isso produziu, em números medidos:**

| Sintoma | Medição |
|---|---|
| Cores distintas no CSS | **242** |
| Usos de cor fora dos tokens | **435** de 1.408 (31%) |
| Valores diferentes de `border-radius` | **20** (de 3px a 999px) |
| Sistemas de aba paralelos | **4** (`.tabs`, `.rent-tabs`, `.mh-tabs`, `.house-edit-tabs`) |
| Sistemas de painel paralelos | **5** (`.panel`, `.mh-panel`, `.commercial-panel`, `.vitrine-panel`, `.id-panel`) |
| Sistemas de botão paralelos | **4** (`.btn-*`, `.mh-btn-*`, `.auth-btn`, `.id-btn`) |
| Estados vazios reimplementados | **6** |

Um design system saudável tem 4 ou 5 raios de borda. O seu tem 20. Isso não é
perfeccionismo: é a razão pela qual cada tela nova exige "acertar o visual na mão",
e por que o mesmo defeito reaparece em lugares diferentes.

### Eu mesmo caí nessa armadilha, duas vezes hoje

Vale registrar porque prova o custo:

1. Criei `.vitrine-tabs` em vez de usar `.rent-tabs` → a barra ficou com medidas
   diferentes das outras abas.
2. Envolvi a Vitrine num `<section>` → o cabeçalho perdeu o arredondamento, porque
   o estilo usa o seletor **filho direto** `.rental-app > .page-header`.

Nenhum dos dois é erro de distração. São consequência de um sistema onde **não é
óbvio qual componente reaproveitar**. Enquanto isso não mudar, todo recurso novo
tem chance de nascer torto.

### O que fazer

**Fase 1 — unificar os tokens (2 a 3 horas, risco baixo).**
Criar um `tokens.css` único com escala fechada e trocar os valores soltos:

```css
:root{
  /* raios: 5 valores, não 20 */
  --r-sm:8px; --r-md:12px; --r-lg:18px; --r-xl:22px; --r-full:999px;
  /* espaços: escala de 4 */
  --s-1:4px; --s-2:8px; --s-3:12px; --s-4:17px; --s-5:24px; --s-6:32px;
  /* texto: nada abaixo de 12px em conteúdo */
  --t-xs:12px; --t-sm:13px; --t-md:14px; --t-lg:17px; --t-xl:22px;
}
```

**Fase 2 — um componente por padrão (1 a 2 dias).**
Escolher um vencedor para aba, painel, botão, cartão de número e estado vazio.
O `.rent-*` é o mais maduro — deve ser a base. Os outros viram apelido dele.

**Fase 3 — trava automática.**
Um teste que falha se aparecer `border-radius` fora da escala ou hex cru fora do
`tokens.css`. A suíte de testes que já existe é o lugar certo. Sem isso, a bagunça volta.

---

## 2. Acessibilidade — o ponto mais fraco

| Medição | Número | Situação |
|---|---|---|
| Botões no app | 366 | |
| Com `aria-label` | 39 | **11%** |
| `aria-current` (indicar onde estou) | 4 | Quase ausente |
| `aria-live` (avisar mudanças) | 1 | Só o toast |
| Regras `:focus-visible` | 8 | Pouco para 366 botões |
| `prefers-reduced-motion` | 3 | Existe, bom |
| `prefers-color-scheme` | **0** | Sem modo escuro |

### Contraste: um reprovado e um no limite

Calculei as combinações reais do app contra o padrão WCAG AA (mínimo 4,5 para texto pequeno):

| Combinação | Razão | Situação |
|---|---|---|
| Corpo `#19251F` sobre branco | 15,84 | ✅ excelente |
| Aba ativa lima sobre verde | 12,47 | ✅ |
| `page-sub` sobre o herói | 10,51 | ✅ |
| Dourado sobre verde escuro | 9,64 | ✅ |
| `--rent-muted` sobre cartão | 5,01 | ✅ no limite confortável |
| Código dourado `#9C6C15` sobre `#FFF8E8` | **4,34** | ⚠️ pouco abaixo |
| **`--ink-faint #93A099` sobre branco** | **2,72** | ❌ **reprova** |

O `--ink-faint` é usado **17 vezes** no `style.css`, em textos auxiliares. Numa tela
de celular, no sol, esse texto simplesmente some. Escurecer para `#6B7A73` resolve
e sobe para 4,6 — é uma linha de CSS.

### Texto pequeno demais

**164 regras** usam fonte abaixo de 12px (68 em 11px, 55 em 10px, 40 em 9px).
Isso é padrão de painel de analista, não de app que você abre no celular na rua.

A recomendação não é aumentar tudo — é definir que **conteúdo** (valores, nomes,
datas) nunca fica abaixo de 12px, e reservar 10–11px só para rótulos de apoio.

---

## 3. O celular

O app esconde a navegação lateral em telas pequenas e coloca uma barra inferior no lugar.
Funciona bem nos Aluguéis. **Mas a barra inferior só cobre os Aluguéis.**

> **Corrigido durante esta auditoria:** a Vitrine usava `.rent-tabs`, que some em
> telas ≤720px. Como a barra inferior não tem itens da Vitrine, no celular ela ficava
> **presa no Painel** — sem acesso a Anúncios, Anunciantes, Leads, Taxas ou Divulgação.
> Agora a barra da Vitrine vira uma faixa deslizável, igual à da Minha Casa.

**O que ainda merece atenção:**

- Em telas ≤430px o **nome "Aluguel" some do topo**. Some a marca inteira, não só o texto.
- **48 regras** definem altura fixa abaixo de 40px. O mínimo confortável para o dedo é 44px.
  Botões de linha de tabela e o "•••" caem nessa faixa.
- O Financeiro **esconde a 4ª e a 5ª coluna** no celular. Some informação sem avisar —
  melhor virar cartão empilhado do que tabela cortada.

---

## 4. Melhorias por aba

### 🏠 Aluguéis — Resumo
O único gráfico do app está aqui (barras de recebimento por mês, SVG feito à mão, usando
os tokens — bem feito). Falta:
- **Comparação com o mês anterior** nos números. "R$ 8.400" diz pouco; "R$ 8.400 · +12%" diz tudo.
- **Taxa de ocupação ao longo do tempo** — hoje só mostra o estado atual.
- Os atalhos ("Nova casa", "Novo inquilino") ocupam muito espaço acima do conteúdo.

### 🏠 Aluguéis — Casas
`houses.js` tem 1.017 linhas: é a área mais densa do app.
- **Visão em lista** além dos cartões — com 10 casas os cartões já cansam; com 30, inviabilizam.
- **Ordenar** por vencimento, valor ou situação. Hoje só filtra.
- **Vistoria com foto e data** — existe `ultima_vistoria` no banco, mas é só uma data solta.

### 🏠 Aluguéis — Financeiro
- **Multa e juros por atraso: não existem** (zero ocorrências no código). Para quem
  administra aluguel isso é uma lacuna real — o valor devido de um pagamento atrasado
  está errado hoje.
- **Reajuste por índice (IGPM/IPCA) não existe.** Há tabela de reajustes, mas o valor é
  digitado na mão. Guardar o índice e a data-base e calcular sozinho economiza erro anual.
- **Previsão de caixa** — nenhuma tela responde "quanto entra nos próximos 3 meses".
- Exportar CSV já existe. Bom.

### 🏠 Aluguéis — Contratos
- **Contrato em PDF não existe** — só o recibo. Gerar o contrato a partir de um modelo
  seria a economia de tempo mais óbvia do app inteiro.
- **Aviso de vencimento próximo**: a Agenda mostra, mas não há alerta ativo 60/30 dias antes.

### ⚡ Energia
83 linhas, o módulo mais enxuto. Funciona, mas:
- **Sem histórico de consumo em gráfico** — só números do mês.
- **Sem alerta de consumo fora do padrão**, que é o principal uso prático (vazamento, fraude).
- **Recibo de energia não existe** — só o de aluguel.

### ⌂ Minha Casa
Acabou de ganhar formas de pagamento e parcelamento. O que falta agora:
- **Orçamento por categoria** ("no mercado, no máximo R$ 900/mês") com barra de progresso.
  É o recurso que transforma o módulo de "registro" em "controle" — e o argumento de venda
  mais forte para o produto de entrada.
- **Fatura do cartão**: hoje as parcelas aparecem soltas. Agrupar por cartão e mês
  responderia "quanto vou pagar de fatura em março".
- **Metas de economia**.

### ☀ Vitrine
Fase 1 e 2 entregues. Falta o que está no estudo dela: prévia rica no WhatsApp,
pontos de interesse automáticos, QR e card de Story.
- Acrescento uma: **página do anunciante** — um link que o dono do imóvel abre para ver
  o desempenho do anúncio dele sozinho, sem te ligar. Reduz seu trabalho e vende a renovação.

### ◆ Comercial
- **Sem receita recorrente na tela** — não há "MRR", "quanto entra por mês".
  Você vende planos e não tem o número mais básico de quem vende plano.
- **Sem histórico de faturamento** por cliente.
- Cobrança é manual. O PIX já é gerado; falta amarrar ao vencimento do plano.

### 👤 Portal do inquilino
127 linhas — a área menos desenvolvida, e a que mais gente vai usar quando escalar.
- **Sem segunda via de boleto/PIX** pelo próprio portal.
- **Sem abrir chamado de manutenção** — hoje o inquilino te liga. Um formulário com
  foto resolveria, e alimentaria as despesas.
- **Sem histórico de pagamentos** visível para ele.

---

## 5. Configurações internas que faltam

Hoje as Configurações têm: nome do locador, documento, módulo Energia, PIX, anúncios
públicos e tema. Faltam ajustes que hoje estão fixos no código:

| Ajuste | Onde está fixo hoje |
|---|---|
| Dia padrão de vencimento | `5`, no schema |
| Multa e juros | não existe |
| Máximo de fotos por casa | `6`, em `photos.js` |
| Texto do recibo | dentro de `reports.js` |
| Categorias de despesa | `CONFIG.CATEGORIAS`, exige editar arquivo |
| Aviso de vencimento (dias) | não existe |
| Faixas de taxa da Vitrine | `config.js` (melhor que antes, mas ainda em arquivo) |

**A regra que vale para todos:** o que muda de negócio para negócio não pode morar
no código. Cada item aí é um pedido de suporte que você vai receber quando tiver clientes.

---

## 6. Cores e identidade

A paleta é boa e coerente: verde-escuro, lima, dourado, papel. Os quatro temas
(Original, Aurora, Oceano, Cítrico) são um diferencial que poucos concorrentes têm.

**O que melhoraria:**

1. **Modo escuro** — zero suporte hoje (`prefers-color-scheme: 0`). Como o app já é
   todo baseado em tokens de tema, é mais barato do que parece: um bloco `[data-theme="escuro"]`.
   Para um app de finanças que se usa à noite, é pedido frequente.

2. **Cor com significado consistente.** Hoje o dourado é a Vitrine, o lima é Aluguéis,
   o violeta é Comercial — bom. Mas o mesmo dourado também marca "atenção" em alguns
   lugares e "destaque" em outros. Separar "cor de área" de "cor de estado" evita confusão.

3. **Semáforo dos status.** Vaga/alugada/manutenção e pago/atrasado usam cores próximas
   em alguns pontos. Um mapa fixo de estado→cor, aplicado em todo o app, deixa a leitura
   instantânea.

---

## 7. Riscos técnicos

| Risco | Gravidade | Situação |
|---|---|---|
| **Repositório sem remote** | 🔴 Alta | Existe só na sua máquina. Um HD morto leva tudo. |
| **Supabase no plano Free** | 🟡 Média | Sem backup automático point-in-time. |
| **Sem empacotamento** | 🟡 Média | 23 arquivos JS carregados um a um. Funciona, mas cada um é uma ida à rede. |
| **Service worker agressivo** | 🟡 Média | Você já sentiu: precisa fechar todas as abas para ver a versão nova. |
| **Escrita offline não existe** | 🟢 Baixa | Lê offline, não grava. Está documentado. |
| **Testes não executam o app** | 🟢 Baixa | A suíte verifica texto do código, não comportamento. Pega muita coisa, mas não tudo. |

O **remote do Git** é o único item que eu trataria hoje. Os outros podem esperar.

---

## 8. Por onde começar

Ordenado por **impacto dividido por esforço** — não por ordem de importância.

### Faça esta semana (horas, não dias)
1. **`--ink-faint` de `#93A099` para `#6B7A73`** — uma linha, corrige o único contraste reprovado.
2. **Criar o remote do Git** — protege 22 mil linhas.
3. **Piso de 12px** para texto de conteúdo.
4. **Multa e juros** no Financeiro — hoje o valor devido de um atrasado está simplesmente errado.

### Faça este mês
5. **Unificar tokens** (raios, espaços, texto) + teste que trava regressão.
6. **Orçamento por categoria na Minha Casa** — é o que dá valor ao produto de entrada.
7. **Contrato em PDF** — a maior economia de tempo por esforço de código.
8. **Reajuste por índice** — erro anual eliminado.

### Faça quando for escalar
9. **Um componente por padrão** (aba, painel, botão, cartão, vazio).
10. **Portal do inquilino de verdade** — chamado de manutenção, segunda via, histórico.
11. **Receita recorrente na aba Comercial**.
12. **Modo escuro**.
13. **Configurações que hoje estão no código**.

---

## 9. A conclusão honesta

O app está **bem acima do que se espera de um projeto de uma pessoa só**. A separação
entre banco e interface é limpa, a segurança por RLS é levada a sério, os limites são
validados no banco e não só na tela, existe backup automático e uma suíte de testes que
já pegou regressão minha três vezes hoje. Isso não é comum.

O que trava o próximo passo não é falta de recurso — é **acúmulo de camadas visuais**.
Quatro sistemas de estilo convivendo fazem cada tela nova custar mais caro do que deveria
e nascer com chance de defeito. Foi o que aconteceu comigo hoje, duas vezes, e eu tinha
acabado de ler o código inteiro.

Se eu pudesse escolher **uma única coisa** para fazer antes de vender para o primeiro
cliente: unificar o design system. Não porque fica mais bonito — porque a partir daí
tudo que você construir vai sair certo na primeira tentativa.

---

*Auditoria feita sobre o código publicado em 26/07/2026.*
