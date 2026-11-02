import pathlib
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
import news  # noqa: E402
import store  # noqa: E402

FIX = pathlib.Path(__file__).parent / "fixtures"


@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.setenv("RSEBL_DB", str(tmp_path / "test.db"))
    monkeypatch.setenv("RSEBL_COLLECT", "0")
    store._conn = None
    yield tmp_path
    if store._conn is not None:
        store._conn.close()
    store._conn = None


def test_feed_matching_finds_companies_by_name_and_symbol():
    items = news.parse_feed((FIX / "sample-feed.xml").read_text(), "Sample")
    by_title = {i["title"]: i for i in items}
    assert by_title["Bhutan National Bank posts record profit for FY2026"]["symbols"] == ["BNBL"]
    assert by_title["Royal Insurance Corporation of Bhutan launches new policy"]["symbols"] == ["RICB"]
    assert sorted(by_title["RICB and BNBL shares rise after AGM"]["symbols"]) == ["BNBL", "RICB"]
    assert by_title["Thimphu weather stays mild this week"]["symbols"] == []
    assert by_title["Bhutan National Bank posts record profit for FY2026"]["published"] == "2026-11-02"


def test_history_is_seeded_from_rsebl_data(db):
    points = store.history("BNBL")
    assert len(points) >= 1600
    assert points[0]["date"] == "2020-04-23" and points[-1]["date"] == "2026-11-02"
    assert points[-1]["price"] == 23.9


def test_live_price_updates_todays_close_but_not_seeded_days(db):
    store.record_snapshot("BCCL", "2026-11-02T10:00:00+00:00", 27.0, 0.0, 0.0, "2026-11-02")
    store.record_snapshot("BCCL", "2026-11-02T11:00:00+00:00", 27.5, 0.5, 1.8, "2026-11-02")
    tbl = store.history("BCCL")
    assert tbl == [{"date": "2026-11-02", "price": 27.5, "source": "live"}]
    store.record_snapshot("BNBL", "2026-11-02T11:00:00+00:00", 99.0, 0, 0, "2026-11-02")
    bnbl_today = [p for p in store.history("BNBL") if p["date"] == "2026-11-02"][0]
    assert bnbl_today["price"] == 23.9  # the seeded close is not overwritten


def test_news_is_saved_once_and_filtered(db):
    items = news.parse_feed((FIX / "sample-feed.xml").read_text(), "Sample")
    assert store.save_news(items, "2026-11-02T12:00:00+00:00") == 4
    assert store.save_news(items, "2026-11-02T13:00:00+00:00") == 0
    ricb = store.news("RICB")
    assert len(ricb) == 2 and all("RICB" in n["symbols"] for n in ricb)


def test_history_and_news_endpoints(db):
    from app import app
    client = TestClient(app)
    res = client.get("/api/history/bnbl").json()
    assert res["symbol"] == "BNBL" and res["to"] == "2026-11-02"
    assert client.get("/api/history/NOPE").status_code == 404
    store.save_news(news.parse_feed((FIX / "sample-feed.xml").read_text(), "Sample"), "2026-11-02T12:00:00+00:00")
    items = client.get("/api/news", params={"symbol": "BNBL"}).json()["items"]
    assert {i["title"] for i in items} >= {"Bhutan National Bank posts record profit for FY2026"}
    assert client.get("/api/news", params={"symbol": "XXXX"}).status_code == 404
    assert len(client.get("/api/companies").json()) == 17


def test_every_seeded_company_has_full_history(db):
    seeded = sorted(p.stem for p in store.SEED_DIR.glob("*.json") if p.name != "companies.json")
    assert len(seeded) == 13
    for symbol in seeded:
        points = store.history(symbol)
        assert len(points) >= 1600, symbol
        assert points[-1]["date"] == "2026-11-02", symbol
