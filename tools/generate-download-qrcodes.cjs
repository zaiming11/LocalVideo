const fs = require('node:fs')
const path = require('node:path')
const QRCode = require('../desktop/node_modules/qrcode')
const downloads = require('../core/downloads.json')

async function generateDownloadQRCodes() {
  const output = path.resolve(__dirname, '../static/downloads')
  fs.mkdirSync(output, { recursive: true })
  await Promise.all(downloads.map(item => QRCode.toFile(path.join(output, item.id + '.png'), item.url, {
    errorCorrectionLevel: 'M', margin: 4, scale: 8, color: { dark: '#000000ff', light: '#ffffffff' }
  })))
}

module.exports = { generateDownloadQRCodes }
if (require.main === module) generateDownloadQRCodes().then(() => console.log('Download QR codes generated')).catch(error => { console.error(error.message); process.exitCode = 1 })
