#!/usr/bin/env python3
"""Scrape StarStable DB pages and build a local checklist dataset."""

from __future__ import annotations

import datetime as dt
import json
import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urldefrag, urljoin, urlparse

import requests


BASE_URL = "https://ssodb.bplaced.net/db/index.html"
BASE_HOST = "ssodb.bplaced.net"
BASE_PATH_PREFIX = "/db/"
OUTPUT_DIR = Path("data")

ITEM_CATEGORIES = [
    "accessories",
    "bags",
    "clothes",
    "decorations",
    "equipment",
    "hairstyles",
    "horses",
    "makeup",
    "pets",
]

HORSE_COLORS = {
    "f11": "Black",
    "f12": "Gray",
    "f13": "White",
    "f14": "Creamy",
    "f15": "Red Brown",
    "f16": "Light Brown",
    "f17": "Brown",
    "f18": "Dark Brown",
}


@dataclass
class PageRecord:
    url: str
    status: int
    title: str
    scripts: list[str]
    links: list[str]


def get_text(session: requests.Session, url: str, referer: str | None = None) -> requests.Response:
    headers = {"User-Agent": "StarStableChecklistScraper/1.0"}
    if referer:
        headers["Referer"] = referer
    return session.get(url, headers=headers, timeout=45)


def extract_title(html: str) -> str:
    m = re.search(r"<title>(.*?)</title>", html, flags=re.IGNORECASE | re.DOTALL)
    if not m:
        return ""
    return re.sub(r"\s+", " ", m.group(1)).strip()


def extract_attr_values(html: str, tag: str, attr: str) -> list[str]:
    pattern = rf"<{tag}\b[^>]*\b{attr}\s*=\s*['\"]([^'\"]+)['\"]"
    return re.findall(pattern, html, flags=re.IGNORECASE)


def normalize_internal_html_url(raw_url: str, current_url: str) -> str | None:
    if raw_url.startswith(("mailto:", "javascript:", "#")):
        return None
    absolute = urldefrag(urljoin(current_url, raw_url))[0]
    parsed = urlparse(absolute)
    if parsed.netloc != BASE_HOST:
        return None
    if not parsed.path.startswith(BASE_PATH_PREFIX):
        return None
    if not parsed.path.lower().endswith(".html"):
        return None
    return absolute


def crawl_pages(session: requests.Session) -> tuple[list[PageRecord], dict[str, set[str]]]:
    queue = [BASE_URL]
    seen: set[str] = set()
    pages: list[PageRecord] = []
    script_to_pages: dict[str, set[str]] = defaultdict(set)

    while queue:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)

        try:
            response = get_text(session, url)
        except requests.RequestException:
            pages.append(PageRecord(url=url, status=0, title="", scripts=[], links=[]))
            continue

        html = response.text
        links: list[str] = []
        for href in extract_attr_values(html, "a", "href"):
            normalized = normalize_internal_html_url(href, url)
            if not normalized:
                continue
            links.append(normalized)
            if normalized not in seen and normalized not in queue:
                queue.append(normalized)

        scripts: list[str] = []
        for src in extract_attr_values(html, "script", "src"):
            absolute = urldefrag(urljoin(url, src))[0]
            scripts.append(absolute)
            if ".min.js" in absolute and "/db" in absolute and "db" in absolute:
                script_to_pages[absolute].add(url)

        pages.append(
            PageRecord(
                url=url,
                status=response.status_code,
                title=extract_title(html),
                scripts=sorted(set(scripts)),
                links=sorted(set(links)),
            )
        )

    pages.sort(key=lambda page: page.url)
    return pages, script_to_pages


def derive_data_url(script_url: str) -> str | None:
    parsed = urlparse(script_url)
    filename = parsed.path.rsplit("/", 1)[-1]
    m = re.match(r"db(?:-([a-z]{2}))?\.([a-z0-9-]+)\.min\.js$", filename)
    if not m:
        return None

    lang, category = m.groups()
    if category in {"index", "horses-start"}:
        return None

    script_dir = parsed.path.rsplit("/media/js/", 1)[0]
    if lang:
        data_path = f"{script_dir}/data/db-{lang}.{category}.json"
    else:
        data_path = f"{script_dir}/data/db-de.{category}.json"
    return f"{parsed.scheme}://{parsed.netloc}{data_path}"


def fetch_data_endpoints(
    session: requests.Session, script_to_pages: dict[str, set[str]]
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    endpoint_to_referer: dict[str, str] = {}
    endpoint_to_script: dict[str, str] = {}

    for script_url, source_pages in script_to_pages.items():
        data_url = derive_data_url(script_url)
        if not data_url:
            continue
        referer = sorted(source_pages)[0]
        endpoint_to_referer[data_url] = referer
        endpoint_to_script[data_url] = script_url

    endpoint_records: list[dict[str, Any]] = []
    fetched_json: dict[str, Any] = {}

    for endpoint_url in sorted(endpoint_to_referer):
        referer = endpoint_to_referer[endpoint_url]
        try:
            response = get_text(session, endpoint_url, referer=referer)
            text = response.text
            parsed_json: Any = None
            is_json = "json" in (response.headers.get("content-type") or "").lower()
            if is_json:
                try:
                    parsed_json = response.json()
                except json.JSONDecodeError:
                    parsed_json = None
            if parsed_json is not None:
                fetched_json[endpoint_url] = parsed_json
            top_keys: list[str] = []
            row_count = 0
            if isinstance(parsed_json, dict):
                top_keys = sorted(parsed_json.keys())
                if isinstance(parsed_json.get("aaData"), list):
                    row_count = len(parsed_json["aaData"])
            endpoint_records.append(
                {
                    "url": endpoint_url,
                    "status": response.status_code,
                    "referer": referer,
                    "script": endpoint_to_script[endpoint_url],
                    "contentType": response.headers.get("content-type", ""),
                    "isJson": parsed_json is not None,
                    "bytes": len(response.content),
                    "topKeys": top_keys,
                    "rowCount": row_count,
                }
            )
        except requests.RequestException:
            endpoint_records.append(
                {
                    "url": endpoint_url,
                    "status": 0,
                    "referer": referer,
                    "script": endpoint_to_script[endpoint_url],
                    "contentType": "",
                    "isJson": False,
                    "bytes": 0,
                    "topKeys": [],
                    "rowCount": 0,
                }
            )

    return endpoint_records, fetched_json


def as_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def get_cell(row: list[Any], index: int, default: Any = None) -> Any:
    if 0 <= index < len(row):
        return row[index]
    return default


def lookup(mapping: Any, key: Any, default: str = "") -> str:
    if not isinstance(mapping, dict):
        return default
    text_key = str(key)
    value = mapping.get(text_key, default)
    if value is None:
        return default
    return str(value)


def normalize_image_id(category: str, raw_id: Any) -> str | None:
    if not isinstance(raw_id, str):
        return None
    if len(raw_id) >= 20 and raw_id[18:20] == "10":
        fallback = "dummy-small.webp" if category == "horses" else "dummy.webp"
        return f"https://ssodb.bplaced.net/db/items/{fallback}"
    suffix = "-small.webp" if category == "horses" else ".webp"
    return f"https://ssodb.bplaced.net/db/items/{raw_id}{suffix}"


def make_location(ao_sso: dict[str, Any], site_id: Any, shop_id: Any | None) -> tuple[str, str]:
    site_name = lookup(ao_sso.get("aSites"), site_id, default="")
    shop_name = lookup(ao_sso.get("aShops"), shop_id, default="") if shop_id is not None else ""
    location = site_name
    if shop_name:
        location = f"{site_name} / {shop_name}"
    return location, shop_name


def item_id(category: str, key: Any) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_-]+", "-", str(key)).strip("-")
    if not safe:
        safe = "item"
    return f"{category}-{safe}"


def normalize_category_rows(category: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
    ao_sso = payload.get("aoSSO", {})
    rows = payload.get("aaData", [])
    if not isinstance(rows, list):
        return []

    items: list[dict[str, Any]] = []

    base_config: dict[str, dict[str, int]] = {
        "accessories": {"img": 0, "type": 1, "title": 2, "desc": 3, "js": 7, "sc": 8, "lvl": 9, "site": 11, "shop": 12, "new": 14},
        "bags": {"img": 0, "type": 1, "title": 2, "desc": 3, "js": 6, "sc": 7, "lvl": 8, "site": 10, "shop": 11, "new": 13},
        "decorations": {"img": 0, "type": 1, "title": 2, "desc": 3, "js": 6, "sc": 7, "lvl": 8, "site": 10, "shop": 11, "new": 13},
        "pets": {"img": 0, "type": 1, "title": 2, "desc": 3, "js": 6, "sc": 7, "lvl": -1, "site": 9, "shop": 10, "new": 12},
        "clothes": {"img": 0, "type": 1, "subtype": 2, "title": 3, "desc": 4, "js": 7, "sc": 8, "lvl": 9, "site": 15, "shop": 16, "new": 18},
        "equipment": {"img": 0, "type": 1, "subtype": 2, "title": 3, "desc": 4, "js": 7, "sc": 8, "lvl": 9, "site": 15, "shop": 16, "new": 18},
        "hairstyles": {"img": 0, "type": 1, "color": 2, "js": 3, "sc": 4, "lvl": -1, "site": 5, "shop": 6, "new": 8},
        "horses": {"img": 0, "type": 1, "subtype": 2, "color": 3, "js": -1, "sc": 4, "lvl": 5, "site": 12, "shop": -1, "new": 14},
    }

    cfg = base_config.get(category)

    for row in rows:
        if not isinstance(row, list):
            continue

        if category == "makeup":
            type_id = as_int(get_cell(row, 0))
            if type_id is None:
                continue
            notes = get_cell(row, 9, "")
            shops = get_cell(row, 11, []) or []
            locations: list[str] = []
            for shop_code in shops if isinstance(shops, list) else []:
                site_code = as_int(shop_code)
                if site_code is None:
                    continue
                site_key = site_code // 100
                site_name = lookup(ao_sso.get("aSites"), site_key)
                shop_name = lookup(ao_sso.get("aShops"), shop_code)
                if site_name and shop_name:
                    locations.append(f"{site_name} / {shop_name}")
                elif site_name:
                    locations.append(site_name)
            items.append(
                {
                    "id": item_id(category, type_id),
                    "category": category,
                    "title": f"Makeup #{type_id:02d}",
                    "description": notes if isinstance(notes, str) else "",
                    "type": "Makeup",
                    "subtype": "",
                    "imageUrl": f"https://ssodb.bplaced.net/db/media/images/makeup/makeup_{type_id:02d}.webp",
                    "priceJs": None,
                    "priceSc": None,
                    "level": None,
                    "location": " | ".join(locations),
                    "shop": "",
                    "isNew": as_int(get_cell(row, 12)) == 1,
                }
            )
            continue

        if cfg is None:
            continue

        raw_img_id = get_cell(row, cfg["img"])
        raw_type_id = get_cell(row, cfg["type"])
        raw_subtype_id = get_cell(row, cfg.get("subtype", -1))
        raw_site_id = get_cell(row, cfg["site"])
        raw_shop_id = get_cell(row, cfg["shop"]) if cfg["shop"] >= 0 else None

        type_label = lookup(ao_sso.get("aTypes"), raw_type_id, default=str(raw_type_id))
        subtype_label = ""

        if category in {"clothes", "equipment"}:
            subtype_groups = ao_sso.get("aSubTypes")
            if isinstance(subtype_groups, list):
                group_index = as_int(raw_type_id)
                subtype_index = as_int(raw_subtype_id)
                if group_index is not None and subtype_index is not None:
                    group_index -= 10 if category == "clothes" else 20
                    if 0 <= group_index < len(subtype_groups):
                        group = subtype_groups[group_index]
                        if isinstance(group, list) and 0 <= subtype_index < len(group):
                            subtype_label = str(group[subtype_index])

        if category == "horses":
            subtype_map = ao_sso.get("aSubTypes", {}).get(str(as_int(raw_type_id) - 600), {})
            subtype_index = as_int(raw_subtype_id)
            if isinstance(subtype_map, list) and subtype_index is not None and 0 <= subtype_index < len(subtype_map):
                subtype_label = str(subtype_map[subtype_index])
            elif isinstance(subtype_map, dict):
                subtype_label = lookup(subtype_map, raw_subtype_id, default="")

        if category in {"accessories", "bags", "decorations", "pets"}:
            title = str(get_cell(row, cfg["title"], "")).strip()
            description = str(get_cell(row, cfg["desc"], "")).strip()
        elif category in {"clothes", "equipment"}:
            title = str(get_cell(row, cfg["title"], "")).strip()
            description = str(get_cell(row, cfg["desc"], "")).strip()
        elif category == "hairstyles":
            title = type_label
            description = str(get_cell(row, cfg["color"], "")).strip()
        elif category == "horses":
            title = type_label
            if subtype_label:
                title = f'{type_label} "{subtype_label}"'
            raw_colors = str(get_cell(row, cfg["color"], "")).strip()
            color_names = [HORSE_COLORS.get(part, part) for part in raw_colors.split(",") if part]
            description = ", ".join(color_names)
        else:
            title = str(raw_type_id)
            description = ""

        location, shop_name = make_location(ao_sso, raw_site_id, raw_shop_id)

        level = as_int(get_cell(row, cfg["lvl"])) if cfg["lvl"] >= 0 else None
        price_js = as_int(get_cell(row, cfg["js"])) if cfg["js"] >= 0 else None
        price_sc = as_int(get_cell(row, cfg["sc"])) if cfg["sc"] >= 0 else None
        if price_js is not None and price_js <= 0:
            price_js = None
        if price_sc is not None and price_sc <= 0:
            price_sc = None

        stable_key = raw_img_id if raw_img_id is not None else f"{raw_type_id}-{raw_subtype_id}"
        items.append(
            {
                "id": item_id(category, stable_key),
                "category": category,
                "title": title,
                "description": description,
                "type": type_label,
                "subtype": subtype_label,
                "imageUrl": normalize_image_id(category, raw_img_id),
                "priceJs": price_js,
                "priceSc": price_sc,
                "level": level,
                "location": location,
                "shop": shop_name,
                "isNew": as_int(get_cell(row, cfg["new"])) == 1,
            }
        )

    return items


def build_items_dataset(fetched_json: dict[str, Any]) -> dict[str, Any]:
    category_payloads: dict[str, dict[str, Any]] = {}
    for endpoint_url, payload in fetched_json.items():
        m = re.search(r"/db/en/data/db-en\.([a-z0-9-]+)\.json$", endpoint_url)
        if not m:
            continue
        category = m.group(1)
        if category not in ITEM_CATEGORIES:
            continue
        if isinstance(payload, dict):
            category_payloads[category] = payload

    all_items: list[dict[str, Any]] = []
    counts: dict[str, int] = {}
    for category in ITEM_CATEGORIES:
        payload = category_payloads.get(category)
        if not payload:
            counts[category] = 0
            continue
        normalized = normalize_category_rows(category, payload)
        normalized.sort(key=lambda item: (item["title"].lower(), item["id"]))
        counts[category] = len(normalized)
        all_items.extend(normalized)

    all_items.sort(key=lambda item: (item["category"], item["title"].lower(), item["id"]))

    return {
        "generatedAt": dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "sourceSite": "https://ssodb.bplaced.net/db/index.html",
        "language": "en",
        "itemCount": len(all_items),
        "countsByCategory": counts,
        "items": all_items,
    }


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with requests.Session() as session:
        pages, script_to_pages = crawl_pages(session)
        endpoints, fetched_json = fetch_data_endpoints(session, script_to_pages)
        items_dataset = build_items_dataset(fetched_json)

    scrape_manifest = {
        "generatedAt": dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "baseUrl": BASE_URL,
        "pageCount": len(pages),
        "pages": [
            {
                "url": page.url,
                "status": page.status,
                "title": page.title,
                "scriptCount": len(page.scripts),
                "linkCount": len(page.links),
                "scripts": page.scripts,
                "links": page.links,
            }
            for page in pages
        ],
        "dataEndpointCount": len(endpoints),
        "dataEndpoints": endpoints,
    }

    (OUTPUT_DIR / "scrape_manifest.json").write_text(
        json.dumps(scrape_manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (OUTPUT_DIR / "items.json").write_text(
        json.dumps(items_dataset, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (OUTPUT_DIR / "items.js").write_text(
        "globalThis.STARSTABLE_ITEMS = "
        + json.dumps(items_dataset, ensure_ascii=False)
        + ";\n",
        encoding="utf-8",
    )

    json_success = sum(1 for endpoint in endpoints if endpoint["isJson"])
    print(f"Pages crawled: {len(pages)}")
    print(f"Data endpoints checked: {len(endpoints)} (JSON ok: {json_success})")
    print(f"Checklist items written: {items_dataset['itemCount']}")
    print(f"Output: {(OUTPUT_DIR / 'items.json').resolve()}")


if __name__ == "__main__":
    main()
