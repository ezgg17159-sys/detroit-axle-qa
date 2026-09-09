# Buttons

All actions use IBM Plex Sans. Prefer pill shape (`border-radius: 980px`) for primary CTAs.

## Variants

### Primary — `.btn-primary`
- Background: linear gradient `#38b4e5` → `#2a9fc9` → `#217fa8`
- Text: white, weight 600, slight letter-spacing
- Shadow: soft accent glow
- Use: LOGIN, submit, confirm

### Secondary — `.btn-secondary`
- White fill, navy text, thin navy/gray border
- Hover: light cyan tint border `#38b4e5`
- Use: cancel, alternate actions

### Microsoft — `.btn-microsoft`
- Secondary shell + official Microsoft four-square icon (16–18px)
- Label: **Login with Microsoft**
- Use: SSO entry under LOGIN divider

### Ghost / text — `.btn-ghost`
- No fill; accent or navy text
- Use: tertiary links that behave as buttons

## States
| State | Behavior |
|-------|----------|
| Hover | Slight brightness / border shift |
| Active | `scale(0.985)` |
| Disabled | `opacity: 0.7`, no pointer |

## Rules
- One primary button per form section.
- Do not invent new button colors — map to [colors](../colors/DESIGN.md).
- Keep height ~46–48px for touch comfort.
