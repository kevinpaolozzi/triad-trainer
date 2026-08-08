#!/usr/bin/env python3
"""Dev server for local work: python3 serve.py [port]

Same as `python3 -m http.server` but with caching disabled. The stock
server sends only Last-Modified, which lets browsers reuse a stale
app.js on plain navigation — fresh HTML over old JS, and new features
appear to silently not work. no-store makes every refresh honest.
"""
import http.server
import sys

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    http.server.test(HandlerClass=NoCacheHandler, port=port)
