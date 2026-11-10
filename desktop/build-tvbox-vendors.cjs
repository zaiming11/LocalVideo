const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const hx = createRequire(path.join(process.env.UNI_HBUILDERX_PLUGINS || 'E:/HBuilderX/plugins', 'uniapp-cli-vite/package.json'))
const root = path.resolve(__dirname, '..')
fs.mkdirSync(path.join(root, 'core/tvbox'), { recursive: true })
fs.mkdirSync(path.join(root, 'static/vendor'), { recursive: true })
hx('esbuild').buildSync({
  stdin: { contents: "export { default as JSON5 } from 'json5'; export { XMLParser, XMLValidator } from 'fast-xml-parser'; export { default as UniversalURL } from 'core-js-pure/features/url/index.js'", resolveDir: __dirname },
  outfile: path.join(root, 'core/tvbox/vendor.mjs'), bundle: true, format: 'esm', platform: 'browser', target: 'es2018', minify: true, legalComments: 'eof'
})
fs.copyFileSync(path.join(__dirname, 'node_modules/hls.js/dist/hls.min.js'), path.join(root, 'static/vendor/hls.min.js'))
for (const name of ['hls.js', 'json5', 'fast-xml-parser', 'core-js-pure']) {
  const folder = path.join(__dirname, 'node_modules', name)
  const license = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'].find(file => fs.existsSync(path.join(folder, file)))
  if (!license) throw new Error(`Missing license: ${name}`)
  fs.copyFileSync(path.join(folder, license), path.join(root, 'static/vendor', name + '-LICENSE.txt'))
}
console.log('TVBox parsers, HLS player and licenses are ready.')
