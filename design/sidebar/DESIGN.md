# Sidebar

Authenticated app chrome for Detroit Axle Quality Assurance.

## Layout
- Fixed left rail ~260px, square edges (no border-radius)
- Medium navy surface (`#243b5c` → `#1c314d`)
- Main column: header on top + content below (header does **not** cover the sidebar)

## Parts
| Part | Spec |
|------|------|
| Nav | Pill links, accent inset bar when active |
| Footer | Sign out capsule only |
| Header | Title + subtle subtitle, light hairline bottom, soft blur |

## Header
- Lives only in `.app-shell__main`
- Title: page name (e.g. Dashboard), navy, 22px semibold
- Subtitle: Detroit Axle Quality Assurance, muted
- Border: `1px solid rgba(17, 29, 51, 0.08)`
- Keep sparse — no clutter chips/stats

## Colors
- Sidebar surface: `#243b5c` → `#1c314d`
- Active/hover: `rgba(56, 180, 229, 0.14–0.22)`
- Active accent bar / icons: `--color-accent`
- Header/text: `--color-navy` / `--color-muted` on white
