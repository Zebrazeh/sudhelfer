#!/usr/bin/env python3
"""Baut index.html aus src/app.html, src/core.js und vendor/jsQR-1.4.0.js.
Aufruf: python3 build.py"""
from pathlib import Path

root = Path(__file__).parent
app = (root / "src" / "app.html").read_text(encoding="utf-8")
core = (root / "src" / "core.js").read_text(encoding="utf-8")
jsqr = (root / "vendor" / "jsQR-1.4.0.js").read_text(encoding="utf-8")
head = "/*! jsQR 1.4.0 | https://github.com/cozmo/jsQR | Apache License 2.0 (Lizenztext: siehe „Lizenz anzeigen“) | unverändert */\n"
out = app.replace("/*__JSQR__*/", head + jsqr).replace("/*__CORE__*/", core)
(root / "index.html").write_text(out, encoding="utf-8")
print(f"index.html geschrieben ({len(out.encode('utf-8')) // 1024} KB)")
