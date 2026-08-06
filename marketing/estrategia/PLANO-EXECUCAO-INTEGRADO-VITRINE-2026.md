# Plano integrado de execução — regularização + evolução da Vitrine

**Criado em:** 05/08/2026

**Produto:** Plataforma Aluguel

**Estado:** Fase 0 e Etapas 1 a 6 concluídas em produção em 05/08/2026. A
agenda pública permanece sem horários até o responsável cadastrar sua
disponibilidade real.
**Fontes consolidadas:**

- `FASE-0-REGULARIZACAO-PRODUCAO.md`;
- `PLANO-MESTRE-EXECUCAO-2026.md`;
- `ESTUDO-IMOVA-VITRINE.md`;
- `PASSO-A-PASSO-PUBLICACAO-ETAPA-ATUAL.md`;
- código atual de `vitrine.js`, `vitrine.css`, `supabase.js` e migrações da Vitrine.

---

## 1. Resultado esperado

Evoluir a Vitrine atual para uma jornada imobiliária completa sem perder seus diferenciais:

- total mensal calculado;
- WhatsApp contextual;
- lead registrado no sistema;
- entrada por cidade;
- suporte específico a terrenos;
- fotos com legenda;
- experiência móvel leve;
- vínculo com proprietários, imóveis, taxas e operação interna.

A nova versão deverá acrescentar:

- filtros ricos e ordenação;
- cards mais informativos;
- ficha premium em abas;
- documentação, garantias e condições;
- comodidades estruturadas;
- favoritos, comparação e busca salva;
- agendamento;
- CRM operacional;
- SEO, marca e medição confiáveis.

O Imova é referência de descoberta e apresentação. Ele não será copiado literalmente, porque sua área autenticada estava quebrada na auditoria e vários recursos eram apenas promessas comerciais.

---

## 2. Situação de partida

### Atualização de execução — 05/08/2026

- Fase 0 encerrada em produção: manutenção e `Apagar tudo` corrigidos, testados
  com contas isoladas e publicados;
- conta, perfil, configurações, assinatura, termos e backups permanecem fora da
  exclusão;
- Etapa 1 aplicada no Supabase com backup lógico anterior, contagens preservadas
  e isolamento confirmado;
- formulário progressivo, API pública V2 e Backup V8 publicados no Netlify;
- testes automatizados e fumaça pública aprovados;
- Etapa 2 publicada com rotas estáveis, canonical, sitemap, JSON-LD e marca por
  paletas aprovadas;
- Etapa 2 encerrada no build `af06d9e04146` e deploy `6a73d9cf8561823253d5da67`;
- Etapa 3 autorizada, implementada e validada em desktop e celular;
- build `680d72046dac`; deploy de produção `6a73df8cc87b1526d78ebe99`;
- como a cota recusou um novo deploy `--prod`, o pacote de prévia já aprovado foi
  promovido diretamente, sem novo build, mudança de plano ou cobrança;
- fumaça da URL principal aprovada, com filtros, favoritos e console limpo.

### Produção

- Supabase regularizado e com as migrações 36 e 37 registradas;
- isolamento da fundação, API pública, marca e sitemap confirmados;
- Netlify publicado no deploy `6a73df8cc87b1526d78ebe99`;
- build `680d72046dac` e testes aprovados em 05/08/2026;
- fumaça pública aprovada na lista, filtros, favoritos e ficha por URL profunda;
- rollback imediato conhecido: deploy da Etapa 2 `6a73d9cf8561823253d5da67`.

### Bloqueios abertos da Fase 0

Nenhum. As duas falhas foram corrigidas e a Fase 0 foi encerrada. A limitação
restante desta publicação é de evidência: a sessão usada no smoke da Etapa 1 não
estava autenticada, portanto não foi criado rascunho administrativo na conta
real. A escrita e a serialização permanecem cobertas pela suíte automatizada.

### Vitrine atual

Já possui:

- cidades;
- aluguel, venda e ambos;
- filtros básicos e finos;
- filtros na URL;
- cards com fotos;
- ficha pública;
- lightbox;
- mapa na ficha;
- leads;
- WhatsApp;
- similares;
- fotos e legendas;
- publicação ligada ao imóvel administrado;
- proprietários unificados;
- suporte de equipe;
- PWA.

### Limitações principais

- taxonomia curta de comodidades;
- poucos filtros estruturados;
- ficha com poucos blocos;
- ausência de favoritos persistentes;
- ausência de comparação;
- ausência de busca salva;
- ausência de ordenação completa;
- ausência de mapa sincronizado na busca;
- ausência de documentação e condições estruturadas;
- lead sem acompanhamento operacional completo.

---

## 3. Regras de execução

1. Uma entrega por vez, sempre publicável e reversível.
2. Nenhuma fase começa com o portão anterior aberto.
3. Mudança de banco inclui exportação, importação e restauração no mesmo trabalho.
4. Migração nova entra no diagnóstico de versões.
5. Campos novos são aditivos e compatíveis com registros antigos.
6. Campo vazio não é convertido em zero nem em `false` sem confirmação.
7. Fotos privadas nunca são publicadas automaticamente.
8. Endereço aproximado permanece o padrão.
9. Total mensal e WhatsApp contextual são requisitos de regressão.
10. Arquivo novo carregado pelo app entra em `build.mjs`.
11. CSS novo usa `tokens.css` e não eleva os tetos da catraca.
12. Toda entrega termina com `npm.cmd test` e `npm.cmd run build`.
13. Produção exige backup, roteiro de fumaça e referência do deploy anterior.
14. Não misturar correção emergencial, migração de dados e redesenho visual no mesmo deploy.

---

## 4. Visão geral da execução

| Etapa | Entrega | Dependência | Duração indicativa | Estado inicial |
|---:|---|---|---:|---|
| 0A | Fechar as duas falhas da regularização | nenhuma | 2–4 dias | Concluída em 05/08/2026 |
| 0B | Repetir fumaça e encerrar Fase 0 | 0A | 1 dia | Concluída em 05/08/2026 |
| 1 | Fundação de dados da Vitrine | Fase 0 concluída | 4–7 dias | Concluída em produção em 05/08/2026 |
| 2 | Base pública, SEO e marca | 1 | 4–7 dias | Concluída em produção em 05/08/2026 |
| 3 | Busca, filtros e cards | 1 e 2 | 7–12 dias | Concluída em produção em 05/08/2026 |
| 4 | Ficha premium do imóvel | 1 e 3 | 7–12 dias | Concluída em produção em 05/08/2026 |
| 5 | Favoritos, comparação e busca salva | 3 e 4 | 6–10 dias | Concluída em produção em 05/08/2026 |
| 6 | Agendamento e conversão | 4 e 5 | 5–8 dias | Concluída em produção em 05/08/2026 |
| 7 | CRM operacional | 6 | 8–15 dias | Concluída em produção em 06/08/2026 |
| 8 | Performance, acessibilidade e observabilidade | transversal | 4–8 dias finais + trabalho contínuo | Fechamento concluído em produção em 06/08/2026; melhoria contínua |

As durações são faixas de planejamento, não prazos contratuais. Cada etapa deve ser dividida em entregas menores quando ultrapassar uma semana.

---

## 5. Etapa 0A — corrigir os bloqueios atuais

### Objetivo

Resolver somente as duas falhas encontradas na fumaça de produção, sem adicionar funcionalidade.

### 0A.1 Manutenção não salva

#### Diagnóstico

- reproduzir localmente com proprietário novo;
- reproduzir com colaborador operacional;
- inspecionar payload enviado por `maintenance.js`;
- conferir conversão em `supabase.js`;
- comparar colunas obrigatórias e constraints de `chamados`;
- conferir RLS e funções de autorização;
- diferenciar falha de validação, schema cache, constraint e policy;
- preservar a mensagem técnica em log sem expor dados ao usuário.

#### Correção aceitável

- ajustar payload, fallback, policy ou migração somente conforme a causa comprovada;
- manter compatibilidade com contas existentes;
- adicionar teste que falhava antes;
- não alterar fluxo visual fora do necessário.

#### Aceite

- proprietário novo cria manutenção;
- operacional autorizado cria manutenção;
- ambos visualizam o registro;
- não autorizado continua bloqueado;
- concluir, arquivar e restaurar continuam funcionando.

### 0A.2 `Apagar tudo` falha

#### Diagnóstico

- levantar ordem real das exclusões;
- identificar FK, trigger, policy ou tabela omitida;
- comparar com todas as tabelas adicionadas depois da rotina;
- testar apenas em conta temporária;
- verificar que uma falha mantém dados intactos ou informa exatamente o que não foi apagado.

#### Correção aceitável

- atualizar a operação atômica e sua lista de dependências;
- impedir execução parcial;
- exigir confirmação forte;
- preservar conta e sessão conforme a regra atual;
- registrar teste para tabelas novas.

#### Aceite

- conta temporária com dados em todos os módulos pode ser limpa;
- nenhuma linha pertencente a outra conta é alterada;
- falha simulada provoca rollback;
- interface confirma conclusão;
- login continua utilizável depois da limpeza, conforme comportamento previsto.

### Arquivos prováveis

- `maintenance.js`;
- `supabase.js`;
- `backup.js` ou rotina equivalente da Zona de risco;
- migração corretiva, somente se a causa estiver no banco;
- testes do domínio afetado;
- documentação da Fase 0.

### Fora do escopo

- layout da Vitrine;
- filtros;
- CRM;
- SEO;
- refatoração ampla.

---

## 6. Etapa 0B — encerrar formalmente a Fase 0

### Roteiro

1. criar proprietário temporário;
2. criar colaborador operacional;
3. criar imóvel, inquilino e contrato mínimos;
4. salvar manutenção nos dois papéis autorizados;
5. concluir, arquivar e restaurar manutenção;
6. gerar exportação;
7. verificar proteção de restauração;
8. executar `Apagar tudo` na conta temporária;
9. confirmar isolamento das três contas reais;
10. remover contas temporárias;
11. rodar suíte completa;
12. gerar build;
13. publicar;
14. repetir fumaça curta em produção;
15. atualizar `FASE-0-REGULARIZACAO-PRODUCAO.md` para **Concluída**.

### Portão de saída

- duas falhas fechadas;
- testes verdes;
- build identificado;
- deploy identificado;
- rollback conhecido;
- nenhuma conta temporária remanescente;
- Fase 0 declarada concluída.

---

## 7. Etapa 1 — fundação de dados da Vitrine

> **Estado em 05/08/2026: concluída em produção.** A migração
> `migracao-vitrine-fundacao.sql`, o formulário progressivo, a leitura pública
> V2 e o Backup V8 foram implementados, testados e publicados. O banco preservou
> as contagens existentes, as tabelas novas ficaram com RLS forçada e a RPC
> pública não expôs observação privada. Build `731d6d852758`; deploy
> `6a73d165cb2dd40c79baf120`. Evidências e reversão estão em
> `PASSO-A-PASSO-PUBLICACAO-ETAPA-ATUAL.md`.

### Objetivo

Preparar o modelo de dados antes de ampliar filtros e ficha.

### 1.1 Campos centrais

- área útil;
- área total;
- quartos;
- suítes;
- banheiros;
- vagas;
- andar;
- total de andares, quando aplicável;
- ano de construção ou idade;
- conservação;
- mobiliado;
- aceita pets;
- disponibilidade;
- data de atualização;
- endereço público: oculto, aproximado ou exato;
- latitude e longitude públicas aproximadas;
- referência copiável.

Verificar o que já existe em `migracao-vitrine-detalhes.sql` antes de criar qualquer coluna.

### 1.2 Condições de locação e venda

- garantias aceitas;
- prazo mínimo;
- índice de reajuste;
- custos incluídos;
- aceita estudante;
- aceita pessoa jurídica;
- aceita criança;
- aceita pet;
- permite sublocação;
- financiamento;
- permuta;
- situação de ocupação.

Campos com pouco uso podem permanecer ocultos no formulário até serem necessários.

### 1.3 Comodidades estruturadas

Criar catálogo administrado, sem centenas de colunas booleanas.

#### Grupos

- imóvel;
- condomínio;
- região;
- terreno;
- acessibilidade;
- sustentabilidade.

#### Estrutura sugerida

- catálogo de comodidades;
- vínculo anúncio–comodidade;
- código estável;
- rótulo;
- grupo;
- ordem;
- ativo;
- aplicável a tipos específicos.

### 1.4 Documentação

- matrícula atualizada;
- escritura;
- Habite-se;
- IPTU;
- condomínio;
- financiamento;
- ônus;
- inventário;
- usucapião;
- observação privada separada do estado público.

Usar estado triário: `sim`, `não`, `não informado`.

### 1.5 Terrenos

Preservar e completar:

- frente;
- fundo;
- área;
- topografia;
- esquina;
- murado;
- pavimentação;
- água;
- energia;
- esgoto;
- aptidão.

### 1.6 Backup e restauração

No mesmo trabalho:

- exportar novos campos e vínculos;
- importar em modo adicionar;
- restaurar em modo substituir;
- recusar duplicidade conforme regra existente;
- preservar anúncios antigos;
- registrar migração no diagnóstico.

### Entregas técnicas

- migração transacional e reexecutável;
- adaptadores em `supabase.js`;
- formulário administrativo progressivo;
- testes de serialização;
- fixture de backup atualizada;
- documentação de publicação.

### Aceite

- anúncio antigo abre e salva sem regressão;
- anúncio novo preserva todos os campos;
- suíte/backup restaura os dados;
- nenhum campo ausente aparece como zero;
- anúncio público não recebe observação privada.

---

## 8. Etapa 2 — base pública, SEO e marca

> **Estado em 05/08/2026: concluída em produção.** Rotas estáveis, canonical,
> Open Graph, Twitter Cards, JSON-LD, sitemap, robots e identidade por paletas
> controladas foram publicados. Links antigos continuam compatíveis. Build
> `af06d9e04146`; deploy `6a73d9cf8561823253d5da67`. Evidências e rollback
> estão em `PASSO-A-PASSO-PUBLICACAO-ETAPA-ATUAL.md`.

### Objetivo

Garantir uma fundação indexável e compartilhável antes de ampliar a interface.

### Entregas

- URL estável por vitrine, cidade, finalidade, tipo e imóvel;
- compatibilidade e redirecionamento de links antigos;
- canonical único;
- título e descrição por página;
- imagem social do imóvel;
- sitemap somente com conteúdo ativo;
- JSON-LD de organização, breadcrumb e oferta imobiliária;
- páginas locais apenas quando houver conteúdo real;
- marca pública: nome, logo, CRECI e contato;
- cores configuráveis dentro de combinações aprovadas;
- privacidade e consentimento;
- visualização, WhatsApp e formulário com origem/UTM.

### Não fazer

- gerar páginas vazias por combinação de filtro;
- indexar busca livre;
- expor nome ou telefone privado do proprietário;
- criar blog antes de a Vitrine principal estar pronta;
- permitir qualquer cor livre no CSS.

### Aceite

- link abre corretamente em desktop e celular;
- preview do WhatsApp usa foto, título e preço;
- sitemap exclui inativos;
- canonical não muda com filtros cosméticos;
- dados estruturados são válidos;
- contraste da marca passa AA.

---

## 9. Etapa 3 — busca, filtros e cards

**Situação em 05/08/2026:** concluída em produção. O pacote não altera o banco.
Suíte automatizada, build isolado, fumaça local, prévia e URL principal foram
aprovados. O deploy ativo é `6a73df8cc87b1526d78ebe99`.

### Objetivo

Permitir que o visitante encontre o imóvel adequado sem depender do WhatsApp.

### 3.1 Primeira linha

- Alugar / Comprar;
- cidade;
- bairro;
- tipo;
- preço mínimo e máximo;
- quartos;
- Mais filtros.

### 3.2 Mais filtros

- áreas útil e total;
- banheiros;
- suítes;
- vagas;
- conservação;
- mobiliado;
- pets;
- condomínio fechado;
- acessibilidade;
- comodidades prioritárias.

### 3.3 Resultado

- quantidade encontrada;
- chips ativos;
- limpar filtros;
- ordenação: relevância, menor preço, maior preço, mais recente e maior área;
- lista/cards;
- mapa sincronizado, se aprovado para esta entrega;
- estado vazio com alternativas;
- URL compartilhável;
- paginação ou carregar mais.

### 3.4 Card

- foto de capa;
- carrossel limitado, sem baixar a galeria completa;
- finalidade;
- localização aproximada;
- preço principal;
- **total mensal**;
- área;
- quartos;
- banheiros;
- vagas;
- favorito;
- comparar;
- selo de destaque somente com regra real.

### Mobile

- filtros em gaveta;
- contagem no botão;
- chips roláveis;
- alvos de 44 px;
- sem rolagem horizontal acidental;
- fotos com `srcset` e lazy loading.

### Aceite

- cada filtro altera somente resultados compatíveis;
- atualizar a página preserva filtros;
- voltar do detalhe preserva lista e rolagem quando possível;
- nenhuma combinação gera preço ou finalidade incoerentes;
- teste em conexão 3G não baixa fotos de tamanho original na grade.

---

## 10. Etapa 4 — ficha premium

### Objetivo

Responder às dúvidas decisivas do cliente antes do contato.

### Estrutura

1. breadcrumb;
2. referência e copiar;
3. publicado/atualizado há X dias;
4. título e localização;
5. galeria;
6. favoritar, comparar e compartilhar;
7. régua de especificações;
8. preço, custos e total mensal;
9. descrição;
10. detalhes e condições;
11. comodidades do imóvel;
12. condomínio;
13. região;
14. documentação;
15. mapa;
16. contato/agendamento;
17. responsável;
18. imóveis similares;
19. denúncia e aviso legal.

### Galeria

- mosaico desktop;
- capa + contador mobile;
- lightbox atual preservado;
- teclado, swipe e foco;
- legenda;
- possível álbum separado de condomínio;
- nenhuma foto privada por inferência.

### Conversão

- coluna sticky desktop;
- barra inferior mobile;
- aluguel, condomínio, IPTU e total;
- WhatsApp com contexto;
- formulário com consentimento;
- agendamento apenas depois da Etapa 6;
- fonte do lead preservada.

### Dados ausentes

- ocultar especificação não informada quando ela não ajuda;
- em documentação, mostrar “Não informado” somente dentro da aba aberta;
- nunca exibir `R$ 0` como preço ou comparação;
- não inventar indicadores de bairro sem fonte.

### Aceite

- ficha funciona sem JavaScript crítico quando possível;
- foco e teclado passam;
- total mensal confere;
- similar nunca mostra preço zero;
- compartilhamento mantém referência correta;
- LGPD e privacidade preservadas.

---

## 11. Etapa 5 — retenção do interessado

### 5.1 Favoritos

- funcionar localmente antes do cadastro;
- sincronizar depois de autenticação opcional;
- remover e restaurar sem duplicar;
- indicar claramente o estado.

### 5.2 Comparação

- até quatro imóveis;
- preço e total mensal;
- área;
- quartos, suítes, banheiros e vagas;
- condições;
- comodidades prioritárias;
- esconder linhas iguais opcionalmente;
- marcar dados ausentes sem transformá-los em desvantagem.

### 5.3 Busca salva

- nome opcional;
- resumo de filtros;
- frequência;
- e-mail ou WhatsApp somente com consentimento;
- cancelar com facilidade;
- deduplicar busca equivalente.

### 5.4 Recentes e alerta de preço

- histórico limitado;
- limpeza pelo usuário;
- alerta apenas se o preço realmente mudar;
- não criar perfil oculto sem consentimento.

### Aceite

- visitante retoma sua seleção;
- login não apaga favoritos locais;
- comparação não mistura aluguel e venda de maneira enganosa;
- alerta tem cancelamento funcional;
- dados pessoais ficam isolados por conta.

---

## 12. Etapa 6 — agendamento e conversão

### Objetivo

Transformar intenção em próxima ação organizada.

### Entregas

- solicitar visita;
- dias e faixas disponíveis;
- responsável;
- confirmação manual ou automática configurável;
- reagendar/cancelar;
- lembrete;
- compareceu/não compareceu;
- mensagem e WhatsApp preservados;
- proposta simples ligada ao interessado e ao imóvel somente depois de a visita estar estável.

### Regras

- solicitação não é confirmação;
- proposta não é contrato;
- horário não pode ser exposto sem disponibilidade real;
- telefone e e-mail exigem consentimento;
- evento entra no histórico do lead.

### Aceite

- conflito de horário é impedido;
- responsável recebe a solicitação;
- cliente recebe confirmação clara;
- cancelamento atualiza ambos os lados;
- origem da conversão permanece registrada.

---

## 13. Etapa 7 — CRM operacional

### Objetivo

Garantir que todo lead tenha responsável, prazo, histórico e próxima ação.

### Funil inicial

```text
Novo → Em qualificação → Contatado → Visita agendada
     → Visita realizada → Proposta → Fechado / Perdido
```

### Entregas

- caixa de entrada;
- deduplicação por telefone/e-mail;
- origem e campanha;
- responsável;
- prazo de primeira resposta;
- próxima tarefa;
- histórico;
- preferências;
- imóveis relacionados;
- visita;
- proposta;
- motivo de perda;
- filtros;
- indicadores operacionais.

### Integração com o que já existe

- `vitrine_leads` continua como entrada pública;
- conversão para interessado não duplica pessoa;
- responsável organiza trabalho sem restringir leitura automaticamente;
- clique de WhatsApp não é considerado lead qualificado sozinho;
- proprietário, corretor e interessado permanecem entidades diferentes.

### Indicadores

- primeira resposta;
- sem responsável;
- sem próxima tarefa;
- conversão para visita;
- comparecimento;
- proposta;
- fechamento;
- canal;
- imóvel com procura sem proposta;
- imóvel sem procura.

### Aceite

- nenhum lead qualificado fica sem dono ou próxima ação;
- mudança de etapa gera histórico;
- permissões existentes permanecem;
- métricas podem ser conferidas nos registros de origem;
- WhatsApp em massa e automação autônoma ficam fora desta entrega.

---

## 14. Etapa 8 — qualidade transversal

Esta etapa não deve ser adiada integralmente para o fim. Cada entrega executa sua parte; o fechamento consolida.

### Performance

- orçamento de imagens;
- lazy loading;
- paginação;
- mapa sob demanda;
- redução de renderizações completas;
- separar gradualmente Vitrine pública e administrativa;
- medir antes/depois.

### Acessibilidade

- teclado;
- foco;
- leitor de tela;
- contraste;
- modais;
- `prefers-reduced-motion`;
- alvos de toque;
- labels e mensagens de erro.

### Testes

- unitários de filtros e valores;
- serialização Supabase;
- exportação/restauração;
- integração de RLS;
- navegador para busca, detalhe, lead e login;
- regressão visual desktop/mobile;
- links antigos;
- estados vazios;
- dados ausentes.

### Observabilidade

- erro de carregamento público;
- falha de lead;
- falha de imagem;
- tempo de resposta;
- erro de migração;
- contexto técnico sem dados pessoais.

### Aceite

- nenhuma regressão nos testes existentes;
- catraca do design system não sobe;
- jornadas críticas têm teste de navegador;
- métricas de performance registradas;
- documentação acompanha o código.

---

## 15. Estratégia de deploy por entrega

### Antes

- escopo aprovado;
- `git status` revisado;
- mudanças alheias preservadas;
- exportação do app;
- snapshot de esquema se houver migração;
- deploy anterior identificado;
- janela de baixo uso.

### Banco

1. preflight somente leitura;
2. migração isolada;
3. leitura dos `NOTICE`s;
4. verificação estrutural;
5. teste autenticado em conta temporária;
6. contagens comparadas;
7. diagnóstico de migrações atualizado.

### Aplicação

1. `npm.cmd test`;
2. `npm.cmd run build`;
3. conferir `dist/`;
4. deploy de preview, quando disponível;
5. fumaça em preview;
6. deploy de produção;
7. fumaça pública e autenticada;
8. registro do deploy.

### Reversão

- problema somente no frontend: restaurar deploy anterior;
- migração sem commit: corrigir e repetir depois;
- problema pós-commit: pausar, preservar evidências e aplicar correção explícita;
- não executar rollback genérico em dados reais;
- restauração de backup exige decisão específica.

---

## 16. Matriz de arquivos prováveis

| Área | Arquivos principais |
|---|---|
| Busca e ficha pública | `vitrine.js`, `vitrine.css` |
| Formulário administrativo | `vitrine.js`, `houses.js` |
| Dados | `supabase.js`, nova migração |
| Entrada e rotas | `app.js`, `index.html` |
| Design | `tokens.css`, `vitrine.css`, `motion.css` |
| PWA | `service-worker.js`, `manifest.json` |
| Build | `build.mjs` |
| Testes | `tests/` e fixtures |
| Documentação | plano integrado, publicação e migrações |

Arquivos grandes devem ser alterados por seção, não reformatados integralmente.

---

## 17. Ordem de aprovação recomendada

Não aprovar todas as etapas de uma vez. Aprovar nesta ordem:

1. **0A — diagnóstico e correção das duas falhas**;
2. **0B — repetição da fumaça e encerramento da Fase 0**;
3. **Etapa 1 — fundação de dados**, com modelo de tabelas apresentado antes do SQL;
4. **Etapa 2 — SEO e marca**;
5. **Etapa 3 — busca e cards**;
6. **Etapa 4 — ficha premium**;
7. demais etapas após uso real das quatro primeiras.

Cada aprovação deve dizer explicitamente:

- o que entra;
- o que não entra;
- banco afetado;
- arquivos previstos;
- risco;
- backup;
- teste;
- critério de parada;
- autorização ou não para deploy.

---

## 18. Próxima ação concreta

As Etapas 1 a 8 foram publicadas e encerradas. A próxima execução é de
**estabilização orientada por uso real**:

1. acompanhar primeira resposta, tarefas vencidas, visitas e propostas no CRM;
2. observar P95 de carga e falhas técnicas sem dados pessoais;
3. corrigir regressões confirmadas sem ampliar o escopo do produto;
4. priorizar nova evolução somente com evidência de operação e autorização explícita;
5. manter backup, teste reversível, prévia imutável e fumaça em cada publicação.

### Atualização executiva — Etapa 0A concluída em 05/08/2026

A autorização foi concedida e a etapa foi executada até produção. As falhas de
manutenção e `Apagar tudo` foram corrigidas, migradas, testadas por transação e
repetidas pela interface com proprietário e colaborador operacional isolados.
O teste de limpeza preservou conta, assinatura e licença e não alterou os 10
imóveis reais. Contas e dados temporários foram removidos. O deploy de produção
é `6a73c25a33345e07b3f73c7e`.

Etapa 0B executada e aprovada em produção. A Fase 0 foi encerrada formalmente,
sem contas temporárias remanescentes e sem alteração dos 10 imóveis reais.

Etapa 1 executada e aprovada em produção no deploy
`6a73d165cb2dd40c79baf120`, com build `731d6d852758`, contagens preservadas,
RLS forçada e API pública sem observação privada.

Etapa 2 executada e aprovada em produção no deploy
`6a73d9cf8561823253d5da67`, com build `af06d9e04146`, sitemap restrito a
conteúdo ativo, rotas canônicas e JSON-LD no HTML inicial.

Etapa 3 implementada no build `680d72046dac` e publicada no deploy
`6a73df8cc87b1526d78ebe99`. Foram entregues chips removíveis, ordenação por
área, estado vazio orientado, gaveta móvel, favoritos locais, comparação de até
quatro imóveis, retorno com rolagem e atributos responsivos das miniaturas. O
deploy de prévia aprovado foi promovido diretamente para a URL principal, sem
novo build nem cobrança, e a fumaça de produção foi aprovada.

Etapas 4, 5 e 6 encerradas no deploy `6a73effe2e4dd78d5e87c16e`, com ficha
premium, retenção consentida e agenda real integradas à Vitrine.

Etapas 7 e 8 encerradas no deploy `6a73fac84927d6a7be27853d`, build
`2b12f9172ca8`. O CRM usa o cadastro de interessados como fonte única, com
deduplicação por telefone/e-mail, responsável, SLA, próxima ação, histórico,
tarefas, imóveis, visitas, propostas e motivo de perda. O fechamento transversal
incluiu mapa sob demanda, foco restaurado em modais, telemetria técnica sem PII,
RLS forçada, retenção de 90 dias e fumaça desktop/mobile. O contato temporário de
teste foi removido e as contagens reais permaneceram em 1 lead, 1 anúncio e zero
interessados.

---

## 19. Critério de sucesso do programa

O programa estará bem-sucedido quando:

- produção estiver regularizada e com fumaça integral aprovada;
- a Vitrine for encontrável e compartilhável;
- o visitante conseguir filtrar e entender o custo real;
- a ficha responder às principais dúvidas;
- favoritos, comparação e busca salva funcionarem;
- visitas e leads tiverem acompanhamento;
- a operação interna continuar sendo a fonte da verdade;
- nenhum dado privado for exposto;
- performance móvel continuar adequada;
- cada evolução tiver teste, backup e reversão.

O princípio central é:

> trazer a riqueza de descoberta do Imova sem importar sua inconsistência operacional.
