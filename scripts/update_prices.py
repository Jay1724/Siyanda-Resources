#!/usr/bin/env python3
"""Fetch precious-metal spot prices from metals.dev and write assets/prices.json.

Needs the METALS_DEV_API_KEY environment variable. Exits non-zero (leaving the
old file untouched) on any error, so stale data simply ages out on the site.
Daily change is measured against the first price recorded on the current UTC day.
"""
import json, os, sys, urllib.parse, urllib.request
from datetime import datetime, timezone

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "prices.json")
METALS = [("gold", "Gold"), ("silver", "Silver"), ("platinum", "Platinum"),
          ("palladium", "Palladium"), ("rhodium", "Rhodium")]


def fetch(key):
    qs = urllib.parse.urlencode({"api_key": key, "currency": "USD", "unit": "toz"})
    req = urllib.request.Request("https://api.metals.dev/v1/latest?" + qs,
                                 headers={"Accept": "application/json", "User-Agent": "siyanda-site"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def zar_per_usd(resp):
    """Rand per 1 USD from the response's currency table, or None if unavailable.

    metals.dev may quote rates either as USD per unit of currency (~0.055 for ZAR)
    or units per USD (~18); the plausible range for ZAR tells us which.
    """
    r = (resp.get("currencies") or {}).get("ZAR")
    if not isinstance(r, (int, float)) or r <= 0:
        return None
    rate = 1 / r if r < 1 else r
    return round(rate, 4) if 5 <= rate <= 60 else None


def build(resp, previous, now):
    if resp.get("status") != "success":
        raise ValueError("API status: %r" % resp.get("status"))
    spot = resp.get("metals") or {}
    today = now.strftime("%Y-%m-%d")
    base = (previous or {}).get("baseline") or {}
    if base.get("date") != today:
        base = {"date": today, "prices": {i["name"]: i["price"] for i in (previous or {}).get("items", [])}}
    items, new_base = [], dict(base.get("prices", {}))
    for k, name in METALS:
        v = spot.get(k)
        if not isinstance(v, (int, float)) or v <= 0:
            continue
        ref = new_base.setdefault(name, v)
        items.append({"name": name, "price": round(v, 2), "change_pct": round((v - ref) / ref * 100, 2)})
    if not items:
        raise ValueError("no usable metal prices in response")
    return {"updated": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "currency": "USD", "unit": "toz", "usd_zar": zar_per_usd(resp),
            "items": items, "baseline": {"date": today, "prices": new_base}}


def main():
    key = os.environ.get("METALS_DEV_API_KEY")
    if not key:
        sys.exit("METALS_DEV_API_KEY is not set")
    try:
        previous = json.load(open(OUT))
    except (OSError, ValueError):
        previous = None
    data = build(fetch(key), previous, datetime.now(timezone.utc))
    with open(OUT, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    print("Wrote %d metals" % len(data["items"]))


if __name__ == "__main__":
    main()
