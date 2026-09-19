"""JWT auth cookies and cookie-based authentication."""

from __future__ import annotations

from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.settings import api_settings as jwt_api_settings


ACCESS_COOKIE = "daq_access"
REFRESH_COOKIE = "daq_refresh"


def _secure_cookies() -> bool:
    return bool(getattr(settings, "USE_HTTPS", False))


def set_jwt_cookies(response, *, access: str, refresh: str | None = None) -> None:
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
        response.set_cookie(
            REFRESH_COOKIE,
            refresh,
            max_age=int(jwt_api_settings.REFRESH_TOKEN_LIFETIME.total_seconds()),
            **common,
        )


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
