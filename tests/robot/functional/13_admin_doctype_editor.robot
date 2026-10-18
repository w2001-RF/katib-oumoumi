*** Settings ***
Documentation       Admin: create and edit a document type (information, fields, dropdown lists, template).
Resource            ../resources/katib.resource
Suite Setup         Start Katib Test Environment
Suite Teardown      Stop Katib Test Environment
Test Setup          Open Fresh App And Sign In
Test Tags           functional    admin    editor


*** Variables ***
${LAST_ROW}         \#fields-list [data-row-id] >> nth=-1
${RESIDENCE}        <p>أشهد أن {{الاسم الكامل}} يسكن بـ{{الحي}} منذ {{مدة السكن}}.</p>
&{TYPE_LABELS}      varchar=نص قصير    text=نص طويل    int=رقم    date=تاريخ    phone=رقم هاتف    email=بريد إلكتروني
...                 cin=رقم البطاقة الوطنية    select=قائمة اختيارات


*** Keywords ***
Open Fresh App And Sign In
    Open Fresh App
    Sign In As Admin And Open Dashboard

Add Field
    [Documentation]    Adds a row and fills it; for a dropdown, ``list`` is an existing list name or ``new:<name>``.
    [Arguments]    ${key}    ${label}    ${type}=varchar    ${required}=True    ${list}=${EMPTY}    @{options}
    Click    id=add-field-btn
    Fill Text    ${LAST_ROW} >> .f-key    ${key}
    Fill Text    ${LAST_ROW} >> .f-label    ${label}
    Choose Combo Option    ${LAST_ROW} >> .field:has(.f-type)    ${TYPE_LABELS}[${type}]
    IF    not ${required}    Uncheck Checkbox    ${LAST_ROW} >> .f-required
    IF    $list.startswith('new:')
        Choose Combo Option    ${LAST_ROW} >> .f-options-wrap    + قائمة جديدة
        Fill Text    ${LAST_ROW} >> .f-list-name    ${list}[4:]
    ELSE IF    $list
        Choose Combo Option    ${LAST_ROW} >> .f-options-wrap    ${list}
    END
    IF    $options
        ${text}=    Evaluate    "\\n".join($options)
        Fill Text    ${LAST_ROW} >> .f-options    ${text}
    END

Fill Document Information
    [Arguments]    ${name}    ${category}=شكايات    ${description}=${EMPTY}
    Fill Text    \#meta-form input[name="name_ar"]    ${name}
    Fill Text    \#meta-form input[name="description_ar"]    ${description}
    Choose Combo Option    \#meta-form .field:has(select[name="category_id"])    ${category}

Save Document
    Click    id=save-btn
    Toast Should Contain    تم حفظ الوثيقة بنجاح
    Current Route Should Be    /admin


*** Test Cases ***
A New Document With Fields And A New Dropdown List Is Saved
    Go To Route    /admin/doctype/new
    Page Title Should Be    وثيقة جديدة
    Fill Document Information    شهادة السكنى    category=طلبات إدارية    description=شهادة تثبت مقر السكن
    Add Field    الاسم الكامل    الاسم الكامل
    Add Field    الحي    الحي    select    True    new:الأحياء    الحي الحسني    حي الرياض    أخرى
    Add Field    مدة السكن    مدة السكن    varchar    False
    Fill Text    id=template-body    ${RESIDENCE}
    Save Document
    ${doc}=    Get Row    document_types    name_ar=شهادة السكنى
    Should Be Equal    ${doc}[category_id]    ${CAT_EMPTY}
    Should Be True    ${doc}[is_published]
    Should Be Equal    ${doc}[template_body]    ${RESIDENCE}
    ${list}=    Get Row    option_lists    name=الأحياء
    Row Count Should Be    option_list_items    3    list_id=${list}[id]
    Row Count Should Be    document_type_fields    3    document_type_id=${doc}[id]
    Row Count Should Be    field_definitions    1    field_key=الاسم الكامل
    ${def}=    Get Row    field_definitions    field_key=الحي
    Should Be Equal    ${def}[option_list_id]    ${list}[id]
    ${link}=    Get Row    document_type_fields    document_type_id=${doc}[id]    field_id=${def}[id]
    Should Be True    ${link}[is_required]
    ${optional}=    Get Row    field_definitions    field_key=مدة السكن
    ${link}=    Get Row    document_type_fields    document_type_id=${doc}[id]    field_id=${optional}[id]
    Should Not Be True    ${link}[is_required]

The New Document Is Usable By Visitors
    Go To Route    /admin/doctype/new
    Fill Document Information    شهادة السكنى    category=طلبات إدارية
    Add Field    الاسم الكامل    الاسم الكامل
    Add Field    المدينة    المدينة    select    True    المدن    الرباط    الدار البيضاء    سطات    فاس    أخرى
    Fill Text    id=template-body    <p>{{الاسم الكامل}} — {{المدينة}}</p>
    Save Document
    Go To Route    /categories/${CAT_EMPTY}
    Click    .list-card >> text=شهادة السكنى
    Get Element Count    \#doc-form [data-field]    ==    2
    Click    [data-field="المدينة"] .combo-trigger
    Get Element Count    [data-field="المدينة"] .combo-option    ==    5

An Existing Document Is Edited And Unpublished
    Go To Route    /admin/doctype/${DOC_PROXY}/edit
    Page Title Should Be    تعديل الوثيقة
    Get Attribute    \#meta-form input[name="name_ar"]    value    ==    توكيل خاص
    Get Element Count    \#fields-list [data-row-id]    ==    4
    Fill Text    \#meta-form input[name="name_ar"]    توكيل خاص للبيع
    Uncheck Checkbox    \#meta-form input[name="is_published"]
    Save Document
    ${doc}=    Get Row    document_types    id=${DOC_PROXY}
    Should Be Equal    ${doc}[name_ar]    توكيل خاص للبيع
    Should Not Be True    ${doc}[is_published]
    Go To Route    /categories/${CAT_PROXIES}
    Get Text    id=doctype-list    *=    لا توجد وثائق في هذا التصنيف بعد

Removing A Field Removes It From The Document Only
    Go To Route    /admin/doctype/${DOC_PROXY}/edit
    Click    \#fields-list [data-row-id] >> nth=2 >> [data-remove-row]
    Get Element Count    \#fields-list [data-row-id]    ==    3
    Save Document
    Row Count Should Be    document_type_fields    3    document_type_id=${DOC_PROXY}
    Row Count Should Be    field_definitions    1    field_key=اسم الوكيل

The Preview Fills The Template With Sample Values
    Go To Route    /admin/doctype/new
    Add Field    الاسم الكامل    الاسم الكامل
    Add Field    الهاتف    الهاتف    phone
    Fill Text    id=template-body    <p>{{الاسم الكامل}} / {{الهاتف}}</p>
    Click    id=preview-btn
    Get Text    \#preview-slot .doc-preview    ==    مثال نصي / 0612345678

A Document Needs A Name
    Go To Route    /admin/doctype/new
    Click    id=save-btn
    Toast Should Contain    يرجى إدخال اسم الوثيقة واختيار التصنيف
    Current Route Should Be    /admin/doctype/new

Every Field Needs A Key And A Label
    Go To Route    /admin/doctype/new
    Fill Document Information    وثيقة تجريبية
    Click    id=add-field-btn
    Click    id=save-btn
    Toast Should Contain    يرجى تعبئة مفتاح وتسمية كل حقل

Field Keys Must Be Unique
    Go To Route    /admin/doctype/new
    Fill Document Information    وثيقة تجريبية
    Add Field    الاسم    الاسم
    Add Field    الاسم    الاسم مرة ثانية
    Click    id=save-btn
    Toast Should Contain    مفاتيح الحقول يجب أن تكون فريدة

A Dropdown Needs Choices And A Unique New List Name
    Go To Route    /admin/doctype/new
    Fill Document Information    وثيقة تجريبية
    Add Field    الحي    الحي    select    True    new:المدن    حي
    Click    id=save-btn
    Toast Should Contain    اسم القائمة "المدن" مستعمل
    Fill Text    ${LAST_ROW} >> .f-options    ${EMPTY}
    Click    id=save-btn
    Toast Should Contain    يرجى إضافة اختيارات للقائمة: الحي

A Key Reused With Another Type Is Refused
    Go To Route    /admin/doctype/new
    Fill Document Information    وثيقة تجريبية
    Add Field    رقم الهاتف    رقم الهاتف    varchar
    Click    id=save-btn
    Toast Should Contain    مفتاح الحقل "رقم الهاتف" مستعمل بنوع مختلف في وثائق أخرى
