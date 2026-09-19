"""DRF exception handler — never leak raw exception strings to clients in production."""

from __future__ import annotations

import logging
from typing import Any

from django.conf import settings
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger("external_data")


def api_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    response = drf_exception_handler(exc, context)
    if response is not None:
        return response

    logger.exception("Unhandled API exception", exc_info=exc)
    detail = str(exc) if settings.DEBUG else "An unexpected server error occurred."
    return Response({"detail": detail}, status=500)
