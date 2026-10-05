# Yes Chef

**Live app: https://app.yes-chef.win/** · Website: https://yes-chef.win/

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

Every push to `main` runs `.github/workflows/deploy.yml`: unit tests, then the head + kitchen end-to-end test in Chromium. If both pass:

- **app.yes-chef.win**: `tools/assemble.sh` builds the app (`index.html`, `manifest.webmanifest`, `sw.js`, `css/`, `js/`, `vendor/`, `icons/`, `_headers`) and it's deployed to the Cloudflare Pages project `yes-chef-app`.
- **yes-chef.win**: the marketing page in `site/` goes to the Cloudflare Pages project `yes-chef-site`. `tools/screenshots.mjs` regenerates its screenshots from the real app.
- **amelia-mowers.github.io/yes-chef** (old address): still deployed so installed tablets see a "Yes Chef has moved" banner (`js/moved.js`), which appears only once the new address responds. Remove this job when nobody uses the old address.

The Cloudflare job needs the repository secrets `CLOUDFLARE_API_TOKEN` (Account → Cloudflare Pages → Edit) and `CLOUDFLARE_ACCOUNT_ID`; without them it skips. Pull requests run the tests without deploying.

`tools/assemble.sh` stamps each build with its commit id (`VERSION` in `sw.js`, `BUILD` in `js/version.js`), so every deploy installs on tablets as a new version: the app checks when it returns to the foreground and every 30 minutes, then shows a **Reload** banner (Settings → App version also has **Check for updates**). It never reloads by itself; an unsent ticket on the head survives a reload. Paths are relative, so the app works from any address.

Browser data (IndexedDB) belongs to one address, so moving address means Export everything on the old one and Import on the new.

## Plates

When adding an item, pick **No plate**, an existing plate, or **+ New plate** (the last plate used is preselected). Lines on the same plate are grouped under a plate heading on the head's ticket, the kitchen card and the order's History detail; unplated lines come first. Each ticket line has a plate button to move it. Plates renumber themselves (Plate 1, 2, …) when one empties, and moving an item between plates shows up in the kitchen's “CHANGED” list.

## Sheffield, the menu butler

Menu → **Sheffield** opens a guide for building the menu with any chat assistant (ChatGPT, Claude, Gemini…):

1. **Copy** or **Download** Sheffield's instructions. They ask the assistant to play Sheffield, a polite little butler, to ask clarifying questions, and to return a `menu.json` in Yes Chef's format. Optionally they include the current menu as JSON so the assistant edits it instead of starting fresh.
2. Paste them into the assistant with photos, PDFs or spreadsheets of the menu, and answer Sheffield's questions.
3. **Import menu.json**. `normalizeMenu` (`js/sheffield/instructions.js`) repairs common assistant mistakes (missing ids or colours, choice groups referenced by name, unknown references, plain-string items) and lists what it fixed before loading the result into the designer as a draft. Nothing is published until you publish.

An on-device version (a local Qwen3.5 model reading photos in the browser) was prototyped and parked on the `sheffield-on-device` branch; [docs/sheffield-research.md](docs/sheffield-research.md) has the research behind it, with sources in [docs/research-notes/](docs/research-notes/).

## Not built yet

- PeerJS fallback and manual offline (no-internet) QR offer/answer pairing.
- The spec's open questions: kitchen category filters, sound alerts, history archiving. Undo after the 10-second toast lives in each order's History timeline.
