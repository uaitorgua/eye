"""Local preview server for site/ that never lets the browser cache files.

The plain `python -m http.server` sends no Cache-Control header, so browsers keep old copies of
JavaScript modules and a page can load new HTML with stale scripts (import errors, missing features).
The real site already answers with `Cache-Control: no-cache`; this matches it for local work.

    python tests/serve.py [port]      # default 8765, serves ./site
"""
import functools
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    site = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site')
    handler = functools.partial(NoCacheHandler, directory=site)
    with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as server:
        print(f'Serving {os.path.normpath(site)} at http://localhost:{port}')
        server.serve_forever()
