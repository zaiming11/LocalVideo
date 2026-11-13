// Keep cloud packaging below its free project-size limit by staging only app resources.
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const qrCodes = spawnSync(process.execPath, [path.join(__dirname, 'generate-download-qrcodes.cjs')], { cwd: root, stdio: 'inherit' })
if (qrCodes.error) throw qrCodes.error
if (qrCodes.status) process.exit(qrCodes.status)
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'))
const stage = path.join(root, '.backup', `android-release-${manifest.versionName}-${Date.now()}`)
fs.mkdirSync(stage, { recursive: true })
for (const folder of ['common', 'components', 'core', 'pages', 'static']) {
  fs.cpSync(path.join(root, folder), path.join(stage, folder), { recursive: true, filter: source => !source.split(path.sep).includes('armeabi-v7a') })
}
for (const name of ['App.vue', 'main.js', 'index.html', 'manifest.json', 'pages.json', 'uni.scss', 'uni.promisify.adaptor.js']) fs.copyFileSync(path.join(root, name), path.join(stage, name))
fs.writeFileSync(path.join(stage, 'vite.config.js'), "import { defineConfig } from 'vite'\nimport uni from '@dcloudio/vite-plugin-uni'\nexport default defineConfig({ plugins: [uni()] })\n")
manifest['app-plus'].distribute.android.abiFilters = ['arm64-v8a']
fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(stage)
