"""GET dengan sidik jari TLS Chrome (curl_cffi).

Instagram menolak (429 / halaman HTML) klien yang TLS-nya terdeteksi bukan browser, seperti fetch bawaan
Node, walau cookies valid. Skrip ini dipanggil oleh src/lib/platforms/impersonate.ts.

stdin : {"url": "...", "headers": {...}, "timeout": 20, "follow": false}
stdout: {"status": 200, "location": null, "body": "..."}
"""
import json
import sys

from curl_cffi import requests

req = json.load(sys.stdin)
r = requests.get(
    req["url"],
    headers=req.get("headers") or {},
    impersonate="chrome",
    timeout=req.get("timeout", 20),
    allow_redirects=bool(req.get("follow")),
    max_redirects=5,
)
sys.stdout.write(json.dumps({"status": r.status_code, "location": r.headers.get("location"), "body": r.text}))
