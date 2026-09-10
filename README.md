# Detroit Axle Quality Assurance

Employee QA tracking system — Django API + React (Vite) web app.

## Stack
- **Backend:** Python Django + Django REST Framework + SimpleJWT
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

## Quick start

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
cd backend
python manage.py migrate
python manage.py seed_superadmin
cd ..\web
npm install
```

Superadmin (local development):
- Username: `superadmin`
- Email: `superadmin@detroitaxle.com`
- Password: `SuperAdmin123!`

Optional demo employee:
```powershell
cd backend
python manage.py seed_demo_user
```
- Username: `demo`
- Email: `demo@detroitaxle.com`
- Password: `DemoPass123!`

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
- `POST /api/auth/login/` — body `{ "login": "email or username", "password": "..." }`
- `POST /api/auth/refresh/` — body `{ "refresh": "..." }`
- `GET /api/auth/me/` — Bearer access token
