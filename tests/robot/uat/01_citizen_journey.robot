*** Settings ***
Documentation       UAT — a citizen prepares a complaint about a neighbour, from the home page to the
...                 downloaded file, then finds it again in the history.
...
...                 Acceptance criteria:
...                 - the citizen finds the document by browsing and by searching;
...                 - mistakes are explained next to the field, nothing is generated before they are fixed;
...                 - the document is filled with the answers and downloads as Word and PDF;
...                 - it stays in the history on this device, can be reopened and deleted;
...                 - the generation is counted for the admin.
Resource            ../resources/katib.resource
Suite Setup         Start Katib Test Environment
Suite Teardown      Stop Katib Test Environment
Test Setup          Open Fresh App
Test Tags           uat    e2e    citizen


*** Test Cases ***
A Citizen Prepares, Downloads And Finds Again A Complaint
    Given the citizen is on the home page
    When the citizen browses to the complaints category
    And opens the complaint about a neighbour
    And submits the form with mistakes
    Then each mistake is explained next to its field
    When the citizen corrects the answers and generates the document
    Then the document is ready and filled with the answers
    And the document can be downloaded as Word and as PDF
    And the generation is recorded for the admin
    When the citizen opens the history
    Then the complaint is listed and can be opened again
    And the complaint can be deleted from the history

A Citizen Finds A Document By Searching
    Given the citizen is on the home page
    When the citizen searches for "توكيل"
    Then the only result is "توكيل خاص"
    When the citizen opens the result
    Then the form of "توكيل خاص" is shown


*** Keywords ***
The citizen is on the home page
    Current Route Should Be    /
    Get Text    .hero-banner h1    *=    كاتب عمومي

The citizen browses to the complaints category
    Click    id=browse-btn
    Click    [data-cat-id="${CAT_COMPLAINTS}"]
    Page Title Should Be    شكايات

Opens the complaint about a neighbour
    Click    [data-doc-id="${DOC_NEIGHBOUR}"]
    Page Title Should Be    شكاية بسبب الجار

Submits the form with mistakes
    Fill Neighbour Complaint    name=يوسف المرابط    cin=12345    phone=0612    city=أخرى    email=youssef@
    Click    id=submit-btn

Each mistake is explained next to its field
    Field Error Should Be    رقم البطاقة الوطنية    رقم البطاقة الوطنية غير صحيح (مثال: G754103)
    Field Error Should Be    رقم الهاتف    رقم الهاتف غير صحيح (مثال: 06XXXXXXXX)
    Field Error Should Be    البريد الإلكتروني    البريد الإلكتروني غير صحيح
    Current Route Should Be    /doc/${DOC_NEIGHBOUR}
    Row Count Should Be    generated_documents    3

The citizen corrects the answers and generates the document
    Fill Text    [data-field="رقم البطاقة الوطنية"] input    BE987654
    Fill Text    [data-field="رقم الهاتف"] input    0698765432
    Fill Text    [data-field="البريد الإلكتروني"] input    youssef@mail.ma
    Fill Text    [data-field="المدينة"] .other-input    تيفلت
    Generate Document

The document is ready and filled with the answers
    Page Title Should Be    الوثيقة جاهزة
    Get Text    id=doc-name    ==    شكاية بسبب الجار
    Click    id=toggle-preview
    FOR    ${expected}    IN    يوسف المرابط    BE987654    تيفلت    0698765432    youssef@mail.ma
        Get Text    \#preview-box .doc-preview    *=    ${expected}
    END
    Get Text    \#preview-box .doc-preview    *=    2026

The document can be downloaded as Word and as PDF
    Download Should Be Saved    id=download-word    docx
    Download Should Be Saved    id=download-pdf    pdf

The generation is recorded for the admin
    Row Count Should Be    generated_documents    4
    ${doc}=    Get Row    document_types    id=${DOC_NEIGHBOUR}
    Should Be Equal As Integers    ${doc}[usage_count]    43

The citizen opens the history
    Click    .bottom-nav [data-nav="/history"]
    Page Title Should Be    سجل الوثائق

The complaint is listed and can be opened again
    Get Element Count    .history-card    ==    1
    Get Text    .history-card .title    ==    شكاية بسبب الجار
    Click    .history-card [data-action="open"]
    Get Text    id=doc-name    ==    شكاية بسبب الجار
    Click    .bottom-nav [data-nav="/history"]

The complaint can be deleted from the history
    Click    .history-card [data-action="delete"]
    Toast Should Contain    تم حذف الوثيقة من السجل
    Get Text    id=history-main    *=    لا توجد وثائق في السجل بعد

The citizen searches for "${text}"
    Fill Text    id=search-input    ${text}

The only result is "${name}"
    Get Element Count    \#most-requested-list .list-card    ==    1
    Get Text    \#most-requested-list .list-card    *=    ${name}

The citizen opens the result
    Click    \#most-requested-list .list-card

The form of "${name}" is shown
    Page Title Should Be    ${name}
    Get Element States    id=submit-btn    contains    visible
