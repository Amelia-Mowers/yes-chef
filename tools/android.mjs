// Generates the Android (Trusted Web Activity) project from android/twa-manifest.json
// into android/build-project/, using Google's Bubblewrap library. CI then builds
// and signs it (.github/workflows/android.yml).
//   node tools/android.mjs [versionCode] [versionName]
import {TwaManifest, TwaGenerator, ConsoleLog} from '@bubblewrap/core'
import {rmSync} from 'node:fs'

const out = new URL('../android/build-project/', import.meta.url).pathname
const manifest = await TwaManifest.fromFile(new URL('../android/twa-manifest.json', import.meta.url).pathname)
const [code, name] = process.argv.slice(2)
if (code) manifest.appVersionCode = Number(code)
if (name) manifest.appVersionName = name
rmSync(out, {recursive: true, force: true})
await new TwaGenerator().createTwaProject(out, manifest, new ConsoleLog('android'))
console.log(`Generated ${manifest.packageId} ${name || manifest.appVersionName} (${manifest.appVersionCode}) in android/build-project/`)
