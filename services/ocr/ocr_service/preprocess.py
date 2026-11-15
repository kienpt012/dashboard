"""B3. Chuẩn bị ảnh trước khi phân tích bố cục và đọc chữ: nắn phối cảnh ảnh chụp, xoay thẳng, làm phẳng nền,
lọc mực đỏ con dấu (giữ lại khung con dấu để ghi thành vùng stamp, không đọc chữ trong đó)."""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np
from PIL import Image

MAX_SKEW_DEGREES = 5.0


@dataclass
class PreparedImage:
    image: Image.Image
    angle: float = 0.0
    perspective_fixed: bool = False
    # Khung con dấu, chuẩn hóa 0..1 gốc trên trái: [x0, y0, x1, y1].
    stamps: list[list[float]] = field(default_factory=list)


def to_bgr(image: Image.Image) -> np.ndarray:
    return cv2.cvtColor(np.asarray(image.convert("RGB")), cv2.COLOR_RGB2BGR)


def to_pil(bgr: np.ndarray) -> Image.Image:
    return Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))


def correct_perspective(bgr: np.ndarray) -> tuple[np.ndarray, bool]:
    """Ảnh chụp điện thoại: tìm mép giấy (tứ giác lớn nhất chiếm trên 40% ảnh) và nắn về hình chữ nhật."""
    height, width = bgr.shape[:2]
    scale = 1000.0 / max(height, width)
    small = cv2.resize(bgr, None, fx=scale, fy=scale) if scale < 1 else bgr.copy()
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(gray, 50, 150)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=2)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    area_total = small.shape[0] * small.shape[1]
    for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:5]:
        if cv2.contourArea(contour) < 0.4 * area_total:
            break
        approx = cv2.approxPolyDP(contour, 0.02 * cv2.arcLength(contour, True), True)
        if len(approx) != 4:
            continue
        points = approx.reshape(4, 2).astype(np.float32) / (scale if scale < 1 else 1.0)
        ordered = _order_points(points)
        tl, tr, br, bl = ordered
        out_w = int(max(np.linalg.norm(br - bl), np.linalg.norm(tr - tl)))
        out_h = int(max(np.linalg.norm(tr - br), np.linalg.norm(tl - bl)))
        if out_w < 200 or out_h < 200:
            continue
        # Bỏ qua khi tứ giác gần như trùng khung ảnh: ảnh scan, không cần nắn.
        if out_w > 0.97 * width and out_h > 0.97 * height:
            return bgr, False
        target = np.array([[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]], dtype=np.float32)
        matrix = cv2.getPerspectiveTransform(ordered, target)
        return cv2.warpPerspective(bgr, matrix, (out_w, out_h), borderValue=(255, 255, 255)), True
    return bgr, False


def _order_points(points: np.ndarray) -> np.ndarray:
    sums = points.sum(axis=1)
    diffs = np.diff(points, axis=1).ravel()
    return np.array([points[np.argmin(sums)], points[np.argmin(diffs)], points[np.argmax(sums)], points[np.argmax(diffs)]], dtype=np.float32)


def estimate_skew(gray: np.ndarray) -> float:
    """Góc nghiêng (độ) làm phương sai chiếu ngang lớn nhất, tìm trong khoảng ±5°."""
    height, width = gray.shape[:2]
    scale = 800.0 / max(height, width)
    small = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA) if scale < 1 else gray
    _, binary = cv2.threshold(small, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    if binary.mean() < 1:  # trang trắng
        return 0.0
    center = (binary.shape[1] / 2, binary.shape[0] / 2)
    best_angle, best_score = 0.0, -1.0
    for coarse in np.arange(-MAX_SKEW_DEGREES, MAX_SKEW_DEGREES + 0.01, 0.5):
        score = _projection_score(binary, center, coarse)
        if score > best_score:
            best_angle, best_score = float(coarse), score
    for fine in np.arange(best_angle - 0.5, best_angle + 0.51, 0.1):
        score = _projection_score(binary, center, fine)
        if score > best_score:
            best_angle, best_score = float(fine), score
    return round(best_angle, 2)


def _projection_score(binary: np.ndarray, center, angle: float) -> float:
    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    rotated = cv2.warpAffine(binary, matrix, (binary.shape[1], binary.shape[0]), flags=cv2.INTER_NEAREST, borderValue=0)
    profile = rotated.sum(axis=1, dtype=np.float64)
    return float(np.var(profile))


def rotate(bgr: np.ndarray, angle: float) -> np.ndarray:
    if abs(angle) < 0.1:
        return bgr
    height, width = bgr.shape[:2]
    matrix = cv2.getRotationMatrix2D((width / 2, height / 2), angle, 1.0)
    return cv2.warpAffine(bgr, matrix, (width, height), flags=cv2.INTER_CUBIC, borderValue=(255, 255, 255))


def flatten_background(bgr: np.ndarray) -> np.ndarray:
    """Chia cho nền ước lượng (đóng hình thái học kích thước lớn) để bỏ bóng, vệt ố, nền xám của ảnh chụp."""
    out = np.empty_like(bgr)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (31, 31))
    for channel in range(3):
        plane = bgr[:, :, channel]
        background = cv2.morphologyEx(plane, cv2.MORPH_CLOSE, kernel)
        background = cv2.medianBlur(background, 21)
        normalized = cv2.divide(plane, background, scale=255)
        out[:, :, channel] = normalized
    return out


def red_mask(bgr: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    low = cv2.inRange(hsv, (0, 70, 60), (12, 255, 255))
    high = cv2.inRange(hsv, (165, 70, 60), (180, 255, 255))
    return cv2.bitwise_or(low, high)


def remove_stamps(bgr: np.ndarray) -> tuple[np.ndarray, list[list[float]]]:
    """Tô trắng mực đỏ của con dấu. Chỉ xóa trong các khối đỏ đủ lớn và gần vuông/tròn,
    để chữ đỏ nhỏ (nếu có) không bị xóa nhầm. Trả về ảnh đã lọc và khung con dấu chuẩn hóa."""
    height, width = bgr.shape[:2]
    mask = red_mask(bgr)
    if mask.mean() < 0.05:
        return bgr, []
    grown = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(grown, connectivity=8)
    stamps: list[list[float]] = []
    cleaned = bgr.copy()
    min_area = 0.004 * height * width
    for label in range(1, count):
        x, y, w, h, area = stats[label]
        if area < min_area:
            continue
        ratio = w / max(1, h)
        if not 0.4 <= ratio <= 2.5:
            continue
        region = (labels == label) & (mask > 0)
        cleaned[region] = (255, 255, 255)
        stamps.append([round(x / width, 4), round(y / height, 4), round((x + w) / width, 4), round((y + h) / height, 4)])
    return cleaned, stamps


def prepare_image(image: Image.Image, *, photo: bool = False, flatten: bool | None = None) -> PreparedImage:
    """Chuẩn bị một trang ảnh (trang scan đã render, hoặc ảnh tải lên)."""
    bgr = to_bgr(image)
    perspective_fixed = False
    if photo:
        bgr, perspective_fixed = correct_perspective(bgr)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    angle = estimate_skew(gray)
    bgr = rotate(bgr, angle)
    if flatten if flatten is not None else photo:
        bgr = flatten_background(bgr)
    bgr, stamps = remove_stamps(bgr)
    return PreparedImage(image=to_pil(bgr), angle=angle, perspective_fixed=perspective_fixed, stamps=stamps)
