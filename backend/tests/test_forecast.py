import math
from datetime import date

import pytest
from fastapi.testclient import TestClient

import forecast


def _dates(n, start=date(2026, 1, 1)):
    from datetime import timedelta
    return [(start + timedelta(days=i)).isoformat() for i in range(n)]


def test_trending_series_beats_naive_and_forecast_follows_trend():
    series = [100 + 0.5 * i + 0.2 * math.sin(i) for i in range(300)]
    bt = forecast.backtest(series, horizon=5, test_days=100)
    assert bt["beats_naive"] is True
    out = forecast.forecast_series(_dates(300), series, horizon=10)
    assert out["forecast"][-1]["price"] > series[-1]
    assert len(out["forecast"]) == 10


def test_flat_series_forecast_stays_flat():
    out = forecast.forecast_series(_dates(200), [25.0] * 200, horizon=5)
    assert all(abs(f["price"] - 25.0) < 1e-6 for f in out["forecast"])


def test_forecast_days_are_weekdays_after_last_date():
    dates = _dates(80)  # last date is a known day
    out = forecast.forecast_series(dates, [10 + math.sin(i) for i in range(80)], horizon=10)
    days = [date.fromisoformat(f["date"]) for f in out["forecast"]]
    assert all(d.weekday() < 5 for d in days)
    assert days[0] > date.fromisoformat(dates[-1])
    assert len(set(days)) == len(days)


def test_too_little_history_is_refused():
    with pytest.raises(ValueError):
        forecast.forecast_series(_dates(10), [1.0] * 10)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("RSEBL_DB", str(tmp_path / "t.db"))
    monkeypatch.setenv("RSEBL_COLLECT", "0")
    from app import app
    return TestClient(app)


def test_forecast_endpoint_for_seeded_company(client):
    r = client.get("/api/forecast/BNBL?horizon=10")
    assert r.status_code == 200
    body = r.json()
    assert body["symbol"] == "BNBL"
    assert len(body["forecast"]) == 10
    assert "beats_naive" in body["backtest"]
    assert body["disclaimer"]


def test_forecast_endpoint_errors(client):
    assert client.get("/api/forecast/NOPE").status_code == 404
    assert client.get("/api/forecast/BNBL?horizon=0").status_code == 400
