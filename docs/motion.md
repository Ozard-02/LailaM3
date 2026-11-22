# Motion spec

All motion is optional; `prefers-reduced-motion` / system reduce-motion snaps
transforms to their end state and stops loops. The setting is observed live:
changing it while the app is open updates the theme without a reload. Durations
are intentionally short on touch and slightly longer on desktop.

Performance mode forces the same reduced-motion path, removes the player
backdrop blur and requests covers at 1x. Outside performance mode the artwork
palette is global; inside it the palette follows only the open player.

| Interaction | Duration / spring | Notes |
|---|---|---|
| Press feedback | spring damping 24, stiffness 320 | Scale to `motion.pressScale`; disabled with reduce-motion |
| Track row swipe reset | spring damping 26, stiffness 320, mass 0.7, overshoot-clamped | Carries the release velocity; commit threshold 58 px / 750 px/s; reduce-motion parks immediately |
| Mini-player horizontal reset | same release spring | Commit threshold 58 px / 650 px/s |
| Mini-player vertical snap | same release spring | Down hides, up opens; reduce-motion snaps |
| Player morph open/close | spring damping 30, stiffness 420, mass 0.6, overshootClamped | Background grows from the pill; artwork/title/play use measured expanded rects; details fade as a pure function of progress; drag 1:1, release past 25% opens; reduce-motion snaps to the endpoint |
| Queue sheet open/close | spring damping 30, stiffness 380, mass 0.7, overshootClamped | Drag is 1:1; release past 28% opens, below 78% closes; velocity 600/650; reduce-motion snaps |
| Cover swipe | 150 ms exit timing, release spring enter | 58 px / 650 px/s; travel is the stage width (clipped split/wide) or half viewport plus half cover (phone); next enters from the right, previous from the left; reduce-motion commits without the slide |
| Marquee | 4.5 s initial pause, 9–18 s scroll, 6 s end pause | Two-copy seamless loop; static with reduce-motion, backgrounded, or while the full player covers the pill |
| Lyric verse transition | 300 ms timing | Opacity 0.68→1, scale 0.97→1.05; snaps with reduce-motion |
| Sheet/backdrop fade | 220 ms | Modal presentation also uses the platform route animation; route animations are `none` with reduce-motion |
| Skeleton pulse | 900 ms loop | Disabled when app is backgrounded or reduce-motion is on |

## Rules

- 1:1 tracking for gestures that reveal a surface (queue, player, swipe rows).
- Release thresholds use both distance and velocity; no animation is required for
  correctness.
- Horizontal resets carry velocity but are overshoot-clamped; they never bounce
  against the screen edge.
- Never animate layout where a transform is enough, except the intentional
  props-in/out fades.
- Keep the player/queue springs overshoot-clamped so they do not bounce against
  the screen edge.
- Queue drop commit decisions belong to the release, not to a timer that can
  outlive the gesture.

## Performance rules

- Keep 2 Hz playback position updates in leaf components (`PlaybackProgress`);
  never subscribe the full player or mini bar to position.
- Pre-mount surfaces that need measurement before the gesture starts.
- Keep `useAnimatedReaction` count per surface low, with JS state changes only
  at thresholds.
- Animate transforms/opacity; avoid layout props per frame except one flat
  background if unavoidable.
- Keep queue list props stable and rows memoised; the playing/paused state is a
  row-level selector, not a panel subscription.
- Release `renderToHardwareTextureAndroid` at rest.
- Scrim/details/background fades are time-based at thresholds, not per-frame
  interpolation, so a drag does not create an alpha layer every frame.
