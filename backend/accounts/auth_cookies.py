"""JWT auth cookies and cookie-based authentication."""

from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.settings import api_settings as jwt_api_settings
from rest_framework_simplejwt.tokens import RefreshToken


ACCESS_COOKIE = "daq_access"
REFRESH_COOKIE = "daq_refresh"


def _secure_cookies() -> bool:
    return bool(getattr(settings, "USE_HTTPS", False))


def remember_refresh_lifetime() -> timedelta:
    days = int(getattr(settings, "JWT_REMEMBER_REFRESH_DAYS", 30) or 30)
    return timedelta(days=max(1, days))


def session_refresh_lifetime() -> timedelta:
    hours = int(getattr(settings, "JWT_SESSION_REFRESH_HOURS", 12) or 12)
    return timedelta(hours=max(1, hours))


def issue_tokens_for_user(user, *, remember_me: bool = True) -> RefreshToken:
    """Mint refresh+access tokens with lifetime based on Keep me signed in."""
    refresh = RefreshToken.for_user(user)
    lifetime = remember_refresh_lifetime() if remember_me else session_refresh_lifetime()
    refresh.set_exp(lifetime=lifetime)
    refresh["remember_me"] = bool(remember_me)
    return refresh


def set_jwt_cookies(
    response,
    *,
    access: str,
    refresh: str | None = None,
    remember_me: bool | None = None,
) -> None:
    common = {
        "httponly": True,
        "secure": _secure_cookies(),
        "samesite": "Lax",
        "path": "/api/",
    }
    response.set_cookie(
        ACCESS_COOKIE,
        access,
        max_age=int(jwt_api_settings.ACCESS_TOKEN_LIFETIME.total_seconds()),
        **common,
    )
    if refresh is not None:
        # remember_me True → persistent cookie; False → browser-session cookie
        if remember_me is False:
            max_age = None
        elif remember_me is True:
            max_age = int(remember_refresh_lifetime().total_seconds())
        else:
            max_age = int(jwt_api_settings.REFRESH_TOKEN_LIFETIME.total_seconds())
        kwargs = {**common}
        if max_age is not None:
            kwargs["max_age"] = max_age
        response.set_cookie(REFRESH_COOKIE, refresh, **kwargs)


def clear_jwt_cookies(response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/api/", samesite="Lax")
    response.delete_cookie(REFRESH_COOKIE, path="/api/", samesite="Lax")


class JWTCookieAuthentication(JWTAuthentication):
    """Authenticate via Authorization Bearer header or HttpOnly access cookie."""

    def authenticate(self, request):
        header = self.get_header(request)
        if header is not None:
            return super().authenticate(request)

        raw_token = request.COOKIES.get(ACCESS_COOKIE)
        if not raw_token:
            return None
        try:
            validated_token = self.get_validated_token(raw_token)
            return self.get_user(validated_token), validated_token
        except (InvalidToken, TokenError):
            return None
