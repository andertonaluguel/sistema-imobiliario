# Publicação desta etapa

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
