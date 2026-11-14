"""Serve ext/ for testing: the terminal page on its own
(http://localhost:8202/term/index.html?demo=1), or the content script
injected into bsky.app. /proxy?u= fetches Bluesky's pictures for it. No caching, plus the CORS and Private Network Access
headers Chrome needs before a public page may load scripts from localhost.

    python tools/serve.py [port]
"""
import sys
import urllib.request
from functools import partial
from urllib.parse import parse_qs, urlparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

EXT = Path(__file__).resolve().parent.parent / 'ext'


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript'}

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    # /proxy?u=<cdn.bsky.app or video.bsky.app URL>: pictures for the page
    # when it runs from here, standing in for the extension's host permission.
    def do_GET(self):
        url = urlparse(self.path)
        if url.path != '/proxy':
            return super().do_GET()
        u = parse_qs(url.query).get('u', [''])[0]
        if urlparse(u).hostname not in ('cdn.bsky.app', 'video.bsky.app') or not u.startswith('https://'):
            return self.send_error(403)
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'cathodeskyone-test'}), timeout=15) as r:
                body, kind = r.read(), r.headers.get('Content-Type', 'image/jpeg')
        except Exception:
            return self.send_error(502)
        self.send_response(200)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8202
ThreadingHTTPServer(('127.0.0.1', port), partial(Handler, directory=str(EXT))).serve_forever()
