"""Gera os PDFs editoriais finais da Prioridade 1 com ReportLab.

Os conteúdos seguem os documentos editáveis produzidos por
``build_documents.py``. Informações comerciais ainda não definidas permanecem
como campos de preenchimento; nenhum preço, SLA ou WhatsApp é inventado.
"""

from __future__ import annotations

from html import escape
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Flowable,
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
BRANDING = ROOT / "branding"
PROPOSAL = ROOT / "proposta-comercial"
QR_PATH = ROOT / "qr-codes" / "qr-app-aluguel.png"

CREATED = "22 de julho de 2026"
APP_URL = "https://aluguel-casas-anderton.netlify.app"
EMAIL = "andertonaluguel@gmail.com"

COVER = colors.HexColor("#14322A")
COVER_LIGHT = colors.HexColor("#1F4339")
PAPER = colors.HexColor("#F4F6F3")
CARD = colors.white
INK = colors.HexColor("#1C2620")
INK_SOFT = colors.HexColor("#5C6B63")
INK_FAINT = colors.HexColor("#93A099")
BRASS = colors.HexColor("#B8863C")
BRASS_DEEP = colors.HexColor("#8C631F")
BRASS_SOFT = colors.HexColor("#F1E4C8")
RUST = colors.HexColor("#A23B2E")
RUST_SOFT = colors.HexColor("#F4DCD7")
LINE = colors.HexColor("#DDE4DE")
BLUE = colors.HexColor("#3E6B8A")
BLUE_SOFT = colors.HexColor("#DCE7ED")
GREEN_SOFT = colors.HexColor("#EAF5ED")
GREEN = colors.HexColor("#21613C")

PAGE_W, PAGE_H = A4
CONTENT_W = PAGE_W - 34 * mm


def register_fonts() -> None:
    """Registra fontes estáveis do runtime, com fallback para Helvetica."""
    font_root = Path(
        r"C:\Users\Anderton\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\share\fonts"
    )
    files = {
        "AluguelSans": font_root / "Ubuntu-R.ttf",
        "AluguelSansMedium": font_root / "Ubuntu-M.ttf",
        "AluguelSansBold": font_root / "Ubuntu-B.ttf",
        "AluguelMono": font_root / "UbuntuMono-R.ttf",
        "AluguelMonoBold": font_root / "UbuntuMono-B.ttf",
    }
    fallback = {
        "AluguelSans": "Helvetica",
        "AluguelSansMedium": "Helvetica",
        "AluguelSansBold": "Helvetica-Bold",
        "AluguelMono": "Courier",
        "AluguelMonoBold": "Courier-Bold",
    }
    for name, path in files.items():
        if path.exists():
            pdfmetrics.registerFont(TTFont(name, str(path)))
        else:
            # O alias preserva os nomes usados pelos estilos.
            pdfmetrics.registerFontFamily(name, normal=fallback[name])


register_fonts()


def _font(name: str) -> str:
    try:
        pdfmetrics.getFont(name)
        return name
    except KeyError:
        return {
            "AluguelSans": "Helvetica",
            "AluguelSansMedium": "Helvetica",
            "AluguelSansBold": "Helvetica-Bold",
            "AluguelMono": "Courier",
            "AluguelMonoBold": "Courier-Bold",
        }[name]


def build_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName=_font("AluguelSans"),
            fontSize=9.4,
            leading=13.2,
            textColor=INK,
            spaceAfter=6,
        ),
        "body_soft": ParagraphStyle(
            "BodySoft",
            parent=base["BodyText"],
            fontName=_font("AluguelSans"),
            fontSize=9.1,
            leading=12.6,
            textColor=INK_SOFT,
            spaceAfter=5,
        ),
        "small": ParagraphStyle(
            "Small",
            parent=base["BodyText"],
            fontName=_font("AluguelSans"),
            fontSize=7.8,
            leading=10.2,
            textColor=INK_SOFT,
            spaceAfter=0,
        ),
        "table": ParagraphStyle(
            "Table",
            parent=base["BodyText"],
            fontName=_font("AluguelSans"),
            fontSize=8.25,
            leading=10.5,
            textColor=INK,
            spaceAfter=0,
        ),
        "table_soft": ParagraphStyle(
            "TableSoft",
            parent=base["BodyText"],
            fontName=_font("AluguelSans"),
            fontSize=8.05,
            leading=10.35,
            textColor=INK_SOFT,
            spaceAfter=0,
        ),
        "table_white": ParagraphStyle(
            "TableWhite",
            parent=base["BodyText"],
            fontName=_font("AluguelSansBold"),
            fontSize=8.1,
            leading=10,
            textColor=CARD,
            spaceAfter=0,
        ),
        "kicker": ParagraphStyle(
            "Kicker",
            parent=base["BodyText"],
            fontName=_font("AluguelMonoBold"),
            fontSize=7.7,
            leading=9.5,
            tracking=0.8,
            textColor=BRASS_DEEP,
            spaceAfter=6,
        ),
        "h1": ParagraphStyle(
            "H1",
            parent=base["Heading1"],
            fontName=_font("AluguelSansBold"),
            fontSize=21,
            leading=24,
            textColor=COVER,
            spaceBefore=0,
            spaceAfter=8,
            keepWithNext=True,
        ),
        "h2": ParagraphStyle(
            "H2",
            parent=base["Heading2"],
            fontName=_font("AluguelSansBold"),
            fontSize=12.4,
            leading=15.5,
            textColor=BRASS_DEEP,
            spaceBefore=9,
            spaceAfter=5,
            keepWithNext=True,
        ),
        "lead": ParagraphStyle(
            "Lead",
            parent=base["BodyText"],
            fontName=_font("AluguelSansMedium"),
            fontSize=13.1,
            leading=17.1,
            textColor=COVER,
            spaceAfter=12,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=base["BodyText"],
            fontName=_font("AluguelSans"),
            fontSize=9.15,
            leading=12.6,
            textColor=INK,
            leftIndent=13,
            firstLineIndent=-9,
            spaceAfter=4,
        ),
        "number": ParagraphStyle(
            "Number",
            parent=base["BodyText"],
            fontName=_font("AluguelSans"),
            fontSize=9.15,
            leading=12.6,
            textColor=INK,
            leftIndent=19,
            firstLineIndent=-15,
            spaceAfter=5,
        ),
        "cover_kicker": ParagraphStyle(
            "CoverKicker",
            parent=base["BodyText"],
            fontName=_font("AluguelMonoBold"),
            fontSize=8,
            leading=10,
            tracking=1,
            textColor=BRASS,
            alignment=TA_CENTER,
            spaceAfter=13,
        ),
        "cover_title": ParagraphStyle(
            "CoverTitle",
            parent=base["Heading1"],
            fontName=_font("AluguelSansBold"),
            fontSize=35,
            leading=40,
            textColor=CARD,
            alignment=TA_CENTER,
            spaceAfter=12,
        ),
        "cover_sub": ParagraphStyle(
            "CoverSub",
            parent=base["BodyText"],
            fontName=_font("AluguelSans"),
            fontSize=14,
            leading=19,
            textColor=colors.HexColor("#DCE8E2"),
            alignment=TA_CENTER,
            spaceAfter=24,
        ),
        "cover_meta": ParagraphStyle(
            "CoverMeta",
            parent=base["BodyText"],
            fontName=_font("AluguelMono"),
            fontSize=8.2,
            leading=12,
            textColor=colors.HexColor("#B9CCC3"),
            alignment=TA_CENTER,
            spaceAfter=2,
        ),
        "chip": ParagraphStyle(
            "Chip",
            parent=base["BodyText"],
            fontName=_font("AluguelSansBold"),
            fontSize=8.2,
            leading=10,
            textColor=BRASS_DEEP,
            alignment=TA_CENTER,
            spaceAfter=0,
        ),
        "callout": ParagraphStyle(
            "Callout",
            parent=base["BodyText"],
            fontName=_font("AluguelSans"),
            fontSize=8.8,
            leading=12.2,
            textColor=INK_SOFT,
            spaceAfter=0,
        ),
        "callout_title": ParagraphStyle(
            "CalloutTitle",
            parent=base["BodyText"],
            fontName=_font("AluguelSansBold"),
            fontSize=9.2,
            leading=11,
            textColor=COVER,
            spaceAfter=2,
        ),
    }


STYLES = build_styles()


class BrandLockup(Flowable):
    """Símbolo real do produto com wordmark em uma faixa centralizada."""

    def __init__(self, width: float, dark: bool = True):
        super().__init__()
        self.width = width
        self.height = 42
        self.dark = dark

    def draw(self) -> None:
        c = self.canv
        color = BRASS if self.dark else COVER
        window = COVER if self.dark else PAPER
        mark_w = 30
        total_w = 126
        start_x = (self.width - total_w) / 2
        x = start_x
        y = 6
        c.setFillColor(color)
        c.saveState()
        c.translate(x, y)
        scale = mark_w / 32
        c.scale(scale, scale)
        path = c.beginPath()
        path.moveTo(16, 5)
        path.lineTo(27, 15)
        path.lineTo(5, 15)
        path.close()
        c.drawPath(path, fill=1, stroke=0)
        c.roundRect(8, 14, 16, 13, 1, fill=1, stroke=0)
        c.rect(21.5, 8, 3.5, 7, fill=1, stroke=0)
        c.setFillColor(window)
        c.rect(11.5, 18.5, 3.5, 3.5, fill=1, stroke=0)
        c.rect(17, 18.5, 3.5, 3.5, fill=1, stroke=0)
        c.restoreState()
        c.setFillColor(color)
        c.setFont(_font("AluguelSansBold"), 13)
        c.drawString(start_x + 40, 15, "ALUGUEL")


class Rule(Flowable):
    def __init__(self, width: float = CONTENT_W, color=BRASS, thickness: float = 2.2):
        super().__init__()
        self.width = width
        self.height = 8
        self.color = color
        self.thickness = thickness

    def draw(self) -> None:
        self.canv.setFillColor(self.color)
        self.canv.roundRect(0, 3, min(84, self.width), self.thickness, self.thickness / 2, fill=1, stroke=0)


def page_background(canvas, doc) -> None:
    canvas.saveState()
    if doc.page == 1:
        canvas.setFillColor(COVER)
        canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        canvas.setFillColor(COVER_LIGHT)
        canvas.circle(PAGE_W + 24 * mm, PAGE_H - 28 * mm, 62 * mm, fill=1, stroke=0)
        canvas.setStrokeColor(BRASS)
        canvas.setLineWidth(1.2)
        canvas.line(28 * mm, 27 * mm, PAGE_W - 28 * mm, 27 * mm)
    else:
        canvas.setFillColor(PAPER)
        canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        canvas.setFillColor(COVER)
        canvas.rect(0, PAGE_H - 14 * mm, PAGE_W, 14 * mm, fill=1, stroke=0)
        canvas.setFillColor(BRASS)
        canvas.rect(0, PAGE_H - 14.8 * mm, PAGE_W, 0.8 * mm, fill=1, stroke=0)
        canvas.setFillColor(CARD)
        canvas.setFont(_font("AluguelMonoBold"), 7.1)
        canvas.drawString(17 * mm, PAGE_H - 9 * mm, "ALUGUEL  /  GESTÃO DE ALUGUÉIS")
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.5)
        canvas.line(17 * mm, 14 * mm, PAGE_W - 17 * mm, 14 * mm)
        canvas.setFillColor(INK_SOFT)
        canvas.setFont(_font("AluguelMono"), 7.1)
        canvas.drawString(17 * mm, 9.2 * mm, "COMERCIAL 1.0")
        footer = f"ALUGUEL  •  {doc.page - 1:02d}"
        canvas.drawRightString(PAGE_W - 17 * mm, 9.2 * mm, footer)
    canvas.restoreState()


def document(path: Path, title: str) -> SimpleDocTemplate:
    path.parent.mkdir(parents=True, exist_ok=True)
    return SimpleDocTemplate(
        str(path),
        pagesize=A4,
        leftMargin=17 * mm,
        rightMargin=17 * mm,
        topMargin=20 * mm,
        bottomMargin=18 * mm,
        title=title,
        author="Aluguel",
        subject="Material comercial do aplicativo Aluguel",
        creator="Aluguel / ReportLab",
        pageCompression=1,
    )


def P(text: str, style: str = "body") -> Paragraph:
    return Paragraph(escape(text).replace("\n", "<br/>"), STYLES[style])


def rich(text: str, style: str = "body") -> Paragraph:
    return Paragraph(text, STYLES[style])


def cover(kicker: str, title: str, subtitle: str, metadata: list[str]) -> list[Flowable]:
    items: list[Flowable] = [
        Spacer(1, 43 * mm),
        BrandLockup(CONTENT_W, dark=True),
        Spacer(1, 10 * mm),
        P(kicker.upper(), "cover_kicker"),
        P(title, "cover_title"),
        P(subtitle, "cover_sub"),
        Rule(CONTENT_W, BRASS, 2.4),
        Spacer(1, 5 * mm),
    ]
    items.extend(P(value, "cover_meta") for value in metadata)
    items.append(PageBreak())
    return items


def section_start(number: str, title: str, lead: str) -> list[Flowable]:
    return [P(number.upper(), "kicker"), P(title, "h1"), Rule(), P(lead, "lead")]


def heading(text: str) -> Paragraph:
    return P(text, "h2")


def bullet_list(items: list[str]) -> list[Paragraph]:
    return [rich(f'<font color="#B8863C">●</font>&nbsp;&nbsp;{escape(item)}', "bullet") for item in items]


def numbered_list(items: list[str]) -> list[Paragraph]:
    return [rich(f'<font color="#8C631F"><b>{index:02d}</b></font>&nbsp;&nbsp;{escape(item)}', "number") for index, item in enumerate(items, 1)]


def callout(title: str, body: str, fill=BRASS_SOFT, accent=BRASS) -> Table:
    data = [["", [P(title, "callout_title"), P(body, "callout")]]]
    table = Table(data, colWidths=[3.2, CONTENT_W - 3.2], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, 0), accent),
                ("BACKGROUND", (1, 0), (1, 0), fill),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (0, 0), 0),
                ("RIGHTPADDING", (0, 0), (0, 0), 0),
                ("TOPPADDING", (0, 0), (0, 0), 0),
                ("BOTTOMPADDING", (0, 0), (0, 0), 0),
                ("LEFTPADDING", (1, 0), (1, 0), 11),
                ("RIGHTPADDING", (1, 0), (1, 0), 11),
                ("TOPPADDING", (1, 0), (1, 0), 9),
                ("BOTTOMPADDING", (1, 0), (1, 0), 9),
                ("BOX", (0, 0), (-1, -1), 0.45, LINE),
            ]
        )
    )
    return table


def qr_contact_block(title: str, body: str) -> Table:
    """Combina instrução e QR oficial do aplicativo em um bloco editorial."""
    if not QR_PATH.exists():
        raise FileNotFoundError(f"QR Code oficial não encontrado: {QR_PATH}")
    qr = Image(str(QR_PATH), width=26 * mm, height=26 * mm)
    text = [P(title, "callout_title"), P(body, "callout")]
    table = Table([[text, qr]], colWidths=[CONTENT_W - 34 * mm, 34 * mm], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), CARD),
                ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (0, 0), 11),
                ("RIGHTPADDING", (0, 0), (0, 0), 11),
                ("TOPPADDING", (0, 0), (0, 0), 9),
                ("BOTTOMPADDING", (0, 0), (0, 0), 9),
                ("LEFTPADDING", (1, 0), (1, 0), 4),
                ("RIGHTPADDING", (1, 0), (1, 0), 7),
                ("TOPPADDING", (1, 0), (1, 0), 5),
                ("BOTTOMPADDING", (1, 0), (1, 0), 5),
            ]
        )
    )
    return table


def chips(values: list[str]) -> Table:
    data = [[P(value, "chip") for value in values]]
    table = Table(data, colWidths=[CONTENT_W / len(values)] * len(values), hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), BRASS_SOFT),
                ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, CARD),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return table


def standard_table(
    headers: list[str],
    rows: list[list[str]],
    widths: list[float],
    first_col_fill=None,
    row_fills: dict[int, colors.Color] | None = None,
) -> Table:
    data = [[P(h, "table_white") for h in headers]]
    for row in rows:
        data.append([P(value, "table_soft" if col else "table") for col, value in enumerate(row)])
    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), COVER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LINEBELOW", (0, 1), (-1, -1), 0.45, LINE),
        ("BOX", (0, 0), (-1, -1), 0.45, LINE),
    ]
    if first_col_fill is not None:
        style.append(("BACKGROUND", (0, 1), (0, -1), first_col_fill))
    if row_fills:
        for row_index, fill in row_fills.items():
            style.append(("BACKGROUND", (0, row_index + 1), (-1, row_index + 1), fill))
    table.setStyle(TableStyle(style))
    return table


def metadata_grid(left: list[tuple[str, str]], right: list[tuple[str, str]]) -> Table:
    rows = []
    for index in range(max(len(left), len(right))):
        l = left[index] if index < len(left) else ("", "")
        r = right[index] if index < len(right) else ("", "")
        rows.append([P(l[0], "small"), P(l[1], "table"), P(r[0], "small"), P(r[1], "table")])
    table = Table(rows, colWidths=[26 * mm, 53 * mm, 26 * mm, CONTENT_W - 105 * mm], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), PAPER),
                ("BACKGROUND", (2, 0), (2, -1), PAPER),
                ("BACKGROUND", (1, 0), (1, -1), CARD),
                ("BACKGROUND", (3, 0), (3, -1), CARD),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("GRID", (0, 0), (-1, -1), 0.4, LINE),
            ]
        )
    )
    return table


def logo_showcase() -> Table:
    dark = [Spacer(1, 4), BrandLockup(CONTENT_W / 2 - 18, dark=True), P("VERSÃO SOBRE FUNDO ESCURO", "cover_meta")]
    light_label = Paragraph("VERSÃO SOBRE FUNDO CLARO", ParagraphStyle("lightLabel", parent=STYLES["cover_meta"], textColor=COVER))
    light = [Spacer(1, 4), BrandLockup(CONTENT_W / 2 - 18, dark=False), light_label]
    table = Table([[dark, light]], colWidths=[CONTENT_W / 2, CONTENT_W / 2], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, 0), COVER),
                ("BACKGROUND", (1, 0), (1, 0), CARD),
                ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 12),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
            ]
        )
    )
    return table


def palette_table() -> Table:
    rows = [
        ("Verde capa", "#14322A", "Fundos, navegação, autoridade", COVER, CARD),
        ("Verde apoio", "#1F4339", "Profundidade e superfícies escuras", COVER_LIGHT, CARD),
        ("Latão", "#B8863C", "CTA, foco e acentos", BRASS, INK),
        ("Papel", "#F4F6F3", "Fundo principal", PAPER, INK),
        ("Tinta", "#1C2620", "Texto principal", INK, CARD),
        ("Ferrugem", "#A23B2E", "Atrasos e alertas críticos", RUST, CARD),
        ("Manutenção", "#3E6B8A", "Status operacional", BLUE, CARD),
        ("Linha", "#DDE4DE", "Divisórias e bordas", LINE, INK),
    ]
    data = [[P("Cor", "table_white"), P("Código", "table_white"), P("Uso recomendado", "table_white")]]
    for name, code, usage, _, text_color in rows:
        name_style = ParagraphStyle("swatch", parent=STYLES["table"], textColor=text_color, fontName=_font("AluguelSansBold"))
        data.append([Paragraph(escape(name), name_style), P(code, "table"), P(usage, "table_soft")])
    table = Table(data, colWidths=[42 * mm, 32 * mm, CONTENT_W - 74 * mm], repeatRows=1, hAlign="LEFT")
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), COVER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
    ]
    for index, (_, _, _, fill, _) in enumerate(rows, 1):
        commands.append(("BACKGROUND", (0, index), (0, index), fill))
        commands.append(("BACKGROUND", (1, index), (-1, index), CARD))
    table.setStyle(TableStyle(commands))
    return table


def build_brand_manual() -> Path:
    output = BRANDING / "manual-identidade-comercial-aluguel.pdf"
    story: list[Flowable] = []
    story += cover(
        "Mini manual de identidade comercial",
        "Aluguel",
        "Uma identidade clara para organizar, apresentar e vender a gestão de aluguéis.",
        ["VERSÃO 1.0", CREATED.upper(), "PRODUTO: COMERCIAL 1.0"],
    )

    story += section_start(
        "01  ESSÊNCIA DA MARCA",
        "Cada aluguel no lugar certo",
        "Clareza operacional para pequenos locadores que querem trocar planilhas e conversas dispersas por uma rotina centralizada.",
    )
    story.append(P("Aluguel é uma plataforma de gestão assistida que reúne imóveis, inquilinos, contratos, recebimentos, energia, despesas e interessados. A comunicação deve transmitir controle, proximidade e confiança - sem prometer automações ou resultados que o produto não executa."))
    story.append(callout("Proposta de valor principal", "Tenha cada imóvel, contrato, cobrança e documento no lugar certo - e saiba o que entrou, o que falta receber e o que exige atenção."))
    story.append(heading("Personalidade"))
    story.append(chips(["Confiável", "Direta", "Organizada", "Próxima"]))
    story.append(heading("Posicionamento"))
    story.append(P("Para pequenos locadores que administram a própria carteira, Aluguel é a plataforma de gestão de locações que centraliza a operação da casa vaga ao pagamento recebido, com visão financeira, atalhos manuais de WhatsApp e PIX e portal do inquilino."))
    story.append(PageBreak())

    story += section_start(
        "02  MARCA GRÁFICA",
        "Símbolo que nasce do produto",
        "A casa geométrica usada no aplicativo permanece como elemento principal. Nenhum novo símbolo foi inventado para os materiais comerciais.",
    )
    story.append(logo_showcase())
    story.append(heading("Área de proteção"))
    story.append(P("Mantenha ao redor do símbolo uma área livre equivalente à largura de uma de suas janelas. Em lockups, preserve a relação de escala fornecida nos arquivos SVG."))
    story.append(heading("Usos incorretos"))
    story += bullet_list([
        "Não distorcer, inclinar ou alterar a proporção do símbolo.",
        "Não trocar as cores por efeitos, gradientes ou combinações fora da paleta.",
        "Não inserir detalhes, setas ou elementos que sugiram funcionalidades inexistentes.",
        "Não aplicar sobre fundos com pouco contraste.",
    ])
    story.append(PageBreak())

    story += section_start(
        "03  PALETA",
        "Verde de controle, latão de ação",
        "A paleta vem diretamente do aplicativo: verde-escuro para confiança, tons de papel para leveza e latão para orientar a ação.",
    )
    story.append(palette_table())
    story.append(Spacer(1, 8))
    story.append(callout("Regra de contraste", "Textos pequenos devem usar Tinta sobre Papel ou branco sobre Verde capa. O latão funciona melhor como destaque, não como texto longo.", fill=BLUE_SOFT, accent=BLUE))
    story.append(PageBreak())

    story += section_start(
        "04  TIPOGRAFIA",
        "Tecnologia com leitura humana",
        "A combinação tipográfica do produto deve ser preservada na comunicação digital.",
    )
    typ_rows = [
        ["Space Grotesk", "Títulos, chamadas, números de impacto e nome Aluguel."],
        ["IBM Plex Sans", "Textos, legendas, formulários, FAQs e documentos digitais."],
        ["IBM Plex Mono", "Valores, datas, chips, versões e informações operacionais."],
    ]
    story.append(standard_table(["Família", "Uso recomendado"], typ_rows, [52 * mm, CONTENT_W - 52 * mm], first_col_fill=BRASS_SOFT))
    story.append(heading("Fallbacks"))
    story.append(P("Quando as fontes web não estiverem disponíveis, use Calibri ou Arial em documentos de escritório. Evite fontes decorativas, manuscritas ou excessivamente condensadas."))
    story.append(callout("Hierarquia mínima", "Títulos em Space Grotesk, leitura contínua em IBM Plex Sans e valores operacionais em IBM Plex Mono. Peso e espaço devem criar contraste antes do uso de novas cores.", fill=PAPER, accent=BRASS))
    story.append(PageBreak())

    story += section_start(
        "05  VOZ E MENSAGEM",
        "Fale como quem organiza a rotina",
        "Frases curtas, benefícios concretos e transparência sobre o que depende de ação humana.",
    )
    prefer = [P("Preferir", "h2")] + bullet_list([
        "“Veja o que falta receber.”",
        "“Cobrança manual com mensagem pronta.”",
        "“Dados separados por conta.”",
        "“Portal de consulta para o inquilino.”",
    ])
    avoid = [P("Evitar", "h2")] + bullet_list([
        "“Acabe com a inadimplência.”",
        "“Cobrança 100% automática.”",
        "“Conciliação bancária.”",
        "“Garantia de conformidade LGPD.”",
    ])
    voice = Table([[prefer, avoid]], colWidths=[CONTENT_W / 2, CONTENT_W / 2], hAlign="LEFT")
    voice.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), GREEN_SOFT),
        ("BACKGROUND", (1, 0), (1, 0), RUST_SOFT),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.append(voice)
    story.append(heading("Hierarquia de mensagens"))
    story += numbered_list([
        "Controle: seus aluguéis em uma visão única.",
        "Rotina: imóveis, contratos, cobranças e documentos conectados.",
        "Decisão: previsto, recebido, pendências, ocupação e despesas.",
        "Relacionamento: atalhos manuais para WhatsApp/PIX e portal do inquilino.",
    ])
    story.append(PageBreak())

    story += section_start(
        "06  SISTEMA VISUAL",
        "Do produto para a comunicação",
        "Materiais comerciais devem parecer uma extensão natural do aplicativo.",
    )
    story += bullet_list([
        "Fundos em Papel com blocos Verde capa; cartões brancos com borda Linha.",
        "Cantos entre 16 e 22 px no digital; sombras suaves e pouco contrastadas.",
        "Chips arredondados para status e categorias; números em IBM Plex Mono.",
        "Fotografias e mockups sempre acompanhados de telas reais ou demonstrativas renderizadas pelo produto.",
        "Ferrugem apenas para atraso/risco; azul apenas para manutenção ou contexto operacional.",
    ])
    story.append(callout("Direção de arte", "Premium não significa ornamental. O sistema visual deve priorizar leitura, hierarquia, espaço e prova real do produto.", fill=PAPER, accent=BRASS))
    story.append(heading("Composição recomendada"))
    comp = Table(
        [[
            [P("1  CONTEXTO", "kicker"), P("Nomeie a dor sem exagero.", "table")],
            [P("2  PRODUTO", "kicker"), P("Mostre a tela que resolve.", "table")],
            [Paragraph("3  AÇÃO", ParagraphStyle("kickerWhite", parent=STYLES["kicker"], textColor=BRASS)), Paragraph("Finalize com CTA único.", ParagraphStyle("bodyWhite", parent=STYLES["table"], textColor=CARD))],
        ]],
        colWidths=[CONTENT_W / 3] * 3,
        hAlign="LEFT",
    )
    comp.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), CARD),
        ("BACKGROUND", (1, 0), (1, 0), BRASS_SOFT),
        ("BACKGROUND", (2, 0), (2, 0), COVER),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 11),
        ("RIGHTPADDING", (0, 0), (-1, -1), 11),
        ("TOPPADDING", (0, 0), (-1, -1), 11),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 11),
    ]))
    story.append(comp)
    story.append(PageBreak())

    story += section_start(
        "07  CHAMADAS E CTAS",
        "Uma ação principal por peça",
        "A demonstração é o próximo passo comercial principal; criar a conta gratuita é a alternativa de autosserviço.",
    )
    cta_rows = [
        ["CTA principal", "Solicitar uma demonstração"],
        ["CTA secundário", "Começar grátis"],
        ["Microcopy", "Demonstração guiada. Sem compromisso. Condições sob consulta."],
    ]
    story.append(standard_table(["Função", "Texto"], cta_rows, [50 * mm, CONTENT_W - 50 * mm], row_fills={0: BRASS_SOFT}))
    story.append(heading("Destino oficial"))
    story.append(P(APP_URL))
    story.append(qr_contact_block("Acesso ao aplicativo", "Escaneie o QR Code para abrir o endereço oficial do Aluguel."))
    story.append(Spacer(1, 5))
    story.append(callout("WhatsApp pendente", "O botão usa e-mail como fallback funcional até a confirmação do número comercial com DDD. Nenhum número fictício deve ser publicado.", fill=RUST_SOFT, accent=RUST))
    story.append(heading("Microcopy de segurança"))
    story.append(P("Use linguagem direta sobre condições sob consulta. Não publique promessa de prazo, resultado ou automação que não esteja formalmente definida."))
    story.append(PageBreak())

    story += section_start(
        "08  GOVERNANÇA",
        "Consistência antes de velocidade",
        "Toda peça deve passar por quatro verificações antes de publicação.",
    )
    for title, body in [
        ("Verdade", "A funcionalidade aparece no produto e foi validada?"),
        ("Privacidade", "A tela usa dados demonstrativos e não expõe pessoas reais?"),
        ("Legibilidade", "Texto, CTA, contraste e QR Code funcionam no tamanho final?"),
        ("Destino", "Links, e-mail, WhatsApp e URL estão corretos?"),
    ]:
        story.append(callout(title, body, fill=CARD, accent=BRASS))
        story.append(Spacer(1, 4))
    story.append(heading("Arquivos-base"))
    story += bullet_list([
        "SVGs do símbolo e lockups: versões editáveis para web e design.",
        "brand-tokens.css / brand-tokens.json: referência técnica da identidade.",
        "Este manual em DOCX e PDF: orientação de uso e governança.",
        "README.md: índice dos arquivos e data de criação.",
    ])
    story.append(Rule())
    story.append(P(f"Aluguel  •  {EMAIL}  •  {CREATED}", "small"))

    document(output, "Mini manual de identidade comercial - Aluguel").build(story, onFirstPage=page_background, onLaterPages=page_background)
    return output


def build_proposal() -> Path:
    output = PROPOSAL / "proposta-comercial-aluguel.pdf"
    story: list[Flowable] = []
    story += cover(
        "Proposta comercial",
        "Aluguel",
        "Gestão de imóveis, contratos e recebimentos para uma rotina mais organizada.",
        ["PREPARADA PARA: [NOME DO CLIENTE]", "VALIDADE: [INSERIR VALIDADE]", CREATED.upper()],
    )

    story += section_start(
        "PROPOSTA PARA [NOME DO CLIENTE]",
        "Uma operação de locação mais clara",
        "Esta proposta apresenta como o Aluguel pode centralizar a gestão cotidiana da carteira, do imóvel vago ao acompanhamento do recebimento.",
    )
    story.append(metadata_grid(
        [("Cliente", "[NOME / EMPRESA]"), ("Responsável", "[NOME DO DECISOR]"), ("Carteira", "[NÚMERO DE IMÓVEIS]")],
        [("Proponente", "Aluguel"), ("Contato", EMAIL), ("Proposta", "[CÓDIGO / VERSÃO]")],
    ))
    story.append(heading("Resumo executivo"))
    story.append(P("O Aluguel reúne imóveis, inquilinos, contratos, recebimentos, energia, despesas, interessados, documentos e agenda em uma única plataforma. O objetivo é oferecer visão operacional e financeira, preservar histórico e facilitar ações manuais de cobrança por WhatsApp e PIX - sem substituir análise jurídica, contábil ou conciliação bancária."))
    story.append(callout("Resultado esperado", "Uma rotina mais organizada, com informações localizáveis e pendências visíveis. Indicadores de resultado serão definidos e medidos junto ao cliente; não há percentuais garantidos."))
    story.append(PageBreak())

    story += section_start(
        "01  CONTEXTO",
        "O cenário que esta solução endereça",
        "Quando imóveis, cobranças e documentos ficam espalhados, a dificuldade não é apenas registrar: é saber rapidamente o que exige atenção.",
    )
    story.append(heading("Situação típica"))
    story += bullet_list([
        "Cadastros de imóveis e inquilinos distribuídos entre planilhas, anotações e conversas.",
        "Pagamentos, energia e despesas sem uma visão consolidada por mês e por imóvel.",
        "Histórico contratual difícil de consultar quando há troca de inquilino.",
        "Interessados e imóveis vagos acompanhados sem um funil único.",
        "Documentos e fotos sem vínculo claro com a operação correspondente.",
    ])
    story.append(heading("Ação proposta"))
    story.append(P("Implantar uma conta Aluguel compatível com o tamanho da carteira, configurar os dados do locador, organizar os cadastros prioritários e orientar o responsável pela operação nos fluxos essenciais."))
    story.append(heading("Resultado operacional buscado"))
    story.append(P("Concentrar a rotina em um ambiente com status, históricos, alertas e relatórios gerenciais. O registro e a confirmação de recebimentos permanecem sob responsabilidade do usuário."))
    story.append(PageBreak())

    story += section_start(
        "02  SOLUÇÃO",
        "O que o Aluguel entrega",
        "Uma plataforma web instalável, desenhada para a gestão assistida de pequenos locadores e carteiras enxutas.",
    )
    features = [
        ["Painel", "Previsto, recebido, falta receber, ocupação, alertas e visão de 12 meses."],
        ["Imóveis", "Cadastro, status, características, contratos, pagamentos, energia, despesas, fotos e documentos."],
        ["Inquilinos", "Base reutilizável, vínculos e histórico contratual por ciclo de ocupação."],
        ["Financeiro", "Acompanhamento mensal/anual, ageing, despesas, saldo e exportações CSV/PDF."],
        ["Relacionamento", "Mensagens pré-preenchidas para WhatsApp, PIX Copia e Cola e portal de consulta do inquilino."],
        ["Vagas", "Catálogo público de imóveis vagos/publicados e funil de interessados com combinação por regras."],
        ["Operação", "Calendário, lembretes manuais, equipe, backup exportável e consulta offline da última cópia."],
    ]
    story.append(standard_table(["Módulo", "Capacidade"], features, [43 * mm, CONTENT_W - 43 * mm], first_col_fill=BRASS_SOFT))
    story.append(Spacer(1, 8))
    story.append(callout("Prova do produto", "As capacidades acima foram verificadas no aplicativo atual. A cobrança e a confirmação de recebimentos permanecem manuais."))
    story.append(PageBreak())

    story += section_start(
        "03  ESCOPO",
        "Configuração e ativação",
        "O escopo comercial deve ser confirmado conforme o volume de dados e o nível de apoio desejado.",
    )
    story.append(heading("Incluído nesta proposta"))
    story += bullet_list([
        "Licença de uso da plataforma no plano selecionado.",
        "Criação da conta e configuração inicial do perfil do locador.",
        "Orientação de início para cadastro de imóveis, inquilinos e contratos.",
        "Acesso aos módulos disponíveis no plano e às atualizações da versão contratada.",
        "[INSERIR ESCOPO DE TREINAMENTO / MIGRAÇÃO / SUPORTE].",
    ])
    story.append(heading("Não incluído"))
    story += bullet_list([
        "Serviço jurídico, contábil, fiscal ou elaboração/assinatura de contratos.",
        "Gateway de pagamento, conciliação bancária ou confirmação automática de PIX.",
        "Envio automático de WhatsApp, notificações ou régua de cobrança.",
        "Integrações personalizadas ou migração de dados não descritas no escopo.",
        "Garantia de redução de inadimplência ou de resultado financeiro específico.",
    ])
    story.append(callout("Responsabilidade compartilhada", "O cliente valida os cadastros, registra recebimentos, mantém dados de contato atualizados e define quem pode acessar a conta.", fill=BLUE_SOFT, accent=BLUE))
    story.append(PageBreak())

    story += section_start(
        "04  PLANOS",
        "Escolha compatível com a carteira",
        "Os limites abaixo vêm da configuração atual do produto. Valores, periodicidade e política comercial precisam ser preenchidos antes do envio.",
    )
    plan_rows = [
        ["Gratuito", "1", "50 MB", "R$ 0,00 / conforme política vigente"],
        ["Básico", "3", "1 GB", "[INSERIR VALOR E PERIODICIDADE]"],
        ["Premium", "100", "10 GB", "[INSERIR VALOR E PERIODICIDADE]"],
    ]
    story.append(standard_table(["Plano", "Imóveis", "Armazenamento", "Investimento"], plan_rows, [31 * mm, 27 * mm, 31 * mm, CONTENT_W - 89 * mm], row_fills={1: BRASS_SOFT}))
    story.append(heading("Plano recomendado"))
    story.append(P("[PLANO] - recomendado com base em [NÚMERO DE IMÓVEIS], [VOLUME DE ARQUIVOS] e [NÚMERO DE USUÁRIOS]."))
    story.append(heading("Condições comerciais"))
    story.append(metadata_grid(
        [("Investimento", "[R$ / PERÍODO]"), ("Pagamento", "[FORMA E VENCIMENTO]"), ("Reajuste", "[ÍNDICE / REGRA]")],
        [("Ativação", "[PRAZO]"), ("Cancelamento", "[POLÍTICA]"), ("Validade", "[DATA / DIAS]")],
    ))
    story.append(callout("Antes de enviar", "Substitua todos os campos entre colchetes. Não publique preço, política de cancelamento ou prazo de ativação sem validação comercial.", fill=RUST_SOFT, accent=RUST))
    story.append(PageBreak())

    story += section_start(
        "05  IMPLANTAÇÃO",
        "Próximos passos claros",
        "A ativação final depende do escopo de apoio e das informações que o cliente fornecer.",
    )
    story += numbered_list([
        "Aprovação da proposta e confirmação das condições comerciais.",
        "Criação ou validação da conta do responsável.",
        "Configuração de perfil, PIX e preferências operacionais.",
        "Cadastro ou importação assistida do escopo acordado.",
        "Orientação dos fluxos essenciais e validação de acesso.",
        "Início da operação e acompanhamento conforme plano de suporte.",
    ])
    story.append(heading("Cronograma"))
    timeline = [
        ["Preparação", "Conta e configurações", "[PRAZO]"],
        ["Organização", "Cadastros do escopo", "[PRAZO]"],
        ["Orientação", "Sessão de início", "[PRAZO]"],
        ["Operação", "Acompanhamento acordado", "[PRAZO]"],
    ]
    story.append(standard_table(["Etapa", "Entrega", "Prazo"], timeline, [45 * mm, 74 * mm, CONTENT_W - 119 * mm], first_col_fill=BRASS_SOFT))
    story.append(Spacer(1, 7))
    story.append(callout("Pendência a preencher", "Defina prazo de ativação, quantidade de encontros, canal/horário de suporte e responsabilidades de migração antes de enviar esta proposta.", fill=RUST_SOFT, accent=RUST))
    story.append(PageBreak())

    story += section_start(
        "06  CONFIANÇA",
        "Como os dados são tratados no produto",
        "O aplicativo utiliza separação por conta e políticas de acesso no banco; a comunicação deve permanecer precisa e sem alegar certificações não verificadas.",
    )
    story += bullet_list([
        "Dados operacionais separados por proprietário e perfis de acesso.",
        "Arquivos privados entregues por links temporários quando autorizados.",
        "Backup manual exportável e snapshots diários conforme a configuração atual.",
        "Portal do inquilino em modo de consulta, limitado aos dados e documentos liberados.",
        "Consulta offline da última cópia disponível no aparelho; alterações exigem internet.",
    ])
    story.append(heading("Observações"))
    story.append(P("A solução não deve ser apresentada como certificada em LGPD, inviolável ou disponível sem interrupção. Termos de uso, aviso de privacidade e responsabilidades contratuais devem passar por revisão jurídica antes da comercialização em escala."))
    story.append(heading("Suporte"))
    story.append(callout("Campo comercial", "Canal: [E-MAIL / WHATSAPP]  •  Horário: [JANELA]  •  Prazo inicial de resposta: [SLA]  •  Escopo: [DESCREVER].", fill=RUST_SOFT, accent=RUST))
    story.append(PageBreak())

    story += section_start(
        "07  ACEITE",
        "Vamos organizar sua carteira?",
        "Após o preenchimento dos campos comerciais, este documento estará pronto para assinatura e início do processo de ativação.",
    )
    story.append(callout("Ação recomendada", "Agendar uma demonstração guiada e validar o plano adequado ao número de imóveis e ao volume de arquivos."))
    story.append(heading("Aceite da proposta"))
    labels = [
        ["Cliente / Razão social", "CPF / CNPJ"],
        ["Nome do responsável", "Cargo / função"],
        ["Assinatura", "Data"],
        ["Plano selecionado", "Condição comercial"],
    ]
    accept_data = [[P(label, "small") for label in row] for row in labels]
    accept = Table(accept_data, colWidths=[CONTENT_W / 2, CONTENT_W / 2], rowHeights=[27 * mm] * 4, hAlign="LEFT")
    accept.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CARD),
        ("GRID", (0, 0), (-1, -1), 0.55, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(accept)
    story.append(heading("Contato"))
    story.append(
        qr_contact_block(
            "Abrir o aplicativo",
            f"E-mail: {EMAIL}\nAplicativo: {APP_URL}\nWhatsApp: [INSERIR NÚMERO COM DDD]",
        )
    )
    story.append(Rule())
    centered = ParagraphStyle("centeredClose", parent=STYLES["lead"], alignment=TA_CENTER, fontSize=10.5, leading=13)
    story.append(Paragraph("Aluguel - cada aluguel no lugar certo.", centered))

    document(output, "Proposta comercial - Aluguel").build(story, onFirstPage=page_background, onLaterPages=page_background)
    return output


if __name__ == "__main__":
    manual = build_brand_manual()
    proposal = build_proposal()
    print(manual)
    print(proposal)
