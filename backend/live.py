"""
Live market data from the Royal Securities Exchange of Bhutan (RSEB).

The dashboard calls GET /api/live/market. This module fetches RSEB's public JSON
endpoints, normalises them, and caches the result briefly so that many people
opening the dashboard do not all hit the exchange's website.

Set RSEBL_BASE to change the upstream address, and LIVE_CACHE_SECONDS to change
how long a result is reused (default 60 seconds).
"""
import asyncio
import os
import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException

RSEBL_BASE = os.environ.get("RSEBL_BASE", "https://rsebl.org.bt/api/v2").rstrip("/")
CACHE_SECONDS = int(os.environ.get("LIVE_CACHE_SECONDS", "60"))
TIMEOUT_SECONDS = float(os.environ.get("RSEBL_TIMEOUT", "10"))
USER_AGENT = "RSEBL-Market-Watch/2.0 (capstone dashboard; contact the project team)"

router = APIRouter()

_cache = {"at": 0.0, "payload": None}
_lock = asyncio.Lock()


def _num(value):
    """RSEB sends some numbers as strings. Returns a float, or None if the value is missing."""
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


async def _get_json(client: httpx.AsyncClient, path: str):
    res = await client.get(f"{RSEBL_BASE}/{path}")
    res.raise_for_status()
    return res.json()


def normalise_ticker(rows) -> list[dict]:
    """Turns market-ticker rows into {symbol, price, change, pctChange} objects."""
    if not isinstance(rows, list):
        raise ValueError("market-ticker did not return a list")
    out = []
    for r in rows:
        symbol = str(r.get("symbol", "")).strip().upper()
        price = _num(r.get("currentPrice"))
        if not symbol or price is None:
            continue
        out.append({
            "symbol": symbol,
            "price": price,
            "change": _num(r.get("price")) or 0.0,
            "pctChange": _num(r.get("percentageChange")) or 0.0,
        })
    return out


def normalise_movers(data) -> dict:
    """Keeps the gainers, losers and volume leaders, with plain field names."""
    if not isinstance(data, dict):
        raise ValueError("market-movers did not return an object")

    def pick(rows, change=True):
        items = []
        for r in rows or []:
            item = {"symbol": r.get("symbol"), "name": r.get("name"), "price": _num(r.get("currentPrice"))}
            if change:
                item["change"] = _num(r.get("priceChange"))
                item["pctChange"] = _num(r.get("percentageChange"))
            else:
                item["volume"] = _num(r.get("volume"))
            items.append(item)
        return items

    return {
        "risers": pick(data.get("risers")),
        "fallers": pick(data.get("fallers")),
        "volumeLeaders": pick(data.get("volumeLeaders"), change=False),
    }


def normalise_stats(data) -> dict:
    """market-stats: total market cap in Nu. The BSI index is read from the bsi endpoint instead."""
    if not isinstance(data, dict):
        raise ValueError("market-stats did not return an object")
    return {"marketCap": _num(data.get("marketCap")), "bsiIndex": _num(data.get("bsiIndex")), "bsiChange": _num(data.get("bsiChange"))}


def normalise_bsi(data) -> dict:
    """bsi: a list of index values. Only the first entry is used here."""
    first = data[0] if isinstance(data, list) and data else data if isinstance(data, dict) else {}
    return {"index": _num(first.get("index")), "change": _num(first.get("ptChange"))}


async def fetch_market(client: httpx.AsyncClient | None = None) -> dict:
    """Fetches all four RSEB endpoints. Each one can fail on its own without stopping the others."""
    own = client is None
    client = client or httpx.AsyncClient(timeout=TIMEOUT_SECONDS, headers={"User-Agent": USER_AGENT})
    errors = {}
    try:
        results = await asyncio.gather(
            _get_json(client, "market-ticker"),
            _get_json(client, "market-movers"),
            _get_json(client, "market-stats"),
            _get_json(client, "bsi"),
            return_exceptions=True,
        )
    finally:
        if own:
            await client.aclose()

    names = ["ticker", "movers", "stats", "bsi"]
    raw = dict(zip(names, results))
    parsed = {}
    for name, value in raw.items():
        if isinstance(value, Exception):
            errors[name] = f"{type(value).__name__}: {value}"
    try:
        parsed["stocks"] = normalise_ticker(raw["ticker"])
    except Exception as exc:  # noqa: BLE001 - the ticker is the one essential source
        errors["ticker"] = str(exc)
        parsed["stocks"] = None
    for name, fn in (("movers", normalise_movers), ("stats", normalise_stats), ("bsi", normalise_bsi)):
        if name in errors:
            parsed[name] = None
            continue
        try:
            parsed[name] = fn(raw[name])
        except Exception as exc:  # noqa: BLE001
            errors[name] = str(exc)
            parsed[name] = None

    return {
        "ok": not errors,
        "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": RSEBL_BASE,
        "errors": errors,
        **parsed,
    }


@router.get("/api/live/market")
async def live_market():
    """Current prices, movers, market stats and BSI from RSEB, cached for a short time.

    If RSEB cannot be reached, the last good result is returned with "stale": true,
    so the dashboard can say how old its prices are instead of showing nothing.
    """
    now = time.monotonic()
    if _cache["payload"] and now - _cache["at"] < CACHE_SECONDS:
        return _cache["payload"]

    async with _lock:
        now = time.monotonic()
        if _cache["payload"] and now - _cache["at"] < CACHE_SECONDS:
            return _cache["payload"]
        payload = await fetch_market()
        if payload["stocks"] is None and _cache["payload"]:
            stale = dict(_cache["payload"])
            stale.update(ok=False, stale=True, errors=payload["errors"])
            return stale
        payload["stale"] = False
        _cache.update(at=time.monotonic(), payload=payload)
        record(payload)
        return payload


# ---------------------------------------------------------------------------
# Storage, history and news
# ---------------------------------------------------------------------------
import json as _json  # noqa: E402
from datetime import timedelta  # noqa: E402
from pathlib import Path as _Path  # noqa: E402

import store  # noqa: E402

BHUTAN_TZ = timezone(timedelta(hours=6))  # trading dates are Bhutan dates
COMPANIES = _json.loads((_Path(__file__).resolve().parent / "companies.json").read_text())
COMPANY_SYMBOLS = {c["symbol"] for c in COMPANIES}


def record(payload: dict) -> int:
    """Saves a market result to the database so the history grows over time. Returns how many prices were stored."""
    if not payload or not payload.get("stocks"):
        return 0
    fetched = datetime.fromisoformat(payload["fetchedAt"])
    date = fetched.astimezone(BHUTAN_TZ).date().isoformat()
    stored = 0
    for s in payload["stocks"]:
        if s["symbol"] in COMPANY_SYMBOLS:
            store.record_snapshot(s["symbol"], payload["fetchedAt"], s["price"], s["change"], s["pctChange"], date)
            stored += 1
    return stored


def remember(payload: dict) -> None:
    """Keeps a result for the cache, so the endpoints can answer without going back to RSEB."""
    _cache.update(at=time.monotonic(), payload=payload)


@router.get("/api/companies")
def companies():
    return COMPANIES


@router.get("/api/history/{symbol}")
def history(symbol: str):
    symbol = symbol.upper()
    if symbol not in COMPANY_SYMBOLS:
        raise HTTPException(status_code=404, detail=f"Unknown symbol {symbol}")
    points = store.history(symbol)
    return {
        "symbol": symbol,
        "points": points,
        "from": points[0]["date"] if points else None,
        "to": points[-1]["date"] if points else None,
    }


@router.get("/api/news")
def news(symbol: str | None = None, limit: int = 60):
    if symbol:
        symbol = symbol.upper()
        if symbol not in COMPANY_SYMBOLS:
            raise HTTPException(status_code=404, detail=f"Unknown symbol {symbol}")
    return {"items": store.news(symbol=symbol, limit=limit)}
