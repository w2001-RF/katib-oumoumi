*** Settings ***
Documentation       Admin dashboard: statistics, every document (published or not), deletion, navigation.
Resource            ../resources/katib.resource
Suite Setup         Start Katib Test Environment
Suite Teardown      Stop Katib Test Environment
Test Setup          Open Fresh App And Sign In
Test Tags           functional    admin    dashboard


*** Keywords ***
Open Fresh App And Sign In
    Open Fresh App
    Sign In As Admin And Open Dashboard


*** Test Cases ***
Statistics Count Documents, Generations And Categories
    Get Text    .stat-card >> nth=0    *=    3
    Get Text    .stat-card >> nth=0    *=    أنواع الوثائق
    Get Text    .stat-card >> nth=1    *=    3
    Get Text    .stat-card >> nth=2    *=    3

Every Document Is Listed, Unpublished Ones Marked
    Get Element Count    \#doctypes-list .list-card    ==    3
    Get Text    [data-id="${DOC_DRAFT}"]    *=    (غير منشورة)
    Get Text    [data-id="${DOC_NEIGHBOUR}"]    not contains    غير منشورة
    Get Text    [data-id="${DOC_NEIGHBOUR}"]    *=    شكايات
    Get Text    [data-id="${DOC_NEIGHBOUR}"]    *=    42 استخدام

A Document Opens In The Editor
    Click    [data-id="${DOC_PROXY}"] .title
    Current Route Should Be    /admin/doctype/${DOC_PROXY}/edit
    Page Title Should Be    تعديل الوثيقة

Deleting A Document Asks First And Removes It
    Handle Future Dialogs    action=accept
    Click    [data-del="${DOC_DRAFT}"]
    Toast Should Contain    تم الحذف
    Get Element Count    \#doctypes-list .list-card    ==    2
    Row Count Should Be    document_types    0    id=${DOC_DRAFT}
    Get Text    .stat-card >> nth=0    *=    2

Cancelling The Confirmation Keeps The Document
    Handle Future Dialogs    action=dismiss
    Click    [data-del="${DOC_DRAFT}"]
    Get Element Count    \#doctypes-list .list-card    ==    3
    Row Count Should Be    document_types    1    id=${DOC_DRAFT}

The Toolbar Buttons Open The Other Admin Pages
    Click    id=new-doc-btn
    Current Route Should Be    /admin/doctype/new
    Go To Route    /admin
    Click    id=manage-cats-btn
    Current Route Should Be    /admin/categories
    Go To Route    /admin
    Click    id=agents-btn
    Current Route Should Be    /admin/agents
