from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

User = get_user_model()


class Command(BaseCommand):
    help = "Create the demo employee account for local development."

    def handle(self, *args, **options):
        username = "demo"
        email = "demo@detroitaxle.com"
        password = "DemoPass123!"

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
            self.style.SUCCESS(
                f"{action} demo user '{username}' / '{email}' "
                f"with password '{password}'."
            )
        )
