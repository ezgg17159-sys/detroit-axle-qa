"""Security headers (CSP and related)."""

from __future__ import annotations

from django.conf import settings


class SecurityHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response.setdefault("X-Content-Type-Options", "nosniff")
        response.setdefault("Referrer-Policy", "same-origin")
        response.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        # Production: same-origin API only. Dev: allow local Vite + HTTPS for tunnels.
        connect_src = "'self'"
        if settings.DEBUG:
            connect_src = "'self' http://127.0.0.1:* http://localhost:* https:"
        csp = (
            "default-src 'self'; "
            "base-uri 'self'; "
            "frame-ancestors 'none'; "
            "form-action 'self'; "
            "img-src 'self' data: blob:; "
            "font-src 'self' https://fonts.gstatic.com data:; "
            "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; "
            "script-src 'self'; "
            f"connect-src {connect_src}; "
            "object-src 'none'"
        )
        response.setdefault("Content-Security-Policy", csp)
        return response
