# Icons

## Principles
- Simple, flat, geometric — no skeuomorphism.
- Stroke or filled marks stay on brand colors only.
- Prefer SVG components under `web/src/icons/`.

## Sizes
| Token | Size | Use |
|-------|------|-----|
| `sm` | 16px | Inline with text |
| `md` | 18–20px | Buttons (Microsoft mark) |
| `lg` | 24px | Headers / empty states |

## Color
- On dark surfaces: white or `#38b4e5`
- On light surfaces: `#111d33` or `#38b4e5`
- Semantic icons (error/success) may use danger/success tokens

## Current icons
| Name | File / usage | Notes |
|------|----------------|-------|
| Microsoft mark | Inline SVG in login | Official 4-color squares — keep brand colors |
| Dashboard | `web/src/icons/NavIcons.tsx` | Sidebar navigation |
| Eye / EyeOff | `web/src/icons/EyeIcon.tsx` | Show/hide password toggle |
| Detroit Axle logo | `/detroit-axle-logo.png` | Official brand mark |

## Rules
- Add new icons as React SVG components in `web/src/icons/` and document them here.
- Do not mix icon libraries with conflicting styles.
- Always set `aria-hidden="true"` when a visible label exists.
