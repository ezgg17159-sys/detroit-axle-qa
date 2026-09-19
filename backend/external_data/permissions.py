"""Server-side permission helpers for external_data APIs."""

from __future__ import annotations

from rest_framework.permissions import BasePermission, IsAuthenticated, SAFE_METHODS


class IsStaffUser(BasePermission):
    """Django is_staff or is_superuser."""

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (user.is_staff or user.is_superuser)
        )


class IsStaffOrReadOnly(BasePermission):
    """Authenticated read; staff required for writes."""

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return bool(user.is_staff or user.is_superuser)


class IsAuthenticatedOrStaffWrite(BasePermission):
    """Alias kept for clarity at call sites."""

    def has_permission(self, request, view) -> bool:
        return IsStaffOrReadOnly().has_permission(request, view)


def staff_write_permissions():
    return [IsAuthenticated(), IsStaffOrReadOnly()]


def staff_only_permissions():
    return [IsAuthenticated(), IsStaffUser()]
