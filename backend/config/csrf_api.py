"""Enforce CSRF on /api/ mutating requests (DRF views are csrf_exempt by default)."""

from __future__ import annotations

from django.http import JsonResponse
from django.middleware.csrf import CsrfViewMiddleware


class EnforceAPICSRFMiddleware(CsrfViewMiddleware):
    """Re-check CSRF for API writes even when DRF marks the view csrf_exempt."""

    def _reject(self, request, reason):
        return JsonResponse({"detail": "CSRF verification failed."}, status=403)

    def process_view(self, request, callback, callback_args, callback_kwargs):
        if not request.path.startswith("/api/"):
            return None
        if request.method in {"GET", "HEAD", "OPTIONS", "TRACE"}:
            return None
        if request.path.startswith("/api/auth/csrf"):
            return None

        # Temporarily ignore csrf_exempt set by DRF.
        original = getattr(callback, "csrf_exempt", False)
        try:
            if original:
                setattr(callback, "csrf_exempt", False)
            return super().process_view(request, callback, callback_args, callback_kwargs)
        finally:
            if original:
                setattr(callback, "csrf_exempt", True)
