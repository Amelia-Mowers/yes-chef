# Yes Chef roadmap: Android app and subscriptions

Goal: a paid Android app on Google Play. **One subscription per head device; kitchens and order takers are free and unlimited.** Android first, iOS later.

Last updated 2026-10-05.

## Where we are

| # | Step | Status |
|---|---|---|
| 1 | Order-taker role | **Done** |
| 2 | Own domain | **Done** (yes-chef.win, app.yes-chef.win) |
| 3 | Own signaling relay | Not started |
| 4 | Licensing and backup server | Not started |
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

## 3. Own signaling relay

Pairing currently uses free public Nostr relays (via Trystero). A paid product shouldn't depend on them.

- [ ] Run a relay on Cloudflare (Worker + Durable Object WebSocket) and point Trystero at it, keeping public relays as fallback.
- [ ] Monitor uptime.

## 4. Licensing and backup server

One Cloudflare Worker with D1 (database) and R2 (file storage).

**Licensing** (enforces one subscription per head; Play subscriptions belong to a Google account, not a device):
- [ ] Endpoint: receive Play purchase token + head device id, verify with the Google Play Developer API, **acknowledge within 3 days** (or Google refunds automatically).
- [ ] Bind subscription → one head device, with a "move to a new tablet" flow.
- [ ] Return a signed license with an expiry; the app verifies offline with a public key built in.
- [ ] Real-time Developer Notifications (Pub/Sub) for renewals, cancellations, refunds.
- [ ] App: license cached with expiry + grace period (7–14 days offline). On lapse: reminder / read-only. **Never lock the kitchen out mid-service.**
- [ ] Head tells kitchens/order takers it's licensed during sync; they never check themselves.

**Remote backups** (paid feature):
- [ ] Encrypted at rest with server-managed keys (Cloudflare Secrets Store), not end-to-end, so a new head on the same account can restore after losing every device.
- [ ] Automatic daily snapshot plus one before each publish/import (reuse the local backup points).
- [ ] Restore flow on a new head.
- [ ] **Never back up Sheffield conversations** (if Sheffield ever gets in-app chat again).

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

## Pricing (decided 2026-10-05)

- **$19/month or $190/year per head device**, unlimited kitchens and order takers.
- **30-day free trial.** No free plan, no founding price.
- Play Console: one subscription product with two base plans (monthly $19, yearly $190) and a 30-day free-trial offer on both.
- Context: Square KDS is about $20–30 per kitchen screen per month (or bundled in $49–60+/month plans), so Yes Chef is cheaper from the second screen on. After Google's 15% cut, $19 nets about $16.

## Later

- iOS: likely Capacitor + StoreKit (Apple often rejects pure web wrappers under guideline 4.2).
- Sheffield on-device (parked on the `sheffield-on-device` branch).
- Spec open questions: kitchen category filters, sound alerts, history archiving.
