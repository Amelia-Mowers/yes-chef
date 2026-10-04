# Yes Chef

**Live app: https://amelia-mowers.github.io/yes-chef/**

A backend-free PWA that routes orders from one front-of-house tablet (the **head**) to one or more **kitchen** tablets on the same Wi-Fi. See [SPEC.md](SPEC.md) for the full spec.

## Run it

No build step: the app is static files.

```sh
npm install      # dev tools only (esbuild, playwright)
npm run serve    # http://localhost:8080/yes-chef/  (same path as GitHub Pages)
npm test         # event-log unit tests
node test/e2e.mjs   # head + kitchen end to end in two browser contexts (needs internet)
```

On NixOS, Playwright's bundled browser won't start; use a Nix Chromium:
`CHROMIUM_PATH=$(nix-shell -p chromium --run 'readlink -f $(which chromium)') node test/e2e.mjs`

Camera access for the QR scanner and service workers need HTTPS (or `localhost`), so test pairing between real tablets on GitHub Pages.

## Deploy

Push the repo to GitHub and enable Pages for the branch root. Every path is relative, so the same files work from `/yes-chef/` and later from a root domain on Cloudflare Pages. Bump `VERSION` in `sw.js` when you ship changes so tablets pick them up.

Moving domains does not move data (IndexedDB is per origin): export everything from Settings on the old domain and import it on the new one.

## Layout

| Path | What it does |
| --- | --- |
| `js/log.js` | Pure event-log logic: undo/redo resolution, replay into orders, order numbers, recall |
| `js/store.js` | State for both roles; head appends events, kitchens mirror the log and send intents |
| `js/net.js` | Trystero (Nostr signaling, WebRTC data) plus AES-GCM with the pairing secret; pairing codes |
| `js/db.js` | IndexedDB: key/value, events, backups |
| `js/views/` | Order, Kitchen, History, Menu designer, Settings, Pairing |
| `vendor/` | Pre-bundled Trystero, qrcode-generator and jsQR (`npm run vendor` rebuilds them) |
| `sw.js` | Offline app shell |

## How sync works

The head owns the log and assigns every `seq`. A kitchen sends an *intent* (with an ID) → the head stamps it as an event, saves it, and broadcasts it to all kitchens. Kitchens resend queued intents every 3 s until the matching event arrives; the head ignores duplicates. On (re)connect a kitchen sends `hello {lastSeq, epoch}` and gets everything after `lastSeq`, or the full log if the head's log was cleared or replaced (new `epoch`).

## Not built yet

- PeerJS fallback and manual offline (no-internet) QR offer/answer pairing.
- The spec's open questions: kitchen category filters, sound alerts, history archiving. Undo after the 10-second toast lives in each order's History timeline.
