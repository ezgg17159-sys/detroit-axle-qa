"""
Django settings for Detroit Axle Quality Assurance.
"""

from __future__ import annotations

import os
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

# Load root .env if present (dev convenience; no python-dotenv required)
_env_path = BASE_DIR.parent / ".env"
if _env_path.exists():
    for _line in _env_path.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if not _line or _line.startswith("#") or "=" not in _line:
            continue
        _key, _val = _line.split("=", 1)
        _key = _key.strip()
        _val = _val.strip().strip('"').strip("'")
        os.environ.setdefault(_key, _val)


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_list(name: str, default: list[str]) -> list[str]:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


# Production must set DEBUG=false explicitly. Unset → local-dev True for SQLite workflows.
_raw_debug = os.environ.get("DEBUG")
DEBUG = True if _raw_debug is None else _env_bool("DEBUG", default=False)
USE_HTTPS = _env_bool("USE_HTTPS", default=False)

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "").strip()
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = "django-insecure-dev-only-change-me-before-production"
    else:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set when DEBUG=False.")

ALLOWED_HOSTS = _env_list(
    "ALLOWED_HOSTS",
    ["localhost", "127.0.0.1", "testserver"] if DEBUG else [],
)
if not DEBUG and not ALLOWED_HOSTS:
    raise ImproperlyConfigured("ALLOWED_HOSTS must be set when DEBUG=False.")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "accounts",
    "external_data",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "config.csrf_api.EnforceAPICSRFMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "config.security_headers.SecurityHeadersMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


def _build_databases() -> dict:
    engine = (os.environ.get("DJANGO_DB_ENGINE") or "").strip()
    if not engine or engine.endswith("sqlite3"):
        return {
            "default": {
                "ENGINE": "django.db.backends.sqlite3",
                "NAME": BASE_DIR / "db.sqlite3",
            }
        }

    name = (os.environ.get("DJANGO_DB_NAME") or "").strip()
    user = (os.environ.get("DJANGO_DB_USER") or "").strip()
    password = (os.environ.get("DJANGO_DB_PASSWORD") or "").strip()
    host = (os.environ.get("DJANGO_DB_HOST") or "127.0.0.1").strip()
    port = (os.environ.get("DJANGO_DB_PORT") or "5432").strip()
    if not name or not user:
        raise ImproperlyConfigured(
            "DJANGO_DB_NAME and DJANGO_DB_USER are required when DJANGO_DB_ENGINE is set."
        )

    conn_max_age = int(os.environ.get("DJANGO_DB_CONN_MAX_AGE") or "60")
    sslmode = (os.environ.get("DJANGO_DB_SSLMODE") or "require").strip()
    options: dict[str, str] = {"connect_timeout": "8"}
    if sslmode:
        options["sslmode"] = sslmode

    return {
        "default": {
            "ENGINE": engine,
            "NAME": name,
            "USER": user,
            "PASSWORD": password,
            "HOST": host,
            "PORT": port,
            "CONN_MAX_AGE": conn_max_age,
            "OPTIONS": options,
        }
    }


DATABASES = _build_databases()

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
# Built Vite SPA (npm run build → web/dist). Served by WhiteNoise at site root in production.
SPA_DIST_DIR = Path(
    os.environ.get("SPA_DIST_DIR") or (BASE_DIR.parent / "web" / "dist")
).resolve()
WHITENOISE_ROOT = SPA_DIST_DIR if SPA_DIST_DIR.is_dir() else None
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CORS_ALLOWED_ORIGINS = _env_list(
    "CORS_ORIGINS",
    [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:5176",
        "http://127.0.0.1:5176",
        "http://localhost:5177",
        "http://127.0.0.1:5177",
    ]
    if DEBUG
    else [],
)
if not DEBUG and not CORS_ALLOWED_ORIGINS:
    raise ImproperlyConfigured("CORS_ORIGINS must be set when DEBUG=False.")

# Cloudflare tunnels only when explicitly enabled (not default for production).
CORS_ALLOWED_ORIGIN_REGEXES: list[str] = []
if _env_bool("ALLOW_CLOUDFLARE_TUNNEL_CORS", default=False):
    CORS_ALLOWED_ORIGIN_REGEXES = [r"^https://[\w-]+\.trycloudflare\.com$"]

CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = _env_list(
    "CSRF_TRUSTED_ORIGINS",
    list(CORS_ALLOWED_ORIGINS),
)
if _env_bool("ALLOW_CLOUDFLARE_TUNNEL_CORS", default=False):
    CSRF_TRUSTED_ORIGINS = [
        *CSRF_TRUSTED_ORIGINS,
        "https://*.trycloudflare.com",
    ]

CSRF_COOKIE_HTTPONLY = False  # SPA must read csrftoken for X-CSRFToken header
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = USE_HTTPS
SESSION_COOKIE_SECURE = USE_HTTPS
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"

SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_REFERRER_POLICY = "same-origin"

# Trust reverse-proxy TLS termination when HTTPS is enabled.
if USE_HTTPS:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = _env_bool("SECURE_SSL_REDIRECT", default=True)
    SECURE_HSTS_SECONDS = int(os.environ.get("SECURE_HSTS_SECONDS", "31536000"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
else:
    SECURE_SSL_REDIRECT = False
    SECURE_HSTS_SECONDS = 0

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "accounts.auth_cookies.JWTCookieAuthentication",
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "login": "10/min",
        "forgot_password": "5/min",
    },
    "EXCEPTION_HANDLER": "config.exceptions.api_exception_handler",
}

# Django password-reset tokens expire after 1 hour.
PASSWORD_RESET_TIMEOUT = 60 * 60

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# Keep me signed in → persistent refresh; unchecked → shorter browser-session refresh.
JWT_REMEMBER_REFRESH_DAYS = int(os.environ.get("JWT_REMEMBER_REFRESH_DAYS", "30") or 30)
JWT_SESSION_REFRESH_HOURS = int(os.environ.get("JWT_SESSION_REFRESH_HOURS", "12") or 12)

# Comma-separated allowlist for managed-user / provisioned login emails.
ALLOWED_EMAIL_DOMAINS = [
    d.strip().lower().lstrip("@")
    for d in _env_list("ALLOWED_EMAIL_DOMAINS", ["detroitaxle.com"])
]

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "daq-auth-throttle",
    }
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "[{asctime}] {levelname} {name} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO" if not DEBUG else "DEBUG",
    },
    "loggers": {
        "django.request": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
        "external_data": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
}

# Allow Power Automate client email redirects only when explicitly enabled (never in prod).
ALLOW_EMAIL_TEST_OVERRIDE = _env_bool("ALLOW_EMAIL_TEST_OVERRIDE", default=DEBUG)

# Public app origin for email deep links (forgot-password reset URL, share-audit, etc.)
FRONTEND_APP_URL = (
    os.environ.get("FRONTEND_APP_URL")
    or os.environ.get("VITE_APP_URL")
    or ("http://127.0.0.1:5173" if DEBUG else "")
).strip().rstrip("/")
if not DEBUG and not FRONTEND_APP_URL:
    raise ImproperlyConfigured(
        "FRONTEND_APP_URL (or VITE_APP_URL) must be set when DEBUG=False."
    )
