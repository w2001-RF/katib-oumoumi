*** Settings ***
Documentation       Admin: AI agents monitoring (telemetry, live status) and the bot's system prompt.
Resource            ../resources/katib.resource
Suite Setup         Start Katib Test Environment
Suite Teardown      Stop Katib Test Environment
Test Setup          Open Agents Page
Test Tags           functional    admin    agents


*** Keywords ***
Open Agents Page
    Open Fresh App
    Sign In As Admin And Open Dashboard
    Go To Route    /admin/agents
    Wait For Elements State    .kpi-grid    visible

More Dashboard Calls Than
    [Arguments]    ${count}
    ${now}=    Requests Made    POST    /rpc/agent_dashboard
    Should Be True    ${now} > ${count}

Set Column In Settings
    [Arguments]    ${value}
    Set Column    agent_settings    system_prompt    value    ${value}    id_column=key


*** Test Cases ***
Telemetry Figures Are Shown
    Page Title Should Be    مراقبة الوكلاء الأذكياء
    Get Text    .kpi-grid    *=    الرسائل المعالجة
    Get Text    .kpi-grid    *=    40
    Get Text    .kpi-grid    *=    المستخدمون النشطون

The Live Status Of The Telegram Bot Is Shown
    Get Text    id=dash-body    *=    @KatibOumoumiBot

The Agent-Status Function Is Called With The Admin Token
    ${calls}=    Requests Made    POST    /functions/v1/agent-status
    Should Be True    ${calls} >= 1

Changing The Period Reloads The Figures
    ${before}=    Requests Made    POST    /rpc/agent_dashboard
    Click    [data-range="24h"]
    Get Attribute    [data-range="24h"]    aria-pressed    ==    true
    Wait Until Keyword Succeeds    5s    200ms    More Dashboard Calls Than    ${before}

The System Prompt Is Saved
    ${prompt}=    Set Variable    خاطب المستعمل بالدارجة وبجمل قصيرة.
    Fill Text    form[data-form="system-prompt"] textarea[name="system_prompt"]    ${prompt}
    Click    form[data-form="system-prompt"] button[type="submit"]
    Toast Should Contain    تم حفظ التعليمات
    ${row}=    Get Row    agent_settings    key=system_prompt
    Should Be Equal    ${row}[value]    ${prompt}

The Saved System Prompt Is Shown Again
    Set Column In Settings    خاطب المستعمل بلطف.
    Reload
    Get Text    form[data-form="system-prompt"] textarea[name="system_prompt"]    ==    خاطب المستعمل بلطف.

A Missing Telemetry Migration Is Explained
    Fail Next Requests    /rpc/agent_dashboard    status=404    times=2
    ...    code=PGRST202    message=Could not find the function public.agent_dashboard
    Click    id=refresh-btn
    Get Text    id=dash-body    *=    003_agent_dashboard.sql

