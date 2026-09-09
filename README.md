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

### Backend
```powershell
cd "d:\NEW QA SYSTEM"
.\.venv\Scripts\Activate.ps1
cd backend
python manage.py migrate
python manage.py seed_demo_user
python manage.py runserver
```

API: `http://127.0.0.1:8000`

Demo account:
- Username: `demo`
- Email: `demo@detroitaxle.com`
- Password: `DemoPass123!`

### Frontend
```powershell
cd "d:\NEW QA SYSTEM\web"
npm install
npm run dev
```

App: `http://localhost:5173`

## Auth endpoints
- `POST /api/auth/login/` — body `{ "login": "email or username", "password": "..." }`
- `POST /api/auth/refresh/` — body `{ "refresh": "..." }`
- `GET /api/auth/me/` — Bearer access token
