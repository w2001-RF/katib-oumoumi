*** Settings ***
Documentation       Document form: fields from the catalog, validation, dropdowns, generation.
Resource            ../resources/katib.resource
Suite Setup         Start Katib Test Environment
Suite Teardown      Stop Katib Test Environment
Test Setup          Open Fresh App    /doc/${DOC_NEIGHBOUR}
Test Tags           functional    public    form


*** Test Cases ***
The Form Shows Every Field Of The Document In Order
    Page Title Should Be    شكاية بسبب الجار
    Get Element Count    \#doc-form [data-field]    ==    7
    Get Attribute    \#doc-form [data-field] >> nth=0    data-field    ==    الاسم الكامل
    Get Attribute    \#doc-form [data-field] >> nth=6    data-field    ==    التاريخ
    Get Element Count    [data-field="الاسم الكامل"] .req    ==    1
    Get Element Count    [data-field="البريد الإلكتروني"] .req    ==    0
    Get Attribute    [data-field="رقم الهاتف"] input    inputmode    ==    tel
    Get Attribute    [data-field="التاريخ"] input    type    ==    date
    Get Attribute    [data-field="الاسم الكامل"] input    placeholder    ==    مثال: فاطمة الزهراء العلوي

Each Field Is Named By Its Label
    Get Attribute    [data-field="الاسم الكامل"] label    for    ==    f-0
    Get Attribute    [data-field="الاسم الكامل"] input    id    ==    f-0
    # The dropdown's visible button takes over the label of the hidden <select>.
    ${for}=    Get Attribute    [data-field="المدينة"] label    for
    Get Attribute    [data-field="المدينة"] .combo-trigger    id    ==    ${for}
    Click    [data-field="المدينة"] label
    Get Attribute    [data-field="المدينة"] .combo-trigger    aria-expanded    ==    true

Errors Are Tied To Their Field And The First One Gets Focus
    Click    id=submit-btn
    Get Attribute    [data-field="الاسم الكامل"] input    aria-invalid    ==    true
    ${error_id}=    Get Attribute    [data-field="الاسم الكامل"] input    aria-describedby
    Get Text    id=${error_id}    ==    هذا الحقل إلزامي
    Get Attribute    [data-field="المدينة"] .combo-trigger    aria-invalid    ==    true
    Get Element States    [data-field="الاسم الكامل"] input    contains    focused
    Get Element Count    [data-field="البريد الإلكتروني"] input[aria-invalid]    ==    0

Required Fields Are Checked Before Generating
    Click    id=submit-btn
    Field Error Should Be    الاسم الكامل    هذا الحقل إلزامي
    Field Error Should Be    المدينة    هذا الحقل إلزامي
    Field Error Should Be    تفاصيل الشكاية    هذا الحقل إلزامي
    Field Should Have No Error    البريد الإلكتروني
    Current Route Should Be    /doc/${DOC_NEIGHBOUR}
    Row Count Should Be    generated_documents    3

Formats Are Checked: CIN, Phone And E-mail
    Fill Neighbour Complaint    cin=123    phone=0112    email=not-an-email
    Click    id=submit-btn
    Field Error Should Be    رقم البطاقة الوطنية    رقم البطاقة الوطنية غير صحيح (مثال: G754103)
    Field Error Should Be    رقم الهاتف    رقم الهاتف غير صحيح (مثال: 06XXXXXXXX)
    Field Error Should Be    البريد الإلكتروني    البريد الإلكتروني غير صحيح
    Field Should Have No Error    الاسم الكامل

Correcting A Field Clears Its Error
    Fill Neighbour Complaint    cin=123
    Click    id=submit-btn
    Field Error Should Be    رقم البطاقة الوطنية    رقم البطاقة الوطنية غير صحيح (مثال: G754103)
    Fill Text    [data-field="رقم البطاقة الوطنية"] input    AB123456
    Fill Text    [data-field="رقم الهاتف"] input    abc
    Click    id=submit-btn
    Field Should Have No Error    رقم البطاقة الوطنية

The City Dropdown Is Searchable
    Click    [data-field="المدينة"] .combo-trigger
    Get Element Count    [data-field="المدينة"] .combo-option    ==    5
    Fill Text    [data-field="المدينة"] .combo-search    الدار
    Get Element Count    [data-field="المدينة"] .combo-option    ==    2
    Get Text    [data-field="المدينة"] .combo-option >> nth=0    ==    الدار البيضاء
    Get Text    [data-field="المدينة"] .combo-option >> nth=1    ==    أخرى

Searching Ignores Hamza Spelling
    Click    [data-field="المدينة"] .combo-trigger
    Fill Text    [data-field="المدينة"] .combo-search    اخرى
    Get Element Count    [data-field="المدينة"] .combo-option    ==    1

Choosing «أخرى» Lets The User Type Another City
    Get Element States    [data-field="المدينة"] .other-input    contains    hidden
    Choose Combo Option    [data-field="المدينة"]    أخرى
    Get Element States    [data-field="المدينة"] .other-input    contains    visible
    Fill Neighbour Complaint    city=أخرى
    Fill Text    [data-field="المدينة"] .other-input    تيفلت
    Generate Document
    ${rows}=    Get Rows    generated_documents    document_type_id=${DOC_NEIGHBOUR}
    Should Be Equal    ${rows}[-1][data][المدينة]    تيفلت

A Valid Form Generates The Document And Records It
    Fill Neighbour Complaint    email=fatima@mail.ma
    Generate Document
    Get Text    id=doc-name    ==    شكاية بسبب الجار
    Row Count Should Be    generated_documents    4
    ${doc}=    Get Row    document_types    id=${DOC_NEIGHBOUR}
    Should Be Equal As Integers    ${doc}[usage_count]    43
    ${rows}=    Get Rows    generated_documents    document_type_id=${DOC_NEIGHBOUR}
    ${saved}=    Set Variable    ${rows}[-1][data]
    Should Be Equal    ${saved}[الاسم الكامل]    فاطمة الزهراء العلوي
    Should Be Equal    ${saved}[المدينة]    سطات
    Should Be Equal    ${saved}[البريد الإلكتروني]    fatima@mail.ma
    Should Be Equal    ${saved}[التاريخ]    2026-10-17

The Optional E-mail Can Be Left Empty
    Fill Neighbour Complaint
    Generate Document
    ${rows}=    Get Rows    generated_documents    document_type_id=${DOC_NEIGHBOUR}
    Should Be Equal    ${rows}[-1][data][البريد الإلكتروني]    ${EMPTY}

Generating Still Works When The Usage Counter Fails
    Fail Next Requests    /rpc/increment_document_usage    status=500
    Fill Neighbour Complaint
    Generate Document
    Row Count Should Be    generated_documents    4

An Unknown Document Shows A Message
    Go To Route    /doc/does-not-exist
    Get Text    id=form-main    *=    تعذر تحميل هذه الوثيقة

An Unpublished Document Cannot Be Opened By Visitors
    Go To Route    /doc/${DOC_DRAFT}
    Get Text    id=form-main    *=    تعذر تحميل هذه الوثيقة
