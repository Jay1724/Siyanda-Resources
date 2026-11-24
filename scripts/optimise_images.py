#!/usr/bin/env python3
"""Shrinks oversized photos in assets/img so pages load and scroll smoothly.
Run from the repo root:   python3 scripts/optimise_images.py
Safe to re-run: files already small enough are left alone. Needs Pillow (pip install pillow)."""
import io, os, sys
from PIL import Image, ImageOps

DEST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "img")
MAX_SIDE = 2400                      # sharp on a 1920px screen, a fraction of the camera original
SMALL = {"7e9495_835a3382bc764507a0e56973014b50b6_mv2.png": 400}   # the logo is shown at <=90px tall

saved = 0
for name in sorted(os.listdir(DEST)):
    path = os.path.join(DEST, name)
    ext = name.lower().rsplit(".", 1)[-1]
    if ext not in ("jpg", "jpeg", "png", "webp") or not os.path.isfile(path):
        continue
    before = os.path.getsize(path)
    with Image.open(path) as im:
        im.load()
        limit = SMALL.get(name, MAX_SIDE)
        if max(im.size) <= limit and before < 600_000:
            continue
        im = ImageOps.exif_transpose(im)
        if max(im.size) > limit:
            im.thumbnail((limit, limit), Image.LANCZOS)
        out = io.BytesIO()
        if ext in ("jpg", "jpeg"):
            im.convert("RGB").save(out, "JPEG", quality=82, optimize=True, progressive=True)
        elif ext == "webp":
            im.save(out, "WEBP", quality=82, method=6)
        else:
            im.save(out, "PNG", optimize=True)
    if out.tell() < before:
        with open(path, "wb") as f:
            f.write(out.getvalue())
        saved += before - out.tell()
        print("  %-60s %6d KB -> %5d KB" % (name, before // 1024, out.tell() // 1024))
print("Saved %.1f MB" % (saved / 1048576))
