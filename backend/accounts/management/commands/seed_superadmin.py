from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

User = get_user_model()


class Command(BaseCommand):
    help = "Create the local superadmin account for internal tool development."

    def handle(self, *args, **options):
        username = "superadmin"
        email = "superadmin@detroitaxle.com"
        password = "SuperAdmin123!"

        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                "email": email,
                "first_name": "Super",
                "last_name": "Admin",
                "is_staff": True,
                "is_superuser": True,
            },
        )

        user.email = email
        user.first_name = "Super"
        user.last_name = "Admin"
        user.is_staff = True
        user.is_superuser = True
        user.is_active = True
        user.set_password(password)
        user.save()

        action = "Created" if created else "Updated"
        self.stdout.write(
            self.style.SUCCESS(
                f"{action} superadmin '{username}' / '{email}' "
                f"with password '{password}'."
            )
        )
