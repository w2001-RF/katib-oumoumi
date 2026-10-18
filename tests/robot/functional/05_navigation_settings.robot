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
    Get Text    id=about-row    *=    v1.0.0
    Click    id=rate-row
    Toast Should Contain    شكراً لدعمك

«About» Opens The App's Card And «OK» Closes It
    Go To Route    /settings
    Click    id=about-row
    Wait For Elements State    dialog.info-dialog    visible
    Get Text    \#info-dialog-title    ==    كاتب عمومي
    Get Text    .info-dialog-subtitle    ==    الإصدار 1.0.0
    Get Text    .info-dialog-body    *=    Word أو PDF
    Get Attribute    .info-dialog-footer a    href    ==    https://t.me/KatibOumoumiBot
    Click    .info-dialog-ok
    Get Element Count    dialog.info-dialog    ==    0

The Card Also Closes With Escape Or A Click Outside
    Go To Route    /settings
    Click    id=about-row
    Wait For Elements State    dialog.info-dialog    visible
    Keyboard Key    press    Escape
    Get Element Count    dialog.info-dialog    ==    0
    Click    id=about-row
    Wait For Elements State    dialog.info-dialog    visible
    Mouse Button    click    10    10
    Get Element Count    dialog.info-dialog    ==    0

The Privacy Policy Has Its Own Page
    Go To Route    /settings
    Click    id=privacy-row
    Current Route Should Be    /privacy
    Page Title Should Be    سياسة الخصوصية
    Get Text    .policy-title    ==    سياسة الخصوصية — كاتب عمومي
    Get Text    .policy-updated    *=    آخر تحديث
    Get Element Count    .policy section    ==    9
    Get Text    .policy    *=    09-08
    Get Text    .policy    *=    /forget
    Get Attribute    .policy-mail    href    ==    mailto:contact@katiboumoumi.online
    Get Attribute    .bottom-nav [data-nav="/settings"]    class    ==    active
    Click    [data-action="back"]
    Current Route Should Be    /settings

The Privacy Policy Is Linked From The Home Footer
    Get Attribute    .site-footer a >> text=سياسة الخصوصية    href    ==    \#/privacy

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
