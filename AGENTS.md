# Aluguel — guia para agentes de IA

Sistema de gestão de locações. Aplicativo web **sem framework e sem dependências npm**:
JavaScript puro com ES modules, Supabase como backend, publicado no Netlify.

## Comandos

```bash
npm test        # node tests/run-tests.mjs  — suíte completa + lint do design system
npm run build   # node build.mjs            — gera dist/
npm run publicar # npm test && npm run build — use este antes de publicar
```

Node >= 18. Não há `npm install`: o projeto não tem dependências.

## Regras que quebram a publicação em silêncio

**1. `build.mjs` tem uma lista fechada.** O array `publicFiles` em [build.mjs](build.mjs)
enumera todos os arquivos que vão para o Netlify. Um `.js` ou `.css` novo que não for
adicionado a essa lista **não é publicado, e nenhum erro aparece** — o app quebra em
produção com um 404 de módulo. Ao criar um arquivo que o app carrega, adicione-o ali.

**2. Backups, SQL e documentação nunca são publicados.** Por design. Não tente
"consertar" isso adicionando-os ao `publicFiles`.

**3. O `service-worker.js` recebe a versão do cache no build.** O `build.mjs` substitui
`const CACHE = '...'` por um hash do conteúdo. Não fixe esse valor manualmente.

## Design system

- **`tokens.css` é a fonte da verdade** para cores, raios e espaçamentos.
- `tests/lint-design-system.mjs` roda dentro do `npm test` e usa **tetos que só podem
  cair**: hoje 278 cores cruas e 27 textos abaixo de 12px. Esses números são limites
  máximos — código novo deve usar tokens, e os contadores só descem, nunca sobem.
  Se o teste falhar dizendo que um teto subiu, a correção é usar o token, não elevar o teto.
- Consulte [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) antes de mexer em CSS.

## Banco de dados

Supabase. As migrações são os arquivos `migracao-*.sql` na raiz, aplicadas **manualmente
pelo painel do Supabase** — não há ferramenta de migração automática. Ao criar uma
migração nova, registre-a em [PASSO-A-PASSO-PUBLICACAO-ETAPA-ATUAL.md](PASSO-A-PASSO-PUBLICACAO-ETAPA-ATUAL.md).

`config.js` contém `SUPABASE_ANON_KEY` (chave publicável). **Isso é intencional e seguro** —
a proteção dos dados vem do login e das políticas RLS. Nunca coloque uma chave `secret`
ou `service_role` no projeto.

## Mapa dos módulos

| Arquivo | Responsabilidade |
|---|---|
| `app.js` | Ponto de entrada, roteamento de abas |
| `supabase.js` | Toda a camada de acesso a dados |
| `auth.js` | Login e sessão |
| `houses.js` / `tenants.js` / `owners.js` | Imóveis, inquilinos, proprietários |
| `contracts.js` / `finance.js` | Contratos e cobranças |
| `maintenance.js` / `pending.js` | Manutenções e pendências |
| `vitrine.js` | Anúncios públicos de imóveis |
| `minha-casa.js` | Módulo Minha Casa (obra/orçamento) |
| `energy.js` / `commercial.js` / `portal.js` | Energia, comercial, portal do inquilino |
| `utils.js` | Helpers compartilhados |

Arquivos grandes (`supabase.js`, `houses.js`, `vitrine.js`, `app.js` passam de 100 KB) —
leia a seção relevante antes de editar, não o arquivo inteiro.

## Git

O repositório fica em `aluguel/aluguel`, **não na raiz** `C:\APP - CASAS DE ALUGUEL - GPT`.
A raiz é um repositório vazio separado — rodar git lá opera no lugar errado.
Remote: `github.com/andertonaluguel/sistema-imobiliario` (privado).

## Convenções

- Português nos nomes de variáveis de domínio, mensagens e commits.
- Sem acentos em mensagens de commit (o terminal do Windows quebra).
- Escreva código que se pareça com o código ao redor: mesma densidade de comentários,
  mesma nomenclatura, mesmos idiomas do arquivo.
- Rode `npm test` antes de considerar uma mudança pronta.
