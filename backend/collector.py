"""
Background jobs that keep the database current while the server runs.

- Market: every COLLECT_MARKET_SECONDS (default 60), fetch RSEB prices and store them.
- News:   every COLLECT_NEWS_SECONDS (default 1800), read the outlets' feeds and store new headlines.

Set RSEBL_COLLECT=0 to turn both off (for example, in tests). Each job logs its errors and keeps running.
"""
import asyncio
import os
import threading
import time
from datetime import datetime, timezone

import live
import news
import store

MARKET_SECONDS = int(os.environ.get("COLLECT_MARKET_SECONDS", "60"))
NEWS_SECONDS = int(os.environ.get("COLLECT_NEWS_SECONDS", "1800"))


def collect_market() -> int:
    payload = asyncio.run(live.fetch_market())
    live.remember(payload)
    stored = live.record(payload)
    if payload["errors"]:
        print(f"[collector] market: {payload['errors']}")
    return stored


def collect_news() -> int:
    result = asyncio.run(news.fetch_news())
    fetched = datetime.now(timezone.utc).isoformat(timespec="seconds")
    new = store.save_news(result["items"], fetched)
    if result["errors"]:
        print(f"[collector] news feeds failing: {result['errors']}")
    print(f"[collector] news: {len(result['items'])} headlines read, {new} new")
    return new


def _loop(name: str, every: int, job) -> None:
    while True:
        started = time.monotonic()
        try:
            job()
        except Exception as exc:  # noqa: BLE001 - keep the loop alive
            print(f"[collector] {name} failed: {exc}")
        time.sleep(max(1, every - (time.monotonic() - started)))


def start_background() -> None:
    if os.environ.get("RSEBL_COLLECT", "1") == "0":
        return
    threading.Thread(target=_loop, args=("market", MARKET_SECONDS, collect_market), daemon=True).start()
    threading.Thread(target=_loop, args=("news", NEWS_SECONDS, collect_news), daemon=True).start()
    print(f"[collector] started: market every {MARKET_SECONDS}s, news every {NEWS_SECONDS}s")
