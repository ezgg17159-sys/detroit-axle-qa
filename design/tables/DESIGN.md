# Tables

Spec for future QA data grids (defects, inspections, employees). Implement when table screens ship.

## Layout
- Full-width within content area; horizontal scroll only if needed.
- Header row sticky on long lists.
- Row height: comfortable (~48px), not dense spreadsheet mode by default.

## Colors (from palette only)
| Part | Token |
|------|-------|
| Header bg | `#111d33` or soft `#e8f4fa` |
| Header text | white on navy, or `#111d33` on soft |
| Body bg | `#ffffff` |
| Row hover | `rgba(56, 180, 229, 0.08)` |
| Borders | `rgba(17, 29, 51, 0.14)` |
| Selected row | `rgba(56, 180, 229, 0.16)` |

## Typography
- Header: IBM Plex Sans 600, 13–14px
- Cell: IBM Plex Sans 400, 14px
- Muted meta: `#6e7a8c`

## States
- Loading: skeleton rows in accent/navy tint
- Empty: centered message + optional primary CTA
- Error loading: bottom-right notification (see notifications), not a red table banner

## Rules
- No zebra stripes in loud colors — use hover/selected only.
- Status chips use semantic tokens (success / danger / info).
- Actions in the last column as secondary / ghost buttons.
