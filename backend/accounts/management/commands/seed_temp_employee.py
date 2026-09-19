import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

User = get_user_model()


class Command(BaseCommand):
    help = (
        "Create a temporary agent account for testing the employee portal. "
        "Requires TEMP_EMPLOYEE_PASSWORD in the environment."
    )

    def handle(self, *args, **options):
        username = (os.environ.get("TEMP_EMPLOYEE_USERNAME") or "temp.employee").strip()
        email = (
            os.environ.get("TEMP_EMPLOYEE_EMAIL") or "temp.employee@detroitaxle.com"
        ).strip()
        password = (os.environ.get("TEMP_EMPLOYEE_PASSWORD") or "").strip()
        first_name = (os.environ.get("TEMP_EMPLOYEE_FIRST_NAME") or "Temp").strip()
        last_name = (os.environ.get("TEMP_EMPLOYEE_LAST_NAME") or "Employee").strip()
        if not password:
            raise CommandError(
                "TEMP_EMPLOYEE_PASSWORD must be set in the environment (never commit passwords)."
            )

        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                "email": email,
                "first_name": first_name,
                "last_name": last_name,
                "is_staff": False,
                "is_superuser": False,
            },
        )

        user.email = email
        user.first_name = first_name
        user.last_name = last_name
        user.is_staff = False
        user.is_superuser = False
        user.is_active = True
        user.set_password(password)
        user.save()

        action = "Created" if created else "Updated"
        self.stdout.write(
            self.style.SUCCESS(
                f"{action} temp employee '{username}' / '{email}'."
            )
        )
