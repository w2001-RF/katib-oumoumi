"""Test data for the Supabase mock: fictitious, reset before every test."""

from __future__ import annotations

import copy
from datetime import datetime, timedelta, timezone

ANON_KEY = 'robot-anon-key'
ADMIN_EMAIL = 'admin@katib.test'
ADMIN_PASSWORD = 'Robot-Pass-2026'

CAT_COMPLAINTS = 'cat-complaints'
CAT_PROXIES = 'cat-proxies'
CAT_EMPTY = 'cat-requests'
DOC_NEIGHBOUR = 'doc-neighbour'
DOC_PROXY = 'doc-proxy'
DOC_DRAFT = 'doc-draft'
LIST_CITIES = 'list-cities'

NEIGHBOUR_TEMPLATE = (
    '<p>إلى السيد قائد الملحقة الإدارية بـ{{المدينة}}</p>'
    '<p>أنا الموقع(ة) أسفله {{الاسم الكامل}}، الحامل(ة) للبطاقة الوطنية رقم {{رقم البطاقة الوطنية}}،</p>'
    '<p>الهاتف: {{رقم الهاتف}} — البريد الإلكتروني: {{البريد الإلكتروني}}</p>'
    '<p>{{تفاصيل الشكاية}}</p>'
    '<p>حرر بتاريخ {{التاريخ}}</p>'
)
PROXY_TEMPLATE = (
    '<p>توكيل خاص</p>'
    '<p>أنا {{الاسم الكامل}}، بطاقة وطنية رقم {{رقم البطاقة الوطنية}}، أوكل السيد(ة) {{اسم الوكيل}}</p>'
    '<p>بمدينة {{المدينة}}</p>'
)

_FIELD_DEFINITIONS = [
    ('fd-name', 'الاسم الكامل', 'varchar', 'مثال: فاطمة الزهراء العلوي', None),
    ('fd-cin', 'رقم البطاقة الوطنية', 'cin', 'G754103', None),
    ('fd-city', 'المدينة', 'select', '', LIST_CITIES),
    ('fd-date', 'التاريخ', 'date', '', None),
    ('fd-phone', 'رقم الهاتف', 'phone', '06XXXXXXXX', None),
    ('fd-email', 'البريد الإلكتروني', 'email', 'name@mail.ma', None),
    ('fd-details', 'تفاصيل الشكاية', 'text', 'اشرح الوقائع', None),
    ('fd-agent', 'اسم الوكيل', 'varchar', '', None),
]

# document -> [(field id, required)] in display order
_DOC_FIELDS = {
    DOC_NEIGHBOUR: [('fd-name', True), ('fd-cin', True), ('fd-city', True), ('fd-phone', True), ('fd-email', False),
                    ('fd-details', True), ('fd-date', True)],
    DOC_PROXY: [('fd-name', True), ('fd-cin', True), ('fd-agent', True), ('fd-city', True)],
    DOC_DRAFT: [('fd-name', True)],
}


def seed() -> dict[str, list[dict]]:
    tables = {
        'categories': [
            {'id': CAT_COMPLAINTS, 'name_ar': 'شكايات', 'icon': 'alert', 'sort_order': 1},
            {'id': CAT_PROXIES, 'name_ar': 'توكيلات', 'icon': 'userCheck', 'sort_order': 2},
            {'id': CAT_EMPTY, 'name_ar': 'طلبات إدارية', 'icon': 'folder', 'sort_order': 3},
        ],
        'document_types': [
            {'id': DOC_NEIGHBOUR, 'category_id': CAT_COMPLAINTS, 'name_ar': 'شكاية بسبب الجار',
             'description_ar': 'إزعاج أو ضرر من الجيران', 'icon': 'alert', 'is_published': True, 'usage_count': 42,
             'sort_order': 1, 'template_body': NEIGHBOUR_TEMPLATE, 'next_steps_ar': 'ضعها لدى الملحقة الإدارية.'},
            {'id': DOC_PROXY, 'category_id': CAT_PROXIES, 'name_ar': 'توكيل خاص', 'description_ar': 'توكيل شخص للقيام بإجراء',
             'icon': 'userCheck', 'is_published': True, 'usage_count': 17, 'sort_order': 1, 'template_body': PROXY_TEMPLATE,
             'next_steps_ar': ''},
            {'id': DOC_DRAFT, 'category_id': CAT_COMPLAINTS, 'name_ar': 'مسودة غير منشورة', 'description_ar': '',
             'icon': 'document', 'is_published': False, 'usage_count': 0, 'sort_order': 2,
             'template_body': '<p>{{الاسم الكامل}}</p>', 'next_steps_ar': ''},
        ],
        'option_lists': [{'id': LIST_CITIES, 'name': 'المدن'}],
        'option_list_items': [
            {'id': f'item-{i}', 'list_id': LIST_CITIES, 'value': v, 'sort_order': i}
            for i, v in enumerate(['الرباط', 'الدار البيضاء', 'سطات', 'فاس', 'أخرى'])
        ],
        'field_definitions': [
            {'id': fid, 'field_key': key, 'label_ar': key, 'field_type': ftype, 'placeholder_ar': ph, 'option_list_id': lst}
            for fid, key, ftype, ph, lst in _FIELD_DEFINITIONS
        ],
        'document_type_fields': [
            {'id': f'{doc}-{fid}', 'document_type_id': doc, 'field_id': fid, 'label_ar': None, 'placeholder_ar': None,
             'is_required': required, 'sort_order': i}
            for doc, fields in _DOC_FIELDS.items()
            for i, (fid, required) in enumerate(fields)
        ],
        'generated_documents': [
            {'id': f'gen-{i}', 'document_type_id': DOC_NEIGHBOUR, 'session_id': 'seed', 'data': {}, 'created_at': '2026-10-01T10:00:00Z'}
            for i in range(3)
        ],
        'agent_settings': [{'key': 'system_prompt', 'value': '', 'updated_at': '2026-10-01T00:00:00Z'}],
        'agent_model_prices': [],
        'agent_provider_budgets': [],
    }
    return copy.deepcopy(tables)


def _ago(minutes: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat().replace('+00:00', 'Z')


def agent_dashboard() -> dict:
    """A payload shaped like agent_dashboard() (migration 003), as in tests/web/agent_dashboard_test.js."""
    return {
        'generated_at': _ago(0), 'last_turn_at': _ago(3),
        'range': {'from': _ago(10080), 'to': _ago(0), 'bucket': 'day', 'tz': 'Africa/Casablanca'},
        'kpis': {'turns': 40, 'ok': 36, 'busy': 3, 'errors': 1, 'duplicates': 2, 'users': 12, 'documents': 9, 'voice_turns': 15,
                 'image_turns': 4, 'p50_ms': 3200, 'p95_ms': 14000, 'ai_calls': 120, 'ai_failures': 6, 'retries': 4,
                 'fallback_calls': 2, 'input_tokens': 250000, 'output_tokens': 12000, 'cost_usd': 0.42, 'new_users': 3,
                 'web_documents': 30},
        'previous': {'turns': 20, 'ok': 20, 'users': 6, 'documents': 4, 'p95_ms': 9000, 'input_tokens': 100000,
                     'output_tokens': 5000, 'cost_usd': 0.2},
        'series': [
            {'t': _ago(1440)[:13] + ':00', 'ok': 10, 'busy': 0, 'errors': 0, 'documents': 2, 'p50_ms': 3000, 'p95_ms': 9000,
             'input_tokens': 9000, 'output_tokens': 400, 'cost_usd': 0.01},
            {'t': _ago(60)[:13] + ':00', 'ok': 2, 'busy': 3, 'errors': 1, 'documents': 1, 'p50_ms': None, 'p95_ms': 30000,
             'input_tokens': 0, 'output_tokens': 0, 'cost_usd': 0},
        ],
        'channels': [{'channel': 'telegram', 'turns': 40, 'users': 12, 'documents': 9, 'busy': 3, 'errors': 1, 'duplicates': 2,
                      'voice_turns': 15, 'p50_ms': 3200, 'p95_ms': 14000}],
        'models': [
            {'service': 'llm', 'provider': 'google', 'model': 'gemini-3.8-flash', 'roles': ['main', 'fast'], 'calls': 100,
             'ok_calls': 96, 'retries': 4, 'rate_limited': 0, 'overloaded': 4, 'not_found': 0, 'timeouts': 0, 'auth_errors': 0,
             'other_errors': 0, 'p50_ms': 1200, 'p95_ms': 4000, 'input_tokens': 240000, 'output_tokens': 11000, 'units': 0,
             'cost_usd': 0.4, 'priced': True, 'last_ok_at': _ago(4), 'last_error_at': _ago(30), 'last_error_kind': 'overloaded',
             'rate_limit': None},
        ],
        'tasks': [{'service': 'llm', 'task': 'extraction', 'calls': 50, 'failures': 2, 'avg_ms': 1500, 'p95_ms': 4000,
                   'input_tokens': 150000, 'output_tokens': 5000, 'cost_usd': 0.3}],
        'errors': [{'service': 'llm', 'error_kind': 'overloaded', 'count': 4}],
        'outages': [],
        'funnel': {'started': 14, 'with_document': 12, 'reached_confirmation': 10, 'done': 9, 'cancelled': 2, 'in_progress': 1,
                   'abandoned': 2, 'median_minutes_to_done': 6.5, 'avg_turns_to_done': 7.2},
        'documents': [{'document_type_id': DOC_NEIGHBOUR, 'name_ar': 'شكاية بسبب الجار', 'agent': 5, 'web': 12}],
        'users': {'total': 20, 'consented': 18, 'voice': 7, 'new': 3, 'by_channel': {'telegram': 20}},
        'budgets': [],
        'pricing': {'prices': [], 'unpriced': []},
        'failures': {'calls': [], 'turns': []},
    }


def agent_status() -> dict:
    """What the agent-status Edge Function returns (configuration and live health)."""
    return {
        'checkedAt': _ago(0),
        'ai': {
            'roles': [{'role': 'main', 'provider': 'google', 'host': 'generativelanguage.googleapis.com',
                       'model': 'gemini-3.8-flash', 'hasKey': True, 'own': True,
                       'caps': {'tools': True, 'json': 'schema', 'vision': True, 'audioInput': True}}],
            'stt': {'mode': 'model'}, 'tts': {'configured': False}, 'retries': 2, 'timeoutMs': 45000,
        },
        'pdf': {'configured': False, 'fallback': 'html'},
        'metrics': 'on',
        'channels': {
            'telegram': {'configured': True, 'secretSet': True, 'reachable': True, 'latencyMs': 120,
                         'bot': {'username': 'KatibOumoumiBot'},
                         'webhook': {'set': True, 'host': 'example.supabase.co', 'pendingUpdates': 0, 'lastErrorAt': None,
                                     'lastError': None}},
            'whatsapp': {'configured': False, 'implemented': False},
        },
        'probes': [],
        'credits': [],
    }
