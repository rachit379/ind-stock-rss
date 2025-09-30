#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Build data/feeds.json from many Indian markets RSS feeds.

import os, json, time, hashlib, calendar, re
from datetime import datetime, timezone
from typing import Dict, Any
import feedparser
import yaml

ROOT = os.path.dirname(os.path.dirname(__file__)) if "__file__" in globals() else "."
DATA_PATH = os.path.join(ROOT, "data")
OUT_JSON = os.path.join(DATA_PATH, "feeds.json")
FEEDS_YML = os.path.join(ROOT, "feeds.yml")
USER_AGENT = "IndianStockFeeds/2.0 (+https://github.com/yourname/ind-stock-rss)"
REQUEST_DELAY_SEC = 0.5

TICKER_HINTS = [
    r"\bNIFTY\b", r"\bSENSEX\b", r"\bBANK NIFTY\b", r"\bNSE\b", r"\bBSE\b",
    r"\bIPO\b", r"\bFII\b", r"\bDII\b", r"\bRBI\b",
    r"\bRELIANCE\b", r"\bTCS\b", r"\bINFY\b", r"\bHDFCBANK\b", r"\bICICIBANK\b",
    r"\bLT\b", r"\bSBIN\b", r"\bBHARTI\b", r"\bITC\b"
]
TICKER_RE = re.compile("|".join(TICKER_HINTS), re.I)

def ensure_dirs():
    os.makedirs(DATA_PATH, exist_ok=True)

def _hash(*parts: str) -> str:
    m = hashlib.sha1()
    for p in parts:
        m.update((p or "").encode("utf-8", errors="ignore"))
    return m.hexdigest()[:16]

def entry_dt_utc(e):
    for key in ("published_parsed", "updated_parsed"):
        dt_struct = getattr(e, key, None)
        if dt_struct:
            try:
                ts = calendar.timegm(dt_struct)
                return datetime.fromtimestamp(ts, tz=timezone.utc)
            except Exception:
                pass
    for key in ("published", "updated"):
        s = getattr(e, key, "") or ""
        if not s: continue
        try:
            dt_struct = feedparser._parse_date(s)
            if dt_struct:
                ts = calendar.timegm(dt_struct)
                return datetime.fromtimestamp(ts, tz=timezone.utc)
        except Exception:
            continue
    return None

def to_ist(dt_utc):
    if not dt_utc: return None
    offset = 5.5 * 3600
    ist_ts = dt
