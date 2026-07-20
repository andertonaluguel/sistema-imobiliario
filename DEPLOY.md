# Aluguel — Guia de publicação (núcleo completo)

Este bloco é a **fundação**: banco, login e painel já funcionando, com importação do seu backup atual. Siga na ordem.

---

## 1. Criar o projeto no Supabase

1. Acesse **https://supabase.com** → entre/crie conta → **New project**.
2. Dê um nome (ex.: `talao`), defina uma senha de banco (guarde) e crie.
3. Espere ~1 minuto até o projeto subir.

## 2. Criar as tabelas

1. No projeto, abra **SQL Editor** (menu lateral) → **New query**.
2. Abra o arquivo **`schema.sql`** deste projeto, copie **todo** o conteúdo e cole no editor.
3. Clique **Run**. Deve aparecer "Success".
   - Isso cria todas as tabelas e ativa a segurança por usuário (RLS).

## 3. Pegar as chaves de acesso

1. Vá em **Project Settings** (engrenagem) → **API**.
2. Copie:
   - **Project URL** (algo como `https://xxxx.supabase.co`)
   - **anon public** key (uma chave longa)

## 4. Preencher o `config.js`

Abra **`config.js`** e substitua os dois valores:

```js
SUPABASE_URL: 'https://xxxx.supabase.co',
SUPABASE_ANON_KEY: 'sua-chave-anon-public',
```

> A chave `anon` é pública por natureza — pode ficar no front-end. Quem protege os dados é o RLS (passo 2).

## 5. (Recomendado p/ começar rápido) E-mail de confirmação

Por padrão o Supabase pede confirmação de e-mail no cadastro.
Para testar sem isso:

- **Authentication** → **Providers** → **Email** → desligue **"Confirm email"** → **Save**.

Depois, em produção, você pode religar.

## 6. Publicar no Netlify

**Opção A — arrastar a pasta (mais simples):**
1. Acesse **https://app.netlify.com** → **Add new site** → **Deploy manually**.
2. Arraste a pasta inteira do projeto (já com o `config.js` preenchido).
3. Pronto: o Netlify te dá um endereço `https://....netlify.app`.

**Opção B — via Git:** suba a pasta para um repositório e conecte no Netlify. O `netlify.toml` já está configurado (sem build, redirect de SPA).

## 7. Primeiro acesso e migração dos seus dados

1. Abra o endereço do Netlify → tela de login.
2. **Criar conta** com seu e-mail e senha.
3. Entre. O painel aparece vazio.
4. No app antigo, exporte seu backup (JSON).
5. No novo, toque no menu **⋯** → **Importar backup** → selecione o arquivo.
6. Suas casas, inquilinos, pagamentos, despesas e fotos são carregados.

> Importar **adiciona** dados. Se importar duas vezes, duplica. Para recomeçar limpo, use **⋯ → Apagar todos os dados** antes.

---

## O que já funciona
- Login, cadastro e recuperação de senha (cada conta só vê os próprios dados).
- Importação/exportação de backup (migração sem perder nada).
- Painel: receita do mês, recebido, falta receber, casas alugadas/vagas/em manutenção, contratos vencendo, gráfico dos últimos 12 meses, alertas e últimas movimentações.
- **Casas**: grade com status e tela completa do imóvel, com abas **Geral, Inquilino, Pagamentos, Despesas e Fotos**. Dá para editar a casa, registrar vistoria, marcar/desfazer pagamento por mês, lançar despesas/chamados e cobrar pelo WhatsApp.
- **Inquilinos**: cadastro central reutilizável; vincular/desvincular de casas (ao trocar de casa, a anterior fica vaga automaticamente).
- **Financeiro**: projeção mensal e anual, gráfico de 12 meses e relatório anual por casa (recebido, despesas por categoria, dias vago/manutenção e períodos de contrato).
- **Fotos** das casas (comprimidas no aparelho, salvas no banco) e **recibo de aluguel em PDF**.
- **Calendário** mensal: mostra os vencimentos de cada casa por dia, com cor por status (pago/atrasado/pendente), e permite lembretes manuais por dia.
- **App instalável (PWA)**: dá para instalar no celular ou no computador e abrir como um aplicativo; o app abre mesmo sem internet (os dados sincronizam quando a conexão volta).
- **Histórico de valor do aluguel** (aba "Reajustes" na casa): guarda os valores e desde quando valeram, com adicionar, editar e excluir. Quando você muda o aluguel em "Editar dados", o reajuste é registrado sozinho.
- **Backup automático diário** no Supabase, com restauração: o app salva um retrato dos seus dados uma vez por dia; em ⋯ → "Backups automáticos" você vê os últimos 7 e pode restaurar. (O backup automático guarda os dados, não as fotos — para um arquivo completo com fotos use "Exportar backup".)

## Atualização do Bloco B — rodar o SQL uma vez
Diferente das atualizações anteriores, esta precisa de duas tabelas novas no banco:
1. No Supabase, abra **SQL Editor → New query**.
2. Cole todo o conteúdo de **`migracao-bloco-B.sql`** e clique **Run** (pode rodar de novo sem problema; é idempotente).
3. Depois, substitua os arquivos no Netlify (mantendo o `config.js` preenchido) e recarregue com Ctrl+F5.

## Instalar no celular / computador
Depois de publicar, abra o endereço do app no navegador:
- **Android (Chrome):** menu (⋮) → "Adicionar à tela inicial" / "Instalar app".
- **iPhone (Safari):** botão Compartilhar → "Adicionar à Tela de Início".
- **Computador (Chrome/Edge):** ícone de instalar na barra de endereço.

O ícone do Aluguel aparece junto dos outros apps e abre em tela cheia.
