"""Gera o PDF do documento de roadmap a partir do HTML.
   Uso: python3 build-pdf.py   (requer weasyprint)"""
from weasyprint import HTML, CSS
PRINT_CSS = """
@page{size:A4;margin:13mm 11mm}
body{background:#fff}
.wrap{max-width:none;padding:0}
.stages{display:flex;flex-wrap:wrap;gap:8px}
.stages .stage{flex:1 1 46%;padding:11px 13px}
.grid{display:flex;flex-wrap:wrap;gap:12px}
.grid.g2>*{flex:1 1 46%;min-width:0}
.grid.g3>*{flex:1 1 30%;min-width:0}
.mock-grid{display:flex;gap:10px}
.mock-grid>*{flex:1 1 0;min-width:0}
.tag{display:inline-block;width:auto}
.chip{display:inline-block}
section{margin:26px 0}
.card,figure,.mock,.note,.stage{break-inside:avoid}
.sec-head{display:block}
.sec-head .sec-num{display:inline-block;margin-right:8px}
.sec-head h2{display:inline;font-size:24px}
.hero,.cta{box-shadow:none}
figure img{box-shadow:none}
h2,h4{break-after:avoid}
"""
HTML("aluguel-proximas-atualizacoes.html").write_pdf(
    "aluguel-proximas-atualizacoes.pdf", stylesheets=[CSS(string=PRINT_CSS)])
print("PDF gerado.")
