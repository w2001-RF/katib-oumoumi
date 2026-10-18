"""Robot Framework keywords around the local Supabase mock (tests/robot/mock)."""

from __future__ import annotations

import copy
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'mock'))

import seed_data  # noqa: E402
from supabase_mock import STATE, MockServer  # noqa: E402
from robot.api.deco import keyword, library  # noqa: E402


@library(scope='GLOBAL')
class KatibMock:
    """Starts the app + fake Supabase on a local port and lets tests read and change its data."""

    ADMIN_EMAIL = seed_data.ADMIN_EMAIL
    ADMIN_PASSWORD = seed_data.ADMIN_PASSWORD

    def __init__(self):
        self._server: MockServer | None = None

    @keyword
    def start_katib_mock(self, port: int = 0) -> str:
        """Starts the server (once) and returns its base URL, e.g. ``http://127.0.0.1:53412``."""
        if self._server is None:
            self._server = MockServer(int(port))
            self._server.start()
        return self._server.url

    @keyword
    def stop_katib_mock(self):
        if self._server is not None:
            self._server.stop()
            self._server = None

    @keyword
    def reset_mock_data(self):
        """Back to the seed data, no signed-in session, no injected failure."""
        STATE.reset()

    @keyword
    def get_rows(self, table: str, **filters) -> list:
        """Rows of ``table`` whose columns equal the given ``filters`` (copies)."""
        with STATE.lock:
            rows = STATE.tables[table]
            return [copy.deepcopy(r) for r in rows if all(str(r.get(k)) == str(v) for k, v in filters.items())]

    @keyword
    def row_count_should_be(self, table: str, expected: int, **filters):
        count = len(self.get_rows(table, **filters))
        if count != int(expected):
            raise AssertionError(f'{table}: expected {expected} row(s) matching {filters}, found {count}')

    @keyword
    def get_row(self, table: str, **filters) -> dict:
        rows = self.get_rows(table, **filters)
        if len(rows) != 1:
            raise AssertionError(f'{table}: expected one row matching {filters}, found {len(rows)}')
        return rows[0]

    @keyword
    def set_column(self, table: str, row_id: str, column: str, value, id_column: str = 'id'):
        """Sets ``column`` of the row whose ``id_column`` is ``row_id``."""
        with STATE.lock:
            for r in STATE.tables[table]:
                if r.get(id_column) == row_id:
                    r[column] = value
                    return
        raise AssertionError(f'{table}: no row {row_id}')

    @keyword
    def expire_admin_session(self, revoke_refresh_token: bool = False):
        """The server now refuses the admin's access token (JWT expired). With ``revoke_refresh_token`` it cannot be renewed."""
        STATE.expire_access_tokens(revoke_refresh=bool(revoke_refresh_token))

    @keyword
    def fail_next_requests(self, path_contains: str, status: int = 500, times: int = 1, code: str = 'XX000',
                           message: str = 'injected failure'):
        """The next ``times`` requests whose path contains ``path_contains`` get an error ``status`` (PostgREST-style body)."""
        STATE.fail_requests(path_contains, int(status), int(times), {'code': code, 'message': message})

    @keyword
    def requests_made(self, method: str, path_contains: str) -> int:
        """How many ``method`` requests hit a path containing ``path_contains``."""
        return sum(1 for m, p in STATE.requests if m == method.upper() and path_contains in p)
