#!/usr/bin/env python3
"""
CourtCheck PDF Extractor — PyMuPDF based extraction for large SC filings.
Handles 500-1000 page PDFs efficiently with chunked text output.
"""
import fitz  # PyMuPDF
import json
import sys
import os


def extract_pdf(path: str) -> dict:
    if not os.path.exists(path):
        return {"error": f"File not found: {path}"}

    try:
        doc = fitz.open(path)
    except Exception as e:
        return {"error": f"Cannot open PDF: {str(e)}"}

    total_pages = len(doc)
    result = {
        "page_count": total_pages,
        "page_sizes": [],
        "text_by_page": [],
        "text_sample": "",        # first 5 pages
        "last_pages_text": "",    # last 10 pages
        "full_text_chunks": [],   # 10k char chunks for AI processing
        "has_images": False,
        "is_scanned": False,
        "scanned_page_count": 0,  # how many pages have < 100 chars
        "metadata": doc.metadata or {},
        "total_text_chars": 0,
        "error": None
    }

    all_text_parts = []
    chars_per_page = []

    PAGE_TEXT_CAP = 2000  # max chars stored per page to keep JSON size sane

    for i, page in enumerate(doc):
        # Page dimensions (in points, 72pts = 1 inch)
        rect = page.rect
        result["page_sizes"].append({
            "w": round(rect.width, 2),
            "h": round(rect.height, 2)
        })

        # Extract text
        text = page.get_text("text")
        stripped_len = len(text.strip())
        chars_per_page.append(stripped_len)

        # ALL pages: store individually (capped to keep memory sane)
        result["text_by_page"].append({
            "page": i + 1,
            "text": text[:PAGE_TEXT_CAP] if len(text) > PAGE_TEXT_CAP else text,
            "truncated": len(text) > PAGE_TEXT_CAP,
            "char_count": stripped_len
        })

        # First 5 pages: full sample (no cap)
        if i < 5:
            result["text_sample"] += f"\n\n--- PAGE {i + 1} ---\n{text}"

        # Last 10 pages: full (no cap)
        if i >= total_pages - 10:
            result["last_pages_text"] += f"\n\n--- PAGE {i + 1} ---\n{text}"

        all_text_parts.append(text)

    # Check if scanned: < 100 chars per page on average for first 10 pages
    first_10_chars = chars_per_page[:min(10, total_pages)]
    avg_chars = sum(first_10_chars) / len(first_10_chars) if first_10_chars else 0
    result["is_scanned"] = avg_chars < 100

    # Count how many individual pages are below 100 chars (blank or image-only)
    result["scanned_page_count"] = sum(1 for c in chars_per_page if c < 100)

    # Full text from ALL pages (capped per-page, so total stays manageable)
    full_text = "\n".join(p[:PAGE_TEXT_CAP] for p in all_text_parts)
    result["total_text_chars"] = sum(chars_per_page)

    # Split into 10k char chunks for AI processing
    chunk_size = 10000
    result["full_text_chunks"] = [
        full_text[i:i + chunk_size]
        for i in range(0, len(full_text), chunk_size)
    ]

    # Check for images in first 10 pages
    result["has_images"] = any(
        len(doc[i].get_images()) > 0
        for i in range(min(10, total_pages))
    )

    doc.close()
    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.stdout.buffer.write(json.dumps({"error": "Usage: python extract.py <pdf_path>"}).encode('utf-8'))
        sys.exit(1)

    pdf_path = sys.argv[1]
    data = extract_pdf(pdf_path)
    # Write as UTF-8 bytes to avoid Windows encoding issues
    output = json.dumps(data, ensure_ascii=True)
    sys.stdout.buffer.write(output.encode('ascii'))
