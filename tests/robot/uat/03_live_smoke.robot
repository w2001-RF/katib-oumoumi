*** Settings ***
Documentation       UAT smoke test of the deployed site (https://katiboumoumi.online by default).
...
...                 READ ONLY: dev and prod share one Supabase database, so nothing is submitted,
...                 generated or signed in here. Excluded from the default run (tag ``live``):
...                 robot --include live --variable LIVE_URL:https://katiboumoumi.online tests/robot/uat
Library             Browser    timeout=20s
Suite Setup         New Browser    chromium    headless=${HEADLESS}
Suite Teardown      Close Browser    ALL
Test Setup          Open Live Site
Test Tags           uat    live    smoke


*** Variables ***
${LIVE_URL}         https://katiboumoumi.online
${HEADLESS}         True


*** Keywords ***
Open Live Site
    [Arguments]    ${route}=/
    New Context    viewport={'width': 412, 'height': 915}    locale=ar-MA
    New Page    ${LIVE_URL}/#${route}

Url Should Answer
    [Arguments]    ${path}    ${content}=${EMPTY}
    ${response}=    HTTP    ${LIVE_URL}${path}
    Should Be Equal As Integers    ${response}[status]    200    ${path} should answer 200
    IF    $content    Should Contain    ${response}[body]    ${content}


*** Test Cases ***
The Home Page Loads With Documents From The Database
    Get Title    *=    كاتب عمومي
    Get Text    .hero-banner h1    *=    كاتب عمومي
    Get Element Count    \#most-requested-list .list-card    >    0

The Categories Load
    Go To    ${LIVE_URL}/#/categories
    Get Element Count    .category-tile    >    0

A Document Form Opens (Nothing Is Submitted)
    Click    \#most-requested-list .list-card >> nth=0
    # The live database can be slow on a cold start.
    Wait For Elements State    id=doc-form    visible    timeout=30s
    Get Element Count    \#doc-form [data-field]    >    0
    Get Element States    id=submit-btn    contains    visible

The Admin Pages Ask To Sign In
    Go To    ${LIVE_URL}/#/admin
    Wait For Condition    Url    *=    \#/admin/login
    Get Element States    id=login-btn    contains    visible

Search Engines Find The Robots File, The Sitemap And The Icons
    Url Should Answer    /robots.txt    Sitemap:
    Url Should Answer    /sitemap.xml    <urlset
    Url Should Answer    /favicon.ico
    Url Should Answer    /favicon-48x48.png
