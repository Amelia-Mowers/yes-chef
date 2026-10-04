// Light/dark override, per device. 'system' follows the device setting.
// index.html applies the saved choice before first paint; this keeps it in sync after.

const KEY = 'yes-chef-theme'
export const THEMES = [
  ['system', 'Follow device'],
  ['light', 'Light'],
  ['dark', 'Dark']
]

export function getTheme() {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}

export function setTheme(theme) {
  try {
    if (theme === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {}
  applyTheme(theme)
}

export function applyTheme(theme = getTheme()) {
  const root = document.documentElement
  // Skip button/toggle transitions so the whole page switches at once.
  root.classList.add('theme-switching')
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')))
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
  // Match the browser chrome / status bar to the page background.
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = getComputedStyle(root).getPropertyValue('--surface').trim() || meta.content
}

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme())
