# Aluguel — criação das novas contas e publicação

Este guia considera uma instalação nova, usando o e-mail `andertonaluguel@gmail.com`.

## Ambiente atual — 25/07/2026

- Aplicativo: <https://aluguel-casas-anderton.netlify.app>
- Site Netlify: `aluguel-casas-anderton`
- Projeto Supabase: `Aluguel Casas` (`tdpoafmvqajxatxtshau`), região São Paulo
- Dados migrados e conferidos: 10 imóveis, 9 inquilinos, 10 contratos e 65 pagamentos
- URL principal e retorno de autenticação configurados no Supabase

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
6. Em seguida, execute `migracao-portal-arquivos.sql` para ativar o portal dos inquilinos e o armazenamento privado.
7. Execute `migracao-contratos-cobrancas.sql` para ativar o histórico de contratos e os vencimentos personalizados.
8. Execute `migracao-versao-comercial-v1.sql` para aplicar, em uma única atualização, os planos, limites, vendas, equipe, anúncios públicos, PIX, segurança comercial, temas, termos, auditoria e backup completo.
9. Execute `migracao-tipos-acesso.sql` para separar Mestre, Administrador e Inquilino e corrigir contas de inquilino que tenham recebido o plano Gratuito por engano.
10. Execute `migracao-minha-casa.sql` para criar a gestão financeira familiar exclusiva das contas Mestre.
11. Execute `migracao-exclusao-contratos.sql` para ativar o encerramento com histórico e a exclusão segura de cadastros errados.
12. Execute `migracao-separacao-inquilinos-clientes.sql` para impedir que a mesma conta seja classificada em mais de um papel e garantir que inquilinos nunca recebam planos de casas.
13. Execute `migracao-modulos.sql` para criar as licenças de módulo. Nada muda para ninguém nesta etapa: ela só prepara o terreno.
14. Execute `migracao-minha-casa-multifamilia.sql` para o Minha Casa deixar de ser exclusivo das contas Mestre e virar um módulo vendável, com uma família por conta.
15. Execute `migracao-vitrine.sql` para criar o catálogo público de imóveis de terceiros.

As três últimas são reexecutáveis e imprimem uma conferência no final. **O passo a passo detalhado, com o que esperar em cada uma, está em `PASSO-A-PASSO-MODULOS-E-VITRINE.md`.**

O `schema.sql` contém a base e a restauração transacional. As migrações acrescentam o acesso separado dos inquilinos, os arquivos privados e o histórico completo dos contratos.

Na versão comercial, as contas Mestre `andertonaluguel@gmail.com` e `andertonunito@gmail.com` recebem os menus **Comercial** e **Minha Casa**. As duas operam a mesma base de aluguéis; a segunda funciona como acesso de segurança. Clientes são os proprietários de casas de aluguel que usam a plataforma e podem ter um plano. Inquilinos são as pessoas que moram nas casas cadastradas: não recebem plano e entram somente no portal vinculado pelo administrador. Pelo Comercial, você registra uma venda dos planos Básico (3 casas) ou Premium (100 casas), confirma o pagamento e libera o e-mail do cliente proprietário. Os limites são conferidos na interface e diretamente no banco.

Nesta primeira etapa, a confirmação de pagamento é manual no menu **Comercial**. O PIX Copia e Cola e o botão de cobrança por WhatsApp não exigem assinatura, mas não consultam o banco nem enviam mensagens sem a confirmação da pessoa. A automação integral só deve ser ligada depois da escolha de provedores, sem colocar chaves secretas no navegador.

O dono da conta pode cadastrar até 10 funcionários no menu **Funcionários**. Cada pessoa cria o próprio login com o e-mail convidado e trabalha nos mesmos dados do dono. Em **Configurações**, o dono também define um endereço público; cada casa vaga precisa ser marcada individualmente para aparecer no catálogo.

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
2. Escolha **Administrador** e clique em **Criar conta**.
3. Use o e-mail desejado para entrar no aplicativo e confirme a mensagem recebida.
4. Entre no sistema.

## 7. Restaurar os dados

1. No menu **⋯**, escolha **Importar backup**.
2. Selecione `../backups/aluguel-backup-2026-07-20.json`.
3. Confira a quantidade informada: 10 casas e 9 inquilinos.
4. Confirme a importação.

A importação agora é transacional: se alguma etapa falhar, nenhuma parte é gravada. O backup original contém casas, inquilinos, pagamentos e reajustes. Ele não contém fotos, despesas, lembretes nem registros de energia.

## Backups e funcionamento sem internet

- O app cria um retrato diário quando é aberto com internet e mantém os 30 mais recentes no Supabase.
- Esses retratos não substituem o backup JSON baixado, pois ficam no mesmo projeto Supabase e não incluem fotos nem documentos.
- O backup JSON baixado inclui fotos e documentos; o app lembra o proprietário quando a última cópia externa tem mais de 30 dias.
- A interface e a última carga de casas, inquilinos e movimentações podem ser consultadas sem internet no mesmo aparelho.
- Alterações continuam exigindo conexão. Ainda não existe fila de gravações nem resolução de conflitos para sincronizar mudanças feitas completamente offline.

## Publicações futuras

1. Faça as alterações no projeto.
2. Execute os testes.
3. Execute `node build.mjs`.
4. Publique novamente somente `dist/`.
5. Verifique login, painel, importação e cabeçalhos de segurança.

## Checklist da versão Aluguéis 1.3

Antes de liberar clientes reais, valide em contas separadas:

1. Cadastro gratuito e bloqueio ao tentar criar a segunda casa.
2. Venda Básica, confirmação do pagamento, convite e bloqueio ao tentar criar a quarta casa.
3. Venda Premium e indicação do limite de 100 casas.
4. Suspensão de um cliente e bloqueio das leituras/escritas no banco.
5. Convite de inquilino sem conflito com um e-mail de proprietário.
6. Aceite dos termos, recuperação de senha, reenvio de confirmação e troca de e-mail.
7. Envio e exclusão de foto/documento, exportação completa e restauração do backup.
8. Duas contas Mestre na mesma base, com acesso ao Comercial e Minha Casa; demais administradores sem essas abas.
9. Convite, bloqueio e reativação de funcionário sem criar uma segunda base de casas.
10. Catálogo público exibindo apenas casas vagas e publicadas, sem dados de inquilinos.
11. PIX Copia e Cola válido e cobrança por WhatsApp com o código anexado.
12. Abertura da última cópia em modo de consulta depois de desconectar a internet.
13. Conta de inquilino exibindo somente o portal, sem plano e sem acesso às áreas de proprietário.
14. Tela Comercial listando somente clientes proprietários, separada da tela Inquilinos.
