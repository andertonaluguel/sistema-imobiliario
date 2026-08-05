# Pack comercial Aluguel — versão 2

**Criado em:** 26 de julho de 2026
**Base:** aplicativo em produção, versão `Aluguéis 1.3`

> Esta pasta é **paralela** ao pack original. Nenhum arquivo de `marketing/` foi alterado, movido ou apagado. Compare lado a lado e só substitua o que aprovar.

---

## Por que existe uma versão 2

O aplicativo foi redesenhado. A interface saiu do padrão "livro-caixa" (papel `#F7F6F2` + latão `#B8863C`) para um painel escuro com herói em gradiente e acento lima `#E7F77B`, e ganhou um seletor de produtos na topbar: **Aluguéis**, **Minha Casa** e **Comercial**.

Todo o material da versão 1 mostra a interface antiga. O manual de identidade exige "usar telas reais do aplicativo" — na prática, o pack estava violando a própria regra.

---

## O que já está pronto aqui

| Pasta | Arquivo | O que é |
|---|---|---|
| `estrategia/` | `diagnostico-comercial-v2.md` | **Fonte de verdade.** ICP das três trilhas, plano Corretora, arquitetura multi-produto, claims atualizados, roadmap e checklist de consistência |
| `branding/` | `brand-tokens-v2.json` | Paleta nova com contrastes medidos, componentes e regras de acessibilidade |
| `branding/` | `brand-tokens-v2.css` | Variáveis e blocos prontos para aplicar nos materiais |
| `mockups/screenshots/` | 7 PNG | Capturas reais do app, feitas em 26/07/2026, com dados fictícios |
| `mockups/finais/` | 4 PNG | Mockups em moldura de navegador sobre fundo da marca |
| `landing-page/` | `index.html` | Landing reescrita: copy nova, seletor de público, CTA único, ressalvas no FAQ |
| `roadmap/` | `aluguel-proximas-atualizacoes.html` + `.pdf` | Documento visual das próximas atualizações, com destaque para a galeria de casas |
| `roadmap/` | `build-pdf.py` | Regera o PDF a partir do HTML (`python3 build-pdf.py`, requer `weasyprint`) |

## O que ainda falta

- Apresentação comercial (15 → ~18 slides, com bloco intercambiável por trilha)
- One-page em duas versões: proprietário e corretora
- Proposta comercial em duas versões
- Kit WhatsApp com artes novas e mensagens por objeção
- Manual de identidade 2.0 em `.docx` e `.pdf`
- Capturas mobile e do portal do inquilino

---

## Como as capturas foram feitas

O aplicativo em produção foi aberto com a conta administradora e os nomes reais de inquilinos, telefones, e-mails e endereços foram **substituídos apenas na memória do navegador**, sem nenhuma gravação no banco. As funções de escrita do `db` foram bloqueadas durante a sessão de captura, por precaução.

Nomes fictícios usados: Mariana Souza, Ricardo Alves, Patricia Lima, Fernando Rocha, Juliana Mendes, Bruno Carvalho, Carolina Dias, Eduardo Pinto, Leticia Barros.

Toda captura leva o selo **DEMONSTRAÇÃO · DADOS FICTÍCIOS**.

---

## Achados de acessibilidade no design novo

Medidos a partir de `aluguel-ui.css`. Dois tokens do produto ficam abaixo de 4,5:1 quando o texto está direto sobre o canvas:

| Token | Sobre `#EEF3F0` | Situação | Correção |
|---|---:|---|---|
| `--rent-muted` `#63736B` | 4,46:1 | Reprovado por pouco | Usar `#5A6A62` (5,10:1) |
| `--rent-gold-deep` `#9C6C15` | 4,10:1 | Reprovado | Usar `#8A5F12` (5,02:1) |

Sobre cartão branco os valores originais passam. Os materiais da v2 já usam as versões corrigidas.

**Regra que não muda:** lima `#E7F77B` (1,17:1) e ouro `#F0C76E` (1,60:1) **nunca** são cor de texto sobre fundo claro. São cor de superfície e de acento sobre escuro.

---

## Antes de publicar qualquer peça

1. `[INSERIR NÚMERO DO WHATSAPP COMERCIAL]` — aparece na landing e no roadmap
2. `[INSERIR ENDEREÇO DE SUPORTE]` e prazo de resposta
3. `[INSERIR LIMITES DO PLANO CORRETORA]` — casas, colaboradores e diferença para o Premium
4. Preço e periodicidade, quando aprovados

**Bloqueio técnico — atualizado em 31/07/2026.** O bloqueio dos contratos por colaborador **não existe mais**: `iniciar_contrato_gestao` e `encerrar_contrato_gestao` passaram a usar `pode_operar_imoveis()` (`migracao-financeiro-v2.sql:2345, 2484`) e aceitam colaborador desde então. A redação anterior descrevia a primeira geração dessas RPCs (`migracao-contratos-cobrancas.sql:152`), já substituída duas vezes.

O que realmente bloqueava era outra coisa, encontrada em 31/07/2026 e corrigida por `migracao-vitrine-equipe.sql`: **o colaborador não conseguia gravar nada na Vitrine**. As tabelas do módulo nasceram com `user_id ... default auth.uid()` e a policy compara com `usuario_proprietario_id(auth.uid())` — valores iguais para o dono, diferentes para a equipe. Sem isso, "catálogo com a marca da corretora operado por uma equipe" era promessa sem sustentação.

**O que continua valendo:** o colaborador não gerencia a própria equipe nem altera o perfil público/slug — `salvar_perfil_publico` exige `usuario_proprietario_id(auth.uid()) = auth.uid()` (`migracao-versao-comercial-v1.sql:881`). Isso é desenho, não defeito.

---

## Checklist antes de aprovar cada peça

Está em `estrategia/diagnostico-comercial-v2.md`, seção 12.
