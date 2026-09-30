from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.auth_cookies import (
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    issue_tokens_for_user,
    remember_refresh_lifetime,
    session_refresh_lifetime,
)


User = get_user_model()


@override_settings(
    JWT_REMEMBER_REFRESH_DAYS=30,
    JWT_SESSION_REFRESH_HOURS=12,
)
class RememberMeAuthTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="qa_agent",
            email="qa.agent@detroitaxle.com",
            password="TestPass123!",
        )
        self.client = APIClient()

    def test_remember_token_lifetime_longer_than_session(self):
        self.assertGreater(remember_refresh_lifetime(), session_refresh_lifetime())
        self.assertEqual(remember_refresh_lifetime(), timedelta(days=30))
        self.assertEqual(session_refresh_lifetime(), timedelta(hours=12))

    def test_issue_tokens_sets_remember_claim(self):
        remembered = issue_tokens_for_user(self.user, remember_me=True)
        session = issue_tokens_for_user(self.user, remember_me=False)
        self.assertTrue(remembered["remember_me"])
        self.assertFalse(session["remember_me"])
        self.assertGreater(remembered["exp"] - remembered["iat"], session["exp"] - session["iat"])

    def test_login_sets_cookies_for_remember_me(self):
        response = self.client.post(
            "/api/auth/login/",
            {"login": "qa.agent@detroitaxle.com", "password": "TestPass123!", "remember_me": True},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn(ACCESS_COOKIE, response.cookies)
        self.assertIn(REFRESH_COOKIE, response.cookies)
        # Persistent cookie includes Max-Age
        self.assertIsNotNone(response.cookies[REFRESH_COOKIE]["max-age"])

    def test_login_session_cookie_has_no_max_age(self):
        response = self.client.post(
            "/api/auth/login/",
            {"login": "qa.agent@detroitaxle.com", "password": "TestPass123!", "remember_me": False},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        # Browser-session cookie: empty max-age in Django test client
        max_age = response.cookies[REFRESH_COOKIE].get("max-age")
        self.assertTrue(max_age in (None, "", "None") or max_age == "")
