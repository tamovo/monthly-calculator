import http.server
import json
import os
import webbrowser
import threading
import sys
import datetime

PORT          = 5000
DIR           = os.path.dirname(os.path.abspath(__file__))
DATA_DIR      = os.path.join(DIR, 'data')
DATA_LEGACY   = os.path.join(DIR, 'data.json')
SETTINGS_FILE = os.path.join(DATA_DIR, '_settings.json')
HTML          = os.path.join(DIR, 'index.html')


def _has_month_data(month_data: dict) -> bool:
    accounts     = month_data.get('accounts', [])
    has_expenses = any(bool(a.get('expenses')) for a in accounts)
    has_personal = bool(month_data.get('personal'))
    return has_expenses or has_personal


def _save_data(parsed: dict) -> None:
    """Write settings + each month atomically to DATA_DIR."""
    os.makedirs(DATA_DIR, exist_ok=True)

    # --- global settings ---
    settings = {'currency':         parsed.get('currency', '£'),
                'mortgage':         parsed.get('mortgage', 0),
                'recurringCosts':   parsed.get('recurringCosts', []),
                'accountTemplates': parsed.get('accountTemplates', [])}
    tmp = SETTINGS_FILE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(settings, f, indent=2)
    os.replace(tmp, SETTINGS_FILE)

    # --- per-month files ---
    ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    for month_key, month_data in parsed.get('data', {}).items():
        # Remove old file(s) for this month
        for fname in os.listdir(DATA_DIR):
            if fname.startswith(month_key + '_') and fname.endswith('.json'):
                os.remove(os.path.join(DATA_DIR, fname))
        # Only write if the month contains actual data
        if not _has_month_data(month_data):
            continue
        fpath = os.path.join(DATA_DIR, f'{month_key}_{ts}.json')
        tmp   = fpath + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(month_data, f, indent=2)
        os.replace(tmp, fpath)


def _load_payload() -> dict:
    """Assemble the full payload from per-month files + settings."""
    settings = {}
    if os.path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
            settings = json.load(f)

    month_data = {}
    if os.path.exists(DATA_DIR):
        for fname in sorted(os.listdir(DATA_DIR)):
            if fname.startswith('_') or not fname.endswith('.json'):
                continue
            month_key = fname.split('_')[0]   # "2026-04"
            fpath = os.path.join(DATA_DIR, fname)
            with open(fpath, 'r', encoding='utf-8') as f:
                month_data[month_key] = json.load(f)

    return {
        'currency':         settings.get('currency', '£'),
        'mortgage':         settings.get('mortgage', 0),
        'recurringCosts':   settings.get('recurringCosts', []),
        'accountTemplates': settings.get('accountTemplates', []),
        'data':             month_data,
    }


def _migrate() -> None:
    """One-time migration: split legacy data.json into per-month files."""
    if os.path.exists(DATA_LEGACY) and not os.path.exists(DATA_DIR):
        with open(DATA_LEGACY, 'r', encoding='utf-8') as f:
            payload = json.load(f)
        _save_data(payload)
        os.rename(DATA_LEGACY, DATA_LEGACY + '.bak')
        print('  Migrated data.json → data/ folder (backup kept as data.json.bak)')


class Handler(http.server.BaseHTTPRequestHandler):

    def do_GET(self):
        if self.path in ('/', '/index.html'):
            self._serve_file(HTML, 'text/html; charset=utf-8')
        elif self.path == '/api/data':
            payload = _load_payload()
            self._respond(200, 'application/json',
                          json.dumps(payload).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == '/api/data':
            length = int(self.headers.get('Content-Length', 0))
            body   = self.rfile.read(length)

            try:
                parsed = json.loads(body)
            except json.JSONDecodeError as e:
                self._respond(400, 'application/json',
                              json.dumps({'ok': False, 'error': str(e)}).encode())
                return

            if not isinstance(parsed.get('data'), dict):
                self._respond(400, 'application/json',
                              b'{"ok":false,"error":"missing or invalid data key"}')
                return

            try:
                _save_data(parsed)
            except OSError as e:
                self._respond(500, 'application/json',
                              json.dumps({'ok': False, 'error': str(e)}).encode())
                return

            self._respond(200, 'application/json', b'{"ok":true}')
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def _respond(self, code, content_type, body):
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def _serve_file(self, path, content_type):
        with open(path, 'rb') as f:
            data = f.read()
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_):
        pass  # silence per-request logs


if __name__ == '__main__':
    _migrate()

    try:
        server = http.server.HTTPServer(('localhost', PORT), Handler)
    except OSError:
        print(f'Port {PORT} is already in use — another instance may be running.')
        input('Press Enter to exit.')
        sys.exit(1)

    print('=' * 44)
    print('  Monthly Calculator')
    print(f'  http://localhost:{PORT}')
    print('  Press Ctrl+C to stop.')
    print('=' * 44)

    threading.Timer(0.8, lambda: webbrowser.open(f'http://localhost:{PORT}')).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped.')
