from transformers import pipeline

clf = pipeline("text-classification", model="ProsusAI/finbert")

headlines = [
    "Bank reports record profit and raises dividend",
    "Shares fall sharply after weak quarterly results",
]
for h, r in zip(headlines, clf(headlines)):
    print(r["label"], round(r["score"], 3), "|", h)