# ocr-service

Dịch vụ Python đọc văn bản cho quy trình xử lý văn bản bản 2 (Docling + VietOCR), phụ trách B2–B6:

| Bước | Việc | Công cụ |
| --- | --- | --- |
| B2 | Nhận loại tệp, phân loại từng trang PDF: có lớp chữ, scan, lớp chữ hỏng phông | pypdfium2, kiểm tra âm tiết tiếng Việt |
| B3 | Chuẩn bị ảnh: nắn phối cảnh ảnh chụp, xoay thẳng, làm phẳng nền, gỡ con dấu đỏ | OpenCV |
| B4 | Tìm dòng, đọc dòng, so hai bộ đọc, kiểm tra âm tiết, gắn cờ `can_ra_soat` | RapidOCR (tìm dòng, bộ đọc thứ hai PP-OCRv5 latin), VietOCR (bộ đọc chính) |
| B5 | Bảng: lưới ô bằng TableFormer, đọc lại từng ô bằng VietOCR, đếm mực ô đánh dấu, lưới dự phòng từ đường kẻ | Docling, OpenCV |
| B6 | Gom mọi nhánh về một cấu trúc tài liệu: phần tử theo thứ tự đọc, bbox, độ tin cậy, bộ đọc, cờ, hai bản đọc | Docling |

B7 (chia đoạn theo mục, `heading_path`) chạy ở API vì cần nhìn cả văn bản, còn ocr-service trả kết quả theo lô trang.

Trang có lớp chữ, Word và Excel đi thẳng B2 → B6, không OCR. Chỉ trang scan, trang lớp chữ hỏng, ảnh và ảnh nhúng
trong Word mới qua B3–B5. Word/Excel 97–2003 (`.doc`, `.xls`) được LibreOffice đổi sang `.docx`, `.xlsx` trước.

## API

Chỉ mở trong mạng Docker nội bộ `ocr_internal` (không ra được Internet, không mở cổng ra máy chủ).

- `GET /health`: `{"status": "ok" | "degraded", "error": …}`. `degraded` khi mô hình đang nạp hoặc nạp lỗi; API chỉ gửi việc khi `status` là `ok`.
- `POST /inspect` (multipart `file`, `filename`): loại tệp, số trang, loại từng trang. Nhanh, không OCR.
- `POST /parse?pages=1-8` (multipart `file`, `filename`): tài liệu có cấu trúc của các trang yêu cầu.

Kết quả `/parse`:

```json
{
  "parser": { "name": "ocr-service", "version": "1.0.0", "docling": "2.139.0", "secondReader": "rapidocr", "dpi": 216 },
  "kind": "pdf",
  "pageCount": 12,
  "pages": [{
    "page": 3, "kind": "scan", "ocrUsed": true, "ocrConfidence": 0.91, "angle": 0.4, "text": "…",
    "spans": [[0.1, 0.12, 0.8, 0.14, "dòng chữ"]],
    "elements": [{
      "id": "p3-e7", "type": "list_item", "text": "(9) Tỷ lệ người dân tham gia bảo hiểm y tế đạt 95%.",
      "bbox": [0.1, 0.3, 0.9, 0.33], "confidence": 0.62, "source": "merged", "flags": ["can_ra_soat"],
      "readings": [{ "text": "…", "vietocr": "…", "second": "…", "invalidSyllables": ["GIÁY"] }]
    }]
  }],
  "warnings": [],
  "elapsedMs": 8123
}
```

`type` là `heading`, `paragraph`, `list_item`, `table` (kèm `table.cells` có hàng, cột, gộp ô, bbox, cờ từng ô),
`form_field` (ô biểu mẫu cố định đã khớp mẫu) hoặc `stamp` (vị trí con dấu đã gỡ).

## Bật trong docker-compose

Dịch vụ nằm trong profile `ocr`, mặc định không chạy. Thêm vào `.env`:

```
COMPOSE_PROFILES=ocr
OCR_SERVICE_URL=http://ocr:8000
```

Không có `OCR_SERVICE_URL`, hoặc ocr-service chưa nạp xong mô hình, hoặc lỗi giữa chừng, API tự dùng bộ đọc dự phòng
(pdf.js + Tesseract) cho văn bản đó và ghi rõ trên lượt xử lý. Văn bản đã đọc bằng bộ dự phòng có thể đọc lại bằng nút
**Đọc lại** trong trang văn bản sau khi bật ocr-service.

Build image tải sẵn mọi mô hình (bố cục và TableFormer của Docling, VietOCR `vgg_transformer`, PP-OCRv5 latin của
RapidOCR) nên cần Internet lúc build. Khi chạy, `HF_HUB_OFFLINE=1` và mạng `internal` chặn mọi kết nối ra ngoài.

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `OCR_DPI` | 216 | Độ phân giải render trang scan để OCR |
| `OCR_MIN_TEXT_CHARS` | 24 | Trang ít ký tự hơn thì coi là scan |
| `OCR_MIN_SYLLABLE_RATIO` | 0.6 | Tỷ lệ âm tiết tiếng Việt hợp lệ tối thiểu; thấp hơn là lớp chữ hỏng phông, phải OCR |
| `OCR_MAX_DISAGREEMENT` | 0.10 | Hai bộ đọc khác nhau hơn ngưỡng này thì dòng mang cờ `can_ra_soat` |
| `OCR_SECOND_READER` | rapidocr | Giá trị khác `rapidocr` (vd `none`) tắt bộ đọc thứ hai: nhanh hơn nhưng mất cờ so hai bộ đọc |
| `OCR_TABLE_MODE` | accurate | `fast` cho TableFormer nhanh hơn |
| `OCR_THREADS` | 4 trong compose (0 = để thư viện tự chọn) | Số luồng CPU cho PyTorch và ONNX Runtime |
| `OCR_FORMS_DIR` | `ocr_service/forms` | Thư mục mẫu biểu mẫu cố định (xem `ocr_service/forms/README.md`) |
| `VIETOCR_WEIGHTS_URL` | trọng số gốc | Lúc build: trỏ tới trọng số VietOCR đã fine-tune |

## Chạy test

```
pip install -r requirements.txt -r requirements-dev.txt
OCR_SKIP_WARMUP=1 python -m pytest
```

Test dùng RapidOCR thật cho bước tìm dòng và giả lập VietOCR, nên chạy được khi chưa có PyTorch và trọng số VietOCR.
Đường đi đầy đủ (Docling + VietOCR trên PDF scan) cần image Docker.

## Chưa đo trên dữ liệu thật

CER của VietOCR + luật gộp trên dataset1 (so với 44,67% của bản cũ), chất lượng TableFormer trên trang 4–5 của
dataset1, thời gian mỗi trang trên CPU của máy chủ và dung lượng image. Ngưỡng `OCR_MAX_DISAGREEMENT` và
`OCR_MIN_SYLLABLE_RATIO` là giá trị khởi điểm.
