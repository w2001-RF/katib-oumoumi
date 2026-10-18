*** Settings ***
Documentation       UAT — the admin adds a new document type, a citizen uses it, the admin follows its
...                 use and then withdraws it. The admin and the citizen use two separate browsers.
...
...                 Acceptance criteria:
...                 - a category and a document (fields, dropdown, template) are created without code;
...                 - once published, citizens find the document and generate it with the admin's template;
...                 - the dashboard counts the generation;
...                 - an expired admin session asks to sign in again and returns to the same page;
...                 - an unpublished document disappears for citizens at once.
Resource            ../resources/katib.resource
Suite Setup         Start Katib Test Environment
Suite Teardown      Stop Katib Test Environment
Test Setup          Reset Mock Data
Test Tags           uat    e2e    admin


*** Variables ***
${CATEGORY}         شواهد إدارية
${DOCUMENT}         شهادة السكنى
${TEMPLATE}         <p>أنا الموقع أسفله، أشهد أن السيد(ة) {{الاسم الكامل}} يقطن بمدينة {{المدينة}}.</p>
${ROW}              \#fields-list [data-row-id] >> nth=-1


*** Test Cases ***
The Admin Publishes A New Document That Citizens Can Use
    Given the admin is signed in
    When the admin creates the category "${CATEGORY}"
    And the admin creates the published document "${DOCUMENT}" in "${CATEGORY}"
    Then the dashboard lists "${DOCUMENT}" with 0 uses
    When a citizen generates "${DOCUMENT}" for "سلمى الإدريسي" in "الرباط"
    Then the citizen's document follows the admin's template
    And the dashboard lists "${DOCUMENT}" with 1 uses
    When the admin's session expires while working
    Then the admin signs in again and is back on the categories page
    When the admin unpublishes "${DOCUMENT}"
    Then citizens no longer see "${DOCUMENT}"


*** Keywords ***
The admin is signed in
    ${admin}=    New Context    viewport=${VIEWPORT}    acceptDownloads=True    locale=ar-MA
    Set Test Variable    ${ADMIN_CONTEXT}    ${admin}
    New Page    ${BASE_URL}/#/
    Sign In As Admin And Open Dashboard

The admin creates the category "${name}"
    Click    id=manage-cats-btn
    Fill Text    \#new-cat-form input[name="name_ar"]    ${name}
    Click    \#new-cat-form button[type="submit"]
    Toast Should Contain    تمت الإضافة
    Get Element Count    \#cat-list input.f-name[value="${name}"]    ==    1
    Go To Route    /admin

The admin creates the published document "${name}" in "${category}"
    Click    id=new-doc-btn
    Fill Text    \#meta-form input[name="name_ar"]    ${name}
    Choose Combo Option    \#meta-form .field:has(select[name="category_id"])    ${category}
    Get Element States    \#meta-form input[name="is_published"]    contains    checked
    Click    id=add-field-btn
    Fill Text    ${ROW} >> .f-key    الاسم الكامل
    Fill Text    ${ROW} >> .f-label    الاسم الكامل
    Click    id=add-field-btn
    Fill Text    ${ROW} >> .f-key    المدينة
    Fill Text    ${ROW} >> .f-label    المدينة
    Choose Combo Option    ${ROW} >> .field:has(.f-type)    قائمة اختيارات
    Choose Combo Option    ${ROW} >> .f-options-wrap    المدن
    Fill Text    id=template-body    ${TEMPLATE}
    Click    id=preview-btn
    Get Text    \#preview-slot    *=    مثال نصي
    Click    id=save-btn
    Toast Should Contain    تم حفظ الوثيقة بنجاح
    Current Route Should Be    /admin

The dashboard lists "${name}" with ${uses} uses
    Switch Context    ${ADMIN_CONTEXT}
    Go To Route    /admin
    Reload
    Get Text    \#doctypes-list .list-card:has-text("${name}")    *=    ${uses} استخدام

A citizen generates "${name}" for "${person}" in "${city}"
    ${citizen}=    New Context    viewport=${VIEWPORT}    acceptDownloads=True    locale=ar-MA
    Set Test Variable    ${CITIZEN_CONTEXT}    ${citizen}
    New Page    ${BASE_URL}/#/categories
    Click    .category-tile:has-text("${CATEGORY}")
    Click    .list-card:has-text("${name}")
    Fill Text    [data-field="الاسم الكامل"] input    ${person}
    Choose Combo Option    [data-field="المدينة"]    ${city}
    Generate Document
    Set Test Variable    ${PERSON}    ${person}
    Set Test Variable    ${CITY}    ${city}

The citizen's document follows the admin's template
    Click    id=toggle-preview
    Get Text    \#preview-box .doc-preview    ==    أنا الموقع أسفله، أشهد أن السيد(ة) ${PERSON} يقطن بمدينة ${CITY}.
    Download Should Be Saved    id=download-word    docx

The admin's session expires while working
    Switch Context    ${ADMIN_CONTEXT}
    Go To Route    /admin/categories
    Get Element Count    \#cat-list input.f-name[value="${CATEGORY}"]    ==    1
    Expire Admin Session    revoke_refresh_token=True
    Click    [data-save] >> nth=0

The admin signs in again and is back on the categories page
    Current Route Should Be    /admin/login
    Get Text    id=login-expired    *=    انتهت صلاحية الجلسة
    Sign In As Admin
    Current Route Should Be    /admin/categories
    Get Element Count    \#cat-list input.f-name[value="${CATEGORY}"]    ==    1

The admin unpublishes "${name}"
    Go To Route    /admin
    Click    \#doctypes-list .list-card:has-text("${name}") .title
    Uncheck Checkbox    \#meta-form input[name="is_published"]
    Click    id=save-btn
    Toast Should Contain    تم حفظ الوثيقة بنجاح
    Get Text    \#doctypes-list .list-card:has-text("${name}")    *=    غير منشورة

Citizens no longer see "${name}"
    Switch Context    ${CITIZEN_CONTEXT}
    Go To Route    /categories
    Click    .category-tile:has-text("${CATEGORY}")
    Get Text    id=doctype-list    *=    لا توجد وثائق في هذا التصنيف بعد
    Go To Route    /
    Click    [data-action="search"]
    Fill Text    id=search-input    ${name}
    Get Text    id=most-requested-list    *=    لا توجد نتائج مطابقة
