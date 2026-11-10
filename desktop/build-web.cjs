const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const project = path.resolve(__dirname, '..')
const plugins = process.env.UNI_HBUILDERX_PLUGINS || 'E:/HBuilderX/plugins'
const cli = path.join(plugins, 'uniapp-cli-vite')
const output = path.join(__dirname, 'web')
fs.copyFileSync(path.join(project, 'core/update/model.mjs'), path.join(__dirname, 'update-model.mjs'))
const result = spawnSync(process.execPath, [path.join(cli, 'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js'), 'build', '-p', 'h5'], {
  cwd: cli,
  env: { ...process.env, UNI_INPUT_DIR: project, UNI_OUTPUT_DIR: output, UNI_HBUILDERX_PLUGINS: plugins },
  stdio: 'inherit'
})
if (result.error) throw result.error
if (result.status !== 0 || !fs.existsSync(path.join(output, 'index.html'))) process.exit(result.status || 1)
