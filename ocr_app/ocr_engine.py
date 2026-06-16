"""
OCR processing using EasyOCR.
Falls back to Claude Vision API when confidence is low.
"""

import os
import sys
import io
from pathlib import Path

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

_reader = None


def _get_reader():
    """Lazily initialise EasyOCR reader on first call."""
    global _reader
    if _reader is None:
        import easyocr
        kwargs: dict = {"verbose": False}
        model_dir = os.getenv("EASYOCR_MODEL_DIR")
        if model_dir:
            kwargs["model_storage_directory"] = model_dir
        _reader = easyocr.Reader(['ja', 'en'], **kwargs)
    return _reader


def _read_image_as_array(image_path: str):
    """Read image via bytes to avoid cv2 failing on Japanese/Unicode paths on Windows."""
    import numpy as np
    import cv2
    with open(image_path, 'rb') as f:
        buf = np.frombuffer(f.read(), dtype=np.uint8)
    return cv2.imdecode(buf, cv2.IMREAD_COLOR)


def run_easyocr(image_path: str) -> tuple[str, float]:
    """
    Run EasyOCR on an image.
    Returns (full_text, avg_confidence).
    """
    reader = _get_reader()
    img = _read_image_as_array(image_path)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")
    results = reader.readtext(img)

    if not results:
        return "", 0.0

    lines = []
    confidences = []
    for (_, text, conf) in results:
        lines.append(text)
        confidences.append(conf)

    full_text = '\n'.join(lines)
    avg_conf = sum(confidences) / len(confidences)
    return full_text, avg_conf


def run_claude_vision(image_path: str, api_key: str) -> str:
    """
    Use Claude Vision API when EasyOCR confidence is low.
    Extracts device name and prices with structured output.
    """
    import anthropic
    import base64

    with open(image_path, "rb") as f:
        image_data = base64.standard_b64encode(f.read()).decode("utf-8")

    suffix = Path(image_path).suffix.lower()
    media_type_map = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }
    media_type = media_type_map.get(suffix, "image/jpeg")

    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-opus-4-8",
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_data,
                        },
                    },
                    {
                        "type": "text",
                        "text": (
                            "この画像に表示されているスマートフォンの機種名と金額をすべて読み取ってください。\n"
                            "以下の形式で出力してください（該当するものがない場合は空欄）：\n\n"
                            "機種名: [機種名]\n"
                            "金額: [金額（数字のみ）]円\n\n"
                            "複数ある場合はすべて列挙してください。"
                        )
                    }
                ],
            }
        ],
    )
    return message.content[0].text


def process_image(image_path: str, api_key: str | None = None, confidence_threshold: float = 0.5) -> dict:
    """
    Process an image with OCR.
    If api_key is provided, uses Claude Vision directly (no EasyOCR — avoids 2 GB RAM load).
    Falls back to EasyOCR only when no api_key is set (local use without API key).
    """
    if api_key:
        claude_text = run_claude_vision(image_path, api_key)
        return {"raw_text": claude_text, "engine": "claude", "confidence": None}

    # EasyOCR fallback (local deployment, no API key)
    text, confidence = run_easyocr(image_path)
    return {"raw_text": text, "engine": "easyocr", "confidence": round(confidence, 3)}
