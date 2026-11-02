import json

import httpx
import pytest

import news

FIX = __import__("pathlib").Path(__file__).parent / "fixtures"
ROWS = json.loads((FIX / "rsebl-announcements.json").read_text())


def test_attachment_url_is_base_plus_file_path():
    items = news.parse_announcements(ROWS)
    dwal_egm = next(i for i in items if i["url"].endswith("e5OC5PwHL919zl5AbJ9RDCiJkdZ7sSPcea3uXiD6.pdf"))
    assert dwal_egm["url"] == (
        "https://www.services.rsebl.org.bt/agm/storage/announcements/e5OC5PwHL919zl5AbJ9RDCiJkdZ7sSPcea3uXiD6.pdf")
    assert dwal_egm["source"] == "RSEB"
    assert dwal_egm["published"] == "2026-10-15"


def test_html_is_stripped_and_untitled_items_get_text_as_title():
    items = news.parse_announcements(ROWS)
    dwal = next(i for i in items if i["published"] == "2026-10-23")
    assert "<" not in dwal["title"] and "&" not in dwal["title"]
    assert dwal["title"].startswith("This is to inform all shareholders of Druk Wang Alloys Limited (DWAL)")
    assert dwal["url"] == "https://rsebl.org.bt/news-and-announcements#a383"


def test_items_are_tagged_to_listed_companies():
    items = news.parse_announcements(ROWS)
    dwal = next(i for i in items if i["published"] == "2026-10-23")
    assert dwal["symbols"] == ["DWAL"]
    ceo = next(i for i in items if "CHIEF EXECUTIVE" in i["title"].upper())
    assert ceo["symbols"] == []


def test_urls_are_unique_so_every_item_is_stored():
    items = news.parse_announcements(ROWS)
    assert len({i["url"] for i in items}) == len(items)


@pytest.mark.asyncio
async def test_fetch_news_reads_rsebl_and_survives_outlet_failure(monkeypatch):
    monkeypatch.setattr(news, "configured_feeds", lambda: [("Kuensel", "https://kuenselonline.com/feed/")])

    def handler(request: httpx.Request) -> httpx.Response:
        if "fetch-news" in str(request.url):
            return httpx.Response(200, json=ROWS)
        return httpx.Response(503)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await news.fetch_news(client)
    assert len(result["items"]) == len(ROWS)
    assert all(i["source"] == "RSEB" for i in result["items"])
    assert "Kuensel" in result["errors"]


@pytest.mark.asyncio
async def test_rseb_failure_does_not_block_outlets(monkeypatch):
    monkeypatch.setattr(news, "configured_feeds", lambda: [("Kuensel", "https://kuenselonline.com/feed/")])
    rss = '<rss><channel><item><title>Kuensel headline on RICB</title><link>https://k.example/1</link></item></channel></rss>'

    def handler(request: httpx.Request) -> httpx.Response:
        if "fetch-news" in str(request.url):
            return httpx.Response(500)
        return httpx.Response(200, text=rss)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await news.fetch_news(client)
    assert [i["source"] for i in result["items"]] == ["Kuensel"]
    assert "RSEB" in result["errors"]


def test_atom_entries_are_read_like_rss_items():
    atom = """<feed xmlns="http://www.w3.org/2005/Atom"><entry>
      <title>DWAL declares bonus shares</title>
      <link rel="alternate" href="https://kuenselonline.com/dwal-bonus/"/>
      <published>2026-11-02T10:00:00+06:00</published>
    </entry></feed>"""
    items = news.parse_feed(atom, "Kuensel")
    assert len(items) == 1
    assert items[0]["url"] == "https://kuenselonline.com/dwal-bonus/"
    assert items[0]["symbols"] == ["DWAL"]
    assert items[0]["published"] == "2026-11-02"
