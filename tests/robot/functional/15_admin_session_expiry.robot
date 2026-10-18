*** Settings ***
Documentation       An expired admin JWT is renewed without the admin noticing; when it cannot be
...                 renewed, the admin is sent to the login page and brought back afterwards.
Resource            ../resources/katib.resource
Suite Setup         Start Katib Test Environment
Suite Teardown      Stop Katib Test Environment
Test Setup          Open Agents Page
Test Tags           functional    admin    session


*** Keywords ***
Open Agents Page
    Open Fresh App
    Sign In As Admin And Open Dashboard
    Go To Route    /admin/agents
    Wait For Elements State    .kpi-grid    visible


*** Test Cases ***
An Expired Token Is Refreshed And The Request Replayed
    ${refreshes}=    Requests Made    POST    /auth/v1/token
    Expire Admin Session
    Click    id=refresh-btn
    Wait Until Keyword Succeeds    10s    200ms    Token Was Refreshed    ${refreshes}
    Current Route Should Be    /admin/agents
    Get Text    .kpi-grid    *=    الرسائل المعالجة
    Get Element Count    id=login-expired    ==    0

The Edge Function Call Is Replayed Too
    Expire Admin Session
    ${before}=    Requests Made    POST    /functions/v1/agent-status
    Click    id=refresh-btn
    Wait Until Keyword Succeeds    10s    200ms    Function Calls Above    ${before}
    Get Text    id=dash-body    *=    @KatibOumoumiBot

A Session That Cannot Be Renewed Leads To The Login Page
    Expire Admin Session    revoke_refresh_token=True
    Click    id=refresh-btn
    Current Route Should Be    /admin/login
    Get Text    id=login-expired    ==    انتهت صلاحية الجلسة، سجّل الدخول من جديد.

After Signing In Again The Admin Is Back On The Same Page
    Expire Admin Session    revoke_refresh_token=True
    Click    id=refresh-btn
    Current Route Should Be    /admin/login
    Sign In As Admin
    Current Route Should Be    /admin/agents
    Wait For Elements State    .kpi-grid    visible
    Get Element Count    id=login-expired    ==    0

A Write With A Dead Session Is Not Lost Silently
    Go To Route    /admin/categories
    Get Element Count    \#cat-list .admin-card    ==    3
    Expire Admin Session    revoke_refresh_token=True
    Fill Text    [data-id="${CAT_EMPTY}"] .f-name    اسم لن يحفظ
    Click    [data-id="${CAT_EMPTY}"] [data-save]
    Current Route Should Be    /admin/login
    ${row}=    Get Row    categories    id=${CAT_EMPTY}
    Should Be Equal    ${row}[name_ar]    طلبات إدارية

Public Pages Are Never Redirected
    Expire Admin Session    revoke_refresh_token=True
    Go To Route    /categories
    Get Element Count    .category-tile    ==    3
    Current Route Should Be    /categories


*** Keywords ***
Token Was Refreshed
    [Arguments]    ${before}
    ${now}=    Requests Made    POST    /auth/v1/token
    Should Be True    ${now} > ${before}

Function Calls Above
    [Arguments]    ${before}
    ${now}=    Requests Made    POST    /functions/v1/agent-status
    Should Be True    ${now} > ${before}
