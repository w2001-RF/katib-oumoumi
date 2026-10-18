"""A local stand-in for Supabase, for the Robot Framework tests.

One HTTP server that:
  - serves the app's static files from the repository root, with a generated
    `supabase-config.js` pointing the app at this same server;
  - answers the subset of Supabase the app uses: PostgREST (/rest/v1: tables,
    the v_template_fields view, RPCs), Auth (/auth/v1: password sign-in,
    refresh, logout) and the agent-status Edge Function (/functions/v1).

Data lives in memory and is reset from `seed_data.py` before each test, so
tests never touch the real project (dev and prod share one database).
Row level security is imitated: anonymous visitors only read published
documents and can only insert into generated_documents; everything else
needs the admin's access token.
"""

from __future__ import annotations

import base64
import copy
import json
import re
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlsplit

from seed_data import ADMIN_EMAIL, ADMIN_PASSWORD, ANON_KEY, agent_dashboard, agent_status, seed

REPO_ROOT = Path(__file__).resolve().parents[3]
ACCESS_TTL_S = 3600

# Columns a client may not write, filled by the "database".
DEFAULTS = {
    'categories': {'icon': 'folder', 'sort_order': 0},
    'document_types': {'description_ar': '', 'icon': 'document', 'is_published': True, 'usage_count': 0, 'sort_order': 0,
                       'template_body': '', 'next_steps_ar': ''},
    'generated_documents': {},
}
# on delete cascade
CASCADES = {
    'categories': [('document_types', 'category_id')],
    'document_types': [('document_type_fields', 'document_type_id'), ('generated_documents', 'document_type_id')],
    'option_lists': [('option_list_items', 'list_id')],
}
PUBLIC_READ = {'categories', 'document_types', 'v_template_fields', 'option_lists', 'option_list_items', 'field_definitions'}
PUBLIC_INSERT = {'generated_documents'}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def _b64(data: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip('=')


class MockState:
    """The database, the issued tokens and the switches tests flip."""

    def __init__(self):
        self.lock = threading.RLock()
        self.reset()

    def reset(self):
        with self.lock:
            self.tables = seed()
            self.access_tokens: set[str] = set()
            self.refresh_tokens: set[str] = set()
            self.failures: list[dict] = []  # injected errors, see fail_requests()
            self.requests: list[tuple[str, str]] = []

    # --- auth ------------------------------------------------------------------
    def issue_session(self) -> dict:
        exp = int(time.time()) + ACCESS_TTL_S
        user = {'id': 'admin-user', 'aud': 'authenticated', 'role': 'authenticated', 'email': ADMIN_EMAIL,
                'app_metadata': {'provider': 'email'}, 'user_metadata': {}, 'created_at': '2026-01-01T00:00:00Z'}
        token = '.'.join([_b64({'alg': 'HS256', 'typ': 'JWT'}),
                          _b64({'sub': user['id'], 'role': 'authenticated', 'email': ADMIN_EMAIL, 'exp': exp,
                                'jti': uuid.uuid4().hex}),
                          'mock-signature'])
        refresh = uuid.uuid4().hex
        with self.lock:
            self.access_tokens.add(token)
            self.refresh_tokens.add(refresh)
        return {'access_token': token, 'token_type': 'bearer', 'expires_in': ACCESS_TTL_S, 'expires_at': exp,
                'refresh_token': refresh, 'user': user}

    def expire_access_tokens(self, revoke_refresh: bool = False):
        """The admin's JWT is now refused (as after a long sleep); optionally the refresh token too."""
        with self.lock:
            self.access_tokens.clear()
            if revoke_refresh:
                self.refresh_tokens.clear()

    # --- injected failures -------------------------------------------------------
    def fail_requests(self, path_contains: str, status: int = 500, times: int = 1, body: dict | None = None):
        with self.lock:
            self.failures.append({'match': path_contains, 'status': status, 'times': times,
                                  'body': body or {'code': 'XX000', 'message': 'injected failure'}})

    def take_failure(self, path: str) -> dict | None:
        with self.lock:
            for f in self.failures:
                if f['match'] in path and f['times'] > 0:
                    f['times'] -= 1
                    return f
        return None

    # --- views -------------------------------------------------------------------
    def v_template_fields(self) -> list[dict]:
        t = self.tables
        defs = {d['id']: d for d in t['field_definitions']}
        rows = []
        for link in t['document_type_fields']:
            d = defs.get(link['field_id'])
            if not d:
                continue
            items = sorted((i for i in t['option_list_items'] if i['list_id'] == d.get('option_list_id')),
                           key=lambda i: i['sort_order'])
            rows.append({
                'document_type_id': link['document_type_id'], 'field_id': d['id'], 'field_key': d['field_key'],
                'label_ar': link.get('label_ar') or d['label_ar'], 'field_type': d['field_type'],
                'placeholder_ar': link.get('placeholder_ar') if link.get('placeholder_ar') is not None else d.get('placeholder_ar', ''),
                'is_required': link['is_required'], 'sort_order': link['sort_order'],
                'option_list_id': d.get('option_list_id'), 'options': [i['value'] for i in items],
            })
        return rows


STATE = MockState()


# --- PostgREST query helpers ------------------------------------------------------

def _value(raw: str):
    if raw == 'null':
        return None
    if raw in ('true', 'false'):
        return raw == 'true'
    return raw


def _matches(row: dict, column: str, expr: str) -> bool:
    negate = expr.startswith('not.')
    if negate:
        expr = expr[4:]
    op, _, arg = expr.partition('.')
    cell = row.get(column)
    if op == 'eq':
        ok = str(cell).lower() == arg.lower() if isinstance(cell, bool) else str(cell) == arg
    elif op == 'neq':
        ok = str(cell) != arg
    elif op in ('lt', 'lte', 'gt', 'gte'):
        a, b = str(cell or ''), arg
        ok = {'lt': a < b, 'lte': a <= b, 'gt': a > b, 'gte': a >= b}[op]
    elif op in ('like', 'ilike'):
        pattern = '^' + re.escape(arg).replace('%', '.*').replace(r'\*', '.*') + '$'
        ok = re.search(pattern, str(cell or ''), re.IGNORECASE if op == 'ilike' else 0) is not None
    elif op == 'in':
        items = [v.strip().strip('"') for v in arg.strip('()').split(',') if v.strip()]
        ok = str(cell) in items
    elif op == 'is':
        ok = cell is _value(arg)
    else:
        raise ValueError(f'unsupported filter {op}')
    return ok != negate


def _order(rows: list[dict], spec: str) -> list[dict]:
    for part in reversed([p for p in spec.split(',') if p]):
        bits = part.split('.')
        col, desc = bits[0], 'desc' in bits[1:]
        rows.sort(key=lambda r: (r.get(col) is None, r.get(col) if r.get(col) is not None else ''), reverse=desc)
    return rows


def _project(rows: list[dict], select: str, table: str) -> list[dict]:
    """select=* | a,b | *,categories(name_ar): columns and the one embed the app uses."""
    if not select or select == '*':
        return rows
    parts = re.findall(r'(\w+)\(([^)]*)\)|([\w*]+)', select)
    out = []
    for row in rows:
        item = {}
        for embed, embed_cols, col in parts:
            if col == '*':
                item.update(row)
            elif col:
                item[col] = row.get(col)
            elif embed == 'categories' and table == 'document_types':
                cat = next((c for c in STATE.tables['categories'] if c['id'] == row.get('category_id')), None)
                item['categories'] = {k: cat[k] for k in embed_cols.split(',')} if cat else None
        out.append(item)
    return out


class Handler(SimpleHTTPRequestHandler):
    server_version = 'SupabaseMock/1.0'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(REPO_ROOT), **kwargs)

    def log_message(self, *args):  # quiet: Robot logs are enough
        pass

    # --- plumbing ------------------------------------------------------------------
    def _send(self, status: int, payload=None, headers: dict | None = None):
        body = b'' if payload is None else json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        if payload is not None:
            self.send_header('Content-Type', 'application/json; charset=utf-8')
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if body and self.command != 'HEAD':
            self.wfile.write(body)

    def _body(self):
        length = int(self.headers.get('Content-Length') or 0)
        raw = self.rfile.read(length) if length else b''
        return json.loads(raw) if raw else None

    def _token(self) -> str:
        auth = self.headers.get('Authorization', '')
        return auth[7:] if auth.lower().startswith('bearer ') else ''

    def _auth(self) -> str:
        """'anon', 'admin', or 'expired' (a user token the server no longer accepts)."""
        token = self._token()
        if not token or token == ANON_KEY:
            return 'anon'
        return 'admin' if token in STATE.access_tokens else 'expired'

    def _route(self):
        url = urlsplit(self.path)
        path = url.path
        STATE.requests.append((self.command, path))
        failure = STATE.take_failure(path)
        if failure:
            return self._send(failure['status'], failure['body'])
        if path == '/supabase-config.js':
            return self._config()
        if path.startswith('/rest/v1/'):
            return self._rest(path[len('/rest/v1/'):], parse_qsl(url.query, keep_blank_values=True))
        if path.startswith('/auth/v1/'):
            return self._gotrue(path[len('/auth/v1/'):], dict(parse_qsl(url.query)))
        if path.startswith('/functions/v1/'):
            return self._function(path[len('/functions/v1/'):])
        return None

    def _config(self):
        host = self.headers.get('Host')
        js = (f"window.SUPABASE_CONFIG = {{ url: 'http://{host}', anonKey: '{ANON_KEY}' }};\n").encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/javascript; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(js)))
        self.end_headers()
        self.wfile.write(js)
        return True

    def do_OPTIONS(self):
        self._send(204)

    def do_GET(self):
        if self._route() is None:
            super().do_GET()

    def do_HEAD(self):
        if self._route() is None:
            super().do_HEAD()

    do_POST = do_PATCH = do_DELETE = lambda self: self._route() is None and self._send(404, {'message': 'not found'})

    # --- PostgREST -----------------------------------------------------------------
    def _rest(self, resource: str, query: list[tuple[str, str]]):
        who = self._auth()
        if who == 'expired':
            return self._send(401, {'code': 'PGRST303', 'details': None, 'hint': None, 'message': 'JWT expired'})
        if resource.startswith('rpc/'):
            return self._rpc(resource[4:], who)
        table = resource
        with STATE.lock:
            if table == 'v_template_fields':
                source = STATE.v_template_fields()
            elif table in STATE.tables:
                source = STATE.tables[table]
            else:
                return self._send(404, {'code': 'PGRST205', 'message': f"Could not find the table 'public.{table}'"})
            params = {k: v for k, v in query if k in ('select', 'order', 'limit', 'offset', 'on_conflict', 'columns')}
            filters = [(k, v) for k, v in query if k not in params]
            method = self.command
            if method in ('GET', 'HEAD'):
                return self._select(table, source, filters, params, who)
            if who != 'admin' and not (method == 'POST' and table in PUBLIC_INSERT):
                return self._send(403, {'code': '42501', 'message': f'new row violates row-level security policy for table "{table}"'})
            if method == 'POST':
                return self._insert(table, params)
            if method == 'PATCH':
                return self._update(table, filters, params)
            if method == 'DELETE':
                return self._delete(table, filters)
        return self._send(405, {'message': 'method not allowed'})

    def _visible(self, table: str, rows: list[dict], who: str) -> list[dict]:
        if who == 'admin':
            return rows
        if table not in PUBLIC_READ:
            return []
        if table == 'document_types':
            return [r for r in rows if r.get('is_published')]
        return rows

    def _filtered(self, rows, filters):
        return [r for r in rows if all(_matches(r, col, expr) for col, expr in filters)]

    def _select(self, table, source, filters, params, who):
        rows = self._filtered(self._visible(table, copy.deepcopy(source), who), filters)
        if params.get('order'):
            rows = _order(rows, params['order'])
        total = len(rows)
        if params.get('limit'):
            rows = rows[: int(params['limit'])]
        rows = _project(rows, params.get('select', '*'), table)
        headers = {'Content-Range': f'0-{max(len(rows) - 1, 0)}/{total}' if rows else f'*/{total}'}
        return self._reply(rows, headers)

    def _reply(self, rows, headers=None, status=200):
        if 'vnd.pgrst.object' in self.headers.get('Accept', ''):
            if len(rows) != 1:
                return self._send(406, {'code': 'PGRST116', 'details': f'The result contains {len(rows)} rows',
                                        'message': 'JSON object requested, multiple (or no) rows returned'})
            return self._send(status, rows[0], headers)
        if 'return=minimal' in self.headers.get('Prefer', '') and self.command != 'GET':
            return self._send(201 if self.command == 'POST' else 204, None, headers)
        return self._send(status, rows, headers)

    def _insert(self, table, params):
        body = self._body()
        items = body if isinstance(body, list) else [body]
        conflict = [c for c in params.get('on_conflict', '').split(',') if c]
        upsert = 'merge-duplicates' in self.headers.get('Prefer', '')
        rows = STATE.tables[table]
        written = []
        for item in items:
            existing = None
            if upsert and conflict:
                existing = next((r for r in rows if all(str(r.get(c)) == str(item.get(c)) for c in conflict)), None)
            if existing is not None:
                existing.update(item)
                written.append(existing)
                continue
            if table == 'option_lists' and any(r['name'] == item.get('name') for r in rows):
                return self._send(409, {'code': '23505', 'message': 'duplicate key value violates unique constraint'})
            row = {**DEFAULTS.get(table, {}), 'id': str(uuid.uuid4()), 'created_at': _now_iso(), **item}
            rows.append(row)
            written.append(row)
        return self._reply(copy.deepcopy(written), status=201)

    def _update(self, table, filters, params):
        body = self._body() or {}
        rows = self._filtered(STATE.tables[table], filters)
        for r in rows:
            r.update(body)
        return self._reply(copy.deepcopy(rows))

    def _delete(self, table, filters):
        doomed = self._filtered(STATE.tables[table], filters)
        self._cascade(table, doomed)
        return self._reply(copy.deepcopy(doomed), status=200)

    def _cascade(self, table, doomed):
        ids = {r['id'] for r in doomed}
        STATE.tables[table] = [r for r in STATE.tables[table] if r not in doomed]
        for child, column in CASCADES.get(table, []):
            self._cascade(child, [r for r in STATE.tables[child] if r.get(column) in ids])

    def _rpc(self, name, who):
        args = self._body() or {}
        with STATE.lock:
            if name == 'increment_document_usage':
                for d in STATE.tables['document_types']:
                    if d['id'] == args.get('doc_id'):
                        d['usage_count'] = d.get('usage_count', 0) + 1
                return self._send(204)
            if name == 'agent_dashboard':
                if who != 'admin':
                    return self._send(400, {'code': '42501', 'message': 'agent_dashboard: admin only'})
                return self._send(200, agent_dashboard())
        return self._send(404, {'code': 'PGRST202', 'message': f'Could not find the function public.{name}'})

    # --- Auth (GoTrue) ---------------------------------------------------------------
    def _gotrue(self, endpoint, query):
        if endpoint == 'token':
            body = self._body() or {}
            grant = query.get('grant_type')
            if grant == 'password':
                if body.get('email') == ADMIN_EMAIL and body.get('password') == ADMIN_PASSWORD:
                    return self._send(200, STATE.issue_session())
                return self._send(400, {'code': 400, 'error_code': 'invalid_credentials', 'msg': 'Invalid login credentials'})
            if grant == 'refresh_token':
                token = body.get('refresh_token')
                with STATE.lock:
                    if token not in STATE.refresh_tokens:
                        return self._send(400, {'code': 400, 'error_code': 'refresh_token_not_found',
                                                'msg': 'Invalid Refresh Token: Refresh Token Not Found'})
                    STATE.refresh_tokens.discard(token)
                return self._send(200, STATE.issue_session())
        if endpoint == 'user':
            if self._auth() != 'admin':
                return self._send(401, {'code': 401, 'error_code': 'bad_jwt', 'msg': 'invalid JWT'})
            return self._send(200, STATE.issue_session()['user'])
        if endpoint == 'logout':
            with STATE.lock:
                STATE.access_tokens.discard(self._token())
            return self._send(204)
        return self._send(404, {'msg': f'unknown auth endpoint {endpoint}'})

    # --- Edge Functions -------------------------------------------------------------
    def _function(self, name):
        self._body()
        if name != 'agent-status':
            return self._send(404, {'message': 'Function not found'})
        if self._auth() != 'admin':  # verify_jwt is on
            return self._send(401, {'code': 401, 'message': 'Invalid JWT'})
        return self._send(200, agent_status())


class _Server(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        # The browser cancels requests when a test moves on: not an error.
        if isinstance(sys.exc_info()[1], (ConnectionAbortedError, ConnectionResetError, BrokenPipeError)):
            return
        super().handle_error(request, client_address)


class MockServer:
    """The server on a free local port, in a background thread."""

    def __init__(self, port: int = 0):
        self.httpd = _Server(('127.0.0.1', port), Handler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)

    @property
    def url(self) -> str:
        host, port = self.httpd.server_address[:2]
        return f'http://{host}:{port}'

    def start(self) -> str:
        self.thread.start()
        return self.url

    def stop(self):
        self.httpd.shutdown()
        self.httpd.server_close()


if __name__ == '__main__':  # manual use: python tests/robot/mock/supabase_mock.py 8765

    server = MockServer(int(sys.argv[1]) if len(sys.argv) > 1 else 8765)
    print(f'Katib mock running on {server.url} (admin: {ADMIN_EMAIL} / [REDACTED])', flush=True)
    try:
        server.httpd.serve_forever()
    except KeyboardInterrupt:
        server.stop()
