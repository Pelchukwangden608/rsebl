"""
Daily check that RSEB's public endpoints still return the fields the dashboard reads.

Run by .github/workflows/endpoint-check.yml. Exits with status 1 when a feed has changed shape or
cannot be reached, so GitHub reports the failed run and emails the repository owner.
"""
import sys

import httpx

from live import RSEBL_BASE, USER_AGENT

REQUIRED = {
    "market-ticker": ("list", ["symbol", "currentPrice", "price", "percentageChange"]),
    "market-movers": ("dict", ["risers", "fallers", "volumeLeaders"]),
    "market-stats": ("dict", ["marketCap", "bsiIndex", "bsiChange"]),
    "bsi": ("any", ["index", "ptChange"]),
}


def check(client: httpx.Client) -> list[str]:
    problems = []
    for path, (kind, fields) in REQUIRED.items():
        try:
            res = client.get(f"{RSEBL_BASE}/{path}")
            res.raise_for_status()
            data = res.json()
        except Exception as exc:  # noqa: BLE001 - report every failure, then keep checking the rest
            problems.append(f"{path}: could not be read ({type(exc).__name__}: {exc})")
            continue
        if kind == "list":
            sample = data[0] if isinstance(data, list) and data else None
        elif kind == "dict":
            sample = data if isinstance(data, dict) else None
        else:
            sample = data[0] if isinstance(data, list) and data else data
        if not isinstance(sample, dict):
            problems.append(f"{path}: unexpected shape ({type(data).__name__})")
            continue
        missing = [f for f in fields if f not in sample]
        if missing:
            problems.append(f"{path}: missing fields {', '.join(missing)}")
    return problems


if __name__ == "__main__":
    with httpx.Client(timeout=20, headers={"User-Agent": USER_AGENT}) as client:
        problems = check(client)
    if problems:
        print("RSEB endpoint check failed:")
        for p in problems:
            print(" -", p)
        sys.exit(1)
    print(f"All {len(REQUIRED)} RSEB endpoints match the expected fields.")
