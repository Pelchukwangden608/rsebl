import httpx

import app


def test_hosted_classifier_parses_batches(monkeypatch):
    monkeypatch.setattr(app, "HF_TOKEN", "test")
    calls = []

    def handler(request: httpx.Request):
        calls.append(request)
        n = len(__import__("json").loads(request.content)["inputs"])
        body = [[{"label": "positive", "score": 0.9}, {"label": "neutral", "score": 0.1}]] * n
        return httpx.Response(200, json=body)

    client = httpx.Client(transport=httpx.MockTransport(handler))
    texts = [f"headline {i}" for i in range(20)]
    out = app.hf_classify(texts, client=client, batch_size=16)
    assert len(out) == 20 and out[0][0]["label"] == "positive"
    assert len(calls) == 2  # 20 headlines in batches of 16 and 4
    assert calls[0].headers["Authorization"] == "Bearer test"


def test_hosted_classifier_rejects_bad_shape(monkeypatch):
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"error": "loading"})))
    try:
        app.hf_classify(["x"], client=client)
    except ValueError:
        return
    raise AssertionError("expected ValueError")


def test_to_signed_labels():
    assert app.to_signed({"label": "negative", "score": 0.8}) == {"label": "negative", "score": -0.8, "confidence": 0.8}
    assert app.to_signed({"label": "neutral", "score": 0.6})["label"] == "neutral"


def test_hosted_classifier_single_flat_response(monkeypatch):
    monkeypatch.setattr(app, "HF_TOKEN", "test")
    flat = [{"label": "negative", "score": 0.7}, {"label": "neutral", "score": 0.3}]
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=flat)))
    out = app.hf_classify(["one headline"], client=client)
    assert out[0][0]["label"] == "negative"
    assert app.to_signed(out[0][0])["score"] == -0.7
