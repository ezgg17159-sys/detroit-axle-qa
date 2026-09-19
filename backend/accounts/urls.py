from django.urls import path

from .views import (
    ChangePasswordView,
    CookieTokenRefreshView,
    CsrfView,
    ForgotPasswordView,
    LoginView,
    LogoutView,
    MeView,
    ProvisionLoginView,
    ResetPasswordView,
)

urlpatterns = [
    path("csrf/", CsrfView.as_view(), name="auth-csrf"),
    path("login/", LoginView.as_view(), name="auth-login"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("refresh/", CookieTokenRefreshView.as_view(), name="auth-refresh"),
    path("me/", MeView.as_view(), name="auth-me"),
    path("change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
    path("provision-login/", ProvisionLoginView.as_view(), name="auth-provision-login"),
    path("forgot-password/", ForgotPasswordView.as_view(), name="auth-forgot-password"),
    path("reset-password/", ResetPasswordView.as_view(), name="auth-reset-password"),
]
