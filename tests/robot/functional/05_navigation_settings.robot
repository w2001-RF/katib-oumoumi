*** Settings ***
Documentation       Bottom navigation, settings page, unknown routes.
Resource            ../resources/katib.resource
Suite Setup         Start Katib Test Environment
Suite Teardown      Stop Katib Test Environment
Test Setup          Open Fresh App
Test Tags           functional    public    navigation


*** Test Cases ***
The Bottom Navigation Opens Each Tab And Marks It Active
    FOR    ${path}    ${title}    IN
    ...    /categories    التصنيفات
    ...    /history    سجل الوثائق
    ...    /settings    الإعدادات
        Click    .bottom-nav [data-nav="${path}"]
        Current Route Should Be    ${path}
        Page Title Should Be    ${title}
        Get Attribute    .bottom-nav [data-nav="${path}"]    class    ==    active
    END
    Click    .bottom-nav [data-nav="/"]
    Current Route Should Be    /
    Get Text    .hero-banner h1    *=    كاتب عمومي

Settings Rows Give Information
    Go To Route    /settings
    Click    id=about-row
    Toast Should Contain    كاتب عمومي — v1.0.0
    Click    id=privacy-row
    Toast Should Contain    لا يقوم التطبيق بجمع أي بيانات شخصية
    Click    id=rate-row
    Toast Should Contain    شكراً لدعمك

Settings Show The Contact Address And The Admin Entry
    Go To Route    /settings
    Get Text    id=contact-row    *=    contact@katiboumoumi.online
    Click    a >> text=دخول المسؤول
    Current Route Should Be    /admin/login
    Page Title Should Be    دخول المسؤول

An Unknown Route Shows A Not Found Message
    Go To Route    /no/such/page
    Get Text    id=app    *=    الصفحة غير موجودة

The Page Has A Title, A Description And RTL Arabic Layout
    Get Title    *=    كاتب عمومي
    Get Attribute    html    lang    ==    ar
    Get Attribute    html    dir    ==    rtl
    Get Attribute    meta[name="description"]    content    *=    الوثائق الإدارية المغربية
