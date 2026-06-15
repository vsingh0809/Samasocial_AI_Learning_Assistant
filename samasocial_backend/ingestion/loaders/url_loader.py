# url_loader.py
# WHY requests + BS4 NOT aiohttp:
# Sync is simpler, no async chain issues
# requests is battle tested, handles redirects/SSL
import logging
import requests
from bs4 import BeautifulSoup
from langchain_core.documents import Document

log = logging.getLogger(__name__)


def load_url(url: str) -> list[Document]:
    """
    Scrape webpage and extract clean text.
    ASSIGNMENT CITATION: "from page title (url)"
    """
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
    except requests.exceptions.Timeout:
        raise ValueError(f"URL timed out after 15s: {url}")
    except requests.exceptions.ConnectionError:
        raise ValueError(f"Could not connect to: {url}")
    except requests.exceptions.HTTPError as e:
        raise ValueError(f"HTTP error {e.response.status_code} for: {url}")

    soup = BeautifulSoup(response.text, "html.parser")

    # Remove noise elements
    for tag in soup(["nav", "footer", "header", "script",
                     "style", "aside", "form", "iframe"]):
        tag.decompose()

    # Try main content areas first
    main = (
        soup.find("main") or
        soup.find("article") or
        soup.find(id="content") or
        soup.find(class_="content") or
        soup.find("body")
    )

    text = main.get_text(separator="\n") if main else soup.get_text(separator="\n")

    # Clean whitespace
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    clean_text = "\n".join(lines)

    if not clean_text:
        raise ValueError(f"No text content found at: {url}")

    page_title = soup.title.string.strip() if soup.title else url

    log.info(f"URL loaded: {len(clean_text)} chars from '{page_title}'")

    return [Document(
        page_content=clean_text,
        metadata={
            "source_type": "url",
            "source_file": url,
            "page_title": page_title,
            "citation": f"from '{page_title}' ({url})",
        }
    )]