const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { LocalTVBoxFiles } = require('../tvbox-local-files.cjs')

async function fixture(t) {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'tvbox-folder-'))
  const root = path.join(work, '配置'), profile = path.join(work, 'profile')
  await fs.mkdir(path.join(root, 'rules'), { recursive: true })
  await fs.writeFile(path.join(root, 'main.json'), JSON.stringify({ spider: './plugin.jar', sites: [{ key: 'local', api: 'csp_Test', type: 3, ext: 'rules/测试 +.txt' }] }))
  await fs.writeFile(path.join(root, 'plugin.jar'), Buffer.from([0,1,2,3,4,5]))
  await fs.writeFile(path.join(root, 'rules', '测试 +.txt'), 'rule data')
  await fs.writeFile(path.join(root, 'warehouse.json'), JSON.stringify({ urls: [{ name: 'Local', url: './main.json' }] }))
  await fs.writeFile(path.join(work, 'private.txt'), 'outside')
  const servers = []
  const server = () => { const instance = new LocalTVBoxFiles(profile); servers.push(instance); return instance }
  t.after(async () => { servers.forEach(instance => instance.close()); await fs.rm(work, { recursive: true, force: true }) })
  return { work, root, server }
}
test('whole-folder resources resolve relative JAR/rules/warehouse paths and restore with stable identity', async t => {
  const { root, server } = await fixture(t)
  const first = server(), folder = await first.add(root)
  assert.deepEqual(folder.candidates.map(x => x.path), ['main.json','warehouse.json'])
  const { parseConfig } = await import('../../core/tvbox/engine.mjs')
  const mainUrl = folder.baseUrl + 'main.json'
  const main = parseConfig(await (await fetch(mainUrl)).text(), mainUrl, { android: true })
  assert.equal(main.sites[0].native, true)
  assert.deepEqual([...new Uint8Array(await (await fetch(main.sites[0].jar)).arrayBuffer())], [0,1,2,3,4,5])
  assert.equal(await (await fetch(main.sites[0].ext)).text(), 'rule data')
  const warehouseUrl = folder.baseUrl + 'warehouse.json'
  assert.equal(parseConfig(await (await fetch(warehouseUrl)).text(),warehouseUrl).warehouses[0].url,mainUrl)
  const head = await fetch(main.sites[0].jar, { method:'HEAD' })
  assert.equal(head.headers.get('content-length'),'6'); assert.equal(await head.text(),'')
  const range = await fetch(main.sites[0].jar, { headers: { Range: 'bytes=2-4' } })
  assert.equal(range.status,206); assert.deepEqual([...new Uint8Array(await range.arrayBuffer())],[2,3,4])
  first.close()
  const restored = await server().describe(folder.id)
  assert.equal(restored.id,folder.id); assert.notEqual(restored.baseUrl,folder.baseUrl)
  assert.equal((await fetch(restored.baseUrl+'main.json')).status,200)
})
test('folder server rejects unauthorized tokens, traversal, directory access, symlink escape and writes', async t => {
  const { root, work, server } = await fixture(t), host = server(), folder = await host.add(root)
  const request = suffix => new Promise((resolve,reject) => {
    const base = new URL(folder.baseUrl)
    http.get({hostname:base.hostname,port:base.port,path:base.pathname+suffix}, res=>{res.resume();res.on('end',()=>resolve(res.statusCode))}).on('error',reject)
  })
  assert.equal((await fetch(folder.baseUrl.replace(host.token,'0'.repeat(32))+'main.json')).status,403)
  for (const suffix of ['%2e%2e/private.txt','rules%2f..%2fmain.json','rules%5c..%5cmain.json']) assert.equal(await request(suffix),400)
  assert.equal(await request('rules'),403)
  assert.equal((await fetch(folder.baseUrl+'main.json',{method:'POST',body:'replace'})).status,405)
  await fs.symlink(work, path.join(root,'escape'), 'junction')
  assert.equal(await request('escape/private.txt'),403)
  assert.match(await fs.readFile(path.join(root,'main.json'),'utf8'),/spider/)
})
