from django.urls import path
from django.views.decorators.csrf import csrf_exempt
from rest_framework_simplejwt.views import TokenRefreshView

from .views import LoginView, MeView

urlpatterns = [
    path("login/", csrf_exempt(LoginView.as_view()), name="auth-login"),
    path("refresh/", csrf_exempt(TokenRefreshView.as_view()), name="auth-refresh"),
    path("me/", MeView.as_view(), name="auth-me"),
]
