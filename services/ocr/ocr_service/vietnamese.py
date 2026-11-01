"""Xử lý chữ tiếng Việt dùng chung cho B4 (luật gộp, kiểm tra âm tiết) và B7 (chuẩn hóa).

Kiểm tra âm tiết có hai tầng:
1. Cấu trúc: âm đầu + vần + thanh phải ghép được theo chính tả tiếng Việt
   (ví dụ "ngh" chỉ đứng trước i, e, ê; vần tắc c/ch/p/t chỉ đi với thanh sắc hoặc nặng).
2. Từ điển: âm tiết phải có trong danh sách âm tiết thường dùng (data/syllables.txt).
   Tầng này bắt được lỗi OCR vẫn đúng cấu trúc, như "GIÁY" thay cho "GIẤY".

Bước này chỉ báo lỗi, không tự sửa chữ.
"""

from __future__ import annotations

import os
import re
import unicodedata
from difflib import SequenceMatcher
from functools import lru_cache
from pathlib import Path

TONE_MARKS = {
    "̀": "huyen",
    "́": "sac",
    "̉": "hoi",
    "̃": "nga",
    "̣": "nang",
}

ONSETS = (
    "ngh", "ng", "nh", "ch", "gh", "gi", "kh", "ph", "qu", "th", "tr",
    "b", "c", "d", "đ", "g", "h", "k", "l", "m", "n", "p", "r", "s", "t", "v", "x", "",
)

_OPEN_RHYMES = """
a e ê i y o ô ơ u ư
ai ao au âu ay ây eo êu ia iu oa oe oi ôi ơi ua ui uê uơ uy ưa ưi ưu ươ
iêu yêu oai oay oao oeo uây uôi ươi ươu uyu uya ya
"""

_CLOSED_RHYMES = """
ac ach am an ang anh ap at
ăc ăm ăn ăng ăp ăt
âc âm ân âng âp ât
ec em en eng ep et
êch êm ên ênh êp êt
ich im in inh ip it
oc om on ong op ot ooc oong
ôc ôm ôn ông ôp ôt
ơc ơm ơn ơp ơt
uc um un ung up ut
ưc ưm ưn ưng ưt
iêc iêm iên iêng iêp iêt
yêm yên yêt
uôc uôm uôn uông uôt
ươc ươm ươn ương ươp ươt
oac oach oam oan oang oanh oap oat
oăc oăm oăn oăng oăt
oen oet oeng
uân uâng uât
uêch uênh uên
uych uynh uyt uyn uyp
uyên uyêt
"""

RHYMES = frozenset(_OPEN_RHYMES.split()) | frozenset(_CLOSED_RHYMES.split())
STOP_CODAS = ("ch", "c", "p", "t")
# Âm đầu viết k/gh/ngh trước nguyên âm hàng trước.
FRONT_VOWELS = ("i", "y", "e", "ê", "iê", "yê")

SYLLABLE_TOKEN = re.compile(r"[^\W\d_]+", re.UNICODE)
_DATA_DIR = Path(__file__).resolve().parent / "data"


def nfc(text: str) -> str:
    return unicodedata.normalize("NFC", text)


def split_tone(syllable: str) -> tuple[str, str | None, bool]:
    """Tách thanh khỏi âm tiết. Trả về (âm tiết không thanh, thanh, có nhiều hơn một dấu thanh)."""
    decomposed = unicodedata.normalize("NFD", syllable.lower())
    tones = [TONE_MARKS[ch] for ch in decomposed if ch in TONE_MARKS]
    bare = "".join(ch for ch in decomposed if ch not in TONE_MARKS)
    return unicodedata.normalize("NFC", bare), (tones[0] if tones else None), len(tones) > 1


def strip_diacritics(text: str) -> str:
    """Bỏ mọi dấu (thanh và mũ, móc, trăng), đổi đ thành d. Dùng cho so sánh hai bản đọc."""
    decomposed = unicodedata.normalize("NFD", text)
    stripped = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    return stripped.replace("đ", "d").replace("Đ", "D")


def _tone_ok(rhyme: str, tone: str | None) -> bool:
    # Vần kết thúc bằng phụ âm tắc (c, ch, p, t) chỉ mang thanh sắc hoặc nặng.
    return not rhyme.endswith(STOP_CODAS) or tone in ("sac", "nang")


def _rhyme_ok(onset: str, rhyme: str, tone: str | None) -> bool:
    if onset == "gi":
        # "gi" dùng chung chữ i với vần: gìn = gi + in, giếng = gi + iêng, giữ = gi + ư.
        shared = "i" + rhyme
        if rhyme == "":
            return True
        if shared in RHYMES and not rhyme.startswith(("i", "y")):
            return _tone_ok(shared, tone)
        return rhyme in RHYMES and not rhyme.startswith(("i", "y")) and _tone_ok(rhyme, tone)
    if rhyme not in RHYMES or not _tone_ok(rhyme, tone):
        return False
    front = rhyme.startswith(FRONT_VOWELS)
    if onset in ("c", "g", "ng") and front:
        return False
    if onset in ("k", "gh", "ngh") and not front:
        return False
    if onset == "qu" and rhyme[0] in "uoôư":
        return False
    return True


def is_wellformed_syllable(token: str) -> bool:
    """Âm tiết có ghép được theo chính tả tiếng Việt không (không xét có nghĩa hay không)."""
    bare, tone, multi_tone = split_tone(token)
    if multi_tone or not bare:
        return False
    if not all(ch.isalpha() for ch in bare):
        return False
    for onset in ONSETS:
        if not bare.startswith(onset):
            continue
        rhyme = bare[len(onset):]
        if onset != "gi" and rhyme == "":
            continue
        if _rhyme_ok(onset, rhyme, tone):
            return True
    return False


@lru_cache(maxsize=1)
def syllable_lexicon() -> frozenset[str]:
    paths = [_DATA_DIR / "syllables.txt"]
    extra = os.environ.get("OCR_EXTRA_SYLLABLES")
    if extra:
        paths.append(Path(extra))
    words = set()
    for path in paths:
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            word = line.strip()
            if word and not word.startswith("#"):
                words.add(nfc(word.lower()))
    return frozenset(words)


def _looks_vietnamese(token: str) -> bool:
    return any(ord(ch) > 0x7F for ch in token)


def _skip_token(token: str, raw_context: str) -> bool:
    # Bỏ qua chữ viết tắt toàn hoa không dấu (UBND, HĐND đã có dấu nhưng ngắn), mã, email, tên riêng nước ngoài.
    if len(token) == 1:
        return True
    if token.isupper() and len(token) <= 6 and not is_wellformed_syllable(token):
        return True
    if "@" in raw_context or "://" in raw_context:
        return True
    return False


def invalid_syllables(text: str) -> list[str]:
    """Các âm tiết không hợp lệ trong một dòng: sai cấu trúc, hoặc có dấu mà không có trong từ điển.

    Chữ không dấu không có trong từ điển được bỏ qua để không gắn cờ tên riêng, từ tiếng Anh.
    """
    lexicon = syllable_lexicon()
    bad: list[str] = []
    for raw in re.split(r"\s+", text):
        if not raw:
            continue
        if any(ch.isdigit() for ch in raw) or "@" in raw:
            continue
        for match in SYLLABLE_TOKEN.finditer(raw):
            token = match.group(0)
            if _skip_token(token, raw):
                continue
            lowered = nfc(token.lower())
            accented = _looks_vietnamese(lowered)
            if accented and not is_wellformed_syllable(lowered):
                bad.append(token)
            elif accented and lexicon and lowered not in lexicon:
                bad.append(token)
    return bad


# ---------------------------------------------------------------------------
# Chuẩn hóa vị trí dấu thanh: "hoà" → "hòa", "thuỷ" → "thủy" (kiểu đặt dấu trong văn bản hành chính).

_OLD_STYLE = {
    "oà": "òa", "oá": "óa", "oả": "ỏa", "oã": "õa", "oạ": "ọa",
    "oè": "òe", "oé": "óe", "oẻ": "ỏe", "oẽ": "õe", "oẹ": "ọe",
    "uỳ": "ùy", "uý": "úy", "uỷ": "ủy", "uỹ": "ũy", "uỵ": "ụy",
}
_OLD_STYLE_RE = re.compile(r"(?<![qQ])(" + "|".join(_OLD_STYLE) + r")(?![\w])", re.IGNORECASE)


def normalize_tone_placement(text: str) -> str:
    """Thống nhất kiểu đặt dấu cho vần mở oa, oe, uy. Không đụng tới từ chứa số, mã, email."""

    def fix_word(word: str) -> str:
        if any(ch.isdigit() for ch in word) or "@" in word or "/" in word:
            return word

        def repl(match: re.Match[str]) -> str:
            found = match.group(0)
            target = _OLD_STYLE[found.lower()]
            return target.upper() if found.isupper() else (target[0].upper() + target[1:] if found[0].isupper() else target)

        return _OLD_STYLE_RE.sub(repl, word)

    return " ".join(fix_word(word) for word in nfc(text).split(" "))


def normalize_text(text: str) -> str:
    """NFC, bỏ ký tự vô hình, gộp khoảng trắng. Giữ nguyên số, ngày, mã."""
    cleaned = nfc(text).replace(" ", " ")
    cleaned = re.sub(r"[​-‍﻿]", "", cleaned)
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    return cleaned.strip()


# ---------------------------------------------------------------------------
# Luật gộp hai bản đọc (B4)

PUNCT_FROM_SECOND = set("–—-“”\"‘’'")


def disagreement(first: str, second: str) -> float:
    """Tỉ lệ lệch giữa phần chữ đã bỏ dấu của hai bản đọc (0 = giống hệt, 1 = khác hoàn toàn)."""
    a = re.sub(r"\s+", " ", strip_diacritics(first).lower()).strip()
    b = re.sub(r"\s+", " ", strip_diacritics(second).lower()).strip()
    if not a and not b:
        return 0.0
    if not a or not b:
        return 1.0
    return 1.0 - SequenceMatcher(None, a, b, autojunk=False).ratio()


def restore_punctuation(primary: str, second: str) -> str:
    """VietOCR hay đọc dấu gạch nối dài và ngoặc kép cong thành "?": lấy lại ký tự đó từ bản đọc thứ hai."""
    if "?" not in primary:
        return primary
    a = strip_diacritics(primary)
    b = strip_diacritics(second)
    chars = list(primary)
    matcher = SequenceMatcher(None, a, b, autojunk=False)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag != "replace" or (i2 - i1) != (j2 - j1):
            continue
        for offset in range(i2 - i1):
            if a[i1 + offset] == "?" and second[j1 + offset] in PUNCT_FROM_SECOND:
                chars[i1 + offset] = second[j1 + offset]
    return "".join(chars)


def merge_readings(primary: str, second: str | None, max_disagreement: float = 0.10) -> dict:
    """Gộp bản đọc VietOCR (chính) với bản đọc thứ hai.

    - Lệch không quá 10% (sau khi bỏ dấu): lấy VietOCR, vá các dấu "?" từ bản thứ hai.
    - Lệch hơn: vẫn lấy VietOCR, giữ cả hai bản và gắn cờ cần rà soát.
    - VietOCR rỗng mà bản thứ hai có chữ: lấy bản thứ hai, gắn cờ.
    """
    primary = normalize_text(primary or "")
    second_text = normalize_text(second) if second is not None else None
    flags: list[str] = []
    if second_text is None:
        return {"text": primary, "source": "vietocr", "flags": flags, "disagreement": None}
    if not primary and second_text:
        return {"text": second_text, "source": "paddle", "flags": ["can_ra_soat", "chi_co_ban_doc_thu_hai"], "disagreement": 1.0}
    gap = disagreement(primary, second_text)
    if gap <= max_disagreement:
        repaired = restore_punctuation(primary, second_text)
        return {"text": repaired, "source": "merged" if repaired != primary else "vietocr", "flags": flags, "disagreement": round(gap, 3)}
    flags.extend(["can_ra_soat", "hai_ban_doc_lech"])
    return {"text": primary, "source": "vietocr", "flags": flags, "disagreement": round(gap, 3)}


def syllable_flags(text: str) -> tuple[list[str], list[str]]:
    bad = invalid_syllables(text)
    return (["can_ra_soat", "am_tiet_khong_hop_le"], bad) if bad else ([], [])
