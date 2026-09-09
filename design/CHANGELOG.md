# Design CHANGELOG

Log every design / UI decision for Detroit Axle Quality Assurance. Newest first.

## 2026-09-09

### United design system folders
- Added `design/colors`, `design/buttons`, `design/icons`, `design/tables`, `design/notifications`.
- Rule: all future UI must follow these specs; colors must not drift outside the palette.

### Notifications
- All error / info / success messages use **bottom-right toast notifications** (not inline banners in forms).
- Toast style: rounded rectangle, light surface, tinted border/text by severity.

### Login page evolution
1. Started with Apple-inspired frosted centered login.
2. Switched from React Native to **web React (Vite)**.
3. Matched glassmorphism reference (dark abstract bg + glass card).
4. Palette locked to **`#38b4e5`**, **`#111d33`**, white.
5. Font set to **IBM Plex Sans**.
6. Removed supporting login subcopy.
7. Added **Detroit Axle logo** above form; title → **Quality Assurance**.
8. Footer credit: **Created by Rashed Kattan** (bottom-left of brand panel).
9. Lightened glass panel, then moved to **split layout**.
10. Split ratios tried: 75/25 → reversed → settled on **40% left / 60% login**.
11. Added pulsing cyan **glow** around logo.
12. Added **Login with Microsoft** under LOGIN (UI placeholder until SSO).

### Auth (backend)
- Django JWT login accepts email or username + password.
- Demo user: `demo` / `demo@detroitaxle.com` / `DemoPass123!`.
