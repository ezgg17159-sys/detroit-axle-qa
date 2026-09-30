# Detroit Axle Quality Assurance

Employee QA tracking system — Django API + React (Vite) web app.

## Stack
- **Backend:** Python Django + Django REST Framework + SimpleJWT (HttpOnly cookies)
- **Frontend:** React + TypeScript + Vite
- **Design system:** [`design/`](design/) — colors, buttons, icons, tables, notifications + [`CHANGELOG.md`](design/CHANGELOG.md)

## Design folders
| Path | Role |
|------|------|
| `design/colors/` | Palette lock |
| `design/buttons/` | Button variants |
| `design/icons/` | Icon rules (`web/src/icons/` for code) |
| `design/tables/` | Future table UI |
| `design/notifications/` | Bottom-right toasts only |
| `design/emails/` | Power Automate HTML templates |

## Quick start (local development)

### Run both (API + web)
```powershell
cd "d:\NEW QA SYSTEM"
.\dev.ps1
```

- API: `http://127.0.0.1:8000`
- App: `http://127.0.0.1:5173`

Ctrl+C stops both.

### First-time setup
```powershell
cd "d:\NEW QA SYSTEM"
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
cd backend
python manage.py migrate
python manage.py seed_superadmin
cd ..\web
npm install
```

Copy `.env.example` → `.env` and fill DB / Power Automate values.

Superadmin (local development):
- Username: `superadmin`
- Email: `superadmin@detroitaxle.com`
- Password: `SuperAdmin123!`

Optional demo employee:
```powershell
cd backend
python manage.py seed_demo_user
```

### Run separately
```powershell
# Backend
cd "d:\NEW QA SYSTEM\backend"
..\.venv\Scripts\python.exe manage.py runserver 8000

# Frontend (other terminal)
cd "d:\NEW QA SYSTEM\web"
npm run dev
```

## Auth endpoints
- `POST /api/auth/login/` — `{ "login", "password", "remember_me" }`
- `POST /api/auth/refresh/` — refresh cookie
- `POST /api/auth/logout/`
- `POST /api/auth/forgot-password/` / `reset-password/`
- `GET /api/auth/me/`

**Keep me signed in:** longer refresh JWT + persistent cookie when checked; shorter session refresh when unchecked.

## Production config checklist

Set in `.env` (never commit secrets):

| Variable | Production value |
|----------|------------------|
| `DEBUG` | `false` |
| `DJANGO_SECRET_KEY` | long random secret |
| `USE_HTTPS` | `true` |
| `FRONTEND_APP_URL` | public HTTPS origin of the app |
| `ALLOWED_HOSTS` | your hostname(s) |
| `CORS_ORIGINS` / `CSRF_TRUSTED_ORIGINS` | same public origin(s) |
| `DJANGO_DB_ENGINE` | `django.db.backends.postgresql` (+ NAME/USER/PASSWORD/HOST) |
| `ALLOWED_EMAIL_DOMAINS` | e.g. `detroitaxle.com` |
| Power Automate webhooks | monitoring, avg, share-audit, forgot-password |

Managed users must use a work email on an allowed domain (required for forgot-password and share-audit).

## Production deploy

### Docker (recommended)
```powershell
# Ensure .env has production values (DEBUG=false, Postgres auth DB, FRONTEND_APP_URL, etc.)
docker compose up --build -d
docker compose exec web python manage.py migrate
docker compose exec web python manage.py seed_superadmin   # first deploy only
```

Serves the Vite-built SPA + gunicorn API on port 8000 (override with `PORT`).

### Manual packaged SPA + gunicorn
```powershell
cd web
npm ci
npm run build

cd ..\backend
..\.venv\Scripts\python.exe manage.py collectstatic --noinput
..\.venv\Scripts\python.exe manage.py migrate
..\.venv\Scripts\gunicorn.exe config.wsgi:application --bind 0.0.0.0:8000 --workers 3
```

WhiteNoise serves `web/dist` assets; Django serves `index.html` for non-API routes.

## Power Automate emails

| Flow | Env var | HTML template |
|------|---------|---------------|
| Monitoring | `POWER_AUTOMATE_MONITORING_WEBHOOK` | `design/emails/monitoring-email.power-automate.html` |
| Avg score | `POWER_AUTOMATE_AVG_EMAIL_WEBHOOK` | `design/emails/qa-avg-email.power-automate.html` |
| Share audit | `POWER_AUTOMATE_SHARE_AUDIT_WEBHOOK` | `design/emails/share-audit.power-automate.html` |
| Forgot password | `POWER_AUTOMATE_FORGOT_PASSWORD_WEBHOOK` | `design/emails/forgot-password.power-automate.html` |

In each flow: HTTP trigger → Outlook Send email V2. Set **To** to `triggerBody()?['toEmail']` and paste the matching HTML into the body (code view).

## Tests / CI

```powershell
cd backend
python manage.py test accounts external_data -v 2

cd ..\web
npm run lint
npm run build
```

GitHub Actions: `.github/workflows/ci.yml` runs the same checks on push/PR.
