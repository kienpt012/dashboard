"""Tạo lại ocr_service/data/syllables.txt.

Cách chạy (từ thư mục services/ocr):
    curl -o /tmp/vi_50k.txt https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/vi/vi_50k.txt
    python scripts/build_syllables.py /tmp/vi_50k.txt
"""

from __future__ import annotations

import glob
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
sys.path.insert(0, str(ROOT))

from ocr_service.vietnamese import _OLD_STYLE, is_wellformed_syllable, nfc  # noqa: E402

MIN_COUNT = 3


def accented(word: str) -> bool:
    return any(ord(ch) > 0x7F for ch in word)


def main(frequency_file: str) -> None:
    lexicon: set[str] = set()
    for line in Path(frequency_file).read_text(encoding="utf-8").splitlines():
        parts = line.split()
        if len(parts) != 2:
            continue
        word, count = nfc(parts[0].lower()), int(parts[1])
        if count >= MIN_COUNT and word.isalpha():
            lexicon.add(word)

    try:
        import pypdfium2 as pdfium

        for path in glob.glob(str(REPO / "apps/api/prisma/demo/tep/*.pdf")):
            pdf = pdfium.PdfDocument(path)
            for page in pdf:
                text = page.get_textpage().get_text_range()
                lexicon.update(nfc(token.lower()) for token in re.findall(r"[^\W\d_]+", text))
    except ImportError:
        print("Không có pypdfium2: bỏ qua văn bản mẫu", file=sys.stderr)

    for path in glob.glob(str(REPO / "apps/api/src/templates/*.ts")):
        text = Path(path).read_text(encoding="utf-8")
        lexicon.update(nfc(token.lower()) for token in re.findall(r"[^\W\d_]+", text))

    lexicon = {word for word in lexicon if accented(word) and is_wellformed_syllable(word)}
    variants = set()
    for word in lexicon:
        for old, new in _OLD_STYLE.items():
            if word.endswith(old):
                variants.add(word[: -len(old)] + new)
            if word.endswith(new):
                variants.add(word[: -len(new)] + old)
    lexicon |= {word for word in variants if is_wellformed_syllable(word)}

    out = ROOT / "ocr_service/data/syllables.txt"
    with out.open("w", encoding="utf-8") as handle:
        handle.write("# Âm tiết tiếng Việt có dấu thường dùng, mỗi dòng một âm tiết (chữ thường, NFC).\n")
        handle.write("# Nguồn: xem data/README.md. Tạo lại bằng scripts/build_syllables.py.\n")
        for word in sorted(lexicon):
            handle.write(word + "\n")
    print(f"Đã ghi {len(lexicon)} âm tiết vào {out}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Cách dùng: python scripts/build_syllables.py vi_50k.txt")
    main(sys.argv[1])
