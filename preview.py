"""Preview the actual public homepage without changing NewAPI settings."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


class PreviewHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        if path.startswith('/beiapi-home/'):
            path = path.removeprefix('/beiapi-home')
        return super().translate_path(path)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/beiapi-home':
            self.send_response(302)
            self.send_header('Location', '/beiapi-home/')
            self.end_headers()
            return
        if path.rstrip('/') in ('/campus-partner', '/sign-in'):
            self.send_response(302)
            self.send_header('Location', 'http://localhost:3001' + self.path)
            self.end_headers()
            return
        super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8787)
    args = parser.parse_args()
    public = Path(__file__).resolve().parent / 'public'
    handler = partial(PreviewHandler, directory=str(public))
    server = ThreadingHTTPServer(('127.0.0.1', args.port), handler)
    print(f'Local: http://localhost:{args.port}/beiapi-home/#campus-partner', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
