# Splash / Intro

Shown once per browser session on first open (before login).

## Sequence (~3.2s)
1. Full-bleed navy canvas with soft cyan/navy ambient light
2. Detroit Axle logo rises in
3. Accent rule draws
4. “Quality Assurance” + “Detroit Axle Internal Systems”
5. Fade out into login

## Motion
- Ease: `cubic-bezier(0.22, 1, 0.36, 1)`
- No bounce, no glow stacks, no emoji
- Respect `prefers-reduced-motion` (skip staged motion)

## Storage
- `sessionStorage.daq_intro_seen` — skip after first play in the tab session
- Authenticated users never see the splash
