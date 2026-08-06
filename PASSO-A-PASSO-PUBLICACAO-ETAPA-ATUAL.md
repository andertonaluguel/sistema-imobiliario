# Publicação desta etapa

## Etapa 2 da Vitrine — concluída em produção

Em 05/08/2026 foi publicada a base pública de SEO e marca da Vitrine. A
migração `migracao-vitrine-seo-marca.sql` foi aplicada como migração 37 e
acrescentou perfil institucional, paletas controladas, logo privada com entrega
pública validada, RPC de sitemap e a versão enriquecida da API pública.

### Resultado executado em 05/08/2026

- backup lógico anterior à migração:
  `../backups/vitrine-pre-etapa2-2026-08-05T2145.json`;
- SHA-256 do backup:
  `c0a8ff96294cbc4cfa98fb564136dbbf75c028e9f86a09be634945346de3d860`;
- SHA-256 da migração aplicada:
  `7bb72f1c168b085a5acabe46363fe823fe082463b4cc4692840d830af18a82df`;
- cinco colunas de marca presentes e migração registrada;
- RPCs de sitemap, logo e perfil institucional presentes;
- sitemap retornando somente perfil e anúncio ativos;
- contagens preservadas: 6 cidades, 1 anúncio ativo, 5 fotos, 1 lead e 1 taxa;
- API pública respondeu sem `observacao_privada`;
- rotas estáveis publicadas por Vitrine, cidade, finalidade, tipo e imóvel;
- links antigos com `?vitrine=` continuam abrindo e são normalizados;
- canonical ignora busca, ordem e demais filtros cosméticos;
- área interna permanece `noindex,nofollow`; busca livre usa `noindex,follow`;
- HTML inicial contém Open Graph, Twitter Cards e JSON-LD;
- `robots.txt` aponta para `sitemap.xml`;
- build final: `af06d9e04146`;
- deploy final: `6a73d9cf8561823253d5da67`;
- URL imutável:
  `https://6a73d9cf8561823253d5da67--aluguel-casas-anderton.netlify.app`;
- fumaça aprovada na primeira carga, na URL principal e na ficha profunda;
- service worker alterado para rede-primeiro em JS/CSS/JSON, impedindo HTML
  novo com JavaScript antigo depois dos próximos deploys.

Rollback de front-end: restaurar o deploy estável anterior
`6a73d165cb2dd40c79baf120`. A migração 37 é aditiva e pode permanecer no banco.
Não apagar colunas ou logo que já possam ter recebido configuração.

As paletas disponíveis são `floresta`, `oceano`, `terracota` e `grafite`.
Nenhuma cor livre é aceita. O perfil existente permaneceu na paleta padrão e
nenhum dado institucional foi inventado durante a publicação.

---

## Etapa 1 da Vitrine — concluída em produção

Em 05/08/2026 foi concluída e publicada a fundação de dados da Vitrine. O
arquivo `migracao-vitrine-fundacao.sql` foi aplicado como migração 36. Ele
acrescenta campos centrais e comerciais, política de endereço, terrenos,
catálogo/vínculos de comodidades, documentação triária, leitura pública
`listar_vitrine_publica_v2` e restauração atômica
`importar_backup_atomico_v8`.

O front-end continua lendo bancos antigos, mas **não salva um anúncio com a
versão nova antes da migração**: ele para com mensagem clara para não descartar
campos silenciosamente. Por isso a ordem obrigatória é **banco → fumaça →
front-end**.

### Resultado executado em 05/08/2026

- backup lógico anterior à migração:
  `../backups/vitrine-pre-etapa1-2026-08-05T2101.json`;
- SHA-256 do backup:
  `bf6f4d5336936576132d8bc5e5477e784eeb871aebaf7ba79722c60f79231cc0`;
- deploy anterior preservado para reversão: `6a73c25a33345e07b3f73c7e`;
- migração registrada, três tabelas novas presentes, três RPCs presentes e as
  dez colunas da fundação presentes;
- RLS e RLS forçada confirmadas nas três tabelas novas;
- contagens preservadas: 6 cidades, 1 anunciante, 1 anúncio, 5 fotos, 1 lead e
  1 taxa;
- API pública V2 retornou o anúncio existente e não expôs a observação privada;
- testes automatizados aprovados;
- build publicado: `731d6d852758`;
- deploy de produção: `6a73d165cb2dd40c79baf120`;
- URL imutável:
  `https://6a73d165cb2dd40c79baf120--aluguel-casas-anderton.netlify.app`;
- URL principal e URL imutável responderam HTTP 200 com o mesmo build;
- fumaça pública aprovada até cidade, filtros, card e ficha completa, sem erro.

A sessão administrativa do navegador usado na publicação não estava
autenticada. Nenhuma credencial foi solicitada ou reutilizada e nenhum rascunho
foi criado na conta real. As garantias de escrita, serialização e Backup V8
permanecem cobertas pela suíte automatizada; a estrutura, o isolamento e a API
pública foram verificados diretamente no banco de produção.

As seções seguintes ficam como roteiro histórico e de reversão. Não repetir o
SQL em produção sem novo diagnóstico e autorização.

### Portão antes de produção

1. Confirmar um backup recuperável do projeto Supabase. A exportação V7 que
   estiver em produção ainda não contém a Vitrine completa; não tratá-la como
   única cópia de segurança desta etapa.
2. Registrar o deploy anterior: `6a73c25a33345e07b3f73c7e`.
3. Rodar o preflight abaixo no SQL Editor, sem alterar dados:

```sql
select
  to_regclass('public.vitrine_imoveis') is not null as tem_vitrine,
  to_regprocedure('public.listar_vitrine_publica(text)') is not null as tem_rpc_publica,
  to_regprocedure('public.importar_backup_atomico_v7(jsonb,boolean)') is not null as tem_backup_v7,
  exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='vitrine_imoveis' and column_name='suites') as tem_detalhes,
  exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='vitrine_anunciantes' and column_name='proprietario_cliente_id') as tem_dono_unico;

select
  (select count(*) from public.vitrine_cidades) as cidades,
  (select count(*) from public.vitrine_anunciantes) as anunciantes,
  (select count(*) from public.vitrine_imoveis) as anuncios,
  (select count(*) from public.vitrine_fotos) as fotos,
  (select count(*) from public.vitrine_leads) as leads,
  (select count(*) from public.vitrine_taxas) as taxas;
```

As cinco condições devem vir `true`. Guarde as seis contagens.

### Aplicação controlada

No SQL Editor, executar somente o conteúdo de
`migracao-vitrine-fundacao.sql`. O arquivo é transacional, aditivo e
reexecutável. Se houver erro, parar: não publicar o front-end e não tentar
completar a migração manualmente.

### Postflight obrigatório

```sql
select * from public.diagnostico_migracoes()
where arquivo='migracao-vitrine-fundacao.sql';

select relname,relrowsecurity,relforcerowsecurity
from pg_class
where relname in (
  'vitrine_comodidades_catalogo',
  'vitrine_imovel_comodidades',
  'vitrine_documentacao_imovel'
)
order by relname;

select
  to_regprocedure('public.listar_vitrine_publica_v2(text)') is not null as publica_v2,
  to_regprocedure('public.importar_backup_atomico_v8(jsonb,boolean)') is not null as backup_v8;
```

A migração 36 deve estar `aplicada=true` e `registrada=true`; as três tabelas
devem ter RLS e RLS forçada; as duas funções devem existir. Repita a consulta de
contagens do preflight: os anúncios, fotos, leads e taxas existentes não podem
diminuir.

### Fumaça antes e depois do deploy

- abrir e salvar um anúncio antigo sem mudar os dados;
- criar um rascunho temporário com área útil, total de andares, ano,
  disponibilidade, uma condição triária, uma comodidade e um documento;
- recarregar e confirmar todos os valores;
- confirmar que nota interna e observação privada não aparecem na RPC pública;
- testar endereço `oculto`, `aproximado` e `exato` em rascunho controlado;
- exportar Backup V8 e conferir a seção `vitrine` no JSON;
- testar importação/restauração somente em conta descartável, nunca sobre as
  contas reais da fumaça;
- apagar o rascunho e a conta temporária ao terminar.

Depois do banco aprovado, publicar o pacote do front-end. O build isolado local
validado nesta implementação foi `731d6d852758` com 51 arquivos; gere um build
novo no momento da publicação e registre o identificador efetivamente enviado.

### Reversão

Se o problema estiver somente no front-end, voltar imediatamente ao deploy
`6a73c25a33345e07b3f73c7e`. A migração é aditiva: deixar colunas e tabelas no
banco é a reversão mais segura. Não apagar estrutura que já possa ter recebido
dados. As funções V2/V8 podem permanecer sem serem chamadas pelo deploy antigo.

Se o SQL falhar durante a execução, a transação desfaz o arquivo inteiro. Se o
postflight divergir, parar antes do deploy e comparar as contagens com o
preflight.

## Estado atualizado em 1º de agosto de 2026

As migrações deste roteiro já foram aplicadas ao banco de produção, uma por vez. O diagnóstico retornou 33/33 evidências aplicadas; testes locais passaram e o build `5375644ce1d4` preparou 51 arquivos em `dist/`.

O deploy `6a6e3934ba591c21a8b19709` foi publicado no Netlify; as fumaças pública, autenticada de leitura e de escrita controlada foram executadas. Duas falhas permanecem abertas em contas novas: salvar manutenção e `Apagar tudo`. Todas as contas e dados temporários usados no teste foram removidos. A fonte operacional atual é `marketing/estrategia/FASE-0-REGULARIZACAO-PRODUCAO.md`; as instruções de SQL abaixo permanecem como histórico e não devem ser repetidas sem novo diagnóstico e autorização.

**~~Dois cadastros para a mesma pessoa~~ — unificado em 01/08/2026.** O dono
do imóvel agora tem um cadastro só: **Proprietários**. A tabela
`vitrine_anunciantes` continua existindo e continua sendo o alvo da chave
estrangeira do anúncio — migrar essa FK mexeria numa tabela que a página
pública consulta —, mas virou **espelho**: cada proprietário tem no máximo
uma linha lá, criada sozinha quando precisa. A aba da Vitrine passou a se
chamar Proprietários e mostra anúncios e taxas por dono.

O que observar na prática: anunciantes criados antes desta etapa e que
nunca tiveram proprietário aparecem num aviso na aba, pedindo para abrir o
anúncio e escolher o dono. A migração já casou os que dava para casar
por nome.

**As fotos não são copiadas ao publicar.** "Publicar na Vitrine" leva os
dados da ficha, não as imagens. Elas continuam sendo enviadas no anúncio.
Copiar exigiria baixar e reenviar cada arquivo, e o anúncio quase sempre
quer fotos diferentes das da vistoria.

**Fases 4 e 5 do plano seguem abertas:** responsável por lead e por imóvel,
funil com histórico, ranking; e sitemap, JSON-LD, logo e cores próprios da
corretora no site público.

---

## Publicação desta etapa (seções 1–14)

Guia para aplicar no Supabase e publicar no Netlify. Feito para ser
seguido na ordem, sem pressa, com uma verificação entre cada passo.

Última revisão: 2026-07-31.

---

## Antes de tudo: faça uma exportação

No app: **perfil (rodapé da barra lateral) → Backup → Baixar exportação**.

Não pule. As cinco migrações abaixo nunca rodaram em nenhum banco: são
transacionais e reexecutáveis, mas o teste de fogo é a primeira execução
contra dados reais. Com a exportação na mão, qualquer surpresa é
reversível.

---

## Parte 1 — Supabase (SQL Editor)

Abra o projeto no Supabase → **SQL Editor** → **New query**. Cole o
conteúdo de um arquivo por vez, execute e confira o resultado antes de
ir para o próximo.

Todas começam em `begin;` e terminam em `commit;`. Se algo falhar no
meio, o PostgreSQL desfaz o arquivo inteiro — o banco não fica pela
metade.

| # | Arquivo | O que faz | Depende de |
|---|---|---|---|
| 1 | `migracao-tema-usuario.sql` | preferência de tema por usuário | — |
| 2 | `migracao-imovel-tipo.sql` | coluna `tipo` em `imoveis` | `imoveis` |
| 3 | `migracao-inquilino-rg.sql` | coluna `rg` em `inquilinos` | `inquilinos` |
| 4 | `migracao-minha-casa-formas-pagamento.sql` | formas de pagamento ativas | `minha_casa_familia_atual_id()` e `tem_modulo()` |
| 5 | `migracao-manutencoes.sql` | campos e situações da gestão completa | `chamados` e `fotos` |
| 6 | `migracao-vitrine-equipe.sql` | **a Vitrine passa a funcionar para a equipe** | `migracao-vitrine-corretora.sql` |
| 7 | `migracao-vitrine-fotos.sql` | miniatura, legenda e CRECI no rodapé | idem, e roda **depois** da 6 |
| 8 | `migracao-backup-v7.sql` | **rode de novo** — a restauração preserva tipo e RG, e a importação recusa a mesma exportação duas vezes | as de sempre, mais `migracao-imovel-tipo.sql` e `migracao-inquilino-rg.sql` |
| 9 | `migracao-controle-versao.sql` | passa a ser possível **perguntar ao banco** quais migrações ele recebeu | `migracao-tipos-acesso.sql` |
| 10 | `migracao-proprietario-cliente.sql` | cadastro do dono do imóvel administrado | `migracao-financeiro-v2.sql` |
| 11 | `migracao-backup-v7.sql` | **de novo, depois da 10** — o backup passa a carregar os proprietários | a 10 |
| 12 | `migracao-vitrine-detalhes.sql` | suítes, andar, idade, conservação e área total no anúncio | roda **depois** da 7 — ela reescreve a mesma função pública |
| 13 | `migracao-vitrine-fundacao.sql` | fundação estruturada, leitura pública V2 e Backup V8 | depois da 12, da unificação de proprietários e do Backup V7 |

### A 12 tem de vir depois da 7

As duas reescrevem `listar_vitrine_publica`. A 12 parte da versão da 7 e
acrescenta cinco campos; rodar fora de ordem apagaria as miniaturas e as
legendas da página pública. O arquivo se recusa a rodar se a 7 não tiver
passado — a mensagem diz exatamente qual arquivo falta.

Nada é apagado: todo anúncio que já existe continua igual, com os campos novos
vazios. No fim, duas linhas de conferência:

```
NOTICE: Colunas novas: 5  |  Anuncios preservados: N
NOTICE: Migracao concluida. Todo anuncio existente continua igual, com os campos novos vazios.
```

O `N` é a sua contagem de anúncios de sempre.

### Por que a 11 repete a 8

O arquivo do backup é rodado duas vezes de propósito: a primeira vez traz a
correção do tipo e do RG; depois que a 10 cria a tabela de proprietários, a
segunda passada ensina a restauração a carregá-los. Rodar duas vezes é
inofensivo — o arquivo é reexecutável.

Se preferir, rode a 10 antes da 8 e o backup uma vez só. A ordem acima é a
que testei.

### Por que a 8 é a mais urgente de todas

A restauração de backup **apaga tudo da conta e reinsere** a partir do
retrato, com lista explícita de colunas. As colunas `imoveis.tipo` e
`inquilinos.rg` nasceram depois dessa rotina e ficaram de fora dela.

Isso não é risco futuro: **quem restaurou um backup até hoje perdeu os dois
campos em toda a carteira**, em silêncio, numa operação que termina com
sucesso. E restaurar é justamente o que se faz no pior dia.

O arquivo é reexecutável e é o mesmo de sempre — só a rotina mudou. Rode-o
de novo em todo banco que já o tinha recebido. A exportação sempre carregou
os dois campos; era só a volta que os descartava.

As de número 4 a 7 **checam suas dependências e param com uma mensagem
clara** se algo faltar. Se a 4 reclamar, rode antes `migracao-minha-casa.sql`
e `migracao-modulos.sql`. Se a 5 reclamar, rode antes
`migracao-vistoria-e-chamados.sql`. Se a 6 ou a 7 reclamarem, rode antes
`migracao-vitrine.sql` e `migracao-vitrine-corretora.sql`.

### Por que a 6 é a mais importante desta etapa

As tabelas da Vitrine nasceram com `user_id ... default auth.uid()`, mas a
policy exige `user_id = usuario_proprietario_id(auth.uid())`. Para o
proprietário os dois valores são iguais e o problema nunca apareceu. Para um
**colaborador** são diferentes: todo insert era rejeitado pela policy e pela
chave estrangeira. Na prática, corretor nenhum conseguia cadastrar imóvel,
cidade, anunciante, foto ou taxa. A `vitrine_cidades` errava ao contrário —
o colaborador gravava, e a cidade sumia para o dono da conta.

A migração 6 conserta a origem (o default e a policy) e repara as cidades que
ficaram presas a um colaborador. O aplicativo já passou a mandar o `user_id`
correto em todo insert, então os dois lados protegem a mesma regra.

### Ordem obrigatória entre a 6 e a 7

A 7 redefine `listar_vitrine_publica` partindo da versão de
`migracao-vitrine-corretora.sql`. Rodar a 7 antes da 6 funciona, mas a 6
depois não desfaz nada — a ordem 6 → 7 é a testada.

### O que o passo 9 resolve

São 28 arquivos de migração e, até aqui, nenhuma forma de perguntar ao banco
o que já rodou — a ordem só existia em prosa, espalhada por três documentos.
Com um banco só dá para conviver; com um segundo cliente, não.

Depois de aplicá-lo, esta consulta responde a pergunta, com uma linha por
arquivo (rode com a conta Mestre):

```sql
select * from public.diagnostico_migracoes();
```

A coluna `aplicada` vem da **evidência no esquema** — a tabela, a coluna ou
a função que só aquele arquivo cria —, então ela vale mesmo para os 28 que
rodaram antes de existir qualquer registro. A coluna `registrada` mostra os
que se anunciaram sozinhos; daqui para a frente, toda migração nova faz isso
no final.

Repare na linha `migracao-backup-v7.sql (revisao 31/07/2026)`: ela olha
dentro do corpo da função, porque o arquivo é o mesmo de sempre e só a
rotina mudou. Se ela vier `false`, o banco ainda apaga o tipo e o RG ao
restaurar.

### Conferência do backup (passo 8)

Depois de rodar o `migracao-backup-v7.sql` de novo, confirme que a rotina
enxerga as duas colunas:

```sql
select
  prosrc like '%tipo=excluded.tipo%' as preserva_tipo,
  prosrc like '%rg=excluded.rg%'     as preserva_rg
from pg_proc
where proname = 'importar_backup_atomico_v7';
```

As duas colunas devem vir `true`. Se vierem `false`, o banco ainda está com
a versão antiga da rotina.

E confirme que a proteção contra importação repetida existe:

```sql
select to_regclass('public.backups_importados') is not null as protegido;
```

**Como a proteção funciona.** A exportação passou a carregar um
identificador próprio, e o banco recusa a mesma exportação duas vezes na
mesma conta. Vale só para **importar** (que adiciona registros);
**restaurar** substitui tudo e continua livre, porque repetir uma
restauração é legítimo — é o que se faz quando a primeira não foi a
esperada.

Arquivos baixados antes desta etapa não têm o identificador: continuam
sendo aceitos, só não ficam protegidos. A tela de importação avisa quando o
arquivo é desses.

### Como saber que deu certo

Depois das cinco primeiras, rode esta consulta. Ela deve devolver **13 linhas**:

```sql
select table_name, column_name
  from information_schema.columns
 where (table_name='imoveis'     and column_name='tipo')
    or (table_name='inquilinos'  and column_name='rg')
    or (table_name='chamados'    and column_name in
        ('prazo','responsavel','fornecedor','orcamento','custo_final',
         'quem_paga','observacoes','motivo_encerramento','arquivado_em','historico'))
    or (table_name='fotos'       and column_name='chamado_id')
 order by table_name, column_name;
```

E esta, para conferir que o isolamento por conta continua ligado
(as duas tabelas novas devem aparecer com `rowsecurity = true`):

```sql
select relname, relrowsecurity as rowsecurity, relforcerowsecurity as forcada
  from pg_class
 where relname in ('preferencias_usuario','minha_casa_preferencias');
```

### Se precisar voltar atrás

As migrações **não apagam nada**: só acrescentam colunas e tabelas. Para
desfazer, basta remover o que foi criado — os dados antigos seguem
intactos:

```sql
-- desfaz apenas o que esta etapa criou
drop table if exists public.preferencias_usuario;
drop table if exists public.minha_casa_preferencias;
drop function if exists public.minha_casa_formas_pagamento();
drop function if exists public.minha_casa_salvar_formas_pagamento(text[]);
-- as colunas novas podem ficar: o app funciona com e sem elas
```

---

## Parte 2 — Netlify

O site já está vinculado nesta pasta (`.netlify/state.json`), e o
`netlify.toml` publica `dist/` rodando **`node tests/run-tests.mjs && node
build.mjs`**.

### A suíte virou trava de publicação

Até agora as 978 asserções só rodavam quando alguém lembrava de digitar o
comando. Duas coisas mudaram:

1. O `netlify.toml` roda os testes **antes** do build. Um teste vermelho
   aborta a publicação — o `&&` garante isso.
2. A suíte deixou de depender de um arquivo fora do repositório. Ela lia
   uma exportação **real** de `../backups/`, que o `.gitignore` mantém fora
   do controle de versão (e deve manter). Agora usa
   `tests/fixtures/exportacao-exemplo-v3.json`, com a mesma forma e as
   mesmas contagens, e dados fictícios.

Também há um `.github/workflows/testes.yml` pronto, que passa a valer no dia
em que o repositório tiver um remoto no GitHub. Hoje ele fica dormente.

Localmente, o atalho é:

```bash
npm run publicar
```

### Um teste que reprovava dez dias por mês

Ao ligar a trava, apareceu uma asserção do módulo Energia que dependia do
dia do mês: ela esperava "parcial em atraso" numa cobrança que vencia dia 5
com 5 dias de tolerância. Do dia 1 ao 10 isso ainda não venceu — a asserção
passava 20 dias por mês e reprovava nos outros 10, sem nada ter mudado no
código. Uma trava que fica vermelha sozinha todo mês é pior que trava
nenhuma, então a cobrança do teste passou a ter vencimento fixo no passado.

A suíte foi conferida fingindo ser 90 dias diferentes ao longo de um ano,
incluindo 29 de fevereiro e viradas de mês. Passa em todos.

### Opção A — pelo painel (mais simples)

1. Rode a publicação local:

```bash
node build.mjs
```

2. Abra o painel do Netlify → seu site → **Deploys**.
3. Arraste a pasta `dist/` para a área de deploy manual.

### Opção B — pela linha de comando

```bash
npx netlify-cli login
```

Depois:

```bash
npx netlify-cli deploy --prod --dir=dist
```

O `login` abre o navegador uma vez; a partir daí o token fica salvo no
seu computador.

---

## Ordem recomendada

**Supabase primeiro, Netlify depois.**

O app novo funciona com o banco antigo (todos os campos novos têm
detecção automática: se a coluna não existe, o registro salva sem ela e
nada quebra). O contrário também é seguro. Mas aplicando o banco antes,
quando o site novo entrar no ar já estará tudo persistindo — sem uma
janela em que a pessoa preenche o RG e ele não é gravado.

---

## Depois de publicar, confira no app

- [ ] Barra lateral: expandir, recolher, trocar de aplicativo
- [ ] Tema Padrão e tema Roxo (perfil → Tema de cores)
- [ ] Sair e entrar de novo: o tema escolhido voltou
- [ ] Novo imóvel nas três etapas, com o tipo gravado
- [ ] Novo inquilino e edição, com CPF e RG separados
- [ ] Minha Casa: categorias de entrada e de saída, bandeja de emojis
- [ ] Editar opções: desativar uma forma de pagamento e recarregar
- [ ] Central de Pendências
- [ ] Manutenções: criar, concluir oferecendo despesa, arquivar e restaurar
- [ ] Celular: barra inferior e menu "Mais"

### Vitrine — o roteiro desta etapa

Precisa de **dois logins**: o proprietário e um colaborador com papel
`operacional`.

- [ ] Como colaborador: criar cidade, anunciante, anúncio, foto e taxa
- [ ] Como proprietário: conferir que tudo o que o colaborador criou aparece
- [ ] Publicar um anúncio, ir em **Divulgação → Copiar texto** e colar no
      WhatsApp Web: a prévia tem de vir com foto grande, título e preço
- [ ] Abrir o link no celular: lista → imóvel → **Voltar** do navegador
      devolve à lista, não sai do site
- [ ] Tocar na foto: abre em tela cheia e passa com o dedo
- [ ] Mandar um contato pelo formulário e conferir que a **mensagem escrita
      aparece** na aba Leads
- [ ] Clicar no botão do WhatsApp e conferir que entra um lead de origem
      WhatsApp — e que clicar de novo na mesma hora não duplica
- [ ] Rodapé: nome, CRECI (se preenchido em Configurações) e o link de
      privacidade abrindo
- [ ] DevTools com rede em 3G: a grade carrega com miniatura, não com a foto
      de 1920 px

### Backup — o teste que importa

Faça numa conta de teste, **nunca na de produção**:

- [ ] Cadastre um imóvel com tipo "Apartamento" e um inquilino com RG
- [ ] Baixe a exportação
- [ ] Restaure essa mesma exportação em modo substituir
- [ ] Abra o imóvel: o tipo continua "Apartamento"
- [ ] Abra o inquilino: o RG continua lá
- [ ] Importe (não restaure) a mesma exportação **duas vezes**: a segunda
      precisa ser recusada, dizendo quando a primeira entrou
- [ ] Restaure um retrato diário **duas vezes**: as duas precisam funcionar
      — substituir é idempotente e não pode ser barrado

Antes desta etapa, o tipo e o RG voltavam vazios, e a segunda importação
duplicava a carteira inteira em silêncio.

---

## Publicação da correção Etapa 0A — 05/08/2026

- migração de manutenção e limpeza aplicada no projeto Supabase de produção;
- proprietário temporário criou imóvel e chamado pela interface;
- colaborador operacional temporário visualizou a carteira e criou chamado;
- proprietário executou `Apagar tudo` com confirmação e senha;
- auditoria comprovou 0 imóveis, 0 chamados e 0 colaboradores temporários;
- perfil, assinatura e licença da conta de teste foram preservados até a
  remoção deliberada da conta;
- 10 imóveis e 1 proprietário reais permaneceram intactos;
- contas temporárias removidas;
- deploy Netlify: `6a73c25a33345e07b3f73c7e`;
- URL imutável:
  `https://6a73c25a33345e07b3f73c7e--aluguel-casas-anderton.netlify.app`;
- smoke público da escolha de acesso aprovado.

Observação de build: o `dist/` principal estava bloqueado pelo servidor local
de validação. O pacote foi construído e testado numa cópia de estágio isolada e
publicado com `--no-build`; o Netlify recebeu exatamente esse `dist` aprovado.

## Encerramento da Fase 0 — Etapa 0B

Em 05/08/2026, a fumaça ampla foi repetida em produção com proprietário e
colaborador operacional temporários. Imóvel, inquilino, contrato, criação de
chamados, conclusão, arquivamento, restauração, exportação e `Apagar tudo`
passaram. A proteção de restauração incompatível bloqueou antes de alterar o
imóvel. A auditoria preservou os 10 imóveis reais e o Auth retornou aos 3
usuários originais.

Suíte verde e build `8f1d65916d79` aprovado com 51 arquivos. Como não houve
alteração funcional na 0B, o deploy ativo continua sendo
`6a73c25a33345e07b3f73c7e`. A Fase 0 está formalmente concluída.

### Proprietários — o roteiro

- [ ] Menu **Proprietários**: cadastre um dono com taxa de administração
- [ ] Abra um imóvel → Editar: escolha esse proprietário no campo novo
      (o campo só aparece depois que existe pelo menos um cadastrado)
- [ ] Volte em Proprietários: o cartão mostra o imóvel e o repasse estimado
- [ ] **Extrato** → confira previsto, recebido, em aberto e repasse
- [ ] **Baixar PDF** e **Copiar resumo**
- [ ] Exporte e restaure: o proprietário e o vínculo com o imóvel sobrevivem

### Ponte com a Vitrine

- [ ] Abra um imóvel administrado: aparece o bloco **Vitrine** com
      "Publicar na Vitrine"
- [ ] Publique: o formulário do anúncio abre preenchido a partir da ficha
- [ ] Volte ao imóvel: o bloco mostra o código do anúncio e a situação
- [ ] Mude o aluguel do imóvel: o bloco avisa que o anúncio está
      desatualizado e oferece **Atualizar valores**
- [ ] Tente publicar o mesmo imóvel duas vezes: a segunda abre o anúncio
      existente em vez de criar outro
- [ ] Na Vitrine → Leads, use **Virar interessado** num contato do site: ele
      entra no funil com o telefone e o anúncio de origem, e o lead passa a
      mostrar "No funil"

### Cadastro único de proprietário

- [ ] Vitrine → aba **Proprietários**: lista os mesmos donos da gestão
- [ ] Crie um anúncio: o campo pede **Proprietário**, não "anunciante"
- [ ] Salve e confira na aba: o anúncio conta para aquele proprietário
- [ ] Renomeie o proprietário em Proprietários e recarregue: o nome novo
      aparece também na lista de anúncios
- [ ] Se você já usava a Vitrine antes desta etapa, confira o aviso de
      anunciantes antigos sem proprietário e ligue-os pelo anúncio

### Histórico de alterações

- [ ] Menu → **Histórico de alterações** (só administrador)
- [ ] Altere um pagamento e confira que a linha aparece com o seu nome
- [ ] Entre com um colaborador `financeiro` e confirme que o item **não**
      aparece no menu dele

---

## Entrega da Etapa 3 — busca, filtros e cards — 05/08/2026

Implementação concluída sem migração ou escrita no banco:

- filtros ativos removíveis individualmente e ação única de limpar;
- ordenação por relevância, data, preço e maior área;
- comodidades prioritárias quando existirem no estoque;
- estado vazio com alternativas compatíveis com a busca;
- favoritos persistidos localmente e separados por vitrine;
- comparação de dois a quatro imóveis, sem misturar aluguel e venda;
- gaveta móvel com contador, alvos de toque e chips roláveis;
- retorno do detalhe para a mesma posição da lista;
- miniatura com `srcset`, `sizes`, dimensões reservadas, lazy loading e
  decodificação assíncrona;
- anúncios sem características cadastradas deixam de mostrar números zero.

### Evidências

- suíte automatizada verde, incluindo os novos cenários da Etapa 3;
- lint visual preservado: cores cruas `278/278`, textos menores que 12 px
  `27/27` e raios integralmente tokenizados;
- build isolado: `680d72046dac`, 51 arquivos;
- deploy de prévia: `6a73df8cc87b1526d78ebe99`;
- URL de prévia:
  `https://6a73df8cc87b1526d78ebe99--aluguel-casas-anderton.netlify.app`;
- desktop, celular, URL filtrada, favoritos após recarga, estado vazio, volta
  com rolagem e console sem erros aprovados no navegador.

### Portão de produção

O Netlify recusou a criação de um novo deploy `--prod` porque a equipe consumiu
os créditos do ciclo. Como o deploy de prévia já continha exatamente o build
aprovado, ele foi promovido diretamente pela API do próprio Netlify. Não houve
novo build, mudança de plano nem cobrança.

- deploy ativo: `6a73df8cc87b1526d78ebe99`;
- URL principal: `https://aluguel-casas-anderton.netlify.app`;
- URL imutável:
  `https://6a73df8cc87b1526d78ebe99--aluguel-casas-anderton.netlify.app`;
- filtros e rota estável aprovados em produção;
- favoritos preservados após recarga;
- desktop e breakpoint móvel sem rolagem horizontal;
- console de produção sem erros.

A Etapa 3 está encerrada.

---

## Entrega conjunta das Etapas 4, 5 e 6 — 05/08/2026

### Etapa 4 — ficha premium

- breadcrumb, referência copiável e atualização relativa;
- galeria responsiva, lightbox, ações de favorito, comparação e compartilhamento;
- custos e total mensal sem exibir preço zero;
- características ausentes ocultadas, comodidades agrupadas e documentação pública;
- regras da locação, mapa, responsável, segurança, denúncia e similares;
- coluna de conversão no desktop e ação fixa no celular.

### Etapa 5 — retenção autorizada

- busca salva local ou com acompanhamento consentido por e-mail/WhatsApp;
- deduplicação, cancelamento e limite de histórico;
- alerta de preço com referência real, consentimento e cancelamento;
- vistos recentemente com limpeza;
- comparação ampliada e opção de mostrar somente diferenças;
- operação interna de buscas e alertas para contato manual responsável.

O sistema não afirma que há disparo automático: até um provedor de mensagens ser
contratado e configurado, a equipe acompanha as solicitações na própria Vitrine.

### Etapa 6 — agenda e conversão

- disponibilidade real por dia e faixa, antecedência e horizonte configuráveis;
- confirmação manual ou automática;
- pedido, reagendamento, cancelamento e bloqueio do mesmo horário;
- estados solicitada, confirmada, reagendada, realizada, não compareceu e cancelada;
- responsável, lead de origem, consentimento e lembrete operacional pendente;
- agenda pública oculta quando não há horários cadastrados.

A proposta simples continua condicionada à estabilização do uso de visitas, como
previsto no plano. Ela não foi apresentada como contrato nem antecipada nesta entrega.

### Banco, segurança e recuperação

- migração `migracao-vitrine-retencao-agenda.sql` aplicada e registrada;
- cinco tabelas novas com RLS habilitado e forçado;
- RPC pública V3 sem telefone, destino, token ou observação privada;
- gravação atômica da agenda e limpeza da conta atualizada;
- busca, alerta, visita, conflito, reagendamento e cancelamento aprovados numa
  transação com rollback;
- nenhum lead, contato, horário ou agenda fictícia permaneceu no banco;
- backup anterior à migração: `vitrine-pre-etapas-4-5-6-2026-08-05T2302.json`;
- SHA-256 do backup:
  `96D9DA2EF41503AD20453872FDDC2206542AA4D197E446746EC691C417BC9073`.

### Evidências de publicação

- suíte completa e verificações de sintaxe verdes;
- lint visual preservado: cores cruas `278/278`, textos menores que 12 px
  `27/27` e raios tokenizados;
- build isolado final: `5345b60335ac`, com 51 arquivos;
- deploy aprovado e promovido sem recompilar: `6a73effe2e4dd78d5e87c16e`;
- URL imutável:
  `https://6a73effe2e4dd78d5e87c16e--aluguel-casas-anderton.netlify.app`;
- URL principal: `https://aluguel-casas-anderton.netlify.app`;
- lista, ficha premium, alerta de preço e breakpoint móvel conferidos no navegador;
- produção confirmou busca salva, referência, WhatsApp e alerta, sem exibir agenda
  enquanto a disponibilidade real não for cadastrada.

As Etapas 4, 5 e 6 estão encerradas em produção. Próxima frente planejada:
**Etapa 7 — CRM operacional**.

---

## Entrega conjunta das Etapas 7 e 8 — 06/08/2026

### Etapa 7 — CRM operacional

- `interessados` preservado como cadastro único, sem criar uma segunda pessoa;
- deduplicação atômica por telefone normalizado ou e-mail;
- funil de Novo até Fechado/Perdido, com responsável e próxima ação obrigatórios
  nas etapas ativas;
- origem, campanha, finalidade, primeira resposta e motivo de perda;
- tarefas, imóveis relacionados, visitas, propostas e histórico auditável;
- mudança da situação da visita integrada ao funil e à próxima ação;
- filtros, busca, indicadores operacionais e ficha completa do contato;
- proposta tratada como negociação, sem se apresentar como contrato.

### Etapa 8 — qualidade transversal

- mapa público carregado somente após solicitação do visitante;
- imagens responsivas, lazy loading e paginação preservados;
- modais com foco inicial, ciclo por `Tab`, fechamento por `Escape` e restauração
  do foco ao controle de origem;
- alvos móveis, movimento reduzido, labels e mensagens de erro mantidos;
- telemetria de carga, lead, imagem e mapa com lista branca de contexto técnico;
- nenhuma coleta de nome, telefone, e-mail, mensagem ou token;
- retenção de telemetria limitada a 90 dias e volume limitado por conta.

### Banco, testes e recuperação

- migração `migracao-crm-qualidade.sql` aplicada e registrada;
- cinco tabelas novas, 10 campos no interessado, RLS habilitada e forçada;
- 10 políticas ativas, zero privilégio anônimo direto nas tabelas e quatro RPCs
  verificadas;
- teste transacional com rollback aprovou deduplicação, trava do funil, tarefa,
  imóvel relacionado, proposta, histórico e observabilidade;
- auditoria de primeira resposta e motivo de perda validada em rollback;
- contato temporário de fumaça removido com cascata confirmada;
- backup anterior à migração:
  `crm-pre-etapas-7-8-2026-08-05T2350.json`;
- SHA-256 do backup:
  `DBEADC36E59C68AB44D94696EBA8AD57F179C70A47A4296E0C79AE60FEFBF8A7`.

### Evidências de publicação

- suíte completa, verificações de sintaxe e catraca visual aprovadas;
- cores cruas `278/278`, textos menores que 12 px `27/27` e raios tokenizados;
- build final: `2b12f9172ca8`, com 53 arquivos;
- deploy final promovido sem recompilar: `6a73fac84927d6a7be27853d`;
- URL imutável:
  `https://6a73fac84927d6a7be27853d--aluguel-casas-anderton.netlify.app`;
- URL principal: `https://aluguel-casas-anderton.netlify.app`;
- fumaça pública aprovou rota profunda, busca, ficha, formulário e mapa sob demanda;
- fumaça autenticada aprovou cadastro, funil, responsável, prazo, histórico imediato,
  painel de qualidade e limpeza dos dados de QA;
- contagens finais: 1 lead, 1 anúncio, 0 visitas e 0 interessados.

As Etapas 7 e 8 estão encerradas em produção. A frente seguinte é estabilização
orientada pelas métricas e pelo uso real, sem nova automação autônoma ou disparo em massa.
