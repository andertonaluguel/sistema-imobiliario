# Estudo — O app vira três produtos

> Consequência da decisão 4 do estudo da Vitrine: vender Aluguéis, Minha Casa e Vitrine
> separados ou em pacote. Este documento trata do app inteiro, não só da aba nova.

---

## 1. O que você decidiu, em uma frase

O app deixa de ser **um produto com abas** e vira **três produtos que compartilham um login**.

```
   ┌─────────────────────────────────────────────────┐
   │  Um login  ·  Uma conta  ·  Um app instalado    │
   ├─────────────────────────────────────────────────┤
   │  🏠 ALUGUÉIS      contratos, pagamentos,        │  vendável
   │                   inquilinos, relatórios        │
   │  ⌂ MINHA CASA     financeiro familiar           │  vendável (low ticket)
   │  ☀ VITRINE        catálogo público de imóveis   │  vendável (novo)
   ├─────────────────────────────────────────────────┤
   │  ◈ COMERCIAL      seus clientes e suas vendas   │  SÓ SEU, nunca vendido
   └─────────────────────────────────────────────────┘
```

A pessoa vê no topo **apenas os módulos que comprou**. Quem comprou só Minha Casa entra e vê
Minha Casa — nem sabe que existe gestão de aluguéis.

---

## 2. ⚠️ O obstáculo real — e é hoje o maior do plano

**O Minha Casa está travado por dois endereços de e-mail escritos dentro do banco de dados.**

`migracao-minha-casa.sql`, linha 39:

```sql
create or replace function public.e_mestre(p_user_id uuid default auth.uid())
returns boolean ... as $$
  select exists(
    select 1 from auth.users u
    where u.id = p_user_id
      and u.email_confirmed_at is not null
      and lower(u.email) = any(
        array['andertonaluguel@gmail.com','andertonunito@gmail.com']::text[]
      )
  )
$$;
```

Toda função do Minha Casa passa por `minha_casa_exigir_mestre()`, que chama essa aí.
Ou seja: **hoje é literalmente impossível vender o Minha Casa.** Nenhum cliente vai passar
nesse teste, porque o teste é o seu e-mail.

O mesmo e-mail aparece codificado em mais três lugares:

| Onde | Para quê |
|---|---|
| `config.js:15` — `MASTER_EMAILS` | Protege o e-mail da conta Mestre na interface |
| `migracao-minha-casa.sql:52` — `e_mestre()` | Trava o Minha Casa inteiro |
| `migracao-versao-comercial-v1.sql:939` | Impede que o e-mail Mestre vire inquilino |

**O que precisa acontecer:** `e_mestre()` continua existindo — ela é boa e protege a aba
Comercial, que deve mesmo ser só sua. O que muda é o Minha Casa deixar de perguntar
*"você é o Anderton?"* e passar a perguntar *"esta conta tem o módulo Minha Casa?"*.

São duas perguntas diferentes, e hoje elas estão coladas.

---

## 3. Módulo × Plano — as duas perguntas separadas

Você escolheu manter os dois eixos independentes. Eles respondem coisas diferentes:

| | **Módulo** (licença) | **Plano** (limite) |
|---|---|---|
| Pergunta | *O QUE esta conta acessa?* | *QUANTO esta conta pode usar?* |
| Valores | Aluguéis · Minha Casa · Vitrine | Gratuito · Básico · Premium |
| Controla | Quais abas aparecem no topo | 1 / 3 / 100 casas e o armazenamento |
| Onde vive hoje | Não existe — precisa ser criado | `assinaturas.plano` |

### Por que separar é a escolha certa

Combinando livremente, você atende casos que um pacote fechado não atende:

| Cliente | Módulos | Plano | Situação real |
|---|---|---|---|
| Dona Neusa | Minha Casa | — | Não tem imóvel. Só quer controlar o dinheiro de casa. |
| Sr. Aparecido | Aluguéis | Básico | 3 casas de família, nada além disso. |
| Imobiliária Aurora | Aluguéis + Vitrine | Premium | Gerencia e divulga. Seu cliente ideal. |
| Corretor autônomo | Vitrine | Gratuito | Não gerencia nada, só divulga imóvel de terceiro. |
| Você | Tudo + Comercial | Premium | Conta Mestre. |

Repare no **corretor autônomo**: ele compra só a Vitrine e nem toca no módulo de aluguéis.
Num modelo de pacotes fechados esse cliente não existiria — você teria que vender o app
inteiro para alguém que quer um terço dele. É um mercado a mais, de graça.

---

## 4. Como fica no banco

Uma tabela nova. Só uma.

```sql
create table public.licencas_modulo (
  user_id     uuid not null references public.proprietarios(user_id) on delete cascade,
  modulo      text not null check (modulo in ('alugueis','minha_casa','vitrine')),
  status      text not null default 'ativa'
              check (status in ('ativa','suspensa','cancelada','avaliacao')),
  expira_em   date,              -- nulo = não expira
  valor_pago  numeric(12,2) not null default 0,
  origem      text not null default 'venda',   -- venda | bonus | cortesia | avaliacao
  ativada_em  timestamptz not null default now(),
  criado_por  uuid references auth.users(id) on delete set null,
  primary key (user_id, modulo)
);
```

E uma função que responde a pergunta central:

```sql
create or replace function public.tem_modulo(p_modulo text, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public
as $$
  select public.e_mestre(p_user_id)          -- você sempre tem tudo
      or exists(
        select 1 from public.licencas_modulo l
        where l.user_id = public.usuario_proprietario_id(p_user_id)
          and l.modulo = p_modulo
          and l.status in ('ativa','avaliacao')
          and (l.expira_em is null or l.expira_em >= current_date)
      )
$$;
```

**Três detalhes que fazem esta função valer o dobro:**

1. `usuario_proprietario_id()` — já existe no seu banco. É o que faz **funcionário herdar a
   licença do patrão** automaticamente. Sem ela, cada funcionário precisaria de licença própria.
2. `e_mestre()` na primeira linha — você nunca perde acesso a nada, aconteça o que acontecer
   com a tabela de licenças.
3. `status = 'avaliacao'` + `expira_em` — te dá **teste grátis de 7 dias** sem escrever
   nenhuma regra nova. É só uma linha com outra origem e uma data.

### A migração das contas que já existem

Ninguém pode perder acesso no dia da virada:

```sql
-- Todo proprietário com assinatura ativa ganha o módulo Aluguéis, sem exceção
insert into public.licencas_modulo(user_id, modulo, origem)
select user_id, 'alugueis', 'migracao'
from public.assinaturas where status = 'ativa'
on conflict do nothing;
```

Minha Casa e Vitrine começam vazios — hoje ninguém além de você tem acesso mesmo.

---

## 5. Como fica no app

### `acesso_comercial_atual()` devolve os módulos junto

Aquela função já monta o pacote de acesso que o front-end lê no login
(`migracao-versao-comercial-v1.sql:355`). Basta acrescentar uma chave:

```sql
'modulos', jsonb_build_object(
  'alugueis',  public.tem_modulo('alugueis'),
  'minhaCasa', public.tem_modulo('minha_casa'),
  'vitrine',   public.tem_modulo('vitrine')
)
```

Uma consulta a mais no login. Nada muda no resto.

### `app.js` — o topo passa a ser montado, não fixo

Hoje `renderTopBar()` (`app.js:258`) tem as abas escritas na mão, cada uma com um `if` de
`state.isPlatformAdmin`. Vira uma lista:

```js
function modulosDisponiveis(){
  const m = (state.commercialAccess && state.commercialAccess.modulos) || {};
  return [
    m.alugueis  && ['alugueis','Aluguéis','irHome()','&#9638;',''],
    m.minhaCasa && ['minhaCasa','Minha Casa','irMinhaCasa()','⌂','home'],
    m.vitrine   && ['vitrine','Vitrine','irVitrine()','&#9788;','vitrine'],
    state.isPlatformAdmin && ['commercial','Comercial','irClientes()','&#9670;','commercial']
  ].filter(Boolean);
}
```

Repare que **Comercial continua preso ao `isPlatformAdmin`** — ele não é módulo, é o seu balcão.

### O destino de entrada muda conforme o que a pessoa comprou

Hoje todo mundo cai no painel de aluguéis. Quem comprou só Minha Casa cairia numa tela vazia
e sem sentido. A regra passa a ser: **entra no primeiro módulo que a pessoa tem.**

```js
function viewInicial(){
  const m = (state.commercialAccess||{}).modulos || {};
  if(m.alugueis)  return 'dashboard';
  if(m.minhaCasa) return 'minhaCasa';
  if(m.vitrine)   return 'vitrine';
  return 'semModulo';   // comprou, mas nada foi liberado ainda
}
```

A tela `semModulo` é pequena e importante: em vez de um app quebrado, a pessoa vê
*"sua conta ainda não tem nenhum módulo liberado"* com um botão de falar com você.

### E o mais importante: o cadeado de verdade fica no banco

Esconder o botão no `app.js` é **enfeite**, não segurança — qualquer pessoa abre o console do
navegador e chama a função. A trava real é em cada função SQL do módulo:

```sql
if not public.tem_modulo('minha_casa') then
  raise exception 'Esta conta nao possui o modulo Minha Casa.';
end if;
```

É exatamente o que `minha_casa_exigir_mestre()` já faz hoje — só muda a pergunta que ela faz.

---

## 6. Como fica a venda (aba Comercial)

A tela de "Nova venda" hoje escolhe um plano. Passa a escolher **plano + módulos**:

```
┌──────────────────────────────────────────────────┐
│  NOVA VENDA                                      │
│                                                  │
│  Cliente   [ Imobiliária Aurora            ]     │
│  E-mail    [ contato@aurora.com.br         ]     │
│                                                  │
│  MÓDULOS (o que ele acessa)                      │
│   ☑ Aluguéis      R$ ___    vence [__/__/____]   │
│   ☐ Minha Casa    R$ ___    vence [__/__/____]   │
│   ☑ Vitrine       R$ ___    vence [__/__/____]   │
│                                                  │
│  PLANO (quanto ele pode usar)                    │
│   ○ Gratuito 1 casa   ○ Básico 3   ● Premium 100 │
│                                                  │
│  Total: R$ 000,00              [ Registrar venda ]│
└──────────────────────────────────────────────────┘
```

E a tabela de clientes ganha uma coluna de módulos, para você bater o olho e ver quem tem o quê —
que é também sua lista de quem ainda **não** comprou o resto.

---

## 7. Minha Casa como low ticket — a jogada

Você chamou o Minha Casa de "tipo um bônus, mas quem quiser comprar separado pode".
Isso é mais forte do que parece, por três motivos:

**1. É a porta de entrada mais barata que existe no seu catálogo.**
Financeiro familiar interessa a **qualquer pessoa**, não só a quem tem imóvel. O público
possível é dez vezes maior que o de gestão de aluguéis.

**2. Como bônus, ele aumenta o valor do pacote sem te custar nada.**
*"Fecha os Aluguéis e o Minha Casa vai junto"* — o cliente sente que ganhou algo concreto,
e você não gastou nada, porque o módulo já está pronto e rodando.

**3. Ele é o seu funil.**
Quem entra pelo Minha Casa já tem login, já confia no app e já viu que funciona.
Quando essa pessoa comprar um imóvel para alugar, você não vai vender para um estranho —
vai vender para alguém que já é seu cliente. É a venda mais barata que existe.

**O cuidado:** low ticket só se paga em volume, e volume traz suporte. Antes de abrir o
Minha Casa para o público, garanta que ele se explica sozinho — porque a R$ 15 por mês,
dois telefonemas de suporte já comeram o lucro do ano daquele cliente.

---

## 8. Ordem de execução

Esta ordem não é arbitrária: cada fase deixa o app funcionando e vendável ao fim dela.

### Fase A — A fundação *(nada muda para ninguém, e é de propósito)*
1. Criar `licencas_modulo` e `tem_modulo()`
2. Migrar todos os proprietários ativos para o módulo Aluguéis
3. `acesso_comercial_atual()` passa a devolver os módulos
4. `app.js` monta o topo a partir da lista, em vez de abas fixas

Ao fim: **tudo funciona exatamente como antes.** Se alguém notar diferença, algo deu errado.
Essa é a fase de maior risco e menor visibilidade — vale testar com calma.

### Fase B — Libertar o Minha Casa
5. `minha_casa_exigir_mestre()` passa a checar `tem_modulo('minha_casa')`
6. `e_mestre()` continua, mas só guardando a aba Comercial
7. Testar com uma conta de teste que **não** seja a sua ← o teste que importa
8. Tela de venda com módulos na aba Comercial

Ao fim: **você já pode vender o Minha Casa.** Primeira receita nova, sem ter construído
nenhuma tela de produto.

### Fase C — A Vitrine
9. Tudo o que está na fase 1 do `ESTUDO-VITRINE.md`
10. Módulo `vitrine` entra na tela de venda

### Fase D — Escala
11. Autoatendimento: o cliente compra o módulo sozinho pelo PIX que o app já gera
12. Teste grátis de 7 dias (`status='avaliacao'`) — a tabela já suporta, é só a tela
13. Aviso automático de licença vencendo

---

## 9. Os riscos, ditos com clareza

| Risco | Tamanho | O que fazer |
|---|---|---|
| **Alguém perder acesso na migração** | 🔴 Alto | A migração da fase A é o ponto crítico. Backup antes, e conferir a contagem de licenças criadas contra a de assinaturas ativas — os números têm que bater. |
| **Trava só no front-end** | 🔴 Alto | Toda função SQL de módulo precisa do `tem_modulo()`. Esconder o botão não protege nada. |
| **Minha Casa vazar entre clientes** | 🔴 Alto | Ele nunca teve mais de uma família de verdade. As políticas de isolamento precisam ser testadas com duas contas reais antes de vender a primeira. |
| **Suporte de low ticket** | 🟡 Médio | Ajuda dentro do app e vídeo curto antes de abrir para o público. |
| **Complicar a venda** | 🟡 Médio | Mesmo com módulos soltos no banco, venda 2 ou 3 combos prontos. A flexibilidade é sua, não do cliente. |
| **Cliente confuso com o que comprou** | 🟢 Baixo | Tela "Meu plano" listando os módulos ativos e a data de vencimento de cada um. |

---

## 10. Resumo

| Arquivo | O que muda |
|---|---|
| `migracao-modulos.sql` (novo) | `licencas_modulo`, `tem_modulo()`, migração das contas |
| `migracao-minha-casa.sql` | `minha_casa_exigir_mestre()` passa a checar licença |
| `migracao-versao-comercial-v1.sql` | `acesso_comercial_atual()` devolve os módulos |
| `app.js` | Topo montado por lista · `viewInicial()` · tela `semModulo` |
| `commercial.js` | Venda com módulos · coluna de módulos na tabela de clientes |
| `auth.js` | Nada — o login continua igual |

**O que não muda:** o login é um só, o app é um só, o cliente instala uma coisa só.
A modularização é uma decisão comercial, e o cliente não precisa perceber que ela existe.

---

## 11. A resposta curta

**Dá para fazer.** A parte difícil não é a Vitrine — é tirar o seu e-mail de dentro do
banco de dados para o Minha Casa poder ser vendido. Essa é a fase A e B, e ela vale a pena
ser feita **antes** da Vitrine, por dois motivos:

1. Ela destrava uma receita que já está pronta e parada
2. Ela constrói o encanamento que a Vitrine vai usar depois

Fazer na ordem inversa significaria construir a Vitrine, e depois voltar e mexer nela de novo
para encaixar no sistema de módulos.

---

*Estudo preparado a partir da leitura do código atual do app (julho/2026).*
