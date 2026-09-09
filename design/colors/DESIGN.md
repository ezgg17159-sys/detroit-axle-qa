# Colors

**Source of truth.** Do not introduce hex values outside this file unless the CHANGELOG records an approved update.

## Brand core
| Token | Hex | Use |
|-------|-----|-----|
| `--color-accent` | `#38b4e5` | Primary actions, focus rings, glow, links |
| `--color-accent-mid` | `#2a9fc9` | Button gradient mid |
| `--color-accent-deep` | `#217fa8` | Button gradient end, secondary link |
| `--color-navy` | `#111d33` | Primary dark surface, headings on light |
| `--color-navy-deep` | `#0c1528` | Background depth |
| `--color-white` | `#ffffff` | Fields, light panels, text on accent |

## Neutrals
| Token | Value | Use |
|-------|-------|-----|
| `--color-muted` | `#6e7a8c` | Dividers labels, secondary text |
| `--color-placeholder` | `#8a96a8` | Input placeholders |
| `--color-border` | `rgba(17, 29, 51, 0.14)` | Light borders |
| `--color-border-strong` | `rgba(17, 29, 51, 0.16)` | Button outlines |

## Semantic (notifications)
| Token | Value | Use |
|-------|-------|-----|
| `--color-danger` | `#b00012` | Error text |
| `--color-danger-bg` | `rgba(215, 0, 21, 0.08)` | Error toast background |
| `--color-danger-border` | `rgba(215, 0, 21, 0.28)` | Error toast border |
| `--color-success` | `#0d7a45` | Success text |
| `--color-success-bg` | `rgba(13, 122, 69, 0.08)` | Success toast background |
| `--color-success-border` | `rgba(13, 122, 69, 0.28)` | Success toast border |
| `--color-info` | `#217fa8` | Info text |
| `--color-info-bg` | `rgba(56, 180, 229, 0.12)` | Info toast background |
| `--color-info-border` | `rgba(56, 180, 229, 0.35)` | Info toast border |

## Surfaces
| Token | Value | Use |
|-------|-------|-----|
| `--surface-login-side` | white → `#e8f4fa` | Right login panel |
| `--surface-toast` | `#ffffff` | Notification body |

## Do / Don't
- Do tint with accent/navy/white only for brand chrome.
- Don't use orange/purple/random grays for primary UI.
- Don't hardcode hex in components — use CSS variables from `web/src/styles/tokens.css`.
