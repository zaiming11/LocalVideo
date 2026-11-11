const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const plugins = process.env.UNI_HBUILDERX_PLUGINS || 'E:/HBuilderX/plugins'
const cli = path.join(plugins, 'uniapp-cli-vite')
const output = path.join(root, 'unpackage/dist/netlify')
if (path.dirname(output) !== path.join(root, 'unpackage/dist') || path.basename(output) !== 'netlify') throw new Error('Unexpected build directory')
fs.rmSync(output, { recursive: true, force: true })
const result = spawnSync(process.execPath, [path.join(cli, 'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js'), 'build', '-p', 'h5'], {
  cwd: cli,
  env: { ...process.env, UNI_INPUT_DIR: root, UNI_OUTPUT_DIR: output, UNI_HBUILDERX_PLUGINS: plugins, LOCAL_VIDEO_NETLIFY: '1' },
  stdio: 'inherit'
})
if (result.error) throw result.error
if (result.status || !fs.existsSync(path.join(output, 'index.html'))) process.exit(result.status || 1)
for (const name of ['vlc-native', 'tvbox-native', 'tvbox-js', 'tvbox-python']) {
  const directory = path.resolve(output, 'static', name)
  if (!directory.startsWith(output + path.sep)) throw new Error('Unexpected deployment path')
  fs.rmSync(directory, { recursive: true, force: true })
}
const updates = spawnSync(process.execPath, [path.join(__dirname, 'prepare-netlify-updates.cjs'), '--publish-dir', output], { cwd: root, stdio: 'inherit' })
if (updates.error) throw updates.error
if (updates.status) process.exit(updates.status)
console.log('Netlify web build ready: ' + output)
