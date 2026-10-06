# Google Play: listing and setup

Everything needed to publish Yes Chef on Google Play. Assets are in [`docs/store/`](store/) (regenerate with `node tools/store-assets.mjs`).

## Setup, in order

Play only lets you create subscriptions after a build with billing is uploaded, so do these in order.

1. **Create the app** (Play Console → Create app)
   - App name: `Yes Chef`
   - Default language: English (United States)
   - App or game: App · Free or paid: **Free** (the subscription is sold inside the app)
   - Accept the declarations.

2. **Upload the first build to internal testing** (Test and release → Testing → Internal testing → Create new release)
   - Download the signed bundle from GitHub: Actions → *Android app* → latest run → artifact `yes-chef-android-…` → `yes-chef-0.1.0.aab`.
   - When asked about app signing, keep **Google-managed (Play App Signing)**.
   - Add yourself as a tester (create an email list), save and roll out.
   - New builds: Actions → Android app → Run workflow, with a higher version code each time.

3. **Send Claude the app signing fingerprint** (done 2026-10-06; it's in `assetlinks.json`): App integrity now opens *Protected with Play*; app signing is under its cards, or replace the end of the Play Console URL with `keymanagement`. Copy *App signing key certificate* → SHA-256. (The *Upload key certificate* there should match `~/yes-chef-android-keys/upload-key-sha256.txt`.) It goes into `/.well-known/assetlinks.json` (without it, the Play-installed app shows a browser address bar).

4. **Create the subscriptions** (Monetize with Play → Products → Subscriptions)
   | Product ID | Name | Base plan ID | Billing | Price | Offer |
   |---|---|---|---|---|---|
   | `yes_chef_monthly` | Yes Chef Monthly | `monthly` | Auto-renewing, 1 month | $19.00 USD | Free trial, 30 days, new customers |
   | `yes_chef_yearly` | Yes Chef Yearly | `yearly` | Auto-renewing, 1 year | $190.00 USD | Free trial, 30 days, new customers |
   - Let Play convert prices for other countries (adjust later if you like).
   - Activate both base plans and both offers.

5. **License testers** (Setup → License testing): add your Google account and your testers' so they can start trials without being charged.

6. **Purchase verification for the server** (lets api.yes-chef.win check subscriptions)
   1. Google Cloud Console → create a project (e.g. `yes-chef`) → APIs & Services → enable **Google Play Android Developer API**.
   2. IAM & Admin → Service accounts → Create (e.g. `play-api`) → Keys → Add key → JSON. A file downloads.
   3. Play Console → Users and permissions → Invite new user → the service account's email → App permissions: Yes Chef → **View financial data** and **Manage orders and subscriptions**.
   4. Store the key on the server (the file never goes into chat):
      `! npx wrangler secret put GOOGLE_SERVICE_ACCOUNT --config api/wrangler.jsonc < ~/Downloads/<the-key-file>.json`
      then delete the downloaded file.

7. **Subscription notifications** (renewals, cancellations reach the server)
   1. Google Cloud → Pub/Sub → Create topic `play-rtdn`.
   2. Topic → Permissions → add principal `google-play-developer-notifications@system.gserviceaccount.com` with role **Pub/Sub Publisher**.
   3. Create a **push** subscription on the topic, endpoint:
      `https://api.yes-chef.win/v1/play/rtdn?key=<contents of ~/yes-chef-android-keys/rtdn-secret.txt>`
   4. Play Console → Monetize with Play → Monetization setup → Real-time developer notifications → topic `projects/<project-id>/topics/play-rtdn` → **Send test notification**.

8. **Support email**: Cloudflare dashboard → yes-chef.win → Email → Email Routing → enable → route `support@yes-chef.win` to your inbox (confirm the verification email).

9. **App content** (Policy → App content): answers below.

10. **Store listing** (Grow → Store presence → Main store listing): text and assets below.

11. **Closed test**: Test and release → Testing → Closed testing → create a track, add **at least 12 testers** (aim for 15–16), roll out the same build, and share the opt-in link. They must stay opted in **14 days in a row**. Then apply for production access.

## Store listing

**App name** (30 max): `Yes Chef: Kitchen Orders`

**Short description** (80 max):
`Send orders from the counter to kitchen tablets in a tap, over your own Wi-Fi.`

**Full description:**

```
Yes Chef turns your tablets into a simple kitchen order system. One tablet takes orders at the front; every kitchen screen gets the ticket instantly over your own Wi-Fi.

BUILT FOR A BUSY PASS
• Big, glove-friendly buttons on every ticket: Started, Done, Picked up
• Tickets age in front of the cook and turn amber, then red
• Cooking temperatures, sizes and add-ons on every dish
• Plates group what goes out together
• Changes and cancellations show up highlighted on the kitchen screen

UNDO ANYTHING
• Pull back an order seconds after sending it
• Recall a ticket that was marked done by mistake
• Every order and change is kept in History, filterable by status, time or name

AS MANY SCREENS AS YOU NEED
• One head tablet takes orders and owns the menu
• Add any number of kitchen screens and extra order-taking tablets for free
• Pair a tablet by scanning a QR code

YOUR DATA STAYS WITH YOU
• Tablets talk to each other directly, encrypted
• Works through internet hiccups and recovers on its own
• Export everything at any time; subscribers get automatic cloud backups

MENU IN MINUTES
• Build the menu on the tablet, or let Sheffield, your menu butler, turn a photo of your menu into a ready-made menu using the chat assistant you already use

PRICING
One subscription per head tablet: $19/month or $190/year, with a 30-day free trial. Kitchen and order-taker tablets are always free. Cancel anytime in Google Play.

Yes Chef routes orders; it doesn't take payments, so it works alongside the till you already have.
```

**Category:** Business · **Tags:** Business, Restaurant, Productivity (choose what Play offers)
**Contact email:** support@yes-chef.win · **Website:** https://yes-chef.win · **Privacy policy:** https://yes-chef.win/privacy

**Graphics** (`docs/store/`):
- App icon: `icon-512.png`
- Feature graphic: `feature-graphic.png` (1024×500)
- Phone screenshots: `phone-1-order.png`, `phone-2-choices.png`, `phone-3-kitchen.png` (1080×1920)
- 10-inch tablet screenshots: `tablet-1-order.png`, `tablet-2-kitchen.png`, `tablet-3-kitchen-dark.png`, `tablet-4-order-timeline.png` (2560×1600). Upload the same ones for 7-inch tablets.

## App content answers

- **Privacy policy:** https://yes-chef.win/privacy
- **Ads:** No ads.
- **App access:** *All or some functionality is restricted* → Add sign-in details: Name `Reviewer access`, leave username and password empty, and under *Any other information required to access your app*:
  ```
  No account or password is needed.

  Kitchen and Order taker roles are free: open the app, choose Kitchen (or Order taker).

  The Head role (taking orders) needs a subscription with a 30-day free trial:
  1. Open the app and choose Head.
  2. Tap Monthly or Yearly and confirm the free trial in Google Play (no charge during the trial).
  3. Open Menu → Load test menu, then take orders on the Order tab.

  To see orders arrive in the kitchen, open the app on a second device, choose Kitchen, and scan the QR code shown in the head's Settings (or type the code shown under it).
  ```
- **Content rating:** questionnaire category *All other app types*; answer No to violence, sexuality, language, controlled substances, gambling; users don't interact or share content with each other publicly; no location sharing; no purchases of digital goods other than the subscription. Expected rating: Everyone.
- **Target audience:** 18 and over. Not designed for children.
- **News app:** No. **Government app:** No. **Financial features:** None. **Health:** No.
- **Data safety:**
  - Does the app collect or share user data? **Yes.**
  - Encrypted in transit? **Yes.** Can users request deletion? **Yes** (support@yes-chef.win; describe in the form).
  - Shared with third parties? **No** (Cloudflare and Google act as service providers, which doesn't count as sharing).
  - Collected data types:
    | Type | Collected for | Optional? |
    |---|---|---|
    | Device or other IDs (random device identifier) | App functionality, Account management | Required for the head's subscription |
    | Financial info → Purchase history (Play purchase token, subscription status) | App functionality, Account management | Required for subscribers |
    | App activity → Other user-generated content (menu, settings, order history in cloud backups) | App functionality | Subscribers only (automatic backups) |
    | Personal info → Name (customer names typed on tickets, inside backups) | App functionality | Subscribers only |
  - Everything else (location, contacts, photos: the camera is only used locally to scan a QR code, messages, health, etc.): not collected.

Not legal advice: review the privacy policy and these answers yourself before submitting.
