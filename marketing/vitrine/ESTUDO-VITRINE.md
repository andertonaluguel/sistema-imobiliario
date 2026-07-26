# Estudo da nova aba — VITRINE

> Catálogo público de imóveis de terceiros. Sem login, aberto a qualquer pessoa que receba o link.
> Documento de estudo — nada foi implementado ainda no código.
>
> **Decisões já tomadas** (detalhes na seção 13): nome **Vitrine** · taxa de **R$ 100 a 200 por 60 dias** ·
> **endereço exato** no mapa · **módulo vendável**, separado do plano · administrada por **dono e funcionários**.
>
> ⚠️ A decisão de vender a Vitrine como módulo tem consequências no app inteiro, não só nesta aba.
> Elas estão no documento vizinho: **`ESTUDO-MODULOS-E-LICENCAS.md`**.

---

## 1. A ideia em uma frase

Uma quarta aba no topo do app onde **você publica casas que não são suas**, de proprietários que pagam
uma taxa para aparecer. Qualquer pessoa abre o link pelo WhatsApp ou Instagram, filtra por quartos,
preço e bairro, vê fotos, mapa e o entorno, e fala com você. **Nenhum centavo disso entra no Financeiro
dos Aluguéis** — é uma receita separada, de divulgação.

---

## 2. Onde ela encaixa no app

| Aba | O que é | Quem vê | Vendável? |
|---|---|---|---|
| **Aluguéis** | Gestão de imóveis: contratos, pagamentos, inquilinos | Quem tem o módulo | ✅ produto principal |
| **Minha Casa** | Financeiro familiar | Hoje só Mestre → passa a ser vendável | ✅ low ticket |
| **Comercial** | Seus clientes e suas vendas | **Só você, sempre** | ❌ é o seu balcão |
| **➕ Vitrine** | Catálogo de imóveis de terceiros | Quem tem o módulo · **público sem login** | ✅ novo |

A Vitrine é a primeira aba com **duas caras**: uma interna (quem administra) e uma pública (o mundo).

### ⚠️ Ela NÃO é o `?anuncios=` que já existe

O app já tem um catálogo público em `?anuncios=slug` (`features.js` → `renderPublicListingsPage`).
Mas ele é outra coisa:

| | `?anuncios=` (existe) | **Vitrine** (nova) |
|---|---|---|
| De quem são os imóveis | Seus, da tabela `imoveis` | De terceiros, tabela nova |
| Entra no financeiro | Sim, são as casas que você gerencia | **Não, nunca** |
| Quem publica | Cada cliente do app, para os próprios imóveis | Só você |
| Filtros | Nenhum | Preço, quartos, bairro, tipo, características |
| Mapa | Não tem | Mapa + pontos de interesse |
| Fotos | 1 foto de capa | Galeria completa |
| Contato | Botão WhatsApp | WhatsApp + formulário com registro do lead |
| Monetização | Nenhuma | Taxa de divulgação por anúncio |

**Recomendação:** manter os dois. O `?anuncios=` continua sendo um brinde para os clientes do app.
A Vitrine é o seu negócio próprio de divulgação. Elas compartilham o visual, não os dados.

---

## 3. Como funciona — os três fluxos

### 🏠 Fluxo A — o proprietário parceiro (dono da casa)

```
1. Procura você  →  "quero alugar minha casa, coloca lá no seu app"
2. Vocês combinam a taxa (ex.: R$ 80 por 60 dias de exposição)
3. Você cadastra: dados do dono, dados do imóvel, fotos, endereço
4. Você marca a taxa como paga e define a data de vencimento
5. O anúncio entra no ar automaticamente
6. Quando a taxa vence, o anúncio some sozinho da vitrine
7. Você mostra o relatório: "seu imóvel teve 143 visualizações e 12 contatos"
   → esse número é o seu argumento de renovação
```

O proprietário **não tem login**. Ele é só um cadastro seu. Isso simplifica tudo e evita
misturar com as contas de proprietários da aba Comercial.

### 👀 Fluxo B — o visitante (quem procura casa)

```
Recebe o link no WhatsApp / clica no link da bio do Instagram
  ↓
Abre direto na galeria — sem login, sem cadastro, sem app para instalar
  ↓
Filtra: "2 quartos, até R$ 1.200, no Centro, com garagem"
  ↓
Vê os cards com foto, preço e bairro
  ↓
Abre um imóvel: galeria de fotos, descrição, o que tem,
              mapa da região, mercado/escola/farmácia por perto
  ↓
Clica "Falar no WhatsApp"  ou  deixa nome e telefone no formulário
  ↓
Cai no seu WhatsApp / na sua lista de interessados
```

### 🧑‍💼 Fluxo C — você, administrando

Dentro do app logado, aba Vitrine:

- **Painel** — anúncios ativos, a vencer, vencidos, leads da semana, receita do mês em taxas
- **Anúncios** — cadastrar, editar, pausar, republicar, subir fotos, marcar destaque
- **Anunciantes** — a agenda dos donos de imóvel, histórico de taxas pagas
- **Leads** — quem se interessou, em qual imóvel, quando; marcar como atendido/fechado
- **Taxas** — o mini-financeiro da vitrine, separado do Financeiro dos aluguéis
- **Divulgação** — copiar link, gerar QR Code, copiar texto pronto para WhatsApp/Instagram

---

## 4. O que o visitante vê — as telas

### 4.1 Topo público

Faixa verde-escuro (`--rent-night`), logo, nome do seu negócio, contador
"**18 imóveis disponíveis**". Sem menu, sem login, sem nada que confunda.

### 4.2 Barra de filtros

Fica grudada no topo ao rolar. Numa linha só no computador, em duas linhas no celular:

- 🔍 **Busca livre** — bairro, rua, nome do imóvel, código
- 🏷️ **Tipo** — Casa · Apartamento · Kitnet · Sobrado · Comercial
- 🛏️ **Quartos** — 1 · 2 · 3 · 4+
- 💰 **Faixa de preço** — até 800 · 800–1200 · 1200–2000 · 2000+ · ou campo livre
- 📍 **Bairro** — lista montada a partir dos imóveis cadastrados
- ⚙️ **Mais filtros** — banheiros, garagem, mobiliado, aceita pet, quintal, área de serviço, condomínio incluso
- ↕️ **Ordenar** — mais recentes · menor preço · maior preço · destaques primeiro

Regra de ouro: **os filtros mudam o resultado na hora, sem botão "buscar" e sem recarregar a página.**
E o estado dos filtros vai para a URL (`?vitrine=anderton&quartos=2&max=1200`) — assim você
consegue mandar no WhatsApp um link **já filtrado**: *"olha só as de 2 quartos até 1.200"*.

### 4.3 Card do imóvel

```
┌──────────────────────────────┐
│   [foto de capa]     ★ DESTAQUE
│                    3 fotos ›  │
├──────────────────────────────┤
│  DISPONÍVEL          #A-104   │
│  Casa no Jardim América       │
│  R$ 1.200 / mês               │
│  🛏 2  🛁 1  🚗 1  📐 78m²     │
│  Jardim América · 1,2 km do centro
└──────────────────────────────┘
```

### 4.4 Página do imóvel

1. **Galeria** — foto grande + miniaturas, deslizável no celular
2. **Cabeçalho** — preço em destaque, código, tipo, situação
3. **O que tem** — quartos, banheiros, vagas, área, mobiliado, pet, quintal, área de serviço
4. **Custos** — aluguel + condomínio + IPTU = **estimativa mensal total** (isso reduz muito
   pergunta repetida no WhatsApp)
5. **Descrição** — texto livre que você escreve
6. **Mapa** — onde fica
7. **O que tem por perto** — pontos de interesse
8. **Regras** — exige fiador? caução? aceita pet? tempo mínimo de contrato?
9. **Contato** — botão WhatsApp grande + formulário
10. **Parecidos** — 3 outros imóveis com faixa de preço próxima

---

## 5. O mapa e o entorno

### Tecnologia: Leaflet + OpenStreetMap (gratuito, sem cartão de crédito)

**Como o endereço vira ponto no mapa:** você digita o endereço uma vez no cadastro,
o sistema converte em latitude/longitude (geocodificação via Nominatim) e **guarda o resultado**.
A conversão acontece **uma vez, no cadastro** — nunca quando um visitante abre a página.
Isso deixa a página rápida e respeita os limites de uso gratuito do serviço.

### Endereço exato no mapa — ✅ decidido

O pino cai no número certo, com a rua e o número visíveis para qualquer pessoa.

**O que você ganha:** o interessado passa em frente antes de te ligar. Quem não gostou da rua
não te procura, e quem te procura já aprovou a localização. Isso corta boa parte das visitas
perdidas — que é o trabalho mais caro do seu dia.

**Os dois cuidados que vêm junto** (não custam quase nada e evitam problema):

1. **Autorização do dono por escrito no cadastro.** Uma caixa de confirmação
   *"o proprietário autoriza a exibição do endereço completo"*, com data registrada.
   Se algum dia der problema com um imóvel vago, você tem o registro de que ele concordou.
2. **Uma chave de exceção por anúncio.** Fica ligada por padrão, mas quando aparecer aquele
   dono que não quer, você desliga em um clique naquele anúncio só — sem precisar mexer no
   código nem abrir exceção manual. É seguro barato.

> Vale saber: portais grandes (Zap, VivaReal, QuintoAndar) usam o aproximado por padrão
> justamente porque operam com imóvel vazio em escala. Como você atende poucos imóveis e
> conhece cada dono pessoalmente, o exato faz mais sentido no seu caso — desde que os dois
> cuidados acima existam.

### Pontos de interesse do entorno

Buscados uma vez no cadastro (via Overpass/OpenStreetMap) e **gravados junto com o anúncio**:

| Categoria | O que aparece |
|---|---|
| 🎓 Educação | Escolas, creches, faculdades |
| 🛒 Compras | Mercados, padarias, farmácias |
| 🏥 Saúde | UBS, hospitais, clínicas |
| 🚌 Transporte | Pontos de ônibus, terminais |
| 🌳 Lazer | Praças, parques, academias |
| 🏦 Serviços | Bancos, correios |

Cada um com a distância a pé: *"Mercado Bom Preço — 400 m · 5 min"*.
Você pode adicionar pontos manualmente também ("Fábrica X — 2 km"), porque em cidade pequena
o que importa às vezes não está no mapa.

### ⚠️ Ajuste técnico necessário

O `_headers` do app tem uma política de segurança (CSP) fechada. Para o mapa funcionar:

1. **Hospedar o Leaflet junto com o app** (adicionar `leaflet.js` e `leaflet.css` na lista do
   `build.mjs`) em vez de puxar de CDN — assim **não precisa afrouxar o `script-src`**
2. Liberar só as imagens dos ladrilhos do mapa no `img-src`:
   `https://*.tile.openstreetmap.org`
3. Geocodificação e pontos de interesse rodam **no servidor** (Supabase Edge Function),
   no momento do cadastro — assim **o `connect-src` continua só com o Supabase**

Resultado: mapa completo funcionando com a segurança do app praticamente intacta.

---

## 6. Captação de contato — WhatsApp + formulário

Os dois juntos, e isso é proposital: quem tem pressa clica no WhatsApp, quem está pesquisando
às 23h deixa o formulário.

### Botão WhatsApp

Abre com mensagem pronta, já identificando o imóvel:

> *Olá! Vi o imóvel **#A-104 — Casa no Jardim América (R$ 1.200/mês)** na sua vitrine e tenho interesse.*

O código do imóvel na mensagem resolve o maior problema operacional: você recebe 20 mensagens
por dia e sabe na hora de qual casa cada uma fala.

### Formulário de interesse

Curto — nome, WhatsApp, e uma linha de mensagem. Cada envio vira um registro com:
imóvel, data, origem do clique (WhatsApp? Instagram? QR?) e status
(novo → contatado → visita agendada → fechado → perdido).

### Contadores por anúncio

Toda visualização e todo clique de contato é contado. Isso vira o **relatório do proprietário** —
e o relatório é o que sustenta a cobrança da taxa:

> *"Sua casa ficou 60 dias na vitrine: 143 visualizações, 12 contatos, 4 visitas."*

### ⚖️ LGPD

Formulário com aviso claro de finalidade e caixa de consentimento. Guardar só o necessário
(nome, telefone, mensagem), com política de descarte automático depois de X meses.
O app já tem o texto de termos em `app.js` → `termsContent()`; a Vitrine precisa de um
parágrafo próprio, porque aqui os dados são de terceiros que nunca criaram conta.

---

## 7. O dinheiro — modelo de taxa

### Regra número 1: fica fora do Financeiro dos Aluguéis

O módulo Financeiro existente calcula receita de aluguel, inadimplência, despesas por imóvel.
Se um imóvel de terceiro entrar ali, todo relatório fica errado. Por isso:

- **Tabela separada** (`vitrine_imoveis`), não a `imoveis`
- **Financeiro separado**, dentro da própria aba Vitrine
- **Não conta no limite de casas do plano**
- Não aparece em Dashboard, Relatórios, Agenda ou Backup dos aluguéis

### Modelos possíveis de cobrança

| Modelo | Como é | A favor | Contra |
|---|---|---|---|
| **Taxa fixa por período** ⭐ | R$ X por 30/60/90 dias no ar | Simples de explicar e cobrar; receita previsível | Cobra igual de quem alugou rápido e de quem não alugou |
| **Taxa + destaque** | Taxa base + valor extra para aparecer no topo | Aumenta o ticket sem esforço | Precisa ter volume para o destaque valer algo |
| **Só no sucesso** | Grátis anunciar, % ou valor fixo se alugar | Fácil de vender ("só paga se der certo") | Você não controla o fechamento — o dono pode alugar e não avisar |
| **Combinado** | Taxa pequena de entrada + valor no fechamento | Equilibra risco | Mais difícil de explicar |

### ✅ Decidido: R$ 100 a 200 por 60 dias

Taxa fixa por período. É o único modelo que você cobra com 100% de controle, porque o gatilho
é o próprio app (anúncio no ar / anúncio fora do ar), não a palavra do proprietário.

**Tabela sugerida** — três faixas, e não um preço só, porque um sobrado de R$ 2.600 dá o mesmo
trabalho de cadastro mas vale muito mais para o dono:

| Faixa | Aluguel do imóvel | Taxa / 60 dias | Destaque (opcional) |
|---|---|---|---|
| Simples | até R$ 1.000 | R$ 100 | + R$ 40 |
| Padrão | R$ 1.000 a 2.000 | R$ 150 | + R$ 50 |
| Alto | acima de R$ 2.000 | R$ 200 | + R$ 60 |

**Como isso se paga para o dono:** 60 dias de exposição custam **menos de 10% de um mês de
aluguel**. Um mês com a casa vazia custa 100%. Esse é o número que fecha a venda, e cabe numa
frase de WhatsApp:

> *"São R$ 150 por 60 dias divulgando. Se adiantar a locação em uma única semana, já se pagou."*

**Renovação:** ao vencer, ofereça mais 60 dias pelo mesmo valor, com o relatório junto.
Se o imóvel já teve muitos contatos e não alugou, o problema é preço ou o imóvel — e aí
você tem dado na mão para conversar com o dono sobre baixar o aluguel, em vez de perder o cliente.

**Os valores ficam configuráveis, nunca fixos no código.** Você muda a tabela pela tela de
configurações quando o mercado mudar, sem depender de ninguém.

### O ciclo de vida do anúncio

```
RASCUNHO → você cadastra, ainda não aparece
   ↓ (taxa registrada + data de vencimento)
ATIVO → aparece na vitrine pública
   ↓ (faltando 7 dias)
A VENCER → alerta no painel + texto pronto de cobrança para mandar ao dono
   ↓ (venceu)
VENCIDO → sai da vitrine automaticamente, dados preservados
   ↓ (renovou)
ATIVO de novo — sem recadastrar nada
```

Também: **ALUGADO** (sai da vitrine, entra na estatística de sucesso — seu melhor material
de marketing) e **PAUSADO** (o dono pediu para tirar por um tempo).

---

## 8. Banco de dados — o que precisa ser criado

Cinco tabelas novas, todas com prefixo `vitrine_`, isoladas do resto:

```sql
-- Quem paga para anunciar (não tem login, é cadastro seu)
vitrine_anunciantes
  id · user_id (você) · nome · telefone · email · documento
  observacoes · created_at

-- O imóvel anunciado — SEPARADO da tabela imoveis, de propósito
vitrine_imoveis
  id · user_id · anunciante_id · codigo (A-104)
  titulo · tipo (casa/apto/kitnet/sobrado/comercial)
  aluguel · condominio · iptu
  quartos · banheiros · vagas · area_m2
  mobiliado · aceita_pet · quintal · area_servico
  exige_fiador · caucao · contrato_minimo_meses
  descricao
  -- localização
  cep · logradouro · numero · bairro · cidade · uf
  latitude · longitude
  endereco_exato_publico (bool, padrão TRUE — decisão 3)
  autorizacao_endereco_em (timestamptz — quando o dono autorizou)
  pontos_interesse (jsonb, gravado no cadastro)
  -- comercial
  status (rascunho/ativo/vencido/pausado/alugado)
  destaque (bool) · publicado_em · expira_em
  -- métricas
  visualizacoes · contatos_whatsapp · contatos_formulario

-- Fotos (bucket próprio, leitura pública só de anúncio ativo)
vitrine_fotos
  id · imovel_id · storage_path · ordem · legenda

-- Quem se interessou
vitrine_leads
  id · imovel_id · nome · telefone · mensagem
  origem (whatsapp/formulario) · utm
  status (novo/contatado/visita/fechado/perdido)
  consentimento_lgpd · created_at

-- As taxas que você recebe
vitrine_taxas
  id · imovel_id · anunciante_id · valor · forma_pagamento
  periodo_inicio · periodo_fim · pago · data_pagamento · observacao
```

**Leitura pública:** uma função `listar_vitrine_publica(p_slug, filtros...)` com
`security definer` e `grant execute to anon` — exatamente o padrão que já existe em
`listar_imoveis_publicos` (`migracao-versao-comercial-v1.sql:892`). A função devolve
**só** anúncios com `status='ativo'` e `expira_em >= hoje`, e **nunca** devolve o nome,
telefone ou documento do anunciante. O endereço sai completo (decisão 3), a menos que
aquele anúncio específico tenha `endereco_exato_publico = false`.

**Escrita (área interna):** todas as funções checam `e_acesso_operacional()` — a função que
o banco já usa para imóveis e inquilinos, e que **já reconhece funcionário** (decisão 5) —
mais a licença do módulo Vitrine.

Fotos seguem o mesmo truque já usado no app: policy no `storage.objects` que só libera
o arquivo se a função confirmar que o anúncio está ativo.

---

## 9. Identidade visual — uma cara só

A Vitrine usa **exatamente** as variáveis que já existem, sem inventar cor nova:

| Elemento | Token | Valor |
|---|---|---|
| Faixa do topo | `--rent-night` → `--rent-night-2` | `#102E27` → `#1A473B` |
| Aba ativa (Aluguéis) | `--rent-lime` | `#E7F77B` |
| Aba ativa (Comercial) | violeta | `#4B3E8A` |
| **Aba ativa (Vitrine)** | `--rent-gold` | `#F0C76E` ← a cor livre da paleta |
| Fundo | `--rent-canvas` | `#EEF3F0` |
| Cards | branco, raio 18px, `--rent-shadow` | |
| Títulos | Space Grotesk 700 | |
| Corpo | IBM Plex Sans | |
| Preços | Space Grotesk 700 | |
| Códigos (#A-104) | IBM Plex Mono | |

O dourado é a escolha certa: já é a cor do logo no topo (`.topbar-brand .brand-mark`),
já está definido como token, e é o único dos três tons de destaque ainda não usado por
nenhuma aba. Também combina com a ideia de "vitrine".

**Detalhe importante:** a página pública **não** deve seguir o seletor de temas
(Aurora/Oceano/Cítrico) do proprietário logado. Ela é a sua marca, mostrada para
estranhos — fica sempre no tema Original.

---

## 10. Marketing — o que faz o link circular

### 10.1 O link

Curto e memorizável. Hoje o padrão do app é `?anuncios=slug`.
Para a vitrine, sugestão: **`seusite.com.br/?vitrine=seunome`**, ou melhor ainda,
um redirecionamento no Netlify para deixar **`seusite.com.br/imoveis`** — muito mais
fácil de ditar por telefone e de escrever na bio do Instagram.

### 10.2 ⚠️ A prévia no WhatsApp — o ponto que ninguém lembra

Hoje o app é uma página única montada pelo navegador. Quando você cola o link no WhatsApp,
**o WhatsApp não executa JavaScript** — ele lê o HTML cru. Resultado: a prévia sai como
*"Aluguel — Gestão de Casas"*, sem foto, sem preço. Isso derruba muito o clique.

**Solução:** uma *Edge Function* no Netlify que detecta o robô do WhatsApp/Instagram/Facebook
e devolve as meta tags certas para aquele imóvel específico:

```
og:title        Casa 2 quartos no Jardim América — R$ 1.200/mês
og:description  2 quartos · 1 banheiro · garagem · 78m² · Jardim América
og:image        [foto de capa do imóvel]
```

Assim o link de um imóvel chega no grupo do WhatsApp **com a foto da casa e o preço**.
É a diferença entre um link ignorado e um link clicado. Vale o esforço.

### 10.3 Material de divulgação gerado pelo app

Botão **"Divulgar"** em cada anúncio, gerando na hora:

- **Texto pronto para WhatsApp** — emoji, características, preço, link
- **Card para Story do Instagram** — 1080×1920, foto do imóvel + preço + seu logo + QR
- **QR Code** — para papel: placa na frente da casa, cartaz em mercado, cartão de visita
- **Link filtrado** — *"todas as de 2 quartos até 1.200"* em um link só

O app já tem QR e materiais de marketing na pasta `marketing/` — dá para reaproveitar o padrão.

### 10.4 Argumento de venda para o proprietário

O que você vende não é "aparecer num site". É:

1. **Alcance** — sua base de WhatsApp e Instagram vê na hora
2. **Filtro certo** — quem chega já procurava aquele perfil de imóvel
3. **Prova** — relatório com visualizações e contatos, número na mão
4. **Triagem** — você filtra curioso antes de incomodar o dono
5. **Custo** — uma taxa pequena contra um mês de imóvel vazio

O item 3 é o mais forte, e só existe se as métricas forem construídas desde o começo.
Por isso os contadores estão na fase 1, não na fase 3.

---

## 11. Segurança e privacidade — checklist

- [ ] Página pública **só lê**, nunca escreve (exceto o lead, com limite de envios por IP)
- [ ] Anúncio vencido some **do banco de dados**, não só da tela
- [ ] Endereço exato (decisão 3), com autorização do dono registrada com data no cadastro
- [ ] Chave por anúncio para esconder o número quando algum proprietário preferir
- [ ] Telefone e dados do anunciante **nunca** saem na resposta pública
- [ ] Foto de anúncio inativo deixa de abrir (policy no storage)
- [ ] Formulário com consentimento LGPD e finalidade explícita
- [ ] Anti-spam simples no formulário (limite por IP + campo armadilha)
- [ ] Autorização do proprietário registrada por escrito antes de publicar fotos do imóvel dele
- [ ] Termo específico da Vitrine, separado do termo dos Aluguéis

---

## 12. Fases de implementação

### Fase 1 — Colocar no ar (o essencial)
- Aba Vitrine no topo, cor dourada, visível para quem tem o módulo (no começo, só você)
- Tabelas + função pública de leitura
- Cadastro de anunciante e de imóvel, com fotos
- Página pública com grid, busca e filtros de quartos/preço/tipo/bairro
- Página do imóvel com galeria e botão WhatsApp com código
- Contadores de visualização e contato
- Link + QR para divulgar

**Já dá para vender e cobrar.**

### Fase 2 — O que sustenta a cobrança
- Ciclo de taxa: vencimento, alerta de "a vencer", saída automática do ar
- Painel de leads com status
- Formulário de interesse no lugar do WhatsApp isolado
- Relatório do proprietário (o argumento de renovação)
- Mini-financeiro das taxas

### Fase 3 — O que impressiona
- Mapa Leaflet com pino no endereço exato
- Pontos de interesse do entorno com distância a pé
- Prévia rica no WhatsApp (Edge Function com OG tags)
- Card de Story do Instagram gerado pelo app
- Destaque pago e ordenação por destaque
- Filtros na URL para mandar link já filtrado

### Fase 4 — Escala
- Autoatendimento: o proprietário cadastra e paga sozinho (PIX já existe no app)
- Favoritos do visitante e alerta de novo imóvel no perfil dele
- Comparador lado a lado
- Vitrine para venda, não só locação

---

## 13. Decisões tomadas ✅

| # | Decisão | Escolha | O que ela determina |
|---|---|---|---|
| 1 | Nome da aba | **Vitrine** | Botão no topo, URL `/imoveis`, título da página pública |
| 2 | Taxa de divulgação | **R$ 100 a 200 por 60 dias**, em 3 faixas por valor de aluguel | Telas de cobrança, renovação e mini-financeiro |
| 3 | Endereço no mapa | **Exato sempre**, com autorização registrada e chave de exceção por anúncio | O que a função pública devolve e como o mapa desenha |
| 4 | Modelo de venda | **Módulo vendável**, separado do plano de limites | Controle de acesso do app inteiro — ver documento vizinho |
| 5 | Quem administra | **Dono da conta e funcionários** | Usa o `e_acesso_operacional()` que já existe no banco |

### Sobre a decisão 4 — o que ela realmente significa

Você não decidiu só "a Vitrine será vendida". Você decidiu que **o app vira três produtos**:

```
  Gerenciamento de Aluguéis  ──┐
  Minha Casa (low ticket)    ──┤──►  vendidos soltos ou em pacote
  Vitrine                    ──┘

  Comercial  ──►  NÃO é produto. É o seu balcão de vendas, continua só seu.
```

E o **plano** (Gratuito / Básico / Premium) continua existindo em paralelo, controlando
*quanto* a pessoa usa — não *o que* ela acessa. Um cliente pode ter a Vitrine no plano Básico.

**Isso não é uma mudança pequena.** Hoje o Minha Casa está travado por dois endereços de
e-mail escritos dentro do banco de dados. Para vendê-lo, esse trecho precisa sair.
O caminho completo está em **`ESTUDO-MODULOS-E-LICENCAS.md`**.

### Sobre a decisão 5 — por que ela é quase de graça

O banco já tem a função `e_acesso_operacional()`, que responde "esta pessoa pode operar nesta
conta?" e **já entende funcionário**. Ela é usada hoje pelos imóveis e inquilinos. A Vitrine
usa a mesma função e herda o comportamento inteiro — inclusive o bloqueio de funcionário
desativado — sem escrever regra nova.

---

## 14. Resumo do que muda no código

| Arquivo | O que acontece |
|---|---|
| `index.html` | Carregar `vitrine.js` e `vitrine.css` |
| `build.mjs` | Adicionar os arquivos novos à lista de publicação |
| `app.js` | `state.view='vitrine'` + botão no `renderTopBar()` + rota pública no `boot()` |
| `supabase.js` | Métodos `db.loadVitrine*`, `db.saveVitrine*`, `db.loadVitrinePublica` |
| `vitrine.js` (novo) | Todo o módulo — admin e público |
| `vitrine.css` (novo) | Estilos da vitrine, reaproveitando os tokens existentes |
| `migracao-vitrine.sql` (novo) | Tabelas, RLS, funções públicas, policy de storage |
| `_headers` | Liberar `img-src` dos ladrilhos do mapa |
| `netlify.toml` | Edge Function das meta tags + redirecionamento `/imoveis` |

**Nada é alterado** em `finance.js`, `houses.js`, `contracts.js`, `reports.js` ou `dashboard.js`.
A Vitrine é aditiva — se ela for desligada amanhã, o app dos aluguéis não sente.

---

*Estudo preparado a partir da leitura do código atual do app (julho/2026).*
