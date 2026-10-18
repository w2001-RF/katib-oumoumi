*** Settings ***
Documentation       Admin sign-in, sign-out and the guard on admin pages.
Resource            ../resources/katib.resource
Suite Setup         Start Katib Test Environment
Suite Teardown      Stop Katib Test Environment
Test Setup          Open Fresh App
Test Tags           functional    admin    auth


*** Test Cases ***
Admin Pages Require Signing In
    FOR    ${route}    IN    /admin    /admin/categories    /admin/agents    /admin/doctype/new
        Go To Route    ${route}
        Current Route Should Be    /admin/login
    END

A Wrong Password Is Refused
    Sign In As Admin    password=wrong-password
    Get Text    id=login-error    ==    البريد الإلكتروني أو كلمة المرور غير صحيحة
    Current Route Should Be    /admin/login
    Get Element States    id=login-btn    contains    enabled

The Admin Signs In And Reaches The Dashboard
    Sign In As Admin And Open Dashboard
    Page Title Should Be    لوحة التحكم
    Get Text    .admin-badge    ==    وضع المسؤول

The Session Is Kept After A Reload
    Sign In As Admin And Open Dashboard
    Reload
    Current Route Should Be    /admin
    Wait For Elements State    .stat-grid    visible

An Already Signed-In Admin Skips The Login Page
    Sign In As Admin And Open Dashboard
    Go To Route    /admin/login
    Current Route Should Be    /admin

Signing Out Closes The Admin Pages
    Sign In As Admin And Open Dashboard
    Click    id=logout-btn
    Current Route Should Be    /settings
    Go To Route    /admin
    Current Route Should Be    /admin/login

After Signing In The Admin Returns To The Page Asked For
    Go To Route    /admin/categories
    Current Route Should Be    /admin/login
    Sign In As Admin
    Current Route Should Be    /admin/categories
    Page Title Should Be    إدارة التصنيفات
