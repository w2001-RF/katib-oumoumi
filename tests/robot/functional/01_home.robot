*** Settings ***
Documentation       Home page: most requested documents, search, navigation, error state.
Resource            ../resources/katib.resource
Suite Setup         Start Katib Test Environment
Suite Teardown      Stop Katib Test Environment
Test Setup          Open Fresh App
Test Tags           functional    public    home


*** Test Cases ***
Home Shows The Hero And The Most Requested Documents
    Get Text    .hero-banner h1    *=    كاتب عمومي
    Get Element Count    \#most-requested-list .list-card    ==    2
    Get Text    \#most-requested-list .list-card >> nth=0    *=    شكاية بسبب الجار
    Get Text    \#most-requested-list .list-card >> nth=0    *=    42 استخدام
    Get Text    \#most-requested-list .list-card >> nth=1    *=    توكيل خاص

Unpublished Documents Are Never Listed
    Get Element Count    \#most-requested-list .list-card    ==    2
    Get Text    id=most-requested-list    not contains    مسودة غير منشورة

The Search Field Is Always Shown At The Top
    Wait For Elements State    id=search-input    visible
    Get Attribute    id=search-input    type    ==    search
    Get Element Count    [data-action="search"]    ==    0

Search Finds A Document By Name
    Fill Text    id=search-input    توكيل
    Get Element Count    \#most-requested-list .list-card    ==    1
    Get Text    id=list-title    ==    نتائج البحث
    Get Text    \#most-requested-list .list-card    *=    توكيل خاص

Search Without Result Says So
    Fill Text    id=search-input    وثيقة غير موجودة
    Get Text    id=most-requested-list    *=    لا توجد نتائج مطابقة

Clearing The Search Shows The Most Requested Again
    Fill Text    id=search-input    توكيل
    Get Element Count    \#most-requested-list .list-card    ==    1
    Fill Text    id=search-input    ${EMPTY}
    Get Element Count    \#most-requested-list .list-card    ==    2
    Get Text    id=list-title    ==    الأكثر طلباً

A Document Card Opens Its Form
    Click    \#most-requested-list .list-card >> nth=0
    Current Route Should Be    /doc/${DOC_NEIGHBOUR}
    Page Title Should Be    شكاية بسبب الجار

Browse Button Opens The Categories
    Click    id=browse-btn
    Current Route Should Be    /categories
    Page Title Should Be    التصنيفات

Footer Links Lead To The Main Pages
    Get Attribute    .site-footer a >> text=سجل الوثائق    href    ==    \#/history
    Get Attribute    .site-footer a >> text=الإعدادات    href    ==    \#/settings
    Get Attribute    .site-footer a >> text=واتساب    href    *=    https://wa.me/

A Backend Error Shows A Message Instead Of The List
    Get Element Count    \#most-requested-list .list-card    ==    2
    Fail Next Requests    /rest/v1/document_types    status=500
    Reload
    Get Text    id=most-requested-list    *=    تعذر تحميل الوثائق
