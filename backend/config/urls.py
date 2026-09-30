from django.contrib import admin
from django.http import FileResponse, HttpResponse
from django.urls import include, path, re_path
from django.conf import settings


def spa_index(_request):
    """Serve the Vite-built SPA for non-API routes."""
    dist = getattr(settings, "SPA_DIST_DIR", None)
    index = dist / "index.html" if dist else None
    if index is None or not index.is_file():
        return HttpResponse(
            "Frontend build missing. Run `npm run build` in web/, or use Vite in development.",
            status=503,
            content_type="text/plain",
        )
    return FileResponse(index.open("rb"), content_type="text/html")


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("external_data.urls")),
]

# Catch-all for React Router (assets under /assets/ are served by WhiteNoise WHITENOISE_ROOT).
urlpatterns += [
    re_path(r"^(?!api/|admin/|static/).*$", spa_index),
]
