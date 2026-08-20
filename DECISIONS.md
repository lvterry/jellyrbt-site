# Design decisions

## Jelly Rabbit hero — decided from `/proto`

- **Direction:** the rabbit mark as an animated character — squish-stamp entrance, idle jelly wobble, pointer tilt, poke-on-press.
- **Motion**
  - Idle wobble: `5.5s`, `ease-in-out`, transform-only (scale/rotate), origin bottom-center.
  - Stamp entrance: `725ms`, `cubic-bezier(0.22, 1.4, 0.36, 1)`, plays on load (skipped if the session already saw the intro).
  - Poke: `525ms`, `cubic-bezier(0.3, 1.4, 0.4, 1)`, on pointerdown.
  - Entrance stagger: `520ms`, `cubic-bezier(0.32, 0.72, 0, 1)`, delays `80 / 200 / 320ms` (kicker → wordmark → tagline).
  - Pointer tilt: `10°` max, fine pointers only, 160ms ease-out follow.
  - Reduced motion: all motion off (entrance, wobble, stamp, poke, tilt).
- **Type** (Clash Display variable)
  - Wordmark: `wght 500`, `96px` (clamp 40px–11vw), tracking `-0.01em`, single line, "Jelly" in peach.
  - Kicker: 11px uppercase, tracking `0.19em`.
  - Tagline: `26px` desktop / `20px` below 720px, `wght 420`, 55ch measure, `text-wrap: pretty`.
- **Rejected:**
  - *Dreamy* (the previous hero): floating jelly blobs compete with the wordmark for attention; perpetual background animation and 40–45px blurs on animating layers are the most expensive rendering path; content sat top-left with a 42px tagline.
  - *Editorial* (type-led spec-sheet): read as credible but lost the studio's "jelly" personality — felt cold for a brand named Jelly Rabbit.
  - Type treatments: *Airy* (wght 260 too thin as a brand lockup), *Punch* (wght 700 too shouty), *Stacked* (two-line split lost the single-line presence).
