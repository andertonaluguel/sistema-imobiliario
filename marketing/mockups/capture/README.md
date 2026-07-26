# Harness de demonstracao do Aluguel

Criado em **22/07/2026** para gerar capturas comerciais sem acessar dados reais.

## O que este ambiente faz

- Carrega os arquivos de interface e os renderizadores reais do aplicativo.
- Substitui Supabase, cache offline e rotinas de backup por adaptadores locais somente leitura.
- Usa cinco imoveis, tres inquilinos, contratos, pagamentos, energia, despesas e interessados totalmente ficticios.
- Calcula os meses a partir da data do navegador, mantendo alertas e relatorios coerentes ao longo do tempo.
- Exibe permanentemente o selo `DEMONSTRAÇÃO · DADOS FICTÍCIOS`.
- Bloqueia gravacoes na camada `db`, abertura de links externos e confirmacoes destrutivas.
- Nao registra service worker e nao importa qualquer backup do produto.

## Pontos de entrada

Sirva a raiz do aplicativo com um servidor HTTP local e abra:

| Tela | Query |
| --- | --- |
| Painel com alertas expandidos | `marketing/mockups/capture/demo.html?screen=dashboard` |
| Lista de casas | `marketing/mockups/capture/demo.html?screen=houses` |
| Financeiro | `marketing/mockups/capture/demo.html?screen=finance` |
| Detalhe da Casa Jardim | `marketing/mockups/capture/demo.html?screen=detail` |
| Outra aba do detalhe | `marketing/mockups/capture/demo.html?screen=detail&tab=pagamentos` |
| Interessados e combinacoes | `marketing/mockups/capture/demo.html?screen=interests` |
| Portal do inquilino | `marketing/mockups/capture/demo.html?screen=portal` |
| Outra aba do portal | `marketing/mockups/capture/demo.html?screen=portal&tab=pagamentos` |
| Catalogo publico ficticio | `marketing/mockups/capture/demo.html?screen=catalog` |

O atributo `data-capture-ready="true"` e aplicado ao `body` quando a tela solicitada terminou de renderizar. Ele pode ser usado por uma rotina de captura automatizada para aguardar o estado estavel.

## Arquivos

- `demo.html`: shell de captura e ordem dos modulos reais.
- `demo-data.js`: fixture profissional e adaptadores somente leitura.
- `demo-after.js`: roteamento de captura, selo e bloqueios externos.
- `demo.css`: estilos exclusivos do selo demonstrativo.

## Limites intencionais

Este harness serve para apresentacao e captura. A interface pode abrir modais e navegar entre telas, mas toda operacao que tentaria persistir dados e recusada com uma mensagem de modo demonstrativo. Telefones, e-mails, documentos e enderecos exibidos sao exemplos ficticios.
