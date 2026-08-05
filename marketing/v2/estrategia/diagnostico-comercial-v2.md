# Diagnóstico comercial e base estratégica — Aluguel 2.0

**Produto:** Aluguel — plataforma de gestão de locações
**Versão analisada:** Aluguéis 1.3 (`config.js:14`)
**Data:** 26 de julho de 2026 · **revisto em 31 de julho de 2026**
**Substitui:** `../../estrategia/diagnostico-comercial.md` (versão 1.0, 22/07/2026)
**Status:** fonte de verdade para todos os materiais da versão 2

> **Revisão de 31/07/2026.** As seções 9 e 10 foram conferidas linha a linha
> contra o código. Três itens listados como pendentes já estavam resolvidos
> — inclusive o bloqueio de contratos por colaborador, que impedia vender o
> plano Corretora. Um bloqueio real e não documentado apareceu no lugar (a
> escrita da Vitrine pela equipe) e foi corrigido. A galeria pública saiu de
> "em desenvolvimento" para "funciona hoje".

> A versão 1.0 continua correta na disciplina de claims e no ICP do pequeno proprietário. Esta versão 2.0 acrescenta o que mudou: a interface foi redesenhada, o aplicativo virou multi-produto e entra um terceiro público comercial — a pequena corretora. Nada aqui promete recurso que o código não sustente.

---

## 1. O que mudou desde a versão 1.0

| Área | Versão 1.0 (22/07) | Versão 2.0 (26/07) |
|---|---|---|
| Interface | Livro-caixa: papel `#F7F6F2` + latão `#B8863C`, topbar chapada | Painel escuro: base `#102E27`, canvas `#EEF3F0`, acento lima `#E7F77B`, herói em gradiente por área |
| Arquitetura | Produto único | Três superfícies: **Aluguéis**, **Minha Casa**, **Comercial**, com seletor na topbar |
| Público comercial | Um ICP (proprietário-operador) | Três trilhas: proprietário-operador, gestor de carteira, pequena corretora |
| Oferta | Gratuito · Básico · Premium | Acrescenta um quarto tier em estudo: **Corretora** |
| Narrativa | "Organize seus aluguéis" | "Saiba o que fazer hoje" — dor específica antes da categoria |
| Prova visual | Screenshots da interface antiga | Recapturados em 26/07 com dados fictícios (`../mockups/screenshots/`) |

### Fonte das cores novas

`aluguel-ui.css:6-30` e `minha-casa.css:5-27`. A paleta completa e os contrastes medidos estão em `../branding/brand-tokens-v2.json`.

---

## 2. Decisões estratégicas em uma página

| Decisão | Diretriz adotada |
|---|---|
| Categoria | Aplicativo web de gestão de locações para proprietários e pequenas operações imobiliárias |
| Público prioritário | Proprietários que administram de 1 a algumas dezenas de casas |
| Público de maior ticket | Pequenas corretoras que administram carteira de terceiros |
| Problema central | Falta de visão única e confiável sobre imóveis, contratos, vencimentos, pagamentos, energia, despesas e pessoas |
| Resultado prometido | Saber o que precisa de atenção hoje e agir sem trocar de ferramenta |
| Território de marca | Gestão prática e brasileira, com interface contemporânea e linguagem direta |
| Diferencial central | Reúne a rotina real do locador brasileiro — WhatsApp, PIX, energia por leitura, interessados, portal e catálogo |
| CTA primário | **Começar com uma casa, de graça** |
| CTA secundário | **Ver uma demonstração** |
| Fronteira de verdade | Gestão e cobrança **assistidas e manuais**. Não é banco, marketplace, sistema contábil, assinatura eletrônica nem automação de concessionária |

---

## 3. Arquitetura do produto (novo)

O aplicativo passou a expor três superfícies na topbar.

| Superfície | O que é | Quem vê hoje | Uso comercial permitido |
|---|---|---|---|
| **Aluguéis** | Gestão de imóveis, inquilinos, contratos, pagamentos, energia, despesas, interessados e agenda | Todos os clientes | Livre. É o produto vendido |
| **Minha Casa** | Gestão financeira familiar: entradas, saídas, contas fixas, categorias e membros | **Somente conta Mestre** (`app.js`, condicional `state.isPlatformAdmin`) | **Apenas como roadmap.** Não pode ser apresentado como recurso incluído |
| **Comercial** | Cadastro de clientes proprietários, vendas, convites, planos e auditoria | **Somente conta Mestre** | Uso interno. Não aparece em material de venda |

### Regra de comunicação

Minha Casa aparece na seção "Planejado" do documento de roadmap, com o estágio declarado. Nenhuma peça pode sugerir que o cliente terá acesso a ele hoje. Se e quando o módulo for liberado para clientes, esta tabela é atualizada primeiro e os materiais depois.

---

## 4. Problema central

O pequeno proprietário tem informação suficiente, mas não integrada. Cadastro da casa, contrato, vencimento, pagamento, conta de energia, manutenção e conversa com o inquilino ficam em lugares diferentes. O resultado é uma operação dependente de memória e de conferências repetidas.

### A pergunta que resume a dor

**"Quem ainda não pagou este mês?"**

Se responder exige abrir o extrato, a planilha e o WhatsApp, o problema existe. Essa pergunta é o eixo da nova comunicação porque é específica, é mensal e o produto responde de verdade.

### Problemas secundários

- Dificuldade para identificar quem está em dia, pendente ou atrasado.
- Histórico de ocupação e valores misturado quando o inquilino muda.
- Cobranças montadas manualmente, com risco de valor, mês ou vencimento errado.
- Energia controlada em anotação separada, sem leitura, tarifa, foto e recebimento no mesmo registro.
- Contatos de interessados sem acompanhamento nem relação com as casas vagas.
- Despesas, vistorias, documentos e lembretes sem vínculo direto com o imóvel.
- Inquilinos dependentes do proprietário para consultar informação básica.
- Falta de visão mensal e anual para apoiar decisão operacional.

### O que não pode ser dito

Não há base para quantificar perda financeira. A comunicação fala em **menos retrabalho, mais clareza e menor dependência de memória** — nunca em horas economizadas, percentual de inadimplência ou aumento de receita.

---

## 5. Os três públicos

### Trilha A — Proprietário-operador

**Perfil:** administra pessoalmente de 3 a 20 casas. Usa WhatsApp e PIX com naturalidade. Mantém uma planilha que só ele entende.
**Objetivo:** saber rapidamente o que recebeu, o que está atrasado e o que precisa fazer.
**Medos:** perder dados, adotar algo complicado, pagar por recurso que não vai usar.
**Objeção típica:** "Já controlo tudo na minha planilha."
**Argumento mais forte:** o app organiza o fluxo que ele já executa, sem transformar a rotina em operação corporativa.
**CTA:** *Começar com uma casa, de graça.*

### Trilha B — Gestor de carteira

**Perfil:** responsável administrativo de carteira familiar ou operação enxuta, de 20 a 100 casas. Atende proprietário, inquilinos e prestadores.
**Objetivo:** padronizar atendimento e histórico; conseguir delegar.
**Medos:** falha de permissão, dado inconsistente, retrabalho na troca de equipe.
**Objeção típica:** "Minha equipe inteira vai conseguir operar?"
**Argumento mais forte:** cada informação fica presa ao imóvel e ao contrato, não à pessoa que lembra dela.
**Ressalva obrigatória:** existe estrutura de equipe, mas o fluxo de contratos por colaborador ainda está em validação (ver seção 9).
**CTA:** *Ver uma demonstração guiada.*

### Trilha C — Pequena corretora *(novo)*

**Perfil:** administra imóveis de terceiros. Tem uma ou duas pessoas na administração. Presta contas a vários proprietários.
**Objetivo:** reduzir o tempo gasto respondendo às mesmas perguntas de proprietário e inquilino.
**Dor específica:** o proprietário liga para saber se o aluguel caiu; o inquilino pede o recibo de novo; a casa vaga é divulgada de forma improvisada.
**Medos:** migrar a carteira e perder histórico; depender de sistema que a equipe não usa.
**Objeção típica:** "Já uso um sistema imobiliário" ou "isso é pequeno demais para mim".
**Argumento mais forte:** **transparência com o proprietário-cliente.** Portal de consulta, catálogo público das casas vagas e histórico por contrato reduzem a ligação de cobrança de informação.
**CTA:** *Falar sobre a sua carteira.*

### Quem continua não sendo um bom cliente

- Grandes administradoras que exigem ERP, integração bancária, emissão fiscal, API pública e SLA.
- Operações que precisam de assinatura eletrônica ou geração jurídica de contrato dentro da plataforma.
- Marketplaces de captação em larga escala.
- Condomínios, hotéis e locação por temporada com reserva e diária.
- Quem exige escrita completa sem internet.
- Quem busca cálculo contábil, fiscal ou jurídico certificado.

---

## 6. Inventário funcional comprovado

Sem alteração relevante em relação à versão 1.0. A tabela completa continua válida em `../../estrategia/diagnostico-comercial.md`, seção 7. Resumo dos pilares:

| Pilar | Benefício comercial legítimo |
|---|---|
| Painel | Identifica situação e próximos passos sem reconstruir a carteira |
| Imóveis e ficha por abas | Mantém a operação organizada por casa |
| Inquilinos e contratos | Separa ciclos de ocupação e preserva continuidade |
| Pagamentos | Torna visível o que está pago, pendente ou atrasado |
| Cobrança assistida | Acelera o preparo da cobrança sem substituir a confirmação humana |
| Energia por leitura | Consumo, valor e recebimento vinculados à casa e ao contrato |
| Financeiro | Visão mensal, ageing, relatório anual e exportação |
| Interessados | Organiza demanda e destaca oportunidade de ocupação |
| Portal do inquilino | Transparência com menor dependência do atendimento |
| Catálogo público | Divulgação da casa vaga a partir do cadastro existente |
| Equipe | Base para operação compartilhada, sujeita à ressalva da seção 9 |
| Backup e exportação | Reduz risco operacional e aprisionamento |

### Os quatro fluxos de maior valor demonstrativo

1. **Da casa ao recebimento** — cadastrar casa → vincular inquilino → criar contrato → ver vencimento → preparar WhatsApp/PIX → registrar pagamento → emitir recibo.
2. **Da leitura à cobrança de energia** — escolher casa e mês → informar leituras → revisar consumo e tarifa → anexar foto → salvar vencimento → preparar cobrança → marcar recebimento.
3. **Da vaga ao novo contrato** — cadastrar interessado → informar preferências → ver casas compatíveis → conversar no WhatsApp → converter em inquilino → iniciar contrato.
4. **Da dúvida à transparência** — liberar e-mail do inquilino → inquilino cria conta → consulta contrato, pagamentos, recibos, energia e documentos permitidos.

---

## 7. Oferta

### Planos sustentados pelo código

Fonte: `config.js:16-22` e `migracao-versao-comercial-v1.sql:245-251`.

| Plano | Casas | Armazenamento | Motivo de negócio (copy aprovada) |
|---|---:|---:|---|
| Gratuito | 1 | 50 MB | Para testar com uma casa de verdade |
| Básico | 3 | 1 GB | Para quem já não confia mais na memória |
| Premium | 100 | 10 GB | Para carteira que cresceu |
| **Corretora** | *a definir* | *a definir* | Para quem administra imóveis dos outros |

### Regras de comunicação dos planos

- Premium é **até 100 casas**, nunca "ilimitado".
- Não anunciar recurso exclusivo por plano enquanto o bloqueio não estiver implementado e testado. Hoje o código diferencia apenas quantidade de casas e armazenamento.
- Preço, periodicidade, reajuste, cancelamento e reembolso seguem como `[INSERIR PREÇO]`, `[INSERIR PERIODICIDADE]` e `[INSERIR CONDIÇÃO DE CANCELAMENTO]` até aprovação.
- **O plano Corretora depende da correção descrita na seção 9** — a da escrita da Vitrine por colaborador, aplicada em 31/07/2026. Antes de vender, confirmar que `migracao-vitrine-equipe.sql` rodou no banco daquele cliente.

### Forma de contratação recomendada

1. Pessoa conhece o produto por landing page, indicação, Instagram ou WhatsApp.
2. Inicia no Gratuito ou pede demonstração.
3. A operação é qualificada por quantidade de casas e forma atual de controle.
4. O plano adequado é apresentado sem inventar economia ou retorno.
5. Pagamento confirmado pelo processo comercial existente.
6. E-mail liberado; o cliente cria a própria conta.
7. Onboarding orienta a primeira casa, inquilino, contrato e pagamento.

---

## 8. Hierarquia de mensagens

| Ordem | Função | Mensagem-base |
|---:|---|---|
| 1 | Abertura | **Quem ainda não pagou este mês?** |
| 2 | Promessa | Abra o painel e veja o que entrou, o que falta e quem cobrar |
| 3 | Problema | A informação existe — está espalhada entre planilha, extrato e conversa |
| 4 | Diferencial | Um fluxo feito para o locador brasileiro: WhatsApp, PIX, energia por leitura, portal |
| 5 | Prova | Telas reais do produto, recapturadas em 26/07/2026 |
| 6 | Risco reduzido | Comece com uma casa, de graça |
| 7 | CTA | **Começar com uma casa** / **Ver uma demonstração** |

### Headlines aprovadas por trilha

**A — Proprietário-operador**
- Quem ainda não pagou este mês?
- Você não deveria descobrir o atraso pelo extrato.

**B — Gestor de carteira**
- Sua carteira não cabe mais na sua memória.

**C — Corretora**
- Seu proprietário quer saber. Deixe ele ver.

### Títulos de seção aprovados

| Em vez de | Usar |
|---|---|
| Painel de gestão | Abra e saiba o que fazer hoje |
| Recursos comprovados | Tudo que a rotina do aluguel exige |
| Cobertura operacional | Da chave ao recibo, sem trocar de ferramenta |
| Gestão financeira | O mês fecha sozinho na sua frente |
| Para quem faz sentido | Feito para carteira pequena, não para ERP |
| Confiança com fatos | Seus dados separados dos dados de qualquer outro |

### CTAs padronizados

**Primário:** Começar com uma casa · Ver uma demonstração · Falar sobre a sua carteira
**Secundário:** Ver como funciona · Conhecer os planos · Solicitar proposta
**Proibidos:** Comprar agora (enquanto não houver checkout) · Automatize tudo · Nunca mais tenha inadimplência · Transforme sua renda

### Regra de posicionamento dos limites

As ressalvas ("não substitui contabilidade", "cobrança é manual", "sem certificação declarada") **saem do topo do funil** e passam para o FAQ da landing page e para a proposta comercial. A honestidade permanece integral; muda o lugar. Ninguém compra lendo primeiro o que o produto não faz.

---

## 9. Limites do produto e claims proibidos

Tabela integral herdada da versão 1.0, seção 9. Repetida aqui a parte que mais gera risco:

| Não afirmar | Formulação segura |
|---|---|
| "Faz cobranças automáticas" | "Prepara cobranças por WhatsApp e PIX para você enviar" |
| "Confirma pagamentos automaticamente" | "Registre o recebimento e mantenha a situação atualizada" |
| "Conciliação bancária" | "Controle operacional de valores informados pelo usuário" |
| "Matching com inteligência artificial" | "Cruza preferências com casas vagas por critérios objetivos" |
| "Gera contratos jurídicos" | "Organiza o histórico e as regras de cobrança de cada contrato" |
| "Funciona completamente offline" | "Mantém uma cópia local para consulta quando a conexão cai" |
| "Integra com a concessionária" | "Calcula e registra energia a partir das leituras informadas" |
| "Agenda lembretes automáticos" | "Visualize vencimentos e registre lembretes por data" |
| "100% seguro" ou "certificado LGPD" | "Autenticação, isolamento por conta e arquivos privados" |
| "Reduz inadimplência em X%" | "Ajuda a enxergar pendências e agir com mais consistência" |

### Bloqueios técnicos que afetam a venda

| Item | Situação | Impacto comercial |
|---|---|---|
| ~~**Contratos por colaborador**~~ | **Resolvido — revisto em 31/07/2026.** As RPCs vigentes `iniciar_contrato_gestao` (`migracao-financeiro-v2.sql:2345`) e `encerrar_contrato_gestao` (`:2484`) usam `pode_operar_imoveis()` e aceitam colaborador. A linha anterior descrevia a 1ª geração das RPCs (`migracao-contratos-cobrancas.sql:152`), já substituída duas vezes | Não bloqueia mais |
| **Escrita da Vitrine por colaborador** | **Achado em 31/07/2026.** As tabelas do módulo nasciam com `user_id ... default auth.uid()` e a policy compara com `usuario_proprietario_id(auth.uid())`: iguais para o dono, diferentes para a equipe. Todo insert do colaborador falhava por policy e por FK; em `vitrine_cidades` gravava e sumia para o dono | Era **este** o bloqueio real do plano Corretora. Corrigido por `migracao-vitrine-equipe.sql` e pelos writers de `supabase.js` |
| **Perfil público por colaborador** | `salvar_perfil_publico` exige `usuario_proprietario_id(auth.uid()) = auth.uid()` (`migracao-versao-comercial-v1.sql:881`) | Desenho, não defeito: slug e marca são do dono da conta. Comunicar assim |
| ~~Ordenação do status "quente"~~ | **Resolvido — conferido em 31/07/2026.** O código trata a ausência de status explicitamente (`priority[a.status]===undefined?9:…`, `interests.js:44-48`). O `\|\|` que zerava a prioridade não existe mais | Pode demonstrar o funil |
| ~~Calendário em meses históricos~~ | **Resolvido — conferido em 31/07/2026.** `vencimentosDoDia` resolve o contrato daquele mês (`contractForMonth`, `calendar.js:15-24`) e o teste `run-tests.mjs` trava esse comportamento | Mês passado pode entrar na demonstração |
| Conversão de interessado | **Mitigado, não atômico.** Se o contrato falhar, o inquilino recém-criado é apagado; se o contrato der certo e a atualização do lead falhar, a tela avisa em vez de mentir (`interests.js:216-236`) | Pode demonstrar. Continua valendo não prometer atomicidade |
| Backup e restauração | **Corrigido em 31/07/2026.** A restauração reinseria os imóveis com lista explícita de colunas e apagava `imoveis.tipo` e `inquilinos.rg` em silêncio. Rode de novo `migracao-backup-v7.sql` em cada banco | Nenhum cliente deve restaurar backup num banco que ainda não recebeu a revisão |
| Premium | Limite técnico de 100 casas (`config.js:18-22`) | Nunca dizer "ilimitado" |

**Como esta tabela foi conferida:** cada linha foi reaberta no código em
31/07/2026. Duas descreviam defeitos que já não existiam — documento de
risco desatualizado faz deixar de vender o que já funciona, e é tão caro
quanto documento nenhum. Refazer esta conferência a cada rodada.

---

## 10. Roadmap comercial

Estágios declarados. Nenhuma data é prometida sem aprovação.

### Funciona hoje

Painel, carteira de imóveis, ficha por abas, inquilinos, contratos, pagamentos, recibos em PDF, energia por leitura, despesas, reajustes, interessados, agenda, fotos, documentos, portal do inquilino, catálogo público, equipe, backup, consulta offline e PWA.

### Funciona hoje — **Vitrine, o site da corretora** *(revisto em 31/07/2026)*

O que era "galeria em desenvolvimento" virou módulo em produção, com entrada
por cidade e as duas finalidades:

- Entrada por cidade, abas Alugar e Comprar, sete filtros e quatro ordenações.
- Página do imóvel com galeria em tela cheia, mapa, custo mensal e parecidos.
- Link próprio por anúncio que chega no WhatsApp com foto grande e preço.
- Formulário de interesse com consentimento, e contador de visitas por anúncio.
- Rodapé com CRECI e página de privacidade.
- Terreno como tipo, com frente, fundo, topografia e murado.

O que ainda **não** existe e não pode ser prometido: publicação automática
quando a casa fica vaga (a Vitrine tem cadastro próprio, separado da gestão,
de propósito — ver seção 3), lead virando Interessado sozinho, QR Code por
casa, e galeria com logo e cores da corretora.

### Planejado

- Ponte entre a gestão e a Vitrine: publicar o imóvel administrado com um
  clique, e o lead do site virando Interessado.
- Relatório do proprietário-cliente, para a corretora prestar contas — por
  link com prazo, sem exigir login de quem só quer ver o extrato.
- Minha Casa liberada para contas de cliente.
- Plano Corretora, agora que a escrita da Vitrine pela equipe foi corrigida.
- Lembretes de vencimento dentro do aplicativo.
- Logo e cores próprios da corretora no site público.

### Em estudo — sem compromisso

Cobrança recorrente e conciliação bancária, notificações agendadas por WhatsApp, e-mail ou push, convite enviado automaticamente por e-mail, sincronização com calendário externo, assinatura eletrônica, API e integração contábil, escrita offline com sincronização, matching com localização ou score.

---

## 11. Lacunas que dependem de decisão

### Bloqueiam a publicação

- `[INSERIR NÚMERO DO WHATSAPP COMERCIAL]`
- `[INSERIR LIMITES DO PLANO CORRETORA]` — casas, colaboradores e o que difere do Premium
- `[INSERIR ENDEREÇO DE SUPORTE]` e `[INSERIR HORÁRIO E PRAZO DE RESPOSTA]`

### Podem vir depois

- `[INSERIR PREÇO E PERIODICIDADE DE CADA PLANO]`
- `[INSERIR RAZÃO SOCIAL / CNPJ]`
- `[INSERIR REGRAS DE CANCELAMENTO]` e `[INSERIR POLÍTICA DE REEMBOLSO]`
- `[INSERIR LINKS DE TERMOS E PRIVACIDADE]`
- `[INSERIR PERFIS OFICIAIS DE REDES SOCIAIS]`
- `[INSERIR DEPOIMENTOS REAIS, SOMENTE QUANDO DISPONÍVEIS]`

---

## 12. Critério de consistência para os materiais da versão 2

Todo material novo passa por estas verificações:

- [ ] Usa o nome **Aluguel**, sem criar segunda marca.
- [ ] Usa as capturas de `../mockups/screenshots/`, feitas em 26/07/2026, e não as da versão 1.
- [ ] Nenhum dado pessoal real aparece; toda tela usa os nomes fictícios definidos na recaptura.
- [ ] Apresenta cobrança como assistida e manual.
- [ ] Chama a compatibilidade de interessados de "critérios objetivos", nunca de IA.
- [ ] Premium é até 100 casas.
- [ ] Minha Casa e Comercial aparecem só como roadmap, nunca como recurso incluído.
- [ ] O plano Corretora só é vendido para banco que já recebeu `migracao-vitrine-equipe.sql` — sem ela, o corretor não grava nada na Vitrine.
- [ ] Lima e ouro claro não são usados como cor de texto sobre fundo claro.
- [ ] Sobre o canvas, o texto secundário usa `#5A6A62` e o destaque usa `#8A5F12`.
- [ ] Há um único CTA primário dominante por peça.
- [ ] As ressalvas estão no FAQ ou na proposta, não no topo da página.
- [ ] Nenhum número comercial sem fonte é apresentado como prova.
- [ ] Arquivo editável e exportação final têm data e versão.

---

**Uso deste arquivo:** fonte de verdade para copy, landing page, apresentação, one-page, proposta, roadmap e kit de WhatsApp da versão 2. Quando uma decisão pendente for aprovada, atualize primeiro este documento e depois propague.
