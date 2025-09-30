#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Fetch Indian market RSS feeds, normalize, dedupe, and emit data/feeds.json.
# Run locally or via GitHub Actions.

import os, json, time, hashlib, calendar, re
from datetime import datetime, timezone
from typing import Dict, Any, List
import feedparser
import yaml

ROOT = os.path.dirname(os.path.dirname(__file__)) if "__file__" in globals() else "."
DATA_PATH = os.path.join(ROOT, "data")
OUT_JSON = os.path.join(DATA_PATH, "feeds.json")
FEEDS_YML = os.path.join(ROOT, "feeds.yml")
USER_AGENT = "IndianStockFeeds/1.0 (+https://github.com/yourname/indian-stock-feeds)"
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
    """
    Return a UTC datetime from the richest available fields in a feed entry.
    Priority: published_parsed, updated_parsed, then raw strings.
    """
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
        if not s:
            continue
        try:
            dt_struct = feedparser._parse_date(s)
            if dt_struct:
                ts = calendar.timegm(dt_struct)
                return datetime.fromtimestamp(ts, tz=timezone.utc)
        except Exception:
            continue
    return None

def to_ist(dt_utc):
    if not dt_utc:
        return None
    offset = 5.5 * 3600
    ist_ts = dt_utc.astimezone(timezone.utc).timestamp() + offset
    return datetime.fromtimestamp(ist_ts, tz=timezone.utc).strftime("%d-%b-%Y %H:%M IST")

def load_sources():
    with open(FEEDS_YML, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    return cfg.get("sources", [])

def fetch():
    ensure_dirs()
    sources = load_sources()
    all_items: Dict[str, Dict[str, Any]] = {}

    feedparser.USER_AGENT = USER_AGENT

    for s in sources:
        name, url = s["name"], s["url"]
        try:
            feed = feedparser.parse(url)
            if not getattr(feed, "entries", []):
                time.sleep(REQUEST_DELAY_SEC)
                continue
            for e in feed.entries:
                title = getattr(e, "title", "") or ""
                link = getattr(e, "link", "") or ""
                summary = getattr(e, "summary", "") or ""

                dt_utc = entry_dt_utc(e)
                published_raw = getattr(e, "published", "") or getattr(e, "updated", "") or ""

                uid = _hash(name, title, link)
                item = {
                    "id": uid,
                    "source": name,
                    "title": title.strip(),
                    "link": link.strip(),
                    "published_raw": published_raw,
                    "published_utc": dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ") if dt_utc else None,
                    "published_ist": to_ist(dt_utc),
                    "summary": re.sub(r"<[^>]+>", "", summary)[:500] if summary else None,
                    "likely_india_equity": bool(TICKER_RE.search(title) or TICKER_RE.search(summary or "")),
                }
                key = link or uid
                if key not in all_items:
                    all_items[key] = item
        except Exception as ex:
            print(f"[WARN] {name} failed: {ex}")
        finally:
            time.sleep(REQUEST_DELAY_SEC)

    items = list(all_items.values())
    items.sort(key=lambda x: (x["published_utc"] or "", x["title"]), reverse=True)

    out = {
        "generated_utc": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "count": len(items),
        "items": items,
    }
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"Wrote {OUT_JSON} with {len(items)} items.")

if __name__ == "__main__":
    fetch()
