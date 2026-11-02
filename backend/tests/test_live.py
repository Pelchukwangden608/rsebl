import json
import pathlib
import sys

import httpx
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
import live  # noqa: E402

FIX = pathlib.Path(__file__).parent / "fixtures"
FILES = {"market-ticker": "market-ticker.json", "market-movers": "market-movers.json",
         "market-stats": "market-stats.json", "bsi": "bsi.json"}


def transport(overrides=None):
    overrides = overrides or {}

    def handler(request: httpx.Request):
        name = request.url.path.rsplit("/", 1)[-1]
        if name in overrides:
            return overrides[name]
        return httpx.Response(200, json=json.loads((FIX / FILES[name]).read_text()))

    return httpx.MockTransport(handler)


async def run(overrides=None):
    async with httpx.AsyncClient(transport=transport(overrides)) as client:
        return await live.fetch_market(client)


@pytest.mark.asyncio
async def test_all_sources_ok():
    out = await run()
    assert out["ok"] is True and out["errors"] == {}
    assert len(out["stocks"]) == 17
    bnbl = next(s for s in out["stocks"] if s["symbol"] == "BNBL")
    assert bnbl == {"symbol": "BNBL", "price": 23.9, "change": 0.31, "pctChange": pytest.approx(1.3141, rel=1e-3)}
    assert out["stats"]["marketCap"] == pytest.approx(50713906239.04)
    assert out["bsi"] == {"index": 1211.24, "change": -12.75}
    assert out["movers"]["risers"][0]["symbol"] == "GICB"
    assert out["movers"]["volumeLeaders"][0]["volume"] == 79050541


@pytest.mark.asyncio
async def test_one_source_failing_keeps_the_rest():
    out = await run({"bsi": httpx.Response(500, text="boom")})
    assert out["ok"] is False
    assert "bsi" in out["errors"] and out["bsi"] is None
    assert len(out["stocks"]) == 17


@pytest.mark.asyncio
async def test_ticker_failing_is_reported():
    out = await run({"market-ticker": httpx.Response(503, text="down")})
    assert out["ok"] is False and out["stocks"] is None
    assert "ticker" in out["errors"]


def test_endpoint_serves_and_caches(monkeypatch):
    calls = {"n": 0}

    async def fake_fetch(client=None):
        calls["n"] += 1
        return {"ok": True, "fetchedAt": "2026-11-02T16:15:00+00:00", "source": "x", "errors": {},
                "stocks": [{"symbol": "BNBL", "price": 23.9, "change": 0.31, "pctChange": 1.31}],
                "movers": None, "stats": None, "bsi": None}

    monkeypatch.setattr(live, "fetch_market", fake_fetch)
    live._cache.update(at=0.0, payload=None)
    from app import app  # imports the FastAPI app; FinBERT loads in a background thread
    client = TestClient(app)
    first = client.get("/api/live/market").json()
    second = client.get("/api/live/market").json()
    assert first["stocks"][0]["symbol"] == "BNBL" and first["stale"] is False
    assert second == first and calls["n"] == 1


@pytest.mark.asyncio
async def test_serves_stale_cache_when_upstream_down(monkeypatch):
    good = {"ok": True, "fetchedAt": "old", "source": "x", "errors": {}, "stocks": [{"symbol": "BNBL", "price": 1, "change": 0, "pctChange": 0}],
            "movers": None, "stats": None, "bsi": None, "stale": False}
    live._cache.update(at=0.0, payload=good)

    async def down(client=None):
        return {"ok": False, "fetchedAt": "now", "source": "x", "errors": {"ticker": "down"}, "stocks": None, "movers": None, "stats": None, "bsi": None}

    monkeypatch.setattr(live, "fetch_market", down)
    out = await live.live_market()
    assert out["stale"] is True and out["stocks"][0]["price"] == 1 and out["errors"] == {"ticker": "down"}
