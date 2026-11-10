# Content Security Policy

The CSP is defined in `app/+html.tsx`. It is deliberately restrictive for code,
but broad for user-configured servers.

**Caveat:** `app.json` uses `web.output: "single"`, and that export does not
currently emit `+html.tsx`. The policy must be shipped through a custom template
(or `web.output` must change) before it can be claimed for the single-file build.
`ROADMAP.md` tracks this as an open hardening item.

## Current policy

- `default-src 'self'`
- `script-src 'self'` — no remote scripts, no inline scripts.
- `style-src 'self' 'unsafe-inline'` — React Native Web injects inline styles.
- `img-src` / `media-src` — `self`, `data:`, `blob:`, and any `http:`/`https:`
  host. Covers and audio must come from the Navidrome/OpenSubsonic instance the
  user configures at runtime, so the host cannot be known at build time.
- `connect-src` — `self`, any `http:`/`https:` host, and `ws:`/`wss:` for Segue.
- `font-src 'self'` — no remote fonts.
- `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`.
- `worker-src 'self' blob:` — the app-shell service worker.
- `frame-ancestors 'none'` is listed but browsers ignore it in a meta tag; it
  needs an HTTP header. If Laila is served by a reverse proxy, set it there.

## Why the broad origin list

The server URL, cover host, stream host and Segue hub are entered by the user.
A build-time allowlist cannot cover LAN IPs, reverse-proxy hostnames or a hub on
another origin. Broad `http:`/`https:`/`ws:`/`wss:` is therefore intentional.

## Hardening with a reverse proxy

If the deployment uses one known origin, tighten the header instead of the meta
tag, for example:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://music.example.com;
  media-src 'self' blob: https://music.example.com;
  connect-src 'self' https://music.example.com wss://music.example.com;
  font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';
  frame-ancestors 'none'; worker-src 'self' blob:; manifest-src 'self'
```

Serving a header as well as the meta tag is safe: the browser enforces both.

## Rules

- Never add a CDN, analytics, remote font or third-party image host.
- Never cache `/rest/*`, `/connect/*`, `/stream` or `/download` in the service
  worker.
- Do not loosen `script-src` with `'unsafe-eval'` or `'unsafe-inline'`; the
  production bundle has no inline scripts.
