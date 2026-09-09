"""Static file server for local development.

Same as `python -m http.server`, but sends no-cache headers on every response
so edits to CSS/JS/HTML show up on a normal reload instead of being served
stale from the browser cache.
"""
import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    bind = sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1"
    httpd = ThreadingHTTPServer((bind, port), NoCacheHandler)
    print(f"Serving {sys.argv[0]!r} dir on http://{bind}:{port} (no-cache)")
    httpd.serve_forever()
