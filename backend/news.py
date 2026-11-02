"""
News collection: RSEB's announcements (primary) and Bhutanese outlets' RSS feeds.

Each feed is read on its own, so one outlet being down does not stop the others.
Headlines are matched to listed companies by their symbol or company name. Headlines
that mention no listed company are still stored, with an empty symbol list.

Set NEWS_FEEDS to a comma-separated list of feed URLs to override the defaults.
The default URLs are the usual WordPress feed addresses. Confirm each one works
before relying on it, because outlets change their feed paths.
"""
import html
import json
import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

import httpx

# Checked with curl: all three return 200 as XML. Kuensel publishes an Atom feed at /feed/posts.
DEFAULT_FEEDS = [
    ("Kuensel", "https://kuenselonline.com/feed/posts"),
    ("BBS", "https://www.bbs.bt/feed/"),
    ("The Bhutanese", "https://thebhutanese.bt/feed/"),
]
# RSEB's own announcements feed (the list behind rsebl.org.bt/news-and-announcements).
ANNOUNCEMENTS_URL = os.environ.get(
    "RSEBL_ANNOUNCEMENTS_URL", "https://www.services.rsebl.org.bt/agm/api/fetch-news")
# Attachments are served from here: file_path "announcements/x.pdf" -> base + file_path.
ATTACHMENTS_BASE = os.environ.get(
    "RSEBL_ATTACHMENTS_BASE", "https://www.services.rsebl.org.bt/agm/storage/")
NEWS_PAGE = "https://rsebl.org.bt/news-and-announcements"
LEGAL_SUFFIX = re.compile(r"\b(ltd|limited|co|corporation of bhutan|company)\b\.?", re.IGNORECASE)
COMPANIES = json.loads((Path(__file__).resolve().parent / "companies.json").read_text())


def configured_feeds() -> list[tuple[str, str]]:
    raw = os.environ.get("NEWS_FEEDS")
    if not raw:
        return DEFAULT_FEEDS
    feeds = []
    for entry in raw.split(","):
        entry = entry.strip()
        if not entry:
            continue
        if "|" in entry:  # "Name|https://..." gives the outlet a readable name
            name, url = entry.split("|", 1)
        else:
            name, url = httpx.URL(entry).host or "feed", entry
        feeds.append((name.strip(), url.strip()))
    return feeds


def aliases_for(company: dict) -> list[str]:
    """Phrases that identify a company in a headline: its symbol and its name without the legal suffix."""
    name = LEGAL_SUFFIX.sub("", company["name"]).replace(".", " ")
    name = re.sub(r"\s+", " ", name).strip(" ,&")
    found = {company["symbol"], name.title()}
    if len(name.split()) > 1:
        found.add(name)
    return [a for a in found if len(a) >= 3]


ALIASES = {c["symbol"]: aliases_for(c) for c in COMPANIES}


def match_symbols(text: str) -> list[str]:
    hits = []
    for symbol, phrases in ALIASES.items():
        for phrase in phrases:
            pattern = r"(?<![A-Za-z])" + re.escape(phrase) + r"(?![A-Za-z])"
            if re.search(pattern, text, flags=re.IGNORECASE if phrase != symbol else 0):
                hits.append(symbol)
                break
    return hits


def _child(el, tag):
    """First child whose local name matches, so Atom (namespaced) and RSS (plain) both work."""
    for child in el:
        if child.tag.rsplit("}", 1)[-1] == tag:
            return child
    return None


def _text(el, tag):
    found = _child(el, tag)
    return (found.text or "").strip() if found is not None and found.text else ""


def _iso(value: str) -> str | None:
    if not value:
        return None
    try:
        dt = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).date().isoformat()


def parse_feed(xml_text: str, source: str) -> list[dict]:
    """Reads RSS 2.0 items (and Atom entries) into {title, url, published, source, symbols}."""
    root = ET.fromstring(xml_text)
    items = []
    for node in root.iter():
        tag = node.tag.rsplit("}", 1)[-1]
        if tag not in ("item", "entry"):
            continue
        title = _text(node, "title")
        link = _text(node, "link")
        if not link:
            link_el = _child(node, "link")
            link = (link_el.get("href") if link_el is not None else "") or ""
        published = _iso(_text(node, "pubDate")) or _iso(_text(node, "published")) or _iso(_text(node, "updated"))
        if not title or not link:
            continue
        items.append({"title": re.sub(r"\s+", " ", title), "url": link, "published": published,
                      "source": source, "symbols": match_symbols(title)})
    return items


def _plain(markup: str) -> str:
    text = re.sub(r"<[^>]+>", " ", markup or "")
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def parse_announcements(rows: list[dict]) -> list[dict]:
    """Turns RSEB announcement records into the same shape as RSS headlines.

    The title is the announcement's own title when it has one, otherwise the start of its text.
    Each item links to its attachment when there is one, or to the announcements page otherwise.
    """
    items = []
    for row in rows:
        text = _plain(row.get("announcement", ""))
        title = _plain(row.get("title") or "") or text[:140].rsplit(" ", 1)[0]
        if not title:
            continue
        file_path = (row.get("file_path") or "").lstrip("/")
        url = ATTACHMENTS_BASE.rstrip("/") + "/" + file_path if file_path else f"{NEWS_PAGE}#a{row['id']}"
        published = (row.get("created_at") or "")[:10] or None
        items.append({"title": title, "url": url, "published": published, "source": "RSEB",
                      "symbols": match_symbols(f"{title} {text}")})
    return items


async def fetch_announcements(client: httpx.AsyncClient) -> list[dict]:
    res = await client.get(ANNOUNCEMENTS_URL)
    res.raise_for_status()
    return parse_announcements(res.json())


async def fetch_news(client: httpx.AsyncClient | None = None) -> dict:
    own = client is None
    client = client or httpx.AsyncClient(timeout=15, follow_redirects=True,
                                         headers={"User-Agent": "RSEBL-Market-Watch/2.0 (capstone dashboard)"})
    items, errors = [], {}
    try:
        try:
            items.extend(await fetch_announcements(client))
        except Exception as exc:  # noqa: BLE001 - RSEB being down must not stop the outlets
            errors["RSEB"] = f"{type(exc).__name__}: {exc}"
        for source, url in configured_feeds():
            try:
                res = await client.get(url)
                res.raise_for_status()
                items.extend(parse_feed(res.text, source))
            except Exception as exc:  # noqa: BLE001 - one outlet failing must not stop the rest
                errors[source] = f"{type(exc).__name__}: {exc}"
    finally:
        if own:
            await client.aclose()
    return {"items": items, "errors": errors}
