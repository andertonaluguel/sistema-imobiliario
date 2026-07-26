# Mini manual de identidade visual e verbal — Aluguel

**Versão:** 1.0  
**Data:** 22 de julho de 2026  
**Aplicação:** produto, landing page, apresentação, proposta, PDF, WhatsApp e redes sociais

## 1. Essência da marca

O Aluguel ajuda o pequeno proprietário a transformar uma rotina fragmentada em uma gestão clara e acionável. A identidade original foi definida no código como **“livro-caixa / talão: verde-escuro + latão + papel”**. Essa ideia combina três sinais:

- **Livro-caixa:** organização, registro e continuidade.
- **Casa:** foco direto no patrimônio residencial.
- **Tecnologia discreta:** interface moderna sem parecer distante ou corporativa demais.

### Atributos

**Clara · confiável · prática · organizada · humana · contemporânea**

### Ideia visual central

Uma página de controle bem cuidada: superfícies de papel, blocos estruturados, números precisos, detalhes em latão e alertas usados somente quando há necessidade real.

## 2. Nome e assinatura

### Nome oficial

**Aluguel**

### Descriptor permitido

**Gestão de Casas**

O descriptor pode aparecer separado em título de página, metadado ou linha de apoio. Não deve ser incorporado ao símbolo nem substituir o nome.

### Tagline comercial recomendada

**Cada aluguel no lugar certo.**

A tagline é um ativo verbal; não faz parte obrigatória do lockup oficial.

## 3. Símbolo e lockups

O símbolo oficial é uma casa compacta formada por:

- telhado triangular;
- corpo retangular com cantos discretos;
- chaminé à direita;
- duas janelas quadradas.

A geometria foi extraída literalmente de `app.js:66-72`. Não redesenhar, arredondar, inclinar ou substituir suas formas.

### Versões oficiais

| Contexto | Arquivo | Cores |
|---|---|---|
| Fundo claro | `aluguel-lockup-horizontal-fundo-claro.svg` | símbolo `#B8863C`, janelas/nome `#14322A` |
| Fundo escuro | `aluguel-lockup-horizontal-fundo-escuro.svg` | símbolo `#E2BE78`, janelas `#14322A`, nome `#F7F6F2` |
| Uso reduzido | `aluguel-simbolo.svg` | padrão latão + verde; cores editáveis por variáveis |

### Área de proteção

Manter ao redor da marca uma área mínima igual à largura de uma janela do símbolo. Nenhum texto, borda, foto, QR Code ou outro logo deve entrar nessa área.

### Tamanho mínimo

- Símbolo: 24 px em tela ou 7 mm impresso.
- Lockup horizontal: 140 px em tela ou 38 mm impresso.
- Abaixo desses tamanhos, usar apenas o símbolo e testar legibilidade.

### Fundos

- Preferir `#F7F6F2`, branco ou `#14322A`.
- Sobre fotografia, criar uma área limpa ou aplicar overlay verde suficientemente escuro.
- Evitar textura ou contraste que interfira nas janelas.

### Usos proibidos

- Distorcer proporções.
- Trocar a fonte do nome dentro do lockup.
- Reposicionar chaminé ou janelas.
- Adicionar gradiente, relevo, brilho, contorno ou sombra ao símbolo.
- Usar latão médio para texto pequeno em fundo papel.
- Colocar a versão para fundo escuro diretamente sobre branco.
- Incorporar slogan ou nome de plano ao lockup sem uma composição separada.

## 4. Paleta

### Paleta principal

| Token | HEX | Papel na identidade | Uso recomendado |
|---|---|---|---|
| Verde capa | `#14322A` | autoridade e estrutura | fundos escuros, CTA principal, cabeçalhos |
| Verde capa claro | `#1F4339` | profundidade | hover e blocos secundários |
| Papel | `#F7F6F2` | proximidade e leitura | fundo principal |
| Branco | `#FFFFFF` | clareza | cards e áreas de conteúdo |
| Tinta | `#1C2620` | precisão | texto principal |
| Tinta suave | `#5C6B63` | hierarquia | texto secundário |
| Latão | `#B8863C` | assinatura | símbolo, linhas, ícones grandes, detalhes |
| Latão profundo | `#8C631F` | destaque legível | texto e números em fundo claro |
| Latão claro | `#E2BE78` | energia sobre capa | símbolo e destaque em verde-escuro |
| Latão suave | `#F1E4C8` | ênfase calma | chips, fundos e destaques |

### Cores funcionais

| Estado | Principal | Suave | Regra |
|---|---|---|---|
| Atraso/erro | `#A23B2E` | `#F4DCD7` | reservado para urgência, erro ou exclusão |
| Atenção/pendência | `#D99A0E` | `#FBEFC2` | prazo próximo ou item pendente |
| Manutenção | `#3E6B8A` | `#DCE7ED` | informação operacional de manutenção |
| Neutro/vaga | `#93A099` | `#E7E9E4` | ausência, inatividade ou estado neutro |

### Contraste e acessibilidade

Pares verificados:

- `#14322A` sobre `#F7F6F2`: 12,78:1.
- `#1C2620` sobre `#F7F6F2`: 14,41:1.
- `#5C6B63` sobre `#F7F6F2`: 5,19:1.
- `#8C631F` sobre `#F7F6F2`: 4,95:1.
- `#E2BE78` sobre `#14322A`: 7,81:1.
- `#A23B2E` sobre `#F7F6F2`: 6,07:1.

O latão `#B8863C` sobre papel tem contraste aproximado de 2,98:1. Usá-lo como elemento decorativo, ícone grande ou borda; para texto pequeno, usar `#8C631F`.

Não comunicar status somente por cor. Combinar cor com rótulo, valor e, quando útil, ícone.

## 5. Tipografia

### Space Grotesk

Uso: marca, títulos, headlines, nomes de cards e chamadas.  
Pesos: 500, 600 e 700.  
Caráter: contemporâneo, direto e técnico sem parecer frio.

### IBM Plex Sans

Uso: textos corridos, botões, legendas, formulários e explicações.  
Pesos: 400, 500 e 600.  
Regra: priorizar frases curtas e entrelinha generosa.

### IBM Plex Mono

Uso: valores, datas, meses, porcentagens, status, tabelas e pequenos rótulos em caixa alta.  
Pesos: 400, 500 e 600.  
Regra: não usar em parágrafos longos.

### Hierarquia recomendada

| Nível | Família | Peso | Escala | Uso |
|---|---|---:|---:|---|
| Hero | Space Grotesk | 700 | 40–72 px responsivo | promessa principal |
| H1 | Space Grotesk | 700 | 34 px | título de página/material |
| H2 | Space Grotesk | 700 | 26 px | seção |
| H3 | Space Grotesk | 600 | 20 px | bloco/card |
| Corpo | IBM Plex Sans | 400 | 16–18 px | leitura principal |
| Corpo pequeno | IBM Plex Sans | 400/500 | 14 px | apoio e legenda |
| Eyebrow | IBM Plex Mono | 600 | 11 px | categoria, em caixa alta e tracking 0,12 em |
| Dados | IBM Plex Mono | 500/600 | conforme contexto | valores, datas e indicadores |

## 6. Layout e componentes

### Grid

- Desktop: 12 colunas, largura máxima de 1.152 px, respiro lateral mínimo de 24 px.
- Tablet: 8 colunas.
- Mobile: 4 colunas, respiro lateral de 18–20 px.
- Texto corrido: máximo de aproximadamente 672 px.

### Espaçamento

Usar escala em base 4: 4, 8, 12, 16, 24, 32, 48, 64 e 96 px. Em materiais premium, preferir mais respiro a aumentar o número de elementos.

### Cards

- Fundo branco ou papel.
- Borda `#E3DFD3` de 1 px.
- Raio entre 12 e 18 px.
- Sombra suave, nunca brilhante ou excessiva.
- Uma informação principal por card.
- Status em chip e valor em IBM Plex Mono.

### Botões

**Primário:** verde capa, texto branco, altura mínima 44 px.  
**Secundário:** transparente ou branco, borda neutra, texto verde/tinta.  
**WhatsApp:** pode usar verde do canal apenas no ícone; manter o componente alinhado à marca.  
**Destrutivo:** ferrugem, usado somente em ações irreversíveis.

Rótulos começam com verbo: `Ver demonstração`, `Começar gratuitamente`, `Falar no WhatsApp`, `Solicitar proposta`.

### Ícones

- Traço simples ou formas sólidas geométricas, conforme o sistema do app.
- Cantos discretamente arredondados.
- Cor principal verde/tinta; latão para destaque.
- Não misturar ilustrações 3D, emojis e ícones outline no mesmo material.

## 7. Fotografia, screenshots e mockups

### Screenshots

- Usar telas reais do aplicativo.
- Preferir dashboard, grade de casas, detalhe do imóvel, contratos, energia, interessados e portal.
- Remover ou substituir dados pessoais por dados demonstrativos profissionais.
- Manter status e números coerentes entre as telas de uma mesma narrativa.
- Não adicionar menus, integrações ou resultados inexistentes.

### Mockups

- Priorizar navegador e smartphone de aparência discreta.
- Moldura neutra, sem reflexos intensos.
- Interface deve permanecer legível; mockup não pode ser apenas decoração.
- Usar sombra verde suave e fundo papel/verde.
- Quando destacar uma função, usar uma legenda curta e uma seta simples, não uma nuvem de elementos.

### Fotografia

- Casas residenciais brasileiras reais e bem cuidadas.
- Proprietário usando celular ou notebook em contexto natural.
- Detalhes de chave, medidor, contrato e manutenção quando relacionados ao conteúdo.
- Luz natural, tons quentes e composição organizada.

Evitar mansões aspiracionais desconectadas do ICP, prédios corporativos, fotos com dinheiro voando, chaves gigantes, aperto de mãos genérico e pessoas excessivamente posadas.

## 8. Diagramas e dados

- Diagramas usam verde para estrutura, latão para ação/valor e ferrugem apenas para risco.
- Fluxos devem ter de três a cinco etapas visíveis.
- Gráficos usam rótulos diretos; não depender de legenda distante.
- Números comerciais sem fonte não podem ser apresentados como prova.
- Dados demonstrativos devem ser marcados como **Exemplo demonstrativo** quando puderem ser confundidos com resultado real.

## 9. Tom de voz

### Como a marca fala

- Começa pelo problema real do proprietário.
- Usa verbos concretos: ver, registrar, acompanhar, cobrar, consultar, organizar.
- Explica tecnologia pelo efeito prático.
- Assume com clareza quando uma etapa é manual.
- Prefere uma frase específica a uma promessa grandiosa.

### Exemplos aprovados

- “Veja quais casas precisam de atenção hoje.”
- “Registre o pagamento e preserve o histórico do contrato.”
- “Prepare a cobrança com mês, valor e PIX.”
- “Energia e aluguel organizados no contexto da mesma casa.”
- “Comece com uma casa no plano Gratuito.”

### Exemplos proibidos

- “Automatize 100% da sua operação.”
- “Nunca mais tenha inadimplência.”
- “A inteligência artificial encontra o inquilino perfeito.”
- “O sistema mais completo e seguro do mercado.”
- “Aumente sua renda imediatamente.”

## 10. Aplicação por material

### Landing page

- Hero verde-escuro com marca para fundo escuro.
- Headline curta em Space Grotesk.
- Mockup real como principal elemento de prova.
- Seções em papel e branco alternados.
- CTA latão profundo sobre fundo claro ou branco sobre verde.

### Apresentação e PDF

- Formato 16:9 para apresentação; A4 quando for documento comercial.
- Capa com pouco texto, símbolo e mockup.
- Uma mensagem principal por página.
- Números e status com IBM Plex Mono.
- Rodapé discreto com data, versão e contato.

### WhatsApp

- Arte 1080 × 1080 ou 1080 × 1350 para prévia legível.
- Headline de até duas linhas.
- Um benefício, uma tela e um CTA.
- Não inserir parágrafos na arte; o contexto fica na mensagem.

### Instagram

- Feed 1080 × 1350; Stories/Reels 1080 × 1920.
- Área segura de 80 px no feed e 140 px nas bordas verticais de Stories/Reels.
- Alternar conteúdo com tela do produto, educação e prova de processo.
- Capas com eyebrow, headline e um elemento visual central.

## 11. Checklist de aprovação

- [ ] O símbolo mantém a geometria original.
- [ ] A versão do logo corresponde ao fundo.
- [ ] O latão médio não foi usado em texto pequeno sobre papel.
- [ ] A hierarquia usa Space Grotesk, IBM Plex Sans e IBM Plex Mono corretamente.
- [ ] Há respiro suficiente ao redor de logo, títulos e QR Codes.
- [ ] A tela exibida existe no aplicativo.
- [ ] Dados pessoais foram removidos ou substituídos.
- [ ] Status não depende apenas da cor.
- [ ] O CTA é específico e está testado.
- [ ] Claims respeitam o diagnóstico comercial.
- [ ] Arquivo editável e exportação final têm data e versão.

---

**Fonte operacional:** `brand-tokens.json` e `brand-tokens.css`.  
**Fonte estratégica:** `../estrategia/diagnostico-comercial.md`.  
**Regra de manutenção:** qualquer alteração visual deve continuar compatível com a marca usada no aplicativo.
