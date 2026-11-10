import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#0B0B0D" />
        <meta name="color-scheme" content="dark light" />
        <meta
          httpEquiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http: https:; media-src 'self' blob: http: https:; connect-src 'self' http: https: ws: wss:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; worker-src 'self' blob:; manifest-src 'self'"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icon.png" />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body { height: 100%; background: #0B0B0D; }
              body { overflow: hidden; overscroll-behavior: none; }
              #root { display: flex; height: 100%; }
              ::selection { background: rgba(250,45,72,0.35); color: #fff; }
              * { -webkit-tap-highlight-color: transparent; }
              input, button, textarea { font-family: inherit; }
              :focus-visible { outline: 2px solid rgba(250,45,72,0.9); outline-offset: 3px; }
              @media (prefers-reduced-motion: reduce) {
                *, *::before, *::after { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
