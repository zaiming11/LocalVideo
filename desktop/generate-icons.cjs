const fs = require('node:fs')
const path = require('node:path')
const { Resvg } = require('@resvg/resvg-js')
const source = fs.readFileSync(path.join(__dirname, 'assets/icon.svg'), 'utf8')
const android = path.resolve(__dirname, '../static/app-icons')
fs.mkdirSync(android, { recursive: true })
const render = (size) => new Resvg(source, { fitTo: { mode: 'width', value: size } }).render().asPng()
for (const [density, size] of Object.entries({ ldpi: 36, mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
  fs.writeFileSync(path.join(android, `android-${density}.png`), render(size))
}
fs.writeFileSync(path.join(android, 'icon-512.png'), render(512))
fs.writeFileSync(path.join(__dirname, '../static/logo.png'), render(512))
fs.writeFileSync(path.join(__dirname, 'assets/icon.png'), render(512))
const sizes = [16, 24, 32, 48, 64, 128, 256]
const images = sizes.map(render)
const header = Buffer.alloc(6 + 16 * sizes.length)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(sizes.length, 4)
let offset = header.length
sizes.forEach((size, index) => {
  const at = 6 + index * 16
  header[at] = header[at + 1] = size === 256 ? 0 : size
  header.writeUInt16LE(1, at + 4)
  header.writeUInt16LE(32, at + 6)
  header.writeUInt32LE(images[index].length, at + 8)
  header.writeUInt32LE(offset, at + 12)
  offset += images[index].length
})
fs.writeFileSync(path.join(__dirname, 'assets/icon.ico'), Buffer.concat([header, ...images]))
console.log('Generated Windows ICO (7 sizes) and Android icons from the same SVG.')
