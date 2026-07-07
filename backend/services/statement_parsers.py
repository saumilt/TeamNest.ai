"""PDF + OFX statement parsers for AI Bookkeeper.

Both return a list[dict] in the same shape as the CSV parser:
    {date, description, amount, balance}
amount: positive = debit/expense, negative = credit/refund.
"""
from __future__ import annotations

import io
import re
from datetime import datetime
from typing import Any, Dict, List


def parse_pdf_statement(blob: bytes) -> List[Dict[str, Any]]:
    """Heuristic PDF statement parser using pdfplumber.

    Pulls every line, then matches the common bank/credit-card layout:
        MM/DD  description  $1,234.56  $balance
    Best-effort — most statements lay out lines this way; some PDFs require
    custom tuning per issuer.
    """
    import pdfplumber

    rows: List[Dict[str, Any]] = []
    line_re = re.compile(
        r"^\s*(?P<date>\d{1,2}/\d{1,2}(?:/\d{2,4})?)\s+"
        r"(?P<desc>.+?)\s+"
        r"(?P<amount>-?\$?[\d,]+\.\d{2})"
        r"(?:\s+(?P<balance>-?\$?[\d,]+\.\d{2}))?\s*$"
    )

    with pdfplumber.open(io.BytesIO(blob)) as pdf:
        # Use the first page to determine year if header has one.
        full_text = ""
        for page in pdf.pages:
            full_text += page.extract_text() or ""
            full_text += "\n"

    year_match = re.search(r"\b(20\d{2})\b", full_text)
    inferred_year = int(year_match.group(1)) if year_match else datetime.utcnow().year

    for line in full_text.splitlines():
        m = line_re.match(line)
        if not m:
            continue
        date_raw = m.group("date")
        date_iso = None
        for fmt in ("%m/%d/%Y", "%m/%d/%y", "%m/%d"):
            try:
                d = datetime.strptime(date_raw, fmt)
                if fmt == "%m/%d":
                    d = d.replace(year=inferred_year)
                date_iso = d.date().isoformat()
                break
            except ValueError:
                continue
        amount = float(m.group("amount").replace(",", "").replace("$", ""))
        balance = m.group("balance")
        balance_val = (
            float(balance.replace(",", "").replace("$", "")) if balance else None
        )
        rows.append({
            "date": date_iso or date_raw,
            "description": m.group("desc").strip()[:200],
            "amount": round(amount, 2),
            "balance": balance_val,
        })
    return rows


def parse_ofx_statement(blob: bytes) -> List[Dict[str, Any]]:
    """OFX / QBO statement parser using ofxparse."""
    from ofxparse import OfxParser

    ofx = OfxParser.parse(io.BytesIO(blob))
    rows: List[Dict[str, Any]] = []
    for account in ofx.accounts:
        stmt = getattr(account, "statement", None)
        if not stmt:
            continue
        for tx in stmt.transactions:
            # ofxparse expresses amounts as Decimal; positive = credit, negative = debit
            # in bank statements. Our convention is opposite: positive = debit. Flip sign.
            amount = -float(tx.amount)
            rows.append({
                "date": tx.date.date().isoformat() if hasattr(tx.date, "date") else str(tx.date),
                "description": (tx.payee or tx.memo or "")[:200],
                "amount": round(amount, 2),
                "balance": None,
            })
    return rows
