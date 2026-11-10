# Accessibility notes

## What is implemented

- Every interactive control has an accessible name (`IconButton`, nav items,
  player controls, queue actions, playlist toggles).
- Display/large-title/title text is exposed as a heading (`Text` adds
  `accessibilityRole="header"` automatically).
- Web keyboard shortcuts:
  - `/` focuses Library search;
  - Space toggles playback outside inputs/buttons;
  - ArrowLeft/ArrowRight seek 5 s;
  - Escape closes sheets/player or modal routes;
  - Alt+↑/↓ reorders the queue.
- `:focus-visible` draws a 2 px outline on buttons and inputs; the TextInput
  `outline: none` override was removed.
- Progress bars expose an adjustable role, a label ("Playback position",
  "Download progress") and the current value.
- `prefers-reduced-motion` disables Reanimated press/marquee/skeleton motion and
  CSS animations.
- The offline banner and status states are text, not colour-only.
- Queue reorder has a keyboard fallback; no drag-only operation is required.

## Verified in E2E

- `/` focuses the Library search field.
- Space pauses playback after a neutral click.
- Escape closes the player.
- Tab reaches a control with a visible focus ring and an accessible name.
- The player exposes a slider named "Playback position".

## Known gaps / manual audit

- Screen-reader pass with TalkBack (Android) and Firefox/NVDA or Orca is still
  manual.
- Heading levels are flattened to `role=heading`; no `aria-level` hierarchy yet.
- Contrast is token-reviewed but not automatically enforced. Body text uses
  `#F5F5F7` on `#0B0B0D` (high contrast); custom accent presets are corrected by
  `accentPair`, but extreme custom hex values should be checked by eye.
- Focus order inside long virtualised lists is not explicitly managed.
- The mini-player drag transition has no keyboard equivalent for opening the
  player; tapping/Enter on the pill still works.
