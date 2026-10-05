// Remote backups for licensed head devices (api.yes-chef.win). The server keeps
// them encrypted per account, so a replacement head on the same subscription
// can restore after the old tablet is lost.

import {kv} from './db.js'
import {state, exportAll, importAll} from './store.js'
import {API_URL, authHeader, isLicensed} from './license.js'

const DAY = 86400000

export async function backupNow(reason = 'manual') {
  if (!isLicensed()) throw new Error('Cloud backup needs a subscription')
  const res = await fetch(`${API_URL}/v1/backups?reason=${encodeURIComponent(reason)}`, {
    method: 'POST',
    headers: {'content-type': 'application/json', ...authHeader()},
    body: JSON.stringify(exportAll())
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
  await kv.set('cloudBackupAt', Date.now())
  return res.json()
}

export async function listCloudBackups() {
  const res = await fetch(`${API_URL}/v1/backups`, {headers: authHeader()})
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
  return (await res.json()).backups
}

export async function restoreCloudBackup(id) {
  const res = await fetch(`${API_URL}/v1/backups/${id}`, {headers: authHeader()})
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  await importAll(await res.json())
}

export const lastCloudBackup = () => kv.get('cloudBackupAt')

// Daily automatic backup while the head is open; failures retry next time.
export async function autoBackup() {
  if (state.role !== 'head' || !isLicensed()) return
  const last = (await lastCloudBackup()) || 0
  if (Date.now() - last > DAY) await backupNow('daily').catch(() => {})
}
setInterval(() => autoBackup(), 3600000)
