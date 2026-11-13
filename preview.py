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
        if path == '/beiapi-home/':
            # Match the production iframe: the homepage hides its own header.
            page = b'''<!doctype html>
<html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BeiAPI local preview</title>
<style>html,body{margin:0;height:100%;overflow:hidden}iframe{display:block;width:100%;height:100%;border:0}</style>
<iframe src="/beiapi-home/index.html" title="BeiAPI homepage preview"></iframe>
</html>'''
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(page)))
            self.end_headers()
            self.wfile.write(page)
            return
        if path == '/beiapi-home':
            self.send_response(302)
            self.send_header('Location', '/beiapi-home/')
            self.end_headers()
            return
        if path.rstrip('/') in ('/campus-partner', '/sign-in', '/dashboard', '/pricing'):
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
    print(f'Local: http://localhost:{args.port}/beiapi-home/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
