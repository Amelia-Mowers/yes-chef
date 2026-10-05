# Yes Chef roadmap: Android app and subscriptions

Goal: a paid Android app on Google Play. **One subscription per head device; kitchens and order takers are free and unlimited.** Android first, iOS later.

Last updated 2026-10-05.

## Where we are

| # | Step | Status |
|---|---|---|
| 1 | Order-taker role | **Done** |
| 2 | Own domain | **Done** (yes-chef.win, app.yes-chef.win) |
| 3 | Own signaling relay | **Done** |
| 4 | Licensing and backup server | **Built and tested**; goes live when R2 is enabled |
| 5 | Android app (TWA) | Not started |
| 6 | Play Billing | Not started |
| 7 | Play Store setup and closed test | Not started |
| 8 | Launch | Not started |
| — | Pricing | **Decided**: $19/mo or $190/yr, 30-day trial |

Already shipped along the way: plates, reload-on-update banner, Sheffield (menu via your own chat assistant), marketing site, CI that tests then deploys to Cloudflare.

## 1. Order-taker role — done

- [x] New role: a second ordering screen that sends orders to the head as intents (like kitchens send status changes). The head assigns `seq` and the order number and broadcasts. One source of truth stays.
- [x] Pairing for order takers (same QR/code as kitchens, different role); the head lists connected devices with their role.
- [x] Order takers see all orders in History and can modify, cancel and undo through the head; orders queue while the head is offline.
- [x] Tests: head + order taker + kitchen end to end.

## 2. Own domain — done

- [x] yes-chef.win (marketing, `site/`) and app.yes-chef.win (app) as static-assets Workers, custom domains in `deploy/*/wrangler.jsonc`.
- [x] CI: tests, then deploy to Cloudflare and the old GitHub address.
- [x] "Yes Chef has moved" banner on amelia-mowers.github.io/yes-chef.
- [ ] Remove the GitHub Pages job once nobody uses the old address.
- [ ] Optional: www.yes-chef.win redirect.

## 3. Own signaling relay — done

- [x] relay.yes-chef.win: Worker + one Durable Object per room (hibernating WebSockets) speaking Trystero's ws-relay protocol (`relay/`). Only Yes Chef origins may connect.
- [x] Kitchens and order takers use it when reachable, else public Nostr relays; the head listens on both so every combination meets (older builds included).
- [x] e2e runs the relay locally (`npm run relay`) and checks pairing went through it; CI deploys it.
- [ ] Uptime monitoring (health checks on https://relay.yes-chef.win/health and https://api.yes-chef.win/health).
- [ ] Look into a curl handshake with an Origin header returning 500 (real browsers connect fine).

## 4. Licensing and backup server

One Cloudflare Worker with D1 (database) and R2 (file storage).

Code in `api/` (Worker `yes-chef-api` at api.yes-chef.win, D1 `yes-chef`, R2 `yes-chef-backups`); tests in `test/api.test.mjs` and the e2e.

**Licensing** (enforces one subscription per head; Play subscriptions belong to a Google account, not a device):
- [x] `/v1/license/activate`: verify the Play purchase token (Play Developer API, subscriptionsv2), **acknowledge** it, bind the account to one head device; a second device gets `bound_elsewhere` unless it asks to move (`transfer`).
- [x] Signed licenses (ECDSA P-256, 7 days), verified offline in the app (`js/license.js`, public key in `js/license-key.js`); refreshed daily; 7-day offline grace after expiry.
- [x] Upgrades/resubscriptions (linked purchase tokens) stay on the same account.
- [x] `/v1/play/rtdn`: Real-time Developer Notifications endpoint (shared-key protected).
- [x] App Settings → Subscription shows active / grace / moved / ended.
- [ ] Enforcement UI for lapsed heads (reminder, then read-only; **never lock the kitchen out mid-service**). Lands with billing (item 6); `ENFORCE` is off while the browser is free.
- [ ] Head tells kitchens/order takers it's licensed during sync (only needed once enforcement is on).

**Remote backups** (paid feature):
- [x] Encrypted per account (AES-GCM, keys derived from the `BACKUP_MASTER_KEY` Worker secret), not end-to-end, so a new head on the same account can restore after losing every device. Newest 60 kept.
- [x] Automatic daily backup plus one before each publish/import/history clear; Back up now; Restore from cloud.
- [x] Only the bound head can read or write; a moved/old head is refused.
- [x] **Never back up Sheffield conversations**: the server keeps only menu, settings and events, whatever the client sends.

**To go live** (needs you): enable R2 in the Cloudflare dashboard. Then: create the bucket, set the secrets `LICENSE_PRIVATE_KEY` and `BACKUP_MASTER_KEY`, deploy, set the repo variable `DEPLOY_API=true`. Google secrets (`GOOGLE_SERVICE_ACCOUNT`, `RTDN_SECRET`) come with the Play Console setup.

## 5. Android app (Trusted Web Activity)

- [ ] Build with Bubblewrap (or PWABuilder) pointing at app.yes-chef.win.
- [ ] Serve `https://app.yes-chef.win/.well-known/assetlinks.json` (check that static assets upload dot-folders; may need `.assetsignore` handling).
- [ ] Signing key in Play App Signing; keep the upload key safe.
- [ ] Capacitor later only if native features are needed (kitchen printers, stronger keep-alive).

## 6. Play Billing

- [ ] Play Console: one subscription product, base plans $19/month and $190/year, 30-day free-trial offer.
- [ ] App: Digital Goods API + Payment Request API inside the TWA; send purchase token to the licensing server.
- [ ] License testers for development; restore purchases.
- [ ] Note: Google takes 15% on subscriptions and is merchant of record (handles tax). Check current US/regional rules on outside payment links before relying on them.

## 7. Play Store setup and closed test

- [ ] Developer account ($25) and identity verification. Consider an organisation account (exempt from the closed-test rule below).
- [ ] New personal accounts: closed test with 12 testers for 14 days before production. Confirm current numbers in Play Console.
- [ ] Privacy policy (yes-chef.win/privacy), Data safety form (orders stay on devices; pairing metadata via our relay; backups if enabled).
- [ ] Content rating, store listing (screenshots from `tools/screenshots.mjs`), reviewer instructions with a license-tester account.
- [ ] **Real-device testing** on Android tablets: sleep/wake, Wi-Fi drops, a full service of orders, wake lock, reload banner.

## 8. Launch

- [ ] Staged rollout, support email, refund policy, simple status page.
- [ ] Update the marketing site with pricing ($19/month or $190/year, 30-day free trial) and a Play Store badge.

## Decision before launch

- The browser version is free during early access and **stops being free when the Android app launches** (decided 2026-10-05). Before launch, decide what a browser head becomes: subscribe via Stripe on the website, or a time-limited demo that points to the Android app. Licensing already has the `ENFORCE` switch for this.
- Confirm the Android package name `win.yeschef.app` (permanent once published).

## Pricing (decided 2026-10-05)

- **$19/month or $190/year per head device**, unlimited kitchens and order takers.
- **30-day free trial.** No free plan, no founding price.
- Play Console: one subscription product with two base plans (monthly $19, yearly $190) and a 30-day free-trial offer on both.
- Context: Square KDS is about $20–30 per kitchen screen per month (or bundled in $49–60+/month plans), so Yes Chef is cheaper from the second screen on. After Google's 15% cut, $19 nets about $16.

## Later

- iOS: likely Capacitor + StoreKit (Apple often rejects pure web wrappers under guideline 4.2).
- Sheffield on-device (parked on the `sheffield-on-device` branch).
- Spec open questions: kitchen category filters, sound alerts, history archiving.
