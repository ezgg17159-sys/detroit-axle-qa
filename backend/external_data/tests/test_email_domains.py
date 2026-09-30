from django.test import SimpleTestCase, override_settings

from external_data.email_domains import (
    EmailDomainError,
    assert_allowed_email,
    email_domain,
    normalize_email,
)


@override_settings(ALLOWED_EMAIL_DOMAINS=["detroitaxle.com"])
class EmailDomainTests(SimpleTestCase):
    def test_normalize_and_domain(self):
        self.assertEqual(normalize_email("  Alex@DetroitAxle.com "), "alex@detroitaxle.com")
        self.assertEqual(email_domain("alex@detroitaxle.com"), "detroitaxle.com")

    def test_allowed_work_email(self):
        self.assertEqual(
            assert_allowed_email("Alex@DetroitAxle.com"),
            "alex@detroitaxle.com",
        )

    def test_rejects_personal_email(self):
        with self.assertRaises(EmailDomainError):
            assert_allowed_email("person@gmail.com")

    def test_rejects_empty(self):
        with self.assertRaises(EmailDomainError):
            assert_allowed_email("")
