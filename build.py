#!/usr/bin/env python3
"""Baut die App.

  python3 build.py
      erzeugt index.html (eine Datei, läuft überall, auch offline aus dem Download)

  python3 build.py --web ZIELORDNER [--legal-url URL]
      erzeugt zusätzlich die Web-Version für den eigenen Webspace (HTTPS nötig):
      index.html mit Home-Bildschirm-Unterstützung, Service Worker für den Offline-Betrieb,
      Manifest und Icons. --legal-url setzt einen Link „Impressum & Datenschutz“ in die App.
"""
import argparse, hashlib, json, shutil
from pathlib import Path

root = Path(__file__).parent
app = (root / "src" / "app.html").read_text(encoding="utf-8")
core = (root / "src" / "core.js").read_text(encoding="utf-8")
jsqr = (root / "vendor" / "jsQR-1.4.0.js").read_text(encoding="utf-8")
head = "/*! jsQR 1.4.0 | https://github.com/cozmo/jsQR | Apache License 2.0 (Lizenztext: siehe „Lizenz anzeigen“) | unverändert */\n"
base = app.replace("/*__JSQR__*/", head + jsqr).replace("/*__CORE__*/", core)

def write(path, text):
    path.write_text(text, encoding="utf-8")
    print(f"{path} geschrieben ({len(text.encode('utf-8')) // 1024} KB)")

ap = argparse.ArgumentParser()
ap.add_argument("--web", metavar="ZIELORDNER")
ap.add_argument("--legal-url", metavar="URL")
args = ap.parse_args()

write(root / "index.html", base.replace("<!--__PWA_HEAD__-->\n", "").replace("/*__PWA_SW__*/\n", ""))

if args.web:
    out = Path(args.web); out.mkdir(parents=True, exist_ok=True)
    pwa_head = (
        '<link rel="manifest" href="manifest.webmanifest">\n'
        '<link rel="icon" href="icon-192.png">\n'
        '<link rel="apple-touch-icon" href="apple-touch-icon.png">\n'
        '<meta name="theme-color" content="#9a4a1c">\n'
        '<meta name="mobile-web-app-capable" content="yes">\n'
        '<meta name="apple-mobile-web-app-capable" content="yes">\n'
        '<meta name="apple-mobile-web-app-title" content="Sudhelfer">\n'
    )
    pwa_sw = ("if ('serviceWorker' in navigator && window.isSecureContext) {\n"
              "  window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });\n"
              "}\n")
    web = base.replace("<!--__PWA_HEAD__-->\n", pwa_head).replace("/*__PWA_SW__*/\n", pwa_sw)
    web = web.replace("/*__LEGAL__*/null", json.dumps(args.legal_url) if args.legal_url else "null")
    write(out / "index.html", web)
    version = hashlib.sha256(web.encode("utf-8")).hexdigest()[:10]
    write(out / "sw.js", (root / "web" / "sw.js").read_text(encoding="utf-8").replace("__VERSION__", version))
    for name in ["manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"]:
        shutil.copyfile(root / "web" / name, out / name)
    print(f"Web-Version in {out} (Cache-Version {version})")
