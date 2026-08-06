# Auditoria Imova × Vitrine Aluguel

**Data da auditoria:** 05/08/2026  
**Escopo:** experiência pública, cadastro, login, área autenticada, anúncio, planos, contato e caminho de compra.  
**Objetivo:** usar o melhor do Imova como referência para evoluir a nossa Vitrine sem perder o que já fazemos melhor.

---

## 1. Resumo executivo

O Imova é uma excelente referência de **percepção de produto**, principalmente na home, busca, filtros, ficha do imóvel e apresentação comercial. Ele transmite escala por meio de muita informação, galerias grandes, mapa, taxonomia extensa e uma navegação visualmente consistente.

Entretanto, a auditoria real encontrou uma distância importante entre a vitrine pública e o produto autenticado:

- a home, a busca e as fichas públicas funcionam;
- o cadastro e a confirmação de e-mail funcionam;
- o login é aceito e redireciona para `/app`;
- depois do login, o dashboard fica completamente em branco e o JavaScript registra `Connection closed`;
- a busca autenticada `/app/buscar` também fica branca;
- os planos profissionais de R$ 499 e R$ 999 não possuem checkout: os botões abrem uma conversa no WhatsApp;
- a compra de anúncio de proprietário é prometida por R$ 199, com Stripe, cartão, débito e PIX, mas o fluxo interno não pôde ser alcançado porque o painel autenticado não carrega;
- vários recursos avançados são **promessas comerciais**, não funcionalidades que puderam ser comprovadas em uso.

Portanto, não devemos “copiar 100%” o Imova literalmente. Devemos copiar sua **densidade informacional, organização visual e capacidade de descoberta**, preservando a confiabilidade, o custo mensal completo, o WhatsApp contextual e a integração administrativa que a nossa Vitrine já entrega.

### Decisão recomendada

Construir a evolução em quatro camadas:

1. busca e filtros realmente úteis para nossa região;
2. ficha do imóvel muito mais rica;
3. favoritos, comparação, busca salva e acompanhamento do interessado;
4. automação comercial conectada ao nosso módulo de gestão.

Não priorizar agora internacionalização, marketplace multi-anunciante, cripto, IA generativa ou rede de 20 portais. Esses itens ampliam escopo, custo e risco antes de resolverem a conversão local.

---

## 2. Metodologia e grau de confiança

O estudo anterior misturava itens vistos na interface, textos de marketing e possibilidades existentes no código publicado. Esta versão separa as evidências.

| Nível | Significado |
|---|---|
| **Comprovado** | Tela acessada e comportamento observado em 05/08/2026. |
| **Exposto** | Campo, botão ou rota aparece na interface, mas a operação completa não foi executada. |
| **Prometido** | Recurso descrito pela página comercial ou FAQ, sem comprovação dentro do painel. |
| **Quebrado** | A rota existe, mas não entrega interface utilizável. |

### Conta usada na auditoria

Foi criada e confirmada uma conta de cliente. O cadastro concluiu corretamente e o login redirecionou para a área interna. O dashboard autenticado não carregou, mesmo após atualização da página.

### Limites deliberados

- nenhum pagamento real foi feito;
- nenhum formulário de contato foi enviado a anunciante;
- nenhuma proposta foi enviada;
- nenhum WhatsApp comercial foi disparado;
- não se considerou uma promessa de marketing como recurso pronto.

---

## 3. O que somos e o que o Imova é

| Dimensão | Imova | Nossa Vitrine |
|---|---|---|
| Modelo | Portal multi-anunciante e ecossistema imobiliário | Vitrine de uma operação local integrada à gestão |
| Estoque observado | 1.713 imóveis na busca pública | Carteira própria e imóveis de proprietários atendidos |
| Receita anunciada | R$ 199 por anúncio de proprietário; planos de R$ 499 e R$ 999/mês para profissionais | Taxa de divulgação e relacionamento direto |
| Conversão | Contato com anunciante e venda de publicação | WhatsApp contextual + lead integrado ao app |
| Escala | Mais de 90 países e 7 idiomas, segundo o próprio site | Cidades e público regionais |
| Operação interna | Promete CRM, HUB, contratos e financeiro | Já possui imóveis, proprietários, contratos, cobranças, manutenção, energia e portal |

O Imova vende **amplitude**. Nós podemos vencer em **profundidade operacional, confiança e atendimento local**.

---

## 4. Jornada completa observada

### 4.1 Home pública — comprovada

#### Cabeçalho

- logotipo;
- Imóveis;
- menu Soluções;
- Blog;
- Anunciar;
- seletor de país;
- Entrar.

#### Hero

- título aspiracional: “Do imóvel em que está até o imóvel em que quer estar”;
- texto de escala global;
- seletor de país;
- seletor de cidade;
- botão Buscar;
- entrada para assistente inteligente por linguagem natural.

#### Conteúdo

- carrossel de imóveis em destaque;
- níveis “Destaque” e “Super destaque”;
- seleção por estado e abas por cidade;
- cards com carrossel de fotos, finalidade, preço, área, quartos e banheiros;
- bloco de soluções do ecossistema;
- vertical rural RELAND;
- notícias e guias;
- FAQ;
- vinte buscas populares para SEO;
- links de aplicativos.

#### O que trazer

- hero mais orientado à busca;
- destaque visual por cidade;
- cards de destaque antes da grade completa;
- FAQ enxuto;
- links de buscas locais prontas, como “Casas para alugar em Lajedo”;
- conteúdo educativo apenas depois de a vitrine principal estar madura.

#### O que manter nosso

- entrada por cidade com contagem de aluguel e venda;
- identidade local e contato humano;
- foco em poucas cidades, sem seletor global desnecessário.

---

### 4.2 Busca e resultados — comprovada

A busca pública mostrou **1.713 imóveis encontrados**.

#### Estrutura visual

- filtros em coluna lateral;
- título e contagem no topo;
- ordenação;
- alternância Lista, Cards e Mapa;
- botão Salvar busca;
- paginação;
- CTA para salvar a busca no fim da grade.

#### Filtros expostos

- finalidade: Todos, Alugar, Comprar;
- localização;
- estado;
- cidade;
- tipo do imóvel;
- preço;
- características;
- comodidades;
- filtros especiais;
- avançado.

Os grupos são recolhidos em acordeões. Isso reduz a sensação de excesso, embora esconda opções importantes de primeira visita.

#### Card observado

- galeria navegável sem abrir o imóvel;
- contador de fotos;
- localização;
- bandeira do país;
- preço e periodicidade;
- finalidade;
- área;
- quartos;
- banheiros;
- vagas;
- comparar;
- favoritar;
- botão Ver imóvel.

#### Problemas encontrados

- títulos extremamente longos vindos de importação;
- inconsistência entre título e preço mostrado;
- anúncio descrito como R$ 30.000/ano aparece como R$ 30.000/mês;
- imóvel anunciado por R$ 23.400/mês aparece por R$ 20.000/mês;
- alguns cards transformam descrição comercial em título;
- a mistura de dados importados reduz confiança;
- cards carregam grande quantidade de fotos e podem pesar em conexão móvel.

#### O que trazer

- favoritar;
- comparar;
- salvar busca;
- ordenação;
- modo mapa;
- contador de resultados;
- filtros agrupados;
- carrossel no card com carregamento limitado e progressivo;
- chips mostrando os filtros ativos;
- botão Limpar filtros sempre visível.

#### O que fazer melhor

- normalizar preço, periodicidade e título antes da publicação;
- mostrar **total mensal** além do aluguel;
- limitar o título a uma descrição legível;
- não carregar 25–100 fotos por card;
- esconder ações que dependam de login somente depois de explicar seu benefício.

---

### 4.3 Ficha do imóvel — comprovada

A ficha auditada foi “Vila Olimpia - 3 Suites - 2 vagas”, referência `891b4d11`.

#### Topo

- breadcrumb completo;
- referência curta com ação de copiar;
- data relativa de publicação;
- mosaico de fotos;
- contador de fotos;
- badge “Direto com proprietário”;
- expandir;
- comparar;
- favoritar;
- compartilhar.

#### Régua de informações

- área útil;
- área total;
- quartos;
- suítes;
- banheiros.

Vagas, andar, idade e conservação fazem parte do modelo, mas não apareceram preenchidos na régua do imóvel auditado.

#### Abas realmente observadas

O imóvel mostrou quatro abas, não a lista maior atribuída ao sistema no estudo anterior:

1. Detalhes e Condições;
2. Comodidades do Imóvel;
3. Infra do Condomínio;
4. Documentação.

#### Detalhes e condições

- descrição;
- tipo;
- áreas;
- andar;
- idade;
- conservação;
- localização;
- mapa OpenStreetMap;
- link para mapa completo.

#### Comodidades observadas

- alarme;
- ar-condicionado;
- área de serviço;
- armários em banheiro, cozinha, quarto e sala;
- cozinha;
- elevador;
- interfone;
- lavabo;
- lavanderia;
- mobiliado;
- porcelanato;
- portão eletrônico.

#### Infraestrutura do condomínio

A aba existe, porém o imóvel auditado mostrou “Sem amenidades cadastradas para o condomínio”.

#### Documentação

O sistema apresenta uma lista objetiva:

- matrícula atualizada;
- escritura registrada;
- Habite-se;
- IPTU em dia;
- condomínio em dia;
- possibilidade de financiamento;
- penhor ou ônus;
- inventário;
- usucapião;
- distrato anterior.

Todos os itens estavam como “Não informado”. A ideia é boa; a execução precisa tratar ausência de dados sem criar uma grande parede de incerteza.

#### Localização e relatório

- mapa incorporado;
- coordenada aproximada;
- IDH;
- segurança;
- valorização;
- relatório indicado como gerado por IA.

Os números mostrados — IDH 0,84, segurança 8,2 e valorização +4,2% — precisam de fonte e data. Sem isso, parecem precisos, mas não são auditáveis.

#### Coluna de conversão

- preço principal;
- finalidade;
- indicação do que está incluso;
- aluguel;
- condomínio;
- IPTU;
- nome;
- e-mail opcional;
- WhatsApp obrigatório;
- mensagem opcional;
- card do anunciante;
- outros anúncios do anunciante;
- mensagem interna;
- WhatsApp;
- comparação de preço por m²;
- denúncia.

#### Problemas comprovados na ficha

- “Incluso: condomínio e IPTU” contradiz a decomposição visual dos valores;
- imóveis similares podem aparecer por `R$ 0`;
- cidade, bairro e imóvel aparecem como `R$ 0/m²`;
- o selo dizia “Direto com proprietário”, mas o responsável exibido era uma imobiliária com 958 imóveis;
- o relatório regional não mostra fonte;
- o termo jurídico é muito longo e compete com o conteúdo;
- dados ausentes ocupam espaço como se fossem informação útil.

#### O que trazer com prioridade máxima

- referência copiável;
- publicado há X dias;
- mosaico melhor;
- favoritar, compartilhar e comparar;
- área útil e total;
- suítes;
- andar, idade e conservação;
- abas por assunto;
- comodidades separadas entre imóvel, condomínio e região;
- situação documental;
- mapa;
- card sticky de preço e contato;
- outros imóveis do mesmo responsável;
- denúncia;
- termo de responsabilidade recolhível.

#### O que manter nosso

- total mensal calculado;
- WhatsApp com mensagem pronta e código do imóvel;
- registro automático de clique como lead;
- legenda individual de foto;
- lightbox com teclado e gesto;
- barra de conversão fixa no mobile;
- imóveis parecidos por cidade, tipo e preço;
- consentimento LGPD explícito.

---

### 4.4 Cadastro — comprovado

#### Cadastro de cliente

- país;
- nome completo;
- e-mail;
- senha com mínimo de oito caracteres;
- termos e privacidade;
- link para login;
- ligação com Google;
- Apple desabilitado e marcado “em breve”.

Após o envio, o sistema apresenta:

- confirmação de cadastro;
- e-mail usado;
- instrução para conferir caixa de entrada e spam;
- link de retorno ao login.

O e-mail de confirmação foi recebido e a conta foi ativada com sucesso.

#### Qualidade de interface

- tela em duas colunas;
- formulário simples;
- imagem editorial;
- alternância visual entre área do cliente e área profissional;
- menu lateral aparece mesmo antes de o usuário possuir sessão útil.

#### Problemas

- `/app/login` chegou a abrir em branco;
- as rotas específicas, como `/app/login/cliente`, funcionam melhor;
- o menu lateral mostra muitos destinos antes do login, mas esses destinos não são utilizáveis;
- “Ao clicar em continuar” aparece mesmo quando o botão se chama “Criar minha conta”.

---

### 4.5 Login — comprovado

Campos e ações:

- e-mail;
- senha;
- mostrar senha;
- esqueci minha senha;
- entrar;
- cadastro;
- Google;
- Apple em breve;
- área profissional.

O login aceitou as credenciais confirmadas e redirecionou para `/app`.

---

### 4.6 Área autenticada — quebrada

O menu expõe os seguintes destinos para o interessado:

- Dashboard;
- Buscar Imóveis;
- Radar;
- Favoritos;
- Comparar;
- Recentes;
- Mensagens Enviadas;
- Central de Conhecimento;
- Notícias;
- Ferramentas e Guias;
- Soluções IMOVA;
- Chat com Suporte;
- Onboarding;
- Configurações.

Existe ainda um alternador de modo “Interessado / Proprietário”.

#### Resultado do teste

- `/app`: tela branca;
- `/app/buscar`: tela branca;
- atualização da página: continua branca;
- erro registrado no frontend: `Connection closed`.

Consequentemente, Radar, Favoritos, Comparar, Recentes, Mensagens e Configurações devem ser tratados como **rotas expostas**, não funcionalidades comprovadas.

---

### 4.7 Anunciar como proprietário — parcialmente comprovado

A página comercial promete:

- R$ 199 por anúncio;
- pagamento único;
- anúncio no ar até vender ou alugar;
- sem comissão;
- sem mensalidade;
- edição de fotos, preço e descrição;
- métricas em tempo real;
- pausar e reativar;
- até 100 fotos em um ponto da página e “até 30 + condomínio” em sua própria tabela comparativa;
- publicação instantânea após pagamento;
- Stripe;
- cartão, débito e PIX;
- propostas formais;
- notificações;
- programa de indicação.

#### Inconsistências comerciais

- “anúncio para sempre” convive com “cancele quando quiser”, embora não haja assinatura;
- um bloco promete até 100 fotos e outro informa até 30;
- o texto diz que a taxa não é reembolsável após ativação;
- o endereço não pode ser alterado depois da ativação;
- o checkout não pôde ser acessado porque o painel ficou branco.

#### Situação

- preço e oferta: **comprovados na página comercial**;
- cadastro: **comprovado**;
- painel de proprietário: **não comprovado**;
- formulário do imóvel: **não comprovado em execução**;
- Stripe/PIX: **prometidos**;
- checkout final: **inacessível**.

---

### 4.8 Corretor e imobiliária — página comercial comprovada

#### Planos anunciados

| Plano | Limite | Preço |
|---|---:|---:|
| Autônomo | Até 50 imóveis | R$ 499/mês |
| Imobiliária | Até 100 imóveis | R$ 999/mês |
| Profissional + HUB | Até 1.000 imóveis | Sob consulta |

#### Recursos prometidos

- CRM de leads;
- Kanban;
- filtros, tags e busca;
- favoritos;
- perfil de interesse;
- dashboard de conversão;
- campanhas de WhatsApp;
- XML;
- página pública personalizada;
- distribuição e roteamento de leads;
- relatórios;
- equipe;
- multiportal.

#### Compra profissional

Não existe checkout nos botões observados:

- “Começar agora” abre WhatsApp com mensagem para o plano Autônomo;
- “Escolher plano” abre WhatsApp para o plano Imobiliária;
- “Falar com vendas” abre WhatsApp para o HUB.

Portanto, o “fluxo de compra final” profissional é atendimento comercial humano, não compra self-service.

---

## 5. Inventário de filtros recomendado para nossa Vitrine

### 5.1 Primeira linha — sempre visível

- Alugar / Comprar;
- cidade;
- bairro;
- tipo;
- preço mínimo e máximo;
- quartos;
- botão Mais filtros.

### 5.2 Mais filtros — prioridade alta

- área útil mínima e máxima;
- área total mínima e máxima;
- banheiros;
- suítes;
- vagas;
- mobiliado;
- aceita pets;
- conservação;
- condomínio fechado;
- acessibilidade;
- data de publicação;
- ordenar por relevância, menor preço, maior preço, mais recente e maior área.

### 5.3 Comodidades do imóvel

- sala de estar;
- sala de jantar;
- cozinha americana;
- cozinha planejada;
- despensa;
- lavanderia;
- área de serviço;
- escritório;
- lavabo;
- closet;
- varanda/sacada;
- varanda gourmet;
- quintal;
- jardim;
- churrasqueira;
- piscina privativa;
- ar-condicionado;
- ventilador;
- energia solar;
- armários embutidos;
- mobiliado / semimobiliado;
- acessibilidade.

### 5.4 Condomínio

- elevador;
- portaria;
- câmeras;
- controle de acesso;
- salão de festas;
- piscina;
- academia;
- playground;
- brinquedoteca;
- churrasqueira;
- espaço gourmet;
- coworking;
- pet place;
- bicicletário;
- vaga para visitante;
- carregador elétrico;
- coleta seletiva;
- água individual;
- gás encanado.

### 5.5 Região

- perto de escola;
- supermercado;
- farmácia;
- hospital/posto de saúde;
- academia;
- praça/parque;
- transporte público;
- centro;
- rodovia;
- rua pavimentada;
- rua tranquila;
- iluminação pública;
- internet fibra;
- água e esgoto.

### 5.6 Terrenos — manter nosso diferencial

- frente;
- fundo;
- área total;
- topografia;
- esquina;
- murado;
- pavimentação;
- água;
- energia;
- esgoto;
- documentação;
- aptidão residencial, comercial ou rural.

### Regra de produto

Não mostrar todas as opções no primeiro nível. O usuário deve encontrar rápido o essencial e aprofundar apenas quando quiser.

---

## 6. O que nossa Vitrine já faz melhor

Itens comprovados no código atual que devem permanecer:

1. **Custo total mensal** por meio de `vitrineCustoTotal()` e `vitrineTotalMes()`.
2. **WhatsApp contextual** por `vitrineWhatsappUrl()` e registro do clique.
3. **Entrada por cidade** com contagem por finalidade.
4. **Alugar e comprar** com faixas de preço adaptadas.
5. **Terreno com campos próprios** e mudança dinâmica do formulário.
6. **Filtros compartilháveis na URL**.
7. **Lightbox com teclado e swipe**.
8. **Legenda individual por foto**.
9. **Barra fixa de conversão no celular**.
10. **Carregamento em blocos** e miniaturas no card.
11. **Imóveis parecidos**.
12. **Privacidade e LGPD explícitas**.
13. **Integração do anúncio com proprietário, lead, taxa e gestão**.
14. **PWA e operação mesmo em conectividade ruim**.

Esses pontos são nossa base. A evolução não deve substituir a Vitrine por um portal genérico.

---

## 7. Lacunas reais do nosso produto

### Busca

- não há favoritos persistentes;
- não há comparação;
- não há busca salva/alerta;
- não há modo mapa na grade;
- faltam ordenações;
- faltam filtros por área total, suítes, conservação e comodidades amplas;
- falta uma taxonomia consistente de imóvel, condomínio e região.

### Ficha

- poucos dados estruturados;
- documentação não é apresentada;
- não há data relativa de publicação;
- referência ainda pode ganhar ação de copiar mais evidente;
- falta separar comodidades por contexto;
- falta galeria separada de condomínio;
- falta perfil público do anunciante/equipe;
- falta denúncia;
- falta histórico de atualização;
- falta bloco de condições de locação e garantias.

### Conversão

- lead ainda pode ganhar etapas e follow-up;
- falta agendar visita;
- falta salvar interesse sem enviar contato;
- falta alerta de mudança de preço;
- falta registrar origem da campanha;
- falta distribuição de lead entre membros da equipe.

### Conteúdo e confiança

- falta FAQ público;
- falta explicar o processo de aluguel/compra;
- falta deixar claro o nível de verificação do anúncio;
- falta uma política visual para dados “não informados”.

---

## 8. Nova arquitetura proposta

### 8.1 Página inicial da Vitrine

1. cabeçalho compacto;
2. hero com Alugar/Comprar, cidade e busca;
3. cidades atendidas;
4. imóveis em destaque;
5. busca por tipo;
6. como funciona;
7. segurança e atendimento;
8. FAQ;
9. buscas populares locais;
10. rodapé.

### 8.2 Resultados

1. breadcrumb;
2. título + quantidade;
3. chips de filtros ativos;
4. ordenação;
5. lista/cards/mapa;
6. sidebar desktop ou gaveta mobile;
7. cards;
8. paginação ou carregar mais;
9. salvar busca.

### 8.3 Ficha

1. breadcrumb e referência;
2. título, localização e publicado há X dias;
3. galeria;
4. ações;
5. régua de dados;
6. preço e total mensal;
7. descrição;
8. condições;
9. comodidades do imóvel;
10. condomínio;
11. região;
12. documentação;
13. mapa;
14. contato/agendamento;
15. anunciante;
16. similares;
17. denúncia e aviso legal.

### 8.4 Área do interessado

- favoritos;
- buscas salvas;
- alertas;
- comparações;
- visitas recentes;
- mensagens/contatos enviados;
- visitas agendadas;
- preferências.

### 8.5 Área administrativa

- anúncios;
- fotos e ordem;
- publicação e validade;
- leads;
- funil;
- follow-up;
- equipe e distribuição;
- métricas;
- origem dos leads;
- imóveis mais vistos;
- cliques no WhatsApp;
- conversão por anúncio.

---

## 9. Design: o que copiar e como adaptar

### Copiar como princípio

- muito espaço em branco;
- títulos fortes e textos curtos;
- azul reservado para ação;
- cards com raio consistente;
- ícones simples;
- grupos de filtro em acordeão;
- coluna de contato sticky;
- régua de especificações;
- navegação por abas;
- estados vazios explícitos;
- feedback após cadastro;
- ações secundárias por ícone com rótulo acessível.

### Não copiar literalmente

- a identidade azul genérica;
- grandes blocos de propaganda antes do produto;
- títulos importados sem revisão;
- excesso de dados “não informados”;
- relatório com números sem fonte;
- menu interno exibido antes de haver sessão útil;
- dezenas de funcionalidades apenas anunciadas;
- formulário de contato que esconde o custo total.

### Direção visual para nossa marca

- manter os tokens atuais como fonte da verdade;
- reforçar verde/dourado da marca, com contraste adequado;
- usar azul apenas se fizer parte da identidade definida, não por imitação;
- fotografia maior, mas progressiva;
- foco mobile para 4G;
- alvos mínimos de toque de 44 px;
- filtros críticos acessíveis com uma mão;
- preço total e WhatsApp sempre próximos.

---

## 10. Plano de implementação

### Fase 0 — base de dados e qualidade

- definir tipos e subtipos;
- criar catálogos de comodidades;
- separar imóvel, condomínio e região;
- adicionar área útil/total, suítes, idade e conservação;
- adicionar garantias e condições;
- adicionar documentação;
- validar preço e periodicidade;
- criar política para campos vazios;
- manter compatibilidade com registros atuais.

**Critério de saída:** nenhum dado existente é perdido e o formulário antigo continua salvando.

### Fase 1 — busca e cards

- novo cabeçalho de busca;
- chips ativos;
- preço mínimo/máximo;
- quartos, suítes, banheiros e vagas;
- áreas;
- conservação;
- ordenação;
- card com favorito e comparação;
- performance de imagens;
- gaveta mobile.

**Critério de saída:** filtros persistem na URL e funcionam em desktop e mobile.

### Fase 2 — ficha premium

- breadcrumb e referência copiável;
- galeria aprimorada;
- régua completa;
- abas;
- condições e garantias;
- três grupos de comodidades;
- documentação;
- mapa;
- anunciante;
- denúncia;
- sticky de contato;
- total mensal preservado.

**Critério de saída:** a ficha responde às perguntas mais comuns sem depender do WhatsApp.

### Fase 3 — retenção do interessado

- favoritos;
- comparação de até quatro imóveis;
- busca salva;
- alerta de imóvel novo;
- alerta de preço;
- recentes;
- agendamento de visita.

**Critério de saída:** usuário consegue retomar sua pesquisa em outro dispositivo.

### Fase 4 — operação comercial

- pipeline de leads;
- responsável pelo lead;
- tarefas e follow-up;
- histórico;
- métricas de visualização, WhatsApp e formulário;
- origem UTM;
- resposta rápida;
- match entre interesse cadastrado e imóvel.

**Critério de saída:** nenhum lead depende de memória ou conversa solta.

### Fase 5 — crescimento

- páginas SEO locais;
- FAQ;
- conteúdo de orientação;
- integração opcional com portais;
- relatórios de mercado com fonte;
- busca em linguagem natural somente se houver volume que justifique.

---

## 11. Priorização objetiva

| Item | Impacto | Esforço | Prioridade |
|---|---:|---:|---:|
| Mais filtros úteis | Alto | Médio | P0 |
| Ficha em abas | Alto | Médio | P0 |
| Comodidades estruturadas | Alto | Médio | P0 |
| Total mensal preservado | Alto | Baixo | P0 |
| Área total, suítes e conservação | Alto | Baixo | P0 |
| Favoritos | Alto | Médio | P1 |
| Comparação | Médio | Médio | P1 |
| Busca salva | Alto | Médio | P1 |
| Mapa | Médio | Médio | P1 |
| Agendamento | Alto | Médio | P1 |
| Documentação | Médio | Médio | P1 |
| Funil de leads | Alto | Alto | P2 |
| Perfil do anunciante | Médio | Médio | P2 |
| SEO local | Médio | Médio | P2 |
| IA de busca | Incerto | Alto | P3 |
| Criptomoedas | Baixo | Alto | Não priorizar |
| Internacionalização | Baixo | Muito alto | Não priorizar |

---

## 12. Requisitos de aceitação essenciais

### Performance

- não carregar a galeria completa em cada card;
- imagens responsivas e lazy loading;
- primeira interação rápida em 4G;
- mapa carregado somente quando necessário;
- filtros não podem recarregar a página inteira.

### Acessibilidade

- foco visível;
- navegação por teclado;
- rótulos em ícones;
- contraste AA;
- modal com captura e devolução de foco;
- respeito a `prefers-reduced-motion`;
- 44 px para alvos de toque.

### Dados

- preço e periodicidade validados;
- suíte não maior que quartos;
- campos específicos por tipo;
- endereço público configurável;
- log de alteração;
- anúncio expirado não aparece;
- dados não informados não viram zero.

### Conversão

- WhatsApp contém referência, título e preço;
- formulário exige consentimento;
- lead registra origem e imóvel;
- total mensal é mostrado;
- ações não enviam nada sem confirmação clara.

### Responsividade

- busca em 360 px;
- filtros em gaveta;
- sticky inferior sem cobrir conteúdo;
- galeria por swipe;
- tabelas convertidas em cards;
- nenhuma rolagem horizontal acidental.

---

## 13. Conclusão

O Imova deve ser usado como **biblioteca de padrões e ambição**, não como produto a ser clonado.

O melhor dele está no exterior do funil:

- home convincente;
- busca rica;
- cards densos;
- ficha organizada;
- apresentação comercial forte.

O ponto fraco está justamente onde nossa aplicação é mais madura:

- operação autenticada;
- consistência dos dados;
- ligação entre divulgação e gestão;
- custo mensal claro;
- atendimento contextual;
- confiabilidade regional.

A estratégia correta é combinar:

> **a riqueza de descoberta do Imova + a profundidade operacional do nosso Aluguel.**

Se executarmos as fases P0 e P1 sem perder o que já existe, nossa Vitrine ficará visualmente tão completa quanto o concorrente, porém mais confiável, leve e adequada ao cliente real que atendemos.
