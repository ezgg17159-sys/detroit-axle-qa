import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

User = get_user_model()


class Command(BaseCommand):
    help = (
        "Create the primary Detroit Axle super admin account. "
        "Requires SUPERADMIN_PASSWORD (and optional SUPERADMIN_EMAIL/USERNAME) in the environment."
    )

    def handle(self, *args, **options):
        username = (os.environ.get("SUPERADMIN_USERNAME") or "ralagha").strip()
        email = (os.environ.get("SUPERADMIN_EMAIL") or "ralagha@detroitaxle.com").strip()
        first_name = (os.environ.get("SUPERADMIN_FIRST_NAME") or "Rashed").strip()
        last_name = (os.environ.get("SUPERADMIN_LAST_NAME") or "Kattan").strip()
        password = (os.environ.get("SUPERADMIN_PASSWORD") or "").strip()
        if not password:
            raise CommandError(
                "SUPERADMIN_PASSWORD must be set in the environment (never commit passwords)."
            )
        if len(password) < 12:
            raise CommandError("SUPERADMIN_PASSWORD must be at least 12 characters.")

        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                "email": email,
                "first_name": first_name,
                "last_name": last_name,
                "is_staff": True,
                "is_superuser": True,
            },
        )

        user.email = email
        user.first_name = first_name
        user.last_name = last_name
        user.is_staff = True
        user.is_superuser = True
        user.is_active = True
        user.set_password(password)
        user.save()

        action = "Created" if created else "Updated"
        self.stdout.write(
            self.style.SUCCESS(
                f"{action} super admin '{username}' / '{email}' "
                f"({first_name} {last_name})."
            )
        )
