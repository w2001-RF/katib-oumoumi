*** Settings ***
Documentation       Categories grid and category pages.
Resource            ../resources/katib.resource
Suite Setup         Start Katib Test Environment
Suite Teardown      Stop Katib Test Environment
Test Setup          Open Fresh App    /categories
Test Tags           functional    public    categories


*** Test Cases ***
Categories Are Listed In Order With Their Published Document Count
    Get Element Count    .category-tile    ==    3
    Get Text    .category-tile >> nth=0    *=    شكايات
    Get Text    .category-tile >> nth=0    *=    1 وثيقة
    Get Text    .category-tile >> nth=1    *=    توكيلات
    Get Text    .category-tile >> nth=1    *=    1 وثيقة
    Get Text    .category-tile >> nth=2    *=    طلبات إدارية
    Get Text    .category-tile >> nth=2    *=    0 وثيقة

A Category Lists Its Published Documents Only
    Click    [data-cat-id="${CAT_COMPLAINTS}"]
    Current Route Should Be    /categories/${CAT_COMPLAINTS}
    Page Title Should Be    شكايات
    Get Element Count    \#doctype-list .list-card    ==    1
    Get Text    \#doctype-list .list-card    *=    شكاية بسبب الجار
    Get Text    \#doctype-list .list-card    *=    إزعاج أو ضرر من الجيران

A Document Of A Category Opens Its Form
    Click    [data-cat-id="${CAT_PROXIES}"]
    Click    [data-doc-id="${DOC_PROXY}"]
    Current Route Should Be    /doc/${DOC_PROXY}
    Page Title Should Be    توكيل خاص

An Empty Category Says So
    Click    [data-cat-id="${CAT_EMPTY}"]
    Get Text    id=doctype-list    *=    لا توجد وثائق في هذا التصنيف بعد

Back Button Returns To The Categories
    Click    [data-cat-id="${CAT_COMPLAINTS}"]
    Current Route Should Be    /categories/${CAT_COMPLAINTS}
    Click    [data-action="back"]
    Current Route Should Be    /categories

A Backend Error Shows A Message
    Get Element Count    .category-tile    ==    3
    Fail Next Requests    /rest/v1/categories    status=500
    Reload
    Get Text    id=categories-grid    *=    تعذر تحميل التصنيفات

An Unknown Category Shows A Message
    Go To Route    /categories/does-not-exist
    Get Text    id=doctype-list    *=    تعذر تحميل هذا التصنيف
