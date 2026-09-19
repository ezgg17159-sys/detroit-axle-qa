import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

User = get_user_model()


class Command(BaseCommand):
    help = (
        "Create the demo employee account for local development. "
        "Requires DEMO_USER_PASSWORD in the environment."
    )

    def handle(self, *args, **options):
        username = (os.environ.get("DEMO_USER_USERNAME") or "demo").strip()
        email = (os.environ.get("DEMO_USER_EMAIL") or "demo@detroitaxle.com").strip()
        password = (os.environ.get("DEMO_USER_PASSWORD") or "").strip()
        if not password:
            raise CommandError(
                "DEMO_USER_PASSWORD must be set in the environment (never commit passwords)."
            )

        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                "email": email,
                "first_name": "Demo",
                "last_name": "Employee",
                "is_staff": True,
            },
        )

        if not created:
            user.email = email
            user.first_name = "Demo"
            user.last_name = "Employee"
            user.is_staff = True

        user.set_password(password)
        user.save()

        action = "Created" if created else "Updated"
        self.stdout.write(
            self.style.SUCCESS(f"{action} demo user '{username}' / '{email}'.")
        )
