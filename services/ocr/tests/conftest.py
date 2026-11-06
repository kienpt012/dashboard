import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("OCR_SKIP_WARMUP", "1")

DEMO_PDF = REPO / "apps/api/prisma/demo/tep/2f058a86c2caa87a4ffcbe7a9e08a8f6.pdf"
