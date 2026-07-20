# Aluguel — criação das novas contas e publicação

Este guia considera uma instalação nova, usando o e-mail `andertonaluguel@gmail.com`.

## Antes de começar

- O backup com os dados reais fica em `../backups/`, fora da pasta do site.
- Nunca coloque arquivos `*-backup-*.json` dentro de `dist/` nem faça upload deles no Netlify.
- O projeto gera uma pasta `dist/` contendo somente os arquivos públicos permitidos.

## 1. Criar o novo projeto Supabase

1. Acesse <https://supabase.com> e crie a conta com `andertonaluguel@gmail.com`.
2. Confirme o e-mail e crie um projeto chamado, por exemplo, `aluguel`.
3. Guarde a senha do banco em um gerenciador de senhas.
4. No **SQL Editor**, abra uma consulta nova.
5. Copie todo o arquivo `schema.sql`, cole no editor e execute uma única vez.

O `schema.sql` atual já contém todas as tabelas, regras de segurança, validações e a restauração transacional. Em uma conta nova não é necessário executar os arquivos antigos de migração.

## 2. Configurar a chave pública

1. No Supabase, abra **Project Settings → API**.
2. Copie a **Project URL** e a chave **Publishable key** (`sb_publishable_...`).
3. Preencha em `config.js`:

```js
SUPABASE_URL: 'https://SEU-PROJETO.supabase.co',
SUPABASE_ANON_KEY: 'sb_publishable_SUA-CHAVE',
```

A chave publicável pode estar no aplicativo. A segurança dos dados é feita pelo login e pelas políticas RLS. Nunca coloque uma chave `secret` ou `service_role` no projeto.

## 3. Preparar a publicação

Na pasta do projeto, execute:

```text
node build.mjs
```

Isso recria `dist/`, atualiza automaticamente a versão do cache e copia somente os arquivos públicos. Confirme que `dist/` não contém backups, SQL ou documentação.

## 4. Criar e publicar no Netlify

1. Acesse <https://app.netlify.com> e crie a conta com `andertonaluguel@gmail.com`.
2. Confirme o e-mail.
3. Para a primeira publicação manual, envie somente a pasta `dist/`.
4. Guarde o endereço `https://...netlify.app` fornecido pelo Netlify.

Os arquivos `_headers` e `_redirects` dentro de `dist/` aplicam a proteção do site, desativam cache da configuração e fazem as rotas abrirem o aplicativo corretamente.

## 5. Configurar os endereços de autenticação

Depois de obter o endereço do Netlify:

1. No Supabase, abra **Authentication → URL Configuration**.
2. Defina **Site URL** como o endereço final do Netlify.
3. Adicione o mesmo endereço em **Redirect URLs**, incluindo a versão com `/**` quando o painel permitir.

Isso é necessário para recuperação de senha e confirmação de e-mail voltarem ao aplicativo correto.

## 6. Criar a conta do proprietário no aplicativo

1. Abra o endereço do Netlify.
2. Clique em **Criar conta**.
3. Use o e-mail desejado para entrar no aplicativo e confirme a mensagem recebida.
4. Entre no sistema.

## 7. Restaurar os dados

1. No menu **⋯**, escolha **Importar backup**.
2. Selecione `../backups/aluguel-backup-2026-07-20.json`.
3. Confira a quantidade informada: 10 casas e 9 inquilinos.
4. Confirme a importação.

A importação agora é transacional: se alguma etapa falhar, nenhuma parte é gravada. O backup disponível contém casas, inquilinos, 63 pagamentos e reajustes. Ele não contém fotos, despesas, lembretes nem registros de energia.

## Backups e funcionamento sem internet

- O app cria um retrato diário quando é aberto com internet e mantém os sete mais recentes no Supabase.
- Esses retratos não substituem o backup JSON baixado, pois ficam no mesmo projeto Supabase e não incluem fotos.
- A interface básica pode abrir pelo cache, mas consultar e alterar os dados exige conexão. Ainda não existe sincronização offline de alterações.

## Publicações futuras

1. Faça as alterações no projeto.
2. Execute os testes.
3. Execute `node build.mjs`.
4. Publique novamente somente `dist/`.
5. Verifique login, painel, importação e cabeçalhos de segurança.
