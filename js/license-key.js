// Public keys for verifying licenses from api.yes-chef.win.
// PRODUCTION: its private key is the LICENSE_PRIVATE_KEY Worker secret (never in git).
// DEV: matches api/dev-license-key.json, used only with local wrangler dev (fake purchases).
export const LICENSE_PUBLIC_KEY = {"kty":"EC","crv":"P-256","x":"HbsS0Z12BgBvc2dG7ygmx7Q_qZhr2PSe46Lol-YvKG4","y":"TmwpwsOkZvt20MDqh2J2KeYS3Xo3JVewb3VOTmugCDU"}
export const DEV_LICENSE_PUBLIC_KEY = {"kty":"EC","crv":"P-256","x":"39NGQGuaY56ayqgj_ZzgiDLHCNLIJLulcGSPq9P3x1M","y":"nPlpAwou1XJeDpzEn8iTNK4XQ_k4G_dg3xVdU7Bi2xM"}
