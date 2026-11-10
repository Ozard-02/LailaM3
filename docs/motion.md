# Motion spec

All motion is optional; `prefers-reduced-motion` / system reduce-motion disables
transforms and loops. Durations are intentionally short on touch and slightly
longer on desktop.

| Interaction | Duration / spring | Notes |
|---|---|---|
| Press feedback | spring damping 24, stiffness 320 | Scale to `motion.pressScale`; disabled with reduce-motion |
| Track row swipe reset | 170 ms timing | No overshoot; swipe threshold 58 px / 750 px/s |
| Mini-player horizontal reset | 170 ms timing | Same feel as track rows |
| Mini-player vertical snap | spring damping 24, stiffness 320 | Down hides, up opens |
| Player morph open/close | spring damping 30, stiffness 420, mass 0.6, overshootClamped | Background grows from the pill; artwork/title/play use measured expanded rects; details fade 180 ms above 0.6 and out in 90 ms below 0.5 (hysteresis); drag 1:1, release past 25% opens |
| Queue sheet open/close | spring damping 30, stiffness 420, mass 0.6, overshootClamped | Drag is 1:1; release past 72% opens |
| Marquee | 4.5 s initial pause, 9–18 s scroll, 6 s end pause | Two-copy seamless loop; static with reduce-motion |
| Lyric verse transition | 300 ms timing | Opacity 0.68→1, scale 0.97→1.05 |
| Sheet/backdrop fade | 200–250 ms | Modal presentation also uses the platform route animation |
| Skeleton pulse | 900 ms loop | Disabled when app is backgrounded or reduce-motion is on |

## Rules

- 1:1 tracking for gestures that reveal a surface (queue, player, swipe rows).
- Release thresholds use both distance and velocity; no animation is required for
  correctness.
- Avoid springs on horizontal resets; use timing to prevent bounce.
- Never animate layout where a transform is enough, except the intentional
  props-in/out fades.
- Keep the player/queue springs overshoot-clamped so they do not bounce against
  the screen edge.

## Performance rules

- Keep 2 Hz playback position updates in leaf components (`PlaybackProgress`);
  never subscribe the full player or mini bar to position.
- Pre-mount surfaces that need measurement before the gesture starts.
- One combined `useAnimatedReaction` per surface, with JS state changes only at
  thresholds.
- Animate transforms/opacity; avoid layout props per frame except one flat
  background if unavoidable.
- Release `renderToHardwareTextureAndroid` at rest.
- Scrim/details/background fades are time-based at thresholds, not per-frame
  interpolation, so a drag does not create an alpha layer every frame.
