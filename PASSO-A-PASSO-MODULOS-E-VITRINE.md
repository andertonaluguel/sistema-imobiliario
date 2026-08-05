# Passo a passo — módulos vendáveis e Vitrine

Guia de execução. Siga na ordem: cada fase deixa o app funcionando ao terminar.

> **Antes de qualquer coisa:** abra o app, menu **⋯ → Exportar backup (JSON)** e guarde o arquivo.
> Nenhuma migração daqui apaga dados, mas backup antes de mexer no banco é regra.

---

## O que foi entregue

**Banco (você roda no SQL Editor do Supabase):**

| Arquivo | Fase | O que faz |
|---|---|---|
| `migracao-modulos.sql` | A | Cria a licença de módulo. Nada muda para ninguém. |
| `migracao-minha-casa-multifamilia.sql` | B | Liberta o Minha Casa do seu e-mail. |
| `migracao-vitrine.sql` | C | Cria as tabelas da Vitrine. |

**Aplicativo (já está no código):**

`vitrine.js` · `vitrine.css` · alterações em `app.js`, `config.js`, `commercial.js`,
`supabase.js`, `index.html`, `build.mjs`, `_headers`, `service-worker.js` e os testes.

Os três arquivos SQL são **reexecutáveis**: rodar duas vezes dá o mesmo resultado.

---

## FASE A — a fundação

**Rode:** `migracao-modulos.sql`

**O que esperar no final:** duas mensagens, e os números têm que bater.

```
NOTICE: Assinaturas ativas: 1  |  Licencas de Alugueis: 1
NOTICE: Fase A concluida. O aplicativo continua funcionando como antes.
```

Se aparecer `MIGRACAO INCOMPLETA`, **pare**. Nada foi perdido, mas alguma conta
ficaria sem o módulo Aluguéis. Me chame antes de seguir.

**Confira depois:** entre no app. Tudo tem que estar **exatamente igual** — mesmas abas,
mesmos dados. Se você notar qualquer diferença nesta fase, algo deu errado.

---

## FASE B — libertar o Minha Casa

**Rode:** `migracao-minha-casa-multifamilia.sql`

**O que esperar:**

```
NOTICE: Familias com dono: 1  |  Lancamentos preservados: N  |  Membros: 4
NOTICE: Fase B concluida. O modulo Minha Casa ja pode ser vendido.
```

O número de lançamentos tem que ser o mesmo de antes. É a sua conferência de que
nada do seu financeiro familiar se perdeu.

Se aparecer `PARE: X familia(s) sem dono`, a migração se recusou a continuar de
propósito — ela detectou que seus dados ficariam inacessíveis. Me chame.

### ⚠️ O teste que realmente importa

Depois desta fase, **entre com uma conta que não seja a sua** e confirme que ela
**não vê nada** de Minha Casa. Esse é o teste que separa "funciona" de "é seguro".

Como fazer: crie uma conta de teste, dê a ela o módulo Minha Casa pela aba Comercial,
entre com ela e confirme que a tela está vazia — sem os seus lançamentos, sem os seus
membros, com categorias novas.

---

## FASE C — a Vitrine

**Rode:** `migracao-vitrine.sql`

**O que esperar:**

```
NOTICE: Imoveis do modulo Alugueis (intocados): N
NOTICE: Fase C concluida. Tabelas da Vitrine criadas, separadas do Financeiro.
```

O `N` é a sua contagem de casas de sempre — a prova de que a Vitrine não encostou nelas.

### O mapa

Já funciona, sem nenhum passo extra. O Leaflet vem do **cdnjs**, o mesmo CDN que o app
já usa para o jsPDF — então nenhum domínio novo foi aberto na política de segurança.
Basta preencher latitude e longitude no cadastro do anúncio.

---

## Publicar o app

```bash
node tests/run-tests.mjs     # tem que passar
node build.mjs               # gera dist/
```

Depois publique no Netlify como você já faz.

---

## Colocando o primeiro imóvel na Vitrine

1. **Endereço público** — menu ⋯ → Configurações do app → *Anúncios públicos* →
   preencha o endereço público e o WhatsApp. É o que forma o link da sua vitrine.
2. **Proprietários → + Novo proprietário** — o dono do imóvel. Sem login, é cadastro
   seu, e é o **mesmo** dos imóveis administrados: quem você cadastra aqui aparece na
   gestão, e vice-versa. A aba *Proprietários* da Vitrine mostra a mesma lista com os
   anúncios e as taxas de cada um.
   *(Até 31/07/2026 este cadastro se chamava "Anunciante" e era separado. Os dois foram
   unificados; anunciantes antigos sem proprietário aparecem num aviso na aba.)*
3. **Aba Vitrine → + Novo anúncio** — imóvel, valores, endereço e descrição.
   - A coordenada põe o pino no mapa. Pegue no Google Maps: clique com o botão direito
     sobre o imóvel e copie os dois números.
   - A caixa *"Mostrar o endereço completo ao público"* vem marcada (sua decisão 3).
     Desmarque só naquele anúncio se algum dono não quiser.
4. **Publicar** — escolha o valor da taxa e até quando fica no ar. A sugestão vem da
   faixa de preço automaticamente:

   | Aluguel do imóvel | Taxa sugerida / 60 dias |
   |---|---|
   | até R$ 1.000 | R$ 100 |
   | R$ 1.000 a 2.000 | R$ 150 |
   | acima de R$ 2.000 | R$ 200 |

   Para mudar essa tabela: `config.js` → `VITRINE_TAXAS`.
5. **Fotos** — ao salvar, o anúncio reabre com a galeria. Até 10 fotos, comprimidas no
   navegador antes de subir. **A primeira foto é a capa** — é ela que aparece no card;
   use o ★ para promover outra. Anúncio sem foto quase não recebe contato.
6. **Divulgar** — aba Divulgação: copie o link, ou o texto pronto de cada imóvel para
   colar no WhatsApp.

Quando a taxa vence, **o anúncio sai do ar sozinho**. Renovar não exige recadastrar nada.

---

## Vendendo um módulo para um cliente

Aba **Comercial → Gerenciar** no cliente → marque os módulos → Salvar.

A tabela de clientes mostra as siglas **A** (Aluguéis), **MC** (Minha Casa) e
**V** (Vitrine): dourado é liberado, cinza é não contratado. A coluna cinza é a
sua lista de quem ainda não comprou o resto.

O plano (Gratuito/Básico/Premium) continua controlando **quantas casas**, separado
dos módulos. Dá para ter Vitrine no plano Básico.

---

## Se algo der errado

**O app abriu sem nenhuma aba.**
Não deve acontecer: se o banco não devolver os módulos, o app volta sozinho ao
comportamento antigo e libera tudo. Se mesmo assim acontecer, rode a fase A de novo —
ela é reexecutável e reconcede as licenças.

**Você não é mais Mestre.**
Impossível pelo desenho: `tem_modulo()` libera a conta Mestre na primeira linha,
antes de consultar qualquer tabela. Seu acesso não depende da tabela de licenças.

**O Minha Casa sumiu depois da fase B.**
Sinal de que a família ficou sem dono. Confira:

```sql
select codigo, proprietario_id from public.minha_casa_familias;
```

Se `proprietario_id` estiver nulo, rode a fase B de novo.

**A Vitrine pública diz "não encontrada".**
Falta o endereço público em Configurações do app, ou a conta não tem o módulo Vitrine.

---

## O que ainda falta (fase 3 do estudo)

- **Prévia rica no WhatsApp** — a Edge Function do Netlify com as meta tags, para o
  link chegar no grupo com a foto da casa e o preço.
- **Pontos de interesse automáticos** — o campo `pontos_interesse` já é lido e exibido;
  falta preenchê-lo no cadastro.
- **QR Code e card de Story** — a pasta `marketing/` já tem material de QR para reaproveitar.

Nenhum deles bloqueia a venda: com o que está pronto você já cadastra, publica, divulga e cobra.

---

*Preparado em julho/2026, a partir do código atual do app.*
