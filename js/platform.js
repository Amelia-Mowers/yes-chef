// Where the app is running. The Android app (Trusted Web Activity) opens the
// site with an android-app:// referrer; it's remembered because later
// navigations lose the referrer.

const KEY = 'yes-chef-android-app'
const REFERRER = 'android-app://win.yeschef.app'

export function inAndroidApp() {
  const now = typeof document !== 'undefined' && document.referrer.startsWith(REFERRER)
  try {
    if (now) localStorage.setItem(KEY, '1')
    return now || localStorage.getItem(KEY) === '1'
  } catch {
    return now
  }
}
