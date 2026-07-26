# Arquivos de identidade comercial — Aluguel

**Criado em:** 22 de julho de 2026  
**Versão:** 1.0.0  
**Natureza:** arquivos finais e editáveis  
**Fonte visual:** símbolo de `app.js:66-72`, paleta e tipografia de `style.css:1-27`

Esta pasta consolida a identidade já existente no aplicativo. Nenhum novo nome, símbolo ou estilo visual foi criado para substituir a marca real.

## Arquivos

| Arquivo | Uso | Editável |
|---|---|---|
| `aluguel-simbolo.svg` | Avatar, favicon vetorial, selo, marca reduzida e elementos de navegação | Sim — formas vetoriais e variáveis CSS |
| `aluguel-lockup-horizontal-fundo-claro.svg` | Logo principal sobre papel, branco ou fotografia muito clara | Sim — formas e texto |
| `aluguel-lockup-horizontal-fundo-escuro.svg` | Logo principal sobre verde-escuro ou fotografia escurecida | Sim — formas e texto |
| `brand-tokens.css` | Tokens para landing page, páginas comerciais e protótipos HTML | Sim |
| `brand-tokens.json` | Fonte estruturada para Figma Tokens, Style Dictionary ou automação | Sim |
| `manual-resumido.md` | Regras de uso visual e verbal | Sim |
| `manual-identidade-comercial-aluguel.pdf` | Mini manual diagramado, pronto para consulta e envio | Não |
| `manual-identidade-comercial-aluguel.docx` | Mini manual em formato Word | Sim |
| `logo-simbolo-dourado.png` e `logo-simbolo-verde.png` | Exportações raster para materiais digitais | Não |

Os SVGs têm fundo transparente. “Fundo claro” e “fundo escuro” indicam a superfície para a qual as cores foram preparadas.

## Uso rápido em HTML

```html
<!-- Fundo claro -->
<img
  src="/marketing/branding/aluguel-lockup-horizontal-fundo-claro.svg"
  width="184"
  height="45"
  alt="Aluguel"
>
```

Para usar o símbolo inline e alterar as cores sem modificar a geometria:

```html
<span style="--aluguel-symbol:#E2BE78;--aluguel-cutout:#14322A;color:#E2BE78">
  <!-- cole aqui o conteúdo de aluguel-simbolo.svg -->
</span>
```

## Uso dos tokens CSS

```html
<link rel="stylesheet" href="/marketing/branding/brand-tokens.css">
```

```css
.hero {
  background: var(--brand-color-cover);
  color: var(--brand-color-paper);
  font-family: var(--brand-font-body);
}

.hero h1 {
  color: var(--brand-color-accent-on-cover);
  font-family: var(--brand-font-display);
}
```

Para protótipos compatíveis com as variáveis atuais do aplicativo, aplique a classe `brand-theme` em um contêiner. Ela cria aliases como `--cover`, `--paper`, `--ink` e `--brass` sem alterar o `style.css` do produto.

## Fontes

A marca usa as mesmas famílias carregadas no aplicativo:

- **Space Grotesk 500/600/700:** marca, títulos e headlines.
- **IBM Plex Sans 400/500/600:** textos, botões e formulários.
- **IBM Plex Mono 400/500/600:** valores, datas, status e pequenos rótulos.

Snippet já utilizado pelo projeto:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

Em material que precise funcionar sem download de fonte, incorporar/licenciar as fontes ou converter somente a palavra “Aluguel” em contornos na cópia de exportação. Manter o SVG-fonte com texto editável.

## Exportação

### SVG para PNG

1. Abrir o SVG no Figma, Illustrator, Affinity Designer ou Inkscape.
2. Manter a proporção e a área transparente.
3. Exportar em sRGB.
4. Para uso digital, gerar 1x, 2x e 3x.
5. Não aplicar nitidez, sombra, contorno ou gradiente ao símbolo.

Tamanhos sugeridos:

- Avatar/foto de perfil: 512 × 512 px, usando o símbolo centralizado sobre `#14322A` e o símbolo em `#E2BE78`.
- Marca horizontal para web: 184 × 45 px ou maior.
- Cabeçalho de PDF/apresentação: largura entre 28 e 40 mm.

### Canva

1. Fazer upload do SVG correspondente ao fundo.
2. Não recolorir partes isoladas nem alterar a proporção.
3. Usar Space Grotesk e IBM Plex Sans, disponíveis no Canva; confirmar IBM Plex Mono antes de diagramar valores.
4. Exportar PDF em sRGB para WhatsApp/e-mail; PDF para impressão apenas quando houver necessidade real.

## Controle de versão

- Arquivos desta pasta constituem a fonte editável da versão 1.0.
- Alterações na geometria do símbolo exigem revisão da marca no aplicativo.
- Alterações de cor ou tipografia devem ser feitas primeiro em `brand-tokens.json`, replicadas em `brand-tokens.css` e registradas no manual.
- Não substituir silenciosamente os arquivos; criar nova versão e atualizar data/versão no cabeçalho.

## Verificação antes de publicar

- Logo correto para o fundo.
- Área de proteção preservada.
- Contraste de texto adequado.
- Nenhum claim proibido do diagnóstico comercial.
- Screenshot real, sem funcionalidade inventada.
- CTA com destino preenchido e testado.
- Data e versão do material registradas.
