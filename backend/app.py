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


HF_TOKEN = os.environ.get("HF_TOKEN", "").strip()
HF_API_URL = os.environ.get("HF_API_URL", "https://router.huggingface.co/hf-inference/models").rstrip("/")


def hf_classify(texts, client=None, batch_size=16):
    """Runs FinBERT on Hugging Face's hosted inference API, so this server needs no PyTorch.

    Returns one list of {label, score} dicts per text, the same shape the local pipeline gives.
    """
    import httpx

    url = f"{HF_API_URL}/{MODEL_ID}"
    headers = {"Authorization": f"Bearer {HF_TOKEN}"}
    http = client or httpx.Client(timeout=30)
    out = []
    try:
        for i in range(0, len(texts), batch_size):
            chunk = texts[i:i + batch_size]
            res = http.post(url, headers=headers, json={"inputs": chunk, "options": {"wait_for_model": True}})
            res.raise_for_status()
            data = res.json()
            # One input may come back as a flat list of label scores rather than a list per input.
            if len(chunk) == 1 and isinstance(data, list) and data and isinstance(data[0], dict):
                data = [data]
            if not isinstance(data, list) or len(data) != len(chunk):
                raise ValueError("Hugging Face returned an unexpected response")
            out.extend(item if isinstance(item, list) else [item] for item in data)
    finally:
        if client is None:
            http.close()
    return out


def load_model():
    """Loads FinBERT once. Runs in a background thread so the server starts immediately.

    With HF_TOKEN set, the hosted Hugging Face API is used instead of a local model.
    """
    try:
        if HF_TOKEN:
            clf = hf_classify
        else:
            from transformers import pipeline  # imported here so the server starts even if torch is missing

            clf = pipeline("text-classification", model=MODEL_ID)
        with state_lock:
            state.update(status="ready", classifier=clf, error=None)
        print(f"[sentiment] FinBERT loaded: {MODEL_ID} ({'hosted' if HF_TOKEN else 'local'})")
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
    if clf is hf_classify:
        try:
            raw = hf_classify(req.texts)
        except Exception as exc:  # noqa: BLE001 - report hosted API problems to the dashboard
            raise HTTPException(status_code=503, detail=f"The hosted FinBERT service failed: {exc}")
    else:
        raw = clf(req.texts, truncation=True, batch_size=16)
    return {"results": [to_signed(r[0] if isinstance(r, list) and r else r) for r in raw]}
