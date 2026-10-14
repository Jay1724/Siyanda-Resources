# Siyanda Resources

Static site, deployed to GitHub Pages by `.github/workflows/pages.yml`.

Images are fetched from the original Wix host at build time by `download_images.py`
(into `assets/img/`, which is git-ignored). To preview locally: `python3 download_images.py && python3 -m http.server`.
