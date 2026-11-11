const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const root = path.resolve(__dirname, '..'), dependencies = path.join(__dirname, 'js-spider/node_modules')
async function main() {
  if (!fs.existsSync(path.join(dependencies, 'esbuild'))) throw new Error('先运行 npm.cmd ci --prefix tools/js-spider')
  const destination = path.join(root, 'static/tvbox-js')
  fs.mkdirSync(destination, {recursive:true})
  await require(path.join(dependencies, 'esbuild')).build({
    entryPoints:[path.join(root,'native/tvbox-js/libraries.mjs')],
    outfile:path.join(destination,'libraries.js'),bundle:true,format:'esm',platform:'browser',target:'es2020',minify:true,
    nodePaths:[dependencies],define:{global:'globalThis'},legalComments:'eof'
  })
  for (const name of ['runtime.js','cheerio.js','crypto-js.js']) fs.copyFileSync(path.join(root,'native/tvbox-js',name),path.join(destination,name))
  const packages = ['cheerio','cheerio-select','css-select','css-what','boolbase','nth-check','domhandler','domutils','dom-serializer','domelementtype','entities','htmlparser2','crypto-js','nunjucks','a-sync-waterfall','asap','commander','jsonpath-plus','@jsep-plugin/assignment','@jsep-plugin/regex','jsep']
  const notices=[]
  for(const name of packages){
    const directory=path.join(dependencies,name)
    if(!fs.existsSync(directory))continue
    const manifest=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'))
    const license=fs.readdirSync(directory).find(file=>/^licen[sc]e(?:[.\-]|$)/i.test(file))
    const isc='ISC License\nPermission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.\nTHE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.'
    if(!license&&manifest.license!=='ISC')throw new Error('缺少依赖许可证：'+name)
    notices.push(name+' '+manifest.version+'\n'+(license?fs.readFileSync(path.join(directory,license),'utf8'):'Author: '+(typeof manifest.author==='string'?manifest.author:manifest.author?.name)+'\n'+isc))
  }
  fs.writeFileSync(path.join(destination,'THIRD-PARTY-NOTICES.txt'),notices.join('\n\n--------------------\n\n'))
  const digest=crypto.createHash('sha256')
  for(const name of ['libraries.js','runtime.js','cheerio.js','crypto-js.js'])digest.update(fs.readFileSync(path.join(destination,name)))
  fs.writeFileSync(path.join(root,'core/tvbox/js-version.js'),"export const JS_SPIDER_HASH = '"+digest.digest('hex')+"'\n")
  console.log('Android JS Spider assets built')
}
main().catch(error=>{console.error(error);process.exitCode=1})
