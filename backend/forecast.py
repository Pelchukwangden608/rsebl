"""
Price forecasts with an honest backtest.

Model: damped-trend Holt exponential smoothing. Its smoothing parameters are tuned on the
company's own history. It is compared against a naive baseline ("the price stays where it is").

Every forecast comes with a backtest over the most recent days: the model's error is compared
with the naive error, and the response says whether the model actually beat the baseline.
Stock prices are close to unpredictable over short horizons, so a forecast is only useful
when that comparison favours the model. Nothing here is investment advice.
"""
from datetime import date, timedelta
from statistics import mean

from fastapi import APIRouter, HTTPException

import store

router = APIRouter()

ALPHAS = [0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9]
BETAS = [0.01, 0.05, 0.1, 0.2, 0.4]
PHI = 0.9          # trend damping: the trend fades over the horizon instead of running forever
MIN_POINTS = 60    # below this a forecast is not meaningful


def _run(series: list[float], alpha: float, beta: float):
    """Runs Holt over the series. Returns (level, trend) after the last point."""
    level, trend = series[0], series[1] - series[0] if len(series) > 1 else 0.0
    for y in series[1:]:
        prev_level = level
        level = alpha * y + (1 - alpha) * (level + PHI * trend)
        trend = beta * (level - prev_level) + (1 - beta) * PHI * trend
    return level, trend


def _project(level: float, trend: float, h: int) -> float:
    damp = sum(PHI ** k for k in range(1, h + 1))
    return level + trend * damp


def _tune(series: list[float]) -> tuple[float, float]:
    """Picks the smoothing parameters with the lowest one-step-ahead error on the series."""
    best, best_err = (0.3, 0.1), float("inf")
    for a in ALPHAS:
        for b in BETAS:
            level, trend = series[0], series[1] - series[0]
            err = 0.0
            for y in series[1:]:
                pred = level + PHI * trend
                err += abs(y - pred)
                prev_level = level
                level = a * y + (1 - a) * (level + PHI * trend)
                trend = b * (level - prev_level) + (1 - b) * PHI * trend
            if err < best_err:
                best, best_err = (a, b), err
    return best


def backtest(series: list[float], horizon: int = 5, test_days: int = 120) -> dict:
    """Rolling-origin backtest: from each day in the test window, forecast `horizon` days ahead."""
    # Keep at least two thirds of the history for fitting, so short series still get a backtest.
    test_days = min(test_days, len(series) // 3)
    alpha, beta = _tune(series[:-test_days])
    model_err, naive_err, hits, total = [], [], 0, 0
    for origin in range(len(series) - test_days, len(series) - horizon):
        level, trend = _run(series[: origin + 1], alpha, beta)
        target = series[origin + horizon]
        base = series[origin]
        pred = _project(level, trend, horizon)
        model_err.append(abs(target - pred))
        naive_err.append(abs(target - base))
        if target != base and pred != base:
            total += 1
            hits += (target > base) == (pred > base)
    mae_model, mae_naive = mean(model_err), mean(naive_err)
    return {
        "horizon_days": horizon,
        "test_days": test_days,
        "mae_model": round(mae_model, 4),
        "mae_naive": round(mae_naive, 4),
        "direction_accuracy": round(hits / total, 3) if total else None,
        "beats_naive": mae_model < mae_naive,
        "smoothing": {"alpha": alpha, "beta": beta},
    }


def _business_days_after(start: date, n: int) -> list[str]:
    out, d = [], start
    while len(out) < n:
        d += timedelta(days=1)
        if d.weekday() < 5:
            out.append(d.isoformat())
    return out


def forecast_series(dates: list[str], prices: list[float], horizon: int = 20) -> dict:
    if len(prices) < MIN_POINTS:
        raise ValueError(f"need at least {MIN_POINTS} daily prices, have {len(prices)}")
    bt = backtest(prices, horizon=min(5, horizon))
    level, trend = _run(prices, bt["smoothing"]["alpha"], bt["smoothing"]["beta"])
    # Band: the backtest's typical error, widened with the square root of the horizon.
    band_base = bt["mae_model"] * 1.25
    days = _business_days_after(date.fromisoformat(dates[-1]), horizon)
    path = []
    for h, day in enumerate(days, start=1):
        mid = _project(level, trend, h)
        width = band_base * (h ** 0.5)
        path.append({"date": day, "price": round(mid, 2),
                     "low": round(mid - width, 2), "high": round(mid + width, 2)})
    return {
        "last_date": dates[-1],
        "last_price": prices[-1],
        "method": "Damped-trend Holt smoothing, tuned on this company's history",
        "backtest": bt,
        "forecast": path,
        "note": ("The model beats the naive baseline on recent data."
                 if bt["beats_naive"] else
                 "The model did NOT beat the naive baseline on recent data. Treat this forecast as a rough guide only."),
        "disclaimer": "Forecasts are estimates from past prices, not advice. Prices here are thinly traded and can move on few trades.",
    }


@router.get("/api/forecast/{symbol}")
def forecast(symbol: str, horizon: int = 20):
    if not 1 <= horizon <= 60:
        raise HTTPException(400, "horizon must be between 1 and 60 trading days")
    rows = store.history(symbol.upper())
    if not rows:
        raise HTTPException(404, f"no price history for {symbol}")
    dates = [r["date"] for r in rows]
    prices = [float(r["price"]) for r in rows]
    try:
        return {"symbol": symbol.upper(), **forecast_series(dates, prices, horizon)}
    except ValueError as exc:
        raise HTTPException(422, str(exc))
