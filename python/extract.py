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
        "metadata": doc.metadata or {},
        "total_text_chars": 0,
        "error": None
    }

    all_text_parts = []
    chars_per_page = []

    for i, page in enumerate(doc):
        # Page dimensions (in points, 72pts = 1 inch)
        rect = page.rect
        result["page_sizes"].append({
            "w": round(rect.width, 2),
            "h": round(rect.height, 2)
        })

        # Extract text
        text = page.get_text("text")
        chars_per_page.append(len(text.strip()))

        # First 50 pages: store individually
        if i < 50:
            result["text_by_page"].append({
                "page": i + 1,
                "text": text
            })

        # First 5 pages: sample
        if i < 5:
            result["text_sample"] += f"\n\n--- PAGE {i + 1} ---\n{text}"

        # Last 10 pages
        if i >= total_pages - 10:
            result["last_pages_text"] += f"\n\n--- PAGE {i + 1} ---\n{text}"

        all_text_parts.append(text)

    # Check if scanned (< 100 chars per page on average for first 10 pages)
    first_10_chars = chars_per_page[:min(10, total_pages)]
    avg_chars = sum(first_10_chars) / len(first_10_chars) if first_10_chars else 0
    result["is_scanned"] = avg_chars < 100

    # Full text (from first 50 pages to keep memory sane on 1000-page docs)
    full_text = "\n".join(all_text_parts[:50])
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
