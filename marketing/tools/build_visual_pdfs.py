"""Build the visual Priority 1 PDFs from the approved PNG exports.

The page boxes are calculated from each source image's native aspect ratio.
Every PNG is then placed edge-to-edge, with no cropping, margins or scaling
distortion. The same run also publishes the final one-page PNG and the six
WhatsApp cards with descriptive, stable filenames.
"""

from __future__ import annotations

from pathlib import Path
import shutil

from PIL import Image
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


MARKETING_DIR = Path(__file__).resolve().parent.parent

PRESENTATION_RENDERED = MARKETING_DIR / "apresentacao" / "rendered"
ONE_PAGE_RENDERED = MARKETING_DIR / "one-page" / "rendered"
WHATSAPP_RENDERED = MARKETING_DIR / "whatsapp" / "rendered"

PRESENTATION_PDF = (
    MARKETING_DIR / "apresentacao" / "aluguel-apresentacao-comercial.pdf"
)
ONE_PAGE_PDF = MARKETING_DIR / "one-page" / "aluguel-one-page-comercial.pdf"
WHATSAPP_PDF = MARKETING_DIR / "whatsapp" / "aluguel-kit-whatsapp.pdf"

ONE_PAGE_PNG = MARKETING_DIR / "one-page" / "aluguel-one-page.png"
WHATSAPP_CARDS_DIR = MARKETING_DIR / "whatsapp" / "cards"

WHATSAPP_CARD_NAMES = (
    "card-01-seus-alugueis-sob-controle.png",
    "card-02-visao-do-mes.png",
    "card-03-carteira-ao-detalhe.png",
    "card-04-financeiro.png",
    "card-05-portal-do-inquilino.png",
    "card-06-chamada-para-acao.png",
)


def numbered_slides(folder: Path, expected_count: int) -> list[Path]:
    slides = [folder / f"slide-{index:02d}.png" for index in range(1, expected_count + 1)]
    missing = [path for path in slides if not path.is_file()]
    if missing:
        missing_text = ", ".join(str(path) for path in missing)
        raise FileNotFoundError(f"Missing rendered slide(s): {missing_text}")
    return slides


def image_size(path: Path) -> tuple[int, int]:
    with Image.open(path) as source:
        source.verify()
    with Image.open(path) as source:
        return source.size


def build_full_bleed_pdf(
    image_paths: list[Path],
    output_path: Path,
    *,
    page_width_points: float,
    title: str,
    subject: str,
) -> None:
    if not image_paths:
        raise ValueError("At least one image is required.")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    document: canvas.Canvas | None = None

    for page_number, image_path in enumerate(image_paths, start=1):
        width_px, height_px = image_size(image_path)
        page_height_points = page_width_points * height_px / width_px
        page_size = (page_width_points, page_height_points)

        if document is None:
            document = canvas.Canvas(
                str(output_path),
                pagesize=page_size,
                pageCompression=1,
                invariant=1,
            )
            document.setTitle(title)
            document.setSubject(subject)
            document.setAuthor("Aluguel")
            document.setCreator("Aluguel - materiais comerciais")
        else:
            document.setPageSize(page_size)

        document.drawImage(
            ImageReader(str(image_path)),
            0,
            0,
            width=page_width_points,
            height=page_height_points,
            preserveAspectRatio=False,
            mask="auto",
        )
        document.setPageRotation(0)
        document.showPage()

    if document is None:
        raise RuntimeError("PDF canvas was not initialized.")
    document.save()


def publish_png_exports(
    one_page_source: Path,
    whatsapp_sources: list[Path],
) -> None:
    shutil.copy2(one_page_source, ONE_PAGE_PNG)
    WHATSAPP_CARDS_DIR.mkdir(parents=True, exist_ok=True)
    for source, filename in zip(
        whatsapp_sources,
        WHATSAPP_CARD_NAMES,
        strict=True,
    ):
        shutil.copy2(source, WHATSAPP_CARDS_DIR / filename)


def main() -> None:
    presentation_slides = numbered_slides(PRESENTATION_RENDERED, 15)
    one_page_slides = numbered_slides(ONE_PAGE_RENDERED, 1)
    whatsapp_slides = numbered_slides(WHATSAPP_RENDERED, 6)

    build_full_bleed_pdf(
        presentation_slides,
        PRESENTATION_PDF,
        page_width_points=960,
        title="Aluguel - Apresentacao comercial",
        subject="Apresentacao comercial do aplicativo Aluguel",
    )
    build_full_bleed_pdf(
        one_page_slides,
        ONE_PAGE_PDF,
        page_width_points=595,
        title="Aluguel - One-page comercial",
        subject="Resumo comercial do aplicativo Aluguel",
    )
    build_full_bleed_pdf(
        whatsapp_slides,
        WHATSAPP_PDF,
        page_width_points=648,
        title="Aluguel - Kit visual para WhatsApp",
        subject="Kit comercial de seis cards para WhatsApp",
    )

    publish_png_exports(one_page_slides[0], whatsapp_slides)

    outputs = (
        PRESENTATION_PDF,
        ONE_PAGE_PDF,
        WHATSAPP_PDF,
        ONE_PAGE_PNG,
        *[WHATSAPP_CARDS_DIR / name for name in WHATSAPP_CARD_NAMES],
    )
    for output in outputs:
        if not output.is_file() or output.stat().st_size == 0:
            raise RuntimeError(f"Output was not created correctly: {output}")
        print(output.relative_to(MARKETING_DIR))


if __name__ == "__main__":
    main()
