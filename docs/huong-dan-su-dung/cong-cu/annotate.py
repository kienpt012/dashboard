"""Vẽ khung và huy hiệu số chú thích lên ảnh chụp màn hình cho tài liệu hướng dẫn.

    python annotate.py spec.json

spec.json là một đối tượng hoặc danh sách đối tượng:
    {
      "src": "raw/dh-01.png",            ảnh gốc
      "out": "../anh/dh-01.png",         ảnh kết quả (PNG hoặc JPG)
      "crop": [x, y, w, h],              (tuỳ chọn) cắt vùng sau khi vẽ
      "boxes": [{"n": 1, "rect": [x, y, w, h]}, ...],   toạ độ theo ảnh gốc
      "badge": "tl"                      (tuỳ chọn) vị trí mặc định của huy hiệu: tl, tr, bl, br, t, b, l, r
    }
Mỗi box có thể đặt "badge" riêng hoặc "box": false (chỉ huy hiệu, không khung).
Đường dẫn tương đối tính từ vị trí tệp spec.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

BRAND = (29, 78, 216)
WHITE = (255, 255, 255)
RADIUS = 14  # bán kính huy hiệu (đường kính 28 px)
PAD = 4  # nới khung ra ngoài vùng
FONT_PATH = "C:/Windows/Fonts/segoeuib.ttf"


def font(size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except OSError:
        return ImageFont.load_default()


def badge_center(rect, where: str, size):
    x, y, w, h = rect
    width, height = size
    left, top, right, bottom = x - PAD, y - PAD, x + w + PAD, y + h + PAD
    positions = {
        "tl": (left, top),
        "tr": (right, top),
        "bl": (left, bottom),
        "br": (right, bottom),
        "t": ((left + right) / 2, top - RADIUS - 2),
        "b": ((left + right) / 2, bottom + RADIUS + 2),
        "l": (left - RADIUS - 2, (top + bottom) / 2),
        "r": (right + RADIUS + 2, (top + bottom) / 2),
    }
    cx, cy = positions.get(where, positions["tl"])
    # Giữ trọn huy hiệu trong ảnh.
    cx = min(max(cx, RADIUS + 3), width - RADIUS - 3)
    cy = min(max(cy, RADIUS + 3), height - RADIUS - 3)
    return cx, cy


def annotate(spec: dict, base: Path) -> Path:
    src = (base / spec["src"]).resolve()
    out = (base / spec["out"]).resolve()
    image = Image.open(src).convert("RGBA")
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    placed: list[tuple[float, float]] = []
    default = spec.get("badge", "tl")
    for box in spec.get("boxes", []):
        x, y, w, h = box["rect"]
        if box.get("box", True):
            draw.rounded_rectangle([x - PAD, y - PAD, x + w + PAD, y + h + PAD], radius=8, outline=BRAND + (255,), width=2)
        cx, cy = badge_center(box["rect"], box.get("badge", default), image.size)
        # Né huy hiệu đã đặt.
        for _ in range(6):
            if all((cx - px) ** 2 + (cy - py) ** 2 > (2 * RADIUS + 4) ** 2 for px, py in placed):
                break
            cx += 2 * RADIUS + 6
        placed.append((cx, cy))
        box["_center"] = (cx, cy)
    # Bóng mờ dưới huy hiệu.
    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    for cx, cy in placed:
        shadow_draw.ellipse([cx - RADIUS - 1, cy - RADIUS + 1, cx + RADIUS + 1, cy + RADIUS + 3], fill=(15, 23, 42, 90))
    shadow = shadow.filter(ImageFilter.GaussianBlur(2))
    image = Image.alpha_composite(image, shadow)
    image = Image.alpha_composite(image, overlay)
    draw = ImageDraw.Draw(image)
    label_font = font(15)
    for box in spec.get("boxes", []):
        cx, cy = box["_center"]
        draw.ellipse([cx - RADIUS - 2, cy - RADIUS - 2, cx + RADIUS + 2, cy + RADIUS + 2], fill=WHITE)
        draw.ellipse([cx - RADIUS, cy - RADIUS, cx + RADIUS, cy + RADIUS], fill=BRAND)
        text = str(box["n"])
        left, top, right, bottom = draw.textbbox((0, 0), text, font=label_font)
        draw.text((cx - (right - left) / 2 - left, cy - (bottom - top) / 2 - top), text, font=label_font, fill=WHITE)
    if spec.get("crop"):
        x, y, w, h = spec["crop"]
        image = image.crop((x, y, x + w, y + h))
    out.parent.mkdir(parents=True, exist_ok=True)
    rgb = image.convert("RGB")
    if out.suffix.lower() in (".jpg", ".jpeg"):
        rgb.save(out, quality=90, optimize=True)
    else:
        # Bảng màu 256 giữ chữ sắc nét và giảm dung lượng đáng kể với ảnh giao diện.
        rgb.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(out, optimize=True)
    return out


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    path = Path(sys.argv[1]).resolve()
    data = json.loads(path.read_text(encoding="utf-8"))
    for spec in data if isinstance(data, list) else [data]:
        out = annotate(spec, path.parent)
        print(f"{out.name}: {out.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
