*** Settings ***
Documentation       Shared keywords: the app served by the local Supabase mock, one fresh
...                 browser context per test (empty localStorage, no admin session).
Library             Browser    timeout=10s    enable_presenter_mode=False
Library             OperatingSystem
Library             ../libraries/KatibMock.py


*** Variables ***
${BROWSER}              chromium
${HEADLESS}             True
# Pause after each browser action, to follow a headed run: --variable SLOW_MO:500ms
${SLOW_MO}              0s
${VIEWPORT}             {'width': 1280, 'height': 900}
${BASE_URL}             ${EMPTY}
# Mock admin account (tests/robot/mock/seed_data.py)
${ADMIN_EMAIL}          admin@katib.test
${ADMIN_PASSWORD}       Robot-Pass-2026
# Seed data (tests/robot/mock/seed_data.py)
${DOC_NEIGHBOUR}        doc-neighbour
${DOC_PROXY}            doc-proxy
${DOC_DRAFT}            doc-draft
${CAT_COMPLAINTS}       cat-complaints
${CAT_PROXIES}          cat-proxies
${CAT_EMPTY}            cat-requests


*** Keywords ***
Start Katib Test Environment
    [Documentation]    Suite setup: the mock server and one browser for the suite.
    ${url}=    Start Katib Mock
    Set Global Variable    ${BASE_URL}    ${url}
    New Browser    ${BROWSER}    headless=${HEADLESS}    slowMo=${SLOW_MO}

Stop Katib Test Environment
    Close Browser    ALL

Open Fresh App
    [Documentation]    Test setup: seed data, a new context (no history, no session), the home page.
    [Arguments]    ${route}=/
    Reset Mock Data
    New Context    viewport=${VIEWPORT}    acceptDownloads=True    locale=ar-MA
    New Page    ${BASE_URL}/#${route}

Go To Route
    [Arguments]    ${route}
    Go To    ${BASE_URL}/#${route}

Current Route Should Be
    [Arguments]    ${route}
    Wait Until Keyword Succeeds    10s    200ms    _Route Is    ${route}

_Route Is
    [Arguments]    ${route}
    ${hash}=    Evaluate JavaScript    ${None}    () => location.hash
    Should Be Equal    ${hash}    \#${route}

Page Title Should Be
    [Arguments]    ${title}
    Get Text    .app-title    ==    ${title}

Toast Should Contain
    [Arguments]    ${text}
    Get Text    id=ko-toast    *=    ${text}

Element Should Show Text
    [Arguments]    ${selector}    ${text}
    Get Text    ${selector}    *=    ${text}

Choose Combo Option
    [Documentation]    Picks ``value`` in the searchable dropdown that replaces the native <select> inside ``scope``.
    [Arguments]    ${scope}    ${value}
    Click    ${scope} >> .combo-trigger
    Fill Text    ${scope} >> .combo-search    ${value}
    Click    ${scope} >> .combo-option >> text="${value}"
    Get Text    ${scope} >> .combo-value    ==    ${value}

Field Error Should Be
    [Arguments]    ${field_key}    ${message}
    Get Text    [data-field="${field_key}"] .error-msg    ==    ${message}

Field Should Have No Error
    [Arguments]    ${field_key}
    Get Element States    [data-field="${field_key}"] .error-msg    contains    hidden

Fill Neighbour Complaint
    [Documentation]    Fills «شكاية بسبب الجار» with valid values (the e-mail is optional and left empty unless given).
    [Arguments]    ${name}=فاطمة الزهراء العلوي    ${cin}=G754103    ${city}=سطات    ${phone}=0612345678
    ...    ${email}=${EMPTY}    ${details}=الجار يحدث ضجيجاً كل ليلة بعد منتصف الليل.    ${date}=2026-10-17
    Fill Text    [data-field="الاسم الكامل"] input    ${name}
    Fill Text    [data-field="رقم البطاقة الوطنية"] input    ${cin}
    Choose Combo Option    [data-field="المدينة"]    ${city}
    Fill Text    [data-field="رقم الهاتف"] input    ${phone}
    Fill Text    [data-field="البريد الإلكتروني"] input    ${email}
    Fill Text    [data-field="تفاصيل الشكاية"] textarea    ${details}
    Fill Text    [data-field="التاريخ"] input    ${date}

Generate Document
    Click    id=submit-btn
    Wait For Elements State    id=result-root    visible
    Get Text    id=doc-name    !=    ...

Sign In As Admin
    [Arguments]    ${email}=${ADMIN_EMAIL}    ${password}=${ADMIN_PASSWORD}
    Go To Route    /admin/login
    Fill Text    input[name="email"]    ${email}
    Fill Secret    input[name="password"]    $password
    Click    id=login-btn

Sign In As Admin And Open Dashboard
    Sign In As Admin
    Current Route Should Be    /admin
    Wait For Elements State    .stat-grid    visible

Download Should Be Saved
    [Documentation]    Clicks ``selector`` and returns the path of the file the browser downloaded.
    [Arguments]    ${selector}    ${extension}
    ${promise}=    Promise To Wait For Download    ${OUTPUT DIR}${/}downloads${/}${TEST NAME}.${extension}
    Click    ${selector}
    ${download}=    Wait For    ${promise}
    File Should Exist    ${download}[saveAs]
    ${size}=    Get File Size    ${download}[saveAs]
    Should Be True    ${size} > 0
    Should End With    ${download}[suggestedFilename]    .${extension}
    RETURN    ${download}
