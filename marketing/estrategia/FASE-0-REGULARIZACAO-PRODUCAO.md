# Apresentação para aprovação — Fase 0: regularização de produção

**Data:** 1º de agosto de 2026  
**Estado:** migrações, validações estruturais, testes, build e deploy concluídos; fumaça autenticada com escrita executada em contas temporárias, com duas falhas funcionais abertas.  
**Ambientes regularizados:** banco Supabase de produção e site Netlify de produção.  
**Regra:** este documento registra as execuções autorizadas e realizadas; não autoriza restauração de dados nem outras alterações de produção sem decisão específica.

---

## 1. Decisão solicitada

Aprovar ou rejeitar a execução controlada da Fase 0, composta por:

1. confirmar visualmente os projetos de produção;
2. criar salvaguardas de dados e esquema;
3. executar um preflight somente leitura — **concluído**;
4. aplicar as 6 execuções identificadas, uma por vez — **concluído**;
5. validar banco, permissões e backup — **validação estrutural concluída**;
6. rodar testes e build — **concluído**;
7. escolher e executar uma forma de deploy — **concluído via Netlify CLI**;
8. realizar teste de fumaça — **partes pública, autenticada de leitura e escrita controlada concluídas; duas falhas registradas**;
9. registrar o resultado — **atualizado neste documento**.

Nenhuma funcionalidade nova faz parte desta fase.

---

## 2. O que foi confirmado localmente

- a aplicação tem URL do Supabase e chave pública configuradas;
- não existe `service_role` no arquivo público local;
- a pasta local possui vínculo do Netlify em `.netlify/state.json`;
- o `netlify.toml` publica `dist/`;
- o build do Netlify executa testes antes de montar a publicação;
- as dez migrações distintas existem localmente;
- `migracao-backup-v7.sql` é executada duas vezes, totalizando 11 passos;
- todos os arquivos começam uma transação e terminam em `commit;`;
- a suíte local estava verde na última conferência desta auditoria.

### Resultado do preflight no ambiente real

O painel confirmou o projeto Supabase **Aluguel Casas**, branch principal de produção. Todas as dependências-base consultadas existem.

| Evidência | Resultado |
|---|---|
| Estruturas-base de imóveis, inquilinos, chamados e fotos | presentes |
| Vitrine e Vitrine Corretora | presentes |
| Minha Casa e módulos | presentes |
| Tipos de acesso e Financeiro v2 | presentes |
| Tema por usuário | aplicado, com RLS forçada |
| Tipo do imóvel | aplicado |
| RG do inquilino | aplicado |
| Formas de pagamento do Minha Casa | aplicado, com RLS forçada |
| Manutenção | aplicada; 13 evidências estruturais confirmadas |
| Vitrine Equipe | aplicada em 1º/08/2026; validação estrutural aprovada |
| Vitrine Fotos | aplicada e validada em 1º/08/2026 |
| Backup V7 revisado | aplicado duas vezes e validado em 1º/08/2026 |
| Controle de versão | aplicado após correção de sintaxe; diagnóstico 33/33 |
| Proprietários-clientes | aplicada; 1 anunciante ligado e nenhum sem vínculo |

Assim, o roteiro original de 11 passos foi reduzido para 6 execuções. Todas foram concluídas:

1. `migracao-vitrine-equipe.sql` — **concluída**;
2. `migracao-vitrine-fotos.sql` — **concluída**;
3. `migracao-backup-v7.sql` — **concluída**;
4. `migracao-controle-versao.sql` — **concluída após correção transacional**;
5. `migracao-proprietario-cliente.sql` — **concluída**;
6. `migracao-backup-v7.sql` novamente — **concluída**.

### Contagens de referência registradas

| Tabela | Antes das alterações |
|---|---:|
| Imóveis | 10 |
| Inquilinos | 9 |
| Contratos | 10 |
| Pagamentos | 65 |
| Energia | 0 |
| Interessados | 0 |
| Vitrine — imóveis | 1 |
| Vitrine — fotos | 5 |
| Vitrine — leads | 0 |
| Vitrine — cidades | 6 |

As contagens não substituem o backup, mas serão comparadas depois de cada etapa relevante.

### Situação de backup do Supabase

O projeto está no plano **Free**. O próprio painel informa que esse plano não oferece backup agendado do projeto. Não há `pg_dump` nem Supabase CLI disponível localmente.

O backup do aplicativo já foi baixado pelo proprietário e protege os dados suportados pela aplicação. Como complemento, foi gerado em 1º de agosto de 2026 um snapshot somente leitura das definições afetadas:

- arquivo: `SNAPSHOT-ESQUEMA-SUPABASE-ANTES-FASE-0-2026-08-01.json`;
- escopo: colunas, restrições, índices, RLS, políticas, permissões, gatilhos, funções e presença/ausência dos objetos-alvo;
- conteúdo de clientes: nenhum registro consultado ou armazenado;
- tamanho: 261.277 bytes;
- SHA-256 do arquivo local: `d430539f7e9c80f6b60dd100fe5b22b77a89d26f503bc86fde9ad8913bb401db`.

Essa captura é uma salvaguarda direcionada e verificável, mas não equivale a um `pg_dump` completo nem à recuperação gerenciada do plano pago. Ela registra as definições anteriores necessárias para analisar uma eventual reversão das seis execuções originalmente pendentes.

### Situação do Netlify

- projeto confirmado: **aluguel-casas-anderton**;
- domínio ativo: `aluguel-casas-anderton.netlify.app`;
- produção respondendo normalmente;
- publicação automática ativa;
- deploy de produção publicado via CLI em 1º de agosto de 2026;
- identificação do deploy: `6a6e3934ba591c21a8b19709`;
- mensagem: `Fase 0 - banco regularizado e build 5375644ce1d4`;
- URL imutável: `https://6a6e3934ba591c21a8b19709--aluguel-casas-anderton.netlify.app`;
- produção: `https://aluguel-casas-anderton.netlify.app`;
- deploy anterior `6a6d0597097c8e0bdc467a48` preservado para retorno;
- publicação concluída em 5 segundos, sem erro nas regras de redirect, headers ou edge function.

### O que ainda não foi confirmado

- existência de usuários trabalhando durante a janela escolhida.

Os demais itens foram confirmados pelo preflight.

Esses pontos devem ser confirmados antes da primeira ação de escrita.

---

## 3. Escopo

### Incluído

- backup de dados pelo aplicativo;
- confirmação de proteção do esquema;
- preflight do banco;
- seis execuções de migração concluídas, usando cinco arquivos distintos;
- diagnóstico de migrações;
- validação de RLS, funções, vínculos e rotina de backup;
- testes locais;
- build;
- deploy escolhido pelo proprietário;
- teste de fumaça.

### Excluído

- mapa;
- SEO novo;
- CRM;
- alteração de layout;
- expiração configurável;
- cópia de fotos para a Vitrine;
- refatoração;
- integração com portais;
- liberação comercial do Minha Casa;
- limpeza de anunciantes antigos sem revisão humana;
- qualquer correção não necessária para concluir esta regularização.

Se um problema fora desse escopo aparecer, a fase deve ser pausada e uma nova decisão solicitada.

---

## 4. Por que existem duas salvaguardas diferentes

### Backup do aplicativo

Protege os dados da conta: imóveis, inquilinos, contratos, pagamentos, energia, despesas, interessados, documentos e demais seções exportadas.

### Backup ou recuperação do banco

Protege estrutura e estado técnico: tabelas, colunas, funções, gatilhos, políticas, permissões e índices.

O backup do aplicativo **não substitui** um backup de esquema. Ele não restaura sozinho uma função ou policy anterior. Foi concluído o seguinte caminho de proteção:

- snapshot/exportação direcionada de esquema obtida por ferramenta autorizada;
- captura verificável das definições que serão substituídas.

Backup automático do Supabase e recuperação pontual continuam indisponíveis no plano Free.

Sem proteção do esquema, a recomendação é não iniciar os passos que substituem funções ou políticas.

---

## 5. Preparação e janela

### Antes da janela

- escolher data e horário de baixo uso;
- definir uma pessoa responsável por aprovar cada avanço;
- confirmar que não haverá cadastro ou baixa financeira simultânea;
- manter o painel do Supabase aberto no projeto correto;
- manter o painel do Netlify aberto no site correto;
- separar uma conta de teste;
- registrar versão/data do deploy atualmente ativo;
- registrar o último deploy que pode ser restaurado no Netlify.

### Backup de dados

No aplicativo:

1. entrar com a conta proprietária/administradora;
2. abrir Perfil → Backup;
3. baixar a exportação;
4. conferir que o arquivo abre e contém JSON válido;
5. guardar duas cópias em locais diferentes;
6. registrar nome, tamanho, data e hora;
7. não enviar o arquivo para chats, sites ou serviços não autorizados.

### Regra de comunicação

Durante a janela, ninguém deve registrar pagamentos, novos contratos, imóveis, leads ou alterações relevantes. Se houver atividade concorrente, pausar e gerar novo backup.

---

## 6. Preflight somente leitura

Antes do primeiro arquivo, executar uma consulta de dependências. Ela não altera dados.

```sql
select
  to_regclass('public.imoveis') is not null                         as tem_imoveis,
  to_regclass('public.inquilinos') is not null                      as tem_inquilinos,
  to_regclass('public.chamados') is not null                        as tem_chamados,
  to_regclass('public.fotos') is not null                           as tem_fotos,
  to_regclass('public.vitrine_imoveis') is not null                 as tem_vitrine,
  to_regclass('public.vitrine_cidades') is not null                 as tem_vitrine_corretora,
  to_regprocedure('public.minha_casa_familia_atual_id()') is not null as tem_minha_casa,
  to_regprocedure('public.tem_modulo(text,uuid)') is not null       as tem_modulos,
  to_regprocedure('public.e_administrador_plataforma(uuid)') is not null as tem_tipos_acesso,
  to_regprocedure('public.pode_operar_imoveis(uuid,uuid)') is not null as tem_financeiro_v2;
```

### Resultado esperado

Todas as colunas devem retornar `true`. Qualquer `false` interrompe a fase antes da primeira migração e exige identificar a dependência ausente.

### Contagens de referência

Antes da escrita, registrar contagens das tabelas existentes da conta de produção. A consulta final deve ser adaptada ao modelo de proprietário e executada sem expor dados pessoais no relatório.

Registrar pelo menos:

- imóveis;
- inquilinos;
- contratos;
- pagamentos;
- cobranças/recebimentos;
- energia;
- interessados;
- Vitrine: imóveis, leads, fotos e cidades;
- proprietários-clientes, se a tabela já existir.

As contagens não comprovam integridade sozinhas, mas ajudam a detectar mudança inesperada.

---

## 7. Ordem de execução e portões

Cada passo segue o mesmo procedimento:

1. abrir uma nova consulta no SQL Editor;
2. colar somente um arquivo;
3. confirmar nome do arquivo e projeto;
4. executar;
5. ler resultado e `NOTICE`s;
6. executar a verificação do passo;
7. registrar “aprovado” ou “parado”;
8. somente então abrir o próximo arquivo.

### Já aplicado — `migracao-tema-usuario.sql`

**Faz:** cria preferências de tema por usuário e respectivas políticas.  
**Risco principal:** RLS impedir acesso se a policy estiver incompatível.  
**Verificar:** tabela existente, RLS e operações com usuário autenticado.

### Já aplicado — `migracao-imovel-tipo.sql`

**Faz:** acrescenta `tipo` aos imóveis e regras relacionadas.  
**Risco principal:** baixo; mudança aditiva.  
**Verificar:** coluna e constraints esperadas, sem alteração dos demais dados.

### Já aplicado — `migracao-inquilino-rg.sql`

**Faz:** acrescenta RG ao cadastro do inquilino.  
**Risco principal:** baixo; mudança aditiva.  
**Verificar:** coluna presente e cadastros anteriores intactos.

### Já aplicado — `migracao-minha-casa-formas-pagamento.sql`

**Faz:** cria preferências e funções para formas de pagamento do Minha Casa.  
**Dependências:** Minha Casa e controle de módulos.  
**Risco principal:** função/policy bloquear gravação da preferência.  
**Verificar:** tabela, RLS, leitura e salvamento mantendo ao menos uma forma ativa.

### Já aplicado — `migracao-manutencoes.sql`

**Faz:** acrescenta campos de gestão completa aos chamados e liga fotos.  
**Dependências:** estruturas de vistoria/chamados.  
**Risco principal:** constraints ou referências incompatíveis com registros antigos.  
**Verificar:** 13 evidências de colunas descritas na documentação operacional.

```sql
select table_name, column_name
  from information_schema.columns
 where (table_name='imoveis'    and column_name='tipo')
    or (table_name='inquilinos' and column_name='rg')
    or (table_name='chamados' and column_name in
        ('prazo','responsavel','fornecedor','orcamento','custo_final',
         'quem_paga','observacoes','motivo_encerramento','arquivado_em','historico'))
    or (table_name='fotos' and column_name='chamado_id')
 order by table_name, column_name;
```

**Esperado:** 13 linhas.

Os cinco itens acima foram confirmados e não serão reexecutados no roteiro reduzido.

### Execução concluída 1 — `migracao-vitrine-equipe.sql`

**Faz:** corrige defaults/policies para equipe, repara cidades gravadas sob colaborador e atualiza registro de leads públicos.  
**Dependências:** Vitrine, Vitrine Corretora e acessos de colaboradores.  
**Risco principal:** cidade duplicada por slug fazer o arquivo falhar; alteração de policy; backfill de `user_id` em cidades.  
**Comportamento seguro:** se o reparo gerar conflito de slug, a transação inteira deve falhar e voltar. Não apagar cidade diretamente no banco; revisar pela interface antes de nova tentativa.  
**Verificar:** aviso de cidades órfãs igual a zero; colaborador operacional cria cidade e o proprietário a visualiza.

**Execução:** concluída em 1º de agosto de 2026, no projeto Supabase **Aluguel Casas**, usando o arquivo local com SHA-256 `b82a1babf786e9b50708e80548a457d1ad1fdb195bb9cc502b5fe531c92e9a6a`. O Supabase retornou `Success. No rows returned` e a transação chegou ao `commit`.  
**Validação estrutural:** 6/6 defaults corrigidos; policy única de cidades com proprietário e permissão operacional; função de clique no WhatsApp presente; deduplicação por telefone e teto de 30 confirmados na função de leads; permissões esperadas confirmadas; zero cidades vinculadas a colaborador.  
**Contagens preservadas:** 6 cidades, 1 imóvel público, 5 fotos e 0 leads.  
**Validação funcional adiada:** não foi criado registro fictício para testar a escrita por colaborador. Esse cenário permanece no roteiro de fumaça com uma conta apropriada.

### Execução concluída 2 — `migracao-vitrine-fotos.sql`

**Faz:** acrescenta miniatura/legenda, CRECI e substitui funções públicas relacionadas.  
**Dependências:** Vitrine Corretora; deve vir depois do passo 6.  
**Risco principal:** função pública devolver campo indevido ou quebrar anúncios antigos.  
**Verificar:** anúncio público, miniatura/fallback, legenda, CRECI, privacidade e acesso às fotos ativas.

**Resultado:** `thumb_path`, CRECI, acesso público à miniatura, listagem com miniaturas/legendas/CRECI e perfil de quatro argumentos confirmados. Permaneceram 5 fotos e 1 anúncio. SHA-256: `d0169170f6979e1f63d66d70e8406ae02973d7a64ff3ac6ee032cf956b503030`.

### Execução concluída 3 — `migracao-backup-v7.sql` — primeira execução

**Faz ao aplicar:** cria tabela de importações e substitui a rotina de importação/restauração.  
**Não faz ao aplicar:** não restaura backup e não apaga a carteira. Os `delete` existentes estão dentro da função criada e somente são executados quando a restauração em modo substituir é chamada.  
**Risco principal:** uma rotina de recuperação incorreta somente aparecer quando for necessária; por isso o teste ocorre em conta de teste.  
**Verificar:** preservação de tipo e RG e existência da proteção de importação.

```sql
select
  prosrc like '%tipo=excluded.tipo%' as preserva_tipo,
  prosrc like '%rg=excluded.rg%'     as preserva_rg
from pg_proc
where proname = 'importar_backup_atomico_v7';
```

**Esperado:** `preserva_tipo=true` e `preserva_rg=true`.

```sql
select to_regclass('public.backups_importados') is not null as protegido;
```

**Esperado:** `protegido=true`.

**Resultado:** tabela com RLS forçada, policy do dono e função V7 confirmadas; preservação de tipo e RG presente; rotas antigas sem execução para `authenticated`. Nenhuma restauração foi chamada e as contagens permaneceram inalteradas. SHA-256: `f1fb2e7883040f6c38a679727a882156469b2fb75c5936f85f7023f319eaff16`.

### Execução concluída 4 — `migracao-controle-versao.sql`

**Faz:** cria registro e diagnóstico de migrações, incluindo detecção retroativa por evidências.  
**Dependência:** controle de tipos de acesso.  
**Risco principal:** conta sem perfil Mestre não conseguir consultar diagnóstico.  
**Verificar:** entrar com conta Mestre e executar:

```sql
select * from public.diagnostico_migracoes();
```

Não avançar se uma migração estrutural obrigatória aparecer como ausente sem explicação.

**Ocorrência e correção:** a primeira tentativa falhou antes do `commit`, com erro PostgreSQL `42601` na declaração do alias da lista `VALUES`. O rollback foi confirmado: tabela e funções continuaram ausentes. A linha `as t(ord integer, nome text, tipo text, alvo text, alvo2 text)` foi corrigida para `as t(ord, nome, tipo, alvo, alvo2)`. A segunda execução terminou com sucesso.  
**Resultado:** tabela com RLS forçada, policy Mestre, funções de registro e diagnóstico confirmadas. O diagnóstico oficial retornou 33/33 evidências aplicadas e nenhuma ausente. O arquivo corrigido tem SHA-256 `823780e694d0870aecbea306666473a7477120ce45bab6d0837a95338d7f0895`.

### Execução concluída 5 — `migracao-proprietario-cliente.sql`

**Faz:** cria cadastro de proprietários-clientes, liga imóveis e faz ponte com anunciantes da Vitrine.  
**Dependência:** Financeiro v2.  
**Risco principal:** backfill por conta e nome; homônimos ou cadastros antigos podem precisar de revisão humana.  
**Verificar:** quantidade de clientes, quantidade de anunciantes ligados e lista dos que permanecerem sem vínculo. Não corrigir automaticamente casos ambíguos.

**Resultado:** tabela com RLS forçada, duas policies, quatro colunas de vínculo e índice de origem única confirmados. Foi criado 1 proprietário-cliente para o único anunciante existente; 1 anunciante ficou ligado e nenhum permaneceu sem vínculo. SHA-256: `b6e37bdb46c7d09ce03a81914eaa89622e55db4459b5cee8ec81516cd5bce1ba`.

### Execução concluída 6 — `migracao-backup-v7.sql` — segunda execução

**Faz:** atualiza novamente a rotina, agora reconhecendo proprietários-clientes.  
**Risco principal:** o mesmo do passo 8.  
**Verificar:** diagnóstico final e teste de restauração de proprietário/vínculo em conta de teste.

**Resultado:** função final confirmada com preservação de tipo, RG e `import_v7_owners`; execução registrada no controle de versões. Nenhuma restauração foi chamada.

---

## 8. Condições de parada imediata

Parar sem executar o arquivo seguinte se ocorrer qualquer um destes casos:

- projeto ou site não identificados com certeza;
- backup de dados inválido ou incompleto;
- nenhuma proteção de esquema disponível;
- dependência do preflight retornando `false`;
- SQL sem `commit` bem-sucedido;
- erro ou aviso não previsto;
- conflito de slug de cidade;
- RLS bloqueando o proprietário;
- colaborador criando registro invisível para o dono;
- contagem de dados reduzida sem explicação;
- diagnóstico indicando ausência inesperada;
- teste de backup perdendo tipo, RG, proprietário ou vínculo;
- suíte local vermelha;
- build divergente;
- usuário relatando operação concorrente durante a janela.

Parar não é falhar: é preservar o último estado conferido.

---

## 9. Reversão e recuperação

### Falha antes do `commit`

O PostgreSQL deve desfazer o arquivo inteiro. Registrar o erro e não seguir.

### Problema descoberto depois do `commit`

Não executar uma lista genérica de `drop`. As migrações não são todas puramente aditivas:

- há funções substituídas;
- há policies substituídas;
- cidades podem ter `user_id` reparado;
- proprietários podem ser criados e vinculados por backfill;
- defaults e permissões mudam.

O procedimento é:

1. interromper a fase;
2. preservar logs e resultado da consulta;
3. não executar o passo seguinte;
4. avaliar se o problema é de dados, policy, função ou interface;
5. restaurar definição anterior ou usar recuperação de banco somente com autorização específica;
6. usar o backup do aplicativo apenas para dados da conta, nunca como substituto automático de rollback de esquema;
7. repetir o teste em conta não produtiva antes de retornar.

### Deploy do site

Se o site novo falhar e o banco estiver correto, restaurar o deploy anterior pelo Netlify é o caminho preferencial. Não reverter o banco automaticamente apenas porque o front-end precisa voltar.

---

## 10. Validação do backup em conta de teste

Nunca executar este ensaio destrutivo na conta de produção.

1. cadastrar imóvel de teste com tipo;
2. cadastrar inquilino de teste com RG;
3. cadastrar proprietário e ligar ao imóvel;
4. exportar;
5. restaurar em modo substituir na conta de teste;
6. conferir tipo, RG, proprietário e vínculo;
7. importar a mesma exportação duas vezes em modo adicionar;
8. confirmar que a segunda é recusada;
9. restaurar o mesmo retrato duas vezes;
10. confirmar que ambas as restaurações são aceitas.

---

## 11. Testes, build e deploy

### Local

Depois do banco validado:

```text
npm.cmd test
npm.cmd run build
```

No Windows, usar `npm.cmd` evita a restrição local que pode bloquear `npm.ps1`.

**Executado em 1º de agosto de 2026:**

- `npm.cmd test`: aprovado integralmente;
- `npm.cmd run build`: publicação `5375644ce1d4` preparada com 51 arquivos em `dist/`.

### Deploy executado

O proprietário autorizou a publicação e foi usada a Netlify CLI autenticada, vinculada ao projeto confirmado.

- pacote local: `dist-deploy-5375644ce1d4.zip`;
- SHA-256 do pacote: `d92cd4bc864200a7ae0d35eb1b6eac2a351e01bc4ae9cb6b42a6e26d64d1f58d`;
- deploy: `6a6e3934ba591c21a8b19709`;
- 16 arquivos novos enviados, 1 página gerada e 15 assets alterados;
- 1 regra de redirect, 5 regras de header e 1 edge function publicadas sem erro;
- deploy anterior preservado.

### Regra

Testes vermelhos, build incompleto ou site de destino incerto impedem o deploy.

---

## 12. Teste de fumaça após publicação

### Resultado público executado

- URL de produção e URL imutável carregaram com o título esperado;
- tela de escolha de acesso renderizada;
- transições para Admin e Portal/Inquilino funcionando;
- landing page pública carregada com o título esperado;
- nenhum erro de navegador observado nas páginas verificadas;
- nenhuma credencial foi enviada e nenhum login foi realizado.

### Resultado autenticado de leitura executado

- login Mestre concluído com o preenchimento já disponível no navegador;
- painel e dados de resumo carregados;
- navegação aprovada em Imóveis, Proprietários, Inquilinos, Interessados, Manutenções, Energia, Financeiro, Agenda e Pendências;
- troca aprovada entre Aluguéis, Minha Casa, Vitrine e Comercial;
- sessão permaneceu autenticada depois da recarga da página;
- telas de Backup e Histórico de alterações abriram normalmente;
- logout concluído e retorno à escolha de acesso confirmado;
- nenhum cadastro, pagamento, importação, restauração, exclusão ou outra alteração de dados foi realizado.

### Resultado autenticado de escrita controlada

Foram criadas três contas temporárias e isoladas — proprietário, colaborador operacional e inquilino — sem registrar e-mails ou senhas no relatório. A conta principal não recebeu dados fictícios.

**Aprovado:**

- criação de imóvel, inquilino, vínculo e contrato dentro da conta proprietária temporária;
- registro de parcela de aluguel, com quitação do ajuste inicial;
- colaborador operacional autenticado, herdando os módulos e visualizando a carteira compartilhada;
- papel operacional sem ação para confirmar recebimento financeiro;
- Portal do Inquilino autenticado, exibindo contrato, pagamentos e arquivos sem acesso à Gestão;
- exportação externa de backup concluída;
- backup automático localizado;
- restauração incompatível bloqueada antes de apagar dados por existirem convites/acessos do Portal;
- imóvel preservado depois do bloqueio da restauração.

**Falhas encontradas:**

1. o formulário de nova manutenção aparece para proprietário e colaborador operacional, mas o salvamento falha em ambos com `Não foi possível salvar o chamado.`;
2. a ação `Apagar tudo`, na Zona de risco da conta temporária, falha com `Erro ao apagar. Tente novamente.`.

**Limpeza:** colaborador e inquilino foram removidos; os registros-raiz temporários de imóvel e inquilino foram eliminados pelo editor de tabelas depois da falha da Zona de risco; por fim, a conta proprietária foi excluída. A lista retornou aos três usuários originais e nenhuma conta temporária permaneceu.

O roteiro abaixo permanece como referência para a repetição depois da correção das duas falhas.

### Conta proprietária

- login, tema e recarga;
- imóveis e inquilinos;
- proprietário e extrato;
- pagamentos, energia e manutenção;
- histórico de alterações;
- backup disponível.

### Colaborador operacional

- acesso apenas ao que o papel permite alterar;
- leitura compartilhada dos imóveis;
- criação de cidade/anúncio/foto/lead na Vitrine;
- dados visíveis para o proprietário.

### Vitrine pública

- lista e detalhe;
- compartilhamento direto;
- voltar do navegador;
- galeria e swipe;
- miniaturas;
- formulário de interesse;
- clique no WhatsApp sem duplicar na mesma hora;
- rodapé, CRECI e privacidade;
- barra móvel de preço/WhatsApp;
- anúncio inativo fora da experiência pública esperada.

### Backup

- somente verificar disponibilidade em produção;
- o teste de substituir permanece restrito à conta de teste.

---

## 13. Registro de conclusão

Ao terminar, registrar:

- data e janela;
- projeto Supabase confirmado;
- site Netlify confirmado;
- backup de dados criado;
- proteção de esquema confirmada;
- resultado de cada passo;
- diagnóstico final;
- versão do build/deploy;
- roteiro de fumaça;
- problemas encontrados;
- itens adiados;
- decisão de encerrar ou abrir a Fase 1.

Não incluir chaves, tokens, CPF, RG, telefones, conteúdo do backup ou identificadores sensíveis no relatório.

---

## 14. Aprovação necessária

Todas as migrações, a validação estrutural, os testes, o build, o deploy e a fumaça autenticada com escrita controlada foram executados. A próxima decisão necessária é:

1. **Autoriza diagnosticar e corrigir a gravação de manutenções para contas novas?**
2. **Autoriza diagnosticar e corrigir a ação `Apagar tudo` da Zona de risco?**
3. **Depois das correções, autoriza criar novas contas temporárias, repetir esses dois cenários e removê-las novamente?**

Nenhuma correção de código ou nova alteração de produção será iniciada sem essa aprovação.
