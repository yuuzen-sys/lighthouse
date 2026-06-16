"""
Fuzzy matching for OCR results against candidate lists.
Normalizes OCR output and candidate names to handle format differences.
"""

import re
import json
from pathlib import Path
from difflib import SequenceMatcher

CANDIDATES_PATH = Path(__file__).parent / "data" / "candidates.json"


def normalize(text: str) -> str:
    """Normalize text for comparison: lowercase, remove separators."""
    text = text.lower()
    text = re.sub(r'[_/\s\-・　]+', '', text)
    text = text.replace('ｇｂ', 'gb').replace('ＧＢ', 'gb')
    text = text.replace('pro', 'pro').replace('ｐｒｏ', 'pro')
    text = text.replace('mini', 'mini').replace('ｍｉｎｉ', 'mini')
    # Convert full-width digits to half-width
    text = text.translate(str.maketrans('０１２３４５６７８９', '0123456789'))
    return text


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, normalize(a), normalize(b)).ratio()


def load_candidates() -> dict:
    with open(CANDIDATES_PATH, encoding='utf-8') as f:
        return json.load(f)


def match_device(ocr_text: str, threshold: float = 0.6) -> list[dict]:
    """
    Match OCR text against all device candidates.
    Returns ranked list of matches with confidence scores.
    """
    candidates = load_candidates()
    results = []

    all_devices = []
    for category, devices in candidates["devices"].items():
        for device in devices:
            all_devices.append({"name": device, "category": category})

    for candidate in all_devices:
        score = similarity(ocr_text, candidate["name"])
        if score >= threshold:
            results.append({
                "name": candidate["name"],
                "category": candidate["category"],
                "score": round(score, 3)
            })

    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:5]


def extract_devices_from_text(full_text: str) -> list[dict]:
    """
    Scan multi-line OCR output and find best device candidates.
    Returns top matches across all text segments.
    """
    lines = [line.strip() for line in full_text.splitlines() if line.strip()]
    all_matches = []

    for line in lines:
        matches = match_device(line)
        all_matches.extend(matches)

    # Deduplicate by name, keep highest score
    seen = {}
    for m in all_matches:
        name = m["name"]
        if name not in seen or m["score"] > seen[name]["score"]:
            seen[name] = m

    ranked = sorted(seen.values(), key=lambda x: x["score"], reverse=True)
    return ranked[:5]


def extract_prices_from_text(full_text: str) -> list[str]:
    """Extract price values from OCR text."""
    patterns = [
        r'¥\s*(\d[\d,，]+)',
        r'(\d[\d,，]+)\s*円',
        r'(\d[\d,，]+)\s*えん',
    ]
    prices = []
    for pattern in patterns:
        for match in re.finditer(pattern, full_text):
            raw = match.group(1).replace(',', '').replace('，', '')
            if len(raw) >= 4:  # filter out tiny numbers
                prices.append(raw)
    return list(dict.fromkeys(prices))  # deduplicate while preserving order
