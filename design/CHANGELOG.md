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
13. Removed pulsing cyan **glow** from the logo (kept a soft shadow only).
14. Removed **Already a member?** from the login form.
15. Added **show/hide password** eye toggle on the password field.
16. Added **Forgot password?** link beside Keep me signed in (placeholder toast for now).
17. Added left-panel **page flipper**: logo page + quality tracking message, with pill/dot pager.
18. Removed opaque square behind logo by converting logo PNG to transparent background.
19. Hero pages **auto-advance every 20 seconds** (timer resets on manual pager/swipe).
20. Restored original **Detroit Axle PNG logo** (reverted SVG experiment).
21. Added **superadmin** seed account; post-login home is intentionally **blank** for security work.
22. Added authenticated **sidebar** shell with Dashboard + sign out; main area stays blank.
23. Sidebar switched to **light** brand surface (white → `#e8f4fa`) to match login panel.
24. Sidebar tuned to **medium navy** (`#243b5c` → `#1c314d`) — not too light, not too dark.
25. Sidebar has **rounded right edges only** (`border-radius: 0 12px 12px 0`).
26. Sidebar simplified: removed logo, Quality Assurance label, and account name; kept Sign out.
27. Removed sidebar round edges; added sleek **content-only header** (not over sidebar).

### Auth (backend)
- Django JWT login accepts email or username + password.
- Demo user: `demo` / `demo@detroitaxle.com` / `DemoPass123!`.
