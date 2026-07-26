# Landing page comercial — Aluguel

Criada em **2026-07-22** com HTML, CSS e JavaScript estáticos. A comunicação foi baseada nas funcionalidades existentes no aplicativo e não contém preços, testemunhos, indicadores de resultado ou automações não comprovadas.

## Arquivos

- `index.html`: conteúdo, SEO, dados estruturados e estrutura acessível.
- `styles.css`: identidade visual, componentes e comportamento responsivo.
- `config.js`: URL do aplicativo, e-mail e WhatsApp comercial.
- `script.js`: navegação móvel, fallbacks de imagem, contato e eventos `dataLayer`.

## Configuração comercial

Edite apenas `config.js` para atualizar os destinos:

```js
window.ALUGUEL_LANDING_CONFIG = Object.freeze({
  appName: 'Aluguel',
  appUrl: 'https://aluguel-casas-anderton.netlify.app',
  supportEmail: 'andertonaluguel@gmail.com',
  whatsappNumber: '',
  screenshotBasePath: '../mockups/screenshots/',
  createdAt: '2026-07-22'
});
```

O WhatsApp deve conter apenas números, incluindo país e DDD, por exemplo `5511999999999`. Enquanto o campo estiver vazio, a página usa `andertonaluguel@gmail.com`. O formulário não possui backend: ele prepara a mensagem e abre o WhatsApp ou o aplicativo de e-mail para revisão e envio pelo visitante.

## Capturas reais esperadas

Salve as imagens finais em `marketing/mockups/screenshots/` com estes nomes:

- `dashboard-desktop.png`
- `financeiro-desktop.png`
- `detalhe-imovel-mobile.png`
- `portal-inquilino-mobile.png`

Se algum arquivo estiver ausente, a página exibe um fallback editorial identificado, sem tela fictícia ou imagem quebrada.

## Planos exibidos

Somente os limites existentes no produto são publicados:

| Plano | Imóveis | Armazenamento |
|---|---:|---:|
| Grátis | 1 | 50 MB |
| Básico | 3 | 1 GB |
| Premium | 100 | 10 GB |

Valores, periodicidade, teste, cancelamento e condições comerciais devem ser definidos antes de acrescentá-los à página. O Premium não deve ser chamado de ilimitado.

## Eventos disponíveis

Os eventos são adicionados a `window.dataLayer`; nenhuma ferramenta de analytics é carregada pela landing page:

- `cta_click`
- `navigation_menu_toggle`
- `section_view`
- `contact_form_start`
- `contact_form_prepare`
- `faq_open`

Os eventos do formulário não incluem nome, e-mail, telefone ou texto livre.

## Verificação antes de publicar

1. Inserir e revisar as quatro capturas reais.
2. Confirmar a URL oficial e o e-mail de atendimento.
3. Configurar o WhatsApp comercial quando o número for aprovado.
4. Testar formulário, menu, links, teclado e larguras de 320 px, 768 px e desktop.
5. Revisar a política de segurança do deploy para permitir as fontes do Google e qualquer origem real usada pelas imagens.
6. Validar conteúdo e condições comerciais vigentes.

## Limites assumidos pela comunicação

- Cobranças, PIX e baixas são manuais.
- O matching de interessados usa regras objetivas, não IA.
- O portal do inquilino é de consulta.
- O aplicativo não substitui contabilidade, assessoria jurídica, assinatura eletrônica, gateway de pagamento ou integração com concessionárias.
- A consulta offline não representa operação integral sem internet.
