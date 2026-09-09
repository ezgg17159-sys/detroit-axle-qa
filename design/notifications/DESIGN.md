# Notifications

**All messages (errors, info, success, warnings) appear as toasts in the bottom-right.**  
Do not use inline form error banners for user-facing alerts.

## Placement
- Fixed: `bottom: 24px; right: 24px`
- Stack upward if multiple
- z-index above page chrome

## Anatomy
- Rounded rectangle (~12–14px radius)
- Light surface (`#ffffff` / pale tint)
- Thin semantic border
- Centered or left-aligned short message
- Auto-dismiss ~4.5s (errors can stay longer / require dismiss)

## Variants
| Variant | Text | Background | Border |
|---------|------|------------|--------|
| error | `#b00012` | `rgba(215,0,21,0.08)` | `rgba(215,0,21,0.28)` |
| info | `#217fa8` | `rgba(56,180,229,0.12)` | `rgba(56,180,229,0.35)` |
| success | `#0d7a45` | `rgba(13,122,69,0.08)` | `rgba(13,122,69,0.28)` |

## Motion
- Enter: slide/fade from bottom-right
- Exit: fade out
- Respect `prefers-reduced-motion`

## Implementation
- React: `NotificationProvider` + `useNotify()`
- CSS: `web/src/styles/notifications.css`
- Example: Microsoft SSO placeholder → info/error toast bottom-right

## Rules
- Never block the whole page with a modal for routine errors.
- Keep copy short (one sentence).
- Log new notification patterns in [CHANGELOG](../CHANGELOG.md).
