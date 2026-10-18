*** Settings ***
Documentation       Admin: create, rename and delete categories.
Resource            ../resources/katib.resource
Suite Setup         Start Katib Test Environment
Suite Teardown      Stop Katib Test Environment
Test Setup          Open Admin Categories
Test Tags           functional    admin    categories


*** Keywords ***
Open Admin Categories
    Open Fresh App
    Sign In As Admin And Open Dashboard
    Go To Route    /admin/categories
    Get Element Count    \#cat-list .admin-card    ==    3


*** Test Cases ***
A New Category Is Added
    Fill Text    \#new-cat-form input[name="name_ar"]    شواهد إدارية
    Select Options By    \#new-cat-form select[name="icon"]    value    fileText
    Click    \#new-cat-form button[type="submit"]
    Toast Should Contain    تمت الإضافة
    Get Element Count    \#cat-list .admin-card    ==    4
    ${row}=    Get Row    categories    name_ar=شواهد إدارية
    Should Be Equal    ${row}[icon]    fileText
    Get Text    \#new-cat-form input[name="name_ar"]    ==    ${EMPTY}

A Category Without A Name Is Not Sent
    Click    \#new-cat-form button[type="submit"]
    Row Count Should Be    categories    3

A Category Is Renamed
    Fill Text    [data-id="${CAT_EMPTY}"] .f-name    طلبات رسمية
    Select Options By    [data-id="${CAT_EMPTY}"] .f-icon    value    send
    Click    [data-id="${CAT_EMPTY}"] [data-save]
    Toast Should Contain    تم الحفظ
    ${row}=    Get Row    categories    id=${CAT_EMPTY}
    Should Be Equal    ${row}[name_ar]    طلبات رسمية
    Should Be Equal    ${row}[icon]    send

Deleting A Category Also Deletes Its Documents
    Handle Future Dialogs    action=accept
    Click    [data-id="${CAT_PROXIES}"] [data-del]
    Toast Should Contain    تم الحذف
    Get Element Count    \#cat-list .admin-card    ==    2
    Row Count Should Be    categories    0    id=${CAT_PROXIES}
    Row Count Should Be    document_types    0    id=${DOC_PROXY}

A Failed Save Is Reported
    Fail Next Requests    /rest/v1/categories    status=500
    Fill Text    [data-id="${CAT_EMPTY}"] .f-name    اسم جديد
    Click    [data-id="${CAT_EMPTY}"] [data-save]
    Toast Should Contain    تعذر الحفظ
    ${row}=    Get Row    categories    id=${CAT_EMPTY}
    Should Be Equal    ${row}[name_ar]    طلبات إدارية

New Categories Appear On The Public Page
    Fill Text    \#new-cat-form input[name="name_ar"]    عقود
    Click    \#new-cat-form button[type="submit"]
    Toast Should Contain    تمت الإضافة
    Go To Route    /categories
    Get Element Count    .category-tile    ==    4
    Get Text    id=categories-grid    *=    عقود
