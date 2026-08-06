# Plano Mestre de Execução — Plataforma Aluguel

**Criado em:** 1º de agosto de 2026  
**Origem:** Auditoria Mestra, auditoria/passagem de bastão iniciada no Claude e decisões aprovadas pelo proprietário do produto.  
**Situação:** plano aprovado em nível estratégico; nenhuma fase técnica está automaticamente autorizada para execução.

**Documento de diagnóstico:** `ESTUDO-COMPARATIVO-PLATAFORMAS-IMOBILIARIAS-2026.md`.

**Atualização de 05/08/2026:** a sequência operacional consolidada, incorporando o encerramento pendente da Fase 0 e a auditoria do Imova, está em `PLANO-EXECUCAO-INTEGRADO-VITRINE-2026.md`. Este Plano Mestre permanece como referência estratégica; em caso de diferença de ordem ou recorte, o plano integrado mais recente governa a próxima execução.

---

## 1. Regra de governança

Este plano não autoriza uma implementação integral de uma só vez.

Antes de cada fase, deve ser apresentada uma proposta curta contendo:

- objetivo;
- funcionalidades incluídas;
- itens explicitamente excluídos;
- arquivos e estruturas de banco possivelmente afetados;
- riscos;
- estratégia de backup e reversão;
- testes;
- resultado esperado.

O proprietário do produto poderá aprovar, rejeitar ou retirar itens. Depois da aprovação, somente o conteúdo daquela fase poderá ser executado.

Qualquer funcionalidade, regra comercial ou mudança visual não prevista exige nova pergunta. Correções técnicas indispensáveis para concluir uma funcionalidade aprovada devem ser informadas, mas não exigem discussão linha por linha, desde que não alterem o comportamento aprovado.

### Estados possíveis

| Estado | Significado |
|---|---|
| Não iniciada | ainda não apresentada para aprovação técnica |
| Aguardando aprovação | escopo detalhado apresentado ao proprietário |
| Aprovada | autorizada dentro do escopo apresentado |
| Em execução | trabalho iniciado |
| Em validação | código pronto, aguardando testes e conferência |
| Concluída | critérios de aceite cumpridos |
| Pausada | interrompida por decisão, risco ou dependência |

---

## 2. Princípios que orientam todas as fases

1. Regularizar produção antes de ampliar o produto.
2. Não reescrever a plataforma inteira.
3. Preservar o que já funciona em locações, financeiro e portal.
4. Não tratar imóvel comercial, terreno ou rural como simples variação de casa.
5. Não copiar identidade visual de concorrentes.
6. Fotografia e dados do imóvel têm prioridade sobre decoração na Vitrine.
7. Toda mudança de banco entra no backup no mesmo trabalho.
8. Atribuição de corretor não vira restrição de leitura automaticamente.
9. Endereço aproximado é o padrão público.
10. Endereço exato depende de autorização registrada.
11. Fotos de gestão ou vistoria não são publicadas sem escolha explícita.
12. Taxa de administração incide sobre valores recebidos.
13. SEO e acessibilidade fazem parte da funcionalidade, não do acabamento posterior.
14. Métrica precisa responder uma decisão; não acumular números sem uso.
15. Cada fase termina com testes, documentação e roteiro de verificação.

---

## 3. Visão geral da sequência

| Fase | Nome | Dependência | Resultado principal |
|---:|---|---|---|
| 0 | Regularização de produção | nenhuma | banco, build e site regularizados — **escrita controlada executada; duas falhas funcionais abertas** |
| 1 | Base pública, SEO e marca | Fase 0 | imóveis encontráveis, compartilháveis e corretamente identificados |
| 2 | Vitrine residencial e descoberta | Fase 1 | mapa, filtros e ficha residencial competitiva |
| 3 | CRM essencial e corretores | Fase 0; integra com Fase 2 | lead acompanhado da origem ao fechamento |
| 4 | Desempenho e arquitetura incremental | Fases 0–3 conforme área | crescimento com menor custo e risco |
| 5 | Imóveis comerciais | base pública e CRM | cadastro e busca próprios para uso comercial |
| 6 | Terrenos | base pública, mapa e documentos | ficha voltada a potencial construtivo e localização |
| 7 | Chácaras, sítios e rural | fases anteriores + especialista | vertical rural tecnicamente responsável |
| 8 | Integrações, omnichannel e escala | CRM estabilizado | portais e canais conectados ao processo interno |
| 9 | Minha Casa e produtos opcionais | validação comercial | eventual liberação como produto separado |

As fases 2 e 3 podem ser intercaladas em entregas pequenas depois da Fase 1, mas nenhuma deve criar dois cadastros diferentes para a mesma pessoa ou lead.

---

## 4. Fase 0 — Regularização obrigatória de produção

**Apresentação operacional:** `FASE-0-REGULARIZACAO-PRODUCAO.md`.

### Objetivo

Colocar banco, aplicação publicada, build e documentação no mesmo estado antes de acrescentar funcionalidades.

### Por que bloqueia o restante

O código local já conhece campos e regras que o banco publicado ainda pode não conhecer. Embora existam fallbacks, continuar desenvolvendo nesse estado torna diagnóstico, backup e suporte mais difíceis.

### Pré-condições

- identificar o projeto Supabase e o site Netlify corretos;
- confirmar acesso administrativo;
- escolher janela de baixo uso;
- avisar os usuários que possam estar trabalhando;
- baixar exportação pelo próprio aplicativo;
- guardar uma cópia fora da pasta de publicação;
- usar conta de teste para o ensaio de restauração.

### Estado confirmado pelo preflight de produção

O roteiro inicial tinha 11 execuções. A inspeção somente leitura no Supabase confirmou que as cinco primeiras já estão aplicadas: tema por usuário, tipo do imóvel, RG do inquilino, formas de pagamento do Minha Casa e manutenção.

As 6 execuções identificadas foram concluídas e validadas em 1º de agosto de 2026:

1. `migracao-vitrine-equipe.sql` — **concluída**;
2. `migracao-vitrine-fotos.sql` — **concluída**;
3. `migracao-backup-v7.sql` — **concluída**;
4. `migracao-controle-versao.sql` — **concluída após correção de sintaxe**;
5. `migracao-proprietario-cliente.sql` — **concluída**;
6. `migracao-backup-v7.sql` novamente — **concluída**.

O projeto Supabase confirmado é **Aluguel Casas**, na branch principal de produção. O projeto Netlify confirmado é **aluguel-casas-anderton**. Depois do preflight, as seis execuções aprovadas foram aplicadas e o deploy `6a6e3934ba591c21a8b19709` foi publicado em produção.

Cada arquivo pendente deve ser executado isoladamente, com a conferência do resultado antes do seguinte. Não colar todos em uma única consulta e não reaplicar os cinco arquivos já detectados, salvo se uma nova evidência técnica justificar isso e houver aprovação.

### Pausa atual

O Supabase está no plano Free e não disponibiliza backup agendado do projeto. O backup do aplicativo e o snapshot estrutural direcionado foram validados antes da primeira alteração. O banco retornou 33/33 evidências aplicadas, a suíte local passou, o build `5375644ce1d4` gerou 51 arquivos e o deploy `6a6e3934ba591c21a8b19709` está publicado. As fumaças pública e autenticada de leitura passaram. A escrita controlada com proprietário, colaborador e inquilino temporários aprovou imóvel, inquilino, contrato, pagamento, permissões, Portal e proteção da restauração; falharam a gravação de manutenção e a ação `Apagar tudo`. Todas as contas e os dados temporários foram removidos. O trabalho está pausado aguardando autorização para diagnosticar e corrigir essas duas falhas.

### Validações obrigatórias

- `diagnostico_migracoes()` sem pendência inesperada;
- RLS e políticas ativas nas tabelas novas;
- rotina de backup preservando `imoveis.tipo` e `inquilinos.rg`;
- importação repetida recusada apenas no modo adicionar;
- restauração repetida permitida no modo substituir;
- proprietário e vínculo com imóvel sobrevivendo à restauração;
- colaborador operacional criando dados da Vitrine e o proprietário visualizando-os;
- suíte completa verde;
- build concluído;
- `dist/` coerente com a origem;
- teste de fumaça no desktop e celular.

### Roteiro mínimo de fumaça

- login e logout;
- temas e persistência da preferência;
- novo imóvel com tipo;
- novo inquilino com RG;
- manutenção com criação, conclusão, arquivo e restauração;
- Vitrine por proprietário e colaborador;
- formulário e clique do WhatsApp gerando leads sem duplicidade imediata;
- link direto voltando corretamente à lista;
- galeria, miniaturas, rodapé, CRECI e privacidade;
- exportação, restauração e importação controlada;
- proprietário, extrato, PDF e resumo;
- publicação da gestão para a Vitrine sem duplicar anúncio.

### Fora do escopo

- alterar layout;
- criar CRM novo;
- mudar expiração;
- adicionar mapa;
- alterar modelo comercial;
- refatorar módulos grandes.

### Critério de conclusão

Produção, diagnóstico do banco, testes e build concordam; o roteiro de fumaça passa; o backup foi verificado numa conta de teste; nenhuma funcionalidade nova foi introduzida.

---

## 5. Fase 1 — Base pública, SEO e marca da imobiliária

### Objetivo

Fazer cada anúncio público ser corretamente encontrado, identificado, compartilhado e atribuído à imobiliária responsável.

### Escopo proposto

- URLs limpas e estáveis para Vitrine, cidade, bairro, tipo e anúncio;
- sitemap atualizado automaticamente;
- JSON-LD apropriado a imóvel, organização e navegação;
- título, descrição, canonical e imagem social por página;
- regras para anúncio removido, alugado, vendido ou inativo;
- páginas indexáveis de cidade, bairro, tipo e finalidade somente quando houver conteúdo real;
- logo, nome, CRECI, WhatsApp e dados públicos da imobiliária;
- cor principal configurável dentro de uma faixa com contraste validado;
- assinatura discreta “Tecnologia Aluguel”;
- política pública de privacidade e consentimento coerente;
- medição básica de origem, visualização e contato.

### Decisões já aprovadas

- a área administrativa mantém a identidade da plataforma;
- a Vitrine pode ter marca própria da imobiliária;
- personalização não permite quebrar contraste, legibilidade ou estrutura;
- o SEO entra imediatamente depois da Fase 0.

### Riscos

- páginas vazias ou duplicadas prejudicarem indexação;
- permitir cores que deixem texto ilegível;
- URL antiga perder acesso;
- expor dados pessoais como se fossem dados institucionais;
- sitemap listar anúncio privado ou inativo.

### Testes esperados

- canonical único;
- preview em WhatsApp e redes sociais;
- JSON-LD válido;
- sitemap contendo somente páginas públicas válidas;
- redirecionamentos preservando links antigos;
- contraste da marca personalizada;
- anúncio inativo fora de busca e sitemap;
- nenhuma informação privada do proprietário retornada ao visitante.

### Critério de conclusão

Um anúncio pode ser encontrado, compartilhado e identificado corretamente, com marca da imobiliária, sem expor dados indevidos ou criar páginas duplicadas.

---

## 6. Fase 2 — Vitrine residencial e descoberta

### Objetivo

Elevar a experiência pública residencial do nível de catálogo simples para uma jornada de descoberta e decisão.

### Ordem interna aprovada

1. mapa e filtros;
2. favoritos;
3. alertas de novos imóveis;
4. agendamento de visita;
5. proposta;
6. imóveis semelhantes;
7. comparação lado a lado.

### 2.1 Mapa e filtros

- lista e mapa sincronizados;
- pesquisa por cidade, bairro, rua de referência e área visível;
- localização aproximada por padrão;
- endereço exato somente com autorização registrada;
- configuração individual por anúncio;
- filtros por finalidade, tipo, preço, quartos, banheiros, vagas, área, pet, mobília e características;
- total mensal apresentado de forma clara: aluguel, condomínio e IPTU quando aplicável;
- filtros refletidos na URL;
- resultado vazio com sugestões úteis.

### 2.2 Favoritos e alertas

- favorito sem exigir cadastro prematuro, quando tecnicamente seguro;
- sincronização após login, caso exista conta do visitante;
- alerta por perfil de busca;
- controle de frequência e cancelamento;
- consentimento explícito para WhatsApp ou e-mail.

### 2.3 Visita e proposta

- corretor ou responsável visível;
- horários disponíveis;
- pedido e confirmação de visita;
- lembretes;
- registro do comparecimento;
- proposta ligada ao imóvel, interessado e corretor;
- histórico de alterações da proposta;
- nenhum compromisso jurídico implícito sem texto adequado.

### 2.4 Fotos da gestão

Ao publicar um imóvel administrado, oferecer três caminhos:

- selecionar imagens existentes apropriadas;
- enviar imagens comerciais novas;
- publicar sem copiar e completar depois.

Não copiar automaticamente fotos de vistoria, manutenção, medidor, documento ou arquivo privado. A seleção deve mostrar origem e permitir ordenar, legendar e escolher capa.

### Expiração aprovada

- imóvel administrado pode ficar publicado enquanto disponível;
- imóvel de terceiro pode ter período configurável;
- destaque pago é opcional;
- alertas precedem o vencimento;
- retirada automática nunca ocorre sem aviso ao responsável;
- alugado ou vendido sai da busca, mas permanece no histórico interno.

### Critério de conclusão

O visitante encontra, filtra, entende, salva e inicia uma ação comercial sem precisar reconstruir o contexto no WhatsApp.

---

## 7. Fase 3 — CRM essencial e corretores

### Objetivo

Transformar interessado e lead em processo acompanhado, com responsabilidade, prazo e histórico.

### Modelo de equipe aprovado

- todos os colaboradores autorizados enxergam todos os imóveis e leads da conta;
- imóvel e lead podem ter responsável;
- responsabilidade organiza trabalho e gera métricas;
- atribuição não altera automaticamente RLS ou permissão;
- troca de responsável entra no histórico.

### Escopo essencial

- caixa de entrada de leads;
- identificação e deduplicação por telefone/e-mail;
- origem e campanha;
- responsável atual;
- prazo de primeira resposta e indicador de atraso;
- etapas configuradas do funil;
- histórico de contatos;
- observações e preferências;
- vínculo com um ou mais imóveis;
- visita, proposta, tarefa e próximo retorno;
- motivos padronizados de perda;
- conversão deliberada do clique de WhatsApp em interessado qualificado;
- métricas por anúncio, origem, etapa e corretor.

### Funil inicial sugerido

```text
Novo → Em qualificação → Contatado → Visita agendada
     → Visita realizada → Proposta → Fechado/Perdido
```

O funil poderá variar por locação, venda ou segmento, mas deve começar simples.

### Indicadores úteis

- tempo até primeira resposta;
- leads sem responsável;
- leads sem próxima tarefa;
- conversão para visita;
- comparecimento;
- conversão para proposta;
- conversão por canal;
- tempo por etapa;
- imóveis com procura e sem proposta;
- imóveis sem procura;
- desempenho por corretor sem usar ranking isolado como punição.

### Fora do escopo inicial

- chatbot autônomo;
- IA para decidir atendimento;
- integração com todos os portais;
- gravação automática completa do WhatsApp;
- redistribuição complexa por performance;
- campanhas de marketing em massa.

### Critério de conclusão

Todo lead relevante tem origem, responsável, prazo, histórico, próxima ação e desfecho mensurável.

---

## 8. Fase 4 — Desempenho, testes e arquitetura incremental

### Objetivo

Reduzir custo técnico e risco sem interromper a evolução comercial.

### Abordagem aprovada

Não haverá reescrita total. Cada módulo será separado quando houver benefício concreto e testes suficientes.

### Frentes

#### Dados e carregamento

- carregar por padrão somente o período operacional necessário;
- últimos 24 meses como hipótese inicial, a validar;
- histórico antigo sob demanda;
- paginação para auditoria, leads, pagamentos, energia e cobranças;
- evitar buscar anexos e fotos antes de serem necessários;
- índices de banco orientados por consultas reais.

#### Separação de responsabilidades

- dividir `supabase.js` por domínio gradualmente;
- separar área interna e pública de `vitrine.js`;
- carregar Minha Casa e Comercial somente quando abertos;
- preservar a ordem de scripts enquanto a arquitetura global existir;
- qualquer arquivo novo entra em `index.html`, `build.mjs` e `service-worker.js` quando aplicável.

#### Qualidade

- manter as asserções de regras existentes;
- adicionar testes reais de navegador para jornadas críticas;
- regressão visual dos principais breakpoints;
- acessibilidade por teclado e leitor de tela;
- teste de datas controladas;
- teste de migração e restauração;
- observabilidade de erros e performance.

#### Design system

- reduzir cores literais remanescentes;
- reduzir textos abaixo do piso;
- eliminar seletores duplicados;
- migrar espaçamentos livres gradualmente;
- nunca elevar os tetos da catraca para acomodar código novo.

### Critério de conclusão contínua

Cada intervenção deve demonstrar melhoria mensurável — tempo de carregamento, redução de acoplamento, cobertura de jornada ou diminuição de dívida — sem alterar regras de negócio silenciosamente.

---

## 9. Fase 5 — Imóveis comerciais

### Objetivo

Criar cadastro e descoberta adequados a negócios, não reutilizar a ficha residencial de forma superficial.

### Taxonomia mínima

- loja;
- sala/conjunto;
- galpão;
- clínica/consultório;
- indústria;
- logística;
- hotelaria;
- prédio comercial;
- ponto comercial;
- outros definidos com controle.

### Dados próprios

- zoneamento e usos permitidos;
- área útil e área total;
- pé-direito e vão livre;
- carga elétrica e trifásico;
- gerador e climatização;
- docas, pátio e acesso de caminhões;
- fachada, vitrine e visibilidade;
- estacionamento;
- acessibilidade;
- AVCB, habite-se e licenças;
- condomínio, IPTU, luvas e cessão de ponto;
- disponibilidade para formatos especiais quando aplicável.

### Experiência

- filtros comerciais próprios;
- mapa e acesso logístico;
- arquivos técnicos controlados;
- corretor com especialidade comercial;
- visita e proposta adaptadas ao negócio.

### Critério de conclusão

Uma empresa consegue avaliar se o imóvel suporta sua operação antes de iniciar o contato.

---

## 10. Fase 6 — Terrenos

### Objetivo

Apresentar potencial construtivo, situação documental e geometria do imóvel.

### Dados necessários

- área, frente, fundos e laterais;
- formato e topografia;
- tipo de solo quando conhecido;
- zoneamento;
- coeficiente de aproveitamento e ocupação;
- infraestrutura disponível;
- pavimentação, drenagem e acesso;
- matrícula, escritura e situação fiscal;
- restrições conhecidas;
- coordenadas e polígono;
- estudo de potencial construtivo quando existir.

### Critério de conclusão

O terreno pode ser pesquisado e comparado pelo que permite construir, não apenas por preço e metragem.

---

## 11. Fase 7 — Chácaras, sítios e propriedades rurais

### Objetivo

Entrar no segmento rural apenas quando a plataforma puder sustentar informação técnica, documentação e atendimento especializado.

### Condição de entrada

Não iniciar apenas para acrescentar “chácara” ao seletor. A fase exige participação de pessoa com conhecimento rural, definição regional de medidas e validação jurídica/documental.

### Dados mínimos

- área total, aberta, produtiva, reserva e APP;
- hectares e alqueires com conversão regional explícita;
- aptidão de uso;
- nascentes, rios, represas, poços e outorgas;
- solo, relevo, altitude, chuva e clima quando disponíveis;
- casas, curral, barracão, silo, energia e cercas;
- acesso e distâncias logísticas;
- CAR, CCIR, ITR, georreferenciamento, matrícula e licenças;
- arrendamento e produção, quando aplicável;
- perímetro no mapa e imagens aéreas;
- especialista responsável.

### Serviços que podem ser apenas indicados, não prometidos sem parceiro

- avaliação agronômica;
- due diligence;
- regularização fundiária;
- compliance ambiental;
- análise de viabilidade;
- operações estruturadas.

### Critério de conclusão

O anúncio rural permite uma primeira análise técnica responsável e deixa claro o que foi verificado, declarado ou ainda precisa de diligência.

---

## 12. Fase 8 — Integrações, omnichannel e escala comercial

### Objetivo

Conectar canais externos depois que o CRM interno estiver estável.

### Ordem recomendada

1. entrada padronizada de leads por webhook/API;
2. integração com os canais que já geram demanda real;
3. WhatsApp com histórico consentido e transferência para humano;
4. publicação em portais prioritários;
5. retorno de leads dos portais;
6. distribuição automática por região, segmento, plantão ou rodízio;
7. redistribuição por falta de atendimento;
8. relatórios de investimento e conversão por canal.

### Regra

Não contratar ou construir integração somente porque é comum no mercado. Cada canal precisa ter dono, volume, custo, SLA e métrica de retorno.

### Critério de conclusão

O lead entra uma vez, mantém sua origem, recebe responsável e pode ser acompanhado sem copiar dados manualmente entre sistemas.

---

## 13. Fase 9 — Minha Casa e produtos opcionais

### Decisão aprovada

Minha Casa permanece separado do produto de gestão imobiliária e não é prioridade imediata.

### Antes de liberar

- definir público comprador;
- validar problema e disposição de pagamento;
- escolher se é produto independente ou adicional;
- revisar isolamento de dados e permissões;
- produzir comunicação própria;
- evitar prometer o recurso como disponível para todos antes da liberação real;
- medir suporte necessário.

### Critério de decisão

Somente avançar se houver hipótese comercial clara, público identificado e vantagem maior do que o custo de manter mais um produto.

---

## 14. Backlog classificado

### Obrigatório antes de evoluir

- Fase 0 completa;
- diagnóstico de migrações;
- restauração validada;
- produção testada.

### Alto valor próximo

- SEO e marca pública;
- mapa e filtros residenciais;
- responsável, SLA e histórico do lead;
- carregamento paginado;
- fotos selecionáveis na publicação;
- expiração configurável.

### Valor posterior

- favoritos e alertas;
- visita e proposta;
- imóveis semelhantes;
- indicadores por corretor;
- comercial;
- terrenos;
- integrações prioritárias.

### Somente após validação

- comparação lado a lado;
- recomendação inteligente;
- chatbot;
- omnichannel completo;
- rural;
- Minha Casa aberto comercialmente;
- múltiplas unidades ou franquias.

---

## 15. Itens deliberadamente rejeitados ou adiados

- copiar cores ou layout da RE/MAX, QuintoAndar ou portais;
- reescrever toda a aplicação antes de validar o crescimento;
- copiar automaticamente fotos técnicas para anúncio;
- esconder imóvel de todos porque foi atribuído a um corretor;
- mostrar endereço exato por padrão;
- lançar todos os segmentos ao mesmo tempo;
- construir omnichannel antes do CRM essencial;
- misturar Minha Casa à comunicação principal;
- usar IA para compensar cadastro ou processo desorganizado;
- tratar comparador como prioridade anterior a mapa, filtros e atendimento.

---

## 16. Modelo de apresentação para aprovação de cada fase

Antes de iniciar, apresentar:

```text
FASE:
OBJETIVO:
PROBLEMA QUE RESOLVE:
ITENS INCLUÍDOS:
ITENS EXCLUÍDOS:
DECISÕES JÁ APROVADAS:
NOVAS DECISÕES NECESSÁRIAS:
ARQUIVOS/ESTRUTURAS AFETADOS:
RISCOS:
BACKUP E REVERSÃO:
TESTES:
CRITÉRIOS DE ACEITE:
```

Somente depois da resposta explícita a fase muda para “Aprovada”.

---

## 17. Próxima ação permitida

A próxima conversa de execução deve tratar exclusivamente da **Fase 0**.

Antes de qualquer comando externo ou alteração no banco, apresentar:

- o projeto Supabase que será afetado;
- a existência e localização do backup;
- a ordem exata dos arquivos;
- como cada resultado será conferido;
- como interromper com segurança;
- o roteiro de validação posterior;
- quais ações exigem confirmação no momento da execução.

Este plano não autoriza aplicar SQL, publicar no Netlify, alterar produção ou modificar código sem essa aprovação operacional específica.
