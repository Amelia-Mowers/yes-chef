# Yes Chef

**Live app: https://amelia-mowers.github.io/yes-chef/**

A backend-free PWA that routes orders from one front-of-house tablet (the **head**) to one or more **kitchen** tablets on the same Wi-Fi. See [SPEC.md](SPEC.md) for the full spec, and [docs/sheffield-research.md](docs/sheffield-research.md) for the research behind Sheffield, the optional on-device menu assistant (sources in [docs/research-notes/](docs/research-notes/)).

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

Every push to `main` runs `.github/workflows/deploy.yml`: unit tests, then the head + kitchen end-to-end test in Chromium. If both pass, the app files (`index.html`, `manifest.webmanifest`, `sw.js`, `css/`, `js/`, `vendor/`, `icons/`) are published to GitHub Pages. Pull requests run the tests without deploying. Every path is relative, so the same files work from `/yes-chef/` and later from a root domain on Cloudflare Pages. Bump `VERSION` in `sw.js` when you ship changes so tablets pick them up.

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

## Sheffield, the menu butler

Menu → **Ask Sheffield** opens a chat that builds the menu draft (it never publishes on its own):

- **Paste a menu, attach a CSV/text file, or paste menu JSON**: a rule-based parser (`js/sheffield/parse.js`) reads it and Sheffield asks about anything ambiguous (which section, whether an add-on applies to the whole section, add to or replace the current menu).
- **Typed edits** such as “add Brownie to Desserts”, “rename Cola to Coke”, “take the veggie burger off” are handled exactly by `js/sheffield/commands.js`.
- **Photos** need the optional model. *Hire Sheffield* downloads Qwen3.5 (0.8B ≈ 0.8 GB, or 2B ≈ 2.1 GB) from Hugging Face at a pinned revision; it runs on-device in a Worker via transformers.js (WebGPU, WASM fallback) and works offline afterwards. The model only transcribes the photo; the parser and code-driven questions turn the text into a menu. Free-form requests the grammar doesn't cover also go to the model.
- Every proposal is a list of small name-based edits (`js/sheffield/ops.js`); code assigns ids and colours and validates the result, and the preview must be approved with **Use this menu**.
- **Copy assistant instructions** puts a prompt on the clipboard for ChatGPT, Claude or any other assistant. Paste it with your photos, and import the `menu.json` it returns via Menu → Import. No download needed.
- Settings → Sheffield shows what's hired and **Dismiss Sheffield** deletes the model (menus and orders are untouched).

On this branch, build the model runtime first with `npm run vendor` (it writes `vendor/transformers.js`, which isn't committed). Research behind the design: [docs/sheffield-research.md](docs/sheffield-research.md). To check prompts against the real model on a computer: `node tools/sheffield-eval.mjs 0.8b` (or `2b`); `node test/sheffield-model-e2e.mjs` runs the hire → photo → menu flow in Chromium.

## Not built yet

- PeerJS fallback and manual offline (no-internet) QR offer/answer pairing.
- Sheffield: PDF reading, resumable downloads (an interrupted file restarts; finished files are kept), and measurements on real iPads.
- The spec's open questions: kitchen category filters, sound alerts, history archiving. Undo after the 10-second toast lives in each order's History timeline.
