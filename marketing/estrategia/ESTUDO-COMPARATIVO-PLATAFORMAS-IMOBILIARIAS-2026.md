# Auditoria Mestra da plataforma Aluguel

**Data da análise:** 1º de agosto de 2026  
**Escopo:** auditoria técnica e operacional local, estudo iniciado no Claude, RE/MAX Brasil e RE/MAX Agro, QuintoAndar, ZAP Imóveis/Viva Real e Kenlo como referência de CRM/ERP para imobiliárias.  
**Regra deste trabalho:** diagnóstico e recomendação; nenhum código foi criado ou alterado no produto.

**Documento complementar:** `PLANO-MESTRE-EXECUCAO-2026.md`. Esta Auditoria explica o estado, os motivos e as decisões. O Plano define a sequência autorizada de execução.

---

## 1. Resumo executivo

A plataforma Aluguel não deve ser comparada apenas com a RE/MAX. A RE/MAX é, sobretudo, uma rede imobiliária e uma vitrine de oferta; o QuintoAndar é uma jornada digital transacional; ZAP/Viva Real são portais de descoberta em escala; e a Kenlo é uma referência de operação interna, CRM, locação e distribuição de leads. A plataforma local combina partes dos quatro modelos: gestão de locações, portal do inquilino, financeiro, carteira, vitrine pública, leads, equipe, planos e operação comercial.

O resultado principal é este:

- **A plataforma local é mais profunda na administração cotidiana de pequenas carteiras de aluguel do que a experiência pública da RE/MAX deixa visível.** Ela já cobre cobrança, recebimento, energia, contratos, documentos, manutenção, proprietários, inquilinos, equipe, auditoria, backup e portal.
- **Ela ainda é claramente inferior aos portais de referência na descoberta pública do imóvel.** Faltam mapa de busca, filtros ricos por segmento, favoritos, alertas, comparação, recomendações, SEO por anúncio, páginas fortes de localização e uma ficha pública mais persuasiva.
- **Ela ainda é inferior a um CRM imobiliário maduro na operação de corretores.** Faltam funil visual completo, distribuição automática de leads, SLA de atendimento, histórico omnichannel, roteiros de visita, propostas e ranking/desempenho por corretor.
- **O visual interno tem personalidade e consistência crescente.** Verde profundo, lima e dourado criam diferenciação. A Vitrine pública, porém, precisa usar mais fotografia, mapa, prova social, hierarquia e chamadas de ação; hoje transmite organização, mas ainda não transmite a força comercial de um portal.
- **A engenharia é adequada ao estágio atual, mas não à escala de uma rede nacional.** A ausência de dependências reduz custo e fragilidade, o PWA/offline e a segurança no banco são bons pontos, mas o front-end em JavaScript global e arquivos extensos aumentará muito o custo de manutenção conforme módulos, usuários e segmentos crescerem.

### Veredito em uma frase

**Hoje, a plataforma é um bom sistema de gestão de locações com uma vitrine em evolução; para competir como plataforma imobiliária completa, o próximo salto deve ser comercial e de descoberta, não uma simples troca de cores.**

---

## Estado operacional confirmado em 1º de agosto de 2026

Este ponto prevalece sobre qualquer roadmap comercial: **o código local ainda está parcialmente à frente do banco de produção e do site publicado**. O aplicativo foi construído para continuar funcionando com o banco anterior, mas parte dos recursos recentes somente fica plenamente ativa depois da regularização.

### Pendência que bloqueia novas funcionalidades

O roteiro operacional original registrava 11 execuções. O preflight somente leitura realizado no ambiente real confirmou que cinco migrações já estão aplicadas: tema por usuário, tipo do imóvel, RG do inquilino, formas de pagamento do Minha Casa e manutenção.

As 6 execuções identificadas pelo preflight foram concluídas e validadas em 1º de agosto de 2026:

1. `migracao-vitrine-equipe.sql` — **concluída**;
2. `migracao-vitrine-fotos.sql` — **concluída**;
3. `migracao-backup-v7.sql` — **concluída**;
4. `migracao-controle-versao.sql` — **concluída após correção de sintaxe**;
5. `migracao-proprietario-cliente.sql` — **concluída**;
6. `migracao-backup-v7.sql` novamente, depois da criação dos proprietários — **concluída**.

O diagnóstico oficial do banco retornou 33/33 evidências aplicadas e nenhuma ausente. A suíte local passou, o build `5375644ce1d4` preparou 51 arquivos e o deploy de produção `6a6e3934ba591c21a8b19709` foi publicado no Netlify. As fumaças pública, autenticada de leitura e de escrita controlada foram executadas. Imóvel, inquilino, contrato, pagamento, colaboração, Portal, exportação e bloqueio seguro da restauração passaram; a gravação de manutenção e a ação `Apagar tudo` falharam em uma conta proprietária nova. As contas temporárias foram removidas e essas duas correções aguardam aprovação.

A repetição do backup é intencional e reexecutável. A primeira execução instala a rotina revisada antes da nova estrutura; a segunda, depois da tabela de proprietários, inclui essa estrutura na restauração.

O preflight também confirmou o projeto Supabase **Aluguel Casas** e o site Netlify **aluguel-casas-anderton**. Como o Supabase está no plano Free e não oferece backup agendado do projeto, foi criado e validado um snapshot estrutural direcionado antes das alterações. O backup já baixado pelo aplicativo protege os dados suportados pela aplicação, mas não substitui esse snapshot estrutural.

### Regra aprovada

Nenhuma funcionalidade nova deve ser executada antes de:

- exportar um backup pelo próprio aplicativo;
- aplicar apenas os seis passos pendentes, um por vez, na ordem aprovada;
- conferir o resultado de cada transação;
- executar `diagnostico_migracoes()`;
- validar backup/restauração numa conta de teste;
- rodar a suíte completa;
- montar `dist/`;
- publicar e executar o roteiro de fumaça em produção.

Essa regularização é a **Fase 0 obrigatória** do Plano Mestre.

---

## O que a auditoria operacional acrescentou

O estudo comparativo original avaliou mercado, experiência, design e escala. A passagem de bastão produzida no Claude acrescentou fatos que mudam a prioridade e evitam retrabalho.

### Entregas recentes já existentes

Os itens abaixo não devem voltar ao roadmap como se estivessem ausentes:

- colaborador operacional pode gravar na Vitrine, depois da migração correspondente;
- mensagem do interessado aparece no painel;
- clique no WhatsApp gera lead com deduplicação de uma hora;
- anti-spam considera o telefone, não apenas o anúncio;
- ordenação de compra utiliza o preço de venda;
- compartilhamento leva diretamente ao anúncio correto;
- título, URL canônica e histórico do navegador foram tratados;
- galeria em tela cheia tem swipe e legenda;
- a grade utiliza miniaturas em vez de baixar sempre a imagem maior;
- rodapé público inclui CRECI e acesso à privacidade;
- celular tem barra fixa de preço e WhatsApp;
- proprietário-cliente, taxa de administração e dados de repasse já existem;
- imóvel administrado pode originar um anúncio na Vitrine;
- lead da Vitrine pode virar Interessado de forma deliberada;
- extrato do proprietário contém previsto, recebido, aberto, despesas, taxa e repasse;
- existem PDF, resumo para WhatsApp e tela de histórico de alterações;
- testes são executados antes do build e podem impedir a publicação.

### Lacunas reais que permanecem

- banco e site publicado ainda precisam ser regularizados;
- fotos da gestão não passam automaticamente para a Vitrine;
- corretor ainda não é um sujeito completo do fluxo comercial;
- sitemap, JSON-LD, URLs públicas limpas e páginas locais continuam pendentes;
- todo login carrega histórico financeiro acumulado demais;
- `supabase.js` e `vitrine.js` estão grandes e misturam responsabilidades;
- anunciantes antigos podem permanecer sem ligação segura com um proprietário;
- Minha Casa está pronto tecnicamente, mas ainda depende de decisão e validação comercial;
- mapa, filtros avançados, favoritos, alertas, agendamento público, proposta, semelhantes e comparação continuam como evolução de produto.

---

## Regras técnicas e de negócio que não podem ser quebradas

Estas regras nasceram de defeitos reais ou riscos confirmados e devem acompanhar qualquer implementação futura.

### Backup acompanha toda alteração de dados

Toda tabela ou coluna nova entra na exportação e na restauração no mesmo trabalho. Quando a restauração usa listas explícitas, esquecer uma coluna pode produzir uma operação aparentemente bem-sucedida que elimina dados silenciosamente.

### O proprietário da conta é o dono técnico dos registros

O `user_id` persistido é o do proprietário da conta, não necessariamente o usuário colaborador autenticado. Escritas feitas pela equipe precisam preservar esse vínculo.

### Responsabilidade não é permissão

Todos os colaboradores autorizados enxergam os imóveis da conta. O responsável por imóvel ou lead serve para organização, histórico, fila e métricas; não deve ser usado automaticamente para esconder registros dos demais.

### Administração é calculada sobre o recebido

A taxa de administração incide sobre o dinheiro efetivamente recebido, não sobre o aluguel apenas previsto. O repasse parte do recebido e deduz taxa e despesas conforme as regras financeiras.

### Gestão e anúncio têm responsabilidades editoriais diferentes

Ao sincronizar imóvel administrado com a Vitrine, valores e situação podem ser atualizados. Título, descrição, destaque e fotos não devem ser sobrescritos automaticamente, porque pertencem ao trabalho editorial do anúncio.

### Importar e restaurar são ações diferentes

A importação em modo “adicionar” deve recusar a mesma exportação identificada duas vezes. A restauração em modo “substituir” deve poder ser repetida, pois repetir uma recuperação é uma necessidade legítima.

### Testes não dependem da data do calendário

Regras com vencimento, tolerância ou competência precisam usar datas controladas. Uma suíte que falha em determinados dias sem alteração no produto não pode ser considerada trava confiável.

### O design system tem catraca

Tokens, contraste, raios e limites existentes continuam obrigatórios. A dívida tolerada de cores literais e textos pequenos pode cair, nunca aumentar.

### Duas tabelas de imóveis são intencionais

`imoveis` pertence à administração; `vitrine_imoveis` pertence ao catálogo. Um imóvel de terceiro pode ser anunciado sem entrar no financeiro, nos relatórios ou no limite da carteira administrada.

---

## Decisões aprovadas pelo proprietário do produto

As decisões abaixo foram confirmadas durante a consolidação desta auditoria e substituem recomendações conflitantes de estudos anteriores.

| Tema | Decisão aprovada |
|---|---|
| Estrutura documental | Auditoria Mestra e Plano Mestre separados |
| Regularização | Fase 0 obrigatória antes de funcionalidade nova |
| Expiração | configurável por anúncio |
| Imóvel administrado | pode permanecer anunciado enquanto disponível |
| Imóvel de terceiro | pode usar período configurável e cobrança |
| Fotos | seleção manual; nunca copiar foto de vistoria sem escolha explícita |
| Equipe | visão compartilhada; responsável serve para organização e métricas |
| Marca pública | personalização controlada por imobiliária, com assinatura discreta da plataforma |
| Mapa | localização aproximada por padrão |
| Endereço completo | somente com autorização registrada, por anúncio |
| Minha Casa | produto opcional, separado e sem prioridade imediata |
| Segmentos | residencial, comercial, terrenos e rural, nessa ordem |
| CRM | primeiro o essencial interno; omnichannel completo depois |
| SEO | prioridade imediatamente posterior à Fase 0 |
| Arquitetura | evolução incremental, sem reescrita total |
| Visitante | mapa/filtros, favoritos, alertas, visita, proposta, semelhantes e comparação |
| Aprovação | cada fase exige aprovação; novidade fora do escopo exige nova pergunta |

---

## 2. Método e limites da comparação

Foram analisados:

- os arquivos locais de interface, regras, banco, segurança, PWA, Vitrine e materiais de design;
- as telas de painel, carteira de casas, catálogo público e portal móvel;
- a suíte automatizada atual;
- páginas públicas e materiais oficiais das plataformas comparadas disponíveis em agosto de 2026.

O repositório local soma aproximadamente:

| Camada | Arquivos principais | Linhas aproximadas |
|---|---:|---:|
| JavaScript | 28 | 17.187 |
| CSS | 6 | 3.181 |
| HTML | 2 | 342 |
| SQL e migrações | 32 | 18.644 |
| **Total auditado** | **68** | **39.354** |

A suíte local foi executada com sucesso. Ela valida, entre outros pontos, design system, permissões, separação de papéis, cadastro protegido, exclusão segura, navegação móvel, planos, equipe, anúncios, PIX, limites, cobranças, energia, interessados, temas, backup, módulos vendáveis, Minha Casa e Vitrine.

### Limites importantes

- Não houve acesso a painéis privados, algoritmos internos, métricas de conversão ou código-fonte das concorrentes.
- Notas de atendimento e escalabilidade externa avaliam a experiência e as capacidades publicamente demonstradas, não a qualidade real de cada atendimento individual.
- A comparação “até a última linha de código” é literal apenas para o produto local; nas concorrentes, o código privado não é acessível. Portanto, a comparação técnica externa usa arquitetura observável, recursos publicados e comportamento da experiência pública.

---

## 3. O que cada referência representa

| Referência | Papel principal | O que deve inspirar |
|---|---|---|
| **RE/MAX Brasil** | Rede de corretores + marca + inventário | confiança, corretor visível, cobertura residencial/comercial/terrenos, categorização por momento e segmento |
| **RE/MAX Agro** | Intermediação rural especializada | ficha rural técnica, consultoria, due diligence, documentação, arrendamento e atendimento especialista |
| **QuintoAndar** | Jornada digital de aluguel e venda | busca por mapa, filtros profundos, agendamento, proposta, alertas e redução de burocracia |
| **ZAP/Viva Real** | Portal de grande inventário | busca ampla, filtros, SEO local, descoberta, comparação implícita e integração com anunciantes |
| **Kenlo** | CRM/ERP e operação de imobiliárias | funil, distribuição de leads, portais, app para corretor, agenda, relatórios e omnichannel |
| **Aluguel** | Gestão própria + portal + vitrine | proximidade, controle operacional, simplicidade, experiência local e verticalização |

---

## 4. Placar geral

Notas de 0 a 10, considerando o que é verificável publicamente e no produto local.

| Critério | Aluguel | RE/MAX | QuintoAndar | ZAP/Viva Real | Kenlo |
|---|---:|---:|---:|---:|---:|
| Identidade visual | **8,0** | 8,5 | 8,5 | 8,0 | 7,5 |
| Descoberta pública | **5,0** | 8,0 | 9,5 | 9,5 | 7,5 |
| Ficha do imóvel | **5,5** | 8,0 | 9,0 | 8,5 | 8,0 |
| Residencial | **7,5** | 9,0 | 9,5 | 9,5 | 8,5 |
| Comercial | **5,5** | 8,5 | 5,5 | 9,0 | 8,5 |
| Terrenos | **5,0** | 8,5 | 4,5 | 9,0 | 8,0 |
| Chácaras/rural | **3,5** | 9,5 | 2,0 | 7,5 | 7,0 |
| Gestão de locações | **8,5** | 6,0* | 9,5 | 4,0 | 9,5 |
| Cliente/inquilino | **8,0** | 7,5 | 9,5 | 6,0 | 8,0 |
| Proprietário | **8,0** | 8,0 | 9,5 | 6,0 | 9,0 |
| Corretores/equipe | **5,5** | 9,5 | 8,5 | 7,0 | 9,5 |
| CRM e leads | **6,0** | 8,0 | 9,0 | 7,0 | 10,0 |
| Financeiro operacional | **9,0** | 6,0* | 9,0 | 3,0 | 9,5 |
| Usabilidade interna | **8,0** | não observável | 9,0 | não aplicável | 8,5 |
| Acessibilidade | **7,5** | 7,0 | 8,5 | 8,0 | 7,5 |
| Escalabilidade técnica | **6,0** | 9,5 | 10,0 | 10,0 | 9,5 |
| SEO e aquisição orgânica | **5,0** | 9,0 | 9,5 | 10,0 | 8,5 |
| Atendimento omnichannel | **5,0** | 8,5 | 9,0 | 7,5 | 10,0 |

\* A operação interna privada da rede RE/MAX não foi auditada; a nota reflete somente o que é publicamente verificável.

### Leitura do placar

O produto local já ganha onde conhece profundamente a rotina do aluguel. Ele perde onde escala e rede importam: volume de inventário, busca, corretor, automação comercial, distribuição, marketing e especialização rural.

---

## 5. Comparação direta de layout e design

### 5.1 Cores

#### Plataforma Aluguel

A paleta predominante é:

- verde profundo como base institucional;
- verde médio para superfícies de destaque;
- lima para ação principal e estado ativo;
- dourado para assinatura e Vitrine;
- papel branco/quase branco para leitura;
- cinzas suaves e sombras difusas.

**Pontos fortes:** identidade memorável, aparência proprietária, bom contraste nos tokens validados, sensação de confiança e patrimônio, boa diferenciação frente ao vermelho/azul da RE/MAX e ao roxo do QuintoAndar.

**Riscos:** uso excessivo de verde escuro em grandes blocos pode deixar a interface pesada; lima em excesso pode parecer promocional; dourado precisa manter função clara para não competir com alertas; temas alternativos fazem sentido na área privada, mas não deveriam fragmentar a marca pública.

#### RE/MAX

Vermelho, azul e branco são altamente reconhecíveis. A paleta comunica rede, energia, tradição e alcance. Em termos de diferenciação pura, a RE/MAX leva vantagem por reconhecimento acumulado; em sofisticação contemporânea, a plataforma Aluguel pode parecer mais premium e local.

#### QuintoAndar

O roxo cria reconhecimento digital e uma experiência mais leve. A plataforma usa fotografia, respiro, cartões e CTAs com grande disciplina. É menos “administrativa” e mais orientada a decisão do consumidor.

#### ZAP/Viva Real

As cores são usadas para guiar busca e ação, mas a marca cede espaço ao inventário. Fotografias e preços dominam. Isso é correto para portal: o imóvel deve vencer a interface.

### Recomendação de cor

Não copiar nenhuma concorrente. Preservar o verde profundo como ativo proprietário, usar lima somente para ação primária/estado ativo, dourado para selo premium ou Vitrine e neutros para 70%–80% da superfície. Na área pública, deixar fotografias ocuparem mais espaço que qualquer cor da marca.

### 5.2 Tipografia

A combinação atual de Space Grotesk, IBM Plex Sans e IBM Plex Mono produz personalidade e boa distinção entre título, corpo e códigos. É mais autoral do que a maioria das plataformas comparadas.

O problema não é a escolha tipográfica; é a densidade. Telas internas podem ser densas, mas a página pública precisa de títulos mais comerciais, preço imediatamente legível, custos totais agrupados e descrições com hierarquia. Código monoespaçado deve ficar restrito a identificadores, não invadir a leitura comum.

### 5.3 Página inicial e navegação

#### Aluguel

- área interna: navegação clara por módulos, resumo, atalhos e indicadores;
- área pública: catálogo direto, porém ainda simples e pouco orientado à descoberta;
- dispositivos móveis: boa adaptação e barra inferior no portal do inquilino;
- risco: muitos módulos no mesmo topo podem criar sensação de “produto dentro de produto”.

#### Referências

- RE/MAX começa pela intenção “comprar/alugar” e pelo local;
- QuintoAndar começa por cidade/endereço e rapidamente leva a lista + mapa;
- ZAP/Viva Real priorizam inventário, filtros e ordenação;
- Kenlo prioriza o trabalho do corretor, não o consumidor.

**Conclusão:** a área privada da plataforma local está bem resolvida para uso recorrente. A área pública deve começar pela pergunta do cliente: “onde, para quê, que tipo e quanto?”, e não pela estrutura interna da empresa.

### 5.4 Cartões e ficha do imóvel

O cartão interno atual é eficiente para operação: status, inquilino, aluguel, energia e ação rápida. Ele não deve ser reaproveitado sem adaptação na Vitrine, porque o objetivo muda.

Na Vitrine, o cartão ideal precisa priorizar:

1. foto de capa forte e proporção consistente;
2. preço total e natureza da transação;
3. localização útil;
4. atributos decisivos do segmento;
5. selo verificável, novidade ou exclusividade;
6. favorito, compartilhamento e contato;
7. identidade do corretor responsável.

A ficha pública precisa de galeria ampla, vídeo ou tour quando houver, mapa, custos, regras, documentação, entorno, corretor, horários de visita, imóveis semelhantes e CTA persistente no celular.

---

## 6. Comparação por ferramenta

| Ferramenta | Aluguel hoje | Referência | Lacuna |
|---|---|---|---|
| Busca por localização | busca textual básica | RE/MAX/QuintoAndar/ZAP | falta autocompletar, múltiplas regiões, raio e desenho no mapa |
| Mapa integrado à lista | não é central | QuintoAndar | lacuna crítica |
| Filtros residenciais | tipo, quartos, preço e características em evolução | QuintoAndar com filtros profundos | ampliar condomínio, mobilidade, pet, mobília, andar, lazer e garantia |
| Filtros comerciais | cadastro genérico | ZAP/RE/MAX | atividade, zoneamento, pé-direito, docas, energia, vitrine, AVCB e acesso |
| Filtros de terrenos | insuficientes | RE/MAX/ZAP | topografia, frente, zoneamento, infraestrutura, escritura e potencial construtivo |
| Filtros rurais | praticamente ausentes | RE/MAX Agro | área total/produtiva, água, solo, benfeitorias, CAR/CCIR/ITR, acesso e aptidão |
| Favoritos | não consolidado | portais | necessário para retorno |
| Alerta de novos imóveis | ausente | QuintoAndar | necessário para retenção |
| Comparador | ausente | padrão desejável | alto valor em terreno, comercial e rural |
| Agendar visita | agenda interna existe, jornada pública não integrada | QuintoAndar/Kenlo | integrar disponibilidade, corretor e lembrete |
| Fazer proposta | ausente | QuintoAndar | necessário para avançar o funil |
| WhatsApp | presente e forte | mercado brasileiro | falta histórico central e SLA |
| Formulário de lead | presente na Vitrine | Kenlo | falta distribuição, score, automação e deduplicação madura |
| Funil visual | status de leads, sem experiência plena de CRM | Kenlo | lacuna crítica para corretores |
| Distribuição de leads | manual | Kenlo | regras por região, segmento, plantão e desempenho |
| Integração com portais | não demonstrada | Kenlo | crítica para escala de imobiliária |
| Relatório do proprietário | boa base financeira/métricas | QuintoAndar/Kenlo | acrescentar exposição, contatos, visitas e conversão |
| Portal do inquilino | já forte | QuintoAndar/Kenlo Locação | vantagem competitiva local |
| Contratos/documentos | já forte | QuintoAndar/Kenlo | avançar para assinatura e trilha completa |
| Vistoria/manutenção | já existe base | QuintoAndar/Kenlo | melhorar jornada, evidências e SLA |
| PWA/offline | presente | diferencial local | vantagem para operação em campo com conexão ruim |
| Backup/auditoria | presentes | sistemas de gestão | boa maturidade para o porte atual |

---

## 7. Segmentos: residencial, comercial, terrenos e chácaras

### 7.1 Residencial

É o segmento mais maduro do produto. O cadastro e a gestão de locação já entendem imóvel, inquilino, cobrança, energia, despesas, reajuste, contrato e portal.

Para competir na vitrine residencial faltam:

- busca no mapa e por tempo de deslocamento;
- valor mensal total destacado: aluguel + condomínio + IPTU;
- atributos ricos e padronizados;
- qualidade mínima de fotos;
- agendamento de visita;
- proposta digital;
- favorito e alerta;
- imóveis semelhantes;
- informação clara de garantias e regras.

### 7.2 Comercial

Imóvel comercial não pode ser apenas “casa sem quartos”. A decisão depende de operação, licença e infraestrutura.

Campos e filtros necessários:

- finalidade: loja, sala, galpão, clínica, indústria, logística, hotelaria;
- zoneamento e usos permitidos;
- área útil, terreno, vão livre e pé-direito;
- carga elétrica, trifásico, gerador e climatização;
- docas, pátio, acesso de caminhão e estacionamento;
- fachada, vitrine, fluxo de pedestres e visibilidade;
- AVCB, acessibilidade, habite-se e licenças;
- condomínio, IPTU, luvas e cessão de ponto;
- disponibilidade para built-to-suit ou sale-leaseback em operações maiores.

### 7.3 Terrenos

Terreno é comprado pelo potencial, não pelos cômodos. A ficha precisa mostrar:

- área, frente, fundos e formato;
- topografia e tipo de solo;
- zoneamento, coeficiente e ocupação;
- água, energia, esgoto, pavimentação e drenagem;
- matrícula, escritura, restrições e situação fiscal;
- coordenadas e polígono no mapa;
- estudo de potencial construtivo;
- acesso, distância e vizinhança.

### 7.4 Chácaras, sítios e fazendas

Este é o maior vazio de produto. A RE/MAX Agro trata rural como consultoria especializada e inclui avaliação técnica, viabilidade, due diligence, risco, documentação, logística, compliance ambiental, arrendamento e operações estruturadas.

Uma ficha rural séria precisa separar:

- área total, aberta, produtiva, reserva e APP;
- módulos, hectares/alqueires e conversão regional;
- aptidão: lazer, pecuária, grãos, café, cana, floresta, turismo;
- água: nascentes, rios, represas, poços e outorgas;
- solo, relevo, altitude, chuva e clima;
- benfeitorias: casa, curral, barracão, silo, energia e cercas;
- acesso, distância de rodovia, cidade, armazém e frigorífico;
- CAR, CCIR, ITR, georreferenciamento, matrícula e licenças;
- arrendamento, produção e capacidade estimada;
- mapa com perímetro, imagens aéreas e documentos técnicos;
- corretor/especialista rural responsável.

Sem isso, anunciar “chácara” é possível, mas atender o segmento rural profissionalmente não é.

---

## 8. Praticidade e usabilidade por público

### Cliente comprador ou locatário

**Bom hoje:** visual limpo, contato rápido, experiência móvel e identificação clara da marca.  
**Fraco hoje:** descoberta, comparação, confiança informacional, mapa, retorno à busca e continuação do processo.

### Inquilino ativo

Este é um dos melhores públicos atendidos. O portal móvel concentra contrato, pagamentos, recibos, energia e arquivos. A navegação inferior é adequada ao uso recorrente. A próxima evolução deve ser abrir chamados, acompanhar SLA, conversar com histórico e receber notificações.

### Proprietário

O sistema já entrega controle financeiro e operacional real. Para elevar percepção de valor, o proprietário precisa receber relatórios automáticos de ocupação, exposição, contatos, visitas, manutenção, inadimplência, repasses e rentabilidade por imóvel.

### Corretor

É o público menos servido em relação aos líderes. O corretor precisa de:

- caixa de entrada de leads;
- prioridade e prazo de primeira resposta;
- perfil e preferências do interessado;
- sugestões de imóveis compatíveis;
- agenda, rota e confirmação de visitas;
- registro de ligação, WhatsApp, e-mail e proposta;
- funil arrastável e tarefas de retorno;
- app/PWA de campo com captura de foto e documento;
- carteira, comissão e desempenho.

### Gestor da imobiliária

Há boa base de equipe, planos, operação e auditoria. Falta visão gerencial comercial: origem dos leads, velocidade por corretor, conversão por canal, imóveis encalhados, qualidade do cadastro, preço fora do mercado e previsão de receita.

---

## 9. Atendimento e relacionamento

A estratégia atual parece centrada em WhatsApp e registro de interessados. Isso funciona para volume pequeno e atendimento pessoal, mas perde rastreabilidade em escala.

O padrão de referência é:

```text
Site/portal/anúncio/WhatsApp
            ↓
      identificação única
            ↓
 qualificação e distribuição
            ↓
 corretor + prazo de resposta
            ↓
 visita → proposta → contrato
            ↓
 pós-venda/locação e retenção
```

O produto deve registrar toda a jornada, não apenas o nome e o status final. Uma resposta rápida, documentada e transferível vale mais do que adicionar um chatbot isolado.

Prioridades de atendimento:

1. caixa única de leads;
2. dono do atendimento e SLA visível;
3. deduplicação de telefone/e-mail;
4. histórico de interações;
5. tarefas automáticas de retorno;
6. distribuição por segmento/região/plantão;
7. pesquisa de satisfação após visita e fechamento;
8. escalação para humano sempre disponível.

---

## 10. Arquitetura e qualidade técnica local

### Pontos fortes

- aplicação sem dependências de produção, reduzindo risco de cadeia externa;
- PWA com manifest, service worker e suporte offline;
- Supabase como backend, autenticação, storage e funções;
- RLS e funções com regras de permissão no banco;
- perfis/papéis e equipe;
- separação de módulos vendáveis e planos;
- auditoria, arquivamento seguro e backup;
- CSP e cabeçalhos de segurança;
- design tokens e trava automatizada;
- testes de regressão focados nas regras críticas;
- responsividade e cuidados reais de acessibilidade: contraste, teclado, foco, leitura de tela e alvo de toque.

### Dívidas e riscos

- front-end global e imperativo, com muitas funções que geram HTML por string;
- arquivos muito extensos, especialmente Vitrine, casas e financeiro;
- estado compartilhado aumenta acoplamento e risco de efeito colateral;
- teste atual valida muitas regras por inspeção e invariantes, mas não substitui testes de jornada em navegador;
- 278 cores cruas e 27 textos abaixo de 12 px ainda são tolerados como dívida controlada;
- CSS acumulado em camadas, apesar da unificação recente do design system;
- migrações numerosas e cumulativas elevam risco de ambientes divergentes;
- a aplicação monolítica carrega múltiplos produtos no mesmo contexto;
- SEO de SPA e prévias sociais dependem de tratamento específico;
- observabilidade de erros, performance e comportamento do usuário não aparece como camada madura;
- integrações externas, webhooks e filas ainda não formam uma plataforma extensível.

### Escala estimada

| Cenário | Adequação atual |
|---|---|
| Proprietário/gestor com dezenas de imóveis | **Boa** |
| Pequena imobiliária com equipe enxuta | **Boa, com lacunas de CRM** |
| Imobiliária regional com milhares de anúncios | **Risco crescente** |
| Rede/franquia com múltiplas unidades e alto volume | **Arquitetura insuficiente sem evolução** |
| Portal nacional com tráfego massivo | **Não é o desenho atual** |

Não há problema em não ser um portal nacional. O erro seria perseguir volume de ZAP ou RE/MAX antes de dominar um nicho local rentável.

---

## 11. Design system e acessibilidade

O design system local é um ponto positivo concreto. Ele define tokens de raio, espaço, tipo, cor e componentes, impede novos sistemas paralelos e testa contraste. Isso é mais disciplinado do que muitos produtos pequenos.

Ainda assim, a qualidade percebida depende de completar a limpeza:

- reduzir cores literais restantes;
- eliminar textos menores que 12 px onde houver informação;
- consolidar seletores duplicados;
- migrar espaçamentos livres para escala;
- definir estados completos: carregando, vazio, erro, sucesso e permissão;
- testar navegação real por teclado e leitor de tela;
- medir Core Web Vitals e desempenho em celular simples;
- garantir textos alternativos úteis para fotos dos imóveis.

---

## 12. O que copiar, adaptar e evitar

### Copiar como princípio

- da RE/MAX: corretor e confiança como parte do produto;
- da RE/MAX Agro: especialização real por segmento;
- do QuintoAndar: jornada contínua da busca ao contrato;
- de ZAP/Viva Real: inventário pesquisável, SEO e filtros;
- da Kenlo: lead como processo mensurável e distribuído.

### Adaptar ao posicionamento local

- mapa e filtros sem tentar oferecer milhões de opções;
- atendimento humano rápido como diferencial;
- relatório simples e transparente para o proprietário;
- PWA leve para corretor e gestor em campo;
- conteúdo local de bairros, comércio, acesso e vida prática;
- rural e terreno somente quando houver dados e especialistas capazes de sustentar a promessa.

### Evitar

- copiar cores e aparência de concorrentes;
- adicionar dezenas de filtros sem dados consistentes;
- chatbot sem integração ao histórico;
- exibir endereço exato por padrão em imóvel vazio sem política e autorização claras;
- misturar métricas de Vitrine com financeiro de administração;
- criar um módulo visual novo para cada segmento;
- tentar atender residencial, comercial, terreno e rural com a mesma ficha genérica;
- prometer inteligência artificial antes de organizar dados, funil e qualidade dos anúncios.

---

## 13. Prioridades recomendadas

Esta seção organiza valor de produto, não a ordem operacional de execução. A ordem oficial está no Plano Mestre e começa pela regularização obrigatória da produção.

### Frente comercial inicial — Fundamentos

1. Definir o posicionamento: gestão de locações para pequenos e médios operadores com vitrine integrada.
2. Criar taxonomia única de transação, segmento, tipo e características.
3. Definir qualidade mínima de anúncio e dados obrigatórios por segmento.
4. Unificar interessado, lead, atendimento, visita, proposta e contrato em uma jornada.
5. Definir métricas: origem, primeira resposta, visita, proposta, fechamento e tempo de vacância.

### Prioridade 1 — Vitrine que converte

1. busca por localização e mapa;
2. filtros e URLs compartilháveis;
3. cartões centrados em fotografia e decisão;
4. ficha completa com CTA móvel persistente;
5. favorito, compartilhamento e alerta;
6. agendamento de visita;
7. SEO por imóvel, cidade, bairro e tipo;
8. corretor responsável com identidade e disponibilidade;
9. métricas de visualização e conversão para o proprietário.

### Prioridade 2 — CRM para corretores

1. funil visual;
2. caixa única e histórico;
3. distribuição e SLA;
4. agenda/rota de visitas;
5. proposta e documentos;
6. relatórios de canal e desempenho;
7. automações de retorno;
8. integrações com portais e anúncios.

### Prioridade 3 — Segmentos especializados

1. residencial completo;
2. comercial com infraestrutura e zoneamento;
3. terrenos com potencial construtivo e polígono;
4. chácaras e rural apenas com ficha técnica, documentação e especialista.

### Prioridade 4 — Engenharia para escala

1. modularizar por domínio e reduzir estado global;
2. testes reais de jornada e regressão visual;
3. observabilidade de erros e performance;
4. estratégia formal de migração e ambientes;
5. API/webhooks e processamento assíncrono;
6. SEO/renderização pública apropriada;
7. limites, filas, cache e monitoramento antes de grande volume.

---

## 14. Roadmap sugerido sem estimativa de código

Os períodos abaixo começam somente depois da conclusão da Fase 0 do Plano Mestre. São horizontes de planejamento, não prazos assumidos.

### 0–90 dias

- posicionamento e taxonomia;
- ficha residencial definitiva;
- busca/filtros públicos melhorados;
- padrão fotográfico;
- corretor responsável;
- lead com origem, responsável e prazo;
- relatório básico de exposição para proprietário;
- medição de conversão.

### 3–6 meses

- mapa integrado;
- favoritos e alertas;
- agenda pública de visitas;
- funil visual;
- histórico de atendimento;
- SEO local e páginas de bairro/cidade;
- integração com ao menos os canais prioritários.

### 6–12 meses

- propostas e assinatura;
- distribuição automática;
- relatórios por corretor e canal;
- ficha comercial e de terreno;
- portal do proprietário ampliado;
- evolução arquitetural guiada por uso real.

### 12 meses ou mais

- vertical rural especializada;
- recomendação inteligente;
- comparação avançada;
- rede de parceiros e cointermediação;
- múltiplas unidades/franquias, se o modelo comercial justificar.

---

## 15. Decisão estratégica recomendada

Não tentar “virar a RE/MAX”. A RE/MAX tem força de rede, corretores, marca e inventário. Não tentar “virar o ZAP”. O portal vence por escala de oferta e aquisição. Não tentar “virar o QuintoAndar” de uma vez. Ele controla uma jornada e uma operação de capital intensivo.

A oportunidade mais defensável é:

> **ser a plataforma simples e completa para a imobiliária/gestor regional administrar locações, atender leads e publicar uma vitrine local de alta confiança, com experiência excelente para proprietário, inquilino e corretor.**

Essa posição usa o que já existe de melhor — gestão, financeiro, portal e proximidade — e fecha as lacunas que realmente geram receita: descoberta, atendimento e conversão.

---

## 16. Fontes públicas consultadas

- [RE/MAX Brasil — busca e categorias de imóveis](https://www.remax.com.br/pt-br/pesquisa/regiao-sudeste/sao-paulo/osasco/comercial-loja/alugar/)
- [RE/MAX Brasil — listagem, filtros e mapa](https://www.remax.com.br/listings?ListingClass=2&MacroPropertyTypeUIDs=3240&OfficeID=69004&TransactionTypeUID=-1)
- [RE/MAX Agro — serviços, compra, venda, arrendamento e especialização rural](https://agro.remax.com.br/)
- [QuintoAndar — filtros e busca geográfica](https://www.quintoandar.com.br/guias/manual-imobiliario/filtros-mais-usados-na-busca-de-imoveis/)
- [QuintoAndar — jornada, mapa, visita, proposta e alertas](https://www.quintoandar.com.br/guias/como-alugar/melhor-site-de-aluguel-de-imoveis/)
- [ZAP Imóveis — busca, filtros e busca por IA](https://ajuda.zapimoveis.com.br/s/article/como-buscar-por-um-imovel)
- [Kenlo Imob — CRM, funil, leads, app e integrações](https://www.kenlo.com.br/produtos/imob)
- [Kenlo Sites — ficha, mapa, SEO e conversão](https://plataforma.kenlo.com.br/site-para-imobiliarias/)
- [Kenlo Leads — captação e distribuição](https://plataforma.kenlo.com.br/gestor-de-leads)
- [Kenlo — atendimento omnichannel](https://fresh.kenlo.com.br/support/solutions/articles/156000384304-lya-o-que-%C3%A9-o-lya-omnichannel-)

---

## 17. Conclusão final

A plataforma local tem mais substância do que sua Vitrine pública deixa perceber. A operação de aluguel já possui uma base rara para um produto deste porte: financeiro, contratos, energia, documentos, manutenção, interessados, equipe, portal, segurança no banco, PWA, backup e design system.

O próximo ciclo deve transformar essa substância em vantagem comercial visível. Isso exige uma Vitrine comparável aos portais em descoberta, uma ficha própria para cada segmento e um CRM comparável aos sistemas profissionais no acompanhamento do lead. A marca e as cores não precisam ser substituídas; precisam ser aplicadas com mais disciplina, fotografia e foco na decisão do cliente.

**Nota global atual do produto, considerando seu objetivo declarado: 6,9/10.**  
**Nota da gestão de locações: 8,5/10.**  
**Nota da experiência pública de busca e conversão: 5,2/10.**  
**Potencial após fechar Vitrine + CRM + segmentação: 8,5/10.**
