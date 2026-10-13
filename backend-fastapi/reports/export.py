"""CSV and PDF export for the dairy reports.

Both exports are built from the SAME report envelope the UI shows (same
filters, same rows, same summary), and both carry the report ID, generated
timestamp, reporting period, active filters and the DEMO DATA notice. The PDF
is written directly (no third-party dependency) — landscape A4, Helvetica,
DEMO DATA watermark and "Page X of Y" on every page.
"""

from __future__ import annotations

import csv
import io
import json
from typing import Any, Dict, List

from .config import DEMO_NOTICE

NOT_TESTED_KEYS = {"fat_pct", "snf_pct", "density_kg_l", "clr", "protein_pct", "lactose_pct", "acidity_pct_la"}


def cell(key: str, v: Any) -> str:
    if v is None:
        return "Not tested" if key in NOT_TESTED_KEYS else ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, list):
        return "; ".join(json.dumps(x, ensure_ascii=False) if isinstance(x, dict) else str(x) for x in v)
    if isinstance(v, dict):
        return json.dumps(v, ensure_ascii=False)
    return str(v)


def flat_rows(env: Dict[str, Any]) -> (List[Dict[str, Any]], List[Dict[str, Any]]):
    """Rows + columns for export. Reports without a table get a key/value table."""
    if env["report"] == "traceability":
        rows = [{"chain": ch["title"], **n} for ch in env["rows"] for n in ch["nodes"]]
        cols = [{"key": k, "label": k.replace("_", " ").title()} for k in ("chain", "stage", "id", "time", "detail", "status")]
        return rows, cols
    if env["columns"] and env["rows"]:
        return env["rows"], env["columns"]
    rows = [{"item": k, "value": cell(k, v)} for k, v in env["summary"].items()]
    return rows, [{"key": "item", "label": "Item"}, {"key": "value", "label": "Value"}]


def header_lines(env: Dict[str, Any]) -> List[str]:
    p = env["period"]
    filters = ", ".join(f"{k}={v}" for k, v in env["filters"].items()) or "none"
    return [
        env["title"], DEMO_NOTICE, f"Report ID: {env['report_id']}", f"Generated: {env['generated_at']}",
        f"Period: {p['start']} to {p['end']} ({p['shift']})", f"Filters: {filters}", f"Data mode: {env['mode']}",
    ]


def to_csv(env: Dict[str, Any]) -> str:
    rows, cols = flat_rows(env)
    buf = io.StringIO()
    w = csv.writer(buf)
    for line in header_lines(env):
        w.writerow([f"# {line}"])
    w.writerow([c["label"] + (f" ({c['unit']})" if c.get("unit") else "") for c in cols])
    for r in rows:
        w.writerow([cell(c["key"], r.get(c["key"])) for c in cols])
    w.writerow([])
    w.writerow(["# Summary"])
    for k, v in env["summary"].items():
        w.writerow([f"# {k}", cell(k, v)])
    if env.get("pagination"):
        w.writerow([f"# Rows exported: {len(rows)} of {env['pagination']['total']}"])
    return buf.getvalue()


# ── Minimal PDF writer ───────────────────────────────────────────────────────
_SUBST = {"—": "-", "–": "-", "−": "-", "→": "->", "←": "<-", "≥": ">=", "≤": "<=", "₂": "2", "₇": "7", "ρ": "rho",
          "…": "...", "µ": "u", "·": " - ", "³": "3", "×": "x", " ": " "}


def pdf_text(s: str) -> bytes:
    for a, b in _SUBST.items():
        s = s.replace(a, b)
    s = s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    return s.encode("latin-1", errors="replace")


def fit(s: str, width_pt: float, size: float) -> str:
    max_chars = max(1, int(width_pt / (size * 0.5)))
    return s if len(s) <= max_chars else s[: max_chars - 1] + "~"


def to_pdf(env: Dict[str, Any]) -> bytes:
    W, H, M = 842, 595, 32
    rows, cols = flat_rows(env)
    cols = [c for c in cols if not c.get("hidden")] or cols
    font = 6.8 if len(cols) > 10 else 7.6
    line_h = font + 3.4
    # Column widths proportional to content length.
    lens = []
    for c in cols:
        sample = [len(cell(c["key"], r.get(c["key"]))) for r in rows[:200]]
        lens.append(min(max([len(c["label"]) + (len(c.get("unit", "")) + 3 if c.get("unit") else 0)] + sample), 42))
    total = sum(lens) or 1
    widths = [(W - 2 * M) * L / total for L in lens]

    head = header_lines(env)
    summ = [f"{k}: {cell(k, v)}" for k, v in env["summary"].items() if not isinstance(v, (dict, list))][:18]
    pages: List[List[bytes]] = []
    ops: List[bytes] = []
    y = H - M

    def new_page():
        nonlocal ops, y
        ops = []
        pages.append(ops)
        y = H - M

    def text(x, yy, s, size=font, bold=False, gray=0.1):
        ops.append(b"BT /%s %.1f Tf %.2f g %.1f %.1f Td (" % (b"F2" if bold else b"F1", size, gray, x, yy) + pdf_text(s) + b") Tj ET")

    def table_header():
        nonlocal y
        x = M
        ops.append(b"0.90 g %.1f %.1f %.1f %.1f re f" % (M, y - 3, W - 2 * M, line_h + 1))
        for c, w in zip(cols, widths):
            text(x + 2, y, fit(c["label"] + (f" ({c['unit']})" if c.get("unit") else ""), w - 3, font), bold=True)
            x += w
        y -= line_h + 2

    new_page()
    text(M, y, head[0], 15, True); y -= 18
    text(M, y, head[1], 9, True, 0.55); y -= 13
    for line in head[2:]:
        text(M, y, line, 8); y -= 10.5
    y -= 4
    if summ:
        text(M, y, "Summary", 9.5, True); y -= 12
        half = (len(summ) + 1) // 2
        for i in range(half):
            text(M, y, fit(summ[i], 380, 8), 8)
            if i + half < len(summ):
                text(M + 400, y, fit(summ[i + half], 380, 8), 8)
            y -= 10
        y -= 6
    table_header()
    for r in rows:
        if y < M + 24:
            new_page()
            table_header()
        x = M
        for c, w in zip(cols, widths):
            text(x + 2, y, fit(cell(c["key"], r.get(c["key"])), w - 3, font))
            x += w
        y -= line_h
    if env.get("notes"):
        y -= 6
        for n in env["notes"]:
            if y < M + 24:
                new_page()
            text(M, y, fit("Note: " + n, W - 2 * M, 7.2), 7.2, gray=0.35); y -= 10

    n = len(pages)
    objs: List[bytes] = []
    # 1 catalog, 2 pages, 3 F1, 4 F2, then (content, page) pairs
    kids = " ".join(f"{6 + 2 * i} 0 R" for i in range(n))
    objs.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objs.append(f"<< /Type /Pages /Kids [{kids}] /Count {n} >>".encode())
    objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
    for i, page_ops in enumerate(pages):
        wm = b"q BT /F2 88 Tf 0.93 g 0.866 0.5 -0.5 0.866 200 120 Tm (DEMO DATA) Tj ET Q"
        foot = (b"BT /F1 7 Tf 0.45 g %d %d Td (" % (M, 16) + pdf_text(f"{env['report_id']}  -  {DEMO_NOTICE}") + b") Tj ET"
                + b" BT /F1 7 Tf 0.45 g %d %d Td (" % (W - M - 60, 16) + pdf_text(f"Page {i + 1} of {n}") + b") Tj ET")
        stream = wm + b"\n" + b"\n".join(page_ops) + b"\n" + foot
        objs.append(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")
        objs.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {W} {H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> "
                    f"/Contents {5 + 2 * i} 0 R >>".encode())
    out = io.BytesIO()
    out.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for i, o in enumerate(objs, start=1):
        offsets.append(out.tell())
        out.write(b"%d 0 obj\n" % i + o + b"\nendobj\n")
    xref = out.tell()
    out.write(b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1))
    for off in offsets:
        out.write(b"%010d 00000 n \n" % off)
    out.write(b"trailer\n<< /Size %d /Root 1 0 R /Info << /Title (" % (len(objs) + 1) + pdf_text(env["title"])
              + b") /Producer (SSIT dairy demo reports) >> >>\nstartxref\n%d\n%%%%EOF\n" % xref)
    return out.getvalue()
