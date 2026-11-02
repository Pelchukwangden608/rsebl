"""
RSEBL sentiment service.

Serves FinBERT (ProsusAI/finbert) predictions and live RSEB market data to the RSEBL Market Watch dashboard.

Endpoints
  GET  /health        status of the model: loading, ready or unavailable
  POST /score         body {"texts": ["headline", ...]} -> one result per headline
  GET  /api/live/market  current prices, movers, market stats and BSI from RSEB (cached 60 s)

Run with:  uvicorn app:app --port 8000
"""
import os
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from live import router as live_router
from forecast import router as forecast_router
from collector import start_background

MODEL_ID = os.environ.get("FINBERT_MODEL", "ProsusAI/finbert")
MAX_TEXTS_PER_REQUEST = 200
# Websites allowed to call this service. Add your deployed dashboard address in CORS_ORIGINS,
# comma-separated, for example CORS_ORIGINS=https://rsebl-watch.netlify.app
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    *[o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()],
]

state = {"status": "loading", "error": None, "classifier": None}
state_lock = threading.Lock()


def load_model():
    """Loads FinBERT once. Runs in a background thread so the server starts immediately."""
    try:
        from transformers import pipeline  # imported here so the server starts even if torch is missing

        clf = pipeline("text-classification", model=MODEL_ID)
        with state_lock:
            state.update(status="ready", classifier=clf, error=None)
        print(f"[sentiment] FinBERT loaded: {MODEL_ID}")
    except Exception as exc:  # noqa: BLE001 - report any load problem to the dashboard
        with state_lock:
            state.update(status="unavailable", error=str(exc))
        print(f"[sentiment] FinBERT could not be loaded: {exc}")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    threading.Thread(target=load_model, daemon=True).start()
    start_background()
    yield


app = FastAPI(title="RSEBL sentiment service", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(live_router)
app.include_router(forecast_router)


class ScoreRequest(BaseModel):
    texts: list[str] = Field(..., max_length=MAX_TEXTS_PER_REQUEST)


def to_signed(result: dict) -> dict:
    """Converts a FinBERT label and probability into a score from -1 (negative) to +1 (positive)."""
    label = str(result["label"]).lower()
    prob = float(result["score"])
    signed = prob if label == "positive" else -prob if label == "negative" else 0.0
    return {
        "label": label if label in ("positive", "negative") else "neutral",
        "score": round(signed, 2),
        "confidence": round(prob, 2),
    }


@app.get("/health")
def health():
    with state_lock:
        return {"status": state["status"], "model": MODEL_ID, "error": state["error"]}


@app.post("/score")
def score(req: ScoreRequest):
    with state_lock:
        status, clf, error = state["status"], state["classifier"], state["error"]
    if status == "loading":
        raise HTTPException(status_code=503, detail="The FinBERT model is still loading. Try again in a minute.")
    if status != "ready" or clf is None:
        raise HTTPException(status_code=503, detail=f"The FinBERT model is unavailable: {error}")
    if not req.texts:
        return {"results": []}
    raw = clf(req.texts, truncation=True, batch_size=16)
    return {"results": [to_signed(r[0] if isinstance(r, list) else r) for r in raw]}
