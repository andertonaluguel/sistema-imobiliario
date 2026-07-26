"""Gera os QR Codes oficiais usados nos materiais de Prioridade 1."""

from pathlib import Path

from PIL import Image, ImageDraw
from reportlab.graphics.barcode import qr


ROOT = Path(__file__).resolve().parent
DESTINATIONS = {
    "app-aluguel": "https://aluguel-casas-anderton.netlify.app",
}


def build_qr(name: str, url: str) -> None:
    widget = qr.QrCodeWidget(url, barLevel="H")
    widget.qr.make()
    modules = widget.qr.modules
    module_count = widget.qr.moduleCount
    border = 4
    box_size = 14
    output_size = (module_count + border * 2) * box_size
    image = Image.new("RGB", (output_size, output_size), "#FFFFFF")
    draw = ImageDraw.Draw(image)
    for row, values in enumerate(modules):
        for column, enabled in enumerate(values):
            if not enabled:
                continue
            x0 = (column + border) * box_size
            y0 = (row + border) * box_size
            draw.rectangle((x0, y0, x0 + box_size - 1, y0 + box_size - 1), fill="#14322A")
    image.save(ROOT / f"qr-{name}.png")

    rects = []
    for row, values in enumerate(modules):
        for column, enabled in enumerate(values):
            if enabled:
                rects.append(f'<rect x="{column + border}" y="{row + border}" width="1" height="1"/>')
    svg_size = module_count + border * 2
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {svg_size} {svg_size}" '
        f'width="{output_size}" height="{output_size}" shape-rendering="crispEdges">'
        '<rect width="100%" height="100%" fill="#FFFFFF"/>'
        '<g fill="#14322A">' + "".join(rects) + '</g></svg>\n'
    )
    (ROOT / f"qr-{name}.svg").write_text(svg, encoding="utf-8")
    (ROOT / f"qr-{name}.txt").write_text(url + "\n", encoding="utf-8")


if __name__ == "__main__":
    for qr_name, destination in DESTINATIONS.items():
        build_qr(qr_name, destination)
