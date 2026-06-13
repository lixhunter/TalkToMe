"""
Vollständiger, höflicher Crawler für jena-digital.de
Scrapt: Hauptseite, alle Navigationsseiten, alle News-Artikel, alle Events
"""

import time
import json
import random
import re
import urllib.robotparser
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://jena-digital.de"
OUTPUT_FILE = "raw/jena_digital_full.json"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# Delay zwischen Requests (Sekunden) — erhöht um Rate-Limiting zu vermeiden
MIN_DELAY = 3
MAX_DELAY = 7

DATE_PATTERN = re.compile(r"\b\d{1,2}\.\d{1,2}\.\d{4}\b")

# Seiten die gecrawlt werden sollen (aus Navigation)
NAV_PAGES = [
    "/ueber-uns",
    "/ueber-uns/unsere-mitglieder",
    "/unser-oekosystem-1",
    "/unser-oekosystem/fachgruppen-arbeitskreise",
    "/unser-team",
    "/ueber-uns/mitglied-werden",
    "/ueber-uns/aktuelles",
    "/veranstaltungen",
    "/veranstaltungen/archiv",
    "/jedi",
    "/dehub",
]

# Bereiche die als Rauschen entfernt werden (Navigation, Footer, etc.)
NOISE_SELECTORS = [
    "nav", "header", "footer",
    "[class*='nav']", "[class*='menu']", "[class*='cookie']",
    "[class*='footer']", "[class*='header']",
    "script", "style", "noscript",
]


# ── Hilfsfunktionen ───────────────────────────────────────────────────────────

def check_robots_txt(base_url: str) -> urllib.robotparser.RobotFileParser:
    rp = urllib.robotparser.RobotFileParser()
    rp.set_url(urljoin(base_url, "/robots.txt"))
    try:
        rp.read()
    except Exception:
        pass
    return rp


def is_internal(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.netloc == "" or parsed.netloc == urlparse(BASE_URL).netloc


def polite_get(url: str, session: requests.Session, retries: int = 2) -> requests.Response | None:
    delay = random.uniform(MIN_DELAY, MAX_DELAY)
    print(f"    [{delay:.1f}s] {url}")
    time.sleep(delay)
    for attempt in range(retries + 1):
        try:
            r = session.get(url, headers=HEADERS, timeout=30)
            r.raise_for_status()
            return r
        except requests.HTTPError as e:
            print(f"    HTTP-Fehler {e.response.status_code} – übersprungen.")
            return None
        except requests.ReadTimeout:
            if attempt < retries:
                wait = 10 + attempt * 5
                print(f"    Timeout – warte {wait}s und versuche erneut ({attempt+1}/{retries})...")
                time.sleep(wait)
            else:
                print(f"    Timeout nach {retries+1} Versuchen – übersprungen.")
                return None
        except requests.RequestException as e:
            print(f"    Fehler: {e} – übersprungen.")
            return None
    return None


def clean_soup(soup: BeautifulSoup) -> BeautifulSoup:
    """Entfernt Rauschen (Nav, Footer, Scripts) aus dem Soup-Objekt."""
    for selector in NOISE_SELECTORS:
        for el in soup.select(selector):
            el.decompose()
    return soup


def extract_page_content(soup: BeautifulSoup, url: str) -> dict:
    """
    Extrahiert den Hauptinhalt einer Seite.
    TYPO3 nutzt .frame-Divs als Content-Blöcke.
    """
    title = soup.title.get_text(strip=True) if soup.title else None

    # Hauptinhalt: alle frame-type Blöcke, die keinen Menü-Inhalt haben
    content_blocks = []
    for frame in soup.select("[class*='frame-type']"):
        text = frame.get_text(separator="\n", strip=True)
        if len(text) > 50:  # Leere/winzige Blöcke überspringen
            content_blocks.append(text)

    # Fallback: alle p-Tags wenn keine frames gefunden
    if not content_blocks:
        paragraphs = [p.get_text(strip=True) for p in soup.select("p") if len(p.get_text(strip=True)) > 30]
        content_blocks = paragraphs

    full_text = "\n\n".join(content_blocks)

    # H-Überschriften sammeln
    headings = [h.get_text(strip=True) for h in soup.select("h1, h2, h3") if h.get_text(strip=True)]

    # Interne Links auf dieser Seite
    internal_links = []
    seen = set()
    for a in soup.select("a[href]"):
        href = a["href"]
        if is_internal(href) and href not in seen and href.startswith("/"):
            seen.add(href)
            internal_links.append({
                "label": a.get_text(strip=True)[:80],
                "path": href,
            })

    return {
        "url": url,
        "title": title,
        "headings": headings,
        "content": full_text,
        "internal_links": internal_links,
    }


# ── Hauptseite: strukturierte Extraktion ─────────────────────────────────────

def extract_news_cards(soup: BeautifulSoup) -> list[dict]:
    cards = []
    for card in soup.select("div.latest-news"):
        inner = card.select_one(".articletype-0")
        if not inner:
            continue
        title_el = inner.select_one("h3, h4, h2")
        link_el = card.select_one("a[href]")
        text = inner.get_text(separator=" ", strip=True)
        date_match = DATE_PATTERN.search(text)
        desc = re.sub(r"\s+", " ", text.replace(title_el.get_text(strip=True) if title_el else "", "")).strip()[:300]
        item = {
            "title": title_el.get_text(strip=True) if title_el else None,
            "date": date_match.group() if date_match else None,
            "url": urljoin(BASE_URL, link_el["href"]) if link_el else None,
            "teaser": desc or None,
        }
        if item["title"]:
            cards.append(item)
    return cards


def extract_event_cards(soup: BeautifulSoup) -> list[dict]:
    cards = []
    for card in soup.select("div.latest-news"):
        inner = card.select_one(".articletype-2")
        if not inner:
            continue
        title_el = inner.select_one("h3, h4, h2")
        link_el = card.select_one("a[href]")
        text = inner.get_text(separator=" ", strip=True)
        date_match = DATE_PATTERN.search(text)
        desc = re.sub(r"\s+", " ", text.replace(title_el.get_text(strip=True) if title_el else "", "")).strip()[:300]
        item = {
            "title": title_el.get_text(strip=True) if title_el else None,
            "date": date_match.group() if date_match else None,
            "url": link_el["href"] if link_el else None,
            "teaser": desc or None,
            "external": not is_internal(link_el["href"]) if link_el else False,
        }
        if item["title"]:
            cards.append(item)
    return cards


def extract_contact(soup: BeautifulSoup) -> dict:
    contact = {}
    for heading in soup.find_all(["h2", "h3"]):
        if "kontakt" in heading.get_text(strip=True).lower():
            parent = heading.find_parent("div")
            if parent:
                contact["raw_text"] = parent.get_text(separator=" | ", strip=True)[:600]
            break
    for a in soup.select("a[href^='mailto:']"):
        contact.setdefault("email", []).append(a["href"].replace("mailto:", "").strip())
    for a in soup.select("a[href^='tel:']"):
        contact.setdefault("phone", []).append(a["href"].replace("tel:", "").strip())
    for key in ("email", "phone"):
        if key in contact:
            contact[key] = list(dict.fromkeys(contact[key]))
    return contact


def extract_social_links(soup: BeautifulSoup) -> list[str]:
    platforms = ("facebook", "instagram", "linkedin", "twitter", "youtube", "xing")
    return list(dict.fromkeys(
        a["href"] for a in soup.select("a[href]")
        if any(p in a["href"] for p in platforms)
    ))


def extract_nav(soup: BeautifulSoup) -> list[dict]:
    items, seen = [], set()
    for nav in soup.select("nav"):
        for a in nav.select("a[href]"):
            href = urljoin(BASE_URL, a["href"])
            text = a.get_text(strip=True)
            if text and href not in seen and len(text) < 60:
                seen.add(href)
                items.append({"label": text, "url": href})
    return items


# ── News-Artikel-Links sammeln ────────────────────────────────────────────────

def collect_article_links(soup: BeautifulSoup) -> list[str]:
    links = set()
    for a in soup.select("a[href]"):
        href = a["href"]
        if is_internal(href) and "aktuelles/detail" in href:
            links.add(href)
    return sorted(links)


def collect_event_links_from_archive(soup: BeautifulSoup) -> list[str]:
    links = set()
    for a in soup.select("a[href]"):
        href = a["href"]
        if is_internal(href) and "veranstaltungen" in href and href != "/veranstaltungen":
            links.add(href)
    return sorted(links)


# ── Haupt-Crawl ───────────────────────────────────────────────────────────────

def crawl(session: requests.Session) -> dict:
    rp = check_robots_txt(BASE_URL)
    visited = set()
    result = {
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "base_url": BASE_URL,
        "homepage": {},
        "pages": {},
        "news_articles": [],
        "events_archive": [],
    }

    def can_fetch(path: str) -> bool:
        url = urljoin(BASE_URL, path)
        allowed = rp.can_fetch(HEADERS["User-Agent"], url)
        if not allowed:
            print(f"  [robots.txt] Gesperrt: {path}")
        return allowed

    # ── 1. Hauptseite ─────────────────────────────────────────────────────────
    print("\n=== Hauptseite ===")
    r = polite_get(BASE_URL, session)
    if r:
        soup = BeautifulSoup(r.text, "html.parser")
        result["homepage"] = {
            "url": BASE_URL,
            "title": soup.title.get_text(strip=True) if soup.title else None,
            "navigation": extract_nav(soup),
            "news_teaser": extract_news_cards(soup),
            "events_teaser": extract_event_cards(soup),
            "contact": extract_contact(soup),
            "social_links": extract_social_links(soup),
        }
        visited.add(BASE_URL)
        print(f"  News-Teaser: {len(result['homepage']['news_teaser'])}, "
              f"Events-Teaser: {len(result['homepage']['events_teaser'])}")

    # ── 2. Alle Navigationsseiten ─────────────────────────────────────────────
    print("\n=== Navigationsseiten ===")
    for path in NAV_PAGES:
        url = urljoin(BASE_URL, path)
        if url in visited or not can_fetch(path):
            continue
        r = polite_get(url, session)
        if not r:
            continue
        soup = BeautifulSoup(r.text, "html.parser")
        clean = clean_soup(BeautifulSoup(r.text, "html.parser"))
        page_data = extract_page_content(clean, url)
        result["pages"][path] = page_data
        visited.add(url)
        print(f"  {path}: {len(page_data['content'])} Zeichen")

        # Artikel-Links auf der Aktuelles-Seite einsammeln
        if "aktuelles" in path and "detail" not in path:
            article_paths = collect_article_links(soup)
            print(f"    → {len(article_paths)} Artikel-Links gefunden")
            for ap in article_paths:
                if ap not in [x.get("path") for x in result["news_articles"]]:
                    result["news_articles"].append({"path": ap, "content": None})

        # Event-Links aus dem Archiv einsammeln
        if "archiv" in path:
            archive_paths = collect_event_links_from_archive(soup)
            print(f"    → {len(archive_paths)} Archiv-Links gefunden")
            for ep in archive_paths:
                if ep not in [x.get("path") for x in result["events_archive"]]:
                    result["events_archive"].append({"path": ep, "content": None})

    # ── 3. Einzelne News-Artikel ──────────────────────────────────────────────
    print("\n=== News-Artikel (Volltext) ===")
    for i, article in enumerate(result["news_articles"]):
        path = article["path"]
        url = urljoin(BASE_URL, path)
        if url in visited or not can_fetch(path):
            continue
        r = polite_get(url, session)
        if not r:
            continue
        soup = clean_soup(BeautifulSoup(r.text, "html.parser"))
        article["content"] = extract_page_content(soup, url)
        visited.add(url)
        title = article["content"].get("title", path)
        print(f"  [{i+1}/{len(result['news_articles'])}] {title[:70]}")

    # ── 4. Veranstaltungs-Archiv ──────────────────────────────────────────────
    if result["events_archive"]:
        print("\n=== Events-Archiv (Volltext) ===")
        for i, event in enumerate(result["events_archive"]):
            path = event["path"]
            url = urljoin(BASE_URL, path)
            if url in visited or not can_fetch(path):
                continue
            r = polite_get(url, session)
            if not r:
                continue
            soup = clean_soup(BeautifulSoup(r.text, "html.parser"))
            event["content"] = extract_page_content(soup, url)
            visited.add(url)
            title = event["content"].get("title", path)
            print(f"  [{i+1}/{len(result['events_archive'])}] {title[:70]}")

    print(f"\n✓ Fertig. {len(visited)} Seiten gecrawlt.")
    return result


def main():
    session = requests.Session()
    session.headers.update(HEADERS)

    data = crawl(session)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # Zusammenfassung
    print(f"\nGespeichert in: {OUTPUT_FILE}")
    print(f"  Navigationsseiten: {len(data['pages'])}")
    print(f"  News-Artikel:      {sum(1 for a in data['news_articles'] if a['content'])}")
    print(f"  Archiv-Events:     {sum(1 for e in data['events_archive'] if e['content'])}")


if __name__ == "__main__":
    main()
