*** Settings ***
Documentation       After generation: the ready page (preview, Word, PDF) and the local history.
Resource            ../resources/katib.resource
Suite Setup         Start Katib Test Environment
Suite Teardown      Stop Katib Test Environment
Test Setup          Open Fresh App
Test Tags           functional    public    ready    history


*** Keywords ***
Generate A Neighbour Complaint
    Go To Route    /doc/${DOC_NEIGHBOUR}
    Fill Neighbour Complaint    name=أحمد البناني    city=فاس
    Generate Document


*** Test Cases ***
Downloads Are Offered At Once When No Ad Is Configured
    Generate A Neighbour Complaint
    Page Title Should Be    الوثيقة جاهزة
    Get Element States    id=download-word    contains    visible
    Get Element States    id=download-pdf    contains    visible
    Get Element States    id=share-btn    contains    visible
    Get Element Count    id=watch-ad-btn    ==    0

The Preview Shows The Template Filled With The Answers
    Generate A Neighbour Complaint
    Get Element States    id=preview-box    contains    hidden
    Click    id=toggle-preview
    Get Text    \#preview-box .doc-preview    *=    أحمد البناني
    Get Text    \#preview-box .doc-preview    *=    فاس
    Get Text    \#preview-box .doc-preview    *=    G754103
    Get Text    \#preview-box .doc-preview    *=    .....
    Click    id=toggle-preview
    Get Element States    id=preview-box    contains    hidden

The Document Downloads As Word
    [Tags]    download
    Generate A Neighbour Complaint
    ${file}=    Download Should Be Saved    id=download-word    docx
    Should Be Equal    ${file}[suggestedFilename]    شكاية_بسبب_الجار.docx
    Toast Should Contain    تم تحميل الوثيقة بصيغة Word

The Document Downloads As PDF
    [Tags]    download
    Generate A Neighbour Complaint
    ${file}=    Download Should Be Saved    id=download-pdf    pdf
    Should Be Equal    ${file}[suggestedFilename]    شكاية_بسبب_الجار.pdf
    Toast Should Contain    تم تحميل الوثيقة بصيغة PDF

An Unknown Ready Page Says So
    Go To Route    /ready/unknown-entry
    Get Text    id=actions-slot    *=    تعذر العثور على هذه الوثيقة

The History Is Empty At First
    Go To Route    /history
    Get Text    id=history-main    *=    لا توجد وثائق في السجل بعد

A Generated Document Is Kept In The History
    Generate A Neighbour Complaint
    Go To Route    /history
    Get Element Count    .history-card    ==    1
    Get Text    .history-card .title    ==    شكاية بسبب الجار

The History Survives A Reload And Lists The Newest First
    Generate A Neighbour Complaint
    Go To Route    /doc/${DOC_PROXY}
    Fill Text    [data-field="الاسم الكامل"] input    سعيد
    Fill Text    [data-field="رقم البطاقة الوطنية"] input    BK12345
    Fill Text    [data-field="اسم الوكيل"] input    مريم
    Choose Combo Option    [data-field="المدينة"]    الرباط
    Generate Document
    Go To Route    /history
    Reload
    Get Element Count    .history-card    ==    2
    Get Text    .history-card .title >> nth=0    ==    توكيل خاص
    Get Text    .history-card .title >> nth=1    ==    شكاية بسبب الجار

Opening A History Entry Shows Its Ready Page Again
    Generate A Neighbour Complaint
    Go To Route    /history
    Click    .history-card [data-action="open"]
    Get Text    id=doc-name    ==    شكاية بسبب الجار
    Click    id=toggle-preview
    Get Text    \#preview-box .doc-preview    *=    أحمد البناني

Deleting A History Entry Removes It
    Generate A Neighbour Complaint
    Go To Route    /history
    Click    .history-card [data-action="delete"]
    Toast Should Contain    تم حذف الوثيقة من السجل
    Get Element Count    .history-card    ==    0
    Get Text    id=history-main    *=    لا توجد وثائق في السجل بعد
