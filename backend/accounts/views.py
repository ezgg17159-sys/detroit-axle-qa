import logging
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .auth_cookies import (
    clear_jwt_cookies,
    issue_tokens_for_user,
    set_jwt_cookies,
    REFRESH_COOKIE,
)

User = get_user_model()
logger = logging.getLogger(__name__)

FORGOT_PASSWORD_ACK = (
    "If an account exists for that email, a reset link has been sent."
)


class LoginRateThrottle(AnonRateThrottle):
    scope = "login"
    rate = "10/min"


class ForgotPasswordRateThrottle(AnonRateThrottle):
    scope = "forgot_password"
    rate = "5/min"


class LoginSerializer(serializers.Serializer):
    login = serializers.CharField()
    password = serializers.CharField(write_only=True)
    remember_me = serializers.BooleanField(required=False, default=True)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=6)


class ProvisionLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=6)
    username = serializers.CharField(required=False, allow_blank=True)
    full_name = serializers.CharField(required=False, allow_blank=True)


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=6)


def serialize_user(user):
    full_name = user.get_full_name().strip()
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": full_name or user.username,
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
    }


def _username_from_email(email: str) -> str:
    local = (email.split("@", 1)[0] or "user").strip().lower()
    cleaned = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in local)
    return (cleaned or "user")[:140]


def _unique_username(preferred: str, *, exclude_user_id: int | None = None) -> str:
    base = (preferred or "user").strip()[:140] or "user"
    candidate = base
    suffix = 1
    while True:
        qs = User.objects.filter(username__iexact=candidate)
        if exclude_user_id is not None:
            qs = qs.exclude(pk=exclude_user_id)
        if not qs.exists():
            return candidate
        suffix += 1
        candidate = f"{base[:130]}_{suffix}"


def _app_origin(request) -> str:
    configured = (getattr(settings, "FRONTEND_APP_URL", "") or "").strip().rstrip("/")
    if configured:
        return configured
    origin = (request.headers.get("Origin") or "").strip().rstrip("/")
    if origin:
        return origin
    return "http://127.0.0.1:5173"


def _user_from_uid(uid: str):
    try:
        user_id = force_str(urlsafe_base64_decode(uid))
        return User.objects.filter(pk=user_id).first()
    except (TypeError, ValueError, OverflowError):
        return None


def _ensure_django_user_for_managed(email: str, managed: dict) -> User:
    """Create a Django login for a managed-user email (password set via reset link)."""
    preferred = (
        str(managed.get("employeeId") or "").strip()
        or str(managed.get("alias") or "").strip()
        or _username_from_email(email)
    )
    username = _unique_username(preferred)
    user = User(username=username, email=email)
    full_name = str(managed.get("agentName") or managed.get("alias") or "").strip()
    if full_name:
        parts = full_name.split(None, 1)
        user.first_name = parts[0][:150]
        user.last_name = (parts[1] if len(parts) > 1 else "")[:150]
    user.set_unusable_password()
    user.is_active = True
    user.save()
    return user


def _resolve_user_for_forgot_password(email: str) -> User | None:
    """Active Django user, or auto-provision from managed directory by email."""
    user = User.objects.filter(email__iexact=email, is_active=True).first()
    if user is not None:
        return user

    # Existing inactive Django account — do not reset or re-provision.
    if User.objects.filter(email__iexact=email).exists():
        return None

    try:
        from external_data.portal_data import find_managed_user_by_email

        managed = find_managed_user_by_email(email)
    except Exception:
        logger.exception("Forgot-password managed-user lookup failed for %s", email)
        return None

    if not managed:
        return None

    return _ensure_django_user_for_managed(email, managed)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"csrfToken": get_token(request)})


class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        login = serializer.validated_data["login"].strip()
        password = serializer.validated_data["password"]
        remember_me = bool(serializer.validated_data.get("remember_me", True))

        user = User.objects.filter(
            Q(username__iexact=login) | Q(email__iexact=login)
        ).first()

        if user is None:
            return Response(
                {"detail": "Invalid credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        authenticated = authenticate(
            request,
            username=user.username,
            password=password,
        )
        if authenticated is None:
            return Response(
                {"detail": "Invalid credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not authenticated.is_active:
            return Response(
                {"detail": "This account is inactive."},
                status=status.HTTP_403_FORBIDDEN,
            )

        refresh = issue_tokens_for_user(authenticated, remember_me=remember_me)
        response = Response({"user": serialize_user(authenticated)})
        set_jwt_cookies(
            response,
            access=str(refresh.access_token),
            refresh=str(refresh),
            remember_me=remember_me,
        )
        return response


class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        raw_refresh = request.COOKIES.get(REFRESH_COOKIE)
        if raw_refresh:
            try:
                token = RefreshToken(raw_refresh)
                token.blacklist()
            except (TokenError, InvalidToken, AttributeError):
                pass
        response = Response({"detail": "Logged out."})
        clear_jwt_cookies(response)
        return response


class CookieTokenRefreshView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        raw_refresh = request.COOKIES.get(REFRESH_COOKIE)
        if not raw_refresh:
            return Response(
                {"detail": "Refresh credentials missing."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        try:
            old_refresh = RefreshToken(raw_refresh)
            user_id = old_refresh.get("user_id")
            user = User.objects.filter(pk=user_id).first()
            if user is None or not user.is_active:
                raise InvalidToken("User not found.")

            try:
                old_refresh.blacklist()
            except AttributeError:
                pass

            remember_me = bool(old_refresh.get("remember_me", True))
            new_tokens = issue_tokens_for_user(user, remember_me=remember_me)
            response = Response({"detail": "Token refreshed."})
            set_jwt_cookies(
                response,
                access=str(new_tokens.access_token),
                refresh=str(new_tokens),
                remember_me=remember_me,
            )
            return response
        except (TokenError, InvalidToken):
            response = Response(
                {"detail": "Invalid or expired refresh token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            clear_jwt_cookies(response)
            return response


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(serialize_user(request.user))


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        current_password = serializer.validated_data["current_password"]
        new_password = serializer.validated_data["new_password"]
        user = request.user

        if not user.check_password(current_password):
            return Response(
                {"detail": "Current password is incorrect."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            validate_password(new_password, user)
        except DjangoValidationError as exc:
            return Response(
                {"detail": "; ".join(exc.messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(new_password)
        user.save(update_fields=["password"])
        return Response({"detail": "Password updated.", "user": serialize_user(user)})


class ProvisionLoginView(APIView):
    """Create or update a Django login for email/username (staff only)."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not (request.user.is_staff or request.user.is_superuser):
            return Response(
                {"detail": "Only staff can provision login accounts."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ProvisionLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"].strip().lower()
        password = serializer.validated_data["password"]
        preferred_username = (serializer.validated_data.get("username") or "").strip()
        full_name = (serializer.validated_data.get("full_name") or "").strip()

        user = User.objects.filter(email__iexact=email).first()
        created = False
        if user is None:
            username = _unique_username(preferred_username or _username_from_email(email))
            user = User(username=username, email=email)
            created = True

        if not user.email:
            user.email = email

        if full_name:
            parts = full_name.split(None, 1)
            user.first_name = parts[0][:150]
            user.last_name = (parts[1] if len(parts) > 1 else "")[:150]

        try:
            validate_password(password, user)
        except DjangoValidationError as exc:
            return Response(
                {"detail": "; ".join(exc.messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(password)
        user.is_active = True
        user.save()

        return Response(
            {
                "detail": "Login account created." if created else "Password updated.",
                "created": created,
                "user": serialize_user(user),
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ForgotPasswordView(APIView):
    """Request a password-reset email via Power Automate (reset link)."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ForgotPasswordRateThrottle]

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"].strip().lower()
        user = _resolve_user_for_forgot_password(email)

        if user is None:
            return Response({"detail": FORGOT_PASSWORD_ACK})

        from external_data.power_automate import (
            flow_configured,
            post_to_flow_async,
            prepare_payload,
        )

        if not flow_configured("forgot-password"):
            logger.warning(
                "Forgot-password requested for %s but POWER_AUTOMATE_FORGOT_PASSWORD_WEBHOOK is unset.",
                email,
            )
            return Response({"detail": FORGOT_PASSWORD_ACK})

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        reset_url = (
            f"{_app_origin(request)}/reset-password?{urlencode({'uid': uid, 'token': token})}"
        )
        full_name = user.get_full_name().strip() or user.username or email

        routed = prepare_payload(
            "forgot-password",
            {
                "email": email,
                "agentEmail": email,
                "agentName": full_name,
                "agentId": user.pk,
                "resetUrl": reset_url,
                "expiresInHours": max(1, int(getattr(settings, "PASSWORD_RESET_TIMEOUT", 3600) / 3600)),
            },
        )
        envelope = {
            "flow": "forgot-password",
            **routed,
            "payload": routed,
            "emailTestMode": bool(routed.get("emailTestMode")),
            "testEmail": (routed.get("toEmail") if routed.get("emailTestMode") else None),
        }

        # Don't block the browser on slow/unreachable Power Automate.
        post_to_flow_async("forgot-password", envelope)
        return Response({"detail": FORGOT_PASSWORD_ACK})


class ResetPasswordView(APIView):
    """Set a new password using a uid + token from the reset email link."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ForgotPasswordRateThrottle]

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        uid = serializer.validated_data["uid"].strip()
        token = serializer.validated_data["token"].strip()
        new_password = serializer.validated_data["new_password"]

        user = _user_from_uid(uid)
        if user is None or not user.is_active:
            return Response(
                {"detail": "This reset link is invalid or has expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not default_token_generator.check_token(user, token):
            return Response(
                {"detail": "This reset link is invalid or has expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            validate_password(new_password, user)
        except DjangoValidationError as exc:
            return Response(
                {"detail": "; ".join(exc.messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(new_password)
        user.save(update_fields=["password"])
        return Response({"detail": "Password updated. You can sign in now."})
