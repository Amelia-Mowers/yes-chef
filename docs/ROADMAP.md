# Yes Chef roadmap: Android app and subscriptions

Goal: a paid Android app on Google Play. **One subscription per head device; kitchens and order takers are free and unlimited.** Android first, iOS later.

Last updated 2026-10-05.

## Where we are

| # | Step | Status |
|---|---|---|
| 1 | Order-taker role | **Done** |
| 2 | Own domain | **Done** (yes-chef.win, app.yes-chef.win) |
| 3 | Own signaling relay | **Done** |
| 4 | Licensing and backup server | **Live** at api.yes-chef.win; Play verification needs the Google service account |
| 5 | Android app (TWA) | **Built** (CI produces signed bundle + APK); needs Play Console |
| 6 | Play Billing | **Built and tested with fake Play**; needs Play Console products |
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

**Live** since 2026-10-05: bucket `yes-chef-backups`, D1 migrated, secrets `LICENSE_PRIVATE_KEY`, `BACKUP_MASTER_KEY`, `RTDN_SECRET` set (copies in `~/yes-chef-android-keys/`, backed up offline). CI deploys it (`DEPLOY_API=true`) once the CI token has **D1 Edit** and **Workers R2 Storage Edit**.
- [ ] `GOOGLE_SERVICE_ACCOUNT` secret (Play Developer API access) — needed before real purchases can be verified.
- [ ] Pub/Sub push subscription to `https://api.yes-chef.win/v1/play/rtdn?key=<RTDN_SECRET>` for renewals/cancellations.

## 5. Android app (Trusted Web Activity)

- [x] `android/twa-manifest.json` (package `win.yeschef.app`, Play Billing on); `tools/android.mjs` generates the project with Bubblewrap.
- [x] "Android app" workflow builds a signed Play bundle (.aab) and test APK (run by hand, or push a tag `android-vX.Y.Z`).
- [x] Upload key generated (kept in `~/yes-chef-android-keys/`, also in repo secrets `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD`). **Back it up.**
- [x] `https://app.yes-chef.win/.well-known/assetlinks.json` with the upload key fingerprint.
- [ ] After creating the app in Play Console: add the **Play App Signing** key's SHA-256 to `assetlinks.json` (otherwise the Play-installed app shows a browser bar).
- [ ] Capacitor later only if native features are needed (kitchen printers, stronger keep-alive).

## 6. Play Billing

- [ ] Play Console: two subscription products, **`yes_chef_monthly`** ($19/month) and **`yes_chef_yearly`** ($190/year), each with a 30-day free-trial offer.
- [x] App (`js/billing.js`): Digital Goods API + Payment Request API inside the app; purchase token → `api.yes-chef.win` activates the license. Restore purchase; offer to move from another tablet.
- [x] In the Android app the head's Order screen becomes "Start your 30-day free trial" until subscribed (`js/views/subscribe.js`); kitchens and order takers never need a subscription. Browser stays free (`ENFORCE` only in the app).
- [x] Lapsed/moved heads lose the Order screen after the offline grace period; history, menu and settings stay available; kitchens keep their tickets.
- [ ] License testers for development; test real purchases on the internal track.
- [ ] Note: Google takes 15% on subscriptions and is merchant of record (handles tax). Check current US/regional rules on outside payment links before relying on them.

## 7. Play Store setup and closed test

- [x] Developer account bought (personal) and verified.
- [ ] Closed test: **at least 12 testers opted in for 14 days in a row** (personal accounts; the clock restarts if it drops below 12). Testers can be anyone with a Google account and an Android device, e.g. friends; Google checks they actually used the app, so give them something to do (set up a demo restaurant, send a few orders between two devices). License testers can trial the subscription without being charged.
- [x] Privacy policy at https://yes-chef.win/privacy.html (linked from the site and the app's Settings).
- [x] Store listing text, Data safety / content rating / app access answers, store assets: see [play-store.md](play-store.md) and `docs/store/` (`tools/store-assets.mjs`).
- [ ] Follow the setup steps in [play-store.md](play-store.md): create app, internal test upload, app signing fingerprint, subscriptions, license testers, service account, Pub/Sub notifications, support email, app content, listing, closed test.
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
