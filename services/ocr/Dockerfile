# ocr-service: B2–B6 của quy trình xử lý văn bản (Docling + RapidOCR + VietOCR + OpenCV).
# Mô hình được tải sẵn lúc build; khi chạy, container không cần và không được ra Internet.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DOCLING_ARTIFACTS_PATH=/models/docling \
    VIETOCR_CONFIG=/models/vietocr/config.yml \
    VIETOCR_WEIGHTS=/models/vietocr/vgg_transformer.pth \
    RAPIDOCR_MODEL_DIR=/models/rapidocr \
    HF_HOME=/models/hf \
    OMP_NUM_THREADS=4

# LibreOffice chỉ dùng để đổi .doc, .xls cũ sang .docx, .xlsx. libgl không cần vì dùng opencv headless.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libreoffice-writer-nogui libreoffice-calc-nogui fonts-dejavu-core libglib2.0-0 curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY services/ocr/requirements.txt ./requirements.txt
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch==2.14.1 torchvision==0.29.1 \
 && pip install -r requirements.txt \
 && pip install --no-deps vietocr==0.3.13

COPY services/ocr/scripts ./scripts
COPY services/ocr/ocr_service ./ocr_service
RUN python scripts/download_models.py

# Từ đây không tải gì thêm: Hugging Face và RapidOCR chỉ đọc mô hình đã có.
ENV HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1

RUN useradd --create-home --uid 10001 ocr && chown -R ocr /models
USER ocr
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=5 \
  CMD curl -fsS http://127.0.0.1:8000/health | grep -q '"status":"ok"' || exit 1
CMD ["uvicorn", "ocr_service.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
