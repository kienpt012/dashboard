from ocr_service.vietnamese import (
    disagreement,
    invalid_syllables,
    is_wellformed_syllable,
    merge_readings,
    normalize_tone_placement,
    restore_punctuation,
    strip_diacritics,
)


def test_wellformed_syllables():
    for word in ["giấy", "nghiêng", "quyết", "định", "khuya", "gìn", "giếng", "thuở", "hoà", "hòa", "ủy", "người", "ước"]:
        assert is_wellformed_syllable(word), word
    for word in ["ngha", "kan", "ghô", "tìc", "quô", "đc", "nh©n"]:
        assert not is_wellformed_syllable(word), word


def test_invalid_syllables_uses_lexicon():
    # "GIÁY" ghép đúng cấu trúc nhưng không phải âm tiết dùng trong tiếng Việt: phải bị bắt.
    assert invalid_syllables("GIÁY CHỨNG NHẬN") == ["GIÁY"]
    assert invalid_syllables("Giấy chứng nhận quyền sử dụng đất") == []


def test_invalid_syllables_skips_codes_numbers_and_plain_ascii():
    assert invalid_syllables("Số 145/QĐ-UBND ngày 15/01/2026, email ubnd@laithieu.gov.vn") == []
    assert invalid_syllables("Smart City IOC dashboard") == []


def test_tone_placement_normalized_but_codes_untouched():
    assert normalize_tone_placement("Cộng hoà xã hội, thuỷ lợi") == "Cộng hòa xã hội, thủy lợi"
    assert normalize_tone_placement("Quý I") == "Quý I"
    assert normalize_tone_placement("mã hoà2026") == "mã hoà2026"


def test_strip_and_disagreement():
    assert strip_diacritics("Đồng Nai") == "Dong Nai"
    assert disagreement("Tỷ lệ hộ nghèo", "Ty le ho ngheo") == 0.0
    assert disagreement("Tỷ lệ hộ nghèo", "Thu ngân sách") > 0.3


def test_merge_takes_vietocr_and_restores_punctuation():
    merged = merge_readings("Giai đoạn 2021 ? 2025", "Giai doan 2021 – 2025")
    assert merged["text"] == "Giai đoạn 2021 – 2025"
    assert merged["source"] == "merged"
    assert merged["flags"] == []
    assert restore_punctuation("?Nông thôn mới?", "“Nong thon moi”") == "“Nông thôn mới”"


def test_merge_flags_large_disagreement():
    merged = merge_readings("Tỷ lệ hộ nghèo", "Thu ngân sách nhà nước")
    assert merged["text"] == "Tỷ lệ hộ nghèo"
    assert "can_ra_soat" in merged["flags"] and "hai_ban_doc_lech" in merged["flags"]


def test_merge_without_second_reader():
    assert merge_readings("Tỷ lệ", None) == {"text": "Tỷ lệ", "source": "vietocr", "flags": [], "disagreement": None}
    assert merge_readings("", "Ty le")["source"] == "paddle"


def test_second_reader_dropping_vietnamese_vowels_is_not_flagged():
    # PP-OCRv5 latin rơi nguyên âm mang dấu; chữ số và phụ âm giữ nguyên thì không phải lệch thật.
    merged = merge_readings("Tỉ lệ hoàn thành cấp THCS đạt 99,2%", "Ti l hohn thnh cp THCS dt 99,2%")
    assert "hai_ban_doc_lech" not in merged["flags"]


def test_different_digits_always_flagged():
    merged = merge_readings("Tỷ lệ tham gia bảo hiểm y tế đạt 95%", "Ty le tham gia bao hiem y te dat 85%")
    assert {"can_ra_soat", "hai_ban_doc_lech", "so_lech"} <= set(merged["flags"])
